use keyring::Entry;
use reqwest::header::{CONTENT_TYPE, USER_AGENT};
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tokio::task::AbortHandle;

const AI_PROVIDER_CONFIG_FILE: &str = "ai-provider.json";
const AI_KEYRING_SERVICE: &str = "com.no1.markdown-editor.ai";
const AI_KEYRING_ACCOUNT: &str = "openai-compatible";
const AI_PROVIDER_USER_AGENT: &str = "No.1 Markdown Editor AI Client";
const AI_PROVIDER_PROJECT_HEADER: &str = "OpenAI-Project";
const AI_COMPLETION_STREAM_EVENT: &str = "ai:completion-stream";

pub struct AiInFlightRequests(pub Mutex<HashMap<String, AbortHandle>>);

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiCompletionStreamChunk {
    pub request_id: String,
    pub chunk: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderConfig {
    pub provider: String,
    pub base_url: String,
    pub model: String,
    #[serde(default)]
    pub project: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderState {
    pub config: Option<AiProviderConfig>,
    pub has_api_key: bool,
    pub storage_kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiRequestMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiRunCompletionRequest {
    pub request_id: String,
    pub messages: Vec<AiRequestMessage>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiRunCompletionResponse {
    pub text: String,
    pub finish_reason: Option<String>,
    pub model: Option<String>,
    pub request_id: Option<String>,
}

#[tauri::command]
pub fn ai_load_provider_state<R: Runtime>(app: AppHandle<R>) -> Result<AiProviderState, String> {
    let config = read_ai_provider_config(&app)?;
    let has_api_key = has_ai_provider_api_key()?;

    Ok(AiProviderState {
        config,
        has_api_key,
        storage_kind: "keyring".to_string(),
    })
}

#[tauri::command]
pub fn ai_save_provider_config<R: Runtime>(
    app: AppHandle<R>,
    config: AiProviderConfig,
) -> Result<AiProviderConfig, String> {
    let normalized = normalize_ai_provider_config(config)?;
    write_ai_provider_config(&app, &normalized)?;
    Ok(normalized)
}

#[tauri::command]
pub fn ai_store_provider_api_key(api_key: String) -> Result<(), String> {
    let trimmed = api_key.trim();
    if trimmed.is_empty() {
        return Err("AI API key cannot be empty".to_string());
    }

    ai_keyring_entry()?
        .set_password(trimmed)
        .map_err(|error| format!("Failed to store AI API key: {error}"))
}

#[tauri::command]
pub fn ai_clear_provider_api_key() -> Result<(), String> {
    match ai_keyring_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("Failed to clear AI API key: {error}")),
    }
}

#[tauri::command]
pub async fn ai_run_completion<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, AiInFlightRequests>,
    request: AiRunCompletionRequest,
) -> Result<AiRunCompletionResponse, String> {
    validate_ai_request(&request)?;

    let config = read_ai_provider_config(&app)?
        .ok_or_else(|| "AI provider settings are not configured".to_string())?;
    let api_key = read_ai_provider_api_key()?;
    let completion_url = build_ai_chat_completions_url(&config.base_url)?;
    let request_id = request.request_id.trim().to_string();
    let request_id_for_task = request_id.clone();
    let app_handle = app.clone();
    let payload = json!({
        "model": config.model,
        "messages": request.messages,
        "stream": true,
    });

    let handle = tokio::spawn(async move {
        let response = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(60))
            .build()
            .map_err(|error| format!("Failed to initialize AI HTTP client: {error}"))?
            .post(completion_url)
            .header(USER_AGENT, AI_PROVIDER_USER_AGENT)
            .header(CONTENT_TYPE, "application/json")
            .bearer_auth(api_key)
            .body(payload.to_string());

        let response = apply_ai_project_header(response, &config.project)
            .send()
            .await
            .map_err(|error| normalize_ai_send_error_message(error.is_timeout(), error.is_connect(), &error.to_string()))?
            .error_for_status()
            .map_err(|error| normalize_ai_status_error_message(error.status(), &error.to_string()))?;

        read_ai_streaming_completion_response(app_handle, &request_id_for_task, response).await
    });

    register_in_flight_request(&state, &request_id, handle.abort_handle())?;
    let result = handle.await;
    unregister_in_flight_request(&state, &request_id);

    match result {
        Ok(inner) => inner,
        Err(error) if error.is_cancelled() => Err("AI request was canceled".to_string()),
        Err(error) => Err(format!("AI request task failed: {error}")),
    }
}

#[tauri::command]
pub fn ai_cancel_completion(
    state: tauri::State<'_, AiInFlightRequests>,
    request_id: String,
) -> Result<bool, String> {
    let trimmed = request_id.trim();
    if trimmed.is_empty() {
        return Err("AI request id is required".to_string());
    }

    let handle = state
        .0
        .lock()
        .map_err(|_| "Failed to access AI in-flight requests".to_string())?
        .remove(trimmed);

    if let Some(handle) = handle {
        handle.abort();
        return Ok(true);
    }

    Ok(false)
}

fn read_ai_provider_config<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<Option<AiProviderConfig>, String> {
    let config_path = ai_provider_config_path(app)?;
    if !config_path.exists() {
        return Ok(None);
    }

    let raw = fs::read_to_string(&config_path)
        .map_err(|error| format!("Failed to read AI provider config: {error}"))?;
    let config: AiProviderConfig = serde_json::from_str(&raw)
        .map_err(|error| format!("Failed to parse AI provider config: {error}"))?;

    normalize_ai_provider_config(config).map(Some)
}

fn write_ai_provider_config<R: Runtime>(
    app: &AppHandle<R>,
    config: &AiProviderConfig,
) -> Result<(), String> {
    let config_path = ai_provider_config_path(app)?;
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create AI config directory: {error}"))?;
    }

    let body = serde_json::to_string_pretty(config)
        .map_err(|error| format!("Failed to serialize AI provider config: {error}"))?;
    fs::write(config_path, body)
        .map_err(|error| format!("Failed to write AI provider config: {error}"))
}

fn ai_provider_config_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let base_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("Failed to resolve AI config directory: {error}"))?;

    Ok(base_dir.join(AI_PROVIDER_CONFIG_FILE))
}

fn ai_keyring_entry() -> Result<Entry, String> {
    Entry::new(AI_KEYRING_SERVICE, AI_KEYRING_ACCOUNT)
        .map_err(|error| format!("Failed to initialize AI keyring entry: {error}"))
}

fn has_ai_provider_api_key() -> Result<bool, String> {
    match ai_keyring_entry()?.get_password() {
        Ok(value) => Ok(!value.trim().is_empty()),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(error) => Err(format!("Failed to inspect AI API key state: {error}")),
    }
}

fn read_ai_provider_api_key() -> Result<String, String> {
    match ai_keyring_entry()?.get_password() {
        Ok(value) => {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                return Err("Stored AI API key is empty".to_string());
            }
            Ok(trimmed.to_string())
        }
        Err(keyring::Error::NoEntry) => Err("No AI API key is configured".to_string()),
        Err(error) => Err(format!("Failed to read AI API key: {error}")),
    }
}

fn normalize_ai_provider_config(config: AiProviderConfig) -> Result<AiProviderConfig, String> {
    if config.provider.trim() != "openai-compatible" {
        return Err(format!(
            "Unsupported AI provider: {}",
            config.provider.trim()
        ));
    }

    let model = config.model.trim();
    if model.is_empty() {
        return Err("AI model is required".to_string());
    }

    let mut base_url = reqwest::Url::parse(config.base_url.trim())
        .map_err(|_| "AI base URL must be a valid HTTP or HTTPS URL".to_string())?;
    if !matches!(base_url.scheme(), "http" | "https") {
        return Err("AI base URL must use HTTP or HTTPS".to_string());
    }

    if !base_url.path().ends_with('/') {
        let next_path = if base_url.path().is_empty() {
            "/".to_string()
        } else {
            format!("{}/", base_url.path())
        };
        base_url.set_path(&next_path);
    }

    Ok(AiProviderConfig {
        provider: "openai-compatible".to_string(),
        base_url: base_url.to_string().trim_end_matches('/').to_string(),
        model: model.to_string(),
        project: config.project.trim().to_string(),
    })
}

fn build_ai_chat_completions_url(base_url: &str) -> Result<reqwest::Url, String> {
    let mut normalized = base_url.trim().to_string();
    if normalized.is_empty() {
        return Err("AI base URL is required".to_string());
    }
    if !normalized.ends_with('/') {
        normalized.push('/');
    }

    let parsed = reqwest::Url::parse(&normalized)
        .map_err(|_| "AI base URL must be a valid URL".to_string())?;
    parsed
        .join("chat/completions")
        .map_err(|error| format!("Failed to build AI completion URL: {error}"))
}

fn apply_ai_project_header(
    builder: reqwest::RequestBuilder,
    project: &str,
) -> reqwest::RequestBuilder {
    let trimmed = project.trim();
    if trimmed.is_empty() {
        builder
    } else {
        builder.header(AI_PROVIDER_PROJECT_HEADER, trimmed)
    }
}

fn normalize_ai_send_error_message(
    is_timeout: bool,
    is_connect: bool,
    fallback: &str,
) -> String {
    if is_timeout {
        return "AI request timed out".to_string();
    }

    if is_connect {
        return "Unable to reach the AI service. Check your network connection".to_string();
    }

    format!("AI request failed: {fallback}")
}

fn normalize_ai_status_error_message(status: Option<StatusCode>, fallback: &str) -> String {
    match status.map(|status| status.as_u16()) {
        Some(400) => "AI request was rejected by the provider".to_string(),
        Some(401 | 403) => {
            "AI authentication failed. Check your API key and project settings".to_string()
        }
        Some(404) => "AI endpoint was not found. Check the configured base URL".to_string(),
        Some(429) => "AI rate limit reached. Try again in a moment".to_string(),
        Some(500..=599) => "AI service is temporarily unavailable. Try again later".to_string(),
        Some(code) => format!("AI request returned an error ({code})"),
        None => format!("AI request returned an error: {fallback}"),
    }
}

fn register_in_flight_request(
    state: &tauri::State<'_, AiInFlightRequests>,
    request_id: &str,
    abort_handle: AbortHandle,
) -> Result<(), String> {
    let mut requests = state
        .0
        .lock()
        .map_err(|_| "Failed to access AI in-flight requests".to_string())?;
    requests.insert(request_id.to_string(), abort_handle);
    Ok(())
}

fn unregister_in_flight_request(state: &tauri::State<'_, AiInFlightRequests>, request_id: &str) {
    if let Ok(mut requests) = state.0.lock() {
        requests.remove(request_id);
    }
}

fn validate_ai_request(request: &AiRunCompletionRequest) -> Result<(), String> {
    if request.request_id.trim().is_empty() {
        return Err("AI request id is required".to_string());
    }

    validate_ai_messages(&request.messages)
}

fn validate_ai_messages(messages: &[AiRequestMessage]) -> Result<(), String> {
    if messages.is_empty() {
        return Err("AI request must include at least one message".to_string());
    }

    for message in messages {
        if !matches!(message.role.as_str(), "system" | "user" | "assistant") {
            return Err(format!("Unsupported AI message role: {}", message.role));
        }
        if message.content.trim().is_empty() {
            return Err("AI request messages must not be empty".to_string());
        }
    }

    Ok(())
}

#[cfg(test)]
fn extract_ai_completion_response(response_json: Value) -> Result<AiRunCompletionResponse, String> {
    let request_id = response_json
        .get("id")
        .and_then(Value::as_str)
        .map(str::to_string);
    let model = response_json
        .get("model")
        .and_then(Value::as_str)
        .map(str::to_string);

    let choices = response_json
        .get("choices")
        .and_then(Value::as_array)
        .ok_or_else(|| "AI response did not include choices".to_string())?;
    let first_choice = choices
        .first()
        .ok_or_else(|| "AI response choices were empty".to_string())?;

    let finish_reason = first_choice
        .get("finish_reason")
        .and_then(Value::as_str)
        .map(str::to_string);
    let content = first_choice
        .get("message")
        .and_then(|message| message.get("content"))
        .ok_or_else(|| "AI response did not include message content".to_string())?;
    let text = extract_content_text(content)
        .ok_or_else(|| "AI response content was empty or unsupported".to_string())?;

    Ok(AiRunCompletionResponse {
        text,
        finish_reason,
        model,
        request_id,
    })
}

async fn read_ai_streaming_completion_response<R: Runtime>(
    app: AppHandle<R>,
    request_id: &str,
    mut response: reqwest::Response,
) -> Result<AiRunCompletionResponse, String> {
    let mut event_buffer = String::new();
    let mut text = String::new();
    let mut finish_reason = None;
    let mut model = None;
    let mut provider_request_id = None;
    let mut stream_finished = false;

    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "AI service returned an unreadable response".to_string())?
    {
        event_buffer.push_str(&String::from_utf8_lossy(&chunk));
        normalize_ai_sse_buffer(&mut event_buffer);

        while let Some(event) = take_next_ai_sse_event(&mut event_buffer) {
            let should_finish = apply_ai_stream_event(
                &app,
                request_id,
                &event,
                &mut text,
                &mut finish_reason,
                &mut model,
                &mut provider_request_id,
            )?;

            if should_finish {
                stream_finished = true;
                break;
            }
        }

        if stream_finished {
            break;
        }
    }

    normalize_ai_sse_buffer(&mut event_buffer);
    if !stream_finished && !event_buffer.trim().is_empty() {
        let _ = apply_ai_stream_event(
            &app,
            request_id,
            event_buffer.trim(),
            &mut text,
            &mut finish_reason,
            &mut model,
            &mut provider_request_id,
        )?;
    }

    if text.trim().is_empty() {
        return Err("AI response content was empty or unsupported".to_string());
    }

    Ok(AiRunCompletionResponse {
        text,
        finish_reason,
        model,
        request_id: provider_request_id.or_else(|| Some(request_id.to_string())),
    })
}

fn normalize_ai_sse_buffer(buffer: &mut String) {
    if buffer.contains("\r\n") {
        *buffer = buffer.replace("\r\n", "\n");
    }
    if buffer.contains('\r') {
        *buffer = buffer.replace('\r', "\n");
    }
}

fn take_next_ai_sse_event(buffer: &mut String) -> Option<String> {
    let boundary_index = buffer.find("\n\n")?;
    let event = buffer[..boundary_index].to_string();
    buffer.drain(..boundary_index + 2);
    Some(event)
}

fn apply_ai_stream_event<R: Runtime>(
    app: &AppHandle<R>,
    request_id: &str,
    event: &str,
    text: &mut String,
    finish_reason: &mut Option<String>,
    model: &mut Option<String>,
    provider_request_id: &mut Option<String>,
) -> Result<bool, String> {
    let data = collect_ai_sse_data(event);
    if data.is_empty() {
        return Ok(false);
    }
    if data == "[DONE]" {
        return Ok(true);
    }

    let response_json: Value = serde_json::from_str(&data)
        .map_err(|_| "AI service returned a malformed response".to_string())?;

    if provider_request_id.is_none() {
        *provider_request_id = response_json
            .get("id")
            .and_then(Value::as_str)
            .map(str::to_string);
    }
    if model.is_none() {
        *model = response_json
            .get("model")
            .and_then(Value::as_str)
            .map(str::to_string);
    }

    let chunk_finish_reason = extract_ai_stream_finish_reason(&response_json);
    if let Some(ref reason) = chunk_finish_reason {
        *finish_reason = Some(reason.clone());
    }

    if let Some(chunk) = extract_ai_stream_chunk(&response_json) {
        text.push_str(&chunk);
        emit_ai_stream_chunk(app, request_id, &chunk)?;
    }

    // finish_reason being set means the provider considers the stream complete.
    // Some providers omit [DONE] or send it only after a network-level close,
    // causing the invoke to hang. Treat any non-null finish_reason as done.
    if chunk_finish_reason.is_some() {
        return Ok(true);
    }

    Ok(false)
}

fn collect_ai_sse_data(event: &str) -> String {
    event
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with(':') {
                return None;
            }

            trimmed
                .strip_prefix("data:")
                .map(|value| value.trim_start().to_string())
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn emit_ai_stream_chunk<R: Runtime>(
    app: &AppHandle<R>,
    request_id: &str,
    chunk: &str,
) -> Result<(), String> {
    app.emit(
        AI_COMPLETION_STREAM_EVENT,
        AiCompletionStreamChunk {
            request_id: request_id.to_string(),
            chunk: chunk.to_string(),
        },
    )
    .map_err(|error| format!("Failed to emit AI stream chunk: {error}"))
}

fn extract_ai_stream_finish_reason(response_json: &Value) -> Option<String> {
    // OpenAI-compatible: choices[0].finish_reason (snake_case, string or null)
    let from_choices = response_json
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| {
            // snake_case (OpenAI, most providers)
            choice
                .get("finish_reason")
                .and_then(Value::as_str)
                // camelCase (OCI Cohere: finishReason = "COMPLETE" | "MAX_TOKENS" | …)
                .or_else(|| choice.get("finishReason").and_then(Value::as_str))
        })
        .map(str::to_string);

    if from_choices.is_some() {
        return from_choices;
    }

    // OCI Generic/Llama top-level finishReason (outside choices)
    response_json
        .get("finishReason")
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn extract_ai_stream_chunk(response_json: &Value) -> Option<String> {
    let first_choice = response_json
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())?;

    first_choice
        .get("delta")
        .and_then(|delta| delta.get("content"))
        .and_then(extract_content_text)
        .or_else(|| {
            first_choice
                .get("message")
                .and_then(|message| message.get("content"))
                .and_then(extract_content_text)
        })
        .or_else(|| {
            first_choice
                .get("text")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
}

fn extract_content_text(value: &Value) -> Option<String> {
    if let Some(text) = value.as_str() {
        return (!text.trim().is_empty()).then_some(text.to_string());
    }

    let parts = value.as_array()?;
    let text = parts
        .iter()
        .filter_map(|part| {
            part.get("text")
                .and_then(Value::as_str)
                .or_else(|| part.get("content").and_then(Value::as_str))
        })
        .collect::<Vec<_>>()
        .join("");

    (!text.trim().is_empty()).then_some(text)
}

#[cfg(test)]
mod tests {
    use super::collect_ai_sse_data;
    use super::extract_ai_stream_chunk;
    use super::extract_ai_stream_finish_reason;
    use super::apply_ai_project_header;
    use super::build_ai_chat_completions_url;
    use super::extract_ai_completion_response;
    use super::normalize_ai_sse_buffer;
    use super::normalize_ai_send_error_message;
    use super::normalize_ai_status_error_message;
    use super::normalize_ai_provider_config;
    use super::take_next_ai_sse_event;
    use super::AiProviderConfig;
    use super::AI_PROVIDER_PROJECT_HEADER;
    use reqwest::StatusCode;
    use serde_json::json;

    #[test]
    fn normalize_ai_provider_config_trims_and_validates_fields() {
        let config = normalize_ai_provider_config(AiProviderConfig {
            provider: " openai-compatible ".to_string(),
            base_url: "https://example.com/v1".to_string(),
            model: " gpt-test ".to_string(),
            project: "  project-123  ".to_string(),
        })
        .expect("normalize provider config");

        assert_eq!(config.provider, "openai-compatible");
        assert_eq!(config.base_url, "https://example.com/v1");
        assert_eq!(config.model, "gpt-test");
        assert_eq!(config.project, "project-123");
    }

    #[test]
    fn build_ai_chat_completions_url_appends_chat_completions_path() {
        let url =
            build_ai_chat_completions_url("https://example.com/v1").expect("build completion url");
        assert_eq!(url.as_str(), "https://example.com/v1/chat/completions");
    }

    #[test]
    fn extract_ai_completion_response_supports_string_content() {
        let response = extract_ai_completion_response(json!({
            "id": "req_123",
            "model": "gpt-test",
            "choices": [{
                "finish_reason": "stop",
                "message": {
                    "content": "Hello from AI"
                }
            }]
        }))
        .expect("extract string response");

        assert_eq!(response.text, "Hello from AI");
        assert_eq!(response.finish_reason.as_deref(), Some("stop"));
        assert_eq!(response.model.as_deref(), Some("gpt-test"));
        assert_eq!(response.request_id.as_deref(), Some("req_123"));
    }

    #[test]
    fn extract_ai_completion_response_supports_array_content() {
        let response = extract_ai_completion_response(json!({
            "choices": [{
                "message": {
                    "content": [
                        { "type": "text", "text": "Hello " },
                        { "type": "text", "text": "world" }
                    ]
                }
            }]
        }))
        .expect("extract array response");

        assert_eq!(response.text, "Hello world");
    }

    #[test]
    fn normalize_ai_sse_buffer_and_take_next_event_support_crlf_boundaries() {
        let mut buffer =
            "data: {\"choices\":[{\"delta\":{\"content\":\"Hello \"}}]}\r\n\r\ndata: [DONE]\r\n\r\n"
                .to_string();
        normalize_ai_sse_buffer(&mut buffer);

        let first_event = take_next_ai_sse_event(&mut buffer).expect("first sse event");
        let second_event = take_next_ai_sse_event(&mut buffer).expect("second sse event");

        assert_eq!(
            first_event,
            "data: {\"choices\":[{\"delta\":{\"content\":\"Hello \"}}]}"
        );
        assert_eq!(second_event, "data: [DONE]");
    }

    #[test]
    fn collect_ai_sse_data_joins_multiple_data_lines() {
        let payload = collect_ai_sse_data(
            "event: completion\ndata: {\"choices\":[{\"delta\":{\"content\":\"Hello\"}}]}\ndata: {\"tail\":true}",
        );

        assert_eq!(
            payload,
            "{\"choices\":[{\"delta\":{\"content\":\"Hello\"}}]}\n{\"tail\":true}"
        );
    }

    #[test]
    fn extract_ai_stream_chunk_supports_string_and_array_delta_content() {
        assert_eq!(
            extract_ai_stream_chunk(&json!({
                "choices": [{
                    "delta": { "content": "Hello " },
                    "finish_reason": null
                }]
            }))
            .as_deref(),
            Some("Hello ")
        );

        assert_eq!(
            extract_ai_stream_chunk(&json!({
                "choices": [{
                    "delta": {
                        "content": [
                            { "type": "text", "text": "world" }
                        ]
                    },
                    "finish_reason": "stop"
                }]
            }))
            .as_deref(),
            Some("world")
        );
    }

    #[test]
    fn extract_ai_stream_finish_reason_reads_terminal_choice_metadata() {
        // OpenAI snake_case
        assert_eq!(
            extract_ai_stream_finish_reason(&json!({
                "choices": [{
                    "delta": {},
                    "finish_reason": "stop"
                }]
            }))
            .as_deref(),
            Some("stop")
        );

        // OCI Cohere camelCase inside choices
        assert_eq!(
            extract_ai_stream_finish_reason(&json!({
                "choices": [{
                    "delta": {},
                    "finishReason": "COMPLETE"
                }]
            }))
            .as_deref(),
            Some("COMPLETE")
        );

        // OCI Generic/Llama top-level finishReason
        assert_eq!(
            extract_ai_stream_finish_reason(&json!({
                "finishReason": "stop"
            }))
            .as_deref(),
            Some("stop")
        );

        // null finish_reason (intermediate chunk) should return None
        assert_eq!(
            extract_ai_stream_finish_reason(&json!({
                "choices": [{
                    "delta": { "content": "hello" },
                    "finish_reason": null
                }]
            })),
            None
        );
    }

    #[test]
    fn apply_ai_project_header_adds_header_when_project_is_present() {
        let request = apply_ai_project_header(
            reqwest::Client::new().post("https://example.com/v1/chat/completions"),
            "project-123",
        )
        .build()
        .expect("build request");

        assert_eq!(
            request
                .headers()
                .get(AI_PROVIDER_PROJECT_HEADER)
                .and_then(|value| value.to_str().ok()),
            Some("project-123")
        );
    }

    #[test]
    fn apply_ai_project_header_omits_header_when_project_is_empty() {
        let request = apply_ai_project_header(
            reqwest::Client::new().post("https://example.com/v1/chat/completions"),
            "   ",
        )
        .build()
        .expect("build request");

        assert!(request.headers().get(AI_PROVIDER_PROJECT_HEADER).is_none());
    }

    #[test]
    fn normalize_ai_send_error_message_maps_timeout_and_connect_failures() {
        assert_eq!(
            normalize_ai_send_error_message(true, false, "timed out"),
            "AI request timed out"
        );
        assert_eq!(
            normalize_ai_send_error_message(false, true, "offline"),
            "Unable to reach the AI service. Check your network connection"
        );
        assert!(normalize_ai_send_error_message(false, false, "boom").starts_with("AI request failed:"));
    }

    #[test]
    fn normalize_ai_status_error_message_maps_common_provider_status_codes() {
        assert_eq!(
            normalize_ai_status_error_message(Some(StatusCode::UNAUTHORIZED), "unauthorized"),
            "AI authentication failed. Check your API key and project settings"
        );
        assert_eq!(
            normalize_ai_status_error_message(Some(StatusCode::TOO_MANY_REQUESTS), "rate limit"),
            "AI rate limit reached. Try again in a moment"
        );
        assert_eq!(
            normalize_ai_status_error_message(Some(StatusCode::BAD_GATEWAY), "bad gateway"),
            "AI service is temporarily unavailable. Try again later"
        );
    }
}
