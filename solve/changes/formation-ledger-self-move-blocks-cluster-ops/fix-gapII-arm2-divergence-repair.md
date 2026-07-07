# Fix: gap (ii) — arm-2 failed-mutation divergence repair

Quest: `formation-ledger-self-move-blocks-cluster-ops`. Implements the primary,
in-scope leg from `design-cdc-nontermination-fix.md` (gap ii): the binding `[1/4]`
blocker `812932a2`.

## Mechanism (recap, grounded)

During cold formation the `sql_write_operations-p1` progress UPDATE for `812932a2`
is a distributed write; a participant replica (`replica_operations-p1-r4`) had not
yet hydrated the row → `No row found for CDC update` → `Distributed operation failed
due to participant failures` → `result.success=false`. Arm 2
(`resolveFailedOperationUpdateResult`) only recovered through
`recoverPersistedReplicaOperationMutation`, which reads `OWNER_LOCAL_ONLY`; on a
genuine divergence the local copy also lacked the fresh row → not visibility
satisfied → it **threw** → `Deferred retryable replica operation transition failure`
re-armed 32× to shutdown → the op never terminalized → the demo settle loop never
reached `inFlight===0` → `[1/4]` STALL.

Leg A (`06496039`) fixed the confirmation **read** path (`OWNER_LOCAL_ONLY` →
owner-RPC escalation) but only for the zero-change and terminal-repair arms. The
failed-mutation arm was still local-only.

## Change (REUSED / EXTENDED / NEW)

`src/rebalancer/replica-operation-repository-mutation-persistence-methods.js`:

- **EXTENDED** `resolveFailedOperationUpdateResult` (arm 2): after
  `recoverPersistedReplicaOperationMutation` fails, and **only** for a retryable
  persist error (`isRetryableOperationPersistError`), escalate to the owner-RPC
  authority via the shared helper below before throwing. A non-retryable hard
  failure is not eligible and still surfaces (throws) unchanged.
- **NEW (extracted, shared)** `recoverDivergedOperationUpdateThroughAuthority`:
  reads the authority local-first → owner-RPC (Leg A's
  `queryReplicaOperationPersistenceAuthorityOperation`). If the op is durably
  visible there → the write landed (minority participant lagged) → durable success.
  If the authority proves the row genuinely ABSENT (`!authoritativeOperation`) →
  re-insert the owner's OR-IGNORE-idempotent copy (`persistNewOperationUnlocked`)
  so a later UPDATE matches. This is the exact CL-017(b) create-on-missing logic the
  zero-change arm already had, now factored out.
- **REUSED (no new machinery):**
  `queryReplicaOperationPersistenceAuthorityOperation` (Leg A local-first→owner-RPC),
  `isReplicaOperationVisibilitySatisfied`, `persistNewOperationUnlocked`,
  `isRetryableOperationPersistError`, `syncIncompleteOperationObservation`.
- **DRY:** `resolveZeroChangeOperationUpdate` now delegates to the same shared
  helper (behavior-preserving: it previously did the identical
  satisfied-return-true / `!authoritative`-reinsert / else-false logic inline).

Scope discipline: this leg fixes ONLY the exercised binding gap (ii). The latent
gaps (i) line-223 non-guarded zero-change return-false and (iii) truthy-but-stale
authoritative row are NOT touched here (not exercised this run; would add speculative
behavior). Gaps (iv) reservation orphan-release and (v) routed-mutation write-loss
are routed to sibling quests `formation-reservation-reconcile-premature-orphan-release`
and `routed-mutation-silent-ledger-write-loss` — both are required to green `[2/4]`;
this leg alone is expected to clear `[1/4]`'s stuck op, not the whole demo.

## Safety analysis

- **Cannot resurrect a REMOVE-completed row:** the re-insert fires only on
  `!authoritativeOperation`. A REMOVE-completed row is present-and-terminal on the
  authority → truthy → no re-insert. Leg A's helper keeps local evidence when the
  escalated read is merely *unreachable* (authority-unreachable ≠ row-absent), so an
  unreachable owner cannot masquerade as missing.
- **Cannot clobber a rival terminal:** `persistNewOperationUnlocked` is OR-IGNORE
  idempotent (lands zero-change on an existing id), and the terminal-conflict gate
  `shouldRejectConflictingTerminalTransitionMutation` runs before the write.
- **Cannot mask a genuine hard failure:** gated by `isRetryableOperationPersistError`;
  a non-retryable failure still throws (proven by test 3).
- **Re-insert-routes-to-same-diverged-replica trap:** the recovery's success is
  judged by the owner-RPC authority read, not the diverged local. Test 2 asserts the
  re-inserted row becomes observable to the authority read (the binding observable =
  the row the next UPDATE and the drain query read), so a no-op re-insert onto the
  diverged copy would fail the test.

## Evidence

DT: `test/rebalancer/replica-operation-failed-update-divergence-repair.test.js`
(4 tests): (1) satisfied-authority recovery [matches `812932a2`], (2) genuine-missing
re-insert, (3) re-insert that no-ops onto the still-diverged replica while the
authority cannot confirm must NOT falsely succeed (locks the re-insert-routes-to-same-
diverged-replica trap — added after adversarial verification flagged that test 2 alone
did not stress it), (4) non-retryable hard failure still throws.

Adversarial verification (independent subagent, SHIP verdict): re-ran the 5-suite tap
set (339 pass/0 fail), eslint clean, and re-proved red-on-revert independently; checked
A behavior-preserving refactor (all 5 input cases equivalent), B retryable-gate excludes
hard failures, C no resurrection/clobber (grep confirms operation rows are NEVER deleted;
OR-IGNORE idempotent; terminal-conflict gate ordered before write), D authority-unreachable
keeps local evidence (no spurious reinsert), E success judged by authority not diverged
local, F correct `persistNewOperationUnlocked` (no lane re-entrancy, no infinite recursion),
G DT drives the real path with the live-matching failure shape. Its one non-blocking finding
(test 2 not stressing the no-op-reinsert trap) is now closed by test 3 above.

- Red-on-revert PROVEN via `npm run dt:prove` — GREEN with fix, RED on revert, GREEN
  on restore (artifact
  `solve/changes/dt-prove/replica-operation-failed-update-divergence-repair.test.js-2026-07-07T07-26-08-310Z.json`).
  On unfixed HEAD tests 1 & 2 throw `Distributed operation failed due to participant
  failures`; test 3 passes on both heads.
- Anti-wrong-leg: the DT drives the real `persistOperationUpdate` →
  `executeReplicaOperationGatewayMutationWithRetry` → `resolveFailedOperationUpdateResult`
  path with a gateway result of the same shape the live run produced
  (`success:false`, `deferRetry:true`, participant-failure error) and the real
  `queryReplicaOperationPersistenceAuthorityOperation` escalation — no injected
  `beginTransaction`/participant hold or fabricated changeCount.
- Regression: `test/rebalancer/` full sweep 5417 pass / 0 fail / 56 skip; the 6
  targeted persistence/idempotency/observation/confirmation suites 352 pass / 0 fail.
- eslint clean; file-size audit 0/144 (src) 0/60 (test); complexity ratchet OK.

## Next

Live-validate: re-run the affinity demo at the fixed HEAD; expect `812932a2` to
terminalize and `[1/4]` formation settle to no longer stall on it. `[2/4]` will still
stall until sibling gaps (iv)/(v) land.
