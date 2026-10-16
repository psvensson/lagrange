# Native event to held creation reconciliation: pre-source review

Scope: the existing wasm-creation-genesis Quest, on PR133 at
6ba84863490bff9a43874a03f69ad2afff4b5898. The operator requests author review
between stages, exact-source local-lab execution and no main merge.

The consumer is WasmServiceLifecycle, which already owns startReplica and the
held genesis continuation. ServiceReconciler's desired-count startup planner
and ServiceInstallationReconciler's unsupported catalog activation are not
substitutes: neither may reconstruct a bound creation from a current definition.
Use the existing OwnerKeyReconcileQueue mechanism within the WASM lifecycle;
there is no new scheduler algorithm, polling loop, durable store or permit.

Native progress/role/membership events enqueue the exact live replica and port,
not event payload claims. One key has one event-driven reconciliation in flight;
events during a wait retain one coalesced subsequent pass. Each pass reenters
startReplica and its existing genesis owner. Explicit starts and events consume
the same continuation and writer-completion owner, not a new proposal path.

Registration follows native initialization and precedes the ordinary initial
continuation, so that initial pass covers events before registration. Subscribe
once per exact port; stopped or replaced callbacks cannot retarget successors.
Shutdown disables/unsubscribes/discards pending work synchronously, aborts writer
interest through its owner, and joins actual in-flight work before reporting
native teardown complete. Queue shutdown alone is not settlement evidence.

Hold unchanged: no ACTIVE, endpoint, completion, serving grant, timers, new
resource ordinal or selection decision. Failure yields typed held/unknown state
through existing owners; a later native event may recheck, never repeat until
green. Scheduling observations do not supply authority.

Required proof: native RF3 starts with one explicit bootstrap per founder, then
leadership/APPLIED_PROGRESS produce INIT and observation with no caller retry;
follower progress, event burst coalescing, in-flight wake preservation, queued
and in-flight shutdown, stale callback/port replacement, no self-rearming, no
serving publication, shared writer-interest single proposal, and source-only
negative with unchanged assertions. Metadata/guest/loopback fixture limitations
remain explicit; this stage is not physical multi-host or native crash recovery.

## Author review before exact-source publication

The nine-case native companion passes with normal restored native dependencies.
Its default positive calls initial bootstrap once per founder; native leadership
and applied-progress events then produce INIT and observed genesis on all three
replicas without caller reentry. It also covers bounded 1000-event bursts, a
wake during an active pass, unchanged no-quorum deadline/UNKNOWN and late native
progress, stopped and replaced producers, direct/event single proposal,
subscription reuse, forged event payloads and actual in-flight shutdown joining.

The two earlier explicit-reentry suites retain every assertion but use the
fixture's existing queue scheduling seam to hold automatic delivery. This is
an explicit test schedule, not a production flag. Their first failures after
automatic INIT was enabled are retained as scheduling-premise incompatibilities;
the new companion exercises the live default. The initial missing-progression
baseline and the final frozen nine-case companion are distinct test identities.

A source-only dropped APPLIED_PROGRESS enqueue yields a real follower-observation
failure after native initialization. Removing only the actual shutdown-flight
join yields SHUTDOWN_DECLARED_CLOSURE_BEFORE_RECONCILIATION_SETTLED. Other negative
failures are retained, not represented as separate product defects.

Review treats queue shutdown/idle bookkeeping as insufficient evidence of
settlement. Replica retirement disables listeners and pending admission first,
then aborts writer interest and closes native resources before joining the actual
continuation. Waiting before writer abort would deadlock. The exact initialized
registry predicate belongs once to WasmServiceLifecycle and is consumed by both
START and event admission. The diagnostic array is named cleanupErrors, not a
semantic empty failure outcome. Initial lint/static findings remain retained.

The reviewed twenty-file local selection passes 730 reported entries. Strict
changed-source/new-test cyclomatic checks, new-module cognitive checks and lint
pass. Four existing decision findings remain in the replica lifecycle, matching
the parent; full global static/inventory/corpus acceptance remains open. No
threshold, baseline, retry, timeout or thermal limit changed. This record is
pre-lab review, not final acceptance or independent verification.

Serving stays held. Native event-driven continuation is not a serving permit,
replicated metadata proof, native process-loss proof, or a full creation workflow.
The first-opening/file gap, durable upstream selection, artifacts, publication,
retirement and complete recovery remain outside this bounded stage.
