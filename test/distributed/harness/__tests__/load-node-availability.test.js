import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import {
  LOAD_NODE_AVAILABILITY_STATE,
  buildLoadNodeAvailabilitySnapshot,
  resolveLoadNodeAvailabilityState,
} from '../load-node-availability.js';

const NOW_MS = 1000;
const QUERY_TIMEOUT_MS = 200;
const CONTRIBUTION_MAX_IN_FLIGHT = 2;
const BORROWED_DISPATCH_MAX_IN_FLIGHT = 5;
const STALLED_IN_FLIGHT_COUNT = CONTRIBUTION_MAX_IN_FLIGHT;
const BORROWED_EXHAUSTED_IN_FLIGHT_COUNT = BORROWED_DISPATCH_MAX_IN_FLIGHT;
const STALLED_STARTED_AT_MS = NOW_MS - 80;
const FRESH_STARTED_AT_MS = NOW_MS - 10;

function resolveAvailability(overrides = {}) {
  return resolveLoadNodeAvailabilityState(
    buildLoadNodeAvailabilitySnapshot({
      nowMs: NOW_MS,
      localDispatchReady: true,
      externalAdmissionReady: true,
      currentInFlight: STALLED_IN_FLIGHT_COUNT,
      dispatchMaxInFlight: BORROWED_DISPATCH_MAX_IN_FLIGHT,
      capacityContributionMaxInFlight: CONTRIBUTION_MAX_IN_FLIGHT,
      oldestInFlightStartedAtMs: FRESH_STARTED_AT_MS,
      queryTimeoutMs: QUERY_TIMEOUT_MS,
      admissionBackoffMs: QUERY_TIMEOUT_MS,
      ...overrides,
    }),
  );
}

test('borrowed dispatch capacity stays dispatchable while only the steady ' +
  'contribution floor is aged out', async () => {
  const availability = resolveAvailability({
    oldestInFlightStartedAtMs: STALLED_STARTED_AT_MS,
  });

  assert.equal(
    availability.state,
    LOAD_NODE_AVAILABILITY_STATE.SLOT_BORROWING,
  );
  assert.equal(availability.canDispatch, true);
  assert.equal(availability.contributesCapacity, true);
});

test('borrowed dispatch capacity is an explicit dispatchable state before stall threshold',
  async () => {
    const availability = resolveAvailability();

    assert.equal(
      availability.state,
      LOAD_NODE_AVAILABILITY_STATE.SLOT_BORROWING,
    );
    assert.equal(availability.canDispatch, true);
    assert.equal(availability.contributesCapacity, true);
  });

test('borrowed dispatch capacity still saturates at the borrowed ceiling', async () => {
  const availability = resolveAvailability({
    currentInFlight: BORROWED_EXHAUSTED_IN_FLIGHT_COUNT,
  });

  assert.equal(
    availability.state,
    LOAD_NODE_AVAILABILITY_STATE.SLOT_SATURATED,
  );
  assert.equal(availability.canDispatch, false);
  assert.equal(availability.contributesCapacity, true);
});

test('borrowed dispatch capacity becomes slot-stalled only once the ' +
  'borrowed ceiling itself ages out', async () => {
  const availability = resolveAvailability({
    currentInFlight: BORROWED_EXHAUSTED_IN_FLIGHT_COUNT,
    oldestInFlightStartedAtMs: STALLED_STARTED_AT_MS,
  });

  assert.equal(
    availability.state,
    LOAD_NODE_AVAILABILITY_STATE.SLOT_STALLED,
  );
  assert.equal(availability.canDispatch, false);
  assert.equal(availability.contributesCapacity, false);
});
