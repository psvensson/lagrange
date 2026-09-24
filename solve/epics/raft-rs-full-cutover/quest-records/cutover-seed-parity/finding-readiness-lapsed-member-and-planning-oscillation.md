# Future quest: a lapsed published member keeps being republished (one eligibility owner needed)

This is a proposed quest from cutover seed parity round 2 (2026-09-24). It was recorded and is not implemented. It must not absorb the membership publication work of cutover seed parity.

Evidence root: `S=/tmp/claude-1000/-mnt-data-peter-projects-lagrange/553555be-039d-4cc4-94d1-91c96f39daef/scratchpad/seed-parity`.

| Point | Tree | Export |
|---|---|---|
| L | 9d85ac283, Liferaft | `…/scratchpad/base-9d85` |
| R | 4258fdc32, rs-raft integrated | `$S/head` |
| C | the cutover-seed-parity corrective | `$S/fix` |
| R+exp | R with the abandoned experiment | `$S/hyb` |
| C+exp | C with the abandoned experiment | `$S/cexp` |

The probe is `$S/classify.mjs`. It bootstraps a real seed, then inserts a member READY on a live ready lease with its heartbeat past the 60 s derivation grace. It then expires the lease, either naturally (`MODE=natural`, 50 ms) or by a committed row update. It records:
- the publication owner's PUBLISHED epochs;
- the readiness-planning build rate;
- during the flap window, the pressure-governor decisions, the reconcile-queue depth and outcomes, the persist failures and the event-loop delay.

## (a) Current production defect, under both backends

An expired member oscillates back into published membership. The trigger is a published member whose ready lease has passed and whose heartbeat is past the 60 s derivation grace. Two authorities (listed below) independently still regard it as recovery-eligible. The projection re-admits it whenever priority recovery is pending, and the publication owner republishes it.

The defect is present on Liferaft (L), on rs-raft (R) and on the corrective (C), so it is pre-existing and not caused by the cutover.

"The member stays out of published membership after expiry" is therefore not a guarantee on any backend. Under the owner's decision (option 1, amended), membership-consistency test 3 no longer asserts it:
- It asserts that the member is published while its lease is live (the publication owner).
- It asserts that the member is unavailable for placement after expiry (the readiness and placement owners).
- The owner-state transition is proven in `test/control-plane/membership-publication-first-epoch-members.test.js`.

## (b) rs-raft observation: the same defect at a higher rate

The flap runs faster under rs-raft. The measurements are kept here for the future fix.

Probe: `$S/classify.mjs` with `MODE=natural` (a 50 ms lease), 3 s windows. Evidence: `$S/classify-natural-{base-9d85,head,fix}.txt` and `$S/amplification-*.txt`.

| Point | PUBLISHED epochs/s | Flap cadence |
|---|---|---|
| L | 16-19 | about 88 ms |
| R | 26 | about 40 ms |
| C | 25-26 | about 40 ms; one of three runs settled after 8 epochs |

In the committed-update mode, one drop is followed by one re-admission, and the member then stays published. The drop is missing within 3 s in R 1/3 and C 1/3 (`$S/classify-{base-9d85,head,fix}.txt`).

### Bounded check: does the amplification violate an existing gate?

Probe: `$S/amplification-{base-9d85,head,fix}.txt`, one 3 s flap window per point. No new criterion was created. Each existing gate checked:

- **Control-plane pressure governor (`PressureGovernor.evaluate`, the admission contract):** every decision in the window was ALLOW at every point (L 6015, R 2237, C 412). There were no DEFER or REJECT decisions.
- **Critical-convergence reconcile queue bound (`CONTROL_PLANE_CRITICAL_CONVERGENCE_QUEUE_BOUND = 1`):** the maximum depth observed was 1 at every point. The share of enqueues that were merged or rejected was already high on Liferaft (L 2616/3147, R 2127/2241, C 200/222), so there is no new behaviour.
- **Publication persist contract:** 0 failures at every point (persist calls: L 52, R 114, C 11).
- **Test-level observable contracts:**
  - membership-consistency: 94/94 on C in the option-1 batch (see the round's report).
  - seed-node-bootstrap: 110/110 on C, with wall time within about 1.2 s of TAP time.
- **Event-loop delay (no existing budget; recorded only):** p99 L 2940 ms (an outlier window), R 96 ms, C 60 ms.
- **Not checked, because it needs a lab formation:** the formation-health gate (`scripts/checks/formation-health.js`).

**Result:** no existing gate is violated by the amplification. It is recorded here as quest evidence.

## (c) Constraint from the attempted repair: about 170 planning rebuilds/s

This constraint is **not running in production today.**

When both authorities were taught `isNodeLivenessLapsed` (the abandoned experiment below):
- the seed's planning feedback alternated serve_ready ↔ recovery_open (`readiness-planning-semantic-currency-methods.js:180-208`);
- in the membership-consistency context this reached about 170 builds/s (`$S/hyb-2.out` for R+exp; `$S/dbgf-3.out` and `$S/dbgj-1.out` for C+exp);
- the standalone probe under the experiment showed 3-6 builds/s (`$S/classify-{hyb,cexp}.txt`).

Actual behaviour at L, R and C: 0-3 builds/s after expiry (`$S/dbgbase-2.out`: `buildCount` constant through R's file run).

This is a falsifier that the future one-owner repair must survive: removing the eligibility of a lapsed member must not start a readiness-planning feedback loop.

## Competing eligibility authorities

Each authority has its own idea of what makes a member recovery-eligible:

1. **Readiness owner:** `src/control-plane/control-plane-readiness-diagnostics-eligibility.js:460-492` (`isControlPlaneRecoveryEligible`).
   - It is eligible while priority recovery is active and the transport-backed grace holds.
   - Or when routing is ready, publication supports recovery, and the member is published (`controlPlanePublished`) or priority recovery is active.
   - Liveness is not consulted: a published member stays eligible after its lease and heartbeat lapse.
2. **Publication owner's priority-recovery readiness repair:** `src/control-plane/membership-publication-readiness-repair.js:67-99` (`hasPriorityRecoveryPendingPublicationRepairEvidence` and `buildPublicationPlanningReadinessEntry`).
   - It forces `controlPlaneRecoveryEligible: true` whenever the readiness entry carries `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING` and `processAlive !== false`.
   - `processAlive` is derived from service lifecycle, not from liveness.
3. **Projection:** `active-node-projection.js` `resolveProjectedActiveNodeSelection` admits any node that either authority calls recovery-eligible whenever the candidate derivation allows recovery-eligible projection. The publication owner then republishes it.

## The abandoned correction and the contract tests it broke

The attempted correction added one predicate, `isNodeLivenessLapsed(nodeEvidence)`, to `node-liveness-semantic-projection.js`. The predicate is true when the ready lease and the heartbeat were both written and the derivation grace no longer holds. A second variant also required that there is no live transport. Both authorities consulted it. The flap stopped (`$S/flap-why2.out`). The following contract tests broke, and the correction was reverted:

- `test/control-plane/control-plane-readiness-service-cluster-health-and-recovery-diagnostics.test.js`: tests 9 (:478), 14 (:859), 15 (:977), 16 (:1026) and 17 (:1136).
- `test/control-plane/control-plane-readiness-service-sync-and-priority-recovery.test.js`: test 1 (:35).
- `test/rebalancer/storage-admission-service.test.js`: tests 13 (:384) and 30 (:1076).
- `test/bootstrap/fresh-join-via-non-seed-node.integration.test.js`: red once (`$S/r5-bootstrap.out`).

These tests encode the current eligibility semantics: recovery eligibility with a stale lease and heartbeat.

Under that correction, the seed's own planning feedback alternated serve_ready ↔ recovery_open (`readiness-planning-semantic-currency-methods.js:180-208`), at about 170 builds/s in the test-file context. That rebuild storm exists only under the correction (see the classification above).

## Requirement for the future repair

Converge on one owner of member recovery eligibility and readiness that consults liveness, and delete the duplicate authority. Do not use:
- debounce
- sleeps
- publication suppression
- longer leases
- local suppression of the flap or of the oscillation

Then re-express the contract tests above to that owner's decision.

Probe for the quest: a member whose liveness lapsed is republished out and stays out, over a 10x stop-at-first-red batch, at a bounded rebuild rate.

Consequence for cutover seed parity: "not published after expiry" was never a guarantee on any backend. Under option 1, amended, test 3 asserts only what each owner guarantees, and the owner-state transition (pending, then published) is witnessed separately.
