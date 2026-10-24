---
audience: development
documentClass: evidence
---

# Owner review and decisions, 2026-10-26 (binding)

Pasted by the owner into the lead session on 2026-10-26; recorded verbatim in substance. Decisions:

1. Reconcile the lineage's active steering with main's 2026-10-22 revision (authors own diagnosis and
   repair; independent reviewers own verification; an integration owner coordinates acceptance and
   landing; existing authority persists; human input only for genuine product or scope decisions or
   missing authority; review follows affected behaviour without a fixed round count). Preserve sealed
   runtime contracts and historical evidence. "No Quest yet" leads to a prepared bounded Quest proposal
   and the next authorized action.
2. Fresh-seed activation: a new child Quest under raft-rs-full-cutover (not an amendment of
   retained-seed-original-handoff, whose acceptance deliberately ends serving-deferred). Outcome: a
   legitimately admitted fresh seed completes protected activation, durably transfers its original
   registration and cluster-identity rights, and reaches normal service through the supported startup
   path. Five requirements: live original issuer only, for openings admitted under its exact allocation;
   registration consumes the right UNUSED -> SUBMITTED durably before submission, SUBMITTED ->
   TRANSFERRED after an exact authoritative committed read; a missing answer never resets a right;
   public admission opens only after the handoff completes, internal activation narrowly authorized;
   retained, partial, uncertain and cold mid-handoff states keep their protections and COLD_RECOVERY is
   never silently authorized. The restart obligations stay visible in the final acceptance. Harness
   reports distinguish harness defects resolved, startup assertions still blocked by the hold, and
   fresh-seed acceptance demonstrated.
3. Q1-Q5 approved as the complete lifecycle-owner correction (W2/W3 through the narrow operation of
   option (b)), in reviewable stages: Q1 yes to the exact named operation from its declared caller as
   an intentional boundary-contract change (snapshot precedent), class access still rejected; Q2 the
   lifecycle owner mints the original incarnation and the declaration consumes it; Q3 the lifecycle
   owner is the sole writer of allocation fields and rights transitions through owner-defined
   operations that enforce identity, permitted transition and refusal; Q4 the census detects writes
   behind imported table-name aliases, failing witness first; Q5 REPLICA_LIFECYCLE_TABLE returns to an
   owner-controlled module without an import cycle. Preserve: prepare the complete cohort and issue the
   allocation before the first native effect; partial preparation explicit and fail closed. Unrelated
   work is not serialized behind all five; the rights-transition writer depends on Q3/Q4.
4. CDC D1-D4 as one coherent completion effort: D1 reclamation of delivered obligations with compact
   durable progress preserving acknowledgement-replay distinguishability, retained-seed inspection
   evidence (or an owner-defined durable summary) and the D4 contract, distinguishing source-event from
   delivery-marker positions, no tombstone per write, pending work under budget and backpressure never
   silently dropped; D2 external user-table CDC default off, recording rule "required internal
   propagation OR supported external CDC", deterministic across replicas, an explicit request for
   external CDC reported unsupported; D3 the alpha clean-initialization decision applies (no migration
   of old obligations, correct recording, fresh storage for qualification, restart and pending-work
   recovery proven on current-build storage, requirement documented); D4 a gap-free handoff between
   hydration and live CDC at a defined committed position, subscribe-before-hydrate preferred if
   hydration provides a coherent read position, else ledger-backed catch-up from a cursor, decided by
   the owners after a short design review; the sliding window is removed only after the witness.
5. Public-API removal of the WebSocketTransport family and ReplicaLifecycleManager under the alpha
   mandate, with the normal implementation work; a new decision only if a supposedly obsolete export
   supplies a supported capability.
6. Q6 approved as a separate bounded interaction change ({transport, answer} envelope, one shape,
   producers and consumers migrated together). TX1 unwired recovery validators classified immediately
   and the reachable path repaired, never de-exported. The transport handler-identity cluster is
   prioritized by whether it can affect the wrong handler incarnation. The doubles migration is its own
   Quest. The release fixture is repaired at its cause.
7. Ratchets stay; the complexity baseline is unchanged; service progress is the organizing goal;
   individual repair acceptance and final cutover acceptance are separate claims.
8. Execution order: steering and status; preparation boundary and fresh-seed child; CDC lifecycle;
   safety-critical recovery and handler identity; Q6, API removal, fixtures; W7/W9 and recovery
   witnesses with their real semantics; compose and qualify the final candidate.
Report format: one row per remaining service blocker (observable failure, owner, prerequisite,
decisive witness, exact tested commit, next action).
