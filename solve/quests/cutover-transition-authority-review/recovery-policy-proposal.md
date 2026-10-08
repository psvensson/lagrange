# J1 recovery policy and transition identity - recommendation for review

Status: proposed implementation judgment, NOT an operator ruling, independent
approval, sealed-acceptance revision or runtime permission. Addresses review
5452918820 of C0 at 0219a7fee95bdd744e52b8fa2eb5c5978e661964.
Source target remains 82b54ef9b7c8d6be9f2d6450cbc5e6713ade00af.

## Operator decision recorded after this proposal

The user approved the conservative promotion-authorization boundary on
2026-10-08; see [the explicit decision](operator-decision-20261008-j1.md).
This historical proposal remains an input to that decision, not independent
verification or evidence that the implementation is complete.

## Recommended bounded choice

For the first completed FreshMG replacement implementation, prefer forward
recovery after promotion has been authorized, and prohibit automatic target
rollback while promotion or source retirement could still commit. A confirmed
promoted T is retained. Finish the admitted S-to-T replacement through the
existing owner once its actual safety prerequisites return. If T cannot be
safely recovered and the source cannot be retired, report an explicit
operator-required blocked obligation; do not turn that state into successful
replacement or silently release its membership lane.

This is deliberately a safety-first liveness limitation, not a claim of full
automatic repair of every permanently lost promoted target. It needs the
protocol owner's explicit acceptance against the existing failure controls;
if those controls require automatic abandonment here, supersede the proposed
choice or explicitly revise the contract rather than weakening the tests.

Before promotion authorization, failed-learner cleanup may remove exact T
only under the existing membership owner and definitive resolution of all
prior proposals. An ordinary terminal result, current cache absence, elapsed
lease, or one committed configuration observation does not prove that a late
ADD/PROMOTE can never take effect. Unknown remains owed and serialized.

## Decision table

| Durable authorization / committed effects | Next owner action | Subject | Explicit prohibition |
| --- | --- | --- | --- |
| No learner authorization, terminal-first wins | Resolve non-admission through exact existing CAS | No membership subject | No physical CREATE; do not mint a membership debt from a missing cache row |
| Learner authorization exists, outcome unknown | Reconcile exact proposal/identity with current runtime authority; retain lane | T | No timeout-based absence or eager cleanup |
| T learner, no promotion can still take effect | Continue admission/transfer, or resolve failed learner through authorized removal | T for failed-learner removal | Source S is not a failed target |
| Promotion authorized or outcome unknown | Resolve forward; preserve S and T until required facts decide the next safe action | T for promotion | No competing target rollback that races a late promotion |
| T committed voter, S retained | Recover T as permitted by its existing identity owner, complete required handoff, then retire S | S for successful removal | No automatic remove-T compensation |
| S removal authorized or outcome unknown | Re-observe exact S removal through membership authority; retain T | S | Stale workflow stage cannot revive target rollback |
| S committed absent | Resolve S membership obligation, retain T; continue exact S cleanup | S | Cleanup of S never authorizes removal/deletion of T |
| Required participant is irrecoverably lost | Explicit blocked/operator-required obligation unless an already-sealed recovery path applies | No new subject is invented | No same-voter empty-history reconstruction; no unbounded silent retry or false success |

Normal request settlement, membership-lane retention, cleanup-claim lifetime
and storage accounting remain separate. This proposal adds no new storage
reservation release point and does not require source-own applied absence
before the leader/quorum membership-lane decision.

## Identity choice - reuse existing fields, do not rename T into S

The current runtime already carries operationId, transitionIdentity,
permitSequence, stage, replicaIdentity and peerId in the committed configuration
context (`src/raft/raft-rs-committed-membership-context.js`). The operation's
immutable S/T identity must remain unchanged across retries and stage changes.

Recommended normal-path mapping:
- One stable operation-scoped transitionIdentity derived by the existing
  membership identity owner for O's immutable group/S/T tuple.
- The exact stage and owner-derived replicaIdentity/peerId identify the
  subject of each committed effect: ADD/PROMOTE T, successful REMOVE S, and
  separately justified pre-promotion learner REMOVE T.
- permitSequence and current owner/configuration fences remain owned by the
  existing repository/runtime interaction. Never reset a sequence or reuse
  another operation's identity to make a refused request pass.
- Receipts must bind the entire existing context plus native change and the
  exact observed subject. REMOVE alone or targetPeerId alone is insufficient.

The existing `transitionFenceKey` is operationId plus transitionIdentity;
`staleTransitionFence` keeps a runtime-local fence only for its current
membership generation. It is not cross-restart durable operation authority.
The repository's durable membership obligation and exact fresh configuration
reads must supply that authority. No new parallel runtime membership store is
proposed.

This mapping is a proposal to check against the preserved permit codec. Do
not silently change a sealed field's meaning, mutate the old target identity,
or assume that a normalizer authenticates its caller. If the exact existing
identity representation cannot carry this invariant, record the narrowly
necessary contract change before touching source.

## Four identity dimensions must not be conflated

The request's `replicaIdentity` is the S/T subject of the membership change.
The request's `replicaLifecycleIncarnation` is checked by
`transitionOwnerRefusal` against the executing runtime group's lifecycle
incarnation: it fences the current runtime, not automatically S's or T's
physical generation. Promotion's `targetStatusObservation` separately names
T's actual state/incarnation. The operation/lifecycle record separately binds
which S/T physical generation may be created or cleaned.

These distinctions come from the current normalizer/runtime code, not a new
protocol. A request assembled for the wrong identity dimension is invalid even
when all its strings are nonempty and its numeric fields are fresh.

## Required falsifiers before adoption

Prove late promotion cannot race abort into removing the only replacement;
unknown REMOVE S cannot be interpreted as REMOVE T; replay/owner takeover
retains exact operation context; a current executing-runtime incarnation does
not authenticate a different S/T generation; current terminal row plus
outstanding membership obligation retains serialization; and a permanently
lost promoted target is reported with the chosen explicit liveness ceiling.

C0 requests review of this proposed judgment and its compatibility, not proof
that any of these production transitions already exist. The existing FreshMG
runtime/handler work and physical two-replacement acceptance remain open.
