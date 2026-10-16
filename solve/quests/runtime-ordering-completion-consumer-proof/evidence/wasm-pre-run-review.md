# Independent WASM completion witness pre-execution review

Reviewer subagent:/root/completion_consumers. No native test executed in this review. Verdict: APPROVE corrected exact bytes for first locked predecessor/candidate execution. No production correction, consumer conformance or F1 supersession approval.

Final SHA256:
- wasm-strong-write-native-fixture.js: 3a949083e132ac9eba399d82c1df90aba09bda321a959e04a3bdb41623feba34
- wasm-strong-write-native-completion.test.js: 591dd4c77abedd4685cfcdcc563cf2bd04bdd578c73daf8ab8c14d256d14e45f

F = test/wasm-service/wasm-strong-write-native-fixture.js; T = corresponding completion.test.js.

Pre-run correction: initial test SHA f0fc281f8e5bf324f373d9f5edb4c8baea6e37478ea6476a9edc74404620a698 allowed a rejected/forwarded caller to satisfy the no-premature-success assertion even if its retained log later applied. The author added exact same-caller post-heal success at T41-43, and bound two real follower ACKs to the proposed index at T20-24. This was corrected before any execution, not a failed-run retry.

## Harness fidelity

- Right-reason: T18-30 requires one exact encoded proposal, two distinct actual follower non-refused responses at its index, uncommitted/unapplied leader position and absent KV effects. T39-43 requires healed KV and the same caller's actual strong success before named semantic assertion STRONG_WRITE_SUCCESS_BEFORE_COMMIT at T44-46. Setup failure, missing messages or healthy failure cannot count as that RED.
- Live seam: F133-141 constructs actual WasmServiceReplica; F155 invokes its actual handleMessage write route. Production src/wasm-service/wasm-service-replica.js:321-336 routes this to _handleWrite; :388-411 preserves documented strong semantics; :422-435 proposes via actual operation port. No mocked CORE_OK or application result.
- Group identity/codec: production wasm-service-consensus-port.js:140 uses serviceDefinitionId as groupId, matching F99/134 and durable read F42. F166-170 uses both actual committed-command and proposal codecs; no guessed log bytes.
- Time: formation alone ticks/status-reads F74-89. Measured delivery F54-71 uses fixed 64 rounds, captured transport batches, 16 microtasks per round and zero elapsed virtual time. No status/tick/settle loop in measured portion. All current awaits resolve from native synchronous enqueue or microtasks; no macro timer rescue is introduced. Existing production safety broadcaster is not installed by the test and its component callback semantics are not claimed.
- Vacuity: RF3 actual leader plus production isLeader checked F79-85; default STRONG checked F143-144; exact proposal and two peers T19-24; healthy T50-65 checks success plus each replica commit/applied/KV.
- Scope: actual hosted JS WASM replica route, not execution of a compiled guest; F181 declares this. Source pair attribution requires identical final test bytes and recorded exact source refs.

## Transport / delivery

F113-119 explicitly acknowledges fixture transport custody while retaining exact core-emitted envelope bytes; it does not call that recipient processing. F63-64 delivers those bytes through real registered loopback handlers and preserves options. Withheld rows are only real AppendResponses to the leader F57-60; exact-index proof is T20-24. Every envelope either stays in finite queue/held collection or is delivered by the declared schedule; no row/event deletion manufactures loss. Missing handler throws through existing loopback transport and therefore fails setup/measurement rather than returning fabricated success. Generic MessageRouter noHandler/retry classification is outside this controlled native transport proof. Native port handling returns recipient ACK without asserting commit; actual durable observations decide the witness. Late reply/recovery-after-lost-response is not covered by this file.

## Owner interaction

Consensus owns proposed/committed positions; production application owns KV effects; WasmServiceReplica owns caller success. Test observes all three independently (F41-48,152-170) rather than redefining acceptance as strong completion. Paired pressure/healthy control is T9-65. Frozen pre-heal cut cannot be changed by subsequent healing T16 vs T36. No completion wait is inserted into runtime turn, no second outcome authority, no local alternate application path. Exact replica identity and bytes remain native. No impact-contract edits are owned here; principal must register test before publication. A red on both source treatments is inherited schedule evidence, not automatic data-loss proof.

## Concurrency / serialization

One actual write invocation F155; Promise observer stores its settlement without changing result F155-163. Native occurrence custody is explicit F113-119 and fixed round snapshots F56. Setup f.leader=null cannot be dereferenced in F57 because holdResponses=false short-circuits until leader assigned. All tests run serially in one file; process-global core observer reset on teardown F105. No new claim CAS/lock/production scheduler introduced. Existing native serialization is exercised, not certified for all concurrent writes.

## Admission / gating

No feature flag or fabricated strong mode; default checked F143-144. No new admission precheck or force bypass. The request is valid KV_SET through real codecs and owner admission. Refusal/rejection cannot become an accepted conformance pass after correction T41-43. Fixed round limit is test schedule, not a production timeout change. Gate opening is real release of retained native ACKs T34-37; no quorum or commit value assigned by fixture. All diagnostics carry group/replica/request/position F173-183.

## Recovery / replay

This test heals transport only; no crash, snapshot import, live/cold rebuild or replay idempotence is claimed. Thus lost enlistment, stale recovery overwrite and dedup rollback questions are N/A, not proved. Absence of KV is used only alongside exact uncommitted positions, never as proof of no prior commitment. Cleanup invokes actual shutdown for each replica before deleting directory F104-110; sequential failure stops deletion, preserving the directory. A first precondition failure retains printed cut data; semantic assertion occurs after healing. It does not establish durable custody across process loss.

## Retry / re-drive

No retry of the write or test-until-success. Exactly fixed delivery rounds; no counter reset or fallback. Existing zero-delay native wake is the only progression invoked; recipient/app state is read passively. Two schedule runs (blocked and healthy) are separate initial clusters, not retries. Native retry storms, timeout custody and production timer callbacks are outside scope. Original Promise may stay pending at the cut; final post-heal response assertion bounds the successful scenario and excludes permanent pending/rejected false greens.

## Execution acceptance

Require whole-file result and raw cuts for both exact source treatments on one locked host. A named premature-success assertion failure with the explicit prerequisites engaged is semantic RED. Any earlier setup/codec/import/round exhaustion is an unavailable-seam failure to preserve, not evidence of the strong-write defect. No tests executed by this reviewer.
