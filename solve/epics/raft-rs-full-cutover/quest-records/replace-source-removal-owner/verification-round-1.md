verdict: approve

# Final verification r1: replace-source-removal-owner (narrow lease verdict L1/L2)

- Candidate: worktree `.claude/worktrees/replace-owner`, branch `quest/replace-source-removal-owner`, head `f6a94997e`.
- production_sha = `bfbf7692e`. `git diff --name-only bfbf7692e..f6a94997e -- src/` is empty (verified).
- Production delta `b0fd15184..bfbf7692e` in `src/`: only `src/rebalancer/operation-owner-availability-policy.js` (verified; the other files are the unused-exports baseline, the debt inventory, the shard seal and the implementer's test).
- No repository edits and no git writes (`git status --short` is empty after every gate). Mutants and probes are in `verify-replace/{base,work}`.

## 1. Coverage completeness: no missing dimension

I derived each dimension from the code.

| Dimension | Derived from code | Covered by | Verdict |
|---|---|---|---|
| Verdict consumers | `resolveOperationDrainOwnerAvailability` has one consumer, `isPriorityRecoveryDrainOwnerUnavailable` (`operation-workflow-recovery-timeout.js:824-842`). It returns `.unavailable` only. No `src/` code reads `.state` or the `lease` payload. Three call sites: release evidence `recovery-timeout.js:898-899` (decision table `reconcile-shared.js:634-645`), stale-FAIL `recovery-drain.js:385-397`, re-entry `owner-priority-recovery-reentry.js:326-340`. | C1, C2, C3, K | complete |
| Entry points into call sites 1 and 2 | The periodic sweep `checkTimeouts` (`recovery-timeout.js:231-241`) and the dispatch-pending drain (`recovery-reconcile-dispatch-pending.js:793-817`). Both call the same `buildPriorityRecoveryOperationDrainReleaseEvidence`, `resolvePriorityRecoveryOperationDrainState` and `resolvePriorityRecoveryOperationDrainOwnerState`. | The sweep entry only | Not a new dimension, because the decision code is shared. See N1. |
| Lease state | `REPLICA_OPERATION_OWNER_LEASE_STATE` = {active, expired, unfenced}, plus the `>` boundary (`replica-operation-owner-lease.js:77`) | V1 enumeration closure, V2, boundary cells | complete |
| Holder attribution | `lease.ownerNodeId` = `operation.ownerNodeId ?? owner_node_id`. The `replica_operations` schema has no owner column (`system-table-runtime-schema-definitions.js:55-76`), and no `src/` code sets `ownerNodeId` on an operation (grep). The holder is always null in production. | V1 (none, owner, other, observer) | complete. Unreachable at callers, as the record's limit 1 states correctly. |
| Clock source | The verdict reads the owner clock `resolveTimeoutCheckNowMs()` (`recovery-timeout.js:166-172`). The stamp is `operation.updatedAt + TTL`, where `updatedAt` comes from `Date.now()` in `updateStep` (`transition-orchestration.js:384`). | M5 (verdict reads the ambient clock) | In production both are the same clock. See N3 for the harness mixed clock. |
| REPLACE phase | Release: `{ACTIVE, STOPPING}` plus SYNCING with the target ACTIVE (`step-policy.js:212-218`, `reconcile-shared.js:446-451`). Stale-FAIL: every `PRIORITY_RECOVERY_OPERATION_DRAIN_WORKFLOW_STEPS` = {PENDING, SENDING, CREATING, SYNCING, ACTIVE, STOPPING} (`step-policy.js:200-208`). | C1: 3 release phases. C2: 3 of the 6 stale steps. | A variant inside a modelled dimension: a generic-evidence defect, not a new round. See N2. |
| Operation type | Drain types {ADD, REPLACE, REMOVE} (`reconcile-shared.js:277-283`). The stale-FAIL and re-entry verdict calls do not branch on type before the verdict. | REPLACE only | Same as N2. Outside the claim, which is scoped to REPLACE, but it reaches the verdict. |
| Observer | Seed (third node), source node, owner. The owner gives `LOCAL_OR_UNKNOWN`. | seed and source in C1-C3; owner-local in V1 and K | complete |
| Non-priority REPLACE | The drain candidate requires `priorityControlPlane` (`recovery-timeout.js:558-575`), and the re-entry is driven by the priority snapshot. An ordinary REPLACE never reaches the verdict. | n/a | not reachable |
| Heuristic | ready or unready, driven through the readiness authority | all | complete. Throw and non-function branches are unchanged (limit 6). |

Result: no semantic dimension of L1 or L2 is missing. N2 is a variant inside the modelled phase and type dimension. It is non-blocking, because the timing class is the same (see §2d).

## 2. Attack on the production change

### a. Polarity against the contract and the callers
- The module header (`:13-21`) and the lease module header (`replica-operation-owner-lease.js:17-22`: "a live lease owned by ANOTHER node fences this node out — including the … drain owner-availability probe") both say that a live recorded-owner lease fences remote settlement.
- Every caller reads `unavailable === true` as permission to act remotely:
  - the release table requires `remoteOwnerUnavailable === true`;
  - the stale arm returns `REMOTE_SETTLE_ALLOWED`;
  - the re-entry skips when `ownerUnavailable === true`.
- `unavailable: false` for a live lease is therefore the fence. The polarity is consistent everywhere.

### b. L2 is byte-for-byte for reachable inputs
- On the non-fenced path the heuristic is invoked exactly once, through the same closure (same `partitionId`, dimension and participation kind).
- The payload is `{state, unavailable, lease}`, and `lease` comes from the same `resolveOperationOwnerLeaseState(operation, nowMs)` as at `b0fd15184`.
- Only two input classes differ from `b0fd15184`, and neither is reachable:
  1. A live lease attributed to a foreign holder now falls to the heuristic; before, it was fenced as unavailable. The holder is never set in production.
  2. A fractional-millisecond expiry in `(now, now+1)`. The old `readLiveLeaseExpiryMs` compared the unfloored value; the lease record floors it. Expiries are integers (`INTEGER` column, `Date.now()+30000`).

### c. Genuinely dead owner whose lease is still live: bounded, not a wedge
I ran a probe (`base/test/rebalancer/zz-verifier-dead-owner-temporal.probe.js`, scratch only).
- **Setup:** one remote coordinator; the owner is dead (the router NACKs or throws); the heuristic is unready; the lease is live at t=0; sweeps run at t=0, 15, 30 and 45 s on the owner clock.
- **Cells:** 3 phases × 2 observers × {release, stale} × {nack, throw}.
- **Result:** 24 of 24 cells hold during the live window and un-wedge on the first sweep after expiry (t=30 s: REMOVED for release, FAILED for stale). 48 of 48 assertions pass.

The un-wedge is level-triggered, so no hold latch outlives the lease.

### d. Can a non-owner write refresh the lease indefinitely? No
- Every stamp is `operation.updatedAt + 30000`:
  - `resolveOperationOwnerLeaseExpiryForPersist` (`lease.js:138-144`);
  - `buildReplicaOperationRow` and `buildReplicaOperationUpdateData` (`mutation-row-methods.js:43,70`);
  - `touchOperationOwnerLease` (`mutation-update-methods.js:248-256`).
- `ownerNodeId` there is only a non-null guard; the writer's `nodeId` is passed. This confirms the implementer's finding that whichever node writes the row stamps the lease.
- `operation.updatedAt` moves only on a step transition:
  - `updateStep` / commit (`transition-orchestration.js:320,367,491,701`);
  - the claim (`transition-persistence.js:110,121`);
  - terminal and fail writes (`:344-406`, `:493-559`);
  - a copy (`observed-state.js:105`).
- `updateStep` returns early when the step is unchanged (`:379`), and no transition returns to PENDING. A non-owner can therefore extend the lease at most once per step change, a finite and monotone sequence.
- The orphan-adoption touch re-stamps the old `updatedAt + TTL`, which is already expired. Adoption is limited to ordinary partitions.
- The default step budgets (PENDING/SENDING 30 s, CREATING 60 s, SYNCING at the priority cap of 60 s, STOPPING 60 s, ACTIVE 30 s) are all at least the 30 s TTL. So in production a stale step with a live lease needs `updatedAt > step entry`, and no code produces that today.

**Conclusion:** there is no permanent wedge. The worst case is the 30 s lease window plus the writer-versus-observer clock skew, per step transition. That is within the scope's stated acceptance.

### e. Does the causal witness show the SLO path is gone? Yes, for the claim's condition
K1 and K2 run a seed sweep at ACTIVE and at STOPPING against a live lease. They require:
- no settle by the seed;
- the history ACTIVE → STOPPING → REMOVED;
- exactly one REMOVE_REPLICA, sent by the owner with reason `replace_source_removal`;
- no seed removal;
- no other operation row.

On `b0fd15184` (M0) both K1 and K2 are red. Qualifications are in N4 and N5.

## 3. Mutation families (one per semantic route, planted in a scratch copy of the `f6a94997e` tree)

Columns:
- V1..C3 are the property-file tests 1-5;
- K1 and K2 are the causal tests;
- I is the implementer's `operation-ownership-lease-fencing` (numbers of the failing tests);
- S is `rebalance-coordinator-stopping-reconcile-cache-visibility` (the existing un-wedge anchors).

F means red.

| Id | Route | V1 | V2 | C1 | C2 | C3 | K1 | K2 | I | S |
|---|---|---|---|---|---|---|---|---|---|---|
| M0 | `b0fd15184` policy (pre-fix) | F | F | F | F | F | F | F | 3-9 | P |
| M1 | polarity reverted | F | F | F | F | F | F | F | 3-9 | P |
| M2a | release bypasses the verdict (raw heuristic) | P | P | F | P | P | F | P | 7 | P |
| M2b | stale-FAIL bypasses the verdict | P | P | P | F | P | P | P | 8 | P |
| M2c | re-entry bypasses the verdict | P | P | F | F | F | P | P | 9 | P |
| M3a | expired lease treated as live (the wedge) | F | F | F | F | F | P | P | 3,4,5,7,8,9 | P |
| M3b | lease boundary `>` → `>=` (shared lease record) | F | F | P | P | P | P | P | — | P |
| M3c | absent lease treated as live | F | P | F | F | F | P | P | 5,7,8,9 | F(4,5,6) |
| M4 | holder check dropped | F | P | P | P | P | P | P | 6 | P |
| M5 | verdict reads the ambient clock | F | F | F | F | F | F | P | 3,5,6,7,8,9 | P |
| V6 | unattributed live lease not the owner's (the production-reachable holder route) | F | F | F | F | F | F | P | 3,4,5,7,8,9 | P |
| V7 | holder compared to the observer, not the recorded owner | F | P | P | P | P | P | P | 6 | P |
| V8 | caller passes `Date.now()` instead of the owner clock | P | P | F | F | F | F | P | 7,8,9 | P |
| V9 | caller loses the recorded owner (null ⇒ LOCAL) | P | P | F | F | F | P | P | 4,7,8,9 | F(4,5,6) |
| V10 | live lease ignored entirely | F | F | F | F | F | F | P | 3-9 | P |
| V11 | heuristic consulted even when fenced | P | P | P | P | P | P | P | 5,6 | P |
| V12 | L2 `lease` payload dropped | P | P | P | P | P | P | P | 6 | P |
| V13 | fence only when the heuristic is unready (state differs, `unavailable` does not) | F | P | P | P | P | P | P | 5,6 | P |
| V14 | fenced verdict labelled HEURISTIC_AVAILABLE | F | P | P | P | P | P | P | 3,5,6 | P |

Checks against the evidence record's §7:
- M1-M5 reproduce the recorded columns exactly (V1..K2).
- "Only V1 catches M4" holds for the independent witnesses; implementer test 6 also catches it.
- M3b is caught only by V1 and V2, which confirms the anchor's purpose. The implementer's tests miss it.

On the survivors:
- V11 and V12 survive the independent evidence. Both are externally equivalent, since callers read only `.unavailable`, the heuristic is side-effect free for the decision, and the payload is unused. Both are declared in limit 6, and the implementer's tests kill them.
- V13 and V14 are state-only, externally equivalent, and killed by V1.

Every family is red somewhere, and each caller has a route that turns only it red (M2a, M2b, M2c).

## 4. Findings

There are no production violations and no missing dimensions. Non-blocking findings:

- **N1 (generic-evidence defect, entry-point census).** `evidence-lease-verdict.md` §2 lists the three verdict call sites, which is correct. It does not list the dispatch-pending drain (`operation-workflow-recovery-reconcile-dispatch-pending.js:793-817`) as a second entry into call sites 1 and 2.
  - Scenario: a dispatch-pending re-entry on the seed builds the same release evidence and owner state outside `checkTimeouts`.
  - The decision functions are shared, so behaviour is identical, and M2a and M2b would redden it too. This is not a new dimension.
- **N2 (generic-evidence defect, enumeration not imported).** C2 uses the hand-listed `REPLACE_PHASES` (`replace-owner-lease-verdict-harness.js:98-102`) and REPLACE only. The stale-FAIL route reaches all six `PRIORITY_RECOVERY_OPERATION_DRAIN_WORKFLOW_STEPS` and all three `PRIORITY_RECOVERY_OPERATION_DRAIN_OPERATION_TYPES`.
  - Scenario: a priority REPLACE at CREATING, or an ADD at PENDING, stale with a live lease now takes REMOTE_OWNER_REQUIRED or REARM instead of FAILED.
  - The timing assertion "every budget ≥ TTL" is checked only for three steps. At defaults all six steps satisfy it (PENDING/SENDING 30 s, CREATING 60 s), so the class is the same.
  - The assertion depends on configuration: with `rebalancer.pendingTimeoutMs < 30000`, a naturally live lease on a stale PENDING step defers the remote stale-FAIL until the lease expires (at most 30 s). That is bounded and consistent with L1.
  - Fix, if wanted: import both sets from their authorities in C2. No new round is needed.
- **N3 (harness-only, known mixed-clock class).** Transition stamps use `Date.now()` (`transition-orchestration.js:384`), while the verdict uses the owner's `timeSource`. `VirtualTimeSource` defaults to 0 (`src/time/time-source.js:86`).
  - Under a virtual clock, every lease stamped by a real owner write reads as live for decades of virtual time.
  - With the corrected polarity, a virtual-clock harness therefore holds such operations, where it used to settle them.
  - This is inert in production, where `RealTimeSource` is `Date.now()`. `test/convergence` is 59/59 green. Simulator and DT6 authors should know it.
- **N4 (lease renewal is weaker than H2 implies; A5 territory, excluded).**
  - `renewOperationOwnerLeaseAfterCommittedTransition` (`operation-workflow-owner-execution-lane.js:563`) has no caller, and no caller passes `renewOwnerLease: true`. Only the insert touch and the gateway UPDATE `data` (`buildReplicaOperationUpdateData`) stamp the lease. The raw-SQL fallback `UPDATE_OPERATION` does not.
  - A transition written through the SQL fallback therefore leaves the lease anchored at an earlier write. For a coordinator-created priority REPLACE, that can be the seed's insert.
  - The live-lease window at ACTIVE entry is then not guaranteed, and the SLO path returns through the heuristic (L2 or A5 behaviour, excluded by the scope).
  - In the causal witness, the owner's STOPPING write left the cached `lease_expires_at` unchanged (probe: `updated_at` 1790337411442, `lease_expires_at` 1000001029000). The STOPPING-phase fence therefore rests on the harness-stamped ACTIVE lease, not on an owner renewal.
  - The record's line "the live lease that its own ACTIVE write stamped" is inaccurate: the harness pre-stamps the row with the lease record's rule.
  - This changes nothing in L1 or L2, but if the A2 SLO run still shows the tail, check first whether the ACTIVE write took the SQL fallback.
- **N5 (known mechanism, new trigger, bounded).** During the at most 30 s live window, a dead owner's REPLACE takes the wake route (`recovery-drain.js:469`). A wake failure classified REJECT throws out of `wakeCoordinatorCreatedRemoteOwner` (`owner-handoff-state.js:326-336`) and out of the sequential sweep loop (`recovery-timeout.js:231-241`, no per-operation catch). That aborts the rest of that sweep; the timer catches it (`rebalance-coordinator-lifecycle.js:667-672`).
  - Scenario: two stuck priority operations, where the first has a dead live-leased owner; the second waits for the next tick for up to 30 s.
  - This is identical to today's (expired/absent lease, heuristic-ready) outcome, as the L1 relation encodes, so it is a known mechanism. It belongs to the epic, not here.
- **N6 (clock skew).** The live window is 30 s plus the writer-versus-observer clock skew, because the stamp is the writer's `Date.now()` and the verdict uses the observer's clock. This is bounded, the lease semantics are unchanged, and it is excluded by the scope.

## 5. Commands and results

- `git diff --name-only bfbf7692e..f6a94997e -- src/` → empty.
- `git diff --stat b0fd15184..bfbf7692e` → `src/` changes only `operation-owner-availability-policy.js`.
- Witnesses on the candidate (`node <file>`):
  - property 13/13;
  - causal 18/18;
  - `operation-ownership-lease-fencing` 198/198.
- Mutation driver `verify-replace/mutate.py` and `run-mutant.sh`: 19 mutants plus the NONE control (control green on all four files). The table is in §3; raw output is in `verify-replace/mutants.txt` and `mut-out/`.
- Dead-owner temporal probe: 48/48 (24 cells), after tolerating the sweep throw in N5. The first run without tolerance showed the NODE_UNREACHABLE throw.
- Causal clock probe (`zz-causal-clock.probe.js`): showed the STOPPING row lease was not renewed (N4). 18/18.
- `node scripts/checks/wait-for-thermal-headroom.js` before each batch: ok, CPU 58-64 C, NVMe 68 C.
- `node scripts/run-test-files.js --jobs=2 $(find test/rebalancer -name "*.test.js")` → total=233 pass=233 fail=0, assertions=9170.
- `node scripts/run-test-files.js --jobs=2 $(find test/convergence -name "*.test.js")` → total=59 pass=59 fail=0, assertions=1655.
- `npm run -s test:duplication` → OK, 791/791 clone groups.
- `node scripts/check-fast-static.js` → ok.
- `npm run -s audit:guidelines` → exit 0.
- `npx eslint` on the policy, the four test and harness files, and `scripts/check-unused-exports.js` → clean.
- `npm run -s test:complexity` → 1813/1813.
- `npm run -s test:complexity:cognitive` → 159/159.
- `npm run -s audit:file-size` → 27/27 source, 21/21 test.
- `npm run -s test:unused:ratchet` → 1435/1435.
- Not run, per the brief: node-join-convergence-slo, membership-consistency, seed-node-bootstrap, `test/bootstrap`, `test/integration`. These belong to the A2 gate.
