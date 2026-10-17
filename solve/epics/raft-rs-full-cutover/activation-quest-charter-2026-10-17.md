# Charter draft: production activation of bound WASM service groups (new quest, proposed 2026-10-17)

Proposed by the lead after the stage-1c design vet (REVISE; report
`solve/quests/wasm-creation-genesis/evidence/design-vets-20261017/design-vet-activation-discovery-20261017.md`).
Not sealed: a quest is created with `node scripts/solve.js start` only after
the owner confirms the scope split (CONTRACT-R2 :217-220 keeps
`wasm-creation-genesis` at embedding scope) and rules the two decisions below.

Mandate: owner ruling D0 (2026-10-17): the bound creation route is THE
formation path for installed-package `wasm_component` services (not request
Cells, not built-in meta services).

## Statement (proposed)

A `wasm_component` service installed from the catalog is formed on a
production cluster through the bound creation route and nothing else: the
leader's runtime-service reconcile owner plans one founding cohort, selects
the instance, retains one creation per founder before dispatch, and the
founders' nodes form, publish and retire through the stage-1/1b/1c owners;
held founders are never failed by a timer while their slot is live; the
unbound WASM formation shape is deleted as its own reviewed unit.

## Work items (from the vet, by id)

1. B1: the manager's `wasm_operations` journal writer, idempotency reader and
   recovery reader bound to the system-table gateway (`OWNER_RPC_REQUIRED`,
   CDC `CONTROL_NO_INTERNAL_PROPAGATION`) and `serviceDefinitionsOwner`
   injected into `ServiceLifecycleManager` on seed and joiner startup
   (`startup-service-lifecycle-owner.js:27-31`; owner exists at
   `bootstrap-service-control-plane-runtime-methods.js:158`); wiring order vs
   `RuntimeServiceHandlerSetup.create`.
2. B2 (OWNER DECISION): production node owners for port allocation and module
   mirror injected through `createWasmServiceNodeDependencies` (plus time
   source, data directory, `serviceDefinitionsOwner`, `roleUpdateWriter`/
   `leaderNodeUpdateWriter`); records the supersession of CONTRACT-R2
   :217-220 for this quest only.
3. B3: owner read `readInstanceResources(S)` on `ServiceDefinitionsOwner`
   (bindings + nine slots, bounded by the sealed caps); the planner consumes it.
4. B5: planner discriminator = installed-package `wasm_component` with a
   creation revision and not a request Cell; `getRuntimeServicePolicy` reads it.
5. Cohort planning: N odd and >= 3 (typed `COHORT_COUNT_INVALID`, never
   clamped silently; owner decides whether the definition validator refuses at
   write time), nodes by the spread policy, `COHORT_NODES_INSUFFICIENT` when
   fewer distinct nodes than N, > 9 -> CAPACITY_EXHAUSTED (R17); K built by
   `ServiceLifecycleCommandOwner.prepareConsensusInstanceRequest` with the
   catalog revision's definition and `expectedVersion` from `getCurrentInstance`
   (R3); one id: `move.operationIntentId` = the slot request's operation id
   (R1); the origin row written by the planning node's manager, the workflow
   row referencing it (R6); partial dispatch converges by the inventory
   decision table (R7); leader change re-dispatches from the slot's token
   (R8); `calculateMoves` bypassed for bound S (R24).
6. B9 (OWNER DECISION): the held CREATE's time budget: a real workflow step
   `HELD` with its own owner timeout constant that re-anchors the reaper
   (recommended), or a typed exemption keyed on the slot being live, or
   progress evidence through `reconcileOperationProgress`; invariant "never
   FAILED while the slot is ADMITTED or PUBLISHED" with its witness.
7. R14: `RuntimeServiceRebalancerOwner._cacheChangeListener` wakes
   `this._rebalancers.get(record.service_id)` on a `SERVICE_INSTANCES` change
   (the cross-node wake; periodic fallback exists).
8. R2: the eight classifier consumers and the `LIKE 'S-r%'` SQL recognise
   bound rows through `replica_id = S-rN` and `group_id`.
9. R18, R19: founder node gone (slot held on a dead node; only that node can
   retire it) routed to the recovery stage / `group-retirement-operator-retirement-fact`;
   definition deleted mid-cohort -> `ACTION.RETIRE` gets its caller.
10. B8: the alpha deletion unit: the dead production unbound formation
    (`REPLICA_SET_REQUIRED` at prepare), `meta-service-lifecycle.js`, the
    unbound `WasmServiceReplica`/OPEN shape and `publishesServicesRow`'s
    unbound branch, with the measured witness inventory (about 80 unit cases
    and 14 integration files) superseded by appending; reviewed on its own.

## Not in this quest

Discovery rows, node-side CREATE/REMOVE routes and the wake consumer (stage 1c
of `wasm-creation-genesis`); recovery-stage items; scaling or redefinition of
a formed service (new incarnation); request Cells; OCI.
