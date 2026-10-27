# U1 v3 D2 clarification: registered creation admission versus resource custody

Status: **PROPOSED for independent review; no implementation approval.**

Author: `subagent:/root/u1_inventory_lifecycle`, 2026-10-18.

This append-only correction refines the physical-current predicate in approved
v3 and D2/D3. It preserves the total ordered table and every exact-origin,
shutdown, absence and successor-protection rule.

## Source fact requiring clarification

`isLiveWasmServiceReplica` in `wasm-service-replica-lifecycle.js` defines
`.live` as STARTING, READY or CLEANUP_REQUIRED. That predicate protects
resource custody: a failed opener retaining cleanup resources must block a
replacement. A newly registered object is CREATED, so `.live` is false before
the driver can retain its prepared descriptor and call start. Literal use of
that property in D2 would refuse every normal bound prepare and permit a
CLEANUP_REQUIRED object to claim current start/projection admission.

The existing initialize owner admits CREATED, joins STARTING, accepts READY,
and refuses CLEANUP_REQUIRED, STOPPING and STOPPED. Current projection/start
admission must follow those exact owner states instead of the resource-custody
property's different purpose.

## Corrected owner predicate

After the unchanged closed/unavailable/capture, absent-entry and different-full-
origin checks, WasmServiceLifecycle answers the exact registered origin:

| Physical owner's lifecycle state | Current-creation observation |
| --- | --- |
| CREATED, STARTING, READY | CURRENT |
| CLEANUP_REQUIRED, STOPPING, STOPPED, unknown state | UNAVAILABLE with the retired/unavailable reason |

The state test is defined once inside the physical owner. Consumers still
receive only CURRENT/ABSENT/DIFFERENT/UNAVAILABLE and never read or copy the
replica flags. `.live` itself remains unchanged so its existing cleanup and
successor custody guards retain their semantics. CURRENT does not assert
native readiness, a serving grant, journal completion or a future permission;
actual initialize/start still run their existing owner guards. A newly CREATED
origin may be replaced according to the existing lifecycle contract; every
consumer must reobserve immediately before any later canonical write/start.

The ordered D2 table remains essential: a registered different origin is
DIFFERENT even in STOPPING/CLEANUP_REQUIRED, and an exact registered fenced
origin is never ABSENT. Shutdown makes every request UNAVAILABLE before any
per-object state is considered.

## Binary additions

Use real lifecycle objects to observe CREATED immediately after createReplica,
then STARTING and READY through actual initialization: CURRENT in each case,
with normal bound prepare/start remaining reachable. Exercise cleanup failure
and exact STOPPING/STOPPED while still registered: UNAVAILABLE. A different
registered origin remains DIFFERENT in those same states. Absent entry and
closed lifecycle keep their distinct D2 outcomes. The existing independent
currentness/custody test owner is implementing these controls; none has yet
executed. Mutating CURRENT back to `.live` must fail the CREATED and
CLEANUP_REQUIRED controls without weakening the resource-custody predicate.
