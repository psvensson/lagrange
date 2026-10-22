---
scope: governance
status: canonical
always_load: false
source_of_truth: self
last_reviewed: 2026-10-22
---

> **Canonical source.** Quest artifact ownership and tracked data. Reached
> from the [`owner router`](../steering/router.md).

# Quest Artifacts

## Authored Records And Evidence

The current record layout is owned by `scripts/solve/schema.js` and
`scripts/solve/store.js`:

| Path | Authority |
| --- | --- |
| `solve/quests/<id>/quest.json` | The quest statement, owning epic (or `class: fix`), constraints, one `doneWhen`, and sealing head. |
| `solve/quests/<id>/log.ndjson` | Append-only findings, attempts, verifications and terminal entries. |
| `solve/quests/<id>/evidence/` | Small retained proof artifacts where the probe requires them. |
| `solve/epics/<id>.md` | Epic scope and acceptance, linked quests, and the integration owner's current summary. |

Track the record, log and required proof artifacts with the work. Preserve
sealed acceptance and historical entries; corrections are appended, and a dead
premise is explicitly superseded. `scripts/solve/probes.js` owns which artifact
paths a sealed probe requires. Historical `solve/changes/` artifacts remain
valid references for the attempts that recorded them.

Large or binary evidence belongs in the existing evidence store. Use
`node scripts/solve.js evidence add <path> --id <id>`; the command records the
reference only after upload, re-download and hash verification. Follow the
[`runbook`](solver-runbook.md#partial-clones-solve-v2-phase-1) for storage limits
and explicit replacement authority. Do not rewrite earlier evidence or imply
that an old run measured a new candidate.

## One Current Summary

Keep one mutable current summary in the owning epic, maintained by its
integration owner. It links the current accepted baseline, active blocker and
owned interaction, work awaiting review/test/integration, relevant quest and
evidence records, and the next action with its owner. It is an index into those
authorities, not another acceptance contract or evidence ledger. Update that
summary when state changes; append historical findings and verdicts to the
quest log. Avoid parallel status documents that later agents must reconcile.
A standalone `class: fix` uses its existing quest record and log; it does not
need a new epic solely for this summary.

`probe` and `board` project the records on demand. Optional reports and caches
are convenience views and cannot override their source records. Retired v1
state/report paths and executor files do not define the current workflow.

## Artifact Boundaries

Use `docs/` for guidance and engineering plans, `solve/quests/` for bounded
work records, and `solve/epics/` for milestone coordination. Implementations,
tests and contracts remain in their owning directories. Keep each attempt's
changed interaction reviewable; put unrelated work in its own unit rather
than adding it to the same patch or replicating its status in another ledger.
