---
scope: governance
status: canonical
always_load: false
source_of_truth: self
last_reviewed: 2026-10-24
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
and explicit replacement authority; the size thresholds and the relocation of
already committed evidence are in
[Bulk Evidence Goes To The Store](#bulk-evidence-goes-to-the-store). Do not
rewrite earlier evidence or imply that an old run measured a new candidate.

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

## Bulk Evidence Goes To The Store

The tree keeps the evidence a reader needs to follow a quest: its receipts,
oracles and other proof its sealed `doneWhen` requires, and its short
reviewed documents (contracts, plans, designs, dossiers, reviews, handovers,
manifests). Raw measurement output does not stay in git. Lab and controller
logs, TAP streams, large JSON dumps, copied source trees and any archive
belong in the `solve-evidence` store, referenced from the quest log by the
evidence finding the store owner appends (sha256, size, asset name, URL).

Route evidence through the store when any of these holds:

- the file is an archive (`.tar.gz`, `.tgz`, `.tar`, `.gz`, `.zip`, `.7z`,
  `.xz`, `.bz2`), whatever its size; the pre-commit binary guard refuses it;
- a single evidence file is over 256 KiB;
- a quest's `evidence/` directory would grow past 1 MiB.

A single file is uploaded with
`node scripts/solve.js evidence add <path> --id <quest>`. Evidence that is
already committed, or a directory of raw output, is relocated as one bundle
with `node scripts/solve.js evidence relocate --id <quest> --paths-file <list>
--source-commit <sha>`: the listed paths are bundled with a `MANIFEST.json`
(path, bytes, sha256, adding commit), uploaded through the same add path,
downloaded again and verified member by member against the manifest and the
blob at the source commit, recorded in an inventory and a verification
record, and only then removed with `git rm`. It refuses quest records, quest
logs, required proof artifacts and paths outside `solve/`, and removes
nothing when any member fails. The inventory is where an old path is looked
up: its shard names the bundle, the bundle's sha256 and its release URL.
Historical documents that cite a relocated path stay as they are.

Relocation records live in `solve/changes/evidence-relocation/<quest>/`,
named by the record quest (`--record-to`, default the `--id` quest):
`relocation-inventory.json` (the index), `relocation-inventory/<bundle>.json`
(one shard per bundle) and `relocation-verification.json`. They never go in
a quest's `evidence/`. A closed quest keeps only `quest.json`, `log.ndjson`
and the artifacts its sealed `doneWhen` requires, so records written there
would go off-shape as soon as the record quest closes; and the records are
cross-cutting, mapping paths of many quests, so they belong with the other
cross-cutting records under `solve/changes/`. That directory still counts
toward the active-state budget, and the 1 MiB and binary rules still apply
there. The location is one constant of the evidence owner
(`RELOCATION.RECORDS_DIR` in `scripts/solve/evidence-store.js`), which the
relocation acceptance checker also reads.

## Artifact Boundaries

Use `docs/` for guidance and engineering plans, `solve/quests/` for bounded
work records, and `solve/epics/` for milestone coordination. Implementations,
tests and contracts remain in their owning directories. Keep each attempt's
changed interaction reviewable; put unrelated work in its own unit rather
than adding it to the same patch or replicating its status in another ledger.
