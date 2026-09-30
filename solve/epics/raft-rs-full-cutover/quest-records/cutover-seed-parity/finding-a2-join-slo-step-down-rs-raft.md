# Finding: the A2 gate's one red is a cutover regression through F1 (node-join convergence SLO)

Recorded 2026-09-24 at the seed parity A2 acceptance gate on 80637882b. That gate went green through test/integration except for one file: `test/integration/node-join-convergence-slo.integration.test.js`, which asserts "over-target voter duration should stay bounded (<= 2000 ms)".

## Red-rate classification

Five runs on each side, alternating, one at a time and thermal-gated. The runs went to completion because this was a classification, not a gate. Logs are in the scratchpad under `slo/`.

| Tree | Red | Over-target duration when red | `STEP_DOWN_REPLICA` failures per run |
|---|---|---|---|
| origin/main 3394e6356 (Liferaft, pre-cutover) | 0/5 | none | 0 in every run |
| Integrated head 4258fdc32 (rs-raft, before seed parity) | 5/5 | 3304-3483 ms | 4-5 in every run |
| Seed-parity candidate 80637882b | 2/5 | 2929-2996 ms | 3-4 in the red runs, 0 in the green runs |

## Mechanism

- Under rs-raft, the REPLACE workflow's leader handoff answers `NOT_SUPPORTED`: "STEP_DOWN_REPLICA requires a tracked partition service with raft ownership". The answer comes from `replica-handler-remove-request-methods.js:~345`, where the handoff state is `REPLICA_HANDLER_LEADER_HANDOFF_STATE.NOT_SUPPORTED`.
- That is finding F1 (`findings-2026-09-23.md`). The frozen operation port has no step-down, so `performTrackedLeaderDemotion` cannot demote.
- The step-down is retried, and the over-target voter (the replica being replaced) stays past the SLO.
- On Liferaft the handoff is not reached in this test.
- Seed parity lowers the rate but does not remove it.

## Classification

This is a new deterministic regression of the rs-raft cutover on the integrated head. It is absent on Liferaft and present 5/5 on the rs-raft head. Its owner is F1: step-down and immediate election as port operations, open owner question 7 in `census-legacy-consumers-outside-partitions-2026-09-23.md`.

The owner's resume plan says not to solve F1 opportunistically, so this goes to the owner. It is not a seed-parity defect, and seed parity is not merged or published until the owner decides.
