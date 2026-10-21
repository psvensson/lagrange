---
audience: development
documentClass: current
---

# Pre-source clarifications for the original-handoff draft

Date: 2026-10-21. Author: subagent release_recovery_writer. Additive design
record; no source, test, Quest seal or receipt changes. This follows the frozen
contract draft SHA256
`8be35255d43d3319ef6e002216c46fbe146973842bf7206a0b5a14728857d3b9`
and independent review SHA256
`6c17050d60a3c6877065f2dff4abae83b6f8656c5dac9fc82fb29c9fa6fcf573`.
That review approves a narrow red unit and actual public-witness preparation,
not source implementation. These clarifications do not widen that verdict.

## Registration effect inventory is required before source

All-UNUSED refers to the original SERVICES birth rights and the reserved
cluster-id publication right. It does not mean all other metadata is absent
or inert. The existing registration phase also writes MESSAGE_GROUPS before
SERVICES, then meta service definitions/endpoints, system TABLES/PARTITIONS,
partition sizes, dynamic configuration and the current epoch. Its sequence is
`src/bootstrap/phases/seed-registration-phase.js:121-128`. Dynamic CONFIG rows
are distinct from the reserved CONFIG cluster_id singleton.

Before changing source, enumerate each existing effect the bounded handoff
invokes, its prerequisite, authoritative result and lost-response/cleanup owner.
Prove all original SERVICES and cluster-id submissions pass their consumption
boundary; do not silently skip the other phase calls, infer their success from
all-UNUSED, or introduce a second registration algorithm. A smaller dependency
cut needs explicit correspondence and independent approval before changing
calls. The unchanged public baseline may expose such a prerequisite before the
selected ENABLE; that outcome remains a first divergence, not a native witness.

## Public completion is an error path, not a runtime union

Use an owner-named typed Error with code HANDOFF_COMPLETE_SERVING_DEFERRED and
an immutable observation of committed handoff. Throw it at startSeedNode's
existing startup failure boundary, before ordinary success/runtime construction.
The internal BootstrapService result must retain its semantic code and primary
observation until that boundary; this mapping must not report success:true or
replace the error with an untyped message. Proposed names are not implemented.

The public promise rejects with that exact typed primary only after
runStartupWithCleanup completes its existing unwind. If cleanup rejects, its
existing AggregateError retains the primary as cause and preserves the cleanup
error. Exclusive directory release still depends on successful ordinary cleanup.
No ad-hoc deferred result may reach bindDataDirectoryProcessOwner: it reads
runtime.shutdownRuntime and assumes a live runtime handle. There is no newly
returned shutdown-capable recovery object, swallowed failure, or new controller.

Source correspondence: startSeedNode currently throws on unsuccessful bootstrap
at `src/lagrange-runtime-startup.js:467-474`, before its normal runtime work.
acquireLagrangeRuntime binds the returned handle at `:767`; startLagrangeRuntime
wraps acquisition in runStartupWithCleanup at `:780-790`.
`src/entrypoint-startup-acquisition-ledger.js:42-73` owns unwind, exclusive release,
primary rethrow and AggregateError. `src/storage/data-directory-process-owner.js:64-75`
owns the live-handle binding. All bytes still match fixed product393.

The witness must distinguish this named nonserving rejection from a generic
startup failure, then read retained commits and resource closure independently.
A bootstrap phase flag, diagnostic handoff summary or error code alone proves
neither the durable transfer nor physical cleanup. Complete mutation, ingress,
issuance-abort and caller/error correspondence remains required before source,
as the independent review states. Full serving and cold mid-handoff progress
remain explicitly unsatisfied larger-plan obligations.
