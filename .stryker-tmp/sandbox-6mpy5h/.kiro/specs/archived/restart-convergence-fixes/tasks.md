# Implementation Plan

- [x] 1. Write bug condition exploration tests
  - **Property 1: Bug Condition** — Background Retry Unbounded Termination & Self-Targeted Operation Deadlock
  - **CRITICAL**: These tests MUST FAIL on unfixed code — failure confirms the bugs exist
  - **DO NOT attempt to fix the tests or the code when they fail**
  - **NOTE**: These tests encode the expected behavior — they will validate the fix when they pass after implementation
  - **GOAL**: Surface counterexamples that demonstrate both bugs exist
  - **Scoped PBT Approach**: Scope properties to concrete failing cases for reproducibility
  - **Bug A — Background Retry Bounded Termination (Property 1 from design)**:
    - Call `scheduleBackgroundRetry` with `attempt` value >= `deliveryRetryMaxAttempts` (e.g., attempt: 10, well above MAX_ATTEMPTS: 3)
    - Assert that no new timer is added to `backgroundRetryTimers` (expected behavior from design)
    - Assert that exhaustion is logged
    - On UNFIXED code this will FAIL because `scheduleBackgroundRetry` does not check attempt against max — it schedules another timer
    - Document counterexample: `scheduleBackgroundRetry` schedules a timer even when `attempt` is 100
  - **Bug B — Self-Targeted Operation Exclusion (Property 2 from design)**:
    - Populate `SystemTableCache` mock with a replica operation where `targetNodeId === joiningNodeId`
    - Call `collectCanonicalInFlightReplicaOperationDetails` and assert the self-targeted operation is NOT returned
    - Call `evaluateCanonicalJoinTopologyReadiness` with only self-targeted in-flight operations and assert `ready === true` (when other dimensions satisfied)
    - On UNFIXED code this will FAIL because self-targeted operations are counted, causing deadlock
    - Document counterexample: `collectCanonicalInFlightReplicaOperationDetails` returns operations targeting the joining node
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests FAIL (this is correct — it proves both bugs exist)
  - Mark task complete when tests are written, run, and failures are documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** — Background Retry Within Bounds & Non-Self-Targeted Operations Still Block
  - **IMPORTANT**: Follow observation-first methodology — observe behavior on UNFIXED code first, then write property-based tests
  - **Preservation A — Background Retry Within Bounds (Property 3 from design)**:
    - Observe on UNFIXED code: `scheduleBackgroundRetry` with attempt values below max and failed delivery schedules a retry timer with exponential backoff
    - Observe on UNFIXED code: successful deliveries do not trigger background retries
    - Observe on UNFIXED code: `clearBackgroundRetryTimers()` on `stop()` clears all pending timers
    - Write property-based test (fast-check, `{numRuns: 10}`): for all random attempt values below `backgroundRetryMaxAttempts` with failed deliveries, verify a retry timer IS scheduled
    - Write property-based test: for all successful delivery scenarios, verify no background retry is scheduled
  - **Preservation B — Non-Self-Targeted Operations Still Block (Property 4 from design)**:
    - Observe on UNFIXED code: `collectCanonicalInFlightReplicaOperationDetails` with operations where `targetNodeId !== joiningNodeId` returns all of them
    - Observe on UNFIXED code: zero in-flight operations yields `ready = true` for the topology dimension
    - Write property-based test (fast-check, `{numRuns: 10}`): for all random sets of in-flight operations where `targetNodeId !== joiningNodeId`, verify all operations are counted
    - Write property-based test: for all random mixes of self-targeted and non-self-targeted operations, verify the in-flight count equals only the non-self-targeted count
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 3. Fix for restart convergence — unbounded background retry and self-targeted operation deadlock

  - [x] 3.1 Add `BACKGROUND_MAX_ATTEMPTS` constant to `src/topology/cdc-group-propagation-constants.js`
    - Add `BACKGROUND_MAX_ATTEMPTS: 5` to the `CDC_GROUP_PROPAGATION_RETRY` frozen object
    - This gives a total retry budget of `MAX_ATTEMPTS` (3 synchronous) + `BACKGROUND_MAX_ATTEMPTS` (5 background) = 8 attempts before giving up
    - _Bug_Condition: isBugConditionA(input) where attempt >= deliveryRetryMaxAttempts AND scheduleBackgroundRetry does NOT check attempt against max_
    - _Expected_Behavior: Background retries stop after BACKGROUND_MAX_ATTEMPTS, releasing resources_
    - _Preservation: Retries within bounded limit continue to work, successful deliveries unaffected_
    - _Requirements: 2.1, 2.2_

  - [x] 3.2 Add max attempt guard to `scheduleBackgroundRetry` in `src/topology/cdc-group-propagation-service.js`
    - Initialize `this.backgroundRetryMaxAttempts` in constructor from `options.backgroundRetryMaxAttempts` with fallback to `CDC_GROUP_PROPAGATION_RETRY.BACKGROUND_MAX_ATTEMPTS`, following the existing `resolvePositiveInteger` pattern
    - At the top of `scheduleBackgroundRetry`, after existing state and targets checks, add guard: if `attempt >= this.deliveryRetryMaxAttempts + this.backgroundRetryMaxAttempts`, log exhaustion using existing `CDC_GROUP_PROPAGATION_LOG_MSG.DELIVERY_RETRY_EXHAUSTED` pattern and return without scheduling a timer
    - _Bug_Condition: isBugConditionA(input) where attempt >= deliveryRetryMaxAttempts AND no max check in background path_
    - _Expected_Behavior: scheduleBackgroundRetry SHALL NOT schedule further timers when attempt >= max, SHALL log exhaustion_
    - _Preservation: Retries below max continue with exponential backoff, clearBackgroundRetryTimers on stop() unaffected_
    - _Requirements: 2.1, 2.2, 3.1, 3.7_

  - [x] 3.3 Add self-exclusion filter to `collectCanonicalInFlightReplicaOperationDetails` in `src/bootstrap/join-readiness-evaluator.js`
    - Inside the `for` loop, after `isReplicaOperationInFlight` check passes, add condition: if `normalizedOperation.targetNodeId === this.nodeId`, skip this operation (do not push to `inFlightOperations`)
    - Add `excludedSelfTargetedCount` field to the return value of `evaluateCanonicalJoinTopologyReadiness` for diagnostics visibility
    - Log excluded self-targeted operations count in the topology readiness result
    - _Bug_Condition: isBugConditionB(input) where inFlightOperations include ops with targetNodeId === joiningNodeId_
    - _Expected_Behavior: Self-targeted operations excluded from in-flight count, ready=true when only self-targeted ops remain_
    - _Preservation: Non-self-targeted operations still block join readiness, zero-operation case still yields ready=true_
    - _Requirements: 2.3, 2.4, 2.5, 3.3, 3.4, 3.5_

  - [x] 3.4 Verify bug condition exploration tests now pass
    - **Property 1: Expected Behavior** — Background Retry Bounded Termination & Self-Targeted Operation Exclusion
    - **IMPORTANT**: Re-run the SAME tests from task 1 — do NOT write new tests
    - The tests from task 1 encode the expected behavior from design Properties 1 and 2
    - When these tests pass, it confirms the expected behavior is satisfied
    - Run bug condition exploration tests from step 1
    - **EXPECTED OUTCOME**: Tests PASS (confirms both bugs are fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 3.5 Verify preservation tests still pass
    - **Property 2: Preservation** — Background Retry Within Bounds & Non-Self-Targeted Operations Still Block
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all preservation tests still pass after fix (no regressions)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 4. Checkpoint — Ensure all tests pass
  - Run the full test suite to verify no regressions
  - Ensure all exploration tests (task 1) pass on fixed code
  - Ensure all preservation tests (task 2) pass on fixed code
  - Ensure all existing tests continue to pass
  - Ask the user if questions arise
