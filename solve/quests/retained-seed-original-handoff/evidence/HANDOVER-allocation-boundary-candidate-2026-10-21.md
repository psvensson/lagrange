---
audience: development
documentClass: current
---

# Original allocation boundary: unreviewed source candidate

Date: 2026-10-21. Exact parent: `8b3638233da30c6a358e80be4b23021eb00b9e4c`.
This is a bounded continuation of the existing
[pre-source handover](HANDOVER-pre-source-2026-10-21.md), not a new contract,
independent approval, Solver landing or native-proof receipt.

## Source changes

1. The existing preparation owner now consumes the existing seed-catalog
   validator before member I/O in both `prepare` and `inspect`. Expected
   directory, node and build identity come from the owner's construction
   context, not from the declaration under inspection. An empty, partial,
   duplicate or foreign cohort cannot be treated as a complete allocation.
   The constructor therefore requires `nodeId` and `buildDigest` when these
   methods are used. Future startup composition must supply the actual values.
2. The existing declaration validator refuses missing expected identities,
   invalid declaration timestamps and an incarnation aliased to its birth
   token. It still owns canonical member enumeration; no catalog is copied
   into the lifecycle owner.
3. The existing row store permits only `UNUSED -> SUBMITTED -> TRANSFERRED`.
   It checks the exact reserved member, keeps declaration/member identity in
   the conditional update and verifies exact declaration readback. Issuance
   checks the actual anchor, unspent rights and NEVER_OPENED history. It no
   longer accepts another declaration's already-ISSUED row as success.
   Lost COMMIT answers still use actual readback; unreadable committed results
   retain debt rather than regaining submission permission.

No startup, activation, native callback, service-registration or public
admission consumer is wired by this patch. Storage primitives are not live
opening capabilities or independent current authority.

## Added witnesses and actual execution

- `test/raft/raft-rs-original-allocation-store.test.js`: 33 row-storage cases.
- `test/raft/raft-rs-original-allocation-preparation.test.js`: complete-catalog
  preparation, malformed/partial/foreign cohorts, independent construction
  identity, virgin-inventory ordering, revocation and directory-custody cases.
  These preparation witnesses have NOT been executed with repository dependencies.

The [probe record](allocation-boundary-probe-20261021.json) binds the exact
source/test bytes and all limits. All five JavaScript files passed syntax
checking. A source-only patch applied cleanly to the verified baseline subset,
and its resulting bytes were compared with the candidate.

The external isolated storage probe uses real in-memory SQLite, but NOT the
production better-sqlite3 dependency or the complete repository runner. Its
loader substitutes a node:sqlite compatibility surface, a node:test runner
bridge, and the verbatim `commitDurably` function with its used constants from
the pinned source. The original-allocation store module itself is imported
unchanged. This is supplemental unit experimentation, not crash durability,
canonical native execution, or complete owner-interaction proof.

Initial probe: baseline 6/28 passed; candidate 28/28 passed. Expanded probe:
baseline 8/33 passed; candidate 33/33 passed, zero skipped. Three deliberate
source regressions were detected by the same expanded assertions: permissive
rights transitions (19 failures), accepting foreign issuance readback (one),
and ignoring exact reserved-birth identity (one). The initial and expanded
failed logs and frozen initial witness are retained in the conversation's
source/evidence bundle; they have not been relabelled as native measurements.

## Preservation and outstanding work

This session has no full checkout, installed repository dependencies, local
repository hooks, independent reviewer or native execution result. A remote
WIP ref, when present, is API-based preservation only: it is NOT a normal
hook-verified implementation commit, `solve land`, `npm run publish`, or a
permission to merge. No existing worktree, staged index or branch is changed.

All eight receipt rows and the sealed Quest remain untouched and false. The
original cold public-entry RED remains unchanged. The last recorded
294-finding documentation audit was not rerun; no current audit count is
claimed for this candidate.

Next, recover this exact candidate in a complete isolated checkout. Refresh
canonical test metadata with the repository owner command, inspect the new
preparation-to-catalog import for dependency cycles, and obtain independent
source/witness review. Run the repository's applicable static and classified
test gates without adapters or skipped tests. Preserve every failed attempt.
Do not count the isolated probe as the required locked retry-0 native run.

Then continue the still-missing original live admission and cold recovery
composition, checking current leader role, an available valid native term and
the exact tenure token together. Exact ACTIVE SERVICES generations, reserved
cluster identity, nonserving public admission, real cleanup and the typed
HANDOFF_COMPLETE_SERVING_DEFERRED public result remain open. No cold spent-right
reopening, full serving, U1/TX1/FreshMG, corpus, publication or release claim
follows from this candidate.
