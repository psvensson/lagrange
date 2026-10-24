---
audience: development
documentClass: evidence
---

# VERIFY: C2/C3 transport delivery-outcome implementation, r1 (2026-10-24)

Independent verifier (Fable). I did not write the implementation. Nothing in any
repository was edited or committed; all runs were made in two detached scratch
worktrees of my own (snapshot and base), both removed at the end. Mutations of the
builder were applied transiently in the snapshot scratch worktree and reverted
(`git status` clean after each, recorded in the mutation log).

## Verdict: APPROVE WITH REQUIRED CHANGES (exact, small) for the commit; landing is blocked by two inherited gate reds this change did not cause

The four owner-approved semantics hold on the snapshot, each measured by my own
runs, not only by reading:

1. Repeated normalization is stable: `build(build(x))` deep-equals `build(x)` over
   31,104,000 enumerated inputs (my matrix), over the 27 CDC cases through the real
   LOCAL / SERVICE_RESPONSE / twice-normalized INLINE_ACK paths (approved witness,
   105/105 green), and over 75 forwarded replies across a real two-router hop.
2. Explicit codes survive byte-exact (`'x'`, `'X'`, `'router_connection_closed'`,
   `''`); only the owner's uppercase constants classify; absent fields keep today's
   defaults (deferral evidence, positive hint, boolean flags, reason ladder).
3. The rs-raft peer boundary decides solely on `isDelivered(classify(delivery))`:
   FAILED (incl. contradictory claim), DEFERRED, no-handler and non-object outcomes
   are recorded FAILED and the peer's later batch messages dropped; an ordinary
   acknowledged outcome is recorded DELIVERED (witness 20/20; production
   `sendToPeer` in all three providers returns `transport.deliver(...)`, never a bare
   value).
4. Retained obligations and retry ownership are preserved on failure: topology wave
   keeps a non-delivered target in the failed set and the wave's own retry owner
   retries it exactly `maxAttempts` times (witness 12/12); Raft re-sends through its
   next append/heartbeat; the MG forwarder routes through
   `resolveForwardFailureState` with the owner's DEFERRED answer.

Every one of seven builder mutations (deferral beats FAILED; `code` alias;
uppercase; `message` alias; spread-raw-last; drop failed-claim contradiction;
re-add classify flag pre-coercion) is caught by the unit test, and the two that
matter most (M5, M6) by four and five witness files respectively.

### Required changes (exact)

RC1 (owner `src/transport/transport-semantic-outcome.js:241-245`, low severity, no
decision affected). `classifyTransportDeliveryOutcome` still injects one default:
`{...resolvedValue, error: resolvedValue.error ?? null}`. Consequences I measured:
`classify(build(x))` is not a fixed point for any input without an own `error`
(adds `error: null`; 5 of 5 sampled violation classes in my matrix were exactly
this), so a classified outcome and a router outcome are two shapes of one value
(R08), and the comment at `:229-232` ("An answer is handed to the builder exactly
as supplied") is false by this one field. It is also the last remaining member of
the pre-coercion class the dossier named as sibling 2. Edit: line 245 becomes
`{...resolvedValue};` and the comment stays true. `completedWithError` is
unaffected (`normalizeOptionalString(undefined)` is `null`). Re-run
`test/transport/transport-semantic-outcome.test.js` and the grep
`error === null` over classify consumers; I found no consumer that distinguishes
`error: null` from absent, but did not trace every reader of `.error` (limit L6).
This may be folded into the already-ruled `defaultRetryAfterMs` edit of the same
function.

RC2 (claim accuracy, report only). The unit property matrix is 215,040 inputs
(8·5·8·4·3·7·2·2·2, the product the test itself asserts at `:274`), not 107,520 as
claimed. Coverage is larger than claimed; the number in the quest record should be
corrected.

### Not required now, but binding for the delta round (lead rulings already issued)

- `test/transport/transport-semantic-outcome.test.js:353-357` pins the behaviour
  the lead has ruled against (`{acknowledged:true, retryAfterMs:null}` with
  `defaultRetryAfterMs` becomes DEFERRED). When the ruling is applied this
  assertion must change in the same edit; my matrix confirms the hazard today
  (`classify({acknowledged:true}, {defaultRetryAfterMs:100})` is DEFERRED, and an
  own `retryAfterMs: 0` is overwritten by the default).
- Pressure-routing dual readers `:141-151`, `:165-181` and `failure?.acknowledged
  === true` at `:199`, and MG outbound dispatch `:234` are still present at the
  snapshot, as the lead expects.

### Inherited landing blockers (not caused by this change; lead decision)

- `npm run -s test:unused:ratchet` is RED at the snapshot: 1446 unused exports vs
  baseline 1416. At base it is 1448, so the change removes two and introduces none.
- Test-side duplication 701/26618 vs baseline 697/26369: identical at base; the
  change adds no clone. The lead's bar ("701/26618 or better") is met exactly.
- src+scripts duplication 46/47 and 1439/1462 prints a tighten hint; identical at
  base, so the slack pre-exists. CLAUDE.md says tighten when the checker prints the
  hint; that is a lander step, not a defect here.

## Identity

| Item | Value |
| --- | --- |
| Snapshot verified | `refs/wip/lab-c2-2` = `f34899bddf854346703ca6452d97badec74f9d47`, tree `d0e862046c4cd2c827766a3da0379ae136b1bce6` (immutable; the live worktree was not read) |
| Base | `bed8c6354737df06e8e57a0c5753d3b88f1e5e5f` |
| Diff | 38 files, +1700/−344; 19 src (1 new: `src/transport/transport-query-semantic-outcome.js`), 14 test (5 new), 5 shard JSON |
| Scratch worktrees | `<scratchpad>/c2-verify/wt` (f34899bdd) and `<scratchpad>/c2-verify/base` (bed8c6354), `node_modules` symlinked from the primary checkout, no `npm ci`; both removed at the end of this review |
| Approved witness | `test/transport/message-router-cdc-outcome-roundtrip.test.js` sha256 `2a044a90f11bd0992f6d8c393fe8b3dcb53b264c982610b6cb3651d339a9ddd9`, 277 lines: BYTE-EXACT match with the r2 approval; 105/105 green at the snapshot (full TAP archived, 105 verdict lines) |
| Node | v22.23.2 |
| Design read | `DOSSIER-mg-c2-transport-outcome-normalization-2026-10-24.md`, `REVIEW-mg-c2-transport-roundtrip-witness-r1-2026-10-24.md` (r1 + r2) in the lineage head worktree, read-only; `docs/steering/rules.md`; `test/guidelines/*.md`; `docs/development/verification-templates/transport-delivery.md` |

## Per-claim table

| # | Implementer claim | Verdict | Evidence (file:line at snapshot; my run) |
| --- | --- | --- | --- |
| 1 | Builder preserves supplied `deferRetry/noHandler/errorCode/retryAfterMs/reasonCode` raw | VERIFIED | `transport-semantic-outcome.js:220-225` (own-or-computed loop over `TRANSPORT_DELIVERY_OUTCOME_VALUE_FIELDS` `:41-44`); kill matrix: no rewrite over 31.1M inputs; byte-exact checks for `'x'`,`'X'`,`''`,`'router_connection_closed'`,`'Foo Bar'`; `retryAfterMs` 0/−5/'7'/NaN/Infinity/12.5 preserved raw; `reasonCode` `'ack_rejected'`,`'app'`,`''`,`null`,`5` preserved |
| 2 | `deliveryState` always computed | VERIFIED | `:188-202`, `:220`; matrix: every output state is one of the three named states |
| 3 | `CONTRADICTORY_DELIVERY_STATE`: `failed` claim, unnamed state, unsupported `delivered` → FAILED, beats deferral | VERIFIED (one edge noted) | `:50`, `:92-101`, `:125-128`, `:210-211`; matrix cases: failed+ack, failed+hint (deferRetry computed true, state FAILED), delivered+MESSAGE_TIMEOUT, delivered+NO_CONNECTION (deferred code, still FAILED), delivered+hint, delivered+noHandler, delivered unacked, `''`/`null`/`1`/`'DELIVERED'` claims → all FAILED/contradictory. Edge: an OWN `deliveryState: undefined` is treated as absent (`:191-196`), so `{acknowledged:true, deliveryState: undefined}` is DELIVERED; JSON transport drops such a key, local handlers can produce it; the unit matrix does not enumerate it (finding F3) |
| 4 | `deferred` claim still requests deferral | VERIFIED | `:119`; `{acknowledged:false, deliveryState:'deferred'}` → DEFERRED/`transport_deferred`; `terminal-failed-add-target-cleanup.test.js:122-130` vector keeps its state |
| 5 | Idempotence N(N(x)) = N(x) | VERIFIED | matrix: `build(build(x))` deep-equal over 31,104,000 inputs; roundtrip witness `C2 normalizeDeliveryOutcome is idempotent` over all 27 cases (branch 2 of `normalizeDeliveryOutcome`, the live second pass); forwarding-hop witness: 75 replies through two real routers, second-hop metadata unchanged and fixed point. Caveat RC1: `classify(build(x))` adds `error: null` |
| 6 | Uppercase normalization and `code`/`message` aliases removed | VERIFIED | no `toUpperCase`/`normalizeTransportErrorCode` in `src/transport`; builder reads only `options.errorCode` (`:183`) and `options.error` (`:187`); `{code: ROUTER_NO_CONNECTION}` → `errorCode: null`, FAILED/ack_rejected, `code` preserved; `{status:'completed', message:'boom'}` → DELIVERED. Mutations M2/M3/M4 each turn the unit test red |
| 7 | Unused `classifyTransportSemanticOutcome` / `isDeferredTransportSemanticOutcome` deleted | VERIFIED | grep over src/, test/, scripts/: no occurrence |
| 8 | Router-code re-exports removed from the owner | VERIFIED | base `:358-375` exported three codes; snapshot `:267-278` exports none; importers moved to `transport-error-codes.js` (`operation-workflow-owner-shared.js:38`, `managed-source-replication-start-delivery.js:1-4`, `message-router-connection-authority.js:36`, two tests) |
| 9 | Query semantic outcome split into `transport-query-semantic-outcome.js`; reason: `constants/transport.js` import made the restore closure reach `service-status.js` | VERIFIED by mutation | `src/constants/transport.js:9` imports `./index.js`, which re-exports `service-status.js` (`index.js:16`). `restart-from-durable-record.test.js` 4/4 green at the snapshot; adding `import {ROUTER_ERROR_MSG} from '../constants/transport.js'` to the builder module turns test #3 red ("the restore path cannot reach a cache, a service or a system table"); reverted. `test:cycles` 0/0 |
| 10 | `ROUTER_QUERY_TRANSPORT_NOT_READY_ERROR_CODE` moved to `transport-error-codes.js`, duplicate literal deleted | VERIFIED, with pre-existing debt | `transport-error-codes.js:10`; `MESSAGE_ROUTER_LITERAL.STRING_ROUTER_QUERY_TRANSPORT_NOT_READY` removed; `pressure-routing.js:102,:127` use the constant. Four OTHER owners of the literal remain and pre-exist at base (R06 debt, finding F6): `control-plane-readiness-service-shared.js:90`, `control-plane-system-table-gateway-constants.js:50`, `cdc-integration-service-shared-constants.js:86`, `bootstrap/shared/local-query-transport-readiness.js:8` |
| 11 | C3: forwarder imports `OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE`; stale literal deleted | VERIFIED | `message-group-forwarding-owner-constants.js` line `OUTBOUND_QUEUE_BACKPRESSURED: 'OUTBOUND_QUEUE_BACKPRESSURED'` deleted; `delivery-methods.js:355` compares the owner constant; the string `OUTBOUND_QUEUE_BACKPRESSURED'` occurs in src only as the owner value `'ROUTER_OUTBOUND_QUEUE_BACKPRESSURED'`; witness 5/5 (incl. negative: `ROUTER_MESSAGE_TIMEOUT` with identical text is not backpressure) |
| 12a | `raft-rs-peer-delivery.js:82-94`: ack + application error → DELIVERED; contradictory/failed/deferred → FAILED, rest of peer batch dropped; non-object → FAILED | VERIFIED | code as stated; witness 20/20 (ORDINARY, ACKNOWLEDGED delivered and batch continues `[1,2]`; 7 non-delivered shapes incl. router's own deferred failure → FAILED and `[1]` only); `classify(undefined/null/'ok'/true)` → FAILED. `peerDelivery` observations are read only by `raft-rs-status-observation.js:52` (status); the only control effect is the in-batch drop (`:127-136`) |
| 12b | MG forwarder `delivery-methods.js:627-640` / `:699`: leader `success`/`error` kept as the application answer | VERIFIED | `deliveryAcked = isDelivered(classify(deliveryResult))` `:628-629`; `deliverySucceeded = success !== false` `:630`; `deliveryErrorMessage` from `.error` `:631-635`; rejected branch → `resolveForwardFailureState(deliveryResult, {deferRetry: isDeferred(outcome)})` `:695-701` → RETRYABLE_DEFER (`forwarding-owner.js:200-214`) |
| 12c | `forwarding-owner.js:169` | VERIFIED | `isDeferred(classify(deliveryResult))` replaces `deliveryResult?.deferRetry === true` |
| 12d | topology `cdc-group-propagation-delivery-methods.js:744`: noHandler replies and application deferrals now failures retried by the wave owner | VERIFIED | witness 12/12: NO_HANDLER, APPLICATION_DEFERRAL, CONTRADICTORY_CLAIM, FAILED_CLAIM each stay in the failed set; `deliverToTargetsWithRetry` calls the failing target `MAX_ATTEMPTS` times and the delivered target once (no double delivery, R14 preserved); M5/M6 mutations turn this witness red |
| 12e | `membership-swim-prober.js:116`/`:141` | VERIFIED | same decision class as before (`null` on any non-delivered or non-boolean), now owner predicate |
| 12f | `partition-service-metadata-delivery-methods.js:546` | VERIFIED, behaviour tightened | previously only `acknowledged === false` failed; a no-handler/deferred/contradictory reply went on to `extractAckFromResponse` and awaited the tracker (timeout). Now it fails fast (`Delivery failed: <error>`), rejects the tracker `:555-561`, callers `flushRoleUpdate`/`flushLeaderNodeUpdate` own the retry |
| 12g | `write-metrics-base.js:478-492` log only | VERIFIED | adds `deliveryState`, keeps `acknowledged: result?.acknowledged === true` as a logged fact |
| 12h | `query-executor-partition-delivery.js:561` `reasonCode === NO_HANDLER` | VERIFIED with a design caveat (F4) | previously `response.noHandler` truthy. Under D1 `reasonCode` is a preservable value field, so a reply carrying its own `reasonCode` beside `noHandler:true` would not take the no-handler branch. The router's own no-handler reply (`inbound-dispatch.js:453-456`) carries no `reasonCode`, and no `src/` producer emits `noHandler: true` outside transport, so no valid producer changes behaviour today |
| 12i | `query-executor-partition-request-builders.js:140-141` | VERIFIED | `isDelivered(classify(response)) && response?.success` |
| 13 | Fixtures return the owner's `DELIVERED_TO_PEER` | VERIFIED for the five sites | `partition-node-cluster.js:45-46,:178,:522` + `conf-change-pending-deferral.test.js:88`, `evidence-o1-model.js:116`, `participation-gate.test.js:109`, `replace-real-group-harness.js:267`. Other doubles still answer non-outcomes (finding F5) |
| 14 | Impact contracts: witnesses registered; owner added to 9 pairs; audit PASS 71/44 | VERIFIED | diff adds `src/transport/transport-semantic-outcome.js` to 9 `contracts[].owners` and the matching 9 `coupledPairs[].endpoints[].owners`; 5 witnesses added to `cdc-source-native-delivery` tests + witnessTests; peer witness added to the raft-rs contract tests; my run: `impact-contracts: PASS (71 contracts, 44 coupled pairs, sha256:f138dec7ac32…)` |
| 15 | Unit matrix 107,520 inputs | INACCURATE (RC2) | the asserted product is 215,040; test green |
| 16 | 7 witness files, 331 assertions green at snapshot | VERIFIED | my run: 7/7 pass, 331 assertions (`verify-witnesses-snapshot.tap`) |
| 17 | New witnesses red on old code | SEE ADDENDUM | my own base-tree run was queued behind the thermal gate at report time; implementer TAPs `peer-on-old-consumer.tap`, `hop-on-base.tap`, `c3-on-stale-literal.tap`, `impl-before-revised-witness.tap` exist under `scratchpad/c2/` |
| 18 | Lab carinas-windows 1803 files 1636/167 vs baseline 1627/176, 166 shared reds | VERIFIED from the logs | `lab-cone-run2.log:49695` `total=1803 pass=1636 fail=167`; `lab-baseline-run2.log:57389` `total=1803 pass=1627 fail=176`; `comm` of the two red lists: 166 shared, 1 change-only, 4 baseline-only + the 6 new test files absent at base |
| 19 | One change-only red `partition-runtime-reconstruction-leadership.test.js` #5 "timing" | NOT REPRODUCED; cause UNKNOWN | lab leaf: `not ok 5 - W-B6-3: a leader's persistence failure reconstructs only the leader's group; after the heal exactly one replica leads…` `expected: true actual: false`. Locally with `LAGRANGE_PLACEMENT=local`: 5/5 green at the snapshot (27–33 s each) and 5/5 green at base (27–37 s each). "timing" is the implementer's inference; one lab-host red of a 30 s, 20-assertion leadership test is consistent with host variance but is not proven. The test has no transport-outcome touchpoint except a `network.deliver` override in a later subtest (`:1128-1143`) |
| 20 | 4 reds only on baseline | VERIFIED set; explanation SPLIT | all four green at the snapshot locally. At base locally: `owner-interaction-model.test.js` and `formation-release-handoff-interaction-registry.test.js` are RED ("coupled pair … witness is not primary-classified", "impact-contracts-audit-passes"): stale base shard metadata, repaired by the change's `test:metadata:refresh` (the review's F-OUT-3). `CL-040.repro.test.js` and `replace-replica-workflow.test.js` are GREEN at base locally, so their lab reds are base-tree lab variance, not something this change fixed (UNKNOWN cause) |
| 21 | 166 shared reds share their first leaf | VERIFIED (spot and full) | 157/166 identical first failing leaf; 8 differ only in property seeds / run ids / temp paths (same failure class); 1 (`seed-infrastructure-phase.test.js`) differs because the base run could not load the test's new import (`ERR_MODULE_NOT_FOUND transport-query-semantic-outcome.js`) while the change shows the pre-existing `d.assertOriginalSeedAttempt is not a function`. Eight explicit spot checks listed in `verify-shared-red-first-leaf.txt` |

## Findings

F1 (RC1). `classifyTransportDeliveryOutcome` injects `error: null` (`transport-semantic-outcome.js:245`); classify∘build is not a fixed point; comment `:229-232` overstates. Owner: transport. Exact edit above.

F2 (RC2). Matrix-size claim 107,520 vs asserted 215,040.

F3 (minor, owner transport + unit test). An own `deliveryState: undefined` is read as "no claim" (`:191-196`), so it is the one own value outside the named set that does not fail. Over JSON it cannot occur; a local handler can produce it. Decide and enumerate it in `METADATA_FIELD_VALUES.deliveryState` (`transport-semantic-outcome.test.js:177-178`) either as absent-equivalent or as a contradiction; today the matrix is silent on it.

F4 (design limit of D1, record for the namespace-split follow-up). Three consumers key a decision or a diagnostic on `reasonCode === NO_HANDLER` (`query-executor-partition-delivery.js:561` decision; `raft-rs-peer-delivery.js:86` phase name; `message-group-forwarding-owner-delivery-methods.js:678` log). Under D1 `reasonCode` is preserved raw when supplied, so it is a value field, not an owner decision; only `acknowledged` and `deliveryState` are owner-computed. No valid producer bypasses it today (router no-handler reply carries no `reasonCode`; no `src/` producer of `noHandler: true` outside transport). Not blocking.

F5 (test doubles, R17). Besides the five migrated sites, these `sendToPeer`/`sendFor` doubles still answer non-outcomes, which the boundary now records FAILED: `native-election-schedules.js:55` (`null` on a cut link, intentionally a drop; its two importers were green on the lab run), `partition-construction-seam.test.js:60` (`Promise.resolve()`), `opening-history-native-fixture.js:14`, `raft-rs-original-opening*.test.js:59,64`, `original-handoff-lifecycle-claim.test.js:22` (`() => {}`), and the `sendFor` doubles returning `undefined` (fall-through to the cluster's queue + `DELIVERED_TO_PEER`, so correct). All green on the lab run; the lead's "test doubles consume the owner's builder" is met where the double claims a delivery; a double that means "dropped" answering `null` is honest FAILED. Optional: have them answer `buildTransportDeliveryOutcome({acknowledged:false})` for clarity.

F6 (R06 pre-existing, R17). Four local copies of the literal `'ROUTER_QUERY_TRANSPORT_NOT_READY'` remain in `src/` (listed in claim 10) and also exist at base; the change deleted only the router-vocabulary copy. Route to the owner of each.

F7 (R17, unmigrated `acknowledged`/flag readers of delivery outcomes, census of `src/` outside transport; none in the dossier's agreed section 3.1 C list):
- `message-group/message-retry-handler.js:284` `result.acknowledged || result.success` (production: `commandRetryHandler`, `message-group-service-state.js:262`).
- `query/sql-query-engine-participant-wire.js:144-145` `answer.acknowledged !== true || answer.noHandler === true` (reads a delivered partition answer; `sql-query-engine.js:456`); would accept a contradictory FAILED outcome as the participant's own answer if the body otherwise binds.
- `partition/partition-service-learner-promotion-proof-methods.js:310` `response?.acknowledged === true && …proof` on `transport.deliver` (`:207`); low risk, the body binding filters.
- `message-group/message-group-service-runtime-support.js:196-204` `shouldDeferImmediateDeliveryRetry`: `deferRetry === true && retryAfterMs > 0` raw (same MG outbound-dispatch area as the ruled `:234`).
Owner-computed-authority readers (acceptable): `cdc/cdc-delivery-outcome.js:343` (reads `classify()` output plus CDC's own typed checks); `partition-service-write-metrics-base.js:488` (log). Application-field `acknowledged` on LOCAL results, not delivery outcomes: `source-replication-start-methods.js:262,267,357,362`, `merge-replication-resumption-methods.js:105`, `split-mirror-queue-methods.js:191`, `distributed-transaction-release-settlement.js:100` (`handleApplicationMessage`), `latency-measurement-service.js:221` (`pingNode` boolean), `invariant-engine.js:437` (phase entries). Transport-internal protocol steps (owner's own ACK custody, not consumer decisions): `pending-response-ledger.js:489,:537`, `delivery-behaviors.js:101 (metric),:398,:432`, `websocket-transport.js:454`, `websocket-transport-provider.js:381`, `router-message-handler.js:347`; `pressure-routing.js:199` is lead-ruled.

F8 (no-legacy census, section E). Outcome-shape aliases remaining in `src/transport|query|message-group|raft|topology`: `message-router-delivery-pressure-routing.js:141-151` (`error || message`, `errorCode || code`) and `:165-181` (same, building an Error) — known and ruled; `query/query-executor-partition-failure.js:31-42` (`error`/`message`, `errorCode`/`code` on a `failure` that may be an Error or an outcome). Error-convention reads (accepted direction, Error → text/code): `message-router-delivery-behaviors.js:530`, `message-router-ack-delivery.js:29`, `message-group-forwarding-owner.js:222-224`, `delivery-methods.js:712,:755`, `outbound-dispatch-runtime-methods.js:34-35`, `raft-rs-durable-store.js:173`, query-engine `error.code` reads. Outside the five directories: `rebalancer/operation-workflow-owner-shared.js:493` `errorLike.errorCode ?? errorLike.reasonCode ?? errorLike.code ?? null` (diagnostics only; mixes vocabularies). `thrownErrorOutcome` (`:233-239`) is the one accepted conversion; note its output keeps `code` beside `errorCode` because `...error` re-spreads it; CDC's `outcomeFieldsMatch` rejects a `code` key anyway.

F9 (`WebSocketTransport` references, report only). src: `constants/transport.js:337,363` (log strings), `transport/index.js:24,29`, `transport-provider.js:33` (doc), `websocket-transport-provider.js:2,37,40,42,785`, `websocket-transport-messages.js:2`, `websocket-transport-connection-records.js:2`, `websocket-transport.js:47,721`. test: `exact-handler-identity-api.test.js` (5), `message-router-cdc-outcome-roundtrip.test.js` (3, the inline-ACK peer), `websocket-provider-interface-compliance.property.test.js` (25), `websocket-transport.test.js` (22), `websocket-transport-provider.test.js` (21), `websocket-provider-backward-compatibility.property.test.js` (25).

F10 (R16 scope note). The shard JSON diff (+464 lines in `subsystem-classes.json`) carries census entries for ~25 pre-existing test files that were absent from the base shards (e.g. `cdc-delivery-complete-vector.test.js`, `message-router-cdc-custody.test.js`), i.e. the base metadata was stale; the refresh at the snapshot has zero drift, and this is what turns two baseline-only reds green (claim 20). Acceptable, but name it in the commit.

F11 (inherited gate reds, section G). `test:unused:ratchet` 1446 > 1416 (base 1448); test duplication 701/26618 > 697/26369 (= base); src+scripts tighten hint 47→46, 1462→1439 (= base). Landing needs a lead decision or a separate repair; this change neither caused nor worsened any of them.

## Statics at the snapshot (section G)

| Check | Result | Base comparison |
| --- | --- | --- |
| `node --check` on the 33 changed .js files | all OK | — |
| `eslint` on the changed files | 0 errors (1 warning: `cdc-non-leader-propagation-tail-more-test-cases.js` is eslint-ignored by pattern) | — |
| `audit:impact-contracts` | PASS 71 contracts / 44 coupled pairs | — |
| `test:cycles` | OK 0/0 | — |
| `test:unused:ratchet` | RED 1446 > 1416 | base 1448 (change −2) |
| `test:metrics:scoped` on the 18 pre-existing changed src files | 27 cyclomatic violations, 3 cognitive | base 28 / 3; no new violation; `forwardCDCPayloadToLeader` 60→55, `isRetryableForwardDeliveryFailure` leaves the list, `directProbe` 14→13, `proposeWrite` 21→20, `deliverToTargets` 16→15, `resolveQueryTransportSelection` 16→15 |
| `test:complexity:scoped:strict` + cognitive strict on the new `transport-query-semantic-outcome.js` | clean | — |
| `test:duplication` | test 701/26618 RED vs 697/26369; src+scripts OK 46/47, 1439/1462 with tighten hint | identical at base |
| `audit:file-size` | exit 0; no changed file newly oversize (owner 278 lines, new module 118, new tests ≤277) | — |
| `test:metadata:refresh` then `git status`/`git diff --stat` | zero drift | — |

## What I ran (log paths under `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/c74561e1-2969-4696-bd5a-1d3a410f38a7/scratchpad/c2/`)

| Step | Command (in my scratch worktrees) | Artifact |
| --- | --- | --- |
| Identity | `git rev-parse refs/wip/lab-c2-2`, `^{tree}`, `git diff --stat/--name-status bed8c6354 f34899bdd`, `sha256sum` of the witness | in this report |
| Thermal gate | `node scripts/checks/wait-for-thermal-headroom.js` before every heavy stage (held 1–11 polls at times; the machine is shared) | logs show `thermal: ok/hold` lines |
| Witness set at snapshot | `npm run -s test:file -- <7 files>` | `verify-witnesses-snapshot.tap` (7/7, 331); `verify-roundtrip-snapshot-full.tap` (105 verdicts, 0 not-ok, sha256 `b53ffd4c…`) |
| Kill matrix | `node c2-verify/tools/kill-matrix.mjs <wt>` | `verify-kill-matrix-snapshot.txt`: 49 PASS; 2 FAIL lines = F1 (`classify∘build` adds `error:null`) and F3 (own `undefined` claim) only; 31,104,000-input matrix otherwise clean (idempotent, no rewrite, named state, FAILED dominance, no DELIVERED without ack / with conflict / with deferral evidence) |
| Mutations | `c2-verify/tools/mutate.sh` (7 builder mutations + D import mutation, each reverted; final `git status` clean) | `verify-mutations.txt`: M1 reds unit+roundtrip; M2/M3/M4/M7 red unit; M5 red unit+roundtrip+peer+topology; M6 red unit+roundtrip+peer+topology+hop; D: unmodified 4/4 green, with the import #3 red |
| Statics | chain of the G checks | `verify-statics-snapshot.txt` |
| F runs + base statics | `c2-verify/tools/f-and-base.sh` | `verify-f-runs-and-base-statics.txt`; `verify-lead-snap-{1..5}.tap`, `verify-lead-base-{1..5}.tap` (each plan 1..1, ok 1, 27–37 s) |
| Shared-red first leaf | `node c2-verify/tools/first-leaf.mjs lab-cone-run2.log lab-baseline-run2.log lab-run2-reds.txt lab-baseline2-reds.txt` | `verify-shared-red-first-leaf.txt` |
| Witnesses on the base tree | six files copied onto `c2-verify/base`, `npm run -s test:file`, removed with `git clean -f -- <paths>` | `verify-witnesses-on-base.txt` (see addendum) |
| Reads | builder (full, base and snapshot), new query module, unit test, four new witnesses, all 12 consumer sites with context, three production `sendToPeer` providers, `cdc-delivery-outcome.js:328-350`, `message-group-service-runtime-support.js:196-204,348-353`, `partition-node-cluster.js:160-182`, `restart-from-durable-record.test.js:225-300`, `impact-contracts.json` diff, shard diffs, lab logs and red lists | — |

## Limits (nothing not listed above is approved by implication)

- L1. Local runs only; the lab host was not used. The lab numbers are read from the implementer's logs, not re-measured.
- L2. The inline-ACK path is exercised only through the approved witness's legacy `WebSocketTransport` peer; production pairing of a router with such a peer is unknown (as the review already recorded).
- L3. The change-only lab red (claim 19) is not reproduced in 10 local runs; its cause is unknown. A single-file lab re-run on both trees would settle whether it is host variance.
- L4. Claims 20's two unexplained baseline-only reds (`CL-040.repro`, `replace-replica-workflow`) are green locally on both trees; their lab reds at base are unexplained.
- L5. The 31.1M-input matrix printed at most the first five violations per category; the two categories seen are F1 and F3. No other category appeared in the printed sample, but the sample is capped (the per-check assertions, uncapped, all passed).
- L6. RC1's "no consumer distinguishes `error: null` from absent" is from a grep of `.error` comparisons, not a per-reader trace.
- L7. The lead's three pending rulings were only confirmed still open at the snapshot; not verified as changes.
- L8. F7's production reachability of a contradictory outcome into `participantAnswerSnapshotOf` and `MessageRetryHandler` was not traced; they are recorded as readers, not as demonstrated defects.
- L9. I did not run the full corpus or `npm test`; the gate reds in F11 come from the individual ratchet commands.

## Addendum A1 (same review, appended after the base-tree run completed)

Claim 17 ("new witnesses red on old code") is VERIFIED by my own run. The six
new/changed witness files from the snapshot were copied onto the base scratch
worktree (production unchanged at `bed8c6354`), run with
`npm run -s test:file`, and removed again (`git clean -f`, and the tracked unit
test restored with `git checkout`). Result: 0/6 pass, 199 assertions
(`verify-witnesses-on-base.txt`). First reds, each on the mechanism the witness
exists for, not on setup:

| File | First red leaves on base |
| --- | --- |
| `transport-semantic-outcome.test.js` | `every matrix input normalizes once and keeps its values`; `failed claim with a retry hint: the contradiction fails with its named reason` |
| `message-router-cdc-outcome-roundtrip.test.js` | `COMMITTED_REASON_CODE_ACK_REJECTED`, `COMMITTED_ERROR_CODE_LOWER_CASE`, `COMMITTED_NO_HANDLER_WRONG_TYPE` (the C2 launders) |
| `raft-rs-peer-delivery-transport-outcome.test.js` | `FAILED_CLAIM: never recorded delivered; the peer's later batch messages are dropped`; `UNNAMED_CLAIM: …` (semantic 3 on old code) |
| `transport-outcome-forwarding-hop.test.js` | `every forwarded outcome is stable across the hop` |
| `cdc-group-propagation-transport-outcome-failed-set.test.js` | `NO_HANDLER: only the target the owner did not classify delivered failed`; `…retries only the failed target, once per attempt` (semantic 4 on old code) |
| `message-group-forward-backpressure-code.test.js` | `the forwarder decides backpressure from the owner code`; `a backpressured forward target is suppressed` (C3 stale literal) |

Scratch worktrees `c2-verify/wt` and `c2-verify/base` were removed after this
addendum; the tool scripts and all logs remain under the scratchpad paths named
above.

---

## Re-verification r2 (2026-10-24, same independent verifier, appended)

Scope: exactly `git diff f34899bdd f291aad32` (24 files, +521/−298; 15 src, 2 new
tests, 2 modified tests, 5 shard/baseline/inventory JSON). Subject: commit
`f291aad32865002cfb1245d21cba484f1fccaa90` = `refs/wip/lab-c2-4`, parent `bed8c6354`,
51 files +2174/−595 against base (confirmed). Verified in two new detached scratch
worktrees (`c2-verify/wt2` at f291aad32, `c2-verify/wt1` at f34899bdd for the
before/after runs), both removed afterwards. No repository edits.

### Verdict: APPROVE WITH REQUIRED CHANGES (exact) for keeping f291aad32 — one small test addition; landing still blocked by inherited gate reds this change did not cause

All ten items hold on the commit by my own runs and reads. The r1 required changes
RC1/RC2 and findings F3/F7/F8 are closed by the delta. The one required change is a
missing pin (R19) for a migrated safety-relevant decision the coordinator asked me to
name or flag:

**RC-r2-1 (required, exact).** `partition-service-learner-promotion-proof-methods.js:311-318`
now authorizes promotion only on `isDelivered(classify(response))`, but no test pins
that a FAILED or contradictory *delivered* outcome carrying a valid binding and proof
is refused. `test/raft/learner-promotion-progress-proof-contract.test.js:36-43,118-138`
covers only the refusal reason/cause vocabulary, `test/convergence/dt6-learner-promotion-proof-channel-wake.test.js:699-703`
a binding mismatch, `test/partition/partition-service-learner-promotion-wake.test.js`
the wake/timeout seams. Add (new file `test/partition/learner-promotion-proof-delivery-decision.test.js`,
or a case in `partition-service-learner-promotion-wake.test.js`): take
`createPartitionServiceLearnerPromotionProofMethods().learnerPromotionProofResponseBindsThisLearner`
called with `this = {partitionId: 'p1', replicaId: 'r1'}`, binding
`{partitionId: 'p1', learnerReplicaId: 'r1', proof: {}}`, and assert `false` for
`buildTransportDeliveryOutcome({acknowledged: true, deliveryState: 'failed', ...binding})`,
`({acknowledged: true, deliveryState: 'delivered', retryAfterMs: 5, ...binding})`
(contradiction), `({acknowledged: true, noHandler: true, ...binding})`,
`({acknowledged: false, deferRetry: true, ...binding})`, and `true` for
`buildTransportDeliveryOutcome({acknowledged: true, ...binding})`; then
`test:metadata:refresh` (zero drift expected) and, if a contract names
`partition-service-learner-promotion-proof-methods.js` as an owner, add the file to
its `tests`/`witnessTests` (see the registration note in the handback).

### Per-item table

| # | Claim | Verdict | Evidence (file:line at f291aad32; my runs) |
| --- | --- | --- | --- |
| 1 | RC1: `classify` passes a non-Error as supplied; unit matrix 483,840 with `error: [ABSENT,'boom']`, asserts `classify(build(x)) ≡ build(x)` | VERIFIED | `transport-semantic-outcome.js:239-242` (`input = Error ? thrownErrorOutcome(…) : resolvedValue`); unit `:177-191` dims, size `9·5·8·4·3·7·2·2·2·2 = 483,840` asserted `:296`, `fixedPointViolations` `:222-229`. My kill matrix on the committed owner (`verify-r2-kill-matrix-f291aad32.txt`): 31,104,000 inputs, zero `classify(build(x))` violations, zero rewrites, named states, FAILED dominance; the only remaining violation class is my own stale expectation for an own `deliveryState: undefined` (1,918,080 entries, all that key), now ruled F3. 69 checks, 9 flips, each the ruled behaviour: F3 (own undefined = absent), RC1 (`classify({})` no longer adds `error: null`; `classify` of a message-only answer leaves `error` absent), F8 (no `code` key; an Error's own `errorCode` ignored), R4 (delivered + default stays DELIVERED; `{acknowledged:false, retryAfterMs:0}` is FAILED and keeps 0) |
| 2 | R4: default hint after classification, only to DEFERRED without a positive hint; four cases + fixed point; old pin gone; direct-wakeup witness | VERIFIED, one observation | `:243-263`; unit `:376-394` (4 cases, each re-classified with the advice as a fixed point; the r1 pin `:353-357` is gone); witness `replica-dispatch-direct-wakeup-delivery-decision.test.js` 3/3 against the real consumer `replica-dispatch-direct-wakeup.js:122-139,144-159`. O1: a DEFERRED outcome's OWN non-positive hint is replaced by the default — probe: `{deferRetry:true, retryAfterMs: 0 / -5 / '7'}` with `defaultRetryAfterMs:100` → `retryAfterMs: 100`; a positive own hint (40) is kept; DELIVERED/FAILED untouched; fixed point under the advice holds. Within the ruling's wording ("without a positive hint") but it is the one place a supplied value is rewritten, and the dossier (§5.1) said "only when `retryAfterMs` is not own". Record; not blocking |
| 3 | F3: own `deliveryState: undefined` enumerated, equal to absent | VERIFIED | `:190-192`; unit `:177-178` (`undefined` value), `undefinedClaimViolations` `:232-239`; probe `B({acknowledged:true, deliveryState: undefined})` → DELIVERED, own key overwritten with the computed state |
| 4 | F8: `thrownErrorOutcome` from known fields, no `code` key; Error's own `errorCode` ignored; no producer sets only `errorCode` on a thrown Error | VERIFIED with a bounded census | `:230-238`; probe `Error{code, errorCode:'IGNORED', deferRetry, retryAfterMs:5, noHandler:false, reasonCode:'r', acknowledged:true, extra:1}` → `{errorCode: code, error, deferRetry, noHandler, reasonCode, retryAfterMs, acknowledged:false, deliveryState:'deferred'}`: no `code`, no `extra`, own `errorCode` ignored, and an Error's own `acknowledged` is NOT carried (an Error never classifies DELIVERED — correct). Unit `:375-376` pins no `code` key. Census: the only producer giving an Error a transport `errorCode` is `operation-workflow-dispatch-response-reconcile.js:272-279`, which also sets `code`; `query-executor-sql-command-rendering.js:353-354` and `replica-handler-create-methods.js:504,547-554` keep both equal. Eight files set an application `errorCode` on an Error without `code` (`control-plane-mutation-readiness.js`, `sql-query-engine-participant-wire.js:205`, `distributed-transaction-protocol.js:120`, `-participant-set.js:15`, `-recovery-validation.js:99`, `-decision-protocol.js:70`, `bootstrap-api-registration-methods.js:293`, `bootstrap-join-admission-owner.js:175`) — none a transport code, and the consumers of `classify(error).errorCode` compare transport codes only (`isLeaderUnavailable` `query-executor-write-retry-routing.js:387-389`, `managed-source-replication-start-delivery.js:22-24`). Residual (limit L-r2-1): `query-executor-partition-failure.js:78` surfaces `classify(failure).errorCode` into the SQL failure result; an application-`errorCode`-only Error reaching the executor's catch (`:669`, try from `:366`) would now surface `errorCode: null` there while its `failureCode` channel (`partition-write-kernel.js:161-187`) is unaffected. I found no such producer inside that try block but did not prove its absence |
| 5 | R3: pressure-routing builders read only the classified outcome; witness 14 | VERIFIED | `message-router-delivery-pressure-routing.js:135-182`; witness `message-router-query-transport-failure-shape.test.js` 14/14 (thrown Error and answer with the same facts → same deferred outcome and same failure error; `message`/`code` on a non-Error not read). O2: `outcome.error ?? FALLBACK` (`:150,:159`) — an answer with own `error: ''` now yields an empty message where the old `length > 0` check fell back to the fallback text; negligible |
| 6 | `resolveQueryTransportDeliveryState`: acknowledged → SUCCESS else one table; behaviour change contract-consistent | VERIFIED; attack found no new R14 class | `:185-189`; `QUERY_TRANSPORT_DELIVERY_STATE_BY_OUTCOME_STATE` `message-router-shared-vocabulary.js:236-240` (3 entries, imported via `message-router-connection-authority.js:37,592`); consumer `normalizeQueryTransportFailure` `:193-230`. Class changes vs before (SUCCESS iff ack; DEFER iff `deferRetry===true`; else HARD): (a) deferred transport code / positive hint / `deferred` claim without `deferRetry:true` → DEFER_RETRY (was HARD); (b) `deferRetry:true` with a contradicted claim → HARD (was DEFER). The ambiguous-delivery class (sent, unacked) is unchanged: the router's own timeout error carries `deferRetry:true` (`message-router-delivery-lifetime.js:10-15`) → DEFER_RETRY before and after; a bare `ROUTER_MESSAGE_TIMEOUT` answer is FAILED → HARD before and after. The newly deferred shapes are pre-send failures (no connection, transport not ready; backpressure `message-router-outbound-delivery-registry.js:116-125` already carries `deferRetry:true`; router CONNECTION_CLOSED failures already carry it) → a re-delivery is a first delivery. The executor's unknown-outcome/entryId re-delivery owner (`query-executor-partition-delivery.js:544-559`) is untouched. For (b) the router returns the raw answer (`:229`, not an Error) and the executor still reads its raw `deferRetry/retryAfterMs` (`:593-596`) for its own control-plane retry decision — unchanged executor semantics, no laundering by the router. Pinned assertion (witness `:94-97`) holds: `classify(plain Error)` → FAILED, computed `deferRetry` false, not set. Edge: a FAILED-by-contradiction Error that carried a retry request would get `deferRetry: true` set (it carried the request); not a production shape |
| 7 | Query dual reads migrated; out-of-scope producers are not delivery outcomes; `code` no longer becomes `errorCode` in failure details | VERIFIED | `query-executor-partition-failure.js:32-42,:78`, `query-execution-budget.js:114`, `query-executor-partition-delivery.js:717` (diff). Out of scope confirmed: `parallel-query-partition-outcomes.js:52` (`failure` = the executor's failure result or a thrown Error, one level above delivery; R17 dual read), `distributed-transaction-protocol.js:138,142,205` (participant protocol Errors from `participantFailureOf`), `distributed-transaction-identity.js:100` (persistence callback Error), `distributed-write-coordinator.js:408-410` (participant Error), `schema-provisioning-job-owner.js:117,487` (provisioning Errors; `error.code` set at `:53,:374`). Behaviour note judged accurate: no production answer object carries `code` (grep of `src/partition` and `src/query` answer builders); the only `code`-typed refusal is the proposal-queue Error (`proposal-queue.js:111-114`), converted by `partition-write-kernel.js:478-482` into a `failureCode` answer |
| 8 | F7 consumers | VERIFIED; one pin absent (RC-r2-1); one judgment | `shouldDeferImmediateDeliveryRetry` deleted (`runtime-support.js`, `message-group-service.js` wiring); MG outbound `:243` and `:364-367` use `isDeferred(classify(…))`. Judgment on the hint-0 deferral: CORRECT — the owner says DEFERRED and the `> 0` requirement was a local re-derivation (R03); named behaviour change: on `deliverDirectOnlyMessage` (maxAttempts 1, `:349-368`) a `{deferRetry:true, retryAfterMs:0}` router answer was a plain hard error and is now `buildDeferredDeliveryError` (`runtime-support.js:196-214`: deferRetry, retryAfterMs 0) → on the query path DEFER_RETRY with the router's reconnect-interval fallback; on `attemptDirectDelivery` with retries, a hint-0 deferral exits the loop at the first deferral instead of immediate in-loop retries. Producers of hint-0 deferrals: `buildDeferredDeliveryFailure` with `reconnectIntervalMs <= 0`, the retirement exit (`delivery-behaviors.js:192-201`), and `attemptDirectDelivery:274-287` itself on exhaustion. `message-retry-handler.js:284` → `result.success`: claim CONFIRMED — the only production `executeWithRetry` caller returns `{success: true, answer}` (`message-group-proposal-routing.js:217-223`); the property test's doubles moved to `{success:true}`; no `acknowledged`-only double remains in the three retry tests. `sql-query-engine-participant-wire.js:144-148`: owner-computed `acknowledged` kept (Q6) and `classify(answer).reasonCode === NO_HANDLER` (F4 caveat applies). `partition-service-learner-promotion-proof-methods.js:311-318`: migrated; PIN ABSENT → RC-r2-1 |
| 9 | Baseline re-key: same function, same kind, count unchanged, nothing else touched | VERIFIED | diff is exactly two lines: `filePath` `src/transport/transport-semantic-outcome.js`→`src/transport/transport-query-semantic-outcome.js`, `line` 82→35; `column: 3`, `functionName: resolveTransportSemanticReasonCode`, `kind: raw_null_empty_state_outcome` unchanged; 806 `filePath` entries before and after. Repo-wide audit: at f34899bdd 30 violations in 17 files incl. the then-unmatched `transport-query-semantic-outcome.js: 1` (the hook refusal), "Matched 750"; at f291aad32 29 violations in 16 files, "Matched 751", the set is exactly the previous minus the transport entry, and all 16 files are OUTSIDE the C2 diff (inherited repo-wide red at both trees; the pre-commit runs this audit staged-only) |
| 10 | Runs and statics | VERIFIED (counts noted) | 10 witness files 10/10: 801 assertions = 356 over the nine fixed-count files + 445 for `retry-exponential-backoff.property` (claimed 360 — count discrepancy only). Query 38 at f34899bdd vs f291aad32: 32/6 both, identical verdict sets, 1380 assertions both; first leaves identical for 5 of 6 reds, the 6th (`write-path-internal-pacing.test.js` #2) differs only in the embedded refusal text, which 2+2 re-runs show is run-to-run variance on both trees. F7 12: 8/4 both, identical sets and first leaves (the property file's count 424→445 is its own randomness). All 10 reds are in the lab baseline red list (pre-existing). Statics at f291aad32: `node --check` 17 files OK; eslint 0; `audit:impact-contracts` PASS 71/44 (sha `1ab1017b…`); `test:cycles` 0/0; scoped cyclomatic on the 13 delta src files 17→15 (`resolveRetryableLeaderFailureRetryAfterMs` 22→16, `buildCanonicalDeferredQueryTransportOutcome` and `buildQueryTransportFailureError` leave the list, `executeOnPartition` 134→131, `executeWithRetry` 23→22), cognitive 2→2; `test:metadata:refresh` zero drift; `test:unused:ratchet` 1446 > 1416 (unchanged, inherited); duplication unchanged (46/47; 701/26618) |

### Ruling: direct-wakeup witness and contract registration

Not required in this unit; recorded as R17. No replica-dispatch contract exists and
`replica-dispatch-direct-wakeup.js` is an owner in none; the consumer already called
`classify` with the default hint at base, so the missing contract is pre-existing debt,
not something this change introduced. The witness is census-classified (primary,
resource and subsystem shards, zero drift) and runs in its lane; the impact audit
passes. Creating a new contract is an owner-boundary registration beyond C2/C3 (R16).
Recommend a `replica-dispatch-direct-wakeup ↔ transport-semantic-outcome` coupled pair
when the consumer-pairs / namespace-split follow-up opens.

### Inherited landing blockers (unchanged from r1, re-measured at f291aad32)

`test:unused:ratchet` 1446 > 1416; test duplication 701/26618 > 697/26369 (src+scripts
tighten hint 47→46, 1462→1439 pre-exists); repo-wide `audit:guideline:decision-boundaries`
29 violations in 16 files outside the diff (red at f34899bdd and f291aad32 alike).

### What I ran (r2)

| Step | Artifact (under `…/scratchpad/c2/`) |
| --- | --- |
| 10 witness files at f291aad32 | `verify-r2-witnesses-f291aad32.tap` |
| Before/after 38 query + 12 F7 files, leaf diff, statics, kill matrix (`c2-verify/tools/r2-chain.sh`) | `verify-r2-chain.txt`, `verify-r2-query-{wt1,wt2}.{tap,files}`, `verify-r2-f7-{wt1,wt2}.{tap,files}`, `verify-r2-kill-matrix-f291aad32.txt` |
| Pacing test 2x per tree | `verify-r2-pacing-{wt1,wt2}-{1,2}.tap` |
| Decision-boundaries audit per tree | `verify-r2-decision-boundaries-{wt1,wt2}.txt` |
| Probes (default-hint overwrite, thrown-Error conversion, undefined claim, message-only) | inline `node --input-type=module -e` in the session; results quoted in items 2–4 |

### Limits (r2)

- L-r2-1. Item 4's residual (an application-`errorCode`-only Error reaching the executor catch) is reasoned from a grep census, not a per-throw trace of the 300-line try block.
- L-r2-2. The hint-0 deferral judgment (item 8) is by reading; no test exercises `deliverDirectOnlyMessage` with a `{deferRetry:true, retryAfterMs:0}` answer on either tree.
- L-r2-3. Local runs only; the lab was not re-run for r2.
- L-r2-4. The "before" tree for the before/after runs is f34899bdd (my r1 snapshot), not the implementer's intermediate r3 state.

---

## Re-verification r3 (2026-10-24, same independent verifier, appended)

Scope: exactly `git diff f291aad32 1a29cfc9c` (my shortstat: 12 files, +100/−82; 4 src,
1 new test, 2 modified tests, 4 shard JSON, inventory). Chain confirmed:
`bed8c6354 → f291aad32 → cba438358 → 1a29cfc9c`; `refs/wip/lab-c2-6` =
`1a29cfc9c45fbbb814e6aa8af69a6926002b49b6`. Verified in detached scratch worktrees
(`wt3` at 1a29cfc9c, `wt2` at f291aad32, `base2` at bed8c6354), all removed afterwards.
No repository edits. C2 witness sha at 1a29cfc9c unchanged:
`2a044a90f11bd0992f6d8c393fe8b3dcb53b264c982610b6cb3651d339a9ddd9`.

### Verdict: APPROVE for keeping 1a29cfc9c (no required changes); landing still blocked by the inherited gate reds recorded in r1/r2

| # | Claim | Verdict | Evidence (file:line at 1a29cfc9c; my runs) |
| --- | --- | --- | --- |
| 1 | RC-r2-1 pin `test/partition/learner-promotion-proof-delivery-outcome.test.js` (6 assertions; 3 red on the base consumer) | VERIFIED | 6/6 green at 1a29cfc9c (`verify-r3-witnesses-1a29cfc9c.tap`). With `bed8c6354:src/partition/partition-service-learner-promotion-proof-methods.js` swapped in (then reverted, 0 changes left): exactly `not ok 1 - a failed claim`, `not ok 2 - a contradictory delivered claim with a retry hint`, `not ok 3 - a missing handler`; `ok 4 - a deferral`, `ok 5 - an ordinary delivered proof` (`verify-r3-pin-on-base-consumer.tap`). The test calls the real method with `this = {partitionId, replicaId}` and router-built outcomes (`:13-28`) |
| 2 | RC-r2-2 as deletion: `classifyTransportDeliveryOutcome(value = null)` takes no options, never attaches a hint; dispatch owner calls it bare and defers through its own fallback; `buildQueryTransportSemanticOutcome` option deleted as dead; `defaultRetryAfterMs` grep | VERIFIED | `transport-semantic-outcome.js:241-246` = `build(Error ? thrownErrorOutcome(value) : value)`. `replica-dispatch-direct-wakeup.js:119-132` bare call; the production defer path `replica-dispatch-retry-scheduling.js:183-188` uses `resolveOperationDispatchRetryAfterMs` (`:166-172`: positive hint floored, else `this.operationDispatchRetryAfterMs`) — the same function the witness samples, so the fallback is on the real path. Dead-pattern confirmed by reading `pressure-routing.js:97-115` (f291aad32) vs `:97-112` (1a29cfc9c): the caller already passed `retryAfterMs = selection.retryAfterMs > 0 ? floor : this.reconnectIntervalMs`, positive whenever the default would have been, and both `null` when `reconnectIntervalMs ≤ 0`, so the default could never change the result; `query-transport-selection.js:7,13,14,17,24,30` always call with one argument; no other caller. `grep defaultRetryAfterMs src/` → only `lifecycle-controller.js:92,457` (`_defaultRetryAfterMs`, unrelated) |
| 3 | Unit test 62 assertions; option cases removed; kept with fixed point: deferral without hint → null, own 0/−5/'7' kept, thrown own 0 kept; matrix 483,840 with classify∘build unchanged | VERIFIED | 62/62 green; diff `:377-396` shows the five cases, each followed by `classifyTransportDeliveryOutcome(classified) ≡ classified`; size line `:296` unchanged. My kill matrix on the committed owner (`verify-r3-kill-matrix-1a29cfc9c.txt`): 31,104,000 inputs, zero `classify(build(x))` violations, zero rewrites, named states, FAILED dominance; the only violation class remains my stale own-`undefined` expectation (1,918,080, ruled F3). 69 checks, 9 flips, all ruled behaviours; the two `defaultRetryAfterMs` checks now flip because the option is ignored entirely (DELIVERED stays DELIVERED; own 0 kept), which is the deletion. r2 observation O1 (own non-positive hint overwritten by the default) is closed by the deletion |
| 4 | Direct-wakeup witness 5 assertions (fallback 23 for null and own-0 hints; options object has no effect) | VERIFIED | `replica-dispatch-direct-wakeup-delivery-decision.test.js` 5/5 (`verify-r3-direct-wakeup-1a29cfc9c.tap`): delivered → verification; router deferral → `deferred: [null]`, `delays: [23]`; own-0 hint → `deferred: [0]`, `delays: [23]`; `classify(…, {defaultRetryAfterMs: 23}).retryAfterMs === null` |
| 5 | Runs and statics | VERIFIED (one correction to the file set) | Nine fixed-count witness files + the pin + the property file: 10/10, 789 assertions (property 428 this run); plus the two direct-wakeup files by filename: `replica-dispatch-direct-wakeup-delivery-decision.test.js` 5/5 green and `replica-dispatch-node-state-update-remote-direct-wakeup.test.js` RED with verdict lines IDENTICAL at bed8c6354, f291aad32 and 1a29cfc9c (`not ok 1 - remote-owned coordinator creates should wake the target owner directly`, `not ok 2 - initial remote wake-up should use bounded target-owner delivery`; `verify-r3-remote-direct-wakeup-{base2,wt2,wt3}.tap`) and present in the lab baseline red list → pre-existing, not attributable. `seed-infrastructure-phase.test.js` red with the same pre-existing leaf `d.assertOriginalSeedAttempt is not a function`. Statics at 1a29cfc9c: `node --check` 7 delta js files OK; eslint 0; `audit:impact-contracts` PASS 71/44 (sha `1ab1017b…`, unchanged from r2); `test:cycles` 0/0; scoped metrics on the 4 delta src files 1 cyclomatic (`getDeliverMetricTrigger` 13, pre-existing at f291aad32 too) / 0 cognitive — no increase; `test:metadata:refresh` zero drift; `test:unused:ratchet` 1446 > 1416 (unchanged, inherited) |

Not re-measured in r3 (carried from r2, files untouched by this delta): test duplication
701/26618 and the repo-wide decision-boundaries audit (29 violations in 16 files outside
the C2 diff).

### What I ran (r3)

`c2-verify/tools/r3-chain.sh` → `verify-r3-chain.txt`, `verify-r3-witnesses-1a29cfc9c.tap`,
`verify-r3-pin-on-base-consumer.tap`, `verify-r3-kill-matrix-1a29cfc9c.txt`; then
`verify-r3-direct-wakeup-1a29cfc9c.tap` and `verify-r3-remote-direct-wakeup-{base2,wt2,wt3}.tap`
(the chain's content-grep for the direct-wakeup files matched nothing, so they were run
separately by filename). Reads: the full delta diff, `replica-dispatch-direct-wakeup.js:112-160`,
`replica-dispatch-retry-scheduling.js:166-222`, `pressure-routing.js:84-116` on both trees,
`query-transport-selection.js`, `transport-query-semantic-outcome.js`.

### Limits (r3)

Local runs only; the lab was not re-run. The two pre-existing reds (`seed-infrastructure-phase`,
`remote-direct-wakeup`) are classified by identical leaves across three trees, not by root cause.
