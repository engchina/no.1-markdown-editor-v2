use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Runtime, WebviewUrl, WebviewWindowBuilder};
use tokio::sync::oneshot;

pub const PDF_WEBVIEW_LABEL_PREFIX: &str = "pdf-export-";
const PAGE_LOAD_TIMEOUT: Duration = Duration::from_secs(15);
const POST_LOAD_SETTLE_DELAY: Duration = Duration::from_millis(450);

fn unique_token() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or_default();
    format!("{}-{nanos}", std::process::id())
}

fn temp_html_path(token: &str) -> PathBuf {
    std::env::temp_dir().join(format!("no1-pdf-export-{token}.html"))
}

fn expected_html_file_url(html_path: &Path) -> Result<reqwest::Url, String> {
    reqwest::Url::from_file_path(html_path)
        .map_err(|_| "Failed to build file URL for PDF source".to_string())
}

#[cfg(any(target_os = "linux", test))]
fn output_file_uri(output_path: &Path) -> Result<String, String> {
    reqwest::Url::from_file_path(output_path)
        .map(|url| url.to_string())
        .map_err(|_| "Failed to build file URL for PDF output".to_string())
}

fn should_signal_pdf_page_ready(
    event: PageLoadEvent,
    current_url: &reqwest::Url,
    expected_url: &reqwest::Url,
) -> bool {
    matches!(event, PageLoadEvent::Finished)
        && normalize_file_url_for_comparison(current_url)
            == normalize_file_url_for_comparison(expected_url)
}

fn normalize_file_url_for_comparison(url: &reqwest::Url) -> Option<String> {
    let path = url.to_file_path().ok()?;
    let normalized = path.to_string_lossy().replace('\\', "/");

    #[cfg(windows)]
    {
        Some(normalized.to_ascii_lowercase())
    }

    #[cfg(not(windows))]
    {
        Some(normalized)
    }
}

#[cfg(target_os = "macos")]
fn build_initial_webview_url(_html_path: &Path) -> Result<WebviewUrl, String> {
    // Load `about:blank` first; we will call `loadFileURL:` after the webview
    // exists so we can grant read access to the temp directory.
    reqwest::Url::parse("about:blank")
        .map(WebviewUrl::External)
        .map_err(|error| format!("Failed to parse about:blank URL: {error}"))
}

#[cfg(not(target_os = "macos"))]
fn build_initial_webview_url(html_path: &Path) -> Result<WebviewUrl, String> {
    expected_html_file_url(html_path).map(WebviewUrl::External)
}

#[tauri::command]
pub async fn export_pdf_to_file<R: Runtime>(
    app: AppHandle<R>,
    html: String,
    output_path: String,
) -> Result<(), String> {
    let trimmed_output = output_path.trim().to_string();
    if trimmed_output.is_empty() {
        return Err("Missing PDF output path".to_string());
    }

    let token = unique_token();
    let html_path = temp_html_path(&token);

    std::fs::write(&html_path, html)
        .map_err(|error| format!("Failed to stage PDF source html: {error}"))?;

    let cleanup_html_path = html_path.clone();
    let cleanup = move || {
        let _ = std::fs::remove_file(&cleanup_html_path);
    };

    let initial_url = match build_initial_webview_url(&html_path) {
        Ok(url) => url,
        Err(error) => {
            cleanup();
            return Err(error);
        }
    };

    let expected_file_url = match expected_html_file_url(&html_path) {
        Ok(url) => url,
        Err(error) => {
            cleanup();
            return Err(error);
        }
    };

    let (page_load_tx, page_load_rx) = oneshot::channel();
    let page_load_signal = Arc::new(Mutex::new(Some(page_load_tx)));

    let label = format!("{PDF_WEBVIEW_LABEL_PREFIX}{token}");
    let expected_file_url_for_load = expected_file_url.clone();
    let page_load_signal_for_load = Arc::clone(&page_load_signal);
    let window_result = WebviewWindowBuilder::new(&app, &label, initial_url)
        .title("PDF Export")
        .inner_size(816.0, 1056.0)
        .visible(false)
        .focused(false)
        .skip_taskbar(true)
        .resizable(false)
        .on_page_load(move |_window, payload| {
            if !should_signal_pdf_page_ready(
                payload.event(),
                payload.url(),
                &expected_file_url_for_load,
            ) {
                return;
            }

            if let Ok(mut sender) = page_load_signal_for_load.lock() {
                if let Some(sender) = sender.take() {
                    let _ = sender.send(());
                }
            }
        })
        .build();

    let window = match window_result {
        Ok(window) => window,
        Err(error) => {
            cleanup();
            return Err(format!("Failed to create PDF webview: {error}"));
        }
    };

    // macOS WKWebView blocks cross-file access for file:// URLs loaded via
    // `loadRequest:`. Instead we opened at `about:blank` above and now invoke
    // `loadFileURL:allowingReadAccessToURL:` with the temp directory as the
    // readable root so sibling assets (images, fonts) can resolve.
    #[cfg(target_os = "macos")]
    if let Err(error) = mac_load_file_url_with_access(&window, &html_path) {
        let _ = window.destroy();
        cleanup();
        return Err(error);
    }

    let page_load_outcome = tokio::time::timeout(PAGE_LOAD_TIMEOUT, page_load_rx).await;

    let render_result = match page_load_outcome {
        Ok(Ok(())) => {
            tokio::time::sleep(POST_LOAD_SETTLE_DELAY).await;
            native_print_to_pdf(&window, &trimmed_output).await
        }
        Ok(Err(_)) => Err("PDF webview closed before the export page finished loading".to_string()),
        Err(_) => Err("PDF webview timed out while loading the export page".to_string()),
    };

    let _ = window.destroy();
    cleanup();

    render_result
}

#[cfg(target_os = "windows")]
async fn native_print_to_pdf<R: Runtime>(
    window: &tauri::WebviewWindow<R>,
    output_path: &str,
) -> Result<(), String> {
    use std::sync::mpsc;
    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2_7;
    use webview2_com::PrintToPdfCompletedHandler;
    use windows::core::{HSTRING, Interface};

    let (tx, rx) = mpsc::channel::<Result<(), String>>();
    let output = output_path.to_string();

    window
        .with_webview(move |webview| {
            let setup_tx = tx.clone();
            let outcome = (|| -> Result<(), String> {
                let controller = webview.controller();
                unsafe {
                    let core = controller
                        .CoreWebView2()
                        .map_err(|error| format!("Failed to get CoreWebView2: {error}"))?;
                    let core7: ICoreWebView2_7 = core.cast().map_err(|error| {
                        format!(
                            "Silent PDF export requires WebView2 Runtime 88+ (ICoreWebView2_7): {error}"
                        )
                    })?;

                    let completion_tx = tx.clone();
                    let handler = PrintToPdfCompletedHandler::create(Box::new(
                        move |error_code, is_successful| {
                            let outcome = if error_code.is_ok() && is_successful {
                                Ok(())
                            } else {
                                Err(format!(
                                    "PrintToPdf failed (hr={error_code:?}, ok={is_successful})"
                                ))
                            };
                            let _ = completion_tx.send(outcome);
                            Ok(())
                        },
                    ));

                    core7
                        .PrintToPdf(&HSTRING::from(output.as_str()), None, &handler)
                        .map_err(|error| format!("PrintToPdf invocation failed: {error}"))?;
                }
                Ok(())
            })();

            if let Err(error) = outcome {
                let _ = setup_tx.send(Err(error));
            }
        })
        .map_err(|error| format!("with_webview dispatch failed: {error}"))?;

    // Block on completion. The WebView2 callback runs on the UI thread; waiting
    // here on a tokio worker thread keeps the UI free to dispatch it.
    tokio::task::spawn_blocking(move || {
        rx.recv_timeout(Duration::from_secs(60))
            .map_err(|_| "PrintToPdf timed out waiting for completion".to_string())
            .and_then(|result| result)
    })
    .await
    .map_err(|error| format!("PrintToPdf task was cancelled: {error}"))?
}

#[cfg(target_os = "macos")]
fn mac_load_file_url_with_access<R: Runtime>(
    window: &tauri::WebviewWindow<R>,
    html_path: &Path,
) -> Result<(), String> {
    use objc2_foundation::{NSString, NSURL};
    use objc2_web_kit::WKWebView;

    let html_path_str = html_path.to_string_lossy().into_owned();
    let parent_dir_str = html_path
        .parent()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|| html_path_str.clone());

    let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();

    window
        .with_webview(move |platform_webview| {
            let raw = platform_webview.inner();
            if raw.is_null() {
                let _ = tx.send(Err("WKWebView pointer is null".to_string()));
                return;
            }
            // SAFETY: `PlatformWebview::inner()` returns the live WKWebView*
            // owned by the window; `with_webview` runs on the webview's owning
            // thread, so we are free to message it synchronously here.
            unsafe {
                let webview: &WKWebView = &*(raw as *const WKWebView);
                let html_ns = NSString::from_str(&html_path_str);
                let parent_ns = NSString::from_str(&parent_dir_str);
                let html_url = NSURL::fileURLWithPath(&html_ns);
                let parent_url = NSURL::fileURLWithPath(&parent_ns);
                let _nav = webview.loadFileURL_allowingReadAccessToURL(&html_url, &parent_url);
            }
            let _ = tx.send(Ok(()));
        })
        .map_err(|error| format!("with_webview dispatch failed: {error}"))?;

    rx.recv_timeout(Duration::from_secs(5))
        .map_err(|_| "loadFileURL dispatch timed out".to_string())?
}

#[cfg(target_os = "macos")]
async fn native_print_to_pdf<R: Runtime>(
    window: &tauri::WebviewWindow<R>,
    output_path: &str,
) -> Result<(), String> {
    use block2::RcBlock;
    use objc2::msg_send;
    use objc2::rc::Retained;
    use objc2_foundation::{NSData, NSError, NSString};
    use objc2_web_kit::WKWebView;

    let (tx, rx) = std::sync::mpsc::channel::<Result<Vec<u8>, String>>();
    let output = output_path.to_string();

    window
        .with_webview(move |platform_webview| {
            let raw = platform_webview.inner();
            if raw.is_null() {
                let _ = tx.send(Err("WKWebView pointer is null".to_string()));
                return;
            }

            let block_tx = tx.clone();
            let block = RcBlock::new(move |data: *mut NSData, error: *mut NSError| {
                if !error.is_null() {
                    // SAFETY: WebKit guarantees the NSError pointer is valid for
                    // the duration of this callback.
                    let message = unsafe {
                        let err: &NSError = &*error;
                        let desc: Retained<NSString> = msg_send![err, localizedDescription];
                        desc.to_string()
                    };
                    let _ = block_tx.send(Err(format!("createPDF failed: {message}")));
                    return;
                }
                if data.is_null() {
                    let _ = block_tx.send(Err("createPDF returned no data".to_string()));
                    return;
                }
                // SAFETY: WebKit hands us a valid NSData for the duration of the
                // callback. We copy its bytes immediately so we do not hold onto
                // the reference past this scope.
                let bytes = unsafe {
                    let data_ref: &NSData = &*data;
                    let len: usize = msg_send![data_ref, length];
                    if len == 0 {
                        Vec::new()
                    } else {
                        let ptr: *const std::ffi::c_void = msg_send![data_ref, bytes];
                        std::slice::from_raw_parts(ptr as *const u8, len).to_vec()
                    }
                };
                let _ = block_tx.send(Ok(bytes));
            });

            // SAFETY: passing `None` for WKPDFConfiguration asks WebKit to
            // capture the entire page; the block is retained by WebKit for the
            // duration of the async operation.
            unsafe {
                let webview: &WKWebView = &*(raw as *const WKWebView);
                webview.createPDFWithConfiguration_completionHandler(None, &block);
            }
        })
        .map_err(|error| format!("with_webview dispatch failed: {error}"))?;

    let pdf_bytes = tokio::task::spawn_blocking(move || {
        rx.recv_timeout(Duration::from_secs(60))
            .map_err(|_| "createPDF timed out waiting for completion".to_string())
            .and_then(|result| result)
    })
    .await
    .map_err(|error| format!("createPDF task was cancelled: {error}"))??;

    std::fs::write(&output, &pdf_bytes)
        .map_err(|error| format!("Failed to write PDF bytes: {error}"))
}

#[cfg(target_os = "linux")]
async fn native_print_to_pdf<R: Runtime>(
    window: &tauri::WebviewWindow<R>,
    output_path: &str,
) -> Result<(), String> {
    use gtk::prelude::*;
    use webkit2gtk::{PrintOperation, PrintOperationExt};

    let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();
    let output = output_path.to_string();
    let output_uri = output_file_uri(Path::new(output_path))?;

    window
        .with_webview(move |platform_webview| {
            let webview = platform_webview.inner();
            let operation = PrintOperation::new(&webview);

            let settings = gtk::PrintSettings::new();
            settings.set("output-uri", Some(&output_uri));
            // Webkit honors this to pick the PDF backend; without it GTK may
            // fall back to PostScript.
            settings.set("output-file-format", Some("pdf"));
            operation.set_print_settings(&settings);

            let tx_finished = tx.clone();
            operation.connect_finished(move |_| {
                let _ = tx_finished.send(Ok(()));
            });
            let tx_failed = tx.clone();
            operation.connect_failed(move |_, err| {
                let _ = tx_failed.send(Err(format!("Print operation failed: {err}")));
            });

            operation.print();
        })
        .map_err(|error| format!("with_webview dispatch failed: {error}"))?;

    tokio::task::spawn_blocking(move || {
        rx.recv_timeout(Duration::from_secs(60))
            .map_err(|_| "Print operation timed out".to_string())
            .and_then(|result| result)
    })
    .await
    .map_err(|error| format!("Print task was cancelled: {error}"))?
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
async fn native_print_to_pdf<R: Runtime>(
    _window: &tauri::WebviewWindow<R>,
    _output_path: &str,
) -> Result<(), String> {
    Err("silent_pdf_unsupported_platform".to_string())
}

#[cfg(test)]
mod tests {
    use super::{expected_html_file_url, output_file_uri, should_signal_pdf_page_ready};
    use tauri::webview::PageLoadEvent;

    #[test]
    fn should_signal_pdf_page_ready_matches_finished_event_for_expected_file_url() {
        let html_path = std::env::temp_dir().join("no1-pdf-export-test.html");
        let expected_url = expected_html_file_url(html_path.as_path()).expect("expected file url");

        assert!(should_signal_pdf_page_ready(
            PageLoadEvent::Finished,
            &expected_url,
            &expected_url
        ));
        assert!(!should_signal_pdf_page_ready(
            PageLoadEvent::Started,
            &expected_url,
            &expected_url
        ));
    }

    #[test]
    fn should_signal_pdf_page_ready_ignores_unrelated_urls() {
        let expected_url = reqwest::Url::parse("file:///C:/temp/no1-pdf-export-test.html")
            .expect("expected file url");
        let current_url =
            reqwest::Url::parse("about:blank").expect("about blank url");

        assert!(!should_signal_pdf_page_ready(
            PageLoadEvent::Finished,
            &current_url,
            &expected_url
        ));
    }

    #[test]
    fn output_file_uri_encodes_spaces_for_print_backends() {
        let path = std::env::temp_dir()
            .join("no1 export")
            .join("output file.pdf");
        let uri = output_file_uri(path.as_path()).expect("output file uri");

        assert!(uri.starts_with("file://"), "expected file URI, got {uri}");
        assert!(uri.contains("%20"), "expected URI-encoded spaces, got {uri}");
    }
}
