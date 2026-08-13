use crate::error::Result;
use chrono::{DateTime, Utc};
use log::warn;
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Runtime, WebviewWindow};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case", tag = "status", content = "data")]
#[ts(export, export_to = "license.ts")]
pub enum LicenseCheckStatus {
    Active {
        #[serde(rename = "periodEnd")]
        period_end: DateTime<Utc>,
        #[serde(rename = "cancelAt")]
        cancel_at: Option<DateTime<Utc>>,
    },
}

/// License is always considered active. No remote server is contacted.
pub async fn activate_license<R: Runtime>(_window: &WebviewWindow<R>, _license_key: &str) -> Result<()> {
    if let Err(e) = _window.app_handle().emit("license-activated", true) {
        warn!("Failed to emit license-activated event: {}", e);
    }
    Ok(())
}

/// License is always considered active. No remote server is contacted.
pub async fn deactivate_license<R: Runtime>(window: &WebviewWindow<R>) -> Result<()> {
    if let Err(e) = window.app_handle().emit("license-deactivated", true) {
        warn!("Failed to emit license-deactivated event: {}", e);
    }
    Ok(())
}

/// License is always considered active. No remote server is contacted.
pub async fn check_license<R: Runtime>(_window: &WebviewWindow<R>) -> Result<LicenseCheckStatus> {
    Ok(LicenseCheckStatus::Active {
        period_end: Utc::now() + chrono::Duration::days(365 * 10),
        cancel_at: None,
    })
}
