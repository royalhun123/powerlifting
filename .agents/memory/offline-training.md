---
name: Offline training safety
description: Offline scope, private device data, and safe conflict handling
---

Offline mode is for previously downloaded workouts and automatic draft saves plus explicit completion, not general offline administration or program editing. Do not promise background syncing on iOS; sync when the app is open and connected.

**Why:** The user wants workouts to remain usable without gym Wi-Fi and upload later without losing lifter history or crossing workspace boundaries.

**How to apply:** Keep cached training data account-scoped, verify identity before syncing, retain failed local saves, and surface conflicts rather than overwriting another device's work. Retried saves must not duplicate or resurrect deleted workouts. Explicit sign-out must warn before deleting unsynced local work.

Test offline reopening against a production build through the preview HTTPS URL.

**Why:** The testing browser runs separately; shell-local connectivity does not establish browser access.

**How to apply:** Use browser-accessible routing for service-worker tests and remove any temporary preview configuration afterward.

Draft recovery must be integrated into the normal workout draft workflow, not a separate feature. There should be no Save draft command: save locally as the user types and sync automatically.

**Why:** The user explicitly requested automatic sync instead of a separate recovery feature or manual Save draft action.

**How to apply:** Keep Complete session explicit. Protect partial inputs locally even when they are not yet valid for server sync, and retain the existing identity, workspace, conflict and sign-out safeguards.

The user confirmed the phone test worked. Keep the top strip limited to Online/Offline and Synced/Not synced, with installation/offline help in Settings. Do not offer local workout-file downloads.

**Why:** The user wants the server to be the destination for workout data and asked to remove sync-detail/error/help clutter from the top bar.

**How to apply:** Retain temporary local buffering and conflict safeguards underneath the simplified UI. Never report Synced while changes remain pending or blocked.
