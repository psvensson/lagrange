---
audience: evidence
recorded: 2026-11-18
---

# Physical lab pre-gate on candidate 219c27bfe (2026-11-17): FAILED

Evidence: `/mnt/data/peter/projects/lagrange-foundation-coordination-20261114/pregate-219c27bfe/`. `commands.txt` has the commands, `SHA256SUMS` the checksums, `formation-run/` the report.json and complete per-node docker logs (`.full-logs/*.log.gz`), and `formation-live/` the partition diagnostics.

## Run
- **Command:** `node scripts/lab.js harness run fresh-formation-user-table-routability --base test/distributed/config/local-three-node.json --nodes tv-dator,adam-laptop,adams-gamla`.
- **Controller:** local-workstation.
- **Image:** `lagrange-candidate:219c27bfe275` (id b406d79b0f18). It is still loaded on all three hosts.
- **Timeline:** started 17:23 UTC, exited 1 at 17:33:13.
- **Seed:** tv-dator f964, bootstrap ready 17:24:06.
- **Joiners:** active 17:24:22 and 17:24:35.
- **Priority spread:** 3/3 at 192 s.
- **Serve lane:** flapped to `serve_ineligible` 5 times (204, 216, 225, 325, 368 s).
- **First unmet predicate:** `c-replica-operations-quiet`. The REPLICA_OPERATIONS ledger never went quiet for 5 s before the 420 s bound.
- **Also unmet:** `observation-integrity` (an admin query to the seed timed out after 15 s; another connection was reset).
- **No `priority_partitions_not_spread` stall**, unlike 11-15.
- **The comparative smoke was not run.**

## Mechanism
**A. The background wave starts with no quiet boundary. CONFIRMED.**
- `resolveClearedPrioritySpreadFenceDecision` (`rebalancer-priority-recovery-planning-gate-methods.js:225`) skips the 70 s stability wait for any partition that `isPartitionBelowDeclaredDistinctHostSpread()` (:272) reports as under-spread. That covers every non-priority system partition on a fresh formation (41 partitions, all with RF 3 on the seed).
- The same exemption gives those partitions a fast first check (`unified-rebalancer-policy-scheduler-methods.js:253`) and a limit of one move per pass (`unified-rebalancer-rebalance-loop.js:86-97`).
- Added by f0dfc1a2b and 17194cf83 (audit F14/F15).
- `system-spread-transition-policy.js:81-121` counts node ids, not machines.

**B. The wave cannot drain within the bound. CONFIRMED.**
- 26 REPLACEs completed in about 5 minutes, at 18-61 s each, with tails to 137 s.
- At least 55 were still needed: 15 of 47 partitions were on 3 nodes, 9 on 2, and 23 seed-only.
- Every copy comes from the seed. The seed container (`cpus: 1.0` from `local-three-node.json`) ran at 88-97% CPU, with event-loop gaps up to 2.1 s.
- About 100 "Wait bound spent" per node. Joiners logged "peer demonstrably alive (slow)" 518 and 185 times. Callers had clipped acknowledgement budgets to 0-1000 ms.

**C. One move failed outright, and its cleanup never finished. CONFIRMED.**
- The `service_endpoints-p1` REPLACE to adams-gamla failed:
  - The seed's sends were never acknowledged (ROUTER_MESSAGE_TIMEOUT, 17:30:31-17:31:20).
  - Release recovery reported `release_fact_unavailable / current_control_owner_fact`.
  - The new replica gave up waiting for the seed's release reply and shut down (`replica-handler-release-recovery.js:296`) at 17:31:14, after being voter-ready since 17:30:26.
- The REPLACE was then failed as `replace_target_dead_before_intent` (`operation-workflow-recovery-status-reconcile.js:73-75`), although the node was alive.
- The cleanup REMOVE stayed in removing/STOPPING until teardown.
- Separately, `sql_write_operations-p1-r1` on the seed sat in `removing` for more than 60 s, twice.

## Tooling facts
- **The lab target cannot select any host.** `run-comparative-benchmarks.mjs --execution-target lab` refuses every host with "native thermal endpoint not recorded": since 6855453b6, `comparative-benchmark-lab-hosts.js:169` requires `capability.thermalEndpoint`, and `scripts/lab/probe.js` `discoverFleet` never produces it.
- **The 11-16 "lab" smokes went around the lab target.** They used `--execution-target gcp` with lab IPs: no locks, no thermal gate.
- **No thermal gate in `lab harness run`** in this candidate.

## History
- 2026-11-11 run 3 failed the same predicate when a 70 s fence released a background wave of about 39 partitions.
- 2026-11-14: the seed was CPU-bound at 96.5%, with "Message not acknowledged" in every run.
- 2026-11-16 lab smoke: XX000 "participant failures". This run logged the same message 50 times on the seed (link PLAUSIBLE).
