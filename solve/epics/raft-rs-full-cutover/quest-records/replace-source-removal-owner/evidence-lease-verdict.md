# Evidence: the owner-availability lease verdict (L1/L2), 2026-09-25

**Author:** evidence author (Agent A, tier E0), written independently of the implementation.
**Frozen claim:** `scope-narrow-lease-verdict-2026-09-25.md`, L1 and L2.
**Heads:**
- red on `b0fd15184` (the inverted verdict);
- green on `bfbf7692e` (the implementer's fix; its `src/` differs from `b0fd15184` only in `operation-owner-availability-policy.js`), measured on an exact `git archive` copy of that commit's `src/`.

## 1. Property

**The oracle.** It is written in the test harness and does not import the implementation. It uses two sources:
- the module contract (`operation-owner-availability-policy.js:7-15` at `b0fd15184`);
- the lease record (`replica-operation-owner-lease.js`).

It works as follows:
- If the recorded owner is unknown or is the observer, the verdict is `LOCAL_OR_UNKNOWN_OWNER` with `unavailable: false`.
- Otherwise the oracle computes `lease = resolveOperationOwnerLeaseState(operation, now)`. The imported lease record is the only lease authority.
- The **owner's live lease** is `lease.state === ACTIVE`, where the lease holder is either unattributed or the recorded owner. An unattributed lease counts because the row has no owner column (lease record :91-96).
- If the owner holds a live lease, the verdict is `FENCED_BY_LIVE_LEASE` with `unavailable: false` (L1).
- Otherwise the verdict is `HEURISTIC_AVAILABLE` or `HEURISTIC_UNAVAILABLE`, with `unavailable = !heuristicReady` (L2). A second, differential check requires this to equal the verdict computed with no lease at all.

**Callers, in relational form.** Each check is made per caller, per phase and per observer:
- If the owner holds a live lease: `outcome(cell) == outcome(no lease, heuristic ready)`, and the outcome is not the un-wedge result.
- Otherwise: `outcome(cell) == outcome(no lease, same heuristic)`.

The outcome depends on the caller:
- For the release and the stale-FAIL settle, the outcome is `{workflowStep, status, errorMessage, terminal, deliveries}`, read through the real sweep, `checkTimeouts()`.
- For the re-entry wake, the outcome is `{action, woken, builderWoke}`.

Anchors guard against vacuity:
- With no lease and an unready heuristic, the caller must reach the un-wedge result: REMOVED for the release, FAILED for the stale settle, and `skip` with no wake for the re-entry.
- With no lease and a ready heuristic, the REPLACE must stay non-terminal, and the re-entry must be `wake_remote_owner` with the wake fired.

**Causal property.** Two coordinators, the owner (the REPLACE's target) and a seed, share one durable store and one controlled clock. The owner holds the live lease that its own ACTIVE write stamped. The sequence runs:
1. seed sweep at ACTIVE;
2. owner sweep;
3. seed sweep at STOPPING;
4. the source executor retires the source;
5. owner sweep, then seed sweep.

The test requires all of the following:
- The seed never settles the REPLACE, at ACTIVE or at STOPPING.
- The history ends ACTIVE → STOPPING → REMOVED.
- When the REPLACE first became terminal, its source was already gone.
- Exactly one REMOVE_REPLICA was sent for the source. It came from the owner and carried the REPLACE's operation id and reason `replace_source_removal`.
- The seed never sends REMOVE_REPLICA.
- No other `replica_operations` row exists, so there was no planner REMOVE.

The seed's heuristic is run both ways, unready (the refresh-pending placeholder case) and ready.

## 2. Census of verdict consumers

At `b0fd15184`:
- `resolveOperationDrainOwnerAvailability` has one consumer, `isPriorityRecoveryDrainOwnerUnavailable` (`operation-workflow-recovery-timeout.js:824-842`).
- That method has three call sites, each witnessed:
  1. the release evidence (`recovery-timeout.js:899`), decided at `:694-724` through `reconcile-shared.js:634-645`;
  2. the stale-FAIL remote settle (`recovery-drain.js:385-397`);
  3. the re-entry wake (`operation-workflow-owner-priority-recovery-reentry.js:326-340`).
- `grep` over `src/` finds no other call site.

## 3. Timing arithmetic

The constants come from the owners (`getTimeoutForStep` and the lease record):
- lease TTL: 30000 (expiry = `updatedAt + 30000`, live iff `expiry > now`);
- step budgets: ACTIVE 30000 (`pendingTimeoutMs`), STOPPING 60000 and SYNCING 60000 (priority cap).

What follows from them:
- **Release.** It needs no staleness. Every REPLACE that entered ACTIVE, STOPPING or SYNCING less than 30 s ago holds a live lease stamped by the owner (H2).
- **Stale-FAIL.** It needs `step age >= budget`. The step age runs from the steps-history entry; the lease runs from `updatedAt`. At ACTIVE the budget equals the TTL, so a lease stamped only at step entry expires at the same instant the step turns stale: `expiry > now` becomes false exactly when `age >= budget` becomes true. A live lease on a stale step therefore needs a later `updatedAt` re-persist without a step change, such as the dispatch retry loop (CL-044). The witness builds exactly that. It also asserts that every budget is at least the TTL and that every cell satisfies `updatedAt >= step entry`.
- **Boundary.** `expiry == now` is EXPIRED and `expiry == now + 1` is ACTIVE. Both cells are in the universe.

## 4. Coverage table

| Witness | Axes (every value imported or derived from its authority) | Cells |
|---|---|---|
| V1 verdict | recorded owner {remote, observer, unknown} × lease {unfenced, expired, expired at now, live at now+1, live} × holder {none, owner, other, observer} × shape {decoded, raw row} × heuristic {ready, unready}. Also enumeration closure: covered lease states = `REPLICA_OPERATION_OWNER_LEASE_STATE`; oracle states = `OPERATION_DRAIN_OWNER_AVAILABILITY`; each cell's lease state is checked against the lease record | 204 |
| V2 anchors | live at now+1 with an unready heuristic is available; expired at now with an unready heuristic is unavailable | 2 |
| C1 release | phase {ACTIVE, STOPPING, SYNCING with target ACTIVE} × observer {seed, source node} × lease (5) × heuristic (2); source present (ACTIVE voter; REMOVING at STOPPING) | 60 |
| C2 stale-FAIL | phase × source observation {unavailable; absent at ACTIVE/SYNCING} × observer × lease × heuristic; step age = budget + 1. Control: STOPPING + absent (retirement evidence) must settle identically for every verdict | 100 + 20 |
| C3 re-entry | phase × observer × lease × heuristic, through the production snapshot builder, `resolveOperationWorkflowOwnerTargetProgressReentryAction` and `schedulePriorityRecoveryTargetProgressReentry` | 60 |
| K causal | seed heuristic {unready, ready} over the sweep sequence in §1 | 2 |

The heuristic is driven through its authority: the readiness service that `isNodeReadyForRouting` reads. The verdict is never stubbed.

## 5. Red on `b0fd15184`

All seven witnesses are red, and red in 5 of 5 runs.

| Witness | Red cells |
|---|---|
| V1 | 32 cell mismatches, plus 8 L2 differential failures, in the universe of 204. The 32 are every live lease on a remote owner: 16 with an unattributed or owner holder return `unavailable: true`, and 16 with a foreign holder are fenced instead of falling to the heuristic |
| V2 | the L1 anchor (live, unready ⇒ available) |
| C1 | 24 of 24 live-lease cells (L1 and L1-direct): all end REMOVED via `owner_unavailable_released` with the source present |
| C2 | 40 of 40 live-lease cells: all end FAILED ("Priority recovery drain settled stale operation without source-retirement evidence") |
| C3 | 24 of 24 live-lease cells: `skip` with no wake |
| K (both) | the seed's first sweep makes the REPLACE REMOVED at ACTIVE with its source an ACTIVE voter (history PENDING → ACTIVE → REMOVED); the owner never sends REMOVE_REPLICA |

## 6. Green on `bfbf7692e`

All seven witnesses pass, 5 of 5 runs. The 5-run record per head:

| Head | Runs | V1 V2 C1 C2 C3 K1 K2 |
|---|---|---|
| `b0fd15184` | 5 | F F F F F F F (every run) |
| `bfbf7692e` | 5 | P P P P P P P (every run) |
| scratch reference (polarity plus holder correction, before the fix arrived) | 5 | P P P P P P P (every run) |

## 7. Mutation table

Each mutation was planted in a scratch copy of `bfbf7692e`'s `src/`. The families are bounded by semantic route. Columns: V1, V2, C1, C2, C3, K1 (seed unready), K2 (seed ready). F means red.

| Id | Semantic route | Plant | V1 | V2 | C1 | C2 | C3 | K1 | K2 |
|---|---|---|---|---|---|---|---|---|---|
| M1 | polarity reverted (today's value) | `buildLiveLeaseVerdict` → `unavailable: true` | F | F | F | F | F | F | F |
| M2a | release bypasses the verdict | release evidence reads `!isNodeReadyForRouting(owner)` | P | P | F | P | P | F | P |
| M2b | stale-FAIL settle bypasses the verdict | stale arm reads `!isNodeReadyForRouting(owner)` | P | P | P | F | P | P | P |
| M2c | re-entry bypasses the verdict | re-entry reads `isNodeReadyForRouting(owner) !== true` | P | P | F | F | F | P | P |
| M3a | expired lease treated as live (the wedge) | `lease.state !== UNFENCED` | F | F | F | F | F | P | P |
| M3b | expiry == now treated as live | lease record `>` → `>=` | F | F | P | P | P | P | P |
| M3c | absent lease treated as live | `lease.state !== EXPIRED` | F | P | F | F | F | P | P |
| M4 | lease on the wrong owner accepted | holder check dropped | F | P | P | P | P | P | P |
| M5 (added) | ambient clock instead of the owner clock | lease resolved with `nowMs` undefined | F | F | F | F | F | F | P |

Every family is red on at least one witness, and every caller witness has a family that turns only it red: C1 by M2a, C2 by M2b, and C3 (with C1 and C2) by M2c. Why the others behave as they do:
- **M2c.** It also reddens C1 and C2 because the sweep's wake deliveries change.
- **M3b.** It changes the shared lease record, so the caller relations, which use the same record, cannot see it. The V1 per-cell lease-state check and the V2 anchor catch it. This is the anchor that guards against an oracle and implementation sharing one bug.
- **M4.** It is visible only at the verdict (see limit 1).

The same families, planted into the scratch reference before the fix arrived, were red in the same places, except that M3b was planted there in the policy rather than in the lease record.

## 8. Limits

1. **Holder attribution is reachable only at the verdict layer.** The `replica_operations` row has no owner column, and row decoding never sets `ownerNodeId`. No caller cell can therefore present a lease attributed to a foreign holder, and M4 is caught by V1 alone.
2. **SYNCING re-entry uses an overlay.** The harness snapshot builder has no target service rows, so the target-ACTIVE visibility is overlaid from `PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.ACTIVE_OPERATIONAL`. For ACTIVE and STOPPING the production snapshot and its own scheduling are used unmodified. The wake effect is observed at the `wakeCoordinatorCreatedRemoteOwner` sink, not at the wake message.
3. **The source is simulated at the repository seam.** Its observation comes from `repository.getActualReplicaObservation`; in the causal witness a simulated source executor moves the row to REMOVING, then deletes it. The Raft conf change (REMOVE_PEER after the delete, H5) is not modelled. "Source gone" means the services row is gone, not that the source has left committed membership, which is the next epic's contract.
4. **The planner is not in the harness.** "Not removed by a planner REMOVE" is shown by three facts:
   - the REPLACE's own REMOVE_REPLICA had retired the source before the REPLACE first became terminal;
   - no other operation row exists;
   - the seed never removes the source.

   The planner's B2 lane itself is not exercised.
5. **Observers are the seed (a third node) and the source node.** Owner-local behaviour appears only as the `LOCAL_OR_UNKNOWN_OWNER` verdict cell and as the causal owner.
6. **Not enumerated or asserted:**
   - the heuristic's throw and non-function branches (`resolveHeuristicReady`);
   - "the heuristic is not called when fenced", which is in the JSDoc, not in the claim.
7. **A lease that lapses while a healthy owner waits (A5) keeps today's behaviour**, which is excluded by the claim. It appears only as L2 cells: expired and ready ⇒ woken; expired and unready ⇒ released or failed.
8. **Existing pins.** On a corrected verdict, the tests in `test/rebalancer/operation-ownership-lease-fencing.test.js` titled "a live remote lease fences drain remote settlement…" and "the workflow owner drain probe consults the persisted lease…" are red: they pin `unavailable: true`. This was observed on the scratch reference. Superseding them (R09) belongs to the implementer, and I did not read the implementer's version. The three existing un-wedge release tests in `rebalance-coordinator-stopping-reconcile-cache-visibility.test.js` (ACTIVE, SYNCING, STOPPING, all with an absent lease and an unready owner) stay green on the corrected verdict, both on the scratch reference and on `bfbf7692e`. They are L2 anchors.
9. **Unused exports: 1435, within the fix's baseline of 1436.** The checker says the baseline can be tightened to 1435. I did not tighten it, because `scripts/` is outside this evidence scope.

## 9. Files and reproduction

Evidence (test files only; no `src/` edits):
- `test/rebalancer/replace-owner-lease-verdict-harness.js`: cells, stamping from the lease record, and the contract oracle;
- `test/rebalancer/replace-owner-lease-verdict-property.test.js`: V1, V2, C1, C2 and C3;
- `test/rebalancer/replace-owner-lease-causal.test.js`: K1 and K2.

To run: `node test/rebalancer/replace-owner-lease-verdict-property.test.js` and `node test/rebalancer/replace-owner-lease-causal.test.js`.

The mutation and variant drivers are scratch-only:
- `mkvariant-sha.sh` uses `git archive <sha> src` and is read-only;
- `mutate-fix.py` plants one family member;
- `run-variant.sh` runs the witnesses against a variant.

Gates (E0) on the evidence worktree:
- eslint: clean on the three files;
- `npm run -s test:duplication`: OK (test 791/791, src+scripts 56/56);
- `check-fast-static`: ok, after `test:metadata:refresh`; the four refreshed `test/shards/*.json` files were then restored from HEAD;
- `test:unused:ratchet`: 1435 (1436 or fewer).
