---
audience: development
documentClass: evidence
---

# VERIFY: Q6 stages 1-2 + D3 (router delivery envelope, flat shape kept), round 1 (2026-10-28)

## Verdict: APPROVE for composing 351c367c8 onto the lineage head (no required changes)

The three stage claims hold and were measured, not read: the router's acknowledgement wins over
every answer I could construct on all three paths (D2); a lost answer after the ACK is the
router's DEFERRED/connection_closed and a START with that loss is a loss candidate, never
"processed" (F-A); a handler throw is FAILED/handler_failed on LOCAL and remote alike (D1); the
no-handler reply is a frame-level fact; the superseded pending delivery is one named outcome that
goes red when its completion is deleted (D3). F-B is live on the base and gone on the head. The
127-file set, the lineage-base set and the stage-base set agree: 11 reds, same files, same first
leaf, none attributable to this change. Dry-run merge onto the current lineage head `2901fac0f` is
clean (no conflicted path). Six findings below are recorded for the stage-2 cleanup / stage 3b;
none blocks composition. One claim is corrected in wording (B3, the forwardToLeader cost). One
composition instruction: the raw merged tree needs `npm run test:metadata:refresh` before its
impact-contract audit passes (G4); that is the composer's normal step, not a defect of this change.

## Identity

- Branch `work/router-envelope-q6-stage1-20261026`, pushed (`git ls-remote` =
  `351c367c83040391ed222fa0efcdefd4042aaac6`). Implementer worktree
  `/mnt/data/peter/projects/.worktrees/router-envelope-q6-stage1-20261026` clean at that HEAD.
- Commits: `013979c41` (stages 1-2; parent `59d262356`) -> `f7f40bdc2` (merge of `c5c8267cf`) ->
  `abcafb95a` (D3) -> `351c367c8` (merge of lineage `6f1ecf8d4`; FINAL, parents `abcafb95a`
  `6f1ecf8d4`).
- Lineage head at verification time: `work/mg-delivery-resume-r2-20261023` = `2901fac0f`
  (one docs commit past `a733ca56b`); merge-base with the final commit = `6f1ecf8d4`.
- Change vs `6f1ecf8d4`: 34 files, +907/-352 (18 src, 6 shard/inventory json, 10 test).
- Scratch trees (detached, node_modules symlinked, import graph regenerated, zero drift after
  regeneration): `head` 351c367c8, `base` 59d262356, `lineage` 6f1ecf8d4, `merge` 2901fac0f +
  `--no-commit` merge of 351c367c8, `mut` 351c367c8 (mutations, restored after each).

## Per-claim table

| # | Claim | Verdict | Evidence (file:line, run) |
| --- | --- | --- | --- |
| A1 | Router writes `acknowledged: true` after the answer spread on LOCAL and SERVICE_RESPONSE | VERIFIED | `src/transport/message-router-delivery-behaviors.js:38-45` (`answeredDelivery`, used at :101 and :474). W-ENV-1 green on head (22 asserts), red on base by assertion (`witness-head.log`, `witness-base.log`). |
| A2 | No answer can rewrite the acknowledgement on any path | VERIFIED + extended | My matrix (`adversarial.mjs`, `adversarial-head.log`): frozen `{success:false, acknowledged:true}`, array, plain, Promise-resolved, Promise-resolved frozen `acknowledged:false`, enumerable getter returning false, Proxy reporting false, null, string: all SAME as the empty-answer facts on LOCAL, SERVICE_RESPONSE, two-hop CDC wrapper and two-hop raw passthrough. On base the getter, Proxy and Promise->frozen-false cases flip to FAILED/ack_rejected (`adversarial-base.log`). |
| A3 | Forwarded path: preserve or re-stamp? | RE-STAMPS, correct under D2/section 5 | A hop1 handler returning hop2's result verbatim (raw) or through `buildLatencyCdcPropagationResult` reaches the source with `acknowledged:true` (hop1's own fact) while hop2's other flat facts survive: hop2 no-handler -> FAILED/no_handler, hop2 throw -> FAILED/handler_failed, hop2 answer `acknowledged:false, success:false` -> DELIVERED with `success=false` (D2). The real `forwardToLeader` (`replica-dispatch-readiness-capture.js:637-668`) never returns the remote result; it returns its own completion (`replica-dispatch-service-lifecycle.js:495-496`), so hop2 is observed only through `mgService.sendMessage` throwing (fwdOwn rows). Design section 5 says hop1's transport is hop1's own; the leak of hop2's other fields into hop1's transport is the flat-shape residual that stage 3b removes. |
| A4 | Residual flat-shape rewrite power (scope note of W-ENV-1) | CONFIRMED, as scoped | Answers carrying `deliveryState:'failed'` (-> FAILED/contradictory_delivery_state), `noHandler:true`, `errorCode:'ROUTER_CONNECTION_CLOSED'` (-> DEFERRED), `deferRetry:true`, `reasonCode` still change the transport facts on every path; `messageId:'spoofed'` overrides router identity (F-D). Identical on base. Approved C2 raw preservation; belongs to stage 3b (W-ENV-1 header :14-18 states it). |
| B1 | F-B live on base, fixed on head | VERIFIED | `probe-fb.mjs` (my copy, tree as argv): base `59d262356` NODE_STATE_UPDATE and OTHER_APP both `ack:false state:failed reason:ack_rejected` with the completion fields present; head `351c367c8` both `delivered`, `applicationAcknowledged:false`, completion intact. The probe's completion handler matches production: `buildDurableCompletion` (`replica-dispatch-state-publication.js:33-41`) carries no `acknowledged`, so the ingress answer at base (`message-group-service-inbound-ingress-runtime-methods.js:28-35` at base) stayed `acknowledged:false`. |
| B2 | Consequence 1: node-state publication reports failure after the durable NODES write | VERIFIED (base) | `node-state-publication-owner.js:481-491`: a non-DELIVERED classification throws `buildNodeStateUpdateDeliveryError` ("not acknowledged"); `shouldRetryControlPlaneNodeStateUpdate` (:161-183) does not match that text (non-heartbeat), so no alternate target; `connect-websocket-phase.js:340-356` rethrows -> the join phase fails after the target's durable write. The outer join retry re-sends the same NODE_STATE_UPDATE: a second publication of an already-durable row, idempotent by node_id (R14), so no duplicate row, but a false join failure and one wasted join cycle. Head: DELIVERED with completion -> no throw. |
| B3 | Consequence 2: forwardToLeader costs a retry backoff then DUPLICATE | PARTLY, wording corrected | `mgService.sendMessage` resolves the delivery mode: direct-only control-plane payloads (`DIRECT_ONLY_MESSAGE_TYPES`, :315-321) go through `deliverDirectOnlyMessage` with `maxAttempts: 1` (:355-359) and THROW "Message delivery not acknowledged" on base with no retry (probe row `sendMessage` on base: wait_bound_spent maxAttempts 1, then throw); only the raft-durability mode (`attemptDirectDelivery`, :201-271, `retryMaxAttempts`) pays the backoff and then meets the DUPLICATE answer. Either way the forwarder's `handleMessageReceived` fails or stalls for a message the leader had already processed. Head: `sendMessage` returns `status:received`, delivered. |
| C1 | Handler throw -> FAILED/handler_failed, same code, both paths | VERIFIED | `transport-error-codes.js:10`; `transport-semantic-outcome.js:52,78,155,251-253`; LOCAL catch `delivery-behaviors.js:87-98` covers only the handler call; remote via `pending-response-ledger.js:61-66` + `delivery-behaviors.js:477-486`. W-ENV-3 green head / red base (base: the owner lacks the code). |
| C2 | Lost answer after ACK -> DEFERRED/connection_closed | VERIFIED | `connection-close-reconnect.js:130-133` carries `ROUTER_CONNECTION_CLOSED`; `failPendingResponsesForNode` (ledger :478-487) rejects the waiter; the catch classifies through the owner. W-ENV-2 case 1 green head, red base (base: DELIVERED). |
| C3 | START loss-candidate consumers: no double start, no false processed | VERIFIED | `managed-source-replication-start-delivery.js:45-56` refuses non-DELIVERED (throws, `retryable` from deferRetry); `markDeliveryAnswerLossCandidate` (:27-33) marks connection_closed/timeout; consumers `managed-split-workflow.js:612-619` and `managed-merge-workflow.js:713-719` only CONFIRM (`confirmSplitReplicationStart`) on a loss candidate, never re-start blindly; a non-candidate rethrows. W-ENV-2 case 2: `processed` undefined, candidate true (head); on base the same delivery was taken as processed (red). |
| D1 | No src/scripts/bin reader of `replacedPending` | VERIFIED | grep over src, scripts, bin, test: zero hits. |
| D2 | All replace-key producers resolve through the one named outcome, DELIVERED | VERIFIED | Single producer `buildSupersededPendingResult` (`outbound-queue-admission.js:179-186`) -> `buildSupersededDeliveryOutcome` (`transport-semantic-outcome.js:257-260`), single consumer `outbound-delivery-registry.js:391`; completed by name at `delivery-behaviors.js:458-466`. Replace-key producers traced: heartbeat (`raft/constants.js:177`), priority control-plane tx COMMIT/ROLLBACK (`sql-query-engine.js:84-92,474` via `query-execution-budget.js:198-200`, `query-executor-partition-attempt-budget.js:316-320`), CDC visibility profile (`cdc-propagation-delivery-profile.js:209,218`), replica-operations gateway coalescing (`replica-operation-repository-mutation-gateway-methods.js:651`, `control-plane-system-table-gateway-mutation-submission.js:78`). Witness `message-router-superseded-delivery-completion.test.js` green on head for both producer kinds; with the named completion deleted (`mut`, 9 lines) both cases red (`mut-d3.log`). The query consumer treats a DELIVERED answer without `success` as an unknown outcome and re-drives under the same entryId (`query-executor-partition-delivery.js:544-556`), unchanged by D3. |
| D3 | `coalesced` / `deliverySource` readers | FINDING F-V4 | `coalesced` on the result is read only by the owner's own predicate `isSupersededTransportDeliveryOutcome` (:262-266) beside `reasonCode === superseded`: two fields for one named state. `deliverySource` on the superseded result has no reader anywhere in src. Deletion items (stage-2 cleanup); not blocking because neither changes a decision. |
| D4 | Retired names deleted | VERIFIED | grep: `hasInlineAckPayload`, `INLINE_ACK_PASSTHROUGH_KEYS`, `INLINE_ACK_RESULT_FIELD`, `RETIRED_PENDING_RESPONSE_REASON.INLINE_ACK`, `late_after_inline_ack` absent from src/scripts/bin/test (one comment in the roundtrip test :43 names the removed lane). `superseded_pending` / `late_after_superseded` at `shared-vocabulary.js:101,35`. |
| E1 | `applicationAcknowledged` rename | FINDING F-V2 | Written at `message-group-service-inbound-ingress-runtime-methods.js:30,38`; read by nothing in src (only W-ENV-1 :130). A field no production consumer reads is a dead write under the one-version rule; either MG's `acknowledgeMessage` path should consume it or it should go. Not blocking: it is MG's own namespace and cannot touch the transport decision. |
| E2 | Four `{acknowledged:true, ...}` node wrappers inert | VERIFIED by mutation | `runtime-service-handler.js:685` dropped: only the direct-call pin `test/node/runtime-service-handler.test.js:1120` ("registered handler returns acknowledged response") fails, 47/48 same (`mut-e1.log` vs `mut-e1c.log`). `message-group-service-handler.js:629` dropped: node MG handler tests identical to control (`mut-e2*.log`). `replica-handler-runtime-methods.js:580` dropped: identical to control (`mut-e3*.log`; both pre-existing red). `replica-handler-lifecycle-methods.js:155` not mutated (same shape). Deletion items for stage-2 cleanup; the :1120 pin moves with the wrapper. |
| F1 | No `code`->`errorCode` alias, no inline-ACK branch | VERIFIED | Builder reads only `options.errorCode` (:190); `thrownErrorOutcome` reads `error.code` for Error instances only (:238, the JavaScript Error convention, approved C2). No `inline` in src/transport. |
| F2 | ACK frame fields | VERIFIED with note | Sent: `{type, messageId, acknowledged:true}` (`inbound-dispatch.js:434-438`); read: `{messageId, acknowledged, error}` (ledger :516), resolved as `{messageId, acknowledged:true[, error]}` (:538-542). The router never sends `error` on an ACK; the read of it is a dead wire field unless a foreign peer sends it (note only). |
| F3 | The five restated tests pin the owner shape | VERIFIED | Each imports the owner (`classifyTransportDeliveryOutcome` + `TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.NO_HANDLER`, or `isSupersededTransportDeliveryOutcome`); no hand copy of the result shape (diff 6f1ecf8d4..351c367c8). |
| G1 | 127-file set | VERIFIED | head: 116/11 (`set-head.log`); lineage 6f1ecf8d4: 112/11 of 123 present; base 59d262356: 109/13 of 122 present. Red FILE sets head == lineage; base has two extra reds the lineage fixed. First-leaf comparison (`firstleaf.py`): head vs lineage same 11 / diff 0; head vs base same 11 / diff 0. One zero-assertion red (`test/topology/cdc-group-propagation-foreground-boundary.test.js`) is the runner refusing a non-local timeout const, identical on all three trees. |
| G2 | Statics at head | VERIFIED | unused-export ratchet OK 1411/1411; duplication OK src+scripts 44/1383, test 656/24700; cycles 0/0; impact-contracts PASS 72 contracts / 44 pairs; audit:shards current (2453 tests); eslint 0 errors on the 28 changed js files; `node --check` clean; scoped complexity on the changed files: 13 violations at head and 13 identical at lineage (line shifts only). |
| G3 | Metadata zero drift | VERIFIED | Import-graph regeneration in head, lineage and base trees leaves `git status` empty. In the merge tree the regeneration changes only the three digests of `impact-graph-seal.json` (expected: the composer re-seals the composed tree). |
| G4 | Dry-run merge onto 2901fac0f | VERIFIED clean | `git merge --no-commit --no-ff 351c367c8` in a scratch tree at 2901fac0f: automatic, no conflicted path, 30 files. Overlaps: `check-unused-exports.js` takes the lineage's 1409 (Q6 changed no line there vs 6f1ecf8d4; merged tree re-measured below); `check-duplication.js` takes Q6's 656/24700 (the lineage head is still at 658/24752); `impact-contracts.json` auto-merged (union); shards auto-merged. Merged-tree statics: unused-export ratchet OK 1409/1409 (Q6 is neutral on the merged tree), duplication OK 44/1383 and 656/24700, cycles 0/0. `audit:impact-contracts` FAILS on the raw merged tree (`cdc-source-native-delivery` witnesses "not primary-classified") and the import-graph seal digests drift: both are the auto-merged generated shard metadata being stale for the composed tree; `npm run test:metadata:refresh` (4 shard files, +48/-13) makes impact-contracts PASS (72 contracts, 44 pairs, same registry sha as head) and `audit:shards` OK (2456 tests). The composer must run that refresh in the composition commit (same step the lineage composes have taken). |
| G5 | Hook replay on the final commit | VERIFIED | `mut` tree: HEAD soft-reset to the first parent `abcafb95a`, index = the 351c367c8 tree (119 staged paths), `LAGRANGE_SKIP_INVENTORY_REGEN=1 bash .githooks/pre-commit` exit 0 (`hook-replay.log`: file-size ratchets, hot-path/literal/decision-boundary/ambient/silent-catch audits 0 new, scoped complexity listing the 17 lineage-inherited targets as the implementer's `hook-merge2.log` shows, em-dash check). Tree restored to 351c367c8, 0 entries. |
| G6 | Lab run-3 reds sampled locally | VERIFIED inherited | 12 of the 119 lab run-3 reds not already in the 127-file set, re-run at head and at lineage 6f1ecf8d4: all 12 red on both, identical lane totals (8/8, 3/3, 1/1 fail; 217/60/10 assertions) and identical first failing leaf (`firstleaf.py`: same 12 / diff 0). Sample: bootstrap-sequence, seed-infrastructure-phase, fresh-seed-activation.integration (lineage-only new file), cdc-shutdown-terminal-owner-write, core-system-logic-runtime-witness, index-service, websocket-create-replica-ack.integration, replica-create-admission-recovery, replica-handler, participant-release-first-prepare-native, partition-cdc-delivery-progress, partition-statement-admission. The lab lists themselves: the only red in run 3 absent from the lab base run is fresh-seed-activation.integration, which the lineage added after that base run. |

## Findings (recorded for the owner; none blocks composition)

- **F-V1 (low): an answer whose normalization throws rejects the LOCAL delivery but is
  FAILED/handler_failed remotely.** `deliverLocal` narrows the catch to the handler call
  (`:85-98`, D1), so `answeredDelivery`'s spread of the answer (`:42`, inside
  `normalizeServiceResponseResult` :497) runs outside it; a throwing getter rejects
  `deliver()` with the getter's uncoded Error (base: FAILED/ack_rejected). On the remote path the
  target's `JSON.stringify` throws inside the `.then` and the `.catch` sends an `error` frame ->
  FAILED/handler_failed. Exotic answers only; either classify the normalization failure as
  handler_failed too, or leave it as the documented "router rejects" row. Stage 3b material (the
  envelope keeps the answer verbatim and never spreads it).
- **F-V2 (one-version): `applicationAcknowledged` has no reader** (E1 above).
- **F-V3 (proof shape): the owner unit test does not name the two new reason codes.**
  `test/transport/transport-semantic-outcome.test.js` has no case for `handler_failed`,
  `superseded`, `buildHandlerFailedError`, `buildSupersededDeliveryOutcome` or
  `isSupersededTransportDeliveryOutcome`; the proof lives only in the router-level witnesses
  (W-ENV-3, the superseded witness). The fixed-point property still holds for both by construction
  (own `reasonCode` is preserved; `ROUTER_HANDLER_FAILED` is a conflict code), but the contract
  lists the unit test as a witness of this owner. Add the two rows at stage 3b when that file is
  restated (design 4.2).
- **F-V4 (one-version): `coalesced` + `reasonCode: superseded` are two fields for one state;
  `deliverySource` on the superseded result has no reader** (D3 above).
- **F-V5 (deletion items): the four `{acknowledged:true, ...response}` node wrappers and the
  eight `acknowledged:false` + `success:false` refusal answers now carry a dead `acknowledged`.**
  Inert under router-wins (E2 mutations). Stage-2 cleanup drops them with the :1120 pin.
- **F-V6 (claim wording): B3.** The forwardToLeader consequence on base is mode-dependent: a
  hard throw after one attempt for direct-only payloads, a retry backoff then DUPLICATE for the
  durability mode. The lineage log entry (`2901fac0f`) states only the second.

## What I ran (logs under `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/c74561e1-2969-4696-bd5a-1d3a410f38a7/scratchpad/q6v/`)

- Worktrees: `head/`, `base/`, `lineage/`, `merge/`, `mut/` (removed at the end); import graph
  regenerated in each (`*-import-graph.log`).
- Thermal gate before every heavy run (`thermal-set-*.log`, `chain-thermal.log`).
- Witnesses: `witness-head.log` (5 files, 40 asserts, all ok); `witness-base.log` (W-ENV-1..4
  copied onto base: 4/4 red by assertion, 38 asserts; copies removed afterwards, base tree clean).
- `probe-fb.mjs` (my parameterized copy of the implementer's probe, plus the duplicate-delivery and
  MG `sendMessage` rows) on base and head: output in this report (B1-B3).
- `adversarial.mjs` on head (`adversarial-head.log`) and base (`adversarial-base.log`).
- Sets: `set-head.log`, `set-lineage.log`, `set-base.log`; red files `set-*-redfiles.txt`;
  `firstleaf.py` comparisons.
- Mutations: `mut-d3.log`, `mut-e1.log`/`mut-e1c.log`, `mut-e2.log`/`mut-e2c.log`,
  `mut-e3.log`/`mut-e3c.log`.
- Statics: `static-head-*.log`, `static-lineage-*.log`, `static-merge-*.log`,
  `cx-scoped-head.log`, `cx-scoped-lineage.log`, `eslint-head.log`, `impact-head.log`,
  `shards-head.log`.
- Merge: `merge-dryrun.log`, `merge-metadata-refresh.log`, `static-merge-impact.log` (raw merged tree, FAIL) and `static-merge-impact-after-refresh.log` (PASS), `shards-merge-after-refresh.log`; hook replay: `hook-replay.log`, `hook-replay-staged-count.txt` (119), `hook-replay-restore.txt` (0); lab samples: `labsample-head.log`, `labsample-lineage.log`.
- Chain driver `chain.sh` with `chain-status.log` (every exit code). All five scratch worktrees removed and pruned at the end; the Q6 worktree (0 entries, HEAD 351c367c8) and `/mnt/data/peter/projects/lagrange` (0 entries) were not touched; no scratch process left running.

## Limits

- I did not re-run the lab (tv-dator) runs; I sampled their reds locally (G6) and compared the
  implementer's three red lists (`q6/lab-reds-base.txt`, `lab2-reds.txt`, `lab3-reds.txt`): the
  only red present in run 3 and absent from the lab base run is
  `test/bootstrap/fresh-seed-activation.integration.test.js`, a file the lineage added after that
  base run.
- The adversarial matrix covers answers I could construct in-process; a foreign peer sending
  non-router frames (an ACK with `error`, a `result` carrying `noHandler` from an old peer) is the
  accepted alpha consequence in design section 5 and was not exercised.
- The 2-hop property was measured with hand-registered forwarders and the MG CDC wrapper, plus the
  real MG ingress through `registerMessageGroupTransportHandler`; the real `forwardToLeader` was
  read, not driven live (its consequence was measured through `mgService.sendMessage`).
- Nothing outside the per-claim table is approved by implication.
