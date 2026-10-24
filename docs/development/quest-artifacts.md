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

## Authored Artifacts

The authored unit of work is:

```text
solve/quests/<id>.json
```

Commit Quest files because they define the sealed goal, frontiers, metrics, and
constraints.

## Runtime Artifacts

The Solver may create:

- `solve/log/<id>.ndjson`
- `solve/state/<id>.json`
- `solve/report/<id>.md`
- `solve/changes/<id>/...`

Track `solve/quests/<id>/log.ndjson` because it is the append-only source of truth for attempts,
findings, and terminal events. Track `solve/quests/<id>/evidence/` and `solve/changes/` when
they document committed Quest progress or closure.

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
record (`evidence/relocation-inventory.json` with one shard per bundle, and
`evidence/relocation-verification.json`) on the record quest
(`--record-to`, default the `--id` quest), and only then removed with
`git rm`. It refuses quest records, quest logs, required proof artifacts and
paths outside `solve/`, and removes nothing when any member fails. The
inventory is where an old path is looked up: its shard names the bundle, the
bundle's sha256 and its release URL. Historical documents that cite a
relocated path stay as they are.

`solve/state/` is derived cache. The derived cache is git-ignored and may be
rebuilt from the Quest plus event log.

## Artifact Boundaries

Use `docs/` for documentation (user/operator-facing docs, the agent steering
tree under `docs/steering/`, and internal engineering plans) — never for active
work definition.

Use `solve/quests/` for active work definition.

Use source, test, architecture, and steering files for the implementation or
documentation changes required by the Quest. Keep unrelated edits out of an
attempt so the `diff:<path>` artifact remains reviewable.
