---
audience: development
documentClass: evidence
---

# DESIGN (read-only investigation): original-allocation preparation vs the lifecycle-owner boundary

Date 2026-10-24. Quest `retained-seed-original-handoff` (epic `raft-rs-full-cutover`).
Read at `/mnt/data/peter/projects/.worktrees/mg-delivery-resume-r2-20261023`, HEAD `deeef6b41c`
(`bed8c6354` is an ancestor). Nothing was edited. The only command run was the census itself,
which is read-only (`auditRaftRsOperationBoundary({root})`). It reports exactly two violations at HEAD:

- `src/raft/raft-rs-original-allocation-preparation.js` `lifecycle-owner-import-bypass` (this defect)
- `src/runtime/wasm-component-driver-consensus.js` `lifecycle-write-outside-owner` `retireReplica`
  (this is the separate census-owner defect, handled on work/wasm-committed-effects-shape-20261024; Quest log line 76)

Subtest 2 of `test/raft/raft-rs-backend/operation-port-boundary.test.js` asserts
`assert.deepEqual(violations, [])` (:172). It stays red until **both** violations are gone.

---

## 0. Headline findings

1. **Today the preparation does not take its incarnation from the lifecycle owner. It hands the
   owner one.** The incarnation comes from the declaration owner as `randomUUID()`
   (`src/bootstrap/seed-original-allocation-declaration.js:77`). It is then injected through
   `mintIncarnation: () => member.incarnation` (`raft-rs-original-allocation-preparation.js:56-58`).
   The approved contract draft has the opposite order: "The existing lifecycle owner prepares its row
   and stamps its exact incarnation before the native operation port can be published. The original
   issuer forms the complete declaration using those exact stamps"
   (`solve/quests/seed-release-failure-custody/evidence/retained-partial-seed-original-handoff-contract-draft-2026-10-21.md:81-83`).
2. **The approved pre-source input already asked for a new, bounded lifecycle operation, not a class
   import.** It reads: "A new bounded lifecycle operation must separate exact metadata preparation from
   native entry explicitly; merely invoking this port early violates the proposed pre-native boundary"
   (`evidence/issuance-serialization-input-2026-10-21.md:19`). The WIP 8b3638233 instead imported the
   whole class.
3. **There is a second, hidden lifecycle-row writer, and both census controls miss it.**
   `src/raft/raft-rs-original-allocation-store.js` issues
   `UPDATE ${TABLE}` against `_raft_rs_replica_lifecycle` at :67, :92 and :119, and `ALTER TABLE` at :58.
   `TABLE` is an imported alias (`:6`). Neither control sees it:
   - The census's `lifecycle-sql-outside-owner` rule (`raft-rs-operation-boundary-audit.js:373-380`)
     resolves only string constants declared locally (`stringConstants`, :201-220).
   - The test's "one production writer" regex `UPDATE\s+\$\{LIFECYCLE_TABLE\}`
     (`operation-port-boundary.test.js:182`) matches only that identifier name.

   The contract draft names the lifecycle owner as the **sole writer** of these allocation columns
   (contract draft :59-66). So this is the same R01 defect class as the import, only not yet measured.
4. **8b3638233 also inverted ownership of a constant.** The lifecycle owner now imports its own table
   name from the original-allocation constants: `raft-rs-replica-lifecycle-owner.js:14-17` imports from
   `raft-rs-original-allocation-constants.js:54`.
5. **The lead's ruling and the Quest constraint cannot both be met at the letter of the census.**
   - The constraint `prospective-existing-owner-authority` requires the complete immutable allocation
     and exact incarnations to be persisted, on existing lifecycle storage, before native effects.
   - The anchor declaration therefore lives on a lifecycle row (`COLUMN.DECLARATION`). At least one
     lifecycle row must be born before the first native effect.
   - That birth cannot go through the operation port, because port construction *is* native entry (§4a).
   - The census lets only `PORT_CONSTRUCTOR`, `LIFECYCLE_ADMIN` and two symbol-limited snapshot
     imports reach the owner (`raft-rs-operation-boundary-audit.js:333-341`, `:255-262`).

   So a correct design needs one of three things, which only the owner can choose between (§5):
   - a declared symbol-limited census entry, which **is** an allowance;
   - routing through the `PORT_CONSTRUCTOR` module, which is census-clean but launders the import;
   - a change to the constraint.

---

## 1. Operation trace today

Format: trigger → facts → permitted effect → durable commit → lost answer/restart → remaining obligation.

### 1.1 Trigger
- `bootstrap()` calls `await this.prepareOriginalSeedAttempt()` (`src/bootstrap/bootstrap-service-seed-workflow.js:490`).
- Public startup also does this: `awaitStartupAcquisition(bootstrapService.prepareOriginalSeedAttempt(), …)` (`src/lagrange-runtime-startup.js:438-439`).
- The single in-flight promise lives at `seed-original-allocation-startup.js:79-87`.
- `initializeOriginalSeedAttempt` (`:41-77`) does the following, in order:
  - measures the build (`:44-48`);
  - constructs `RaftRsOriginalAllocationPreparation` with directory custody (`:50-53`) and publishes custody (`:55`);
  - wires abort to `revoke` (`:56-60`);
  - reads any retained declaration on the anchor (`:63`). PRESENT leads to a classification HOLD (`:64-66`);
  - requires a FRESH_SEED membership outcome (`:67-69`);
  - calls `preparation.prepare(createSeedOriginalAllocation(...))` (`:70-72`).

### 1.2 Facts read and minted (declaration owner)
- `createSeedOriginalAllocation` (`seed-original-allocation-declaration.js:67-86`) mints, for each member: `peerId`, `incarnation: randomUUID()` (:77), `createdAt`, `createAttemptToken`, and the genesis `membership`.
- It also mints `allocationId` and `clusterId`, and fixes the anchor (SERVICES, first replica, :60-65). The result is deep-frozen.
- **This is the incarnation minting point.**

### 1.3 `prepare(declaration)` (`raft-rs-original-allocation-preparation.js:231-259`)
1. `validateOriginalSeedDeclaration` runs before any I/O (`:237`). It checks incarnation shape and uniqueness (declaration.js:143-153).
2. The virgin inventory runs over every member: no db, `-wal` or `-journal` file may exist (`:240`, `:36-46`).
3. For each member: `mkdir`, writable open under preparation custody (`:242-244`), then `formatOriginalMember` (`:48-65`):
   - Sets pragmas (`:49-50`).
   - **Commit point 1** is `commitDurably` (`:51-62`). It covers the peer-identity registry rows (`:52-53`) and **`new RaftRsReplicaLifecycleOwner({db, groupId, peerId, replicaIdentity, mintIncarnation: () => member.incarnation})`** (`:56-58`).
   - What the lifecycle owner does inside that commit:
     - `CREATE TABLE IF NOT EXISTS` (owner :121-135) and the column migration (owner :136, :85-93);
     - finds no row and no durable raft record (owner :137-155);
     - **INSERTs** the row as `active` with `incarnation = mintIncarnation()` (the declared value) and `native_history_state = NEVER_OPENED` (owner :156-163).
   - The preparation then only **reads** `lifecycle.active` and `lifecycle.incarnation` (owner :186-192, :242-244). It refuses on mismatch (`:59-61`).
   - The instance is discarded. It is never registered (`registerRuntimeLifecycle` is not called) and never used to `execute`, `retire`, `holdForReseed` or `recordOpeningHistory`. It is a full-capability object that exists for the length of one transaction.
   - `new RaftRsDurableStore(db)` (`:63`) creates the native-store tables.
   - **Commit point 2** is `prepareOriginalAllocationRow` (store :52-84). It ALTERs the five allocation columns onto the lifecycle table (:55-59), checks the exact row/incarnation/NEVER_OPENED/all-null state (:60-64), and **UPDATEs** the lifecycle row with the declaration, member, `ISSUE=PREPARING`, `SERVICE_RIGHT=UNUSED` and `IDENTITY_RIGHT` (UNUSED for the anchor, otherwise null) (:67-76). Commit plus readback follows (:31-50).
4. All members are re-verified (`:247-249`, `verifyMemberBinding` :67-93).
5. **Commit point 3 (issuance)** is `markOriginalAllocationIssued` on the anchor (store :86-107), a compare-and-swap from PREPARING to ISSUED.
6. All handles close (`#finishRead` :469-479). The mode becomes `LIVE_ISSUER` (`:257-258`).

Commit points 1 and 2 are separate SQLite commits on the same connection. There is no cross-database atomicity (`issuance-serialization-input-2026-10-21.md:15`).

### 1.4 Lost answer / restart
- **Crash before anchor ISSUED.** The anchor is either ABSENT or PREPARING.
  - PRESENT (anchor already formatted): `readDeclaration` returns PRESENT, which becomes `retainedClassificationHold` (startup :63-66).
  - ABSENT: `prepare` runs again, and the virgin inventory fails with `REASON.HISTORY` (prep :44).
  - Both fail closed, with no re-mint.
- **Throw after COMMIT.** Handled by `commitAndReadback` (store :31-50). An unknown outcome is never read as absence.

### 1.5 Handoff to the operation port (exact incarnation)
1. The phases call `admitOriginalSeedReplica`:
   - `seed-partitions-phase.js:212,227,260`
   - `seed-infrastructure-phase.js:330`
2. `preparation.admitReplica` (`:353-388`) returns frozen options carrying the opaque `originalAllocationOpening` (`:332-349`, WeakMap `:134`).
3. The service stores it (`partition-service-core-base.js:260-261`; `message-group-service-state.js:315-316`). It adds the field to the port request (`partition-service-core-base.js:447-453`; `message-group-service-state.js:335-339`).
4. `createRaftRsOperationPort` does the following:
   - `consumeOriginalAllocationOpening` (port :200-211, prep :150-171) runs the non-final validation: row binding, `ISSUE`, NEVER_OPENED, no durable record (prep :454-461).
   - The port builds the registry (:217-224) and the bootstrap (:225-231).
   - **The port constructs its own `RaftRsReplicaLifecycleOwner` with the default `randomUUID` mint** (port :232-234). The row already exists and is stamped, so no INSERT runs. `stampUnstampedRow` is a no-op because `incarnation IS NULL` is false (owner :97-102, :170).
   - **`lifecycleIncarnation = lifecycle.incarnation`** (port :249) reads the declared incarnation back.
   - `assertOriginalNativeEntry(lifecycle.incarnation)` (port :326) checks it equals `member.incarnation` (prep :160-170) at the final cut.
   - Only then does `createRuntimeDispatcher` run, which is native entry (port :327-328; runtime-owner :1862ff).
   - Registration happens at port :506.

So the exact handoff is: the declaration mints, the preparation stores the value through a throwaway lifecycle owner, and the port's lifecycle owner reads the same row back. One row-birth path exists for ordinary replicas (port :232). Original replicas use a second one (prep :56). Snapshot staging uses a third (`prepareReplicaLifecycleForSnapshot`, owner :370-386).

---

## 2. History: why 8b3638233 bypassed the owner

- 8b3638233 (2026-10-21 12:48) is a WIP preservation commit made with pre-commit **skipped**. Its message gives no rationale. Its diff adds the preparation with the class import already at the current shape, plus `raft-rs-original-allocation-store.js` and `-constants.js`. It changes the lifecycle owner only to import `REPLICA_LIFECYCLE_TABLE` from the new constants (owner diff :14-17).
- The surrounding Quest log:
  - Line 7 (07:47) approves only the bounded *design* contract d6da7d/505e52.
  - Line 8 (07:48): "Begin bounded implementation… Implement original allocation/preparation… exact existing-owner handoff/read path".
  - Line 9 (12:35) continues "at exact 8b3638233" with declaration and store corrections.

  No entry discusses the lifecycle-owner import, the census, or the deviation from contract-draft :81 or input :19.
- `lifecycle-census-correction-2026-10-21.md` concerns a different census (the native-retirement census, lab #624/#625). It does not cover this import.
- **Unknown:** whether any lab or static run between 8b3638233 and bed8c6354 executed `operation-port-boundary.test.js`. No Quest record before log line 76 mentions it. Pre-commit was skipped at the introducing commit. Whether impact-selected cones from the preparation include this test is not established here.
- **Inferred reason (marked as inference, not recorded).** The class constructor was the only existing code that births a lifecycle row. Its constructor `mintIncarnation` parameter (since ece15e4e1, 2026-10-05) let the declared value be injected. The only other narrow entry, `prepareReplicaLifecycleForSnapshot`, records ESTABLISHED history, and the input doc says it "cannot be reused to claim fresh genesis" (`issuance-serialization-input-2026-10-21.md:17`). The bounded new operation that input :19 asked for was not written.

---

## 3. Intent of the boundary rule

- The census statement (`raft-rs-operation-boundary-audit.js:251-254`) reads: "Symbol-limited boundary, not a file-wide lifecycle allowlist. Snapshot installation can request staging but cannot import the class, registration, retirement or general inspection controls… Namespace/dynamic/re-exports fail."
- The witnesses are `test/raft/snapshot-lifecycle-staging.test.js:99-135` and `operation-port-boundary.test.js:155-174`, `:176-191`.
- Owner doc comments:
  - The incarnation is "minted once, when the row is born… never replaced and never reused" (owner :31-36).
  - The runtime registry holds "one entry per opened runtime… never per logical name" (owner :43-55).
  - Retirement is reachable only for a *registered exact runtime* (owner :499-529).

**What the single path guarantees.**
- The class is the full capability: row birth with caller-chosen `mintIncarnation`, `execute`, `retire`, `holdForReseed`, `recordOpeningHistory` (which can flip NEVER_OPENED to ESTABLISHED), and `openingHistory`.
- Restricting the class to `PORT_CONSTRUCTOR` means only the port, the one native runtime owner, can hold that capability. It births ordinary rows with the owner's own `randomUUID` and registers the instance under its exact runtime (port :506).
- Every other consumer receives a single-purpose frozen result (the snapshot ops) or exact-runtime admin verbs (`LIFECYCLE_ADMIN`, only for the node remove coordinator).

**What a second constructor breaks, stated precisely.**
- It does **not** break SQL-level exactly-once minting per row. That is enforced inside the class: INSERT only when the row is absent and no durable record exists (owner :142-163); a stamp only when `incarnation IS NULL` (owner :97-102); PK/UNIQUE constraints (owner :132-133). The port's later construction does not re-mint (§1.5).
- It breaks three other things:
  - **R01/R03, value ownership.** The incarnation is the lifecycle owner's knowledge, per its own comment and per contract-draft :81. Today a consumer chooses it and supplies it to the owner through an injection hook. The owner records what it is told instead of being asked.
  - **Static confinement.** The preparation module now statically holds `retire`, `holdForReseed` and `recordOpeningHistory` on an unregistered instance, outside the exact-runtime registry. The census exists to make "this module cannot do that" a checked fact, not a review claim. Present code calls none of those methods (prep :56-61), but nothing enforces that.
  - **R13 (secondary).** A live owner instance with retirement capability exists with no named lifetime and no registration, bound to a handle owned by `RaftRsPreparationCustody`. Today its life is confined to one synchronous transaction. The risk is future reuse, not a present leak.

---

## 4. Design options

Two independent choices are mixed together here:
- **Axis W**: what the lifecycle owner exposes and owns.
- **Axis R**: how the preparation reaches it.

Options (a)–(d) map onto these axes as described.

### (a) The preparation consumes the operation port's own lifecycle (port first)
- **Changes:** the preparation would construct (or obtain) the member's port before or while formatting.
- **Feasibility: not feasible as stated.**
  - Port construction is native entry: it calls `createRuntimeDispatcher` unconditionally when the lifecycle is active (port :250, :327-328). `DEFER_ELECTION` only defers scheduling (port :516-518).
  - The port needs service-owned callbacks: timing, `sendToPeer`, `applyCommittedEntry`, `resolvePeerAddress` (port :188-190, :262-276).
  - The cohort invariant requires every member row PREPARING and the anchor ISSUED **before the first** native effect. A port for member 1 would open native before member 2 exists.
  - `issuance-serialization-input-2026-10-21.md:19` states this already.
- **Only variant:** a new "metadata-only" port mode with no dispatcher. That is a second port construction path (R11), and it would still register a runtime (port :506) for a never-opened replica.
- **Verdict:** reject.

### (b) The lifecycle owner exports a symbol-limited original-preparation function, with the preparation as declared caller
- **Changes:**
  - Lifecycle owner: add, for example, `prepareReplicaLifecycleForOriginalAllocation({db, groupId, peerId, replicaIdentity, incarnation})`. It returns a frozen `{outcome, reason, detail:{incarnation}}`.
    - It births only on an absent row with no durable raft record.
    - It refuses an existing row in any state, identity conflict, or a non-string or empty incarnation.
    - It requires the caller's open transaction, mirroring `recordOpeningHistory` (owner :224-227). Calling `commitDurably` inside would nest, and nested transactions are rejected (input :15). The registry and birth stay in prep :51-62's single commit.
    - It returns no class instance and never records ESTABLISHED.
  - Preparation: `import {prepareReplicaLifecycleForOriginalAllocation}` replaces the class import.
  - Census: add a third symbol-limited entry next to `isSnapshotStagingImport` (audit :255-262), plus the symbol table in a test like `snapshot-lifecycle-staging.test.js:99-135`.
- **Honest classification: this is a census allowance.** It is the same mechanism as both snapshot entries:
  - `prepareReplicaLifecycleForSnapshot`: eb7af113a, 2026-10-12, Quest `snapshot-lifecycle-staging-boundary`.
  - `inspectReplicaLifecycleForSnapshot`: 7d91de9ff, 2026-10-12.
- **Why the snapshot precedent was accepted** (`solve/epics/raft-rs-full-cutover/ownership-audit-disposition-20261012.md:91-110`; design text in `scripts/quest-evidence/run-ownership-audit-20261012.py:128-146`):
  - It is a *new narrow operation in the existing lifecycle owner*.
  - The owner keeps identity, incarnation, row creation and refusal.
  - "No class instance, live runtime, registry entry or retirement capability crosses the seam."
  - The caller must consume refusal.
  - "Exactly the static named staging symbol at the snapshot consumer, not a file-wide lifecycle allowlist."
  - It was recorded as "static confinement, not a claim of protection against arbitrary trusted-host code."
- **Same thing or not?** Structurally yes: one symbol, one named caller, a frozen result, no class.
- **Differences the lead should weigh:**
  1. In the snapshot op, the owner normally mints (default `randomUUID`) and the caller only *retains* an already-existing receiver incarnation (owner :371-379). Here the caller *supplies a new* incarnation, which is the R03 question of §5 Q2.
  2. That would make three allowances. A pattern of growing symbol entries is itself a signal that the census lacks an "owner operation" concept.
- **Invariants kept:**
  - Immutable allocation is persisted before native effects (unchanged ordering).
  - The exact incarnation handoff is unchanged: the port reads the same row (§1.5).
  - No duplicate minting: there is one INSERT, inside the owner, absent-row-only.
- **Risks:**
  - Allowance creep.
  - Keeping the caller-supplied incarnation leaves the R03 inversion in place unless the owner mints (see W2 below).
- **Witnesses (red first):**
  1. The real-tree census has no `lifecycle-owner-import-bypass` for the preparation. This is red today. Assert it filtered to the preparation file, because subtest 2's full `[]` also depends on the wasm fix.
  2. A symbol table: named and aliased accepted only at `raft-rs-original-allocation-preparation.js`. Class, mixed, namespace, dynamic, re-export, a different caller, and the snapshot symbol at the preparation are all rejected.
  3. Owner behaviour:
     - births NEVER_OPENED with the exact value;
     - refuses existing active, retired and mismatched rows;
     - refuses a durable record without a row;
     - refuses outside a transaction;
     - the result is frozen and exposes no methods.
  4. A source-only revert to the class import restores the violation.
  5. Existing original opening, custody and effect-cut tests stay green: `test/raft/raft-rs-original-opening*.test.js`, `raft-rs-original-allocation-preparation.test.js`, `raft-rs-original-allocation-custody.test.js`, `raft-rs-original-allocation-cold-inspection.test.js`, `test/bootstrap/seed-retained-effects-preparation.test.js`.
  6. A negative: tamper the row incarnation between prepare and port, and the port refuses IDENTITY before the dispatcher (prep :162).

### (c) Move the incarnation-minting (and the allocation writes) into the lifecycle owner; the preparation passes immutable facts in
This is the Axis W answer. Alone it does not solve reach. It needs (b)'s reach or (d1)'s.
- **W1 (minimal):** the lifecycle op from (b) births the row with the declared incarnation.
- **W2 (owner mints, per contract-draft :81):**
  - The op births with the owner's own `randomUUID` and returns the incarnation.
  - The declaration owner then completes the declaration from those stamps. This splits `createSeedOriginalAllocation` and `validateOriginalSeedDeclaration`: validate everything except the incarnations before I/O, birth all members, then form and validate the complete frozen declaration, then write the declaration columns.
  - Restart behaviour stays fail-closed: born NEVER_OPENED rows without a declaration on the anchor mean ABSENT, and re-prepare fails the virgin inventory with HOLD (prep :240, :44).
  - It removes the `mintIncarnation` injection from the original path. That constructor hook would then serve only the snapshot path and tests (store test :24).
- **W3 (R01-complete):**
  - Move `prepareOriginalAllocationRow`, `markOriginalAllocationIssued`, `transitionOriginalRight` and the column ALTER (store :52-127) into the lifecycle owner as owner-defined operations. This makes the owner the sole writer the contract table names (contract draft :59-66).
  - Move `REPLICA_LIFECYCLE_TABLE` ownership back to the lifecycle owner (finding 4).
  - Make the cold reads go through `readDurableReplicaLifecycle`, extended as contract draft :104-107 says, rather than raw `SELECT *` in the preparation (prep :215-220) and store (:9-17).
  - Note: `transitionOriginalRight` has no `src` caller today. Only the store test and its export reference it.
- **Invariants:**
  - All of (b)'s.
  - W3 also restores the "one production writer" invariant, which test 3 intends but cannot see.
- **Risks:**
  - W2 changes the reviewed declaration/validation order and needs independent design review, since it touches the approved d6da7d contract implementation.
  - W3 grows the lifecycle owner (687 lines; file-size and complexity ratchets) and widens this Quest's diff.
- **Witnesses (red first):**
  - Strengthen the census `lifecycle-sql-outside-owner` rule to resolve imported string constants. Also make test 3 match any lifecycle-table alias. Both are red today on store :58, :67, :92, :119. This is a census-*strengthening*, not an allowance.
  - Owner-op unit cases: PREPARING compare-and-swap, ISSUED compare-and-swap, monotonic rights, thrown-after-commit readback. These can be ported from `test/raft/raft-rs-original-allocation-store.test.js`.
  - For W2: the declaration's incarnations equal the owner-returned stamps, and a declaration supplied with incarnations is refused.

### (d) Other shapes found in the owners
- **(d1) Route through the `PORT_CONSTRUCTOR` module (census-clean).**
  - Precedent: `raft-rs-operation-port.js` already re-exports a non-port, non-dispatching runtime-owner function, `verifyRaftRsBinding` (port :520-525), because "the runtime owner is private to this constructor".
  - The port module could export a frozen `prepareOriginalReplicaLifecycle` wrapper over a lifecycle op.
  - Constraint: the port already imports the preparation (port :20). The preparation must not import the port, because cycles are strict at 0 (`scripts/check-circular-dependencies.js`, `BASELINE_CYCLE_GROUP_COUNT = 0`). The startup composition (`seed-original-allocation-startup.js`) would import it and inject it into `new RaftRsOriginalAllocationPreparation({...})`.
  - **Assessment: this launders the import.**
    - The census stays unchanged, but its guarantee weakens: the capability reaches whoever the composition hands it to, and no static check sees that.
    - The precedent is weaker too: `verifyRaftRsBinding` is a read-only verdict, while this is a durable row birth.
    - It also makes the port module the owner of original-row birth (R01 drift).
  - Not recommended. It is listed because it is the only census-unchanged route.
- **(d2) Route through `LIFECYCLE_ADMIN`.** Admin is importable only by `replica-handler-remove-execution-methods.js` (audit :327-332), so this is also a census change. Its verbs are exact-runtime, and the preparation has no runtime. Reject.
- **(d3) Let the port birth every original row from the opening's declared member; the preparation writes only the anchor.**
  - The anchor row itself still needs a pre-native birth, so the boundary problem remains for the anchor.
  - Cold inspection requires every member's row binding (prep :95-128).
  - It loses the "all PREPARING before ISSUED" cohort property.
  - Reject.
- **(d4) Change the constraint**, for example to allow the declaration to live outside lifecycle storage. This is explicitly forbidden: "no second database" (quest.json constraint 1; insight plan §7). Owner-only, and not recommended.

### Recommendation
**(c)-W1 now, with W3's census strengthening as its witness, reached by (b), stated openly as one declared symbol-limited census entry under the snapshot precedent.** W3 (move the store writes into the owner) and W2 (owner-minted incarnation) are owner decisions (Q2, Q3).

Reasons:
- **R01:** only the lifecycle owner births rows. The class, and with it the retire, hold and opening-history capabilities, stays confined to the port.
- **R03:** the preparation asks the owner for a typed frozen outcome instead of instantiating the owner and reading its internals. W2 would complete R03 for the incarnation value itself.
- **R11:** there is one original row-birth path inside the owner, refusal is typed (frozen CORE_REFUSED), and there is no metadata-only port mode.
- **R13:** no owner instance escapes. The handle stays with `RaftRsPreparationCustody`.
- **Why not (d1):** it satisfies the letter of the lead's ruling while defeating the census's purpose. That is exactly the "re-derive locally / alternate path" the rules forbid (R01 "on conflict", R11).
- **The ruling.** If the lead's "no census allowance" ruling is absolute, then no option satisfies the constraint, the census letter and the census intent at the same time. That is the decision to escalate (Q1). It cannot be resolved by the implementer.

---

## 5. Open questions for the owner (human)

- **Q1.** Does "no census allowance" exclude a single declared symbol-limited lifecycle-owner operation for the preparation (option b), given the two accepted snapshot precedents (eb7af113a, 7d91de9ff; disposition :91-110)? If yes, the choices are (d1) laundering (not recommended) or changing the constraint (d4). The current constraint, "exact incarnations before native effects, on existing lifecycle storage", requires a pre-native row birth outside the port.
- **Q2.** Who mints the original incarnation?
  - The declaration owner, as today (declaration.js:77).
  - The lifecycle owner, as the approved contract draft :81-83 says.

  The implementation deviates from the reviewed contract, and no record approves the deviation.
- **Q3.** Is moving the five allocation-column writes and the ALTER (store :52-127) into the lifecycle owner in this Quest's scope? The contract table names the lifecycle owner as sole writer, and test 3 intends a single writer. Or should it be a separate unit?
- **Q4.** Should the census blind spot for imported table-name constants (audit :201-220, :373-380; test :182) be fixed by the census owner here? Or should it go to a separate unit like the wasm `retireReplica` hit on work/wasm-committed-effects-shape-20261024?
- **Q5.** Should `REPLICA_LIFECYCLE_TABLE` move back to lifecycle-owner ownership, reversing the constant inversion from 8b3638233 (owner :14-17)?
- **Q6 (unknown, factual).** Did any run between 8b3638233 and bed8c6354 execute `operation-port-boundary.test.js`? If none did, the gate that should have caught a pre-commit-skipped WIP import does not run in the lab selection for these paths. That is a process gap for the systemic-enforcement list.
