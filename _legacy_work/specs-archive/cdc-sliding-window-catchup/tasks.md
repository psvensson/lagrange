# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Late Subscriber Gets No Catchup From Empty Buffer
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate late subscribers receive zero catchup when the pre-subscriber buffer is empty
  - **Scoped PBT Approach**: Scope the property to concrete failing cases — deliver events to subscriber A, then register subscriber B after delivery completes
  - Test file: `test/partition/cdc-sliding-window-catchup.exploration.test.js`
  - Create a `CDCEventBuffer`, deliver events to an initial subscriber via `subscribeToCDCWithHandshake`, then register a second late subscriber
  - Assert the late subscriber receives recent events from the sliding window (from Bug Condition: `isBugCondition(X)` where `subscriberRegistrationTime > lastEventDeliveryTime AND preSubscriberBufferSize = 0 AND recentlyDeliveredEventCount > 0`)
  - Assert handshake returns `catchupMode` indicating sliding window replay occurred and `slidingWindowEventsReplayed > 0`
  - Assert no duplicate events are delivered (deduplication via `buildEventIdentity`)
  - Use property-based test with `fc.assert` and `{numRuns: 10}` — generate random CDC event payloads and verify late subscriber always receives catchup
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct — it proves the bug exists because `subscribeToCDCWithHandshake` returns `catchupMode: 'none'` and `bufferedEventsReplayed: 0` for late subscribers)
  - Document counterexamples found (e.g., "Late subscriber handshake returns mode='none', slidingWindowEventsReplayed=0 when 5 events were delivered to existing subscriber")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 2.1, 2.2_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Pre-Subscriber Buffer and Steady-State Delivery Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Test file: `test/partition/cdc-sliding-window-catchup.preservation.test.js`
  - **Observe on UNFIXED code first**, then write property-based tests capturing observed behavior:
  - Observe: `CDCEventBuffer.buffer(event)` captures events when no subscribers exist — returns `true` within capacity
  - Observe: `CDCEventBuffer.replay(subscriber)` delivers buffered events in order and clears the buffer — returns count of replayed events
  - Observe: `subscribeToCDCWithHandshake` with buffered events returns `catchupMode: 'backfill'` and replays buffered events
  - Observe: `subscribeToCDCWithHandshake` for already-subscribed subscriber returns `status: 'already_subscribed'`
  - Observe: `bufferCDCEventForRetry` re-buffers events on delivery failure independently
  - Write property-based tests with `fc.assert` and `{numRuns: 10}`:
    - Property: for all random CDC event sequences where no subscribers exist, `buffer()` captures events and `replay()` delivers them in order and clears the buffer (from Preservation Requirements 3.1, 3.2, 3.5)
    - Property: for all random CDC events where delivery fails, `bufferCDCEventForRetry` re-buffers without interference (from Preservation Requirements 3.4)
    - Property: for all already-subscribed subscribers, `subscribeToCDCWithHandshake` returns `already_subscribed` status unchanged (from Preservation Requirements 3.6)
  - Verify tests PASS on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.4, 3.5, 3.6_

- [x] 3. Implement CDC sliding window catchup fix

  - [x] 3.1 Add `CDC_EVENT_SLIDING_WINDOW_CAPACITY` constant
    - Add `CDC_EVENT_SLIDING_WINDOW_CAPACITY = NUM.TWO_HUNDRED_FIFTY_SIX` to `src/constants/cdc-lifecycle-constants.js` alongside existing `CDC_EVENT_BUFFER_CAPACITY`
    - Export the new constant from the module
    - Re-export from `src/constants/index.js` barrel export
    - _Requirements: 2.1, 3.3_

  - [x] 3.2 Add `CATCHUP_MODE_SLIDING_WINDOW` constant
    - Add `CATCHUP_MODE_SLIDING_WINDOW: 'sliding_window'` to `PARTITION_SERVICE_CDC` in `src/partition/partition-service-constants.js`
    - _Requirements: 2.2_

  - [x] 3.3 Add sliding window to `CDCEventBuffer`
    - In `src/partition/cdc-event-buffer.js`:
    - Import `CDC_EVENT_SLIDING_WINDOW_CAPACITY` from constants
    - Add `this.recentEvents = []` and `this.recentEventsHead = 0` in constructor
    - Store `this.slidingWindowCapacity` from `options.slidingWindowCapacity` or `CDC_EVENT_SLIDING_WINDOW_CAPACITY`
    - Add `recordDelivered(cdcEvent)` — circular array append: push when not full, overwrite at head and advance `(head + 1) % capacity` when full
    - Add `getRecentEvents()` — return copy in insertion order: `slice()` when not full, `[...slice(head), ...slice(0, head)]` when full
    - Add `recentEventsSize()` — return `this.recentEvents.length`
    - Add `clearRecentEvents()` — reset `this.recentEvents = []` and `this.recentEventsHead = 0`
    - Update `clear()` to also call `this.clearRecentEvents()`
    - _Bug_Condition: isBugCondition(input) where preSubscriberBufferSize = 0 AND recentlyDeliveredEventCount > 0_
    - _Expected_Behavior: recordDelivered retains events in bounded sliding window for late subscriber catchup_
    - _Preservation: buffer(), replay(), hasEvents(), size() behavior unchanged per Preservation Requirements 3.1, 3.2, 3.5_
    - _Requirements: 2.1, 3.3_

  - [x] 3.4 Wire `recordDelivered` in `generateCDCEvent` (direct delivery path)
    - In `src/partition/partition-service.js`, method `generateCDCEvent`:
    - After the successful delivery loop completes (the path that reaches `CDC_DELIVERY_COMPLETE` log, before `cdcPipelineMetrics.increment(EVENTS_DELIVERED)`), call `this.cdcEventBuffer.recordDelivered(cdcEvent)`
    - Only record on zero delivery failures — the existing `bufferCDCEventForRetry` path handles failures
    - _Bug_Condition: Events delivered to existing subscribers are lost because no post-delivery retention exists_
    - _Expected_Behavior: After successful delivery, event is recorded in sliding window for future late subscriber catchup_
    - _Preservation: Delivery to existing subscribers unchanged; only additive recordDelivered call per Requirements 3.4_
    - _Requirements: 2.1_

  - [x] 3.5 Wire `recordDelivered` in `flushBufferedCDCEvents` (buffer replay path)
    - In `src/partition/partition-cdc-delivery.js`, method `flushBufferedCDCEvents`:
    - Inside the `replay` callback, after delivering to all subscribers and incrementing `EVENTS_DELIVERED` metric, call `this.owner.cdcEventBuffer.recordDelivered(cdcEvent)`
    - This ensures events replayed from the pre-subscriber buffer also enter the sliding window
    - _Bug_Condition: Events replayed from pre-subscriber buffer are not retained for late subscribers_
    - _Expected_Behavior: Buffer-replayed events are recorded in sliding window_
    - _Preservation: replay() and buffer delivery unchanged per Requirements 3.1, 3.2, 3.5_
    - _Requirements: 2.1_

  - [x] 3.6 Add sliding window replay in `subscribeToCDCWithHandshake`
    - In `src/partition/partition-cdc-delivery.js`, method `subscribeToCDCWithHandshake`:
    - After the existing buffer replay block (whether it ran or not), add a sliding window replay phase
    - Call `this.owner.cdcEventBuffer.getRecentEvents()` to get recent events
    - Build a `deliveredIdentities` Set from events already delivered during buffer replay (using `buildEventIdentity`)
    - If buffer replay occurred, pass the `deliveredIdentities` Set to track what was already delivered
    - Iterate sliding window events, skip any whose identity is in `deliveredIdentities`, deliver the rest to the wrapper
    - Track `slidingWindowEventsReplayed` count
    - Update `catchupMode`: when pre-subscriber buffer was empty but sliding window had events, set to `CATCHUP_MODE_SLIDING_WINDOW`
    - Add `slidingWindowEventsReplayed` to the `catchup` object in the handshake response
    - _Bug_Condition: subscribeToCDCWithHandshake finds empty buffer and performs no catchup_
    - _Expected_Behavior: Late subscriber receives recent events from sliding window, deduplicated via buildEventIdentity_
    - _Preservation: Pre-subscriber buffer replay unchanged; already_subscribed status unchanged per Requirements 3.2, 3.5, 3.6_
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.7 Write unit tests for CDCEventBuffer sliding window methods
    - Extend existing test file `test/partition/cdc-event-buffer.test.js` with new tests:
    - `recordDelivered()` records events into the sliding window
    - `recordDelivered()` evicts oldest when at capacity (circular array semantics)
    - `getRecentEvents()` returns events in insertion order
    - `getRecentEvents()` returns empty array when no events recorded
    - `recentEventsSize()` tracks count correctly
    - `clear()` also clears the sliding window
    - Sliding window does not interfere with pre-subscriber buffer operations
    - `recordDelivered` is idempotent (recording same event twice does not corrupt state)
    - _Requirements: 2.1, 3.3_

  - [x] 3.8 Write integration tests for handshake sliding window catchup
    - Extend existing test file `test/integration/cdc-subscription-catchup.integration.test.js` or create `test/partition/cdc-sliding-window-handshake.test.js`:
    - Full handshake flow: deliver events to subscriber A, then subscriber B registers and receives sliding window catchup with `catchupMode: 'sliding_window'`
    - Handshake with both pre-subscriber buffer and sliding window events — deduplication via `buildEventIdentity` prevents duplicate delivery
    - Handshake with empty sliding window — behaves identically to unfixed code (`catchupMode: 'none'`)
    - `generateCDCEvent` records to sliding window after successful delivery
    - `flushBufferedCDCEvents` records to sliding window during buffer replay
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.9 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Late Subscriber Gets Catchup From Sliding Window
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from `test/partition/cdc-sliding-window-catchup.exploration.test.js`
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed — late subscribers now receive sliding window catchup)
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.10 Verify preservation tests still pass
    - **Property 2: Preservation** - Pre-Subscriber Buffer and Steady-State Delivery Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run preservation property tests from `test/partition/cdc-sliding-window-catchup.preservation.test.js`
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions in pre-subscriber buffering, replay, retry, or already-subscribed behavior)
    - Confirm all tests still pass after fix (no regressions)

- [x] 4. Checkpoint — Ensure all tests pass
  - Run existing CDC and partition test suites to verify no regressions:
    - `npm test -- test/partition/cdc-event-buffer.test.js`
    - `npm test -- test/partition/cdc-event-buffer.property.test.js`
    - `npm test -- test/partition/cdc-subscriber-registration-timing.test.js`
    - `npm test -- test/partition/cdc-buffer-replay-robustness.test.js`
    - `npm test -- test/integration/cdc-subscription-catchup.integration.test.js`
  - Run the new test files from tasks 1, 2, 3.7, and 3.8
  - Ensure all tests pass, ask the user if questions arise
