# Verdict: fixes/cutover-seed-parity @ fedda05da (base 4258fdc32)

**REJECT.** There are 3 blocking items, listed below. The central repairs work where they are exercised: no seed linger, no empty first epoch, and every gate is green. But the repair of the terminal lifecycle answer is incomplete inside its own owner. The binding requirement of one read-side owner is not met. And the 1b re-expression locks in a claim that is false.

Scratch root: `V=/tmp/claude-1000/-mnt-data-peter-projects-lagrange/553555be-039d-4cc4-94d1-91c96f39daef/scratchpad/verify-seed-parity`. Exports are `$V/fix` (`git archive fedda05da`) and `$V/base` (`git archive 4258fdc32` with the two new witnesses, the membership-consistency test and its helper copied in). Both have node_modules symlinked.

## Blocking

**B1. The CDC owner's own retry delay survives `markShuttingDown`, so a referenced timer outlives the terminal state.**
- `src/cdc/cdc-routed-mutation-readiness.js:464` checks `isShuttingDown` only before a delay is armed.
- The delay is `delayOn(this.timeSource, …)` at `:474,485`: a referenced setTimeout of up to 2000 ms, or an uncapped `retryAfterMs` taken from the failure.
- `holdUntilShutdown` is wired only into the cache-visibility wait. The delay is therefore not released at shutdown, and one more attempt runs against the torn-down service before SHUT_DOWN comes back.
- This contradicts the claimed property that `markShuttingDown` releases every held write-side wait. It also breaks the binding A2 rule: no retry loop or referenced timer survives, not merely one shorter than 90 s.
- Evidence (CDC timer still armed after shutdown until the clock is advanced):
  - `$V/probes-cdc/c-mid-sleep.fix.out`, probe c1: `settledNoClock:false, cdcTimersAfterShutdownNoClock:1`. The write was released as OUTCOME_UNKNOWN while the service was live, then shut down.
  - `$V/probes-cdc/e-engine-absent.fix.out`: `pendingAfterShutdownNoClock:1`. The engine was absent when shutdown landed.
- The witness never reaches this ordering, because its release always comes after the mark.
- The repair belongs to the same owner: put the CDC delay under `holdUntilShutdown`.

**B2. The read side still has more than one semantic owner** (binding A3: "route it through the owner"). The implementer left this for an owner decision, so the unit is not complete.
- **The owner disagrees with itself.** `resolvePublishedActiveNodeIds` (`src/control-plane/active-node-publication-snapshots.js:250-281`) answers `null` for a PUBLISHED row with `[]`. It answers `[]` for an OPEN `[]` row, and `["a"]` for an OPEN `[a]` row when nothing is published: an unpublished candidate reads as published membership. The cause is that the normalized published row never carries `publishedActiveNodeIdsPresent` (`:628-631`). Evidence: `$V/probes-membership/p3.out`.
- **`src/control-plane/node-trust-state.js:71-90`** reads a published-empty row as REMOVED for every node, while the rebalancer and the owner now read `null`. The witness itself says a replay can present this row (`membership-publication-first-epoch-members.test.js:200-202`). The disagreement the witness claims to remove has only moved to another pair of readers.
- Two more readers still reconstruct the answer themselves:
  - `control-plane-readiness-service-node-methods.js:100-105`
  - `bootstrap/join-cleanup-publication-context.js:67-73`, which takes the latest row of any status.
- Witness test 2 asserts only that two readers agree, not which answer production needs. It enshrines the owner's inconsistent branch (`null` for published-empty).

**B3. The 1b re-expression (test 3) encodes a false premise and does not assert what the record says to assert.**
- The investigation record says: assert that the short-lease row is "published while its lease is live and leaves by republication".
- The implementer dropped "leaves by republication" on the grounds that an expired-lease member "stays published indefinitely". That is false. Driving the real coordinator, the member stays in epoch 2 until its heartbeat is more than 60 s stale, then leaves by republication in epoch 3 `[seed]` at +60 001 ms. Evidence: `$V/probes-membership/p7-fix.out`.
- The after-expiry step (`membership-consistency.integration.test.js`, `afterExpiry` in `readAtSettledPlacement` with `withShortLease`) requires the epoch to still name `[seed, short-lease-node]`. That asserts that no republication lands inside the wait window. The test now depends on timing in the opposite direction from production semantics (an expectation taken from observed behaviour).
- It passed 5/5 here, so this is latent, not observed.

## Findings, in bar (non-blocking)

- **N1. The persist-loop change covers every non-retryable failure, not only SHUT_DOWN.**
  - A publication that did commit is now reported failed without the read-back: a consensus host failure, a generic "Update failed", and SHUT_DOWN all throw on the fix and return success on base. Evidence: `$V/probes-cdc/h-persist-widening.{fix,base}.out`.
  - I found no divergent republication: the id is derived from the epoch (`membership-publication-planning-evidence.js:616-618`).
  - Only "no re-attempt after SHUT_DOWN" was needed; the read-back is a harmless read. Witness assertion `:203` (`upserts === [PUBLICATION_ID]`) pins this shape.
- **N2. The honesty of ordering (ii) is weakened, but no success is fabricated.**
  - A write the engine accepted ends as SHUT_DOWN with no cause: `cache-visibility-wait.js:302` calls `buildShutDownAnswer()` without one. The message still says "outcome not known (see its cause)".
  - Callers that pass `allowPendingVisibility` used to get a pending-visibility success at the budget and now get the error: active-gate reconcile :330, table-creation :260/:273, existing-table :83, schema-provisioning :17, managed split :226, managed merge :380.
  - No caller re-issues under a fresh identity. No witness checks the cause chain in (ii).
  - Evidence: `$V/cdc-findings.md` N2.
- **N3. A write submitted after `markShuttingDown` is still routed to a live engine.** It commits and then answers "unknown" where it could answer a definite "not applied". Evidence: `$V/probes-cdc/a-write-after-shutdown.fix.out`.
- **N4. SHUT_DOWN crosses one process boundary.** On a seed, `bootstrap-request-owner.js:373-384` now answers HTTP 500 where it answered a retryable 503. The joiner treats that 500 as terminal (`contact-seed-failure-signals.js:80-125`). The window is narrow and was not probed live. Owner decision: is SHUT_DOWN terminal for remote requesters too?
- **N5. The A3 witness discriminates only at its first assertion.** The restart clause and the later-change clause give identical output on base and fix (`$V/probes-membership/p8-{base,fix}.out`): the restart candidate is never empty, because of baseline retention.
  - No assertion reaches an empty candidate after formation, so "defer every empty candidate" is not witnessed against "defer the first".
  - Post-formation empty candidates were not reachable in p6 (`$V/probes-membership/p6-{fix,base}.out`: lease expiry, CONNECTED, drain and all rows deleted each keep `[seed]`), so I found no reachable regression from the broader deferral.
- **N6. The READY re-wake comes from a different listener than claimed.** It is the replica-dispatch nodes-cache listener (`replica-dispatch-reconcile-callbacks.js:432-446`), not the priority-recovery listener. The witness calls reconcile by hand and never exercises the wake.
- **N7. Two routed readers changed behaviour without a witness:**
  - The rebalancer's published-empty answer went from an empty Set (place on nobody) to `null` (no limit: every node the readiness owner holds eligible can take placement) (`unified-rebalancer-available-nodes.js:181-215`).
  - The replica-dispatch ready-node context now returns early on published-empty (`replica-dispatch-replay-health-readiness.js:536/560`).
  - Both are reachable only from a replayed pre-fix empty epoch.
- **N8. The A2 witness partly asserts implementation shape.**
  - Shape: `:203` upserts list, `:205` routedWrites, `:217-219` engine nulled and shut down once.
  - Its engine seam releases the write inside `engine.shutdown()`. In production the real `SqlQueryEngine.shutdown` does not release in-flight writes; the partition service shutdown in `shutdownServiceMap` does, later.
  - The order relative to the mark still matches production, in both seed and join cleanup.
  - `waitForCondition(() => Date.now() > shortLeaseExpiresAt)` in test 3 is a wall-clock wait written as a condition.

## Out of bar

- Write paths that bypass the one exit and detect teardown themselves: the gateway's `executeQuery` and SQL mutation fallback, replica-operation repository writes (their own `isShuttingDownRequested`), log retention, wasm meta-write, `query-system-state-phase.js:680`, and the query executor's own shutdown flag and delay. Details in `$V/cdc-findings.md` N5.
- The "every write path" claim is therefore too broad, but these paths are pre-existing.
- The implementer noted that the inherited persist loop escapes the local-retry-loop detector by its naming. audit:guidelines is green, so the detector does not see it.

## Refuted (verified OK)

- **Red on the broken baseline** (`$V/w7-base-*.out`, `$V/w7-fix-*.out`):
  - A2 witness on base: 0/3 pass. (i) fails at "no retry delay is armed" (31 × 100 ms sleeps). (ii-a) and (ii-b) fail at "settles once shutdown wins". Fix: 3/3.
  - A3 witness on base: 0/2 pass. Test 1 fails at "no epoch is published before the seed's READY heartbeat commits" (epoch 1 `[]`); test 2 fails at reader agreement (`[] !== null`). Fix: 2/2.
- **Orderings beyond the witness** (all in `$V/probes-cdc/`; each is terminal on the fix, and base loops 300 to 900 sleeps or never settles):
  - (a) a write after shutdown
  - (b) shutdown twice
  - (c2) the owner mid-sleep
  - (d) a nodes-owner write, in both orderings
  - (f) the timeout callback mid-repair-read
  - (g) the bootstrap-direct, SQL and coalesced routers all go through `executeSQL`
- **Join-cleanup order:** it marks the CDC service shut down before the partition release, as the seed cleanup does.
- **Real seed, in-flight publication at shutdown** (`$V/probes-linger/shutdown-inflight.mjs`, `--expose-internals`):
  - Fix, offsets 0/150/400 ms: 0 referenced timers after shutdown, `activeResources=[]`, exit within about 10 ms. SHUT_DOWN answers: 1/1/0. Evidence: `$V/linger-fix-{0,150,400}.txt`.
  - Base, offset 0: one referenced 100 ms `retryable-control-plane-write.js:15` defaultSleep, exit about 30 s after shutdown. Evidence: `$V/linger-base-0.txt`.
- **Empty epoch:** no path publishes one after the fix. The guard at `reconcile.js:477-490` sits before every write branch.
- The heartbeat and reconcile routed readers (`:366`, `:734`) behave as before (`$V/probes-membership/p4.out`).
- No SHUT_DOWN-driven divergent republication was found.

## Runs (commands, counts, exit codes)

All runs used `$V/run.sh` (tap loader, `timeout -k 10`) behind the thermal gate, one heavy run at a time.

| Run | Result | Wall time | TAP time | Output |
|---|---|---|---|---|
| membership-consistency, fix, 5x | 98/98 each, rc=0 | 55.4-56.7 s | 54.2-55.5 s (root test about 45 s) | `$V/mc-fix-{1..5}.out` |
| membership-consistency, base + new test files, 1x | 98/98, rc=0 | 127.5 s | 125.3 s (80 s linger) | `$V/mc-base-newtests-1.out` |
| seed-node-bootstrap, fix, 2x | 110/110, rc=0 | 35.8 / 35.7 s | root 34.6 / 34.5 s | `$V/sb-fix-*.out` |
| seed-node-bootstrap, base, 1x | 110/110, rc=0 | 110.3 s | 109.1 s | `$V/sb-base-1.out` |

The base membership-consistency run shows that test 2 (1a) is intermittent on base, not deterministic as the record states. It passed standalone and failed under load (below).

Suites on fix, `run-test-files --jobs=2`, recursive (`$V/batch2.table`, `$V/suite-fix-*.out`):

| Suite | Result | Exit | Time |
|---|---|---|---|
| test/cdc | 40/40 | 0 | 23 s |
| test/control-plane | 182/183 | 1 | 51 s |
| test/rebalancer | 231/231 | 0 | 111 s |
| test/bootstrap | 181/182 | 1 | 144 s |

The two failures are both export artifacts ("not a git repository"): `formation-release-handoff-interaction-registry` and `critical-placement-trace-classifier`. Re-run in the worktree, both are green, rc=0 (`$V/wt-*.out`).

Integration classification (`$V/batch3.table`, `$V/int-*.out`):

| File | Fix | Base |
|---|---|---|
| preflight-critical-path-hops, standalone 3x | 81/81 each, rc=0, 22-23 s TAP | 81/81 each, rc=0, 20 s TAP |
| user-table-metadata-fanout, standalone 3x | 12/12 each, rc=0, 32-35 s TAP | 12/12 each, rc=0, 33-42 s TAP |

Under load: `run-test-files --jobs=2` with {preflight, user-table-metadata-fanout, membership-consistency, seed-node-bootstrap}:
- Fix: 4/4, exit 0, 79 s.
- Base: 2/4, exit 1, 371 s. membership-consistency failed at test 2 / not ok 5 (1a). user-table-metadata-fanout failed on fan-out not ready, then a 360 s timeout.

Classification:
- The user-table-metadata-fanout red under load is pre-existing: base reproduces it.
- preflight EADDRINUSE was not reproduced on either export (standalone 3x, 4-file load). It is not attributable to this diff, which touches no ports.

Gates, run in the worktree (the worktree was clean afterwards):

| Gate | Result |
|---|---|
| complexity | 1813/1813, rc=0 |
| cognitive | 159/159, rc=0 |
| unused exports | 1437/1437, rc=0 |
| file size | 27/27 and 21/21, rc=0 |
| duplication | src 56/1815 and test 791/30451, rc=0 |
| audit:shards | OK (2169 tests), rc=0 |
| audit:impact-contracts | PASS (40 contracts), rc=0 |
| check-fast-static | ok, rc=0 |
| audit:guidelines | rc=0 |
| test:unused | rc=0, 2 configuration hints only |
| lint | rc=0 |

## Not verified

- The full 64-file test/integration run at `--jobs=2`: the implementer's preflight EADDRINUSE red was not reproduced at my smaller load.
- An admission-blocked publisher in a single-node cluster: here the fix keeps the last epoch, which is the direction the owner's own comment calls dangerous for remove-safety.
- When the real readiness owner trims the short-lease node: p7 drives the coordinator without the transport-evidence readiness owner.
- The N4 joiner 500-vs-503 window, live.
- The GCP or lab runners.
- `test:metadata:refresh` and the `--refresh` / `--verify-import-graph` global owner debt inventory runs: both write files, so I did not run them read-only.

No child processes survive, the worktree is clean, and I ran no git write commands.
