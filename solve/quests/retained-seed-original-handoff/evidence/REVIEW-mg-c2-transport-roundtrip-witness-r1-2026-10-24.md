---
audience: development
documentClass: planning
---

# REVIEW: C2 transport round-trip witness, r1 (2026-10-24)

Reviewer: independent subagent (did not author the test). Quest
`retained-seed-original-handoff`, epic `raft-rs-full-cutover`, composition
defect C2 ("transport erases contradictory receipt fields").

## Verdict: APPROVE WITH REQUIRED CHANGES

The file is a real, non-vacuous predecessor witness: it is red today on the
C2 mechanism (six laundering cells plus one rewrite cell, on all three real
paths and in the unit anchor), its positive controls pass for the right
reason, its setup cuts are named apart from the behavioural cut, and it holds
no production edits, skips or flag coupling. It may NOT be measured as-is,
for one blocking reason and three cheap ones:

1. RC1. The test pins a `deliveryState` policy that contradicts the only
   recorded design for the coming fix AND its own header. Header lines 5-6
   list `deliveryState` as a fact transport may ADD; the preservation loop
   (195-205) then demands byte preservation of a supplied `deliveryState`
   even when it contradicts the computed state (cell
   `PROVISIONAL_DELIVERED_WITH_RETRY_HINT`, 102-103). The handover design
   (HANDOVER-2026-10-23-resume-workspace-interruption.md:172-174 and
   bed8c6354:HANDOVER-2026-10-24-r2-preservation.md "C2") says a supplied
   deliveryState must never overwrite a computed failure/deferral and an
   explicit state conflict retains a FAILED outcome. Under that design the
   cell stays red after the fix. The owner must decide before measurement
   (measurement binds the SHA). Default edit below encodes the handover
   design (B); the alternative (A) is a recorded supersession.
2. RC2. The idempotence test (243-254) omits the one cell where the second
   normalization can re-map state (`DELIVERED_WITH_RETRY_HINT`): the
   classifier ranks DEFERRED above FAILED (transport-semantic-outcome.js:
   119-123), so a first-pass FAILED-with-deferral can become DEFERRED on the
   second pass. Iterate all CASES; it is a pure function and stays green today.
3. RC3. R06: `SETTLED = 'settled'` (39) copies
   `SERVICE_RESPONSE_DISPOSITION_KIND.SETTLED`
   (src/transport/message-router-shared-vocabulary.js:106-108, exported :483;
   sibling precedent for the import: test/transport/message-router-cdc-custody.test.js).
4. RC4. Three laundering cells are missing on metadata fields whose only
   current cell is either a rewrite (errorCode) or a boolean/number value
   conflict (deferRetry, retryAfterMs). A type-guarded partial fix (preserve
   only same-typed values) passes the current matrix and still launders these.
   Each is red today on all three paths and unambiguous under either design.

All four edits keep every currently red cell red and add reds only (RC4) or
leave today's verdict unchanged (RC2, RC3). Re-run locally (single file,
about 1 s), record the new SHA, then measure on the lab host.

### Required edits (exact)

RC1 (default = handover design B: state conflict reports FAILED)

Replace test lines 100-107 with:

```js
// A supplied deliveryState that contradicts the computed transport state is
// reported FAILED (a state conflict is never preserved as DELIVERED); every
// other supplied claim is preserved verbatim. `expect` names the fields whose
// delivered value lawfully differs from the supplied one.
const PROVISIONAL_CONFLICTS = [
  ['DEFER_RETRY_FALSE', {deferRetry: false}],
  ['DELIVERED_WITH_RETRY_HINT',
    {deliveryState: TRANSPORT_DELIVERY_OUTCOME_STATE.DELIVERED, retryAfterMs: RETRY_MS},
    {deliveryState: TRANSPORT_DELIVERY_OUTCOME_STATE.FAILED}],
  ['SUCCESS_TRUE', {success: true}],
  ['ERROR_NULL', {error: null}],
].map(([name, fields, expect = {}]) => ({name: `PROVISIONAL_${name}`, kind: KIND.PROVISIONAL,
  fields, expect, reply: () => provisional(fields)}));
```

Line 97-98 (COMMITTED_CONFLICTS map): `.map(([name, fields, expect = {}]) =>
({name: ..., kind: KIND.COMMITTED, fields, expect, reply: ...}))`.

Lines 196-205 (`preservation`): signature `preservation(raw, outcome, expect = {})`;
line 201 becomes
`expected[field] = {present: true, value: Object.hasOwn(expect, field) ? expect[field] : raw[field]};`.
Line 226: `const kept = preservation(raw, outcome, entry.expect ?? {});`.

Lines 260-264 (anchor): compute
`const want = Object.hasOwn(entry.expect, field) ? entry.expect[field] : entry.fields[field];`
and test `!Object.is(outcome[field], want)`, printing `want` in the message.

Header lines 5-7: "Transport may ADD facts (acknowledged, deliveryState,
queueWaitMs) and reports a supplied deliveryState that contradicts its
computed state as FAILED; it must never erase or rewrite any other explicitly
supplied claim."

Alternative A (no code change): record in the quest log that a supplied
`deliveryState` is preserved verbatim, superseding the handover
recommendation, and accept that `isDeliveredTransportDeliveryOutcome`
(transport-semantic-outcome.js:350-352) can then be true on an outcome that
also carries `deferRetry:true`/`retryAfterMs>0` for every non-CDC consumer.
I recommend B: R07 (named state), R11, and the handover's own hazard
statement all point the same way, and B is what makes the matrix reject the
lazy "spread the raw reply last" fix (see section 7).

RC2. Replace lines 243-254 with:

```js
test('C2 normalizeDeliveryOutcome is idempotent on CDC replies', () => {
  for (const entry of CASES) {
    const once = normalizeDeliveryOutcome(routerEnvelope(entry.reply())).result;
    const twice = normalizeDeliveryOutcome(once).result;
    assert.deepEqual(twice, once, `C2_IDEMPOTENT_${entry.name}`);
  }
});
```
(`routerEnvelope(undefined)` for ACK_ONLY is a valid spread.) Verified by
reading the builder that every case is idempotent today, so this stays green
and pins the property for the fix.

RC3. Add
`import {SERVICE_RESPONSE_DISPOSITION_KIND} from '../../src/transport/message-router-shared-vocabulary.js';`,
delete line 39, and in `settledCount()` (175) index with
`SERVICE_RESPONSE_DISPOSITION_KIND.SETTLED`.

RC4. Add to COMMITTED_CONFLICTS (83-96):

```js
  ['ERROR_CODE_EMPTY_STRING', {errorCode: ''}],
  ['DEFER_RETRY_WRONG_TYPE', {deferRetry: 'yes'}],
  ['RETRY_AFTER_WRONG_TYPE', {retryAfterMs: String(RETRY_MS)}],
```
Today: `''` -> null (transport-semantic-outcome.js:70-81, 223-225), `'yes'`
-> false (classify :101, output :246), `'250'` -> null (:64-68, 219-222);
each delivered outcome then passes `isCommittedCdcDelivery` while the raw
reply fails `isCommittedCdcOutcome` (cdc-delivery-outcome.js:139, 141, 143).
Expected post-edit shape: 27 cases; 10 red cases x 3 paths + 10 anchor reds
= 40 leaf reds, 4 red parents, 61 passes (verify by running; do not trust
this arithmetic over the TAP).

### Recommended, not blocking

- R-a. `settledCount()` (174-176) always reads `fixture.sender`; on LOCAL
  and INLINE_ACK the delta-0 assertion is vacuous (harness-fidelity item 5).
  Read `router.getServiceResponseDispositionCounts()` instead.
- R-b. The behavioural assertion (227-232) bundles launder and preservation
  in one deepEqual. The TAP diff does show which component differed, but the
  name does not; consider adding `laundered: deliveredPredicate !== valid`
  to the message, or two named asserts, so a measurement classifier can
  separate C2 launders (6 cells) from the rewrite-only cell
  (`COMMITTED_ERROR_CODE_LOWER_CASE`).
- R-c. Green controls worth adding (same mechanisms, new shapes):
  committed `{error: 'boom', status: TRANSPORT_COMPLETED_STATUS}`
  (completedWithError branch :229-230; import the constant);
  committed `{deliveryFailures: [{}]}`; provisional
  `{reasonCode: TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.ACK_REJECTED}`
  (launder today via M1); provisional `{retryAfterMs: 0}` (launder today
  via M3); committed `{deliveryState: 5}` (launder today via M5; expected
  value is design-dependent, so add only after RC1 is decided).
- R-d. `acknowledged: false` on a committed reply: see finding F-OUT-1. If
  added as a control, restrict with `paths: [PATH.LOCAL,
  PATH.SERVICE_RESPONSE]` because the legacy peer strips `acknowledged`
  from the result before the ACK frame (websocket-transport-messages.js:38),
  which would be a non-C2 red on INLINE_ACK.
- R-e. When the fix lands, add this file to `witnessTests` of the registered
  pair `cdc-source-native-delivery` (test/shards/impact-contracts.json:
  2886-2970 names both owners; :1411 and :2963 list witnesses). Registration
  rides with the owner change, not with this predecessor (owner-interaction
  template item 10).

## Identity

| Item | Value |
| --- | --- |
| Subject | `/mnt/data/peter/projects/.worktrees/mg-c2-transport-witness-20261024/test/transport/message-router-cdc-outcome-roundtrip.test.js` (untracked, 268 lines) |
| SHA256 (recomputed) | `e87606ce2b1f609ca12d3b1378c8ba0bbe7403999c631a52e04fbcbd4b14c978` (matches author) |
| Worktree HEAD / branch | `1e2fcc2da391ab72883132a22fbfbde39b2313f7` / `work/mg-c2-transport-witness-20261024` |
| Production diff from base | none (`git status`: only `test/shards/{impact-graph-seal,primary-classes,resource-classes,subsystem-classes}.json` modified by the author's `test:metadata:refresh`, plus the untracked subject) |
| Author TAP | `.../scratchpad/c2/run1.tap`, SHA256 `b657b07125c0915572cca82cd96df9d52ac2af4ae0421c6117b84ef885ecd652` |
| Reviewer TAP | `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/c74561e1-2969-4696-bd5a-1d3a410f38a7/scratchpad/c2/review-run.tap`, SHA256 `d88c12c513fa3c1d473447b2705df8a32d56acd28a30b9cf0dac8d68b43f9543` |
| Node | v22.23.2 |

## Property as stated and as tested

Stated (header 3-9): for a handler reply R with CDC receipt metadata, the
outcome O the router's caller receives must not pass the canonical CDC
predicate when R fails it; transport may add facts but never erase/rewrite a
supplied claim; oracle = canonical validators on R and on O plus own-property
preservation. Tested (215-236): per path and case, (i) raw verdict asserted
equal to the declared expectation (222-223, `RAW_PREDICATE_IS_<bool>`), (ii)
one deepEqual over `{deliveredPredicate, preserved}` (227-232). The raw
predicate is `isCommittedCdcOutcome`/`isProvisionalCdcOutcome` and the
delivered one `isCommittedCdcDelivery`/`isProvisionalCdcDelivery` (61-64),
as required. The committed delivered predicate needs `acknowledged:true`
(cdc-delivery-outcome.js:146 and :336-339 via `isDeliveredTransportDeliveryOutcome`),
which only the router adds (message-router-delivery-behaviors.js:73 local,
:456 SERVICE_RESPONSE; message-router-pending-response-ledger.js:548-551
inline ACK), while the raw committed reply has no `acknowledged`
(`buildCommittedCdcOutcome` :239-247) and still passes because
`acknowledged` is optional (not in `COMMITTED_REQUIRED_FIELDS` :63-65). So
the positive proves the live path, not a fixture. Property statement and
test agree except for `deliveryState` (RC1).

## Mechanism classification (owner: src/transport/transport-semantic-outcome.js, `buildTransportDeliveryOutcome` 218-257)

| Id | Mechanism | Lines | Fields |
| --- | --- | --- | --- |
| M1 | input ignored, value recomputed | 250-256 | reasonCode |
| M2 | strict `=== true` coercion; output is the computed boolean | 226 (noHandler), classify :101 and output :246 (deferRetry) | noHandler, deferRetry |
| M3 | positive-finite-or-null numeric normalizer | 64-68, 219-222 | retryAfterMs |
| M4 | non-empty-string-or-null, then `toUpperCase` | 70-81, 223-225 (reads `errorCode ?? code`) | errorCode |
| M5 | claimed state read (228), output is computed state with DEFERRED ranked above FAILED | 99-125, 245 | deliveryState |
| M6 | verbatim passthrough via `...options` | 243 | error, status, success, cdc*, deliveryFailures, unknown keys, `code`/`message` |
| M7 | `acknowledged === true`; router spreads the reply AFTER setting `acknowledged:true` | 227; delivery-behaviors.js:73-74, 456-457 | acknowledged |

Normalization points: LOCAL once (deliverLocal 69-77 -> deliver:184);
SERVICE_RESPONSE once (remote sends raw `result`, inbound-dispatch.js:476-481;
wrapped at delivery-behaviors.js:452-460 -> :184); INLINE_ACK twice
(:382 on the ACK, then `completeRemoteDelivery` returns `{result: ackResult}`
at :439-444 -> :184). `normalizeDeliveryOutcome`
(message-router-outbound-queue-admission.js:140-164) calls the builder on
`outcome.result` (branch 1) or on `outcome` (branch 2); the test's second
pass takes branch 2 on the already-built result, which is the same builder
call as the live second pass, so the idempotence test models the live path.

## Coverage model

Legend: GREEN = covered, passes today (transport does not erase; guards a
fix that stops spreading); RED-L = covered, red today by laundering
(delivered predicate true while raw false); RED-R = covered, red today by
rewrite only (predicate agrees, value changed); ADD = required (RC4); REC =
recommended; shape = known-mechanism new shape, acceptable to omit. Every
case runs on LOCAL, SERVICE_RESPONSE and INLINE_ACK except ACK_ONLY
(LOCAL, SERVICE_RESPONSE only; justified: a plain ACK from the legacy peer,
websocket-transport.js:443, is not inline payload under
`hasInlineAckPayload` ledger:485-496, so the router arms a SERVICE_RESPONSE
wait at delivery-behaviors.js:446-450 that the legacy peer never answers).

| Field | Committed: wrong value | Committed: wrong type | Committed: boundary | Provisional: wrong value | Provisional: wrong type | Provisional: boundary |
| --- | --- | --- | --- | --- | --- | --- |
| deliveryState (M5) | DELIVERY_STATE_FAILED GREEN, DELIVERY_STATE_DEFERRED GREEN (claimed == computed) | `5` -> null -> DELIVERED: launder today; REC after RC1 (expected value design-dependent) | n/a | DELIVERED_WITH_RETRY_HINT RED-L (policy conflict -> RC1) | shape | n/a |
| deferRetry (M2) | DEFER_RETRY_TRUE GREEN | `'yes'` -> false: launder today -> ADD | n/a | DEFER_RETRY_FALSE RED-L | shape (`'yes'` -> true via retryAfterMs) | n/a |
| errorCode (M4) | ERROR_CODE_LOWER_CASE RED-R (`'x'`->`'X'`; both predicates reject) | `5` -> null: launder today; REC | `''` -> null: launder today -> ADD | shape (same normalizer) | shape | shape |
| noHandler (M2) | NO_HANDLER_TRUE GREEN | NO_HANDLER_WRONG_TYPE (`1`) RED-L | n/a | shape (`true` preserved -> green) | shape (`1` -> false launder) | n/a |
| reasonCode (M1) | REASON_CODE_ACK_REJECTED RED-L | shape (erased regardless of type) | shape | `ack_rejected` -> `transport_deferred` launder; REC | shape | shape |
| retryAfterMs (M3) | RETRY_AFTER_POSITIVE GREEN (becomes deferred, preserved) | `'250'` -> null: launder today -> ADD | RETRY_AFTER_ZERO RED-L, RETRY_AFTER_NEGATIVE RED-L | n/a | shape | `0` -> null launder (deferral kept by deferRetry); REC |
| error (M6, + completedWithError :229-230) | `'boom'`+`status:'completed'` green control; REC | n/a | ERROR_EMPTY_STRING GREEN | ERROR_NULL GREEN | n/a | n/a |
| status (M6) | STATUS_UNKNOWN (`'bogus'`) GREEN | n/a | n/a | shape | n/a | n/a |
| acknowledged (M7) | `false`: not covered; different direction (claim overrides transport fact), see F-OUT-1 | n/a | n/a | same | n/a | n/a |
| success (M6) | shape | n/a | n/a | SUCCESS_TRUE GREEN | n/a | n/a |
| unknown key (M6) | UNKNOWN_FIELD GREEN | n/a | n/a | shape | n/a | n/a |
| deliveryFailures (M6) | non-empty: green control, shape; REC | n/a | n/a | shape | n/a | n/a |
| `code` / `message` aliases (M4/M6) | shape: any `code`/`message` key fails `outcomeFieldsMatch` (cdc-delivery-outcome.js:166-170) on the unknown key, so no launder is possible; transport may ADD `errorCode` from `code` (:223-225) which the predicate also rejects | | | | | |
| cdcVectorDigest | not transport's concern: M6 passthrough; rejected by `matchesCdcVector` (:304-306, :311, :326). Correct to omit. | | | | | |

Controls present and passing for the right reason: COMMITTED_POSITIVE and
PROVISIONAL_POSITIVE (raw true, delivered true only because transport added
`acknowledged:true` and, for provisional, `reasonCode: transport_deferred`
:168-169); *_WRONG_GROUP (both false; proves the group argument is honoured
:316, :324-325); ORDINARY_SUCCESS_* (both false; proves non-CDC replies do
not pass); ACK_ONLY_COMMITTED (undefined reply; `isRecord` false :167).

Today's reds by category: launder 6 cases (REASON_CODE_ACK_REJECTED,
NO_HANDLER_WRONG_TYPE, RETRY_AFTER_ZERO, RETRY_AFTER_NEGATIVE,
PROVISIONAL_DEFER_RETRY_FALSE, PROVISIONAL_DELIVERED_WITH_RETRY_HINT);
rewrite-only 1 (ERROR_CODE_LOWER_CASE). Each red on all three paths and in
the anchor; identical sets in the author's TAP and mine.

## Findings by category

### A. Property / design (owner: transport-semantic-outcome.js; decision: quest owner)

- A1 (RC1, blocking). deliveryState conflict policy contradiction. Test
  5-6 vs 195-205 and 102-103; handover 172-174. Classification: not a
  new-mechanism gap but a policy pin the fix cannot satisfy under the only
  recorded design. Evidence that it matters beyond CDC: generic consumers use
  `isDeliveredTransportDeliveryOutcome` (:350-352) on `deliveryState` alone.
- A2 (RC2, blocking). Idempotence sample set misses the state-conflict cell;
  classifier precedence :119-123. Same-mechanism gap, but the only cell where
  the second pass can differ under design B.
- A3 (RC4, blocking by the wrong-fix criterion). Missing laundering cells on
  errorCode (`''`), deferRetry (`'yes'`), retryAfterMs (`'250'`). Same
  normalizer mechanisms as covered cells (M2/M3/M4), so acceptable by the
  "known mechanism" criterion alone; required because a per-type partial fix
  passes the current matrix and still launders them.
- A4 (info). ERROR_CODE_LOWER_CASE is a rewrite, not a launder: `'x'` and
  `'X'` both fail the predicate (:139). Its red is on the preservation
  component only. This pins "preserve raw errorCode, no uppercasing", which
  is consistent with the handover design ("preserve each explicitly owned raw
  metadata field") and with the property the brief states. The fix author
  must know that keeping `toUpperCase` on the OUTPUT keeps this cell red;
  classification used internally may still uppercase. No change required.

### B. Oracle independence

- B1. Same validator on both sides, but each conflict cell first asserts the
  raw verdict is false (222-223), so a loosened predicate fails at
  `RAW_PREDICATE_IS_false` before transport is engaged; each positive asserts
  raw true and delivered true. The raw/delivered predicates are the
  documented pair (61-64). Residual vacuity: none found that the controls do
  not exclude; a fix that drops every CDC field fails the positives, a fix
  that throws fails preservation (fields absent), a fix that drops only the
  conflicting field fails `present:false`.

### C. Harness fidelity (template items 1-6)

- C1 Red for the right reason: yes. Each red reaches
  `C2_<path>_<case>_DELIVERED_MATCHES_RAW_VERDICT` after
  `HANDLER_ENGAGED_ONCE` (185), `NO_PENDING_RESPONSE_LEFT` (186),
  `NO_PENDING_ACK_LEFT` (187) and the settled-delta cut (188-191) all pass.
  TAP bodies show the mechanism (e.g. run1.tap:51-150 "reasonCode: supplied
  'ack_rejected', delivered null"; 696-807 "deliveryState: supplied
  'delivered', delivered 'deferred'"; 1687-1786 same on INLINE_ACK;
  2472-2506 anchor "reasonCode: 'ack_rejected' -> null").
- C2 Stub honesty: no stubs. Three real `MessageRouter`s (one without a
  server for LOCAL, 128-135, 144-147; two with servers connected via
  `connectToNode`, 149-155) and one real legacy `WebSocketTransport`
  (158-164). The LOCAL path is real local dispatch
  (message-router-delivery-pressure-routing.js:358-365 -> deliverLocal).
  Inline-ACK claim CONFIRMED: the only in-tree producers of ACK frames are
  message-router-inbound-dispatch.js:435-439 (plain), router-message-handler.js:
  267-271 (plain; this module is not imported by any src file, see F-OUT-4),
  and websocket-transport-messages.js:30-45 `buildServiceAcknowledgment`
  (inline payload, called from websocket-transport.js:431 and :443).
  inproc-transport.js emits no ACK frames; websocket-transport-provider.js:
  373-395 is an ACK consumer, not a producer. So no MessageRouter peer sends
  inline ACK payloads; the legacy transport is the honest in-tree way to
  exercise the router's live `hasInlineAckPayload` path. Whether any
  production deployment pairs a router with a legacy peer: unknown.
- C3 Time fidelity: no compressed constants, no timers in the test;
  `RETRY_MS` is payload only. The ACK_ONLY exclusion on INLINE_ACK avoids a
  real response-timeout wait rather than compressing it.
- C4 Field fidelity: events carry `eventKey`, `sourcePartition`, `timestamp`,
  `sourceLogIndex`, `sourceOrdinal` (45-52) as `durableCdcBindings` and
  `cdcSemanticEvent` read them; `POSITION {7, 2}` satisfies `logIndex > 0`,
  `term > 0` (:317-318).
- C5 Vacuous assertions: `settledCount()` reads `fixture.sender` for every
  path (174-176, 180), so the delta-0 assertion on LOCAL/INLINE_ACK is
  trivially true (R-a). Everything else is excluded by the controls.
- C6 Live binding: n/a (component witness, not a demo-line claim).
- C7 Lifecycle: shutdown of all routers and the peer in `after` (167-172);
  routers are pushed before `initialize` (132-133) so a mid-`before`
  failure still has them listed. Node's `after` runs on test failure; its
  behaviour when `before` itself throws was not verified (unknown). My run:
  0.8 s test time, 1.06 s wall, `skipped 0`, `todo 0`, no hang/leak markers.

### D. Rules

- D1 R06: `'settled'` literal (39) -> RC3. `HOST = '127.0.0.1'` (34): the
  only owner constant is module-private (`LOCAL_STR_127_0_0_1`,
  src/transport/node-address-resolution.js:20, not exported) and 8 sibling
  transport tests use the literal; no import is possible without a source
  change, so not required here. All other domain values are imported
  (TRANSPORT_DELIVERY_OUTCOME_STATE/REASON_CODE, CDC builders and
  predicates, MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE, ENTITY_TYPE, TABLES,
  CDC_OPERATION). Deliberately invalid probes (`'x'`, `'bogus'`,
  `extraClaim`) are correctly literal.
- D2 No skips (the `paths` filter at 218 omits a cell by `continue`, it
  does not emit a TAP skip; `# skipped 0`). No flag coupling. No production
  edits. `node --check` OK; `npx eslint` clean; 268 lines (test threshold
  1500).
- D3 Fixtures guideline "System Guideline Conformance Gate": the owners
  exercised (transport-semantic-outcome.js, outbound-queue-admission.js,
  cdc-delivery-outcome.js) are exactly the C2 defect owners; the test is
  the regression that captures the violation, per the guideline's step 3.

### E. Named cuts

- E1. Setup cuts and behavioural cut are distinct and carry path and case
  (184-191, 225, 231). A positive-control failure fails at
  `C2_<path>_COMMITTED_POSITIVE_RAW_PREDICATE_IS_true` or
  `..._DELIVERED_MATCHES_RAW_VERDICT`. `before` failures surface as hook
  failures, not as behavioural reds. R-b would additionally name launder vs
  rewrite.

### F. Idempotence

- F1. Pins `normalize(normalize(x).result).result` deepEqual
  `normalize(x).result` (243-254) with the live second-pass shape (see
  Mechanism section). Covers three contradictory inputs; misses the
  state-conflict cell -> RC2.

### G. Wrong fixes that would pass (question 7)

- G1 "Preserve the six metadata fields but spread the raw reply LAST":
  passes today's matrix under design A; under design B the
  DELIVERED_WITH_RETRY_HINT cell rejects it (expected FAILED, gets
  'delivered'). This is the strongest argument for B.
- G2 "Throw on contradiction": `deliver` catches via `withDeliveryLifetime`
  (delivery-behaviors.js:192-202) and returns a deferred failure without CDC
  fields -> preservation `present:false` -> red. Caught.
- G3 "Preserve only same-typed values": passes today's matrix; caught by
  RC4.
- G4 "Preserve on first pass, erase on second": caught by INLINE_ACK path
  and the idempotence test.
- G5 "Loosen the CDC predicate": caught by `RAW_PREDICATE_IS_false`.
- G6 "Skip the builder when CDC fields are present" (CDC grammar in
  transport, forbidden by the handover): behaviourally passes; the test
  cannot detect where the decision lives. Source review must check the
  import graph of transport-semantic-outcome.js and outbound-queue-admission.js
  for `cdc/` imports. Recorded limit.

### H. Findings outside the test's scope (R17; recorded, not absorbed)

- F-OUT-1 (owner: transport). A handler reply can override the router's
  own `acknowledged:true` because the reply is spread after it
  (message-router-delivery-behaviors.js:73-74 and :456-457); on INLINE_ACK
  the legacy peer strips `acknowledged` from the result
  (websocket-transport-messages.js:38) and the router re-adds true. Inverse
  direction of C2 (claim erases transport fact). Not a C2 cell; the test's
  property would pass it (false preserved, predicates false).
- F-OUT-2 (owner: publication/lander). `npm run -s test:duplication` is red
  in this worktree: 701 clone groups / 26618 lines vs baseline 697 / 26369.
  The jscpd report lists 0 clone groups involving the subject, so the red is
  independent of this file (pre-existing in the base tree or the author's
  environment); it will block a land until repaired.
- F-OUT-3 (owner: generated-artifacts/lander). The author's
  `test:metadata:refresh` added 13 census entries for test files that exist
  at base `1e2fcc2da` but were absent from the committed shards (e.g.
  test/cdc/cdc-delivery-complete-vector.test.js,
  test/transport/message-router-cdc-custody.test.js). The base metadata was
  stale; the shard diff therefore carries unrelated corrections (R16 scope
  note for whoever commits it).
- F-OUT-4 (owner: transport). `src/transport/router-message-handler.js` is
  not imported by any `src/` module (only by three tests and the shards);
  it duplicates `handleServiceMessage`/`handleAcknowledgment`. Possible dead
  production surface; not a C2 concern.
- F-OUT-5 (owner: transport, info). `INLINE_ACK_PASSTHROUGH_KEYS`
  (message-router-shared-vocabulary.js:237-242) includes the six metadata
  fields, so an inline ACK carrying only metadata fields is not detected as
  inline payload. Not exercised here.

## What I ran and results

| Command (in the worktree) | Result |
| --- | --- |
| `git rev-parse HEAD`, `git branch --show-current`, `git status --short`, `git diff --stat 1e2fcc2da HEAD` | HEAD = base; branch as stated; only shard JSONs modified; subject untracked; no production diff |
| `sha256sum <subject>` | `e87606ce...4978`, matches author |
| `node --check <subject>` | OK |
| `npx eslint <subject>` | clean, exit 0 |
| `npm run -s test:file -- test/transport/message-router-cdc-outcome-roundtrip.test.js` (TAP saved to review-run.tap) | thermal ok 55C; 93 tests, 61 pass, 32 fail, 0 skipped, 0 todo; 804 ms test time, 1.06 s wall; exit 1 as expected for a predecessor red |
| `diff` of verdict lines, author run1.tap vs review-run.tap | identical except the file-level duration (3630 ms vs 804 ms) |
| `npm run -s test:duplication` | RED (701/26618 vs 697/26369); 0 clone groups involve the subject (F-OUT-2) |
| `npm run -s audit:file-size` | exit 0; lists pre-existing over-threshold files, none related |
| Reads | AGENTS.md (CLAUDE.md), rules.md, router.md, verification-templates INDEX + transport-delivery + owner-interaction + harness-fidelity, test/guidelines/harness.md + fixtures.md, contract F4 (615-667) and typed table (204-222), both C2 handover sections, transport-semantic-outcome.js (full), cdc-delivery-outcome.js (full), message-router-outbound-queue-admission.js (full), message-router-delivery-behaviors.js (full), message-router-pending-response-ledger.js (150-579), message-router-inbound-dispatch.js (380-520), websocket-transport.js (410-450, 570-600), websocket-transport-messages.js (25-60), message-router-ack-delivery.js (full), message-router-delivery-pressure-routing.js (323-370), message-router-connection-lifecycle-methods.js (247-300), message-router-server-lifecycle.js (29-75), shared-vocabulary (106-116, 237-242), impact-contracts.json (1335-1420, 2885-2970), sibling tests (grep-level), port-allocator and boot-incarnation fixture (API level) |

## Limits of this review

- Local single-file run only; not measured on a lab host.
- Not read in full: websocket-transport.js (IDENTIFY handshake with a
  router client), message-router.js constructor beyond option names,
  `establishConnection`. Liveness of the three paths is evidenced by the
  positives passing on each path, not by reading the handshake.
- Node `after` hook behaviour when `before` throws: not verified.
- Production reachability of the inline-ACK path (router paired with a
  legacy `WebSocketTransport` peer): unknown. The router code path is live.
- Idempotence under the future fix (design B FAILED-with-deferral) is
  reasoned from the classifier, not measured.
- Duplication-ratchet attribution is from this run's jscpd report, not from
  a clean-base re-run.
- `npm run audit:guidelines` was not run; the R06 assessment is by reading.
- Whether the shard metadata diff should be committed with this test is a
  lander question I did not evaluate beyond F-OUT-3.
- Nothing not listed under "What I ran and results" is approved by
  implication.

---

## Re-review r2 (2026-10-24, same independent reviewer; append-only)

### Verdict: APPROVE for predecessor measurement

Applies to exactly:
`/mnt/data/peter/projects/.worktrees/mg-c2-transport-witness-20261024/test/transport/message-router-cdc-outcome-roundtrip.test.js`,
SHA256 `2a044a90f11bd0992f6d8c393fe8b3dcb53b264c982610b6cb3651d339a9ddd9`
(recomputed; matches the author's report), 277 lines, untracked on branch
`work/mg-c2-transport-witness-20261024` at base
`1e2fcc2da391ab72883132a22fbfbde39b2313f7`, production unchanged (worktree
still shows only the four author-refreshed `test/shards/*.json` plus this
file). Any later byte change voids this verdict and requires re-review and
re-measurement.

### Each required change, checked against the bytes

| Item | Applied as specified | Evidence (revised file lines) |
| --- | --- | --- |
| RC1 header | yes | 5-8: "reports a supplied deliveryState that contradicts its computed state as FAILED; it must never erase or rewrite any other explicitly supplied claim" |
| RC1 `expect` map | yes | PROVISIONAL_CONFLICTS 109-117: third tuple element `{deliveryState: TRANSPORT_DELIVERY_OUTCOME_STATE.FAILED}` on DELIVERED_WITH_RETRY_HINT (111-113); constant imported at 25; both `.map` callbacks take `[name, fields, expect = {}]` and carry `expect` (102-103, 116-117); explanatory comment 105-108 |
| RC1 preservation | yes | `preservation(raw, outcome, expect = {})` 208-218, expected value `Object.hasOwn(expect, field) ? expect[field] : raw[field]` (213-214); call site 239 `entry.expect ?? {}` (controls carry no `expect`) |
| RC1 anchor | yes | `want(field)` 268-269 reads `entry.expect` then `entry.fields`; filter 270-271 `!Object.hasOwn(outcome, field) || !Object.is(outcome[field], want(field))`; message prints supplied, want and actual (272-273) |
| RC2 | yes | 256-262 iterates `CASES` (27 entries: 7 controls + 16 committed + 4 provisional conflicts); ACK_ONLY reaches `routerEnvelope(undefined)` (251-254), a valid object spread; green in both runs (`ok 4`) |
| RC3 | yes | import 30-31 `SERVICE_RESPONSE_DISPOSITION_KIND` from message-router-shared-vocabulary.js; used 185-186; the `'settled'` literal is gone |
| RC4 | yes | 99-101: `ERROR_CODE_EMPTY_STRING {errorCode: ''}`, `DEFER_RETRY_WRONG_TYPE {deferRetry: 'yes'}`, `RETRY_AFTER_WRONG_TYPE {retryAfterMs: String(RETRY_MS)}` |
| R-a (only tightening taken) | yes | `settledCount(router)` 184-187; both call sites pass the acting router (191, 199), so the delta-0 cut is now meaningful on LOCAL and INLINE_ACK |

Nothing else changed relative to r1: CONTROLS (69-83), fixture and
handlers (123-145), `before`/`after` (147-182), `suppliedText` (220-226),
the main loop (228-249, except line 239), `routerEnvelope` (251-254) are
byte-for-byte the r1 text. Line delta 268 -> 277 (+9) is fully accounted
for by the edits above.

### No red lost, no assertion weakened

- All seven r1 red cases remain red on all three paths and in the anchor;
  the three RC4 cells are red on all three paths and in the anchor. 10 red
  cases x 3 paths = 30 path reds, every one failing at
  `C2_<path>_<case>_DELIVERED_MATCHES_RAW_VERDICT`; 10 anchor reds, every one
  at `C2_ANCHOR_<case>_EXPLICIT_FIELD_REPLACED`; 0 failures at
  `RAW_PREDICATE_IS_*`, `HANDLER_ENGAGED_ONCE`, `NO_PENDING_*` or
  `*_SETTLED_BY_SERVICE_RESPONSE`. Of the 30 path reds, 27 are launders
  (`deliveredPredicate` actual true vs expected false: 9 launder cases x 3)
  and 3 are the rewrite-only `COMMITTED_ERROR_CODE_LOWER_CASE` cells.
- The only changed expectation is `deliveryState -> FAILED` on
  PROVISIONAL_DELIVERED_WITH_RETRY_HINT. Today's output is `'deferred'`
  (anchor body: `deliveryState: supplied "delivered", want "failed" ->
  "deferred"`), so the cell stays red on all paths and in the anchor; both
  the r1 expectation (DELIVERED) and the r2 expectation (FAILED) differ from
  today's value, so nothing was weakened. A fix that preserves `'delivered'`
  (design A) or leaves `'deferred'` is rejected; only FAILED passes.
- `want(field)` cannot pass vacuously: it never reads the outcome; every
  CONFLICTS entry has non-empty `fields` (85-101, 110-115); `expect` is
  non-empty for exactly one entry and its value differs from today's output
  (verified red above). The three new anchor bodies read
  `errorCode: supplied "", want "" -> null`, `deferRetry: supplied "yes",
  want "yes" -> false`, `retryAfterMs: supplied "250", want "250" -> null`,
  i.e. each is red by the laundering normalizer, not by setup.
- Totals: 105 tests, 61 pass, 44 fail (40 leaf reds + 4 red parents),
  0 skipped, 0 todo, 0 cancelled, matching the author's run2 exactly.

### What I ran (r2)

| Command | Result |
| --- | --- |
| `sha256sum`, `wc -l`, `git rev-parse HEAD`, `git status --short` | `2a044a90...ddd9`, 277 lines, HEAD = base, worktree as described |
| `node --check <file>`; `npx eslint <file>` | SYNTAX_OK; clean |
| `npm run -s test:file -- <file>` -> `.../scratchpad/c2/review-run2.tap` (SHA256 `7c6500f0d74ea82183b95c2d4ab3dcd6cedd1566aa070ee85c19905932066430`) | thermal ok 74C; 105/61/44, 887 ms, 1.34 s wall; exit 1 as expected. CAUTION: this capture is the runner's stdout and the runner ELIDES mid-stream output above a size threshold (marker at line 1483: "34706 byte(s) elided; full output in .tap/test-results/<file>.tap"); 22 verdict lines of the SERVICE_RESPONSE block are absent from this file although the process summary counts them. My r1 capture was below the threshold; this one is not. |
| Same command with stdout/stderr separated -> `review-run2b.stdout.tap` (SHA256 `ee0f6bbc...1fc7`), stderr empty | same 83 verdict lines: the gap is elision, not stderr interleaving |
| `npx tap --reporter=tap <file>` -> `.../scratchpad/c2/review-run2-direct.tap` (SHA256 `63770a2025d4109a8fa04495a556fcf3bee4a6deb22cf8723cc9efdf474a9d38`) | complete: 105 leaf+parent verdict lines; 105/61/44 |
| `diff` of leaf+parent verdict lines, author `run2-full.tap` (SHA256 `2ee09bc2edfe2d9e19f7dc22a3b2f6c0ce15b0b2784b90c07713af0c13bcf2c1`) vs `review-run2-direct.tap` | IDENTICAL (order preserved) |
| Runner's own full artifact | `.tap/test-results/test/transport/message-router-cdc-outcome-roundtrip.test.js.tap` exists in the worktree (gitignored), 105 verdict lines |

### Measurement note (process, not a test defect)

The lab measurement must archive the complete TAP (the runner's
`.tap/test-results/<file>.tap` artifact or a direct `npx tap --reporter=tap`
capture), not the runner's elided stdout; otherwise the SERVICE_RESPONSE
block's verdicts are missing from the retained evidence and an
"incomplete analysis" reading would fail the artifact.

### Heads-up for the fix author (not a test defect)

Under the encoded policy (state conflict -> FAILED) the FAILED-with-deferral
output must be stable under re-normalization: today's classifier ranks
DEFERRED above FAILED (transport-semantic-outcome.js:119-123), so a first-pass
FAILED would become DEFERRED on the second pass; the idempotence test (now
over all 27 cases) and the twice-normalized INLINE_ACK path will catch that.
This is the intended discrimination.

### Carried forward unchanged

Recommendations R-b, R-c, R-d, R-e and findings F-OUT-1..F-OUT-5 from r1
stand; none blocks predecessor measurement. R06 note on
`HOST = '127.0.0.1'` (no exported owner) unchanged. No repository file was
edited by me in r1 or r2.
