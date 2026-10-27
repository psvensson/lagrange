# Durable service creation owner: read-only dependency audit

Source: c968fc6ec5c88424342e306ae66b619c06e564eb in `/mnt/data/peter/projects/.worktrees/wasm-writer-slots-v1-20261016`. Clean source state observed at audit start. AGENTS -> rules -> router and current writer Quest read. No source/test edits or execution. User selects reusable serviceId with a common incarnation durably assigned by the existing creation owner; writer slot/generation/sequence/ack policy is not reopened.

## Finding

**The current owners do not yet supply the required authoritative current creation handoff.** Existing immutable installation records can carry identity, but their existence or successful replay is not current activation authority. Existing runnable lifecycle paths have no durable service-level supersession decision to bind before INIT. Adding a random incarnation field to CREATE or to local metadata alone leaves the delayed old CREATE hole intact.

This is a concrete missing interaction, not a recommendation to invent a permit ledger. Closing it would require specifying an existing creation-owner currentness transition and its activation/handoff authority, which is currently unsupported for installation-driven WASM activation. The source unit cannot honestly be just the WASM initializer.

## Current records and exact paths

### Authenticated service installation intent

`src/service/service-lifecycle-command-owner.js:199-227` (`buildIntentIdentity`) derives reusable definition identity from tenantId/serviceName, operation identity from action/idempotencyKey/principal/tenant, and installation identity from operationId. It does NOT choose or bind an application incarnation. `replayIfDurable:495-510` reads the existing installation by operation and validates immutable intent; `submitArtifactIntent:512-547` returns that historical replay or records package/revision/installation. Thus an old successful installation command's replay can truthfully return old durable intent without making it current.

`src/control-plane/owners/service-install-catalog-owner.js:206-237` reads installation-by-operation through authoritative SQL gateway. `requestInstallation:449-477` validates immutable installation/revision/service/operation/desiredState and uses local serialization keys installation, operation, revision—not service-level current-generation arbitration. `requestInstallationSerialized:480-514` creates one immutable row at RECORDED_NOT_RUNNING and reconciles exact replay on insertion conflict. `resolveInstallationReplay:529-544` checks same immutable fields. This is useful existing exact request history, not the required CAS selecting current incarnation for reusable serviceId. `listInstallations:240-267` sorts created_at then installationId; a projection of latest rows is not an activation/supersession decision.

`src/service/service-installation-reconciler.js:28-41,207-221,242-276` explicitly treats phase-one WASM/OCI installation activation as unsupported: it records ACTIVATION_UNSUPPORTED rather than calling runtime activation. `_settleRecordedNotRunning:310-317` retains RECORDED_NOT_RUNNING. Its `_generation` fences this reconciler runtime, not a durable service application incarnation. This is the exact activation dependency that cannot silently be assumed implemented.

### Service definition owner

`src/control-plane/owners/service-definitions-owner.js:51-90` owns authoritative reads and hidden row mutation. Its creation/activation semantics are request-binding lineage: `resolveBindingServiceDefinition:159-180`, `ensureBindingServiceDefinitionActive:182-196`, `reconcileRequestBinding:198-237`. There is no existing consensus-WASM fresh-creation/current-install transition. Its existing local serial gate is per bindingVersionId, not a persistent reusable-service incarnation CAS.

`src/wasm-service/wasm-service-models.js:18-39,47-69` declares service-definition fields including binding lineage, status and timestamps; no common application creation generation/incarnation. Request-cell binding versions cannot be silently reused as a consensus-WASM service incarnation because they belong to a different creation/activation path.

### Replica lifecycle journal: historical operation, not common creation

`src/service/service-lifecycle-manager.js:55-62` starts operationWriter/idempotencyReader/recoveryReader null. `_checkIdempotency:376-401` looks up optional tenant/key; `_journalCreate:412-449` returns null without a writer, otherwise creates wasm_operations command CREATE:serviceId. No current service incarnation is read/changed. `src/wasm-service/operation-lifecycle.js:67-123` generates UUID operationId and stores tenant/command/idempotencyKey/state/result/error/timestamps; `transitionOperation:137-193` CASes operation state only. An operation's COMPLETED state is not current authorization for its service.

`src/service/service-lifecycle-operations.js:185-255` enforces runtime policy, optionally journals, returns historical idempotent status (95-112), then calls adapter.createReplica with only canonical definition/context (234-237). The new operation is not supplied as a creation binding. An old row may return historical status, but no later service incarnation is compared. `src/service/service-lifecycle-recovery.js:122-172` resolves service context by operationId and serviceId, then directly calls adapter.createReplica for unfinished CREATE; recovery does not preserve or check a service creation generation.

Read-only search of src finds no calls to `.setOperationWriter`, `.setIdempotencyReader` or `.setRecoveryReader`; their methods exist but production setup inspected does not wire a creation journal. `src/bootstrap/shared/startup-service-lifecycle-owner.js:27-64` constructs the manager with clock and adapters only. Even wiring that journal would not, by itself, add service currentness or canonical CREATE payload binding.

### Actual runnable CREATE handoff

`src/node/runtime-service-handler.js:224-354` accepts operationId/entityId/replicaId, validates target-key shape, uses localReplicas/inProgressOperations for idempotency, then schedules async create. Existing ACTIVE can produce CREATE_ACTIVE for supplied operationId (270-288). This is not a durable supersession check. `createReplicaAsync:369-403` resolves current service definition, builds a descriptor, calls ServiceLifecycleManager.createReplica/startReplica, and later records local ACTIVE/outcome. The source definition resolver at739-755 is a system-table-cache read. It cannot be promoted to authoritative current creation merely by adding an incarnation field.

`src/service/adapters/runtime-service-adapter.js:84-86` delegates create to ServiceRuntimeLifecycle.prepare. `src/runtime/service-runtime-lifecycle-operation-methods.js:135-211` performs another optional operation journal, then driver.prepare(definition, prepareContext). It passes no authoritative common creation transition. Its idempotent reconciliation is driver behavior, not a durable stale-generation fence. `src/runtime/wasm-component-driver.js:396-417` calls WasmServiceLifecycle.createReplica with definition and replica IDs.

`src/wasm-service/wasm-service-lifecycle.js:183-218` creates from the supplied definition.serviceId, checking local live/retiring resource custody and founding replica set only. `administerWriter:236-244` selects CURRENT instance by serviceId. No creation origin travels from catalog/currentness owner. Old invocation holding old object is distinct from a later retry selecting replacement object.

## Minimal adversarial schedule and obligation

1. Current creation I was once authorized; legitimate CREATE(I)/INIT(I) intents are retained for replay.
2. Existing creation owner accepts successor J for the same serviceId. This acceptance must itself be one durable exact-expected transition, not a local map or “latest timestamp” inference.
3. Local application storage is legitimately absent/fresh before INIT(J). Delayed CREATE(I) arrives. If it obtains authority merely from its old successful record or supplied incarnation, it can install I locally; subsequent INIT(I) replays the demonstrated revival.
4. A one-time authoritative read can also become stale across awaits: read current=I; J becomes current; paused creation resumes with I. A creation token alone therefore identifies historical intent but does not supply an adequate activation handoff/revocation contract.

The current prototype has no step2 authority or step3/4 handoff. This audit does not claim the entire schedule has been executed; it identifies exactly which owner contract must exclude it. A trusted-process threat model does not excuse retained legitimate old retries.

## Smallest complete missing interface

The existing service creation/catalog/definition owner must define a durable per-service current-creation transition: immutable create request identity/content, exact expected predecessor/current state, chosen common incarnation, exact historical outcome and supersession/retirement behavior. The resulting historical receipt must be explicitly distinct from permission to activate now.

The creation-to-runtime interaction must state who authorizes activation of that exact incarnation, how delayed CREATE and stale await continuations are refused or safely completed, how all replicas receive the same binding before writer INIT, and how a missing local file cannot reset that authority. A local-only expectedIncarnation supplied by the CREATE sender is not sufficient. Local construction/recovery must compare the established authoritative binding with retained database/image and refuse mismatches without overwriting them. Writer application must compare its stored binding deterministically, not make a remote/cache lookup per apply.

The routing/consensus/storage portion is parent-owned parallel analysis: old incarnation traffic/history must not enter J. Existing groupId serviceDefinitionId, replica-address identities and storage keys must carry or consume a reviewed creation binding consistently; changing only INIT leaves stale CREATE or old consensus history exposed. The selected protocol also needs creation-bound recovery before replicas can serve; shared application-image import remains separately owned and HOLD.

A narrow extension to existing records is structurally possible, but it is not merely one field: current-service arbitration plus supported activation/handoff must first be declared by those existing owners. No current complete implementation or already-authorized capability can be pointed to that supplies it. The exact STOP is the missing service creation-currentness/activation-to-consensus contract, not the resolved writer sequencing/schema policy.

## Proof required after that contract

- I refused before INIT(J) after J's authoritative creation choice, with no previous local application file.
- Delayed exact CREATE(I) receives historical outcome separately and cannot install/activate I.
- Current J constructs common binding and performs INIT/write normally.
- Same-file current I restart/replay retains exact original outcomes.
- Pause after authoritative selection; supersede; resume stale continuation: no stale installation or current-authority claim.
- Old captured-instance callbacks cannot mutate or report current replacement; new old-intent retries cannot retarget silently.
- Retained DB/image mismatch refuses without mutation; old consensus/routing/storage identity cannot masquerade as J.

No production changes, test execution, broad sequencing revision or new authority introduced by this audit.
