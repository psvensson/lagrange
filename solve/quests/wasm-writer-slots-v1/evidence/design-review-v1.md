# Content-bound design review v1

Reviewer: subagent `/root/completion_consumers`. Base `cdcb9c95f4bdb90e709ed4d20058b51cb193625f`. Reviewed `solve/quests/wasm-writer-slots-v1/DESIGN.md` SHA256 `6095ea04b32a7716ae9f51785abcc22cd8a911a7893af0b88eeebc96808fce7f`. Read-only; no source/test edits or native/unit test execution. A JSON maximum-width sizing calculation was performed as arithmetic, not execution evidence.

**REVISE the four bounded details below before source. Retain the user-selected writer-slot/generation/sequence/ack protocol and owner allocation.** No counterexample requires replacing that selection or reopening identity/persistent-schema policy. The Quest's eight missing receipts are an administrative proof gate, not a fabricated new semantic RED; the historical premature-success RED is preserved.

## All blocking details in this review

### B1. Admin pair bound fails the declared admitted field domain

DESIGN17 permits any UTF-8 serviceId up to128 bytes;20 allows only1024 bytes for the entire retained admin intent/result pair;38 defines fields. With a 128-byte service string consisting of NUL characters (valid under the written UTF-8 rule), three64-character hex fields, slot63 and maximum safe counters, compact JSON of the admin intent alone is1155 bytes. The result is additional. A common profile INIT can therefore establish an identity for which no legal admin transition fits its reserved storage. Even without control characters, the result encoding needs an actual calculation.

Resolve by defining a bounded identifier grammar/encoding and exact admin result representation, or by a justified larger pair reservation, and enforce the same complete maximum before INIT admits that service. The arithmetic total at21 is internally correct for the stated numbers; it does not prove encodings fit them. The public selected fixed64 slots are unaffected.

### B2. Application-time protocol outcomes need their own completion path

DESIGN40–42,50–60 correctly classify recycle-before-write and concurrent conflicts without new KV effects or sequence consumption. DESIGN62/68 only specify publishing a retained matching terminal receipt or environment UNKNOWN. Consider W(g1,s1) admitted and delayed; accepted recycle R is applied first; W then applies FENCED. Or distinct physical commands for same K compete and the loser reaches apply after a different C won. The loser has no matching retained success/refusal receipt. It must receive its actual typed apply-prefix classification afterCommit, not silently wait until the5000ms fallback or accidentally receive the winner's receipt.

Specify one afterCommit publication for all actual application classifications, bound to original instance/intent identity. FENCED/HISTORY_RETIRED remain unavailable historical detail, not assertions that an old attempt never committed. CONFLICT preserves the winner. No unbounded authoritative refusal rows are needed: the monotonic slot generation/sequence and retained winning content justify these classifications. Rollback cannot publish any committed classification.

### B3. Caller persistence is not yet a complete serialized boundary

DESIGN11 says persist pending before send and terminal before advance, one logical write/client/slot, but the injected adapter has no stated atomicity/serialization/failure contract. Attack: two submit calls inspect no pending intent; both await persistence; B overwrites A in storage before A sends; A's retained-before-send condition is now false. A terminal persist failure followed by in-memory advance similarly loses the only recoverable prior receipt. Multiple live clients using one adapter key need an explicit policy, not assumed caller discipline.

Specify synchronous per-client in-flight claim before any await; adapter key scope includes service/incarnation/slot/generation; same storage key needs compare-and-set/serialized ownership or an explicit exclusive-writer adapter guarantee. Persistent state transition failure must prevent delivery/advance and leave exact prior durable state; startup rehydrates pending/terminal state before send. Terminal response with K/content mismatch must never replace the current pending state. Adapter storage may be injected; no global writer service is needed. A crash between persisted terminal and next pending must reconstruct the right ack/sequence.

### B4. Common actual size-refusal inputs need a source

DESIGN62 promises deterministic size refusal and76 requires actual native refusal coverage. Current `SessionKVStore` stores mutable per-instance `_sessionSizeLimitBytes` and `_serviceSizeLimitBytes`, default null (`session-kv-store.js:89–110`), and current src contains no caller of setLimits. The profile states input command/value bounds but no common KV session/service enforcement values. A local setter is not a deterministic replicated precondition.

Select the production behavior concretely: common persisted profile KV limits (and enforce their only configuration path), or explicitly disabled local limits with a different actually reachable deterministic refusal rule. Do not create a native positive by setting different or unowned fixture-local limits. If all v1 values are guaranteed valid and limits disabled, state the absence of that refusal branch rather than claim it tested. Environmental failures remain rollback/UNKNOWN, never deterministic refusal receipts. This closes an existing owner-input ambiguity; it is not a demand for total-database quotas.

## Complete template audit (all 45 items)

### Owner interaction —10

1. Single owner: acceptable, DESIGN5–9 gives lifecycle admin and WASM application exact result, runtime atomicity only. 2. Typed seam: acceptable selected K/C and receipts24, but B2 completes nonterminal protocol classifications. 3. Paired invariants: completion outside runtime9,66 and completion-only negative76 preserve service/progress; no current proof claimed. 4. Stale→fresh: current-generation replay40 plus monotonic fences51–60 are coherent; no old reply upgrades new authority. 5. Pressure: bounded rows/buffers/waiters20–22; B1 exact encoding and B4 shared apply limits unresolved. 6. Canonical wake: afterCommit62/68, rollback68; B2 missing apply-refusal wake. 7. Projection authority: no current KV or transport ACK substitutes24/68; old local applied-index publication moves afterCommit62. 8. Treatment fidelity: v1 codec survives completion-only mutation76; originals preserved; source-only old codec reversion is rightly not required. 9. No fallback: raw handle admin forbidden5, no anonymous STRONG50, no new generic propose wait66. 10. Registry/proof: Quest declares same bounded unit and seven matching templates; live impact registration remains implementation obligation, not completed proof.

### Admission —7

1. Same predicate: durable admission repeated at prefix46; common inputs B4. 2. Transient/terminal: correct preproposal/refusal versus UNKNOWN68; B2 makes apply-protocol result explicit. 3. Budget: new max5000 local interest22 is not a raised transport/test timeout; must preserve earlier caller deadline, no timer beyond it. 4. Reason shape: named codes in table50–58 and actual accepted/error result62; exact response codec implementation must preserve category. 5. Release observable: afterCommit/recorded result68; bounded timeout is interest disposal, not custody release; B2. 6. Freshness: exact recycle state at actual prefix38 and apply46 prevent precheck-only authority. 7. Honest message identity: K excludes route24; client must verify response matches stored intent (B3).

### Concurrency —5

1. Synchronous gate: server before propose66 correct; client-before-persist gap B3. 2. Await TOCTOU: lifecycle exactinstance68 and immutable caller storage11; B3 specifies durable transition races. 3. Single winner: application CAS40 and single-row write state62 correct; exact duplicate join after content match66. 4. Timer reentry: no new protocol retry loop; max5000 interests need exact identity cleanup, generic TIMER unchanged66/74; no timer callback claim. 5. Lock scope: server K versus slot target correct24/66; caller adapter key/exclusive ownership must be stated B3.

### Recovery/replay —5

1. Stale cannot clobber: exact instance/intent68, retained admin receipt40; caller reload B3. 2. Restart/live: current format before serving72, no volatile registry as authority; initial schema inspection32 properly refuses retained legacy. 3. Lost enlistment: N/A to single-group KV, no TX participants; slot ownership is durable and cannot be inferred from local absence. 4. Replay: exact retained C54 and A/B/A62, acknowledged nextseq57 and monotonic oldgen/oldseq fences51/53 are sound; table requires no rollover18. 5. Absence: missing established row32 failsclosed, unavailable history60 not NOT_COMMITTED; snapshot unsupported74 honest.

### Retry loops —7

1. Retry must fire: no autonomous retry driver is proposed11/38/68, caller explicit retained redrive; unavailable storage must stop typed (B3). 2. Frozen bound: caller finite deadline capped5000 at22; no persistent unknown query loop introduced. 3. Every stop: source needs named outputs for all table dispositions and environment/lifecycle68; B2 supplies missing apply exit. 4. Mutual suppression: runtime does not await strong caller9/66; no self-commit deadlock. 5. Storm ceiling:64 unique/4 duplicates/128 waiters22 bounds local interests, not consensus copies; report explicitly excludes retained logs. No global throughput/liveness claim. 6. Duplicate safety: apply and retired fences60 handle late duplicate physical entries, no reexecution after B; admin receipt survives writes40. 7. Reset: only persisted actual terminal receipt before next ack11/57, not CORE_OK; adapter failure must not reset B3.

### Transport —5

1. ACK not processing: actual receipt afterCommit24/68, helper acceptance66 separate. 2. Late response: exact K/content and instance publication68; caller persistence matching B3. 3. Outcome classification: redirect/lostreply retained11, typed nonleader/admin5; future wire classification remains implementation proof. 4. Missing recipient: local bounded interest22 plus existing delivery budget; no indefinite generic wait or timeout increase. 5. Stub fidelity: no fixture yet, N/A as executed evidence. Future native76 must use actual current codec/INIT/enrollment and real packets, not canned receipt.

### Harness fidelity —6

1. Right-reason RED: original historical premature-success remains; new missing receipts are not semantic RED, v1 mutation76 must reach named assertion. 2. Honest seam: new helper/storage adapters must execute the real selected request builder and application owner; no mocked commit. 3. Time: max5000 local interest is selected contract22, not permission to increase test waits; zero-time schedules cannot prove deadline firing without real owned clock. 4. Field fidelity: exact canonical schema/profile/ack/admin receipt fields before tests24/38; B1 maximum widths, B3 storage shape, B4 actual refusal inputs. 5. Vacuity: new positive must show actual native proposal plus unchanged preheal commit/applied/KV, then same caller success after heal76. Invalid-ID refusal/zero matched log entries cannot satisfy it. 6. Live binding: native first-run receipts remain missing, not inferred from design; current samefile recovery and snapshot-HOLD74 correctly distinct.

## Scope conclusion

INIT as replicated common incarnation, fixed64 slot rows, explicit trusted local admin, generation fences, acknowledged sequence retirement, afterCommit publication, anonymous STRONG refusal, clean-break oldformat and separately held snapshots are coherent selected semantics. Same-key A from slotX then B from slotY then retryA returns old A without changing B. Same-slot A→acknowledged B retires A and returns HISTORY_RETIRED, not a fabricated exact answer. Both are valid and need separate witnesses.

Resolve B1–B4 in this contract; then content-bound review can approve source implementation without a new general model. No change to the runtime drain owner, F1 supersession, existing ASYNC/TIMER acceptance semantics, main merge or complete-release activation is recommended. Any other unimplemented proof obligation is classified as a future witness rather than a new policy veto.
