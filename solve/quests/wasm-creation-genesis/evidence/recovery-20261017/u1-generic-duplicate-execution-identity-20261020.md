# U1 shared generic execution acknowledgement — systemic defect investigation

Date: 2026-10-20. **Status: WIP design/source audit. NOT an independent approval,
not a passing combined U1 result, not merge or U2 authorization.**

## Observation, root and earlier precedent

The generic CREATE/REMOVE handler consumes one existing
`inProgressOperations` execution gate per canonical replica. The original
generic REMOVE consumer in
`src/node/runtime-service-generic-replica.js:admitGenericRemoval`
returned `IN_PROGRESS` to **any** REMOVE when a REMOVE had that gate.
The original generic CREATE consumer in
`src/node/runtime-service-bound-creation-route.js:replyToExistingReplica`
returned `IN_PROGRESS` to **any** request seeing a nameless `CREATING`
memo. In neither case did it register the new operation ID as an observer.
The eventual `emitExecutorOutcome` went only to the incumbent ID. Thus a
foreign request could be acknowledged as in flight while no owner would ever
emit its result. An unowned nameless `CREATING` projection could additionally
promise work that was not scheduled at all.

The existing bound-retirement observer contract in
`u1-inventory-v3-independent-design-verdict-20261018.md` expressly
distinguishes the one authorized registered observer from excess requests that
must retain typed retry custody. The generic paths have **no** such observer
contract; adding a second list/dispatcher to accommodate a false ACK would
duplicate responsibility. Prior U1 failures around stale generations and
post-await cleanup are evidence of this **cross-owner class**, not proof the
specific generic behavior is valid.

## Frozen test-only negative evidence

* [Lab #472](https://github.com/psvensson/lagrange-lab/issues/472),
  [test-only da0f5517](https://github.com/psvensson/lagrange/commit/da0f55174fe0e5982513b94f2661416000c0639c):
  **expected RED** at `FOREIGN_REMOVE_WAS_ACKNOWLEDGED_WITH_NO_OUTCOME_OWNER`.
  The actual reply was `in_progress` instead of `error`. The four original
  execution-custody cases remained green.
* [Lab #478](https://github.com/psvensson/lagrange-lab/issues/478),
  [test-only d498f0da](https://github.com/psvensson/lagrange/commit/d498f0da3b2cf8e1ce0fcd5322a19e072d5b9c25):
  the same original-source REMOVE regression plus a public generic CREATE
  foreign-operation oracle. Preserve its exact receipt for the CREATE first
  failure; the tail alone may omit that assertion.
* [Lab #482](https://github.com/psvensson/lagrange-lab/issues/482),
  [test-only 453100c5](https://github.com/psvensson/lagrange/commit/453100c56182ccde12aac09f400d3e2bd8c732c4):
  adds the no-owner nameless `CREATING` continuation witness. Preserve exact
  recorded first failure.
* [Lab #487](https://github.com/psvensson/lagrange-lab/issues/487),
  [test-only 1c29bfc5](https://github.com/psvensson/lagrange/commit/1c29bfc5bf5de6731e2e8c885545823303ca7933):
  revises the older synthetic `CREATING`-without-work expectation. It must
  stay RED before counting final-byte source-only controls; terminal receipt
  initially outstanding.

The earlier test-only candidate `ccdd6938` is the complete **15+23 PASS**
[lab #439](https://github.com/psvensson/lagrange-lab/issues/439) /
[lab #440](https://github.com/psvensson/lagrange-lab/issues/440)
(418 + 958 runner assertions). That pass binds its older source/test tree only.

## Candidate owner correction (no new authority)

* [e0461e46](https://github.com/psvensson/lagrange/commit/e0461e46bc9c4f5db5fa3604b7b559f970d9969f):
  `runtime-service-creation-execution.js` derives one typed
  `replyToGenericExecutionGate` from the **existing** admitted entry.
  Only an exact operation type+body joins as `IN_PROGRESS`; same-ID changed
  body/kind fails `CONTENT_CONFLICT`, and a foreign operation receives a
  retryable `RETIREMENT_IN_PROGRESS` refusal.
* [4868a934](https://github.com/psvensson/lagrange/commit/4868a934214d6c0295f9b5aa0482ff9216497a7c):
  the generic REMOVE consumer delegates its busy decision to that owner;
  physical STOP target capture, post-await exact memo check and `finally`
  gate release remain unchanged.
* [eabba728](https://github.com/psvensson/lagrange/commit/eabba72856732bd21988d27c566fc8d44f1b68a5):
  generic nameless `CREATING` uses the same owner to decide whether
  `IN_PROGRESS` is truthful. With no installed attempt, it returns control
  to the **existing public CREATE admission** instead of inventing
  background retry. Bound named creation plans retain journal-first routing.
* [Lab #488](https://github.com/psvensson/lagrange-lab/issues/488):
  submitted exact SHA `eabba728` for focused positive verification;
  its terminal result must be read, never presumed.

## Scope and still-required verification

1. Confirm final test-only #487 is a genuine first-source RED at the intended
   CREATE/REMOVE/nonowned-memo assertions, not an unrelated harness failure.
2. Confirm #488 exact-source positive, check all pre-existing tests and preserve
   the successor, failure-gate and one-observer assertions.
3. Introduce isolated source-only mutant(s) reverting **only** generic gate
   matching at final unchanged test tree; require direct wrong-ACK proof.
4. Independently review the older fabricated no-owner `CREATING` assertion
   supersession. A mock `CREATING` status without an installed execution
   cannot certify in-flight work, but it is not authority to infer physical
   absence, durable journal completion or a new generation.
5. Run the complete 15+23 U1 profile at one immutable corrected SHA; no
   attribution from older 38-file candidate. Complete the canonical
   classification/import-graph metadata through their actual producers and
   normal hooks; do not hand-edit digests or accept lab source preparation
   in lieu of those gates.
6. Account for legacy opaque authorization and bound registered observer
   behavior separately. The generic helper must not replace the durable
   original-operation owner or widen the bound observer count. The final
   combined 55-item independent U1 checklist remains authoritative.

The neighboring CREATING-state false acknowledgment is treated as a
**systemic hypothesis confirmed by its entry path**, not an excuse to
weaken the exact-retained-creation path. Only executed source proof and
independent review decide whether its correction is releasable.
