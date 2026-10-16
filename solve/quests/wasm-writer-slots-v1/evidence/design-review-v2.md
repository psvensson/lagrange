# Content-bound design review v2

Reviewer: subagent `/root/completion_consumers`. Base `cdcb9c95f4bdb90e709ed4d20058b51cb193625f`. Exact reviewed DESIGN.md SHA256 `88aac7efaf67b15d646df27aec0f88a39f2846c86a4ebb8b64b30b05ec043bf3`. Prior review `design-review-v1.md` remains unchanged. No source/test edits or tests/native executions performed in this review.

**APPROVE this concrete contract for the authorized review-only implementation unit.** B1–B4 are resolved at design level. This is not approval of source not yet reviewed, native correctness, snapshot support, merge, F1 supersession or the complete release. The specified proofs and encoding checks remain required before claiming implementation completion.

## Resolution of all prior blocking findings

**B1 — encoding/capacity:** The admin intent/result reservation is now4096 bytes. It covers the identified1155-byte maximum-width intent counterexample with room for the bounded retained result; the old1024 claim is withdrawn. The complete logical projection is correctly revised to `4096+64*(49152+2048+4096+512)=3575808`. The profile explicitly accounts for JSON escaping and base64 expansion, requires exact maximal supported shapes to be checked in the codec before the source checkpoint, and forbids INIT of an identity that cannot subsequently enroll. This is an implementation acceptance requirement, not a fictitious completed byte measurement. Commands, receipts, metadata and separate admin records must each enforce their own encoded maximum; truncation is forbidden.

**B2 — apply-time refusal completion:** The application transition now publishes protocol classifications afterCommit to the exact submitted digest without adding durable refusal history. Recycle-before-delayed-write, same-K/different-C conflict and retired-detail answers are distinguished from retained terminal write receipts. No winner's receipt can settle the conflicting interest, and rollback cannot publish a committed classification. This closes the missing response path without creating another result authority or unbounded rows.

**B3 — caller persistence:** The helper claims locally before the first await and requires cross-helper/process atomic revision CAS, not plain get/set. Pending is durable before delivery; terminal receipt and pending removal are one atomic update; failed terminal persistence cannot advance. Restart rehydrates the exact pending identity. Stale CAS completion cannot overwrite a successor. The specified storage-uncertainty response is important: implementation must never interpret an ambiguously failed CAS as proof the durable write did not happen or perform compensating deletion. Definite no-effect failure may preserve the prior record; ambiguous adapter failure must reconcile the actual revision before sending/advancing. These are consequences of the written CAS/uncertainty contract, not a new storage service.

**B4 — deterministic limits:** Strong-write apply receives explicit common persisted profile limits of65536 value bytes/session and1048576/service, derived from replicated KV rows, rather than mutable local setLimits. ASYNC/TIMER use their existing separate semantics. Therefore replicas see the same strong-write acceptance/refusal at a given application prefix. Refusal consumes the admitted sequence with its real receipt; environmental failure still rolls back effect, result and progress. Prior ASYNC state may put the service over the strong profile and cause refusal; the design explicitly permits this and does not claim the strong limits bound total KV or database storage. The implementation must pass profile limits without transiently mutating global/local default limits used by other command paths.

## Category-complete reconsideration

All45 items from the original seven-template audit were revisited. The following disposition covers each item; source links and detailed attacks remain in v1 and ownership-seams.md.

### Owner interaction (10)

1. Single result owner remains WASM committed application; lifecycle only authorizes trusted admin intent. 2. Typed command/receipt/protocol-disposition separation now covers all apply outcomes. 3. afterCommit completion remains outside the runtime turn, preserving paired service/commit progress. 4. Older responses cannot upgrade a newer generation; exact replay and fresh admission remain separate. 5. Common limits and finite state now have explicit inputs/bounds. 6. Every applied classification has canonical afterCommit wake, rollback has UNKNOWN. 7. Current KV, role, transport ACK and projection do not grant completion. 8. Completion-only mutation retains the v1 protocol/codec rather than reverting to a missing-command predecessor. 9. No anonymous STRONG fallback, raw remote admin flag, generic commit wait or second result service. 10. One Quest contains implementation, registry and proof obligations; those are not already certified by this review.

### Admission (7)

1. Durable prefix classification and explicit common apply limits align. 2. Preproposal/protocol refusal, terminal applied refusal and possible-effect UNKNOWN remain distinct. 3. Finite caller deadline capped5000 is a new local-interest bound, not a raised existing timeout. 4. Exact typed dispositions must survive codec/transport; no bool alias may erase them. 5. afterCommit releases interest; freeing a waiter never releases consensus custody. 6. Revalidation at actual apply protects admin/write races. 7. Responses name exact K/digest, not current winner or delivery ID.

### Concurrency (5)

1. Server register-before-propose and client claim-before-persist both explicit. 2. Immutable pending bytes and revision CAS protect awaited storage/delivery edges; exact-instance callbacks protect lifecycle awaits. 3. One deterministic slot CAS winner; competing admin or content cannot borrow success. 4. Deadline callbacks must dispose only exact interest; ASYNC/TIMER generic behavior unchanged, no callback expansion. 5. Storage scope is exact writer identity/slot generation; implementation must not key ownership merely by user KV key or transport attempt.

### Recovery/replay (5)

1. Stale local/storage completions cannot overwrite live successor state. 2. Retained v1 DB reopens durable incarnation/slot/fence/receipt; no volatile map recovery supplies authority. 3. Participant enlistment N/A; writer slot ownership is not a TX1 obligation. 4. Exact retained replay, same/different-slot A/B/A, acknowledged retirement and admin lost-reply replay remain coherent. 5. Missing/malformed retained format failsclosed; old history is unavailable/fenced, never fresh or NOT_COMMITTED. Shared snapshot dependency is explicitly held.

### Retry (7)

1. Explicit caller redrive uses persisted command; no hidden retry service. 2. Frozen caller deadline bounds local wait, not application lifetime. 3. Storage/environment/lifecycle/protocol exits remain typed, including new afterCommit refusal path. 4. No runtime self-wait for commitment. 5.64 intents/4 duplicate waiters/128 global waiters bound the claimed local resources only. 6. Late physical duplicates encounter retained result or monotonic fence and do not repeat effect. 7. Only persisted actual terminal receipt permits next-sequence ack; ACK/CORE_OK/failed persistence cannot reset it.

### Transport (5)

1. Transport ACK is not completion. 2. Late response belongs to original K and cannot clear another pending command. 3. Redirect/unknown remains same-intent; protocol refusal is not a terminal receipt/ack token. 4. Missing delivery is bounded by existing caller/transport budget and local interest, not an indefinite generic wait. 5. No new stubs reviewed yet; native tests must exercise actual handler/codec/application with real envelopes and explicit storage adapter behavior.

### Harness (6)

1. Missing eight evidence receipts is not semantic RED; v1 completion mutation must reach named premature-success assertion. 2. Real production builder, common profile and actual apply refusal replace fabricated outcomes. 3. Existing deadlines unchanged; owned clock tests must distinguish zero-time service from deadline firing. 4. Maximum escaped shapes, safe counters, preceding ack and all admin fields are explicit proof requirements. 5. Preheal positions/value and same-caller-after-heal assertions prevent rejection/absence false greens. 6. No test run or source behavior is claimed here; same-file restart and unsupported snapshot install remain distinct.

## Implementation acceptance notes, not new design blockers

- Freeze actual codec keys and maxima in code/tests and keep unknown-field/alias rejection. UTF-8 length and JSON expansion are separate; do not use JavaScript character count as a byte bound.
- Slot counter exhaustion must refuse before addition/rollover. Every applied index/term must meet the stated safe-integer gate; this is restricted-position support, not full64-bit fidelity.
- Keep admin receipt binding across ordinary writes in the same generation; a later recycle may replace it, with old admin history fenced/unavailable.
- Test both legitimate conflict orders: write before recycle may make exact-state recycle fail; recycle first fences delayed write. Neither undoes already committed effects.
- Retained protocol classifications do not allocate new result rows. A protocol response is not a write receipt and must not let the client advance sequence or forge the next acknowledgment.
- Cleanup releases bounded local resources even on storage/transport errors; durable state is never deleted to satisfy those bounds. A timed-out accepted request remains capable of late commit.
- The original WASM/F1/W07 files and historical results remain untouched. The newly authorized v1 companion is a separately identified profile with its own completion-only negative.

No further policy round is required by this review. Proceed with the selected bounded source unit, exact-byte test review and locked first executions; retain failures and obtain final independent source/evidence review. No merge or full-release claim follows from this design approval.
