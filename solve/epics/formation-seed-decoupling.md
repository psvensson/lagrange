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

## Binding constraints

- **No caching or memoising of readiness as the mechanism.** The sealed
  `bounded-read-amplification-scope` constraint stays. A design note whose
  mechanism is a cache is rejected.
- **GCP is never the iteration loop.** One authorized calibration run, then
  nothing live until certification.
- **Budgets** in `scripts/checks/formation-budget.js`, read from the same
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

**five-node-cold-formation-certification** — three fresh-container runs,
`gate:preflight` with the exact question. A failed run is ingested into the
simulator as a scenario and the work returns to `seed-formation-decoupling`;
no further live run until the simulator passes the new scenario. Probe: the
epic's scenario-harness streak.

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
