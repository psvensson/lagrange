# Independent verification (round 8): replica-lifecycle-durable-generation

**Verdict: APPROVE** for landing the src change at frozen candidate `0996d7576`.

The standing REJECT on `2cf9ac6e9` (F1, F-R1) and the earlier 2026-09-28T02:33 REJECT are **SUPERSEDED** (see the supersedes section). No blocker was found. All findings below are non-blocking.

## Fingerprint

| Check | Result |
| --- | --- |
| HEAD | `0996d7576516af24f5f4d3e1e9aee37c775aabae` (branch claude/lagrange-work-wyz3yo) |
| `git rev-parse HEAD^{tree}` | `5d0f839672d0614d2d20d281d6ca4b2ca1bd2d93` |
| `git status --porcelain` (tracked) | empty at start and at the end; the only untracked additions are this directory's files |
| Quest base | `6831054b1` (used for the inherited-red classification and the ratchet comparison) |

No tracked file in /home/user/lagrange was edited. All experiments ran in detached worktrees under the session scratch (`verify/wt` at 0996d7576, `verify/base` at 6831054b1), both removed and pruned afterwards.

## Proof by item (what a fresh verifier had to prove)

1. **F1 (boot incarnation monotonic; one reservation authority): CLOSED.** `src/bootstrap/boot-incarnation-owner.js` is the only issuer (`reserveBootIncarnation` callers: `lagrange-runtime-startup.js:113,406`; floor raises: `entrypoint-runtime-join-startup-policy.js:101`, `bootstrap-service-control-plane-runtime-methods.js:322`; export via `src/bootstrap/index.js`). Read-derive-write is serialized per canonical data-dir identity (`serializeIssuance`, realpath keyed; D3) and persisted with `writeAtomicDurable` before return. Owner file present -> sole authority, damaged owner fails closed (`STATE_UNREADABLE`), hints never read. Owner absent -> legacy hints are a one-time floor; malformed/unreadable/impossible counter fails closed with no owner write. Hints builders (`buildBootstrapRejoinHintsSnapshot`, `RejoinHintsPersistenceService`) require an issued incarnation (`persistJoinSeedRejoinHints` swallows the refusal by design; the old defect shape can no longer strip a counter because the counter no longer lives in hints). Reconstructed falsifier `falsifiers/f1-boot-incarnation.test.js.md`: **24/24 GREEN** (hints=4 -> G1=5 -> joiner hint write -> G2=6 -> G3=7; higher/lower/corrupt/deleted hints with owner present: no effect; owner absent + corrupt hints: refusal, no owner file; 5 concurrent reservations dense and distinct; symlink/trailing-slash aliases serialize; floor raise never lowers).
2. **F-R1 (bootstrap snapshot addressing, option b; D4 seed pin): CLOSED.** `src/transport/node-address-resolution.js:426-527`: if the cache has ANY NODES row for the target, the cache decides alone (`resolveFromCacheNodeRow`), and neither the snapshot nor the seed pin is consulted; only with no cache NODES row may the seed pin or the snapshot's own-incarnation endpoint supply a dial address. Reconstructed falsifier `falsifiers/r1-addr.mjs.md`: **7/7 GREEN** (original F-R1 shape now `unavailable`; seed pin ignored once a cache NODES row for the seed exists).
3. **N2 (durable ACTIVE only while the exact handler of G stays registered through the effect boundary): CLOSED.** `replica-state-machine-serialization.js:172-185` runs `requireHandler()` and opens the effect section in one synchronous step; `retireReplicaTransportHandler` (`replica-transport-handler-identity.js:63-88`) retires only through the lane (`lane.retireReplicaHandler`), by exact identity (`unregisterExact`), and returns `REFUSED_NO_IDENTITY` for a transport without the identity API (never removes by address; Removal-8). `isExactReplicaHandlerRegistered` is identity, not presence. Partitions (`partition-service-activation.js:222-308`), message groups and executor-created replicas (S-F2) all route through it; witnesses 37/37, 44/44, 32/32, 37/37. `seed-cleanup-handler.js` contains zero `unregister` calls (Removal-7). D1: NodeJoiningService/executor registrations born STOPPED (commit 76124cf0f; join-side suites green).
4. **N7 / N2-liveness / D6: CLOSED.** `node-lifecycle-publication.js:239-271` refuses a terminal source (`REFUSED_TERMINAL_STATE`); `heartbeat-service-publication-methods.js:209-216` refuses the endpoint refresh on a terminal NODES row of the same incarnation. Witnesses: heartbeat-terminal-node-row-endpoint 11/11, node-terminal-transition-fence 14/14, cross-owner anchor 19/19; red-on-revert R7 and R9.
5. **F3 (one ReplicaStateMachine per live node incarnation): CLOSED.** `ReplicaLifecycleOwner` (`replica-handler-setup.js:300-380`): reacquire returns the recorded owner (re-arming its checker idempotently), refuses a different incarnation with `REPLICA_LIFECYCLE_OWNER_INCARNATION_MISMATCH`, requires an issued incarnation; `timeSource` flows through `create/createReplicaStateMachine`. join-resume witness 139/139 (G+1 mints exactly one new owner at `:563`; missing incarnation typed refusal at `:750`); time-source suite 7/7; red-on-revert R8 (52 red).
6. **Required bootIncarnation public contract; D5/D7/N4/S-F1/D8/D10/D11: CLOSED.** `boot-incarnation-contract.js` (`requireIssuedBootIncarnation`, no default, typed `BOOT_INCARNATION_REQUIRED`); `src` has no `bootIncarnation ?? 0` other than the two peer-slot defaults classified by the census (`message-router-connection-authority.js:251`, `membership-swim-prober.js:106`; census 40/40). N4 durable-rejoin-incarnation-advance 14/14; D7 partition-service-hlc-monotonicity 9/9; S-F1 message-group-service-row-owner 60/60; D8 message-group-registration-redrive-owner 19/19; D10 `git diff 6831054b1..0996d7576` on the two rebalancer reservation files is empty; D11 exact-handler-identity-api 29/29, websocket-transport 61/61, superseded-floor 15/15.
7. **Quest constraints.** Exact-durable-generation CAS and one-owner-interaction: unchanged from the round-7 verification (authoritative-transition 30/30, registered activation 45/45, durable-generation probe exit 0). Red-on-revert: 9 guards reverted, every one goes red in at least one named witness (matrix below). No timeout widened (`git diff` over test/ shows only `setTimeout(...,0)` flushes and fixture `maxAttempts`). Ratchets vs base: literals baseline rawViolationCount 1447 -> 1287; duplication baseline lowered (1777 -> 1731, 29947 -> 29388); unused-export gate unchanged (1434). Repair-scope: every widened family maps to a recorded owner decision (D9 rounds 6-8g; F3 widening 2026-09-29; required-incarnation 2026-09-30; final rulings (1)-(15); Track A closure; D1-D11).

## Findings

| id | class | severity | file:line | reproduction | suggested owner |
| --- | --- | --- | --- | --- | --- |
| N-R1 | reader semantics (observation) | non-blocking | `src/transport/node-address-resolution.js:377-390` | A cache NODES row in terminal STOPPED with a same-incarnation ACTIVE endpoint still resolves that address (dial only; D6 stops republishing, endpoint reap follows node reap). The reader consults incarnation, not NODES status. Falsifier case 3 | endpoint-incarnation currentness (record only) |
| N-R2 | inherited red | non-blocking (inherited) | `test/bootstrap/node-bootstrap-consistency.property.test.js` "bootstrap response contains required fields" | `not ok 1 - timeout!` identically at base 6831054b1 and at the candidate (2 runs each) | property-test harness owner |
| N-R3 | witness coverage | non-blocking | `src/node/replica-state-machine-serialization.js:178` | Dropping `requireHandler()` from `runActivationEffectSection` leaves `replica-state-machine-registered-activation.test.js` green (45/45); the partition boundary suite catches it (6 red) | quest witnesses (add the in-section case to the RSM suite) |
| N-R4 | witness coverage | non-blocking | `src/bootstrap/boot-incarnation-owner.js:216` | Allowing `raiseBootIncarnationFloor` to lower leaves `boot-incarnation-superseded-floor.test.js` green (15/15); `boot-incarnation-owner.test.js` catches it (1 red) | quest witnesses |
| N-R5 | stale evidence doc | non-blocking | `handover/.../round8/mg-removal-census.md` (seed-cleanup row) | Row still lists `seed-cleanup-handler.js:342,581` as an open raw removal; the candidate file has zero `unregister` calls (Removal-7 landed in 49f47b9f5) | handover author |
| N-R6 | node-level handler removal by address | non-blocking, recorded | `src/node/replica-handler-runtime-methods.js:582`, `runtime-service-handler.js:840`, `message-group-service-handler.js:761`; callers `join-cleanup-handler.js:688`, `bootstrap-service-seed-delegates.js:474,498` | The fixed node-level `<node>/<service>/<handler>` addresses are removed by address on node cleanup/shutdown; not per-replica handlers, and the cleanup runs before any G+1 reservation (sequential reattempt policy). Census classifies them as node-level | node-level handler lifecycle (follow-up only if a delayed cleanup can overlap a live G+1) |

## Supersedes

- **F1 (2cf9ac6e9): SUPERSEDED, closed.** The old falsifier is green; hints are migration-only and cannot gate, raise or lower; corrupt hints fail closed only while no owner exists; issuance is serialized per data dir.
- **F-R1 (2cf9ac6e9): SUPERSEDED, closed.** The old r1-addr falsifier is closed (`unavailable`); D4 seed pin obeys the same precedence; witness `endpoint-reader-currentness.test.js` goes red (9) when the bootstrap response is allowed to out-rank a cache row.
- **N2 (TOCTOU in activation): SUPERSEDED, closed** by the effect section (partition, message group, executor), exact-identity retirement waiting on the open section.
- **N7 (reaped generation revives): SUPERSEDED** by the reaped-terminal ruling; terminal rows refuse liveness and endpoint refresh (R7, R9 red).
- **D-7 (registration upsert can lower boot_incarnation)**: covered by the durable-rejoin advance CAS and the same-boot no-write rule (14/14, node-incarnation-fence 50/50); no longer an open hole.
- **2026-09-28T02:33 (i) full-identity CAS and (ii) activation preflight**: remain superseded (30/30, 45/45, boundary suites).
- **N1, N3, N4-cache, N5, N6, N8, N9 (2cf9ac6e9)**: unchanged non-blocking records; none re-litigated.

## Red-on-revert matrix (each mutation applied in the scratch worktree, then restored)

| id | guard reverted | file | witness -> result |
| --- | --- | --- | --- |
| R1 | legacy hints participate after the owner exists (max of both) | boot-incarnation-owner.js:174-176 | boot-incarnation-owner 92/96 (4 red); falsifier 15/17 (2 red) |
| R2 | handler presence instead of exact identity | replica-transport-handler-identity.js:38 | partition boundary 32/37 (5 red); MG boundary 39/44 (5 red); executor boundary 25/32 (7 red) |
| R3 | no exact-handler check inside the effect section | replica-state-machine-serialization.js:178 | partition boundary 31/37 (6 red); RSM registered-activation stays 45/45 (N-R3) |
| R4 | floor raise may lower | boot-incarnation-owner.js:216 | boot-incarnation-owner 99/100 (1 red); superseded-floor stays 15/15 (N-R4) |
| R5 | missing incarnation collapses to 0 | boot-incarnation-contract.js:34 | node-incarnation 16/21 (5 red); join-resume 126/137 (11 red); census 37/40 (3 red) |
| R6 | bootstrap response out-ranks a cache NODES row with no current endpoint | node-address-resolution.js:525 | endpoint-reader-currentness 27/36 (9 red); falsifier FAIL 3; node-address-resolution unit suites stay green |
| R7 | liveness endpoint refresh mutates a terminal row | heartbeat-service-publication-methods.js:214 | heartbeat-terminal-node-row-endpoint 9/11 (2 red) |
| R8 | retries mint a second lifecycle owner | replica-handler-setup.js:338,359 | join-resume 87/139 (52 red) |
| R9 | terminal source not refused by publication | node-lifecycle-publication.js:270 | node-lifecycle-publication 74/80 (6 red); cross-owner anchor 18/19 (1 red) |

## Commands run (all in the 0996d7576 worktree; pass/fail)

- `node scripts/checks/replica-lifecycle-durable-generation.js` -> exit 0.
- Boundary: partition-activation-handler-boundary 37/37; message-group-activation-handler-boundary 44/44; replica-executor-activation-handler-boundary 32/32; message-group-executor-activation-handler-boundary 37/37; replica-transport-handler-identity 12/12; exact-handler-identity-api 29/29.
- RSM: replica-state-machine 68/68; authoritative-transition 30/30; registered-activation 45/45; time-source 7/7; transitions.property 5/5.
- Incarnation: boot-incarnation-owner 100/100; owner-concurrency 16/16; reservation-census 40/40; superseded-floor 15/15; node-incarnation 21/21; rejoin-hints 37/37; durable-rejoin-incarnation-advance 14/14; join-resume-replica-lifecycle-owner 139/139; node-incarnation-fence 50/50; node-incarnation-websocket-fence 67/67.
- Liveness/terminal: node-lifecycle-publication 80/80; heartbeat-terminal-node-row-endpoint 11/11; node-terminal-transition-fence 14/14; incarnation-reuse-cross-owner-anchor 19/19; readiness-liveness-projection-single-source 193/193; endpoint-reader-currentness 36/36; node-address-resolution 11/11; node-address-resolution-contract 17/17.
- Rows/others: message-group-service-row-owner 60/60; message-group-registration-redrive-owner 19/19; partition-service-hlc-monotonicity 9/9; websocket-transport 61/61; cache anti-entropy 46/46; plus the 31 unit suites touched by the D4 commit (all green except N-R2, inherited).
- `test/cdc/bootstrap-mode-routing.property.test.js` with `fc.configureGlobal({seed})` for 1468758261 and -1913585971: 5/5 and 5/5.
- Falsifiers: f1-boot-incarnation 24/24; r1-addr 7/7.

## Not run (classified inherited / lab items per the verification brief)

`npm test`, `test:all`, the integration suites, `formation-sim-charged-seed-host`, `message-group-multi-join-formation`, GCP/lab lanes, A2, SLO. The verdict rests on bytes read at 0996d7576, focused unit/bootstrap suites and node-free falsifiers.
