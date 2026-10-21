# Independent ingress and autonomous-writer source discovery

Reviewer: `subagent:/root/control_source_review`. Date: 2026-10-21.
Read-only discovery at HEAD `e69db481f37ab5633d64de7b6e7345426d9286b3`,
source tree `ddf32b08e93c0b617f6ec24d0d70596e2888eec5`, identical to the
measured product source at `393f411ca09449898465cc3cb7320c03fba2aba8`.
This note identifies the existing entry points a proposed nonserving original
handoff must account for. It approves no source, witness result, receipt,
activation shortcut, or amended seal. No tests were run for this discovery.

## Public ingress begins before bootstrap finishes

`src/lagrange-runtime-startup.js:437-467` constructs and initializes BootstrapAPI
before awaiting BootstrapService.bootstrap. The API starts its move-assignment
sweep before registering routes/listening
(`src/bootstrap/bootstrap-api-server-methods.js:47-55`). The routes at
`:123-144` include bootstrap admission, service registration, and the RequestCell
wildcard; these do not all share one readiness decision.

* `src/bootstrap/owners/bootstrap-request-owner-handler.js:156-183` evaluates
  join readiness before awaited conflict work at `:232`, capacity lease
  acquisition at `:337`, and assignment reservation at `:498`. A prospective
  permanent handoff exclusion must prevent the lease/reservation operation,
  not merely keep its HTTP probe pessimistic. If a proposed exclusion can
  change while a request is in flight, its effect boundary needs corresponding
  revalidation. The successful response at `:552` is also joinable publication.
* `src/bootstrap/owners/service-registration-handoff-owner.js:541-615` checks
  SQL availability then performs token/current-row checks and the registration
  write. SQL acquisition is necessary for the handoff itself, so SQL absence
  cannot serve as its permanent public registration fence.
* `src/service/request-cell-http-adapter.js:224-298` checks shutdown,
  authentication, deadline and dispatch attempts. None is an explicit original
  handoff exclusion. The wildcard route must remain refused even if a usable
  binding is present; a currently empty cache is not an admission guarantee.
* The API's node-registration method is already unsupported
  (`src/bootstrap/bootstrap-api-server-methods.js:156-164`). This note does not
  invent a functioning separate node-registration HTTP route. Existing node
  publication occurs through the membership/heartbeat owners below.
* HTTP HEALTH reports ready once SQL exists
  (`src/bootstrap/bootstrap-api-server-methods.js:102-120`). A nonserving mode
  needs truthful outward observations as well as enforcement. Readiness output
  by itself cannot fence the other mutation paths.

The API sweep is not inert: `src/bootstrap/bootstrap-api-runtime-methods.js:370`
starts a timer whose reservation owner gathers cached/SQL reservations and can
reconcile or terminally mutate them
(`src/bootstrap/owners/move-replica-assignment-reservation-lifecycle.js:20-105`,
`:241-275`). An HTTP-only gate leaves that autonomous entry unaccounted for.

## Transport admission is narrower than all service dispatch

Seed infrastructure supplies `externalAdmissionEnabled: false` before router
setup (`src/bootstrap/phases/seed-infrastructure-phase.js:204-214`); setup starts
the real listener and self connection when a port is supplied
(`src/bootstrap/shared/message-router-setup.js:185-190`). The existing incoming
IDENTIFY gate at `src/transport/message-router-inbound-dispatch.js:143` refuses
nonlocal peer adoption. It is not a universal gate in SERVICE_MESSAGE dispatch:
`:88-90` captures a delivery and `:426-470` invokes the handler even when that
captured delivery is null. Individual handlers may enforce stronger authority.

`src/transport/message-router-connection-authority.js:134-145` binds a delivery
to the currently adopted socket/incarnation. It does not encode the proposed
nonserving mode. Neither wire `sourceNodeId` nor merely retaining the false
IDENTIFY flag is a complete proof that every remote effect is excluded. A
source plan must show the actual remote ingress enforcement while preserving
the local delivery and native consensus needed by the exact original cohort.
This is a code-path limitation, not an executed unauthorized-ingress claim.

Two later calls reopen admission: the seed runtime-ready checkpoint
(`src/bootstrap/bootstrap-service-seed-workflow.js:450-463`) and
`src/bootstrap/bootstrap-service-runtime-methods.js:274-317`. A deferred handoff
must not reach these ordinary runtime transitions.

## Hydration and control-plane construction start owners

Cache hydration invokes latency owner acquisition at
`src/bootstrap/phases/seed-cache-hydration-phase.js:182`. That acquisition starts
latency recomputation and CDC propagation immediately
(`src/bootstrap/owners/seed-runtime-bridge-owner.js:160-170`). Hydration also
installs migration workflow owners, normal CDC routing, table policy wiring and
the hydrated projection (`src/bootstrap/phases/seed-cache-hydration-phase.js:214-334`).
Calling the whole phase only to acquire a dependency would import these effects.

Likewise `src/bootstrap/shared/control-plane-setup.js` initializes a rebalance
coordinator at `:361`, unconditionally starts the owner-membership driver at
`:473` and SWIM at `:476`, and initializes lease, endpoint and replica dispatch
owners at `:531`, `:538`, and `:556`. The driver is deliberately independent of
the readiness it helps establish. A general not-ready projection cannot be
assumed to suppress it. These calls need either exclusion from the smaller
operation or individually owned, reviewed admission; acquiring the whole setup
is not a passive dependency construction.

The narrower `MembershipPublicationRuntimeOwner` constructor does not start
that membership driver. Its explicit node registration method at
`src/control-plane/owners/membership-publication-runtime-owner.js:156-174` and
endpoint method at `:196` name existing incarnation-aware mutation owners.
Using these is a plausible direction for an exact dependency cut, conditional
on the complete proposed row set, lower SQL behavior and original-allocation
authority review. It is not permission to introduce general node publication.

Do not substitute heartbeat for that narrow registration operation.
`src/control-plane/heartbeat-service-publication-methods.js:101-133` withholds
READY only when its cached row is JOINING and local lifecycle is not READY.
`src/node/node-service.js:171-193` defaults to automatic READY transitions.
`src/bootstrap/bootstrap-service-control-plane-runtime-methods.js:249-318`
performs node storage-budget persistence and a heartbeat during normal seed
registration. `NodeLifecyclePublication` remains the READY/lease publication
owner; a handoff must not use a cached JOINING observation as its only fence.

## Required internal work remains distinct

Infrastructure already starts the startup ServiceReconciler
(`src/bootstrap/shared/startup-service-lifecycle-owner.js:57-74`). The proposed
grant must be validated before desired/options entries can schedule retained
native opening. This reconciler, native Raft application, participant release
recovery and explicitly enumerated activation work must not be indiscriminately
disabled with the steady-state writers; they are the internal operation whose
permission and exact extent the new contract must establish.

Conversely, `completeSuccessfulBootstrap`
(`src/bootstrap/bootstrap-service-seed-workflow.js:216-240`) attaches normal SQL
and invokes steady-state writer/recovery/topology handoff.
`src/bootstrap/owners/startup-runtime-handoff-owner.js:113-184` starts lease and
heartbeat writers, can schedule another activation attempt, and activates
transaction recovery. The deferred path must avoid that finalization and the
ordinary admin composition at `src/lagrange-runtime-startup.js:554`, while still
joining shutdown and retaining unresolved resource custody. An optional local
admin-ready callback is also invoked by the ordinary control-plane checkpoint
at `src/bootstrap/bootstrap-service-seed-workflow.js:437`; its absence in one
public constructor is not a generic admission contract.

## Minimum design obligations and present limit

The complete proposal should bind a prospective nonserving operation before
listeners, refuse public mutation/lease/assignment/RequestCell ingress for its
entire lifetime, preserve only its exact internal cohort effects, enumerate
every activation dependency and publication, and keep ordinary completion,
READY/joinable promotion, transport reopening and autonomous steady-state work
unreachable. The fence must survive ordinary readiness improvements and remain
held through uncertain cleanup. A typed deferred return through the existing
cleanup path is still required; reaching literal ACTIVE and satisfying the
original seal remain separate proof obligations.

These are source-bound discovery constraints for the writer's pending complete
contract review. The existing public baseline is RED and proves no new grant,
activation, handoff completion, or safety of a future implementation.
