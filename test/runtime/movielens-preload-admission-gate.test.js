import {readFile} from 'node:fs/promises';
import {test} from '../../src/test-helpers/tap.js';
import {
  waitForAffinityDemoSchemaAdmission,
  waitForAffinityDemoPreloadAdmission,
} from '../../examples/service-data-affinity/affinity-demo-preload-gate.js';

const BASE_TARGET = 'ws://127.0.0.1:8081/api/admin/stream';
const SNAPSHOT_TARGET = `${BASE_TARGET}?lane=snapshot`;
const LOAD_TARGET = `${BASE_TARGET}?lane=load`;
const SNAPSHOT_SQL = 'SELECT * FROM control_snapshot_local()';
const RATINGS_PROBE_SQL = 'SELECT 1 FROM ratings LIMIT 1';
const NOW_MS = 10_000;

function buildControlSnapshot(overrides = {}) {
  return {
    capturedAt: NOW_MS,
    snapshotObservation: {
      state: 'fresh',
      reasonCodes: [],
    },
    replicaOperations: {
      inFlightCount: 0,
      staleInFlightCount: 0,
      rows: [],
    },
    leaders: {'ratings-p1': 'node-a'},
    controlPlaneDiagnostics: {},
    ...overrides,
  };
}

function oneAttemptOptions(query) {
  let currentNowMs = NOW_MS;
  return {
    target: BASE_TARGET,
    query,
    now: () => currentNowMs,
    sleep: async () => {
      currentNowMs = NOW_MS + 1;
    },
    timeoutMs: 1,
    pollIntervalMs: 0,
  };
}

function boundedSchemaOptions(query, timeoutMs = 8) {
  let currentNowMs = NOW_MS;
  return {
    target: BASE_TARGET,
    query,
    now: () => currentNowMs,
    sleep: async () => {
      currentNowMs += 1;
    },
    timeoutMs,
    pollIntervalMs: 0,
  };
}

test('pre-schema admission requires two quiet snapshots without ratings SQL',
  async (t) => {
    const calls = [];
    const result = await waitForAffinityDemoSchemaAdmission(
      boundedSchemaOptions(async (call) => {
        calls.push(call);
        return {rows: [buildControlSnapshot()]};
      }),
    );

    t.equal(result.admitted, true);
    t.equal(result.stableConfirmationCount, 2,
      'one transient quiet observation cannot release schema mutation');
    t.same(calls.map(({target, sql}) => ({target, sql})), [
      {target: SNAPSHOT_TARGET, sql: SNAPSHOT_SQL},
      {target: SNAPSHOT_TARGET, sql: SNAPSHOT_SQL},
    ], 'schema admission only observes the authoritative snapshot lane');
    t.notMatch(JSON.stringify(calls), /ratings/,
      'schema admission cannot depend on the not-yet-created table');
    t.end();
  });

test('pre-schema pressure resets stable confirmation and fails closed',
  async (t) => {
    const snapshots = [
      buildControlSnapshot(),
      buildControlSnapshot({
        replicaOperations: {
          inFlightCount: 1,
          staleInFlightCount: 0,
          rows: [{operation_id: 'formation-replace'}],
        },
      }),
      buildControlSnapshot(),
      buildControlSnapshot(),
    ];
    let index = 0;
    const result = await waitForAffinityDemoSchemaAdmission(
      boundedSchemaOptions(async () => ({rows: [snapshots[index++]]})),
    );
    t.equal(index, 4,
      'a non-quiet observation invalidates the earlier confirmation');
    t.equal(result.stableConfirmationCount, 2);

    const error = await t.rejects(
      waitForAffinityDemoSchemaAdmission(boundedSchemaOptions(
        async () => {
          throw new Error('Admin API query timed out under pressure');
        },
        1,
      )),
      /MovieLens schema admission timed out/,
    );
    t.equal(error.schemaAdmission.admitted, false);
    t.equal(error.schemaAdmission.snapshot.state, 'control_plane_pressure');
    t.end();
  });

test('fresh but incomplete snapshots cannot admit schema mutation',
  async (t) => {
    const incompleteSnapshots = [
      (snapshot) => delete snapshot.replicaOperations,
      (snapshot) => {
        snapshot.replicaOperations.inFlightCount = undefined;
      },
      (snapshot) => {
        snapshot.replicaOperations.staleInFlightCount = '0';
      },
      (snapshot) => {
        snapshot.leaders = null;
      },
      (snapshot) => {
        snapshot.controlPlaneDiagnostics = null;
      },
    ];
    for (const makeIncomplete of incompleteSnapshots) {
      const snapshot = buildControlSnapshot();
      makeIncomplete(snapshot);
      const error = await t.rejects(
        waitForAffinityDemoSchemaAdmission(boundedSchemaOptions(
          async () => ({rows: [snapshot]}),
          1,
        )),
        /control snapshot admission fields unavailable/,
      );
      t.equal(error.schemaAdmission.admitted, false);
      t.equal(
        error.schemaAdmission.snapshot.state,
        'observation_unavailable',
      );
    }
    t.end();
  });

test('absent optional in-flight discount is conservative zero',
  async (t) => {
    const snapshot = buildControlSnapshot({
      replicaOperations: {
        inFlightCount: 1,
        staleInFlightCount: 0,
        rows: [{operation_id: 'formation-replace'}],
      },
    });
    t.equal(
      snapshot.replicaOperations.additionalInFlightDiscountCount,
      undefined,
      'the authoritative snapshot shape does not produce the optional field',
    );
    const error = await t.rejects(
      waitForAffinityDemoSchemaAdmission(boundedSchemaOptions(
        async () => ({rows: [snapshot]}),
        1,
      )),
      /replica_operations_in_flight=1/,
    );
    t.equal(error.schemaAdmission.snapshot.effectiveInFlightCount, 1,
      'absence cannot discount the observed operation');
    t.equal(error.schemaAdmission.snapshot.ready, false);
    t.end();
  });

test('production ratings admission overrides unrelated global operation churn',
  async (t) => {
    const calls = [];
    const result = await waitForAffinityDemoPreloadAdmission(
      oneAttemptOptions(async ({target, sql, timeoutMs}) => {
        calls.push({target, sql, timeoutMs});
        if (target === SNAPSHOT_TARGET) {
          return {
            rows: [buildControlSnapshot({
              replicaOperations: {
                inFlightCount: 1,
                staleInFlightCount: 0,
                rows: [{
                  operation_id: 'unrelated-nonblocking-operation',
                  partition_id: 'config-p1',
                }],
              },
            })],
          };
        }
        return {rows: [{1: 1}]};
      }),
    );

    t.equal(result.admitted, true,
      'an admitted ratings probe is final even while unrelated work exists');
    t.equal(result.snapshot.ready, false,
      'typed snapshot preserves the global-operation observation');
    t.equal(result.snapshot.state, 'operation_drain_progressing');
    t.equal(result.snapshot.effectiveInFlightCount, 1,
      'the absent optional discount does not hide unrelated work');
    t.same(calls, [
      {target: SNAPSHOT_TARGET, sql: SNAPSHOT_SQL, timeoutMs: 1},
      {target: LOAD_TARGET, sql: RATINGS_PROBE_SQL, timeoutMs: 1},
    ], 'snapshot and ratings admission use their production lanes');
    t.end();
  });

test('typed quiet snapshot cannot bypass ratings-specific admission',
  async (t) => {
    const error = await t.rejects(
      waitForAffinityDemoPreloadAdmission(oneAttemptOptions(
        async ({target}) => {
          if (target === SNAPSHOT_TARGET) {
            return {rows: [buildControlSnapshot()]};
          }
          throw new Error(
            'serve not ready: load lane admission denied ' +
            '(reasons=benchmark_admission_blocked)',
          );
        },
      )),
      /benchmark_admission_blocked/,
    );
    t.equal(error.preloadAdmission.loadLaneAdmission.admitted, false);
    t.equal(error.preloadAdmission.snapshot.ready, true,
      'the quiet observation is retained but never becomes admission');
    t.end();
  });

test('snapshot blindness and pressure fail closed before ratings admission',
  async (t) => {
    for (const failure of [
      {
        label: 'blindness',
        error: new Error('snapshot rows unavailable'),
        state: 'observation_unavailable',
      },
      {
        label: 'pressure',
        error: new Error('Admin API query timed out under pressure'),
        state: 'control_plane_pressure',
      },
    ]) {
      let loadCalls = 0;
      const error = await t.rejects(
        waitForAffinityDemoPreloadAdmission(oneAttemptOptions(
          async ({target}) => {
            if (target === LOAD_TARGET) {
              loadCalls += 1;
            }
            throw failure.error;
          },
        )),
        failure.error.message,
        `${failure.label} remains a typed denial`,
      );
      t.equal(error.preloadAdmission.snapshot.state, failure.state);
      t.equal(loadCalls, 0,
        `${failure.label} cannot fall through to the ratings probe`);
    }
    t.end();
  });

test('missing, stale, deferred, and failed snapshot observations fail closed',
  async (t) => {
    for (const observation of [
      null,
      {state: 'stale_usable', reasonCodes: ['revision_behind']},
      {state: 'deferred_refresh', reasonCodes: ['refresh_pending']},
      {state: 'failed', reasonCodes: ['authoritative_read_failed']},
    ]) {
      let loadCalls = 0;
      const snapshot = buildControlSnapshot();
      if (observation === null) {
        delete snapshot.snapshotObservation;
      } else {
        snapshot.snapshotObservation = observation;
      }
      const error = await t.rejects(
        waitForAffinityDemoPreloadAdmission(oneAttemptOptions(
          async ({target}) => {
            if (target === SNAPSHOT_TARGET) {
              return {rows: [snapshot]};
            }
            loadCalls += 1;
            return {rows: [{1: 1}]};
          },
        )),
        /control snapshot observation failed/,
      );
      t.equal(error.preloadAdmission.snapshot.state,
        'observation_unavailable');
      t.equal(loadCalls, 0,
        `${observation?.state || 'missing'} cannot reach ratings admission`);
    }
    t.end();
  });

test('snapshot and load queries share one non-resetting outer budget',
  async (t) => {
    let nowMs = 0;
    const queryTimeouts = [];
    const error = await t.rejects(
      waitForAffinityDemoPreloadAdmission({
        target: BASE_TARGET,
        now: () => nowMs,
        sleep: async () => {},
        timeoutMs: 5,
        pollIntervalMs: 0,
        query: async ({target, timeoutMs}) => {
          queryTimeouts.push({target, timeoutMs});
          if (target === SNAPSHOT_TARGET) {
            nowMs = 4;
            return {rows: [buildControlSnapshot()]};
          }
          nowMs = 6;
          throw new Error('load probe timed out');
        },
      }),
      /load probe timed out/,
    );
    t.same(queryTimeouts, [
      {target: SNAPSHOT_TARGET, timeoutMs: 5},
      {target: LOAD_TARGET, timeoutMs: 1},
    ], 'load receives only the budget remaining after snapshot observation');
    t.equal(error.preloadAdmission.loadLaneAdmission.state, 'denied');
    t.end();
  });

test('MovieLens demo retires the raw global-operation gate and test imports',
  async (t) => {
    const [runnerSource, gateSource] = await Promise.all([
      readFile('examples/service-data-affinity/run-affinity-demo.js', 'utf8'),
      readFile(
        'examples/service-data-affinity/affinity-demo-preload-gate.js',
        'utf8',
      ),
    ]);
    const combinedSource = runnerSource + gateSource;
    t.notMatch(runnerSource, /waitForControlPlaneSettling/);
    t.notMatch(runnerSource, /evaluateLedgerSpreadRows/);
    t.notMatch(runnerSource, /FROM replica_operations/);
    t.notMatch(
      runnerSource,
      /formation-ledger-self-move-blocks-cluster-ops/,
      'the cutover cannot reinterpret the retired formation-quest metric',
    );
    t.match(runnerSource, /waitForAffinityDemoPreloadAdmission/);
    t.match(
      runnerSource,
      /const LOAD_TARGET = `\$\{TARGET\}\?lane=load`/,
      'the loader lane is derived from the same production admin target',
    );
    t.match(
      runnerSource,
      /loadRatingsIntoLagrange\(\{target: LOAD_TARGET\}\)/,
      'the actual ratings loader uses the production load lane',
    );
    t.notMatch(combinedSource, /(?:from|import\()\s*['"]\.\.\/\.\.\/test\//,
      'examples consume production owners and never test-only machinery');
    t.end();
  });
