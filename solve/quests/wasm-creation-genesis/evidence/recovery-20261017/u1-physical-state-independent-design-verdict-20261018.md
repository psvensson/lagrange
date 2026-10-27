# U1 D2 registered-state clarification: independent review

Reviewer: `subagent:/root`, 2026-10-18. Author:
`subagent:/root/u1_inventory_lifecycle`.

Verdict: **APPROVE design clarification and required oracles only** for
`u1-inventory-v3-physical-current-state-clarification.md`, SHA256
`64f1b2173b71717fefe031ae8ddb976d190ea577e8d5ea9401ff432632645534`.
The reviewer read and hash-checked that complete text, the actual initialize,
failed-open cleanup and live-resource predicates, createReplica registration,
and the new driver's immediate post-create observation.

The prior D2 prose used live ambiguously. The existing `.live` property
protects resource custody: STARTING, READY and CLEANUP_REQUIRED count as live,
while a newly registered CREATED object does not. Using it as start/projection
admission would reject every initial bound prepare and incorrectly permit an
exact cleanup-required object to claim CURRENT. The correction keeps `.live`
unchanged and defines the new observation predicate once at the physical owner.

| Ordered owner observation | Result |
| --- | --- |
| Lifecycle closed, unavailable dependency, or invalid capture | UNAVAILABLE |
| No registered object | ABSENT |
| Registered different full intent/token, in any per-object state | DIFFERENT |
| Exact registered object in CREATED, STARTING or READY | CURRENT |
| Exact registered object in CLEANUP_REQUIRED, STOPPING, STOPPED or unknown state | UNAVAILABLE |

CURRENT is an immediate observation that the captured object can enter the
existing initialize/start path. It asserts no serving permission, native
readiness, physical completion or permission lasting across an await. The
existing initialize and publication owners still decide those outcomes.
Different-origin precedence protects even a fenced successor. Exact fenced
registration must never be reported ABSENT. Consumers use this total answer
instead of copying lifecycle flags; each later canonical effect reobserves
without an intervening await.

The required controls use actual registered lifecycle objects: normal CREATED
prepare/start reachability, STARTING/READY, failed-cleanup custody, exact
STOPPING/STOPPED, different origins in those same states, absent entry and
closed lifecycle. An unknown-state injection is explicitly a component
negative. Returning to the `.live` predicate must fail both the CREATED and
CLEANUP_REQUIRED discriminators. Preserve the original predicate and its
resource-custody tests. These source and oracle obligations remain part of the
complete independent corrected-U1 review; this clarification supplies no
execution receipt and does not release U2 implementation.
