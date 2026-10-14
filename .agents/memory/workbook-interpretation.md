---
name: Workbook interpretation
description: Meaning and uncertainty of the user's original peaking workbook.
---

The user wants a professional powerlifting coach/client tracker and also tracks their own preparation for a meet.

**Why:** The original request combines program distribution to clients with personal lift progress and volume tracking.

**How to apply:** Keep coach review and personal workout logging distinct, and do not let coaches silently enter workouts as their clients.

The supplied workbook has Excel-coerced date serials where set/rep ranges and notes were intended. Its weight cells mix numeric loads, bodyweight, plates, chains, and free-text attempts. The user has specified that source weights default to pounds.

**Why:** Treating these source cells as completed sets would fabricate reps, inflate volume, and misstate performance. Date month/day values may suggest a range but cannot prove the user's intent.

**How to apply:** Preserve source references, flag suspected ranges for explicit review, keep original prescriptions separate from logged completion, use pounds for source weights, and let the athlete set session units and reference maxes. Do not infer historical completed sets from prescriptions.

The product is focused on the Navy Powerlifting team, with usna.edu styling. Back buttons, clear sets/reps labels, rep-range targets, and independently editable per-set weights apply to both current and future programs.

**Why:** The user explicitly requested these as app-wide conventions, not changes to one training block.

**How to apply:** Preserve these conventions in new screens and program types; never relabel historical logged kilograms as pounds.
