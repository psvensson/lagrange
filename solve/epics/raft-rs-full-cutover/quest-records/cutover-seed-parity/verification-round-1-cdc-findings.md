# CDC / A2 verifier findings (fork): fixes/cutover-seed-parity @ fedda05da vs base 4258fdc32

Probes: probes-cdc/*.mjs (composition copied from test/cdc/cdc-shutdown-terminal-owner-write.test.js, parameterised by ROOT=export).
Outputs: probes-cdc/<probe>.<fix|base>.out. Every run: `timeout -k 5 90 node <probe>.mjs`, rc=0 all (probes print JSON, they do not assert).

## BLOCKING

B1. The CDC service's own routed-mutation retry delay is not released at shutdown: a referenced timer outlives markShuttingDown, then one more attempt runs against the torn-down service.
- Code: src/cdc/cdc-routed-mutation-readiness.js:474,485 `await delayOn(this.timeSource, ...)` inside waitForRetryBudget. The isShuttingDown check (:464) runs only BEFORE a delay is armed. holdUntilShutdown is wired only into the cache-visibility wait (cache-visibility-wait.js:301-302). delayOn → timeSource.setTimeout → a plain, referenced setTimeout (time-source.js:44-45). The delay is computeRetryDelayMs (≤2000 ms, CDC_RETRY.MAX_DELAY_MS), or an uncapped retryAfterMs taken from the failure (:738-743).
- Probe c1 (probes-cdc/c-mid-sleep.fix.out): the partition releases the in-flight publication write OUTCOME_UNKNOWN while the service is live, so the CDC loop arms its delay (armedBefore=1). Shutdown then runs. `settledNoClock:false, cdcTimersAfterShutdownNoClock:1`: the write stays pending with the CDC timer armed until the clock advances 100 ms. The next attempt then answers SHUT_DOWN(cause "engine not provided").
- Probe e (e-engine-absent.fix.out): the engine is absent (startup deferRetry loop) when shutdown lands. Same result: `settledAfterShutdownNoClock:false, pendingAfterShutdownNoClock:1`.
- This contradicts the implementer's claim ("every wait it holds for a write is released with that answer now", lifecycle.js:143-147). It also breaks the owner's binding A2 requirement ("no retry loop or referenced timer survives, not merely shorter than 90 s"). The witness never exercises this ordering: its engine release always comes after markShuttingDown, and the CDC loop is never mid-delay.

## Non-blocking findings (in-bar unless stated)

N1. The persist-loop widening covers ALL non-retryable failures, not only SHUT_DOWN. A committed publication is now reported failed without its read-back.
- Code: membership-publication-coordinator-persist.js:43-52,117-124.
- Probe h (h-persist-widening.{fix,base}.out): the owner commits the durable row, then throws.
  - base: every case returns success through the read-back (reads=2).
  - fix: 'consensus host failure' (failureCode partition_write_consensus_host_failure, non-retryable), a generic 'Update failed', and SHUT_DOWN all THROW (reads=1).
  - fix: a retryable OUTCOME_UNKNOWN is still read back and returns success.
- No divergent republication was found. The publication id is derived from the candidate epoch (membership-publication-planning-evidence.js:616-618), so the next reconcile re-derives the same id or sees the committed row in its cache. The observable change is a false "failed" for committed writes whose failure answer is non-retryable.
- The terminal requirement needed only "no re-attempt". The durable read-back is a read and is harmless. The witness pins this shape: assertion :203 `upserts === [PUBLICATION_ID]` fails if the loop re-attempts. It would also pass with read-back-then-FAIL.

N2. Honesty of ordering (ii): after the engine accepted the write (success), the answer is SHUT_DOWN with NO cause.
- Code: cache-visibility-wait.js:302 `this.buildShutDownAnswer()`, with no cause.
- The message says "its outcome is not known here (see its cause)", but there is no cause, and the engine's acceptance is dropped (probes d-nodes-owner-accept-then-shutdown, b-shutdown-twice: errorChain has one element).
- Not a fabricated success. It is a weakened answer: a committed write reads as unknown. No witness asserts the (ii) cause chain; only (i) checks for OUTCOME_UNKNOWN (:237).
- allowPendingVisibility callers used to get a pending-visibility SUCCESS at budget and now get the error:
  - membership-publication-active-gate-reconcile.js:330
  - table-creation-service-create-table.js:260,273
  - table-creation-service-existing-table-reconciliation.js:83
  - schema-provisioning-job-repository.js:17
  - managed-split-workflow-ownership-methods.js:226
  - managed-merge-workflow-persistence-methods.js:380
- No caller was found that re-issues under a fresh identity on the same live node: every later write on that node also answers SHUT_DOWN.
- Success is never fabricated. The only success paths are the engine's own result and the pre-promise isSatisfied()/bootstrapMode early returns.

N3. The terminal state does not refuse new writes before routing. Probe a3 (a-write-after-shutdown.fix.out): after markShuttingDown with the engine still registered, a fresh nodes-owner upsert is still routed to the engine (routedWrites=1). It commits, then answers SHUT_DOWN ("no retry ... can succeed", outcome unknown). In production the window is markShuttingDown → `await sqlQueryEngine.shutdown()` (seed-cleanup-handler.js:641-652). An unrouted write refused at the exit (lifecycle.js:211-232) would be a definite not-applied answer instead of an unknown one.

N4. The SHUT_DOWN classification crosses one process boundary. On a seed, bootstrap-request-owner.js:373-384 (isRetryableBootstrapRequestError → isRetryableControlPlaneError) now classifies SHUT_DOWN non-retryable, so the handler (bootstrap-request-owner-handler.js:613-671) answers HTTP 500 instead of 503 BOOTSTRAP_NOT_READY. The joiner treats 500 without a retryable code as terminal (contact-seed-failure-signals.js:80-125). Before the fix, the "engine not provided" deferRetry gave a retryable 503. Reachability is narrow: the request must be admitted before markDraining and still executing when ownerCleanup marks the CDC service down, and ownerCleanup runs before bootstrapAPI.shutdown (entrypoint-runtime-shutdown-lifecycle.js:346-353). Not probed live. Owner decision: is SHUT_DOWN terminal only for the local service, or also for remote requesters?
- Executor outcomes carry errorCode, but only through a local EventEmitter (executor-outcome-emitter.js), so they never reach a live node. Partition FORWARD_WRITE runs on the remote leader's partition service, not its CDC exit, so the remote leader never produces SHUT_DOWN.

N5. Write paths that bypass the one exit (pre-existing, out of bar; the claim "every write path" is overbroad):
- gateway.executeQuery / executeSqlMutationFallback → sqlQueryEngine.executeQuery (control-plane-system-table-gateway-query-execution.js:354-359,361+)
- replica-operation repository mutations (replica-operation-repository-mutation-gateway-methods.js:59,198, with its own isShuttingDownRequested teardown detector :83-84,148-149)
- log retention DELETE (log-retention-service.js:293)
- wasm meta-write-executor.js:31,61
- query-system-state-phase.js:680
- the query executor's own shutdown flag (query-executor-cancellation-routing-install.js:39-48)
These owners detect teardown themselves. Inside CDC, no caller detects teardown other than the lifecycle owner: the only consumers are lifecycle.js and classification.js:257, plus the pre-existing CDC budget-loop check at routed-mutation-readiness.js:464.

N6. The witness seam simplifies production. The real SqlQueryEngine.shutdown (sql-query-engine-lifecycle-and-callback-dispatch.js:313-347) does NOT release in-flight writes. The partition service shutdown does (partition-service-lifecycle-methods.js:150-153), and it runs later, in shutdownServiceMap, after shutdownSqlQueryEngine (seed-cleanup-handler.js:572-577 vs 636). The witness releases inside engine.shutdown(). The order relative to markShuttingDown matches production (release after mark), in both seed and join cleanup (join-cleanup-handler.js: shutdownCdcSqlQueryEngine at cleanup :638, before shutdownServiceMap :641). But the seam skips the real query-executor retry layer and its executor.delay, which, like B1, is not released at shutdown (pre-existing, separate owner). Shape-level assertions (:203 upserts list, :205 routedWrites, :217-219 engine nulled and shut once) partly assert implementation shape. :201 (retrySleeps) and :207 (CDC pending timers) are property-level, but only on the two injected clocks.

## Refuted / verified OK
- (a) A fresh write after full shutdown ends terminal: SHUT_DOWN(cause engine-missing), retryable=false, 0 owner sleeps, 1 persist upsert, 0 engine calls, 0 CDC timers. Base: 900 owner sleeps and 3 upserts (publication); 300 sleeps (nodes owner). a-write-after-shutdown.{fix,base}.out.
- (b) Shutdown twice / markShuttingDown twice: no throw, the held wait is released exactly once, a hold taken after shutdown releases immediately, the engine is shut down once (by that probe's composition). b-shutdown-twice.fix.out.
- (c2) Owner retry loop mid-sleep when shutdown lands: exactly 1 sleep, then SHUT_DOWN. Base: 900 sleeps, 3 upserts. c-mid-sleep.{fix,base}.out.
- (d) Non-publication owner (NodesOwner.upsertNode) in flight at shutdown, both release and accept orderings: SHUT_DOWN, 0 sleeps, 0 CDC timers (release keeps OUTCOME_UNKNOWN as cause). Base: 300 sleeps, or the write never settles with the timer held. d-nodes-owner-inflight.*.out.
- (f) The visibility wait's timeout callback is mid-repair-read when shutdown lands: settles at once with SHUT_DOWN (base: never settles until the retries end). The orphaned repair read completes later, cleanup is a no-op, no timer left. f-timeout-callback-running.*.out.
- (g) The bootstrap direct router (lifecycle.js:251-256), the SQL router (:239-244) and coalesced mutations (runCoalescedMutation wraps executeSQL; no timers in cdc-integration-service-coalesced-mutation.js) all pass through executeSQL (lifecycle.js:211-232). A fresh CDCIntegrationService is built per setup (cdc-integration-setup.js:103,179), so the sticky isShuttingDown flag is never reused across a join retry.
