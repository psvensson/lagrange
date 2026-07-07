# Design: CDC non-termination fix (persist/mutation write path)

Quest: `formation-ledger-self-move-blocks-cluster-ops`. Follows
`diagnose-legA-run1-settle-stall.md` (binding root) and
`pin-run1-readback-nonconfirmation.md` (Leg A's read-source fix, already shipped
as `06496039`).

Artifact re-analysed: fresh `data/examples/service-data-affinity-demo/node-{0..4}.log`
(span `06:34:52Z -> 06:47:35Z`, 136 `No row found for CDC update`, matches the
diagnosis exactly) **plus** the on-disk read-only SQLite partition DBs
(`node-*/partitions/replica_operations-p1/*.db`,
`node-*/partitions/storage_reservations-p1/*.db`). The disk state is decisive and
**revises the single-root story in the diagnosis** — see §0.

---

## 0. Headline correction (grounded in on-disk DB state)

I queried the four stuck ops in every surviving `replica_operations-p1` ledger
replica (r2 on node-0, r4 on node-4, r5 on node-2, r6 on node-1):

| op | type / partition | durable ledger state (ALL 4 replicas identical) |
|---|---|---|
| `812932a2` | REPLACE `sql_write_operations-p1` | `pending / SENDING / completed_at=NULL` |
| `26c60ea9` | ADD ratings | `pending / PENDING / completed_at=NULL` |
| `fb9aedc3` | ADD ratings | `active / ACTIVE / completed_at=NULL` |
| `3d863303` | ADD ratings | `active / ACTIVE / completed_at=NULL` |

**Two facts overturn the "post-churn inter-replica divergence" framing for the end
state:**

1. All four rows are **identical across r2/r4/r5/r6** — there is NO surviving
   inter-replica divergence in the final ledger. The replicas AGREE. (The
   `No row found for CDC update` witnesses were *transient* mid-run hydration
   misses; the lagging replica later hydrated the INSERT, so the end state is
   consistent-but-stale, not split.)
2. The three ratings ADDs' `No row found for CDC update` fires on
   **`storage_reservations-p1-r1`**, NOT `replica_operations`. Their
   `replica_operations` CDC fetches all succeed (no `No row found`). The diagnosis
   attributed their stall to `replica_operations` CDC divergence; the logs+disk say
   otherwise.

So the four residuals are **three distinct mechanisms**, not one. Only `812932a2`
is genuinely a `replica_operations` mutation-persistence failure. A fix confined to
`replica-operation-repository-mutation-persistence-methods.js` will terminalize
`812932a2` (the `[1/4]` blocker) but will **not** green `[2/4]` on its own — the two
other arms need their own (small) changes. I state all three with anchors.

---

## 1. Per-op arm table (exact arm each op traverses)

| op | binding arm | why it never terminalizes | evidence |
|---|---|---|---|
| `812932a2` | **Arm 2** — `persistOperationUpdate` `!result.success` → `resolveFailedOperationUpdateResult` (lines 208-209 → 256-272) | The progress UPDATE (→`CREATING`) is a **distributed/2PC write**; participant `replica_operations-p1-r4` had not hydrated the row → `No row found for CDC update` → `Failed to update system table row: Distributed operation failed due to participant failures` → `result.success=false`. `recoverPersistedReplicaOperationMutation` reads OWNER_LOCAL_ONLY, local copy also lacks the fresh row → not visibility-satisfied → returns false → **throws** → `Deferred retryable replica operation transition failure` re-armed 32× to shutdown. Arm 2 **never re-inserts/repairs on a divergence-shaped participant failure.** | `Failed to persist operation error=Distributed operation failed due to participant failures` ×2 (06:36:31.959, 06:36:32.598); 32× `Deferred retryable ... transition failure workflowStep=CREATING`; disk = `SENDING/NULL` |
| `26c60ea9` | **confirm/return-true arm** (NOT the zero-change gap) | `Operation completed` **logged** at 06:39:41.607 → `transitionCommitted===true` → `persistOperationUpdate` **returned true** (proof: `operation-workflow-transition-persistence.js:315-320` only logs completion when committed). Yet the durable ledger row is `PENDING/NULL` on **all** replicas — the terminal (and even the pending→creating progress) UPDATE **never durably landed**. No persist-failure, no reinsert, no divergence log for this op. The gateway UPDATE reported success (changeCount>0 / recovered) against a local/cache copy, `confirmPersistedOperationUpdate` recorded a witness and returned true, but the write was lost below the persistence layer. Downstream, dispatch re-drives forever on `Cache update not observed for replica operation 26c60ea9` (REPLICA_OPERATION_VISIBILITY_LAG). | disk = `PENDING/NULL` all replicas; 46× `Deferred replica operation dispatch ... Cache update not observed`; 0 persist-fail / 0 reinsert |
| `fb9aedc3` | **reservation-orphan-release arm** (outside persistence-methods) | Reached `ACTIVE` durably. The storage-reservation reconcile op-visibility read (`getReservationOperationVisibilityObservation` → `getOperationByIdVisibilityObservation(..., requireOwnerRpcRead:false)`, no owner-RPC escalation) transiently mis-read the op as **absent** → `ABSENT_OPERATION` → `RELEASE_ACTIVE` → `Released orphan storage reservation during reconciliation` (06:40:11.762) → op abandoned before its completion transition ever ran. The `No row found` here is the *release write* to `storage_reservations-p1-r1`, a side effect. | steps pending→creating→syncing→active(dispatch_already_exists); then orphan-release; disk = `ACTIVE/NULL`; NO `Operation completed` |
| `3d863303` | same as `fb9aedc3` | same premature-orphan-release; orphan-released 06:40:13.636 | disk = `ACTIVE/NULL`; NO `Operation completed` |

### Resolving the `26c60ea9` paradox the task posed

The task offered four candidate causes. Disk + log evidence rules them out one by
one:

- **(a) `shouldRejectConflictingTerminalTransitionMutation` short-circuit** →
  ruled out: that path returns `false` (rejects) and `Operation completed` would
  never log. Also it only rejects on a *different terminal* authoritative row; the
  authoritative row was `PENDING`, not a rival terminal.
- **(b) zero-change terminal, stale non-terminal `authoritativeOperation`, skip
  reinsert, return false** → ruled out: that returns `false` →
  `transitionCommitted===false` → **no `Operation completed` log**. But the log
  fired. So `persistOperationUpdate` did NOT return via the zero-change arm.
- **(c) reinsert routes to the same diverged replica** → ruled out: no
  `OPERATION_ROW_DIVERGENCE_REINSERT` log fired at all this run (the CL-017(b)
  reinsert was never reached for any op).
- **(d) failure in confirmation, not the write** → **closest, but sharpened**: the
  write *reported* success (changeCount>0 or recovered) so `confirmPersistedOperationUpdate`
  ran and returned true unconditionally, but the write was **not durable** at the
  ledger (all replicas `PENDING`). This is a **silent ledger write-loss** below the
  persistence layer (sql-routed single write acked without durable quorum
  replication — the `writeMode=sql-routed` class flagged in frontier memory), not a
  persistence-methods decision bug.

**Honest uncertainty:** I cannot pin from logs alone whether `26c60ea9`'s UPDATE
took the `changeCount>0`/`confirmPersistedOperationUpdate` branch or the
`recoveredAfterRetryableFailure===true` branch (line 211) — both return true and
leave no distinguishing log. The confirming check is a targeted trace/DT that
records the `result` object (`success`, `changeCount`, `recoveredAfterRetryableFailure`)
for the terminal UPDATE and asserts durable presence on a majority of ledger
replicas afterward. What IS certain: the row is `PENDING` on every replica while
`persistOperationUpdate` returned true — the write path lied about durability.

---

## 2. Enumerated minimal gaps (with verified anchors)

All line anchors verified against current HEAD source.

**Gap (i) — the line-223 non-guarded zero-change return-false.** Present in code
(`persistOperationUpdate`, `replica-operation-repository-mutation-persistence-methods.js:216-224`):
a non-terminal, non-expected-step UPDATE that matches 0 rows returns `false` with no
authority check / no repair. **Not exercised by any of the four ops this run** —
812932a2 fails at `!result.success` (arm 2) *before* the changeCount branch, and the
ratings ADDs return true. It is a latent gap but not a binding one here. Fixing it is
cheap and defensible but must not be sold as the demo fix.

**Gap (ii) — arm 2 does not repair a divergence-shaped participant failure**
(`resolveFailedOperationUpdateResult`, lines 256-272). This is the **binding gap for
`812932a2`** (`[1/4]`). When the distributed UPDATE fails because one participant
replica lacks the row (`No row found for CDC update` → participant failure), arm 2's
only recovery is `recoverPersistedReplicaOperationMutation` (OWNER_LOCAL_ONLY
visibility). On a genuine divergence the local copy also lacks the fresh row, so it
throws and defers forever. There is **no owner-RPC-escalated authority check and no
create-on-missing repair** on this path — the exact CL-017(b) move that the
zero-change arm already has, but arm 2 lacks.

**Gap (iii) — zero-change terminal with a truthy-but-stale non-terminal authoritative
row** (`resolveZeroChangeOperationUpdate`, lines 277-320). The reinsert is guarded by
`if (!authoritativeOperation)` (line 295). A diverged replica that has the INSERT but
not the terminal UPDATE returns a **truthy** row at an earlier step →
`isReplicaOperationVisibilitySatisfied` false (step mismatch) AND `!authoritativeOperation`
false → **neither reinserts nor re-drives the terminal write onto the authority** →
returns `false`. Latent; not exercised this run (no op reached this arm), but it is
the correct place to also handle "row present but stale" divergence, not only "row
absent."

**Gap (iv) — premature reservation orphan-release on a transient op-visibility miss**
(`rebalance-coordinator-reservation-lifecycle-methods.js:315-368`, decision at
441-482). This is the **binding gap for `fb9aedc3`/`3d863303`** (`[2/4]`).
`getReservationOperationVisibilityObservation` reads with `requireOwnerRpcRead:false`
and no `authoritativeReadMode`, so a lagging local read that misses the (present-on-disk)
ACTIVE row yields `operationVisible:false` → `ABSENT_OPERATION` → `RELEASE_ACTIVE`.
The op is abandoned before it can complete. The `DEFERRED_OPERATION_VISIBILITY` →
`KEEP_ACTIVE` guard exists but only fires when the read *returns a deferredOutcome*,
not when it silently returns null. **A false ABSENT must not release an active
reservation.**

**Gap (v) — silent ledger write-loss** (below persistence-methods, in the routed
mutation / CDC apply path). Binding gap for `26c60ea9` (`[2/4]`): a routed UPDATE
that reports success but does not durably replicate to a ledger quorum. Root not in
this file; anchor for follow-up: `partition-cdc-parameterized-sql.js:316-357`
(update-apply that no-ops as "No row found" when the target replica lacks the row)
and the routed-mutation write-mode / quorum-ack layer feeding it. Flagged, not
designed here.

---

## 3. Recommended minimal fix (REUSED / EXTENDED / NEW)

### 3a. Primary (this quest's scoped, binding fix): repair arm 2 on divergence — for `812932a2`

**EXTEND** `resolveFailedOperationUpdateResult`
(`replica-operation-repository-mutation-persistence-methods.js:256-272`) to run the
**same CL-017(b) authority-escalated create-on-missing** the zero-change terminal arm
already has, before it throws — but **only** when the escalated authority read proves
the row is genuinely missing from the partition that must hold it.

- **REUSED (no new machinery):**
  `queryReplicaOperationPersistenceAuthorityOperation` /
  `queryReplicaOperationPersistenceAuthorityObservation` (lines 383-444, Leg A's
  local-first → owner-RPC-preferred escalation), `isReplicaOperationVisibilitySatisfied`,
  `persistNewOperationUnlocked` (the OR-IGNORE idempotent re-insert), and the existing
  `isRetryableOperationPersistError` classifier.
- **EXTENDED:** arm 2 gains a divergence branch structurally identical to
  `resolveZeroChangeOperationUpdate`'s `!authoritativeOperation` block.

Change shape (pseudocode; do not edit files yet):

```
async resolveFailedOperationUpdateResult(operation, result) {
  const recovered = await this.recoverPersistedReplicaOperationMutation(operation, result);
  if (recovered) { this.syncIncompleteOperationObservation(operation); return true; }

  // NEW branch — only when the failure is the retryable divergence class
  // (participant "No row found" / distributed-participant-failure), not a
  // generic hard failure:
  if (this.isRetryableOperationPersistError(result)) {
    const authoritative =
      await this.queryReplicaOperationPersistenceAuthorityOperation(operation); // owner-RPC escalated
    if (this.isReplicaOperationVisibilitySatisfied(operation, authoritative)) {
      // write actually landed on the authority; treat as durable
      this.syncIncompleteOperationObservation(operation);
      return true;
    }
    if (!authoritative) {
      // genuine divergence: authority (owner-RPC) confirms the row is MISSING.
      // Re-materialise the owner's copy so the next UPDATE matches, instead of
      // throwing and deferring forever.
      this.logger.error(OPERATION_ROW_DIVERGENCE_REINSERT, {...});
      try {
        if (await this.persistNewOperationUnlocked(operation)) {
          this.syncIncompleteOperationObservation(operation);
          return true;
        }
      } catch (e) { /* fall through to throw */ }
    }
  }

  // unchanged: honest hard failure -> throw -> deferred retry
  const persistError = this.buildOperationPersistError(result);
  this.logger.error(PERSIST_FAILED, {...});
  throw persistError;
}
```

Rationale: this is the exact reuse map from frontier memory — EXTEND CL-017(b)
create-on-missing + reuse `c7a3bf19`/Leg A owner-RPC read. It only repairs when the
**owner-RPC-escalated** authority read proves the row missing; on a benign idempotent
no-op the authority read is visibility-satisfied → returns true without reinserting.

Also, while here, **close latent gap (i)** by giving the line-223 non-guarded
zero-change branch the same authority check (route it through
`resolveZeroChangeOperationUpdate` with `expectedWorkflowStep=null`, whose
`visibilitySatisfied`/`!authoritativeOperation` logic already does the right thing),
and **close gap (iii)** by extending `resolveZeroChangeOperationUpdate` so that a
truthy-but-stale non-terminal authoritative row on a divergent partition also repairs
(re-drive the write onto the authority) rather than returning `false`. These two are
in-file, cheap, and defensible, but should be landed as clearly-separate hunks and
NOT credited with greening the demo.

### 3b. Secondary (required to green `[2/4]`, adjacent files) — flagged, minimal

- **Gap (iv) / reservation orphan-release** — **EXTEND**
  `getReservationOperationVisibilityObservation`
  (`rebalance-coordinator-reservation-lifecycle-methods.js:315-335`) to escalate to
  the owner-RPC authority read (reuse the same
  `OWNER_RPC_PREFERRED_SQL_FALLBACK` mode Leg A wired) before concluding
  `operationVisible:false`. Equivalently, make the state table treat "authority read
  could not confirm presence" as `KEEP_ACTIVE`, not `RELEASE_ACTIVE` — an absent
  reservation must be proven by an authority read, symmetric to the persistence
  fix. A false ABSENT must never release an active reservation.
- **Gap (v) / silent ledger write-loss (`26c60ea9`)** — root is below persistence
  (`partition-cdc-parameterized-sql.js:316-357` + routed-mutation quorum-ack).
  Needs its own diagnosis: why does a routed UPDATE ack success while the durable
  state stays `PENDING` on all replicas? Do NOT try to paper over it in
  persistence-methods; a durability lie must be fixed where durability is claimed.

**Recommendation:** land 3a as this quest's fix (terminalizes `812932a2`, closes the
`[1/4]` binding gap, plus the two latent in-file gaps). Author sibling findings/quests
for gaps (iv) and (v) with the anchors above, because `[2/4]` will not clear without
them and they are genuinely different code paths.

---

## 4. Safety analysis

- **Resurrecting a legitimately-deleted (REMOVE-completed) row?** No — the reinsert
  fires only when the **owner-RPC-escalated** authority read returns `!authoritative`
  (genuinely missing). Leg A's `queryReplicaOperationPersistenceAuthorityObservation`
  already keeps local evidence when the escalated read is merely *unreachable*
  (lines 436-443: "authority unreachable ≠ row absent"), so an unreachable owner
  cannot masquerade as a missing row and trigger a spurious reinsert. A
  REMOVE-completed row is present-and-terminal on the authority → visibility check /
  terminal-conflict gate short-circuits, no reinsert.
- **Clobbering a concurrent different-terminal winner?** The terminal-conflict gate
  `shouldRejectConflictingTerminalTransitionMutation` (lines 326-341) runs *before*
  the write and already yields to a different durable terminal. The arm-2 reinsert
  re-materialises the owner's *own* projected row (OR-IGNORE idempotent,
  `persistNewOperationUnlocked` ignoreExisting:true) so it lands on its own id with
  zero changes if a row already exists — it cannot overwrite a rival terminal.
- **"Re-insert routes to the same diverged replica" (the ineffectiveness trap).**
  This is the real risk for `812932a2`. `persistNewOperationUnlocked` writes through
  the same gateway mutation, so if the INSERT re-routes to the same lagging r4
  participant it will fail the same 2PC. **Two mitigations, both reuse existing
  behaviour:** (1) the re-insert is OR-IGNORE idempotent and gated by an
  owner-RPC authority read, so it only fires once per genuine divergence and its
  success is judged by the authority, not the diverged local; (2) once the INSERT is
  re-materialised on the authority, the *next* scheduled progress UPDATE matches and
  advances — the fix breaks the immortality by making forward progress possible, not
  by guaranteeing the first re-insert wins. If in a DT the re-insert still routes to
  the diverged replica and no-ops, that is the signal that the fix must force the
  repair onto the **authority owner** (owner-RPC write / leader-pinned write), not
  the diverged local — the same escalation Leg A applied to reads must apply to this
  repair write. The DT below asserts durable presence on the authority, so it will
  catch this.
- **Idempotency / masking a genuine hard failure.** The new branch is gated by
  `isRetryableOperationPersistError(result)`; a non-retryable hard failure still
  falls through to `throw`. The authority-satisfied early-return only converts a
  false failure (write actually landed) into success — it never suppresses a real
  loss, because "landed" is proven by the authority read, not inferred from the
  failed local result.

---

## 5. DT plan (must move the BINDING observable)

**Target:** the arm-2 divergence-repair for `812932a2` (gap ii), through the **real**
`persistOperationUpdate` decision logic — not an injected fake.

**Model test to copy:** `test/rebalancer/replica-operation-confirmation-authority-read.test.js`
(Leg A's DT — it already stands up a repository whose local ledger copy diverges from
the owner-RPC authority and drives the real confirmation path). Reuse its harness for
the write path. Cross-check helpers in `replica-operation-insert-retry-idempotency.test.js`
(OR-IGNORE idempotent reinsert) and `replica-operations-single-writer.test.js`.

**Real seam to induce divergence (not an injected precondition the real path never
hits):** configure the gateway mutation so the distributed UPDATE for the op's
`replica_operations` row **fails with the retryable participant-failure /
`No row found` class** (one participant replica lacks the row) — i.e. return a
`result` with `success:false` carrying the retryable "distributed operation failed
due to participant failures" error, exactly as the live gateway did at 06:36:31 —
while the **owner-RPC authority read returns the row as genuinely MISSING** (the
divergent partition never got the INSERT). This drives the code into
`resolveFailedOperationUpdateResult` with the true-divergence shape.

**Assertions:**
1. `persistOperationUpdate(op, {})` (a non-terminal progress transition,
   `workflowStep=CREATING`, matching `812932a2`) returns **true** on the fixed head
   (repair) instead of **throwing** on unfixed head.
2. After the call, the operation row is **durably present on the authority** (assert
   via the owner-RPC/authority read the fix uses, or the ledger authority replica) —
   proving the reinsert materialised the row where the next UPDATE will match, NOT
   just on the diverged local. This guards against the "re-insert routes to the same
   diverged replica" trap: if the reinsert no-ops onto the diverged copy, this
   assertion fails.
3. **Red-on-revert:** on unfixed head, `persistOperationUpdate` throws
   `buildOperationPersistError` (PERSIST_FAILED) and the row remains missing on the
   authority — the test is RED. Run via
   `npm run dt:prove -- --test test/rebalancer/<new>.test.js --src src/rebalancer/replica-operation-repository-mutation-persistence-methods.js`.

**Anti-wrong-leg guard (per the `96a0917f` / `a9344058` precedent):** the DT must NOT
inject a synthetic `beginTransaction`/participant hold or a fabricated changeCount —
it must drive the real `executeReplicaOperationGatewayMutationWithRetry` →
`resolveFailedOperationUpdateResult` path with a gateway result of the *same shape*
the live run produced (`success:false`, retryable participant-failure error), and the
authority read must be the real `queryReplicaOperationPersistenceAuthorityObservation`
escalation. Assert on the durable authority row (the binding observable = the row the
next UPDATE and the drain query read), not on an internal boolean.

**Second DT (gap iv, for `[2/4]`):** in `test/rebalancer`, stand up an ACTIVE ADD op
whose reservation-reconcile op-visibility read transiently misses (lagging local read)
while the owner-RPC authority read returns the ACTIVE row; assert `reconcileReservations`
does **KEEP_ACTIVE** (no `RESERVATION_RECONCILE_ORPHAN`) on fixed head and RELEASE on
unfixed. Model on the reservation-lifecycle tests. (Author with the sibling gap-iv
fix.)

---

## 6. Summary of deliverable

- **Binding, in-scope fix:** EXTEND `resolveFailedOperationUpdateResult` (arm 2) with
  the CL-017(b) owner-RPC-escalated create-on-missing already present in the
  zero-change arm — terminalizes `812932a2`, the `[1/4]` blocker. Plus close latent
  in-file gaps (i) and (iii) as separate hunks.
- **Out-of-scope but required for `[2/4]`, flagged with anchors:** gap (iv)
  premature reservation orphan-release (`rebalance-coordinator-reservation-lifecycle-methods.js`)
  and gap (v) silent ledger write-loss (`partition-cdc-parameterized-sql.js` +
  routed-mutation quorum-ack) — different code paths; author sibling quests.
- The diagnosis's single "replica_operations post-churn divergence" root is
  **partially corrected**: end-state ledger replicas AGREE (no surviving
  divergence); the four residuals are three mechanisms; the ratings ADDs' `No row
  found` is on `storage_reservations`, not `replica_operations`.

Report path: `solve/changes/formation-ledger-self-move-blocks-cluster-ops/design-cdc-nontermination-fix.md`
