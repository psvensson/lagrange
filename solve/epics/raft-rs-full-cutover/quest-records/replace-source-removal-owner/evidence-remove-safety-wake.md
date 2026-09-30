# Evidence: the R-2 remove-safety readiness wake, 2026-09-25

**Author:** evidence author (Agent A, tier E0), written before reading the implementer's witness (`test/rebalancer/remove-safety-readiness-wake.test.js`).

**Binding sources:**
- `owner-directive-complete-replace-2026-09-25.md`, points 2-5 and 7;
- `a2-slo-classification-lab.md`, the lab mechanism;
- the verification protocol v2.

**Heads:**
- red on `102e127c4` (before the wake);
- green on `527771405` (the wake).

Both are measured on exact `git archive` copies of that commit's `src/`. No `src/` edits and no git writes were made.

## 1. Properties

Each property comes from the owner directive, not from the implementation.

| Id | Property | Directive |
|---|---|---|
| W1 | **Normal path.** The fallback clock is frozen. Readiness becomes authoritative and the readiness owner publishes normally. The REPLACE owner then wakes and progresses SAFE → REMOVE_REPLICA (the source) → STOPPING, with **0 ms of fallback advance**. | points 2 and 4 |
| W2 | **Backstop.** The publication is suppressed. The owner waits while the clock is frozen; advancing the fallback recovers progress through the same owner. | points 2 and 4 |
| W3 | **Lost wakeup.** The level flips inside the deferring evaluation, after the owner has read readiness and before its waiter exists. It is covered three ways: with no publication at all; with a publication emitted synchronously before any waiter can hear it; and as BR1, a same-identity republication that is first a no-op, then carries the flip. The owner must not sleep until the fallback. | point 3 |
| W4 | **No lost edges.** Three cases: a wake that finds the owner lane held (held exactly as `checkTimeouts`, the orphan reconcile and the target-progress re-entry hold it, through `operationWorkflowRunExclusive` on the operation's single-flight key); a second flip inside the woken run's own evaluation, with no publication; a fallback fire into a held lane (the lab measured this dropping 5 of 11 fires). | points 2 and 3, lab BR2a |
| W5 | **A wake is not authority.** A wake on a level change that stays unsafe (another remaining voter turns substantively unready) re-evaluates and defers, with no removal. Repeated wakes on a still-unsafe floor never remove. Duplicate wakes and wakes for an unrelated node cause exactly one removal, and stale wakes after STOPPING never cause a second. | point 5 |
| W6 | **Causal refinement (P2).** Every combination of the three remaining voters' profiles is covered: {READY, SYSTEM_FLOOR, UNSAFE}³ = 27 cells, each followed by a publication for every voter. The owner removes the source **if and only if** every remaining voter is READY. A pending placeholder may WAIT, never more than an unsafe level would. | point 5; causal P2 |

**The lab profile.** The deferring readiness in W1-W5 is the lab-classified system floor:
- participation and node readiness answer `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING` + `planning_snapshot_refresh_pending`;
- that is neither routable nor an evidence-absent denial;
- so the replica is not floor-countable, and remove safety defers "would drop voter-ready replicas below minimum (2/3)".

Every W1-W5 cell first asserts exactly this deferral and zero removals.

**Partitions.** Every cell runs on `sql_write_operations-p1` (a priority control-plane partition) **and** on `replica_operations-p1` (the operation-ledger partition, the gap the implementer named).

## 2. Harness (`test/rebalancer/replace-remove-safety-wake-harness.js`)

**The owner.** A real `RebalanceCoordinator` on the REPLACE's target node, set up as follows:
- the REPLACE is at ACTIVE, with four voters: the source r1, a peer r2, a second peer r3 and the target r4; the minimum is 3;
- the replacement's own election evidence is present, so no handoff deferral occurs;
- the owner's entry is `executeOperation` (EXECUTE, ACTIVE → STOPPING).

**The readiness authority** answers `getNodeReadinessSync` and `getControlPlaneParticipationSync` per node from a profile. The profile reasons come from `CONTROL_PLANE_READINESS_REASON`.
- `subscribeReadinessPlanningSnapshots` returns an unsubscribe.
- `publish(node)` emits `{ownerKey, snapshot, capturedToken}` in its own macrotask, as the readiness owner's queue does. The planning token is unchanged across flips (BR1).
- The owner-read planning answer agrees with the levels: every node is published, and the recovery projection is the ready nodes other than the source.

**The fallback clock.** Every owner timer (`setTimeoutFn`) is virtual, and "frozen" means it is never advanced. The per-cell result `fallbackAdvanceMs` must be 0 in W1, W3, W4 (held-lane wake and change-during-run) and W5.

**Nothing on the decision path is stubbed.** Two seams are used:
- `evaluateRemoveSafety` is wrapped only to **interleave** a readiness flip after the real evaluation has returned (W3, W4-run), and to count evaluations (W5). The returned evaluation is untouched.
- The wake sink is not stubbed. REMOVE_REPLICA is observed at the message router.

## 3. Coverage

| Group | Cells | Axes |
|---|---|---|
| W1 | 4 | partition (2) × deferring node {peer, owner} |
| W2 | 4 | same |
| W3 no publication / unheard publication / BR1 | 4 + 4 + 4 | same |
| W4 held-lane wake | 4 | same |
| W4 fallback into a held lane | 4 | same |
| W4 change during the woken run | 2 | partition; peer and owner both placeholders, the second flip inside the woken run |
| W5 unsafe wake | 4 | partition × deferring node |
| W5 duplicate and stale wakes | 4 | same |
| W6 | 2 × 27 | partition × every profile combination of the remaining voters |

## 4. Red and green

The columns are the property groups. `k/n` is the number of red tests in the group; P means all passed.

| Head | W1 | W2 | W3 none | W3 unheard | W3 BR1 | W4 held | W4 fallback-held | W4 run | W5 unsafe | W5 dup | W6 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `102e127c4` (pre-wake) | 4/4 | P | 4/4 | 4/4 | 4/4 | 4/4 | 4/4 | 2/2 | 4/4 | 4/4 | P |
| `527771405` (wake) | P | P | P | P | P | P | P | P | P | P | P |

- `527771405` is 40 of 40 green, 5 of 5 runs.
- On `102e127c4`, W1 shows the lab's sequence: a deferral on the system-floor placeholder, then a publication for the deferring node, then no progress at 0 ms of fallback. The fallback fire into a held lane is lost (W4, BR2a).
- W2 and W6 are green on both heads, as they should be. The backstop and the safety verdict existed before the wake.
- W5 is red before the wake because its non-vacuity anchors need a wake: an evaluation after the publication, and progress after the flip.

My lease-verdict witnesses (11) also stay green on `527771405`.

## 5. Mutation families

Each family was planted in a scratch copy of `527771405`, one per semantic route. Cells show red tests per group.

| Id | Semantic route | Plant | W1 | W2 | W3 none | W3 unheard | W3 BR1 | W4 held | W4 fb-held | W4 run | W5 unsafe | W5 dup | W6 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| N1 | no subscription | `ensureReadinessSubscription` never subscribes | 4/4 | P | P | P | 4/4 | 4/4 | P | 2/2 | 4/4 | 4/4 | P |
| N2 | recheck of an identity instead of the level | the level key is the node set only, blind to the answer (like an unchanged planning identity) | 4/4 | P | 4/4 | 4/4 | 4/4 | 4/4 | P | 2/2 | 4/4 | 4/4 | P |
| N3 | entry level captured late | capture moved after `evaluateRemoveSafety` | P | P | 4/4 | 4/4 | P | P | P | 2/2 | P | P | P |
| N4 | lane submit that joins and drops | the re-entry turn uses `operationWorkflowRunExclusive`, not the retained turn | P | P | P | P | P | P | 4/4 | P | P | P | P |
| N5 | no rerun-on-dirty | the wake loop runs once | P | P | P | P | P | P | P | 2/2 | P | P | P |
| N6 | global token dedupe | a publication whose `capturedToken.tokenKey` was seen before is ignored | 3/4 | P | P | P | 4/4 | 4/4 | P | 2/2 | 4/4 | 4/4 | P |
| N7 | node set too narrow | waiter nodes are source and target only (no replica rows) | 2/4 | P | 2/4 | 2/4 | 2/4 | 2/4 | P | 2/2 | 4/4 | 2/4 | P |
| N8 | wake treated as safe | the woken run's evaluation answers SAFE | P | P | P | P | P | P | P | 2/2 | 4/4 | P | P |
| N9 | fallback removed (backstop gone) | `scheduleDeferredSafetyRetry` never arms | P | P | P | P | P | P | 4/4 | P | P | P | P |

Every family is red on at least one witness. Some notes:
- **N3** is caught exactly by the lost-wakeup cells (W3 none and unheard) and the change-during-run cells.
- **N4** is caught only where the fallback meets a held lane. A publication wake into a held lane survives N4, because the wake's own loop re-submits while its waiter remains.
- **N5** is caught only by the change-during-run cells.
- **N6** shows 3/4 on W1 because the token set is process-global, and the first cell to see the token still wakes.
- **N7** is red on the peer-deferring cells only. Owner-deferring cells are covered by the target node id.
- **N8** is caught by the unsafe-wake cells. It is also caught by the change-during-run cells, where the woken run would otherwise defer on the owner's placeholder.
- **N9** is caught only by W4 fallback-held; see limit 2 for why W2 does not catch it.

## 6. Limits

1. **The readiness authority is a model, not the readiness owner.**
   - Its answers and its publication timing (one macrotask per publication, an unchanged token) follow the contract the wake relies on.
   - The real `ReadinessPlanningSnapshotOwner` queue, build variants (BR2b) and the lab's 3.1 s publication silence (lab §4c) are not exercised. That silence belongs to the readiness planning owner (R-3).
   - The owner-read planning answer is made to agree with the readiness levels (recovery projection = ready nodes other than the source). That choice is what makes the floor deferral read exactly "(2/3)".
2. **W2 is also satisfied by the owner's 250 ms observed-progress retry,** which the deferral arms alongside the 1 s safety fallback. W2 therefore shows that the owner's timers recover progress, not that this particular timer does. The 1 s fallback's own contribution is isolated by W4 fallback-held: there the 250 ms retry joins the held lane and is dropped, so only the retained-turn fallback recovers, and N9 is red there.
3. **Lane holders are modelled at the lane.** The held lane is taken through `operationWorkflowRunExclusive` on the operation's single-flight key, the entry `checkTimeouts`, the orphan reconcile and the target-progress re-entry all use. Those holders' own bodies are not run.
4. **The interleaving seam.** W3 and W4-run place the flip after the real evaluation returns, which is the widest pre-registration window. A flip between two individual readiness reads inside one evaluation is not separately enumerated. The capture-before-evaluation rule (N3) covers it by construction.
5. **The latency the lab measured is not asserted.** Neither the 2000 ms SLO nor the pre-ACTIVE target count is in scope. The multi-evaluation readiness-currency chain (F-d/R-3, about 3-4 deferring evaluations of 150-400 ms each on the slow hosts) is untouched. The lab estimates that R-2 alone does not guarantee 2000 ms on the slow hosts.
6. **Timer re-anchoring (lab §5.5) is not a property here.** The fallback is still armed at the first deferral and reused; the owner directive does not list re-anchoring. A coalesced fire is covered only through the retained turn (W4 fallback-held).
7. **L-a (lab §4a), the leaseless projection in the re-entry verdict, is untouched.** It belongs to the lease owner.
8. **Not in scope:** the checklist items of directive point 6 other than the wake. These are re-drive of an uncommitted removal, the membership wake, completion from committed membership, the planner guard, handoff retarget and restart recovery.

## 7. Files and reproduction

- `test/rebalancer/replace-remove-safety-wake-harness.js`: the owner scenario, the readiness authority and the fallback clock.
- `test/rebalancer/replace-remove-safety-wake-property.test.js`: W1-W6, 40 tests.
- To run: `node test/rebalancer/replace-remove-safety-wake-property.test.js`.
- Scratch-only drivers:
  - `mkvariant-sha.sh` (`git archive <sha> src`, read-only);
  - `mutate-wake.py` (N1-N9);
  - `run-variant.sh`;
  - results in `wake-all.txt`.

Gates (E0) are in §8.

## 8. Gates (E0)

- eslint: clean on both files.
- `npm run -s test:duplication`: OK.
- `check-fast-static`: ok, after `test:metadata:refresh`; the refreshed `test/shards/*.json` files were restored from HEAD.
- `test:unused:ratchet`: at most 1435.
