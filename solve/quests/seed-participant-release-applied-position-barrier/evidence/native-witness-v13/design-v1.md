# Native V13 passive step-result discriminator design

## Binding and question

Bind exact V12 input `ea663ca425f2d38325e90eab25d57a7fd38e139b`, source tree `7cf388f79e6afccf3d4311a475147147106e15a5`, witness `198c9d6e88338868d907d1406d28ebc8311ce9859c991fc58ddb81f6e3f94292`, and independent triage `4e4b04daa47257218a1400fd1411ea8d23d03057f8b59a3ec0a9bcd9f08b03e8`. V12 reached `applied-progress` with both exact carrier-handler calls fulfilled but only one follower publication. Because `handleTransportMessage` discards the typed `raft.step` result before returning `{acknowledged:true}`, handler fulfillment does not prove `INBOUND_ENQUEUED`.

V13 answers only whether each retained follower carrier's original `native.step` returned queued, refused, dropped, or threw. It does not observe drain entry, durable application, or publication and cannot authorize a timer/ref/runtime repair.

## Exact test-only delta

Keep the existing frozen operation-port seam in `createMembershipReadState`. Add one test-owned arm bit and one nullable `stepOutcome` per follower. Immediately before each existing `gate.forward(state.replicaId)` call, arm that same follower in `membershipReads`; no await or event-loop turn exists between the arm and forward, and the original handler invokes `raft.step` synchronously before its first await. The wrapper consumes the arm on exactly that call.

The wrapped `step` invokes `native.step` once with the exact original `this` and arguments. It returns the exact original value or Promise unchanged and rethrows the exact synchronous error. A nonthrowing side observer retains one immutable `{kind, value|error}` record; Promise settlement is observed with `Promise.prototype.then.call`, and a synchronous typed result is retained directly. Generalize the existing `recordOwnedSettlement` helper to take a destination field and handle either form, then reuse it for both `carrierOutcome` and `stepOutcome`; do not add a second Promise-observation algorithm. The observer task joins the existing bounded `passiveTasks` cleanup custody. Observer-installation failure is recorded through the existing membership error owner and never changes the original result.

Restore per-follower identity in the existing before-exit projection. Each of the fixed two records contains only `replicaId`, capture/carrier/progress/current/route flags, error count, and step `kind`, typed `outcome`, and typed `reason`; raw envelopes, result objects, Errors, stacks, and messages are not serialized. Exact raw result/error identity remains retained only for existing body/cleanup custody. The current single synchronous stderr line and 4,096-byte overflow guard remain unchanged.

To stay below the 1,500-line test ratchet without compressing protocol code, extract only the already-existing V12 diagnostic projection/writer (`gateDiagnosticOf`, `membershipDiagnosticOf`, and `installBeforeExitDiagnostic`, including its byte cap and `node:fs`/`node:buffer` imports) into `test/partition/participant-release-native-exit-diagnostic.js`. Export one installer. It consumes the same nullable context and retained test state; it owns no protocol predicate, route classifier, lifecycle, Promise, timer, or cleanup. The main test remains the sole owner of context mutation, listener removal, and diagnostic-error custody.

Implementation scope is exactly the native witness plus that extracted test-only diagnostic helper and ordinary metadata only if its established generator changes it. Preserve every V12 await, fault, deadline, release acceptance assertion, Promise identity, transport restoration, listener cleanup, and source byte. Run syntax, exact ESLint, scoped strict metrics and strict file-size for both files, diff whitespace, and metadata checks only. No behavior or lab run occurs until independent content preflight freezes exact bytes.

## Interpretation

`CORE_OK` plus `inbound-enqueued` for both identified followers rules out typed step refusal/drop at this seam but still does not prove scheduled drain entry. A refused/dropped/thrown result identifies the missing follower's transport-to-runtime boundary without changing ACK grammar. Missing/overflowed/capture-error output remains HOLD. V13 never treats output absence, handler acknowledgement, or one follower's result as proof for the other.
