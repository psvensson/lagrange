---
audience: development
documentClass: current
---

# Original allocation: unreviewed foundation correction

Date: 2026-10-21. Parent: `8b3638233da30c6a358e80be4b23021eb00b9e4c`.
This checkpoint is a WIP preservation for independent source/witness review,
not Quest landing, production approval, native proof or publication approval.
The containing commit identifies the candidate. The original branch and shared
integration checkout have not been modified by this continuation.

## Implemented in the candidate

1. `RaftRsOriginalAllocationPreparation` asks the existing seed declaration
   owner to validate the whole declaration before inventory, mkdir, writable
   preparation or cold inspection. Its constructor now requires the startup
   `nodeId` and `buildDigest` as well as the existing directory custodian and
   path. Expectations must never be copied from the declaration under test.
   An empty/subset cold scan is not successful inspection.
2. The declaration owner rejects callback-bearing or non-plain data before
   reading it, checks the allocation timestamp and externally bound identity,
   and refuses a member whose incarnation and create-attempt token alias.
   Existing catalog/member checks remain the single complete-cohort authority.
3. The rights store permits only `UNUSED -> SUBMITTED -> TRANSFERRED`.
   Reverse, skipped, self and unknown transitions fail before a write.
   Repeated submission remains a refusal, never another INSERT permission.
   Reads and updates bind the exact reserved member and declaration.
4. ISSUE update/readback requires the actual anchor, matching declaration and
   member, NEVER_OPENED history and both UNUSED rights. A foreign already-ISSUED
   row, a consumed right or uncommitted matching state cannot establish success.
   The existing durable commit owner remains in use; no parallel store exists.

Only four production files changed. There are two new canonical regression
files: 34 store cases and 24 preparation/declaration cases. Neither test file
weakens the existing cold public-entry oracle or its deadline.

## Measured, with limits

[Source-bound local summary](local-store-isolation-summary-2026-10-21.json)
records file hashes, retained raw-TAP hashes and exact failing test names.
The [isolated checker](local-store-isolation-check-2026-10-21.mjs) is executable
with Node22's experimental VM modules:

```sh
node --experimental-vm-modules \
  solve/quests/retained-seed-original-handoff/evidence/local-store-isolation-check-2026-10-21.mjs \
  . .
```

It loads the candidate store and canonical store tests unchanged, but substitutes
an in-memory `node:sqlite` adapter for `better-sqlite3`, a local lifecycle-schema
fixture, and isolated durable-store imports. This is exploratory owner-level
feedback, NOT the repository test runner, production-driver integration, native
Raft, file durability or power-loss evidence. It grants no receipt credit.

| Exploratory run | Passed | Failed |
| --- | ---: | ---: |
| Candidate store | 34 | 0 |
| Parent store with the new tests | 7 | 27 |
| Remove monotonic-transition guard | 12 | 22 |
| Remove exact-member guard | 33 | 1 |
| Remove ISSUE declaration readback | 33 | 1 |
| Remove uncommitted-readback fence | 33 | 1 |

All four deliberately regressed variants reached the named behavioral
assertions; they were not dependency/setup failures. These are not the sealed
native negative controls. The raw logs and base/candidate source copies are
retained in the continuation bundle attached to the conversation. The first
exploratory runner was made path-portable and the same matrix rerun; the table
and log hashes refer to the retained portable-checker executions.

All six changed source/test files pass `node --check`. The 24 preparation tests,
including the real complete-catalog positive, are authored but NOT executed.
There was no native/lab job submission, independent verifier, canonical lint,
cycle/metadata audit, full corpus, Solver land or publisher execution here.
The session had a GitHub API source copy, not a fully installed repository.

## Acceptance and outstanding work

All eight sealed receipt rows remain false, and receipt/seal/original public
witness bytes are unchanged. The genuine public baseline at `c6ece57ee` remains
RED; none of these results is a successful cold handoff. The previously reported
294 documentation findings were not rescanned after this candidate.

The preparation constructor's startup identity binding and new cross-owner
import need independent review with the actual source and both test files.
Run the repository metadata producers and applicable static checks; do not edit
ratchets or generated inventories by hand. Then obtain the canonical source-
pinned, locked retry-0 measurements in small staggered batches, retaining thermal
limits and using a fresh lab request identity for each new attempt.

This patch does NOT finish startup wiring, private live opening authority,
current leader + valid native term + exact tenure-token checks, R1 activation
claim span, R2 native callback effects, exact registration/CONFIG handoff,
public ingress fences or composed cleanup. The prior approved correspondence
continues to govern those changes. Do not infer any of them from store tests.
Source/witness approval precedes the locked native measurements; the final
composed public-entry proof and all other U1/TX1/FreshMG/corpus/release gates
remain separate. No merge to main is authorized by this checkpoint.
