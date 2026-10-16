# Independent message-group custody pre-execution review

Reviewer subagent:/root/completion_consumers. No native execution performed.

Reviewed SHA256:
- message-group-native-custody-fixture.js: 5e5563086f1ec892c757be21d09486b3ac3951ac4288163619a6c8376c3bd833
- message-group-native-custody-handoff.test.js: 613028234b1c75ad6c1faa271b19409b881374b41e91df148ba8e1956a307a99

Verdict: HOLD first execution pending the following test-only corrections. Production changes are outside scope. All findings below belong to this pre-run review, not a native failing result.

F = test/message-group/message-group-native-custody-fixture.js; T = message-group-native-custody-handoff.test.js.

## Findings

1. Harness/owner-interaction: T127-130 requires every producer obligation delivered=true before the cut, then T161-163 requires an owed copy at the same cut. The final RED is entailed by the unsafe precondition. A conforming producer that retains custody times out before the invariant. Replace this with a fixed bounded schedule that reaches actual subscriber settlement and the existing source ACK flush/application owner if it occurs, independent of the desired disposition. Capture both outcomes and assert custody retained or recipient committed application. A setup timeout must not be classified as a semantic custody failure.

2. Recovery/replay: T140-160 isolates the old leader but never removes/replaces its exact uncommitted occurrence: its DB still holds it and all old transport bytes remain retained. A new quorum without the event is real evidence, but does not itself execute the requested controlled loss of that occurrence. Add a real rejoin/new-leader suffix replacement (assert actual term/index/data) before source redrive, or report that exact loss/replay seam as unproved. Do not delete rows or treat isolated custody as authoritative discard.

3. Resource ownership/cleanup: T45-48 stops cleanup if release owners fail, skipping producer group disposal. F78-82 stops at first replica shutdown failure, skipping other acquired replicas/router. F67 creates router activity before registering cleanup. Register cleanup before initialization; attempt all owned shutdowns and retain directory on any failure, reporting aggregate first failures. This is test-fixture custody only.

## Harness fidelity checklist

Right-reason/vacuity: finding1. Live binding is otherwise actual: T118 invokes real PartitionService.applyWrite; T115 actual subscribeToCDCWithHandshake; T87 production buildPartitionCdcPropagationSubscriber; T100 actual bridge; F95 actual MessageGroupService, registered production handler F101. No native result is mocked. Source data is inserted by real committed write, no table row deletion appears. Event source identity is retained T95-97; add explicit cut binding to the exact event/producer obligation and recipient proposed bytes in final evidence.

Time: recipient F37-58 fixed 64 rounds, captured batches, zero virtual elapsed time, no measured status reads. Source uses real clock/deadline and T127 passive durable polling; its native timers may progress source but cannot release held recipient envelopes. The unsafe outcome-specific wait needs correction. Setup F106-122 and loss T145-153 explicitly tick/read status; those are declared actuations, not passive evidence.

Field fidelity: full services identity rows are fixture routing prerequisites; real membership derives from native bootstrap/ports. Recipient entries T57-64 match the unique key; for exact identity claim retain entire encoded command and source eventKey/log position. Cache leader preapplication is not equivalent to commit: F27-30 pairs cache with durable record; T135-138 explicitly differentiates leader prefix and followers.

## Owner interaction checklist

One durable producer obligation owner: partition-cdc-obligation-ledger.js readCdcObligation returns exact event key, delivered flag, deliveredIndex/Term. Delivery owner partition-cdc-obligation-delivery.js:457-474 awaits every actual subscriber then acknowledgeDelivered; CDC_DELIVERED application alone marks delivery. Test never writes that flag directly.

Actual producer-to-recipient path is source-backed. buildPartitionCdcPropagationSubscriber awaits propagatePartitionCDCEvent but does not return its result. SeedRuntimeBridgeOwner:195-210 constructs tableName/operation/data/sourceMessageGroupService, omitting eventKey/sourcePartition. CDCGroupPropagationService:405-450 calls actual sourceMessageGroupService.applyCDCEvent then reports propagation success by fanout result. This is a concrete production identity/result handoff gap to attribute; do not replace it with completeCdcPropagation or buildCommittedCdcOutcome in the fixture. Neither helper's existence proves this route consumes a committed result.

The counterpart recipient is actual RF3; native core envelopes enter the same runtime. Test cache observations are diagnostics, never a substitute commit receipt. Source selector readiness is actual, no OPEN/CLEAR/leader flag assigned. Pressure/capacity/retry guarantees beyond one event are outside this packet. Registry/impact metadata is principal-owned and still required. No local fallback or new authority was introduced by test.

## Transport checklist

F69-76 returns a fixture custody ACK only for actual core envelopes, retains bytes and later delivers through original MessageRouter; non-Raft messages retain original route and options. That ACK is not recipient processing or commit. F42-46 cuts specific old leader and data-bearing Append frames. No response/result fabrication is used. Missing handler will fail actual MessageRouter path; no custom success hides it. Late-response/noHandler general production classification is not certified. Native proposal and actual CDC propagation responses must be retained separately.

## Concurrency/serialization checklist

The transport captures queue extent per round F39, keeps later arrivals for later rounds, does not mutate consensus state. Native scheduling remains actual owner; no claim/lock override or second core. Source CDC delivery single-flight is production driveCdcObligations:590-612; a caller joining may get JOINED_IN_FLIGHT rather than completed drive, so final source-redrive result T155 must be interpreted by its actual state, not merely awaited. Do not assume a joined result proves replay finished. The new schedule should wait through existing owner diagnostics/settlement with an explicit finite bound. Tests do not certify global runtime quotas or recurrent-input fairness.

## Recovery/replay checklist

Finding2: isolate is not suffix discard. Original source row persists T73; there is no manufactured deletion. Re-drive uses actual CDC obligation owner T155, but may join (see above). Sender delivered history must not be inferred to have replayed from an empty owed list. No crash/snapshot install, total-data-loss or startup registry proof is present. A superseding native leader must visibly overwrite the exact suffix if that loss claim remains.

## Admission/gating checklist

Actual selector readiness T89-93 and F115-116; no bypass. The table is explicitly subscribed F104. No production timeout increases. Formation/recipient unavailable errors are setup gaps, not evidence that a committed event was dropped. Reason/identity diagnostics currently retain exact event and propagation result; final corrected trace should also retain source lane typed flush/drive result to distinguish delayed admission, in-flight and retired.

## Retry checklist

Existing producer deadline/retry remains owned by partition CDC, not a new loop. Fixed transport rounds do not retry a source write. Source redrive is explicit one invocation; JOINED_IN_FLIGHT is not completion. No attempt reset or artificial duplicate; duplicate/exact replay must be observed from actual event identity. Storm ceiling and arbitrary subscriber churn remain outside scope. The final invariant must allow genuine retained custody instead of requiring a dropped obligation in setup.

## Stop boundary

Await corrected exact hashes and independent final re-review. No first native execution yet; no production changes requested. Any later pass proves only this source→subscriber→bridge→topology→recipient route and schedule, not arbitrary fanout, snapshot recovery or complete release protocol.

# Corrected pre-execution byte review

Final fixture SHA256 a10f1462a1248121022399ad0777be7a95a4ffdc405a12f0ad5ead68bae58a0e; final test SHA256 4818de9c31d0669aa95d152431ed12b720965e4c477e0765d0737a670be60c28. Verdict: APPROVE these exact bytes for first locked native execution. No native tests executed by this reviewer.

Original findings are resolved:
1. No delivered=true precondition remains. Fixed recipient schedule is followed by one explicitly named real source flushCdcAcknowledgements actuation; its actual EMPTY/pending/committed result and source lane/rows are retained. The final invariant reads the active source leader's exact owed identity, preventing a lagging follower's old owed bit from being false assurance.
2. After actual surviving-quorum election, old recipient reconnects, retained old-term traffic is delivered normally, and the test requires the exact event absent from all three native logs before source re-drive. Old-leader preapply cache is retained as a differing observation, not rewritten as committed state. No fixture DB/cache deletion creates the loss. The actual source drive Promise result and lane.inFlight are observed; after the custody invariant, surviving quorum must have an actual event log entry committed and applied as well as the cache value.
3. Recipient cleanup is registered before router initialize, attempts all replica shutdowns and router shutdown, and retains directory on aggregate failure. Producer attempts both release-owner and group shutdown, retains directory if owner cleanup failed, and reports aggregate failures.

Category-complete final assessment:
- Harness: exact source eventKey/sourcePartition/positive sourceLogIndex and original source row are checked; final identity after re-drive is unchanged. Native retained proposal and unavailable quorum remain non-vacuous prerequisites. First run still may reveal a setup gap; no source bug is inferred from that. Semantic RED is only SOURCE_CUSTODY_RELEASED_BEFORE_RECIPIENT_COMMIT reached after actual native source/recipient history observations.
- Owner interaction: production chain remains unchanged; no committed receipt or alternate subscriber is inserted. Selector/callback adapters delegate actual functions, and actual bridge propagation result is preserved diagnostically. Seed bridge identity omission and subscriber non-return remain candidate owner findings pending execution, not repaired here. The configured topology contains this one message group; no multi-group fanout target or production topology publication proof is claimed.
- Transport: exact old Append bytes remain in held queue until explicit rejoin, then traverse original MessageRouter. A custody ACK is still distinct from native commit/application. Native election, suffix replacement and re-drive are explicit post-cut actuations, not passive observers.
- Concurrency: source lane result/inFlight now distinguish joined request from finished work; final replay commit/apply checks prevent cache-only completion. Fixed transport batches retain later arrivals. No extra scheduler/lock/claim owner.
- Recovery: actual suffix replacement supplies the previously missing loss action; no row deletion or source data loss. Full process crash/snapshot recovery remains outside scope. Replayed semantic event retains its durable source identity even though ordinary stream sequence may change.
- Admission: actual readiness/selector and native membership retained; no fabricated admission flags, timeout changes or preselected discharge outcome.
- Retry: one explicit source flush, one explicit source redrive, finite native election/transport rounds; no retry-until-green. A future retained-custody path must actually redeliver and commit/apply on the new quorum to pass the full file. Replay rejection/pending or unavailable fixture surfaces fail explicitly and are not completion.

First run must preserve raw before-cut, suffix-replacement and redrive records, typed flush/drive results, commands/host/ref/exit status. This is execution approval only; no complete release protocol, F1 supersession, general CDC correctness or production fix is approved.
