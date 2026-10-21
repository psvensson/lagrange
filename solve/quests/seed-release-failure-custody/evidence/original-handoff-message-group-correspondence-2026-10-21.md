# Original handoff: message-group registration and activation correspondence

Source inspection at runtime candidate `393f411ca09449898465cc3cb7320c03fba2aba8`,
also unchanged under the next-unit evidence checkpoint
`e69db481f37ab5633d64de7b6e7345426d9286b3`. This is a bounded input to the
`retained-seed-original-handoff` pre-source contract review. It is not a
production reproduction, implementation approval or acceptance receipt.
Exact source blobs and hashes are in the adjacent input manifest.

## One submission and its missing answer

`SeedRegistrationPhase.registerServices` calls the existing
`MessageGroupServiceRowOwner.registerReplica` and installs returned evidence
only after that call fulfills (`seed-registration-phase.js:247-266`). The row
owner mints its own `created_at` through `buildRegistrationRow` before invoking
the writer once (`message-group-service-row-owner.js:398-402,427-459`). The
mint is the process-local high-water owner (`service-row-incarnation.js:21-33`),
not necessarily the caller's requested timestamp.

The `await insertSystemTableRow` at row-owner line449 is outside a catch.
A thrown result therefore escapes before the private reconciliation helper
at line271 can observe the row and before the phase stores evidence. A returned
non-applied result takes that helper; a thrown lost response does not. The
bootstrap adapter simply forwards the INSERT and normalizes affected-row
counts (`system-table-writer.js:28-32`). CDC turns an unsuccessful SQL result
into a throw (`cdc-integration-service-mutation-operations.js:247-269`) and
preserves thrown failure through its catch. No call in this inspected chain
returns the prebuilt row to the phase after that failure.

Calling `registerReplica` again mints another birth. A caller's catch and retry
therefore cannot establish the new Quest's reserved original identity or
single-submission right. Intercepting the writer to recover its row, supplying
arbitrary `extraFields`, or manufacturing registration evidence would copy the
row owner's decision and is not an approved solution. The original grant and
reserved birth must be consumed by the existing row owner before the one
submission, with an explicit retained SUBMITTED obligation after an unknown
answer. This is a required correspondence boundary, not approval of a new API.

## The actual readback ingress

The row owner's `observeMessageGroupService` requests an owner-RPC-required,
leader-required read, catches failure and reports unavailable
(`message-group-service-row-owner.js:100-122`). Its registration matcher
checks seven fields, including STOPPED status and `state_entered_at`, but does
not check `replica_id` or `create_attempt_token` (lines125-135). The helper
cannot acknowledge an already ACTIVE exact original birth through this matcher.
An unavailable read is not INSERT permission; the helper throws a typed
deferred result when it has no row (lines271-287).

There is a concrete adapter correspondence gap before any read can run:

1. The seed phase's `ensureSystemTableWriter` creates
   `BootstrapSystemTableWriter` (lines685-698).
2. `readAuthoritativeControlPlaneRows` dispatches directly to a supplied
   `readAuthoritativeRows` method; it does not construct read authority
   (`control-plane-system-table-gateway.js:183-199`).
3. The bootstrap writer forwards its options to CDC unchanged
   (`system-table-writer.js:51-54`), whose alias forwards them to its read
   implementation (`cdc-integration-service-authoritative-read-delegates.js:282-288`).
4. That implementation first requires a frozen `options.readAuthority` and
   returns READ_AUTHORITY_REQUIRED otherwise
   (`cdc-integration-service-authoritative-read-flow.js:429-435`). The MG call
   supplied the read mode and leader mode, not this authority.

The existing gateway `executeRead` constructs canonical authority through its
owner (`control-plane-system-table-gateway-read-dispatch.js:66-88`). A complete
repair contract must bind the actual live readback path to that existing
authority, and prove its reachability with public admission closed. Merely
calling the present bootstrap adapter's read method does not meet that bar.
This source observation does not establish an executed lost-response failure
or justify substituting a local SERVICES snapshot for current authority.

An existing gateway instance is already constructed before registration. The
seed startup plan calls `seedRuntimeBridgeOwner.acquireSqlQueryEngine` before
participant release (`seed-startup-plan.js:42-45`). That owner constructs the
normal SQL query engine, attaches it to CDC, and disables migration auto-wire
and automatic distributed-transaction recovery for this acquisition
(`seed-runtime-bridge-owner.js:46-66`). The engine initializer constructs its
ordinary `controlPlaneSystemTableGateway` through the existing runtime bundle
(`sql-query-engine-instance-initializer.js:66-82`), and its existing getter
returns that instance (`sql-query-engine-lifecycle-and-callback-dispatch.js:249-250`).
The bundle creates the gateway and a frozen dependency bundle; it does not
start a control-plane coordinator (`control-plane-runtime-bundle.js:14-69`).
Thus there is no need to construct a second gateway or start ControlPlaneSetup
merely to access the canonical read authority ingress.

After that ingress constructs authority, the gateway forwards canonical request
options to CDC (`control-plane-system-table-gateway-read-strategies.js:343-414`).
The owner-RPC path uses the existing engine's `queryExecutor.executeOnPartition`
for the declared system partition and required-leader mode, under the existing
CONTROL_PLANE_RECOVERY_ELIGIBLE readiness dimension
(`cdc-integration-service-owner-rpc-read-execution.js:356-470`). Successful
required-leader answers are rejected without the serving replica's valid leader
witness (lines60-87). Having this engine and gateway does not establish that
routing and live owner readback succeed before SERVICES/catalogue publication.
That is a separate concrete dependency for the new contract and an actual
lost-response witness; it must not be solved by treating a local snapshot as
permission or invoking broad hydration/control-plane startup.

## Activation after readback

The existing `activateReplica` is the activation owner. It invokes
`runHandlerBoundActivation` with source resolution, exact-handler checking and
the ACTIVE effect (`message-group-service-row-owner.js:464-483`). The lifecycle
lane serializes that operation; after resolving its source, the exact handler
check and opening of the effect section run without an intervening await.
Handler retirement waits until the ACTIVE CAS and its lost-answer readback
settle (`replica-state-machine-serialization.js:89-125,172-184,237-262`). This
existing interaction should remain authoritative.

The CAS includes source `created_at`, status and lifecycle generation
(`message-group-service-row-owner.js:231-268`). Its failed/thrown answer is
resolved by an exact-created-at readback. However, the initial source resolver
accepts supplied registration evidence or reads a current row (lines507-522).
`requireMessageGroupActivationSource` checks IDs and lifecycle state, but does
not bind that initial row to a separately reserved original created_at or token
(lines196-222). A fresh authoritative row under the same IDs is therefore not
by itself proof of the prospective original grant. A retained-grant repair must
bind that identity before activating; it cannot fabricate the evidence map.

The public seed orchestration currently performs MG activation after full
control-plane initialization and seed-node registration
(`bootstrap-service-seed-workflow.js:415-446`). Its wrapper enables transient
deferral and supplies the phase evidence map
(`bootstrap-service-runtime-methods.js:58-83`). The bounded handoff may not
interpret a skipped transient activation or a count smaller than the complete
cohort as completion. The shared activation helper itself checks actual
handlers and runs each owner activation
(`message-group-service-activation.js:104-155`); the reviewed new contract must
use those owners with all exact identities and endpoint prerequisites while
keeping unrelated writers and external admission closed.

## Required discriminator and remaining obligation

The actual operation must preserve: a prospectively reserved exact MG birth;
durable consumption before one INSERT; a lost native commit response through
the real writer; available exact live-owner readback; exact handler-bound ACTIVE
handoff; and cleanup custody. The paired negatives must distinguish wrong
token/birth, unreadable owner, absent row after unknown submission, stale
handler and a substituted successor. Absence, timeout and cold SUBMITTED may
not recreate a submission right. Source review alone proves none of these
executed cases. The wider lower-SQL trace and its independent review remain
separate inputs; all current seals and broader failed gates remain unchanged.
