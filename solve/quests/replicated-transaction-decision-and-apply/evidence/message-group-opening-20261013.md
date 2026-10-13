# Message-group opening and retirement — native/owner boundary proof

Date: 2026-10-13. This is a WIP review result, not Solver acceptance, main integration, or release certification.

## Source changes

The existing exact-handler retirement owner now requires the named identity
outcome before reporting successful teardown; logging
`REFUSED_NO_IDENTITY` alone does not settle cleanup.

Seed and join CREATE now call the same
`initializeRegisteredMessageGroup` owner after registration and before
publishing the service. When initialization rejects, the owner attempts both
shutdown and exact transport-handler retirement, preserving the original
startup error. When both cleanup operations succeed, the service is never
published. When either fails, the exact failed service remains in the
existing host services map as cleanup debt so normal lifecycle stop may retry.
A repeated CREATE sees the debt and returns
`MESSAGE_GROUP_CREATE_CLEANUP_REQUIRED`, not CREATED. The map is not
a second serving authority; `initialized !== true` and `isShutdown`
remain fail-closed.

No address-only unregister, new lifecycle coordinator, retry loop, clock
or new durable state.

## Exact measured result

Workflow: `rs-raft-message-group-retirement`
Run: `38375350192`
Measured source HEAD: `c6f7790ce4d72a8e7a35aaf703a417a3cd9c9b56`
Artifact: `11800956297`
SHA256: `1c035f67d36331c1d81977e348c71c3df96d28bf0d13b51f4411e4484ed429ed`.

- `test/node/message-group-executor-activation-handler-boundary.test.js`: 43 assertions, pass
- `test/bootstrap/message-group-activation-handler-boundary.test.js`: 71 assertions, pass
- `test/node/replica-runtime-cleanup-custody.integration.test.js`: 8 assertions, pass
- Total: 122 assertions, all pass. No timeout exemption used.
- Focused ESLint, actual operation boundary audit, whitespace: pass.

A source-only negative removed the `requireReplicaHandlerRetirement`
invocation while retaining the rest of the exact candidate and identical
tests: 55/59 assertions passed; four refused-retirement assertions failed.
The candidate's test sources and runtime owner exports were unchanged.
This is behavioral negative evidence, not an import failure.

## Important coverage limits

The pre-publication failure and retained-debt tests directly exercise the
shared creation/retirement owner with a deliberately failed initializer and
real handler identity semantics. Other selected tests exercise production
message-group and replica lifecycle owners; this does NOT yet independently
certify a full seed and join failure with every real native resource opened,
an exact successor generation under a cleanup failure, a failed
post-initialize publication callback, or complete multi-host startup.

Independent review requested especially on: overlapping registrations under
one replica id, retaining incomplete shutdown before a retry, the map's
existing serving consumers, and whether post-initialize
`attachMessageGroupServiceBeforePublish` failure also needs this owner
rather than only `initialize()` rejection.

Historical pre-L6 migration, live post-kill TX1 COMMIT completion, FreshMG
stack integration, full static gates, and physical lab certification remain
unproved.
