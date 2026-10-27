# U1 inventory correction test-only checkpoint, 2026-10-18

Status: prepared WIP; no production edit, no source-test execution and no implementation acceptance.

Author: `subagent:/root/u1_inventory_lifecycle`. Base: `f5717e6f53a3ae18c2f470a507a180c3eca2cc17`.

The test file is `test/wasm-service/bound-creation-restart.integration.test.js`. Its existing C6 component fixture uses real SQLite journal/resource owners, WASM raft-rs objects, physical files, data-directory process custody, and runtime endpoint/services writers. Orderly composition restart is not abrupt-process or production-cluster proof.

## Retained independent witnesses

Adopts the eleven F2–F6/control cases from `verifier-recovery-u1-cloud/independent/independent-witnesses-complete.patch` which target this file. The four reservation cases in its other file belong to F1 and were not duplicated here. Original evidence bytes remain unchanged.

Two explicit setup adaptations preserve the measured failure while accommodating the proposed contract:

- The overlap witness releases its first scan before awaiting both concurrent callers, then asserts one underlying scan, shared applied plans and no subsequent rescan/memo regression. A correct shared promise cannot complete the second caller while the first scan is deliberately blocked.
- Predecessor-residue setup observes dispatch settlement, real CLOSED/local evidence and IN_PROGRESS journal state without requiring the old false `REMOVE_COMPLETED` answer after a failed journal write. The oracle still requires old original journal completion and successor preservation.

Formatting-only edits make adopted snippets satisfy the repository lint style. Original logs and patches remain the source of the already-measured red cases.

## New discriminators prepared

Seven additional cases exercise:

1. Real future binding F, later real selection, and exact original CREATE redelivery while J's memo is HELD or ACTIVE (two cases). Each checks original request bytes, exact F admission, J physical-object preservation and original-ID routing.
2. Local inspection suspended across handler shutdown and actual directory-owner handoff: no late memo, work, outcome or readiness mutation.
3. Physical CLOSED/local RETIRED with original-journal completion unavailable: startup retains REMOVING debt, then exact REMOVE retry completes the original row without another STOP journal.
4. A real PENDING-to-IN_PROGRESS transition during the journal observation: one SQL call, one retained original operation.
5. Identical duplicate reader observations fold, while conflicting same-ID observations fail the whole unapplied inventory and keep readiness closed (two cases).

Design v3 plus its proposed D2/D3 addendum remains under root independent review. Additional approved gate-bound and physical-currentness witnesses will be added before their respective source corrections. This checkpoint establishes a fixed test-only subject for the first lab run; it does not claim the complete future witness matrix has already been implemented.

## Validation at preparation

`node --check` parses the test file. `git diff --check` passes. Scoped ESLint is run on the edited test file. No source tests, mutation tests or lab jobs were executed by this agent. These parser/style observations cannot certify runtime behavior. Source implementation remains blocked on independent design approval and required measured red evidence.

## Checkpoint update before preservation

Root independently approved the exact v3 and addendum hashes in `u1-inventory-v3-independent-design-verdict-20261018.md`; its record travels with the root integration branch. This is design/oracle approval only. Root authorizes proceeding after this checkpoint using retained exact-source historical red evidence where the witness is unchanged; adapted and new oracles are still unexecuted.

The normal pre-commit was attempted and failed its binary guard because Node 24's `spawnSync git` returned EPERM in this sandbox, despite producing the expected Git output. Its continuing inventory generator was interrupted after that known prerequisite failure. It made no tracked derived-file change. The documented WIP-only `LAGRANGE_SKIP_PRECOMMIT=1` preservation path is used for this test-only branch commit; this is no passed-hook or source-acceptance claim. The test-only parser, scoped ESLint and whitespace checks passed independently.
