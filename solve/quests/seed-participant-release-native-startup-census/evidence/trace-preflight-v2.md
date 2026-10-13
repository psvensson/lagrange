# Native startup delivery trace — independent preflight v2

**APPROVE for the single exact locked-lab diagnostic measurement.** This is test-only content preflight, not startup, production, Quest, corpus or main approval. No tests/labs/checkers or source/test/metadata/Quest/Git edits were performed; only this ignored report is written.

Reviewed immutable input `4d37a7eb2a95c297c7afe74a9fe5b88f88cae06e`, tree `f512d878f8191b2b2616ef96e6d390f6e3af3393`, at `/tmp/session-worktree-mjyYVw/tree`. Source has no difference from base `ffe35e77d51cbd4ba35fb30518de1307eaaa2eec`. Independently verified hashes:

- Claim-cache test: `e4c0697fbb18ead9b2b52a856b4e71f3352449d64e7267ccbc06c1bf02a2c013`.
- Subsystem metadata: `7a39cc7a031fe6135746d519b875d0124c77a694ad0ec2619c28dc02ee9aae9a`.
- Graph seal: `0a99e99e37f42d4a5b4152750b4da2e392efbad4d9ab1459dc4fb6f121bbade3`.

The complete narrow V1 batch is incorporated from `trace-preflight-v1.md`, independently verified SHA256 `31b8437a76b03595106f1a9795e809f513058c4fbb02001a7fbd02a95761218c`. Line references below name the claim-cache test at this immutable V2 input.

1. **R1 closed (198–238,254–275):** one `admitRecord` owns matching, count/cap and insertion; one settlement operation handles synchronous throw and promise outcomes. The non-async spy invokes the original delivery once with the original receiver/arguments, rethrows its exact error, and returns its exact promise. Capture failures do not substitute a transport answer.
2. **R2 closed (573–644):** primary failure is retained. Restore, graceful shutdown and environment cleanup have independent guarded paths, all preceding serialization/logging. Cleanup/report failures remain separately observable and fail the test when no primary failure exists. Reporting cannot prevent owner teardown. The original 30s test and joined-teardown bounds remain; an exhausted budget remains red.
3. **R3 closed (40–186,206–238):** fixed request identity is copied at the call boundary and canonical response/envelope/error fields at settlement. Generation/work/origin/release/attempt and bounded membership/cohort arrays are test-owned snapshots; no raw request, result, census authority or response payload is retained in records. The existing membership bound is reused, cohort captures are limited to 16, records to 8192 and error messages to 512 characters. No originals are frozen or mutated. Drop, capture-error and incomplete counts are reported (294–301).
4. **R4 closed (125–158,206–211,240–253):** actual router/install/node identity, target address, request target generation, leader/term/lifecycle/deadline attempt, release/build identity and ordered cohort identity are retained. Actual router ID is initialized by `src/transport/message-router.js:69`. Call and settlement ordinals support causal matching without timestamp selection.

The actual router is installed through the existing factory seam. Original seed configuration, startup checks and both T1 bodies remain (532–572). No extra fact/status read, tick, timer, sleep, election, proposal, release request, predicate, synthetic answer or authority is introduced. Observation adds bounded synchronous copies and a promise reaction; this overhead must be disclosed. The metadata diff only reflects imports/observations and generated digests; class assignments, census and resolver/schema remain unchanged. Writer-local syntax/lint/generator checks are not locked-lab proof.

Proof ceiling: accept an exact one-member post-ENABLE census match only with delivered OBSERVED ENABLE followed by matching delivered OBSERVED INSPECT, complete canonical tuple/cohort and causal order. `src/node/participant-release-client.js:41–50` supplies the same answer to cutover; `src/node/replica-handler-participant-cutover.js:279–297` consumes the final INSPECT census. Branch selection remains source-backed inference. Early refused ENABLE has no post-ENABLE final census; request census cannot replace fresh recipient facts. Missing/dropped/incomplete/capture-error records cannot certify an exact input. Preserve actual startup reds and primary errors; this preflight does not predict success or root cause.

No remaining R1–R4 content finding. Exact hashes were checked again after report creation.
