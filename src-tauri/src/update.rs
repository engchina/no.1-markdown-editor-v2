use reqwest::header::{ACCEPT, USER_AGENT};
use semver::Version;
use serde::{Deserialize, Serialize};

const GITHUB_LATEST_RELEASE_API_URL: &str =
    "https://api.github.com/repos/engchina/no.1-markdown-editor/releases/latest";
const UPDATE_CHECKER_USER_AGENT: &str = "No.1 Markdown Editor Update Checker";

#[derive(Debug, Clone, Deserialize)]
struct GitHubReleaseAsset {
    name: String,
    browser_download_url: String,
}

#[derive(Debug, Deserialize)]
struct GitHubLatestReleaseResponse {
    tag_name: String,
    html_url: String,
    body: Option<String>,
    published_at: Option<String>,
    assets: Vec<GitHubReleaseAsset>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum UpdatePlatform {
    Windows,
    Macos,
    Linux,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum UpdateArchitecture {
    X86_64,
    AArch64,
    X86,
    Other,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    current_version: String,
    latest_version: String,
    has_update: bool,
    release_url: String,
    download_url: Option<String>,
    asset_name: Option<String>,
    release_notes: String,
    published_at: Option<String>,
}

#[tauri::command]
pub async fn check_for_app_update<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<UpdateCheckResult, String> {
    let current_version = normalize_version(&app.package_info().version.to_string())?;
    let latest_release = fetch_latest_release().await?;
    let latest_version = normalize_version(&latest_release.tag_name)?;

    let current_semver =
        Version::parse(&current_version).map_err(|error| format!("Invalid current version: {error}"))?;
    let latest_semver =
        Version::parse(&latest_version).map_err(|error| format!("Invalid latest version: {error}"))?;

    let selected_asset = select_best_asset(
        &latest_release.assets,
        current_update_platform(),
        current_update_architecture(),
    );

    Ok(UpdateCheckResult {
        current_version,
        latest_version,
        has_update: latest_semver > current_semver,
        release_url: latest_release.html_url,
        download_url: selected_asset.map(|asset| asset.browser_download_url.clone()),
        asset_name: selected_asset.map(|asset| asset.name.clone()),
        release_notes: latest_release.body.unwrap_or_default().trim().to_string(),
        published_at: latest_release.published_at,
    })
}

async fn fetch_latest_release() -> Result<GitHubLatestReleaseResponse, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|error| format!("Failed to initialize update checker: {error}"))?;

    let response = client
        .get(GITHUB_LATEST_RELEASE_API_URL)
        .header(USER_AGENT, UPDATE_CHECKER_USER_AGENT)
        .header(ACCEPT, "application/vnd.github+json")
        .send()
        .await
        .map_err(|error| format!("Failed to contact GitHub Releases: {error}"))?
        .error_for_status()
        .map_err(|error| format!("GitHub Releases request failed: {error}"))?;

    let body = response
        .text()
        .await
        .map_err(|error| format!("Failed to read GitHub Releases response: {error}"))?;

    serde_json::from_str::<GitHubLatestReleaseResponse>(&body)
        .map_err(|error| format!("Failed to parse GitHub Releases response: {error}"))
}

fn normalize_version(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("Missing version string".to_string());
    }

    let normalized = trimmed
        .strip_prefix('v')
        .or_else(|| trimmed.strip_prefix('V'))
        .unwrap_or(trimmed);

    Version::parse(normalized)
        .map(|version| version.to_string())
        .map_err(|error| format!("Invalid semantic version \"{trimmed}\": {error}"))
}

fn current_update_platform() -> UpdatePlatform {
    #[cfg(target_os = "windows")]
    {
        UpdatePlatform::Windows
    }
    #[cfg(target_os = "macos")]
    {
        UpdatePlatform::Macos
    }
    #[cfg(target_os = "linux")]
    {
        UpdatePlatform::Linux
    }
}

fn current_update_architecture() -> UpdateArchitecture {
    #[cfg(target_arch = "x86_64")]
    {
        UpdateArchitecture::X86_64
    }
    #[cfg(target_arch = "aarch64")]
    {
        UpdateArchitecture::AArch64
    }
    #[cfg(target_arch = "x86")]
    {
        UpdateArchitecture::X86
    }
    #[cfg(not(any(
        target_arch = "x86_64",
        target_arch = "aarch64",
        target_arch = "x86"
    )))]
    {
        UpdateArchitecture::Other
    }
}

fn select_best_asset<'a>(
    assets: &'a [GitHubReleaseAsset],
    platform: UpdatePlatform,
    architecture: UpdateArchitecture,
) -> Option<&'a GitHubReleaseAsset> {
    assets
        .iter()
        .filter_map(|asset| score_asset(asset, platform, architecture).map(|score| (score, asset)))
        .max_by_key(|(score, _)| *score)
        .map(|(_, asset)| asset)
}

fn score_asset(
    asset: &GitHubReleaseAsset,
    platform: UpdatePlatform,
    architecture: UpdateArchitecture,
) -> Option<(u8, u8, u8)> {
    let lower_name = asset.name.to_ascii_lowercase();
    let extension_score = platform_extension_score(&lower_name, platform)?;

    if mentions_other_platform(&lower_name, platform) {
        return None;
    }

    let architecture_score = architecture_match_score(&lower_name, architecture)?;
    let generic_score = u8::from(!mentions_any_architecture(&lower_name));

    Some((extension_score, architecture_score, generic_score))
}

fn platform_extension_score(name: &str, platform: UpdatePlatform) -> Option<u8> {
    match platform {
        UpdatePlatform::Windows => {
            if name.ends_with(".msi") {
                Some(3)
            } else if name.ends_with(".exe") {
                Some(2)
            } else {
                None
            }
        }
        UpdatePlatform::Macos => {
            if name.ends_with(".dmg") {
                Some(3)
            } else {
                None
            }
        }
        UpdatePlatform::Linux => {
            if name.ends_with(".appimage") {
                Some(3)
            } else if name.ends_with(".deb") {
                Some(2)
            } else if name.ends_with(".rpm") {
                Some(1)
            } else {
                None
            }
        }
    }
}

fn mentions_other_platform(name: &str, platform: UpdatePlatform) -> bool {
    let windows_tokens = ["windows", "win32", "win64"];
    let mac_tokens = ["macos", "darwin", "osx"];
    let linux_tokens = ["linux", "appimage", ".deb", ".rpm"];

    match platform {
        UpdatePlatform::Windows => contains_any(name, &mac_tokens) || contains_any(name, &linux_tokens),
        UpdatePlatform::Macos => contains_any(name, &windows_tokens) || contains_any(name, &linux_tokens),
        UpdatePlatform::Linux => contains_any(name, &windows_tokens) || contains_any(name, &mac_tokens),
    }
}

fn architecture_match_score(name: &str, architecture: UpdateArchitecture) -> Option<u8> {
    let x86_64_tokens = ["x86_64", "x64", "amd64"];
    let arm64_tokens = ["arm64", "aarch64"];
    let x86_tokens = ["i686", "ia32", "x86"];

    let mentions_x86_64 = contains_any(name, &x86_64_tokens);
    let mentions_arm64 = contains_any(name, &arm64_tokens);
    let mentions_x86 = !mentions_x86_64 && contains_any(name, &x86_tokens);

    match architecture {
        UpdateArchitecture::X86_64 => {
            if mentions_arm64 || mentions_x86 {
                None
            } else if mentions_x86_64 {
                Some(2)
            } else {
                Some(1)
            }
        }
        UpdateArchitecture::AArch64 => {
            if mentions_x86_64 || mentions_x86 {
                None
            } else if mentions_arm64 {
                Some(2)
            } else {
                Some(1)
            }
        }
        UpdateArchitecture::X86 => {
            if mentions_x86_64 || mentions_arm64 {
                None
            } else if mentions_x86 {
                Some(2)
            } else {
                Some(1)
            }
        }
        UpdateArchitecture::Other => Some(1),
    }
}

fn mentions_any_architecture(name: &str) -> bool {
    contains_any(
        name,
        &["x86_64", "x64", "amd64", "arm64", "aarch64", "i686", "ia32", "x86"],
    )
}

fn contains_any(value: &str, tokens: &[&str]) -> bool {
    tokens.iter().any(|token| value.contains(token))
}

#[cfg(test)]
mod tests {
    use super::architecture_match_score;
    use super::normalize_version;
    use super::select_best_asset;
    use super::GitHubReleaseAsset;
    use super::UpdateArchitecture;
    use super::UpdatePlatform;
    use semver::Version;

    fn asset(name: &str, browser_download_url: &str) -> GitHubReleaseAsset {
        GitHubReleaseAsset {
            name: name.to_string(),
            browser_download_url: browser_download_url.to_string(),
        }
    }

    #[test]
    fn normalize_version_accepts_optional_v_prefix() {
        assert_eq!(normalize_version("v0.11.0").unwrap(), "0.11.0");
        assert_eq!(normalize_version("0.11.0").unwrap(), "0.11.0");
    }

    #[test]
    fn semver_comparison_detects_newer_release() {
        let current = Version::parse(&normalize_version("0.11.0").unwrap()).unwrap();
        let latest = Version::parse(&normalize_version("v0.12.0").unwrap()).unwrap();

        assert!(latest > current);
    }

    #[test]
    fn windows_prefers_msi_and_matching_architecture() {
        let assets = vec![
            asset("No1MarkdownEditor_0.12.0_arm64.exe", "https://example.com/arm64.exe"),
            asset("No1MarkdownEditor_0.12.0_x64.exe", "https://example.com/x64.exe"),
            asset("No1MarkdownEditor_0.12.0_x64.msi", "https://example.com/x64.msi"),
        ];

        let selected = select_best_asset(&assets, UpdatePlatform::Windows, UpdateArchitecture::X86_64)
            .expect("expected a windows installer");

        assert_eq!(selected.name, "No1MarkdownEditor_0.12.0_x64.msi");
    }

    #[test]
    fn macos_prefers_dmg() {
        let assets = vec![
            asset("No1MarkdownEditor_0.12.0_windows_x64.msi", "https://example.com/windows.msi"),
            asset("No1MarkdownEditor_0.12.0_macos_universal.dmg", "https://example.com/macos.dmg"),
        ];

        let selected = select_best_asset(&assets, UpdatePlatform::Macos, UpdateArchitecture::AArch64)
            .expect("expected a macOS installer");

        assert_eq!(selected.name, "No1MarkdownEditor_0.12.0_macos_universal.dmg");
    }

    #[test]
    fn linux_prefers_appimage_then_deb_then_rpm() {
        let assets = vec![
            asset("No1MarkdownEditor_0.12.0_linux_x86_64.rpm", "https://example.com/linux.rpm"),
            asset("No1MarkdownEditor_0.12.0_linux_x86_64.deb", "https://example.com/linux.deb"),
            asset(
                "No1MarkdownEditor_0.12.0_linux_x86_64.AppImage",
                "https://example.com/linux.appimage",
            ),
        ];

        let selected = select_best_asset(&assets, UpdatePlatform::Linux, UpdateArchitecture::X86_64)
            .expect("expected a linux installer");

        assert_eq!(selected.name, "No1MarkdownEditor_0.12.0_linux_x86_64.AppImage");
    }

    #[test]
    fn unsupported_assets_fall_back_to_release_page() {
        let assets = vec![
            asset("No1MarkdownEditor_0.12.0_source.zip", "https://example.com/source.zip"),
            asset("No1MarkdownEditor_0.12.0_checksums.txt", "https://example.com/checksums.txt"),
        ];

        let selected = select_best_asset(&assets, UpdatePlatform::Windows, UpdateArchitecture::X86_64);
        assert!(selected.is_none());
    }

    #[test]
    fn explicit_architecture_mismatch_is_rejected() {
        assert_eq!(
            architecture_match_score("No1MarkdownEditor_0.12.0_arm64.dmg", UpdateArchitecture::X86_64),
            None
        );
        assert_eq!(
            architecture_match_score("No1MarkdownEditor_0.12.0_x64.msi", UpdateArchitecture::X86_64),
            Some(2)
        );
    }
}
