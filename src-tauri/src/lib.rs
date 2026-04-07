use base64::Engine as _;
use reqwest::header::{CONTENT_TYPE, USER_AGENT};
#[cfg(debug_assertions)]
use tauri::Manager;

const MAX_REMOTE_IMAGE_BYTES: usize = 12 * 1024 * 1024;
const PREVIEW_IMAGE_USER_AGENT: &str = "No.1 Markdown Editor Preview Image Loader";
#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
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
async fn fetch_remote_image_data_url(url: String) -> Result<String, String> {
    let parsed_url = reqwest::Url::parse(&url).map_err(|_| "Invalid remote image URL".to_string())?;
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            read_file,
            write_file,
            get_file_name,
            fetch_remote_image_data_url
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
