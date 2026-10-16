# WASM v1 creation-origin checkpoint: HOLD

The user's selected bounded writer slots, exact outcomes and acknowledgment retirement remain the direction. This checkpoint stops on a newly identified creation-owner counterexample, not on the three previously resolved policy choices.

The design was independently approved before initial source work (design review v2), then qualified by the independent INIT/recreation audit. The source is an incomplete, frozen review prototype. It is not implementation approval, a finished completion repair, F1 supersession, or merge permission.

## Counterexample and exact missing owner input

For a service S initialized with incarnation I, retain legitimate INIT A, ENROLL E and write W. A separately authorized fresh creation of S uses new storage and intends incarnation J. Before J's INIT is ordered, a delayed retained A retry calls `WasmServiceLifecycle.administerWriter(S,A)`. That entry selects the current hosted instance by S; no current durable creation token is checked. UNINITIALIZED writer metadata accepts A. E can recreate slot generation1 and W sequence1 can execute again.

This is conditional on supported fresh recreation retaining serviceId. Ordinary same-file restart retains I and its outcomes; it is not the failing schedule. Different serviceId rejects the old input. Old files need not be deleted: new replica placement can use distinct files while retaining historical bytes. The source audit identifies callable boundaries; no end-to-end product recreation, native RF3 delivery, data loss or snapshot behavior is inferred from a component trace.

Current creation/runtime source does not enforce never-reused serviceId and does not pass an authoritative creation origin into this INIT/application seam. Fixed service names also exist. An old invocation already holding the old replica object is different from a newly delivered retry selecting the replacement object.

## Required bounded next interaction

The existing service creation owner must supply an authoritative current creation identity to the existing WASM lifecycle/application owner before INIT can choose writer incarnation. INIT must match that identity at admission and deterministic application; retries must retain their original creation binding. Restart must retain it with the application image. This is not supplied by a random per-replica UUID, current placement path, transport messageId, or a caller's assertion of freshness.

Alternatively, recreation could be explicitly restricted to an enforceably never-reused service identity, with its existing creation owner proving/enforcing that restriction. That would narrow supported recreation semantics and requires an explicit owner decision. Neither alternative is silently implemented here, and neither creates a new permit or outcome service.

The smallest next source unit is this creation -> lifecycle -> INIT binding and the corresponding current-format recovery rule, followed by the already frozen completion/replay tests. No changes to the runtime drain loop or generic propose semantics are justified by this finding.

## Preservation and verification limits

Original WASM witness/fixture, F1, W07 and runtime source remain unchanged. Six new test/fixture files preserve the v1 work. Only the reviewed recreation counterexample is selected for first execution after source freeze; the RF3 completion, completion-only mutation, other application/client/lifecycle controls and affected proof cone are not claimed executed or passed in this stopped packet.

Scoped source ESLint passes. Normal pre-commit reports new literal, decision-boundary and complexity debt in the prototype; these are not called inherited failures. They remain unresolved because source is frozen. WIP preservation under the documented hook/runbook route does not satisfy the gates or raise any ratchet. The test-only checkpoint defers inventory regeneration because the source prototype was unstaged; the following combined source checkpoint regenerates metadata for the exact candidate.

The shared application-image/native-import dependency remains open. Clean same-file reopen is not process-loss, power-loss or supported snapshot proof. The complete release remains unsealed/unactivated, F1 supersession and the runtime increment remain HOLD, shared-control-wave remains HELD, Runner/TAP remains PARKED, and PR122 remains rejected.
