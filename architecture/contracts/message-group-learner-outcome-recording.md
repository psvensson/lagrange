---
audience: development
documentClass: current
---

# Recovered learner outcome and operation recording

<!-- system-contract
{
  "schema": "system-contract-v1",
  "contractId": "message-group-learner-outcome-recording",
  "status": "active",
  "owners": [
    {
      "owner": "replica_operation_repository_owner",
      "boundary": "learner_outcome_recording"
    }
  ],
  "failureClasses": [
    "process loss or lost SQL replies between native learner application and operation-row recording can leave membership debt unresolved or corrupt stamps",
    "superseded holders can overwrite a successor holder's operation state during concurrent recovery"
  ],
  "stateVariables": [
    "learnerPhase",
    "permitState",
    "learnerStamp",
    "voterStamp",
    "operationHolder",
    "obligationState"
  ],
  "safetyInvariants": [
    {
      "id": "learner-outcome-recording-exact-row-cas",
      "statement": "Recording a committed learner or promotion outcome updates only the phase, committed permit state, and corresponding stamp via a full-row CAS matched against exact identity, prior permit, stamps, and holder."
    }
  ],
  "livenessExpectations": [
    {
      "id": "learner-outcome-recoverable-after-interruption",
      "statement": "After process loss or lost SQL reply, a current holder reconstructs the query from the authoritative row and records or reads back the committed outcome idempotently."
    }
  ],
  "knownResiduals": [
    "Recording a historical outcome does not itself grant physical CREATE or release the membership lane."
  ],
  "runtimeBindings": [
    {
      "path": "src/rebalancer/replica-operation-repository.js",
      "owner": "replica_operation_repository_owner",
      "boundary": "learner_outcome_recording",
      "transition": "validates native committed-membership witness and conditionally updates operation row receipt columns"
    },
    {
      "path": "src/raft/raft-rs-committed-membership-read.js",
      "owner": "raft_rs_committed_membership_owner",
      "boundary": "learner_outcome_recording",
      "transition": "provides same-read committed origin and membership witness for learner and promotion actions"
    }
  ],
  "modelBindings": [
    {
      "kind": "property-test",
      "artifact": "test/integration/message-group-learner-promotion-recording-guards.integration.test.js",
      "properties": "verifies exact CAS recording, refusal classification, and idempotent readback after interruption"
    }
  ],
  "metrics": [
    {
      "name": "learner and promotion outcome recording guards",
      "probe": "npm run test:file -- test/integration/message-group-learner-promotion-recording-guards.integration.test.js"
    }
  ],
  "questRefs": [
    "solve/quests/message-group-fresh-identity-membership/quest.json"
  ],
  "theoryLedgerRefs": [
    "theory-20260522-experiment-theory-memory"
  ],
  "failureAnalysis": {
    "fmea": [
      {
        "failureMode": "transient native refusal or unvouched absence is recorded as terminal or cancels debt",
        "severity": "high - strands or corrupts in-flight membership transition",
        "detectability": "high - recording guard integration tests cover refusal classifications and process-loss cuts",
        "mitigation": "preserve UNKNOWN debt on transient refusal and commit receipts only through full-row CAS",
        "probe": "npm run test:file -- test/integration/message-group-learner-promotion-recording-guards.integration.test.js"
      }
    ],
    "stpa": [
      {
        "controller": "replica_operation_repository_owner",
        "unsafeAction": "mutates operation row from unverified payload receipt or overwrites a newer holder",
        "feedbackSignal": "host-bound native read witness and full operation-row CAS basis",
        "ownerBoundary": "replica_operation_repository_owner / learner_outcome_recording"
      }
    ]
  }
}
-->

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

## Submission admission and the late receipt

The recorder takes the caller's local invocation-currentness predicate. Before
EVERY submission, including each retry after backoff, it requires that predicate,
a live local claim and a fresh canonical boot read; immediately before the gateway
call it rechecks the synchronous predicate so that turnover during the asynchronous
boot read cannot start a submission. These checks admit new work; they do not
retract a command already inside the gateway. An already-submitted exact receipt
may therefore commit late under the unchanged full row-CAS basis, changing only
the learner phase, the committed permit and the learner stamp, as ruled in the
[safety-first ruling](../../solve/quests/message-group-fresh-identity-membership/safety-first-ruling-20261009.md);
the caller then reports UNKNOWN unless it is still current and exact authoritative
readback proves the receipt; an obsolete caller reports UNKNOWN even when the
receipt committed. The synchronous recheck covers the local invocation lifetime
and the live local claim.
A COMMITTED permit supplied as recording input is readback-only: it matches an
already-recorded coherent phase or is refused, and it never reaches the proposal
authorizer or becomes IN_FLIGHT again. Recovery by operation ID reconstructs this
input from the authoritative row; a missing or unreadable row is refused, never
replaced by a cache or an earlier packet.

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
this contract defines the outcome-recording boundary slice, while the downstream
`FreshMG` slices (`6.A`-`6.D`, including the planner, `MessageGroupServiceHandler`
driver, and `CREATE` path) are wired in production (`0.2.6`).
No successor attempt is authorized by missing evidence. J1 forward recovery after
promotion authorization remains intact. No new coordinator, state store, lease
or generic receipt framework is introduced by this transition.

## The promotion's voter stamp (6.C slice C2)

The same recorder, through its recording spec, records an issued promotion's
exact outcome. Its changed fields ONLY: the phase (voter committed), the
promotion permit's committed state and proposal index, and the voter stamp.
Everything listed unchanged above stays unchanged, the learner stamp included.
The evidence is the queued action read's committed promotion answer, and the
voter stamp must be the recorded learner configuration with exactly the target
promoted. See the [promotion contract](message-group-learner-promotion.md).

## Native refusals retain their meaning

The recorder classifies the native result without treating every refusal as a
transient outage. Exact UNRESOLVED / NOT_RECORDED stays UNKNOWN, unless its
same-turn observation fences the attempt at a leader that vouches for the
absence: for the learner action its registry (no reservation of the target at
all), for the promotion (6.C slice C2) its applied configuration still holding
the target as a learner under its own identity (NONCOMMITTED; see the ordered
successor in the registered read contract and the
[promotion contract](message-group-learner-promotion.md)), which records
nothing. The promotion vouch rests on the premise that only the transition's
later branches, which wait for the promotion's recorded outcome, can demote or
remove the target; an absent target, a voter without the transition's origin
or a joint configuration vouches for nothing. Native UNAVAILABLE
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
   That witness is exact request redelivery. Reconstruction from the authoritative
   row alone, including a now-committed permit read back and never revived, is the
   later recover-by-ID entry and its owned discovery; see the
   [registered read contract](message-group-registered-learner-read.md).

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

## Failure Classes

Process cuts between native application and SQL recording, lost SQL answers, or
stale holder submissions can race with recovery.

## Invariants

Only an exact full-row CAS with a coherent native witness updates the three
receipt columns, preserving ordinary status and membership debt obligations.

## Runtime Bindings

`replica-operation-repository.js` and `raft-rs-committed-membership-read.js`
own native witness verification and conditional receipt persistence.

## Model Bindings

Integration tests in `message-group-learner-promotion-recording-guards.integration.test.js`
verify CAS guards, refusal classifications, and process-loss recovery.

## Operational Analysis

FMEA and STPA bind the repository recorder to host-bound native reads and
authoritative readback so lost replies and holder turnover remain safe.
