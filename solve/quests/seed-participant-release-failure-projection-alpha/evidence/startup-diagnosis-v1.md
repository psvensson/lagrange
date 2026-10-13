# Startup participant-release diagnosis, v1

Date: 2026-10-13  
Mode: read-only diagnosis; no repair, policy, budget, test, Quest, or source change  
Candidate: `3231b1311ad79fb933d059877c97fc296b951e5d`  
Candidate pair: `implementation-pair-v2.json`, SHA-256
`5e82959e65578d9f2e588510ffb370c9100d1b3baa65ee2a95d746f38334a081`

Evidence:

- `startup-claim-v2/adam-laptop.raw.log`, SHA-256
  `77f255f36d1209dbf4abc594be67915523a4f436f3bbbc7d16f4ba1b6955a46`
- `startup-bootstrap-v2/adams-gamla.raw.log`, SHA-256
  `829c0f8270c2cee1910bc2fe5ea290702c8a4b8c947f3ebd87afc5797d353e3f`
- Prior owner interaction census:
  `interaction-census-v1.md`, SHA-256
  `a5c6f379ef0d896e534b4ecbc9253334c183765d44d5b85822471ef0ef58f195`

## Measured facts

| Run | Failing service | Outer answer | Seed projection |
| --- | --- | --- | --- |
| claim cache | `call_activation_leases-p1` | `release_drain_pending`, phase `release`, non-null release ID, retry 100; no `blockedDrain` | budget 1000, elapsed 912, remaining 88, ordinal 10/135, completed 9, attempt 1; no first blocked drain or joined attempt |
| bootstrap 1 | `latency_groups-p1` | `release_fact_unavailable`, phase `release`, retry 100, `current_control_owner_fact`; nested control outcome unavailable | budget 5000, elapsed 5013, remaining 0, ordinal 46/135, completed 45, attempt 1; no first observations |
| bootstrap 2 | `debug_sessions-p1` | `release_drain_pending`, phase `release`, non-null release ID, retry 100; no `blockedDrain` | budget 5000, elapsed 4967, remaining 33, ordinal 34/135, completed 33, attempt 1; no first observations |
| bootstrap 3 | `debug_snapshots-p1` | `release_fact_unavailable`, phase `inspect`, missing `release_deadline` | budget 5000, elapsed 5015, remaining 0, ordinal 37/135, completed 36, attempt 1; no first observations |

All failures are the failing service's first seed request. The measured null
`firstJoinedAttempt` rules out an older same-build cutover joined by these outer
requests. It does not reveal a nested control release's lower failure details.

## Exact `DRAIN_PENDING` return census

The canonical drain predicate is `isReleaseDrained` in
`src/partition/partition-participant-release-facts.js:62-66`. It requires no
SQLite transaction, participant staging or prepared row, no queued proposal or
pending outcome, and `appliedIndex === commitIndex === lastIndex`.

1. **Initial post-PAUSE aggregate** —
   `replica-handler-participant-cutover.js:248-263` reads and pauses the cohort,
   then uses one `census.find` with the canonical predicate. Its refusal is
   phase `release`, retry 100, and uniquely includes the selected
   `blockedDrain.generation/work`. The measured dependent refusals cannot be
   this branch because both omit `blockedDrain`.
2. **REOPEN action** — `replica-handler-participant-release.js:24-50` can
   return `DRAIN_PENDING` before replacement. The request action makes its
   phase `reopen`; it does not add the outer retry field. The measured answers
   are not this shape. A successful reopen also forces the outer attempt to
   return stale before ENABLE (`replica-handler-participant-cutover.js:174-200`).
3. **Direct DRAIN action** — `replica-handler-participant-release.js:59-62`
   returns phase `drain` with full facts. The normal cutover attempt does not
   send this action, and the measured answers are not this shape.
4. **Pre-ENABLE census defect** —
   `replica-handler-participant-cutover.js:266-278` can translate any defect,
   including `DRAIN_PENDING`, through `attemptRefusal`, yielding phase
   `release` and retry 100. For a non-`sql_transactions` dependent,
   `settleQueryRelease` returns the original immutable census unchanged
   (`:100-107`). The initial canonical drain search already passed that same
   census. `reopenCohort` cannot mutate and continue in the same attempt. A
   pre-ENABLE dependent drain is therefore inconsistent with the normal
   deterministic path unless the observation was mutated or some unmeasured
   alias/owner violated that contract.
5. **ENABLE action** — `replica-handler-participant-release.js:63-73` first
   checks the supplied and current facts, then runs the canonical admission
   owner. A fresh current defect is returned with phase `enable`; it carries no
   outer retry 100. The measured answers are not direct ENABLE refusals.
6. **Final post-ENABLE census defect** — after ENABLE answers observed,
   `replica-handler-participant-cutover.js:283-297` rereads every cohort
   member and applies `releaseCensusDefect` to those fresh facts. A non-drained
   work tuple is returned through `attemptRefusal`: phase `release`, release ID,
   retry 100, with no `blockedDrain`. This exactly matches both measured
   dependent answers.
7. **RESUME action** — `partition-participant-transaction-pause.js:75-104`
   rereads facts before opening admission; its defect is returned by
   `replica-handler-participant-release.js:74-76` as phase `resume`, without
   outer retry 100. The measured answers are not this shape.

The two measured dependent refusals therefore identify the final post-ENABLE
census as the strongest source-backed branch. This is a branch inference, not
a root-cause finding: the current answer does not retain which cohort member or
which work field was non-drained.

## What happens between the passing and failing censuses

For a dependent partition, query settlement does no work and returns the same
census. The only explicit cutover operation between the pre-ENABLE check and
the final reread is the leader's ENABLE action. The admission owner either:

- returns an already-recorded origin, or
- builds the canonical generation-origin command and awaits
  `startPartitionRaftWriteCommit`
  (`partition-participant-transaction-request.js:690-726`).

The write owner registers both the proposal queue entry and the pending outcome
before proposing, then awaits the committed answer
(`partition-service-raft-write-commit.js:310-405`). Application removes the
proposal queue entry synchronously when it resolves the committed write, and
the pending-outcome owner installs its deletion reaction before callers await
the outcome (`partition-service-cdc-stream-base.js:313-374`). This source order
argues against asserting that ENABLE normally returns while its own local
proposal or pending-outcome entry is still registered. The final facts also
compare committed-membership applied index with the Raft status commit and
last indexes, so cohort lag or different accepted work can still make the
fresh census non-drained.

The strongest mechanism class supported by current evidence is therefore:
**work is introduced, remains visible, or progress advances between the passed
post-PAUSE census and the fresh post-ENABLE census**. The generation-origin
ENABLE is the explicit operation in that interval and is the first owner to
falsify, but the source order does not prove it leaves local work pending.
Other current owners that can write through the committed-write kernel, a
remote cohort member that has not applied through its last index, or an
independent Raft progress change remain alternatives.

Changing membership, term, configuration, build, or replica generation is
normally classified as stale, unavailable, build mismatch, or census refused
before/around the drain check. Those are weaker fits for the measured exact
`DRAIN_PENDING` shape unless the same observation also contains genuinely
non-drained work.

## Why retry 100 and why the shared budget is nearly spent

`attemptRefusal` always adds
`PARTICIPANT_CUTOVER_BOUND.PAUSE_RETRY_AFTER_MS`, which is 100 ms
(`replica-handler-participant-cutover.js:76-79` and
`partition-participant-transaction-cutover-constants.js:30-35`). The seed
workflow does not invent this delay. It retries only if the typed delay fits
inside its one shared deadline (`bootstrap-service-seed-workflow.js:320-328`).
Thus 88 ms and 33 ms remaining both correctly produce `attemptCount: 1`.

The seed owner sorts the `sql_transactions` service first and then processes
all 135 services serially under one deadline
(`bootstrap-service-seed-workflow.js:283-295`). For every dependent service,
the cutover owner runs a full `sql_transactions` release before pausing the
dependent (`replica-handler-participant-cutover.js:227-228`). If the dependent
reaches the final clean census, it runs the control release again immediately
before RESUME (`:298-304`). Each attempt also performs cohort facts and
membership observations plus PAUSE, ENABLE, a final cohort reread, and RESUME.
Consequently ordinal 34 or 46 inherits all time spent by earlier successful
services; it has no fresh per-service budget. An internal INSPECT may consume
the remainder within a single outer attempt, as the measured
`phase: inspect`, `release_deadline` answer demonstrates.

This explains the accumulation and repeated control interaction. It does not
show that any particular release is unnecessary, nor authorize a cached OPEN
proof or fast path. The control owner is deliberately revalidated for each
dependent release and again before reopening it.

## Alternatives still open

- The fresh origin command or its Raft/apply acknowledgement could expose an
  index gap in one cohort member at the final reread even though the leader's
  local proposal and outcome maps were cleared.
- A different accepted-work owner may add work after PAUSE through a direct
  committed-write path. Ordinary participant/sessionless writes are fenced by
  the pause, but already accepted work and internal owner paths must be
  distinguished from newly admitted user work.
- A follower may report `appliedIndex < commitIndex` or
  `commitIndex < lastIndex` after the leader's ENABLE has completed.
- The nested control release can consume the shared deadline or fail as
  `current_control_owner_fact`. Its lower cause is intentionally lost by the
  current outer projection; that measured case is not evidence that the
  dependent's final work field caused it.
- Startup-created elections, recovery, CDC/mirror, or other background work
  can interleave with the final census. The current logs identify no such
  owner, so each remains a hypothesis.

## Strongest bounded falsifier and next owner question

The next measurement should remain at the existing release/facts owners and
must not change budgets or release authority. For one real fresh dependent
release, retain the exact first non-drained member selected from the **final
post-ENABLE** census using the canonical `isReleaseDrained` predicate, and
record whether ENABLE returned the already-enabled path or proposed/applied
the canonical origin. The observation needs only the canonical generation and
work tuple plus an unambiguous final-census stage label.

This yields a direct falsifier:

- A final work tuple with `proposals`, `pendingOutcomes`, or an index gap that
  later clears through its existing owner supports a transient-work mechanism
  and names the responsible surface for the next investigation.
- A fully drained final tuple paired with outer `DRAIN_PENDING` refutes this
  branch explanation and requires inspecting classification/identity or a
  different cohort member.
- An already-enabled control that reproduces the same final field refutes the
  hypothesis that proposing the generation origin is necessary.
- A fresh origin-proposing case whose final tuple is drained refutes the
  origin-write mechanism for that run.

The bounded owner question is: **which exact cohort member and canonical work
field makes the final post-ENABLE census non-drained, and did that ENABLE reuse
an existing origin or propose the current generation origin?** Current evidence
cannot answer it. No repair, alternate release algorithm, cached admission
proof, retry change, or budget increase follows from this diagnosis.
