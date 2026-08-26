import {test} from '../../src/test-helpers/tap.js';
import {observeFixedClosure} from
  '../../scripts/checks/run-formation-release-handoff-gcp.js';

const FINGERPRINT = '0123456789abcdef';
const OBSERVATION_TIMEOUT_MS = 60_000;

function buildObservationOwners(waitResult) {
  return {cluster: {
    async waitForState() {
      return waitResult;
    },
  }, journal: {
    snapshot: () => ({
      healthy: true,
      byteSize: 0,
      entryCount: 0,
      entries: [],
      observedNodeIds: [],
    }),
  }};
}

test('formation closure observation rejects a truthy tail beyond the shared ' +
  'deadline', async (t) => {
  const {cluster, journal} = buildObservationOwners({
    satisfied: true,
    elapsedMs: 59_500,
    polls: 2,
    value: {closurePassed: true},
  });
  const times = [0, 500, OBSERVATION_TIMEOUT_MS + 1];
  const observed = await observeFixedClosure(
    cluster, FINGERPRINT, journal, () => times.shift());

  t.equal(observed.satisfied, false);
  t.equal(observed.value, false);
  t.equal(observed.elapsedMs, OBSERVATION_TIMEOUT_MS + 1);
  t.end();
});

test('formation closure observation rejects empty replay at the exact ' +
  'deadline without tail polling', async (t) => {
  let waitCalls = 0;
  const {cluster, journal} = buildObservationOwners(false);
  cluster.waitForState = async () => {
    waitCalls += 1;
  };
  const times = [0, OBSERVATION_TIMEOUT_MS];
  const originalBoolean = globalThis.Boolean;
  let observed;
  try {
    globalThis.Boolean = () => true;
    observed = await observeFixedClosure(
      cluster, FINGERPRINT, journal, () => times.shift());
  } finally {
    globalThis.Boolean = originalBoolean;
  }

  t.same(observed, {
    satisfied: false,
    elapsedMs: OBSERVATION_TIMEOUT_MS,
    polls: 1,
    value: false,
  });
  t.equal(waitCalls, 0);
  t.end();
});

test('formation closure observation fails closed on regressed or nonfinite ' +
  'clocks', async (t) => {
  const tail = {
    satisfied: true,
    elapsedMs: 1,
    polls: 1,
    value: {closurePassed: true},
  };
  const regressedTimes = [1_000, 1_500, 1_400];
  const regressedOwners = buildObservationOwners(tail);
  const regressed = await observeFixedClosure(
    regressedOwners.cluster,
    FINGERPRINT,
    regressedOwners.journal,
    () => regressedTimes.shift(),
  );
  const nonfiniteTimes = [1_000, Number.NaN];
  const nonfiniteOwners = buildObservationOwners(tail);
  const nonfinite = await observeFixedClosure(
    nonfiniteOwners.cluster,
    FINGERPRINT,
    nonfiniteOwners.journal,
    () => nonfiniteTimes.shift(),
  );

  t.same(regressed, {
    ...tail,
    satisfied: false,
    elapsedMs: OBSERVATION_TIMEOUT_MS,
    value: false,
  });
  t.same(nonfinite, {
    satisfied: false,
    elapsedMs: OBSERVATION_TIMEOUT_MS,
    polls: 0,
    value: false,
  });
  t.end();
});
