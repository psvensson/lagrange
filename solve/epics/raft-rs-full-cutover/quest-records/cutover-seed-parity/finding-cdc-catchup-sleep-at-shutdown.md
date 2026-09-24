# Finding: the CDC authoritative catch-up sleep outlives shutdown (round-2 N1)

Recorded 2026-09-24 in the round-3 repair of cutover seed parity. Not fixed in this unit.

- **Where:** `src/cdc/cdc-integration-service-authoritative-catchup.js:303`. The catch-up loop sleeps between attempts on a timer armed on the service clock (`sleep` at lines 162-164). The sleep is not held by the CDC lifecycle owner (`holdUntilShutdown` / `delayUntilShutdown` in `cdc-integration-service-lifecycle.js`).
- **Effect:** when shutdown lands during that sleep, the timer stays armed. On a deferred answer, the loop can run further authoritative reads after shutdown (verifier probe h: 5 more reads with a deferred stub). The real read after shutdown answers `authoritative_row_source_unavailable`, which is not deferred (probe i), so the loop ends after at most one more read. What remains is one sleep of `retryAfterMs` (uncapped) or `CATCHUP_DEFAULT.RETRY_FALLBACK_DELAY_MS`.
- **Class:** read path, pre-existing on 4258fdc32, bounded. It contradicts the lifecycle contract ("every wait or retry delay it holds ... ends at once") only for reads. This unit repaired the write-side delays: the routed-mutation retry budget, and in round 3 the cache-visibility repair retry (B-D).
- **Repair when owned:** use `service.delayUntilShutdown(ms)` as the default `sleep`, and end the attempt loop when `service.isShuttingDown === true`, the same shape as `confirmCacheVisibilityHoleWithinBudget`. Witness: the probe h ordering, with 0 armed CDC timers and no read after shutdown.
- **Superseded and repaired (round 8):** superseded by `evidence-round-8-blocker-catchup-sleep.md`, which found this is CDC-owned retry work under P-Q, not an exempt read path. Repaired in the round-8 P1 commit: the catch-up's default delay is the owner's `delayUntilShutdown`, and its table and attempt loops end on `isShuttingDown` (at entry, after each read, after each sleep) with the owner's typed `SHUT_DOWN` code. No read is made after terminal. Witness: `test/cdc/cdc-authoritative-catchup-terminal.test.js`.

## Re-classification under P-Q and P-L (evidence author, 2026-09-24)

The "read path, not fixed in this unit" scoping above is withdrawn. The owner's properties are:
- **P-Q:** no CDC-owned retry or publication work remains pending, is newly scheduled, or executes after the owner's terminal state.
- **P-L:** no referenced CDC-owned handle is left to keep the process alive.

The catch-up is a method of the CDC integration service. It re-reads the CDC-propagated tables and repairs the local cache (`applyAuthoritativeCacheRepair`), and it retries deferred reads on the service clock. It is therefore CDC-owned retry and repair work, and a read path gets no exemption.

On b3bb872c7 it violates both properties:
- The sleep stays armed after `markShuttingDown`: a referenced timer on the real clock.
- The retried read runs after the mark.
- A catch-up started after the mark still reads every table.

The lead ruled that a catch-up starting after terminal must not read. The repair is 242da6ca2: the delay goes through `delayUntilShutdown`, reads stop at the terminal state, and `delayOn` is deleted. The witness lanes are in `test/cdc/cdc-shutdown-terminal-owner-write.test.js`: the two catch-up lanes, the real-clock lane "the catch-up sleep", and the census. Evidence is in `evidence-cdc-quiescence.md`.
