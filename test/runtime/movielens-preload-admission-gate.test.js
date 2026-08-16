import {readFile} from 'node:fs/promises';
import {test} from '../../src/test-helpers/tap.js';
import {
  waitForAffinityDemoSchemaAdmission,
  waitForAffinityDemoPreloadAdmission,
} from '../../examples/service-data-affinity/affinity-demo-preload-gate.js';
import {
  SCHEMA_ADMISSION_TRANSITION_HISTORY_LIMIT,
} from '../../examples/service-data-affinity/affinity-demo-schema-admission-history.js';

const BASE_TARGET = 'ws://127.0.0.1:8081/api/admin/stream';
const SNAPSHOT_TARGET = `${BASE_TARGET}?lane=snapshot`;
const LOAD_TARGET = `${BASE_TARGET}?lane=load`;
const SNAPSHOT_SQL = 'SELECT * FROM control_snapshot_local()';
const FORCE_REPAIR_SNAPSHOT_SQL = 'SELECT * FROM control_snapshot_local(true)';
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
    controlPlaneDiagnostics: {
      currentPriorityPlacementObservation: {
        state: 'available',
        source: 'control_snapshot_captured_rows',
        capturedAt: NOW_MS,
        satisfied: true,
        priorityPartitionSummary: {
          satisfied: true,
          blockedPartitionCount: 0,
          largestSpreadGap: 0,
          totalSpreadGap: 0,
          missingPartitionIds: [],
          blockedPartitions: [],
        },
        leaderCoverage: {
          satisfied: true,
          requiredPartitionCount: 6,
          observedLeaderPartitionCount: 6,
          missingLeaderPartitionCount: 0,
          missingLeaderPartitionIds: [],
        },
      },
      priorityRecoveryObservation: {
        priorityPartitionSummary: {
          satisfied: true,
          blockedPartitionCount: 0,
          largestSpreadGap: 0,
          totalSpreadGap: 0,
          missingPartitionIds: [],
          blockedPartitions: [],
        },
      },
    },
    ...overrides,
  };
}

function buildOpenPrioritySpreadDiagnostics(totalSpreadGap = 2) {
  return {
    currentPriorityPlacementObservation: {
      state: 'available',
      source: 'control_snapshot_captured_rows',
      capturedAt: NOW_MS,
      satisfied: false,
      priorityPartitionSummary: {
        satisfied: false,
        blockedPartitionCount: 1,
        largestSpreadGap: totalSpreadGap,
        totalSpreadGap,
        missingPartitionIds: ['replica_operations-p1'],
        blockedPartitions: [{
          partitionId: 'replica_operations-p1',
          spreadGap: totalSpreadGap,
        }],
      },
      leaderCoverage: {
        satisfied: true,
        requiredPartitionCount: 6,
        observedLeaderPartitionCount: 6,
        missingLeaderPartitionCount: 0,
        missingLeaderPartitionIds: [],
      },
    },
    priorityRecoveryObservation: {
      priorityPartitionSummary: {
        satisfied: false,
        blockedPartitionCount: 1,
        largestSpreadGap: totalSpreadGap,
        totalSpreadGap,
        missingPartitionIds: ['replica_operations-p1'],
        blockedPartitions: [{
          partitionId: 'replica_operations-p1',
          spreadGap: totalSpreadGap,
        }],
      },
    },
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
    stableWindowMs: 0,
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

test('pre-schema admission requires current priority leader coverage',
  async (t) => {
    const snapshot = buildControlSnapshot();
    const currentObservation =
      snapshot.controlPlaneDiagnostics.currentPriorityPlacementObservation;
    currentObservation.satisfied = false;
    currentObservation.leaderCoverage = {
      satisfied: false,
      requiredPartitionCount: 6,
      observedLeaderPartitionCount: 5,
      missingLeaderPartitionCount: 1,
      missingLeaderPartitionIds: ['schema_operations-p1'],
    };
    const error = await t.rejects(
      waitForAffinityDemoSchemaAdmission(boundedSchemaOptions(
        async () => ({rows: [snapshot]}),
        1,
      )),
      /critical_system_spread_gap=1/,
    );
    t.equal(error.schemaAdmission.admitted, false);
    t.same(
      error.schemaAdmission.snapshot.criticalSystemTopology
        .missingLeaderPartitionIds,
      ['schema_operations-p1'],
      'a sticky closed spread summary cannot hide missing current leadership',
    );
    t.end();
  });

test('sticky priority recovery closure cannot replace the current witness',
  async (t) => {
    const snapshot = buildControlSnapshot();
    delete snapshot.controlPlaneDiagnostics.currentPriorityPlacementObservation;
    const error = await t.rejects(
      waitForAffinityDemoSchemaAdmission(boundedSchemaOptions(
        async () => ({rows: [snapshot]}),
        1,
      )),
      /critical_system_snapshot_reachability_unavailable=1/,
    );
    t.equal(
      error.schemaAdmission.snapshot.state,
      'critical_spread_observation_unavailable',
    );
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

test('pre-schema admission consumes authoritative numeric priority spread data',
  async (t) => {
    const snapshots = [
      buildControlSnapshot(),
      buildControlSnapshot({
        controlPlaneDiagnostics: buildOpenPrioritySpreadDiagnostics(),
      }),
      buildControlSnapshot(),
      buildControlSnapshot(),
    ];
    let index = 0;
    const result = await waitForAffinityDemoSchemaAdmission(
      boundedSchemaOptions(async () => ({rows: [snapshots[index++]]})),
    );

    t.equal(index, 4,
      'an open numeric gap resets rather than contributing confirmation');
    t.equal(result.stableConfirmationCount, 2);
    t.equal(result.snapshot.criticalSystemTopology.enabled, true);
    t.equal(result.snapshot.criticalSystemTopology.ready, true);
    t.equal(result.snapshot.criticalSystemTopology.totalSpreadGap, 0);

    const openGapError = await t.rejects(
      waitForAffinityDemoSchemaAdmission(boundedSchemaOptions(
        async () => ({rows: [buildControlSnapshot({
          controlPlaneDiagnostics: buildOpenPrioritySpreadDiagnostics(2),
        })]}),
        1,
      )),
      /critical_system_spread_gap=2/,
    );
    t.equal(openGapError.schemaAdmission.admitted, false);
    t.equal(
      openGapError.schemaAdmission.snapshot.state,
      'critical_spread_open',
    );
    t.equal(
      openGapError.schemaAdmission.snapshot.criticalSystemTopology
        .totalSpreadGap,
      2,
      'the gate retains the owner-published numeric deficit',
    );

    const blindError = await t.rejects(
      waitForAffinityDemoSchemaAdmission(boundedSchemaOptions(
        async () => ({rows: [buildControlSnapshot({
          controlPlaneDiagnostics: {},
        })]}),
        1,
      )),
      /critical_system_snapshot_reachability_unavailable=1/,
    );
    t.equal(
      blindError.schemaAdmission.snapshot.state,
      'critical_spread_observation_unavailable',
      'missing priority owner data cannot look like zero spread demand',
    );
    t.end();
  });

test('stale schema observations use canonical repair inside the outer budget',
  async (t) => {
    const calls = [];
    const result = await waitForAffinityDemoSchemaAdmission(
      boundedSchemaOptions(async (call) => {
        calls.push(call);
        if (call.sql === SNAPSHOT_SQL) {
          return {rows: [buildControlSnapshot({
            snapshotObservation: {
              state: 'stale_usable',
              reasonCodes: ['cache_stale_watermark'],
            },
          })]};
        }
        return {rows: [buildControlSnapshot()]};
      }),
    );

    t.equal(result.admitted, true);
    t.equal(result.stableConfirmationCount, 2,
      'only fresh post-repair observations count as confirmations');
    t.same(calls, [
      {target: SNAPSHOT_TARGET, sql: SNAPSHOT_SQL, timeoutMs: 8},
      {
        target: SNAPSHOT_TARGET,
        sql: FORCE_REPAIR_SNAPSHOT_SQL,
        timeoutMs: 8,
      },
      {target: SNAPSHOT_TARGET, sql: SNAPSHOT_SQL, timeoutMs: 7},
      {
        target: SNAPSHOT_TARGET,
        sql: FORCE_REPAIR_SNAPSHOT_SQL,
        timeoutMs: 7,
      },
    ], 'stale local evidence traverses the existing snapshot owner command');
    t.end();
  });

test('stale schema denial retains the bounded ready-lease witness unchanged',
  async (t) => {
    const readyLeaseAgeWitness = {
      schemaVersion: 1,
      state: 'available',
      nodeId: 'node-stale',
      readyLease: {
        state: 'available',
        expiresAtMs: NOW_MS - 1,
        ageMs: 1,
      },
    };
    const staleSnapshot = buildControlSnapshot({
      snapshotObservation: {
        state: 'stale_usable',
        reasonCodes: ['cache_stale_watermark'],
      },
      controlPlaneDiagnostics: {
        ...buildControlSnapshot().controlPlaneDiagnostics,
        readyLeaseAgeWitness,
      },
    });
    const error = await t.rejects(
      waitForAffinityDemoSchemaAdmission(boundedSchemaOptions(
        async () => ({rows: [staleSnapshot]}),
        1,
      )),
      /MovieLens schema admission timed out/,
    );

    t.same(
      error.schemaAdmission.snapshot.readyLeaseAgeWitness,
      readyLeaseAgeWitness,
      'the lossy quiescence projection retains only the bounded witness',
    );
    t.same(
      staleSnapshot.snapshotObservation,
      {
        state: 'stale_usable',
        reasonCodes: ['cache_stale_watermark'],
      },
      'diagnostic retention does not rewrite the owner observation',
    );
    t.equal(
      error.message,
      'MovieLens schema admission timed out: ' +
        'snapshot_query_error=control snapshot observation failed ' +
        '(stale_usable): cache_stale_watermark',
      'time-varying witness fields do not enter the stable error vocabulary',
    );
    t.end();
  });

test('authoritative snapshot repair cannot reset or outlive schema budget',
  async (t) => {
    let nowMs = 0;
    const calls = [];
    const readyLeaseAgeWitness = {
      schemaVersion: 1,
      state: 'available',
      nodeId: 'node-repair-timeout',
    };
    const error = await t.rejects(
      waitForAffinityDemoSchemaAdmission({
        target: BASE_TARGET,
        now: () => nowMs,
        sleep: async () => {},
        timeoutMs: 5,
        pollIntervalMs: 0,
        stableWindowMs: 0,
        query: async (call) => {
          calls.push(call);
          if (call.sql === SNAPSHOT_SQL) {
            nowMs = 4;
            return {rows: [buildControlSnapshot({
              snapshotObservation: {
                state: 'stale_usable',
                reasonCodes: ['cache_stale_watermark'],
              },
              controlPlaneDiagnostics: {
                ...buildControlSnapshot().controlPlaneDiagnostics,
                readyLeaseAgeWitness,
              },
            })]};
          }
          nowMs = 6;
          throw new Error('forced repair exceeded its remaining budget');
        },
      }),
      /forced repair exceeded its remaining budget/,
    );
    t.same(calls, [
      {target: SNAPSHOT_TARGET, sql: SNAPSHOT_SQL, timeoutMs: 5},
      {
        target: SNAPSHOT_TARGET,
        sql: FORCE_REPAIR_SNAPSHOT_SQL,
        timeoutMs: 1,
      },
    ]);
    t.equal(error.schemaAdmission.admitted, false,
      'a failed authoritative repair remains a typed denial');
    t.same(
      error.schemaAdmission.snapshot.readyLeaseAgeWitness,
      readyLeaseAgeWitness,
      'a thrown forced repair retains the last bounded chronology witness',
    );
    t.end();
  });

test('schema admission survives a full partition evaluation interval',
  async (t) => {
    let nowMs = 0;
    const observationTimes = [];
    const result = await waitForAffinityDemoSchemaAdmission({
      target: BASE_TARGET,
      now: () => nowMs,
      sleep: async (delayMs) => {
        nowMs += delayMs;
      },
      timeoutMs: 160_000,
      pollIntervalMs: 20_000,
      stableWindowMs: 60_000,
      query: async () => {
        observationTimes.push(nowMs);
        if (nowMs === 40_000) {
          return {rows: [buildControlSnapshot({
            replicaOperations: {
              inFlightCount: 1,
              staleInFlightCount: 0,
              rows: [{operation_id: 'scheduled-recovery-cycle'}],
            },
          })]};
        }
        return {rows: [buildControlSnapshot()]};
      },
    });

    t.same(observationTimes, [
      0, 20_000, 40_000, 60_000, 80_000, 100_000, 120_000, 140_000,
    ], 'scheduled work resets the candidate before one full quiet interval');
    t.equal(result.stableConfirmationCount, 2,
      'two confirmations occur only after the full interval closes');
    t.equal(result.snapshot.state, 'quiescent');
    t.equal(result.snapshot.stableElapsedMs, 80_000,
      'the admitted evidence retains the uninterrupted quiet duration');
    t.end();
  });

test('schema admission shares an operation-only drain anchor with background release',
  async (t) => {
    let nowMs = NOW_MS;
    const drainAtMs = NOW_MS + 1_000;
    const observationTimes = [
      NOW_MS,
      NOW_MS + 6_673,
      NOW_MS + 61_928,
      NOW_MS + 67_178,
      NOW_MS + 71_030,
      NOW_MS + 180_000,
    ];
    let observationIndex = 0;
    const inFlightOperation = {
      operation_id: 'formation-add',
      type: 'ADD',
      partition_id: 'schema_operations-p1',
      replica_id: 'schema_operations-p1-r4',
      status: 'syncing',
      workflow_step: 'SYNCING',
      created_at: NOW_MS - 1_000,
      updated_at: NOW_MS,
      completed_at: null,
      steps_history: '[]',
    };
    const drainedOperation = {
      ...inFlightOperation,
      status: 'active',
      workflow_step: 'ACTIVE',
      updated_at: drainAtMs,
      completed_at: drainAtMs,
    };

    const result = await waitForAffinityDemoSchemaAdmission({
      target: BASE_TARGET,
      now: () => nowMs,
      sleep: async () => {},
      timeoutMs: 180_000,
      pollIntervalMs: 0,
      stableWindowMs: 60_000,
      query: async () => {
        nowMs = observationTimes[observationIndex++];
        if (observationIndex === 1 || observationIndex >= 5) {
          return {rows: [buildControlSnapshot({
            replicaOperations: {
              inFlightCount: 1,
              staleInFlightCount: 0,
              rows: [inFlightOperation],
            },
          })]};
        }
        return {rows: [buildControlSnapshot({
          replicaOperations: {
            inFlightCount: 0,
            staleInFlightCount: 0,
            rows: [drainedOperation],
          },
        })]};
      },
    });

    t.equal(observationIndex, 4,
      'two mature observations complete before ordinary release at drain+70000ms');
    t.equal(result.stableConfirmationCount, 2);
    t.equal(result.snapshot.stableElapsedMs, 66_178,
      'the schema clock starts at the retained coordinator-owned drain');
    t.equal(result.snapshot.latestTopologyDrainAtMs, drainAtMs);
    t.end();
  });

test('schema admission does not backdate across a priority-spread blocker',
  async (t) => {
    let nowMs = NOW_MS;
    const drainAtMs = NOW_MS + 1_000;
    const observationTimes = [
      NOW_MS,
      NOW_MS + 6_673,
      NOW_MS + 60_928,
      NOW_MS + 66_178,
      NOW_MS + 70_000,
      NOW_MS + 72_000,
    ];
    let observationIndex = 0;
    const drainedOperation = {
      operation_id: 'formation-add',
      type: 'ADD',
      partition_id: 'schema_operations-p1',
      replica_id: 'schema_operations-p1-r4',
      status: 'active',
      workflow_step: 'ACTIVE',
      created_at: NOW_MS - 1_000,
      updated_at: drainAtMs,
      completed_at: drainAtMs,
      steps_history: '[]',
    };

    const result = await waitForAffinityDemoSchemaAdmission({
      target: BASE_TARGET,
      now: () => nowMs,
      sleep: async () => {},
      timeoutMs: 180_000,
      pollIntervalMs: 0,
      stableWindowMs: 60_000,
      query: async () => {
        nowMs = observationTimes[observationIndex++];
        if (observationIndex === 1) {
          return {rows: [buildControlSnapshot({
            replicaOperations: {
              inFlightCount: 1,
              staleInFlightCount: 0,
              rows: [{
                ...drainedOperation,
                status: 'syncing',
                workflow_step: 'SYNCING',
                completed_at: null,
              }],
            },
            controlPlaneDiagnostics: buildOpenPrioritySpreadDiagnostics(),
          })]};
        }
        return {rows: [buildControlSnapshot({
          replicaOperations: {
            inFlightCount: 0,
            staleInFlightCount: 0,
            rows: [drainedOperation],
          },
        })]};
      },
    });

    t.equal(observationIndex, 6,
      'the independent spread blocker keeps the clock on the fresh ready observation');
    t.equal(result.stableConfirmationCount, 2);
    t.equal(result.snapshot.stableElapsedMs, 65_327);
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
      /(?:const|let) LOAD_TARGET = `\$\{TARGET\}\?lane=load`/,
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

test('pre-schema admission holds accumulated stability through a transient ' +
  'observer failure', async (t) => {
  // stableWindowMs 4 with 1ms polls: quiet polls at t=0..3 are candidates,
  // t=4 confirms (count 1), t=5 would confirm again (count 2). An observer
  // failure at t=5 must HOLD the window (blindness 1ms <= window 4ms) so the
  // t=6 quiet poll completes the sequence; the reset-on-anything rule would
  // instead restart the whole window and admit only around t=12.
  let call = 0;
  let currentNowMs = 1_000_000;
  const result = await waitForAffinityDemoSchemaAdmission({
    target: BASE_TARGET,
    now: () => currentNowMs,
    sleep: async () => {
      currentNowMs += 1;
    },
    timeoutMs: 40,
    pollIntervalMs: 0,
    stableWindowMs: 4,
    query: async () => {
      call += 1;
      if (call === 6) {
        throw new Error('Admin API query timed out');
      }
      return {rows: [buildControlSnapshot()]};
    },
  });
  t.equal(result.admitted, true,
    'admission should complete without restarting the stable window');
  t.equal(call, 7,
    'one real quiet poll after the observer failure should confirm');
  const heldTransition = result.transitionHistory.transitions.find(
    (transition) => transition.windowTransition === 'held',
  );
  t.equal(heldTransition?.state, 'control_plane_pressure',
    'transition evidence distinguishes observer blindness from real churn');
  t.match(
    heldTransition?.reasonCodes,
    ['control_plane_pressure', 'snapshot_query_error'],
    'the held transition retains its observer-error classification',
  );
  t.equal(heldTransition?.stabilityWindowHeld, true);
  t.equal(heldTransition?.stableConfirmationCount, 1,
    'the held transition retains accumulated confirmation evidence');
  t.end();
});

test('pre-schema admission still resets accumulated stability on real churn',
  async (t) => {
  // Same shape, but the poll after the first confirmation reports a REAL
  // spread gap: the regressing observation must forfeit the accumulated
  // window and confirmation, so admission needs a full fresh window.
    let call = 0;
    let currentNowMs = 1_000_000;
    const openSnapshot = buildControlSnapshot({
      controlPlaneDiagnostics: buildOpenPrioritySpreadDiagnostics(1),
    });
    const result = await waitForAffinityDemoSchemaAdmission({
      target: BASE_TARGET,
      now: () => currentNowMs,
      sleep: async () => {
        currentNowMs += 1;
      },
      timeoutMs: 40,
      pollIntervalMs: 0,
      stableWindowMs: 4,
      query: async () => {
        call += 1;
        if (call === 6) {
          return {rows: [openSnapshot]};
        }
        return {rows: [buildControlSnapshot()]};
      },
    });
    t.equal(result.admitted, true);
    t.ok(call >= 11,
      'a regressing poll must forfeit the window and restart the sequence, ' +
      `got ${call} polls`);
    const resetTransition = result.transitionHistory.transitions.find(
      (transition) => transition.windowTransition === 'reset',
    );
    t.equal(resetTransition?.state, 'critical_spread_open');
    t.equal(
      resetTransition?.canonicalBlocker,
      'critical_system_spread_open',
      'transition evidence names the real blocker that reset the window',
    );
    t.equal(resetTransition?.criticalSystemTopology.totalSpreadGap, 1);
    t.equal(resetTransition?.stableConfirmationCount, 0);
    t.end();
  });

test('schema admission transition evidence is change-only and bounded',
  async (t) => {
    let call = 0;
    let currentNowMs = 0;
    const timeoutMs = SCHEMA_ADMISSION_TRANSITION_HISTORY_LIMIT + 8;
    const error = await t.rejects(
      waitForAffinityDemoSchemaAdmission({
        target: BASE_TARGET,
        now: () => currentNowMs,
        sleep: async () => {
          currentNowMs += 1;
        },
        timeoutMs,
        pollIntervalMs: 0,
        stableWindowMs: timeoutMs * 2,
        query: async () => {
          call += 1;
          if (call > 3 && call % 2 === 0) {
            return {rows: [buildControlSnapshot({
              controlPlaneDiagnostics: buildOpenPrioritySpreadDiagnostics(1),
            })]};
          }
          return {rows: [buildControlSnapshot({
            replicaOperations: {
              inFlightCount: 1,
              staleInFlightCount: 0,
              rows: [{operation_id: `formation-operation-${call}`}],
            },
          })]};
        },
      }),
      /MovieLens schema admission timed out/,
    );
    const history = error.schemaAdmission.transitionHistory;
    t.equal(
      history.transitions.length,
      SCHEMA_ADMISSION_TRANSITION_HISTORY_LIMIT,
      'the live report cannot grow with an unbounded polling history',
    );
    t.ok(history.droppedTransitionCount > 0,
      'truncation remains explicit evidence rather than silent loss');
    t.ok(
      call >
        history.transitions.length + history.droppedTransitionCount,
      'unchanged consecutive observations collapse into one counted entry',
    );
    t.equal(
      history.transitions.at(-1).lastObservedAtMs,
      timeoutMs - 1,
      'the bounded tail retains the most recent transition',
    );
    t.equal(
      history.transitions.at(-1).canonicalBlocker,
      'critical_system_spread_open',
    );
    t.end();
  });

test('schema admission grants drain-aware grace extension when control plane quiesces late in budget',
  async (t) => {
    let currentNowMs = 95000;
    const stableWindowMs = 60000;
    const pollIntervalMs = 2000;
    const initialTimeoutMs = 10000; // 10s budget remaining at start
    const latestTopologyDrainAtMs = 90000;
    const initialDeadlineMs = currentNowMs + initialTimeoutMs; // 105,000ms

    const result = await waitForAffinityDemoSchemaAdmission({
      target: BASE_TARGET,
      now: () => currentNowMs,
      sleep: async (delay) => {
        currentNowMs += delay;
      },
      timeoutMs: initialTimeoutMs,
      pollIntervalMs,
      stableWindowMs,
      query: async () => {
        return {
          rows: [
            buildControlSnapshot({
              replicaOperations: {
                inFlightCount: 0,
                staleInFlightCount: 0,
                rows: [
                  {
                    operation_id: 'op-final-drain',
                    type: 'REMOVE',
                    operation_type: 'REMOVE',
                    status: 'removed',
                    workflow_step: 'REMOVED',
                    completed_at: latestTopologyDrainAtMs,
                    drained_at: latestTopologyDrainAtMs,
                    target_partition_id: 'schema_operations-p1',
                  },
                ],
              },
            }),
          ],
        };
      },
    });

    t.ok(result.admitted, 'schema admission should succeed with drain grace extension');
    t.ok(
      currentNowMs > initialDeadlineMs,
      'polling was extended beyond initial wall clock budget to confirm quiescence',
    );
    t.end();
  });

