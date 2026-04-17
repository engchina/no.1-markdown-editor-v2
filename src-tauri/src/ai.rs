use keyring::Entry;
use reqwest::header::{ACCEPT, CONTENT_TYPE, USER_AGENT};
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tokio::task::AbortHandle;

const AI_PROVIDER_CONFIG_FILE: &str = "ai-provider.json";
const AI_KEYRING_SERVICE: &str = "com.no1.markdown-editor.ai";
const AI_DIRECT_PROVIDER_ACCOUNT: &str = "direct-provider";
const AI_HOSTED_AGENT_ACCOUNT_PREFIX: &str = "hosted-agent:";
const AI_PROVIDER_USER_AGENT: &str = "No.1 Markdown Editor AI Client";
const AI_PROVIDER_PROJECT_HEADER: &str = "OpenAI-Project";
const AI_COMPLETION_STREAM_EVENT: &str = "ai:completion-stream";
const AI_OAUTH_REFRESH_MARGIN_SECONDS: u64 = 30;

pub struct AiInFlightRequests(pub Mutex<HashMap<String, AbortHandle>>);
pub struct AiOAuthTokenCache(pub Mutex<HashMap<String, CachedOAuthToken>>);

#[derive(Debug, Clone)]
pub struct CachedOAuthToken {
    pub access_token: String,
    pub expires_at_unix: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiCompletionStreamChunk {
    pub request_id: String,
    pub chunk: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiOracleUnstructuredStoreRegistration {
    pub id: String,
    pub label: String,
    pub vector_store_id: String,
    pub description: String,
    pub enabled: bool,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiOracleStructuredStoreRegistration {
    pub id: String,
    pub label: String,
    pub semantic_store_id: String,
    #[serde(default)]
    pub vector_store_id: String,
    #[serde(default)]
    pub store_ocid: String,
    pub description: String,
    pub enabled: bool,
    pub default_mode: String,
    pub execution_agent_profile_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiOracleHostedAgentProfile {
    pub id: String,
    pub label: String,
    pub endpoint_url: String,
    #[serde(default)]
    pub invoke_path: String,
    pub domain_url: String,
    pub client_id: String,
    #[serde(default)]
    pub scope: String,
    #[serde(default)]
    pub audience: String,
    pub transport: String,
    #[serde(default)]
    pub supported_contracts: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderConfig {
    pub provider: String,
    pub base_url: String,
    pub model: String,
    #[serde(default)]
    pub project: String,
    #[serde(default)]
    pub unstructured_stores: Vec<AiOracleUnstructuredStoreRegistration>,
    #[serde(default)]
    pub structured_stores: Vec<AiOracleStructuredStoreRegistration>,
    #[serde(default)]
    pub hosted_agent_profiles: Vec<AiOracleHostedAgentProfile>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderState {
    pub config: Option<AiProviderConfig>,
    pub has_api_key: bool,
    pub storage_kind: String,
    pub has_hosted_agent_client_secret_by_id: HashMap<String, bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiRequestMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiKnowledgeSelection {
    pub kind: String,
    #[serde(default)]
    pub registration_id: Option<String>,
    #[serde(default)]
    pub mode: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiRunCompletionRequest {
    pub request_id: String,
    #[serde(default)]
    pub intent: String,
    #[serde(default)]
    pub scope: String,
    #[serde(default)]
    pub output_target: String,
    #[serde(default)]
    pub prompt: String,
    #[serde(default)]
    pub messages: Vec<AiRequestMessage>,
    pub execution_target_kind: String,
    pub invocation_capability: String,
    pub knowledge_selection: AiKnowledgeSelection,
    #[serde(default)]
    pub thread_id: Option<String>,
    #[serde(default)]
    pub hosted_agent_profile_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiRetrievalResultPreview {
    pub title: String,
    #[serde(default)]
    pub detail: Option<String>,
    #[serde(default)]
    pub snippet: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiRunCompletionResponse {
    pub text: String,
    pub finish_reason: Option<String>,
    pub model: Option<String>,
    pub request_id: Option<String>,
    pub thread_id: Option<String>,
    pub content_type: String,
    pub explanation_text: Option<String>,
    pub warning_text: Option<String>,
    pub source_label: Option<String>,
    #[serde(default)]
    pub retrieval_executed: bool,
    #[serde(default)]
    pub retrieval_query: Option<String>,
    #[serde(default)]
    pub retrieval_results: Vec<AiRetrievalResultPreview>,
    #[serde(default)]
    pub retrieval_result_count: Option<usize>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct AiFileSearchCallObservation {
    status: Option<String>,
    queries: Vec<String>,
    result_count: Option<usize>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct AiFileSearchObservation {
    calls_by_id: HashMap<String, AiFileSearchCallObservation>,
    ordered_queries: Vec<String>,
    result_previews: Vec<AiRetrievalResultPreview>,
}

impl AiFileSearchObservation {
    fn has_calls(&self) -> bool {
        !self.calls_by_id.is_empty()
    }

    fn total_result_count(&self) -> Option<usize> {
        let mut total = 0;
        let mut has_known_count = false;

        for call in self.calls_by_id.values() {
            if let Some(count) = call.result_count {
                total += count;
                has_known_count = true;
            }
        }

        has_known_count.then_some(total)
    }

    fn first_query(&self) -> Option<String> {
        self.ordered_queries.first().cloned().or_else(|| {
            self.calls_by_id
                .values()
                .flat_map(|call| call.queries.iter().cloned())
                .find(|query| !query.trim().is_empty())
        })
    }

    fn result_previews(&self) -> Vec<AiRetrievalResultPreview> {
        self.result_previews.clone()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiOAuthTokenResponse {
    access_token: String,
    #[serde(default)]
    expires_in: Option<u64>,
}

#[tauri::command]
pub fn ai_load_provider_state<R: Runtime>(app: AppHandle<R>) -> Result<AiProviderState, String> {
    let config = read_ai_provider_config(&app)?;
    let has_api_key = has_ai_provider_api_key()?;
    let has_hosted_agent_client_secret_by_id = match config.as_ref() {
        Some(config) if config.provider == "oci-responses" => config
            .hosted_agent_profiles
            .iter()
            .map(|profile| {
                Ok((
                    profile.id.clone(),
                    has_hosted_agent_client_secret(&profile.id)?,
                ))
            })
            .collect::<Result<HashMap<_, _>, String>>()?,
        _ => HashMap::new(),
    };

    Ok(AiProviderState {
        config,
        has_api_key,
        storage_kind: "keyring".to_string(),
        has_hosted_agent_client_secret_by_id,
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

    ai_keyring_entry(AI_DIRECT_PROVIDER_ACCOUNT)?
        .set_password(trimmed)
        .map_err(|error| format!("Failed to store AI API key: {error}"))
}

#[tauri::command]
pub fn ai_clear_provider_api_key() -> Result<(), String> {
    match ai_keyring_entry(AI_DIRECT_PROVIDER_ACCOUNT)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("Failed to clear AI API key: {error}")),
    }
}

#[tauri::command]
pub fn ai_store_hosted_agent_client_secret(
    profile_id: String,
    client_secret: String,
) -> Result<(), String> {
    let trimmed_profile_id = profile_id.trim();
    if trimmed_profile_id.is_empty() {
        return Err("Hosted agent profile id is required".to_string());
    }

    let trimmed_secret = client_secret.trim();
    if trimmed_secret.is_empty() {
        return Err("Hosted agent client secret cannot be empty".to_string());
    }

    ai_keyring_entry(&hosted_agent_keyring_account(trimmed_profile_id))?
        .set_password(trimmed_secret)
        .map_err(|error| format!("Failed to store hosted agent client secret: {error}"))
}

#[tauri::command]
pub fn ai_clear_hosted_agent_client_secret(profile_id: String) -> Result<(), String> {
    let trimmed_profile_id = profile_id.trim();
    if trimmed_profile_id.is_empty() {
        return Err("Hosted agent profile id is required".to_string());
    }

    match ai_keyring_entry(&hosted_agent_keyring_account(trimmed_profile_id))?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!(
            "Failed to clear hosted agent client secret: {error}"
        )),
    }
}

#[tauri::command]
pub async fn ai_run_completion<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, AiInFlightRequests>,
    _oauth_cache: tauri::State<'_, AiOAuthTokenCache>,
    request: AiRunCompletionRequest,
) -> Result<AiRunCompletionResponse, String> {
    validate_ai_request(&request)?;

    let config = read_ai_provider_config(&app)?
        .ok_or_else(|| "AI provider settings are not configured".to_string())?;
    let request_id = request.request_id.trim().to_string();
    let request_id_for_task = request_id.clone();
    let app_handle = app.clone();
    let config_for_task = config.clone();
    let request_for_task = request.clone();

    let handle = tokio::spawn(async move {
        route_ai_completion_request(
            app_handle,
            request_id_for_task,
            config_for_task,
            request_for_task,
        )
        .await
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

async fn route_ai_completion_request<R: Runtime>(
    app: AppHandle<R>,
    request_id: String,
    config: AiProviderConfig,
    request: AiRunCompletionRequest,
) -> Result<AiRunCompletionResponse, String> {
    if request.execution_target_kind == "oracle-hosted-agent" {
        return run_hosted_agent_completion(app, &config, &request, &request_id).await;
    }

    let api_key = read_ai_provider_api_key()?;

    if config.provider == "openai-compatible" {
        return run_openai_chat_completion(app, &config, &api_key, &request, &request_id).await;
    }

    if request.knowledge_selection.kind == "oracle-structured-store"
        && request.knowledge_selection.mode.as_deref() == Some("sql-draft")
    {
        return run_oci_nl2sql_draft_completion(&config, &api_key, &request).await;
    }

    run_oci_responses_completion(app, &config, &api_key, &request, &request_id).await
}

async fn run_openai_chat_completion<R: Runtime>(
    app: AppHandle<R>,
    config: &AiProviderConfig,
    api_key: &str,
    request: &AiRunCompletionRequest,
    request_id: &str,
) -> Result<AiRunCompletionResponse, String> {
    let completion_url = build_ai_chat_completions_url(&config.base_url)?;
    let payload = json!({
        "model": config.model,
        "messages": request.messages,
        "stream": true,
    });

    let response = build_default_http_client()?
        .post(completion_url)
        .header(USER_AGENT, AI_PROVIDER_USER_AGENT)
        .header(CONTENT_TYPE, "application/json")
        .bearer_auth(api_key)
        .body(payload.to_string());

    let response = apply_ai_project_header(response, &config.project)
        .send()
        .await
        .map_err(|error| {
            normalize_ai_send_error_message(
                error.is_timeout(),
                error.is_connect(),
                &error.to_string(),
            )
        })?
        .error_for_status()
        .map_err(|error| normalize_ai_status_error_message(error.status(), &error.to_string()))?;

    let (mut stream_response, _) =
        read_ai_streaming_completion_response(app, request_id, response).await?;
    stream_response.content_type = resolve_ai_response_content_type(request, false).to_string();
    ensure_ai_response_contains_text(stream_response)
}

async fn run_oci_responses_completion<R: Runtime>(
    app: AppHandle<R>,
    config: &AiProviderConfig,
    api_key: &str,
    request: &AiRunCompletionRequest,
    request_id: &str,
) -> Result<AiRunCompletionResponse, String> {
    let responses_url = build_ai_responses_url(&config.base_url)?;
    let (payload, source_label) = build_oci_responses_payload(config, request)?;

    let response = build_default_http_client()?
        .post(responses_url)
        .header(USER_AGENT, AI_PROVIDER_USER_AGENT)
        .header(CONTENT_TYPE, "application/json")
        .bearer_auth(api_key)
        .body(payload.to_string());

    let response = apply_ai_project_header(response, &config.project)
        .send()
        .await
        .map_err(|error| {
            normalize_ai_send_error_message(
                error.is_timeout(),
                error.is_connect(),
                &error.to_string(),
            )
        })?
        .error_for_status()
        .map_err(|error| normalize_ai_status_error_message(error.status(), &error.to_string()))?;

    let (mut stream_response, file_search_observation) =
        read_ai_streaming_completion_response(app, request_id, response).await?;
    stream_response.content_type = resolve_ai_response_content_type(request, false).to_string();
    if request.knowledge_selection.kind == "oracle-unstructured-store" {
        return finalize_document_store_response(
            stream_response,
            request,
            source_label,
            &file_search_observation,
        );
    }

    stream_response.source_label = source_label;
    ensure_ai_response_contains_text(stream_response)
}

async fn run_oci_nl2sql_draft_completion(
    config: &AiProviderConfig,
    api_key: &str,
    request: &AiRunCompletionRequest,
) -> Result<AiRunCompletionResponse, String> {
    let store = find_structured_store_registration(
        config,
        request.knowledge_selection.registration_id.as_deref(),
    )
    .ok_or_else(|| "Selected Oracle structured store was not found".to_string())?;
    let generate_sql_url = build_ai_generate_sql_url(&config.base_url, &store.semantic_store_id)?;
    let payload = json!({
        "inputNaturalLanguageQuery": request.prompt.trim()
    });

    let response = build_default_http_client()?
        .post(generate_sql_url)
        .header(USER_AGENT, AI_PROVIDER_USER_AGENT)
        .header(CONTENT_TYPE, "application/json")
        .bearer_auth(api_key)
        .body(payload.to_string());

    let response = apply_ai_project_header(response, &config.project)
        .send()
        .await
        .map_err(|error| {
            normalize_ai_send_error_message(
                error.is_timeout(),
                error.is_connect(),
                &error.to_string(),
            )
        })?
        .error_for_status()
        .map_err(|error| normalize_ai_status_error_message(error.status(), &error.to_string()))?;

    let response_body = response
        .text()
        .await
        .map_err(|_| "AI service returned an unreadable response".to_string())?;
    let response_json: Value = serde_json::from_str(&response_body)
        .map_err(|_| "AI service returned a malformed response".to_string())?;
    let text = extract_nl2sql_sql_text(&response_json)
        .ok_or_else(|| "NL2SQL response did not include SQL text".to_string())?;
    let explanation_text = extract_nl2sql_explanation(&response_json);
    let warning_text = extract_nl2sql_warning(&response_json);

    Ok(AiRunCompletionResponse {
        text,
        finish_reason: Some("stop".to_string()),
        model: Some(config.model.clone()),
        request_id: Some(request.request_id.clone()),
        thread_id: request.thread_id.clone(),
        content_type: "sql".to_string(),
        explanation_text,
        warning_text,
        source_label: Some(store.label.clone()),
        retrieval_executed: false,
        retrieval_query: None,
        retrieval_results: vec![],
        retrieval_result_count: None,
    })
}

async fn run_hosted_agent_completion<R: Runtime>(
    app: AppHandle<R>,
    config: &AiProviderConfig,
    request: &AiRunCompletionRequest,
    request_id: &str,
) -> Result<AiRunCompletionResponse, String> {
    let profile_id = request
        .hosted_agent_profile_id
        .as_deref()
        .ok_or_else(|| "Hosted agent profile is required for structured execution".to_string())?;
    let profile = find_hosted_agent_profile(config, profile_id)
        .ok_or_else(|| "Selected hosted agent profile was not found".to_string())?;
    let client_secret = read_hosted_agent_client_secret(profile_id)?;
    let access_token = resolve_hosted_agent_access_token(
        &app.state::<AiOAuthTokenCache>(),
        profile,
        &client_secret,
    )
    .await?;
    let invoke_url = build_ai_hosted_agent_invoke_url(&profile.endpoint_url, &profile.invoke_path)?;
    let message = build_hosted_agent_message(request);
    let thread_id = request
        .thread_id
        .clone()
        .unwrap_or_else(|| request.request_id.clone());
    let payload = json!({
        "thread_id": thread_id,
        "message": message,
    });

    let builder = build_default_http_client()?
        .post(invoke_url)
        .header(USER_AGENT, AI_PROVIDER_USER_AGENT)
        .bearer_auth(access_token)
        .header(CONTENT_TYPE, "application/json")
        .body(payload.to_string());

    if profile.transport == "sse" {
        let response = builder
            .header(ACCEPT, "text/event-stream")
            .send()
            .await
            .map_err(|error| {
                normalize_ai_send_error_message(
                    error.is_timeout(),
                    error.is_connect(),
                    &error.to_string(),
                )
            })?
            .error_for_status()
            .map_err(|error| {
                normalize_ai_status_error_message(error.status(), &error.to_string())
            })?;

        let (mut stream_response, _) =
            read_ai_streaming_completion_response(app, request_id, response).await?;
        stream_response.thread_id = Some(thread_id);
        stream_response.content_type = resolve_ai_response_content_type(request, true).to_string();
        stream_response.source_label = Some(profile.label.clone());
        stream_response.explanation_text =
            Some("Returned by the configured Oracle hosted agent.".to_string());
        return ensure_ai_response_contains_text(stream_response);
    }

    let response_body = builder
        .header(ACCEPT, "application/json")
        .send()
        .await
        .map_err(|error| {
            normalize_ai_send_error_message(
                error.is_timeout(),
                error.is_connect(),
                &error.to_string(),
            )
        })?
        .error_for_status()
        .map_err(|error| normalize_ai_status_error_message(error.status(), &error.to_string()))?
        .text()
        .await
        .map_err(|_| "Hosted agent returned an unreadable response".to_string())?;
    let response_json: Value = serde_json::from_str(&response_body)
        .map_err(|_| "Hosted agent returned a malformed response".to_string())?;

    let text = extract_hosted_agent_reply_text(&response_json)
        .ok_or_else(|| "Hosted agent response did not include reply text".to_string())?;
    let resolved_thread_id = response_json
        .get("thread_id")
        .and_then(Value::as_str)
        .or_else(|| response_json.get("threadId").and_then(Value::as_str))
        .map(str::to_string)
        .or_else(|| Some(thread_id.clone()));

    Ok(AiRunCompletionResponse {
        text,
        finish_reason: Some("stop".to_string()),
        model: Some("oracle-hosted-agent".to_string()),
        request_id: Some(request.request_id.clone()),
        thread_id: resolved_thread_id,
        content_type: resolve_ai_response_content_type(request, true).to_string(),
        explanation_text: Some("Returned by the configured Oracle hosted agent.".to_string()),
        warning_text: None,
        source_label: Some(profile.label.clone()),
        retrieval_executed: false,
        retrieval_query: None,
        retrieval_results: vec![],
        retrieval_result_count: None,
    })
}

async fn resolve_hosted_agent_access_token(
    cache: &tauri::State<'_, AiOAuthTokenCache>,
    profile: &AiOracleHostedAgentProfile,
    client_secret: &str,
) -> Result<String, String> {
    let cache_key = format!(
        "{}|{}|{}|{}",
        profile.domain_url.trim(),
        profile.client_id.trim(),
        profile.scope.trim(),
        profile.audience.trim()
    );
    let now_unix = unix_timestamp_now();

    if let Some(token) = cache
        .0
        .lock()
        .map_err(|_| "Failed to access OAuth token cache".to_string())?
        .get(&cache_key)
        .cloned()
    {
        if token.expires_at_unix > now_unix + AI_OAUTH_REFRESH_MARGIN_SECONDS {
            return Ok(token.access_token);
        }
    }

    let token_url = build_ai_hosted_agent_token_url(&profile.domain_url)?;
    let mut form = vec![("grant_type".to_string(), "client_credentials".to_string())];
    if !profile.scope.trim().is_empty() {
        form.push(("scope".to_string(), profile.scope.trim().to_string()));
    }
    if !profile.audience.trim().is_empty() {
        form.push(("audience".to_string(), profile.audience.trim().to_string()));
    }
    let form_body = form
        .iter()
        .map(|(key, value)| {
            format!(
                "{}={}",
                url_encode_component(key),
                url_encode_component(value)
            )
        })
        .collect::<Vec<_>>()
        .join("&");

    let token_body = build_default_http_client()?
        .post(token_url)
        .basic_auth(profile.client_id.trim(), Some(client_secret))
        .header(USER_AGENT, AI_PROVIDER_USER_AGENT)
        .header(CONTENT_TYPE, "application/x-www-form-urlencoded")
        .body(form_body)
        .send()
        .await
        .map_err(|error| {
            normalize_ai_send_error_message(
                error.is_timeout(),
                error.is_connect(),
                &error.to_string(),
            )
        })?
        .error_for_status()
        .map_err(|error| normalize_ai_status_error_message(error.status(), &error.to_string()))?
        .text()
        .await
        .map_err(|_| "Hosted agent token endpoint returned an unreadable response".to_string())?;
    let token_response: AiOAuthTokenResponse = serde_json::from_str(&token_body)
        .map_err(|_| "Hosted agent token endpoint returned a malformed response".to_string())?;

    let expires_in = token_response.expires_in.unwrap_or(300);
    let cached = CachedOAuthToken {
        access_token: token_response.access_token.clone(),
        expires_at_unix: now_unix + expires_in,
    };

    cache
        .0
        .lock()
        .map_err(|_| "Failed to update OAuth token cache".to_string())?
        .insert(cache_key, cached);

    Ok(token_response.access_token)
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

fn ai_keyring_entry(account: &str) -> Result<Entry, String> {
    Entry::new(AI_KEYRING_SERVICE, account)
        .map_err(|error| format!("Failed to initialize AI keyring entry: {error}"))
}

fn hosted_agent_keyring_account(profile_id: &str) -> String {
    format!("{AI_HOSTED_AGENT_ACCOUNT_PREFIX}{profile_id}")
}

fn has_ai_provider_api_key() -> Result<bool, String> {
    match ai_keyring_entry(AI_DIRECT_PROVIDER_ACCOUNT)?.get_password() {
        Ok(value) => Ok(!value.trim().is_empty()),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(error) => Err(format!("Failed to inspect AI API key state: {error}")),
    }
}

fn read_ai_provider_api_key() -> Result<String, String> {
    match ai_keyring_entry(AI_DIRECT_PROVIDER_ACCOUNT)?.get_password() {
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

fn has_hosted_agent_client_secret(profile_id: &str) -> Result<bool, String> {
    match ai_keyring_entry(&hosted_agent_keyring_account(profile_id))?.get_password() {
        Ok(value) => Ok(!value.trim().is_empty()),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(error) => Err(format!(
            "Failed to inspect hosted agent secret state: {error}"
        )),
    }
}

fn read_hosted_agent_client_secret(profile_id: &str) -> Result<String, String> {
    match ai_keyring_entry(&hosted_agent_keyring_account(profile_id))?.get_password() {
        Ok(value) => {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                return Err("Stored hosted agent client secret is empty".to_string());
            }
            Ok(trimmed.to_string())
        }
        Err(keyring::Error::NoEntry) => {
            Err("No hosted agent client secret is configured".to_string())
        }
        Err(error) => Err(format!(
            "Failed to read hosted agent client secret: {error}"
        )),
    }
}

fn normalize_ai_provider_config(config: AiProviderConfig) -> Result<AiProviderConfig, String> {
    let provider = config.provider.trim();
    let model = config.model.trim();
    if model.is_empty() {
        return Err("AI model is required".to_string());
    }

    let base_url = normalize_http_url(
        config.base_url.trim(),
        "AI base URL must be a valid HTTP or HTTPS URL",
    )?;

    match provider {
        "openai-compatible" => Ok(AiProviderConfig {
            provider: "openai-compatible".to_string(),
            base_url,
            model: model.to_string(),
            project: config.project.trim().to_string(),
            unstructured_stores: vec![],
            structured_stores: vec![],
            hosted_agent_profiles: vec![],
        }),
        "oci-responses" => {
            let project = config.project.trim();
            if project.is_empty() {
                return Err("Oracle project is required for OCI Responses".to_string());
            }

            let hosted_agent_profiles =
                normalize_hosted_agent_profiles(config.hosted_agent_profiles)?;
            let hosted_agent_ids = hosted_agent_profiles
                .iter()
                .map(|profile| profile.id.clone())
                .collect::<HashSet<_>>();
            let unstructured_stores =
                normalize_unstructured_store_registrations(config.unstructured_stores);
            let structured_stores = normalize_structured_store_registrations(
                config.structured_stores,
                &hosted_agent_ids,
            );

            Ok(AiProviderConfig {
                provider: "oci-responses".to_string(),
                base_url,
                model: model.to_string(),
                project: project.to_string(),
                unstructured_stores,
                structured_stores,
                hosted_agent_profiles,
            })
        }
        _ => Err(format!("Unsupported AI provider: {}", provider)),
    }
}

fn normalize_unstructured_store_registrations(
    stores: Vec<AiOracleUnstructuredStoreRegistration>,
) -> Vec<AiOracleUnstructuredStoreRegistration> {
    let mut seen_default = false;
    stores
        .into_iter()
        .enumerate()
        .map(|(index, store)| {
            let is_default = if store.is_default && !seen_default {
                seen_default = true;
                true
            } else {
                false
            };

            AiOracleUnstructuredStoreRegistration {
                id: normalize_config_id(&store.id, "unstructured", index),
                label: store.label.trim().to_string(),
                vector_store_id: store.vector_store_id.trim().to_string(),
                description: store.description.trim().to_string(),
                enabled: store.enabled,
                is_default,
            }
        })
        .collect()
}

fn normalize_structured_store_registrations(
    stores: Vec<AiOracleStructuredStoreRegistration>,
    hosted_agent_ids: &HashSet<String>,
) -> Vec<AiOracleStructuredStoreRegistration> {
    stores
        .into_iter()
        .enumerate()
        .map(|(index, store)| AiOracleStructuredStoreRegistration {
            id: normalize_config_id(&store.id, "structured", index),
            label: store.label.trim().to_string(),
            semantic_store_id: store.semantic_store_id.trim().to_string(),
            vector_store_id: store.vector_store_id.trim().to_string(),
            store_ocid: store.store_ocid.trim().to_string(),
            description: store.description.trim().to_string(),
            enabled: store.enabled,
            default_mode: if store.default_mode == "agent-answer" {
                "agent-answer".to_string()
            } else {
                "sql-draft".to_string()
            },
            execution_agent_profile_id: store.execution_agent_profile_id.and_then(|value| {
                let trimmed = value.trim().to_string();
                if trimmed.is_empty() || !hosted_agent_ids.contains(&trimmed) {
                    None
                } else {
                    Some(trimmed)
                }
            }),
        })
        .collect()
}

fn normalize_hosted_agent_profiles(
    profiles: Vec<AiOracleHostedAgentProfile>,
) -> Result<Vec<AiOracleHostedAgentProfile>, String> {
    profiles
        .into_iter()
        .enumerate()
        .map(|(index, profile)| {
            Ok(AiOracleHostedAgentProfile {
                id: normalize_config_id(&profile.id, "hosted-agent", index),
                label: profile.label.trim().to_string(),
                endpoint_url: normalize_http_url(
                    profile.endpoint_url.trim(),
                    "Hosted agent endpoint URL must be a valid HTTP or HTTPS URL",
                )?,
                invoke_path: profile.invoke_path.trim().trim_matches('/').to_string(),
                domain_url: normalize_http_url(
                    profile.domain_url.trim(),
                    "Hosted agent domain URL must be a valid HTTP or HTTPS URL",
                )?,
                client_id: profile.client_id.trim().to_string(),
                scope: profile.scope.trim().to_string(),
                audience: profile.audience.trim().to_string(),
                transport: if profile.transport == "sse" {
                    "sse".to_string()
                } else {
                    "http-json".to_string()
                },
                supported_contracts: normalize_supported_contracts(profile.supported_contracts),
            })
        })
        .collect()
}

fn normalize_supported_contracts(contracts: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut normalized = vec![];
    for contract in contracts {
        let trimmed = contract.trim();
        if trimmed != "chat-text" && trimmed != "structured-data-answer" {
            continue;
        }
        if seen.insert(trimmed.to_string()) {
            normalized.push(trimmed.to_string());
        }
    }

    if normalized.is_empty() {
        normalized.push("chat-text".to_string());
    }

    normalized
}

fn normalize_config_id(input: &str, prefix: &str, index: usize) -> String {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        format!("{prefix}-{}", index + 1)
    } else {
        trimmed.to_string()
    }
}

fn normalize_http_url(input: &str, invalid_message: &str) -> Result<String, String> {
    let mut base_url = reqwest::Url::parse(input).map_err(|_| invalid_message.to_string())?;
    if !matches!(base_url.scheme(), "http" | "https") {
        return Err("AI base URL must use HTTP or HTTPS".to_string());
    }

    if !base_url.path().ends_with('/') {
        let next_path = if base_url.path().is_empty() {
            "/".to_string()
        } else {
            format!("{}/", base_url.path().trim_end_matches('/'))
        };
        base_url.set_path(&next_path);
    }

    Ok(base_url.to_string().trim_end_matches('/').to_string())
}

fn build_ai_chat_completions_url(base_url: &str) -> Result<reqwest::Url, String> {
    let parsed = normalize_url_with_trailing_slash(base_url)?;
    parsed
        .join("chat/completions")
        .map_err(|error| format!("Failed to build AI completion URL: {error}"))
}

fn build_ai_responses_url(base_url: &str) -> Result<reqwest::Url, String> {
    let parsed = normalize_url_with_trailing_slash(base_url)?;
    parsed
        .join("responses")
        .map_err(|error| format!("Failed to build AI responses URL: {error}"))
}

fn build_ai_generate_sql_url(
    base_url: &str,
    semantic_store_id: &str,
) -> Result<reqwest::Url, String> {
    let inference_root = build_ai_inference_root_url(base_url)?;
    inference_root
        .join(&format!(
            "20231130/semanticStores/{}/actions/generateSqlFromNl",
            semantic_store_id.trim()
        ))
        .map_err(|error| format!("Failed to build AI GenerateSqlFromNl URL: {error}"))
}

fn build_ai_inference_root_url(base_url: &str) -> Result<reqwest::Url, String> {
    let mut parsed = normalize_url_with_trailing_slash(base_url)?;
    let normalized_path = parsed.path().trim_end_matches('/').to_string();
    let trimmed_path = if normalized_path.ends_with("/openai/v1") {
        normalized_path.trim_end_matches("/openai/v1")
    } else {
        normalized_path.as_str()
    };
    let next_path = if trimmed_path.is_empty() {
        "/"
    } else {
        trimmed_path
    };
    parsed.set_path(next_path);
    if !parsed.path().ends_with('/') {
        let value = format!("{}/", parsed.path().trim_end_matches('/'));
        parsed.set_path(&value);
    }
    Ok(parsed)
}

fn build_ai_hosted_agent_invoke_url(
    endpoint_url: &str,
    invoke_path: &str,
) -> Result<reqwest::Url, String> {
    let parsed = normalize_url_with_trailing_slash(endpoint_url)?;
    let relative = if invoke_path.trim().is_empty() {
        "actions/invoke".to_string()
    } else {
        format!("actions/invoke/{}", invoke_path.trim().trim_matches('/'))
    };
    parsed
        .join(&relative)
        .map_err(|error| format!("Failed to build hosted agent invoke URL: {error}"))
}

fn build_ai_hosted_agent_token_url(domain_url: &str) -> Result<reqwest::Url, String> {
    let parsed = normalize_url_with_trailing_slash(domain_url)?;
    parsed
        .join("oauth2/v1/token")
        .map_err(|error| format!("Failed to build hosted agent token URL: {error}"))
}

fn normalize_url_with_trailing_slash(base_url: &str) -> Result<reqwest::Url, String> {
    let mut normalized = base_url.trim().to_string();
    if normalized.is_empty() {
        return Err("AI base URL is required".to_string());
    }
    if !normalized.ends_with('/') {
        normalized.push('/');
    }

    reqwest::Url::parse(&normalized).map_err(|_| "AI base URL must be a valid URL".to_string())
}

fn url_encode_component(input: &str) -> String {
    input
        .bytes()
        .flat_map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                vec![byte as char]
            }
            b' ' => vec!['+'],
            _ => format!("%{:02X}", byte).chars().collect::<Vec<_>>(),
        })
        .collect()
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

fn normalize_ai_send_error_message(is_timeout: bool, is_connect: bool, fallback: &str) -> String {
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

    if request.execution_target_kind == "oracle-hosted-agent" {
        if request
            .hosted_agent_profile_id
            .as_deref()
            .unwrap_or("")
            .trim()
            .is_empty()
        {
            return Err("Hosted agent profile is required".to_string());
        }
        if request.prompt.trim().is_empty() {
            return Err("AI request prompt is required".to_string());
        }
    }

    if request.knowledge_selection.kind == "oracle-structured-store"
        && request.knowledge_selection.mode.as_deref() == Some("sql-draft")
        && request.prompt.trim().is_empty()
    {
        return Err("NL2SQL request prompt is required".to_string());
    }

    if request.messages.is_empty() && request.prompt.trim().is_empty() {
        return Err("AI request must include at least one message".to_string());
    }

    validate_ai_messages(&request.messages)
}

fn validate_ai_messages(messages: &[AiRequestMessage]) -> Result<(), String> {
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

fn build_default_http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|error| format!("Failed to initialize AI HTTP client: {error}"))
}

fn build_responses_instruction_and_input(
    messages: &[AiRequestMessage],
    prompt: &str,
) -> (Option<String>, String) {
    let mut instructions = None;
    let mut input_parts = vec![];

    for message in messages {
        if message.role == "system" && instructions.is_none() {
            instructions = Some(message.content.trim().to_string());
            continue;
        }

        let content = message.content.trim();
        if content.is_empty() {
            continue;
        }

        input_parts.push(format!("{}:\n{}", message.role, content));
    }

    if input_parts.is_empty() && !prompt.trim().is_empty() {
        input_parts.push(prompt.trim().to_string());
    }

    (instructions, input_parts.join("\n\n"))
}

fn build_oci_responses_payload(
    config: &AiProviderConfig,
    request: &AiRunCompletionRequest,
) -> Result<(Value, Option<String>), String> {
    let (mut instructions, input) =
        build_responses_instruction_and_input(&request.messages, &request.prompt);
    let mut payload = json!({
        "model": config.model,
        "input": input,
        "stream": true,
    });
    let mut source_label = None;

    if request.knowledge_selection.kind == "oracle-unstructured-store" {
        let store = find_unstructured_store_registration(
            config,
            request.knowledge_selection.registration_id.as_deref(),
        )
        .ok_or_else(|| "Selected Oracle unstructured store was not found".to_string())?;
        source_label = Some(store.label.clone());
        instructions = Some(append_document_store_grounding_instructions(
            instructions.as_deref(),
            &store.label,
        ));
        payload["tools"] = json!([{
            "type": "file_search",
            "vector_store_ids": [store.vector_store_id.clone()]
        }]);
        payload["tool_choice"] = json!({
            "type": "file_search"
        });
        payload["include"] = json!(["file_search_call.results"]);
    }

    if let Some(instructions) = instructions.filter(|value| !value.trim().is_empty()) {
        payload["instructions"] = Value::String(instructions);
    }

    Ok((payload, source_label))
}

fn append_document_store_grounding_instructions(
    base_instructions: Option<&str>,
    store_label: &str,
) -> String {
    let grounding_rules = [
        format!(
            "When the document store \"{store_label}\" is selected, you must call the file_search tool before answering."
        ),
        "Base the answer only on information supported by the retrieved document-store results."
            .to_string(),
        "If retrieval returns no relevant results, explicitly say the selected document store does not contain enough information and do not answer from prior knowledge."
            .to_string(),
        "If the retrieved evidence is partial or conflicting, state that uncertainty and keep the answer limited to the retrieved support."
            .to_string(),
    ]
    .join("\n");

    match base_instructions
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        Some(existing) => format!("{existing}\n{grounding_rules}"),
        None => grounding_rules,
    }
}

fn find_unstructured_store_registration<'a>(
    config: &'a AiProviderConfig,
    registration_id: Option<&str>,
) -> Option<&'a AiOracleUnstructuredStoreRegistration> {
    let registration_id = registration_id?.trim();
    if registration_id.is_empty() {
        return None;
    }

    config
        .unstructured_stores
        .iter()
        .find(|store| store.id == registration_id)
}

fn find_structured_store_registration<'a>(
    config: &'a AiProviderConfig,
    registration_id: Option<&str>,
) -> Option<&'a AiOracleStructuredStoreRegistration> {
    let registration_id = registration_id?.trim();
    if registration_id.is_empty() {
        return None;
    }

    config
        .structured_stores
        .iter()
        .find(|store| store.id == registration_id)
}

fn find_hosted_agent_profile<'a>(
    config: &'a AiProviderConfig,
    profile_id: &str,
) -> Option<&'a AiOracleHostedAgentProfile> {
    let profile_id = profile_id.trim();
    if profile_id.is_empty() {
        return None;
    }

    config
        .hosted_agent_profiles
        .iter()
        .find(|profile| profile.id == profile_id)
}

fn build_hosted_agent_message(request: &AiRunCompletionRequest) -> String {
    if let Some(user_message) = request
        .messages
        .iter()
        .rev()
        .find(|message| message.role == "user")
    {
        if !user_message.content.trim().is_empty() {
            return user_message.content.trim().to_string();
        }
    }

    request.prompt.trim().to_string()
}

fn resolve_ai_response_content_type(
    request: &AiRunCompletionRequest,
    hosted_agent: bool,
) -> &'static str {
    if request.knowledge_selection.kind == "oracle-structured-store"
        && request.knowledge_selection.mode.as_deref() == Some("sql-draft")
    {
        return "sql";
    }

    if hosted_agent {
        return if request.output_target == "chat-only" {
            "text"
        } else {
            "markdown"
        };
    }

    if request.output_target == "chat-only" {
        "text"
    } else {
        "markdown"
    }
}

fn ensure_ai_response_contains_text(
    response: AiRunCompletionResponse,
) -> Result<AiRunCompletionResponse, String> {
    if response.text.trim().is_empty() {
        return Err("AI response content was empty or unsupported".to_string());
    }

    Ok(response)
}

fn finalize_document_store_response(
    mut response: AiRunCompletionResponse,
    request: &AiRunCompletionRequest,
    source_label: Option<String>,
    observation: &AiFileSearchObservation,
) -> Result<AiRunCompletionResponse, String> {
    if !observation.has_calls() {
        return Err(
            "Selected document store did not execute retrieval. Check the store configuration and try again."
                .to_string(),
        );
    }

    let result_count = observation.total_result_count();
    let query = observation.first_query();

    if result_count == Some(0) {
        response.text = build_document_store_no_results_text(request);
        response.warning_text = Some(
            "Retrieval completed, but the selected document store returned no relevant passages."
                .to_string(),
        );
    }

    response.source_label = source_label.clone();
    response.retrieval_executed = true;
    response.retrieval_query = query.clone();
    response.retrieval_results = observation.result_previews();
    response.retrieval_result_count = result_count;
    response.explanation_text = Some(build_document_store_grounding_explanation(
        source_label.as_deref(),
        query.as_deref(),
        result_count,
    ));

    ensure_ai_response_contains_text(response)
}

fn build_document_store_grounding_explanation(
    source_label: Option<&str>,
    query: Option<&str>,
    result_count: Option<usize>,
) -> String {
    let mut parts = vec![match source_label {
        Some(label) => format!("Generated with Oracle file search over \"{label}\"."),
        None => "Generated with Oracle file search over the selected document store.".to_string(),
    }];

    match result_count {
        Some(0) => parts.push("Retrieval returned no relevant passages.".to_string()),
        Some(1) => parts.push("Retrieval returned 1 passage.".to_string()),
        Some(count) => parts.push(format!("Retrieval returned {count} passages.")),
        None => parts.push("Retrieval executed before the answer was generated.".to_string()),
    }

    if let Some(query) = query.map(str::trim).filter(|value| !value.is_empty()) {
        parts.push(format!("Retrieved with query: \"{query}\"."));
    }

    parts.join(" ")
}

fn build_document_store_no_results_text(request: &AiRunCompletionRequest) -> String {
    match detect_request_language(request) {
        "ja" => "選択したドキュメントストアから、この質問に答えるための関連情報を見つけられませんでした。質問を具体化するか、ストアの内容を確認してください。".to_string(),
        "zh" => "在所选文档库中没有检索到足够的相关信息，无法仅基于检索结果回答这个问题。请细化问题或检查文档库内容。".to_string(),
        _ => "I couldn't find enough relevant information in the selected document store to answer this request based only on retrieved results. Please refine the question or review the store contents.".to_string(),
    }
}

fn detect_request_language(request: &AiRunCompletionRequest) -> &'static str {
    let sample = request
        .messages
        .iter()
        .rev()
        .find(|message| message.role == "user")
        .map(|message| message.content.trim())
        .filter(|message| !message.is_empty())
        .unwrap_or_else(|| request.prompt.trim());

    if sample
        .chars()
        .any(|character| ('\u{3040}'..='\u{30ff}').contains(&character))
    {
        return "ja";
    }

    if sample
        .chars()
        .any(|character| ('\u{4e00}'..='\u{9fff}').contains(&character))
    {
        return "zh";
    }

    "en"
}

fn extract_nl2sql_sql_text(response_json: &Value) -> Option<String> {
    response_json
        .get("generatedSql")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .or_else(|| {
            response_json
                .get("generated_sql")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
        })
        .or_else(|| {
            response_json
                .get("sql")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
        })
        .or_else(|| {
            response_json
                .get("statement")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
        })
        .or_else(|| {
            response_json
                .get("data")
                .and_then(|data| data.get("generatedSql"))
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
        })
}

fn extract_nl2sql_explanation(response_json: &Value) -> Option<String> {
    response_json
        .get("explanation")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .or_else(|| {
            response_json
                .get("summary")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
        })
}

fn extract_nl2sql_warning(response_json: &Value) -> Option<String> {
    response_json
        .get("warning")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .or_else(|| {
            response_json
                .get("warnings")
                .and_then(Value::as_array)
                .map(|warnings| {
                    warnings
                        .iter()
                        .filter_map(Value::as_str)
                        .map(str::trim)
                        .filter(|value| !value.is_empty())
                        .collect::<Vec<_>>()
                        .join("\n")
                })
        })
        .filter(|value| !value.is_empty())
}

fn extract_hosted_agent_reply_text(response_json: &Value) -> Option<String> {
    response_json
        .get("reply")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .or_else(|| {
            response_json
                .get("text")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
        })
        .or_else(|| response_json.get("content").and_then(extract_content_text))
        .or_else(|| {
            response_json
                .get("data")
                .and_then(|data| data.get("reply"))
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
        })
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
        thread_id: None,
        content_type: "markdown".to_string(),
        explanation_text: None,
        warning_text: None,
        source_label: None,
        retrieval_executed: false,
        retrieval_query: None,
        retrieval_results: vec![],
        retrieval_result_count: None,
    })
}

async fn read_ai_streaming_completion_response<R: Runtime>(
    app: AppHandle<R>,
    request_id: &str,
    mut response: reqwest::Response,
) -> Result<(AiRunCompletionResponse, AiFileSearchObservation), String> {
    let mut event_buffer = String::new();
    let mut text = String::new();
    let mut finish_reason = None;
    let mut model = None;
    let mut provider_request_id = None;
    let mut thread_id = None;
    let mut stream_finished = false;
    let mut file_search_observation = AiFileSearchObservation::default();

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
                &mut thread_id,
                &mut file_search_observation,
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
            &mut thread_id,
            &mut file_search_observation,
        )?;
    }

    Ok((
        AiRunCompletionResponse {
            text,
            finish_reason,
            model,
            request_id: provider_request_id.or_else(|| Some(request_id.to_string())),
            thread_id,
            content_type: "markdown".to_string(),
            explanation_text: None,
            warning_text: None,
            source_label: None,
            retrieval_executed: false,
            retrieval_query: None,
            retrieval_results: vec![],
            retrieval_result_count: None,
        },
        file_search_observation,
    ))
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
    thread_id: &mut Option<String>,
    file_search_observation: &mut AiFileSearchObservation,
) -> Result<bool, String> {
    let data = collect_ai_sse_data(event);
    if data.is_empty() {
        return Ok(false);
    }
    if data == "[DONE]" {
        return Ok(true);
    }

    let response_json: Value = match serde_json::from_str(&data) {
        Ok(value) => value,
        Err(_) => {
            text.push_str(&data);
            emit_ai_stream_chunk(app, request_id, &data)?;
            return Ok(false);
        }
    };

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
    if thread_id.is_none() {
        *thread_id = response_json
            .get("thread_id")
            .and_then(Value::as_str)
            .or_else(|| response_json.get("threadId").and_then(Value::as_str))
            .map(str::to_string);
    }
    collect_ai_file_search_observation(&response_json, file_search_observation);

    let chunk_finish_reason = extract_ai_stream_finish_reason(&response_json);
    if let Some(ref reason) = chunk_finish_reason {
        *finish_reason = Some(reason.clone());
    }

    if let Some(chunk) = extract_ai_stream_chunk(&response_json, !text.is_empty()) {
        text.push_str(&chunk);
        emit_ai_stream_chunk(app, request_id, &chunk)?;
    }

    if chunk_finish_reason.is_some() {
        return Ok(true);
    }

    Ok(false)
}

fn collect_ai_file_search_observation(
    response_json: &Value,
    observation: &mut AiFileSearchObservation,
) {
    match response_json {
        Value::Array(items) => {
            for item in items {
                collect_ai_file_search_observation(item, observation);
            }
        }
        Value::Object(map) => {
            if map.get("type").and_then(Value::as_str) == Some("file_search_call") {
                let call_id = map
                    .get("id")
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .unwrap_or("file_search_call");
                let entry = observation
                    .calls_by_id
                    .entry(call_id.to_string())
                    .or_default();

                if let Some(status) = map
                    .get("status")
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                {
                    entry.status = Some(status.to_string());
                }

                let mut queries = map
                    .get("queries")
                    .and_then(Value::as_array)
                    .map(|values| {
                        values
                            .iter()
                            .filter_map(Value::as_str)
                            .map(str::trim)
                            .filter(|value| !value.is_empty())
                            .map(str::to_string)
                            .collect::<Vec<_>>()
                    })
                    .unwrap_or_default();
                if queries.is_empty() {
                    if let Some(query) = map
                        .get("query")
                        .and_then(Value::as_str)
                        .map(str::trim)
                        .filter(|value| !value.is_empty())
                    {
                        queries.push(query.to_string());
                    }
                }
                for query in queries {
                    if !entry.queries.iter().any(|existing| existing == &query) {
                        entry.queries.push(query.clone());
                    }
                    if !observation
                        .ordered_queries
                        .iter()
                        .any(|existing| existing == &query)
                    {
                        observation.ordered_queries.push(query.clone());
                    }
                }

                if let Some(results) = map.get("results") {
                    entry.result_count = Some(resolve_ai_file_search_result_count(results));
                    collect_ai_file_search_result_previews(results, observation);
                } else if let Some(results) = map.get("search_results") {
                    entry.result_count = Some(resolve_ai_file_search_result_count(results));
                    collect_ai_file_search_result_previews(results, observation);
                }
            }

            for nested in map.values() {
                collect_ai_file_search_observation(nested, observation);
            }
        }
        _ => {}
    }
}

fn resolve_ai_file_search_result_count(results: &Value) -> usize {
    results.as_array().map(|items| items.len()).unwrap_or(0)
}

fn collect_ai_file_search_result_previews(
    results: &Value,
    observation: &mut AiFileSearchObservation,
) {
    let Some(items) = results.as_array() else {
        return;
    };

    for (index, item) in items.iter().enumerate() {
        let Some(preview) = extract_ai_file_search_result_preview(item, index) else {
            continue;
        };

        if !observation
            .result_previews
            .iter()
            .any(|existing| existing == &preview)
        {
            observation.result_previews.push(preview);
        }
    }
}

fn extract_ai_file_search_result_preview(
    value: &Value,
    index: usize,
) -> Option<AiRetrievalResultPreview> {
    let map = value.as_object()?;
    let title = read_trimmed_json_string_field(
        map,
        &[
            "filename",
            "file_name",
            "title",
            "document_name",
            "path",
            "source",
            "id",
        ],
    )
    .map(str::to_string)
    .unwrap_or_else(|| format!("Result {}", index + 1));
    let detail = read_trimmed_json_string_field(
        map,
        &["path", "document_path", "source", "document_id", "id"],
    )
    .filter(|detail| *detail != title)
    .map(str::to_string);
    let snippet = extract_ai_file_search_result_snippet(map);

    if title.trim().is_empty() && detail.is_none() && snippet.is_none() {
        return None;
    }

    Some(AiRetrievalResultPreview {
        title,
        detail,
        snippet,
    })
}

fn extract_ai_file_search_result_snippet(map: &serde_json::Map<String, Value>) -> Option<String> {
    let direct_snippet = read_trimmed_json_string_field(
        map,
        &[
            "text",
            "snippet",
            "excerpt",
            "summary",
            "chunk_text",
            "page_content",
        ],
    )
    .map(str::to_string)
    .or_else(|| map.get("content").and_then(extract_content_text));

    direct_snippet
        .map(|value| truncate_ai_preview_text(&value, 220))
        .filter(|value| !value.is_empty())
}

fn read_trimmed_json_string_field<'a>(
    map: &'a serde_json::Map<String, Value>,
    keys: &[&str],
) -> Option<&'a str> {
    for key in keys {
        let value = map
            .get(*key)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty());
        if value.is_some() {
            return value;
        }
    }

    None
}

fn truncate_ai_preview_text(value: &str, max_chars: usize) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    let truncated = trimmed.chars().take(max_chars).collect::<String>();
    if trimmed.chars().count() <= max_chars {
        truncated
    } else {
        format!("{truncated}...")
    }
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
    let from_choices = response_json
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| {
            choice
                .get("finish_reason")
                .and_then(Value::as_str)
                .or_else(|| choice.get("finishReason").and_then(Value::as_str))
        })
        .map(str::to_string);

    if from_choices.is_some() {
        return from_choices;
    }

    if let Some(event_type) = response_json.get("type").and_then(Value::as_str) {
        match event_type {
            "response.completed" => return Some("stop".to_string()),
            "response.failed" => return Some("error".to_string()),
            _ => {}
        }
    }

    if response_json
        .get("done")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        return Some("stop".to_string());
    }

    response_json
        .get("finishReason")
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn extract_ai_stream_chunk(response_json: &Value, has_buffered_text: bool) -> Option<String> {
    if let Some(event_type) = response_json.get("type").and_then(Value::as_str) {
        return extract_ai_typed_stream_chunk(event_type, response_json, has_buffered_text);
    }

    if let Some(delta) = response_json
        .get("delta")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
    {
        return Some(delta.to_string());
    }

    if let Some(reply) = response_json
        .get("reply")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
    {
        return Some(reply.to_string());
    }

    let first_choice = response_json
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first());

    first_choice
        .and_then(|choice| {
            choice
                .get("delta")
                .and_then(|delta| delta.get("content"))
                .and_then(extract_content_text)
                .or_else(|| {
                    choice
                        .get("message")
                        .and_then(|message| message.get("content"))
                        .and_then(extract_content_text)
                })
                .or_else(|| {
                    choice
                        .get("text")
                        .and_then(Value::as_str)
                        .filter(|value| !value.trim().is_empty())
                        .map(str::to_string)
                })
        })
        .or_else(|| extract_ai_output_array_text(response_json.get("output")))
}

fn extract_ai_typed_stream_chunk(
    event_type: &str,
    response_json: &Value,
    has_buffered_text: bool,
) -> Option<String> {
    match event_type {
        "response.output_text.delta" => response_json
            .get("delta")
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .map(str::to_string),
        "response.output_text.done" => {
            if has_buffered_text {
                None
            } else {
                response_json
                    .get("text")
                    .and_then(Value::as_str)
                    .filter(|value| !value.trim().is_empty())
                    .map(str::to_string)
            }
        }
        "response.content_part.done" => {
            if has_buffered_text {
                None
            } else {
                response_json
                    .get("part")
                    .and_then(extract_ai_output_item_text)
            }
        }
        "response.output_item.done" => {
            if has_buffered_text {
                None
            } else {
                response_json
                    .get("item")
                    .and_then(extract_ai_output_item_text)
            }
        }
        "response.completed" => {
            if has_buffered_text {
                None
            } else {
                extract_ai_output_array_text(response_json.get("output"))
            }
        }
        _ => None,
    }
}

fn extract_ai_output_array_text(value: Option<&Value>) -> Option<String> {
    value
        .and_then(Value::as_array)
        .and_then(|output| output.first())
        .and_then(extract_ai_output_item_text)
}

fn extract_ai_output_item_text(value: &Value) -> Option<String> {
    value
        .get("content")
        .and_then(extract_content_text)
        .or_else(|| {
            value
                .get("text")
                .and_then(Value::as_str)
                .filter(|text| !text.trim().is_empty())
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

fn unix_timestamp_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[cfg(test)]
mod tests {
    use super::apply_ai_project_header;
    use super::build_ai_chat_completions_url;
    use super::build_ai_generate_sql_url;
    use super::build_ai_hosted_agent_invoke_url;
    use super::build_ai_responses_url;
    use super::build_oci_responses_payload;
    use super::collect_ai_file_search_observation;
    use super::collect_ai_sse_data;
    use super::extract_ai_completion_response;
    use super::extract_ai_stream_chunk;
    use super::extract_ai_stream_finish_reason;
    use super::extract_nl2sql_sql_text;
    use super::finalize_document_store_response;
    use super::normalize_ai_provider_config;
    use super::normalize_ai_send_error_message;
    use super::normalize_ai_sse_buffer;
    use super::normalize_ai_status_error_message;
    use super::take_next_ai_sse_event;
    use super::AiFileSearchCallObservation;
    use super::AiFileSearchObservation;
    use super::AiKnowledgeSelection;
    use super::AiOracleUnstructuredStoreRegistration;
    use super::AiProviderConfig;
    use super::AiRequestMessage;
    use super::AiRetrievalResultPreview;
    use super::AiRunCompletionRequest;
    use super::AiRunCompletionResponse;
    use super::AI_PROVIDER_PROJECT_HEADER;
    use reqwest::StatusCode;
    use serde_json::{json, Value};
    use std::collections::HashMap;

    fn sample_unstructured_provider_config() -> AiProviderConfig {
        AiProviderConfig {
            provider: "oci-responses".to_string(),
            base_url: "https://example.com/openai/v1".to_string(),
            model: "gpt-test".to_string(),
            project: "project-123".to_string(),
            unstructured_stores: vec![AiOracleUnstructuredStoreRegistration {
                id: "docs-default".to_string(),
                label: "Product Docs".to_string(),
                vector_store_id: "vs_docs_123".to_string(),
                description: "Product documentation".to_string(),
                enabled: true,
                is_default: true,
            }],
            structured_stores: vec![],
            hosted_agent_profiles: vec![],
        }
    }

    fn sample_unstructured_request(prompt: &str) -> AiRunCompletionRequest {
        AiRunCompletionRequest {
            request_id: "req_123".to_string(),
            intent: "ask".to_string(),
            scope: "document".to_string(),
            output_target: "chat-only".to_string(),
            prompt: prompt.to_string(),
            messages: vec![
                AiRequestMessage {
                    role: "system".to_string(),
                    content: "System rules".to_string(),
                },
                AiRequestMessage {
                    role: "user".to_string(),
                    content: prompt.to_string(),
                },
            ],
            execution_target_kind: "direct-provider".to_string(),
            invocation_capability: "rag-unstructured".to_string(),
            knowledge_selection: AiKnowledgeSelection {
                kind: "oracle-unstructured-store".to_string(),
                registration_id: Some("docs-default".to_string()),
                mode: None,
            },
            thread_id: None,
            hosted_agent_profile_id: None,
        }
    }

    fn sample_stream_response(text: &str) -> AiRunCompletionResponse {
        AiRunCompletionResponse {
            text: text.to_string(),
            finish_reason: Some("stop".to_string()),
            model: Some("gpt-test".to_string()),
            request_id: Some("resp_123".to_string()),
            thread_id: None,
            content_type: "text".to_string(),
            explanation_text: None,
            warning_text: None,
            source_label: None,
            retrieval_executed: false,
            retrieval_query: None,
            retrieval_results: vec![],
            retrieval_result_count: None,
        }
    }

    #[test]
    fn normalize_ai_provider_config_trims_and_validates_fields() {
        let config = normalize_ai_provider_config(AiProviderConfig {
            provider: "oci-responses".to_string(),
            base_url: "https://example.com/openai/v1".to_string(),
            model: " gpt-test ".to_string(),
            project: "  project-123  ".to_string(),
            unstructured_stores: vec![],
            structured_stores: vec![],
            hosted_agent_profiles: vec![],
        })
        .expect("normalize provider config");

        assert_eq!(config.provider, "oci-responses");
        assert_eq!(config.base_url, "https://example.com/openai/v1");
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
    fn build_ai_responses_url_appends_responses_path() {
        let url =
            build_ai_responses_url("https://example.com/openai/v1").expect("build responses url");
        assert_eq!(url.as_str(), "https://example.com/openai/v1/responses");
    }

    #[test]
    fn build_ai_generate_sql_url_uses_inference_root() {
        let url = build_ai_generate_sql_url("https://example.com/openai/v1", "semantic-store-1")
            .expect("build generate sql url");
        assert_eq!(
            url.as_str(),
            "https://example.com/20231130/semanticStores/semantic-store-1/actions/generateSqlFromNl"
        );
    }

    #[test]
    fn build_ai_hosted_agent_invoke_url_supports_optional_invoke_path() {
        let url = build_ai_hosted_agent_invoke_url("https://agent.example.com/base", "chat")
            .expect("build hosted invoke url");
        assert_eq!(
            url.as_str(),
            "https://agent.example.com/base/actions/invoke/chat"
        );
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
        assert_eq!(response.content_type, "markdown");
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
    fn extract_nl2sql_sql_text_reads_generated_sql_variants() {
        assert_eq!(
            extract_nl2sql_sql_text(&json!({ "generatedSql": "SELECT 1" })).as_deref(),
            Some("SELECT 1")
        );
        assert_eq!(
            extract_nl2sql_sql_text(&json!({ "sql": "SELECT 2" })).as_deref(),
            Some("SELECT 2")
        );
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
    fn extract_ai_stream_chunk_supports_chat_and_responses_events() {
        assert_eq!(
            extract_ai_stream_chunk(
                &json!({
                    "choices": [{
                        "delta": { "content": "Hello " },
                        "finish_reason": null
                    }]
                }),
                false
            )
            .as_deref(),
            Some("Hello ")
        );

        assert_eq!(
            extract_ai_stream_chunk(
                &json!({
                    "type": "response.output_text.delta",
                    "delta": "world"
                }),
                false
            )
            .as_deref(),
            Some("world")
        );
    }

    #[test]
    fn extract_ai_stream_chunk_ignores_tool_argument_deltas_and_terminal_replays() {
        assert_eq!(
            extract_ai_stream_chunk(
                &json!({
                    "type": "response.function_call_arguments.delta",
                    "delta": "{\"query\":\"Who is Mei's sister?\"}"
                }),
                false
            ),
            None
        );

        assert_eq!(
            extract_ai_stream_chunk(
                &json!({
                    "type": "response.output_text.done",
                    "text": "Mei's sister is Satsuki."
                }),
                true
            ),
            None
        );

        assert_eq!(
            extract_ai_stream_chunk(
                &json!({
                    "type": "response.completed",
                    "output": [{
                        "content": [{ "text": "Mei's sister is Satsuki." }]
                    }]
                }),
                true
            ),
            None
        );
    }

    #[test]
    fn extract_ai_stream_finish_reason_reads_terminal_choice_metadata() {
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

        assert_eq!(
            extract_ai_stream_finish_reason(&json!({
                "type": "response.completed"
            }))
            .as_deref(),
            Some("stop")
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
        assert!(
            normalize_ai_send_error_message(false, false, "boom").starts_with("AI request failed:")
        );
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

    #[test]
    fn build_oci_responses_payload_for_document_store_forces_file_search_and_includes_results() {
        let config = sample_unstructured_provider_config();
        let request = sample_unstructured_request("What's New for Oracle AI Vector Search?");

        let (payload, source_label) =
            build_oci_responses_payload(&config, &request).expect("build payload");

        assert_eq!(source_label.as_deref(), Some("Product Docs"));
        assert_eq!(
            payload
                .get("tool_choice")
                .and_then(|value| value.get("type"))
                .and_then(Value::as_str),
            Some("file_search")
        );
        assert_eq!(
            payload
                .get("include")
                .and_then(Value::as_array)
                .and_then(|items| items.first())
                .and_then(Value::as_str),
            Some("file_search_call.results")
        );
        assert_eq!(
            payload
                .get("tools")
                .and_then(Value::as_array)
                .and_then(|items| items.first())
                .and_then(|tool| tool.get("vector_store_ids"))
                .and_then(Value::as_array)
                .and_then(|items| items.first())
                .and_then(Value::as_str),
            Some("vs_docs_123")
        );

        let instructions = payload
            .get("instructions")
            .and_then(Value::as_str)
            .expect("document-store instructions");
        assert!(instructions.contains("System rules"));
        assert!(instructions.contains("must call the file_search tool before answering"));
        assert!(instructions.contains("do not answer from prior knowledge"));
    }

    #[test]
    fn collect_ai_file_search_observation_reads_nested_completed_response_items() {
        let mut observation = AiFileSearchObservation::default();

        collect_ai_file_search_observation(
            &json!({
                "type": "response.completed",
                "response": {
                    "output": [
                        {
                            "type": "file_search_call",
                            "id": "fs_1",
                            "status": "completed",
                            "queries": ["oracle ai vector search"],
                            "results": [
                                { "filename": "whats-new.md", "text": "Vector search now supports richer passage retrieval." },
                                { "filename": "release-notes.md", "text": "Release notes highlight ranking improvements." }
                            ]
                        },
                        {
                            "type": "message",
                            "id": "msg_1",
                            "status": "completed",
                            "role": "assistant",
                            "content": [
                                { "type": "output_text", "text": "Answer" }
                            ]
                        }
                    ]
                }
            }),
            &mut observation,
        );

        assert!(observation.has_calls());
        assert_eq!(observation.total_result_count(), Some(2));
        assert_eq!(
            observation.first_query().as_deref(),
            Some("oracle ai vector search")
        );
        assert_eq!(
            observation
                .calls_by_id
                .get("fs_1")
                .and_then(|call| call.status.as_deref()),
            Some("completed")
        );
        assert_eq!(observation.result_previews.len(), 2);
        assert_eq!(observation.result_previews[0].title, "whats-new.md");
        assert_eq!(
            observation.result_previews[0].snippet.as_deref(),
            Some("Vector search now supports richer passage retrieval.")
        );
    }

    #[test]
    fn finalize_document_store_response_replaces_answer_when_results_are_empty() {
        let request = sample_unstructured_request("この文書ストアを使って最新情報を教えてください");
        let response = sample_stream_response("Hallucinated answer");
        let observation = AiFileSearchObservation {
            calls_by_id: HashMap::from([(
                "fs_1".to_string(),
                AiFileSearchCallObservation {
                    status: Some("completed".to_string()),
                    queries: vec!["oracle ai vector search".to_string()],
                    result_count: Some(0),
                },
            )]),
            ordered_queries: vec!["oracle ai vector search".to_string()],
            result_previews: vec![],
        };

        let finalized = finalize_document_store_response(
            response,
            &request,
            Some("Product Docs".to_string()),
            &observation,
        )
        .expect("finalize document-store response");

        assert!(finalized.text.contains("関連情報を見つけられませんでした"));
        assert_eq!(finalized.source_label.as_deref(), Some("Product Docs"));
        assert_eq!(
            finalized.retrieval_query.as_deref(),
            Some("oracle ai vector search")
        );
        assert_eq!(finalized.retrieval_result_count, Some(0));
        assert!(finalized.retrieval_results.is_empty());
        assert_eq!(
            finalized.warning_text.as_deref(),
            Some(
                "Retrieval completed, but the selected document store returned no relevant passages."
            )
        );
        assert!(finalized
            .explanation_text
            .as_deref()
            .unwrap_or_default()
            .contains("Retrieval returned no relevant passages."));
    }

    #[test]
    fn finalize_document_store_response_exposes_retrieval_query_and_results() {
        let request = sample_unstructured_request("メイのあねはだれですか？");
        let response = sample_stream_response("メイの姉はサツキです。");
        let observation = AiFileSearchObservation {
            calls_by_id: HashMap::from([(
                "fs_1".to_string(),
                AiFileSearchCallObservation {
                    status: Some("completed".to_string()),
                    queries: vec!["Who is Mei's sister?".to_string()],
                    result_count: Some(1),
                },
            )]),
            ordered_queries: vec!["Who is Mei's sister?".to_string()],
            result_previews: vec![AiRetrievalResultPreview {
                title: "totoro-character-guide.md".to_string(),
                detail: Some("references/totoro-character-guide.md".to_string()),
                snippet: Some(
                    "Satsuki is Mei's older sister and acts as her guardian.".to_string(),
                ),
            }],
        };

        let finalized = finalize_document_store_response(
            response,
            &request,
            Some("Product Docs".to_string()),
            &observation,
        )
        .expect("finalize document-store response");

        assert_eq!(finalized.text, "メイの姉はサツキです。");
        assert_eq!(
            finalized.retrieval_query.as_deref(),
            Some("Who is Mei's sister?")
        );
        assert_eq!(finalized.retrieval_result_count, Some(1));
        assert_eq!(finalized.retrieval_results.len(), 1);
        assert_eq!(
            finalized.retrieval_results[0].title,
            "totoro-character-guide.md"
        );
    }

    #[test]
    fn finalize_document_store_response_keeps_query_for_insertable_markdown_outputs() {
        let mut request = sample_unstructured_request("Draft a paragraph about Mei.");
        request.output_target = "insert-below".to_string();
        let response = sample_stream_response("Mei's sister is Satsuki.");
        let observation = AiFileSearchObservation {
            calls_by_id: HashMap::from([(
                "fs_1".to_string(),
                AiFileSearchCallObservation {
                    status: Some("completed".to_string()),
                    queries: vec!["Who is Mei's sister?".to_string()],
                    result_count: Some(1),
                },
            )]),
            ordered_queries: vec!["Who is Mei's sister?".to_string()],
            result_previews: vec![],
        };

        let finalized = finalize_document_store_response(
            response,
            &request,
            Some("Product Docs".to_string()),
            &observation,
        )
        .expect("finalize document-store response");

        assert_eq!(finalized.text, "Mei's sister is Satsuki.");
        assert_eq!(
            finalized.retrieval_query.as_deref(),
            Some("Who is Mei's sister?")
        );
        assert_eq!(finalized.retrieval_result_count, Some(1));
    }
}
