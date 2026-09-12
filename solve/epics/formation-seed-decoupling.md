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
  - src/control-plane
  - src/bootstrap
  - src/rebalancer
  - src/worker
  - src/diagnostics
  - src/message-group
  - src/raft
  - src/cdc
  - test/convergence
  - test/simulation
  - test/distributed/harness
  - test/integration/helpers
  - test/integration/message-group-multi-join-formation.integration.test.js
  - test/integration/preflight-critical-path-hops.integration.test.js
  - test/integration/membership-consistency.integration.test.js
  - test/integration/membership-consistency-integration-test-helpers.js
  - test/shards
  - scripts/quest-evidence-formation-harness-model-from-contracts.js
  - scripts/checks/formation-budget.js
  - scripts/checks/formation-sim-reproduces.js
  - scripts/checks/formation-calibration.js
  - docs
---

# Formation without seed starvation

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

`release-0-2-five-node-convergence` keeps its remaining split/merge quest and
is otherwise superseded by this epic for the cold-formation surface.
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

## Guardrails

- Design note with the calibration attribution before the fix; stop for
  review before `seed-formation-decoupling` starts.
- Fold, never split: a touched `-methods` bag on the formation path may be
  folded into a cohesive module; a ratchet that blocks that stops and records.
- Every cited artifact is immutable. No mechanism claim rests on a
  statistical run.
- Independent verification before landing any `src/` change.
