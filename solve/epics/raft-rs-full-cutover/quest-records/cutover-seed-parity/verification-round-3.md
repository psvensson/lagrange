# Verdict, round 3: fixes/cutover-seed-parity @ b5a77287f (corrective f5b63be43..b5a77287f)

**REJECT, on one blocking item.** It is B-A's residual retry delay: the propagation service's retry loop arms a new retry delay after `stop()`. The round-2 items are otherwise closed:
- **B-A (the fresh-join teardown hang):** no hang in 40 runs on the fix. The base does reproduce the same hang signature.
- **B-B, B-C and B-D:** closed, each witnessed red on the round-2 head.
- **Everything else:** every rerun and every gate is green.

Paths: `V=/tmp/claude-1000/-mnt-data-peter-projects-lagrange/553555be-039d-4cc4-94d1-91c96f39daef/scratchpad/verify-seed-parity`. Exports, each built with `git archive`:

| Export | Tree |
|---|---|
| `$V/r3/fix` | b5a77287f |
| `$V/r3/base` | 4258fdc32 plus the corrective's test files |
| `$V/r3/r2head` | 57f85f31d plus the corrective's test files |

Probes are in `$V/r3/probes/`.

## Blocking

**R3-1. The propagation retry loop arms a retry delay after `stop()`.** This is the same class as round-2 B-D: a referenced timer that outlives the terminal state.
- In `cdc-group-propagation-delivery-methods.js:80-106`, when `stop()` lands while a delivery attempt is in flight at the router, `retrySleepReleases` has nothing to release.
- The router then answers "not acknowledged", and the loop calls `this.sleep(retryDelayMs)` without checking `STOPPED` first. That arms a new referenced `setTimeout` after stop. The loop checks `STOPPED` only after that timer fires.
- Probe `$V/r3/probes/m-inflight-attempt-at-stop.mjs` (output `m.fix.out`): `afterStop.settledAtOnce: false, retrySleepsHeld: 1, activeTimeouts: 1`. The delivery settles `propagation_stopped` only after about 51 ms, with no further attempt.
- The delay is at most `deliveryRetryMaxDelayMs`: 1000 ms by default, 50 ms and 100 ms in practice. That is the partition shutdown's wait on this delivery.
- It is reachable in seed teardown; it is the implementer's own named residual, "a router delivery already in flight". The claim "retry-delay sleeps released at stop" does not cover it.
- The repair is one line: check `STOPPED` before sleeping, or answer at once from `sleep()` when already stopped. No witness exercises this ordering.

## B-A: rate classification (lab, as briefed) and controller runs

**Lab.** Four hosts, each under `flock -w 1800` on `~/.lab/machine.lock` with a holder record (`claude:553555be-verifier`, `test:fresh-join-rate`, both commits).
- The corrective was delivered by `git bundle` (`4258fdc32..fixes/cutover-seed-parity`, 115 KB). 4258fdc32 was already present on every host.
- Each host ran two detached worktrees under `/tmp/lagrange-verify-553555be` with node_modules symlinked.
- Before every run: `wait-for-thermal-headroom`. Each run: `node scripts/run-test-files.js --jobs=1 test/bootstrap/fresh-join-via-non-seed-node.integration.test.js`, alternating fix and base, 5 of each per host.
- This was a rate classification and ran to completion.
- Afterwards: worktrees removed and pruned, bundle, script and results removed, holder records removed. `lab fleet` shows all four hosts free. The only thing left is the fetched objects in each host's object store.
- Results are in `$V/r3/lab/<host>/results/`.

| Host | fix red/runs | base red/runs |
|---|---|---|
| tv-dator | 0/5 | 1/5 (run 2) |
| lenovo-laptop | 0/5 | 0/5 |
| adam-laptop | 0/5 | 0/5 |
| adams-gamla | 0/5 | 1/5 (run 3) |
| **Total** | **0/20** | **2/20** |

Signatures of the base reds:
- **tv-dator base-2** (`$V/r3/lab/tv-dator/results/base-2.tap`): 11/11 assertions pass, then `not ok 12 - timeout!` in teardown at 120 s. The partitions keep delivering. This is the B-A teardown-hang signature.
- **adams-gamla base-3:** the test finishes (`ok 1`, 39.8 s), then the file times out (`not ok 2 - timeout!`) because the process lingers after the test. This is the round-1 A2 linger that 4258fdc32 still carries. It is a different defect.

**Controller.** The fix passed 20 of 20 runs of the same file, as a stop-at-first-red batch (`$V/r3/batchL.table`).

Earlier controller measurements on this file:

| Tree | Red runs |
|---|---|
| 4258fdc32 | 0/25 |
| Round-1 head | 2/13 |
| Round-2 head | 3/16 |

**Soundness of the comparison.**
- The fix shows no hang in 40 runs (20 lab, 20 controller).
- The base reproduces the exact hang signature (1 in 20), which is consistent with the defect the witness names being pre-existing on 4258fdc32.
- On power: against the base's rate the comparison is weak (P(0/20) at about 5% is 0.36). Against the branch heads' observed rate (5 of 29) it is strong. Fix 0 of 40 against 5 of 29 gives a hypergeometric p of about 0.011.
- The mechanism is witnessed deterministically. `test/bootstrap/seed-teardown-pending-cdc-delivery.test.js` is red on both 4258fdc32 and the round-2 head at "ReplicaHandler.shutdown completes: the partition's pending delivery settled when the propagation service stopped", and green on the fix. `test/topology/cdc-group-propagation-stop-settles-deliveries.test.js` is 4/4 red on both and 4/4 green on the fix.

**The two residuals and the unbounded wait.**
- **The router delivery in flight:** settles, bounded by the router's pending-response timeout (`router-delivery-manager.js`, `messageTimeoutMs`). It then pays the post-stop delay in R3-1.
- **The in-flight `applyCDCEvent` raft proposal:** bounded by `proposeCDCCommand`'s `proposeTimeoutMs` (`message-group-service-cdc-replication-runtime-methods.js:297-320`).
- **`propagateCDCEvent` after stop:** it still proposes `applyCDCEvent` on the local message group before delivery answers stopped (`cdc-group-propagation-service.js:208-257, 380-385`). This is pre-existing and bounded.
- **The unbounded partition-shutdown wait:** everything it currently awaits settles, but it stays a latent hang for any future unsettled delivery.
- **PROPAGATION_STOPPED consumers:** nothing in src outside the propagation service reads `deliveryFailures`. The seed subscriber ignores the result, so nothing treats it as success and nothing retries it.

## Round-2 items: closed (evidence)

- **B-B:** the owner snapshot and the protocol snapshot now return `publishedActiveNodeIds: []` for an OPEN or ACK_PENDING `[a]` row, with `pendingCandidateNodeIds` separate (`$V/r3/probes/j-owner-third-read.fix.out`).
  - The heartbeat and the reconcile go through `buildPublicationActiveGateMembershipConvergence`. The handoff target withholds the acknowledgement of any pending member that has not acknowledged.
  - Witness tests 6 and 7 are red on the round-2 head at "no membership row records an acknowledgement the joiner never gave". The semantic census (test 10) is red there at "an OPEN row only: the owner snapshot names only published membership as published".
  - The spot-checked readers the census classifies as projections consume projected values.
  - **Recorded owner decision, pre-existing:** the close lane RECOVERY_ELIGIBLE_ACK still substitutes recovery eligibility for a member's acknowledgement (`finding-owner-close-lane-recovery-eligible-ack.md`).
- **B-C:** in the real-coordinator probe (`k-failed-join-retraction.fix.out`), a joiner already published is retracted: epoch 2 PUBLISHED `[seed]`. The witness is red on the round-2 head at "the joiner is republished out of membership as the next epoch".
- **B-D:** probe g shows `timersAfterShutdownNoClock 0` and no authoritative read after shutdown. Witness (vii) is red on the round-2 head at "the CDC service holds no timer after shutdown".
- **Test 3:** the placement assertions are removed, with the reason in the header. The cited readiness contract test exists (`control-plane-readiness-service.test.js:696`).
- **Owner transition:** it now goes through `acknowledgeMembershipPublicationForNode`.
- **Carried finding, unchanged:** the CDC catch-up sleep. Probe h is unchanged, and the finding is now recorded on the branch.

## Witnesses (five files)

| Witness file | fix | base 4258fdc32 | round-2 head |
|---|---|---|---|
| `cdc-shutdown-terminal-owner-write` | 10/10 | 9 red | 1 red: (vii) |
| `membership-publication-first-epoch-members` | 11/11 | 8 red | 5 red |
| `bootstrap-request-shut-down-writer-not-ready` | 1/1 | red at its precondition | green (fixed in round 2) |
| `seed-teardown-pending-cdc-delivery` | 1/1 | red | red |
| `cdc-group-propagation-stop-settles-deliveries` | 4/4 | 4 red | 4 red |

Outputs: `$V/r3/w-*.out`.

## Runs and gates

| Run (fix) | Result |
|---|---|
| membership-consistency, 5x, stop at first red | 93/93 each, rc=0, about 56 s wall vs 55 s TAP |
| seed-node-bootstrap, 1x | 110/110, 36.7 s wall vs 35.5 s TAP |
| Real seed shut down with a publication in flight | 0 referenced timers, `activeResources=[]` (`$V/r3/linger-fix-*.txt`) |
| test/topology, `--jobs=2` | 13/13 |
| test/cdc + test/control-plane, `--jobs=2` | 222/223 |
| test/bootstrap, `--jobs=2` | 183/184 |
| test/rebalancer, `--jobs=2` | 231/231 |

The two suite failures are the git-dependent tests that fail only in an export. In the worktree both are green: `formation-release-handoff-interaction-registry` and `critical-placement-trace-classifier`.

Gates, run in the worktree:

| Gate | Result |
|---|---|
| complexity | 1813/1813 |
| cognitive | 159/159 |
| unused exports | 1437/1437 |
| file size | 27/27 and 21/21 |
| duplication | 56/1815 and 791/30451 |
| audit:shards | OK, 2172 tests |
| audit:impact-contracts | PASS |
| check-fast-static | ok |
| audit:guidelines | rc=0 |
| eslint | rc=0 |

The worktree was clean afterwards.

## Not verified

- A live joiner arriving during seed shutdown.
- The metadata refresh and the inventory `--refresh` / `--verify-import-graph` steps: they write files, and this pass is read-only.

No child processes survive locally or on the lab hosts, and I ran no git writes to the repository.
