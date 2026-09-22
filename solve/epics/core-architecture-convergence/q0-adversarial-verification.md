# Q0 adversarial verification — rs-raft readiness baseline

Subject source commit: `4fc46adfd02b9f1263c2d7f86a31facc9a43a266`.

The purpose of this review is to try to make the Q0 result falsely read READY.
The review therefore treats a conservative BLOCKED result as correct unless all
READY predicates are independently supported.

## Result

**BLOCKED_ON_RAFT_CUTOVER** with three independent blockers and zero UNKNOWN
classification:

1. production partition backend remains dual-path with Liferaft the named
   default;
2. real rs-raft inbound partition transport/demux is not cut over;
3. no exact-SHA durable `release-full-v1` proof ref exists for the measured
   shared-main commit.

The already-landed rs-raft operation/lifecycle boundary is not a blocker and is
not reopened by Q0.

## Attacks

| Attack | Evidence | Result |
| --- | --- | --- |
| Omitted backend option | `RAFT_BACKEND_DEFAULT` in `src/raft/raft-backend-constants.js`; `selectRaftBackend` in `raft-backend-selection.js` | **BLOCKS** — omission names Liferaft. |
| Direct provider injection | `PartitionServiceCoreBase` uses `options.raftProvider || createRaftProvider(options)` | **CLASSIFIED** — a real construction seam that must be resolved/censused at cutover. |
| Raw rs-raft core escape | existing `raft-rs-operation-boundary-audit.js` plus `operation-port-boundary.test.js`; PR #44 gate 35741392425 green on the same operation-boundary bytes | **HELD** — do not build another facade/checker. |
| Vacuous audit invocation | audit module exports a function and has no CLI main; witness test explicitly calls it | **HELD** — direct `node ...audit.js` is not accepted as proof. |
| Second lifecycle writer | existing structural audit and operation-port receipt `one-lifecycle-owner-controls-retirement-writes` | **HELD**. |
| Identity reservation mistaken for membership | `raft-rs-membership-administration.js` reserves stable identity; real-partition proof reads committed voters from durable rs-raft state | **HELD** — separate concerns. |
| Service/cache row mutates rs-raft quorum directly | hostile-cache real-partition witness continuously diverges service rows while durable committed configuration remains the oracle | **HELD** for the rs-raft path. Metadata may still legitimately request a configuration change. |
| Outbound-only transport mistaken for cutover | runtime owner emits `{groupId,to,message}` through `sendToPeer`; partition request callback routes it through MessageRouter | **BLOCKS READY** because outbound reachability alone is insufficient. |
| Inbound rs-raft path assumed from generic `step` operation | `PartitionService.handleTransportMessage` still gates Raft ingress through `isRaftPacket(payload)`; merged operation-port Quest explicitly keeps `raft-rs-partition-transport-demux` blocked | **BLOCKS**. |
| Message-group Liferaft mistaken for partition fallback | message-group state constructs `LiferaftProvider` under its own subsystem | **CLASSIFIED NON-BLOCKER** — retained separately. |
| Stale branch receipt treated as exact-main proof | operation-port test files were unchanged by PR #44 and the PR #44 whole ordinary gate passed; Q0 still does not use the receipt as release proof | **HELD**. |
| Missing release proof hidden by workflow history | GitHub matching-ref lookup for `refs/lagrange-proofs/release-full-v1/4fc46adfd02b9f1263c2d7f86a31facc9a43a266` returned an empty set | **BLOCKS**. |
| Documentation cleanup changes runtime conclusion | only Markdown/README descriptions were corrected | **HELD** — blocker count remains 3. |

## Refuted cleanup premises

- "Liferaft exists in `src/`, therefore Q0 must fail globally" is false.
  Message-group Liferaft is an explicitly separate active owner and does not
  itself prove partition fallback.
- "Service metadata mentions peers, therefore it is rs-raft membership
  authority" is false. The distinction is request/projection versus committed
  `ConfState`.
- "The operation port is temporary migration scaffolding" is false on current
  evidence. It is a proven capability-reduction boundary and is a KEEP input to
  later convergence phases.

## Next owner

Q0 does **not** authorize repairs for the three blockers. The next work belongs
to the Raft migration/cutover predecessor: real partition transport/demux,
production backend cutover/fallback removal, and exact-main release
certification. Q1 of core-architecture-convergence must not start until Q0 is
remeasured READY on a later shared-main head.
