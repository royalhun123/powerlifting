---
name: Vite peer dependency identity
description: Why unrelated Vite plugin type errors can follow package removal
---

Vite plugin type errors can result from distinct optional-peer resolutions of the same Vite version, not from incompatible plugin source.

**Why:** Removing the spreadsheet reader changed one artifact's resolved peer graph while the mockup sandbox still referenced a different Vite peer instance, breaking the root typecheck used by Vercel.

**How to apply:** Inspect the full type-error module paths and align package resolution across affected artifacts before adding casts or changing plugin code. Verify the root typecheck, not only the platform package.
