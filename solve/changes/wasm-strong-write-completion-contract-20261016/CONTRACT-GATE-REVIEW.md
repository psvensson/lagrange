# Content-bound review: WASM completion contract gate

Reviewer: subagent `/root/completion_consumers`.
Base: `d9b6872638166eb4ef5286399fa0fb4f99a73d4f`.
Reviewed artifact: `solve/changes/wasm-strong-write-completion-contract-20261016/CONTRACT-GATE.txt`.
Exact SHA256: `49733c48eb07e86c99600c76e3b306166be143333d725df4fa7fa1303886d624`.

**APPROVE this STOP/decision-gate record for authorized non-main preservation. HOLD source implementation.** This does not approve the proposed requestId shape, outcome schema, retention policy, fixture supersession, production edits or a source Quest seal. No tests were run and no source/test files were edited by this reviewer.

The gate was checked against the source mappings and category-complete audit in `INDEPENDENT-OWNER-AUDIT.md`. Its three decisions are real unresolved boundaries, not obstacles invented to avoid the authorized repair: D1 caller-owned immutable identity and existing identityless callers; D2 typed persisted application outcomes, old commands/databases and exact-position representation; D3 finite retention/non-reexecution protection and waiter/custody lifetime. Existing afterCommit supplies the live completion point but cannot supply these absent contracts.

## Corrections resolved in the reviewed bytes

The initial draft promised original whole-file GREEN while also proposing versioned identity-bearing commands. I identified that the original fixture165–170 matches exact old encoded proposal bytes. The reviewed D1 and section6 now preserve the original files/results, explicitly state zero matches would follow incompatible command fields, require a separately reviewed companion/fixture-profile decision, and prohibit calling it identical-original-input GREEN. A missing-field or zero-match failure is not the semantic premature-success RED. This is the correct stop boundary; no supersession is adopted.

D2 now also records `raft-rs-operation-port.js:116–122` converting index/term to Number. New durable output must resolve supplied-position precision rather than stringify rounded values; the observation authorizes no runtime edit. The proposal remains conditional.

## Category coverage and disposition

The detailed audit enumerates all 39 items from the requested six verification templates. This document applies them to the gate claims rather than certifying an unimplemented candidate.

- **Owner interaction (10):** One WASM application/result owner, existing transaction owner and lifecycle/transport contracts remain distinct. afterCommit publishes already-durable truth. Partition SQL outcomes and wasm_operations are explicitly rejected as blind authority reuse. Paired completion/progress, pressure, release wake, stale→fresh, projection separation, same-source-negative proof and impact alignment remain obligations; gate does not claim they already pass.
- **Concurrency/serialization (5):** Register-before-propose covers synchronous apply. Identity/content matching, exact-instance lifecycle, and late callback fencing remain required. Generic runtime proposal stays acceptance-only; no per-key/content-only identity or new scheduler is selected. Timer shared-helper compatibility is retained without expanding timer scope.
- **Recovery/replay (5):** A/B/A, lost reply, conflicting contents, process loss before callback, rollback, old-command/database semantics and retirement are explicitly distinguished. Same-file restart is not snapshot installation. Missing outcome is not NOT_COMMITTED. Lost participant enlistment is N/A to this single-group mutation; no TX authority is borrowed.
- **Admission/gating (7):** Type-only current admission and actual applySet refusal are accurately mapped. Future deterministic capacity/encoding checks cannot use follower-local pressure to change accepted-history results. Typed pre-admission refusal, deterministic outcome and possible-effect UNKNOWN are distinct. Existing wait budget propagation is not invented; producer/deadline choices remain unresolved. No unmeasured hold-release latency or resource bound is claimed.
- **Retry loops (7):** Caller retains original K/C; timeout removes local interest, not consensus custody. No automatic new ID, live-drain fallback, new retry timer or ACK-as-success reset. Finite release/retirement progress is explicitly required before adopting bounds. Gate does not infer a storm ceiling from a local map.
- **Transport/delivery (5):** Correlation messageId/requestId is not silently durable mutation identity; wrapping/unwrapping and absent concrete producer contract are accurately stated. Native envelope ACK and CORE_OK are not application outcomes. Late delivery, missing-recipient budget and typed uncertainty belong in the future complete unit. No new transport stub or claimed native behavior appears in this gate.

## Evidence classification

The accepted candidate/predecessor strong-write results remain the only native premature-success executions invoked here. The six counterexamples in section4 are explicitly reasoned traces, not lab runs. Source inspection of local safety applied-index update before commit is correctly an obligation rather than a newly executed defect claim. Snapshot scrub scope is limited to the inspected path; no broader recovery impossibility is inferred. Current startup code, not stale architecture prose claiming no lifecycle, controls the callable-path assessment.

The gate selects the already-owned atomic transaction completion point; it merely proposes payload.requestId, K/C and a same-database relation for review. None becomes an implementation contract through this preservation. D1/D2/D3 must be reviewed together before production work. No protocol numbers, schema migration, anonymous-call semantics, retirement mechanism or exact-position fix has been silently chosen.

Stop after preserving the record. Runtime/F1/W07 and original WASM witness stay frozen; existing evidence Quest stays separate; MG proof remains incomplete; full release successor unsealed/unactivated; shared-control-wave HELD; Runner/TAP PARKED; PR122 rejected. Publication provenance is the publisher's separate obligation and is not verified by this read-only contract review.
