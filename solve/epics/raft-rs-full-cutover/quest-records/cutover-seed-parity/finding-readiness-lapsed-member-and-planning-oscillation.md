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

The probe is `$S/classify.mjs`. It bootstraps a real seed, then inserts a member READY on a live ready lease with its heartbeat past the 60 s derivation grace. It then expires the lease, either naturally (`MODE=natural`, 50 ms) or by a committed row update. It records the publication owner's PUBLISHED epochs and the readiness-planning build rate.

## Three-point classification

| Finding | L | R | C | Only under the experiment? | Classification |
|---|---|---|---|---|---|
| Expired-member publication flap | yes | yes | yes | no; the experiment stops it | Pre-existing, present on Liferaft too |
| Readiness-planning rebuild storm (about 170/s) | no | no | no | yes: seen at R+exp and C+exp in the membership-consistency context | Future-quest constraint, not a current production defect |

Flap evidence: `$S/classify-natural-base-9d85.txt`, `$S/classify-natural-head.txt`, `$S/classify-natural-fix.txt`.

| Point | Flap cadence | PUBLISHED epochs per second | Epochs per 3 s window | Transitions per window |
|---|---|---|---|---|
| L | about 88 ms | 16-19 | 48-58 | 48-58 |
| R | about 40 ms | 26 | 77 | 77 |
| C | about 40 ms | 25-26 | 74-78 | 74-78 |

With a committed lease update instead of natural expiry, one drop is followed by a re-admission, and the member then stays published. The drop is missing in some runs within 3 s: R 1/3 and C 1/3. See `$S/classify-base-9d85.txt`, `$S/classify-head.txt` and `$S/classify-fix.txt`.

Rebuild-storm evidence:
- Actual behaviour at L, R and C: 0-3 builds/s after expiry in the probe, and `buildCount` stays constant through R's test-file run (`$S/dbgbase-2.out`).
- Under the experiment, in the test file: `$S/hyb-2.out` (R+exp: 105 feedback transitions each way), `$S/dbgf-3.out` and `$S/dbgj-1.out` (C+exp: about 170 builds/s).
- Standalone-probe rate under the experiment: 3-6/s (`$S/classify-hyb.txt`, `$S/classify-cexp.txt`).
- L plus the experiment was not measured.

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

Identify one owner of member recovery eligibility and readiness that consults liveness. Delete the duplicate authority rather than suppressing the flap or the oscillation locally. Then re-express the contract tests above to that owner's decision.

Probe for the quest: a member whose liveness lapsed is republished out and stays out, over a 10x stop-at-first-red batch, at a bounded rebuild rate.

Consequence for cutover seed parity, recorded under the lead's decision (b): membership-consistency test 3 cannot deterministically prove "not published after expiry" until this quest lands, because the owner republishes the member back.
