# Failed control release: preserve the already returned cause

Base: be93c7e5d9a76a39e76a530c93715521b2281356; production src equals be25caa5.
This unit fixes loss of failure provenance, not release recovery or historical causation.

## Existing path and owned transition

Trigger: dependent participant release enters releaseControlOwnerFirst.
Authoritative facts: existing local control leader or routing hint chooses a
recipient; actual control release supplies current proof. The current validator
alone decides acceptance. A hint grants no authority.
Permitted effect: the existing failed-control wrapper returns UNAVAILABLE with
CURRENT_CONTROL_OWNER and its existing retryAfterMs, node and outcome.
Durable commit: none introduced. Underlying control origin/OPEN and any ongoing
native work retain their existing owners and are not rolled back by this answer.
Lost answer/restart: existing retry/recovery reconstructs authority. Added fields
are disposable failure observation, never consumed as permission or scheduling.
Remaining obligations: all native, release and recovery obligations remain with
their current owners. Historical refusal attribution remains separately open.

## Proposed bounded change

At src/node/replica-handler-participant-cutover.js failed-control projection,
append controlMissingFact, controlPhase and controlReason from the settled nested
answer. Snapshot each string once; null for absent/non-string; cap diagnostic
text at a named 512-character bound beside the existing cutover bounds. No
coercion, owner read, new await, transport request or callback. Existing outer
fields and outcome precedence remain unchanged. No retained full answer, stack,
census or cyclic object graph. Ordinary successful release is unchanged.

The diagnostic trace retains these fields, while complete original delivery
records determine whether a corresponding control RELEASE was dispatched.
Nested release_deadline alone is not sufficient to infer pre-dispatch expiry.
No independent validator is introduced for the control proof.

## Witness and interpretation

Reuse the real native PartitionService/ReplicaHandler protocol fixture and its
contract-shaped in-process transport. Extract fixture mechanically for shared
use with the separately owned deadline/recovery tests. Root owns provenance
controls; the recovery writer owns extraction and its separate witness.

Required branches: successful control release; missing destination; selected
local control with client pre-dispatch expiry; delivered nested refusal. Use an
injected TimeSource with explicit fixed reads for deterministic expiry ordering,
never real sleeps or altered production bounds. Record exact transport calls.
Before source change, the provenance assertion must fail because nested fields
are absent; all claimed setup and owner effects must engage first. A targeted
revert of projection must reproduce that assertion afterward.

This is a source-observation unit, distinct from the previous immutable-source
passive diagnostic. Frozen helper changes must remove introduced complexity and
preserve original transport once / exact returned promise semantics. Original
seed assertions and 3000ms budget stay intact. One declared actual-entry lab run
follows controls and independent review. Interpret only the measured path; if
historical wrapper does not recur, its cause remains unresolved.

## Review and proof limits

Review all listed Quest categories with source/evidence paths; enumerate all
findings. Check no extra owner acquisition, no stale grant, no budget restart,
ACK/noHandler classification unchanged, no nested object retention, capture
errors visible, cleanup retaining failures, and explicit diagnostic-only status.
No U1, TX1, FreshMG, whole-startup recovery, distributed safety or release claim.

## Independent design review refinement

Reviewer control_source_review approved test-first implementation with explicit
requirements: diagnostics must not invoke accessors or replace the original
refusal, bounded strings must state their truncation ceiling, expiry setup must
reach the nested client guard, and delivered-refusal setup must prove an actual
processed route. The implementation will extend the existing
participant-release-diagnostic-observation owner for descriptor-only, captured-
intrinsic reads of the three own data properties, refusing proxies/accessors as
unavailable observation. Projection fields are not exact identities beyond the
512-character bound. This adds no second semantic decision owner.

The existing native protocol fixture uses an empty system-table cache and a
substituted remote topology hint when remoteControl is selected, in addition to
in-process transport and optional handler clock. It proves registered owner
behavior, not actual remote publication or cross-host routing availability.
