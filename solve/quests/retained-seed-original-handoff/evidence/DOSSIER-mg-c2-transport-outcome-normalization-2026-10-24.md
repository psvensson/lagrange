---
audience: development
documentClass: planning
---

# DOSSIER: C2, transport delivery-outcome normalization erases receipt contradictions

Read-only investigation. Worktree `/mnt/data/peter/projects/.worktrees/mg-delivery-resume-r2-20261023`,
branch `work/mg-delivery-resume-r2-20261023`, HEAD `bed8c6354`. Every path below is relative to that
worktree. No file in it was edited, no test ran, nothing was committed. Line numbers are at `bed8c6354`.

Status: this is design input only, not proof (R19). Nothing here is measured. The design in section 5 is a
recommendation that still needs the C2 predecessor measurement, an independent source review and the
owner's decisions in section 6.

---

## 0. Summary

1. **The defect is confirmed, and its scope is wider than CDC.** `buildTransportDeliveryOutcome`
   (`src/transport/transport-semantic-outcome.js:218-258`) spreads `...options` (`:243`) and then overwrites
   all six names in `TRANSPORT_DELIVERY_OUTCOME_METADATA_FIELDS` (`:24-40`) with computed values
   (`:244-256`). Those six names are not used only by transport. Handlers use the same names in their
   **application replies**: `deferRetry`, `retryAfterMs`, `errorCode` and `reasonCode` all appear widely in
   `src/` reply objects. Today the router therefore (a) reads application fields as transport signals and
   (b) rewrites them. C2 is (b). It is a systemic "transport launders application status" defect, the same
   family that 62140435a and 6831054b1 partly fixed in Sept 2026 (section 2).
2. **Which contradictions get laundered today** (raw handler reply, then the router output that the CDC
   validator sees):
   - `reasonCode:'ack_rejected'` becomes `null`.
   - `noHandler:1` becomes `false`.
   - `retryAfterMs:0` becomes `null`.
   - `errorCode:''` becomes `null`, and `'x'` becomes `'X'`.
   - `deferRetry:'true'` becomes `false`.
   - `deliveryState:''`, `null` or `1` is ignored and becomes `'delivered'`.
   - `deliveryState:'delivered'` on a deferred reply is silently replaced by `'deferred'`.
   - Provisional `deferRetry:false` with a positive `retryAfterMs` comes out as `deferRetry:true`, so the
     CDC provisional predicate accepts it.
   - Provisional `deliveryState:'delivered'` with a positive retry hint comes out as `'deferred'`, also
     accepted.
   - `deliveryState:'failed'` with a positive `retryAfterMs` comes out as `'deferred'` (failure laundered
     into a deferral).
3. **The census rules out the strict design.** Making "any explicit own field that differs from the computed
   value" a FAILED outcome would regress production. Application objects legitimately carry
   `retryAfterMs: 0` (for example `src/bootstrap/lifecycle-controller.js:457`,
   `src/bootstrap/shared/message-group-selection.js:159-207`), explicit `deferRetry: false`
   (`src/node/runtime-service-handler.js:230`, `src/node/runtime-service-bound-creation-route.js:317`),
   application `reasonCode`s (26 control-plane files) and lowercase application `errorCode`s
   (`src/node/runtime-service-handler-constants.js:87-94`).
4. **Recommended design (D1).** Transport keeps every explicitly supplied own value of the five non-state
   fields raw. It computes `deliveryState` exactly as today with one change: an **explicit delivery-state
   claim that is not supported** becomes FAILED, and that FAILED dominates deferral. An unsupported claim
   is any of: a claim of `failed`, an own value outside the three named states, or `delivered` where the
   computed state is not delivered. Transport adds no CDC grammar. The CDC validator, which already sees the
   raw reply fields through the spread, then rejects the typed contradictions. The rule is a proven fixed
   point, so the twice-normalized ACK path is idempotent (section 5.3).
5. **Sibling defects, same class, recorded and not absorbed (R17):**
   - `classifyTransportDeliveryOutcome` pre-coerces before building
     (`transport-semantic-outcome.js:323-344`).
   - The router's own retirement path returns an outcome that was never normalized
     (`message-router-delivery-behaviors.js:192-201`).
   - Handler results override transport identity and ACK (`:69-75`, `:452-458`).
   - Thrown handler errors lose `code`, `deferRetry` and `retryAfterMs` (`:78-87`, `:461-471`;
     `message-router-inbound-dispatch.js:483-495`).
   - At least seven consumers decide from flags or `acknowledged` instead of the owner predicate
     (section 3.4).
   - The MG forwarding owner compares against a stale copy of a router error code
     (`message-group-forwarding-owner-constants.js:28` vs `transport-error-codes.js:5-6`).
   - The rebalancer error-like builder spreads a nested error over the normalized outcome
     (`operation-workflow-dispatch-response-reconcile.js:253-270`).

---

## 1. Complete trace: handler reply to the value `deliver()` returns

Public entry: `MessageRouter.deliver` (`src/transport/message-router-delivery-delegation.js:61-68`) calls
`deliver()` (`src/transport/message-router-delivery-behaviors.js:134-203`). It awaits
`router.resolveDeliveryOutcome(...)` (`:171-182`, defined at
`src/transport/message-router-delivery-pressure-routing.js:323-375`), then calls
**`normalizeDeliveryOutcome(deliveryOutcome)`** (`delivery-behaviors.js:184`) and returns `.result`
(`:185,191`).

`normalizeDeliveryOutcome` (`src/transport/message-router-outbound-queue-admission.js:140-164`) unwraps
`{result, queueWaitMs}` when both are own properties (`:142-151`). It then applies
`buildTransportDeliveryOutcome` to the result (`:154`), or to the bare outcome (`:161`), and floors
`queueWaitMs` (`:155-157`).

`buildTransportDeliveryOutcome` (`transport-semantic-outcome.js:218-258`) works as follows:

- **Defaulted.** `retryAfterMs` is replaced by `normalizePositiveRetryAfterMs(v, null)`
  (`:219-222`, `:64-68`). A non-positive or non-finite value becomes `null`; a fraction is floored.
- **Aliased.** `errorCode` reads `options.errorCode ?? options.code` (`:223-225`).
- **Uppercased and defaulted.** `errorCode` goes through `normalizeTransportErrorCode` (`:76-81`): a
  non-string or `''` becomes `null`; anything else is uppercased.
- **Coerced.** `noHandler === true` (`:226`) and `acknowledged === true` (`:227`).
- **Claim parsed.** `claimedDeliveryState = normalizeOptionalString(options.deliveryState)` (`:228`).
  Non-strings and `''` become `null`, which means the claim is ignored.
- **`completedWithError`** is `status === 'completed'` and a non-empty `error ?? message` (`:229-230`).
- **State.** `classifyTransportDeliveryState` (`:99-125`):
  - `deferred` = `deferRetry === true`, or a deferred transport code (`:92-97`), or `retryAfterMs !== null`,
    or a claim of `deferred` (`:100-105`).
  - `hasConflict` = `noHandler`, or `completedWithError`, or any transport code (`:83-90`), or a claim
    other than `delivered` (`:106-114`).
  - `delivered = acknowledged && !deferred && !hasConflict` (`:115`).
  - Precedence: **delivered, then deferred, then failed** (`:119-123`). Deferral beats a `failed` claim.
- **Overwritten.** `return Object.freeze({...options, acknowledged, deliveryState, deferRetry: deferred,
  errorCode, retryAfterMs, noHandler, reasonCode: resolveTransportDeliveryReasonCode(...)})`
  (`:242-257`; the reason ladder is `:140-178`). **All six metadata names are always replaced. No
  own-property test is made anywhere.**

### 1(i) Locally dispatched service handler

1. `resolveDeliveryOutcome`: when `targetNodeId === this.nodeId`, it calls `deliverLocal`
   (`message-router-delivery-pressure-routing.js:358-366`). Query data-plane messages reach `deliverLocal`
   through `:331-346`.
2. `deliverLocal` (`message-router-delivery-behaviors.js:29-90`). If no handler is registered, the call
   goes **remote to self** through `deliverRemote` (`:39-48`) and continues on path (ii).
3. The handler is invoked: `await Promise.resolve(handler(envelope, delivery, localDelivery))` (`:67`).
4. The result is built as `{messageId, correlationId, acknowledged: true,
   ...router.normalizeServiceResponseResult(result)}` (`:70-75`). Fields are changed here:
   - **Replaced by the handler.** Because the spread comes after them, a handler-supplied `messageId`,
     `correlationId` or `acknowledged` **overrides** the transport's values. A handler returning
     `acknowledged:false` turns a real local dispatch into FAILED.
   - **Renamed.** `normalizeServiceResponseResult` (`message-router-pending-response-ledger.js:503-518`)
     drops `type` and copies it to `responseType` unless `responseType` is already own (`:507-516`).
   - **Dropped.** A non-object result (a primitive) becomes `{}` (`:504-506`).
5. **Dropped on throw.** A thrown handler error returns `{messageId, correlationId, acknowledged: false,
   error: error.message}` (`delivery-behaviors.js:78-87`). `error.code`, `deferRetry` and `retryAfterMs`
   are lost.
6. The result is wrapped as `{result, queueWaitMs: 0}` (`:69-77`), normalized once at `:184`, and returned
   at `:191`.

### 1(ii) Remote WebSocket SERVICE_RESPONSE

1. `deliverRemote` (`delivery-behaviors.js:254-426`). The raft-direct path returns its raw ACK
   `{messageId, acknowledged: true, direct: true}` (`:205-252`, `:272-274`), which `:184` normalizes
   through the second branch.
2. A pending response is registered (`:287-292`, `message-router-pending-response-ledger.js:337-396`),
   then `enqueueOutbound` (`:307-380`) calls `router.sendMessage` (`:360-369`). That is `sendWithAck`
   (`src/transport/message-router-ack-delivery.js:58-175`), whose ACK is resolved by `handleAcknowledgment`
   (`message-router-pending-response-ledger.js:525-556`).
3. The outbound registry wraps the ACK as `{result, queueWaitMs}`
   (`src/transport/message-router-outbound-delivery-registry.js:599-613`).
4. **First normalization, applied to the ACK:** `normalizeDeliveryOutcome(ackOutcome)` (`:382`).
5. `completeRemoteDelivery` (`delivery-behaviors.js:428-472`):
   - `!ackResult.acknowledged` returns the normalized ACK (`:432-437`).
   - An ACK carrying payload follows path (iii) (`:439-444`).
   - Otherwise it arms the timeout and awaits `responsePromise` (`:446-450`).
6. Peer side (`src/transport/message-router-inbound-dispatch.js:426-496`):
   - It sends `ACK{messageId, acknowledged:true}` first (`:435-439`).
   - No handler: `SERVICE_RESPONSE{result:{noHandler:true, error}}` (`:449-457`).
   - Success: `SERVICE_RESPONSE{result}` carrying **the raw handler return** (`:476-481`).
   - Throw: `SERVICE_RESPONSE{error: error.message}` (`:489-494`). **Dropped:** code, deferRetry and
     retryAfterMs.
7. Receive side: `handleServiceResponse` (`message-router-inbound-dispatch.js:502-542`), then
   `resolveServiceResponseDisposition` (`message-router-pending-response-ledger.js:205-215`), then
   `settlePendingResponse` (`:452-455`), then `pending.acceptResponse` (`:364-379`):
   - An `error` causes a rejection with `new Error(error)` (`:367`).
   - Otherwise it resolves with the raw `result`.
8. Back in `completeRemoteDelivery`: `{messageId, correlationId, acknowledged: true,
   ...normalizeServiceResponseResult(serviceResult)}` (`:452-458`). This hop has the same override, rename
   and drop as step 4 of (i). The ACK's computed metadata from step 4 above is **not** merged into this
   result. A rejected response returns `{messageId, correlationId, acknowledged:true, error:
   error.message}` (`:461-471`).
9. **Second normalization**, applied to the fresh service result: `delivery-behaviors.js:184`. The service
   result is normalized once.

### 1(iii) Inline ACK reply

1. The peer's ACK carries extra fields. `handleAcknowledgment` builds
   `{messageId, acknowledged: true, ...rest}`, and re-adds `error` when it is defined
   (`message-router-pending-response-ledger.js:526`, `:548-555`). `acknowledged` is **coerced from
   truthiness**: `if (acknowledged)` at `:537`. `type` is dropped by destructuring at `:526`. A
   legacy-shape twin exists at `src/transport/router-message-handler.js:339-353`.
2. First normalization (`delivery-behaviors.js:382`). `hasInlineAckPayload`
   (`message-router-pending-response-ledger.js:485-496`) treats every key outside
   `INLINE_ACK_PASSTHROUGH_KEYS` as payload. That set is `messageId`, `acknowledged`, `correlationId` plus
   the six metadata fields (`message-router-shared-vocabulary.js:231-242`). This is the reason the metadata
   list exists: the normalizer's own six keys must not make a bare ACK look like a payload.
3. `cancelResponse(INLINE_ACK)` returns `{result: ackResult (already normalized), queueWaitMs}`
   (`delivery-behaviors.js:439-445`).
4. **Second normalization of the same object** (`:184`). This is the double-normalized path. It is
   idempotent today only because every output is a computed fixed point. Preserving raw values breaks that
   unless the rule is designed as a fixed point (section 5.3).

### 1(iv) Path the brief did not name: query data-plane

`resolveQueryTransportDeliveryOutcome` (`message-router-delivery-pressure-routing.js:277-314`) calls the MG
`sendMessage`. A result with `acknowledged === true` passes through raw (`:199-207`, `:240-246`). A result
with `acknowledged:false` and `deferRetry:true` is rebuilt by `buildDeferredDeliveryFailure`
(`:134-159`; `message-router-reconnect-behaviors.js:665-690`). Everything is wrapped (`:316-321`) and
normalized at `delivery-behaviors.js:184`.

### 1(v) Exit paths that bypass normalization

- `deliver`'s `withDeliveryLifetime` retirement callback (`delivery-behaviors.js:192-201`;
  `message-router-delivery-lifetime.js:218-232`) returns a raw object with **no `deliveryState`**:
  `{acknowledged:false, deferRetry:true, retryAfterMs, errorCode}` or `{shutdown:true}`. A consumer that
  calls `isDeferredTransportDeliveryOutcome(result)` without `classify` sees "not deferred".
- `buildDeferredDeliveryFailure` (`message-router-reconnect-behaviors.js:665-690`) defaults through
  `normalizeRetryAfterMs` (`message-router-outbound-queue-admission.js:166-174`). That function returns
  **0** when both the value and the fallback are non-positive, which happens only if
  `reconnectIntervalMs <= 0`.

### 1(vi) Nested hop: MG forwarding returns a transport outcome as an application reply

The forward hop's normalized answer is returned as the reply: `if (result.accepted) return result.answer;`
(`message-group-forwarding-owner-native-delivery-methods.js:276`; the answer comes from `:187-201`). It is
spread into the MG reply `{acknowledged: true, ...answer}`
(`message-group-service-runtime-support.js:348-353`, used at
`message-group-service-cdc-propagation-runtime-methods.js:290-305`). Hop-2 `deliveryState`, `reasonCode`,
`messageId` and `correlationId` therefore arrive at hop 1 as handler fields. Hop 1 normalizes again, and its
`messageId`/`correlationId` are overridden by hop 2's values (see (i) step 4). This is the only production
origin found for an explicit `deliveryState` inside a reply: a grep of `src/` for producers of
`deliveryState:` and `noHandler:` outside transport found only the CDC grammar and an MG log field.

---

## 2. History pass

| What | SHA / date | Intent on record |
| --- | --- | --- |
| `normalizeDeliveryOutcome` created as a pure `{result,queueWaitMs}` unwrap | dd1fd9c0a 2026-02-17 (`src/transport/message-router.js:201-217` at that SHA) | None. It did not touch result fields. |
| `buildTransportDeliveryOutcome`, `TRANSPORT_DELIVERY_OUTCOME_METADATA_FIELDS`, `INLINE_ACK_PASSTHROUGH_KEYS`, and the builder inserted into `normalizeDeliveryOutcome`; this introduced the `...options` spread and overwrite (blame `transport-semantic-outcome.js:218-227,241-253,256-258` is all e2797b6c8) | e2797b6c8 2026-04-20, "control plane cleanup and code quality cleanup" | No quest log entry and no design doc found (`solve/`, `docs/`, `architecture/` grep). The only stated intent is in test names: "deferred delivery should expose one canonical deferred grammar" (`test/transport/transport-semantic-outcome.test.js:43`) and "message router normalizes local delivery results onto the shared delivery grammar" (`:126`). In the original builder, delivered held **iff `acknowledged === true`**. The repairs in the brief's hypothesis are in the code: the `code` alias, the uppercase step, positive/floor `retryAfterMs`, boolean coercion. **No record says they repaired named legacy producers.** That is inferred from the code, not stated anywhere. |
| Moves / refactors | d943df3bf 2026-05-06, 9d1f063bb 2026-05-19, 8942e8675 2026-03-05, 06273547c 2026-07-02 | Mechanical. |
| **Earlier fix of the same family: "ACK launders transport failure into delivered."** It added `classifyTransportDeliveryState`, the conflict on `noHandler`, on transport codes and on a `deliveryState` claim, and moved the transport codes into `transport-error-codes.js`. | 62140435a 2026-09-27 "fix: close exact-head authority gaps", then 6831054b1 2026-09-27 "fix: close systemic authority boundaries" (`completedWithError`, the deferred-code split, new reason codes). Both are squashed into 1aea11baf (PR #63). | Quest `replica-lifecycle-durable-generation` (sealed at 6831054b1, `solve/quests/replica-lifecycle-durable-generation/log.ndjson:1`). Witnesses added: `test/transport/transport-semantic-outcome.test.js:57-124` ("fails closed when ACK contradicts delivery metadata"), `test/rebalancer/replace-witness-boundary.test.js:146-168` and `test/raft/raft-rs-backend/committed-membership-adversarial-boundary.test.js:242-270`. Gap: it fixed **upgrade** laundering (an ACK made into delivered). It left **erasure** laundering (overwriting an explicit claim) in place. C2 is that remainder. |
| An earlier trace of the same rule | 2026-06-19 `solve/quests/rolling-restart-core-stability/log.ndjson:1146` | Recorded "buildTransportDeliveryOutcome sets deliveryState=DELIVERED iff acknowledged===true … a noHandler outcome has acknowledged:true → DELIVERED". The fix was attempted and reverted as the wrong layer for that symptom. |
| `TRANSPORT_COMPLETED_STATUS` exported for the CDC grammar | 681da1dc1 2026-10-23 (WIP preserve) | Quest `retained-seed-original-handoff`, log entry 62 (`solve/quests/retained-seed-original-handoff/log.ndjson:62`): "share existing transport completed-status scalar rather than copy it". |
| The design-vet requirement on `noHandler`, deferred, rejection and timeout handling | `solve/quests/raft-rs-operation-port-boundary/log.ndjson:5-6` (2026-09-21) | Requires "canonical classifyTransportDeliveryOutcome handling". |
| A wrapper explicitly fixed to preserve contradictions | `src/message-group/message-group-service-runtime-support.js:349-352` (comment: "must preserve the owner's full semantic answer, including contradictory fields which the canonical CDC validator must refuse") | The same principle C2 needs at transport. |

---

## 3. Consumer census

### 3.1 Router output: where the six fields go

There are 36 call sites of `.deliver(` outside the router (grep of `src/`). For each, the reads within 45
lines were checked. Classification:

**A. Consumers that ask the owner predicate (`isDeliveredTransportDeliveryOutcome` / `classify`).** These
are safe under D1, because `deliveryState` stays computed and contradictions become FAILED.

- `src/node/participant-release-client.js:101,119-132`. It also reads `reasonCode === MESSAGE_TIMEOUT`, but
  only on `classify(error)` for thrown errors.
- `src/service/service-dispatcher.js:343-355` (also `reasonCode === NO_HANDLER`, which is redundant).
- `src/bootstrap/shared/node-state-publication-owner.js:482-500` (same pattern).
- `src/bootstrap/node-joining-backfill-merge-and-status.js:223-243`.
- `src/control-plane/replica-dispatch-direct-wakeup.js:122-144`.
- `src/rebalancer/operation-workflow-dispatch-response-reconcile.js:744-830`. On not-delivered it builds
  `errorLike` from the response and defers through `deferDispatchRetry`. **Load-bearing conflation:** an
  application deferral (`deferRetry:true`/`retryAfterMs`) in a replica-handler reply becomes a transport
  DEFERRED and goes down this branch. D1 does not change that.
- `src/rebalancer/operation-workflow-owner-handoff-state.js:283-308` (`noHandler === true` checked first).
- `src/rebalancer/operation-workflow-message-group-native-read.js:29-36`.
- `src/rebalancer/committed-membership-bootstrap-read.js:85-113`. It **forwards `response.retryAfterMs`**
  into its own result (`:103-104,112-113`). Under D1 that would carry a raw, possibly non-canonical value,
  but only when a reply supplied one.
- `src/rebalancer/operation-workflow-replace-witness.js:114-147`. It forwards `response.reasonCode` as a
  diagnostic `reason` and `response.retryAfterMs` as its retry hint. Same note as the previous item.
- `src/partition/managed-source-replication-start-delivery.js:13-56` (`errorCode` against transport codes,
  `reasonCode === MESSAGE_TIMEOUT`, `noHandler`/`deferRetry` for `retryable`).
- `src/message-group/message-group-forwarding-owner-native-delivery-methods.js:132-135,187` through
  `isCommittedCdcDelivery`/`isProvisionalCdcDelivery` (`src/cdc/cdc-delivery-outcome.js:336-346`). **This
  is the C2 consumer.** The transport half is `classify(answer)` and the CDC half is
  `isCommittedCdcOutcome(answer)` on the router output itself. Raw values are visible only if transport
  stopped overwriting them.
- `src/cdc/cdc-propagation-progress.js:130` (`observeCdcCoverage(..., {transport:true})`, which feeds the
  topology durable wave `src/topology/cdc-group-propagation-durable-delivery.js:76-107`).

**B. Consumers that use the local CDC predicate on an answer which may be router-normalized.** These
consumers *rely on* transport-added fields being in the CDC allowlist (`cdc-delivery-outcome.js:112-164`):

- `src/partition/partition-cdc-obligation-progress.js:93`.
- `src/topology/cdc-group-propagation-durable-delivery.js:121-122`.
- `src/bootstrap/shared/partition-cdc-propagation-subscriber.js:185-186`.
- `src/partition/partition-cdc-delivery.js:80-82,425,520,601,655`.

Under D1 these see raw reply values, so they reject contradictions, which is the intended fix. Whether every
one of these answers actually crosses the router is **unknown**. It is not traced per site.

**C. Consumers that decide from flags or `acknowledged` instead of the owner.** These are R01/R03
re-derivations and already miss the conflict states that 62140435a introduced. Under D1 they would see raw
flags where today they see coerced ones, so they **must be routed to the owner predicate in the same
change, or recorded as R17 debt**:

- `src/raft/raft-rs-peer-delivery.js:74-84`: `noHandler === true || deferRetry === true ||
  acknowledged === false || error`. It never reads `deliveryState`. A FAILED-by-claim outcome, or a raw
  `deferRetry:false` alongside DEFERRED, is recorded as DELIVERED.
- `src/message-group/message-group-forwarding-owner-delivery-methods.js:621-640`: `acknowledged`,
  `success !== false`, `noHandler`, `error`. This is the non-durable forward.
- `src/message-group/message-group-service-outbound-dispatch-runtime-methods.js:224-252`: `acknowledged`
  counts as delivered, then `{delivered:true, ...result}`.
- `src/partition/partition-service-metadata-delivery-methods.js:531-544`: `acknowledged === false` only.
- `src/partition/partition-service-write-metrics-base.js:463-486`: `acknowledged` only.
- `src/topology/cdc-group-propagation-delivery-methods.js:727-747`: `!result?.acknowledged` only. A
  `noHandler` reply (`acknowledged:true`) counts as delivered.
- `src/control-plane/membership-swim-prober.js:101-139`: `acknowledged && alive`.
- `src/query/query-executor-partition-delivery.js:388-600`: reads `response.noHandler` (`:559`),
  `errorCode` (`:578,590`), `retryAfterMs`/`deferRetry` (`:592-593`) as **application** semantics, and
  never reads `deliveryState`.

### 3.2 Who relies on the repair semantics?

| Repair | Producers that need it | Consumers that need it | Verdict |
| --- | --- | --- | --- |
| `code` to `errorCode` alias (`:224`) | `classify(error)` on thrown `Error`s that carry `.code`: `participant-release-client.js:126`, `committed-membership-bootstrap-read.js:111`, `operation-workflow-replace-witness.js:139`, `managed-source-replication-start-delivery.js:16`. Also any reply that sets only `code`. | `managed-source-replication-start-delivery.js:20-22` compares `outcome.errorCode` to transport codes. | **Keep.** It applies only when `errorCode` is not own, so no explicit claim is erased. |
| Uppercasing | Every **transport** producer already emits uppercase constants (`transport-error-codes.js:5-10`, `transport-semantic-outcome.js:61-62`). Lowercase **application** codes exist and travel in replies, e.g. `HANDLER_ERROR.CORRUPT_LOCAL_MEMO` in `runtime-service-bound-creation-route.js:316-317`, and see `runtime-service-handler-constants.js:87-94`. | No `src/` comparison was found that expects an uppercased application code (grep of `errorCode ===`). | Today it **silently changes application codes**. Under D1 the raw value is output, and only classification uses the uppercase value internally. **Unknown:** whether a peer emits lowercase *transport* codes. None was found in `src/`. |
| `retryAfterMs` positive/floor/null | `normalizeRetryAfterMs` can emit 0 (`message-router-outbound-queue-admission.js:166-174`). Many application objects use `retryAfterMs: 0` to mean "no wait" (`lifecycle-controller.js:457`, `message-group-selection.js:159-207`, `rebalance-coordinator-operation-creation-admission.js:194,211`, `bootstrap-readiness-*`). | Classification treats only positive values as a deferral hint (`:103`). Raw forwarders: `committed-membership-bootstrap-read.js:104,113`, `operation-workflow-replace-witness.js:124,132`, `message-group-service-outbound-dispatch-runtime-methods.js:250`, `message-group-service-runtime-support.js:217-222` (already floors itself). | **0 must stay neutral, never FAILED.** D1 preserves the raw value, so a 0-or-null difference appears only in output. CDC rejects 0 by its own grammar (`cdc-delivery-outcome.js:143,160`). |
| `deferRetry`/`noHandler` coercion to boolean | — | Flag readers in section 3.1 C. | Classification stays `=== true`. The output is raw. Only malformed replies differ. |
| `reasonCode` recomputed | Application `reasonCode`s exist across 87 files (26 in `src/control-plane`). Whether any of them is carried in a router-delivered reply is **unknown**. | The transport-vocabulary comparisons listed above all hold for transport-originated outcomes, which carry no own `reasonCode`. `isProvisionalCdcDelivery` needs `reasonCode === TRANSPORT_DEFERRED` (`cdc-delivery-outcome.js:344`). | Under D1 an own `reasonCode` is preserved. A provisional answer built by `buildProvisionalCdcOutcome` (`:249-259`) has none, so it still gets the computed `transport_deferred`. |
| `deliveryState` claim | Only transport outputs (the double path, the MG nested hop) and test fixtures. | `test/rebalancer/terminal-failed-add-target-cleanup.test.js:122-130` relies on the claim `{acknowledged:false, deliveryState:'deferred'}` producing DEFERRED. | Keep the `deferred` claim as a deferral input. |

### 3.3 Tests that assert normalization today

Grep `buildTransportDeliveryOutcome|normalizeDeliveryOutcome|classifyTransportDeliveryOutcome` over
`test/`. Three files import them: `test/transport/transport-semantic-outcome.test.js`,
`test/cdc/cdc-delivery-outcome.test.js` and `test/partition/participant-release-applied-position.test.js`.

- `transport-semantic-outcome.test.js:16-55`. The input has no own `deferRetry`/`noHandler`/`reasonCode`,
  so the `t.same` at `:30-44` is unchanged under D1.
- `:57-124`. Every case keeps its expected state under D1:
  - `{deliveryState:'failed'}` gives FAILED.
  - Deferred codes give DEFERRED.
  - `WS_CONNECT_TIMEOUT` gives FAILED.
  - `status:'error'` stays DELIVERED (`:118-123`, "confirmed delivery preserves an application refusal").
- `cdc-delivery-outcome.test.js:66-69` (`buildTransportDeliveryOutcome({...answer, acknowledged:true})`)
  has no own metadata fields, so it is unchanged. `:107-139` is local only. `:141-163` uses canonical
  values that equal the computed ones.
- Router-level tests assert values produced by transport builders, which are already canonical. They are
  expected to be unaffected, but this has not been measured:
  - `test/transport/message-router-routing-and-recovery.js:256-419,641-743`
  - `message-router-tail-more-test-cases.js:340,836-967`
  - `message-router-tail-final-test-cases.js:60-202`
  - `message-router-cdc-encoding.test.js:125`
  - `message-router-cdc-custody.test.js:37,145`
  - `delivery-semantics.property.test.js:117-164`
  - `routing-correctness.property.test.js:243-287`
  - `test/contract/message-router-contract-support.js:70-152`
- Fixtures that return pre-shaped outcomes stay consistent under D1, because their claims equal the
  computed values:
  - `test/rebalancer/replace-witness-fixture.js:77-161`
  - `committed-membership-fixture.js:92`
  - `test-helpers.js:589`
  - `replace-named-handoff-attempt.test.js:115,147`
  - `test/bootstrap/seed-release-once-per-cohort.test.js:64`
  - `test/node/group-retirement-as-a-unit-fixture.js:275`
- **The one behavioural change for an existing test vector** is a `failed` claim plus deferral evidence:
  DEFERRED today, FAILED under D1. No test or `src/` producer of that combination was found (grep of
  `deliveryState: 'failed'` in `src/` and `test/`).
- **Unknown:** tests whose handlers return non-canonical fields and assert the normalized output. Only a
  focused run can rule this out.

### 3.4 Sibling instances of "a wrapper spreads input and overwrites semantic fields" (potential same-class defects)

1. `src/transport/transport-semantic-outcome.js:242-257`: **C2 itself.**
2. `src/transport/transport-semantic-outcome.js:323-344` `classifyTransportDeliveryOutcome`. It spreads,
   then forces `acknowledged`, `error` (adding `error: null`), `errorCode`, `retryAfterMs` (with a default),
   `deferRetry` and `noHandler` before building. Pre-coercion hides raw claims from every `classify`
   consumer, including `isCommittedCdcDelivery`'s transport half (`cdc-delivery-outcome.js:337,342`).
3. `src/transport/transport-semantic-outcome.js:180-216,300-321`: the semantic-outcome variants. They do
   not spread and return a fresh shape, so this is a lower risk. Listed for completeness.
4. `src/transport/message-router-delivery-behaviors.js:69-75` and `:452-458`. The *inverse* direction: the
   application result overrides the transport's `messageId`, `correlationId` and `acknowledged`.
5. `src/transport/message-router-pending-response-ledger.js:548-552`: `{messageId, acknowledged:true,
   ...rest}`. `acknowledged` is coerced from truthiness at `:537`. Twin at `router-message-handler.js:348`.
6. `src/transport/message-router-pending-response-ledger.js:503-518`: `type` is renamed to `responseType`
   and a primitive result is dropped.
7. `src/transport/message-router-delivery-behaviors.js:192-201`: retirement exit **without**
   normalization (no `deliveryState`).
8. `src/transport/message-router-delivery-behaviors.js:78-87,461-471`, and
   `message-router-inbound-dispatch.js:483-495`: a thrown handler error keeps only its message.
9. `src/transport/message-router-outbound-queue-admission.js:166-174`: `normalizeRetryAfterMs` defaults
   to 0, which mixes the "no hint" and "zero" encodings.
10. `src/message-group/message-group-service-runtime-support.js:348-353` and
    `src/message-group/message-group-service-cdc-propagation-runtime-methods.js:290-305`:
    `{acknowledged:true, ...answer}` re-emits a hop-2 transport outcome as an application reply.
    Intentional and documented. It interacts with item 4 (identity override).
11. `src/partition/partition-service-entry-apply-base.js:409-413`: `{acknowledged:true, success, ...result}`.
    An application claims the transport ACK field. Fail-closed direction, but a category error.
12. `src/rebalancer/operation-workflow-dispatch-response-reconcile.js:253-270`:
    `{...response, ...nestedError}`. A nested error object can overwrite the normalized `deliveryState`,
    `deferRetry` and the rest.
13. `src/message-group/message-group-service-outbound-dispatch-runtime-methods.js:234-240`:
    `{delivered:true, attempt, ...result}` on the strength of the ACK alone.
14. `src/cdc/cdc-integration-service-owner-rpc-read-execution.js:49-57`: `{...result, success, error,
    rows, rowCount}` overwrite. Here it **tightens** to failure, so it is not laundering. Listed.
15. `src/message-group/message-group-forwarding-owner-constants.js:28` `'OUTBOUND_QUEUE_BACKPRESSURED'`,
    compared at `message-group-forwarding-owner-delivery-methods.js:352-353`. The canonical value is
    `'ROUTER_OUTBOUND_QUEUE_BACKPRESSURED'` (`transport-error-codes.js:5-6`). This is a stale R06/R03 copy,
    and the comparison is dead (it falls back to message text at `:357-362`).
16. Flag readers, section 3.1 C.

---

## 4. Primary references

| System | Source (fetched, except where noted) | What it says | Implication | Where it does not apply |
| --- | --- | --- | --- | --- |
| gRPC | https://grpc.io/docs/guides/error/ | "gRPC returns one of its error status codes instead, with an optional string error message". Richer details are "provided as trailing metadata in the response". | Transport status and application detail are separate channels, and the transport never rewrites the application's detail. | Lagrange replies are flat objects. There is no trailer channel, which is the root of the namespace collision. |
| gRPC status codes | https://grpc.github.io/grpc/core/md_doc_statuscodes.html | "The following status codes are never generated by the library:" INVALID_ARGUMENT … DATA_LOSS. "there is no fixed list of status codes on which it is appropriate to retry in all applications." | Library-generated and application-generated codes are kept distinguishable. A consumer can tell "the transport said" from "the app said". Here, `deferRetry`/`retryAfterMs` from an app and from the router are indistinguishable once normalized. | gRPC still uses one code space for both. Lagrange could adopt the "transport only emits its own named subset" rule (the `TRANSPORT_DELIVERY_OUTCOME_REASON_CODE` set) without a channel split. |
| HTTP | RFC 9110 §15, https://www.rfc-editor.org/rfc/rfc9110#section-15 | §15: "The status code of a response is a three-digit integer code that describes the result of the request". A client "MUST understand the class of any status code". | The status (transport/protocol result) is distinct from the enclosed content. Intermediaries do not rewrite content to match the status. An unrecognized code degrades to its class, which supports "unknown claim, then FAILED", not "unknown claim ignored". | HTTP has no "delivered but the application failed" ambiguity in one field. Lagrange's `status: 'completed' + error` heuristic (`completedWithError`) has no analogue. |
| AMQP 0-9-1 / RabbitMQ | https://www.rabbitmq.com/docs/confirms | `basic.ack` is "sent when a message has been accepted by all the queues". "Publisher confirms are not aware of consumers." A `basic.nack` means the broker "refuses responsibility". Request/reply "is not covered in this guide". | ACK is transport custody, not processing. A reply is a separate message. That matches the router's ACK (`message-router-inbound-dispatch.js:435-439`) plus SERVICE_RESPONSE split. It argues against letting an ACK or an inline-ACK body imply application success, which `hasInlineAckPayload` does. | AMQP never merges the reply into the ACK, but Lagrange's inline-ACK path does. |
| Kafka producer `acks` | Producer configs, e.g. https://kafka.apache.org/26/configuration/producer-configs/ (found by search; the current docs page was not fetched) | `acks=all`: "the leader will wait for the full set of in-sync replicas to acknowledge the record". | The broker's acknowledgment level is a transport and durability fact, separate from what the record means. | Not a reply protocol. |
| Kafka record-level errors | KIP-467, https://cwiki.apache.org/confluence/display/KAFKA/KIP-467 (**not fetched**; summary from search results and KAFKA-8729 / KAFKA-12548) | It adds a per-batch error and an error message to ProduceResponse. KAFKA-12548: the helpful record-level message "was getting discarded by the producer". | The KAFKA-12548 defect is the C2 pattern: the client discarded the specific error the server returned. The fix kept it. | Unverified detail; the wiki page was not read. |
| Kafka Connect DLQ | KIP-298, https://cwiki.apache.org/confluence/spaces/KAFKA/pages/80453065/KIP-298+Error+Handling+in+Connect (search summary) | It writes "the original record … that failed in the converter or transformation step" to a DLQ. `errors.tolerance` defaults to none (fail). | For malformed records the answer is **reject or quarantine, keeping the original**, not repair. That argues for preserving the raw reply so the canonical validator can reject it. | A DLQ is a durable side channel. Lagrange keeps the obligation as source debt instead (contract table, `CONTRACT-…:204-220`). |
| Debezium | Search only (DBZ-3353, DBZ-588, Debezium 3.0.5 release notes, https://debezium.io/blog/2024/12/18/debezium-3-0-5-final-released) | `event.processing.failure.handling.mode` = fail/warn/skip, default fail. DBZ-588: skipping unparseable events silently "caused data loss and poor visibility". | Silent normalization or skip of malformed change events is a known data-loss pattern. Fail closed is the default. | Not a primary docs page. |

**Net effect on the design:** keep the transport outcome (`deliveryState`, transport reason) and the
application answer distinct. The transport must not rewrite application fields. Malformed or contradictory
answers are rejected by their canonical owner with the original preserved. Neither side repairs the other.
The cleaner long-term fix is a channel or namespace separation (the gRPC trailer model), which is an R08
redesign (section 5.6).

---

## 5. Design recommendation (D1, transport-owned preservation)

### 5.1 Owner edits in `src/transport/transport-semantic-outcome.js`

- Add the named reason code to `TRANSPORT_DELIVERY_OUTCOME_REASON_CODE` (`:48-59`):
  `CONTRADICTORY_DELIVERY_STATE: 'contradictory_delivery_state'`. This satisfies R06/R07.
- Add `const objectHasOwn = Object.hasOwn;`.
- Replace `classifyTransportDeliveryState` (`:99-125`) with a version that receives
  `claimedDeliveryState` as **the raw own value, or `undefined` when not own**:

```js
const NAMED_DELIVERY_STATES = Object.freeze(Object.values(TRANSPORT_DELIVERY_OUTCOME_STATE));
function classifyTransportDeliveryState(options) {
  const claim = options.claimedDeliveryState;             // undefined = absent
  const deferred = options.deferRetry === true ||
    isDeferredTransportDeliveryErrorCode(options.errorCode) ||
    options.retryAfterMs !== null ||
    claim === TRANSPORT_DELIVERY_OUTCOME_STATE.DEFERRED;
  const hasConflict = options.noHandler || options.completedWithError ||
    isTransportDeliveryErrorCode(options.errorCode);
  const supported = options.acknowledged && !deferred && !hasConflict;
  // An explicit state claim never upgrades, and an unsupported one is a failure.
  const contradicted = claim !== undefined && (
    !NAMED_DELIVERY_STATES.includes(claim) ||
    claim === TRANSPORT_DELIVERY_OUTCOME_STATE.FAILED ||
    (claim === TRANSPORT_DELIVERY_OUTCOME_STATE.DELIVERED && !supported));
  const delivered = supported && !contradicted;
  return {delivered, deferred: deferred && !contradicted, contradicted,
    deliveryState: delivered ? DELIVERED : (!contradicted && deferred) ? DEFERRED : FAILED};
}
```

- Replace the body of `buildTransportDeliveryOutcome` (`:218-258`):
  - Compute the classification inputs exactly as today: `retryAfterMs`, `errorCode` (with the `code`
    alias), `noHandler === true`, `acknowledged === true`, `completedWithError`.
  - Pass `claimedDeliveryState: objectHasOwn(options, 'deliveryState') ? options.deliveryState :
    undefined`.
  - Build the output as `{...options, acknowledged, deliveryState, deferRetry: own ? raw : deferred,
    errorCode: own ? raw : errorCode, retryAfterMs: own ? raw : retryAfterMs, noHandler: own ? raw :
    noHandler, reasonCode: own ? raw : reason}`, freeze it, and implement the own-or-computed choice with
    one loop over `TRANSPORT_DELIVERY_OUTCOME_METADATA_FIELDS` minus `DELIVERY_STATE`.
  - `reason` = `CONTRADICTORY_DELIVERY_STATE` when `contradicted`; otherwise the existing ladder (`:140-178`).
- Per-field rule when an own value conflicts with the computed one:

| Field | Own value is kept? | Is it a state input? | Becomes FAILED? |
| --- | --- | --- | --- |
| `deliveryState` | No. The output is always the computed state, because it is transport's named decision (R07). | Yes, as a claim. | Yes for: `failed`; any own value outside the named set (`''`, `null`, `1`, `'DELIVERED'`); `delivered` when the computed state is not delivered. **FAILED dominates deferral.** The `deferred` claim keeps today's role as a deferral input. |
| `deferRetry` | Yes (raw). | `=== true` only (unchanged). | No. Raw `false` alongside DEFERRED stays visible for the canonical consumer (CDC rejects it, `cdc-delivery-outcome.js:141,158`). |
| `noHandler` | Yes (raw). | `=== true` only (unchanged). | No new rule (`true` already fails). |
| `errorCode` | Yes (raw, original case). | Uppercased plus `code` alias, internally only (unchanged). | No new rule. |
| `retryAfterMs` | Yes (raw, including `0`). | Positive finite only (unchanged). | No. `0` is a legitimate application "no wait" (section 3.2). |
| `reasonCode` | Yes (raw). | No. | No. When not own, it is computed, and on a contradiction it is `contradictory_delivery_state`. |

- `classifyTransportDeliveryOutcome` (`:323-344`): stop the pre-coercion. Supply only the aliases that are
  not own: `error` from `message` (`Error.message` is non-enumerable), and `retryAfterMs` from
  `defaultRetryAfterMs` only when `retryAfterMs` is not own (no `src/` caller passes options today; grep).
  Then call the builder. This is the same file and the same defect class, but it widens the change (R16,
  section 6 Q3).
- `normalizeDeliveryOutcome` (`message-router-outbound-queue-admission.js:140-164`) **does not need to
  change**. It only delegates.

### 5.2 Why this closes C2 without importing CDC grammar (R03, R08)

Transport adds no CDC predicate and no typed-field checks for the five value fields. It only stops
rewriting them, and it names the one contradiction that sits on its own decision: an unsupported state
claim. Each C2 matrix case comes out as follows:

- `reasonCode:'ack_rejected'`, `noHandler:1`, `retryAfterMs:0`, `errorCode:''` and `deferRetry:'false'`
  reach `isCommittedCdcOutcome` raw and are rejected there (`cdc-delivery-outcome.js:138-146`, witnessed
  locally at `test/cdc/cdc-delivery-outcome.test.js:107-139`).
- Provisional `deferRetry:false` is rejected by `PROVISIONAL_OUTCOME_FIELDS.deferRetry` (`:158`).
- Provisional or committed `deliveryState:'delivered'` with a retry hint, and `deliveryState:''`/`null`,
  become `deliveryState:'failed'`. Both CDC predicates then reject: committed requires delivered (`:145`),
  provisional requires deferred (`:162`). Generic transport consumers also see FAILED.

### 5.3 Idempotence on the twice-normalized inline-ACK path (`delivery-behaviors.js:382` then `:184`)

Proof sketch that `N(N(x)) = N(x)`:

1. After pass 1, all six names are own.
2. The five value fields are copied raw in pass 2. Their classification inputs are unchanged:
   - `errorCode`: pass 2 uses `norm(O.errorCode ?? O.code)`. If `errorCode` was not own in pass 1, then
     `O.errorCode = norm(code)`, and `norm` is idempotent. If it was own, the same raw value is
     re-normalized.
   - `deferRetry`: a computed output `true` only arose where pass 1 already had `deferred` true.
   - `retryAfterMs`: a computed `null` stays `null`.
   - `noHandler`: a computed `false` stays `false`.
3. The state, case by case:
   - Pass 1 DELIVERED: pass 2 claims `delivered`, and it is still supported, so DELIVERED.
   - Pass 1 DEFERRED: pass 2 claims `deferred`, so `deferred` is true and not contradicted, giving DEFERRED.
   - Pass 1 FAILED: pass 2 claims `failed`, so it is contradicted and FAILED (dominance).
   - `reasonCode` is own in pass 2 and therefore preserved.

**FAILED dominance is required for this.** Today a `failed` claim with a positive retry hint gives
DEFERRED. Under preservation, a pass-1 FAILED caused by a `delivered` claim against a deferred reply would
then come out DEFERRED in pass 2. The witness must assert `N(N(x))` deep-equals `N(x)` over the whole C2
matrix, both through the real inline-ACK route and as a unit property.

### 5.4 Tests that must change, and why each is legitimate

- **No existing assertion needs weakening.** Every existing vector found keeps its state (section 3.3).
- Add to `test/transport/transport-semantic-outcome.test.js` the transport-owner unit witness. It is not a
  replacement for the router-level C2 test the other agent is writing. It covers:
  - Raw preservation for each of the five fields.
  - The contradiction states and their reason.
  - Unchanged legacy precedence (deferred codes beat `noHandler`/transport-code conflicts).
  - The idempotence property.
  - The `code` alias still applying when `errorCode` is not own.
  - `retryAfterMs:0` neutral, with `deliveryState` unchanged.
- **Behaviour change to record explicitly:** a `failed` claim plus a retry hint changes from DEFERRED to
  FAILED. This tightens a fail-closed rule. No test or producer exercises it. It is still a semantic change,
  so it must be named in the review.
- Flag-reader consumers (section 3.1 C) need either an owner-predicate migration with tests, or R17 debt.
  The highest-impact one is `src/raft/raft-rs-peer-delivery.js:74-84`.

### 5.5 Impact-contract registration (`test/shards/impact-contracts.json`)

- `contracts['cdc-source-native-delivery'].tests` and `coupledPairs['cdc-source-native-delivery'].witnessTests`:
  add the new C2 router witness and `test/transport/transport-semantic-outcome.test.js`. Today it is
  registered as a witness of no contract (it appears only in `primary-`, `subsystem-` and
  `resource-classes.json:2355-2375`). `src/transport/transport-semantic-outcome.js` is already an owner in
  the `recipient-and-response` endpoint and the contract owners list (`impact-contracts.json:1406,2958`).
- Owner question Q5: whether `committed-bootstrap-stamp`, `replace-owner-membership-observation`,
  `participant-release-bounded-completion` and `partition-write-answer-retry-classification` (all
  consumers of `classify`/`isDelivered`, section 3.1 A) should list `transport-semantic-outcome.js` as an
  endpoint owner. Today none of their endpoints names it, so a transport change does not select their
  witnesses (for example `test/rebalancer/replace-witness-boundary.test.js` and
  `test/raft/raft-rs-backend/committed-membership-adversarial-boundary.test.js`, the earlier
  same-family witnesses).

### 5.6 Alternatives

- **A1. Strict (D2): any own value that differs from the computed one becomes FAILED.** Rejected. It
  regresses legitimate application conventions (`retryAfterMs:0`, explicit `deferRetry:false`,
  application `reasonCode`s and lowercase codes; section 3.2). It also copies the CDC typed grammar into
  transport (R03, R08).
- **A2. Hand the CDC validator the raw reply** (a side channel or symbol, or validate before
  normalization). Rejected under:
  - R01/R04: the laundering is a transport-owner defect, so the owner is what gets repaired.
  - R08: two representations of one boundary outcome.
  - R11: two paths to the same decision.
  - R03: CDC would have to know where transport hid the raw value.
  It also leaves every other transport consumer seeing laundered values.
- **A3. Delete the double normalization at `delivery-behaviors.js:382`.** The ACK's metadata keys are all
  passthrough keys (`message-router-shared-vocabulary.js:237-242`), so the first pass does not change the
  `hasInlineAckPayload` decision. It only coerces `acknowledged`, and `handleAcknowledgment` already sets
  that to `true`. This is an R11 simplification, not a substitute for idempotence: the builder must be a
  fixed point anyway, because `classify` re-normalizes router outputs and the MG nested hop re-normalizes.
  It is optional, owner choice (Q4).
- **A4. Namespace separation** (the gRPC model): transport metadata moves under one transport-owned key,
  and application fields are never read or written by transport. This is the principled end state. It is
  an R08 boundary redesign across about 36 call sites, `INLINE_ACK_PASSTHROUGH_KEYS`, the CDC allowlist
  and the CDC provisional predicate's reliance on the computed `transport_deferred`
  (`cdc-delivery-outcome.js:344`). It is out of C2 scope and is proposed as a follow-up Quest (Q1).

---

## 6. Open owner questions

1. **Scope of the fix.** Should C2 be D1 (preserve plus a state-claim contradiction), or must it also open
   A4 (separating the transport and application namespaces)? D1 leaves load-bearing conflation in place:
   an application `deferRetry`/`retryAfterMs` in an acknowledged reply still becomes a transport DEFERRED,
   which the rebalancer relies on at `operation-workflow-dispatch-response-reconcile.js:794-825` and the
   CDC provisional grammar relies on at `cdc-delivery-outcome.js:342-345`.
2. **FAILED dominance.** Do you approve that an explicit `deliveryState:'failed'` claim (and any
   unsupported claim) now beats deferral evidence? This is required for idempotence. Today the same input
   gives DEFERRED.
3. **`classifyTransportDeliveryOutcome`.** It pre-coerces at `:323-344`. Should its fix be inside C2
   scope (the same owner file and the same class), or recorded as a separate R17 finding?
4. **Second normalization.** Keep `delivery-behaviors.js:382` (relying on idempotence), or delete it
   (A3)?
5. **Coupled pairs.** Should the four `classify` consumer pairs list `transport-semantic-outcome.js` as an
   endpoint owner (section 5.5)?
6. **Flag readers.** Migrate the section 3.1 C consumers (especially `raft-rs-peer-delivery.js:74-84`) in
   this change, or record them as debt? Under D1 they observe raw flags where they observed coerced ones.
7. **`reasonCode`.** Preserve it raw (recommended), or treat an own `reasonCode` that differs from the
   transport-computed one as a contradiction? Which router-delivered replies carry application
   `reasonCode`s is **unknown**; it is not traced per handler.
8. **Lowercase transport codes.** Is uppercasing still needed for any producer outside `src/`, such as an
   older peer version during a rolling upgrade? This is **unknown**. The rs-raft closeout rulings declare
   upgrade unsupported, but they do not establish that.
9. **Siblings.** Which of the section 3.4 siblings go in C2 and which become separate findings?
   Particularly:
   - The unnormalized retirement exit (`delivery-behaviors.js:192-201`).
   - The handler override of `messageId`/`correlationId`/`acknowledged` (`:69-75,452-458`).
   - Thrown-error field loss.
   - The stale `OUTBOUND_QUEUE_BACKPRESSURED` copy.
   - `normalizeRetryAfterMs` returning 0.

Unknowns stated as unknown:

- Per-site router reachability of the section 3.1 B local-predicate consumers.
- Whether `lifecycle-controller` readiness snapshots are returned through the router.
- Whether any test asserts a rewrite of a non-canonical handler field.
- The exact wording of KIP-467.
