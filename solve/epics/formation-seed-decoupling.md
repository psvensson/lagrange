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
