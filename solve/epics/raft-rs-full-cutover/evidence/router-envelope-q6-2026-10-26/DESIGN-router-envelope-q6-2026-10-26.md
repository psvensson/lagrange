---
audience: development
documentClass: evidence
---

# DESIGN: Q6 router delivery envelope `{transport, answer}` (2026-10-26)

Read-only design. Nothing was edited or committed in any repository. All reads were made in a
detached scratch worktree at the lineage head `a51f49929` of
`mg-delivery-resume-r2-20261023` (C2/C3 composed: `7bf6ceecb`, merged `50a1b1488`). All file:line
references are at `a51f49929`. Lines may have moved since the C2 verifier's snapshot `f34899bdd`
(for example the topology failed-set consumer the verifier cited as
`cdc-group-propagation-delivery-methods.js:744` now lives in
`cdc/cdc-propagation-progress.js:124-139`).

Authority: owner review 2026-10-26 decision 6 (`OWNER-REVIEW-2026-10-26.md:53-56`, "Q6 approved as a
separate bounded interaction change ({transport, answer} envelope, one shape, producers and
consumers migrated together)"), execution order item 8 (`:61-63`, Q6 after the safety-critical
recovery work, alongside API removal and fixtures). Problem statement: quest log entry 100 (lead
ruling: "the router hands consumers one flat merge of transport envelope and handler answer ...
systemic fix is a namespaced envelope {transport, answer} built only by the owner at the router
boundary"), entry 75 (C8: a handler reply overrides the router's `acknowledged: true` by spread
order), entry 113 (two query enums remain "because the flat envelope cannot name 'acknowledged
answer with its own deferral' - Q6"), entry 119 (the direct-wakeup witness has no contract, the
replica-dispatch pair is deferred to Q6), verifier F4/F7/F8.

## 0. Summary

- **Today.** `deliver()` returns one object made of the router's facts plus the handler's reply,
  spread together with the reply last (`message-router-delivery-behaviors.js:69-75`, `:452-460`).
  The owner builder then spreads everything again (`transport-semantic-outcome.js:216`) and decides
  `deliveryState` from fields the handler may have written (`deferRetry`, `retryAfterMs`,
  `errorCode`, `noHandler`, `deliveryState`, `status: 'completed'` + `error`; `:115-124`, `:186`).
  Every consumer then reads both meanings off that one object, usually after classifying it again.
- **Proposal.** `deliver()` resolves to one frozen, owner-branded envelope
  `{transport, answer}`. `transport` is the owner builder's frozen outcome computed only from
  router-internal facts, over a closed key set. `answer` is the handler's return value exactly as
  returned, or `null`. Consumers reach the two halves only through two owner accessors
  (`deliveryTransportOf`, `deliveryAnswerOf`). Those accessors fail closed: anything that is not an
  owner-built envelope reads as transport FAILED with answer `null`. Handler answers stop using
  transport field names. Forwarders return the onward hop's *answer*, never its transport outcome.
  The envelope never crosses the wire. Each router computes its own transport outcome from the
  frames it received.
- **Size.** About 60 src files and about 115 test files (about 103 of them are router doubles,
  from a grep estimate). The smallest reviewable route is four stages: red witnesses; transport-internal
  producer repairs (flat shape kept); a family-by-family, behaviour-preserving migration of
  consumers to the two accessors; then one atomic cutover commit of about 40 files, made by one writer.
- **Five owner decisions are needed** (section 7). Two are behaviour changes this design surfaced
  in today's code:
  1. A lost answer after ACK (the connection closes before SERVICE_RESPONSE), and a remote
     handler throw, are both reported DELIVERED today.
  2. A handler answer of `acknowledged: false` is turned into a transport FAILED today, so the
     transport retry owners retry domain refusals.

## 1. The envelope

### 1.1 Shape

```
DeliveryEnvelope = Object.freeze({        // built only by the transport owner, branded (WeakSet)
  transport: TransportDeliveryOutcome,    // frozen, closed key set, owner builder output
  answer: <handler return value> | null,  // verbatim; null when no answer exists
})

TransportDeliveryOutcome = Object.freeze({
  messageId, correlationId,               // router identity of THIS delivery
  deliveryState,                          // DELIVERED | DEFERRED | FAILED (computed, never supplied)
  reasonCode,                             // owner vocabulary only
  error,                                  // router text, or the handler's thrown text (see 1.4)
  errorCode,                              // router codes only (transport-error-codes.js)
  deferRetry, retryAfterMs,               // TRANSPORT deferral only
  noHandler,                              // router fact (frame level, see 5)
  queueWaitMs,                            // today returned beside result; folds in here
  shutdown?, direct?, coalesced?, recoverableBeforeSend?  // router facts with a named reader, else deleted
})
```

The rules:

- **Closed transport key set.** The builder constructs only the named fields. It no longer copies
  its whole input as `{...options, ...}` (`transport-semantic-outcome.js:216`). That spread is the
  mechanism of the flat merge. Every input to the builder is now router-internal, so the D1
  raw-preservation rule (`:217-221`) is still correct and becomes moot for answers. The decision
  logic (`:113-136`) is unchanged, and so are the contradiction rule and "FAILED beats deferral",
  which keeps the approved C2 semantics intact.
- **`completedWithError` leaves transport** (`:186-187`, `:122`, `:169-170`). `status` is an answer
  field. Its value `'completed'` is `ReplicaOperationResponseStatus.COMPLETED`
  (`rebalancer/replica-operation-constants.js:99`), so today a replica-operation *answer*
  `{status:'completed', error}` is turned into transport FAILED. The rule moves to the
  answer owner as a replica-operation answer predicate, read by the consumers that today rely on
  `isDelivered(...) && status === COMPLETED`:
  - `operation-workflow-terminal-transition-repair.js:95-96`
  - `operation-workflow-message-group-native-read.js:37`
  - `committed-membership-bootstrap-read.js:106`
  - `operation-workflow-replace-handoff-attempt.js:99`

  `TRANSPORT_COMPLETED_STATUS` (`:16`, `:257`) is deleted. Its one other importer is the CDC
  `SUCCESS_STATUSES` (`cdc-delivery-outcome.js:72`), which must name the replica/CDC status itself.
- **Answer verbatim.** `normalizeServiceResponseResult` (`message-router-pending-response-ledger.js:502-517`)
  is deleted. It strips the handler's `type` and renames it to `responseType` only so that the flat
  merge does not collide with the frame's `type`. Its readers are the CDC field list
  `cdc-delivery-outcome.js:129` (`responseType`) and the legacy
  `websocket-transport-messages.js:41`. The CDC field list names `type` instead.
- **Branding.** The envelope is registered in a module-private `WeakSet`, the same pattern as
  `message-router-delivery-lifetime.js:8` (`lifetimes` WeakMap). Three consequences:
  - A handler cannot forge an envelope inside its answer.
  - A JSON-cloned envelope is not an envelope.
  - A test double that returns a bare object reads as FAILED. This is honest, and it matches the
    C2 verifier's F5 class ("a double that means dropped answering null is honest FAILED").
- **Idempotence.** Building an envelope from an owner envelope returns that same envelope. The
  query data plane needs this, because the outer router passes the inner router's envelope
  through (section 3, row Q3). `buildTransportDeliveryOutcome(build(x)) = build(x)` remains the
  builder property.

### 1.2 Accessors (the one read path)

```
deliveryTransportOf(delivery) -> TransportDeliveryOutcome   // FAILED/ack_rejected for a non-envelope
deliveryAnswerOf(delivery)    -> answer | null              // null for a non-envelope
classifyThrownDeliveryError(error) -> TransportDeliveryOutcome   // today's thrownErrorOutcome path, Error only
```

`classifyTransportDeliveryOutcome(value)` (`transport-semantic-outcome.js:241-246`) loses its
plain-object branch. Classifying a flat object stops being meaningful, and keeping that branch
would be a second read path, which the no-legacy rule forbids. Its 38 call sites in src (census, section 3)
move to one of the three functions above. The predicates `isDeliveredTransportDeliveryOutcome`
and `isDeferredTransportDeliveryOutcome` (`:248-254`) stay and take a transport outcome.

### 1.3 Where `acknowledged` lives

`acknowledged` stays as:

- a frame field of the router's own ACK protocol: the ACK frame at
  `message-router-inbound-dispatch.js:435-439` and `handleAcknowledgment` at
  `message-router-pending-response-ledger.js:524-560`;
- the builder's *input* from router-internal producers;
- the internal ACK-phase read in `deliverRemote`/`completeRemoteDelivery`
  (`message-router-delivery-behaviors.js:398`, `:432`).

**Recommendation (decision D4):** `acknowledged` is not a member of the public `transport`
outcome. After the split, nothing an answer says can make a delivery that was acknowledged anything
other than DELIVERED, except the ACK-then-lost case that §1.4 turns into DEFERRED/FAILED. So
`transport.acknowledged` would just repeat `deliveryState === DELIVERED`, and the one-version rule
says keep one fact. These sites that read it move to `deliveryState`:

- the metric `message-router-delivery-behaviors.js:101`, `:124-126`
- the write-metrics log `partition-service-write-metrics-base.js:488`
- the MG forwarder log `message-group-forwarding-owner-delivery-methods.js:676`

The alternative is to keep it as a derived, read-only field, never taken from an answer. That costs
one extra field and one equality to prove. I found no consumer that needs "acked but not
delivered" as a separate fact once §1.4 lands (unknown U6).

### 1.4 What `deliver()` returns on each path

| Path | Today (file:line) | Envelope |
| --- | --- | --- |
| LOCAL, handler returns R | `{messageId, correlationId, acknowledged:true, ...normalizeServiceResponseResult(R)}`, `delivery-behaviors.js:69-75`. R can override `acknowledged`, `messageId`, `correlationId`, `errorCode`, `deferRetry`, `retryAfterMs`, `noHandler`, `deliveryState` (C8) | `transport = build({messageId, correlationId, acknowledged:true})` = DELIVERED; `answer = R` (non-object R → `null`) |
| LOCAL, handler throws E | `{acknowledged:false, error:E.message}`, `:78-87` → FAILED/ack_rejected | `transport = FAILED`, new reasonCode `handler_failed`, `error = E.message`; `answer = null` (D1) |
| SERVICE_RESPONSE, frame `result: R` | `{acknowledged:true, ...normalizeServiceResponseResult(R)}`, `:452-460` (same override hazard) | `transport = DELIVERED`, `answer = R` |
| SERVICE_RESPONSE, frame `error: text` (remote handler threw, `inbound-dispatch.js:483-494`) | waiter rejects (`pending-response-ledger.js:367`), caught at `delivery-behaviors.js:461-470` → `{acknowledged:true, error}` → **DELIVERED** (asymmetric with LOCAL) | same as LOCAL throw: FAILED/`handler_failed`, `answer = null` (D1) |
| ACK received, then the connection closes before SERVICE_RESPONSE (`connection-close-reconnect.js:129-134` → `failPendingResponsesForNode` → same catch `:461-470`) | `{acknowledged:true, error:'Connection closed to node X'}`, **code dropped** → **DELIVERED with no answer** (finding F-A, pre-existing) | the catch converts through `classifyThrownDeliveryError` so the code survives: DEFERRED/`connection_closed` (code `ROUTER_CONNECTION_CLOSED`, a deferred code at `transport-semantic-outcome.js:81-86`); `answer = null`; `recoverableBeforeSend` absent, so the "answer may be lost" readers (`managed-source-replication-start-delivery.js:16-25`, query `unknownOutcome.observeLostAnswer` `query-executor-partition-delivery.js:675-678`) keep their meaning |
| No handler on the target (`inbound-dispatch.js:441-458`) | the router writes `result: {noHandler:true, error}` into the **answer slot** of the frame, which merges into a flat `noHandler` → FAILED/no_handler | frame-level `noHandler: true` + `error` (wire change, §5); `transport = FAILED/no_handler`; `answer = null` |
| ACK rejected (`completeRemoteDelivery` `:432-437`) | ACK result, FAILED | `transport` from the ACK result; `answer = null` |
| Inline/legacy ACK carrying a handler payload (`:439-444`, `pending-response-ledger.js:484-495`, `INLINE_ACK_PASSTHROUGH_KEYS`) | ACK + payload flat | **removed** by the API-removal unit (decision 5; the WebSocketTransport family is the only peer that sends it, C2 verifier limit L2). Q6 stage 3 requires it gone, or deletes the branch itself; it gets no envelope form |
| Raft direct send (`tryDeliverRaftDirect` `:244-248`) | `{messageId, acknowledged:true, direct:true}` → DELIVERED | `transport = DELIVERED` (`direct: true`), `answer = null`. **DELIVERED with a null answer is legitimate** (an ACK-only delivery) |
| Superseded pending (`outbound-queue-admission.js:176-186`) | `{acknowledged:true, coalesced:true, replacedPending:true}` → DELIVERED with no answer | `transport = DELIVERED`, new reasonCode `superseded`, `coalesced: true`; `answer = null` (D3) |
| Deferred router failures (`buildDeferredDeliveryFailure` `reconnect-behaviors.js:707-729`; callers `delivery-behaviors.js:350-358`, `:408-421`, `:523-551`; `reconnect-behaviors.js:87-108`, `:333`, `:534`) | flat `{acknowledged:false, deferRetry:true, retryAfterMs, errorCode?}` | `transport = DEFERRED` (unchanged decision); `answer = null` |
| Lifetime timeout/shutdown (`withDeliveryLifetime` `onRetired`, `delivery-behaviors.js:192-201`; `delivery-lifetime.js:228-233`) | **not built by the owner**: raw `{acknowledged:false, error, shutdown:true}` or raw `buildDeferredDeliveryFailure(...)` (MESSAGE_TIMEOUT) | built by the owner: DEFERRED/`message_timeout` or FAILED + `shutdown: true`; `answer = null` |
| Outbound queue graceful shutdown (`outbound-delivery-registry.js:637-648`) | `{acknowledged:false, error, shutdown:true}` → normalized at `:382` | unchanged decision, closed key set |
| Query data plane (`pressure-routing.js:303-337`) | MG record or Error re-merged and re-classified | §3 row Q3: the inner envelope passes through unchanged (idempotence); a not-ready selection is built by the owner (`:115-130` today raw) |
| Thrown router error (invalid address `:168-170`; non-recoverable send error rethrown `:422`; recovery error `:394-397`; caller-signal abort; `DUPLICATE_PENDING_RESPONSE` `pending-response-ledger.js:339-343`) | rejects | **unchanged: rejects** (bounded change). Consumers classify through `classifyThrownDeliveryError`. There is no envelope, because there is no answer by definition. Making `deliver()` total is out of scope (it would touch every try/catch twice) |

`error` on the answer and `error`/`errorCode` on transport are separate by construction:
`answer.error` is whatever the handler returned, and the router never reads it.
`transport.error` is router text, or the handler's *thrown* text under D1. `transport.errorCode`
only ever holds a value from `transport-error-codes.js` or a code carried by a thrown router Error
(`thrownErrorOutcome`, `transport-semantic-outcome.js:230-239`). A handler that wants a domain
code uses its own field name (`failureCode` is already the partition convention,
`query-executor-partition-delivery.js:594`).

## 2. Producer census

### 2.1 Transport producers (the object the router returns)

| # | Site | Builds | Change |
| --- | --- | --- | --- |
| P1 | `transport/message-router-delivery-behaviors.js:69-75` | LOCAL success flat merge | envelope (DELIVERED, answer R) |
| P2 | `:78-87` | LOCAL throw | FAILED/handler_failed (D1) |
| P3 | `:184-191` `normalizeDeliveryOutcome(deliveryOutcome).result` | the value `deliver()` returns | returns the envelope; folds `queueWaitMs` into `transport` |
| P4 | `:192-201` onRetired | raw timeout/shutdown | owner-built |
| P5 | `:244-248` `tryDeliverRaftDirect` | direct ACK | DELIVERED, answer null |
| P6 | `:282-285`, `:317-319`, `:350-358`, `:401-421` | deferred failures, reconnect | unchanged decisions |
| P7 | `:432-437`, `:439-444`, `:452-460`, `:461-470` `completeRemoteDelivery` | ACK-rejected, inline, SR merge, SR catch | §1.4 rows; `:461-470` through `classifyThrownDeliveryError` (F-A) |
| P8 | `:474-554` `resolveRecoverableDeliveryError` | deferred failures / reconnect retry | unchanged |
| P9 | `transport/message-router-outbound-queue-admission.js:140-164` `normalizeDeliveryOutcome` | the `buildTransportDeliveryOutcome` call site (both branches) | becomes the envelope builder's entry point (idempotent on an envelope) |
| P10 | `outbound-queue-admission.js:176-186` `buildSupersededPendingResult` | superseded → DELIVERED | reasonCode `superseded` (D3) |
| P11 | `transport/message-router-pending-response-ledger.js:502-517` `normalizeServiceResponseResult` | answer reshaping | **deleted** |
| P12 | `pending-response-ledger.js:484-495` `hasInlineAckPayload`, `:524-560` `handleAcknowledgment` (`...rest` passthrough `:547-551`) | inline ACK payload | rest-passthrough deleted with the API-removal unit; ACK carries only `messageId/acknowledged/error` |
| P13 | `pending-response-ledger.js:364-381` `acceptResponse({result, error})` | waiter settlement | gains frame-level `noHandler`; `error` rejects as a handler failure (D1) |
| P14 | `transport/message-router-reconnect-behaviors.js:87-108`, `:318-340`, `:515-545`, `:707-729` | deferred failure builders | closed key set |
| P15 | `transport/message-router-outbound-delivery-registry.js:637-648` | graceful shutdown | closed key set |
| P16 | `transport/message-router-delivery-pressure-routing.js:115-130` `buildDeferredQueryTransportOutcome` | raw flat not-ready | owner-built |
| P17 | `pressure-routing.js:135-152`, `:154-180`, `:182-227`, `:257-301` | the query delivery-state machinery | §3 row Q3; `QUERY_TRANSPORT_DELIVERY_STATE` deleted |
| P18 | `transport/message-router-inbound-dispatch.js:449-457` | `result:{noHandler, error}` (a router fact in the answer slot) | frame-level `noHandler` (§5) |
| P19 | `transport/transport-semantic-outcome.js:178-223` builder; `:230-246` classify | the owner | closed key set; plain-object classify removed; `completedWithError` out; envelope builder and accessors added |
| P20 | `transport/message-router-shared-vocabulary.js:227-241` | second enum + table | deleted; re-export `message-router-connection-authority.js:591` deleted |
| P21 | `transport/router-message-handler.js:277-330` | a second implementation of the inbound protocol, including its own `result:{...}` no-handler reply | **imported only by tests** (`message-router-late-response-classification.test.js`, `service-response-correlation.property.test.js`, `immediate-ack-ordering.property.test.js`): a no-legacy deletion finding (F-E); delete with the API-removal unit or in Q6 stage 3. Do not migrate it |
| P22 | legacy `websocket-transport.js:447-455`, `:600`; `websocket-transport-provider.js:374-385`; `websocket-transport-messages.js:41` | inline-ACK family | API-removal unit (decision 5) |

### 2.2 Non-transport code that fabricates a transport outcome (must stop)

| Site | What | Change |
| --- | --- | --- |
| `partition/partition-service-merge-replication-methods.js:219-222` | `Promise.resolve({acknowledged:false, error: NO_LEADER})` returned where a delivery result is expected | an answer-level refusal of the forwarding handler (`{success:false, error, deferRetry?}`) |
| `partition/partition-service-source-replication-start-methods.js:122` (`rejected(...)` `{acknowledged:false, error}`), used at `:75` | same | same |
| `topology/cdc-group-propagation-durable-delivery.js:69-72` | `unknownCdcAcceptance()` returned from `deliverTarget` and observed as if it were a delivery (`:99-100`) | `deliverTarget` returns `null` for "not sent". `observe` treats `null` as uncovered, so coverage is unchanged and the wave still retries |
| `message-group/message-group-service-outbound-dispatch-runtime-methods.js:236-241`, `:244-253`, `:371-381`, `:131-141` | MG re-spreads the router result into its own record (`{delivered:true, attempt, ...result}`, `{messageId, status, deliveryType, ...transportResult}`) | MG's record carries `delivery: <envelope>` and never spreads it |
| test doubles: `test/raft/raft-rs-backend/partition-node-cluster.js:46,178,522` (`DELIVERED_TO_PEER`), `participation-gate.test.js:107`, `evidence-o1-model.js:116`, `conf-change-pending-deferral.test.js:88`, `test/rebalancer/replace-real-group-harness.js:267`; about 103 test files stub `deliver`/`sendToPeer` and return flat `acknowledged` objects (grep estimate, U4: rebalancer 39, query 16, bootstrap 10, partition 7, convergence 7, message-group 6, raft 4, others 14) | flat outcomes | one owner test helper, `buildDeliveryEnvelope({answer})` / `{transport: {...}}`, exported from the owner (a doubles' copy of the builder would be R17). These doubles migrate *with their consumer family* in stage 3a. The broader doubles quest (decision 6, "its own Quest") keeps the non-router doubles |

### 2.3 Answer producers that use transport field names (handler side)

The owner rule is "application fields cannot rewrite transport delivery facts". The envelope
enforces that structurally, but these answers would then carry dead or misleading names. Each one
needs a per-producer decision on its domain refusal field. The registration census (the 12
`register(...)` sites outside transport): `membership-swim-runtime.js:67,70`,
`partition-service-raft-init-base.js:393`, `runtime-service-handler.js:688`,
`replica-handler-runtime-methods.js:584`, `message-group-service-handler.js:633`,
`replica-dispatch-service-lifecycle.js:310`, `wasm-service-replica-lifecycle.js:135`,
`bootstrap/shared/message-group-transport-handler.js:35`. Per-message-type answers below them are
not exhaustively traced (U1).

| Answer producer | Field(s) | Today's effect via the flat merge | Envelope |
| --- | --- | --- | --- |
| `control-plane/replica-dispatch-service-lifecycle.js:301-308` | `acknowledged:false` (unsupported) / `acknowledged:true` | the refusal becomes transport FAILED → direct-wakeup defers | drop `acknowledged`; refusal → `{success:false, error}`; direct-wakeup reads the answer (§3 C2) |
| `message-group/message-group-service-inbound-ingress-runtime-methods.js:23-35` | `acknowledged:false` meaning "MG application ack still pending" (`acknowledgeMessage` `:255-299`) | **an ordinary application message is reported transport FAILED** unless a completion handler overrides it (finding F-B; whether it is live is unknown, U2) | rename to MG's own field (e.g. `applicationAcknowledged`), status RECEIVED |
| `message-group/message-group-service-inbound-ingress-runtime-methods.js:125,157` | `acknowledged:true` | redundant | drop |
| `message-group/message-group-service-runtime-support.js:352-357` `buildLatencyCdcPropagationResult` (`{acknowledged:true, ...result}`) and its 10 call sites in `message-group-service-cdc-propagation-runtime-methods.js:23-286` | `acknowledged`, plus `...answer` that embeds the onward hop's **flat transport outcome** (`:142-155` from `forwardDurableCdcPayload` → `message-group-forwarding-owner-native-delivery-methods.js:281`, `result.answer`) | hop2 transport facts become hop1 transport facts on the source router (the forwarding-hop witness property) | wrapper deleted; the forwarder returns hop2's *answer* (§4/§5) |
| `node/message-group-service-handler.js:629`, `node/runtime-service-handler.js:685`, `node/replica-handler-runtime-methods.js:580`, `node/replica-handler-lifecycle-methods.js:155` | `{acknowledged:true, ...response}` | `response.acknowledged` overrides | drop the wrapper `acknowledged` |
| `partition/partition-service-entry-apply-base.js:295,303,328,335,408,431,448,454,460,528,533`; `partition/message-handler-registry.js:73`; `partition/partition-service-remote-query-methods.js:53,57,88,109,182,230,242,258`; `partition/partition-coordinator-settlement.js:26,31,54,58`; `partition/partition-participant-transaction-request.js:629,664,667,671`; `partition/partition-service-learner-promotion-proof-methods.js:74`; `partition/partition-service-source-replication-start-methods.js:262,357`; `wasm-service/wasm-service-replica.js:367`; `service/service-consensus-creation-intent.js:105,111`; `control-plane/membership-swim-prober.js:59,77,80`; `admin/admin-websocket-api-base.js:646` | `acknowledged:true/false` | `false` → transport FAILED → transport retry owners retry a domain refusal | drop `acknowledged`; `false` → the existing domain refusal (`success:false`, `failureCode`) |
| answers carrying `deferRetry`/`retryAfterMs` (application deferral): `partition-service-raft-write-commit.js:92,128`, `partition-participant-transaction-pause.js:288`, `partition-participant-transaction-apply.js:312,645`, `cdc-delivery-outcome.js:254,333`, `message-group-service-cdc-propagation-runtime-methods.js:100,239`, the CDC provisional outcome builders | answer-level deferral | merged into the transport decision (DEFERRED with `acknowledged:true`): the source of the query SUCCESS enum and of CDC's TRANSPORT_DEFERRED match | **keep**: these are legitimate answer fields; transport no longer sees them |
| answers carrying their own `reasonCode` (for example `control-plane/membership-publication-acknowledgement.js:42,77`, the publication handoff contracts) | `reasonCode` | today preserved raw *as the transport reasonCode* (C2 F4) | lives in the answer; `transport.reasonCode` is owner-only |
| answers with `status:'completed'` + `error` (replica operations) | `status`, `error` | transport FAILED/completed_with_error | the answer owner's predicate (§1.1) |
| answers with `messageId`/`correlationId` (`message-group-service-inbound-ingress-runtime-methods.js:24,32`, the MG record, rpc responses) | identity | override the router's own `messageId`/`correlationId` (`delivery-behaviors.js:71-72`) | answer identity in `answer`, router identity in `transport` |

## 3. Consumer census

Notation: `T = deliveryTransportOf(d)`, `A = deliveryAnswerOf(d)`, `isD = isDeliveredTransportDeliveryOutcome`,
`isDf = isDeferredTransportDeliveryOutcome`, `thrown(e) = classifyThrownDeliveryError(e)`.
The general rule is: decide on `T` first. When `T` is not DELIVERED, use only `T`, because there is
no answer. When `T` is DELIVERED, use only `A`. Nothing merges the two back together.

### 3.1 The ambiguous cases named in the brief

| # | Consumer (file:line) | Today | Needs | Exact new read |
| --- | --- | --- | --- | --- |
| Q1 | MG outbound "the target answered" `message-group-service-outbound-dispatch-runtime-methods.js:225-258` | `result.acknowledged` (`:235`), which an answer may override; then `{delivered:true, attempt, ...result}`; the deferred branch reads `result.error/retryAfterMs/errorCode` (`:243-253`) without knowing whose they are | transport only. MG does not interpret the answer; domain completion belongs to MG's caller | `const t = T(result); if (isD(t)) return {delivered:true, attempt, delivery: result}; if (isDf(t)) return {delivered:false, attempt, error: t.error ?? DEFERRED, deferRetry:true, retryAfterMs: t.retryAfterMs, errorCode: t.errorCode}; lastError = new Error(t.error ?? NOT_ACKNOWLEDGED)`. `deliverDirectOnlyMessage` `:363-381` and `sendMessage` `:120-141` return `{messageId, status: DELIVERED, deliveryType, delivery}` with no spread. `:364-365` reads `isDf` over MG's own record (`deliveryResult.deferRetry`), so the MG record carries the transport deferral explicitly and is not re-classified. A target answering with its own deferral stays `delivered:true`, as today. A target answering `acknowledged:false` (§2.3) becomes `delivered:true` (D2) |
| Q2 | participant wire `query/sql-query-engine-participant-wire.js:144-159`, used by `sql-query-engine.js:455-459` | `copyStrictOwnDataRecord(response)`; `answer.acknowledged !== true` (which the answer itself can set: `partition-participant-transaction-request.js:629-671`) `\|\| classify(answer).reasonCode === NO_HANDLER`. C2 F7: it would accept a contradictory FAILED outcome as the participant's answer if the body binds | transport DELIVERED + the participant answer | `if (!isD(T(response))) return null; const answer = copyStrictOwnDataRecord(A(response));` then the identity binding unchanged. NO_HANDLER is a FAILED transport and is already excluded by `isD`, so the `reasonCode` check is deleted (this closes F4 for this site). `dispositionOf` (`:171+`) reads `answer.deferRetry`, which is now unambiguously the participant's |
| Q3 | `resolveQueryTransportDeliveryState` `transport/message-router-delivery-pressure-routing.js:182-187`, second enum `message-router-shared-vocabulary.js:227-241`, witness `message-router-query-transport-failure-shape.test.js:69-96` | `outcome.acknowledged ? SUCCESS : BY_OUTCOME_STATE[deliveryState]`. SUCCESS exists only to say "acknowledged, but the deferral is the application's" (comment `:227-230`; test case `:76-78` `{acknowledged:true, success:false, deferRetry:true}` → SUCCESS) | transport state only | The query transport resolves either to MG's record (`{..., delivery: envelope}`; direct-only resolves only when DELIVERED, `:363-368`) or rejects. `resolveQueryTransportDeliveryOutcome` (`:257-294`) becomes: resolve → `return record.delivery` (the inner envelope, passed through unchanged by idempotence). Reject → `const t = thrown(error)`, switch on `t.deliveryState`: DEFERRED → owner-built deferred envelope (today `:198-204`); FAILED → `resolveRecoverableDeliveryError` / rethrow (`:205-226`); DELIVERED cannot occur for a thrown error. **No second enum**: `QUERY_TRANSPORT_DELIVERY_STATE` and `_BY_OUTCOME_STATE` are deleted, and `TRANSPORT_DELIVERY_OUTCOME_STATE` is the one vocabulary. The SUCCESS-with-own-deferral case is `T = DELIVERED` with `A.deferRetry === true`, handed to the query executor as is |
| Q4 | query executor `query/query-executor-partition-delivery.js:390-668` | raw `response.redirect/leaderAddress` (`:423-424`), `response.error` (`:550,564,587,495`), `response?.errorCode/failureCode/retryAfterMs/deferRetry` (`:593-596`, `:661-663`) read off the merged object, so a router no-connection deferral and a partition `{success:false, deferRetry:true}` (`partition-service-raft-write-commit.js:92`) look the same; `classify(response).reasonCode === NO_HANDLER` (`:561`) | both, by branch | at each response: `const t = T(response)`. `t` not DELIVERED → the *transport* failure branch: `errorCode = t.errorCode`, `retryAfterMs = t.retryAfterMs`, `deferRetry = t.deferRetry`; NO_HANDLER = `t.reasonCode === NO_HANDLER`, now owner-computed only, which closes F4 here; `unknownOutcome.observeLostAnswer` when `t.reasonCode` is `connection_closed`/`message_timeout` after submission. `t` DELIVERED → the *answer* branch: `const a = A(response)`, with `a.redirect`, `a.leaderAddress`, `a.error`, `a.errorCode` (the partition's own `failureCode` convention), `a.retryAfterMs`, `a.deferRetry`, `pickTypedWriteAnswer(a)`, `resolveParticipantBackpressureState(a)`, `unknownOutcome.observeAnswer(a)`. `resolveControlPlaneWriteRetryDecision` (`:588-599`, `:514-519`) receives exactly one of the two objects, never a merge. `isSuccessfulResponse` default `query-executor-partition-request-builders.js:136-141` → `isD(T(r)) && A(r)?.success === true`; `buildSuccessResult` `:142-150` reads `A(r).rows/changes`. `query-executor-partition-failure.js:31-42,78,85` take `thrown(e)` for thrown failures and `T(d)` for deliveries (the `failure` parameter is split into two typed inputs) |
| Q5 | direct wakeup `control-plane/replica-dispatch-direct-wakeup.js:118-163` | `classify(deliver(...))`; DELIVERED → verification, else `deferOperationDispatchRetry(operationId, outcome)`. The dispatch handler's `{acknowledged:false, error}` refusal (`replica-dispatch-service-lifecycle.js:301-305`) lands on the transport branch | transport for "woken", answer for refusal | `const t = T(d); if (!isD(t)) defer(t)`; `else if (A(d)?.success === false) defer({message: A(d).error, retryAfterMs: A(d).retryAfterMs})`, the dispatch owner's own refusal; else verification. `catch (e) → defer(thrown(e))`. The R4 ruling (default hint is DEFERRED-only advice) is unchanged |

### 3.2 Every other consumer (file:line, namespace, new read)

Control plane / raft / service

| Consumer | Needs | New read |
| --- | --- | --- |
| `raft/raft-rs-peer-delivery.js:82-94` (`settlePeerDelivery`); producers `partition-service-raft-init-base.js:457-465`, `wasm-service/wasm-service-consensus-port.js:169-174`, `message-group/message-group-consensus-port.js:112-120`; port `raft-rs-runtime-owner.js:1915`, `raft-rs-operation-port.js:238` | transport only | `const t = T(delivery); if (!isD(t)) peerDeliveryFailed(..., t.reasonCode === NO_HANDLER ? SEND_NO_HANDLER : SEND, t.error ?? t.reasonCode)`. The raft step handlers' `{acknowledged:true}` answers (`partition-service-entry-apply-base.js:303`, `message-group-service-inbound-ingress-runtime-methods.js:125`) are no longer read, so they are dropped |
| `control-plane/membership-swim-prober.js:103-124`, `:132-147` | both | `isD(T(r)) && A(r)?.alive === true` → `A(r).incarnation/updates`; `isD(T(r)) && typeof A(r)?.reachable === 'boolean'` |
| `service/service-dispatcher.js:343-365` (+ `createDeliveryFailure` `:114-126`) | both | `const t = T(d); if (!isD(t)) throw createDeliveryFailure(t)` (NO_HANDLER is in `t`); `requireProcessedResponse` reads `A(d)?.processed/handlerProcessed` |
| `service/cell-ingress-transport.js:240-250` (lazy router passthrough) | none (forwards the envelope) | unchanged; `:326` `result.delivery?.processed` is the cell's own record. Its producer must read `A(...)`: U3 for the exact producer line |
| `node/participant-release-client.js:99-107`, `:118-133` | both | `isD(T(r)) && A(r)?.[PARTICIPANT_RELEASE_RESULT_FIELD]`; MESSAGE_TIMEOUT from `T(r).reasonCode`; catch `thrown(e).reasonCode`. `response.noHandler !== true` is deleted (NO_HANDLER ⇒ not DELIVERED) |
| `control-plane/replica-dispatch-retry-scheduling.js:183-207` (`deferOperationDispatchRetry(errorLike)`, reads `message \|\| error`, `retryAfterMs`) | one input | it receives a transport outcome or the dispatch owner's refusal (Q5), never a merge |

Partition

| Consumer | Needs | New read |
| --- | --- | --- |
| `partition/partition-service-learner-promotion-proof-methods.js:207-226`, `:311-318` | both | `isD(T(r)) && A(r)?.partitionId === ... && A(r)?.learnerReplicaId === ... && A(r)?.proof`. Keeps the RC-r2-1 pin (FAILED/contradictory never authorizes) |
| `partition/partition-service-metadata-delivery-methods.js:533-565` (+ `extractAckFromResponse` `:484-493`) | both | `!isD(T(r))` → `T(r).error`; `extractAckFromResponse(A(r), requestId)`. Its `result.result` "nested ACK unsupported" guard (`:489-491`) reads the answer namespace and must be re-judged (an answer may legitimately have a `result` field) |
| `partition/partition-service-write-metrics-base.js:465-503` | both + log | log `deliveryState: T(r).deliveryState`, `error: isD(T(r)) ? null : T(r).error`; delete `acknowledged: result?.acknowledged` (`:488`). The method returns `result` to `proposeWrite` callers and `_attachCdcConfirmation(result, ...)` (`:502`). **The forwarded write's answer must be returned as `A(r)` with a transport-failure refusal when not delivered** (a forwarding hop, §4); the downstream readers are U3 |
| `partition/managed-source-replication-start-delivery.js:16-25`, `:45-56`, `:58-70` | both | `requireProcessed…`: `const t = T(r); if (isD(t) && A(r)?.success !== false) return A(r)`; else `error.retryable = t.noHandler \|\| t.deferRetry \|\| A(r)?.retryable === true` (only when delivered), `error.deliveryOutcome = t`. `deliveryAnswerMayBeLost` reads `error.deliveryOutcome ?? thrown(error)`, unchanged |
| `partition/partition-service-merge-replication-methods.js:208-223`, `partition/partition-service-source-replication-start-methods.js:63-76` | forwarding hop | a handler returning the leader's delivery as its own answer: return `isD(T(r)) ? A(r) : {success:false, error: T(r).error, deferRetry: T(r).deferRetry, retryAfterMs: T(r).retryAfterMs}` (§4) |
| `partition/managed-merge-topology-adapter.js:222-229`, `partition/managed-split-topology-adapter.js:198-207` → `partition/group-retirement-members.js:419-432` (`answer?.status`) | answer | adapters return `isD(T(r)) ? A(r) : null`, or `group-retirement-members.js:421-423` reads `A(...)`; the refusal reason `refusalOf(nodeId, positive, answer)` gets the transport outcome when not delivered |

Message group / CDC / topology

| Consumer | Needs | New read |
| --- | --- | --- |
| `message-group/message-group-forwarding-owner-delivery-methods.js:623-723` | both | `const t = T(r); const a = isD(t) ? A(r) : null; deliveryAcked = isD(t); deliverySucceeded = a?.success !== false; deliveryErrorMessage = isD(t) ? a?.error : t.error`; log `deliveryState: t.deliveryState`, `noHandler: t.reasonCode === NO_HANDLER`; `resolveForwardFailureState(isD(t) ? a : t, {deferRetry: isDf(t) \|\| a?.deferRetry === true})` (the leader's own deferral stays the leader's); `code: t.errorCode` |
| `message-group/message-group-forwarding-owner.js:165-185` (`isRetryableForwardDeliveryFailure`) | transport | `isDf(T(r))`, or the backpressure/text checks on `T(r).error` |
| `message-group/message-group-forwarding-owner-native-delivery-methods.js:134-136`, `:186-198` (`successfulForward(answer=deliver(...))`), `:281-286` | both | `isCommittedCdcDelivery(envelope, ...)` and `isProvisionalCdcDelivery(envelope, ...)` are redefined over the envelope (next row); `:281` returns `A(result.answer)`, the onward CDC answer, never the envelope; `:286` `cause: A(...)` or `T(...)` |
| `cdc/cdc-delivery-outcome.js:336-347` (`isCommittedCdcDelivery`, `isProvisionalCdcDelivery`), field lists `:110-164` | both | `isCommittedCdcDelivery(d, ev, g) = isD(T(d)) && isCommittedCdcOutcome(A(d), ev, g)`; `isProvisionalCdcDelivery(d, ev, g) = isD(T(d)) && isProvisionalCdcOutcome(A(d), ev, g)`. Today the provisional match *requires* the merge artefact `acknowledged && reasonCode === TRANSPORT_DEFERRED` (`:342-345`); after the split, provisional is an answer with `success:false, deferRetry:true` over a DELIVERED transport. `COMMITTED_OUTCOME_FIELDS` and `PROVISIONAL_OUTCOME_FIELDS` drop `acknowledged`, `deliveryState`, `noHandler`, `reasonCode`, `errorCode` (`:139-146`, `:155-163`); `OUTCOME_METADATA_FIELDS` drops `messageId`/`correlationId` if they are router identity (`:113-114`), and `responseType` → `type` (`:129`). `deferRetry`/`retryAfterMs` stay (CDC answer deferral) |
| `cdc/cdc-propagation-progress.js:124-139` (`observe`, the topology failed-set decision), `topology/cdc-group-propagation-durable-delivery.js:64-87`, `:93-110` | both | the target branch `observeCdcCoverage(answer, ..., {transport:true})` becomes `observeCdcDeliveryCoverage(envelope, events, groupId)` = `isD(T(env)) ? observeCdcCoverage(A(env), ...) : empty`; the source branch (`applyCDCBatch`, local, no transport) keeps `observeCdcCoverage(answer)`; `answer?.success !== true` (`durable-delivery.js:~103`) → `A(env)?.success`; `unknownCdcAcceptance` sends → `null` (§2.2). The wave's retry ownership (`cdc-group-propagation-delivery-methods.js:24-44`) is unchanged: an uncovered leaf is retried |
| `partition/partition-cdc-obligation-progress.js:93` | answer (local) | unchanged (local answer) |
| `message-group/message-retry-handler.js:282-284` (`result.success`) | answer of whatever `deliveryFn` returns (`commandRetryHandler`, `message-group-service-state.js:262`) | if `deliveryFn` returns a router envelope: `isD(T(r)) && A(r)?.success`; U3 for the exact `deliveryFn` |
| `transport/rpc-client.js:156-168` (`result.correlationId === correlationId` on MG `sendMessage`) | answer identity | `deliveryAnswerOf(result.delivery)?.correlationId`. Today it relies on the answer's `correlationId` overriding the router's (`delivery-behaviors.js:71-72`) |
| `message-group/message-group-forwarding-owner.js:584`, `control-plane/replica-dispatch-readiness-capture.js:662` (`await sendMessage(...)`, result unused) | none | unchanged |

Rebalancer / bootstrap

| Consumer | Needs | New read |
| --- | --- | --- |
| `rebalancer/operation-workflow-dispatch-response-reconcile.js:404-415` (producer `deliverReplicaOperationRequest`), `:744-800+` (`response?.success/reason` `:789-790`, `resolveDispatchDeliveryErrorLike` `:253-270`) | both | `const t = T(r)`; not delivered → `errorLike = t` (a string `error`, so the nested-error spread `:257-268` no longer applies to transport); delivered → `A(r).success/reason/status`, and the nested-`error`-object spread applies only to `A(r)` (the "rebalancer's nested-error spread" follow-up of log entry 73 narrows to the answer) |
| `rebalancer/operation-workflow-terminal-transition-repair.js:87-96` | both | `isD(T(o)) && isCompletedReplicaOperationAnswer(A(o))` (§1.1) |
| `rebalancer/operation-workflow-message-group-native-read.js:29-38` | both | `if (!isCurrent() \|\| !isD(T(r))) return unavailable(); const a = A(r); if (!isCompletedReplicaOperationAnswer(a) \|\| a.nodeId !== recipient.nodeId) return invalid(); return a[FIELD.MEMBERSHIP]` (`result.noHandler === true` deleted) |
| `rebalancer/operation-workflow-owner-handoff-state.js:283-320` | both | `T(r).reasonCode === NO_HANDLER` → `handleDroppedNoHandlerWake`; `!isD(T(r))` → defer with `T(r)`; delivered → `A(r)` |
| `rebalancer/operation-workflow-replace-witness.js:114-148`, `:169-183` | both | `classifyReplaceWitnessResponse(d)`: `isD(T(d))` → `{outcome: DELIVERED, response: A(d)}`; `T(d).reasonCode === NO_HANDLER \|\| isDf(T(d))` → DEFERRED with `T(d).retryAfterMs`; else FAILED with `T(d).reasonCode \|\| T(d).error`; `classifyReplaceWitnessError(e)` uses `thrown(e)` |
| `rebalancer/committed-membership-bootstrap-read.js:85-114` | both | `!isD(T(r))` → unreadable with `T(r).retryAfterMs`; delivered → `isCompletedReplicaOperationAnswer(A(r)) && A(r)[MEMBERSHIP]`; catch `thrown(e)` |
| `rebalancer/priority-publication-handoff.js:253-265` → `operation-workflow-replace-handoff-attempt.js:95-105,137-150` | answer | `recordReplaceHandoffAnswer(this, id, isD(T(r)) ? A(r) : null, seq)`; `classifyReplaceHandoffAnswer` reads the answer only (it already does) |
| `rebalancer/user-table-leader-placement-cure.js:395-414`, `:427-445` (+ log `:370-377`) | answer | `buildHandoffResponseLogContext(rebalancer, A(r), ...)`; returns `A(r)` (downstream readers of the return value: U3) |
| `bootstrap/node-joining-backfill-merge-and-status.js:222-250` | both | redirect from `A(r).redirect/leaderAddress` only when `isD(T(r))`; `isD(T(r)) && A(r)?.success` → `A(r).rows` |
| `bootstrap/shared/node-state-publication-owner.js:482-505` (+ `node-state-publication-outcome.js:110-130`) | both | `!isD(T(r))` → `buildNodeStateUpdateDeliveryError(T(r))`, where NO_HANDLER is in `T`; `A(r)?.completionKind/completionCompleted` for durable completion |

Re-export hubs to edit (no logic): `bootstrap/node-joining-service-shared.js:59,416,433`,
`rebalancer/operation-workflow-owner-shared.js:35,634,642`,
`control-plane/replica-dispatch-service-shared.js:95,290,96,278`,
`transport/message-router-connection-authority.js:33,637,650,591`.

Not router consumers (checked): `wasm-service/wasm-writer-client.js:101` (injected `deliver`, not
constructed in src); `partition-service-entry-apply-base`/`message-group-service-inbound-ingress`
`receiveMessage` (handlers); the `source-replication-start-methods.js:262,267,357,362`,
`merge-replication-resumption-methods.js:105`, `split-mirror-queue-methods.js:191`,
`distributed-transaction-release-settlement.js:100`, `latency-measurement-service.js:221` and
`invariant-engine.js:437` readers that the C2 verifier F7 classified as local application fields.

Count: 38 `classifyTransportDeliveryOutcome(` call sites in src (grep, excluding its definition), 35 `.deliver(` call sites
across 32 src files (includes the transport-internal and non-router `deliver` names), 4 MG `sendMessage` consumers, about 15 answer-producer files, and the transport
producers above.

## 4. Migration order and witnesses

### 4.1 Order (one writer per changing interaction)

1. **Stage 0: failing witnesses first** (test-only, red on the head).
   - W-ENV-1 "an answer cannot rewrite transport": for every transport field name ×
     the C2 value matrix (`transport-outcome-forwarding-hop.test.js:27-34`) put into an answer, on the
     LOCAL, SERVICE_RESPONSE and two-hop paths, the caller's transport equals the transport of the
     same delivery with an empty answer (red today: C8).
   - W-ENV-2 "lost answer after ACK is not DELIVERED" (red: F-A).
   - W-ENV-3 "remote and local handler throw classify the same" (red: the asymmetry; only after D1).
   - W-ENV-4 "a no-handler reply carries no answer" (green today in effect; pins the frame change).

   Register them in the new contract (§6).
2. **Stage 1: transport-internal producer repairs, flat shape kept** (owner: transport; each ≤5
   files; no consumer edits).
   - 1a: P7 `:461-470` through `thrownErrorOutcome` (F-A).
   - 1b: D1 handler-throw unification (P2/P7/P13).
   - 1c: P4/P15/P16 timeout, shutdown and not-ready through the owner builder.
   - 1d: P18/P13 frame-level `noHandler` (wire change; alpha, upgrade unsupported per the
     2026-10-04 rs-raft closeout rulings).

   This is a precondition: the API-removal unit deletes P12/P21/P22 (the inline ACK and the legacy
   handler). If it has not landed, stage 3 deletes them.
3. **Stage 2: answer-producer renames that the flat merge does not observe.** These are only the
   renames whose old value is ignored today: drop redundant `acknowledged:true` from answers, and
   rename the MG application ack (F-B, *only if* D2 is decided first, since it changes today's
   FAILED). Everything that flips a decision belongs in stage 3b.
4. **Stage 3a: accessors in, consumers migrate family by family, behaviour-preserving.**
   - Add `deliveryTransportOf` / `deliveryAnswerOf` / `classifyThrownDeliveryError` and the
     owner test helper. On the flat shape, `T = classify(flat)` and `A = flat`.
   - Migrate one family per commit, each green with an identical-verdict comparison, together
     with that family's router doubles (through the helper). The families: raft + control plane;
     query (Q2-Q4); message group + CDC + topology; partition; rebalancer; bootstrap + node + service.
   - Every consumer now states which owner it reads. No behaviour changes, because on the flat
     shape both accessors see today's object.
   - This is not a compatibility shape: there is one data shape at every commit.
5. **Stage 3b: the cutover** (one commit, one writer, about 40 files). It includes:
   - P3/P9/P19: the router returns the branded envelope; the accessors read the halves and fail
     closed on a non-envelope.
   - P11 deleted; P20 deleted; P17 rewritten (Q3).
   - `completedWithError` moved (§1.1).
   - The plain-object `classify` branch deleted.
   - The CDC field lists (§3.2).
   - The forwarders return the hop2 answer: `native-delivery-methods.js:281`,
     `buildLatencyCdcPropagationResult` deleted, `merge-replication-methods.js:208-223`,
     `source-replication-start-methods.js:63-76`, `write-metrics-base.js:502-503`.
   - The answer producers that today flip transport (`acknowledged:false`, §2.3) change to domain
     refusals.
   - The test helper flips; the witnesses are updated (4.2).
6. **Stage 4: cleanup.**
   - Remove `acknowledged` from the public transport outcome (D4); move the logs to
     `deliveryState`.
   - Tighten the ratchets that print a hint.

### 4.2 Witnesses that change

| Witness | Change |
| --- | --- |
| roundtrip `test/transport/message-router-cdc-outcome-roundtrip.test.js` (277 lines, approved bytes sha256 `2a044a90…` per the C2 verifier) | the property is restated over the envelope: "a reply failing the canonical CDC predicate never passes `isCommitted/ProvisionalCdcDelivery` over the delivered envelope". The INLINE_ACK path (`:42-43`, WebSocketTransport peer `:31`) is deleted with the API removal. The own-property preservation oracle moves from the merged object to `A(d)`. The transport half is asserted to equal the empty-answer transport (W-ENV-1). **Needs a fresh witness review** (it was approved by exact bytes) |
| forwarding-hop `test/transport/transport-outcome-forwarding-hop.test.js:63-104` | today: hop1's caller sees hop2's metadata unchanged and a builder fixed point (`:87`, `:97`), through `buildLatencyCdcPropagationResult` (`:75-76`). After: **hop1's transport is hop1's own** (DELIVERED whenever hop1's handler returned); hop1's answer is hop2's answer when hop2 delivered, else the forwarder's typed refusal carrying hop2's transport deferral as an answer-level `deferRetry/retryAfterMs`; no hop2 transport field appears in hop1's transport; the envelope is a fixed point of the envelope builder. The 3×25 matrix stays |
| failed-set `test/topology/cdc-group-propagation-transport-outcome-failed-set.test.js:40-44,108` | NO_HANDLER stays uncovered (transport FAILED). APPLICATION_DEFERRAL, CONTRADICTORY_CLAIM and FAILED_CLAIM are now answers over a DELIVERED transport: they stay uncovered because the CDC *answer* predicate refuses them, not because the transport classified them. Retry count over `MAX_ATTEMPTS` unchanged. BARE_RECEIPT (`reply: null`) → DELIVERED with a null answer, uncovered |
| query failure shape `test/transport/message-router-query-transport-failure-shape.test.js:69-96` | the cases are restated over `T` states; the SUCCESS case (`:76-78`) becomes "a DELIVERED envelope is passed through with its answer's deferral"; the `QUERY_TRANSPORT_DELIVERY_STATE` import (`:9`) is deleted |
| direct wakeup `test/control-plane/replica-dispatch-direct-wakeup-delivery-decision.test.js:14-20` and `replica-dispatch-node-state-update-remote-direct-wakeup.test.js:82,224,419,565-569` | the outcomes become envelopes through the helper; a new case: a dispatch refusal answer `{success:false}` over DELIVERED defers through the dispatch owner, not the transport (Q5) |
| raft peer `test/raft/raft-rs-peer-delivery-transport-outcome.test.js` | the shapes become envelopes; a remote handler throw is FAILED (D1) |
| unit `test/transport/transport-semantic-outcome.test.js` (matrix 215,040 / 483,840 inputs per log 113) | `completedWithError` cases (`:345`, `:418`) leave; the closed key set is asserted; envelope idempotence, branding, fail-closed accessors and `classifyThrownDeliveryError` are added |
| others importing the owner: `test/cdc/cdc-delivery-outcome.test.js`, `test/message-group/message-group-forward-backpressure-code.test.js`, `test/partition/learner-promotion-proof-delivery-outcome.test.js`, `test/partition/participant-release-applied-position.test.js`, `test/topology/cdc-group-propagation-service-harness.js` | envelopes through the helper |

### 4.3 Owner-approved semantics to re-prove after stage 3b

1. **Idempotence over the matrix.** `build(build(x)) = build(x)` over the transport-producer inputs:
   the C2 31,104,000-input kill matrix, restricted to the closed key set. Building an envelope from
   an envelope is a fixed point. The forwarding hop is a fixed point (the hop witness).
2. **FAILED never DELIVERED.** No answer content, at any path or hop, changes `T.deliveryState`
   (W-ENV-1). A contradictory or failed claim can now come only from a router producer, and it
   still beats deferral. Two former DELIVERED cases are no longer DELIVERED: an ACK-then-lost answer
   (F-A) and, under D1, a handler throw. DELIVERED ⇒ the handler returned, or the delivery was
   ACK-only (raft direct, superseded); a non-null answer ⇒ DELIVERED.
3. **Retry ownership.**
   - Transport deferral (`T` DEFERRED) is retried by the transport-side owners, unchanged:
     - the raft re-send on the next append/heartbeat;
     - the topology wave over uncovered leaves;
     - the MG forwarder `resolveForwardFailureState` / `resolveForwardRetryAfterMs`;
     - MG outbound `maxAttempts`;
     - the query executor candidate loop;
     - replica dispatch `deferOperationDispatchRetry`.
   - Application deferral (`A.deferRetry`) is owned by the consumer that reads that answer: CDC
     provisional, partition write `deferRetry`, participant pause.
   - **D2 moves one class:** a handler refusal written as `acknowledged:false` stops being
     transport-retried. Prove it per §2.3 producer.
   - Retained obligations are preserved on failure (the C2 claim-4 set re-run): topology 12/12,
     peer 20/20, roundtrip 105, hop 75.
4. **Lost-answer distinguishability** (new): every "answer may be lost" reader still fires on
   ACK-then-close and on timeout (`managed-source-replication-start-delivery.js:16-25`,
   `query-executor-partition-delivery.js:675-678`).

## 5. Wire format and forwarded replies

- **Frames** (`message-router-inbound-dispatch.js`):
  - SERVICE_MESSAGE `{type, messageId, targetAddress, sourceAddress, sourceNodeId, payload, timestamp}`
    (`delivery-behaviors.js:226-234` for raft direct; the remote send in `message-router-ack-delivery.js`).
  - ACK `{type, messageId, acknowledged:true}` (`:435-439`).
  - SERVICE_RESPONSE `{type, messageId, sourceAddress, result}` (`:476-481`) or `{..., error}`
    (`:489-494`), plus today's no-handler variant `{..., result:{noHandler, error}}` (`:449-457`).
- **No frame carries the router's flat object.** The router's outcome is computed at the
  *caller's* router from the ACK and SERVICE_RESPONSE frames. Only `result` (the handler's answer,
  as JSON) and `error` (the handler's thrown text) cross the wire.
- **The forwarded flat object crosses the wire inside `result` today.** A forwarding handler on
  hop1 returns hop2's router result as its own answer, and that answer is serialized into hop1's
  SERVICE_RESPONSE `result`. The source router then merges it into hop1's transport outcome.
  Production instances:
  - `message-group-service-cdc-propagation-runtime-methods.js:142-155` spreads
    `forwardDurableCdcPayload`'s `result.answer` (`message-group-forwarding-owner-native-delivery-methods.js:281`);
  - `partition-service-merge-replication-methods.js:211`;
  - `partition-service-source-replication-start-methods.js:67`;
  - `partition-service-write-metrics-base.js:465-503` (the forwarded write returns `result`).

  The forwarding-hop witness models exactly this (`:75-76`).
- **How the envelope travels: it does not.** It is a local, branded, frozen value. On the wire:
  - `result` = the answer, verbatim;
  - `error` = the handler's thrown text (→ FAILED/`handler_failed` under D1);
  - a new frame-level `noHandler: true` (+ `error`) replaces the router fact that today sits in the
    answer slot (P18). That is the only frame change.

  A forwarder decides on hop2's `T`, then returns `A(hop2)` (or its own typed refusal carrying
  hop2's deferral at answer level). Hop2's transport facts therefore never reach the source's
  transport. JSON cannot carry the brand, so a nested envelope in an answer is impossible by
  construction.
- **Mixed versions** (an old peer sending `result:{noHandler}`): there is no compatibility path,
  under the alpha mandate and the rs-raft closeout ruling "upgrade unsupported". Such a reply is
  read as an answer `{noHandler, error}` over DELIVERED. That is a stated, accepted alpha
  consequence.

## 6. Impact contracts to update (`test/shards/impact-contracts.json`, 71 contracts / 44 pairs today)

- **New contract** `router-delivery-envelope`.
  - Owners: `transport-semantic-outcome.js`, `message-router-delivery-behaviors.js`,
    `message-router-outbound-queue-admission.js`, `message-router-pending-response-ledger.js`,
    `message-router-inbound-dispatch.js`, `message-router-reconnect-behaviors.js`,
    `message-router-delivery-pressure-routing.js`, `message-router-outbound-delivery-registry.js`.
  - Witnesses: W-ENV-1..4, the unit test, roundtrip, forwarding-hop.
  - Coupled pairs with every consumer family of §3.
- **New contract** `replica-dispatch-direct-wakeup-delivery` (deferred to Q6 per log entry 119).
  - Owners: `replica-dispatch-direct-wakeup.js`, `replica-dispatch-service-lifecycle.js` (the
    dispatch handler's answer), and the transport owner.
  - Witnesses: `replica-dispatch-direct-wakeup-delivery-decision.test.js`,
    `replica-dispatch-node-state-update-remote-direct-wakeup.test.js`.
- **Existing contracts that list the transport owner** gain the router producers as owners and the
  envelope witnesses where they consume a delivery:
  - `cdc-source-native-delivery`: add `cdc-propagation-progress.js`, the forwarders in
    `message-group-service-cdc-propagation-runtime-methods.js` and `…-native-delivery-methods.js`,
    and W-ENV-1/hop;
  - `raft-rs-runtime-application-transaction`: the peer witness;
  - `distributed-transaction-coordinator-participant-protocol`: the participant wire, Q2;
  - `partition-write-answer-retry-classification`: query executor Q4, and
    `partition-service-raft-write-commit.js` as an answer producer;
  - `committed-bootstrap-stamp`;
  - `replace-owner-membership-observation`;
  - `partition-replication-start-authorization` and the pair `partition-replication-record-physical-start`;
  - `message-group-registered-learner-read`;
  - `participant-release-bounded-completion`;
  - `failed-create-target-authoritative-cleanup`.

  Each coupled pair whose endpoint is a handler gets that handler's answer producer as an owner,
  because answers are now that pair's contract.
- **Run** `test:metadata:refresh` + `audit:impact-contracts` after stage 3b (the C2 change showed
  stale shard metadata turning two lab reds; verifier F10).

## 7. Owner decisions this design needs (product/scope, not implementation)

- **D1. Handler throw.** Today LOCAL is FAILED and remote is DELIVERED + error. Recommended: both
  FAILED/`handler_failed`, answer null. Alternative: both DELIVERED with a thrown marker. That
  would need a router-written answer field, which breaks "the answer has its own namespace".
- **D2. Handler refusals written as `acknowledged:false`** (§2.3). They become domain refusals over
  a DELIVERED transport, so transport retry owners (MG outbound `maxAttempts`, topology wave) stop
  retrying them. Each consumer reads the refusal. Recommended: yes. It is the owner's own rule
  ("transport delivery alone does not establish domain completion" applies in both directions).
  It includes F-B.
- **D3. Superseded pending.** Recommended: DELIVERED, answer null, reasonCode `superseded`, which
  is today's decision named. Alternative: FAILED. That would make every `replacePendingKey` caller
  re-drive a coalesced heartbeat.
- **D4. `transport.acknowledged`.** Recommended: removed from the public outcome, with
  `deliveryState` as the one fact (§1.3).
- **D5. Precondition ordering with the API-removal unit** (inline ACK, legacy
  `router-message-handler.js`). Recommended: API removal lands first, matching execution order
  item 8 ("Q6, API removal, fixtures"). If Q6 goes first, stage 3b deletes P12/P21 itself.

## 8. Findings surfaced by this design (pre-existing, outside C2's scope)

- **F-A (a gap in FAILED-never-DELIVERED).** `completeRemoteDelivery`'s catch
  (`message-router-delivery-behaviors.js:461-470`) returns `{acknowledged:true, error}` and drops
  `error.code`. A connection close after ACK (`message-router-connection-close-reconnect.js:129-134`)
  or a remote handler throw is therefore reported **DELIVERED with no answer**. Consumers that read
  answer fields usually fail anyway, because `success` is missing. But raft peer delivery, MG
  outbound (`:235`) and the direct wakeup take the delivered branch.
- **F-B.** MG application ingress answers `acknowledged:false` as its normal reply
  (`message-group-service-inbound-ingress-runtime-methods.js:23-35`). That reply flips the router's
  outcome to FAILED for a delivered message, and the MG wrapper `node/message-group-service-handler.js:629`
  (`{acknowledged:true, ...response}`) does not protect against it, because `...response` is spread
  last. Whether a live message type reaches this without a completion handler is unknown (U2).
- **F-C.** `completedWithError` makes transport interpret the replica-operation status vocabulary
  (`transport-semantic-outcome.js:16,186`; `replica-operation-constants.js:99`).
- **F-D.** The handler's `messageId`/`correlationId` override the router's
  (`delivery-behaviors.js:71-74`). `rpc-client.js:166` depends on that.
- **F-E.** `transport/router-message-handler.js` is a second, test-only implementation of the
  inbound protocol (R02/no-legacy). Delete it; do not migrate it.
- **F-F.** The topology failed-set decision moved from the verifier's cited
  `cdc-group-propagation-delivery-methods.js:744` to `cdc/cdc-propagation-progress.js:124-139`. Its
  CDC provisional match depends on the merge artefact `acknowledged && reasonCode === TRANSPORT_DEFERRED`
  (`cdc-delivery-outcome.js:342-345`).

## 9. Size and smallest reviewable stages

| Stage | Files (src / test) | Character | Reviewer focus |
| --- | --- | --- | --- |
| 0 witnesses | 0 / 4 | red-first | the property statements; red on the head |
| 1a F-A | 1 / 1 | behaviour fix | lost-answer readers |
| 1b D1 | 3 / 2 | behaviour change (decision) | raft peer, MG forwarder rejection paths |
| 1c builder routes | 3 / 1 | equivalence | the timeout/shutdown shapes |
| 1d frame noHandler | 2 / 2 | wire change | both ends; mixed-version note |
| 2 inert renames | ~8 / ~4 | inert | grep proof that each renamed field is unread |
| 3a ×6 families | ~45 / ~103 total, ~8 / ~20 per commit | behaviour-preserving | identical verdict sets per family; doubles through the owner helper only |
| 3b cutover | ~40 / ~12 | the contract change | §4.3 re-proofs; W-ENV-1..4 green; CDC field lists; forwarders |
| 4 cleanup | ~6 / ~4 | inert | D4 log moves; ratchet tightening |

Totals: about 60 distinct src files, about 115 test files, and an estimated 2-3k changed lines,
most of it mechanical in 3a. The irreducible atomic unit is 3b. It cannot be split, because two
data shapes cannot coexist under the alpha/no-compatibility rule, and 3a exists to keep 3b small.
Gates: unused exports (the accessors and helper are used; the deleted enum, table and wrapper
remove exports), complexity (Q3/Q4 lose branches), duplication (one test helper replaces about 100
literal flat objects). The ratchets are not expected to rise.

## 10. Unknowns

- **U1.** The per-message-type answer census beneath the 12 handler registrations is not
  exhaustive. §2.3 lists every `acknowledged:` literal outside transport and the transport-named
  fields found by grep.
- **U2.** Whether F-B is live: which MG application message types reach `completeApplicationMessage`
  without a completion handler that overrides `acknowledged`.
- **U3.** The downstream readers of raw pass-through results are not traced past the named function:
  - `partition-service-write-metrics-base.js:503` return value to the `proposeWrite` callers;
  - `user-table-leader-placement-cure.js:406,442` return values;
  - `message-retry-handler.js:282` `deliveryFn`;
  - the producer of `cell-ingress-transport.js:326` `delivery.processed`.
- **U4.** The test-double count (about 103 files) is a grep estimate (`deliver|sendToPeer` stubs
  with `acknowledged`).
- **U5.** Whether the API-removal unit's scope already includes `router-message-handler.js` (F-E).
- **U6.** Whether any consumer needs "acked but not delivered" separately once F-A lands. None was
  found among the census sites.
- **U7.** Live behaviour was not run. Every statement here is from reading code at `a51f49929`.
  No witness was executed for this design.
