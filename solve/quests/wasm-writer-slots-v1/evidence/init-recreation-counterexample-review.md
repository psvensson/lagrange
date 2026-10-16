# INIT replay across fresh same-service recreation: narrow owner audit

Verdict: HOLD the current INIT/recreation contract. Concrete ambiguity exists at the selected trusted local admin boundary. This is a source/contract counterexample, not a native execution, reported data loss, or proof that ordinary same-file restart loses its incarnation.

Inspected current writer-v1 worktree source without edits or execution. The previously reviewed DESIGN.md explicitly says a newly recreated service chooses a new incarnation before INIT (line35); this audit finds that choice is not bound to the current creation by the proposed owner interface. This qualifies my earlier design approval on this newly identified interaction.

## Exact boundary

- `WasmServiceLifecycle.createReplica` (183-218) takes definition.serviceId unchanged, rejects currently live / retiring local resource conflicts, validates the provided founding set, computes database placement and constructs the new instance. It does not enforce never-reused service identity or consume a durable service-creation origin.
- `DataDirectoryManager.getWasmServiceDbPath` (181-191) is placement by serviceId/replicaId. A new replica-id set can use new files while preserving the old files. It is not an application-incarnation authority.
- `assertFoundingReplicaSet` (`wasm-service-consensus-port.js:74-88`) checks nonempty distinct identity membership, not relation to prior service incarnations. The consensus request (138-162) carries serviceDefinitionId, peerId and bootstrap membership; no trusted creation identity is passed into writer INIT validation.
- `WasmComponentDriver.#prepareConsensusReplica` (396-417) delegates the supplied definition and replica identities into this lifecycle. resolveDriverServiceId (181-187) reads supplied identity; it does not generate an enforced never-reused identity. Fixed-name meta-service definitions also exist (`meta-service-lifecycle.js:23-25,44-53`); do not assume every service identity is a fresh UUID.
- General service lifecycle CREATE journals by tenant/service/idempotency key (`service-lifecycle-operations.js:185-241`). No journal creation token is supplied or validated in `administerWriter`, `WasmWriterState` or the canonical INIT. Mere journal existence cannot fence this path.
- `WasmServiceLifecycle.administerWriter` (236-244) looks up the CURRENT hosted replica using serviceId at each invocation. It requires initialized instance, matching intent.serviceId and non-WRITE action; then delegates to writerCompletion.submit. It has no expected current creation token, instance-qualified capability, or durable fresh-creation binding.
- `WasmWriterState` constructor (77-95) creates UNINITIALIZED metadata in an empty DB. `classify` (126-139) accepts any valid INIT as NEW while initialization is null. `initialize` (202-209) records the chosen command and creates generation-zero slots. The caller's old incarnation and nonce are canonical valid bytes, indistinguishable from a newly chosen one at this point.

## Minimal schedule

1. Service S, durable application incarnation Iold, accepted INIT A, ENROLL E for slot0/generation1 and write W at sequence1. Trusted admin caller retains A/E for permitted lost-reply replay; writer retains W. They are legitimate old intents, not hostile new commands.
2. An explicit legitimate fresh creation/recreation of S is arranged, preserving old files as historical evidence and using fresh storage/replica placement. It intends Inew. Ordinary same-file restart is NOT this step: retained metadata would correctly reject conflicting INIT.
3. Before Inew INIT applies, the retained trusted caller retries exact A through administerWriter(S,A). The method addresses the current instance. Its metadata is UNINITIALIZED, so A is admitted and applied, choosing Iold again.
4. Exact old E is admitted against slot generation0/completed0 and advances to generation1. W again names the newly recreated matching tuple (S,Iold,0,1,1), so it is NEW and may execute rather than being fenced as prior-incarnation work. Even without E/W, Inew INIT now conflicts, so a stale retry has determined the new service's initialization.

An admin invocation already captured before shutdown stays on its old instance; that local object safety does not protect a NEW invocation of the retained retry after replacement. Expected slot generation/sequence fencing starts too late: those values are reset by fresh creation. The random nonce/incarnation's collision resistance does not help because the bytes are deliberately replayed unchanged.

## What is and is not established

No selected owner was found that makes a fresh same-service creation consume a durable creation identity before this admin entry, or that enforces nonreuse of serviceId. The inspected lifecycle methods permit the needed same-id replacement inputs. The complete end-to-end product orchestration for deliberate destructive recreation has not been executed; no claim is made that automatic stop/start deletes storage (it does not).

If supported recreation is instead restricted to a never-before-used serviceId, that must be an explicit enforceable owner contract, not an assumption derived from UUID conventions. If same-serviceId recreation is supported, INIT must be bound to an already authoritative fresh creation through the existing creation/lifecycle/application owners. Selecting that binding or tightening the supported recreation semantics is the necessary concrete owner decision; this audit does not authorize a new permit service, a local random UUID as replicated authority, raw database wipe, or a second ledger.

No source correction or tests run. Native-v1 fixture review remains a narrow valid approval of its exact first-creation completion witness; that fixture intentionally uses fresh identities and does not refute this reincarnation schedule. Production source should remain frozen pending this owner reconciliation.
