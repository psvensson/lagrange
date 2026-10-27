---
audience: development
documentClass: current
---

# Exact committed learner origin

<!-- system-contract
{
  "schema": "system-contract-v1",
  "contractId": "message-group-committed-learner-origin",
  "status": "active",
  "owners": [
    {
      "owner": "raft_rs_committed_membership_owner",
      "boundary": "committed_learner_origin"
    }
  ],
  "failureClasses": [
    "lost proposal replies or runtime reconstruction can cause duplicate membership proposals or misclassify committed learner admission",
    "uncommitted or wrong-operation learner reservations can be mistaken for committed origin evidence",
    "checkpoint scrub can lose permanent peer learner origin provenance"
  ],
  "stateVariables": [
    "peerIdentityReservation",
    "learnerOrigin",
    "appliedIndex",
    "confState",
    "originRegistryComplete"
  ],
  "safetyInvariants": [
    {
      "id": "committed-learner-origin-atomic-with-apply",
      "statement": "Permanent peer identity reservation, encoded learner origin, ConfState, and applied index commit or roll back atomically in one SQLite transaction."
    }
  ],
  "livenessExpectations": [
    {
      "id": "committed-learner-origin-recoverable-across-reconstruction",
      "statement": "An applied managed ADD_LEARNER action remains readable through the committed-membership learner-action read across leadership change and runtime reconstruction."
    }
  ],
  "knownResiduals": [
    "Legacy reservations without an encoded origin migrate to NULL and remain unvouched."
  ],
  "runtimeBindings": [
    {
      "path": "src/raft/raft-rs-committed-membership-read.js",
      "owner": "raft_rs_committed_membership_owner",
      "boundary": "committed_learner_origin",
      "transition": "queued semantic learner-action read answers COMMITTED, NOT_RECORDED, UNRESOLVED, or REFUSED from applied native state"
    },
    {
      "path": "src/raft/raft-rs-membership-administration.js",
      "owner": "raft_rs_committed_membership_owner",
      "boundary": "committed_learner_origin",
      "transition": "managed ADD_LEARNER application persists permanent peer reservation and learner origin atomically"
    }
  ],
  "modelBindings": [
    {
      "kind": "property-test",
      "artifact": "test/raft/raft-rs-backend/committed-membership-census.test.js",
      "properties": "verifies exact committed learner origin persistence, readback, and checkpoint retention"
    }
  ],
  "metrics": [
    {
      "name": "committed membership census and learner origin suite",
      "probe": "npm run test:file -- test/raft/raft-rs-backend/committed-membership-census.test.js"
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
        "failureMode": "unapplied or mismatched learner reservation is reported as committed origin",
        "severity": "high - corrupts membership transition recovery",
        "detectability": "high - committed-membership-census tests verify atomic apply and tuple matching",
        "mitigation": "persist origin inside the apply transaction and validate exact operation tuple on readback and checkpoint install",
        "probe": "npm run test:file -- test/raft/raft-rs-backend/committed-membership-census.test.js"
      }
    ],
    "stpa": [
      {
        "controller": "raft_rs_committed_membership_owner",
        "unsafeAction": "returns COMMITTED for an unapplied, mismatched, or unvouched learner action",
        "feedbackSignal": "applied index, ConfState, and permanent peer reservation learner origin",
        "ownerBoundary": "raft_rs_committed_membership_owner / committed_learner_origin"
      }
    ]
  }
}
-->

Bounded continuation of the existing `message-group-fresh-identity-membership`
Quest after review `67dfc3b2b8f70a8dc67d79e7c840ba06be1ae168`.
Base: `8ece20f70392314ceba49e4e787b800bc14d07d6`.
This contract specifies the next implementation and its tests; it is not proof,
an independent approval, a changed sealed acceptance, or route activation.

## Recovery outcomes and authority

| Observed fact | Permitted continuation |
| --- | --- |
| The exact original learner action has committed and applied | Recover its historical result through the native owner; no reproposal merely because a reply or former runtime was lost. |
| Outcome unavailable, or no exact origin is retained | Keep UNKNOWN and the existing membership obligation. Neither current absence nor a missing record proves non-commitment, with the two premised exceptions below (the learner action's registry vouch, slice C1; the promotion's configuration vouch, slice C2). |
| A prior attempt is definitively fenced AND non-committed | A successor attempt needs a separately proved, durably ordered existing-owner transition. This increment DOES NOT issue it; the ordered successor (runbook 6.C slice C1) does. |

Narrow supersession (6.C slice C1, recorded in its design note, section 8): an
absence resolves an issued learner action as noncommitted only when one queued
native observation shows all of: the answering replica leads a term strictly
newer than the action's leader term, has applied an entry of that term, holds
no origin for the target, and its peer-identity registry vouches for that
absence by holding no reservation of the target at all. The premise is that
every replica whose history contains the action holds the target's
reservation: applying it reserves and records the origin in one transaction,
and a stamp or image that folds it names the target while it is configured.
A reservation without an origin (a migrated schema, a stamp or image bootstrap
that folded the action, a local proposal or address hint) vouches for nothing:
the absence stays UNKNOWN. See the registered read contract.

Second narrow supersession (6.C slice C2, recorded in its design note, section
8): an absence resolves an issued PROMOTE action as noncommitted on a different
vouch. A promotion retains no origin, so the registry cannot vouch for it; the
vouch is the answering replica's applied configuration still holding the target
as a learner under its own identity (`raft-rs-committed-membership-read.js`,
`answerCommittedPromotionAction`), under the same fence: the replica leads a
term strictly newer than the attempt's leader term and has applied an entry of
that term. The premise is that a committed promotion makes the target a voter
and nothing in the applied history after it makes the target a learner again:
the only AddLearnerNode of the target is the transition's learner action, which
the runtime consumer and the native turn refuse once the learner fact is
recorded, and the only remover of the target is the transition's abandonment
branch, which J1 excludes after promotion authorization. An absent target, a
voter without the transition's learner origin, or a joint configuration vouches
for nothing: the absence stays UNKNOWN. See the
[promotion contract](message-group-learner-promotion.md).

The immutable logical target/operation/transition and a fenced execution attempt
are different. Do not overwrite the first issued permit with current native
term, configuration or runtime values. J1 forward recovery after promotion
authorization and ordinary-terminal/membership/cleanup/reservation separation
remain unchanged. No additional metadata reread, queue or cancellation owner.

## Retained fact, not another workflow ledger

The existing native Ready/application owner already decodes the managed
ConfChange context and reserves its permanent peer identity inside the same
SQLite transaction as ConfState and the applied index. A fresh identity is
never reused. Extend that SAME permanent reservation with one nullable encoded
learner origin. Only a managed ADD_LEARNER application writes it. It binds:

- group id;
- actual committed-entry index and term, as exact canonical decimal strings;
- the existing operation id, transition identity, permit sequence, stage,
  target replica identity and derived peer id.

The registry persists bytes; the existing committed-context owner defines and
validates their shape. No independent progress authority or unbounded history
per operation is added. Reapplying the identical origin is idempotent; a
conflicting origin cannot overwrite it. A preliminary reservation is NOT an
admission. An older reservation migrates to NULL, never synthesized success.

The origin, permanent identity and applied state commit or roll back together.
Replaying entries already folded into a joiner's bootstrap configuration may
recover provenance but MUST NOT reapply their historical ConfState to the core.

## Read contract

Extend the existing semantic committed-membership read with the explicit
`learner-action` purpose. It accepts group id plus the existing exact managed
ADD_LEARNER action tuple, snapshots/validates the request, and runs through the
native group's existing execution queue and recovery/lifecycle boundaries.

Narrow supersession (6.C slice C2, recorded in its design note): the same
purpose also accepts the transition's PROMOTE action tuple. A promotion
retains no origin; its committed outcome is the replica's applied
configuration naming the target a voter while its registry holds the target's
learner origin of the same transition, answered with that origin as the
receipt and the same-read witness membership. A replica holding the target as
a learner answers NOT_RECORDED with the vouch set; anything else NOT_RECORDED
unvouched. Only a managed ADD_LEARNER application still writes an origin. See
the [promotion contract](message-group-learner-promotion.md).
It returns frozen historical COMMITTED, UNRESOLVED, or REFUSED data. A record
beyond the same local applied/committed membership boundary is never returned
as committed. A mismatched or malformed record is not success. A closed or
unavailable owner is explicit unavailability.

The read does not require the OLD execution term/runtime to still be current:
those guard proposal execution, not observation of an already-committed fact.
It does not amend the original permit or grant a new proposal. Historical ADD
success is not current learner membership, a join descriptor, physical CREATE,
source removal, or release of the serialized membership obligation.

## Checkpoint retention and compatibility

The existing raft-rs checkpoint scrub retains permanent peer reservations but
removes sender-local native logs/state. The origin must therefore travel WITH
that reservation, be described in the checkpoint, and be compared with actual
payload bytes on read/install/recovery. Validate its group, target identity,
entry term and index against the checkpoint's applied boundary. A descriptor
must not erase, substitute or manufacture an origin.

Increment the UNRELEASED `raft_rs_replica_image` payload version from 1 to 2;
other payload kinds are unchanged. Version-1 images are explicitly unsupported
by the new origin-bearing contract, not silently treated as containing proof.
Old live reservation rows remain readable after the existing owner adds the
nullable field, but NULL cannot resolve an issued action, including for the
ordered successor (C1): a reservation whose origin is NULL is UNVOUCHED and
never fences; only a registry that holds no reservation of the target vouches
for the absence. No supported upgrade claim is made. Native snapshot catch-up completion is a separate existing gap.

## Required falsifiers and proof ceiling

Before source changes, run the new witness on the exact base and retain its
missing-purpose/absent-origin failure. Then use actual operation authorization,
native proposal/Ready/application, file-backed SQL and the checkpoint owners:

1. Intent or PROPOSED/uncommitted entries alone do not produce origin success.
2. Lose the proposal response, apply on the surviving voters, and recover the
   exact original action on another voter and after native reconstruction.
3. A newer leader/runtime refuses the old proposal fences but still answers
   the historical committed-origin read without rewriting the issued permit.
4. Wrong operation/transition/sequence/stage/target/group cannot borrow proof.
5. A real applied-state transaction failure also rolls back origin storage.
6. The scrubbed checkpoint contains no sender log yet preserves and validates
   the exact origin; an altered/missing origin or old payload version refuses.
7. Closing the actual owner and malformed/unavailable records fail closed.
8. Source-revert and focused mutations must fail the named relevant assertion,
   not a setup timeout or cancelled test.

Use existing test fixtures and impact-contract registration, unchanged native
fences, WAL/FULL settings and file budgets. No physical lab/GCP configuration
changes. This first increment does not wire the repository phase/stamp update,
registered membership route, full debt driver, successor issuance or CREATE.
Those remain behind the retained evidence and subsequent independent review.

A focused component pass is not shared-helper/full-cone proof, a physical
network test, two off-seed replacements, or final-main certification. The
existing full-lab FAIL, duration findings and final A1-v13 gate remain open.

## Failure Classes

Lost proposal replies, uncommitted reservations, or scrubbed checkpoints can
obscure whether a managed learner admission committed.

## Invariants

Learner origin commits atomically with peer identity reservation and applied
ConfState, and is validated on readback and checkpoint installation.

## Runtime Bindings

Runtime bindings connect `raft-rs-committed-membership-read.js` and
`raft-rs-membership-administration.js` to the durable peer reservation store.

## Model Bindings

Property and integration tests in `committed-membership-census.test.js` verify
atomic origin recording, readback, and checkpoint preservation.

## Operational Analysis

FMEA and STPA ensure the committed-membership owner fails closed on missing or
unvouched origin state without synthesizing commitment or non-commitment.
