---
audience: development
documentClass: current
---

# Recovered learner outcome and operation recording

Existing Quest: message-group-fresh-identity-membership.
Base: 16bcff35bc44d2c6c6151cfb29d35fa7a4b4325a.
User-approved continuation after the PR111 corrections and origin-install proof.
This records a bounded owner interaction, not independent approval or activation.

## Authorities and one transition

The existing native owner supplies exact original learner origin and an ordinary
committed-membership witness from the SAME queued status/application observation.
The witness is not a new schema or a leader bootstrap grant. The permanent origin
remains the historical action; the accompanying membership says which configuration
was observed at this read. Later changes still require the next action's native fences.

ReplicaOperationRepository invokes a host-bound native read capability itself,
using the group/action tuple decoded from the immutable identity and original
issued permit. A payload receipt or boolean validator is not this capability.
Trusted host injection is not protection against arbitrary hostile host JavaScript.
The future registered route must preserve this boundary; it is not enabled here.

Trigger: a holder reconciles an unresolved issued learner action.
Required facts: exact operation identity/lane/source-generation, exact original
in-flight permit, exact current holder, supported ordinary state, native original
origin and same-read committed configuration with source voter and target learner.
Actual commit: one conditional UPDATE of the existing operation row.
Changed fields ONLY: learner phase, permit state/proposal index, learner stamp.
The original permit's execution fences and sequence are not refreshed.
Unchanged obligations: ordinary workflow and terminal history; membership lane and
UNKNOWN debt; reservation; source generation; voter/removal stamps; physical CREATE.

The conditional basis includes identity, prior permit, phase, all stamps, holder,
ordinary status, step and completion timestamp. Holder replacement during either
the native read or database write must not let the old holder overwrite its successor.
Ordinary failure may settle while observation is pending: its exact final failed row
can record an already-committed action without reopening ordinary execution.
Successful or inconsistent terminal states do not admit this new transition.

## Outcome and recovery

A native unresolved result preserves debt. Unavailable/malformed/wrong-action or
incoherent evidence does not grant recording. Historical origin must match the
original term and tuple; an old term remains valid after current leadership advances.
The source must still be a voter and target a learner in the accompanying witness.
An old ADD receipt after REMOVE is not sufficient to manufacture a learner stamp.

After a failed or lost SQL answer, exact authoritative row readback resolves whether
the outcome is recorded. Failure to observe the result stays UNKNOWN. Exact replay
of the recorded phase does not rewrite its stamp or perform another native proposal.
A current successor holder may recover the original result without altering the
original issued attempt. Recording a historical fact is not new action issuance.

The existing metadata-read currentness limit is not claimed globally solved.
The checks and exact row CAS do not implement cross-group revocation or make a
previously issued membership action disappear when a lease or socket expires.
RECORDED is not execution permission, physical CREATE or membership-lane release.

## Required proof and remaining sequence

Use real native operation ports/application plus the real repository against
file-backed operation SQL for exact recording, no-origin refusal, wrong evidence,
leader/native/database reconstruction, terminal/holder interleavings, exact CAS
loss, lost write answer, unavailable readback and no-effect replay. Add the real
SQL/Raft -> CDC -> SystemTableCache writer check; explicitly identify any supplied
native observation in that isolated visibility test.

Close/reopen in one process is not SIGKILL/power-loss proof. The process-loss cut
between membership application and operation recording requires its own witness;
the bounded implementation below does not replace distributed owner-path proof,
complete change-impact/static checks or independent review.
The planner, MessageGroupServiceHandler driver and CREATE safety parks remain.
No successor attempt is authorized by missing evidence. J1 forward recovery after
promotion authorization, full lab FAIL, timing findings and final off-seed/main
proofs remain intact. No new coordinator, state store, lease or generic receipt
framework is introduced by this transition.

## Native refusals retain their meaning

The recorder classifies the native result without treating every refusal as a
transient outage. Exact UNRESOLVED / NOT_RECORDED stays UNKNOWN. Native UNAVAILABLE
or a thrown read failure remains UNAVAILABLE. Wrong action, corrupt origin,
impossible applied boundary, invalid shape and contradictory kind/reason pairs
return CONFLICT. Within an otherwise exact historical answer, the existing
membership HELD and CONFIGURATION_GENERATION_UNAVAILABLE refusals remain temporary
UNAVAILABLE. A malformed or permanently invalid membership witness is CONFLICT.

No refusal records a learner phase, cancels an issued action or releases debt.
A later valid native observation remains eligible for the existing exact CAS.
This classification correction addresses PR113 review 4231271062; it is not a
new retry owner or authorization policy.

## Bounded operating-system interruption witness

Actions 37948946816 measured source 8f8213d994b84c3c5858525dbdc91de835e59b5d.
The new process-loss test extracts and reuses the existing canonical native and
operation fixture. Three writers reach explicit durable boundaries, then their
parent actually sends SIGKILL. No writer close/finally sequence supplies recovery.

1. Native ADD is committed/applied, operation outcome not recorded: a new process
   reconstructs the original request from the durable operation-row owner.
2. The same cut after ordinary failure: that failed terminal history and all
   membership debt survive while the exact historical learner phase is recorded.
3. Operation recording committed but its SQL answer was not returned: the new
   process redelivers the original caller request and observes the recorded result.
   This is exact request redelivery, NOT automatic scanning/reconstruction of an
   already-recorded operation using only its now-committed permit representation.

The reader uses a different logical node identity and an existing different
voter's database. A still-live holder cannot be stolen; after advancing the
fixture clock past the exact lease expiry, the existing claim CAS adopts the
next generation. The old request is refused. Recovery preserves all original
execution fences, makes no new membership proposal, and does not release the
membership lane, reservation or ordinary-terminal obligation.

This is normal better-sqlite3 and actual native operation ports across real
process termination. Operation metadata/SQL uses a local file-backed gateway;
the writer's native replicas communicate through in-process test transport.
It is not physical cross-host/Raft-SQL failover, power loss, automatic driver
recovery or current CREATE activation. The existing separate SQL/Raft/CDC test
is complementary evidence, not a composition claim for those missing paths.
