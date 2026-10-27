---
audience: development
documentClass: planning
---

# MG delivery witness implementation plan

Author: `subagent:/root/retained_effects_tests`, 2026-10-23. Authority is the
approved contract SHA256
`474182126c3c985feceadb9a1b72d7de9975e1b4c3280af52be884c6c095f383`
and final design review SHA256
`2eb6a5a1243ee5efc72e0c5182e5f919fbc7d058c1404785bb3d4123ba3e597d`.
Source/fixture inspection is against `68633168ef17759fec954e6ef66b4ccb0d671bc7`.
This is a proposed allocation of witness work, not implemented tests, source
approval or measured proof. Only this plan was written; no runtime was launched.

## Setup gates before implementing acceptance assertions

**S1: use a legitimately released ordinary source.** Reuse
`test/message-group/message-group-native-custody-handoff.test.js:34-63`:
`formAdmittedGroup` creates actual partition membership;
`attachPartitionReleaseOwners` hosts it through real ReplicaHandlers and a
native sql_transactions control service. Its `release` calls the actual
`participantReleaseRecovery.releaseOperator` with measured build provenance
and requires CUT_OVER (`test/partition/partition-release-fixture.js:109-138`).
It supplies no OPEN flag, forged census or original seed grant.

There is bounded historical setup evidence. Frozen `5a3cdc71854c7d97d2e3b688258b73c19dd0c6e4`
on tv-dator reached the recipient-proposal assertion after that release gate
and actual source SQL application. Retained evidence is
`solve/quests/runtime-ordering-completion-consumer-proof/evidence/closeout/message-group-first/summary.json`
and `01/raw.tap`, raw SHA256
`f82369643142af3679151d9ed5cedcc405e4b5a1b620925727e148eb982d3def`.
The custody test and both partition fixture files are byte-unchanged between
that source and the inspected checkpoint. This establishes historical traversal
of the setup, not a current admission pass or MG delivery success: the file
failed before recipient proposal because its hybrid INSERT omitted producer
data/HLC, as classified in the adjacent `MG-FIRST-RESULT-CLASSIFICATION.md`.

On the new exact candidate, record the actual CUT_OVER answer, current native
membership/leader and `executeQuery` result before claiming setup complete.
Use sessionless `executeQuery(sql, params, {entryId})`, hence the normal QUERY
builder and service HLC in `partition-service-write-metrics-base.js:60-78,416-430`.
Require the canonical row, a successful durable outcome and nonempty exact CDC
debt; never repeat the direct `applyWrite({type: INSERT, sql, params})` hybrid.
ENABLE alone is insufficient: `partition-participant-transaction-pause.js:193-215`
starts release admission CLOSED, and `partition-service-raft-write-commit.js:441-448`
refuses a new ordinary write while paused.

If S1 is unavailable before protected activation, retain that admission gate
explicitly. A public `raft.propose` of a normal write-entry builder/service HLC
can separately prove persistence, application and debt creation, after proving
the ordinary refusal leaves entries/frontiers unchanged. It cannot replace the
contract's complete `executeQuery` admission/delivery witness or close S1.

**S2: establish the actual provisional-to-native route premise.** A fully
formed RF3 fixture with a healthy owned leader route cannot simultaneously be
the initial "no native route" provisional case. Do not force follower flags,
replace readStatus or make B merely trigger a test callback that releases an
otherwise unrelated transport gate.

Use two source SERVICES mutations A then B in the same partition ledger, so
the actual own-table SQL admission is respected. B supplies the missing location
of an already configured target-group peer. Construct an addressed native
follower without that peer address in either its cache or bootstrap hints;
other actual voters retain the location needed to form their quorum. Native
status must report the leader/peer address unavailable before B and a usable
same-group address after B, while the addressed role remains FOLLOWER.
The source-bound path is `SystemTableCache` CDC application ->
`message-group-service-peer-resolution.js:188-220` cache-change reconciliation
and `:135-155` address lookup -> actual port observation
(`raft-rs-status-observation.js:24-65`; unavailable addresses are named data,
not invented leadership) -> F3 ingress decision. No new membership is needed
merely to resolve an already configured peer.

This exact construction is a setup proof obligation, not yet measured. First
show the real addressed handler accepts provisional ingress, B is absent and
the native route is unavailable. Then demonstrate that delivering B through
the real cache/reconciliation owner makes the route usable without electing
that follower. If that construction is refused by an existing participation
or initialization owner, record its typed refusal and repair the bounded
fixture premise before coding the composite; do not substitute a cache hint
for native route authority or assert success after an outer timeout.

**S3: distinguish native and physical transport cuts.** Reuse
`test/message-group/message-group-native-custody-fixture.js` for real MG
services, durable files, native envelopes and actual MessageRouter handlers;
parameterize its group/replica identities rather than copy its formation code.
Its current single-router native schedule is not a WebSocket/serialization
proof. The wire/pressure cases need two real routers with an actual connection,
remote service handlers and the pending-response/outbound owners engaged.
RF1 has no peer quorum carrier to hold: use an actual application/frontier
failure for RF1 committed-pending/rollback, and the existing native APPEND
transport hold for RF3 local-uncommitted evidence.

## Minimal authored file allocation

These are proposed paths, not files created by this plan. Reuse the current
fixtures and real owners; keep any generalized support in the existing native
custody fixture, with one source/recipient composition helper if separation is
needed for file-size limits.

| File | Responsibility |
| --- | --- |
| New `test/cdc/cdc-delivery-outcome.test.js` | Canonical local/remote full-vector validation, optional-field contradictions, exact group binding and envelope identity. Pure owner tests, no native claim. |
| Existing `test/message-group/message-group-native-custody-handoff.test.js` | Repair the producer via S1; add RF1 synchronous completion/rollback and RF3 pending/loss/replay variants, actual receipt/native-history correspondence and source ACK apply. |
| New `test/bootstrap/cdc-source-occurrence-delivery.integration.test.js` | Real shared subscriber with both seed/join bridges; grouped/safe and addressed follower paths; S2 composite; separate 65-target and greater-than-1-MiB ordinary source cases. |
| New `test/partition/partition-cdc-delivery-progress.test.js` | Deterministic clock, fair multi-invocation/subscriber progress, one-row hydration/256-visit quantum, delayed-answer and cross-tenure cleanup controls over the actual source owner. Explicitly component-level when a controlled recipient is used. |
| Existing `test/transport/message-router-late-response-classification.test.js` | Delayed timer versus actual expiry, queued dispatch cancellation and retained raw-send cleanup; real router response boundary. |

An OS-process-loss case additionally needs a bounded child worker. Reuse the
owned IPC-cut/SIGKILL/close-custody pattern in
`test/integration/message-group-learner-process-loss.integration.test.js:18-75`
with MG/source setup, not its learner semantics. A graceful service reopen is
useful restart evidence but must not be labelled a crash. The parent kills only
its recorded child after an explicit measured cut and retains files on cleanup
failure. No power-loss or physical multi-host claim follows.

## Assertion-to-owner and paired-mutation map

All production paths below are under `src/`. Each mutation is a later isolated
source-semantic control against frozen implementation bytes; do not mutate the
assertion or fake the success value. Record that the intended seam was reached.

| ID | Actual seams and reusable witness | Required observation | Mutation that must fail the same acceptance |
| --- | --- | --- | --- |
| W1 producer identity | Normal QUERY producer -> `partition-service-entry-apply-base.js:622-658` -> `partition-cdc-obligation.js:123-156`; S1 native source. | Independently read source row, first outcome and event_json/position; capture exact eventKey, entryId, sourcePartition/Replica, index/ordinal, timestamp, scope and data. Two same-row/same-value writes with distinct entryIds remain two source occurrences. | Drop source identity in an actual bridge, or restore row-key replacement for durable events in topology/profile handling. The two observed native vectors/receipts must lose or mismatch a required occurrence, not merely time out. |
| W2 every propagation branch | Shared factory `bootstrap/shared/partition-cdc-propagation-subscriber.js:184-228`; seed bridge `bootstrap/owners/seed-runtime-bridge-owner.js:199-216`; joining bridge `bootstrap/node-joining-publication-activation.js:718-729`; grouped/safe topology and MG single/batch forwarding. | Parameterize the real seed/join entry, grouped/safe, single/batch and zero-target case. Compare ledger-derived identity at each actual handoff and decoded recipient native entries. Invoke the real joining method on its owner context; a whole joining bootstrap is a separate claim. | Restore three-field event reconstruction at either bridge, timestamp synthesis/filtering in MG normalization, or discard the successful forwarding result. Exact field/vector or canonical-result assertion fails after the recorded branch executes. |
| W3 RF1 completion and rollback | `message-group-service-raft-timing.js:35-81`; actual callback from `message-group-consensus-port.js:133-136`; `raft-rs-application-transaction-owner.js:60-98`. Adapt the real applied-state trigger control in `test/raft/raft-rs-backend/operation-port-ready-recovery.test.js:172-205`. | Register waiter before synchronous RF1 propose/apply. Receipt group/index/term matches independent retained native bytes and applied frontier. Force applied-frontier INSERT failure after actual cache application: cache population may remain provisional, but no receipt or source ACK exists; remove fault and ordinary replay obtains real afterCommit. | Settle on append/cache/diagnostic index or in the transaction before commit. The rollback/pending cut then exposes a forbidden receipt/ACK. Move registration after RF1 propose: the engaged native apply must finish but the bounded answer is UNKNOWN rather than the required committed result. |
| W4 RF3 custody and uncertain answers | Existing custody fixture's native APPEND hold/isolation/pump; actual MG ProposalQueue, result builder, router service-response owner and source ACK lane. | Observe a real local-uncommitted suffix without source ACK, then real application before accepting the result. Lose response after native apply; source stays owed and redrives the identical event. Duplicate recipient occurrences are allowed. Independently lose ACK result and require the same pending ACK bytes; first delivered index/term stays unchanged after replay. | Restore append-only success, acknowledge on ordinary/undefined return, mint a new source occurrence on retry, or rebuild an uncertain ACK. Native/frontier/owed or exact byte assertions fail at a named cut. |
| W5 semantic gates | `cdc/cdc-delivery-outcome.js:38-131`, `message-group-service-runtime-support.js:348-386`, `transport/message-router-pending-response-ledger.js:508-523`, source wrapper/driver. | Local committed/provisional positives require no counterfeit ACK; real remote positives require transport processing. Reject missing/extra/duplicate receipts, wrong group/digest/index/ordinal, unsupported positions, mixed valid/malformed batches and every F4 conflicting field. Zero targets still requires actual source evidence. All negatives keep debt and submit zero ACKs. | Remove one canonical contradictory-field/group check or accept ACK-only/noHandler. A returned semantic refusal/debt invariant must fail; validators cannot be tested only by importing their own predicate as the expected answer. |
| W6 budget and late answers | Existing timeout-budget owner; source invocation -> selection/subscriber -> topology -> router queue/response -> MG waiter. Reuse manual timer ideas from `message-group-proposal-deadline-wait-bound-spent.test.js`, not its fake port as native evidence. | Inject distinct clock origins, consume selection/queue/backoff time, hold timer callbacks while advancing now past expiry, then deliver a valid real result. Old caller remains UNKNOWN, no cell update/ACK; later fresh invocation can complete the same debt. Check exact-zero time and clearing on each creating clock. | Check timer-fired state instead of synchronous expiry, renew at a nested hop or accept a late pending response. An explicitly returned outcome or forbidden dispatch/ACK fails, independently of the outer test timeout. |
| W7 provisional formation progress | S2 plus actual source `partition-cdc-obligation-delivery.js:457-562`, semantic composition, subscriber factory and F3 route. | Run the single composite sequence below. Count every required full-vector source/target/subscriber observation; incomplete stays UNKNOWN, complete weak coverage releases the cursor without ACK, and fresh native coverage eventually permits committed source ACK. | Remove weak accumulation/aggregation, retain only native leaves, restart each attempt at subscriber one, or restore always-local addressed ingress. After the fixed engaged schedule, assert the actual typed result and B/native/ACK facts; an outer timeout is not the negative. |
| W8 memory and cleanup | Source lane reset/single-flight `partition-cdc-obligation-delivery.js:138-146,590-611`; positional ledger read `partition-cdc-obligation-ledger.js:125-138`; topology window and router outbound/response owners. Existing topology closure/stop suites are regression companions. | Read one full owed payload at a time, release SQLite before awaits, and visit exactly the existing 256-row quantum including provisional/pending skips. Hold an actual local child across expiry and tenure replacement; repeated nudges admit no replacement hydration/callback. After real close, retry resumes. Between attempts retain binding/tag/receipt metadata only; no payload, Promise, background entry/timer or caller list. | Release occupancy on timeout/cell reset before raw child close; preload the old 256-payload page; or encode all targets before a slot. Deterministic owned-operation/capture/queue counts exceed the stated bound before timeout. |
| W9 accepted size and fanout | S1 ordinary sessionless SQL; full event capture/codec; real topology enumeration, MG admission and real remote router. | Commit an ASCII payload of 2 MiB in a real CONFIG row and a smaller paired row; measure actual event/encoded frame sizes rather than infer a wire allowance. Separately capture 65 actual target group IDs, each backed by a distinct real native group, and an over-64 vector at the MG boundary. Complete every target without filtering. Active dispatches obey the actual configured window/per-node pressure; the total target count is not a cap. | Reinstate the rejected 1-MiB/64 total cap or flush-threshold truncation. The larger admitted event/vector/set yields an explicit refusal/missing exact receipt where the same smaller positive succeeds; restore the control and require final native/source ACK. |

For W8, count acquisition/release at existing capture, encode, send and raw
callback boundaries, correlate exact operation identities, and sample actual
router queue/pending-response statistics. A heap/RSS comparison alone cannot
prove ownership or number of retained copies. Retained bytes remain a function
of actual event/codec/string sizes and target metadata, not a constant-memory
claim. Slow-send completion must release the original operation, never a newer
one with the same event identity.

## W7: one finite composite, not separate convenient positives

Use the existing supported router window option of 2 with at least 3 captured
targets and multiple actual responsible subscribers; retain unchanged response
budgets/retry cadence. This makes the formation case smaller than the separate
65-group capacity case without weakening its more-than-one-window predicate.
All provisional and native answers in this decisive case come from actual MG
handlers. Schedule individually completable deliveries so the population takes
more than one source invocation; do not increase the timeout to fit it.

1. Pass S1/S2. Commit A then the actual SERVICES metadata B before the captured
   finite scan tail. Record why B is required by the recipient's real address/
   reconciliation owner. A's initial recipients have no usable native route
   and return exact canonical provisional results; the addressed role is native
   FOLLOWER throughout. A first partially covered subscriber must not hide the
   later subscriber from subsequent attempts.
2. At each owned expiry record UNKNOWN, no source ACK, unchanged A debt and
   local cleanup completion. Fair later attempts visit uncovered leaves. Hold
   one final target/subscriber once: repeated partial coverage cannot release
   B. Restore that exact live binding; a new live invocation now returns the
   canonical aggregate PROVISIONAL result and advances to B.
3. Confirm B actually reaches the recipient cache and existing reconciliation
   wake; read the new native peer/leader route, retaining the same FOLLOWER
   role. Do not manually replace a role, native status or selected route. The
   source drops all A optimization state at weak scan release, keeps A owed
   and reaches the captured tail under the normal visit quantum.
4. Let the existing provisional rescan revisit A from the unchanged ledger.
   Keep stale cache hints and a temporary pressure/safe-fallback episode.
   Require exact source and every target native afterCommit receipt, then the
   real source CDC_DELIVERED entry and its applied delivered flag. Restoring
   the old always-local follower rule must instead produce a visible retaining
   outcome despite the measured healthy native route.
5. Repeat the same bounded schedule with only weak-coverage accumulation/
   aggregation removed. All recipients still return their actual provisional
   observations, yet after the prescribed live composition turn A is UNKNOWN
   and B has not been visited; assert those facts against the positive's B/
   native/ACK acceptance. Also run wrong group/vector, delayed valid answer,
   same-text subscriber replacement, source/topology replacement and tenure
   reset while cleanup is held. None fills an unobserved leaf or overlaps a
   new hydration. Restoring the exact valid binding must release the scan.

## Execution and proof boundaries

### Production subscriber applicability census

The checked-in production census was repeated at
`c11c4ca266e78c815c9cd41954e351d20b182a41`; the relevant `src/` tree and the
original custody/release fixture files are byte-unchanged from the inspected
`68633168` source. Tracked JavaScript/TypeScript searches covered
`subscribeToCDC`, all `cdcSubscribers`/`cdcSubscriberWrappers` references and
direct `cdcDelivery.subscribe` calls, then followed the differently named live
query, managed replication and client notification adapters. The source owner
snapshots `owner.cdcSubscribers` at
`partition-cdc-obligation-delivery.js:486`, invokes every member at `:457-470`
and permits source ACK only through that lane. The sole production addition to
that exact Set is `partition-cdc-delivery.js:525-526`.

| Consumer | Actual registration/completion owner | Strict durable-source result applicability |
| --- | --- | --- |
| Initial seed hydration, replica registration, joining partition feed | `bootstrap/phases/seed-cache-hydration-cdc-subscription.js:109`, `bootstrap/bootstrap-service-replica-registration-methods.js:236`, `bootstrap/node-joining-publication-activation.js:325`; all install the shared propagation subscriber. | These are the three real registrations in the source ACK lane. Each must return the exact canonical source/target result; W2 exercises all three construction sites, even though seed and joining have two bridge implementations. |
| MG table subscription/re-subscription | `message-group-service-cdc-replication-runtime-methods.js:55-56` -> `message-group/cdc-handler.js:191-196`, a table-name Set; leadership re-subscription is `message-group-service-leadership-state-runtime-methods.js:69`. | This selects cache application eligibility within the MG owner. It does not register a partition subscriber or independently acknowledge source debt. Recipient completion remains native afterCommit for the actual propagated vector. |
| Managed split and merge replication | `partition-service-write-metrics-base.js:704-714` invokes the separate after-write mirror owners. Split `partition-service-split-mirror-queue-methods.js:44-70` owns ordered queuing/active replay; `partition-service-split-accessor-base.js:491-511` routes the real partition query. Merge `partition-service-merge-replication-methods.js:461-509,620-628` owns its corresponding queue/routed write; workflow acknowledgments remain that transition owner's responsibility. | No member of `cdcSubscribers` and no subscriber receipt conversion. Existing routed write/mirror completion and durable-log replay are separate obligations; this package neither certifies them nor replaces them with MG receipts. |
| Live query | `live-query/live-query-startup-wiring.js:168-287` registers `SystemTableCache.onCacheChange`, stores per-query handlers and calls the selected handler; `:304-318` injects that adapter into LiveQueryManager. | Downstream cache projection, not source-lane completion. Handler invocation/client delivery is not source ACK evidence, and its ordinary return must not be forced into a forged native receipt. |
| Admin/CLI clients | `admin/admin-websocket-api-base.js:203-205,280-289` installs a cache listener; `admin/admin-websocket-message-dispatch-methods.js:433-460,535-546` serializes and sends socket notifications. CLI `cli/core/connection-manager.js:243-254` consumes those notifications. | Downstream socket/client projection with its existing send/error owner, not a captured durable-source subscriber or recipient native commitment. No new client ACK protocol belongs here. |
| Joining connectivity, module mirror and debug coordination | `bootstrap/node-joining-cdc-subscription-and-backfill.js:230-243,290-291`, `wasm-service/module-mirror.js:276-290`, `debug-runtime/debug-coordinator.js:195-212` attach operation listeners to CDCIntegrationService. | EventEmitter consumers with their own actions; their return values are not awaited by the partition obligation lane. Preserve their existing completion boundaries. |
| Standalone CDC helpers | `PartitionCDCGenerator` owns a distinct Set (`partition-cdc-generator.js:97,113`); the partition service uses its envelope/hydration methods at `partition-service-cdc-stream-base.js:145-163`. No production `cdcGenerator.subscribe` caller or `CDCEmitter` import/construction was found. | Neither is an additional checked-in source ACK subscriber. Their standalone helper interfaces are not evidence of a hidden managed/client durable consumer. |

No overlooked production member of this source subscriber population was found.
This is a bounded static call-site/data-owner census, not a claim about external
callers or a complete correctness audit of the downstream systems. The public
partition subscription method can accept other callbacks: a future consumer
joining this durable lane needs its own explicit canonical completion contract;
do not label every callback an MG or invent native evidence for it. Test doubles
that currently return undefined must be classified by their actual exercised
lane and proof level. The stricter durable-debt gate cannot be applied blindly
to the unrelated cache notification APIs listed above.

Author component tests and native/composite fixtures in parallel by distinct
files; the root remains the only production author. The fixture-author handoff
must pin S1/S2 observations before claiming native engagement. Existing
`partition-cdc-obligation.test.js` O1-O19 uses controllable ports and undefined
subscriber acknowledgments; topology's current harness uses ACK-only stubs;
the MG service test-support class substitutes a controllable port. Migrate
their affected expectations through the canonical owner, keeping their lower
proof level explicit. They cannot supply receipts for W3/W4/W7/W9.

After independent source review, the minimal authored cone is the five files
above plus the process-loss variant when claiming crash recovery. Broaden to
the contract's existing O1-O19, bootstrap subscriber/bridge, topology stop/
retry/closure, MG forwarding/replication/native and transport contract suites.
Use project runner classification and locked-lab ownership. Run semantic
controls separately from the positive population, preserving exact source and
test hashes and the engaged behavioral assertion. If setup fails, stop and
classify that failure; neither missing fixture contracts nor unhit hooks count
as the required negative. No runtime, window arithmetic or memory bound is
measured by this plan.

Source/recipient cleanup must complete before releasing temporary directories;
failed cleanup retains them and reports actual remaining custody. Native
afterCommit is recipient acceptance, not source delivery: only source ACK apply
changes its ledger. The pre-existing wire-domain mismatch, original complete
cohort/opening authority, historical delivered-row classification, protected
activation/durable transfer and composed two-start acceptance remain separate.
