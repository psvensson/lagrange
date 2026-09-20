---
id: formation-seed-decoupling
status: open
proof: certification
roadmapRow: RM-0.2-five-node-convergence
doneWhen:
  probe: scenario-harness
  args:
    scenario: release-0-2-five-node-cold-formation
    consecutive: 3
    metric: priority
quests:
  - formation-harness-model-from-contracts
  - formation-calibration-run
  - formation-contracts-registration
  - formation-sim
  - seed-formation-decoupling
  - five-node-cold-formation-certification
  - seed-replica-production-scheduling-defaults
  - learner-promotion-guard-inputs-observed
  - critical-spread-overflow-disagreement-replay
authorizes:
  - examples/service-data-affinity
  - scripts/checks/formation-health.js
  - src/control-plane
  - src/bootstrap
  - src/rebalancer
  - src/worker
  - src/diagnostics
  - src/message-group
  - src/raft
  - src/cdc
  - src/transport
  - src/admin
  - src/query
  - src/policy
  - src/lagrange-runtime-startup.js
  - test/convergence
  - test/simulation
  - test/distributed/harness
  - test/diagnostics
  - test/runtime
  - test/scripts/formation-health.test.js
  - test/integration/helpers
  - test/integration/message-group-multi-join-formation.integration.test.js
  - test/integration/preflight-critical-path-hops.integration.test.js
  - test/integration/membership-consistency.integration.test.js
  - test/integration/membership-consistency-integration-test-helpers.js
  - test/shards
  - scripts/quest-evidence/formation-harness-model-from-contracts.js
  - scripts/checks/formation-budget.js
  - scripts/checks/formation-sim-reproduces.js
  - scripts/checks/formation-calibration.js
  - scripts/checks/formation-contracts-registration.js
  - architecture/contracts
  - test/bootstrap/readiness-handoff-liveness-witness.test.js
  - test/control-plane/core-system-logic-runtime-witness.test.js
  - test/rebalancer/rolling-restart-rebalancer-handoff-witness.test.js
  - docs
  - src/partition
  - src/service
  - src/node
  - test/partition
  - test/service
  - test/node
  - test/bootstrap
  - test/raft
  - test/message-group
  - test/workflow
  - test/control-plane
  - test/query
  - test/admin
  - scripts/quest-evidence/seed-replica-production-scheduling-defaults.js
  - scripts/quest-evidence/learner-promotion-guard-inputs-observed.js
  - scripts/quest-evidence/critical-spread-overflow-disagreement-replay.js
  - scripts/quest-evidence/critical-spread-learner-ring-characterization.js
  - scripts/quest-evidence/readiness-admission-freeze-observed.js
  - scripts/quest-evidence/lease-liveness-watermark-observed.js
  - scripts/quest-evidence/closure-witness-route-observed.js
  - scripts/quest-evidence/critical-spread-transition-authority-carry.js
  - scripts/quest-evidence/critical-spread-transition-authority.js
  - scripts/check-guideline-deferred-outcomes.js
  - scripts/check-complexity.js
  - scripts/quest-evidence/critical-spread-overflow-budget-audit.js
  - scripts/quest-evidence/overflow-budget-audit-evidence-binding.js
  - scripts/quest-evidence/readiness-admission-transitions-observed.js
  - scripts/quest-evidence/readiness-routing-denial-cause-carried.js
  - test/rebalancer
---

# Formation without seed starvation

## Amendment (2026-09-18): the causal hypothesis is falsified

The goal and `doneWhen` stand unchanged: three consecutive cold five-node
formations, certified live. What this amendment withdraws is the causal
claim in the title and in the text below. That text stays as written, as the
record of what the epic set out to prove.

**Correction to the evidence.** Earlier summaries described the nightly seed
figure as "seed busy time under the 10 % budget in 7 of 7 runs". That
statement is wrong and is withdrawn:

- **The nightly metric is unexplained event-loop blocking.** It counts
  event-loop gap time not explained by tagged work. It is not total seed busy
  time: the seed is busy for most of the window (90.0 % over the attribution
  window of the 2026-09-17 calibration run).
- **The implemented starvation criterion** (`formationVerdict`, `isSeedStarved`)
  is unexplained blocking over 10 s x machine factor (30 s on the GCP runs) or
  over 25 % of the observed window.
- **The budget below is not enforced.** "Seed event-loop gap total < 10 % of
  the formation window" is stated under Binding constraints, but it is not
  implemented: `scripts/checks/formation-budget.js` does not exist.
- **2026-09-13:** the calibration run on 8a6275a4d was classified starved
  (63,127 ms unexplained, 18.5 %) and nevertheless PASSED.
- **The failures happened without starvation.** Three of the six nightlies
  from 2026-09-13 to 2026-09-18 FAILED with no starved seed (09-13, 09-16,
  09-18). None of the six nightlies, and not the 2026-09-17 calibration run
  either, was classified starved.

The supported conclusion: **under the measured runs, seed starvation is
neither necessary nor sufficient for the observed formation failure.**

**What the investigation found instead**
([causal-packet-2026-09-18.md](formation-seed-decoupling/causal-packet-2026-09-18.md)):
a deterministic authority disagreement during a critical spread cure. The
placement planner authorizes an ADD that requires temporary voter overflow.
The receiving partition independently re-derives whether that overflow is
admissible, and it may refuse the same transition. The operation can then
end only by its 60 s voter-ready timeout and a re-plan. In the three failures
that stall overlapped the schema-admission wait. The failure labels
`node_ready_lease_incomplete` and `control_plane_pressure` are observers of
it: they also appear in passing runs.

**Ownership decision (owner, 2026-09-18).**

- **Policy owner.** `src/rebalancer/replica-placement-cure-policy.js` is the
  single authority for whether a spread cure may temporarily exceed the
  replica target.
- **It authorizes an exact transition, not a rule.** It authorizes one
  specific membership transition from the membership it observed: here, 4
  voters on 2 distinct nodes with RF 3, plus exactly one voter on the missing
  node, for 5 temporarily. Cleanup then returns membership to RF 3 with the
  required spread. It does not grant a blanket "target + 2" or "overflow while
  spread is open".
- **The decision travels with the operation.** The operation carries that
  decision to the learner. The receiving partition consumes it instead of
  re-deriving placement policy from its local state.
- **What the partition keeps.** It stays authoritative for mechanical and
  local safety: a malformed or unauthorized operation, a stale membership
  generation, a destination or state that no longer matches, a conflicting
  transition, a Raft safety invariant, and a resulting voter count above the
  exact bound the operation authorized.
- **Remove-before-add is not the primary fix.** It stays a falsifier and a
  design alternative. Add-before-remove keeps redundancy while the missing
  failure domain gains its voter; the defect is the second veto, not the
  ordering.

**The work, in order.** No behaviour changes before the first three items
are done:

1. **Verify what is already on main.** Independent verification of the
   source changes that quests on this epic put on main without one:
   `formation-sim-production-replica-composition` (E),
   `formation-sim-live-correspondence` and
   `formation-sim-production-time-authority-closure`. Each is judged against
   its own claimed invariant at current main, and recorded GREEN or RED on its
   own log.
2. **Reproduce and trace.** Reproduce the 2026-09-16 disagreement locally,
   with 2026-09-15 and 2026-09-17 as controls, and resolve the packet's first
   gap. That means every input to the learner-side guard, each classified as
   placement policy, local or Raft safety, observation or projection, or
   obsolete duplicate authority.
3. **Propose the smallest operation contract** that carries the planner's
   decision across the boundary.
4. **The behaviour-changing successor quest** (working name
   `critical-spread-transition-authority`). Its proof chain:
   - the failing scenario reproduced;
   - one operation-specific placement decision flowing from planner to
     receiver;
   - local falsifiers: the 09-16 scenario fails before and converges after;
     09-15 stays convergent; a stale authorization is rejected; a concurrent
     membership change invalidates it or re-plans; an ordinary ADD cannot use
     the overflow authority; desired RF stays 3; the surplus is cleaned up;
     three distinct eligible holders result; no second placement-policy
     authority remains on the path;
   - only then live certification: three consecutive passes, with every
     intermediate failure retained as evidence.
5. **`seed-formation-decoupling`** (the planned starvation fix, never started)
   is withdrawn. Its place in the chain is taken by the successor quest.

Five-node cold formation completes without starving the seed, proven first in
a deterministic in-process simulator and only then certified live. This is the
altitude the 2026-09-05 finding asked for: every system-table replica lives on
the seed during formation, so one event loop is Raft leader of everything,
readiness planner and admin snapshot server; the seed showed 30 gaps totalling
66.5 s (49.8 s unattributed) in a 135 s window, the readiness lease never
completed, and critical spread never planned. A week of readiness-owner
increments did not cure it, and 0.2.0 shipped with formation demoted from gate
to signal. This epic restores a proof before the claim.

`doneWhen` is the existing certification streak: three consecutive
fresh-container five-node runs, priority metric. Confirm the scenario id
against the harness before sealing. Live runs are terminal evidence only
here; every child quest is deterministic or simulation.

**Scope widening (2026-09-19, R16).** Three quests follow from the amendment,
and the paths they need are authorized above.

- **`seed-replica-production-scheduling-defaults`** restores the two
  production defaults that the retrospective verification of
  `formation-sim-production-replica-composition` found changed. Seed-hosted
  replicas are treated as owning a clock although none was supplied, and
  `ServiceReconciler`'s yield was changed. The quest also owes the two
  reconcile-queue witnesses named on
  `formation-sim-rebalancer-current-work-completion`.
  Paths: `src/node`, `src/service`, `src/partition`, and their test trees.
- **`learner-promotion-guard-inputs-observed`** logs, without changing any
  decision, the inputs the learner-side count check decided on, so the next
  failing nightly shows which input zeroes the overflow budget.
  Paths: `src/partition`, `test/partition`, `test/control-plane`.
- **`critical-spread-overflow-disagreement-replay`** replays the 2026-09-16
  operation sequence on the simulator's node hosts. It is test-only.
  Superseded 2026-09-19 by the owner's decision below; nothing of it landed.
- **`critical-spread-learner-ring-characterization`** runs the production
  chain over rows: summary derivation, closure evidence, decision snapshots,
  closure witness, summary choice, completion and count check. It pins the
  two recorded readings as one minimal pair: an in-flight spread-cure ADD
  whose target row is voter-visible (refused, budget 0) or not (granted,
  budget 2). It is test-only and makes no simulator change. The route is in
  the fourth addendum.

Each quest gets its receipt harness under `scripts/quest-evidence/`. The
static snapshot reproduction of 2026-09-18 is a candidate mechanism only. Its
trigger (a joiner status the live logs do not show) is not the demonstrated
live input, and the view the live logs do show grants the promotion in the
same harness.

## Owner decisions (2026-09-19)

Context:
- The measured guard inputs and the second causal packet are recorded under
  `formation-seed-decoupling/`.
- A verifying agent cautioned that the proof apparatus is becoming a
  subsystem able to introduce errors.
- Quest `formation-sim-production-replica-composition` changed production
  defaults across 84 `src` files while claiming it had not.

The owner decided the following.

1. **The broad sequence replay is superseded.**
   - `critical-spread-overflow-disagreement-replay` needed a virtual-time
     anchoring seam and a wider SQL engine seam.
   - Its reproduction also refused promotions the live run granted.
   - A narrow characterization replaces it: the production chain from
     rows to the count check (summary derivation, closure evidence and
     witness, summary choice, completion). Its outputs are held to the
     recorded guard inputs, for the two readings of the minimal pair.
   - It makes no simulator change.
2. **Simulator quests may not touch `src/`.**
   - A seam the simulator lacks becomes its own production quest.
   - That quest gets its own independent verifier and a probe that
     production defaults are unchanged. The pin is
     `test/bootstrap/production-scheduling-defaults.test.js`.
   - Simulator work is justified only by a named live interaction the
     simulator lacks, one seam per quest. It narrows; it does not broaden.
3. **The planner keeps counting an active catch-up learner as planned
   coverage.**
   - The promotion guard stops reading the priority summary once the
     operation carries the authorization (the ownership decision of
     2026-09-18).
   - The projection keeps one consumer and the ring closes.
4. **For the second mechanism, observability comes first.**
   - The six additions listed in the packet land first, with no behaviour
     change.
   - The step that stops readiness builds being admitted is unobservable
     today.
   - The three owners named there are decided after the next failing run
     shows which silent condition holds.

Scope widening for decision 4 (R16): `test/query` and `test/admin`, and the
receipt harness of `lease-liveness-watermark-observed`.
- The observability is split by owner into two quests:
  - `readiness-admission-freeze-observed`: the planning owner's reuse and
    publish decisions, the routing denial's record age, and the
    filtered-by-readiness cause.
  - `lease-liveness-watermark-observed`: the control snapshot's stale
    watermark, the lease sweeper's skip, and the observer's witness.
- Both are log-only.

Later the same day the owner also superseded two simulator quests that were
never sealed:
- `formation-sim-cold-process-production-state-isolation`. Its cause was
  closed by `formation-sim-production-time-authority-closure`.
- `formation-sim-priority-recovery-drive-order-authority`. It was refuted by
  its own finding.
`formation-sim-calibrated` and `formation-sim-production-replica-composition`
stay open and are not touched.

The second concurrent add-first move on user-table partitions stays a
separate planner-dispatch question.

## The authority repair, staged (2026-09-19)

**The owner's priority.** The owner named `critical-spread-transition-authority`
plus three consecutive cold five-node certifications as the first priority
(2026-09-19).

**Staging.** The design is in
[design-critical-spread-transition-authority.md](formation-seed-decoupling/design-critical-spread-transition-authority.md).
It lands as two quests:
- **`critical-spread-transition-authority-carry`.**
  - The cure policy mints one exact-transition authorization.
  - It rides on the operation's existing metadata.
  - The learner's guard decodes and logs it.
  - No decision changes.
  - Lab formations on it measure which promotions would have carried a valid
    authorization, before anything is removed.
- **`critical-spread-transition-authority`.**
  - The guard's cap becomes the authorized bound.
  - The priority-summary and overflow-budget read is deleted from the
    promotion path.
  - The budget and its completion state are deleted as obsolete duplicate
    authority.
  - Precondition: the inventory of every production path that can bring an
    add-like operation on a critical partition to promotion while over
    target.

**`closure-witness-route-observed` is superseded without landing.**
- The lab formations on its staged tree answered its question (sixth
  addendum).
- Its verifier rejected round 1 on a field outside that answer.
- The enforce quest deletes the payload block it adds.

**The separate characterization quest is folded in.**
- The separate quest `critical-spread-learner-ring-characterization` is not
  started.
- Its content becomes the red tests of these quests, on the recorded
  fixture.
- The sixth addendum showed the minimal pair it was briefed on was the wrong
  pair.

**A second, separate defect (sixth addendum).**
- The spread completion counts a holder node twice.
- So the closure witness reads satisfied while a third holder is still
  missing.
- That is the projection's owner, not the guard's.
- Whether and when it is repaired is the owner's decision.
- It is not needed for the authority repair.

**Certification needs more than this repair.**
- The second mechanism separates PASS from FAIL better than the refusal
  does. Its observability quests continue in parallel:
  `readiness-admission-freeze-observed` and
  `lease-liveness-watermark-observed`.

## Owner direction before enforcement (2026-09-19, evening)

**The order is binding:** carry verification -> land the carry stage if
green -> `critical-spread-overflow-budget-audit` -> resolve the seven
partitions, the unhealthy-source REPLACE and the epoch ownership -> the
enforce stage -> certification.

**The carry stage.**
- It is verified exactly as staged and is not broadened while verification
  runs.
- It lands only if the verifier confirms four things:
  - decision neutrality;
  - byte-identical behaviour for rows without an authorization;
  - minting from the partition row's declared replication authority;
  - no hidden new decision owner.
- If any of these fails, it goes back to its implementer. Nothing
  compensates elsewhere.

**Clean carry-stage lab runs do not start the enforce stage.**
- Enforcement begins only when every admission that depends on the old
  overflow budget today meets one of two conditions:
  - it is backed by an explicit authorization owner;
  - it is independently proved unnecessary.
- "Not observed in these formations" is evidence, never a semantic
  invariant. A branch with no witness stays **unproven**.

**`critical-spread-overflow-budget-audit`** is a read-only evidence quest
placed in front of enforcement. Its question is: for every path the guard's
bootstrap overflow budget can admit today, what semantic condition makes
that admission legitimate, and which authority owns that condition? It is
not answered from lab frequency alone.

Its output is a decision matrix, not a repair. There is one row per
admission class, with these columns: current predicate -> current budget
dependence -> minting owner -> canonical authority -> reachable witness ->
intended post-enforcement rule.

It covers at least three classes.

1. **The seven partitions** the guard treats as bootstrap-critical and the
   cure policy cannot authorize: ledger, services, nodes, partitions,
   message_groups, tables and config.
   - For each, establish whether an over-target promotion is reachable and
     legitimate. The methods are:
     - code-path tracing;
     - an exhaustive or synthetic state grid where practical;
     - production-shaped replay;
     - the existing formation evidence.
   - The mint is **not** widened to reproduce the old allowlist.
   - A legitimate transition gets its authorization from the owner of the
     semantic condition that makes it legitimate.
   - An unreachable or obsolete path is proved so independently before its
     admission is deleted.
   - Partitions with genuinely different semantics are modelled explicitly.
2. **Unhealthy-source REPLACE.** The question is whether an over-target
   REPLACE is an intentional safety mechanism, or one that merely survives
   on the old budget.
   - If it is intentional, it gets its own bounded authorization, minted by
     the owner of the replacement workflow.
   - It never gets a spread-cure authorization reused because the
     arithmetic happens to match.
3. **Epoch disagreement** is an enforcement blocker.
   - The planner reads the active publication's epoch. The partition reads
     the highest published epoch.
   - This is resolved at the authority boundary, not with tolerance in the
     guard. There are two acceptable shapes:
     - one canonical publication and epoch interpretation for both minting
       and validation;
     - an authorization that names a stable publication object which both
       sides resolve through the same owner.
   - A permanent false-refusal mode is not acceptable after enforcement.

**Lead's note on the audit's scope (2026-09-19, from the carry stage's
verification).**
- The guard's bootstrap-critical predicate is true for all 45 system
  partitions at this head, not 12.
  - The cure policy can mint for 5 of them, so 40 cannot carry an
    authorization.
  - The seven the owner named keep one row each.
  - The other 33 appear too. They are grouped only where producers,
    predicates and reachability are demonstrably identical.
- Two further corrections feed the audit:
  - The over-target unhealthy-source REPLACE is suppressed by its only
    caller when the inventory's active count exceeds the target. The
    residual risk is two different censuses.
  - The planner's epoch is null while any newer publication is
    ESTABLISHING, so no authorization is minted in that window. A
    promotion-time stale fence would read stale after every later join.

**The two observability quests stay separate from the authority work and
land independently once their own verification is green.**
- `readiness-admission-freeze-observed` must carry the actual freeze or
  refusal cause through the four places where it is dropped today.
  "Partition service not found" is not sufficient where readiness admission
  is the responsible owner.
- `lease-liveness-watermark-observed` has its four previous failures
  re-proved by the independent verifier:
  - a logger failure cannot affect the decision;
  - durations stay truthful after partial sweeps;
  - overlapping snapshots cannot invent transitions;
  - the production API and logging wiring is exercised and not bypassable.
- The lease quest is observability only and acquires no authority over
  readiness or repair decisions.

**Lab evidence.** The four-core machine added on 2026-09-19 is a deliberate
slow-machine, adversarial sample. It is never pooled into A/B conclusions,
and its failures are stress evidence, not evidence for or against a staged
repair.

**Also decided.**
- The spread-completion double count gets a read-only trace of **all**
  consumers before any repair quest is authored. The trace asks whether the
  count is duplicated presentation and accounting only, or whether anyone
  consumes the inflated value as a decision input.
- Simulator commit `22420f874` is audited file by file and the seven
  proposed pins are added. This happens after the carry verification, or in
  parallel only where it cannot interfere with the current lab evidence.

## Owner direction for the overflow-budget audit (2026-09-19, late)

The carry stage is sealed. Its semantics are not modified during the audit
unless a new falsifier proves one of its sealed claims false. The enforce
stage is not started.

**The audit's purpose, narrowed and strengthened.**
- Enumerate every production path whose success can currently depend on the
  bootstrap overflow budget.
- Determine what explicit authority would have to replace that budget before
  enforcement can remove it.
- Frequency of observation is not a proof criterion. Formation evidence
  produces witnesses and falsifiers. An unobserved recovery path stays
  unclassified, never unnecessary.

**One row per budget-admitted case**, with these columns:
path / partition class / triggering state / current guard reason / current
budget dependency / semantic owner / proposed authorization kind / minting
evidence available / validation evidence available / reachable witness /
enforcement disposition.

The disposition is one of:
- `explicit-authority-required`;
- `proved-unreachable`;
- `proved-obsolete`;
- `still-unclassified`.

Nothing becomes "no authority needed" because it did not occur in the lab.

1. **The bootstrap-critical partitions.**
   - For the five the spread-cure policy can mint for, confirm that every
     legitimate over-target transition is covered by the carried
     authorization. Those five are:
     - schema_operations;
     - sql_transactions;
     - sql_transaction_participants;
     - sql_write_operations;
     - control_plane_publications.
   - Look for ways to reach the guard without passing the minting owner:
     alternate planners, follow-up operations, recovery paths and direct
     coordinator entry points.
   - Separately audit the partitions the guard's budget covers but this
     authority cannot mint for. The owner names the ledger, services,
     nodes, partitions, message_groups, tables and config.
   - The mint is not widened to match the old budget.
   - Six questions for each such partition:
     - can an over-target promotion or replacement reach the guard;
     - under what semantic condition is it legitimate;
     - which component owns that condition;
     - is it really the spread-cure semantic or a different authority;
     - can a production-shaped witness be constructed;
     - what fails today if the budget is removed.
   - Different authorities are modelled explicitly.
2. **Unhealthy-source REPLACE is audited independently.** It is not
   classified as a spread cure until proven.
   - Trace it from the decision that a source is unhealthy, through planner
     and coordinator construction, to the guard.
   - Classify the temporary over-replication as one of:
     - required for safety;
     - required for availability;
     - an implementation artifact;
     - accidental reliance on the budget.
   - If it is legitimate, the owner that knows why the replacement is
     authorized eventually mints its own bounded authorization.
   - The guard never infers replacement legitimacy from topology.
3. **The epoch domain is closed before enforcement.** The alias
   `observedMembershipEpoch` escaped the inventory.
   - The inventory covers every reader, writer, alias, projection and
     serialized representation of the epoch concept.
   - It establishes:
     - the canonical meaning;
     - the authoritative writer;
     - every reader and every alias;
     - whether readers observe the same publication object or state;
     - whether one reader can legitimately lag another;
     - exactly what makes an authorization stale.
   - The end state is one predicate owned in one place.
   - No tolerance such as "current or previous epoch" is added unless the
     authority model itself proves that window meaningful.
   - Reader disagreement is never solved inside the guard.
   - The carry stage's invariants are preserved if possible: the guard reads
     no epoch tables, and the evaluation has one reader.
   - The future transition is tested explicitly:
     - an authorization that is present, from the correct authority, with a
       matching epoch, is honoured;
     - the falsifiers are a wrong, future, stale or missing epoch, a wrong
       partition, an altered authorized voter bound, and an authorization
       from the wrong semantic authority.
4. **Four carried-forward details are investigated before enforcement.**
   - **The partition-row read's timing.** Trace the lifetime of the declared
     replication authority across planning and execution. Move the read only
     if a real inconsistency exists.
   - **The row type ignored by the evaluation.** Could an authorization
     valid for one operation or record type be interpreted as another?
     - If type is part of authority identity, bind it.
     - If it is irrelevant, prove it.
   - **The authorized voter count**, `max(in-flight active count, active voter count)`.
     - It is not silently renamed a voter census.
     - Trace why each term is needed, and construct cases where they differ.
     - Decide which quantity is bounded:
       - voters;
       - active holders;
       - effective membership during transition;
       - another defined quantity.
     - Give it one name and one owner.
   - **`honoured` is the only grant outcome.**
     - A valid, decoded or bound-matching authorization never grants by
       itself.
     - A mutant mapping every other outcome to grant must die.
5. **Observability stays independent.**
   - `readiness-admission-freeze-observed` continues on its own.
   - Enforcement does not wait for it unless it uncovers evidence that
     changes the admission semantics.
   - Observability never becomes a repair owner.
6. **The slow four-core host stays an adversarial class.** It is kept out of
   homogeneous A/B comparisons, and its failures are never normalized out of
   the corpus.

**Enforcement entry gate.** The enforce quest is not begun until the audit
demonstrates all nine:
1. every current budget admission path is classified;
2. every legitimate reachable path has an identified semantic owner;
3. every such owner either already mints the required authority or has a
   precisely scoped repair quest to do so;
4. REPLACE semantics are classified;
5. the complete epoch domain, including `observedMembershipEpoch`, is
   inventoried and has one canonical predicate;
6. the meaning of the authorized count is defined;
7. authorization identity and type binding is settled;
8. only `honoured` can grant;
9. there is a falsifier for each authority boundary, not merely happy-path
   formation evidence.

The enforcement quest is then authored from the audit result, not from the
existing guard. The shape is:
- the semantic owner decides;
- the owner mints a bounded authority;
- the operation carries it unchanged;
- the guard validates through one canonical authority predicate;
- only honoured replaces the compatibility budget.

The guard never reconstructs why an operation ought to be legal.

**Lead's note on the partition count.**
- The owner's text speaks of twelve bootstrap-critical partitions, five
  plus seven.
- The carry stage's verifier measured the guard's predicate
  (`isBootstrapCriticalSystemPartitionId`) as true for all 45 system
  partitions at this head. Five are mintable and 40 are not.
- The audit re-measures this first.
- The owner's seven keep one row each.
- Every other partition the predicate admits is audited too. It is never
  assumed equivalent without a demonstrated identity of producers,
  predicates and reachability.

## Owner's architectural decisions for the authority model (2026-09-19, night)

**Standing rules.**
- The audit is verified exactly as submitted, and no matrix row is
  repaired, narrowed or reinterpreted while verification runs.
- The enforce stage remains closed.
- The compatibility budget is not the specification.
- The purpose is to discover the legitimate transitions and give each one an
  explicit owner. It is not to recreate every behaviour the budget happened
  to permit.

1. **`honoured` becomes the complete authorization result.**
   - The guard never grants on `honoured && withinAuthorizedBound` as two
     independently interpreted conditions.
   - The bound belongs inside the canonical evaluation predicate, so a
     record authorizing 5 and presented for a transition to 8 is not
     `honoured`.
   - The target is `evaluation.outcome === honoured`, and nothing else
     grants.
   - This is done in a separate pre-enforcement quest. It changes
     evaluation and diagnostics, and it changes no production admission
     decision.
   - Its mutants cover:
     - bound exceeded;
     - bound exactly reached;
     - malformed bound;
     - absent bound;
     - valid record with the wrong partition;
     - valid record with the wrong semantic authority;
     - valid record with the wrong epoch.
   - Enforcement may consume `honoured` only after that evaluation is
     independently sealed.
2. **No `priority_recovery_relocation` kind merely because REPLACE lives in
   another module.** Mechanism is not authority.
   - If verification confirms that the follow-up move decides the same
     distinct-node spread gap the cure policy owns for ADD, that is a split
     owner to be unified, not institutionalized.
   - There is one semantic owner of "this partition has insufficient
     distinct-node spread and this transition is an authorized step toward
     repairing it".
   - That owner may authorize different operation shapes.
   - The follow-up move obtains the decision from it.
   - A separate kind exists only for a demonstrably different semantic
     reason.
3. **The cross-partition budget coupling is legacy, not contract.**
   - No replacement authorization may let partition A exceed its bound
     because partition B has a spread problem.
   - Every authorization is attributable to its own partition and
     transition.
   - For the ledger, first determine why the ledger itself legitimately
     needs the over-target transition.
   - If the only explanation is spillover from the old summary, it is not
     reproduced.
   - If there is a ledger-local availability or recovery need, its owner
     gets an authority scoped to that reason.
4. **The establishing-window and undeclared-row cases are findings, not
   automatically missing authorities.**
   - No authorization is minted merely to keep today's admission alive.
   - For each case the audit determines which of these it is:
     - a legitimate bootstrap transition with some other explicit owner;
     - an old fail-open path that enforcement should intentionally
       eliminate.
   - For the establishing window, the publication or formation owner
     actually knows why the transition is safe. The spread-cure owner never
     infers it.
   - Until that is answered, both rows stay `still-unclassified`.
5. **The canonical epoch reader is not selected while the census has
   `unknown_not_traced` entries.**
   - Finish those traces first, or remove entries from the domain with
     evidence.
   - Then define one concept. The owner's expectation is "the
     topology/publication version whose membership state the authority
     owner used when authorizing this transition".
   - The exact definition is derived from the existing owner. The
     authorization binds to it explicitly. The predicate is owned in one
     place.
   - The guard never decides what "current epoch" means, and never queries
     another table to reconstruct it.
   - Three edge cases are unacceptable:
     - a future epoch is honoured;
     - an invalid supplied epoch reads not-evaluated;
     - epoch zero honours arbitrary records.
   - An explicitly supplied bad epoch must fail evaluation.
   - The default is exact semantic match, unless the completed domain audit
     establishes a legitimate multi-epoch window.
   - No "current or previous" tolerance is added to make tests pass.
6. **The authorized count needs a definition, not a better name.**
   - Prove why `max(in-flight active count, active voter count)` safely
     represents what is bounded.
   - Construct adversarial cases where the two views disagree in membership
     identity, not only in count.
   - Determine whether an invariant guarantees that one view subsumes the
     other. Otherwise the max may undercount the union.
   - A name such as `authorizedMembershipCeiling` is used only with a
     precise population and a proof.
   - `authorizedVoterCount` is not exposed as protocol terminology if that
     is not what it means.
7. **Authorization identity is bound explicitly before multiple kinds
   exist.**
   - The identity is never left to partition-scoped replica ids.
   - The audit covers at least:
     - partition identity;
     - semantic kind;
     - operation class, if it changes what is authorized;
     - topology/publication epoch;
     - membership ceiling;
     - destination and replica identity where relevant.
   - The row's `type` is not bound merely because it exists.
   - The test is: could the same otherwise-valid authorization be replayed
     through another operation class and acquire authority it was not
     intended to have? If yes, bind the class. If no, prove why.
8. **Initial provisioning stays its own semantic question.**
   - Formation and bootstrap are not spread recovery.
   - If provisioning needs over-target transitions, the formation owner gets
     an explicit bootstrap authority.
   - If it does not, the compatibility admission is proved unnecessary.
   - The rows stay unclassified until known.
9. **Gate item 3 authorizes quest design, not implementation.**
   - After round 2, narrowly scoped repair quests are authored for the
     surviving explicit-authority rows.
   - They are grouped by semantic owner, not by row and not by ADD or
     REPLACE.
   - They are not all started automatically.
   - The likely decomposition, to be derived from the verified matrix:
     - complete the evaluation semantics;
     - unify the spread-recovery decision owner across mechanisms;
     - publication and establishing authority, if legitimate;
     - ledger overflow, only if a ledger-local need is shown;
     - formation and bootstrap authority;
     - the guard-invisible-operation and rematerialization classes.
10. **`readiness-routing-denial-cause-carried` stays parked.**
    - When resumed, it is scoped structurally:
      - one owner of the failure-entry or envelope shape, or a carrier that
        does not rely on hand-maintained field lists;
      - the transaction protocol included;
      - mixed-participant attribution defined;
      - a typed preservation test, not a text heuristic;
      - all explicit-list projections covered by one contract.
    - It stays behind the authority path, unless nightly evidence makes the
      cause necessary to diagnose formation.
11. **The four nightly instruments are falsifiers, not authorities.**
    - They challenge rows and produce witnesses.
    - They never promote a `still-unclassified` row because something was
      not observed.
    - A transition outside the matrix is an audit failure. The missing
      admission class is added before proceeding.

**Order.**
1. Round-2 verification.
2. Correct only verifier-proven audit defects.
3. Freeze the verified matrix and gate document.
4. Close the epoch census.
5. Define the membership-ceiling invariant.
6. Complete authorization identity and evaluation, so that `honoured` is the
   whole result.
7. Repair the missing semantic owners, grouped by authority.
8. Re-run the audit against those repairs.
9. Author the enforce quest from the resulting authority model.
10. Enforcement.
11. Certification.

## Owner's rules for the audit's final attempt (2026-09-19, night)

**Scope of the attempt.**
- Attempt 3 is the final attempt at the read-only altitude.
- Its job is a matrix we can trust, not the legitimation of every current
  behaviour.
- The enforce stage and every production repair stay closed.

**The rules.**

1. **Chained REPLACE is a consistency finding, not an authority
   requirement.**
   - The move owner serializes REPLACE to one in flight.
   - The real builder suppresses a second REPLACE at four ACTIVE voters.
   - A second REPLACE appears only when the prior target is still SYNCING
     in one membership view.
   - The admission class splits in two:
     - the ordinary overlap of one promote-then-remove hand-off, which may
       be legitimate replacement semantics;
     - additional overlap caused by disagreement between the membership and
       census views.
   - The second part is `still-unclassified`. Its requirement is to
     determine whether the two membership views are allowed to disagree in
     that state. If they are not, the owner/census boundary is repaired,
     rather than the resulting second transition being authorized.
   - Authorization never legalizes a state created by inconsistent
     observations.
   - The same rule applies to `replacement_handoff_overlap`.
2. **Producer-backed reachability comes only from the real chain.**
   - The chain is: real producer -> real operation representation -> real
     coordinator and repository path -> real guard.
   - Nothing is replaced by hand in between.
   - Hand-built grids prove guard behaviour only.
   - The evidence schema separates guard-reachable from producer-reachable.
   - A row may be guard-reachable yes and producer-reachable unproven.
3. **Lab attribution is explicit, or the witness stays unattributed.**
   - Timing is never attribution.
   - Attribution needs one of:
     - an operation or producer id correlation;
     - a payload uniquely attributable to a producer;
     - a trace naming the producing owner;
     - a structural proof excluding the other producers.
   - Otherwise the entry reads "lab witness: transition observed; producer
     unattributed". Such an entry upgrades nothing.
4. **Dependency is mechanically falsifiable.**
   - `does_not_depend` needs a named differential witness at budget = actual
     and budget = 0. The witness proves an identical admission boundary over
     the complete stated domain.
   - `depends` needs at least one state where changing only the budget
     changes the result.
   - The validator rejects either claim without its receipt.
5. **Gate status is derived from evidence and is monotonic.**
   - Removing a row, finding, test or requirement never makes an item
     demonstrated.
   - Item 8 is not-yet.
   - Item 8 ultimately depends on the sealed identity and evaluation quest.
6. **Grant-rule falsifiers.**
   - `honoured && withinAuthorizedBound` is the interim pin, for this audit
     only.
   - Boundary cases are added:
     - at the bound;
     - one above and one below the bound;
     - unreadable, missing, zero and very small bounds.
   - Mutants are added for `within !== false`, for ignoring small bounds,
     and for off-by-one.
   - The inherited requirement is recorded: after the identity and
     evaluation quest, the only consumer rule is `outcome === honoured`.
     Every bound and identity failure produces a non-honoured outcome.
   - Today's `honoured` is never described as complete.
7. **No claim of epoch-census completeness.**
   - Attempt 3 does not close the domain.
   - The inventory distinguishes three kinds of entry:
     - traced members of the suspected topology/publication-version domain;
     - aliases reached through data flow;
     - unresolved version-like values of unknown semantic relationship.
   - The validator rejects "complete", "closed" and their equivalents while
     unresolved entries remain.
8. **Confirmed semantic corrections.**
   - ADD and the follow-up REPLACE are two mechanisms of one distinct-node
     spread-recovery semantic, which means a split decision owner.
     - No second authority kind is proposed.
     - The future proposal is one spread-recovery decision owner, with both
       mechanisms consuming its bounded authorization.
     - Operation shape is bound strongly enough that an ADD authorization
       cannot authorize an unrelated REPLACE.
   - The establishing-window and undeclared-row rows are still-unclassified.
     Each states what would distinguish a legitimate transitional authority
     from a fail-open path.
   - No ledger authority is proposed.
     - The ordinary +1 is covered by the replacement allowance.
     - The extra overlap is the chained/census-disagreement condition.
     - Residual ledger overflow stays unclassified until a ledger-local need
       is shown.
9. **Gate items 3, 5 and 6 stay blocked or not-yet.**
   - Item 3 needs every legitimate reachable admission class associated with
     exactly one semantic owner, or a defined repair establishing one. That
     comes after the matrix is frozen.
   - Item 5 chooses no canonical reader in this attempt.
   - Item 6 records what must be established. The later membership-ceiling
     work tests identities as sets, over these cases:
     - status as a subset of raft;
     - raft as a subset of status;
     - overlapping non-subset sets;
     - disjoint differences with equal counts;
     - a stale member in one view and a newly admitted one in the other.
   - For item 6, the containment invariant is either proved, or it is
     recorded that `max(|A|, |B|)` does not bound `|A ∪ B|`. No formula is
     chosen in the audit.
10. **The repair-quest proposal is grouped by semantic cause, and nothing
    is started.**
    - Expected categories, if the evidence survives:
      - unify spread-recovery authority across ADD and REPLACE;
      - resolve the membership/census disagreement that can expose an
        otherwise-suppressed second REPLACE;
      - establishing-publication semantics;
      - undeclared-row and cache-disagreement semantics;
      - initial-provisioning semantics;
      - guard-invisible operation state;
      - operation-row re-materialization;
      - close topology/publication version identity;
      - define authorization identity and the membership ceiling.
    - No ledger-authority quest is proposed.
11. **Stopping condition.**
    - The attempt-3 result goes unchanged to independent verification.
    - If it fails on another ordinary audit defect, the audit is stopped.
      - No attempt 4 at this altitude.
      - The surviving evidence is recorded.
      - A narrower successor targets the unresolved structural problem.
      - Ordinary defects are: a missing row, false reachability, an
        incorrect classification, or a non-structural validator.
    - If it fails because a requested proof is impossible from guard-visible
      state, that is recorded as an architectural result. It is not encoded
      into the matrix.

**After approval.**
1. Freeze the matrix and the gate document.
2. Close the version and epoch domain, including aliases that do not
   contain the word epoch.
3. Define and prove the membership-ceiling invariant.
4. Build the identity and evaluation quest, so that the whole contract
   collapses into one `honoured` outcome.
5. Design semantic-owner repairs from the frozen matrix.
6. Re-run the read-only audit against the repaired owners.
7. Only then author enforcement.

## Architectural guidance (owner, 2026-09-19)

[architectural-guidance-membership-transitions-2026-09-19.md](formation-seed-decoupling/architectural-guidance-membership-transitions-2026-09-19.md).
- It states the preferred direction:
  - explicit membership transitions, not overflow numbers;
  - serialized transitions;
  - one semantic owner across mechanisms;
  - explicit monotonic generations;
  - bootstrap as its own transition type;
  - one typed carrier for failure evidence;
  - explicitly bound authorization identity.
- It is guidance for classifying findings and designing the next quests.
- It widens no scope and does not retrofit the running audit.
- During the epoch, membership and identity steps, test whether an explicit
  transition object makes the membership ceiling unnecessary or merely
  derived. If it does, prefer it.

## The audit's narrow successor (owner, 2026-09-20)

[owner-direction-audit-successor-2026-09-20.md](formation-seed-decoupling/owner-direction-audit-successor-2026-09-20.md).
- Round 3 of `critical-spread-overflow-budget-audit` was rejected on three
  ordinary defects, so the stopping condition held: no attempt 4. The audit is
  superseded by `overflow-budget-audit-evidence-binding`.
- The successor's whole scope: correct the two D3 hand-off rows; bind every
  receipt to the row, field, value and domain it proves; derive finding
  resolution and external-artifact existence from checkable artifacts; verify
  independently; freeze the matrix and the gate document on approval.
- No production change, no new matrix class, no re-audit of the 25 upheld
  rows, and none of the epoch, membership-transition, owner-repair or
  enforcement work. The matrix is not frozen by hand.
- The order after the freeze is unchanged, with step 2 opening on membership
  identities and explicit transitions rather than a count formula.

## The matrix is stopped; identity comes from production transitions (owner, 2026-09-20)

[owner-decision-transition-identity-2026-09-20.md](formation-seed-decoupling/owner-decision-transition-identity-2026-09-20.md).
- `overflow-budget-audit-evidence-binding` is exhausted: rejected-by-architecture
  after three independent rounds. A matrix row's identity has no mechanical
  source; for the seventeen still-unclassified rows it is prose. The 27-row
  matrix is not frozen and is not repaired further.
- What the verifiers established is sealed as historical evidence in the
  [verified evidence packet](formation-seed-decoupling/evidence/overflow-budget-audit-verified-packet-2026-09-20/README.md)
  (packet digest `deb8b8d10c8c4527…`, in its MANIFEST). It is not a complete
  classification and not an authority specification; its row ids are not
  canonical identities and carry no gate weight.
- This supersedes the order in the sections above. From here: (1) seal the
  packet; (2) close topology/publication version domains; (3) establish
  production-derived membership-transition identity and roles; (4) decide
  whether counts/ceilings are derived or authoritative; (5) complete
  authorization evaluation around that identity, `honoured` the whole result;
  (6) design semantic-owner repairs; (7) a new read-only audit whose classes
  derive from production transition state; (8) verify it adversarially; (9)
  author enforcement; (10) certification.
- Owner repairs and enforcement stay closed. The membership ceiling is a
  hypothesis to test against explicit identities and roles, not a goal.

## Simulator frozen (2026-09-19)

The owner decided to freeze the simulator as a bounded instrument and not to
finish it. This section amends the gates below; their original wording stays
where it was, marked.

**Why.**
- The simulator was built to reproduce a seed-starvation signature. The
  amendment of 2026-09-18 shows that signature is neither necessary nor
  sufficient for the failure.
- The two measured mechanisms are a logic ring and a routing and lease
  freeze. Neither is a cost-model effect.
- The node hosts never run the ADD workflow. Bootstrap, apply, transport and
  admin owners never run in it either, so neither mechanism can occur in
  the simulator.
- Closing that gap is broad realism work. The owner declined it, because a
  simulator quest has already changed production defaults once
  (`formation-sim-production-replica-composition`, repaired by
  `seed-replica-production-scheduling-defaults`).

**What stays on main and stays tested.**
- The deterministic substrate with byte-identical reports and the strict
  ambient-seam guard.
- The production time-authority closure and the mixed-clock repairs.
- Runner isolation.
- The charged seed host and the calibration lineage
  `formation-seed-2026-09-17`.
- The contract-derived harness model.
- The pin on production scheduling defaults
  (`test/bootstrap/production-scheduling-defaults.test.js`).

**The production footprint.** It was audited on 2026-09-19 in
[simulator-production-footprint-audit-2026-09-19.md](formation-seed-decoupling/simulator-production-footprint-audit-2026-09-19.md).
- E's 84 files are classified, with six listed exceptions.
- Outside E, 67 files are classified.
  - The largest commit of the lineage (5da0d7348, 35 src files) deliberately
    changed production planning and remove-safety behaviour. It also
    swallows Raft rejections. It has no independent verification on record.
  - Three commits are still unopened.
- Closing the freeze needs those read, that delta verified retrospectively,
  and the pins.

**What changes.**
- `formation-sim-calibrated` is superseded with a closing account.
- `formation-sim-production-replica-composition` closes after one bounded,
  file-by-file audit of its production delta. Anything the audit finds
  changed in production gets a pin or a repair quest of its own.
- `scripts/checks/formation-sim-reproduces.js` stays as the historical probe
  of closed quests.
  - It reads 3 unmet by design.
  - It is **not** a gate for anything that follows.
  - It is not converted into a regression guard.
- `scripts/checks/formation-budget.js` was never written. The numeric
  budgets under "Binding constraints" have no checker and are not gates
  until one exists.
  - They remain the owner's stated targets.
  - The nightly verdict (`scripts/checks/formation-health.js`) is the only
    implemented judgment.
- The repair quests are proven as follows:
  - owner-level red tests;
  - narrow characterizations on production owners held to recorded live
    inputs;
  - interleaved lab formations (five local processes, about four minutes
    each, compared per machine).
  The simulator is not used for this.
- A failed certification run is retained and ingested as **recorded
  evidence**, meaning logs, the guard-input and admission records, and a
  fixture where one is needed. It is not ingested as a simulator scenario.
  The rule that no further live certification run happens until the failure
  is explained and the explanation has a test stays.

## Binding constraints

- **No caching or memoising of readiness as the mechanism.** The sealed
  `bounded-read-amplification-scope` constraint stays. A design note whose
  mechanism is a cache is rejected.
- **GCP is never the iteration loop.** One authorized calibration run, then
  nothing live until certification.
- **Budgets** (amended 2026-09-19: the checker was never written and the
  simulator is frozen, so these are stated targets, not gates - see
  "Simulator frozen") in `scripts/checks/formation-budget.js`, read from the same
  report schema the live harness writes and the simulator must emit: seed
  event-loop gap total < 10 % of the formation window and max gap < 500 ms;
  all five nodes lease-complete within 45 s of the fifth join;
  `prioritySpreadGap` reaches 0 with ≥ 1 operation in flight within 30 s of
  quorum; admission leaves `critical_spread_open` within 60 s and never enters
  `control_plane_pressure`. Numeric, owner-adjustable, never removed.

## Quests, in order

**formation-harness-model-from-contracts** — the seven-node in-process
cold-formation path (the mandatory convergence probe) is the simulator's
base, and its cross-owner harness model is derived from the production owner
contracts instead of hand-maintained: landing the attribution seam turned it
red for a day (35 attempts, 2026-09-09) because the model was stale. Probe:
test-receipt for a test that fails when a registered owner interaction is
absent from the harness model. Red at seal.

**formation-calibration-run** — the authorized single run. Precondition: the
attribution seam already on `main` (`formation-turn-attribution`,
`raft-formation-attribution`) plus a sampling CPU profile of the seed's main
thread over the formation window, frames mapped to owners by directory, so the
buckets partition the window. Fresh container, matching `SRC_FINGERPRINT`,
`gate:preflight` question "per-owner attribution of seed event-loop time
during formation". The run counts only if the unattributed bucket is under
10 %; otherwise record, extend the seam under deterministic tests, and return
for a new authorization — no second run. Output: the per-owner cost table
committed as text under `test/simulation/calibration/`, each figure citing
its immutable artifact, and the ranked mechanism list for the fix. Probe:
script `formation-calibration.js` — 0 when the table exists, is complete for
every formation-path owner, and cites artifacts.

**formation-contracts-registration** — of the 32 registered invariants, 26
cite a contract the impact-contract registry does not know (CL-001,
CL-033..CL-042, core-system-logic, publication-readiness-churn-liveness-closure,
readiness-handoff-liveness, rolling-restart-rebalancer-handoff,
golden-capability-gold-plating), across 9 of the 11 invariant owners, so no
derived harness can witness them. Each of the 26 either gets a registration
in `test/shards/impact-contracts.json` with exactly one witness test, or a
ruled-out finding retiring the citation; both are progress, and a citation
nobody can witness is not an invariant. Probe: script
`formation-contracts-registration.js` - the count of unbound citations in the
derived harness model, target 0; the harness receipt goes green on its own
as the registry grows, because it derives from the registry.

**formation-sim** — deterministic five-node cold-formation simulator on the
in-process path: virtual clock, seeded in-memory transport, a discrete-event
scheduler charging virtual time from the calibration table so starvation is
computed rather than observed, real owners throughout, and a guard that throws
on any ambient clock or timer read in deterministic mode. Same seed produces a
byte-identical report; the signature predicate (seed gap fraction ≥ 50 % of
the window, joiners < 5 %, lease-incomplete loop with escalating backoff,
`prioritySpreadGap` stuck with 0 in flight, admission ending in
`control_plane_pressure`) holds across a 0.5×–2× sweep of every coefficient.
A live report plus logs can be ingested as a scenario. Runs under 60 s in a
normal lane. Probe: script `formation-sim-reproduces.js` — 0 when the
signature reproduces on `main` and two runs hash identical. Red at seal.
Open items for its design note (2026-09-12): the CDC seam keeps data stamps
(row `created_at`/`updated_at`, tombstone times, event timestamps, the HLC)
on the wall clock — the right production call, since a virtual stamp left
the anti-entropy sweep inert — so byte-identical reports under virtual time
need either the HLC's physical component injected in deterministic mode or
data stamps normalized out of the report hash; and the SQL engine is real
here (over in-memory partitions, as the seven-node probe runs it) while it is
a contract-bound seam in the membership-consistency harness — the derived
model records which is which.
Evidence for the design note (2026-09-12): when the membership-consistency
harness was moved from hand-wired stand-ins to hosted real owners, seven of
its fourteen subtests failed on contact — the stand-ins had defined
membership as row presence where the owners define it as published
membership. The harness model was not merely drifting; it encoded a
different system. The simulator inherits this harness, so every remaining
stand-in it meets is presumed to encode a different system until a contract
run twice says otherwise. The re-expression (same day) added the fact the
simulator must carry: the readiness owner's synchronous verdict, the one
every rebalancer reads, is refresh-pending after bootstrap and after every
nodes-table write until an asynchronous evaluation lands (~170 ms on the
seed); authoritative reads exist only where a partition does; published
membership reaches the rebalancer only through the publication coordinator.

Scenario for `formation-sim` (2026-09-12, from
`formation-contracts-registration`): the cross-operation re-entry cycle.
The operation-workflow owner bounds deferred handoff re-entry per operation
(step timeout, then the operation budget) and, at the stop, leaves the
operation "for planner rearm / ready-node replay" — nothing marks the node
or operation terminal, so a reconciled-but-unpublished node can be re-planned
into a fresh operation with a fresh budget without any state change. The
abstract active-gate model admits this cycle (`allowUnboundedReentry`). The
simulator must show whether the reconcile → unpublished → pending → reconcile
loop recurs across operations under formation load and how often, before
anyone decides what happens at the bound (escalate, fail the node, force
publication); that decision belongs in `seed-formation-decoupling`'s design
note. Related ambient-time seam for the deterministic guard: the handoff
retry callback and the transition retry grace read `Date.now()` directly
rather than the owner's `timeSource`.

**seed-formation-decoupling** — the fix, chosen from the calibration
ranking: early spread of system-table replicas once three nodes are joined and
before user-table admission opens; or system-partition Raft apply moved onto
the replica-worker pool; or formation-time admission control with an explicit
deadline. Owner-level red test first, red on revert. After two attempts with
no budget improvement in the simulator, the next entry is an altitude-check.
Probe: script `formation-budget.js` against the simulator scenario — 0 when
every budget holds and `formation-sim-reproduces.js` has been converted into a
regression guard that injects the removed condition and still reproduces.
*Amended 2026-09-19 ("Simulator frozen"):*
- this probe and the simulator scenario are no longer the gate;
- the three mechanisms listed here came from the falsified starvation
  ranking;
- the repairs now follow the causal packets, under the successor quests
  named in the amendment of 2026-09-18 and the owner decisions of
  2026-09-19.

**five-node-cold-formation-certification** — three fresh-container runs,
`gate:preflight` with the exact question. A failed run is ingested into the
simulator as a scenario and the work returns to `seed-formation-decoupling`;
no further live run until the simulator passes the new scenario. Probe: the
epic's scenario-harness streak.
*Amended 2026-09-19 ("Simulator frozen"):*
- a failed run is retained and ingested as recorded evidence, not as a
  simulator scenario;
- no further live certification run happens until the failure is explained
  and the explanation has a test;
- three consecutive live PASS runs with the trend persisted remain the
  certification.

## Relation to other epics

`release-0-2-five-node-convergence` is superseded by this epic for the
cold-formation surface; its last split/merge quest moved under
`split-merge-transition-integrity` (2026-09-13).
`formation-complexity-consolidation`, `publication-readiness-churn-liveness-closure`
and `hysteresis-consolidation` are superseded here. `raft-ownership` in
`apparatus-release-consolidation` must not run concurrently with a quest here
that touches `src/raft`.

Decision (2026-09-12): the readiness-owner memoisation line -
`readiness-planning-generation-granularity`, its `-v2`,
`projection-readiness-evidence-amplification` and its `-v2`, and the
`node-liveness-semantic-projection-owner` publish-gate repair - is superseded
by this epic and its drafts were discarded unlanded. Their mechanism is a
cache of readiness, which the `bounded-read-amplification-scope` constraint
above forbids; the starvation they measured is owned here by
`seed-formation-decoupling`. The v1 `formation-seed-decoupling` quest record
is superseded by this epic of the same id; its phase-0 inventory (owner map,
ambient-time seams, signature predicate) is kept as
[`phase0-inventory.md`](formation-seed-decoupling/phase0-inventory.md) beside
[`design.md`](formation-seed-decoupling/design.md) for
`formation-calibration-run` and `formation-sim`.

Scope widening (2026-09-12, R16): `formation-harness-model-from-contracts`
replaces the hand-wired stand-in family in
`test/integration/membership-consistency-integration-test-helpers.js` and the
two integration probes with driver-hosts, so those paths, `test/shards` (the
classification manifests every test change regenerates) and the quest's
receipt harness are authorized above.

Decisions (2026-09-12): the harness-model receipt `invariant-owners-hosted`
is superseded from "every invariant owner is hosted" to "every registry-bound
invariant is hosted and every unbound citation is named" - widening the
registry by 26 owner-boundary claims to turn a receipt green would be the
accretion this epic removes elsewhere; the 26 are routed to
`formation-contracts-registration` above. The CDC owner (`src/cdc`) cannot
be driven without an ambient timer, so it receives the time seam as the first
`src/` change of `formation-harness-model-from-contracts` - the seam shape of
`message-group-service-raft-timing.js`, one commit, red on revert, verifier
before landing - and `src/cdc` is authorized above for that owner only;
`formation-sim` injects through the same seam.

Scope widening (2026-09-12, R16): `formation-contracts-registration` binds
every invariant citation, which means editing the invariant registry and the
contract documents it cites (`architecture/contracts`), its own probe script,
and one witness test per registered contract outside the harness tree
(`test/bootstrap`, `test/control-plane`, `test/rebalancer`, listed by file), so
those paths are authorized above.

## Guardrails

- Design note with the calibration attribution before the fix; stop for
  review before `seed-formation-decoupling` starts.
- Fold, never split: a touched `-methods` bag on the formation path may be
  folded into a cohesive module; a ratchet that blocks that stops and records.
- Every cited artifact is immutable. No mechanism claim rests on a
  statistical run.
- Independent verification before landing any `src/` change.
- A simulator quest never changes `src/` (owner decision 2026-09-19). A seam
  it needs is a production quest of its own.
