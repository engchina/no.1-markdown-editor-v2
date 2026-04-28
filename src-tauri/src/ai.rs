use base64::{
    engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD},
    Engine as _,
};
use chrono::Utc;
use keyring::Entry;
use reqwest::header::{ACCEPT, CONTENT_TYPE, USER_AGENT};
use reqwest::StatusCode;
use ring::rand::SystemRandom;
use ring::signature::{RsaKeyPair, RSA_PKCS1_SHA256};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::{ChildStderr, Command, ExitStatus, Stdio};
use std::sync::Mutex;
use std::thread::{self, JoinHandle};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tokio::task::AbortHandle;

const AI_PROVIDER_CONFIG_FILE: &str = "ai-provider.json";
const AI_KEYRING_SERVICE: &str = "com.no1.markdown-editor.ai";
const AI_DIRECT_PROVIDER_ACCOUNT: &str = "direct-provider";
const AI_OCI_KEY_FILE_PASSPHRASE_ACCOUNT_PREFIX: &str = "oci-key-file-passphrase:";
const AI_HOSTED_AGENT_ACCOUNT_PREFIX: &str = "hosted-agent:";
const AI_PROVIDER_USER_AGENT: &str = "No.1 Markdown Editor AI Client";
const AI_PROVIDER_PROJECT_HEADER: &str = "OpenAI-Project";
const AI_COMPLETION_STREAM_EVENT: &str = "ai:completion-stream";
const AI_OAUTH_REFRESH_MARGIN_SECONDS: u64 = 30;
const DEFAULT_OCI_IAM_CONFIG_FILE: &str = "~/.oci_iam/config";
const MCP_STDERR_MAX_CHARS: usize = 4000;

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
    pub compartment_id: String,
    #[serde(default)]
    pub store_ocid: String,
    #[serde(default)]
    pub oci_auth_profile_id: Option<String>,
    #[serde(default)]
    pub region_override: String,
    #[serde(default)]
    pub schema_name: String,
    pub description: String,
    pub enabled: bool,
    #[serde(default)]
    pub is_default: bool,
    pub default_mode: String,
    #[serde(default)]
    pub execution_profile_id: Option<String>,
    #[serde(default)]
    pub enrichment_default_mode: String,
    #[serde(default)]
    pub enrichment_object_names: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiOracleOCIAuthProfile {
    pub id: String,
    pub label: String,
    #[serde(default)]
    pub config_file: String,
    #[serde(default)]
    pub profile: String,
    #[serde(default)]
    pub region: String,
    #[serde(default)]
    pub tenancy: String,
    #[serde(default)]
    pub user: String,
    #[serde(default)]
    pub fingerprint: String,
    #[serde(default)]
    pub key_file: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiOracleMCPExecutionProfile {
    pub id: String,
    pub label: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub config_json: String,
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub server_url: String,
    pub transport: String,
    #[serde(default)]
    pub tool_name: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiOracleHostedAgentProfile {
    pub id: String,
    pub label: String,
    #[serde(default)]
    pub oci_region: String,
    #[serde(default)]
    pub hosted_application_ocid: String,
    #[serde(default)]
    pub api_version: String,
    #[serde(default)]
    pub api_action: String,
    pub domain_url: String,
    pub client_id: String,
    #[serde(default)]
    pub scope: String,
    pub transport: String,
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
    pub oci_auth_profiles: Vec<AiOracleOCIAuthProfile>,
    #[serde(default)]
    pub unstructured_stores: Vec<AiOracleUnstructuredStoreRegistration>,
    #[serde(default)]
    pub structured_stores: Vec<AiOracleStructuredStoreRegistration>,
    #[serde(default)]
    pub mcp_execution_profiles: Vec<AiOracleMCPExecutionProfile>,
    #[serde(default)]
    pub hosted_agent_profiles: Vec<AiOracleHostedAgentProfile>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderState {
    pub config: Option<AiProviderConfig>,
    pub has_api_key: bool,
    pub storage_kind: String,
    pub has_oci_key_file_passphrase_by_id: HashMap<String, bool>,
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
    #[serde(default)]
    pub generated_sql: Option<String>,
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
    #[serde(default)]
    pub generated_sql: Option<String>,
    #[serde(default)]
    pub structured_execution_status: Option<String>,
    #[serde(default)]
    pub structured_execution_tool_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiListEnrichmentJobsRequest {
    pub structured_store_id: String,
    #[serde(default)]
    pub compartment_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiEnrichmentJobRequest {
    pub structured_store_id: String,
    #[serde(default)]
    pub mode: String,
    #[serde(default)]
    pub schema_name: String,
    #[serde(default)]
    pub database_objects: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiEnrichmentJobActionRequest {
    pub structured_store_id: String,
    pub enrichment_job_id: String,
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
    let has_oci_key_file_passphrase_by_id = match config.as_ref() {
        Some(config) if config.provider == "oci-responses" => config
            .oci_auth_profiles
            .iter()
            .map(|profile| {
                Ok((
                    profile.id.clone(),
                    has_oci_key_file_passphrase(&profile.id)?,
                ))
            })
            .collect::<Result<HashMap<_, _>, String>>()?,
        _ => HashMap::new(),
    };
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
        has_oci_key_file_passphrase_by_id,
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
pub fn ai_store_oci_key_file_passphrase(
    profile_id: String,
    passphrase: String,
) -> Result<(), String> {
    let trimmed_profile_id = profile_id.trim();
    if trimmed_profile_id.is_empty() {
        return Err("OCI auth profile id is required".to_string());
    }

    let trimmed_passphrase = passphrase.trim();
    if trimmed_passphrase.is_empty() {
        return Err("OCI key file passphrase cannot be empty".to_string());
    }

    ai_keyring_entry(&oci_key_file_passphrase_account(trimmed_profile_id))?
        .set_password(trimmed_passphrase)
        .map_err(|error| format!("Failed to store OCI key file passphrase: {error}"))
}

#[tauri::command]
pub fn ai_clear_oci_key_file_passphrase(profile_id: String) -> Result<(), String> {
    let trimmed_profile_id = profile_id.trim();
    if trimmed_profile_id.is_empty() {
        return Err("OCI auth profile id is required".to_string());
    }

    match ai_keyring_entry(&oci_key_file_passphrase_account(trimmed_profile_id))?
        .delete_credential()
    {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("Failed to clear OCI key file passphrase: {error}")),
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

#[tauri::command]
pub async fn ai_list_enrichment_jobs<R: Runtime>(
    app: AppHandle<R>,
    request: AiListEnrichmentJobsRequest,
) -> Result<Value, String> {
    let config = read_ai_provider_config(&app)?
        .ok_or_else(|| "AI provider settings are not configured".to_string())?;
    let store = find_structured_store_registration(&config, Some(&request.structured_store_id))
        .ok_or_else(|| "Selected Oracle structured store was not found".to_string())?;
    let url = build_ai_enrichment_jobs_url(&config, store, Some(&request.compartment_id))?;
    let response = build_default_http_client()?
        .get(url.clone())
        .header(USER_AGENT, AI_PROVIDER_USER_AGENT);
    let response = apply_oci_iam_signature(response, &config, store, "get", &url, "")?
        .send()
        .await
        .map_err(|error| {
            normalize_ai_send_error_message(
                error.is_timeout(),
                error.is_connect(),
                &error.to_string(),
            )
        })?;
    let response = ensure_ai_success_status(response, "ai:list-enrichment-jobs").await?;
    parse_json_response(response).await
}

#[tauri::command]
pub async fn ai_generate_enrichment_job<R: Runtime>(
    app: AppHandle<R>,
    request: AiEnrichmentJobRequest,
) -> Result<Value, String> {
    let config = read_ai_provider_config(&app)?
        .ok_or_else(|| "AI provider settings are not configured".to_string())?;
    let store = find_structured_store_registration(&config, Some(&request.structured_store_id))
        .ok_or_else(|| "Selected Oracle structured store was not found".to_string())?;
    let url = build_ai_generate_enrichment_job_url(&config, store)?;
    let payload = build_enrichment_job_payload(store, &request)?;
    let body = payload.to_string();
    let response = build_default_http_client()?
        .post(url.clone())
        .header(USER_AGENT, AI_PROVIDER_USER_AGENT)
        .header(CONTENT_TYPE, "application/json")
        .body(body.clone());
    let response = apply_oci_iam_signature(response, &config, store, "post", &url, &body)?
        .send()
        .await
        .map_err(|error| {
            normalize_ai_send_error_message(
                error.is_timeout(),
                error.is_connect(),
                &error.to_string(),
            )
        })?;
    let response = ensure_ai_success_status(response, "ai:generate-enrichment-job").await?;
    parse_json_response(response).await
}

#[tauri::command]
pub async fn ai_get_enrichment_job<R: Runtime>(
    app: AppHandle<R>,
    request: AiEnrichmentJobActionRequest,
) -> Result<Value, String> {
    let config = read_ai_provider_config(&app)?
        .ok_or_else(|| "AI provider settings are not configured".to_string())?;
    let store = find_structured_store_registration(&config, Some(&request.structured_store_id))
        .ok_or_else(|| "Selected Oracle structured store was not found".to_string())?;
    let url = build_ai_enrichment_job_url(&config, store, &request.enrichment_job_id)?;
    let response = build_default_http_client()?
        .get(url.clone())
        .header(USER_AGENT, AI_PROVIDER_USER_AGENT);
    let response = apply_oci_iam_signature(response, &config, store, "get", &url, "")?
        .send()
        .await
        .map_err(|error| {
            normalize_ai_send_error_message(
                error.is_timeout(),
                error.is_connect(),
                &error.to_string(),
            )
        })?;
    let response = ensure_ai_success_status(response, "ai:get-enrichment-job").await?;
    parse_json_response(response).await
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

    if request.knowledge_selection.kind == "oracle-structured-store"
        && request.knowledge_selection.mode.as_deref() == Some("sql-draft")
    {
        return run_oci_nl2sql_draft_completion(&config, &request).await;
    }

    if request.knowledge_selection.kind == "oracle-structured-store"
        && request.knowledge_selection.mode.as_deref() == Some("agent-answer")
    {
        return run_oci_structured_mcp_completion(&config, &request).await;
    }

    let api_key = read_ai_provider_api_key()?;

    if config.provider == "openai-compatible" || config.project.trim().is_empty() {
        return run_openai_chat_completion(app, &config, &api_key, &request, &request_id).await;
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
    request: &AiRunCompletionRequest,
) -> Result<AiRunCompletionResponse, String> {
    let store = find_structured_store_registration(
        config,
        request.knowledge_selection.registration_id.as_deref(),
    )
    .ok_or_else(|| "Selected Oracle structured store was not found".to_string())?;

    if let Some(response) = build_user_supplied_sql_draft_response(store, request) {
        return Ok(response);
    }

    let generate_sql_url = build_ai_generate_sql_url(config, store)?;
    let payload = json!({
        "inputNaturalLanguageQuery": request.prompt.trim()
    });

    let response = build_default_http_client()?
        .post(generate_sql_url.clone())
        .header(USER_AGENT, AI_PROVIDER_USER_AGENT)
        .header(CONTENT_TYPE, "application/json")
        .body(payload.to_string());

    let response = apply_oci_iam_signature(
        response,
        config,
        store,
        "post",
        &generate_sql_url,
        &payload.to_string(),
    )?
    .send()
    .await
    .map_err(|error| {
        normalize_ai_send_error_message(error.is_timeout(), error.is_connect(), &error.to_string())
    })?;
    let response = ensure_ai_success_status(response, "ai:generate-sql-from-nl").await?;

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
        text: text.clone(),
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
        generated_sql: Some(text.clone()),
        structured_execution_status: None,
        structured_execution_tool_name: None,
    })
}

fn build_user_supplied_sql_draft_response(
    store: &AiOracleStructuredStoreRegistration,
    request: &AiRunCompletionRequest,
) -> Option<AiRunCompletionResponse> {
    let sql = request.prompt.trim();
    if !is_read_only_select_sql(sql) {
        return None;
    }

    Some(AiRunCompletionResponse {
        text: sql.to_string(),
        finish_reason: Some("stop".to_string()),
        model: Some("user-supplied-sql".to_string()),
        request_id: Some(request.request_id.clone()),
        thread_id: request.thread_id.clone(),
        content_type: "sql".to_string(),
        explanation_text: Some(
            "Using the read-only SQL from the prompt. No NL2SQL request was sent.".to_string(),
        ),
        warning_text: Some(
            "Review table names and predicates before running this SQL against production data."
                .to_string(),
        ),
        source_label: Some(store.label.clone()),
        retrieval_executed: false,
        retrieval_query: None,
        retrieval_results: vec![],
        retrieval_result_count: None,
        generated_sql: Some(sql.to_string()),
        structured_execution_status: None,
        structured_execution_tool_name: None,
    })
}

async fn run_oci_structured_mcp_completion(
    config: &AiProviderConfig,
    request: &AiRunCompletionRequest,
) -> Result<AiRunCompletionResponse, String> {
    let store = find_structured_store_registration(
        config,
        request.knowledge_selection.registration_id.as_deref(),
    )
    .ok_or_else(|| "Selected Oracle structured store was not found".to_string())?;
    let sql = request
        .generated_sql
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let sql = if let Some(sql) = sql {
        sql
    } else {
        run_oci_nl2sql_draft_completion(config, request)
            .await?
            .text
            .trim()
            .to_string()
    };
    if !is_read_only_select_sql(&sql) {
        return Err("Generated SQL is not a read-only SELECT query. Review and copy the SQL manually instead of executing it.".to_string());
    }

    let execution_profile =
        find_mcp_execution_profile(config, store.execution_profile_id.as_deref())
            .ok_or_else(|| "Selected MCP execution profile was not found".to_string())?;
    let (answer, tool_name) = run_mcp_execution_profile(execution_profile, store, request, &sql)?;
    let status = format!(
        "MCP execution completed{}.",
        tool_name
            .as_deref()
            .map(|name| format!(" with {name}"))
            .unwrap_or_default()
    );

    Ok(AiRunCompletionResponse {
        text: answer,
        finish_reason: Some("stop".to_string()),
        model: Some("oci-nl2sql-mcp".to_string()),
        request_id: Some(request.request_id.clone()),
        thread_id: request.thread_id.clone(),
        content_type: "markdown".to_string(),
        explanation_text: Some(
            "Generated SQL with OCI NL2SQL, then executed through the configured MCP profile."
                .to_string(),
        ),
        warning_text: None,
        source_label: Some(store.label.clone()),
        retrieval_executed: false,
        retrieval_query: None,
        retrieval_results: vec![],
        retrieval_result_count: None,
        generated_sql: Some(sql),
        structured_execution_status: Some(status),
        structured_execution_tool_name: tool_name,
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
    let access_token_aud = decode_jwt_claim(&access_token, "aud");
    let access_token_scope = decode_jwt_claim(&access_token, "scope");
    let invoke_url = build_ai_hosted_agent_invoke_url(profile)?;
    let invoke_url_string = invoke_url.to_string();
    eprintln!(
        "[ai:hosted-agent] invoke request url={} access_token_len={} profile_id={} token_aud={:?} token_scope={:?}",
        invoke_url_string,
        access_token.len(),
        profile.id,
        access_token_aud,
        access_token_scope
    );
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
            })?;
        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(normalize_hosted_agent_invoke_status_error(
                profile,
                Some(status),
                &invoke_url_string,
                &body,
                access_token_aud.as_ref(),
                access_token_scope.as_ref(),
            ));
        }

        let (mut stream_response, _) =
            read_ai_streaming_completion_response(app, request_id, response).await?;
        stream_response.thread_id = Some(thread_id);
        stream_response.content_type = resolve_ai_response_content_type(request, true).to_string();
        stream_response.source_label = Some(profile.label.clone());
        stream_response.explanation_text =
            Some("Returned by the configured Oracle hosted agent.".to_string());
        return ensure_ai_response_contains_text(stream_response);
    }

    let response = builder
        .header(ACCEPT, "application/json")
        .send()
        .await
        .map_err(|error| {
            normalize_ai_send_error_message(
                error.is_timeout(),
                error.is_connect(),
                &error.to_string(),
            )
        })?;
    let response_status = response.status();
    let response_body = response
        .text()
        .await
        .map_err(|_| "Hosted agent returned an unreadable response".to_string())?;
    if !response_status.is_success() {
        eprintln!(
            "[ai:hosted-agent] invoke failed. status={} body={}",
            response_status,
            preview_ai_response_body(&response_body, 500)
        );
        return Err(normalize_hosted_agent_invoke_status_error(
            profile,
            Some(response_status),
            &invoke_url_string,
            &response_body,
            access_token_aud.as_ref(),
            access_token_scope.as_ref(),
        ));
    }
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
        generated_sql: None,
        structured_execution_status: None,
        structured_execution_tool_name: None,
    })
}

async fn resolve_hosted_agent_access_token(
    cache: &tauri::State<'_, AiOAuthTokenCache>,
    profile: &AiOracleHostedAgentProfile,
    client_secret: &str,
) -> Result<String, String> {
    let cache_key = format!(
        "{}|{}|{}",
        profile.domain_url.trim(),
        profile.client_id.trim(),
        profile.scope.trim()
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
    let client_id_trimmed = profile.client_id.trim();
    let client_secret_trimmed = client_secret.trim();
    let scope_trimmed = profile.scope.trim();
    let mut form: Vec<(&str, &str)> = vec![
        ("grant_type", "client_credentials"),
        ("client_id", client_id_trimmed),
        ("client_secret", client_secret_trimmed),
    ];
    if !scope_trimmed.is_empty() {
        form.push(("scope", scope_trimmed));
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
    eprintln!(
        "[ai:hosted-agent] token request url={} client_id_len={} client_secret_len={} scope={:?}",
        token_url,
        client_id_trimmed.len(),
        client_secret_trimmed.len(),
        scope_trimmed
    );
    let client = build_default_http_client()?;
    let response = client
        .post(token_url)
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
        })?;
    let token_status = response.status();
    let token_content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string)
        .unwrap_or_default();
    let token_body = response
        .text()
        .await
        .map_err(|_| "Hosted agent token endpoint returned an unreadable response".to_string())?;
    if !token_status.is_success() {
        return Err(normalize_hosted_agent_token_status_error(
            token_status,
            &token_content_type,
            &token_body,
        ));
    }
    let token_response = extract_hosted_agent_oauth_token_response(&token_body)?;

    eprintln!(
        "[ai:hosted-agent] token acquired. jwt_aud={:?} jwt_scope={:?}",
        decode_jwt_claim(&token_response.access_token, "aud"),
        decode_jwt_claim(&token_response.access_token, "scope")
    );

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

fn extract_hosted_agent_oauth_token_response(body: &str) -> Result<AiOAuthTokenResponse, String> {
    let normalized_body = body.trim().trim_start_matches('\u{feff}');
    let response_json: Value = serde_json::from_str(normalized_body).map_err(|_| {
        format!(
            "Hosted agent token endpoint returned non-JSON content. body={}",
            preview_ai_response_body(body, 240)
        )
    })?;
    let response_object = response_json.as_object().ok_or_else(|| {
        format!(
            "Hosted agent token endpoint returned JSON, but not an object. body={}",
            preview_ai_response_body(body, 240)
        )
    })?;

    if let Some(error) = response_object.get("error").and_then(Value::as_str) {
        let description = response_object
            .get("error_description")
            .and_then(Value::as_str)
            .or_else(|| {
                response_object
                    .get("errorDescription")
                    .and_then(Value::as_str)
            })
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("No error description was provided");
        return Err(format!(
            "Hosted agent token endpoint returned an OAuth error: {error}. {description}"
        ));
    }

    let access_token = response_object
        .get("access_token")
        .and_then(Value::as_str)
        .or_else(|| response_object.get("accessToken").and_then(Value::as_str))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            format!(
                "Hosted agent token endpoint returned JSON without access_token. body={}",
                preview_ai_response_body(body, 240)
            )
        })?
        .to_string();
    let expires_in = response_object
        .get("expires_in")
        .or_else(|| response_object.get("expiresIn"))
        .and_then(parse_json_u64);

    Ok(AiOAuthTokenResponse {
        access_token,
        expires_in,
    })
}

fn normalize_hosted_agent_token_status_error(
    status: StatusCode,
    content_type: &str,
    body: &str,
) -> String {
    let detail = extract_oauth_error_summary(body).unwrap_or_else(|| {
        format!(
            "content_type={} body={}",
            if content_type.trim().is_empty() {
                "<unknown>"
            } else {
                content_type.trim()
            },
            preview_ai_response_body(body, 240)
        )
    });

    match status.as_u16() {
        400 => format!("Hosted agent token request was rejected. {detail}"),
        401 | 403 => format!(
            "Hosted agent authentication failed. Check client ID, client secret, and scope. {detail}"
        ),
        404 => format!("Hosted agent token endpoint was not found. {detail}"),
        500..=599 => format!("Hosted agent token service is temporarily unavailable. {detail}"),
        code => format!("Hosted agent token request returned an error ({code}). {detail}"),
    }
}

fn extract_oauth_error_summary(body: &str) -> Option<String> {
    let normalized_body = body.trim().trim_start_matches('\u{feff}');
    let response_json: Value = serde_json::from_str(normalized_body).ok()?;
    let response_object = response_json.as_object()?;
    let error = response_object.get("error").and_then(Value::as_str)?.trim();
    if error.is_empty() {
        return None;
    }

    let description = response_object
        .get("error_description")
        .and_then(Value::as_str)
        .or_else(|| {
            response_object
                .get("errorDescription")
                .and_then(Value::as_str)
        })
        .map(str::trim)
        .filter(|value| !value.is_empty());

    Some(match description {
        Some(description) => format!("oauth_error={error} description={description}"),
        None => format!("oauth_error={error}"),
    })
}

fn parse_json_u64(value: &Value) -> Option<u64> {
    match value {
        Value::Number(number) => number.as_u64(),
        Value::String(text) => text.trim().parse::<u64>().ok(),
        _ => None,
    }
}

fn preview_ai_response_body(body: &str, limit: usize) -> String {
    let compact = body.trim().replace('\r', "\\r").replace('\n', "\\n");
    if compact.chars().count() <= limit {
        return compact;
    }

    let preview = compact.chars().take(limit).collect::<String>();
    format!("{preview}...(truncated)")
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

fn oci_key_file_passphrase_account(profile_id: &str) -> String {
    format!("{AI_OCI_KEY_FILE_PASSPHRASE_ACCOUNT_PREFIX}{profile_id}")
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

fn has_oci_key_file_passphrase(profile_id: &str) -> Result<bool, String> {
    match ai_keyring_entry(&oci_key_file_passphrase_account(profile_id))?.get_password() {
        Ok(value) => Ok(!value.trim().is_empty()),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(error) => Err(format!(
            "Failed to inspect OCI key file passphrase state: {error}"
        )),
    }
}

fn read_oci_key_file_passphrase(profile_id: &str) -> Result<Option<String>, String> {
    match ai_keyring_entry(&oci_key_file_passphrase_account(profile_id))?.get_password() {
        Ok(value) => {
            let trimmed = value.trim();
            Ok((!trimmed.is_empty()).then(|| trimmed.to_string()))
        }
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(format!("Failed to read OCI key file passphrase: {error}")),
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
            oci_auth_profiles: vec![],
            unstructured_stores: vec![],
            structured_stores: vec![],
            mcp_execution_profiles: vec![],
            hosted_agent_profiles: vec![],
        }),
        "oci-responses" => {
            let project = config.project.trim();

            let hosted_agent_profiles =
                normalize_hosted_agent_profiles(config.hosted_agent_profiles)?;
            let oci_auth_profiles = normalize_oci_auth_profiles(config.oci_auth_profiles);
            let oci_auth_profile_ids = oci_auth_profiles
                .iter()
                .map(|profile| profile.id.clone())
                .collect::<HashSet<_>>();
            let mcp_execution_profiles =
                normalize_mcp_execution_profiles(config.mcp_execution_profiles);
            let mcp_execution_profile_ids = mcp_execution_profiles
                .iter()
                .map(|profile| profile.id.clone())
                .collect::<HashSet<_>>();
            let unstructured_stores =
                normalize_unstructured_store_registrations(config.unstructured_stores);
            let structured_stores = normalize_structured_store_registrations(
                config.structured_stores,
                &oci_auth_profile_ids,
                &mcp_execution_profile_ids,
            );

            Ok(AiProviderConfig {
                provider: "oci-responses".to_string(),
                base_url,
                model: model.to_string(),
                project: project.to_string(),
                oci_auth_profiles,
                unstructured_stores,
                structured_stores,
                mcp_execution_profiles,
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
    oci_auth_profile_ids: &HashSet<String>,
    mcp_execution_profile_ids: &HashSet<String>,
) -> Vec<AiOracleStructuredStoreRegistration> {
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

            AiOracleStructuredStoreRegistration {
                id: normalize_config_id(&store.id, "structured", index),
                label: store.label.trim().to_string(),
                semantic_store_id: store.semantic_store_id.trim().to_string(),
                compartment_id: first_non_empty(&[
                    store.compartment_id.as_str(),
                    store.store_ocid.as_str(),
                ]),
                store_ocid: store.store_ocid.trim().to_string(),
                oci_auth_profile_id: store.oci_auth_profile_id.and_then(|value| {
                    let trimmed = value.trim().to_string();
                    if trimmed.is_empty() || !oci_auth_profile_ids.contains(&trimmed) {
                        None
                    } else {
                        Some(trimmed)
                    }
                }),
                region_override: store.region_override.trim().to_string(),
                schema_name: store.schema_name.trim().to_string(),
                description: store.description.trim().to_string(),
                enabled: store.enabled,
                is_default,
                default_mode: if store.default_mode == "agent-answer" {
                    "agent-answer".to_string()
                } else {
                    "sql-draft".to_string()
                },
                execution_profile_id: store.execution_profile_id.and_then(|value| {
                    let trimmed = value.trim().to_string();
                    if trimmed.is_empty() || !mcp_execution_profile_ids.contains(&trimmed) {
                        None
                    } else {
                        Some(trimmed)
                    }
                }),
                enrichment_default_mode: match store.enrichment_default_mode.as_str() {
                    "partial" => "partial".to_string(),
                    "delta" => "delta".to_string(),
                    _ => "full".to_string(),
                },
                enrichment_object_names: store.enrichment_object_names.trim().to_string(),
            }
        })
        .collect()
}

fn normalize_oci_auth_profiles(
    profiles: Vec<AiOracleOCIAuthProfile>,
) -> Vec<AiOracleOCIAuthProfile> {
    profiles
        .into_iter()
        .enumerate()
        .map(|(index, profile)| AiOracleOCIAuthProfile {
            id: normalize_config_id(&profile.id, "oci-auth", index),
            label: profile.label.trim().to_string(),
            config_file: DEFAULT_OCI_IAM_CONFIG_FILE.to_string(),
            profile: if profile.profile.trim().is_empty() {
                "DEFAULT".to_string()
            } else {
                profile.profile.trim().to_string()
            },
            region: profile.region.trim().to_string(),
            tenancy: profile.tenancy.trim().to_string(),
            user: profile.user.trim().to_string(),
            fingerprint: profile.fingerprint.trim().to_string(),
            key_file: profile.key_file.trim().to_string(),
            enabled: profile.enabled,
        })
        .collect()
}

fn normalize_mcp_execution_profiles(
    profiles: Vec<AiOracleMCPExecutionProfile>,
) -> Vec<AiOracleMCPExecutionProfile> {
    profiles
        .into_iter()
        .enumerate()
        .map(|(index, profile)| {
            let server_url = profile.server_url.trim().to_string();
            let mut args: Vec<String> = profile
                .args
                .into_iter()
                .map(|arg| arg.trim().to_string())
                .filter(|arg| !arg.is_empty())
                .collect();
            if args.is_empty() {
                args = vec![
                    "-y".to_string(),
                    "mcp-remote".to_string(),
                    if server_url.is_empty() {
                        "https://genai.oci.{region-identifier}.oraclecloud.com/nl2sql/toolchain"
                            .to_string()
                    } else {
                        server_url.clone()
                    },
                    "--allow-http".to_string(),
                ];
            }

            AiOracleMCPExecutionProfile {
                id: normalize_config_id(&profile.id, "mcp-execution", index),
                label: profile.label.trim().to_string(),
                description: profile.description.trim().to_string(),
                config_json: profile.config_json.trim().to_string(),
                command: if profile.command.trim().is_empty() {
                    "/opt/homebrew/bin/npx".to_string()
                } else {
                    profile.command.trim().to_string()
                },
                args,
                server_url,
                transport: if profile.transport.trim() == "streamable-http" {
                    "streamable-http".to_string()
                } else {
                    "stdio".to_string()
                },
                tool_name: profile.tool_name.trim().to_string(),
                enabled: profile.enabled,
            }
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
            let oci_region = profile.oci_region.trim().to_string();
            let hosted_application_ocid = profile.hosted_application_ocid.trim().to_string();
            if oci_region.is_empty() {
                return Err("Hosted agent OCI region is required".to_string());
            }
            if hosted_application_ocid.is_empty() {
                return Err("Hosted agent application OCID is required".to_string());
            }

            Ok(AiOracleHostedAgentProfile {
                id: normalize_config_id(&profile.id, "hosted-agent", index),
                label: profile.label.trim().to_string(),
                oci_region,
                hosted_application_ocid,
                api_version: normalize_hosted_agent_api_version(&profile.api_version),
                api_action: normalize_hosted_agent_api_action(&profile.api_action),
                domain_url: normalize_http_url(
                    profile.domain_url.trim(),
                    "Hosted agent domain URL must be a valid HTTP or HTTPS URL",
                )?,
                client_id: profile.client_id.trim().to_string(),
                scope: profile.scope.trim().to_string(),
                transport: if profile.transport == "sse" {
                    "sse".to_string()
                } else {
                    "http-json".to_string()
                },
            })
        })
        .collect()
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

fn normalize_hosted_agent_api_version(input: &str) -> String {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        "20251112".to_string()
    } else {
        trimmed.to_string()
    }
}

fn normalize_hosted_agent_api_action(input: &str) -> String {
    let trimmed = input.trim().trim_matches('/');
    if trimmed.is_empty() {
        "chat".to_string()
    } else {
        trimmed.to_string()
    }
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
    config: &AiProviderConfig,
    store: &AiOracleStructuredStoreRegistration,
) -> Result<reqwest::Url, String> {
    let inference_root = build_ai_inference_root_url(config, store)?;
    inference_root
        .join(&format!(
            "20260325/semanticStores/{}/actions/generateSqlFromNl",
            store.semantic_store_id.trim()
        ))
        .map_err(|error| format!("Failed to build AI GenerateSqlFromNl URL: {error}"))
}

fn build_ai_enrichment_jobs_url(
    config: &AiProviderConfig,
    store: &AiOracleStructuredStoreRegistration,
    compartment_id_override: Option<&str>,
) -> Result<reqwest::Url, String> {
    let inference_root = build_ai_inference_root_url(config, store)?;
    let mut url = inference_root
        .join(&format!(
            "20260325/semanticStores/{}/enrichmentJobs",
            store.semantic_store_id.trim()
        ))
        .map_err(|error| format!("Failed to build AI Enrichment Jobs URL: {error}"))?;
    let compartment_id = resolve_enrichment_jobs_compartment_id(store, compartment_id_override)?;
    url.query_pairs_mut()
        .append_pair("compartmentId", &compartment_id)
        .append_pair("sortBy", "timeCreated")
        .append_pair("sortOrder", "DESC")
        .append_pair("limit", "10");
    Ok(url)
}

fn build_ai_generate_enrichment_job_url(
    config: &AiProviderConfig,
    store: &AiOracleStructuredStoreRegistration,
) -> Result<reqwest::Url, String> {
    let inference_root = build_ai_inference_root_url(config, store)?;
    inference_root
        .join(&format!(
            "20260325/semanticStores/{}/actions/enrich",
            store.semantic_store_id.trim()
        ))
        .map_err(|error| format!("Failed to build AI GenerateEnrichmentJob URL: {error}"))
}

fn build_ai_enrichment_job_url(
    config: &AiProviderConfig,
    store: &AiOracleStructuredStoreRegistration,
    enrichment_job_id: &str,
) -> Result<reqwest::Url, String> {
    let enrichment_job_id = enrichment_job_id.trim();
    if enrichment_job_id.is_empty() {
        return Err("Enrichment Job ID is required".to_string());
    }
    let inference_root = build_ai_inference_root_url(config, store)?;
    inference_root
        .join(&format!(
            "20260325/semanticStores/{}/enrichmentJobs/{}",
            store.semantic_store_id.trim(),
            enrichment_job_id
        ))
        .map_err(|error| format!("Failed to build Enrichment Job URL: {error}"))
}

fn resolve_enrichment_jobs_compartment_id(
    store: &AiOracleStructuredStoreRegistration,
    compartment_id_override: Option<&str>,
) -> Result<String, String> {
    let compartment_id = first_non_empty(&[
        compartment_id_override.unwrap_or(""),
        store.compartment_id.as_str(),
        // Legacy configs briefly stored this value in storeOcid before the UI exposed
        // the Oracle API's compartmentId requirement explicitly.
        store.store_ocid.as_str(),
    ]);
    if compartment_id.is_empty() {
        return Err("Compartment OCID is required to refresh enrichment jobs".to_string());
    }
    Ok(compartment_id)
}

fn build_ai_inference_root_url(
    config: &AiProviderConfig,
    store: &AiOracleStructuredStoreRegistration,
) -> Result<reqwest::Url, String> {
    let region = resolve_structured_store_region(config, store)?;
    let parsed = normalize_url_with_trailing_slash(&config.base_url)?;

    if let Some(host) = parsed.host_str() {
        if let Some(inference_host) = build_generative_ai_data_inference_host(host, &region) {
            let url = format!("{}://{}/", parsed.scheme(), inference_host);
            return reqwest::Url::parse(&url)
                .map_err(|error| format!("Failed to build OCI Generative AI Data URL: {error}"));
        }
    }

    let mut parsed = parsed;
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

fn build_generative_ai_data_inference_host(host: &str, region: &str) -> Option<String> {
    let host = host.trim().trim_end_matches('.').to_ascii_lowercase();
    let region = region.trim();
    if host.is_empty() || region.is_empty() {
        return None;
    }

    if host.starts_with("inference.generativeai.") {
        return Some(format!(
            "inference.generativeai.{region}.oci.{}",
            infer_oci_second_level_domain(&host, region)?
        ));
    }

    if host.starts_with("genai.oci.")
        || host.contains(".oraclecloud.")
        || host.contains(".oraclegovcloud.")
    {
        return Some(format!(
            "inference.generativeai.{region}.oci.{}",
            infer_oci_second_level_domain(&host, region)?
        ));
    }

    None
}

fn infer_oci_second_level_domain(host: &str, region: &str) -> Option<String> {
    if let Some((_, suffix)) = host.split_once(".oci.") {
        let region_prefix = format!("{}.", region.trim());
        let suffix = suffix.strip_prefix(&region_prefix).unwrap_or(suffix);
        if !suffix.trim().is_empty() {
            return Some(suffix.to_string());
        }
    }

    for marker in ["oraclecloud.", "oraclegovcloud."] {
        if let Some(index) = host.find(marker) {
            return Some(host[index..].to_string());
        }
    }

    None
}

fn build_ai_hosted_agent_invoke_url(
    profile: &AiOracleHostedAgentProfile,
) -> Result<reqwest::Url, String> {
    let region = profile.oci_region.trim();
    let hosted_application_ocid = profile.hosted_application_ocid.trim();
    if region.is_empty() {
        return Err("Hosted agent OCI region is required".to_string());
    }
    if hosted_application_ocid.is_empty() {
        return Err("Hosted agent application OCID is required".to_string());
    }

    let api_version = normalize_hosted_agent_api_version(&profile.api_version);
    let api_action = normalize_hosted_agent_api_action(&profile.api_action);
    let url = format!(
        "https://application.generativeai.{region}.oci.oraclecloud.com/{api_version}/hostedApplications/{hosted_application_ocid}/actions/invoke/{api_action}"
    );
    reqwest::Url::parse(&url)
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

fn decode_jwt_claim(token: &str, claim: &str) -> Option<Value> {
    let payload_b64 = token.split('.').nth(1)?;
    let payload_bytes = URL_SAFE_NO_PAD
        .decode(payload_b64.trim_end_matches('='))
        .ok()?;
    let payload: Value = serde_json::from_slice(&payload_bytes).ok()?;
    payload.get(claim).cloned()
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

fn apply_oci_iam_signature(
    builder: reqwest::RequestBuilder,
    config: &AiProviderConfig,
    store: &AiOracleStructuredStoreRegistration,
    method: &str,
    url: &reqwest::Url,
    body: &str,
) -> Result<reqwest::RequestBuilder, String> {
    let auth = resolve_oci_auth_settings(config, store)?;
    let date = Utc::now().format("%a, %d %b %Y %H:%M:%S GMT").to_string();
    let headers = build_oci_signature_headers(method, url, &date, body)?;
    let signing_string = headers
        .iter()
        .map(|(name, value)| format!("{name}: {value}"))
        .collect::<Vec<_>>()
        .join("\n");
    let signature = sign_oci_request_string(
        &auth.key_file,
        auth.key_file_passphrase.as_deref(),
        &signing_string,
    )?;
    let key_id = format!("{}/{}/{}", auth.tenancy, auth.user, auth.fingerprint);
    let header_names = headers
        .iter()
        .map(|(name, _)| *name)
        .collect::<Vec<_>>()
        .join(" ");
    let authorization = format!(
        "Signature version=\"1\",keyId=\"{key_id}\",algorithm=\"rsa-sha256\",headers=\"{header_names}\",signature=\"{signature}\""
    );

    let mut builder = builder;
    for (name, value) in &headers {
        if *name == "(request-target)" {
            continue;
        }
        builder = builder.header(*name, value.as_str());
    }

    Ok(builder.header("authorization", authorization))
}

fn build_oci_signature_headers(
    method: &str,
    url: &reqwest::Url,
    date: &str,
    body: &str,
) -> Result<Vec<(&'static str, String)>, String> {
    let host = url
        .host_str()
        .ok_or_else(|| "OCI request URL did not include a host".to_string())?
        .to_string();
    let mut headers = vec![
        ("date", date.to_string()),
        ("(request-target)", build_oci_request_target(method, url)),
        ("host", host),
    ];

    // OCI IAM signing only includes body headers for methods that send a body.
    // Signing them for GET makes some OCI endpoints reject otherwise valid requests.
    if method.eq_ignore_ascii_case("post")
        || method.eq_ignore_ascii_case("put")
        || method.eq_ignore_ascii_case("patch")
    {
        headers.extend([
            (
                "x-content-sha256",
                STANDARD.encode(Sha256::digest(body.as_bytes())),
            ),
            ("content-type", "application/json".to_string()),
            ("content-length", body.as_bytes().len().to_string()),
        ]);
    }

    Ok(headers)
}

async fn parse_json_response(response: reqwest::Response) -> Result<Value, String> {
    let body = response
        .text()
        .await
        .map_err(|_| "AI service returned an unreadable response".to_string())?;
    serde_json::from_str(&body).map_err(|_| "AI service returned a malformed response".to_string())
}

async fn ensure_ai_success_status(
    response: reqwest::Response,
    operation: &str,
) -> Result<reqwest::Response, String> {
    let status = response.status();
    if status.is_success() {
        return Ok(response);
    }

    let opc_request_id = response
        .headers()
        .get("opc-request-id")
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    let body = response.text().await.unwrap_or_default();
    eprintln!(
        "[{operation}] provider returned status={} body={}",
        status.as_u16(),
        preview_ai_response_body(&body, 1000)
    );
    Err(normalize_ai_status_error_message_with_provider_detail(
        Some(status),
        &body,
        operation,
        opc_request_id.as_deref(),
    ))
}

fn build_enrichment_job_payload(
    store: &AiOracleStructuredStoreRegistration,
    request: &AiEnrichmentJobRequest,
) -> Result<Value, String> {
    let mode = match request.mode.trim() {
        "partial" => "PARTIAL_BUILD",
        "delta" => {
            return Err(
                "Delta enrichment requires a refresh schedule and is not supported by this setup panel yet. Use Full Build or Partial Build."
                    .to_string(),
            )
        }
        _ => "FULL_BUILD",
    };
    let schema_name = first_non_empty(&[request.schema_name.as_str(), store.schema_name.as_str()]);
    if schema_name.is_empty() {
        return Err("Schema name is required for enrichment jobs".to_string());
    }
    let mut configuration = json!({
        "enrichmentJobType": mode,
        "schemaName": schema_name,
    });
    if mode == "PARTIAL_BUILD" {
        let objects = if request.database_objects.is_empty() {
            store
                .enrichment_object_names
                .lines()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(build_database_object_payload)
                .collect::<Vec<_>>()
        } else {
            request
                .database_objects
                .iter()
                .map(|name| name.trim())
                .filter(|value| !value.is_empty())
                .map(build_database_object_payload)
                .collect::<Vec<_>>()
        };
        if objects.is_empty() {
            return Err("Partial enrichment requires at least one database object".to_string());
        }
        configuration["databaseObjects"] = Value::Array(objects);
    }
    Ok(json!({
        "enrichmentJobType": mode,
        "enrichmentJobConfiguration": configuration
    }))
}

fn build_database_object_payload(name: &str) -> Value {
    json!({
        "name": name,
        "type": "TABLE"
    })
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ResolvedOCIAuthSettings {
    region: String,
    tenancy: String,
    user: String,
    fingerprint: String,
    key_file: String,
    key_file_passphrase: Option<String>,
}

fn resolve_oci_auth_settings(
    config: &AiProviderConfig,
    store: &AiOracleStructuredStoreRegistration,
) -> Result<ResolvedOCIAuthSettings, String> {
    let profile = find_oci_auth_profile(config, store.oci_auth_profile_id.as_deref())
        .ok_or_else(|| "OCI auth profile is required for NL2SQL".to_string())?;
    let config_values = load_oci_config_profile(&profile.config_file, &profile.profile)?;
    let keyring_passphrase = read_oci_key_file_passphrase(&profile.id)?;
    let region = first_non_empty(&[
        store.region_override.as_str(),
        profile.region.as_str(),
        config_values
            .get("region")
            .map(String::as_str)
            .unwrap_or(""),
    ]);
    let tenancy = first_non_empty(&[
        profile.tenancy.as_str(),
        config_values
            .get("tenancy")
            .map(String::as_str)
            .unwrap_or(""),
    ]);
    let user = first_non_empty(&[
        profile.user.as_str(),
        config_values.get("user").map(String::as_str).unwrap_or(""),
    ]);
    let fingerprint = first_non_empty(&[
        profile.fingerprint.as_str(),
        config_values
            .get("fingerprint")
            .map(String::as_str)
            .unwrap_or(""),
    ]);
    let key_file = first_non_empty(&[
        profile.key_file.as_str(),
        config_values
            .get("key_file")
            .map(String::as_str)
            .unwrap_or(""),
    ]);
    let key_file_passphrase = first_non_empty(&[
        keyring_passphrase.as_deref().unwrap_or(""),
        config_values
            .get("pass_phrase")
            .map(String::as_str)
            .unwrap_or(""),
    ]);

    for (label, value) in [
        ("OCI region", region.as_str()),
        ("OCI tenancy OCID", tenancy.as_str()),
        ("OCI user OCID", user.as_str()),
        ("OCI fingerprint", fingerprint.as_str()),
        ("OCI key file", key_file.as_str()),
    ] {
        if value.trim().is_empty() {
            return Err(format!("{label} is required for NL2SQL IAM signing"));
        }
    }

    Ok(ResolvedOCIAuthSettings {
        region,
        tenancy,
        user,
        fingerprint,
        key_file,
        key_file_passphrase: (!key_file_passphrase.trim().is_empty())
            .then_some(key_file_passphrase),
    })
}

fn resolve_structured_store_region(
    config: &AiProviderConfig,
    store: &AiOracleStructuredStoreRegistration,
) -> Result<String, String> {
    let profile = find_oci_auth_profile(config, store.oci_auth_profile_id.as_deref());
    let config_values = match profile {
        Some(profile) => load_oci_config_profile(&profile.config_file, &profile.profile)?,
        None => HashMap::new(),
    };
    let profile_region = profile.map(|value| value.region.as_str()).unwrap_or("");
    let region = first_non_empty(&[
        store.region_override.as_str(),
        profile_region,
        config_values
            .get("region")
            .map(String::as_str)
            .unwrap_or(""),
        infer_oci_region_from_base_url(&config.base_url)
            .as_deref()
            .unwrap_or(""),
    ]);

    if region.is_empty() {
        return Err("OCI region is required for NL2SQL endpoint resolution".to_string());
    }

    Ok(region)
}

fn infer_oci_region_from_base_url(base_url: &str) -> Option<String> {
    let parsed = normalize_url_with_trailing_slash(base_url).ok()?;
    let host = parsed
        .host_str()?
        .trim()
        .trim_end_matches('.')
        .to_ascii_lowercase();
    let parts = host.split('.').collect::<Vec<_>>();
    let oci_index = parts.iter().position(|part| *part == "oci")?;
    let candidate = parts.get(oci_index + 1)?;
    if candidate.contains('-') {
        Some((*candidate).to_string())
    } else {
        None
    }
}

fn first_non_empty(values: &[&str]) -> String {
    values
        .iter()
        .map(|value| value.trim())
        .find(|value| !value.is_empty())
        .unwrap_or("")
        .to_string()
}

fn load_oci_config_profile(
    _config_file: &str,
    profile_name: &str,
) -> Result<HashMap<String, String>, String> {
    let path = expand_home_path(DEFAULT_OCI_IAM_CONFIG_FILE);
    if !path.exists() {
        return Ok(HashMap::new());
    }
    let raw = fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read OCI config file {}: {error}", path.display()))?;
    Ok(parse_oci_config_profile(&raw, profile_name))
}

fn parse_oci_config_profile(raw: &str, profile_name: &str) -> HashMap<String, String> {
    let target = if profile_name.trim().is_empty() {
        "DEFAULT"
    } else {
        profile_name.trim()
    };
    let mut active = false;
    let mut values = HashMap::new();

    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with(';') {
            continue;
        }
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            active = trimmed
                .trim_start_matches('[')
                .trim_end_matches(']')
                .trim()
                .eq_ignore_ascii_case(target);
            continue;
        }
        if !active {
            continue;
        }
        if let Some((key, value)) = trimmed.split_once('=') {
            values.insert(key.trim().to_string(), value.trim().to_string());
        }
    }

    values
}

fn sign_oci_request_string(
    key_file: &str,
    key_file_passphrase: Option<&str>,
    signing_string: &str,
) -> Result<String, String> {
    let key_text = read_text_file_expanding_home(key_file)?;
    let key_der = decode_pem_private_key(&key_text, key_file_passphrase)?;
    let key_pair = RsaKeyPair::from_pkcs8(&key_der)
        .or_else(|_| RsaKeyPair::from_der(&key_der))
        .map_err(|_| {
            "Failed to parse OCI private key. Encrypted private keys are not supported yet."
                .to_string()
        })?;
    let rng = SystemRandom::new();
    let mut signature = vec![0; key_pair.public().modulus_len()];
    key_pair
        .sign(
            &RSA_PKCS1_SHA256,
            &rng,
            signing_string.as_bytes(),
            &mut signature,
        )
        .map_err(|_| "Failed to sign OCI request".to_string())?;
    Ok(STANDARD.encode(signature))
}

fn read_text_file_expanding_home(path: &str) -> Result<String, String> {
    let expanded = expand_home_path(path);
    fs::read_to_string(&expanded)
        .map_err(|error| format!("Failed to read {}: {error}", expanded.display()))
}

fn expand_home_path(path: &str) -> PathBuf {
    let trimmed = path.trim();
    if trimmed == "~" || trimmed.starts_with("~/") || trimmed.starts_with("~\\") {
        if let Some(home) = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")) {
            let suffix = trimmed
                .trim_start_matches('~')
                .trim_start_matches('/')
                .trim_start_matches('\\');
            return PathBuf::from(home).join(suffix);
        }
    }
    PathBuf::from(trimmed)
}

fn decode_pem_private_key(
    text: &str,
    key_file_passphrase: Option<&str>,
) -> Result<Vec<u8>, String> {
    let mut body = String::new();
    let mut in_key = false;
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("-----BEGIN ") && trimmed.contains("PRIVATE KEY-----") {
            if trimmed.contains("ENCRYPTED") {
                if key_file_passphrase.map(str::trim).unwrap_or("").is_empty() {
                    return Err(
                        "Encrypted OCI private key requires a key file passphrase".to_string()
                    );
                }
                return Err(
                    "Encrypted OCI private keys are not supported by the built-in signer yet"
                        .to_string(),
                );
            }
            in_key = true;
            continue;
        }
        if trimmed.starts_with("-----END ") && trimmed.contains("PRIVATE KEY-----") {
            break;
        }
        if in_key {
            body.push_str(trimmed);
        }
    }
    if body.is_empty() {
        return Err("OCI private key PEM did not contain a supported private key".to_string());
    }
    STANDARD
        .decode(body.as_bytes())
        .map_err(|_| "Failed to decode OCI private key PEM".to_string())
}

fn build_oci_request_target(method: &str, url: &reqwest::Url) -> String {
    let path = if url.path().is_empty() {
        "/"
    } else {
        url.path()
    };
    match url.query() {
        Some(query) if !query.is_empty() => {
            format!("{} {path}?{query}", method.to_ascii_lowercase())
        }
        _ => format!("{} {path}", method.to_ascii_lowercase()),
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
        Some(404) => {
            "AI endpoint or resource was not found. Check the configured base URL, OCI region, semantic store ID, compartment OCID, enrichment job ID, and IAM policy".to_string()
        }
        Some(429) => "AI rate limit reached. Try again in a moment".to_string(),
        Some(500..=599) => "AI service is temporarily unavailable. Try again later".to_string(),
        Some(code) => format!("AI request returned an error ({code})"),
        None => format!("AI request returned an error: {fallback}"),
    }
}

fn normalize_ai_status_error_message_with_provider_detail(
    status: Option<StatusCode>,
    fallback: &str,
    operation: &str,
    opc_request_id: Option<&str>,
) -> String {
    let base = normalize_ai_operation_status_error_message(operation, status, fallback);
    match summarize_ai_provider_error_detail(fallback, opc_request_id) {
        Some(detail) => format!("{base}. Provider detail ({operation}): {detail}"),
        None => base,
    }
}

fn normalize_ai_operation_status_error_message(
    operation: &str,
    status: Option<StatusCode>,
    fallback: &str,
) -> String {
    if operation.starts_with("ai:generate-sql-from-nl")
        || operation.starts_with("ai:generate-enrichment-job")
        || operation.starts_with("ai:list-enrichment-jobs")
        || operation.starts_with("ai:get-enrichment-job")
    {
        match status.map(|status| status.as_u16()) {
            Some(400) => {
                return "Structured data request was rejected by OCI. Check the Semantic Store OCID, schema metadata, and request details.".to_string();
            }
            Some(401 | 403) => {
                return "OCI authentication failed. Check the selected IAM profile, key file, and policy permissions.".to_string();
            }
            Some(404) => {
                return "OCI structured data endpoint or resource was not found. Check the Semantic Store OCID, OCI region, base URL, compartment OCID, enrichment job ID, and IAM policy.".to_string();
            }
            Some(429) => {
                return "OCI structured data rate limit reached. Try again in a moment."
                    .to_string();
            }
            Some(500..=599) => {
                return "OCI structured data service is temporarily unavailable. Try again later."
                    .to_string();
            }
            _ => {}
        }
    }

    normalize_ai_status_error_message(status, fallback)
}

fn summarize_ai_provider_error_detail(body: &str, opc_request_id: Option<&str>) -> Option<String> {
    let trimmed = body.trim();
    let mut parts = Vec::new();
    let mut detail_includes_request_id = false;

    if let Ok(value) = serde_json::from_str::<Value>(trimmed) {
        if let Some(code) = first_json_string_by_keys(&value, &["code", "errorCode", "status"]) {
            parts.push(format!("code={code}"));
        }
        if let Some(message) = first_json_string_by_keys(
            &value,
            &["message", "errorMessage", "errorDescription", "detail"],
        ) {
            parts.push(format!("message={message}"));
        }
        if let Some(request_id) =
            first_json_string_by_keys(&value, &["opc-request-id", "opcRequestId", "requestId"])
        {
            detail_includes_request_id = true;
            parts.push(format!("opc-request-id={request_id}"));
        }
        if parts.is_empty() && !trimmed.is_empty() {
            parts.push(format!("body={}", preview_ai_response_body(trimmed, 360)));
        }
    } else if !trimmed.is_empty() {
        parts.push(format!("body={}", preview_ai_response_body(trimmed, 360)));
    }

    if !detail_includes_request_id {
        if let Some(request_id) = opc_request_id
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            parts.push(format!("opc-request-id={request_id}"));
        }
    }

    if parts.is_empty() {
        None
    } else {
        Some(parts.join(" "))
    }
}

fn first_json_string_by_keys(value: &Value, keys: &[&str]) -> Option<String> {
    match value {
        Value::Object(map) => {
            for key in keys {
                for (field, candidate) in map {
                    if field.eq_ignore_ascii_case(key) {
                        if let Some(text) = candidate
                            .as_str()
                            .map(str::trim)
                            .filter(|text| !text.is_empty())
                        {
                            return Some(text.to_string());
                        }
                    }
                }
            }

            for candidate in map.values() {
                if let Some(text) = first_json_string_by_keys(candidate, keys) {
                    return Some(text);
                }
            }

            None
        }
        Value::Array(items) => {
            for item in items {
                if let Some(text) = first_json_string_by_keys(item, keys) {
                    return Some(text);
                }
            }

            None
        }
        _ => None,
    }
}

fn normalize_hosted_agent_invoke_status_error(
    profile: &AiOracleHostedAgentProfile,
    status: Option<StatusCode>,
    invoke_url: &str,
    fallback: &str,
    token_aud: Option<&Value>,
    token_scope: Option<&Value>,
) -> String {
    let detail = summarize_hosted_agent_response_detail(fallback);
    let auth_context = summarize_hosted_agent_auth_context(profile, token_aud, token_scope);
    let audience_hint = if detail.to_ascii_lowercase().contains("audience mismatch") {
        "The token audience does not match the configured Hosted Application OCID."
    } else {
        ""
    };
    match status.map(|status| status.as_u16()) {
        Some(400) => format!("Hosted agent request was rejected by the provider. {detail}"),
        Some(401 | 403) => format!(
            "Hosted agent authentication failed. Check token scope, agent permissions, client secret, and Hosted Application OCID. {auth_context} {detail} {audience_hint}"
        ),
        Some(404) => format!(
            "Hosted agent endpoint was not found. Check OCI region, API version, hosted application OCID, and API action. url={invoke_url} {detail}"
        ),
        Some(429) => "Hosted agent rate limit reached. Try again in a moment".to_string(),
        Some(500..=599) => format!("Hosted agent service is temporarily unavailable. Try again later. {detail}"),
        Some(code) => format!("Hosted agent request returned an error ({code}). {detail}"),
        None => format!("Hosted agent request returned an error: {fallback}"),
    }
}

fn summarize_hosted_agent_auth_context(
    profile: &AiOracleHostedAgentProfile,
    token_aud: Option<&Value>,
    token_scope: Option<&Value>,
) -> String {
    format!(
        "profile_id={} profile_label={} hosted_application_ocid={} configured_scope={} token_aud={} token_scope={}.",
        profile.id,
        summarize_hosted_agent_setting(&profile.label),
        summarize_hosted_agent_setting(&profile.hosted_application_ocid),
        summarize_hosted_agent_setting(&profile.scope),
        summarize_hosted_agent_claim(token_aud),
        summarize_hosted_agent_claim(token_scope),
    )
}

fn summarize_hosted_agent_setting(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        "<empty>".to_string()
    } else {
        trimmed.to_string()
    }
}

fn summarize_hosted_agent_claim(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(string)) => summarize_hosted_agent_setting(string),
        Some(other) => other.to_string(),
        None => "<missing>".to_string(),
    }
}

fn summarize_hosted_agent_response_detail(body: &str) -> String {
    let trimmed = body.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    if let Ok(value) = serde_json::from_str::<Value>(trimmed) {
        let code = value
            .get("code")
            .and_then(Value::as_str)
            .or_else(|| value.get("error").and_then(Value::as_str));
        let message = value
            .get("message")
            .and_then(Value::as_str)
            .or_else(|| value.get("error_description").and_then(Value::as_str));
        match (code, message) {
            (Some(code), Some(message)) => return format!("{code}: {message}"),
            (Some(code), None) => return code.to_string(),
            (None, Some(message)) => return message.to_string(),
            _ => {}
        }
    }
    let snippet: String = trimmed.chars().take(500).collect();
    snippet
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

fn find_oci_auth_profile<'a>(
    config: &'a AiProviderConfig,
    profile_id: Option<&str>,
) -> Option<&'a AiOracleOCIAuthProfile> {
    if let Some(profile_id) = profile_id.map(str::trim).filter(|value| !value.is_empty()) {
        return config
            .oci_auth_profiles
            .iter()
            .find(|profile| profile.id == profile_id && profile.enabled);
    }

    config
        .oci_auth_profiles
        .iter()
        .find(|profile| profile.enabled)
}

fn find_mcp_execution_profile<'a>(
    config: &'a AiProviderConfig,
    profile_id: Option<&str>,
) -> Option<&'a AiOracleMCPExecutionProfile> {
    let profile_id = profile_id?.trim();
    if profile_id.is_empty() {
        return None;
    }

    config
        .mcp_execution_profiles
        .iter()
        .find(|profile| profile.id == profile_id && profile.enabled)
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

fn is_read_only_select_sql(sql: &str) -> bool {
    let trimmed = sql.trim();
    if trimmed.is_empty() {
        return false;
    }
    let lower = trimmed.to_ascii_lowercase();
    let without_comments = lower
        .lines()
        .filter(|line| !line.trim_start().starts_with("--"))
        .collect::<Vec<_>>()
        .join("\n");
    let candidate = without_comments.trim_start();
    if !(candidate.starts_with("select") || candidate.starts_with("with")) {
        return false;
    }
    let forbidden = [
        " insert ",
        " update ",
        " delete ",
        " merge ",
        " drop ",
        " alter ",
        " create ",
        " truncate ",
        " grant ",
        " revoke ",
        " call ",
        " execute ",
        " begin ",
        " commit ",
        " rollback ",
    ];
    let padded = format!(" {candidate} ");
    !forbidden.iter().any(|token| padded.contains(token))
}

fn run_mcp_execution_profile(
    profile: &AiOracleMCPExecutionProfile,
    store: &AiOracleStructuredStoreRegistration,
    request: &AiRunCompletionRequest,
    sql: &str,
) -> Result<(String, Option<String>), String> {
    let command = profile.command.trim();
    if command.is_empty() {
        return Err("MCP command is required".to_string());
    }

    let mut child = Command::new(command)
        .args(profile.args.iter().filter(|arg| !arg.trim().is_empty()))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Failed to start MCP execution profile: {error}"))?;

    let stderr_reader = child.stderr.take().map(spawn_mcp_stderr_reader);
    let mut stdin = match child.stdin.take() {
        Some(stdin) => stdin,
        None => {
            return Err(finish_mcp_process_with_error(
                child,
                stderr_reader,
                "Failed to open MCP stdin".to_string(),
            ))
        }
    };
    let mut stdout = match child.stdout.take() {
        Some(stdout) => stdout,
        None => {
            return Err(finish_mcp_process_with_error(
                child,
                stderr_reader,
                "Failed to open MCP stdout".to_string(),
            ))
        }
    };

    let session_result =
        run_mcp_execution_session(&mut stdin, &mut stdout, profile, store, request, sql);
    drop(stdin);
    match session_result {
        Ok((text, tool_name)) => {
            let _ = child.kill();
            let _ = child.wait();
            let _ = join_mcp_stderr_reader(stderr_reader);
            Ok((text, Some(tool_name)))
        }
        Err(error) => Err(finish_mcp_process_with_error(child, stderr_reader, error)),
    }
}

fn run_mcp_execution_session(
    stdin: &mut std::process::ChildStdin,
    stdout: &mut std::process::ChildStdout,
    profile: &AiOracleMCPExecutionProfile,
    store: &AiOracleStructuredStoreRegistration,
    request: &AiRunCompletionRequest,
    sql: &str,
) -> Result<(String, String), String> {
    write_mcp_message(
        stdin,
        &json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {
                    "name": "No.1 Markdown Editor",
                    "version": env!("CARGO_PKG_VERSION")
                }
            }
        }),
    )?;
    let _ = read_mcp_response(stdout, 1)?;
    write_mcp_message(
        stdin,
        &json!({
            "jsonrpc": "2.0",
            "method": "notifications/initialized",
            "params": {}
        }),
    )?;

    write_mcp_message(
        stdin,
        &json!({
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/list",
            "params": {}
        }),
    )?;
    let tools_response = read_mcp_response(stdout, 2)?;
    let tool_name = resolve_mcp_tool_name(&tools_response, &profile.tool_name)?;

    write_mcp_message(
        stdin,
        &json!({
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": {
                    "query": request.prompt.trim(),
                    "naturalLanguageQuery": request.prompt.trim(),
                    "sql": sql,
                    "semanticStoreId": store.semantic_store_id.clone(),
                    "schemaName": store.schema_name.clone()
                }
            }
        }),
    )?;
    let call_response = read_mcp_response(stdout, 3)?;
    let text = extract_mcp_text_response(&call_response)
        .ok_or_else(|| "MCP execution response did not include text content".to_string())?;
    Ok((text, tool_name))
}

fn spawn_mcp_stderr_reader(mut stderr: ChildStderr) -> JoinHandle<String> {
    thread::spawn(move || {
        let mut bytes = Vec::new();
        match stderr.read_to_end(&mut bytes) {
            Ok(_) => String::from_utf8_lossy(&bytes).to_string(),
            Err(error) => format!("Failed to read MCP stderr: {error}"),
        }
    })
}

fn join_mcp_stderr_reader(reader: Option<JoinHandle<String>>) -> String {
    reader
        .and_then(|handle| handle.join().ok())
        .unwrap_or_default()
}

fn finish_mcp_process_with_error(
    mut child: std::process::Child,
    stderr_reader: Option<JoinHandle<String>>,
    error: String,
) -> String {
    let status = child.try_wait().ok().flatten();
    if status.is_none() {
        let _ = child.kill();
    }
    let status = status.or_else(|| child.wait().ok());
    let status_text = status.as_ref().map(describe_mcp_exit_status);
    let stderr = join_mcp_stderr_reader(stderr_reader);
    format_mcp_process_error(&error, status_text.as_deref(), &stderr)
}

fn describe_mcp_exit_status(status: &ExitStatus) -> String {
    status
        .code()
        .map(|code| format!("exit code {code}"))
        .unwrap_or_else(|| "terminated without an exit code".to_string())
}

fn format_mcp_process_error(error: &str, status: Option<&str>, stderr: &str) -> String {
    let mut parts = vec![normalize_mcp_transport_error(error)];
    if let Some(status) = status {
        parts.push(format!("MCP process status: {status}"));
    }
    let stderr = normalize_mcp_stderr(stderr);
    if !stderr.is_empty() {
        if let Some(hint) = infer_mcp_stderr_hint(&stderr) {
            parts.push(hint.to_string());
        }
        parts.push(format!("MCP stderr:\n{stderr}"));
    }
    parts.join("\n\n")
}

fn normalize_mcp_transport_error(error: &str) -> String {
    if error.starts_with("Failed to read MCP response header") {
        return format!("MCP process exited before sending a response header ({error}).");
    }
    error.to_string()
}

fn normalize_mcp_stderr(stderr: &str) -> String {
    let normalized = stderr.replace("\r\n", "\n").replace('\r', "\n");
    let trimmed = normalized.trim();
    if trimmed.chars().count() <= MCP_STDERR_MAX_CHARS {
        return trimmed.to_string();
    }
    let truncated = trimmed
        .chars()
        .take(MCP_STDERR_MAX_CHARS)
        .collect::<String>();
    format!("{truncated}\n... MCP stderr truncated ...")
}

fn infer_mcp_stderr_hint(stderr: &str) -> Option<&'static str> {
    let lower = stderr.to_ascii_lowercase();
    if lower.contains("enotcached") || lower.contains("only-if-cached") {
        return Some("npm is running in offline/cache-only mode and mcp-remote is not cached. Disable npm offline mode (`npm config set offline false`) or preinstall/cache `mcp-remote` before running this MCP profile.");
    }
    if lower.contains("econnrefused") && lower.contains("registry.npmjs.org") {
        return Some("npm could not reach the package registry. Check npm proxy/network settings or preinstall/cache `mcp-remote` before running this MCP profile.");
    }
    if lower.contains("enotfound") || lower.contains("getaddrinfo") {
        if lower.contains("oraclecloud.com") || lower.contains("genai.oci") {
            return Some("MCP remote server hostname could not be resolved. Check DNS/network/proxy settings and verify the Oracle GenAI MCP server URL/region.");
        }
        return Some("MCP remote server hostname could not be resolved. Check DNS/network/proxy settings and verify the MCP server URL/region.");
    }
    if lower.contains("fetch failed") {
        return Some("MCP remote server request failed. Check network/proxy settings and verify the MCP server URL/region.");
    }
    None
}

fn write_mcp_message(stdin: &mut std::process::ChildStdin, value: &Value) -> Result<(), String> {
    let body = value.to_string();
    let frame = format!("Content-Length: {}\r\n\r\n{}", body.as_bytes().len(), body);
    stdin
        .write_all(frame.as_bytes())
        .and_then(|_| stdin.flush())
        .map_err(|error| format!("Failed to write MCP message: {error}"))
}

fn read_mcp_response(
    stdout: &mut std::process::ChildStdout,
    expected_id: i64,
) -> Result<Value, String> {
    loop {
        let value = read_mcp_message(stdout)?;
        if value.get("id").and_then(Value::as_i64) != Some(expected_id) {
            continue;
        }
        if let Some(error) = value.get("error") {
            return Err(format!(
                "MCP returned an error: {}",
                summarize_mcp_error(error)
            ));
        }
        return Ok(value);
    }
}

fn read_mcp_message(stdout: &mut std::process::ChildStdout) -> Result<Value, String> {
    let mut header = Vec::new();
    let mut byte = [0_u8; 1];
    while !header.ends_with(b"\r\n\r\n") && !header.ends_with(b"\n\n") {
        stdout
            .read_exact(&mut byte)
            .map_err(|error| format!("Failed to read MCP response header: {error}"))?;
        header.push(byte[0]);
        if header.len() > 8192 {
            return Err("MCP response header was too large".to_string());
        }
    }
    let header_text = String::from_utf8_lossy(&header);
    let content_length = header_text
        .lines()
        .find_map(|line| {
            let (name, value) = line.split_once(':')?;
            name.trim()
                .eq_ignore_ascii_case("content-length")
                .then(|| value.trim().parse::<usize>().ok())
                .flatten()
        })
        .ok_or_else(|| "MCP response did not include Content-Length".to_string())?;
    let mut body = vec![0_u8; content_length];
    stdout
        .read_exact(&mut body)
        .map_err(|error| format!("Failed to read MCP response body: {error}"))?;
    serde_json::from_slice(&body)
        .map_err(|error| format!("MCP response was malformed JSON: {error}"))
}

fn resolve_mcp_tool_name(
    tools_response: &Value,
    configured_tool_name: &str,
) -> Result<String, String> {
    let configured = configured_tool_name.trim();
    if !configured.is_empty() {
        return Ok(configured.to_string());
    }
    let tools = tools_response
        .get("result")
        .and_then(|result| result.get("tools"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    if tools.len() == 1 {
        return tools[0]
            .get("name")
            .and_then(Value::as_str)
            .map(str::to_string)
            .ok_or_else(|| "MCP tool did not include a name".to_string());
    }
    if tools.is_empty() {
        return Err("MCP server did not expose any tools".to_string());
    }
    let names = tools
        .iter()
        .filter_map(|tool| tool.get("name").and_then(Value::as_str))
        .collect::<Vec<_>>()
        .join(", ");
    Err(format!(
        "MCP server exposed multiple tools ({names}). Configure a tool name in AI Setup."
    ))
}

fn extract_mcp_text_response(response: &Value) -> Option<String> {
    let result = response.get("result")?;
    if let Some(text) = result.get("text").and_then(Value::as_str) {
        return Some(text.trim().to_string()).filter(|value| !value.is_empty());
    }
    if let Some(content) = result.get("content").and_then(Value::as_array) {
        let text = content
            .iter()
            .filter_map(|item| {
                if item.get("type").and_then(Value::as_str) == Some("text") {
                    item.get("text").and_then(Value::as_str)
                } else {
                    None
                }
            })
            .collect::<Vec<_>>()
            .join("\n");
        return Some(text.trim().to_string()).filter(|value| !value.is_empty());
    }
    None
}

fn summarize_mcp_error(error: &Value) -> String {
    error
        .get("message")
        .and_then(Value::as_str)
        .or_else(|| error.as_str())
        .unwrap_or("unknown MCP error")
        .to_string()
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
        .or_else(|| {
            response_json
                .get("jobOutput")
                .and_then(extract_nl2sql_job_output_text)
        })
        .or_else(|| {
            response_json
                .get("output")
                .and_then(extract_nl2sql_job_output_text)
        })
}

fn extract_nl2sql_job_output_text(job_output: &Value) -> Option<String> {
    job_output
        .get("content")
        .and_then(extract_content_text)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .or_else(|| {
            job_output
                .get("generatedSql")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
        })
        .or_else(|| {
            job_output
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
        generated_sql: None,
        structured_execution_status: None,
        structured_execution_tool_name: None,
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
            generated_sql: None,
            structured_execution_status: None,
            structured_execution_tool_name: None,
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
    use super::build_ai_enrichment_job_url;
    use super::build_ai_enrichment_jobs_url;
    use super::build_ai_generate_enrichment_job_url;
    use super::build_ai_generate_sql_url;
    use super::build_ai_hosted_agent_invoke_url;
    use super::build_ai_responses_url;
    use super::build_enrichment_job_payload;
    use super::build_oci_request_target;
    use super::build_oci_responses_payload;
    use super::build_oci_signature_headers;
    use super::build_user_supplied_sql_draft_response;
    use super::collect_ai_file_search_observation;
    use super::collect_ai_sse_data;
    use super::extract_ai_completion_response;
    use super::extract_ai_stream_chunk;
    use super::extract_ai_stream_finish_reason;
    use super::extract_hosted_agent_oauth_token_response;
    use super::extract_mcp_text_response;
    use super::extract_nl2sql_sql_text;
    use super::finalize_document_store_response;
    use super::format_mcp_process_error;
    use super::is_read_only_select_sql;
    use super::normalize_ai_operation_status_error_message;
    use super::normalize_ai_provider_config;
    use super::normalize_ai_send_error_message;
    use super::normalize_ai_sse_buffer;
    use super::normalize_ai_status_error_message;
    use super::normalize_ai_status_error_message_with_provider_detail;
    use super::normalize_hosted_agent_invoke_status_error;
    use super::normalize_hosted_agent_token_status_error;
    use super::parse_oci_config_profile;
    use super::resolve_mcp_tool_name;
    use super::take_next_ai_sse_event;
    use super::AiEnrichmentJobRequest;
    use super::AiFileSearchCallObservation;
    use super::AiFileSearchObservation;
    use super::AiKnowledgeSelection;
    use super::AiOracleHostedAgentProfile;
    use super::AiOracleStructuredStoreRegistration;
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
            oci_auth_profiles: vec![],
            hosted_agent_profiles: vec![],
            mcp_execution_profiles: vec![],
        }
    }

    fn sample_structured_store() -> AiOracleStructuredStoreRegistration {
        AiOracleStructuredStoreRegistration {
            id: "sales-store".to_string(),
            label: "Sales".to_string(),
            semantic_store_id: "semantic-store-1".to_string(),
            compartment_id: "ocid1.compartment.oc1..sales".to_string(),
            store_ocid: "".to_string(),
            oci_auth_profile_id: Some("oci-default".to_string()),
            region_override: "us-chicago-1".to_string(),
            schema_name: "SALES".to_string(),
            description: "".to_string(),
            enabled: true,
            is_default: true,
            default_mode: "agent-answer".to_string(),
            execution_profile_id: Some("mcp-sales".to_string()),
            enrichment_default_mode: "full".to_string(),
            enrichment_object_names: "ORDERS\nCUSTOMERS".to_string(),
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
            generated_sql: None,
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
            generated_sql: None,
            structured_execution_status: None,
            structured_execution_tool_name: None,
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
            oci_auth_profiles: vec![],
            hosted_agent_profiles: vec![],
            mcp_execution_profiles: vec![],
        })
        .expect("normalize provider config");

        assert_eq!(config.provider, "oci-responses");
        assert_eq!(config.base_url, "https://example.com/openai/v1");
        assert_eq!(config.model, "gpt-test");
        assert_eq!(config.project, "project-123");
    }

    #[test]
    fn normalize_ai_provider_config_normalizes_hosted_agent_profile_defaults() {
        let config = normalize_ai_provider_config(AiProviderConfig {
            provider: "oci-responses".to_string(),
            base_url: "https://example.com/openai/v1".to_string(),
            model: "gpt-test".to_string(),
            project: "".to_string(),
            unstructured_stores: vec![],
            structured_stores: vec![],
            oci_auth_profiles: vec![],
            hosted_agent_profiles: vec![AiOracleHostedAgentProfile {
                id: "hosted-agent-1".to_string(),
                label: "Travel Agent".to_string(),
                oci_region: " us-chicago-1 ".to_string(),
                hosted_application_ocid:
                    " ocid1.generativeaihostedapplication.oc1.us-chicago-1.amaaaaaatest "
                        .to_string(),
                api_version: "".to_string(),
                api_action: "".to_string(),
                domain_url: "https://idcs.example.com".to_string(),
                client_id: " client-id ".to_string(),
                scope: " https://k8scloud.site/invoke ".to_string(),
                transport: "http-json".to_string(),
            }],
            mcp_execution_profiles: vec![],
        })
        .expect("normalize provider config");

        let profile = config
            .hosted_agent_profiles
            .first()
            .expect("hosted agent profile");
        assert_eq!(profile.oci_region, "us-chicago-1");
        assert_eq!(
            profile.hosted_application_ocid,
            "ocid1.generativeaihostedapplication.oc1.us-chicago-1.amaaaaaatest"
        );
        assert_eq!(profile.api_version, "20251112");
        assert_eq!(profile.api_action, "chat");
        assert_eq!(profile.client_id, "client-id");
        assert_eq!(profile.scope, "https://k8scloud.site/invoke");
    }

    #[test]
    fn normalize_ai_provider_config_preserves_custom_api_action() {
        let config = normalize_ai_provider_config(AiProviderConfig {
            provider: "oci-responses".to_string(),
            base_url: "https://example.com/openai/v1".to_string(),
            model: "gpt-test".to_string(),
            project: "".to_string(),
            unstructured_stores: vec![],
            structured_stores: vec![],
            oci_auth_profiles: vec![],
            hosted_agent_profiles: vec![AiOracleHostedAgentProfile {
                id: "hosted-agent-1".to_string(),
                label: "Travel Agent".to_string(),
                oci_region: "us-chicago-1".to_string(),
                hosted_application_ocid:
                    "ocid1.generativeaihostedapplication.oc1.us-chicago-1.amaaaaaatest".to_string(),
                api_version: "20251112".to_string(),
                api_action: " /completion/ ".to_string(),
                domain_url: "https://idcs.example.com".to_string(),
                client_id: "client-id".to_string(),
                scope: "scope".to_string(),
                transport: "http-json".to_string(),
            }],
            mcp_execution_profiles: vec![],
        })
        .expect("normalize provider config");

        let profile = config
            .hosted_agent_profiles
            .first()
            .expect("hosted agent profile");
        assert_eq!(profile.api_action, "completion");
    }

    #[test]
    fn normalize_ai_provider_config_keeps_one_structured_store_default() {
        let mut first = sample_structured_store();
        first.id = "data-first".to_string();
        first.is_default = true;
        let mut duplicate = sample_structured_store();
        duplicate.id = "data-duplicate".to_string();
        duplicate.is_default = true;

        let config = normalize_ai_provider_config(AiProviderConfig {
            provider: "oci-responses".to_string(),
            base_url: "https://example.com/openai/v1".to_string(),
            model: "gpt-test".to_string(),
            project: "".to_string(),
            unstructured_stores: vec![],
            structured_stores: vec![first, duplicate],
            oci_auth_profiles: vec![],
            hosted_agent_profiles: vec![],
            mcp_execution_profiles: vec![],
        })
        .expect("normalize provider config");

        assert!(config.structured_stores[0].is_default);
        assert!(!config.structured_stores[1].is_default);
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
        let mut config = sample_unstructured_provider_config();
        config.base_url = "https://genai.oci.us-chicago-1.oraclecloud.com/openai/v1".to_string();
        let store = sample_structured_store();
        let url = build_ai_generate_sql_url(&config, &store).expect("build generate sql url");
        assert_eq!(
            url.as_str(),
            "https://inference.generativeai.us-chicago-1.oci.oraclecloud.com/20260325/semanticStores/semantic-store-1/actions/generateSqlFromNl"
        );
    }

    #[test]
    fn build_ai_generate_sql_url_preserves_custom_non_oci_roots() {
        let mut config = sample_unstructured_provider_config();
        config.base_url = "https://example.com/openai/v1".to_string();
        let store = sample_structured_store();
        let url = build_ai_generate_sql_url(&config, &store).expect("build generate sql url");
        assert_eq!(
            url.as_str(),
            "https://example.com/20260325/semanticStores/semantic-store-1/actions/generateSqlFromNl"
        );
    }

    #[test]
    fn build_ai_enrichment_job_urls_use_20260325_operation_paths() {
        let mut config = sample_unstructured_provider_config();
        config.base_url = "https://genai.oci.us-chicago-1.oraclecloud.com/openai/v1".to_string();
        let store = sample_structured_store();

        let list =
            build_ai_enrichment_jobs_url(&config, &store, None).expect("build enrichment jobs url");
        assert_eq!(
            list.as_str(),
            "https://inference.generativeai.us-chicago-1.oci.oraclecloud.com/20260325/semanticStores/semantic-store-1/enrichmentJobs?compartmentId=ocid1.compartment.oc1..sales&sortBy=timeCreated&sortOrder=DESC&limit=10"
        );

        let list_with_override =
            build_ai_enrichment_jobs_url(&config, &store, Some("ocid1.compartment.oc1..unsaved"))
                .expect("build enrichment jobs url with current form value");
        assert_eq!(
            list_with_override.as_str(),
            "https://inference.generativeai.us-chicago-1.oci.oraclecloud.com/20260325/semanticStores/semantic-store-1/enrichmentJobs?compartmentId=ocid1.compartment.oc1..unsaved&sortBy=timeCreated&sortOrder=DESC&limit=10"
        );

        let generate = build_ai_generate_enrichment_job_url(&config, &store)
            .expect("build generate enrichment url");
        assert_eq!(
            generate.as_str(),
            "https://inference.generativeai.us-chicago-1.oci.oraclecloud.com/20260325/semanticStores/semantic-store-1/actions/enrich"
        );

        let job = build_ai_enrichment_job_url(&config, &store, "enrichment-job-1")
            .expect("build enrichment job url");
        assert_eq!(
            job.as_str(),
            "https://inference.generativeai.us-chicago-1.oci.oraclecloud.com/20260325/semanticStores/semantic-store-1/enrichmentJobs/enrichment-job-1"
        );
    }

    #[test]
    fn build_ai_enrichment_jobs_url_requires_compartment_id_for_list() {
        let mut config = sample_unstructured_provider_config();
        config.base_url = "https://genai.oci.us-chicago-1.oraclecloud.com/openai/v1".to_string();
        let mut store = sample_structured_store();
        store.compartment_id.clear();
        store.store_ocid.clear();

        let error = build_ai_enrichment_jobs_url(&config, &store, None)
            .expect_err("list enrichment jobs requires compartment id");
        assert_eq!(
            error,
            "Compartment OCID is required to refresh enrichment jobs"
        );
    }

    #[test]
    fn build_enrichment_job_payload_supports_full_and_partial_builds() {
        let store = sample_structured_store();
        let full = build_enrichment_job_payload(
            &store,
            &AiEnrichmentJobRequest {
                structured_store_id: store.id.clone(),
                mode: "full".to_string(),
                schema_name: "".to_string(),
                database_objects: vec![],
            },
        )
        .expect("full payload");
        assert_eq!(full["enrichmentJobType"], "FULL_BUILD");
        assert_eq!(
            full["enrichmentJobConfiguration"]["enrichmentJobType"],
            "FULL_BUILD"
        );
        assert_eq!(full["enrichmentJobConfiguration"]["schemaName"], "SALES");

        let delta = build_enrichment_job_payload(
            &store,
            &AiEnrichmentJobRequest {
                structured_store_id: store.id.clone(),
                mode: "delta".to_string(),
                schema_name: "OPS".to_string(),
                database_objects: vec![],
            },
        );
        assert!(delta
            .expect_err("delta needs a schedule")
            .contains("Delta enrichment requires a refresh schedule"));

        let partial = build_enrichment_job_payload(
            &store,
            &AiEnrichmentJobRequest {
                structured_store_id: store.id.clone(),
                mode: "partial".to_string(),
                schema_name: "".to_string(),
                database_objects: vec!["ORDERS".to_string()],
            },
        )
        .expect("partial payload");
        assert_eq!(partial["enrichmentJobType"], "PARTIAL_BUILD");
        assert_eq!(
            partial["enrichmentJobConfiguration"]["enrichmentJobType"],
            "PARTIAL_BUILD"
        );
        assert_eq!(
            partial["enrichmentJobConfiguration"]["databaseObjects"],
            json!([{ "name": "ORDERS", "type": "TABLE" }])
        );
    }

    #[test]
    fn parse_oci_config_profile_reads_default_and_named_profiles() {
        let raw = r#"
[DEFAULT]
region = us-chicago-1
tenancy = ocid1.tenancy.oc1..default
user = ocid1.user.oc1..default

[SALES]
region = us-ashburn-1
fingerprint = aa:bb
key_file = ~/.oci/sales.pem
"#;

        let default_profile = parse_oci_config_profile(raw, "DEFAULT");
        assert_eq!(
            default_profile.get("region").map(String::as_str),
            Some("us-chicago-1")
        );
        assert_eq!(
            default_profile.get("tenancy").map(String::as_str),
            Some("ocid1.tenancy.oc1..default")
        );

        let sales_profile = parse_oci_config_profile(raw, "SALES");
        assert_eq!(
            sales_profile.get("region").map(String::as_str),
            Some("us-ashburn-1")
        );
        assert_eq!(
            sales_profile.get("fingerprint").map(String::as_str),
            Some("aa:bb")
        );
        assert_eq!(
            sales_profile.get("key_file").map(String::as_str),
            Some("~/.oci/sales.pem")
        );
    }

    #[test]
    fn build_oci_request_target_preserves_query_string() {
        let url = reqwest::Url::parse("https://example.com/20260325/resource?limit=10&page=abc")
            .expect("url");
        assert_eq!(
            build_oci_request_target("GET", &url),
            "get /20260325/resource?limit=10&page=abc"
        );
    }

    #[test]
    fn build_oci_signature_headers_uses_minimal_get_headers() {
        let url = reqwest::Url::parse(
            "https://inference.generativeai.us-chicago-1.oci.oraclecloud.com/20260325/semanticStores/store/enrichmentJobs?compartmentId=ocid1.compartment.oc1..sales",
        )
        .expect("url");
        let headers = build_oci_signature_headers("GET", &url, "Tue, 28 Apr 2026 08:39:00 GMT", "")
            .expect("headers");
        let names = headers.iter().map(|(name, _)| *name).collect::<Vec<_>>();

        assert_eq!(names, vec!["date", "(request-target)", "host"]);
        assert_eq!(
            headers.get(1).map(|(_, value)| value.as_str()),
            Some("get /20260325/semanticStores/store/enrichmentJobs?compartmentId=ocid1.compartment.oc1..sales")
        );
    }

    #[test]
    fn build_oci_signature_headers_includes_body_headers_for_post() {
        let url = reqwest::Url::parse(
            "https://inference.generativeai.us-chicago-1.oci.oraclecloud.com/20260325/semanticStores/store/actions/enrich",
        )
        .expect("url");
        let headers = build_oci_signature_headers(
            "POST",
            &url,
            "Tue, 28 Apr 2026 08:39:00 GMT",
            "{\"enrichmentJobType\":\"FULL_BUILD\"}",
        )
        .expect("headers");
        let names = headers.iter().map(|(name, _)| *name).collect::<Vec<_>>();

        assert_eq!(
            names,
            vec![
                "date",
                "(request-target)",
                "host",
                "x-content-sha256",
                "content-type",
                "content-length"
            ]
        );
        assert_eq!(
            headers
                .iter()
                .find(|(name, _)| *name == "content-length")
                .map(|(_, value)| value.as_str()),
            Some("34")
        );
    }

    #[test]
    fn mcp_helpers_resolve_tool_names_and_text_content() {
        let single_tool = json!({
            "result": { "tools": [{ "name": "query_sales_database" }] }
        });
        assert_eq!(
            resolve_mcp_tool_name(&single_tool, "").expect("single tool"),
            "query_sales_database"
        );

        let ambiguous = json!({
            "result": { "tools": [{ "name": "query_a" }, { "name": "query_b" }] }
        });
        assert!(resolve_mcp_tool_name(&ambiguous, "").is_err());
        assert_eq!(
            resolve_mcp_tool_name(&ambiguous, "query_b").expect("configured tool"),
            "query_b"
        );

        let call_response = json!({
            "result": {
                "content": [
                    { "type": "text", "text": "Answer line 1" },
                    { "type": "text", "text": "Answer line 2" }
                ]
            }
        });
        assert_eq!(
            extract_mcp_text_response(&call_response).as_deref(),
            Some("Answer line 1\nAnswer line 2")
        );
    }

    #[test]
    fn mcp_process_error_includes_stderr_and_npm_offline_hint() {
        let error = format_mcp_process_error(
            "Failed to read MCP response header: failed to fill whole buffer",
            Some("exit code 1"),
            "npm error code ENOTCACHED\nnpm error request to https://registry.npmjs.org/mcp-remote failed: cache mode is 'only-if-cached' but no cached response is available.",
        );

        assert!(error.contains("MCP process exited before sending a response header"));
        assert!(error.contains("MCP process status: exit code 1"));
        assert!(error.contains("npm is running in offline/cache-only mode"));
        assert!(error.contains("ENOTCACHED"));
    }

    #[test]
    fn mcp_process_error_includes_remote_dns_hint() {
        let error = format_mcp_process_error(
            "Failed to read MCP response header: failed to fill whole buffer",
            Some("exit code 1"),
            "TypeError: fetch failed\nCaused by: Error: getaddrinfo ENOTFOUND genai.oci.us-chicago-1.oraclecloud.com",
        );

        assert!(error.contains("MCP process exited before sending a response header"));
        assert!(error.contains("MCP remote server hostname could not be resolved"));
        assert!(error.contains("DNS/network/proxy"));
        assert!(error.contains("Oracle GenAI MCP server URL/region"));
        assert!(error.contains("ENOTFOUND"));
    }

    #[test]
    fn read_only_sql_guard_blocks_non_select_statements() {
        assert!(is_read_only_select_sql("SELECT * FROM orders"));
        assert!(is_read_only_select_sql(
            "WITH recent AS (SELECT * FROM orders) SELECT * FROM recent"
        ));
        assert!(!is_read_only_select_sql("DELETE FROM orders"));
        assert!(!is_read_only_select_sql(
            "SELECT * FROM orders; DROP TABLE orders"
        ));
    }

    #[test]
    fn user_supplied_select_sql_becomes_local_sql_draft() {
        let store = sample_structured_store();
        let mut request = sample_unstructured_request("select * from employees");
        request.knowledge_selection = AiKnowledgeSelection {
            kind: "oracle-structured-store".to_string(),
            registration_id: Some(store.id.clone()),
            mode: Some("sql-draft".to_string()),
        };

        let response = build_user_supplied_sql_draft_response(&store, &request)
            .expect("read-only SQL prompt should become a local draft");

        assert_eq!(response.text, "select * from employees");
        assert_eq!(response.content_type, "sql");
        assert_eq!(
            response.generated_sql.as_deref(),
            Some("select * from employees")
        );
        assert_eq!(response.model.as_deref(), Some("user-supplied-sql"));
        assert!(response
            .explanation_text
            .as_deref()
            .unwrap_or_default()
            .contains("No NL2SQL request was sent"));
    }

    #[test]
    fn user_supplied_non_select_sql_is_not_used_as_a_local_sql_draft() {
        let store = sample_structured_store();
        let request = sample_unstructured_request("delete from employees");

        assert!(build_user_supplied_sql_draft_response(&store, &request).is_none());
    }

    #[test]
    fn build_ai_hosted_agent_invoke_url_uses_region_ocid_and_action() {
        let url = build_ai_hosted_agent_invoke_url(&AiOracleHostedAgentProfile {
            id: "hosted-agent-1".to_string(),
            label: "Travel Agent".to_string(),
            oci_region: "us-chicago-1".to_string(),
            hosted_application_ocid:
                "ocid1.generativeaihostedapplication.oc1.us-chicago-1.amaaaaaatest".to_string(),
            api_version: "20251112".to_string(),
            api_action: "chat".to_string(),
            domain_url: "https://idcs.example.com".to_string(),
            client_id: "client-id".to_string(),
            scope: "scope".to_string(),
            transport: "http-json".to_string(),
        })
        .expect("build oci hosted invoke url");
        assert_eq!(
            url.as_str(),
            "https://application.generativeai.us-chicago-1.oci.oraclecloud.com/20251112/hostedApplications/ocid1.generativeaihostedapplication.oc1.us-chicago-1.amaaaaaatest/actions/invoke/chat"
        );
    }

    #[test]
    fn normalize_hosted_agent_invoke_status_error_explains_oci_404() {
        let message = normalize_hosted_agent_invoke_status_error(
            &AiOracleHostedAgentProfile {
                id: "hosted-agent-1".to_string(),
                label: "Travel Agent".to_string(),
                oci_region: "us-chicago-1".to_string(),
                hosted_application_ocid:
                    "ocid1.generativeaihostedapplication.oc1.us-chicago-1.amaaaaaatest"
                        .to_string(),
                api_version: "20251112".to_string(),
                api_action: "chat".to_string(),
                domain_url: "https://idcs.example.com".to_string(),
                client_id: "client-id".to_string(),
                scope: "scope".to_string(),
                transport: "http-json".to_string(),
            },
            Some(StatusCode::NOT_FOUND),
            "https://application.generativeai.us-chicago-1.oci.oraclecloud.com/20251112/hostedApplications/ocid1.generativeaihostedapplication.oc1.us-chicago-1.amaaaaaatest/actions/invoke/chat",
            "not found",
            None,
            None,
        );

        assert!(message.contains("Hosted agent endpoint was not found"));
        assert!(message.contains("OCI region"));
        assert!(message.contains("hosted application OCID"));
        assert!(message.contains("API action"));
    }

    #[test]
    fn normalize_hosted_agent_invoke_status_error_surfaces_audience_mismatch_context() {
        let message = normalize_hosted_agent_invoke_status_error(
            &AiOracleHostedAgentProfile {
                id: "hosted-agent-1".to_string(),
                label: "Travel Agent".to_string(),
                oci_region: "us-chicago-1".to_string(),
                hosted_application_ocid:
                    "ocid1.generativeaihostedapplication.oc1.us-chicago-1.amaaaaaatest"
                        .to_string(),
                api_version: "20251112".to_string(),
                api_action: "chat".to_string(),
                domain_url: "https://idcs.example.com".to_string(),
                client_id: "client-id".to_string(),
                scope: "https://k8scloud.site/invoke".to_string(),
                transport: "http-json".to_string(),
            },
            Some(StatusCode::UNAUTHORIZED),
            "https://application.generativeai.us-chicago-1.oci.oraclecloud.com/20251112/hostedApplications/ocid1.generativeaihostedapplication.oc1.us-chicago-1.amaaaaaatest/actions/invoke/chat",
            "invalid_token: audience mismatch",
            Some(&Value::String("https://k8scloud.site/".to_string())),
            Some(&Value::String("invoke".to_string())),
        );

        assert!(message.contains("Hosted Application OCID"));
        assert!(message.contains("hosted_application_ocid=ocid1.generativeaihostedapplication"));
        assert!(message.contains("token_aud=https://k8scloud.site/"));
        assert!(message.contains("configured_scope=https://k8scloud.site/invoke"));
        assert!(message.contains("token audience does not match"));
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
        assert_eq!(
            extract_nl2sql_sql_text(&json!({ "jobOutput": { "content": "SELECT 3" } })).as_deref(),
            Some("SELECT 3")
        );
        assert_eq!(
            extract_nl2sql_sql_text(
                &json!({ "jobOutput": { "content": [{ "text": "SELECT 4" }] } })
            )
            .as_deref(),
            Some("SELECT 4")
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
    fn normalize_ai_status_error_message_surfaces_provider_error_body() {
        let message = normalize_ai_status_error_message_with_provider_detail(
            Some(StatusCode::NOT_FOUND),
            r#"{"code":"NotAuthorizedOrNotFound","message":"resource not found","opc-request-id":"req-123"}"#,
            "ai:get-enrichment-job",
            None,
        );

        assert!(message.contains("OCI structured data endpoint or resource was not found"));
        assert!(message.contains("Provider detail (ai:get-enrichment-job)"));
        assert!(message.contains("code=NotAuthorizedOrNotFound"));
        assert!(message.contains("message=resource not found"));
        assert!(message.contains("opc-request-id=req-123"));
    }

    #[test]
    fn normalize_ai_operation_status_error_message_explains_structured_data_404() {
        assert_eq!(
            normalize_ai_operation_status_error_message(
                "ai:generate-sql-from-nl",
                Some(StatusCode::NOT_FOUND),
                "not found"
            ),
            "OCI structured data endpoint or resource was not found. Check the Semantic Store OCID, OCI region, base URL, compartment OCID, enrichment job ID, and IAM policy."
        );
        assert_eq!(
            normalize_ai_operation_status_error_message(
                "ai:chat",
                Some(StatusCode::NOT_FOUND),
                "not found"
            ),
            normalize_ai_status_error_message(Some(StatusCode::NOT_FOUND), "not found")
        );
    }

    #[test]
    fn extract_hosted_agent_oauth_token_response_supports_string_expires_in() {
        let token = extract_hosted_agent_oauth_token_response(
            r#"{"access_token":"token-123","expires_in":"3600"}"#,
        )
        .expect("parse oauth token");

        assert_eq!(token.access_token, "token-123");
        assert_eq!(token.expires_in, Some(3600));
    }

    #[test]
    fn extract_hosted_agent_oauth_token_response_surfaces_oauth_errors() {
        let error = extract_hosted_agent_oauth_token_response(
            r#"{"error":"invalid_client","error_description":"Client authentication failed"}"#,
        )
        .expect_err("oauth error");

        assert!(error.contains("invalid_client"));
        assert!(error.contains("Client authentication failed"));
    }

    #[test]
    fn extract_hosted_agent_oauth_token_response_includes_body_preview_for_non_json() {
        let error =
            extract_hosted_agent_oauth_token_response("<html><body>Sign in required</body></html>")
                .expect_err("non json error");

        assert!(error.contains("non-JSON content"));
        assert!(error.contains("Sign in required"));
    }

    #[test]
    fn normalize_hosted_agent_token_status_error_includes_oauth_error_details() {
        let message = normalize_hosted_agent_token_status_error(
            StatusCode::UNAUTHORIZED,
            "application/json",
            r#"{"error":"invalid_client","error_description":"Bad client secret"}"#,
        );

        assert!(message.contains("Hosted agent authentication failed"));
        assert!(message.contains("invalid_client"));
        assert!(message.contains("Bad client secret"));
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
