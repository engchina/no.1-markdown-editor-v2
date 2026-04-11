mod ai;
mod update;

use base64::Engine as _;
use reqwest::header::{CONTENT_TYPE, USER_AGENT};
use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{Emitter, Manager};
use tauri_plugin_fs::FsExt;

const MAX_REMOTE_IMAGE_BYTES: usize = 12 * 1024 * 1024;
const MAX_LOCAL_IMAGE_BYTES: usize = 24 * 1024 * 1024;
const PREVIEW_IMAGE_USER_AGENT: &str = "No.1 Markdown Editor Preview Image Loader";
const SINGLE_INSTANCE_OPEN_FILES_EVENT: &str = "single-instance-open-files";

struct PendingOpenPaths(Mutex<Vec<String>>);

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    ensure_parent_directory(&path)?;
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_binary_file(path: String, bytes: Vec<u8>) -> Result<(), String> {
    ensure_parent_directory(&path)?;
    std::fs::write(&path, bytes).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_file_name(path: String) -> String {
    std::path::Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Untitled")
        .to_string()
}

#[tauri::command]
fn allow_fs_scope_path<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    path: String,
    directory: bool,
    recursive: bool,
) -> Result<(), String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Missing file system path".to_string());
    }

    let scope = app.fs_scope();
    let candidate = PathBuf::from(trimmed);

    if directory {
        scope
            .allow_directory(candidate, recursive)
            .map_err(|error| error.to_string())
    } else {
        scope
            .allow_file(candidate)
            .map_err(|error| error.to_string())
    }
}

#[tauri::command]
fn take_pending_open_paths(
    state: tauri::State<'_, PendingOpenPaths>,
) -> Result<Vec<String>, String> {
    let mut pending_paths = state
        .0
        .lock()
        .map_err(|_| "Failed to access pending open paths".to_string())?;
    Ok(std::mem::take(&mut *pending_paths))
}

#[tauri::command]
async fn fetch_remote_image_data_url(url: String) -> Result<String, String> {
    let parsed_url =
        reqwest::Url::parse(&url).map_err(|_| "Invalid remote image URL".to_string())?;
    match parsed_url.scheme() {
        "http" | "https" => {}
        _ => return Err("Only HTTP and HTTPS image URLs are supported".to_string()),
    }

    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(5))
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|error| format!("Failed to initialize image loader: {error}"))?;

    let response = client
        .get(parsed_url.clone())
        .header(USER_AGENT, PREVIEW_IMAGE_USER_AGENT)
        .send()
        .await
        .map_err(|error| format!("Failed to fetch remote image: {error}"))?
        .error_for_status()
        .map_err(|error| format!("Remote image request failed: {error}"))?;

    if response
        .content_length()
        .is_some_and(|length| length > MAX_REMOTE_IMAGE_BYTES as u64)
    {
        return Err("Remote image is too large to preview safely".to_string());
    }

    let content_type = resolve_remote_image_content_type(
        response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok()),
        parsed_url.path(),
    )
    .ok_or_else(|| "Remote resource is not a supported image".to_string())?;

    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("Failed to read remote image data: {error}"))?;

    if bytes.len() > MAX_REMOTE_IMAGE_BYTES {
        return Err("Remote image is too large to preview safely".to_string());
    }

    Ok(format!(
        "data:{content_type};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}

#[tauri::command]
fn fetch_local_image_data_url(
    source: String,
    document_path: Option<String>,
) -> Result<String, String> {
    let resolved_path = resolve_local_image_path(&source, document_path.as_deref())?;
    let bytes = std::fs::read(&resolved_path)
        .map_err(|error| format!("Failed to read local image: {error}"))?;

    if bytes.len() > MAX_LOCAL_IMAGE_BYTES {
        return Err("Local image is too large to preview safely".to_string());
    }

    let content_type = infer_image_content_type(&resolved_path.to_string_lossy())
        .ok_or_else(|| "Local resource is not a supported image".to_string())?;

    Ok(format!(
        "data:{content_type};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}

fn resolve_remote_image_content_type(header_value: Option<&str>, path: &str) -> Option<String> {
    normalize_image_content_type(header_value)
        .map(str::to_string)
        .or_else(|| infer_image_content_type(path).map(str::to_string))
}

fn normalize_image_content_type(header_value: Option<&str>) -> Option<&str> {
    let mime = header_value?.split(';').next()?.trim();
    mime.starts_with("image/").then_some(mime)
}

fn infer_image_content_type(path: &str) -> Option<&'static str> {
    let extension = path
        .rsplit_once('.')
        .map(|(_, extension)| extension)
        .unwrap_or_default()
        .to_ascii_lowercase();

    match extension.as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "bmp" => Some("image/bmp"),
        "svg" => Some("image/svg+xml"),
        "ico" => Some("image/x-icon"),
        "avif" => Some("image/avif"),
        _ => None,
    }
}

fn resolve_local_image_path(
    source: &str,
    document_path: Option<&str>,
) -> Result<std::path::PathBuf, String> {
    let trimmed_source = source.trim();
    if trimmed_source.is_empty() {
        return Err("Missing local image source".to_string());
    }

    if matches!(
        reqwest::Url::parse(trimmed_source).ok().map(|url| url.scheme().to_ascii_lowercase()),
        Some(scheme) if scheme == "http" || scheme == "https" || scheme == "data" || scheme == "blob"
    ) {
        return Err("Expected a local image source".to_string());
    }

    if trimmed_source.to_ascii_lowercase().starts_with("file:") {
        let url = reqwest::Url::parse(trimmed_source)
            .map_err(|error| format!("Invalid local image URL: {error}"))?;
        return url
            .to_file_path()
            .map_err(|_| "Unsupported local image file URL".to_string());
    }

    let candidate_path = std::path::Path::new(trimmed_source);
    if candidate_path.is_absolute() {
        return Ok(candidate_path.to_path_buf());
    }

    let Some(document_path) = document_path else {
        return Err("Relative local image source requires a document path".to_string());
    };
    let Some(parent_dir) = std::path::Path::new(document_path).parent() else {
        return Err("Could not resolve the current document directory".to_string());
    };

    Ok(parent_dir.join(candidate_path))
}

fn ensure_parent_directory(path: &str) -> Result<(), String> {
    let Some(parent) = std::path::Path::new(path).parent() else {
        return Ok(());
    };

    if parent.as_os_str().is_empty() {
        return Ok(());
    }

    std::fs::create_dir_all(parent).map_err(|error| error.to_string())
}

fn is_allowed_editor_navigation(url: &reqwest::Url) -> bool {
    match url.scheme() {
        "tauri" => is_editor_entry_path(url.path()),
        "http" | "https" => {
            is_editor_loopback_host(url.host_str()) && is_editor_entry_path(url.path())
        }
        _ => false,
    }
}

fn is_editor_loopback_host(host: Option<&str>) -> bool {
    host.is_some_and(|host| {
        matches!(host, "localhost" | "127.0.0.1" | "::1") || host.ends_with(".localhost")
    })
}

fn is_editor_entry_path(path: &str) -> bool {
    matches!(path, "" | "/" | "/index.html")
}

fn collect_launch_paths() -> Vec<String> {
    let current_dir = std::env::current_dir().ok();
    collect_launch_paths_from_args(std::env::args_os().skip(1), current_dir.as_deref())
}

fn collect_launch_paths_from_args<I>(args: I, cwd: Option<&Path>) -> Vec<String>
where
    I: IntoIterator,
    I::Item: Into<OsString>,
{
    let mut launch_paths = Vec::new();

    for arg in args {
        let arg = arg.into();
        let Some(path) = normalize_launch_arg(&arg, cwd) else {
            continue;
        };

        if !launch_paths.contains(&path) {
            launch_paths.push(path);
        }
    }

    launch_paths
}

fn normalize_launch_arg(arg: &OsStr, cwd: Option<&Path>) -> Option<String> {
    let raw = arg.to_string_lossy();
    if raw.is_empty() {
        return None;
    }

    let path = if raw.to_ascii_lowercase().starts_with("file:") {
        let url = reqwest::Url::parse(&raw).ok()?;
        let path = url.to_file_path().ok()?;
        if !path.is_file() {
            return None;
        }
        path
    } else {
        let candidate = PathBuf::from(arg);
        if candidate.is_file() {
            candidate
        } else if candidate.is_absolute() || raw.starts_with('-') {
            return None;
        } else {
            let resolved = cwd?.join(candidate);
            if !resolved.is_file() {
                return None;
            }
            resolved
        }
    };

    Some(path.to_string_lossy().into_owned())
}

fn focus_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
}

#[cfg(any(target_os = "macos", windows, target_os = "linux"))]
fn register_single_instance_plugin(
    builder: tauri::Builder<tauri::Wry>,
) -> tauri::Builder<tauri::Wry> {
    builder.plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
        focus_main_window(app);

        let current_dir = PathBuf::from(&cwd);
        let launch_paths = collect_launch_paths_from_args(argv, Some(current_dir.as_path()));
        if launch_paths.is_empty() {
            return;
        }

        if let Some(window) = app.get_webview_window("main") {
            let _ = window.emit(SINGLE_INSTANCE_OPEN_FILES_EVENT, launch_paths);
        }
    }))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let pending_open_paths = PendingOpenPaths(Mutex::new(collect_launch_paths()));
    let ai_in_flight_requests =
        ai::AiInFlightRequests(Mutex::new(std::collections::HashMap::new()));
    let builder = tauri::Builder::default();

    #[cfg(any(target_os = "macos", windows, target_os = "linux"))]
    let builder = register_single_instance_plugin(builder);

    builder
        .manage(pending_open_paths)
        .manage(ai_in_flight_requests)
        .plugin(
            tauri::plugin::Builder::<tauri::Wry>::new("editor-navigation-guard")
                .on_navigation(|_, url| is_allowed_editor_navigation(url))
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            ai::ai_load_provider_state,
            ai::ai_save_provider_config,
            ai::ai_store_provider_api_key,
            ai::ai_clear_provider_api_key,
            ai::ai_run_completion,
            ai::ai_cancel_completion,
            read_file,
            write_file,
            write_binary_file,
            get_file_name,
            allow_fs_scope_path,
            take_pending_open_paths,
            fetch_remote_image_data_url,
            fetch_local_image_data_url,
            update::check_for_app_update
        ])
        .setup(|_app| {
            #[cfg(debug_assertions)]
            {
                let window = _app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::collect_launch_paths_from_args;
    use super::is_allowed_editor_navigation;
    use std::ffi::OsString;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn make_temp_markdown_path(prefix: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock before unix epoch")
            .as_nanos();

        std::env::temp_dir().join(format!(
            "no1-markdown-editor-{prefix}-{}-{unique}.md",
            std::process::id()
        ))
    }

    #[test]
    fn collect_launch_paths_ignores_flags_and_missing_files() {
        let existing_path = make_temp_markdown_path("launch");
        fs::write(&existing_path, "# launch").expect("write temp launch file");

        let args = vec![
            OsString::from("--flag"),
            existing_path.as_os_str().to_os_string(),
            OsString::from("missing-launch-file.md"),
        ];

        let launch_paths = collect_launch_paths_from_args(args, None);

        assert_eq!(
            launch_paths,
            vec![existing_path.to_string_lossy().into_owned()]
        );

        let _ = fs::remove_file(existing_path);
    }

    #[test]
    fn collect_launch_paths_supports_file_urls_and_deduplicates_entries() {
        let existing_path = make_temp_markdown_path("file-url");
        fs::write(&existing_path, "# file url").expect("write temp file url launch file");

        let file_url = reqwest::Url::from_file_path(&existing_path)
            .expect("convert temp launch path to file url")
            .to_string();

        let args = vec![
            existing_path.as_os_str().to_os_string(),
            OsString::from(file_url),
        ];

        let launch_paths = collect_launch_paths_from_args(args, None);

        assert_eq!(
            launch_paths,
            vec![existing_path.to_string_lossy().into_owned()]
        );

        let _ = fs::remove_file(existing_path);
    }

    #[test]
    fn collect_launch_paths_resolves_relative_paths_against_cwd() {
        let temp_dir = std::env::temp_dir().join(format!(
            "no1-markdown-editor-relative-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system clock before unix epoch")
                .as_nanos()
        ));
        fs::create_dir_all(&temp_dir).expect("create temp directory");

        let existing_path = temp_dir.join("relative-launch.md");
        fs::write(&existing_path, "# relative launch").expect("write temp relative launch file");

        let args = vec![OsString::from("relative-launch.md")];
        let launch_paths = collect_launch_paths_from_args(args, Some(temp_dir.as_path()));

        assert_eq!(
            launch_paths,
            vec![existing_path.to_string_lossy().into_owned()]
        );

        let _ = fs::remove_file(existing_path);
        let _ = fs::remove_dir(temp_dir);
    }

    #[test]
    fn navigation_guard_allows_only_editor_entry_documents() {
        for url in [
            "tauri://localhost/",
            "tauri://localhost/index.html",
            "http://127.0.0.1:1420/",
            "https://tauri.localhost/index.html",
        ] {
            let parsed = reqwest::Url::parse(url).expect("parse allowed url");
            assert!(
                is_allowed_editor_navigation(&parsed),
                "expected to allow {url}"
            );
        }
    }

    #[test]
    fn navigation_guard_blocks_external_and_in_app_page_replacements() {
        for url in [
            "https://example.com/",
            "http://127.0.0.1:1420/guide.md",
            "http://localhost:1420/image.png",
            "file:///tmp/demo.md",
        ] {
            let parsed = reqwest::Url::parse(url).expect("parse blocked url");
            assert!(
                !is_allowed_editor_navigation(&parsed),
                "expected to block {url}"
            );
        }
    }
}
