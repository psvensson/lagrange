---
audience: development
documentClass: current
---

# Continuation reconciliation: use the newer tested shared-birth owner

This append-only correction supersedes the candidate-selection assumption in
CONTINUATION-registration-boundary-2026-10-21.md, without rewriting it.

During recovery of this conversation the last known branch was 0271f9e4.
A small duplicate partition-only source correction and 24 extra controls were
preserved as 47b92170b39bdd9ce7ac00b90ac722e33af3684d. Lab #649 refused that
candidate before execution: LESS_THAN_5_GIB_FREE. Its tests have NOT run.
Do not merge/cherry-pick that duplicate production correction into the newer
continuation. Its supplemental tests remain unverified and may be evaluated
separately; they are not acceptance evidence.

Subsequent live discovery located the more complete continuation:

- Branch: work/original-handoff-boundaries-20261021-cloud
- Verified tip: dfbb579b4a2606aec0c21be4376833acfb7ec912
- src/node/service-row-incarnation.js owns isExactServiceRowBirth for BOTH
  registration owners, including exact created_at/create_attempt_token and
  immutable SERVICES identity. This is preferable to maintaining the duplicate
  partition-local comparison from 47b92170.
- Lab #645, same exact source: 4/4 files, 110 runner-reported assertions, PASS.
  Message-group exact birth (18), message-group existing row owner (71),
  partition exact birth (12), partition readback controls (9).
- Lab #646, same exact source: 3/3 files, 46 runner-reported assertions, PASS.
  Lifecycle registry generation (6), owner-aware retirement census (6),
  partition existing row owner (34).
- Both completed on tv-dator with retry 0 and enabled thermal checks.
  These are executor results, not independent approval or public startup proof.

Canonical scoped-lint verification is preserved separately at
f94bacf92daf8711b94e9b13daee555337039e57 on
verify/original-birth-static-20261021. Its lab #647 also refused before
execution with LESS_THAN_5_GIB_FREE, so scoped lint is NOT green.

## Actual immediate blocker

Lab #647 at 2026-10-21T15:34:06Z and #649 at 16:00:49Z both reported
execution_started=false. A fresh nonexecuting controller ping #648 completed
with standing Lagrange repository authorization, paused=false and
uncertain_execution=false. The source-preparation guard in lab_bridge.py
checks shutil.disk_usage(run.parent).free before checkout creation. This is
controller run-filesystem capacity, not a GitHub permission failure or an
assertion failure on tv-dator. Do not change the 5 GiB guard, delete history,
assume expired jobs have stopped, or resubmit unchanged work repeatedly.
Capacity maintenance must preserve active work, request identity fences and
retained evidence. No deletion or capacity-policy change was performed here.

## Remaining implementation boundary

Continue from the tested shared-birth branch, not this duplicate source lane.
Recover its exact current tip and any active owner's handover before writing.
After capacity recovery, finish the pending scoped lint and other required
static/metadata/independent-review gates, carrying the same source identity.
Then implement the approved nonserving startup and R1/R2 interaction: exact
current role/native term/tenure, original activation claim through handoff,
foundation-bound leader publication, native callback exclusions, consumed
rights, public ingress fences and actual cleanup. The public cold-start
witness and all eight sealed receipts remain separate and unpromoted here.

The main/shared integration and the newer continuation branch were not changed
by this reconciliation. This branch is retained as WIP evidence, not a competing
production continuation or a merge candidate.
