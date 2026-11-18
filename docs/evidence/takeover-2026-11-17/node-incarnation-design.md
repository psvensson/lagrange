---
audience: evidence
recorded: 2026-11-18
---

# Node life identity after a wiped data directory: one fact, one owner (fix K design)

2026-11-17. Fix-K agent. Worktree `lagrange-fix-k-incarnation-20261117` at `19a2134c5` (candidate `4b0c8ec1d` + #224-#226 + fixes A-G). Merge base with main: `49495f7e4`.

C = CONFIRMED (read in code, or run). P = PLAUSIBLE. Line numbers are at `19a2134c5`.

**Status: STOPPED after the analysis.** The fix is a redesign across:
- registration;
- the D-7 registration write;
- the endpoint authority;
- the cache merge;
- the transport;
- the replica lifecycle owners;
- startup;
- five rebalancer files that the placement-owner work also touches;
- the failure-repair owner.

No source or test file was changed.

## 1. Verdict

**Class: D4, node identity is not one fact (C).** Commits 8c7d59437, 4459f4fc5 and 27ad27e5c invent a second identity, `storageIncarnation`. It has:
- four storage places, one of them phantom;
- three coherence rules;
- three catch-to-default parsers;
- aliases.

To mint it, they re-stamp the boot incarnation onto about nine live owners after startup has handed it out. That breaks the owner's F1 rule: reserve before use, never reuse.

**The underlying requirement is real (C), but narrow.** The commits address two defects on main:
1. **R1, incarnation reuse after a wipe.** The `BootIncarnationOwner` is monotonic per data directory (`src/bootstrap/boot-incarnation-owner.js:13-41`). A wiped directory reserves 1 again. Suppose the cluster's NODES row for the same `node_id` is also at 1. The D-7 write then classifies the registration as `CURRENT` (`src/control-plane/owners/node-registration-incarnation-write.js:84-90, 194-200`) and treats it as an idempotent same-life retry. Life 2 inherits life 1's row, lease, endpoint rows and write identities (`registrationWriteSubject` keys on `(node, incarnation)`, `:159-171`). That violates the BINDING Round-4 invariant "G1 work never affects G2 through logical-name reuse". If the cluster row is newer (above 1), main already refuses `REFUSED_STALE`, raises the floor and starts a new lifecycle (`src/entrypoint-runtime-join-startup-policy.js:127-133`). Only the equal case is open.
2. **R2, stranded replica claims after a wipe.** A wiped joiner starts `FRESH_JOIN`. Nothing opens its old replicas, so nothing reaches the open-time refusal (`DURABLE_RECORD_MISSING` / `RESEED_REQUIRED`, `src/raft/raft-committed-membership-constants.js:76-94`). Its SERVICES rows stay ACTIVE claims for storage that no longer exists. Main's durable-rejoin path has the same gap for a single replica with no record: `src/bootstrap/node-joining-publication-activation.js:24-33` says "left to the rebalancer", but no transition tells the rebalancer.

Neither defect needs a second identity.

**Decision: (iii).**
- Delete the storage-incarnation machinery and the boot-incarnation re-stamping, which restores main's contracts.
- Close R1 inside the existing D-7 registration owner with one rule (§5.1).
- Close R2 through the existing failure-repair owner as a typed, per-replica transition. It is driven by positive local proof (§5.2).
- The boot incarnation stays the one fact of node life identity.

## 2. What the commits tried to solve, and the owner's contract

The sealed constraint `join-core-coupling` of quest `formation-ready-lease-independent-of-spread` (`solve/quests/formation-ready-lease-independent-of-spread/quest.json`) requires a witness of "a joiner restart with a wiped data directory". The quest's design table (`docs/evidence/.../design/repair-b-design.md:494`) expects: "Fresh join, then READY; same as a fresh join".

The quest landed on 11-14 (`5bc4d0769`; terminal log entry 23:23Z). The wipe witness came afterwards:
- `f67f16071` added it, with a wall-clock supersession rule (`NODES.created_at > op.completed_at`).
- 8c7d59437 → 4459f4fc5 → 27ad27e5c replaced that rule with `storageIncarnation` and grew it. The record is `docs/evidence/formation-ready-lease-independent-of-spread-2026-11/post-closure-applicability-2026-11-15.md` §1.4 and §3.
- None of the three has a Quest or a verification record (audit).

Binding owner contract that applies:
- **F1 (2026-09-29 r6):** one durable monotonic BootIncarnationOwner per data directory, reserve-before-use, never reuse. Also D-7: the monotonic predicate lives in the registration write itself. Also N7: a reaped incarnation is terminal, and a new incarnation or a restart is required.
- **Round-4 (2026-09-29):** G1 work never affects G2 through logical-name reuse.
- **Cutover ruling 3 (2026-10-05):** a prior-existence fact plus an absent durable record means never genesis; the replica is typed reseed-required. Per `raft-committed-membership-constants.js:76-79`, RESEED_REQUIRED is "held durably, never reopened, replaced under a fresh identity".
- **rs-raft closeout (2026-10-04):** absence, timeout or eviction is not proof that a replica is gone. Positive proof is. A host reporting "I hold no durable record for replica R" is positive proof.
- **no-legacy-one-version-of-logic (2026-10-24).**
- **D3 (2026-11-17):** `NODES.host_id` is being added by placement WP-D. This design adds no NODES column.

## 3. Failing assertions: mechanism and verdict

| Test file (main → candidate) | Failing assertion(s) | Mechanism (file:line) | Verdict |
|---|---|---|---|
| bootstrap/node-joining-lease-registration (4/0 → 0/1) | registration throws "Authoritative control-plane row source unavailable" | `registerNodeInCluster` calls `advanceFreshStorageIncarnationFloorFromCluster` on every fresh registration (`node-registration-owner.js:121` → `…durable-rejoin-methods.js:355-392`). It does authoritative reads of NODES and NODE_ENDPOINTS and throws at `:367`/`:370` → `row-builder.js:52-59` when `AuthoritativeControlPlaneView.canRead()` is false (`authoritative-control-plane-view.js:303-308`). Main did no pre-read. The D-7 write (`node-registration-incarnation-write.js:98-120`) is the one authoritative reader of this row. | **(c)**: the duplicate reader exists only to mint the second identity. Giving the doubles a read seam would ratify it. |
| bootstrap/node-joining-service-message-group-activation (42/0 → 37/1) | "registerNodeInCluster seeds local discovery-critical cache rows" | same | (c) |
| bootstrap/node-registration-idempotency (4/0 → 0/2) | both tests | same | (c) |
| bootstrap/register-node-in-cluster (69/0 → 19/14) | 9 tests throw the unavailable-read error. The "seed participant failure" test's 4 assertions see that error in place of the owner-path participant failure (code, retry-after, cause). | same. The pre-read runs before the NODES write, so the typed participant failure never surfaces. | (c) |
| transport/node-identity-separation.property (5/0 → 0/5) | all properties, plus one timeout | same | (c) |
| transport/node-registration-creates-endpoint.property (7/0 → 0/8) | all properties, plus one timeout | same | (c) |
| integration/control-plane-node-terminal-removal (37/0 → 0/8) | "table nodes has no column named storage_incarnation" | `buildNodeRegistrationRow` emits `storage_incarnation` (`row-builder.js:316`; key at `…constants.js:53`). NODES has no such column (`system-table-core-schema-definitions.js:138-173`). Production writes silently drop it (`filterDataForTable`, `cdc-integration-service-cache-divergence.js:219-232`, via `…insert-normalization.js:175`), so it lives only in local join-time cache seeds and simulation caches. | **(a)/(c)**: the canonical registration row is not a NODES row (a phantom carrier). |
| control-plane/heartbeat-storage-budget-preservation (33/0 → 32/1) | `:443` "deferred endpoint pressure coalesces repeated refresh attempts" (signature of written row ≠ heartbeat's signature) | The endpoint authority's birth path rewrites the caller's row metadata to `{"storageIncarnation": bootIncarnation}` (`endpoint-incarnation-authority.js:275-283, 339-347`). The heartbeat records the signature of the row it built (`metadata "{}"`). The authority is a second writer of the fact, and its rule (birth = boot incarnation) differs from registration's (preserve on durable rejoin). | **(c)** |

Every culprit-owned test passes at `19a2134c5`, so they pin the machinery (C, run niced, one file at a time):

| Test file | Result |
|---|---|
| node-registration-owner | 109/0 |
| durable-rejoin-incarnation-advance | 56/0 |
| endpoint-incarnation-authority | 21/0 |
| pending-move-tracking.property | 16/0 |
| node-incarnation-websocket-fence | 96/0 |
| formation-ledger-spread-voter-ready-readiness | 44/0 |
| dt-formation-joint-admission-release-liveness | 12/0 |

## 4. Census: every reader and writer added by the family (at `19a2134c5`)

### 4.1 Storage incarnation: writers (four places)

| Place | Writer (file:line) |
|---|---|
| **NODES row field `storage_incarnation`** (phantom: no column, dropped by every production write) | `row-builder.js:281-318` (`buildNodeRegistrationRow`, default = boot incarnation at `:292-295`); `row-builder.js:61-86` (`buildReentryNormalizedNodeRow`); seeded into the local cache by `seedJoinTimeCacheRow` (`node-registration-owner.js:157-162, 178`) |
| **NODE_ENDPOINTS.metadata JSON `storageIncarnation`** | `row-builder.js:469-489` (`buildNodeEndpointRegistrationData`); `row-builder.js:236-253` (`stampEndpointStorageIncarnationMetadata`, called from `:407-435, 437-467`); `publication-methods.js:226-248` (`registerNodeEndpoint`, fallback to boot incarnation at `:235-239`); `endpoint-incarnation-authority.js:275-283` (birth stamp = boot incarnation, the **second rule**); `:285-297, 323-335` (CAS preserves the observed value) |
| **REPLICA_OPERATIONS top level `targetNodeStorageIncarnation` / `targetNodeBootIncarnation`, and every `steps_history` entry** | `replica-status.js:150-190` (`createOperation`); `rebalance-coordinator-operation-creation.js:536-541, 636-649`; `operation-workflow-transition-orchestration.js:230` → `replica-status.js:385-427` (`preserveOperationTargetNodeIncarnations`, copies onto every step); `replica-operation-repository-row-methods.js:233-246`; keys at `replica-operation-progress.js:334-335` |
| **Process latches** | `node-registration-owner.js:82-83`; `durable-rejoin-methods.js:136-139, 196, 219-221, 380-381` |

### 4.2 Storage incarnation: readers (three coherence rules, three parsers)

- `row-builder.js:205-234` `readObservedStorageIncarnation`:
  - The endpoint counts as coherent when the node boot is 0, the endpoint boot is 0, or they are equal.
  - In that case the endpoint value wins; otherwise the NODES field (`?? nodeRow.storageIncarnation` alias at `:228`).
  - Parser: `:190-203` (catch → `{}`).
- `replica-status.js:281-327` `resolveTargetNodeIncarnationSnapshot`:
  - The endpoint counts as coherent only when the node boot is known and equal.
  - Then the NODES value wins when it is greater.
  - Aliases at `:300-306`: `boot_incarnation ?? bootIncarnation`, `storage_incarnation ?? storageIncarnation`.
  - The endpoint id is hard-coded as `ep-${id}-ws` at `:295`.
  - Parser: `:258-279` (catch → null; a third spelling, the literal `.storageIncarnation`).
- `endpoint-incarnation-authority.js:238-251` (parser, catch → `{}`) and `:253-258`. The key is defined a second time at `:227` (first at `…constants.js:54`).
- `replica-status.js:347-383` op readers:
  - camel → snake → `steps_history` scan, three sources for one fact;
  - `:385-392`: `stepsHistory ?? steps_history`.
- `row-builder.js:88-118` `resolveHighestObservedNodeIncarnation`: max over NODES boot, endpoint boot and storage values.
- **Decision consumers:**
  - `unified-rebalancer-replica-state.js:449-477`, **F23**. When either incarnation is unknown, it returns "superseded", so main's priority terminal-create projection (`:340-421`) is disabled for every op that lacks a stamp.
  - `durable-rejoin-methods.js:86-148, 168-231` (reuse decisions).
  - `targetNodeBootIncarnation` on operations has **no decision consumer**: it is write-only.

Rules 1 and 2 disagree, for example:
- the NODES row lacks `boot_incarnation` (0);
- the NODES storage is greater than the endpoint's.

Rule 3 (the endpoint birth) disagrees with registration on a durable rejoin whose endpoint row is re-born.

### 4.3 Boot incarnation re-stamped onto live owners (violates F1 reserve-before-use)

- `node-joining-delegate-bundles.js:25-72` `syncNodeJoiningBootIncarnation` writes these fields after startup:
  - `service.bootIncarnation`;
  - `nodeStatePublicationOwner.bootIncarnation`;
  - `heartbeatService.bootIncarnation`;
  - `messageRouter.syncBootIncarnation?.()` plus a direct field write (a dual path);
  - `replicaLifecycleOwner.syncOwnerIncarnation?.()`;
  - three `replicaCreateAdmissionOwner.ownerIncarnation` fields;
  - `rebalanceCoordinator.repository.membershipOwnerBootIncarnation`;
  - then `raiseBootIncarnationFloor` (`:62-70`, gated on `explicitDataDirProvided`, `node-joining-owner-construction.js:98`).
- `node-joining-delegate-bundles.js:74-121` `applyBootstrapResponseAndSyncIncarnation` re-stamps on every seed-contact response. It is wired at `:380`, at `node-joining-owner-construction.js:446`, and at `contact-seed-phase.js:275` (now `await`ed).
- `node-joining-owner-construction.js:572-573` and `query-system-state-phase.js:104-105` expose the delegate `raiseBootIncarnationFloor` → `syncBootIncarnation`.
- `durable-rejoin-methods.js:355-392`:
  - mints `max(current, observed+1)`;
  - latches it;
  - raises the floor **twice**: through the delegate at `:385-387` and directly at `:388-391`.
  - The re-stamp in `syncNodeJoiningBootIncarnation` is a third raise.
- `durable-rejoin-methods.js:341-353`: `getRegistrationBootIncarnation` / `getRegistrationStorageIncarnation` prefer the latch over the reserved value (a two-source read).
- `replica-handler-setup.js:403-431` `syncOwnerIncarnation`, and `replica-state-machine.js:132` `configurable: true` (was `false`), so the owner incarnation can be redefined.
- `message-router-connection-lifecycle-methods.js:595-630` `syncBootIncarnation`: re-identifies live connections under a new incarnation. This is 5f84f0eff "transport boot-incarnation sync". Its only caller is the re-stamp.
- `lagrange-runtime-startup.js:238, 344` read the mutated `nodeJoiningService.bootIncarnation` instead of the reserved value.

### 4.4 Second ordering authority

`system-table-cache-row-merge.js:181-211` orders NODES, NODE_ENDPOINTS and SERVICE_ENDPOINTS rows by `boot_incarnation` ahead of HLC.
- D-7 and the endpoint CAS already make commit order follow incarnation order, so HLC orders them.
- The rule can drop a legitimate re-birth at a lower incarnation if a deleted row lingers (P).

### 4.5 Parallel writer of replica failure

- `durable-rejoin-methods.js:700-757` `reconcileLostStoragePartitionReplicas` writes SERVICES rows directly:
  - status FAILED;
  - learner role;
  - a new trigger reason (`…constants.js:48`);
  - a hand-advanced timestamp (`row-builder.js:255-279`).
- It goes through a new SERVICES branch with feature detection and three paths (`publication-methods.js:683-712`).
- It covers partitions only.
- Main already owns this transition:
  - `failure-detector-replica-failures.js:20-110`: `transitionAuthoritativeReplicaGeneration` plus a durable repair intent plus a `REPLICA_FAILED` event, for partitions **and** message groups;
  - `failure-repair-intent-contract.js`.

### 4.6 Reuse rule change

`durable-rejoin-methods.js:252-261` plus `row-builder.js:390-405` (`hasDurableRejoinStorageContinuity`) and `:168-231` replace main's fence-allowed reuse with a continuity-or-latch rule. Under §5.1 main's rule is safe again.

### 4.7 Tests carrying the machinery

| Test | References | Added in |
|---|---|---|
| `test/bootstrap/durable-rejoin-incarnation-advance.test.js` | 15 refs | +510 lines in 27ad27e5c |
| `test/bootstrap/node-registration-owner.test.js` | storage and lost-replica cases | 4459f4fc5, 27ad27e5c |
| `test/control-plane/endpoint-incarnation-authority.test.js` | 5 refs | |
| `test/rebalancer/formation-ledger-spread-voter-ready-readiness.test.js` | 45 refs, F23 witnesses | |
| `test/rebalancer/pending-move-tracking.property.test.js` | 1 ref | |
| `test/convergence/formation-joint-admission-world.js` | 22 refs | |
| `test/convergence/formation-joint-admission-rounds.js` | 7 refs | |
| `test/convergence/dt-formation-joint-admission-release-liveness.test.js` | 16 refs: wipe witnesses, including `externalServicesCleanup` + tombstone clear + clock rollback | |
| `test/simulation/formation-sim-node-hosts.js` | 1 ref | |
| `test/transport/node-incarnation-websocket-fence.test.js:993-1100` | `syncBootIncarnation` | |
| `test/transport/service-delivery-lifetime.test.js:71-180` | `syncBootIncarnation` | |

## 5. Single-owner design

### Comparable systems

| System | Where storage identity lives | What a wiped disk does | What happens to the old identity |
|---|---|---|---|
| **CockroachDB** | `StoreIdent{ClusterID, NodeID, StoreID}` on the engine; NodeID and StoreID allocated by the cluster (KV increment), never reused | Gets a new NodeID/StoreID and cannot rejoin under the old one | The old store is declared dead (`server.time_until_store_dead`), the replicate queue up-replicates, and the operator decommissions the old node |
| **TiKV/PD** | `store_id` allocated by PD and persisted in the store ident | Gets a new `store_id` | PD rejects a new store with the address of a non-Tombstone store ("duplicated store address"). The operator does `store delete` → Offline → Tombstone; the replica checker replaces peers once the store is Down/Offline |
| **etcd** | member ID minted at `member add` | Must be `member remove`d and `member add`ed under a new ID | Restarting under the old ID with an empty dir is unsafe: it may vote having forgotten its votes |

Lagrange differs: `node_id` is operator-configured (`lagrange-runtime-startup.js:92`), not minted on disk. Per-life uniqueness therefore has to come from the incarnation. `NODES.node_address` is already UNIQUE (`system-table-core-schema-definitions.js:140`), which is TiKV's constraint. The "forgot its votes" safety (etcd) is already on main per replica: cutover ruling 3 and the open-time refusal.

### 5.1 One fact for life identity: the boot incarnation (owner: BootIncarnationOwner + D-7 registration write)

**Rule (added in `writeNodeRegistrationAtIncarnation` and `advanceNodeBootIncarnation`).** An observation of `CURRENT` or `NEWER` before *this lifecycle* has issued a registration write at this incarnation is **REFUSED_STALE**, with `knownIncarnation = observed`.

Why the rule holds:
- An intact data directory always reserves above everything it has issued (F1). So on a lifecycle's first observation, `CURRENT` or `NEWER` can only be another storage's life: wiped, or restored from a backup.
- Inside one lifecycle, a re-entry after its own birth or advance write (lost ack) records the issue before it writes, so its `CURRENT` stays legitimate.
- The lifecycle is one `NodeRegistrationOwner` (constructed once per `NodeJoiningService` in `query-system-state-phase.js:79`).
- The caller passes `issuedAtIncarnation` explicitly. It is an input to the owner, never a latch that re-mints anything.

**Consequence.** Main's existing path then closes R1 with no new mechanism: superseded → `resolveFailedJoinReattempt` → `raiseBootIncarnationFloor(observed)` (`entrypoint-runtime-join-startup-policy.js:127-133`) → a new lifecycle reserves `observed+1` → `OLDER` → one CAS advance.
- No owner's incarnation ever changes after construction.
- No pre-read is added.
- No second identity is added.

### 5.2 Storage loss is per replica (owner: the failure-repair owner)

**Fact.** "Replica R assigned to me has no durable record on my disk" is the same fact the open-time refusal establishes. It is positive local proof.

**Who writes it.** A lifecycle that starts `FRESH_JOIN` with SERVICES rows naming it from a prior life, or a `DURABLE_REJOIN` whose restore gets `DURABLE_RECORD_MISSING` (`node-joining-publication-activation.js:24-33, 139-152`), calls one function. For each such replica, that function runs the failure-repair owner's existing transition:
- `transitionAuthoritativeReplicaGeneration(row, FAILED, {reason: REPLICA_DURABLE_RECORD_MISSING})`, a new typed transition cause in `failure-repair-intent-contract.js`;
- plus `recordDurableRepairIntent`;
- for partitions and message groups alike.

The rebalancer then REMOVEs and ADDs under fresh replica identities, as with any FAILED replica. That is the CockroachDB replicate queue and the TiKV replica checker.

**Projection.** FAILED is already a blocking status for main's priority terminal-create projection (`unified-rebalancer-replica-state.js:63-68`). Terminal REMOVE ops retire their targets (`:628+`). So no ghost projection arises and F23's check is unnecessary.
- The only remaining ghost source is an *external* SERVICES deletion (the simulation's `externalServicesCleanup`). No production actor does that.
- The projection reads REPLICA_OPERATIONS as a second source of replica existence, which is the D2 class. It belongs to the placement-owner design, not here.

### 5.3 What is not stored

- No storage incarnation anywhere.
- No NODES column.
- No endpoint metadata.
- No operation stamps.
- No cache ordering rule beyond HLC.

## 6. Deletion list

Each item restores main where main had the code.

1. **Registration**
   - `…constants.js:48-54, 105-109`;
   - `row-builder.js:61-86` (storage part), `88-118`, `120-148`, `190-253`, `255-279`, `292-295`, `316`, `390-405`, `407-467` (storage part), `469-489` (metadata back to `{}`);
   - `durable-rejoin-methods.js:86-148, 168-231, 252-261` back to main, plus `341-392` and `700-757`;
   - `node-registration-owner.js:82-83, 121, 190-193, 212-217, 241-242`;
   - `publication-methods.js:226-248` (storage), `683-712`.
2. **Boot re-stamp**
   - `node-joining-delegate-bundles.js:2-11, 25-121, 380, 609-614, 638`;
   - `node-joining-owner-construction.js:98, 446, 572-573`;
   - `query-system-state-phase.js:104-105`;
   - `contact-seed-phase.js:275` (`await`);
   - `lagrange-runtime-startup.js:238, 344` (use the reserved value);
   - `replica-handler-setup.js:403-431`;
   - `replica-state-machine.js:132` (back to `configurable: false`);
   - `message-router-connection-lifecycle-methods.js:595-630`.
3. **Endpoint authority:** `endpoint-incarnation-authority.js:227-297`, plus the calls at `:325` and `:340-344`.
4. **Cache:** `system-table-cache-row-merge.js:181-211`.
5. **Rebalancer (coordinate with placement):**
   - `replica-status.js:150-190` (stamps), `250-427`, `490-493`;
   - `rebalance-coordinator-operation-creation.js:35, 536-541, 636-649`;
   - `operation-workflow-transition-orchestration.js:4, 230`;
   - `replica-operation-repository-row-methods.js:6-7, 233-246`;
   - `replica-operation-progress.js:334-335`;
   - `unified-rebalancer-replica-state.js:1-7` (imports), `381-388`, `428-477`.
6. **`control-plane-setup.js:352`:** it passes `bootIncarnation` to RebalanceCoordinator. This is legitimate, but main's `options.bootIncarnation ?? messageRouter.bootIncarnation` (`rebalance-coordinator-lifecycle.js:351-352`) is a two-source read. Keep the explicit pass and drop the `??` fallback, at the rebalancer owner.

## 7. Tests

- **Must pass unchanged:** the 7 failing files (§3).
- **Restated to the new contract, never loosened:**
  - `durable-rejoin-incarnation-advance` and `node-registration-owner`: their storage, latch and lost-replica cases become T1, T2 and T4 below.
  - `endpoint-incarnation-authority`: delete the 27ad27e5c birth-stamp assertions, which restores main.
  - `formation-ledger-spread-voter-ready-readiness` and `pending-move-tracking`: delete the F23 witnesses. Restate the projection property at the placement owner.
  - The convergence world's wipe witness: a local-disk-only wipe → superseded → new lifecycle at `observed+1` → T4.
  - Delete the `externalServicesCleanup` + tombstone-clear + clock-rollback witness. No production actor does that, and it protected only the deleted mechanism.
  - Delete the two transport `syncBootIncarnation` tests together with the method.
- **New:**
  - **T1 (D-7):** a first observation of CURRENT is refused stale; a re-entry after its own lost-ack birth is CURRENT and accepted; a G/G+1 witness.
  - **T2 (startup):** superseded → the floor is raised → the reattempt reserves `observed+1` → advance ACCEPTED.
  - **T3 (structural):** no write to any owner's boot incarnation after construction; the RSM owner incarnation is non-configurable.
  - **T4 (failure-repair):** FRESH_JOIN with prior SERVICES rows → each replica without a record goes FAILED with a typed cause and a repair intent (partition and message group); a replica with a record is untouched; DURABLE_REJOIN `DURABLE_RECORD_MISSING` takes the same function.
  - **T5:** the registration row's keys are a subset of the NODES schema columns.
  - **T6:** the endpoint authority writes exactly the caller's row.

## 8. Staged plan

This should be one sealed Quest, `node-life-identity-one-fact`, with a verifier.

| Stage | Scope | Restores |
|---|---|---|
| S0 | Owner decisions O-K1 and O-K2 (§9) | - |
| S1 | Bootstrap and D-7: deletion items 1 and 2, the §5.1 rule, T1-T3 and T5 | the 6 registration-path files |
| S2 | Endpoint and cache: items 3 and 4, T6 | heartbeat-storage-budget-preservation |
| S3 | Rebalancer: item 5, after the placement owner's WP that touches `unified-rebalancer-replica-state.js` and `replica-status.js`, or folded into it | - |
| S4 | §5.2 per-replica loss through the failure-repair owner, T4, and the restated convergence wipe witness | - |
| S5 | Verification: the 7 files, every restated test, the transport fence tests, fast-static, the lab cone, an independent verifier | - |

S1 alone already restores 6 of the 7 failing files. S1 and S2 restore all 7. The terminal-removal file passes once `row-builder.js:316` is gone.

S1 cannot ship without S4's restated wipe witness. Otherwise `durable-rejoin-incarnation-advance` and the convergence world go red, and that red would be a test of the deleted mechanism, not a regression. So S1, S2 and S4 land together; S3 follows the placement work.

**Overlap with parallel agents.**
- Placement-owner / B2 agents: `replica-status.js`, `unified-rebalancer-replica-state.js`, `rebalance-coordinator-operation-creation.js`, `operation-workflow-transition-orchestration.js`, `replica-operation-repository-row-methods.js` (S3).
- WP-D (`NODES.host_id`): the NODES schema. This design adds no column, so there is no conflict.
- The transport file `message-router-connection-lifecycle-methods.js` was also touched by 11bdbc115 (fix M's family). Only `:595-630` is K's.

## 9. Owner decisions needed

- **O-K1.** A wiped node rejoining under the same `node_id`: automatic, or operator-gated?
  - Automatic: superseded lifecycle plus per-replica FAILED from positive local proof. This is close to CockroachDB's dead-store repair.
  - Operator-gated: TiKV/etcd style; refuse until an operator removes the old node.
  - Recommendation: automatic. The proof is positive and local, and the repair runs through existing owners.
- **O-K2.** Accept deleting the `externalServicesCleanup` + clock-rollback witness, and moving F23 (the ghost projection of terminal creates) to the placement owner's D2 item.

## 10. Risks and unknowns

- **(C)** R1 equal-incarnation collision on main: code reading. Not executed on main.
- **(C)** The NODES `storage_incarnation` never reaches the table in production.
- **(C)** Operation `targetNodeBootIncarnation` is write-only.
- **(C)** Re-stamping touches 9+ owners after construction.
- **(P)** Where a FRESH lifecycle can invoke the failure-repair transition before its replica state machine is fully wired. S4 must confirm the call site: registration completion versus the join reconciler.
- **(P)** Message-group SERVICES rows of a wiped node are stranded on main too. The candidate covers only partitions.
- **(P)** The cache boot-incarnation rule may hide a missed DELETE followed by a lower re-birth.
- **(P)** The GCP benchmark path forms fresh clusters, so R1 and R2 are not on it. The candidate machinery adds risk there:
  - the pre-read at every registration;
  - live re-stamping;
  - F23 disabling the projection for unstamped ops.

---

## Revision 1 (2026-11-18): after the independent review (APPROVE-WITH-CHANGES) and the owner's decisions

### R1.0 Decisions taken

- **O-K1: automatic, with the reviewer's guard.** A wiped node rejoining under the same `node_id` is handled automatically, except in one case. The registration is refused with a typed, non-retryable, operator-gated error `NODE_IDENTITY_TWIN_SUSPECTED` when both hold:
  - the prior incarnation's row still holds a valid READY lease (`ready_lease_expires_at > now`);
  - the row declares a `host_id` different from this node's declared `host_id`.

  Such a row is most likely a live twin with the same NODE_ID on another machine. The guard sits in the R1 supersede decision (§5.1), so the twin never enters a supersede/advance ping-pong. Read through `readNodeHostIdentity` (WP-D, the one reader of `NODES.host_id`).

  The guard is deliberately not applied to the OLDER advance path, for two reasons:
  - A Kubernetes reschedule with network storage keeps its data dir (so it advances OLDER) but changes `spec.nodeName`. A fast reschedule would be refused while the old lease is still valid.
  - A twin whose own data dir counter is already above the other's advances OLDER and is not caught. That residual is recorded in R1.6.
- **O-K2: accepted.** The `externalServicesCleanup` + tombstone-clear + clock-rollback witness is deleted. F23 (`isTerminalCreateSupersededByNodeRegistration` and `projectPriorityTerminalCreateTargets`'s second source) moves to placement WP-F's deletion census. S3 stays with WP-F.

### R1.1 §3 correction: main's real R1 hole, which T1 witnesses

"Main did no pre-read" (§3) was inaccurate. On main, `resolveExistingJoinAdmissionProgress` (main `…durable-rejoin-methods.js:221-252`) pre-reads NODES and endpoints authoritatively on every fresh join whose cluster-incarnation fence resolves allowed. A wiped data dir resolves `NOT_REQUIRED`/allowed (`cluster-incarnation-fence.js:88-97`).

What did not read were the test doubles: they have no fence delegate and no data dir, so the fence resolves null and is blocked.

Main's actual R1 hole runs through this path:
1. The life-1 row is CONNECTED/READY at an equal incarnation, so it is "existing progress".
2. `advanceStaleJoinAdmissionIncarnation` → `advanceNodeBootIncarnation` classifies it `CURRENT` and returns with **no write**.
3. Life 1's endpoint and meta-endpoint rows are adopted as this life's.

T1 witnesses exactly this path, alongside the fresh-birth path.

The six registration-path failures still have the mechanism stated in §3: the candidate's unconditional `advanceFreshStorageIncarnationFloorFromCluster` pre-read. The verdict stays (c).

### R1.2 §5.1 amended: one rule and one argument, for both callers of the D-7 write

`writeNodeRegistrationAtIncarnation` (`node-registration-incarnation-write.js:248`) has two production callers:
- the joiner (`membership-publication-runtime-owner.js:158-172`, via `registerJoinNodeRow`);
- the seed (`node-storage-budget-service.js:256`, via `NodeStorageBudgetSetup.resolveAndPersist` ← `bootstrap-service-control-plane-runtime-methods.js` `registerSeedNodeWithControlPlane`).

The joiner's reuse paths classify through the same relation in `advanceNodeBootIncarnation`.

**Rule.** The registration-observation classifier gains a **required** argument, `issuedAtIncarnation`:
- `null` means this boot lifecycle has issued no registration write;
- a positive integer is the incarnation at which it issued one.

There is no default: a missing argument throws the typed `NODE_REGISTRATION_ISSUE_RECORD_REQUIRED`. `CURRENT` is legitimate only when `issuedAtIncarnation === bootIncarnation`. Otherwise it classifies as superseded, exactly like `NEWER`. The write returns the incarnation at which it issued (it records the issue before its first attempt), and the caller keeps it.

**Anchor.** The value is held by the owner whose lifetime is the boot lifecycle:
- joiner: `NodeRegistrationOwner` (one per `NodeJoiningService`, `query-system-state-phase.js:79`);
- seed: `BootstrapService` (one per process).

The seed's budget service is created per call, so it carries the value in and out and never keeps it.

### R1.3 §5.2 amended: storage loss is per replica, through the live owner. Message groups are a residual.

**New finding (C).** The "failure-repair owner" named in §5.2 is not live:
- `FailureDetector` has no production construction site;
- `new FailureDetector(` appears only under `test/`;
- the repair-intent recorder exists only on it.

The live per-replica lifecycle owner is the node's `ReplicaStateMachine.transitionAuthoritativeReplicaGeneration` (`replica-state-machine-authoritative-transition.js:224-260`). It is an exact-generation CAS with authoritative admission. The joiner acquires it in `initializeReplicaHandler` (`node-joining-publication-activation.js:209-224`) before registration.

**Partitions.** A lifecycle that registered with fresh storage (startup mode FRESH_JOIN) proceeds as follows:
1. Read its partition SERVICES rows authoritatively.
2. For every row whose replica has **no durable record in this data dir** (the same probe as the open-time refusal), transition it through that owner to FAILED with the typed `trigger_reason` `durable_record_missing` (the existing refusal constant).
3. Leave a replica that has a record untouched.

The rebalancer then repairs FAILED partition replicas as usual.

**Message groups: not closed, recorded as the MG owner's residual.** Main's contract, test `join-message-group-identity-record.test.js:88` M1, is: a rejoin MG replica whose SERVICES row survives its lost database is refused reseed-required at open, through the join phase. Two consequences:
- The MG replica is held, never re-founded empty.
- No owner replaces a FAILED or held MG replica, because placement refuses MG membership change.

Marking MG rows FAILED would repair nothing and could collide with the join's own MG replica phase, so S4 does not write MG rows.

Consequence (P): a wiped joiner whose MG replica row survives cannot complete the join in production until the MG owner gains a "replace under a fresh identity" path. The convergence world simulates consensus and does not exercise this.

### R1.4 WP-D (`fed85ec00`) is kept

The implementation is based on `origin/claude/integration-20261118`, which contains WP-D. Deleting the storage incarnation keeps `hostId` threaded through:
- `buildReentryNormalizedNodeRow(nodeRow, now, bootIncarnation, hostId)`;
- `buildDurableRejoinMembershipResolution`;
- `buildExistingJoinAdmissionProgressResolution`;
- `buildNodeRegistrationRow`.

Every re-entry row still carries `requireDeclaredNodeHostId(hostId)`. Only the storage parameter is removed. "Restore main" means: restore main's rules, and keep WP-D's host column.

### R1.5 Life-1 work in life 2's window (reviewer point 5)

The window runs from `initializeJoinInfrastructure` to the registration outcome. That function opens external transport admission and the replica handler before registration, "because node registration can trigger CREATE_REPLICA traffic" (`node-joining-admission-readiness.js:169-188`). During it, life 2 runs at the collided incarnation number.

**Witness that ships.** T1 asserts that the registration answers superseded with **no** NODES, NODE_ENDPOINTS or SERVICE_ENDPOINTS write. So life 1's rows are neither advanced nor adopted.

**Residual (P).** The replica-create admission fence `requireCurrentBootIncarnation` (`replica-create-admission-owner.js:465-482`) compares numbers only (NODES `boot_incarnation === ownerIncarnation`). Inside the window it would admit a create for an ADD addressed to node X planned against life 1.

The known effect is benign: the ADD's intent is "new replica on node X". The next lifecycle takes over the retained admission (owner incarnation 1 < 2, `takeoverRetained`), and the replica's durable record keeps it out of S4. Still, the general G1/G2 invariant is not proven in the window.

**Exact closure, not implemented here.** One boot-lifecycle registration record, consulted by `requireCurrentBootIncarnation` ("my registration settled at `ownerIncarnation`"), for joiner and seed alike. The seed needs care, because its founders are created before its control-plane registration. This needs an owner ruling and the replica-create owner's tests; it is a follow-up.

### R1.6 Additional residuals

- **Restore-from-backup (P).** A data dir restored from a backup holds a *stale* durable record (it "forgot its votes"). The open-time refusal sees a record present and opens. R1 catches the node level (its reservation is at or below the cluster's, so it is superseded). Raft-level safety for each replica of that data dir is not covered. That belongs to the raft owner; etcd treats it as member remove/add.
- **OLDER twin (P).** A twin whose own data dir counter is already above the other's advances OLDER and is not caught by the O-K1 guard (see R1.0).
- **Rebalancer readers (S3, WP-F).** Once registration and the endpoint authority stop writing the storage incarnation, `resolveTargetNodeIncarnationSnapshot` always reads null. F23 then treats every terminal create as superseded, which **disables** `projectPriorityTerminalCreateTargets`. That fails closed: SERVICES rows stay the only authority. It holds until WP-F deletes the readers together with the projection.

### R1.7 Staged plan, revised

| Stage | Contents | Where |
|---|---|---|
| S1 | Registration and D-7 deletions plus the R1.2 rule plus the O-K1 guard | `claude/fix-k2-incarnation-20261118` on `origin/claude/integration-20261118` |
| S2 | Endpoint stamping and cache ordering deletions | same, landing together with S1 and S4 |
| S4 | Partitions only, through `ReplicaStateMachine`; MG is a residual | same |
| S3 | Rebalancer readers, ops stamps, F23 | WP-F |
| R1.5 gate | Boot-lifecycle registration record consulted by the create admission fence | follow-up, needs an owner ruling |

### R1.8 Implementation notes (S1 + S2 + S4, `claude/fix-k2-incarnation-20261118`)

**D-7 owner** (`node-registration-incarnation-write.js`):
- `createNodeRegistrationIssueRecord()` creates `{issuedAtIncarnation: null}`.
- `classifyNodeIncarnationRelation(observedRow, bootIncarnation, issueRecord)` takes the issue record as a required argument. A missing or malformed record throws `NODE_REGISTRATION_ISSUE_RECORD_REQUIRED`. CURRENT is returned only when `issuedAtIncarnation === bootIncarnation`; otherwise the result is NEWER.
- `writeNodeRegistrationAtIncarnation` requires `options.issueRecord` and records the issue before each attempt.
- `buildSupersededRegistrationError({nodeId, receivedIncarnation, observedRow, declaredHostId, nowMs})` holds the O-K1 guard: `NODE_IDENTITY_TWIN_SUSPECTED`, `retryable: false`, no `knownIncarnation`. It reads through `readNodeHostIdentity` and `getNodeReadyLeaseExpiresAt`.

**Who owns the issue record**:
- joiner: `NodeRegistrationOwner.registrationIssueRecord`, used by the fresh path through `registerJoinNodeAtIncarnation(row, boot, issueRecord, options)`, by the advance path and by the readback;
- seed: `BootstrapService.registrationIssueRecord`, passed through `NodeStorageBudgetSetup.resolveAndPersist({issueRecord, nowMs})` → `registerNodeBudget`.

**Superseded error carries the incarnation**: `wrapNodeRegistrationError` now keeps `knownIncarnation` and the new-lifecycle `retryable` of a `STALE_NODE_INCARNATION` error. On main the wrapper dropped both, so the joiner's `readSupersededBootIncarnation` read 0 and D11b's floor raise never fired on the registration path (C).

**S4 runs through the live per-replica owner**: `node-registration-lost-storage-replicas.js` plus `readPartitionReplicaStorageState` in `data-directory-manager.js`. When the fence's durable membership is ABSENT, it fails a SYNCING or ACTIVE partition row whose local DB file is absent (ENOENT; any other error is thrown). The transition goes through `ReplicaStateMachine.transitionAuthoritativeReplicaGeneration` with reason `durable-record-missing`. The joiner wires `getReplicaStateMachine` and `readLocalReplicaStorageState` in `node-joining-owner-construction.js`.

**New findings while implementing**:
- **(C)** `COLUMN.TRIGGER_REASON` is undefined. The candidate's `buildFailedLostStoragePartitionRow` therefore wrote a key named `"undefined"`, and its witness compared `row[undefined]`. Both are gone.
- **(C)** The inbound in-place re-identify branch (`message-router-inbound-dispatch.js:233-237`, 5f84f0eff, refactored by 11bdbc115) has no sender once `syncBootIncarnation` is deleted. It was left in place because it is fix M's file; the transport owner should delete it.
- **(C)** The R1.5 window is confirmed. `join-startup-plan.js` runs INFRASTRUCTURE, then `initializeJoinInfrastructure` (replica handler and external transport admission), then MEMBERSHIP (registration).
- **(C)** F23 now always reads an unknown incarnation and withholds the terminal-create projection. This fails closed and stays so until WP-F deletes it.
