# Shared runtime replacement — measured result and independent review request

Status: behavioral tests pass; static gates and independent source approval remain held. No Quest landing, main merge, source approval or release certification.

Measured candidate: `c37b58cfb6d82cee2ec287e929cbeb38defbbf9c`.
Measured baseline: `12ba1f08f8d7ff894559e65ec28e4c6a39403334`.
Source/evidence publication: `0aa3807bccb9acfcd8bbd17bc03ff62df0214f4c`.
Run: `38235736805`; artifact `11740404111`; ZIP SHA256 `133725c6367b14b92f7f8000747462965357264c3fb5c08b19690f55b3d46c9f`.

## Measured results

- Native baseline: 5 pass / 7 fail. All twelve cases actually engaged the injected core trap; there were no missing fixture/setup passes.
- Native candidate: 12 pass / 0 fail. Missing/changed artifacts, partial group restoration, reentrant callback, shared retry pressure, trap during reconstruction, callback close, distinct clock epochs and final-close/new-opening cases complete with actual raft-rs and SQLite.
- Source-only revert: the same 5 pass / 7 fail with identical test sources and matching source/phase/outcome bindings. Seven failures are seven scenarios, not seven independent root defects; the last-close baseline fails earlier at its shared-pressure prerequisite.
- Eight existing regression files: 32 pass / 0 fail. The original stale-Ready no-core-entry assertion remains unchanged and passes. Every measured unit case is under the unchanged two-second bound; scheduled-tick case 107.060734 ms with its original simulated interval retained.
- Actual operation-boundary audit: FAIL, one violation in the untouched `src/raft/snapshot-install.js`: lifecycle-owner-import-bypass. Its direct import of RaftRsReplicaLifecycleOwner exists already at input 9529902f (snapshot blob 4acb0e4652867b71f4ba91fcf1ea4115628693c8). Route this through the snapshot/lifecycle interaction owner; do not add an unexplained allowlist entry.
- Boundary controlled negative: the real audit also detects the deliberately introduced runtime-owner-import-bypass, which is then removed. Merely executing the module with node does not run its exported audit: round one's empty audit log is NOT boundary proof and is not reused as such.
- Guideline audit: FAIL on both baseline and candidate. Output is byte-identical: 311 violations above the committed literal baseline and 1267 matched grandfathered entries. None are waived or re-baselined here. `focusedProofPassed` and `allRunGatesPassed` correctly remain false because the static gate remains red.

## Corrections made without weakening tests

A shared REPLACING barrier invalidates handles and cached answers before callbacks. Every group is reconstructed or explicitly held before the driver exposes the new runtime. The existing durable reseed owner handles proven missing/incompatible records. One shared failure record captures the original clock and existing election-derived retry window; 25 same-instant calls cause one failed artifact read, not 25 reload attempts.

Resumption stays with the existing group queue. A busy old Ready's completion must still make no call into new handles: its owed resumption is scheduled on the next owned clock turn, admitted through the lifecycle owner, with exact timer cancellation on close/replacement/consumption. Closing a newly created handle inside a callback leaves an owned release obligation, discharged by the driver outside that callback.

The pressure witness originally confused manifest reads with loads. The unchanged loader checks integrity both before and after loading. The corrected witness keeps the one-failed-read-per-window assertion, expects two successful integrity reads, and separately proves exactly one runtime generation and one reconstruction per group. The failed original witness and round-one outputs remain retained byte-for-byte.

## Requested independent verdict

Read the design-shared-runtime-replacement-20261012.md, prior PR117 review and this run's source.patch and raw receipts. Review the current source, not the earlier one-line candidate. Attack ALL relevant items of recovery-replay, admission-gating, concurrency-serialization, owner-interaction and harness-fidelity; report findings with exact source and test evidence.

In particular inspect: partial/native refusal versus a shared trap; reporter and store callback reentry; new-open refusal and lifecycle cleanup; close during restoration and after a failed load; zero remaining groups; pending Ready and asynchronous resumption rejection; persistence admission during reconstruction; stale identity-record acknowledgements; missing history/reseed ordering; repeated failures across successful resumption; retained-clock lifetime; and every new scheduling handle's cancellation. The constructor and all missing-history variants are not separately certified by the new twelve-case matrix; do not infer those claims from unrelated tests.

These are single-process native fixtures (including the existing multi-replica fixture tests), not physical RF3/multi-host certification, a full SQL/CDC startup oracle, or proof of complete rs-raft merge readiness. No direct subagent was launched in this session; a separate Copilot source review is requested. Its comments must not be relabeled as an approving Solver verification.
