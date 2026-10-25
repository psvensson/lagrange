# Log owner diagnostic marker

Base: 6a228ced9439af07216b492bb8fdbba5540c3671. Worktree: /mnt/data/peter/projects/.worktrees/codex-log-marker-20261025. Normal-hook checkpoint and independent review are pending. Exact current file hashes are in source-manifest-prehook.json; evidence-hashes-prehook.json binds retained measurements.

The fixed marker operation accepts only markerId/message. LogsOwner captures original server node and timestamp before awaiting, submits an INSERT with a uniqueness-fenced deterministic log ID, and preserves that row through gateway retry. There is no initial read-before-insert or generic row input. Known one-row application reports recorded. Ambiguous/duplicate outcomes reconcile only through the existing authoritative owner read, preserving first timestamp and identity; changed content or ingress node conflicts. Read failure, missing/ambiguous rows and unknown mutation outcomes remain unconfirmed, never proof of noncommit. HTTP maps typed outcomes and runtime composition supplies the owner. Admin bind/trust remains unchanged; this adds no new authentication protocol.

Only the original admin smoke and network split-brain callers are migrated here. Smoke consumes the acknowledged log ID and asserts actual SQL readback content. Split-brain keeps local minority ingress, logs-p1 leader evidence and real network partition. Its earlier 5s HTTP wait was shorter than the existing 30s owner retry loop, whose in-flight executor can outlive that loop. The harness now uses the existing scenario observation cap without changing production deadlines or cancelling the server operation. No committed receipt is permitted from the isolated minority during the cut. A definitive never-admitted refusal requires post-heal absence. UNKNOWN allows legitimate completion after heal, checks replicated consistency and returns typed SPLIT_BRAIN_NO_COMMIT_INCONCLUSIVE with existing runner-retained diagnostics; it never silently passes the stronger no-commit claim or treats post-heal presence alone as a cut-time safety failure.

Proof: predecessor red.log recorded the missing exact HTTP route. green-owner-callers-final.log: 3 canonical files, 109 assertions, real Fastify -> owner -> gateway -> CDC -> SQLite plus owner outcomes and scenario transport/classification fixtures. green-scenario-diagnostics-final.log: final runner-retained diagnostics shape, 5 node cases.

Native r1 and r2 both failed in 11.1s at a fixture predicate, before any safety conclusion. r2 proved that the exact marker reached the native log while the first real APPEND was held, leader commit/apply stayed below it and owner remained pending. The production sender awaits that first delivery before issuing the later follower send; requiring both sends to be observed was impossible. The corrected predicate observes the actual first APPEND, while the gate holds all group packets. Native r3 passed in 6.870s, unchanged 40s test/10s fixture budgets, retries0/cap1. Actual admitted RF3 logs-p1 plus production participant release owners showed all three commit/apply frontiers below the proposal, all three marker rows absent and no owner answer while held. Releasing the original packet completed the original request, all three replicas converged to one exact row, and same-intent retry returned the same receipt without another row. Scheduling was stopped through the existing native fixture seam to isolate application/ACK from separately tested leadership transfer. This proves source-bound native custody, not physical multi-host partition acceptance. Raw TAP preserves seam/frontier/row observations. All owned native processes completed teardown.

Static: every new source function meets strict complexity/cognitive limits. Exact predecessor threshold-zero comparison found no existing function increase; inherited entrypoint debt is identified separately, with no baseline changes. Scoped lint/diff passed. Normal inventory hook and independent review remain pending. Quest probe deliberately retains the physical scenario and review gates as red (metric 2). Actual distributed smoke/partition execution requires composed startup and remains unexecuted. No main merge, publication or release acceptance is claimed.

Separate successors: write-ack-visibility marker migration; default mixed-DML load owner and seven purpose-classified fault callers; pending affinity/callback capability decisions; MovieLens isolated-session reset/custody. None is silently included in this sealed delta. Composition must retain accepted Q6 transport envelopes and integrated D2 policy checks; this base predates both.

## Current manifest

- docs/admin-api-reference.md
- solve/quests/log-owner-diagnostic-marker/evidence/receipt.json
- solve/quests/log-owner-diagnostic-marker/log.ndjson
- solve/quests/log-owner-diagnostic-marker/quest.json
- src/admin/admin-owner-operations.js
- src/control-plane/owners/log-diagnostic-marker-contract.js
- src/control-plane/owners/logs-owner.js
- src/entrypoint-runtime-admin-composition.js
- test/control-plane/log-diagnostic-marker.test.js
- test/distributed/harness/__tests__/network-partition-split-brain-scenario.test.js
- test/distributed/harness/cluster-node-handle-layer.js
- test/distributed/harness/cluster-node-owner-operations.js
- test/distributed/scenarios/admin-query-smoke.js
- test/distributed/scenarios/network-partition-marker.js
- test/distributed/scenarios/network-partition-split-brain.js
- test/integration/control-plane-log-marker.integration.test.js
- test/raft/raft-rs-backend/log-marker-partition.test.js
- test/shards/impact-contracts.json
