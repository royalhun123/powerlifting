---
name: Offline training safety
description: Offline scope, private device data, and safe conflict handling
---

Offline mode is for previously downloaded workouts and explicit draft/completion saves, not general offline administration or program editing. Do not promise background syncing on iOS; sync when the app is open and connected.

**Why:** The user wants workouts to remain usable without gym Wi-Fi and upload later without losing lifter history or crossing workspace boundaries.

**How to apply:** Keep cached training data account-scoped, verify identity before syncing, retain failed local saves, and surface conflicts rather than overwriting another device's work. Retried saves must not duplicate or resurrect deleted workouts. Explicit sign-out must warn before deleting unsynced local work.

Test offline reopening against a production build through the preview HTTPS URL. The testing browser cannot reach a shell-only localhost server, even when shell curl succeeds.

**Why:** A localhost-only production-preview attempt returned connection refused in the separate browser environment.

**How to apply:** Use browser-accessible routing for service-worker tests and remove any temporary preview configuration afterward.
