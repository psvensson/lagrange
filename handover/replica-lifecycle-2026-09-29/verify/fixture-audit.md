# Fixture migration audit (item 3) — frozen 2cf9ac6e9 vs base 6831054b1

## Recount (independent)
- `git diff -U0 6831054b1 2cf9ac6e9 -- test ':!test/shards'`: 258 test paths (238 M, 20 A, 0 D).
- Added lines naming bootIncarnation/boot_incarnation/BOOT_INCARNATION: 723 in 121 files.
- Implementer inventory: 616 rows / 105 files, generated against o1-gate `git diff HEAD` (not the frozen commit). 21 touched files are absent from its table; all but one are named (by prose, not path) in the round-4 extension or progress.md round-5 note. user-table-local-cdc-readiness.integration is covered by neither (it is a pure stamp; see below). Verdict: the inventory is stale against the frozen bytes. Its counts do not match; its substance does.
- No test file deleted. About 38 `test(` declarations were removed or renamed. The real removals are listed below.
- No timeout widened. Two `setTimeout(resolve, 0)` flushes were added: heartbeat hung-attempt, heartbeat-publication cases. Each is one extra macrotask for the new authoritative pre-read, not an eventual assertion.

## Sample (per-file verdict)
| file | verdict |
|---|---|
| bootstrap/node-registration-idempotency | identity supply (bootIncarnation 1) + insert verb; assertions unchanged. OK |
| bootstrap/durable-rejoin-incarnation-advance (new) | distinct PREVIOUS/THIS/THIS+1; semantic witness. It stays GREEN when the observed-incarnation term is removed from the advance CAS (see F-FX-3) |
| bootstrap/register-node-in-cluster (durable rejoin) | predicate assertions added (tightening); red on CAS-term removal. OK |
| bootstrap/node-registration-owner (failed-join withdrawal) | withdrawal whereClause asserts exact incarnation; red on fence removal. OK |
| control-plane/heartbeat-memory-trend-reporter-and-shutdown (shutdown) | reporter shutdown path removed by design; new test asserts {node_id, boot_incarnation}; red on fence removal. STOPPED-revive expectation reversed by design (directive section 4). OK |
| control-plane/node-terminal-transition-fence (new) | G1 shutdown/withdraw vs READY G2; red (7/14) on fence removal. OK |
| control-plane/replica-dispatch-atomic-claim(+ready-trigger, support) | handleNodeStateUpdate replaced by `applyDurableReadyNodeRow` + cache trigger. The trigger path under test (dispatch observes READY through NODES cache/CDC) is production-faithful; the READY writer is not under test here. OK (see note N-2) |
| integration/move-replica-handoff | bootIncarnation 1 + virgin-seed factory; no assertion change. OK |
| integration/message-group-multi-join-formation | fixture owner gives each logical node one canonical dataDir across retries but always incarnation 1 → F-FX-1 |
| bootstrap/node-joining-service-message-group-activation | assertion now proves an exact CAS `update` on the staged row with authoritative reads disabled: stronger. OK |
| control-plane/heartbeat-storage-budget-preservation | real NodeLifecyclePublication wired; write-options expectation rewritten (deferOnPressure:false and REPLACE_PENDING dropped). Checked: deferOnPressure is honoured only when ===true, and the gateway default merge is SINGLE_FLIGHT keyed on the whole CAS. No weakening. OK |
| bootstrap/node-joining-service-lifecycle-owner-handoff | outer-1 and outer-2 reattempts both bootIncarnation 1 → F-FX-2 |
| bootstrap/join-checkpoint-progression-characterization | pure stamp via helper. OK |
| bootstrap/phase-event-ordering-characterization | stamp + `installMinimumSeedBootstrapLifecycleFixture` (no-op RSM handle for phase-only tests that are not about lifecycle). OK |
| bootstrap/node-joining-service | stamps; legacy-row durable-rejoin cache extracted; new activation-debt test. OK |
| bootstrap/bootstrap-api-ready-nodes | rows via withRegisteredIncarnations + NODES get. Fidelity. OK |
| transport/transport-registry | publishRegisteredEndpoint. OK |
| control-plane/active-node-projection-lagging-evidence | expectation REVERSED: ['node-1','node-2'] → ['node-1']; test title still says "can retain ... when the node row is missing" → F-FX-4 |
| runtime/endpoint-sync-source-client | read-count accounting 2→3 (the extra NODES read). OK |
| integration/multi-node-raft-replication | helper extraction + stamp. OK |
| integration/user-table-local-cdc-readiness | NODES rows gain node_id + incarnation; endpoints stamped. OK |
| dispatch node-state tests (update, payload-wakeup, membership/heartbeat-publication cases, node-row-bootstrap-failures, ready-node-retry) | reversals/deletions all follow from READY moving to NodeLifecyclePublication (no revive from STOPPED, no bootstrap upsert, no forwarding, no deferred slot). Consistent with directive section 4. OK |

## Mechanical sharing check
Mine is `verify/sharing.mjs`. It groups constructions by (file, enclosing test, nodeId expression, incarnation) and, unlike the implementer's `incarnation-sharing.mjs`, it includes constant node ids. The implementer's script matched only quoted literals, so it missed NODE_ID constants. Two same-scenario reuses are real; the rest are separate subtests or distinct ids.

## Red-on-fence-removal (throwaway worktree, since removed)
- M-A: drop boot_incarnation from `buildNodeIncarnationWhereClause` (node-terminal-transition-fence.js:59). RED: reporter-and-shutdown #13, node-terminal-transition-fence 7/14, node-registration-owner #6, cross-owner anchor. GREEN: lifecycle-owner-handoff, join-cleanup.property.
- M-B: drop the observed boot_incarnation term from the durable-rejoin advance CAS (node-registration-owner-durable-rejoin-methods.js:357-362). RED only on the structural whereClause assertions: register-node-in-cluster #14, node-registration-owner #2. GREEN: durable-rejoin-incarnation-advance (10/10).
- M-C: drop boot_incarnation + created_at from the READY CAS (node-lifecycle-publication.js:232-240). RED only on the predicate-shape tests: publication #1, fence #8. The behavioural "R4 final CAS fences delayed G1" test and the anchor stay green, because last_heartbeat/status in the predicate still fail the CAS.
- M-D: disable the `resolveSourceRefusal` incarnation checks. RED: publication #7, #8, #18 (lost-outcome proof c).

## Findings
| id | class | severity | where | repro | owner |
|---|---|---|---|---|---|
| F-FX-1 | new shape (fixture identity sharing) | non-blocking | test/integration/helpers/cluster-test-helpers.js `createJoiningNodeFixtureOwner.create` (`bootIncarnation: options.bootIncarnation ?? 1` with the same canonical dataDir per node across retries) | Production reattempt re-runs `startJoinNode` → `mintBootIncarnation(dataDir)` = previous+1. The fixture's retry reuses (node_id, 1), so a delayed attempt-1 shutdown (fenced on incarnation 1) would pass against attempt 2. Latent: only a failed first join exercises it | test fixture: mint through `mintBootIncarnation(dataDir)` or increment per attempt |
| F-FX-2 | same family as F-FX-1 | non-blocking | test/bootstrap/node-joining-service-lifecycle-owner-handoff.test.js:233,292,302,321 | outer-1 and outer-2 reattempts are both incarnation 1 (production: 2). Changing :322 to 2 stays green (33/33), so the reuse is not load-bearing, but the scenario cannot witness a delayed outer-1 withdrawal against outer-2 | fixture |
| F-FX-3 | coverage gap (known mechanism, new shape) | non-blocking | durable-rejoin advance CAS, node-registration-owner-durable-rejoin-methods.js:357-362 | The dedicated semantic witness stays green without the observed-incarnation term. Only whereClause-shape asserts catch it. No behavioural race witness exists for "observed G_old → concurrent advance → this CAS zero-rows → readback classifies" | registration owner tests |
| F-FX-4 | expectation reversal, recorded by the implementer as a FLAG | non-blocking | test/control-plane/active-node-projection-lagging-evidence-test-cases.js:14 (title) / :68-75 | The base property from a5cfbd9fa ("Fix join convergence control snapshots"), retaining a node on endpoint evidence while its NODES row lags, is reversed to fail closed under I9. It is justified by the one validity rule (no NODES row, so no current incarnation), but the test title now contradicts its assertion, and the fixture inventory claims "no assertion was weakened" without listing it | owner ruling + retitle |
| F-FX-5 | record accuracy | non-blocking | ready-impl/fixture-incarnation-inventory.md | Generated against o1-gate, not 2cf9ac6e9: 616/105 vs 723/121. It is not regenerated on the frozen bytes | lead |

Notes:
- N-1, outside fixture scope, for the parent: dispatch and heartbeat READY from a STOPPED row is now refused, with registration as the only re-admission. A live same-incarnation joiner that the stranded-JOINING reaper sets to STOPPED (lease genuinely expired, for example under event-loop starvation) can then never become READY without a process restart. Base dispatch revived it. It is worth a liveness ruling.
- N-2: the atomic-claim tests no longer exercise publication → claim end to end. They inject the durable READY row directly.
- The cross-owner anchor has no delayed-G1 NodeLifecyclePublication READY effect (M-C stays green there).

## Deleted retry machinery → owner-level proofs
Deleted, with no successor, in node-row-bootstrap-failures:
1. "defers transient NODE_STATE_UPDATE failures and re-enqueues only the latest payload";
2. "defers steady-heartbeat participant-failure ... via shared control-plane classification";
3. "backs off repeated steady-heartbeat participant-failure retries and keeps one deferred owner slot per node".

The fourth:
4. payload-wakeup-slow-write, "acknowledges maintenance only after bypassing a steady-heartbeat deferred slot", was replaced by "keeps no deferred slot"; ready-node-retry "defers missing-row misses" was converted to "answers AUTHORITY_UNAVAILABLE as a typed ...".

The owner proofs in test/control-plane/node-lifecycle-publication.test.js:
- (a) :304 durable + ack lost → RESOLVED_BY_READBACK → re-drive ALREADY_CURRENT, one write;
- (b) :320 unknown, not durable → NOT_APPLIED_SOURCE_UNCHANGED (no success), re-drive APPLIED once;
- (c) :341 replacement incarnation before re-drive → REFUSED_STALE_INCARNATION, replacement row untouched.

(c) is red-on-removal (M-D). Mapping: 1 and 2 map to (b) plus the NOT_APPLIED retryAfterMs outcome and the dispatch deferred completion (`deferRetry`, `retryAfterMs`) back to the sender. 3 has no equivalent needed, because the queue and backoff are gone and the re-drive is level-triggered (heartbeat tick / sender). 4 maps to the REFUSED_ROW_MISSING and AUTHORITY_UNAVAILABLE typed tests. The three proofs are owner-level only; no adapter-level lost-ack test exists.

## Verdict
The fixture migration supplies identity and does not weaken assertions. Every expectation change I sampled traces to a directive-level contract change. No owner under test is bypassed. There are two latent same-identity reuses in retry/reattempt fixtures (F-FX-1/2) and one coverage gap (F-FX-3). None is blocking.
