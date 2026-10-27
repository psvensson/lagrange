---
audience: development
documentClass: current
---

# Issued learner action and actual delivery lifetime

<!-- system-contract
{
  "schema": "system-contract-v1",
  "contractId": "message-group-learner-delivery-lifetime",
  "status": "active",
  "owners": [
    {
      "owner": "router_connection_authority_owner",
      "boundary": "learner_delivery_lifetime"
    }
  ],
  "failureClasses": [
    "stale or disconnected transport deliveries can enter a native membership proposal after router shutdown or socket replacement",
    "wire payload fields can be forged to impersonate a privileged local or remote delivery context"
  ],
  "stateVariables": [
    "routerLifetimeMarker",
    "adoptedNodeKey",
    "activeSocket",
    "bootIncarnation",
    "deliveryContextLive"
  ],
  "safetyInvariants": [
    {
      "id": "learner-delivery-requires-live-connection-context",
      "statement": "Issued learner admission enters the native membership turn only while the router connection authority confirms the exact router lifetime marker, boot incarnation, and open socket remain live."
    }
  ],
  "livenessExpectations": [
    {
      "id": "stale-delivery-refusal-preserves-redelivery",
      "statement": "A refused stale delivery does not discharge the durable operation obligation, allowing exact redelivery over a fresh live connection."
    }
  ],
  "knownResiduals": [
    "Local transport lifetime predicates do not claim globally atomic cross-group metadata revocation."
  ],
  "runtimeBindings": [
    {
      "path": "src/transport/message-router-connection-authority.js",
      "owner": "router_connection_authority_owner",
      "boundary": "learner_delivery_lifetime",
      "transition": "mints and validates ephemeral host-only delivery lifetime contexts bound to router lifecycle and adopted socket"
    },
    {
      "path": "src/message-group/message-group-consensus-port.js",
      "owner": "message_group_membership_admission_owner",
      "boundary": "learner_delivery_lifetime",
      "transition": "rechecks the host-only delivery lifetime predicate immediately before native membership proposal"
    }
  ],
  "modelBindings": [
    {
      "kind": "property-test",
      "artifact": "test/raft/raft-rs-backend/message-group-membership-semantic-port.test.js",
      "properties": "verifies live delivery context enforcement, stale socket refusal, and redelivery safety"
    }
  ],
  "metrics": [
    {
      "name": "message-group membership semantic port delivery lifetime suite",
      "probe": "npm run test:file -- test/raft/raft-rs-backend/message-group-membership-semantic-port.test.js"
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
        "failureMode": "stale socket or shut-down router delivery proposes a native membership change",
        "severity": "high - can admit a learner from an obsolete transport session",
        "detectability": "high - semantic port tests verify synchronous pre-proposal predicate check",
        "mitigation": "require host-only callable lifetime context checked before peer reservation and immediately before native proposal",
        "probe": "npm run test:file -- test/raft/raft-rs-backend/message-group-membership-semantic-port.test.js"
      }
    ],
    "stpa": [
      {
        "controller": "router_connection_authority_owner",
        "unsafeAction": "admits a native membership proposal from an unverified wire payload or replaced socket",
        "feedbackSignal": "router lifetime marker, adopted node boot incarnation, and exact socket reference",
        "ownerBoundary": "router_connection_authority_owner / learner_delivery_lifetime"
      }
    ]
  }
}
-->

Owner interaction: RouterConnectionAuthorityOwner -> existing group membership
admission -> semantic operation port -> existing native membership turn.
Scope: next bounded increment of message-group-fresh-identity-membership.
This is not complete FreshMG activation or resolution of cross-group metadata
currentness. The sealed source/target, J1, CREATE and cleanup rules stand.

## Different obligations

The existing operation-row authorization records an immutable action that may
remain owed after ordinary failure or a lost reply. A socket closure, local
router shutdown, stale holder or expired observation is NOT committed absence,
not permission to undo a membership action, and not release of the membership
lane. A new holder/session must re-observe the exact retained intent through
the existing repository. It cannot change the original target or native fence.

A delivery lifetime answers a narrower question: may this local invocation
still enter its native action? Its owner is the router's existing connection
authority, not nodes-table projections. The native configuration/generation,
term, replica lifetime and address remain the native owner's decisions.

## Capture and execution

Remote dispatch obtains a context from the actual socket listener's adopted
node key and socket object. Wire sourceNodeId and payload fields are not the
identity authority. The current primary must have a known positive boot,
be connected and unretired, and hold that exact open socket. UNKNOWN remains
compatible for ordinary transport; it provides no privileged context.

The local delivery path uses the same router owner with its issued local
boot. Contexts are frozen local-only second handler arguments. Their callable
predicate is not serialized into an envelope, receipt, snapshot or Raft log.
Handlers that do not request privileged execution retain their existing wire
behavior. A missing context cannot be upgraded by copying payload fields.

The owner retains one ephemeral lifetime marker per router, rotated when
shutdown starts. There is no per-request map, listener or persistent ledger.
The predicate captures that marker and the exact socket/connection for remote
traffic. Router reinitialization and same-boot socket replacement cannot revive
an old context. This is lifetime authority, NOT durable operation authority.

The issued-learner consumer requires a matching live context and snapshots its
predicate before its repository observation. It rechecks before permanent-peer
reservation. The semantic port conveys the host-only predicate separately from
request fields; the native membership turn checks it after queueing/draining
and immediately before proposing. No await separates the last check from the
native proposal. A stale delivery returns a typed retryable refusal and does
not discharge the issued obligation. Once a native proposal was accepted,
subsequent disconnect cannot roll it back or erase its durable outcome.

Other already-privileged users of the generic semantic membership operation
keep their existing native contract. The new host argument is not a public
credential or an alternative issuer. The issued-learner consumer never omits it.
Trusted host code can inject dependencies; this does not claim to constrain
arbitrary hostile JavaScript already holding raw host capabilities.

## Proof and next boundary

Test real router identification and SERVICE_MESSAGE delivery over the existing
in-process socket physics, local dispatch, shutdown/reinitialize, connection
replacement including same boot, UNKNOWN identity and forged wire source fields.
Compose that context with the real operation repository/native ports and hold
both the final metadata read and a genuine native Ready-send queue. Assert no
membership proposal from the stale delivery and successful exact redelivery.
The operation SQL fixture remains file-backed, not distributed SQL/Raft.

This increment does not claim globally atomic nodes/operation reads. The R3
metadata-only counterexample remains recorded: a canonical node-row change
without observed socket/native lifetime invalidation is not eliminated by a
local transport predicate. Full protocol review must settle issued-action
validity versus global revocation without another metadata-read loop.

Next: derive exact committed learner evidence from the existing native owner,
bind it to the original operation/transition/permit/target, and conditionally
advance the existing repository's stamp/phase. PROPOSED and role-only
ALREADY_LEARNER are not that receipt. Only then wire the existing physical
CREATE/state-transfer path. No receipt store, second workflow or cancellation
algorithm is added by this boundary.

## Failure Classes

Stale transport deliveries after socket replacement or router shutdown, or
forged wire payload fields, can attempt to enter a privileged native membership
turn.

## Invariants

Native learner admission requires a live host-only delivery context verified
synchronously before peer reservation and immediately before native proposal.

## Runtime Bindings

`router-connection-authority-owner.js` issues the ephemeral lifetime predicate
and `message-group-consensus-port.js` enforces it across the semantic port.

## Model Bindings

Integration and unit witnesses in `message-group-membership-semantic-port.test.js`
exercise socket replacement, router reinitialization, and exact redelivery.

## Operational Analysis

FMEA and STPA separate ephemeral transport delivery lifetime from durable
operation authority so refused stale deliveries remain retryable without
proposing to the Raft core.
