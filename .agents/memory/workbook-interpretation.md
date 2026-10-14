---
name: Workbook interpretation
description: Meaning and uncertainty of the user's original peaking workbook.
---

The user wants a professional powerlifting coach/client tracker and also tracks their own preparation for a meet.

**Why:** The original request combines program distribution to clients with personal lift progress and volume tracking.

**How to apply:** Keep coach review and personal workout logging distinct, and do not let coaches silently enter workouts as their clients.

The supplied workbook has Excel-coerced date serials where set/rep ranges and notes were intended. Its weight cells mix numeric loads, bodyweight, plates, chains, and free-text attempts. The user has specified that source weights default to pounds.

**Why:** Treating these source cells as completed sets would fabricate reps, inflate volume, and misstate performance. Date month/day values may suggest a range but cannot prove the user's intent.

**How to apply:** Flag suspected ranges for explicit review and keep prescriptions separate from logged completion. The user clarified that non-percentage workbook weights were filled-in results after workouts, not targets: do not suggest them or copy them into new logs. Only percentage prescriptions prefill editable weights. Do not backfill or alter completed deload sessions.

The current workbook library should contain only Deload and Peak. Completed workout history must be preserved when removing other templates.

**Why:** The user wants current meet preparation only and has already entered completed deload workouts.

**How to apply:** Seed only the current blocks; preserve assignment snapshots needed for history. Sets are performed when actual reps and load are entered (zero external load is allowed for accessories), without per-set checkboxes. Accessory RPE is optional. The 1RM trend must exclude low-effort estimates and use only actual maxes or RPE 9 estimates.

The product is focused on the Navy Powerlifting team, with usna.edu styling. Back buttons, clear sets/reps labels, rep-range targets, and independently editable per-set weights apply to both current and future programs.

**Why:** The user explicitly requested these as app-wide conventions, not changes to one training block.

**How to apply:** Preserve these conventions in new screens and program types; never relabel historical logged kilograms as pounds.
