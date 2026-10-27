---
audience: development
documentClass: planning
---

# INVESTIGATION: `original-allocation-directory-custody-unavailable` vs cluster O (2026-10-25)

Read-only. Lineage head `17e9fd9ab` (detached scratch worktree of
`mg-delivery-resume-r2-20261023`; `124c749ae` is an ancestor, and no relevant src/test differs).
Nothing in any repository worktree was edited. One probe ran from the scratchpad, gated on
thermal headroom: `ocluster/tools/probe-owner.mjs`. The census parser is `ocluster/tools/census.py`
and its outputs are `ocluster/census-{head,base}.json` and `ocluster/census-table.txt`.

## 0. Answer in five lines

1. "Directory custody" is the **process data-directory owner**: an exclusive SQLite transaction on
   `<dataDir>/.lagrange-data-directory-owner.sqlite`. It is not an allocation record. Production
   acquires it in `acquireLagrangeRuntime` and threads it to the seed. `:395` checks that the
   preparation was handed that exact live handle. The two tests build `BootstrapService` through
   `createVirginSeedBootstrapService`, which never acquires or passes it. Custody is therefore
   **never granted**. The custody directory exists; nothing is untransferred or unactivated.
2. This is the **same cluster O, sub-signature O1**. It is not an independent production gate. On
   the harness path O1 fires first and **masks** O3 (`assertOriginalSeedContinuation`). Supply the
   owner and the same seed reaches O3 at `seed-partitions-phase.js:388`. This was measured.
   Production never hits O1; it always hits O3.
3. Census on the composed-head lab log:
   - 140 composed reds: **58** in the O family (36 DIR, 11 AUTHORITY, 7 CONTINUATION, 4 O4 delegate
     drift). That is 54 by reason string alone.
   - 161 base reds: **55** (34 / 11 / 7 / 3 O4).
   - No file carries both DIR and CONTINUATION.
4. On a **fresh (virgin) seed** the missing lineage work is **protected activation plus durable
   transfer**. Classification and two-start recovery belong to the retained (second-start) path
   only. Even the complete Quest `retained-seed-original-handoff` ends in typed
   `HANDOFF_COMPLETE_SERVING_DEFERRED`, never `success:true`. Fresh-seed serving success is an
   obligation no sealed Quest owns.
5. There is a harness gap (O1, O2, O4), but closing it only converts those reds to O3. The fixture
   to consume is the production `acquireDataDirectoryProcessOwner`
   (`src/storage/data-directory-process-owner.js:33`), together with the production entry
   `prepareOriginalSeedAttempt`.

## 1. Mechanism (file:line at 17e9fd9ab)

### 1.1 What `:395` checks
`src/raft/raft-rs-original-allocation-preparation.js:390-397`:
```js
#assertCurrent() {
  if (this.#closed) throw originalAllocationError(REASON.CLOSED);
  if (!ownsDataDirectoryProcessOwner(this.#directoryOwner, this.#dataDir)) {
    throw originalAllocationError(REASON.DIRECTORY);          // :395
  }
}
```
- `REASON.DIRECTORY` = `'original-allocation-directory-custody-unavailable'`
  (`raft-rs-original-allocation-constants.js:22`). The code is `ORIGINAL_ALLOCATION_HOLD` (`:55-60`).
- `ownsDataDirectoryProcessOwner(owner, dataDir)` (`src/storage/data-directory-process-owner.js:70-74`)
  is true only for an object registered in the module-private WeakMap `dataDirectoryOwnerHandles`
  (`:8`, set at `:67`). It also requires that object's SQLite handle to be `open` and `inTransaction`,
  with the same canonical dataDir. A copied object or path cannot stand in for it. `null` is always false.
- It runs:
  - in the constructor, `:191` (`this.assertCurrent()`), before any inventory, mkdir or open;
  - again on every later step: `readDeclaration`, `prepare`, `inspect`, `openingFor`, `admitReplica`,
    the opening-validation cut, `#finishRead`.

  So custody must be held across the whole attempt, not only at its start.

### 1.2 Who grants it, which durable record, when
- **Owner:** the data-directory process owner (`src/storage/data-directory-process-owner.js`).
- **Durable record:** none. It is a live resource: `BEGIN EXCLUSIVE` on
  `.lagrange-data-directory-owner.sqlite` (`:10-16`, `:33-68`), held until `release()` or process death.
- **When:**
  - In `acquireLagrangeRuntime`, right after `DataDirectoryManager.initialize()`, at
    `src/lagrange-runtime-startup.js:719-723`. Its release is deferred on the cleanup ledger with
    `requiresSuccessfulCleanup`.
  - It is passed to `startSeedNode` at `:769`, then into `new BootstrapService({... dataDirectoryProcessOwner})`
    at `:427`, and stored at `src/bootstrap/bootstrap-service.js:238` (`|| null`).
  - The startup then calls `prepareOriginalSeedAttempt()` explicitly (`lagrange-runtime-startup.js:438-439`).
- **Consumer:** `initializeOriginalSeedAttempt`, `src/bootstrap/seed-original-allocation-startup.js:50-53`:
  `new RaftRsOriginalAllocationPreparation({directoryOwner: service.dataDirectoryProcessOwner, ...})`.

This is not the replica-lifecycle row (`_raft_rs_replica_lifecycle`, allocation columns). Those are
the durable allocation facts that `prepare()` writes later (`preparation.js:231-259`). They are what
the custody check protects.

### 1.3 The seed path from the two tests
- `test/integration/convergence-control-snapshot.integration.test.js:127-138` and
  `test/integration/preflight-critical-path-hops.integration.test.js:178-197` both call
  `createVirginSeedBootstrapService(...)`, then `bootstrapService.bootstrap()`.
- `createVirginSeedBootstrapService` is at `test/integration/helpers/cluster-test-helpers.js:261-312`:
  - It makes a mkdtemp dataDir and a duck-typed manager.
  - It reads the production storage admission and the membership outcome.
  - It then calls `new BootstrapService({...options, bootIncarnation, nodeId, nodeAddress, dataDir,
    dataDirectoryManager, startupServicesAdmission, membershipOwnerOutcome})` (`:297-305`).
  - **It never calls `acquireDataDirectoryProcessOwner`.** Unless the caller passes one, and neither
    test does, `dataDirectoryProcessOwner` is `null`.
- The rest of the path:
  - `bootstrap()` → `await this.prepareOriginalSeedAttempt()` (`src/bootstrap/bootstrap-service-seed-workflow.js:490`)
  - → `seed-original-allocation-startup.js:79-86`
  - → `initializeOriginalSeedAttempt` (`:41`). Build provenance is MEASURED, so `:46` passes.
  - → `new RaftRsOriginalAllocationPreparation` (`:50`)
  - → constructor `:191` → `assertCurrent` `:195` → `#assertCurrent` `:395`.
- The failure is caught by `handleBootstrapFailure` (`seed-workflow.js:515-516`), giving
  `{success:false}` at `phase: "not_started"`. This leaf is "seed bootstrap should succeed".
- The stack in `scratchpad/runs/124c749ae-convergence-control-snapshot.log:7` matches frame for frame.
- **Verdict on the three hypotheses:**
  - It is not "custody directory never created": the dataDir exists, and the lock file is simply
    never opened.
  - It is not "created but not transferred/activated": nothing exists to transfer.
  - It is **custody never acquired, because the fixture does not compose the production directory owner.**
    The lifecycle owner is not involved. The refusal happens before any lifecycle row exists.

## 2. Relationship to cluster O / `assertOriginalSeedContinuation`

Both gates are on the production path, and both landed reachable from `bootstrap()` in the same
commit (§3). They are ordered:

| Order on a cold virgin seed | Gate | Where | Fires on |
|---|---|---|---|
| 1 | build provenance | `seed-original-allocation-startup.js:46-48` | not observed |
| 2 | **directory custody (O1)** | `preparation.js:191→395` | harness only (owner `null`) |
| 3 | retained declaration → classification HOLD | `startup.js:63-66` | second start only |
| 4 | FRESH_SEED membership authority | `startup.js:67-69` | harness when `membershipOwnerOutcome` is absent |
| 5 | `prepare()` virgin issuance (LIVE_ISSUER) | `preparation.js:231-259` | passes when 2 passes |
| 6 | admission requires `deferElection === true` | `preparation.js:375-377` | passes on the seed phases |
| 7 | **continuation hold (O3)** | first at `seed-partitions-phase.js:388` (`startDeferredBootstrapReplicaElections`) → `startup.js:111` | production, always |
| 7' | later O3 sites | `seed-registration-phase.js:107,653`, `bootstrap-service-runtime-methods.js:299,339`, `seed-workflow.js:217` | not reached |
| — | O2 (phases entered without `prepareOriginalSeedAttempt`) | `startup.js:37` via `bootstrap-service-runtime-methods.js:51` | harness only (sim host, direct-phase tests) |

**Measured** with `ocluster/tools/probe-owner.mjs`. The probe uses the same fixture, the same
`initializeTestEnvironment` and a fresh dataDir:
- With no owner: `original-allocation-directory-custody-unavailable` at `preparation.js:395:13`
  ← `:191` ← `startup.js:50` ← `seed-workflow.js:490`.
- With `dataDirectoryProcessOwner: acquireDataDirectoryProcessOwner(dataDir)` passed through the
  fixture's `...options`: `original-handoff-continuation-unavailable` at `startup.js:111:9`
  ← `seed-partitions-phase.js:388:7` ← `phasePartitions` `:187` ← `seed-workflow.js:556`.
  - So `prepare()` succeeded and native queueing ran. Only the WIP hold stopped it.

The relationship, exactly: O1 is a **harness-composition gap in front of** the intentional O3 hold.
- It is not a second production root.
- No production seed can hit O1, because `lagrange-runtime-startup.js:719,769,427` always supplies the owner.
- The one other production-reachable constructor path is `BootstrapService.bootstrapOrExit`
  (`bootstrap-service.js:709-711`). It builds without an owner and would always O1. It has **no
  callers** in `src`, `bin` or `scripts`. It is a dead alternate entry: a deletion finding under the
  no-legacy directive.
- This matches the lead's clustering (`CLUSTERING-lineage-base-reds-2026-10-24.md:76-108,389-399`):
  "supplying an owner only moves these files to O3".

## 3. History
- `0cdf38556` (2026-10-16): the process-directory owner retains custody after a failed cleanup.
  The owner module itself dates from 0.2.6 `1aea11baf`.
- `8b3638233` (2026-10-21, WIP, pre-commit skipped):
  - adds `RaftRsOriginalAllocationPreparation` with `#assertCurrent`'s `ownsDataDirectoryProcessOwner`
    check (pickaxe: the first commit containing `ownsDataDirectoryProcessOwner(this.#directoryOwner`);
  - adds `ownsDataDirectoryProcessOwner` to `data-directory-process-owner.js`;
  - adds the DIRECTORY reason.

  `BootstrapService` did not yet reach it.
- `7fa4d79ae` (2026-10-22, "wip: own original seed startup lifetime through native construction"),
  in one commit:
  - `seed-workflow.js`: `+ await this.prepareOriginalSeedAttempt()` in `bootstrap()`. **This makes O1
    reachable from every hand-built BootstrapService.**
  - `seed-workflow.js`: `+ this.assertOriginalSeedContinuation()` in `completeSuccessfulBootstrap`.
  - `bootstrap-service.js`: `+ this.dataDirectoryProcessOwner = options.dataDirectoryProcessOwner || null`.
  - `lagrange-runtime-startup.js`: production threading of the owner.
  - new `seed-original-allocation-startup.js` with the unconditional `:111` throw (pickaxe: the only
    commit that adds it).

  The commit message says: "Elections, ordinary registration and startup success remain held."
  The fixture `cluster-test-helpers.js` was not updated. Its last touches are `406ceac1c`, `0374d903f`
  and the PR merges. The commit's own witness `test/bootstrap/seed-original-attempt-lifetime.test.js`
  acquires the owner (`:47,93`) and asserts that a null owner refuses DIRECTORY before any original
  work (`:368-383`). So the refusal is designed, and only the shared fixture lags.
- `68633168e`: retained-effects observation (`observeRetainedEffects`, classification HOLD at
  `startup.js:15-27`). It does not touch the custody gate.

## 4. Census

Source: the composed-head lab log `compose/lab-composed-124c749ae.log` (adams-gamla, 1906 files).
Each file's output block is attributed from its `ok|not ok test/<file>` line to the next one.

Reasons grepped:
- **DIR** = `original-allocation-directory-custody-unavailable`
- **CONT** = `original-handoff-continuation-unavailable`
- **AUTH** = `original-allocation-authority-unavailable`
- **O4** = `(assertOriginalSeedAttempt|admitOriginalSeedReplica|assertOriginalSeedContinuation) is not a function`

The base column re-runs the same parser on the base lab log
`ratchet-src/lab-tv-dator-base-1.log` (head 3d011667c).

| List | Total | DIR | CONT | AUTH | O4 (delegate drift) | O family | Other reds | ok at 124c749ae | not in log |
|---|---|---|---|---|---|---|---|---|---|
| `ratchet-src/lab-base-reds-files.txt` (161 test files + 2 `test-output/` fixtures) | 163 | 34 | 7 | 11 | 3 | **55** | 79 | 27 | 2 |
| same list, on the base log | 163 | 34 | 7 | 11 | – | 52 | – | – | 2 |
| `compose/reds-composed-2.txt` | 140 | **36** | **7** | **11** | **4** | **58** (54 by reason string) | 82 | 0 | 0 |

Hits by reason string alone: DIR 277, CONT 39, AUTH 33.

**No file has both DIR and CONT**: each file stops at its first gate.
The six composed-only reds: two are DIR (convergence-control-snapshot, preflight-critical-path-hops);
one is O4 (core-system-logic-runtime-witness, `assertOriginalSeedContinuation is not a function`);
three are the row-shape diff, which is not O.

- **DIR (36):**
  - bootstrap: epoch-manager-lifecycle, bootstrap-sequence, websocket-server-reentry,
    fresh-join-registration-runtime-replacement, fresh-join-via-non-seed-node,
    node-bootstrap-consistency.property, phase-failure-handling.property (112 hits),
    seed-release-failure-custody
  - cdc: current-epoch-propagation
  - integration: admin-cdc-propagation, cdc-propagation, concurrent-join-message-group-assignment,
    control-plane-rebalance, **convergence-control-snapshot**, create-table-partition-provisioning,
    critical-partition-learner-safety, critical-replica-placement-causal-trace,
    insert-or-ignore-raft-replay, leader-metadata-validation, managed-split-admission-reliability,
    membership-consistency, message-group-membership-claim-cache, multi-node-raft-replication,
    node-join-replica-activation, node-joining-rebalance, **preflight-critical-path-hops**,
    raft-leader-election, replica-operations-owner-read-transport-readiness,
    seed-migration-cutover-persisted, seed-migration-process-loss, seed-node-bootstrap,
    seed-owner-read-diagnosis, single-node-default-replica-count-writes,
    sql-engine-system-writes-contract, three-node-seed-rebalance
  - raft: raft-rs-backend/single-path-partition-cutover
- **CONT (7), all production `startLagrangeRuntime` users or the lane witness:**
  bootstrap/retained-seed-original-handoff, managed-split-writes-after-cutover,
  pgwire-command-tag-real-engine, public-application-database-multinode,
  public-application-database-transaction-facade, public-binding-cell-invocation-seam,
  public-consumer-contract-ratchet. The lead counted 4 on base; the 3 public-application/consumer
  files are added here.
- **AUTH (11, `startup.js:37`):** 9 simulation formation-* files, which go through
  `test/simulation/formation-sim-production-seed-host.js:336`'s `new BootstrapService` with no owner,
  no membership outcome and no `prepareOriginalSeedAttempt`. Plus bootstrap/lifecycle-owner-replica-routing
  and bootstrap/production-scheduling-defaults (direct `initializeUnifiedLifecycleOwners`, from
  `seed-infrastructure-phase.js:266`).
- **O4 (4):** seed-infrastructure-phase, seed-infrastructure-runtime-identity,
  seed-message-group-founder-open-refusal, control-plane/core-system-logic-runtime-witness.
  These are hand-written delegate maps or seed hosts restating `buildPhaseExecutionDelegates`
  (`bootstrap-service-seed-delegates.js:72`).
- The `tapCaught` "object is not extensible" noise appears in 56 files. It is a symptom of a frozen
  HOLD rejection, not a cause, so it is not counted.

## 5. Intended production design for a cold seed's original allocation

Sources:
- The relocated contract draft `seed-release-failure-custody/evidence/retained-partial-seed-original-handoff-contract-draft-2026-10-21.md`
  (read from `a8905df35^`; it is cited by `retained-seed-original-handoff/design.md`).
- `quest.json` statement and constraints.
- The epic `raft-rs-full-cutover.md:99-112`.
- `HANDOVER-2026-10-24-r2-preservation.md:206-209,352-354`.

- **Fresh (virgin) seed (LIVE_ISSUER).**
  - The startup membership owner admits FRESH_SEED, and the storage owner admits virgin storage.
  - The seed creation interaction prepares one immutable allocation in the existing lifecycle rows
    before any native opening. This is implemented: `prepare()`, with anchor ISSUED and all rights UNUSED.
  - Members then open natively only by consuming their opening (implemented,
    `consumeOriginalAllocationOpening`, `preparation.js:150-171`).
  - Contract :217-218: "Every original seed registration submission must pass consumption first,
    including fresh startup."
    - The SERVICES birth right goes UNUSED→SUBMITTED before the single INSERT, and to TRANSFERRED on
      an exact committed read.
    - The reserved cluster-id CONFIG publication goes the same way (contract :241-248).
  - Contract :255-257: public admission stays closed "until ordinary first startup handoff".
  - Contract :126: "Original uninterrupted fresh opening still follows the existing atomic
    bootstrap/history contract".
- **Retained (second start, COLD_RECOVERY).**
  - Requires classification of the retained history: `startup.js:63-66` always HOLDs today, and
    `inspect()` exists with no startup caller.
  - Then protected re-activation, the same durable transfer, and composed two-start proof.
  - The completed Quest ends `HANDOFF_COMPLETE_SERVING_DEFERRED` (`ORIGINAL_ALLOCATION.DEFERRED`,
    `constants.js:17`), never serving success.

**Which step is missing for a cold virgin seed:**
- **(i) Protected activation.** `startDeferredBootstrapReplicaElections` (`seed-partitions-phase.js:386-388`)
  and the non-deferred `startElection` sites (`:338`, `seed-message-groups-phase.js:231`) are
  hard-held. Native open is already guarded by the opening capability.
- **(ii) Durable transfer.**
  - `transitionOriginalRight` (`src/raft/raft-rs-original-allocation-store.js:109-127`) exists but has
    **no src caller**.
  - `SeedRegistrationPhase.phaseRegistration` (`seed-registration-phase.js:105-107`) and
    `ensureSystemTableWriter` (`:651-653`) are hard-held instead of consuming the SERVICES and
    identity rights.
  - Nothing yet consumes `IDENTITY_RIGHT` for the cluster-id CONFIG write.
- **(iii)** The public-admission fence consumed by BootstrapAPI, `startWebSocketServer` and
  `openExternalTransportAdmission`. These are held today at `bootstrap-service-runtime-methods.js:299,339`.

Classification and two-start recovery are **not** needed for a virgin seed. They gate only the
PRESENT-declaration path (`startup.js:64-66`).

**Smallest owner-shaped unit (fresh-seed continuation):**
- Replace the unconditional `assertOriginalSeedContinuation` throw (`startup.js:106-112`) with a
  decision by the preparation owner keyed on its opening mode.
  - **LIVE_ISSUER:** admit deferred elections only for admitted openings.
  - **COLD_RECOVERY or any other state:** keep the HOLD exactly as today.
- Route each original SERVICES INSERT and the anchor's cluster-id CONFIG INSERT in `SeedRegistrationPhase`
  through one owner operation:
  - UNUSED→SUBMITTED, durably, before the submission;
  - SUBMITTED→TRANSFERRED on an exact committed same-value read;
  - a lost answer is resolved by exact read in the same live owner;
  - absence or timeout never re-arms the INSERT.
- Admit `completeSuccessfulBootstrap` and public admission only when every declared right is
  TRANSFERRED (one startup admission decision consumed by the existing ingress owners).
- This keeps fail-closed intact:
  - retained, partial, SUBMITTED-on-cold and unknown states still HOLD;
  - native entry still needs the exact opening;
  - nothing reads a filename or checkpoint as authority.

**Decision-free vs Q1–Q5-dependent:**

Q1–Q5 (`DESIGN-original-allocation-lifecycle-owner-boundary-2026-10-24.md` §5) are about how
**`prepare()` births the lifecycle row and who writes the allocation columns**. They are orthogonal
to the continuation gate.

| Part | Depends on |
|---|---|
| Harness: the fixture acquires and releases the production directory owner; the sim host and direct-phase tests enter through `prepareOriginalSeedAttempt`; delegate doubles consume `buildPhaseExecutionDelegates` (§6) | none |
| The mode-keyed continuation decision (LIVE_ISSUER admits activation; COLD_RECOVERY holds) | none of Q1–Q5. Needs the Quest's own pre-source correspondence approval (constraint `pre-source-correspondence-and-review`) |
| The public-admission fence consumption | none of Q1–Q5. Same approval |
| Where the right-transition writer lives (`transitionOriginalRight` in the store, or a lifecycle-owner operation as sole writer) | **Q3**. Also **Q4**: the census blind spot means a store-side `UPDATE ${TABLE}` is invisible to the boundary census and the test-3 regex, so the witness shape depends on it |
| The constant's home (`REPLICA_LIFECYCLE_TABLE`) | **Q5**, cosmetic for this unit |
| Incarnation minting order (declaration vs lifecycle owner) | **Q2**. It changes `prepare()`, not the continuation. The continuation reads incarnations only through `verifyMemberBinding` |
| How `prepare()` reaches row birth | **Q1**. Independent; `operation-port-boundary.test.js` subtest 2 stays red until Q1 and the wasm fix land |

**Scope decision outside Q1–Q5 (owner):**
- The sealed Quest covers the **retained** handoff and ends serving-deferred. Its contract says
  "The earlier full startup and serving obligation remains unsatisfied" (contract :29-31).
- No sealed Quest owns fresh-seed continuation to `success:true`. Someone must decide whether that
  becomes a new Quest or an amendment.
- Until then, every O-family red stays red by design. That covers 54 of the 140 by reason string,
  58 counting O4.

## 6. Harness or fixture gap vs production
- **There is a gap, and it is masking only.**
  - **O1:** `createVirginSeedBootstrapService` (`test/integration/helpers/cluster-test-helpers.js:261-312`)
    should consume `acquireDataDirectoryProcessOwner(dataDir)` (`src/storage/data-directory-process-owner.js:33`)
    when the caller supplies none, and release it after `shutdown()`. Its `bindOwnedVirginSeedDataDirectoryCleanup`
    (`:242-252`) is the existing seam. This mirrors production's `cleanupLedger.defer(release)` and
    `bindDataDirectoryProcessOwner`, and the lane witness `seed-original-attempt-lifetime.test.js:47,71,93`.
    A fixture-owned owner must be released **before** `rmSync`.
  - **O2:** `test/simulation/formation-sim-production-seed-host.js:336-350` should take the same owner
    and the production membership outcome (the virgin fixture's `resolveAutoRejoinStartupDecision`),
    and enter `prepareOriginalSeedAttempt` before the runner. Direct-phase tests should do the same.
  - **O4:** hand-written delegate maps and seed hosts should consume `buildPhaseExecutionDelegates`
    (`bootstrap-service-seed-delegates.js:72`), not restate it.
- **Effect:**
  - Measured for O1 on this fixture: those reds become O3 (`seed-partitions-phase.js:388`). None
    turn green.
  - Inferred, not measured, for O2 and O4.
  - The value of the fixture fix is to make the 36+11+4 files report the **real** production first
    divergence, and to stop them reporting a fixture artifact.
  - Do not weaken `:395` or default the owner inside src. The null-owner refusal is a sealed witness
    (`seed-original-attempt-lifetime.test.js:368`).

## 7. Unknowns
- Which O1 and O2 files would go green, versus hit later non-O failures, once O3 is lifted. This
  cannot be measured while O3 holds. The lead's P cluster (fresh partition CLOSED until RESUME) is
  a likely next gate for writes.
- Whether the BootstrapAPI public-admission fence (contract :252-266) has any existing consumer on
  this lineage. Not traced.
- Whether fresh-seed continuation is meant to share the retained Quest's receipts, or needs its own
  Quest and seal (owner).
- O5 and O? files (bootstrap-sequence `getDataDir` null at `startup.js:49`;
  dynamic-partition-cdc-subscription; the process-custody and seed-migration child files) were not
  re-traced beyond the census.
- The 27 base-list files now ok at head were not attributed to a fixing commit.
