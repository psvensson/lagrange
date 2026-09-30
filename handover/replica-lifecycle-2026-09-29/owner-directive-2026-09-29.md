# Owner directive 2026-09-29 (BINDING) — lifecycle candidate, pre-freeze round

Continue with the current sole-writer arrangement. The READY operation and the activation-generation repair are provisionally accepted. Do not redesign either unless the remaining regressions falsify their invariants. Before changing either failing integration test, complete the history/mechanism census.

## 1. Classify the two remaining reds as one mechanism or two
move-replica-handoff.integration ("joining node should join successfully", all four subtests); message-group-multi-join-formation.integration (admin-meta discovery, subtest 59).
For each, find the first divergence from base. Do not start at the assertion. Produce, for base and for candidate: authoritative state immediately before divergence; deciding owner; next expected transition; actual transition. Then decide whether both share one mechanism.
Census these candidate changes before touching tests: exact incarnation on NODES publication; NodeLifecyclePublication admission/readback; durable-rejoin incarnation replacement; lifecycle state_entered_at fencing; registration -> activation ordering; joining-node publication/discovery; message-group activation only insofar as it consumes those authorities.
If a failure traces into the excluded MOVE_REPLICA / leader-handover / peer-set / joining-vote mechanisms, STOP.

## 2. Audit lifecycle CAS systematically
Do NOT globally replace updated_at with state_entered_at. First enumerate every production CAS that mutates replica lifecycle state. For each record: transition; owner; canonical identity; expected source state; generation fence; fields allowed to change independently; lost/unknown outcome authority.
Invariant: a lifecycle CAS is invalidated only by a newer lifecycle generation, never by unrelated role, heartbeat, telemetry, lease or diagnostic writes.
If state_entered_at is ReplicaStateMachine's canonical lifecycle generation, use it consistently for those transitions. If any transition has a different legitimate generation owner, STOP and report rather than forcing it.
Permanent generic witness, applied to activation, removal and every other applicable CAS found: register generation G; unrelated metadata/role/heartbeat mutation; lifecycle action carrying G still succeeds; real transition creates G+1; delayed action carrying G fails closed.

## 3. Do not grandfather arbitrary NODES writers
The allow-list is a discovery/ratchet mechanism, not semantic authorization. For every allowed direct NODES writer (NodeLifecyclePublication, FailureDetector, NodeLifecycleService, shutdown, admin CLI raw SQL, lease expiry, stranded-joining reaper, registration, withdraw, seed budget upsert, NodeReintegrationService, any others) answer: (1) which semantic transition/fields it owns; (2) whether another path owns the same transition; (3) the exact incarnation/generation fence; (4) whether it can overwrite READY/JOINING/ACTIVE produced by another owner; (5) whether it can bypass lease or lost-outcome classification; (6) whether it is runtime-reachable.
Unwired writers may stay as recorded debt if genuinely unreachable, never as evidence that multiple live owners are acceptable. Admin CLI raw SQL: if it can mutate lifecycle fields without the owner, classify it explicitly as privileged repair authority or route it through the owner — no silent grandfathering.
The structural test should express "no new semantic lifecycle mutation path may appear outside the explicitly classified transition owners", not "these filenames may write NODES".

## 4. READY invariants to preserve
Heartbeat and ReplicaDispatch -> NodeLifecyclePublication -> NODES gateway. Single semantic READY owner. READY: no message-group leader required; exact node incarnation; validated source lifecycle state; existing lease authority; zero-row and lost/unknown classified; authoritative readback on uncertain completion; heartbeat telemetry/storage-budget preserved. Durable rejoin uses the new incarnation, never the previous one as READY authority. The no-MG-leader READY witness is permanent.

## 5. Deleted retry machinery
The four deleted tests may stay deleted only because the machinery is gone. Prove equivalent semantic guarantees at the new owner:
- READY durable, ack lost -> authoritative readback -> same-incarnation READY -> idempotent success;
- READY not durable, ack unknown -> no invented success -> level-triggered re-drive may retry the semantic operation safely;
- replacement incarnation appears before retry -> old publication fails stale-incarnation.
Do not reintroduce a retry queue.

## 6. mg-1 regression scope stays closed
Keep proving: chooser sees r1 as leader; r2/r3 moved; r1 keeps leadership; no candidate-created leaderless interval; preflight green. Do not repair chooser authority, MOVE_REPLICA handoff, phantom voters or JOINING voting here (quest message-group-leader-safe-movement).

## 7. Transport branch stays separate
c3cfd229f (fixes/mg-forwarded-application-envelope) and the message-group-forward-completion-propagation follow-up stay out of the candidate; lifecycle correctness must not depend on either landing first.

## 8. Before freeze (all must hold)
remaining two integration reds classified and green; all lifecycle CAS sites censused; last ESLint error removed without waiver; full identity/generation tests green; READY lost-outcome tests green; 02:33 finding #1 re-proven; 02:33 finding #2 re-proven; all compatibility suites green; full static green; impact-contract audit green.
Complexity/cognitive baselines 1797/155 acceptable only as genuine one-way tightening; never raise them later for this repair.
Then stop production editing -> clean closure cycle. A fresh Opus 5.5 verifier on the exact frozen code must explicitly supersede the 02:33 REJECT.
