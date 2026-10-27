# Independent WASM completion-owner contract audit

Read-only audit by subagent `/root/completion_consumers` at `d9b6872638166eb4ef5286399fa0fb4f99a73d4f`, isolated worktree `/mnt/data/peter/projects/.worktrees/wasm-completion-contract-20261016`. No source/test edits, test execution, dependency changes or lab jobs. Loaded actual AGENTS → rules → router, architecture/runtime and authority/recovery owners, and all six requested verification templates. Prior native premature-success evidence is preserved, not rerun.

**Verdict: HOLD implementation pending explicit caller-identity, persisted-result and retirement/compatibility decisions. Existing owners supply the correct atomic application seam and lifecycle boundaries, but no existing complete mechanism satisfies the requested contract without new boundary and persistent-format choices.** This is not a recommendation for a new consensus authority or a second result service.

## Actual source chain and owner map

| Stage | Source/function | Existing behavior | Required change/decision |
| --- | --- | --- | --- |
| Runtime creation | runtime/runtime-startup-wiring.js:74–78; runtime/wasm-component-driver.js:396–417,508ff; wasm-service/wasm-service-lifecycle.js:182–218 | Creates the lifecycle, selects the consensus-replica branch, constructs replica with service group, replica identity, durable DB and router. | Preserve this owner. Architecture runtime-components273–282 is stale about no production initialization; do not infer unreachable behavior from it. |
| Incoming write | wasm-service/wasm-service-replica-lifecycle.js:89–94; wasm-service-replica.js:320–337,388–411 | Registers actual transport handler; payload is message.payload or message; write uses only sessionId/key/value, returns forwarding hint if not leader. | The request-producing/caller retry owner and an immutable operation identity must be selected. No stable write-ID builder was found in inspected src callers; handler remains callable and lifecycle is wired. This absence is a contract gap, not proof the handler is unreachable. |
| Transport correlation | transport/message-router-delivery-behaviors.js:183–191; message-router-shared-vocabulary.js:374–381 | Delivery budget, generated/furnished messageId, correlationId and optional diagnostic requestId. | These are not proof that the caller retains the same semantic identity after timeout/redirect/restart. Never silently promote them into durable request identity. |
| Admission and encoding | wasm-service-committed-command-admission.js:31–41; wasm-service-committed-command-codec.js:22–43 | Admits by command type only. Copies entry and base64-encodes bytes/string/JSON value; undefined omits encoded value. | Define canonical domain/identity, immutable content, maximum lengths and exact bytes before proposal. Preserve semantic distinction between effect bytes and routing/phase metadata. |
| Proposal | wasm-service-replica.js:422–437 | Generic helper checks admission, proposes encoded command, treats CORE_OK as accepted, throws typed consensus-bearing Error otherwise. | Keep generic proposal acceptance semantics. Register strong-write waiter before invoking it; do not await application inside the serialized runtime turn. |
| Committed application | wasm-service-consensus-port.js:164–191; raft/raft-rs-operation-port.js:116–122; wasm-service-replica.js:308–311; committed-command-codec.js:59–98 | Existing consensus supplies command/index/term/effects; applies via SessionKVStore and returns its result. Generic port currently converts positions to Number. | Persist immutable outcome and exact content match in this application transaction, then notify live waiter only through effects.afterCommit. Decide position representation without claiming exact 64-bit values from rounded Number. |
| Atomicity | raft/raft-rs-application-transaction-owner.js:50–100 | Synchronous callback plus applied state transaction; afterRollback on failure; afterCommit after durable transaction returns; effect failure cannot undo commit. | Reuse this owner. Store outcome with effect/applied boundary; afterCommit only completes volatile waiters. AfterRollback cannot signal successful application; failed notification must remain resolvable from durable outcome. |
| Storage | wasm-service/session-kv-store.js:36–67,89–110,153–178 | Only latest value keyed by session/key plus local Date.now updated_at; limits default null; applySet returns accepted/error. No request identity/outcome/tombstone. | New typed outcome representation within WASM application/storage owner is required. Existing KV value or timestamp is not a historical result. Selected result must include actual deterministic application refusal, not caller-requested success. |
| Runtime/lifecycle loss | wasm-service-replica.js:517–526,691–698; replica-lifecycle.js:204–227; consensus-port.js:241–284 | Demotion stops timer/broadcast activity; shutdown retires exact handler, port and DB with single-use instance. No strong-write completion registry to settle. | Add bounded volatile waiters owned by exact replica incarnation. Unknown after possible proposal; missing local waiter/demotion is not discard. Resolve after later authoritative outcome/replay, without automatic new identity. |
| Restart | replica-lifecycle.js:76–88; raft-rs-runtime-owner.js:416–447 | Same durable DB reopened, KV created, native core restored at durable applied position. | Persistent result state must reopen before serving/replay. Already-applied commands need not replay merely to recreate lost volatile receipts; durable rows are needed. |
| Snapshot | raft/snapshot-checkpoint-store.js:262–312 | Inspected native checkpoint scrubs application tables and preserves peer identity. | Existing application-image/native import owner must include KV + outcomes + retirement protection at one applied boundary. Intact process restart is not snapshot/install proof. No second WASM snapshot implementation. |

The architecture index describes current request Cells as ordinary-table users; those are distinct from this consensus-replica route. Do not route this repair into current WASI table writes without a separate architecture decision. `wasm_operations` is management workflow state (`operation-lifecycle.js:1–16,65–122`) persisted through SQL, not this group's atomically applied KV-result owner.

## Minimal counterexamples / unresolved decisions

1. **No identity is distinguishable:** A sets (s,k)=a; B sets (s,k)=b; the bytes of A arrive again. Current handler reconstructs A and applies a. The receiver cannot distinguish retry-A from a legitimate third identical-content write. A process-local map or content hash cannot restore that missing distinction after restart. Select caller-retained K, namespace/incarnation and duplicate-content contract before coding.
2. **Conflict matching:** Same K with a versus b must not borrow original success or overwrite it. The selected canonical payload must be sealed before the first asynchronous handoff, include service/group and operation scope, and survive reroute/retry. Session/key identify the target, not the mutation. Existing codec normalization alone is not canonical request identity; JSON object property order and undefined/null/byte/string distinctions need an explicit choice.
3. **Frozen identityless witness:** Existing native fixture102–103 submits only operation/session/key/value; its exact bytes require the same caller to succeed after healing (completion.test.js:38–43) and match the old encoded command (fixture165–170). Requiring request ID now refuses this witness; server-minting an invisible ID cannot make caller retries safe and alters its expected proposal bytes. Choose explicit anonymous compatibility semantics or reviewed witness/contract supersession; do not silently redefine its success, synthesize identity from content, or weaken it.
4. **Register/apply race:** A valid RF1 or already-serviceable runtime may synchronously apply before propose resolves. Installing waiter after awaiting CORE_OK loses completion. Install synchronous identity-scoped waiter before proposing, with durable replay precheck and deterministic apply-side replay check. Coalesce exact duplicates but count actual command occurrences separately if resource accounting covers them.
5. **Actual refusal:** applySet may return accepted=false on size limit while consensus still commits/applies. Only the recorded deterministic result may answer the caller. Environmental throw rolls back effect/outcome/applied marker and cannot be converted to durable terminal refusal. Current setLimits has no production caller in src, so current configured enforcement is not a demonstrated production scenario.
6. **Lost notification/restart:** A commits, DB retains its value, afterCommit notification is lost, process restarts, B overwrites same key. Without A's result record, neither current value nor appliedIndex answers A. Durable result must precede local success and remain readable independent of local waiter or current leadership observation.
7. **Finite retention is a protocol:** With arbitrary unbounded request IDs, finite rows/bytes plus permanent exact replay are incompatible without a bounded identity universe, acknowledged retirement/frontier/generation, or explicit outcome-unavailable semantics that forbids reexecution. Silent TTL/LRU deletion produces A/B/retire-A/retry-A → reexecution. The owner must select replay horizon and retirement protection, atomic capacity exchange, maximum request/result bytes/counts and admission behavior. Per-session latest result alone loses A after B; pinning every uncertain result is not a finite bound.
8. **Capacity custody:** Caller timeout releases waiter resources, not the obligation of a potentially ordered command. Any bound claiming pending future results must account for native/core/Ready/durable occurrences across leadership change; a local waiter count cannot prove it. Already accepted history cannot be refused differently by a follower's local resource pressure. Separate logical retained-result bound from WAL/pages/log/snapshot pins.

No existing public caller identity, fixed schema or retirement policy closes these gaps. Therefore a narrow afterCommit-only patch can fix the measured early response while still violating the newly requested restart/replay/boundedness contract; it must not be presented as the complete repair.

## Category-complete audit

Each item below is an audit of current mechanism and required proof, not a passing implementation certification.

### Owner interaction (all ten items)

1. Single decision owner: strong-write result belongs to WASM committed application (`replica308`, codec87), not runtime CORE_OK or current KV read. Missing durable result representation blocks closure.
2. Typed boundary: port supplies immutable committed record/effects (`operation-port116`); current wrapper drops this distinction (`replica410`). New caller result/refusal/unknown shapes require selection.
3. Paired invariants: caller success after actual apply AND runtime remains free to replicate. Existing native withheld/healthy files measure first; blocking generic propose would violate second. New same-schedule candidate/reversion proof required later, no run here.
4. Stale/fresh: demotion→later outcome must replace uncertainty through exact durable lookup (`onBecameFollower517`, open76); no permanent stale veto or new ID. Interface absent.
5. Pressure: `SessionKVStore89–110` has no result quota, pending count or byte reservation. No finite complete claim available.
6. Wake: effects.afterCommit (`transaction-owner98`) is canonical completion wake; rollback/lifecycle require typed exits. No extra polling authority needed; lost wake must leave durable result available.
7. Projections: `SafetyInterval`, role, current KV and transport ACK are not exact-result authorities (`replica309–311,373–375,410`). Do not promote them.
8. Treatment: existing test is frozen at published bytes; predecessor/candidate strong-write RED preserved. Future correction must keep exact witness or explicitly supersede incompatibility, no criterion-only success.
9. No escape: current `_handleWrite` bypasses application completion by accepting CORE_OK. Fix that owned interaction, never generic port commit-wait or partition outcome-table alias.
10. Registry: existing `raft-rs-runtime-application-transaction` / lifecycle impact pairs include owners, but WASM identity/outcome/retirement witness contract must be registered with the implementation unit. No metadata edits here.

### Concurrency / serialization (all five)

1. Synchronous gate: no current waiter gate (`_handleWrite388`); install before proposal, backing replay with durable transaction. Awaited query alone is insufficient.
2. Await TOCTOU: leadership precheck388 precedes propose431 and response410. Later role change yields historical result/unknown, never a fresh leadership claim. Shutdown exact instance check belongs lifecycle204.
3. Single winner: deterministic apply-side K/content lookup and insert in one transaction required; same K concurrent request may join, conflicting bytes cannot claim same waiter. Existing KV upsert does not provide this.
4. Timer reentry: `TimerManager87,107,168` uses generic proposeEntry. Keep acceptance semantics; timer-callback correctness is out of this task. No new timer or callback proof inferred.
5. Resource scope: logical gate must key group + immutable mutation identity, not only key/session or delivery messageId. Whole group application is already serialized transactionally; no new mutex authority needed.

### Recovery / replay (all five)

1. No stale clobber: future replay lookup must not overwrite exact live waiter registries during reconstruction; current instance is single-use (`replica-lifecycle124–144`). No new reconstruction map implemented or certified.
2. Restart discriminator: lifecycle new instance + same DB (`openReplica76`) versus existing live instance. Persisted result survives both; volatile waiter is instance-local only.
3. Lost enlistment: N/A to this single-group KV mutation (no TX participants enlisted); do not borrow TX1 settlement authority.
4. Idempotence: A/B/A fails current schema/UPSERT (`store153–178`). Outcome + effect rollback together at transaction-owner60–95 is available; exact K/content/retirement state absent.
5. Absence: missing outcome after timeout/restart is not NOT_COMMITTED. Selected retired/unavailable/unknown response required; snapshot scrub312 makes intact-restart claims insufficient.

### Admission / gating (all seven)

1. Same predicate: admission currently only type (`admission31`); actual size enforcement in applySet154. Future schema/byte checks and quota precheck must align with deterministic application; follower local debt cannot alter result.
2. Classification: CORE_REFUSED and HOST_FAILURE are distinct, while `proposalRefusedError` carries consensus without durable disposition (`codec105`). Define before-custody refusal versus possible-effect unknown; no blanket retry classification.
3. Budget: router has existing deliveryTimeoutMs (`delivery-behaviors183`) but replica receives no original deadline; cannot simply invent a new wait duration. Name propagation and waiter-lifetime owner or return decision blocker.
4. Reason shape: preserve error.consensus/reason and explicit new semantic state (`codec105–111`); `{accepted:true}` cannot encode durable application refusal.
5. Release observable: afterCommit/durable lookup is fulfillment; actual role/recovery availability may allow retry but grants no result. No latency measurement performed here.
6. Freshness: apply-side check at actual prefix must decide result; earlier leader precheck cannot guarantee later completion. Replay result stays historical.
7. Honest IDs: emitted uncertainty must name original K and target group, not newly minted transport messageId or current leader. Current handler has no such K.

### Retry loops (all seven)

1. Retry firing: no strong-write retry owner exists here; transport timers do not resubmit durable application intent. New automatic loop is not approved. Exact caller retry contract required.
2. Frozen bound: unreadable result store must answer typed unavailable/unknown under original caller budget, not keep polling forever. No existing bound propagation into _handleWrite found.
3. Stops: pre-admission refusal, deterministic applied refusal, afterRollback environment failure, timeout, demotion, shutdown and effect notification failure all require distinct retained consequences. Current generic throw is incomplete for this contract.
4. Mutual suppression: never hold runtime turn awaiting its own commit; afterCommit callback can resolve external waiter while runtime processes replication. Owner seam supports this without new scheduler.
5. Storm ceiling: no complete per-identity/result bound exists. Duplicate coalescing alone cannot bound distinct IDs or discarded waiter obligations; quantify only after capacity decision.
6. Duplicate safety: currently target UPSERT is not A/B/A idempotence. Future retry must read exact recorded result and apply-side dedup, never redo A after B.
7. Reset: CORE_OK or transport ACK cannot reset completion/custody; only durable result or authoritative discard can settle relevant debt. Existing proposal helper deliberately remains acceptance-only.

### Transport / delivery (all five)

1. ACK versus processed: native envelope handler returns acknowledged after step (`replica322–328`); strong write must return own result, not borrow transport ACK. Delivery semantics do not supply application commit.
2. Late response: router pending ledger23–58/retired waiter tracking is volatile correlation; timeout does not erase a possible durable result. Future local waiter disposal cannot cancel application/custody.
3. Classification: new result shape must be mapped at actual caller/transport consumer; caller identity/decoder remains unresolved, not guessed from `requestId` diagnostics.
4. Missing recipient: router deliveryTimeoutMs exists; extending write waits must preserve that original budget and still type uncertain possible-effect outcomes. No timeout increase or indefinite waiter permitted.
5. Stub fidelity: N/A to this read-only audit, no new stub/test. Frozen native fixture uses actual operation ports and controlled real packets; its identityless payload is a contract compatibility issue, not authorization to manufacture ID.

## Smallest content-bound decision packet before source

Select (A) the actual caller-retained identity and canonical byte contract including old identityless requests; (B) a WASM-owned persisted outcome/retirement representation in the same DB/transaction, with numeric encoding and capacity calculus plus reopen/snapshot ownership; and (C) bounded exact-instance waiter uncertainty and existing deadline propagation. Then independently review those exact choices and freeze the complete native acceptance matrix: early apply/register race, withheld quorum, deterministic refusal, afterRollback, late response, role/shutdown loss, same K/conflicting bytes, A/B/A before/after restart, retention boundary and saturation, and intact recovery versus supported snapshot recovery.

Do not force `_partition_statement_outcomes` reuse: its schema is SQL changes/rowid/entry-key semantics and its constants explicitly defer compaction to another quest (`partition-committed-statement-outcome-constants.js:9–22`). It lacks this task's canonical content and completed finite retirement policy. Reuse the generic atomic application mechanism, not unrelated authoritative data. Likewise `wasm_operations` management journal cannot atomically settle this separate consensus group's KV application.

This gate does not authorize production edits. No broad runtime patch, timer expansion, release commands, snapshot duplication, F1 supersession or re-execution of prior native evidence is recommended.
