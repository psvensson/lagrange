# Addendum to the causal packet (2026-09-19): measured guard inputs, and a second mechanism

This extends [causal-packet-2026-09-18.md](causal-packet-2026-09-18.md). It
corrects one of that packet's conclusions and closes its first gap.
Everything here was measured; no behaviour was changed to obtain it.

## Method: formations on the lab machines

The formation-only demo (`npm run -s health:formation -- --trend <scratch>`)
runs five local node processes on any provisioned lab machine in about four
minutes. It reproduces both live failure signatures, so the measurement loop
is minutes instead of one GCP nightly per day.

- Runs so far: 31 local runs on three machines.
- Branches were shipped to the machines as bundles and run from scratch
  worktrees; the committed trend file was never touched.
- The failure rate depends on machine speed: the two 8-thread laptops fail
  far more often than the 12-thread machine.
- Compare only per machine, and interleave the variants to control drift.
- The nightly of 2026-09-19 (run 35418756637, head 3334285a1) also failed,
  with four learners refused.

## Gap 1 closed: which input zeroes the overflow budget

The branch of `learner-promotion-guard-inputs-observed` logs the inputs of
every count-check refusal and of each learner's first pass. In the first
failing run on each of two machines (678 refusal lines), the refused and the
granted promotions have the same 4 voters, target 3, 3 required distinct
nodes and 5 eligible nodes. They differ in one input:

| | summary chosen | summary says | planner entry | budget | max voters |
| --- | --- | --- | --- | --- | --- |
| granted | derived | not satisfied, 4 partitions blocked | not ready, gap 1 | 2 | 6 |
| refused (about 450 lines) | **closure-refreshed** | satisfied, none blocked | ready | 0 | 4 |

- **What decides it.** The learner node's planning answer takes the "more
  advanced" of the freshly derived priority summary and a closure-refreshed
  one. A closure-refreshed summary that still says the spread is complete
  wins over the derivation that shows the gap. The guard then reads
  "recovery converged" and grants no overflow.
- **Classification.** This input is duplicated placement policy, not a Raft
  or local safety check.
- **Earlier candidate withdrawn.** The eligible-set explanation offered on
  2026-09-18 is not the main cause. The collapsed cohort (1 required, 1
  eligible, on a node whose readiness phase is degraded) exists as a rare
  second signature (13 lines).
- **User-table partitions too.** About 200 refusals in one run are on the two
  MovieLens table partitions. The planner sends a fifth voter at RF 3 there
  as well. The learner evaluates no overflow budget at all for an ordinary
  partition, so it always refuses until the 60 s timeout.
- **Consequence for the repair.** The authority disagreement is not confined
  to critical partitions. The operation-carried authorization must cover
  every over-target ADD the planner sanctions, and "an ordinary ADD cannot
  use the overflow authority" needs a definition that accounts for the
  planner's own ordinary-partition cures.

## Correction: the refusal is not what decides PASS or FAIL

The 2026-09-18 packet left open (its gap 2) whether the admission observer's
`observation_unavailable` ending was independent of the promotion stall. It
is. Of the 31 local runs, 16 had their reports pulled and classified:

| | refusals in the run | `observation_unavailable` observations |
| --- | --- | --- |
| PASS (6 runs) | 0, 0, 0, 70, 120, 242 | 0 to 4 |
| FAIL (10 runs) | 0, 1, 39 ... 418 | 8 to 64 |

- One run passed with 242 refusals, and one failed with none. In that run
  the operations drained within seconds and the observer then failed 53
  times in a row.
- The GCP nightlies split the same way: all four failures have 5 to 37
  `observation_unavailable` observations, and all three passes have none.
- The final reasons are `Authoritative control snapshot repair failed:
  nodes:authoritative_observation_read_incomplete`, `control snapshot
  observation failed (stale_usable): cache_stale_watermark`, and timeouts
  opening or awaiting the seed's admin websocket.

So two mechanisms act on formation:

1. **The promotion refusal.** This is the authority disagreement above, worth
   60 to 110 s per occurrence. 09-16 looks dominated by it.
2. **The admission observer cannot obtain an authoritative control
   snapshot.** That alone denies admission. 09-13, 09-18, 09-19 and the local
   zero-refusal failure look dominated by it.

Like seed starvation before it, the refusal is neither necessary nor
sufficient for the observed failure. Repairing the authority boundary is
still right, but it will not by itself make formation green. The second
mechanism needs its own causal packet, written the same way as the first:
- start at the terminal symptom on the observer;
- trace back through the admin control snapshot and the authoritative node
  observation read to the first PASS/FAIL divergence;
- use lab formations as the measurement loop.

## What is not yet known

- Whether the second mechanism has one cause or several behind its three
  final reasons.
- Whether local five-process formations and one-node-per-VM GCP formations
  fail for the same reason in the same proportion. The signatures match; the
  rates differ.
- Whether restoring E's scheduling defaults changes either rate. The first
  five runs of `seed-replica-production-scheduling-defaults` on one machine
  show no obvious change. An interleaved comparison is running.

## Second addendum (2026-09-19, later): why the summary reads "satisfied"

This was a read-only analysis of the recorded guard inputs from the lab
formations (about 690 records across five runs), plus a scratch call of one
production function. No behaviour was changed.

**The dominant refusal.**
- 454 of about 470 critical-partition refusals share one shape:
  - 4 voters on **2** distinct nodes and 1 learner on a third node;
  - the learner node's summary shows `satisfied: true`, required 3,
    eligible 5;
  - this partition is **not** in `blockedPartitionIds`;
  - budget 0, max 4.
- Voters cover only two nodes. For the summary to call the partition
  unblocked at required 3, it must be counting a non-voter as the third
  holder.

**The derivation counts the learner.** `buildDerivedPriorityPartitionSummary`
(`src/control-plane/membership-publication-priority-partition-summary.js`)
counts a service row as a ready holder when all of these hold:
- the row is `active`;
- it has a raft role;
- it has an address;
- if the role is a catch-up learner, its node's readiness is promotable
  (`resolvePrioritySpreadReplicaExclusionReason`, `learner_not_promotable`).

So a learner on a healthy node is a distinct holder.

**Scratch call.** The production function was called with four voter rows on
two nodes:

| input | result |
| --- | --- |
| no learner row | partition blocked, `readyDistinctNodeCount: 2` |
| learner row with status `joining` | blocked, `status_joining: 1` |
| `active` learner row on a third node | partition no longer blocked |

**The ring.** The learner whose promotion would close the spread gap is
counted as having closed it.
- That withdraws `priorityRecoveryActive` and the overflow budget.
- The promotion needs that budget to take the partition from 4 voters to 5.
- The promotion is refused until the 60 s voter-ready timeout undoes the
  operation, and the gap re-opens.
- The grants in the same runs are first-pass checks where the learner's own
  row was not yet counted: `satisfied: false`, this partition blocked,
  budget 2.
- PASS or FAIL on this mechanism is a race between the learner's catch-up
  and its own service row becoming visible as active.
- This explains both the intermittency and the dependence on machine speed.

**Corrections to the first addendum.** WITHDRAWN 2026-09-19.
- This paragraph said the closure-refreshed preference is not the cause,
  citing 13 refusals with `source: derived`.
- Those 13 are the collapsed-cohort signature (required 1, eligible 1), not
  this shape.
- See the third addendum below.

**Classification.** This input is duplicated placement policy, not a Raft
  or local safety check.
- **Earlier candidate withdrawn.** The eligible-set explanation offered on
  2026-09-18 is not the main cause. The collapsed cohort (1 required, 1
  eligible, on a node whose readiness phase is degraded) exists as a rare
  second signature (13 lines).
- **User-table partitions too.** About 200 refusals in one run are on the two
  MovieLens table partitions. The planner sends a fifth voter at RF 3 there
  as well. The learner evaluates no overflow budget at all for an ordinary
  partition, so it always refuses until the 60 s timeout.
- **Consequence for the repair.** The authority disagreement is not confined
  to critical partitions. The operation-carried authorization must cover
  every over-target ADD the planner sanctions, and "an ordinary ADD cannot
  use the overflow authority" needs a definition that accounts for the
  planner's own ordinary-partition cures.

## Correction: the refusal is not what decides PASS or FAIL

The 2026-09-18 packet left open (its gap 2) whether the admission observer's
`observation_unavailable` ending was independent of the promotion stall. It
is. Of the 31 local runs, 16 had their reports pulled and classified:

| | refusals in the run | `observation_unavailable` observations |
| --- | --- | --- |
| PASS (6 runs) | 0, 0, 0, 70, 120, 242 | 0 to 4 |
| FAIL (10 runs) | 0, 1, 39 ... 418 | 8 to 64 |

- One run passed with 242 refusals, and one failed with none. In that run
  the operations drained within seconds and the observer then failed 53
  times in a row.
- The GCP nightlies split the same way: all four failures have 5 to 37
  `observation_unavailable` observations, and all three passes have none.
- The final reasons are `Authoritative control snapshot repair failed:
  nodes:authoritative_observation_read_incomplete`, `control snapshot
  observation failed (stale_usable): cache_stale_watermark`, and timeouts
  opening or awaiting the seed's admin websocket.

So two mechanisms act on formation:

1. **The promotion refusal.** This is the authority disagreement above, worth
   60 to 110 s per occurrence. 09-16 looks dominated by it.
2. **The admission observer cannot obtain an authoritative control
   snapshot.** That alone denies admission. 09-13, 09-18, 09-19 and the local
   zero-refusal failure look dominated by it.

Like seed starvation before it, the refusal is neither necessary nor
sufficient for the observed failure. Repairing the authority boundary is
still right, but it will not by itself make formation green. The second
mechanism needs its own causal packet, written the same way as the first:
- start at the terminal symptom on the observer;
- trace back through the admin control snapshot and the authoritative node
  observation read to the first PASS/FAIL divergence;
- use lab formations as the measurement loop.

## What is not yet known

- Whether the second mechanism has one cause or several behind its three
  final reasons.
- Whether local five-process formations and one-node-per-VM GCP formations
  fail for the same reason in the same proportion. The signatures match; the
  rates differ.
- Whether restoring E's scheduling defaults changes either rate. The first
  five runs of `seed-replica-production-scheduling-defaults` on one machine
  show no obvious change. An interleaved comparison is running.

## Second addendum (2026-09-19, later): why the summary reads "satisfied"

This was a read-only analysis of the recorded guard inputs from the lab
formations (about 690 records across five runs), plus a scratch call of one
production function. No behaviour was changed.

**The dominant refusal.**
- 454 of about 470 critical-partition refusals share one shape:
  - 4 voters on **2** distinct nodes and 1 learner on a third node;
  - the learner node's summary shows `satisfied: true`, required 3,
    eligible 5;
  - this partition is **not** in `blockedPartitionIds`;
  - budget 0, max 4.
- Voters cover only two nodes. For the summary to call the partition
  unblocked at required 3, it must be counting a non-voter as the third
  holder.

**The derivation counts the learner.** `buildDerivedPriorityPartitionSummary`
(`src/control-plane/membership-publication-priority-partition-summary.js`)
counts a service row as a ready holder when all of these hold:
- the row is `active`;
- it has a raft role;
- it has an address;
- if the role is a catch-up learner, its node's readiness is promotable
  (`resolvePrioritySpreadReplicaExclusionReason`, `learner_not_promotable`).

So a learner on a healthy node is a distinct holder.

**Scratch call.** The production function was called with four voter rows on
two nodes:

| input | result |
| --- | --- |
| no learner row | partition blocked, `readyDistinctNodeCount: 2` |
| learner row with status `joining` | blocked, `status_joining: 1` |
| `active` learner row on a third node | partition no longer blocked |

**The ring.** The learner whose promotion would close the spread gap is
counted as having closed it.
- That withdraws `priorityRecoveryActive` and the overflow budget.
- The promotion needs that budget to take the partition from 4 voters to 5.
- The promotion is refused until the 60 s voter-ready timeout undoes the
  operation, and the gap re-opens.
- The grants in the same runs are first-pass checks where the learner's own
  row was not yet counted: `satisfied: false`, this partition blocked,
  budget 2.
- PASS or FAIL on this mechanism is a race between the learner's catch-up
  and its own service row becoming visible as active.
- This explains both the intermittency and the dependence on machine speed.

**Corrections to the first addendum.**
- The closure-refreshed preference (`chooseMoreAdvanced`) is not the cause.
  The freshly derived summary reads satisfied in the same state (13
  refusals with `source: derived`).
- The preference only lengthens how long the verdict is held.

**Classification.** One projection serves two consumers with opposite needs.
- The planner asks "is coverage already planned?". Counting the learner
  there is right: it stops a second ADD.
- The promotion guard uses the same answer as "is the cure complete?". That
  is circular for the very replica being promoted.
- This is the owner's Decision 1 seen from the inside. The guard should not
  derive placement permission from a local projection at all; the operation
  should carry it.

**The other refusal shape, on user tables** (204 records): 4 voters on 4
distinct nodes, target 3, and a fifth voter arriving.
- No spread gap is involved.
- It is a second add-first move dispatched while the first holds the single
  replacement allowance.
- The guard is doing its mechanical job there.
- The question belongs to the planner's dispatch: why two concurrent moves
  on one partition?
- It is separate from the cure authorization.

## Third addendum (2026-09-19): the refusals read the closure witness, not the row derivation

Nine more lab formations ran on the landed guard-input logging (bb529c57c,
three machines, 2 PASS and 7 FAIL). The final log format separates what the
second addendum merged.

**Measured.**
- At required 3 and eligible 5, **every** refusal reads a
  `closure_refreshed` summary (1253 of 1253):
  - satisfied;
  - planner ready with no entry for the partition;
  - completion `converged`, budget 0, max 4;
  - four voters on two nodes and one learner.
- No refusal at required 3 reads a `derived` summary that says satisfied.
- The first-pass grants on the same membership shape read `derived`: not
  satisfied, this partition blocked, planner spread gap 1 with ready distinct
  nodes 2, budget 2, max 6.
- 15 learners in these runs show both readings: a first pass with budget 2,
  then 5 to 60 refusals with budget 0.

**Code.**
- `buildPriorityRecoveryClosureWitness`
  (`src/control-plane/priority-recovery-snapshot-active-gate.js`) returns a
  synthesized `satisfied: true` summary when no tracked partition's decision
  is in an unresolved semantic state.
  - `converged` and `spread_satisfied_in_flight` are satisfied states.
  - `recovering_in_flight` is not.
- The candidate derivation then takes that summary over the derived one, even
  when the derived one still shows the gap. This is the witness state
  `satisfied_stale_publication`.

**What this changes.**
- The second addendum's scratch call stands as a fact about the row
  derivation: it counts an active catch-up learner on a promotable node as a
  holder.
- It is **not** the measured route. The measured route is the closure
  witness overriding a derived summary that still shows the gap.
- Why the decision snapshots at the learner's node hold no unresolved
  partition while the partition has two holder nodes is **not yet
  demonstrated**. The candidates are:
  - spread completion counted with the learner;
  - a planner-ready bit from another source;
  - a decision set that does not track the partition.
- The ring shape is the same either way. "An operation is in flight, so the
  cure is complete" withdraws the allowance that the operation needs.
- The second addendum's closing classification (one projection serving the
  planner and the guard) holds. Its stated cause is superseded by this
  section.

## Fourth addendum (2026-09-19): the closure route, traced

This was a read-only trace over the nine final-format runs, by an analyst.
- The logs are 45 node logs, holding 1291 refusals with inputs.
- I checked the trace against the code lines cited and by re-running the
  scratch reproduction, kept as
  [evidence/closure-witness-repro-2026-09-19.mjs.txt](evidence/closure-witness-repro-2026-09-19.mjs.txt).
  - It imports production modules.
  - Only rows are constructed.
- Labels: MEASURED, CODE, SCRATCH, INFERRED.

**The chain on the learner's node** (CODE). The decision snapshots are built
locally from the node's own replicated rows.
1. `membership-publication-candidate-derivation.js:658` calls
   `buildPriorityRecoveryClosureEvidence`, which calls
   `buildPriorityRecoveryDecisionSnapshots`. With no `replica_operations`
   rows there is no witness at all.
2. `buildPriorityRecoverySpreadCompletion`
   (`priority-recovery-snapshot-ingress.js:206-217`) sets `satisfied: true`
   when the in-flight operations with a **satisfying target** cover the
   planner's spread gap. With gap 1, one ADD suffices.
3. A target is satisfying when two conditions hold
   (`ingress.js:108-124`, `priority-recovery-snapshot-rebalancer.js:386-411`):
   - its node is in the eligible cohort;
   - its service row is voter-visible, meaning `active` with a voter role,
     or `syncing` with a voter role and an address.
   A REPLACE in its remove-dispatch phase also certifies while it is not
   stalled.
4. `resolvePriorityRecoverySemanticState` returns
   `spread_satisfied_in_flight`, which the contract classes as
   closure-satisfied.
5. With no tracked partition unresolved, `buildPriorityRecoveryClosureWitness`
   synthesizes a satisfied summary (state `satisfied_stale_publication`). Its
   satisfied rank wins the comparison over the derived summary that still
   shows the gap.
6. The guard's planner entry falls through to ready with no entry for the
   partition, and the completion is `converged` with budget 0.

**The learner's row is not what is counted** (corrects the second addendum).
- The in-flight ADD operation is counted, through its target row's
  visibility.
- The partition is tracked, not dropped.

**SCRATCH, minimal pair.** The rows are identical except for the ADD's
target service row.

| variant | target row | derived summary | witness | chosen source | budget |
| --- | --- | --- | --- | --- | --- |
| C | not voter-visible | blocked, gap 1, ready distinct nodes 2 | `closure_pending`, all `recovering_in_flight` | derived | 2 |
| F/H | voter role and `syncing` on the third node | the same | `satisfied_stale_publication` | closure_refreshed | 0 |

- C matches the recorded passing reading on every logged field.
- F/H matches the recorded refusal reading on every logged field.
- A third variant, an active learner-role row, makes the derived summary
  itself satisfied. That reading does not occur in the recorded refusals.

**MEASURED sequence.**
- The "count check inputs" line is the first **passing** check, not the
  first check. In 10 of 15 learners the refusals come first.
- The order is:
  1. refusals with budget 0, for about 60 s;
  2. one tracked partition's ADD times out and goes terminal;
  3. the witness falls back to pending;
  4. **every** learner on that node regains budget 2 within 0.02 to 1.8 s
     and passes.
- This held in the three timelines traced, on all three machines.
- The partitions are coupled through the witness: one timeout releases the
  others.
- The publication epoch and node readiness did not change across any flip.
- The refusal is therefore a stall of one voter-ready timeout per wave, not
  a permanent block. It occurs in passing runs too.

**The seed asks a different question** (MEASURED and CODE).
- The seed's retain decision reads a direct census of the partition's active
  replicas' nodes: 2 of 3, so the gap is open.
- The learner's node asks whether any tracked partition is unresolved, and an
  in-flight ADD counts as resolution.
- The learner's verdict is a projection about the operation the seed just
  dispatched. That is why it is circular for the replica being promoted.

**The boundary.** Two rules together say "an operation is in flight, so the
cure is complete":
- `spread_satisfied_in_flight` classed as closure
  (`priority-recovery-snapshot-contract.js:268-271`);
- the unconditional satisfied-rank preference
  (`membership-publication-priority-partition-summary.js:355-357`).
Consumed as permission, that withdraws the allowance the operation needs.

**Still unobservable** (INFERRED).
- Which live row state makes the target voter-visible: a voter role while
  syncing, a predecessor row, or the REPLACE grace.
- The witness state itself. The guard payload names which summary won, never
  why.
- The witness state, its unresolved ids, the base summary and each counted
  operation's target visibility would settle it.
- The planning-answer memo is not necessary (162 refusals read a fresh
  answer). Its contribution to duration is unmeasured.

**Why no existing host shows it.**
- `closure_refreshed` needs `replica_operations` rows and an under-spread
  service census in one planning snapshot, passed through
  `buildPriorityRecoveryClosureEvidence`.
- The provenance test builds its closure summary by hand.
- The simulator's node hosts never run the ADD workflow that writes those
  rows.

## Fifth addendum (2026-09-19): the recorded refusal is not one consistent row snapshot

The characterization implementer stopped before sealing. It ran the whole
candidate derivation from constructed rows into the real promotion check,
and reported the following. I checked the fixture fields it cites.

**What reproduces.**
- The passing reading reproduces on every decisive field. The whole
  membership block matches byte for byte.
- The refusal reading reproduces on every decisive field **except one**.
  This covers the summary, source, planner, completion, budget, max and
  reason.
- One in-flight ADD going terminal releases the node's other learners.
- No operation rows means no witness.
- Operation status and step do not enter any rule for the recorded pair.

**What does not.**
- The guard's voter census (`isActiveVoterServiceRowForPromotion`) and the
  target index (`resolvePriorityRecoveryTargetServiceRowVisibilityState`)
  read the same services rows with the same voter-role set.
- So any row that makes the ADD's target voter-visible must appear in that
  refusal's own `voterReplicas` as a fifth voter on a third node.
- The recorded refusal shows four voters on two nodes and **no row for the
  learner at all** (`learnerReplicaIds: []`, `observedLearnerCount: 0`).
- The passing reading 58 s later shows the learner's row as a learner.
- The witness being satisfied and the census seeing neither a voter nor a
  learner on the third node cannot both come from one services snapshot
  through the locally built route.

**Candidates, none demonstrated.**
- **(a) A retained witness.**
  - `buildPriorityRecoveryClosureEvidence` returns
    `priorityRecoveryPlanningSnapshot.priorityRecoveryClosureWitness`
    outright when one is present.
  - That happens before it builds anything from local rows.
  - The fourth addendum treated the locally built route as the live one
    without showing which route ran.
- **(b) Two readers on different snapshots.**
  - The candidate derivation has its own per-publisher memo
    (`control-plane-readiness-publication-diagnostics.js:281-320`), beneath
    the layer that states the planning answer's origin.
  - So `origin: fresh` does not exclude an older candidate.
- **(c) A row the census misses but the index accepts.**
  - Four asymmetries exist on main: an absent `service_type`, camelCase
    keys, an absent `partition_id` (a node-wide wildcard), and upper-case
    roles.
  - Each reproduces the record, but no live writer is known to produce such
    rows, so none is used.
- A further asymmetry was read from code and not measured. The satisfying
  rule never requires the target node to lie outside the current holder
  set.

**Consequence.**
- The characterization is **not sealed**. Sealing it on a constructed row
  that no evidence supports would force the match.
- The owner's rule applies: find the first live input the reproduction
  lacks.
- That input is which route produced the witness, and why it read
  satisfied.
- A small log-only quest, `closure-witness-route-observed`, adds that to the
  guard-input payload:
  - the route (retained, built or none);
  - the witness state and its unresolved ids;
  - this partition's semantic state and spread-completion reason;
  - each satisfying operation's target visibility;
  - the base summary before the closure choice.
- The characterization is sealed after lab formations show the route.

## Sixth addendum (2026-09-19): the double count - the satisfying operation targets a node that already holds a voter

**Runs.**
- Six lab formations ran on the staged `closure-witness-route-observed`
  tree (scratch commit ab5e9dbfd).
- Three machines gave 4 PASS and 2 FAIL.
- The closure block in the guard payload is from code that is staged and
  under independent verification, not yet landed. The reading below is
  MEASURED through it.

**Every refusal at required 3 (1091 of 1091)** states:
- route `built`; witness `closure_satisfied_stale_publication`;
  `witnessMatchesAnswer: true`;
- this partition `spread_satisfied_in_flight`, reason
  `operational_target_visible_on_eligible_node`;
- a base summary that is `derived`, not satisfied, with this partition
  blocked;
- exactly one satisfying operation, `active_operational`, whose target node
  has these properties:
  - it is **not** the learner's node (0 of 1091);
  - it is **already one of the partition's voter nodes** (1091 of 1091),
    and it is the node holding the single voter outside the seed.

Example: adam-laptop, 09:49:04, `schema_operations-p1-r5`.
- The voters are 3 on node 015619 and 1 on node 71c759.
- The satisfying operation is 49f173b0, targeting 71c759.
- The learner's own ADD is 1b872ca1, to node 1c7769, status pending.

**What this means.**
- The earlier spread ADD placed the fourth voter on the second node. It is
  still in flight after its target has become a voter.
- The spread gap of 1 was computed from a census that already counts that
  second node: ready distinct nodes 2 of 3.
- `buildPriorityRecoverySpreadCompletion` then counts the same node again as
  the in-flight cure for the **remaining** gap.
  - Its satisfying rule (`isPriorityRecoverySpreadSatisfyingOperationContext`)
    requires an eligible, voter-visible target.
  - It never requires that the target add a holder node the census has not
    already counted.
- One node is counted twice. The partition reads
  `spread_satisfied_in_flight` with nothing on a third node.
- The witness closes and the chosen summary reads satisfied.
- The budget goes to 0. The learner that would actually close the gap is
  refused.

**This resolves the fifth addendum.**
- The refusal IS one consistent snapshot.
- No voter-visible row on the third node is involved, so the census
  correctly shows none.
- Candidate (a), a retained witness, is falsified: 0 of 1091.
- Candidates (b) and (c) are not needed.
- The fourth addendum's minimal pair is the wrong pair. It constructed a
  voter-visible row on the learner's node, which is a state the live system
  was not in.
- The release events it measured are consistent with the earlier operation
  leaving the active set. Why that operation stays in flight for about a
  minute after its target is a voter is not yet traced.

**Two distinct defects, then.**
1. **The projection gives a wrong answer.**
   - "Spread satisfied in flight" double counts a holder.
   - Its consumers are the closure witness, the chosen priority summary and
     everything that reads it.
   - Whether the early "satisfied" also feeds node readiness or
     publication, and so the second mechanism, is not traced.
2. **The promotion guard treats that projection as placement permission.**
   This is the split authority of the owner's decision of 2026-09-18.
   Repairing (2) cuts the ring even while (1) stands. Repairing (1) removes
   this refusal even while (2) stands. They are separate owners.

**Note on the sixth addendum's instrument (2026-09-19).**
- The independent verifier rejected `closure-witness-route-observed` on one
  field.
  - The payload's per-partition semantic state can be misattributed when a
    partition has two operations.
  - It measured that the readings used above are unaffected: the route, the
    witness state, the satisfying operations with their target node and
    visibility, and the base summary. That held over 60,000 partition
    reads.
  - It also measured that the error never crosses the
    satisfied/unresolved boundary.
- It confirmed in code that the guard's synchronous path can never read a
  retained witness.
- The quest is superseded without landing. The authority repair removes the
  guard's summary read, and with it the payload block that quest added.

## Seventh addendum (2026-09-19): what the carry stage's logging shows in the lab - evidence, not proof

Eight lab formations ran on the staged carry stage (scratch commit
ca8e7fa67).
- Three machines gave 2 PASS and 6 FAIL.
- The four-core machine is not included.
- The carry stage changes no decision; it logs the authorization the guard
  decoded.
- Everything below is MEASURED through logging that is staged and under
  independent verification.
- Per the owner's direction it is formation evidence only. Nothing here
  shows that a path is unneeded.
- The logs are archived at
  `~/.local/share/lagrange/evidence/formation-health/lab-2026-09-19/lab-authority-carry-logs.tar.gz`.

**The refusals enforcement is meant to flip.**
- There were 976 promotion refusals on critical partitions.
- 967 carry a present authorization that would be honoured, with the
  promotion inside the authorized bound: 4 voters observed, 5 authorized.

**The epoch disagreement occurs live.**
- 4 refusal lines on one node carry a valid authorization that reads
  `authorization_membership_generation_stale`. The authorization observed
  epoch 5 while the partition read epoch 6.
- The lines are at 11:03:15-17, for `sql_transaction_participants-p1` and
  `sql_write_operations-p1`.
- Under enforcement these would be refusals with nothing behind them.

**Promotions that pass today only because of the overflow budget:** 37.
- 33 carry an honoured authorization.
- **4 do not:**
  - 2 on the **operation ledger** (`replica_operations-p1`).
    - Each is a **REPLACE** target (`replace-replica-…`, REPLACE
      pending/SENDING) with 4 voters on 2 nodes.
    - This is one live witness covering two of the owner's classes at once:
      an unmintable partition and an over-target REPLACE. It is admitted
      today by the budget and by nothing else.
  - 2 on `control_plane_publications-p1` with **no counted in-flight
    operation at all**.
    - One has 3 voters on 1 node and the other 4 voters on 2 nodes.
    - This is an admission class nobody has described yet.

These are inputs to `critical-spread-overflow-budget-audit`: two witnessed
budget-dependent classes that the spread-cure authorization does not cover.

## Eighth addendum (2026-09-19): the double count's consumers - it is decision input, and it is persisted

**Method.** An analyst did a read-only trace, answering the owner's
question before any repair quest is authored. The method was an identifier
census over `src`, `test`, `examples` and `scripts`, with every reader
classified.

**Bounds.**
- The internals of six diagnostic emitters were not opened.
- 66 of the 68 test files that touch these identifiers were not opened.
- Log evidence comes from one run (adam-laptop, witness-route series,
  run 1).

**What I checked.** The two facts marked MEASURED below, and a re-run of
the scratch pair.

**Correction to the sixth addendum.** The double-counted operation is not
"still in flight".
- MEASURED:
  - Operation 49f173b0 (schema_operations-p1, target = the second holder
    node) was created at 09:48:19.062.
  - It logged `Operation completed` on the seed at 09:48:26.571.
  - The learner's node counted it as the satisfying operation from
    09:49:04.816 to 09:50:04.117, which is 38 to 98 s after it completed.
- CODE and SCRATCH:
  - A completed placement operation is **deliberately retained** as
    spread-relevant (`buildPriorityRecoverySpreadRelevantOperationContexts`,
    `isPriorityRecoveryCompletedPlacementOperationContext`).
  - The assessment passes that retained list, not the active list, to the
    spread completion.
  - A completed ADD and a syncing ADD give byte-identical output:
    - `satisfied: true`;
    - `operational_target_visible_on_eligible_node`;
    - `spread_satisfied_in_flight`.
  - Nothing about the operation's progress ends the window. It ends when
    the operation leaves the spread-relevant set, by supersession through a
    newer terminal operation of the partition, or by a row refresh.
- That matches the measured release when a tracked ADD goes terminal at
  its 60 s voter-ready timeout. Which of the two exits occurs is
  unobserved.
- The analyst also proposed that the learner's row is stale because the
  second mechanism's readiness filter denies its ledger reads. I do **not**
  adopt that.
  - Only one of the six failed operation reads on that node falls inside
    the window.
  - Staleness is not needed to explain the double count.

**The rule's gap, stated narrowly.** A satisfying operation must add a
holder node that the gap's own census has not already counted.
- The rule dedupes targets within the operation set. It never dedupes
  against the census.
- The needed input does not reach it. The derived summary builds the holder
  node set and discards it. The planner entry carries only a count.
- The REPLACE remove-dispatch grace targets a node that is deliberately not
  yet counted, so it survives the narrow rule.

**Consumers of the inflated "satisfied" (CODE).** It is not
presentation-only.

*Decision inputs:*
1. The follow-up planner. `unresolvedSemanticState` goes false, so the
   scheduled follow-up rebalance for the partition is **withheld**. Creation
   of a recovery operation is unaffected.
2. The serial-wait release fires
   (`hasPriorityRecoveryReleasedSerialWaitCompletion`).
3. The ADD drain declares source evidence not required.
4. The concurrent-ADD budget and the priority-readiness blocking set ignore
   the operation. This is permissive: more ADDs are allowed, none withheld.
5. The publication-recovery gate drops `PRIORITY_PARTITIONS_NOT_SPREAD`.
   That sets off a chain:
   - startup authority goes READY;
   - `priorityControlPlaneRecovery.active` goes false;
   - the `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING` readiness reason is
     **removed**;
   - the publication owner's freshness fence and outcome go READY;
   - the recovery protocol state leaves `priority_spread_pending`.
6. Drain-completion acceptance in the operation workflow's
   recovery-reconcile paths.

*Persisted and replicated:*
- `priorityPartitionSummaryChanged` is computed against the chosen summary.
  It triggers a publication metadata refresh that writes
  `control_plane_publications.priority_partition_summary` with
  `satisfied: true`.
- On receiving nodes it feeds three readers:
  - the available-node membership constraint
    (`unified-rebalancer-available-nodes.js`);
  - the joiner's control-plane recovery health;
  - the demo's formation gate (`prioritySpread.ready`).

*Inert:* `publicationRefreshRequired` has no consumer outside its two
producer files.

*Presentation only:* the admin snapshot, the topology-convergence
constants, and the residual and liveness scripts.

**What it does not do.**
- It does not stop the cure on the seed. The seed's planner uses its own
  census, and every seed-side budget path it touches is permissive.
- It cannot explain the second mechanism's open question, a seed that
  stays `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`. The one readiness chain
  it reaches is cleared, not held.
- MEASURED corroboration:
  - 14 consecutive seed convergence-trace lines across the refusal window
    read `prioritySpreadPending: false`.
  - 11 read true outside the window.
  - `false` is also the no-evidence default, so this is corroboration, not
    proof.

**Tests that pin today's rule.** A repair would turn these red:
- `priority-recovery-spread-stall-unmask.test.js` (distinct targets suffice,
  with no notion of census holders);
- the terminal-placement spread-closure cases (a completed placement still
  certifies closure);
- four serial-wait spread-satisfied files;
- `priority-recovery-spread-satisfied-stall-reentry-test-cases.js`.
- The REPLACE grace tests in the first file must stay green.

**Unobservable.**
- Whether the seed's own derivation took the closure summary.
- Whether the inflated summary reached a persisted publication row in a
  measured run.
- Which exit ends the window.
- The counted operation's status as the learner saw it.
