---
audience: evidence
recorded: 2026-11-02
quest: replica-admission-from-committed-operation
---

# Attempt 1: reproducer run after admission from the committed operation

## Run identity

| Field | Value |
| --- | --- |
| Scenario | `fresh-formation-user-table-routability`, base `test/distributed/config/local-three-node.json`, bounds unchanged |
| Source | `5946c4d2f` (attempt 1 `7b1197f33` plus its quest note), clean tree. Harness `srcFingerprint` `af8a3a91d1e2a1e5`. |
| Hosts | seed `7e09101c` on tv-dator (192.168.86.32); joiner `04c10f6c` on lenovo-laptop (.27); joiner `7f914b06` on adams-gamla (.41) |
| Window | harness start 2026-11-02T11:53:43.333Z; end 12:04:14Z |
| Verdict | **RED**. The first unmet predicate is still `a-serve-lane-open`; `b`, `c` and `d` are also unmet. **Predicate `g` (projection agrees with authority) is now met.** It was unmet in Phase 0. time-to-serve-lane: never. |

The run's evidence is kept outside the repo at
`/mnt/data/peter/projects/lagrange-evidence-store/replica-admission-attempt1-5946c4d2f/`: `report.json`, `.playback/**` and the console log.

Node-log sha256 digests:

- `7e09101c` `51e66d2bb23314c52cba09140ec8cad655223673762d6289062ed15fa6c8cb80`
- `04c10f6c` `bf31658904ecbbd34e6a799fdb4f920f37d673ebbea8144036e70f7d7a2884ba`
- `7f914b06` `f93ac9ef908ac838ba92b291db110cfe8d20b763484b34ac7845d5590cf2df6c`

## Admission (receipt `reproducer-admission-without-cache-visibility`)

Two joiner replicas reached SYNCING in this run. Both were admitted from their committed operation. No services-row producer exists any more, and no `not_in_configuration` refusal was logged (Phase 0 had 205).

| Replica | SYNCING commit -> first request | Leader decision | Granted |
| --- | --- | --- | --- |
| `replace-replica-804a...` (replica_operations-p1, adams-gamla) | 11:54:57.443: `not_leader / leader_not_discovered`. The learner had not yet discovered its leader; the request was re-sent on the cadence. | 11:54:57.678 `in_flight`. The ADD was proposed 235 ms after the first send. | 11:55:00.155 |
| `control_plane_publications-p1-r4` (lenovo-laptop) | first send `not_leader / leader_not_discovered`, then `in_flight` | `in_flight` | 11:55:03.166 |

Phase 0 measured 0 to 30 s from learner start to grant, with up to 24 `not_in_configuration` refusals per learner. Here the ADD proposal followed the SYNCING commit within one cadence re-send. The first send found no discovered leader; discovery re-sends count toward that one cadence step.

## First divergence on this run (not in this quest's owner set)

1. **REPLACE stuck at ACTIVE.** The REPLACE of the ledger partition itself (`replace-op-b0b98821...`, replica_operations-p1) reached ACTIVE at 11:55:07.425. Its target then took over leadership of replica_operations-p1 (`replace_target_leader_election`).
   - From 11:55:10 onward, the coordinator on the target node (adams-gamla) re-drives `Executor outcome operation visibility deferred` every 30 s until the end of the run. The authoritative `replica_operations` read is unavailable.
   - The routing snapshot names the cause: `all_services_filtered_by_readiness` for `replica_operations-p1`, dimension `controlPlaneRecoveryEligible`, `reasonCodes: ["planning_snapshot_refresh_pending"]` (8 occurrences).
   - This is the C5 readiness-routing mechanism, owned by Group A, and the same refusal Stream B2's trace reports.
2. **Every other move blocked.** Because the ledger self-move never leaves flight, every other rebalancing move is skipped: 1534 occurrences of `budget_exceeded / operation_ledger_self_move_in_flight` between 11:54:56 and 12:04:08.
3. **Run-level counts.**
   - Only two joiner replicas were created; both completed and neither failed.
   - 0 services `UNIQUE` apply failures (Phase 0 had 69).
   - `cdc_committed_acceptance_unknown` holds remain: 3500 on the seed. That instance is C10, handed to the CDC D1-D4 owner.

One sample. Phase 0 got past this point (its STOPPING step came within 2 s of ACTIVE), so the stall's dependence on timing is **unknown**. It is not caused by admission: both admissions completed before it.
