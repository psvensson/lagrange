# Creation-binding gate: final independent content-bound review

Verdict: **ACCEPT the evidence/owner-gap gate for non-main preservation. Implementation remains HOLD.** This is approval of the read-only STOP diagnosis and proposed owner interaction, not approval of a complete creation protocol or source implementation. No test execution or production/test edits were performed by this reviewer.

Exact reviewed artifacts under `solve/quests/wasm-writer-slots-v1/creation-binding/`:
- CONTRACT-GATE.md SHA256 `dbbff302ae550f7375ee04061ed7a5cf157d9aac5db8f4b10765592c570f51cc`.
- source-manifest.json SHA256 `83bcaac7792756b9b806e8e85b919c311d6861fdc0d557452782f8dca0017c90`.
- Source HEAD `c968fc6ec5c88424342e306ae66b619c06e564eb`.

## Source and preservation verification

Independently checked all21 source manifest entries against committed c968fc6 bytes and Git blobs: all match. `git diff c968fc6 -- src test` is empty at final review. Only appended Quest/handover and new creation-binding documentation are pending. No changed native witness, replica/runtime source, writer source, test input, schema, ratchet or prior result is hidden in this packet.

Fresh shared checkout read matches manifest: HEAD0996d7576516af24f5f4d3e1e9aee37c775aabae; exact18 staged paths; staged binary diff SHA2560b2ea79142a13f4dcada523f01108fbd8a4809492838e23f7a0246a7159953fc. This is an observation, not a continuing lease. Process/lab inventory statements are attributed to the recorded read-only observation, not converted into a reservation.

Five source-anchor offsets were corrected within this single review: command identity199; unsupported activation242; request-binding reconciliation198; runtime adapter84; writer constructor/classify76/125. Corrected artifact hash above includes those fixes. No substantive claim correction is outstanding.

## Why STOP follows the user's selected exception

The selected decision is preserved: logical serviceId may be reused, and the existing creator must durably bind a common incarnation before INIT. The document does not reopen caller identity, writer sequencing, acknowledged retirement or the new format. It does not ask the user to choose those again.

The missing fact is concrete: no inspected existing durable current-service transition plus activation-to-genesis handoff prevents old CREATE from gaining current authority after supersession. The catalog owns immutable operation/installation history, with authoritative lookup and exact replay, but `requestInstallation:449-544` does not choose a per-service current incarnation. `ServiceInstallationReconciler:242-276` deliberately records activation unsupported for this catalog route. `ServiceDefinitionsOwner.reconcileRequestBinding:198` owns Binding-derived Cell desired state, not consensus-WASM incarnation arbitration. The actual runtime CREATE path (`runtime-service-handler:224,369,739`) uses local maps and cached definitions, and the optional lifecycle journal does not carry a durable common creation result into adapter construction.

A field added to a constructor would therefore represent caller-supplied historical intent without the currentness decision that the user requires. The gate names exactly the incompatible owner interaction and stops there, as authorized. It does not claim that the requirement is impossible to implement in those existing owners; it says their current contract cannot be assumed to supply it. The proposed upstream unit may minimally extend existing records once its complete authority/handoff is reviewed. It does not authorize a parallel incarnation service.

## Correct scope distinctions

Catalog-installation activation being unsupported does NOT mean all current WASI Cell execution is unsupported. The document explicitly preserves that distinction. `WasmComponentDriver.prepare:333-357` routes request-cell definitions separately from its consensus-replica path. Architecture runtime-components282-283 identifies current WASI execution in placed runtime-service Cells with table-backed durable data. The stale architecture statement that startup constructs no WasmServiceLifecycle is correctly qualified by actual `runtime-startup-wiring:76`; the same source's lines30-31 explicitly say module-mirror/port-allocator dependencies are absent. Neither construction nor the native fixture proves production consensus-WASM activation.

The group/peer/storage observation is accurate: current wasm consensus request uses serviceDefinitionId as groupId, replica identity for peer/address, and data-directory serviceId/replicaId placement. `raft-rs-ingress.routingRefusal:95-113` checks group and recipient. These checks are real but do not by themselves distinguish reused application incarnations. The gate does not claim a demonstrated old-message Raft violation. Including ASYNC/timer/history isolation prevents the proposed fix from fencing only v1 WRITE while leaving other accepted history able to enter J.

The previously measured recreation file remains the sole measured finding: two controls passed and one conditional SQLite revival assertion failed at9b53962f. This audit adds no executed native RED, no completion GREEN and no additional source-negative. Earlier files and claims remain immutable.

## Applicable-category closeout

Owner interaction: one existing creation/currentness authority is required; immutable installation history stays historical. Proposed establishInstance, resolveCreation and admitReplicaForInstance are explicitly obligations, not secretly implemented APIs. Atomic per-service selection, replica admission, publication/retirement and application genesis have named existing owners. No local cache/projection or random UUID is promoted into authority. CAS currentness and asynchronous creation are addressed together, avoiding a new read-then-create race. Existing planner remains a consumer.

Admission/gating: INIT confirms already established stored binding; absent local storage is not fresh authorization. Old CREATE and INIT must both be rejected appropriately before INIT(J). Currentness read alone is insufficient. Retained mismatch refuses without overwriting data. No quota/timeout/priority bypass is proposed. Reason shapes and actual interface code remain future implementation obligations, not certified here.

Concurrency: competing creators require one durable winner; stale continuation across supersession is explicitly a resume acceptance case. An old captured object and a newly routed retry are separate. Atomic application is the intended decision point; local single-flight/maps do not satisfy it. No claim of a proved distributed activation lock/service bound.

Recovery/replay: lost creation replies preserve original operation/binding; historical success is separate from current activation. Retired/unavailable history cannot become fresh. Current same-file restart retains binding; fresh storage must consume authoritative binding; conflicting image refuses. Shared snapshot installation remains an open existing-owner obligation.

Transport: raw group/recipient checks are accurately scoped; old traffic/history requires creation-bound identity handoff. No ACK, cached role, address reuse or constructor success is treated as committed activation. No new filter, second transport authority or consensus protocol is prescribed.

Retry: exact retained CREATE must never be retagged from I to J, and repeated old success cannot reauthorize I. The gate proposes no retry loop/timer or changed deadline. Retirement and missing-history semantics must preserve non-reexecution; the concrete cadence/custody code remains unimplemented.

Harness fidelity: source-backed schedules are explicitly distinguished from tests. Future witness requirements demand I rejection BEFORE INIT(J), J success, retained I replay, lost reply, competing creates, superseded asynchronous CREATE, instance callback isolation, mismatched image and a same-test semantic mutation. No missing-symbol/setup failure can count as semantic proof. No existing tests were executed or relabelled by this gate.

## External reference and remaining boundary

The Kubernetes name/UID distinction was checked against the official names documentation: reusable names and system-generated instance UIDs distinguish historical objects. [Official source](https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#uids). This supports the conceptual distinction only, and supplies neither Lagrange's currentness transaction nor its recovery fence; the gate says so.

No final source, native activation, snapshot, capacity, completion, static or full release proof is approved. The prepared v1 tests and prototype static debt remain pending. Publication SHA/archive verification belong to subsequent preservation and are not claimed here. Proceed with documentation/evidence preservation and STOP for the specific existing-owner creation-currentness/activation-to-genesis contract; no source correction follows from this verdict.
