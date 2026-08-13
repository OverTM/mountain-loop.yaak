# 移除远程服务通信并将 License 硬编码为 active

## Summary

将 Yaak 客户端与 yaak 服务端的耦合降到最低：

1. **移除通知系统** — 删除 `notifications.rs`、前端监听、`cmd_dismiss_notification` 命令
2. **移除版本更新服务** — 删除 App 端 `updates.rs`、`tauri_plugin_updater` 注册、`useCheckForUpdates` hook、CLI 端 `version_check.rs`
3. **移除应用内反馈** — 删除 `feedback.rs`、`cmd_send_feedback`、`FeedbackToast.tsx`、`featureFeedback.tsx` 及所有 `trackFeatureUsage` 调用点
4. **License 硬编码为 active** — 修改 `check_license` 直接返回 `Active`，`activate/deactivate` 变为 no-op；简化 `LicenseCheckStatus` 枚举只保留 `Active` 变体；同步简化前端 switch 分支

完成后，App 将不再访问 `license.yaak.app`、`update.yaak.app`、`notify.yaak.app`、`api.yaak.app/api/v1/app-feedback`。保留 `api.yaak.app/api/v1/plugins/*`（插件市场）和 `yaak.app` OAuth（CLI 登录/发布插件）。

## Current State Analysis

### 1. 通知系统调用链
- Rust: `crates-tauri/yaak-app-client/src/notifications.rs` — `YaakNotifier` 结构体，`maybe_check` 每 1 小时调一次 `https://notify.yaak.app/notifications`
- 状态管理: `lib.rs:1798-1799` 实例化并 `app.manage`
- 唯一调用点: `lib.rs:2008-2018` 在 `RunEvent::WindowEvent Focused(true)` 中触发
- Tauri 命令: `cmd_dismiss_notification` (`lib.rs:306-313`)，handler 注册在 `lib.rs:1839`
- 前端监听: `apps/yaak-client/lib/initGlobalListeners.tsx:141` 监听 `"notification"` 事件，调 `showNotificationToast` (line 293)
- 前端命令: `tauri.ts:18` 的 `cmd_dismiss_notification`
- 副作用: `notifications.rs:84-101` 在 `#[cfg(feature = "license")]` 下调用 `check_license`，把状态作为 query 参数发给通知服务

### 2. 版本更新服务调用链
- Rust: `crates-tauri/yaak-app-client/src/updates.rs` — `YaakUpdater`、`UpdateMode`、`UpdateTrigger`
- 状态管理: `lib.rs:1794-1795` 实例化
- Tauri 命令: `cmd_check_for_updates` (`lib.rs:1662-1674`)，handler 注册在 `lib.rs:1834`
- 调用点 1 (用户触发): `cmd_check_for_updates` 内 `check_now(...UpdateTrigger::User)`
- 调用点 2 (后台): `lib.rs:1986-2006` 在窗口聚焦时 `maybe_check`，gate 在 `cfg!(feature = "updater")` 和 `settings.autoupdate`
- `tauri_plugin_updater` 注册: `lib.rs:1746-1749` (gate 在 `#[cfg(feature = "updater")]`)
- `get_update_mode` 函数: `lib.rs:2025`
- 前端 hook: `apps/yaak-client/hooks/useCheckForUpdates.tsx`
- 前端调用方: `SettingsDropdown.tsx:5,20,72`、`Settings/SettingsGeneral.tsx:5,27`
- 前端事件监听: `initGlobalListeners.tsx:130` (`update_installed`)、`:136` (`update_available`)，对应 `showUpdateInstalledToast` (line 153) 和 `showUpdateAvailableToast` (line 183)
- 前端 UI: `Settings/SettingsGeneral.tsx:48-113` 用 `<CargoFeature feature="updater">` 包裹 autoupdate 设置项
- Cargo feature: `crates-tauri/yaak-app-client/Cargo.toml:18` (`updater = []`)；`tauri-plugin-updater = "2.10.1"` 在 line 66（非 optional）
- Tauri 配置: `tauri.release.conf.json:3` (`features: ["updater", "license", "wry"]`)、`:17-21` (updater endpoints/pubkey)、`:30` (`createUpdaterArtifacts: true`)
- 错误枚举: `error.rs:51` 的 `UpdaterError` variant
- CLI 端: `crates-cli/yaak-cli/src/version_check.rs` 整个文件，`main.rs:8` 的 `mod version_check;`，`main.rs:36` 的 `version_check::maybe_check_for_updates().await;`

### 3. 应用内反馈调用链
- Rust: `crates-tauri/yaak-app-client/src/feedback.rs` — `send_feedback()` POST 到 `https://api.yaak.app/api/v1/app-feedback`
- Tauri 命令: `cmd_send_feedback` (`lib.rs:296-304`)，handler 注册在 `lib.rs:1841`
- 前端命令: `tauri.ts:51`
- 前端组件: `apps/yaak-client/components/FeedbackToast.tsx`（line 34 调 `invokeCmd("cmd_send_feedback", ...)`）
- 前端入口: `apps/yaak-client/lib/featureFeedback.tsx` — `trackFeatureUsage` (line 83) 被 `GitCommitDialog.tsx:59,71` 调用；`showFeedbackToast` (line 48) 由 `trackFeatureUsage` 触发
- 副作用: `featureFeedback.tsx:84` 用 `appInfo.featureLicense !== true` 作为提前返回条件
- 保留项: `lib.rs:124-130` 的 `"open_feedback"` 菜单项（打开 `https://yaak.app/feedback` 浏览器），与 in-app feedback 无关，保留

### 4. License 调用链
- Rust: `crates-tauri/yaak-license/src/license.rs` — `check_license`、`activate_license`、`deactivate_license`
- Tauri 命令: `commands.rs` 中的 `check`/`activate`/`deactivate`
- 前端 hook: `crates-tauri/yaak-license/index.ts` 的 `useLicense`
- 前端调用方: `SettingsLicense.tsx`、`SettingsDropdown.tsx`、`SettingsInterface.tsx`、`Settings.tsx`、`LicenseBadge.tsx`、`CommercialUseBanner.tsx:98`
- `LicenseCheckStatus` 枚举: `license.rs:76-114`，7 个变体（PersonalUse/Trialing/Error/Active/Inactive/Expired/PastDue）
- `cfg(feature = "license")` 出现位置: `error.rs:31-33`、`notifications.rs:84`、`lib.rs:1741-1744`
- Cargo feature: `Cargo.toml:19` (`license = ["yaak-license"]`)，`yaak-license` 是 optional dep
- 前端 feature flag: `lib.rs:200,221-222` 的 `feature_license`，暴露到 `appInfo.ts:14` 的 `featureLicense`
- `CargoFeature.tsx` 通过 `featureMap` gate UI 渲染（`license`/`updater` 两个 key）
- `Settings.tsx:102` 用 `!appInfo.featureLicense && value === TAB_LICENSE` 隐藏 License 标签页

## Proposed Changes

### Change 1: 移除通知系统

**Rust 端:**
- 删除文件 `crates-tauri/yaak-app-client/src/notifications.rs`
- `lib.rs`: 删除 `mod notifications;` 声明（约在 line 9）
- `lib.rs:306-313`: 删除 `cmd_dismiss_notification` 函数
- `lib.rs:1839`: 从 `generate_handler!` 列表中移除 `cmd_dismiss_notification`
- `lib.rs:1797-1799`: 删除 `let yaak_notifier = YaakNotifier::new(); app.manage(Mutex::new(yaak_notifier));`
- `lib.rs:2008-2018`: 删除窗口聚焦 handler 中调用 `n.maybe_check(&w).await` 的 `tauri::async_runtime::spawn` 块
- 检查 `lib.rs` 顶部 import 是否有 `use notifications::...` 或 `use crate::notifications::...`，一并删除

**前端:**
- `apps/yaak-client/lib/initGlobalListeners.tsx`:
  - 删除 `listenToTauriEvent<YaakNotification>("notification", ...)` 监听（line 141 附近）
  - 删除 `showNotificationToast` 函数（line 293 附近）
  - 删除相关 import（`YaakNotification` 类型等）
- `apps/yaak-client/lib/tauri.ts:18`: 删除 `cmd_dismiss_notification` 联合类型成员
- 删除自动生成的 `YaakNotification`/`YaakNotificationAction` 类型引用（如有），让 ts_rs 重新生成

### Change 2: 移除版本更新服务（App + CLI）

**App Rust 端:**
- 删除文件 `crates-tauri/yaak-app-client/src/updates.rs`
- `lib.rs`: 删除 `mod updates;` 声明（约在 line 11）
- `lib.rs:1662-1674`: 删除 `cmd_check_for_updates` 函数
- `lib.rs:1834`: 从 `generate_handler!` 列表移除 `cmd_check_for_updates`
- `lib.rs:1746-1749`: 删除 `#[cfg(feature = "updater")] { builder = builder.plugin(tauri_plugin_updater::Builder::default().build()); }`
- `lib.rs:1793-1795`: 删除 `let yaak_updater = YaakUpdater::new(); app.manage(Mutex::new(yaak_updater));`
- `lib.rs:1986-2006`: 删除窗口聚焦 handler 中 `if cfg!(feature = "updater") { ... maybe_check ... }` 整块
- `lib.rs:2025` 附近: 删除 `get_update_mode` 函数（如仅被 updates.rs 使用）
- `lib.rs:200,221-222`: 从 `AppMetaData` 结构体删除 `feature_updater` 字段及其赋值
- `error.rs:51`: 删除 `UpdaterError(#[from] tauri_plugin_updater::Error)` variant
- `Cargo.toml`:
  - line 18: 删除 `updater = []` feature
  - line 66: 删除 `tauri-plugin-updater = "2.10.1"` 依赖
- `tauri.release.conf.json`:
  - line 3: `features` 改为 `["wry"]`（移除 `"updater"` 和 `"license"`，后者见 Change 4）
  - line 17-21: 删除 `plugins.updater` 配置（endpoints、pubkey）
  - line 30: 删除 `"createUpdaterArtifacts": true`

**App 前端:**
- 删除文件 `apps/yaak-client/hooks/useCheckForUpdates.tsx`
- `apps/yaak-client/lib/tauri.ts:11`: 删除 `cmd_check_for_updates` 联合类型成员
- `apps/yaak-client/lib/initGlobalListeners.tsx`:
  - 删除 `"update_installed"` 监听（line 130）和 `showUpdateInstalledToast` 函数（line 153）
  - 删除 `"update_available"` 监听（line 136）和 `showUpdateAvailableToast` 函数（line 183）
- `apps/yaak-client/components/SettingsDropdown.tsx`:
  - 删除 `useCheckForUpdates` import (line 5)
  - 删除 `const checkForUpdates = useCheckForUpdates();` (line 20)
  - 删除 "Check for Updates" 菜单项（line 71 附近，含 `hidden: !appInfo.featureUpdater`）
- `apps/yaak-client/components/Settings/SettingsGeneral.tsx`:
  - 删除 `useCheckForUpdates` import (line 5, 27)
  - 删除 `<CargoFeature feature="updater">` 包裹的 autoupdate 设置块 (line 48-113)
- `apps/yaak-client/lib/appInfo.ts:15`: 删除 `featureUpdater: boolean;`
- `apps/yaak-client/components/CargoFeature.tsx`: 删除 `updater: appInfo.featureUpdater` 行（详见 Change 4 — 整个文件可能被删）

**CLI 端:**
- 删除文件 `crates-cli/yaak-cli/src/version_check.rs`
- `crates-cli/yaak-cli/src/main.rs:8`: 删除 `mod version_check;`
- `crates-cli/yaak-cli/src/main.rs:36`: 删除 `version_check::maybe_check_for_updates().await;`
- 检查 `Cargo.toml` 是否有 `update.yaak.app` 相关的依赖配置（无额外依赖，`yaak_api_client` 仍被其他 CLI 命令使用，保留）

**数据库字段处理（决定保留）:**
- `yaak-models/src/models.rs:250-251` 的 `autoupdate` / `auto_download_updates` 字段保留在 `Settings` 结构体中（删除需要新增迁移，风险/收益不划算）
- `yaak-models/src/queries/settings.rs:38,42` 的默认值保留
- 仅删除前端 UI（已包含在 SettingsGeneral.tsx 改动中），字段变为不可配置的 dead default

### Change 3: 移除应用内反馈

**Rust 端:**
- 删除文件 `crates-tauri/yaak-app-client/src/feedback.rs`
- `lib.rs`: 删除 `mod feedback;` 声明
- `lib.rs:296-304`: 删除 `cmd_send_feedback` 函数
- `lib.rs:1841`: 从 `generate_handler!` 列表移除 `cmd_send_feedback`

**前端:**
- 删除文件 `apps/yaak-client/components/FeedbackToast.tsx`
- 删除文件 `apps/yaak-client/lib/featureFeedback.tsx`
- `apps/yaak-client/lib/tauri.ts:51`: 删除 `cmd_send_feedback` 联合类型成员
- `apps/yaak-client/components/git/GitCommitDialog.tsx`:
  - line 15: 删除 `import { trackFeatureUsage } from "../../lib/featureFeedback";`
  - line 59: 删除 `trackFeatureUsage("git-sync");`
  - line 71: 删除 `trackFeatureUsage("git-sync");`
- 全局搜索其它 `showFeedbackToast` / `FeedbackToast` / `featureFeedback` 引用并清理（预计只有 `initGlobalListeners.tsx` 或 `main.tsx` 渲染 `<FeedbackToast>` 的位置，需执行时确认）
- `apps/yaak-client/lib/jotai.ts` 或 settings atom 中的 `promptFeedback` 字段：保留在 Settings 类型中（与 autoupdate 同理），仅删除 UI 入口

### Change 4: License 硬编码为 active 并简化

**Rust 端 (`crates-tauri/yaak-license/src/license.rs`):**
- 简化 `LicenseCheckStatus` 枚举：只保留 `Active` variant，删除 `PersonalUse`/`Trialing`/`Error`/`Inactive`/`Expired`/`PastDue`
  ```rust
  pub enum LicenseCheckStatus {
      Active {
          #[serde(rename = "periodEnd")]
          period_end: DateTime<Utc>,
          #[serde(rename = "cancelAt")]
          cancel_at: Option<DateTime<Utc>>,
      },
  }
  ```
- 重写 `check_license` 直接返回 `Active`：
  ```rust
  pub async fn check_license<R: Runtime>(_window: &WebviewWindow<R>) -> Result<LicenseCheckStatus> {
      Ok(LicenseCheckStatus::Active {
          period_end: Utc::now() + chrono::Duration::days(365 * 10), // 10 年后
          cancel_at: None,
      })
  }
  ```
- 重写 `activate_license` 为 no-op（不再调 HTTP，不再存 activation_id）：
  ```rust
  pub async fn activate_license<R: Runtime>(_window: &WebviewWindow<R>, _license_key: &str) -> Result<()> {
      if let Err(e) = _window.app_handle().emit("license-activated", true) {
          warn!("Failed to emit license-activated event: {}", e);
      }
      Ok(())
  }
  ```
  保留 emit 事件，使前端 `useLicense` 的 `listen("license-activated", ...)` 仍能触发 query 失效
- 重写 `deactivate_license` 为 no-op：
  ```rust
  pub async fn deactivate_license<R: Runtime>(window: &WebviewWindow<R>) -> Result<()> {
      if let Err(e) = window.app_handle().emit("license-deactivated", true) {
          warn!("Failed to emit license-deactivated event: {}", e);
      }
      Ok(())
  }
  ```
- 删除不再使用的代码：
  - 常量 `KV_NAMESPACE`、`KV_ACTIVATION_ID_KEY`、`TRIAL_SECONDS`
  - `build_url` 函数
  - `get_activation_id` 函数
  - payload 结构体 `CheckActivationRequestPayload`、`ActivateLicenseRequestPayload`、`DeactivateLicenseRequestPayload`、`ActivateLicenseResponsePayload`、`APIErrorResponsePayload`
  - `QueryManagerExt` trait（如果仅用于 license KV 操作）
  - 不再使用的 import: `yaak_api::{ApiClientKind, yaak_api_client}`、`yaak_common::platform::get_os_str`、`yaak_models::client_db::ClientDb`、`yaak_models::query_manager::QueryManager`、`yaak_models::util::UpdateSource`、`std::ops::Add`、`std::time::Duration`、`tauri::is_dev`、`crate::error::Error::*`
- 保留 `chrono::{DateTime, Utc}` 和 `serde`/`ts_rs` import
- `error.rs`: 检查 `ClientError`/`ServerError`/`JsonError` variant 是否仍被使用，如全 crate 仅 license 用则一并删除

**Cargo feature 简化:**
- `crates-tauri/yaak-app-client/Cargo.toml`:
  - line 19: 删除 `license = ["yaak-license"]` feature
  - line 85: 把 `yaak-license = { workspace = true, optional = true }` 改为 `yaak-license = { workspace = true }`（非 optional）
- `lib.rs:1741-1744`: 删除 `#[cfg(feature = "license")] { builder = builder.plugin(yaak_license::init()); }`，改为直接 `builder = builder.plugin(yaak_license::init());`
- `lib.rs:200,221-222`: 从 `AppMetaData` 删除 `feature_license` 字段
- `error.rs:31-33`: 删除 `#[cfg(feature = "license")]` gate，直接保留 `LicenseError(#[from] yaak_license::error::Error)` variant（或删除该 variant 如无使用）
- `tauri.release.conf.json:3`: features 改为 `["wry"]`（已在 Change 2 处理）
- `tauri.release.conf.json:12`: 检查 `permissions: ["yaak-license:default"]`，保留（license plugin 仍注册）

**前端简化:**
- `apps/yaak-client/lib/appInfo.ts:14`: 删除 `featureLicense: boolean;`
- `apps/yaak-client/components/CargoFeature.tsx`: 整个文件删除（无 feature 需要 gate）
- `apps/yaak-client/components/Settings/SettingsLicense.tsx`:
  - 删除 `<CargoFeature feature="license">` 包裹（line 18-20）
  - 简化 `renderBanner` switch：只保留 `case "active"`，删除其他 case（trialing/personal_use/inactive/expired/past_due/error）
  - 由于 `check.data.status` 永远是 `"active"`，可以进一步简化为直接渲染 active Banner
  - 保留 Deactivate License 按钮（仍调 `deactivate.mutate()`，后端 no-op，UI 流程不变）
- `apps/yaak-client/components/LicenseBadge.tsx`:
  - 删除 `<CargoFeature feature="license">` 包裹（line 87-89）
  - 简化 status 判断逻辑（只显示 active 状态）
- `apps/yaak-client/components/CommercialUseBanner.tsx`:
  - 由于 license 永远 active，此 banner 永不显示
  - 删除整个文件，移除所有引用点（需搜索 `<CommercialUseBanner` 的渲染位置）
- `apps/yaak-client/components/Settings/SettingsInterface.tsx:189-191`: 删除 `<CargoFeature feature="license">` 包裹
- `apps/yaak-client/components/Settings/Settings.tsx`:
  - line 102: 删除 `hidden: !appInfo.featureLicense && value === TAB_LICENSE` 条件，License 标签页始终显示
  - 删除 `useLicense` 调用（如仅用于此 hidden 判断）
- `apps/yaak-client/components/SettingsDropdown.tsx`: 检查 `useLicense` 用法（line 2,21），如仅用于隐藏菜单项则删除
- `crates-tauri/yaak-license/index.ts:41-44`: 删除 `if (!appInfo.featureLicense) return null;` 分支，`check` query 始终调用 `invoke`

## Assumptions & Decisions

1. **保留 License UI**（按用户回答）：`SettingsLicense.tsx`、`LicenseBadge.tsx` 保留，始终显示 active 状态。`CommercialUseBanner.tsx` 删除（永远不显示，dead code）。
2. **保留 `autoupdate`/`auto_download_updates`/`promptFeedback` 数据库字段**：删除需新增迁移，风险高于收益。仅删除 UI 入口，字段保留为不可见的默认值。
3. **保留插件市场和 CLI OAuth**：`api.yaak.app/api/v1/plugins/*` 和 `yaak.app` 的 OAuth 流程不在本次改动范围。
4. **保留 `open_feedback` 菜单项**（`lib.rs:124-130`）：它只是浏览器打开 `yaak.app/feedback`，与 in-app feedback 是不同功能。
5. **简化 `LicenseCheckStatus` 枚举**：按用户偏好（去除冗余分支、单一逻辑流），只保留 `Active` variant。所有前端 switch case 同步简化。
6. **删除 `CargoFeature.tsx`**：两个 feature flag 都移除后，此组件无存在意义。
7. **`activate_license` / `deactivate_license` 保留 emit 事件**：前端 `useLicense` 监听 `license-activated`/`license-deactivated` 用于触发 query 失效，保留事件以维持前端状态机一致性。
8. **CLI 版本检查一并删除**（按用户回答）：删除 `version_check.rs` 及其在 `main.rs` 的调用。
9. **自动生成的 ts_rs 绑定文件**：执行时如发现 `bindings/notifications.ts`、`bindings/license.ts` 等过期文件，让 ts_rs 自动重新生成；不要手动维护。
10. **不动 `yaak-api` crate**：`yaak_api_client` 仍被 plugins_ext、uri_scheme、CLI auth/plugin 命令使用，保留。

## Verification Steps

执行完所有改动后，按顺序验证：

### Rust 编译验证
1. `cargo check -p yaak-license` — license crate 单独编译通过
2. `cargo check -p yaak-app-client` — App 主 crate 编译通过（确认所有 `mod`/`use` 清理完整）
3. `cargo check -p yaak-cli` — CLI 编译通过（确认 `version_check` 移除干净）
4. `cargo check -p yaak-app-client --features cef`（如适用）— 确认其他 feature 组合不依赖被删代码

### 前端构建验证
5. 在 `apps/yaak-client` 下运行 `pnpm tsc --noEmit`（或项目等效命令）— 确认所有类型引用清理干净，无 dangling import
6. 运行 `pnpm build` — 确认 Vite 打包成功

### 功能验证（手动）
7. 启动 App，进入 Settings → License，确认显示 "Your license is active 🥳"
8. 点击 "Activate License"，输入任意 key，提交后无报错且 Banner 仍显示 active
9. 点击 "Deactivate License"，无报错，Banner 仍显示 active
10. 进入 Settings → General，确认无 "Check for Updates" / autoupdate 选项
11. 确认 Settings 标签页中无反馈相关入口
12. 触发 Git Commit 操作（侧边栏 git 流程），确认无 `trackFeatureUsage` 报错
13. 用浏览器开发者工具或 Wireshark 验证：App 运行 1 小时内不再访问 `license.yaak.app`、`update.yaak.app`、`notify.yaak.app`、`api.yaak.app/api/v1/app-feedback`

### CLI 验证
14. 运行 `yaak --version` — 不再触发版本检查警告
15. 运行 `yaak auth whoami`（已登录状态下）— 仍能正常调 `api.yaak.app/api/v1/whoami`
16. 运行 `yaak plugin install @yaakapp/...` — 仍能正常调 `api.yaak.app/api/v1/plugins/*`

### 回归验证
17. 运行现有测试：`cargo test -p yaak-license`、`cargo test -p yaak-app-client`
18. 运行前端测试：`pnpm test`（如项目配置）
