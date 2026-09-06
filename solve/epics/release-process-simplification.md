---
id: release-process-simplification
status: open
proof: deterministic
legacy: true
roadmapRow: null
graduatesTo: null
quests:
  - release-process-simplification-v2
  - release-process-simplification
authorizes: []
legacyStatus: active
---

# Release process simplification

## Intent

Make releasing deterministic, cheap and honest. The 0.2 program coupled the
release to a live convergence SLO (three consecutive five-node GCP MovieLens
runs inside a 60 s budget) that the shipped bytes have not met since
2026-08-30; the freeze-and-replay ladder (digest-bound row Quests, seven
local receipts, evidence ingestion, independent row review) re-proved what
the tag workflow already proves and turned every landing into a five-hour
restart. Decided with the operator on 2026-09-05: step down from the 0.2
tag and rebuild the process around six changes.

## Deliverables (each with a witness)

1. **Deterministic release exit.** `RELEASE.md`
   defines the exit as: full corpus green on the exact SHA (`ci / gate`),
   artifacts build and smoke inside the `v*` tag workflow, changelog honest.
   Formation timing is a measured number quoted in the notes, never a gate.
   `solve/epics/release-0-2.md` gains a decision-log entry superseding
   G1–G6 by that document. The published `CHANGELOG.md` 0.2.0 section moves
   back under `[Unreleased]` (nothing is tagged) and states the measured
   formation state instead of promising a replay.
2. **Tag workflow is the only release proof.** `scripts/release-preflight.js`
   (`npm run release:preflight`) is the five-item pre-tag check: clean tree
   (release content only), HEAD equals `origin/main`, `ci / gate` success on
   the exact HEAD, `release-notes --mode check` plus version literal
   agreement, and no existing tag for the version; it prints the exact tag
   commands and never tags. The release-0-2 verification machinery
   (scenario runners, receipt recorders, derivation, constants, candidate
   identity, their tests, package scripts and tool descriptions) is deleted;
   the row Quests are parked or their drafts removed.
3. **No corpus re-runs at release time.** With (2) the per-head proof is the
   pre-push corpus once plus the CI cone; `check:release` runs only inside
   the tag workflow on the tagged SHA. Documented in (1); the pre-push hook
   comment that names a nightly full gate is corrected (there is none).
4. **Small, frequent releases.** Cadence and the `[Unreleased]` → `[x.y.z]`
   cut are part of the pre-tag checklist in (1).
5. **Formation health as a standing signal.** `examples/service-data-affinity/
   formation-verdict.js` derives one machine-readable verdict from the seed
   log and the schema-admission evidence (seed event-loop gaps inside the
   formation window, ready-lease-incomplete waits and their unready sets,
   the final critical spread gap and in-flight count, admission end state,
   an ordered causal chain and a reason code); the live report carries it.
   `scripts/checks/formation-health.js` (`npm run health:formation`) runs the
   GCP demo or reads an existing report, appends one trend record under
   `data/formation-health/`, and prints the trend; a scheduled
   `formation-health.yml` workflow runs it on the GCP runner and uploads
   the report.
6. **Local seed-starvation gate.** `npm run check:formation`
   (`scripts/checks/run-formation-seed-budget.js`) runs the demo's local
   five-process formation phase only (`--formation-only`) and fails when the
   formation verdict is not PASS or the seed's unexplained blocked time in
   the formation window exceeds a hardware-relative budget. Documented as
   the required local check before landing control-plane changes.

## Witness classes

Unit witnesses for the verdict derivation (fixture seed log + admission
evidence from the 2026-09-05T19-10-11 failed run and a passing shape), the
preflight decisions (injected git/gh/fs), the trend store, and the seed
budget decision; a live local `check:formation` run recorded as evidence;
docs checked by the steering pack freshness check.
