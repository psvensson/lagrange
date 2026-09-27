# Verification O1 round 3 (integrated evidence, 2026-09-27)

Subject: the committed-membership read and participation gate after the
round-three evidence merge.  The verifier inspected integrated candidate
`b54f78ac2498e65453e6b876d4ce8555167c4ffb` against frozen production
`659b7db9511920931d87029c34e46ed9e02e2de6`; the production diff was empty.
The verification was read-only.

## Verdict

**REJECT.**  The intended F1-F4 mechanisms and the O1 branch's immutable lab
binding are green, but the distributed bootstrap stamp is not canonicalized
at its trust boundary, one transport semantic outcome loses retry metadata,
and the impact registry is stale.

## Blocking findings

1. **Hostile bootstrap stamps can grant authority (high).**
   `raft-committed-membership-stamp.js`, `raft-rs-bootstrap-membership.js`
   and the node bootstrap handler validate and then consume a caller-owned
   object.  Inherited fields, accessors, a custom array iterator, mutable
   `Array.prototype.every`, boxed/coercing peer IDs, and invalid numeric
   values (`NaN`, infinity, negative zero) can therefore validate one value
   and authorize another.  Peer arrays are also unbounded.  The repair must
   decode once into an own-data, bounded, null-prototype canonical snapshot,
   reject exotic/coercing input and consume only that snapshot without
   caller iteration or mutable intrinsic dispatch.
2. **ACK plus `noHandler` is treated as witness delivery (medium).**
   `operation-workflow-replace-witness.js` returns `DELIVERED` for
   `{acknowledged:true,noHandler:true,deferRetry:true,retryAfterMs:250}`.
   Membership then becomes untyped `UNAVAILABLE`; RETIRE records an answer
   and waits for a state/backstop, losing the router's retry hint.  The
   consumer must use the canonical delivery classification and preserve the
   named reason, retry intent and delay.
3. **Impact contracts omit the committed bootstrap stamp pair (medium).**
   Design section 3.8 requires a `committed-bootstrap-stamp` pair.  The
   existing `replace-owner-membership-observation` entry also describes a
   single witness rather than the current leader plus majority rule and
   omits `operation-workflow-replace-surviving-membership.js` and the
   deposed-leader witness.
4. **Stale protocol comment (low).**
   `raft-operation-port-constants.js` still says
   `CONF_CHANGE_APPLIED` carries the removed `admissible` field.

## Disposition of the intended mechanisms

- F1 bootstrap ambiguity: closed for ordinary canonical values.
- F2 participation gate: closed.
- F3 currentness: closed under the approved same-term/leader-majority rule.
- F4 construction census: closed.
- F5 documentation/hygiene: incomplete because of the stale comment.
- F6 immutable evidence binding: confirmed.

The verifier's focused O1 suites and static audits were green.  Approval is
withheld until hostile-shape regressions, transport-semantic regressions and
the two impact contracts are committed and independently re-verified.

