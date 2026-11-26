/**
 * Stage 2 tests: truthful static Raft timing derivation, replica effective
 * timing inspection, static network timing profile resolution/application,
 * and end-to-end validation in dynamic config startup wiring & control-plane
 * budget consumers.
 */

import {EventEmitter} from 'node:events';
import {test} from '../../src/test-helpers/tap.js';
import {
  captureOriginalRaftRsTiming,
  describeEffectiveRaftRsTiming,
  recoveryRetryWindowMsOf,
  tuningOf,
} from '../../src/raft/raft-rs-runtime-tuning.js';
import {RAFT_RS_GROUP_TUNING} from '../../src/raft/raft-rs-group-constants.js';
import {resolveReplicaRaftTiming} from '../../src/raft/replica-raft-timing.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {CONFIG_KEY, CONFIG_SEED_SOURCE} from '../../src/config/config-constants.js';
import {TRANSPORT_CONFIG_KEY} from '../../src/constants/transport.js';
import {DynamicConfigService} from '../../src/config/dynamic-config-service.js';
import {
  NETWORK_TIMING_PROFILE,
  applyStaticNetworkTimingProfile,
  resolveStaticNetworkTimingProfile,
} from '../../src/config/network-timing-profile-resolver.js';
import {
  DYNAMIC_CONFIG_STARTUP_OUTCOME,
  createDynamicConfigStartupWiring,
} from '../../src/config/dynamic-config-startup-wiring.js';
import {LogsTableService} from '../../src/logging/logs-table-service.js';
import {
  ReplicaDispatchReplayHealthReadiness,
} from '../../src/control-plane/replica-dispatch-replay-health-readiness.js';
import {
  applyRuntimeNetworkTimingProfile,
} from '../../src/entrypoint-runtime-options.js';
import {ENTRYPOINT_ENV} from '../../src/constants/entrypoint.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  AuthoritativeControlPlaneView,
} from '../../src/control-plane/authoritative-control-plane-view.js';
import {
  AuthoritativeNodeEvidenceReconciler,
} from '../../src/control-plane/authoritative-node-evidence-reconciler.js';
import {
  ControlPlaneReadinessService,
} from '../../src/control-plane/control-plane-readiness-service.js';
import {
  MembershipSwimRuntime,
} from '../../src/control-plane/membership-swim-runtime.js';
import {
  NodeReadyLeaseAuthority,
} from '../../src/control-plane/node-ready-lease-authority.js';
import {
  resolveControlPlaneAuthoritativeQueryTimeoutMs,
  resolveControlPlaneQueryTimeoutMs,
} from '../../src/control-plane/timeout-budget.js';
import {
  ServiceLeaderReadinessOwner,
} from '../../src/bootstrap/owners/service-leader-readiness-owner.js';
import {
  ReplicaOperationRepository,
} from '../../src/rebalancer/replica-operation-repository.js';
import {
  ParallelQueryCoordinator,
} from '../../src/query/distributed/parallel-query-coordinator.js';
import {
  createPartitionAttemptBudget,
} from '../../src/query/query-executor-partition-attempt-budget.js';
import {HeartbeatService} from '../../src/control-plane/heartbeat-service.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {genesisStamp} from '../../src/raft/raft-committed-membership-stamp.js';
import {RAFT_OPERATION_OUTCOME} from '../../src/raft/raft-operation-port-constants.js';
import {
  applyPortRaftTimingConfig,
  readPortEffectiveRaftTiming,
} from '../../src/raft/raft-rs-operation-port.js';
import {
  retireReplicaLifecycle,
} from '../../src/raft/raft-rs-replica-lifecycle-owner.js';
import {pendingTurn, settledTurn} from '../../src/raft/raft-rs-turn-answer.js';

function createLocalConfigSqlEngine(rowsByKey) {
  return {
    async executeQuery(sql, params = []) {
      if (!sql.includes('WHERE config_key = ?')) {
        return {rows: []};
      }
      const key = params[0];
      const row = rowsByKey[key];
      return {rows: row ? [row] : []};
    },
  };
}

test('tuningOf and describeEffectiveRaftRsTiming report default discrepancy truthfully',
  async (t) => {
    const requested = {
      tickIntervalMs: 20,
      heartbeatMs: 50,
      electionMinMs: 1000,
      electionMaxMs: 3000,
    };
    const tuning = tuningOf(requested);
    t.equal(tuning.heartbeatTick, 3, '50ms / 20ms rounds to 3 heartbeat ticks');
    t.equal(tuning.electionTick, 50, '1000ms / 20ms yields 50 election ticks');
    t.equal(tuning.preVote, RAFT_RS_GROUP_TUNING.PRE_VOTE);
    t.equal(tuning.checkQuorum, RAFT_RS_GROUP_TUNING.CHECK_QUORUM);

    const description = describeEffectiveRaftRsTiming(requested);
    t.same(description.requested, requested);
    t.same(description.effective, {
      tickIntervalMs: 20,
      heartbeatTick: 3,
      electionTick: 50,
      effectiveHeartbeatMs: 60,
      effectiveElectionMinMs: 1000,
      effectiveElectionMaxMs: 2000,
      electionMaxControlledByCore: false,
    });
    t.equal(description.discrepancies.length, 2,
      'reports both heartbeat rounding and 2x election max window');
    t.same(
      description.discrepancies.map((item) => item.field),
      ['heartbeatMs', 'electionMaxMs'],
    );
    t.equal(description.discrepancies[0].requested, 50);
    t.equal(description.discrepancies[0].effective, 60);
    t.equal(description.discrepancies[1].requested, 3000);
    t.equal(description.discrepancies[1].effective, 2000);
    t.equal(recoveryRetryWindowMsOf(requested), 1000);
  });

test('tuningOf derives variable heartbeat ticks from tickIntervalMs and heartbeatMs',
  async (t) => {
    const slowTiming = {
      tickIntervalMs: 50,
      heartbeatMs: 150,
      electionMinMs: 9000,
      electionMaxMs: 18000,
    };
    const slowTuning = tuningOf(slowTiming);
    t.equal(slowTuning.heartbeatTick, 3);
    t.equal(slowTuning.electionTick, 180);
    const slowDescription = describeEffectiveRaftRsTiming(slowTiming);
    t.equal(slowDescription.effective.effectiveHeartbeatMs, 150);
    t.equal(slowDescription.effective.effectiveElectionMinMs, 9000);
    t.equal(slowDescription.effective.effectiveElectionMaxMs, 18000);
    t.equal(slowDescription.effective.electionMaxControlledByCore, false);
    t.same(slowDescription.discrepancies, [],
      'exact tick-aligned slow Wi-Fi preset has no timing discrepancy');

    const wideRatioTiming = {
      tickIntervalMs: 20,
      heartbeatMs: 100,
      electionMinMs: 1000,
      electionMaxMs: 2000,
    };
    const wideTuning = tuningOf(wideRatioTiming);
    t.equal(wideTuning.heartbeatTick, 5,
      '100ms heartbeat at 20ms tick produces 5 ticks instead of hardcoded 3');
    const wideDescription = describeEffectiveRaftRsTiming(wideRatioTiming);
    t.equal(wideDescription.effective.effectiveHeartbeatMs, 100);
    t.same(wideDescription.discrepancies, []);

    const clampedElection = describeEffectiveRaftRsTiming({
      tickIntervalMs: 50,
      heartbeatMs: 500,
      electionMinMs: 400,
      electionMaxMs: 1000,
    });
    t.equal(clampedElection.effective.heartbeatTick, 10);
    t.equal(clampedElection.effective.electionTick, 11);
    t.equal(clampedElection.effective.effectiveElectionMinMs, 550);
    t.equal(clampedElection.effective.effectiveElectionMaxMs, 1100);
    t.same(
      clampedElection.discrepancies.map((item) => item.field),
      ['electionMinMs', 'electionMaxMs'],
    );
  });

test('describeEffectiveRaftRsTiming reports derived tick when tickIntervalMs is omitted',
  async (t) => {
    const omittedTick = describeEffectiveRaftRsTiming({
      heartbeatMs: 150,
      electionMinMs: 1000,
    });
    t.equal(omittedTick.requested.tickIntervalMs, null);
    t.equal(omittedTick.requested.electionMaxMs, null);
    t.equal(omittedTick.effective.tickIntervalMs, 50);
    t.equal(omittedTick.effective.heartbeatTick, 3);
    t.equal(omittedTick.effective.electionTick, 20);
    t.equal(omittedTick.effective.effectiveHeartbeatMs, 150);
    t.equal(omittedTick.effective.effectiveElectionMaxMs, 2000);
    t.equal(omittedTick.discrepancies[0].field, 'tickIntervalMs');
    t.equal(omittedTick.discrepancies[0].effective, 50);
  });

test('captureOriginalRaftRsTiming captures each timing getter once with electionMaxMs',
  async (t) => {
    let tickReads = 0;
    let electionMaxReads = 0;
    const captured = captureOriginalRaftRsTiming({
      heartbeatMs: 50,
      electionMinMs: 1000,
      get tickIntervalMs() {
        tickReads += 1;
        return 20;
      },
      get electionMaxMs() {
        electionMaxReads += 1;
        return 3000;
      },
    });
    t.equal(tickReads, 1);
    t.equal(electionMaxReads, 1);
    t.equal(Object.isFrozen(captured), true);
    t.same(captured, {
      heartbeatMs: 50,
      tickIntervalMs: 20,
      electionMinMs: 1000,
      electionMaxMs: 3000,
    });
  });

test('resolveReplicaRaftTiming exposes requested and effective timing truth', async (t) => {
  ConfigurationManager.resetInstance();
  t.teardown(() => ConfigurationManager.resetInstance());
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'timing-replica-node'}});
  applyStaticNetworkTimingProfile(
    config,
    NETWORK_TIMING_PROFILE.EXPERIMENTAL_WIFI_SLOW,
  );

  const replicaTiming = resolveReplicaRaftTiming({
    replicaId: 'r-1',
    replicaIds: ['r-1', 'r-2', 'r-3'],
  });
  t.equal(replicaTiming.tickIntervalMs, 50);
  t.equal(replicaTiming.heartbeatMs, 150);
  t.equal(replicaTiming.electionMinMs, 9000);
  t.equal(replicaTiming.electionMaxMs, 18000);
  t.equal(replicaTiming.effective.effectiveHeartbeatMs, 150);
  t.equal(replicaTiming.effective.electionTick, 180);
  t.equal(replicaTiming.effective.effectiveElectionMaxMs, 18000);
  t.same(replicaTiming.discrepancies, []);
});

test('resolveStaticNetworkTimingProfile resolves default and experimental-wifi-slow presets',
  async (t) => {
    const defaultProfile = resolveStaticNetworkTimingProfile(
      NETWORK_TIMING_PROFILE.DEFAULT,
    );
    t.equal(Object.isFrozen(defaultProfile), true);
    t.equal(defaultProfile.profileId, 'default');
    t.same(
      {
        tickIntervalMs: defaultProfile.requested.tickIntervalMs,
        heartbeatIntervalMs: defaultProfile.requested.heartbeatIntervalMs,
        electionTimeoutMinMs: defaultProfile.requested.electionTimeoutMinMs,
        electionTimeoutMaxMs: defaultProfile.requested.electionTimeoutMaxMs,
        transportMessageTimeoutMs: defaultProfile.requested.transportMessageTimeoutMs,
        controlPlaneOperationBudgetMs:
          defaultProfile.requested.controlPlaneOperationBudgetMs,
        readinessObservationProbeTimeoutMs:
          defaultProfile.requested.readinessObservationProbeTimeoutMs,
      },
      {
        tickIntervalMs: 20,
        heartbeatIntervalMs: 50,
        electionTimeoutMinMs: 1000,
        electionTimeoutMaxMs: 2000,
        transportMessageTimeoutMs: 5000,
        controlPlaneOperationBudgetMs: 10000,
        readinessObservationProbeTimeoutMs: 1000,
      },
    );
    t.equal(defaultProfile.effective.heartbeatTick, 3);
    t.equal(defaultProfile.effective.effectiveHeartbeatMs, 60);
    t.equal(defaultProfile.effective.electionTick, 50);
    t.equal(defaultProfile.effective.effectiveElectionMinMs, 1000);
    t.equal(defaultProfile.effective.effectiveElectionMaxMs, 2000);
    t.equal(defaultProfile.effective.electionMaxControlledByCore, false);
    t.equal(defaultProfile.discrepancies.length, 1);
    t.equal(defaultProfile.discrepancies[0].field, 'heartbeatMs');

    const wifiSlowProfile = resolveStaticNetworkTimingProfile(
      NETWORK_TIMING_PROFILE.EXPERIMENTAL_WIFI_SLOW,
    );
    t.equal(wifiSlowProfile.profileId, 'experimental-wifi-slow');
    t.same(
      {
        tickIntervalMs: wifiSlowProfile.requested.tickIntervalMs,
        heartbeatIntervalMs: wifiSlowProfile.requested.heartbeatIntervalMs,
        electionTimeoutMinMs: wifiSlowProfile.requested.electionTimeoutMinMs,
        electionTimeoutMaxMs: wifiSlowProfile.requested.electionTimeoutMaxMs,
        transportMessageTimeoutMs:
          wifiSlowProfile.requested.transportMessageTimeoutMs,
        controlPlaneOperationBudgetMs:
          wifiSlowProfile.requested.controlPlaneOperationBudgetMs,
        readinessObservationProbeTimeoutMs:
          wifiSlowProfile.requested.readinessObservationProbeTimeoutMs,
      },
      {
        tickIntervalMs: 50,
        heartbeatIntervalMs: 150,
        electionTimeoutMinMs: 9000,
        electionTimeoutMaxMs: 18000,
        transportMessageTimeoutMs: 12000,
        controlPlaneOperationBudgetMs: 25000,
        readinessObservationProbeTimeoutMs: 1000,
      },
    );
    t.equal(wifiSlowProfile.effective.heartbeatTick, 3);
    t.equal(wifiSlowProfile.effective.effectiveHeartbeatMs, 150);
    t.equal(wifiSlowProfile.effective.electionTick, 180);
    t.equal(wifiSlowProfile.effective.effectiveElectionMinMs, 9000);
    t.equal(wifiSlowProfile.effective.effectiveElectionMaxMs, 18000);
    t.equal(wifiSlowProfile.effective.readinessObservationProbeTimeoutMs, 1000);
    t.equal(wifiSlowProfile.effective.electionMaxControlledByCore, false);
    t.same(wifiSlowProfile.discrepancies, []);
  });

test('resolveStaticNetworkTimingProfile rejects invalid or contradictory timing inputs',
  async (t) => {
    const invalidCases = [
      ['unknown profile name', 'nonexistent-profile'],
      ['zero tick', {tickIntervalMs: 0}],
      ['negative tick', {tickIntervalMs: -10}],
      ['heartbeat below tick', {tickIntervalMs: 50, heartbeatIntervalMs: 40}],
      ['electionMin equal to 2x heartbeat', {
        tickIntervalMs: 20,
        heartbeatIntervalMs: 500,
        electionTimeoutMinMs: 1000,
      }],
      ['electionMin below 2x heartbeat', {
        tickIntervalMs: 20,
        heartbeatIntervalMs: 600,
        electionTimeoutMinMs: 1000,
      }],
      ['electionMax below electionMin', {
        electionTimeoutMinMs: 2000,
        electionTimeoutMaxMs: 1500,
      }],
      ['transportTimeout <= heartbeat', {
        heartbeatIntervalMs: 200,
        electionTimeoutMinMs: 1000,
        transportMessageTimeoutMs: 200,
      }],
      ['non-positive probe timeout', {readinessObservationProbeTimeoutMs: 0}],
      ['non-positive operation budget', {controlPlaneOperationBudgetMs: -5}],
      ['NaN override', {heartbeatIntervalMs: Number.NaN}],
      ['unknown field', {unknownFieldMs: 100}],
      ['array input', []],
      ['conflicting selector', {
        profile: NETWORK_TIMING_PROFILE.DEFAULT,
        profileId: NETWORK_TIMING_PROFILE.EXPERIMENTAL_WIFI_SLOW,
      }],
    ];

    for (const [label, input] of invalidCases) {
      let caught = null;
      try {
        resolveStaticNetworkTimingProfile(input);
      } catch (error) {
        caught = error;
      }
      t.ok(caught, `${label} throws`);
      t.equal(caught?.code, 'INVALID_NETWORK_TIMING_PROFILE',
        `${label} throws typed INVALID_NETWORK_TIMING_PROFILE error`);
    }

    t.throws(
      () => applyStaticNetworkTimingProfile(null, NETWORK_TIMING_PROFILE.DEFAULT),
      {code: 'INVALID_NETWORK_TIMING_PROFILE'},
    );
  });

test('applyStaticNetworkTimingProfile writes canonical keys and wires probe/log budgets',
  async (t) => {
    ConfigurationManager.resetInstance();
    LogsTableService.resetInstance();
    t.teardown(() => {
      LogsTableService.resetInstance();
      ConfigurationManager.resetInstance();
    });
    const config = ConfigurationManager.getInstance();
    config.initialize({node: {id: 'profile-wire-node'}});

    const applied = applyStaticNetworkTimingProfile(
      config,
      NETWORK_TIMING_PROFILE.EXPERIMENTAL_WIFI_SLOW,
    );
    t.equal(applied.profileId, NETWORK_TIMING_PROFILE.EXPERIMENTAL_WIFI_SLOW);
    t.equal(config.get(CONFIG_KEY.RAFT_TICK_INTERVAL_MS), 50);
    t.equal(config.get(CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS), 150);
    t.equal(config.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS), 9000);
    t.equal(config.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS), 18000);
    t.equal(config.get(TRANSPORT_CONFIG_KEY.MESSAGE_TIMEOUT_MS), 12000);
    t.equal(config.get(CONFIG_KEY.TIMEOUT_CONTROL_PLANE_OPERATION_BUDGET_MS), 25000);
    t.equal(config.get(CONFIG_KEY.TIMEOUT_READINESS_OBSERVATION_PROBE_TIMEOUT_MS), 1000);
    t.equal(config.validate(config.config), true,
      'updated ConfigurationManager config satisfies CONFIG_SCHEMA');

    const capturedWrites = [];
    const logsService = new LogsTableService({
      batchSize: 10,
      logsOwner: {
        async upsertLogs(rows, options) {
          capturedWrites.push({rows, options});
          return {success: true};
        },
      },
    });
    await logsService.writeEntriesToTable([
      {level: 'info', nodeId: 'profile-wire-node', message: 'hello'},
    ]);
    t.equal(capturedWrites.length, 1);
    t.equal(capturedWrites[0].options.queryTimeoutMs, 25000,
      'LogsTableService passes configured controlPlaneOperationBudgetMs to logsOwner');

    const refreshProbeMs =
      ReplicaDispatchReplayHealthReadiness.prototype
        .normalizeDispatchReadinessRefreshTimeoutMs.call({
          operationDispatchRetryAfterMs: 250,
        });
    t.equal(refreshProbeMs, 1000,
      'dispatch freshness probe remains short at 1000ms under slow Wi-Fi profile');

    applyStaticNetworkTimingProfile(config, {
      profileId: NETWORK_TIMING_PROFILE.EXPERIMENTAL_WIFI_SLOW,
      readinessObservationProbeTimeoutMs: 750,
    });
    t.equal(
      ReplicaDispatchReplayHealthReadiness.prototype
        .normalizeDispatchReadinessRefreshTimeoutMs.call({
          operationDispatchRetryAfterMs: 250,
        }),
      750,
      'dispatch freshness probe reads configured readinessObservationProbeTimeoutMs',
    );
  });

test('createDynamicConfigStartupWiring rejects invalid timing ratios and exposes effective truth',
  async (t) => {
    ConfigurationManager.resetInstance();
    t.teardown(() => ConfigurationManager.resetInstance());
    const config = ConfigurationManager.getInstance();
    config.initialize({node: {id: 'startup-wiring-truth-node'}});

    const raftApplyCalls = [];
    const group = new EventEmitter();
    const sqlQueryEngine = createLocalConfigSqlEngine({
      [CONFIG_KEY.RAFT_TICK_INTERVAL_MS]: {
        config_key: CONFIG_KEY.RAFT_TICK_INTERVAL_MS,
        config_value: '50',
        value_type: 'number',
      },
      [CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS]: {
        config_key: CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS,
        config_value: '25',
        value_type: 'number',
      },
      [CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS]: {
        config_key: CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS,
        config_value: '1000',
        value_type: 'number',
      },
      [CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS]: {
        config_key: CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS,
        config_value: '2000',
        value_type: 'number',
      },
    });

    const wiring = await createDynamicConfigStartupWiring({
      nodeId: 'startup-wiring-truth-node',
      sqlQueryEngine,
      messageGroupServices: new Map([['mg-1', group]]),
      partitionServices: new Map([['p-1', {
        applyRaftTimingConfig(nextTiming) {
          raftApplyCalls.push({...nextTiming});
          return true;
        },
      }]]),
    });
    t.teardown(() => wiring.shutdown());

    t.equal(
      wiring.startupOutcome().reads[CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS],
      DYNAMIC_CONFIG_STARTUP_OUTCOME.REFUSED,
      'heartbeat < tickIntervalMs is refused at startup',
    );
    t.equal(
      raftApplyCalls.some((call) => call.heartbeatIntervalMs === 25),
      false,
      'invalid heartbeat never reaches runtime replicas',
    );

    group.emit('cdcApplied', {
      tableName: 'config',
      operation: 'UPDATE',
      data: {
        config_key: CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS,
        config_value: '500',
        value_type: 'number',
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    t.equal(
      raftApplyCalls.some((call) => call.heartbeatIntervalMs === 500),
      false,
      'heartbeat with electionMin <= 2 * heartbeat is refused via CDC',
    );

    group.emit('cdcApplied', {
      tableName: 'config',
      operation: 'UPDATE',
      data: {
        config_key: CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS,
        config_value: '150',
        value_type: 'number',
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const effective = wiring.effectiveRaftTiming();
    t.equal(effective.requested.heartbeatMs, 150);
    t.equal(effective.requested.tickIntervalMs, 50);
    t.equal(effective.effective.effectiveHeartbeatMs, 150);
    t.equal(effective.effective.electionTick, 20);
  });

test('applyRuntimeNetworkTimingProfile applies env preset and logs requested vs effective',
  async (t) => {
    ConfigurationManager.resetInstance();
    t.teardown(() => ConfigurationManager.resetInstance());
    const config = ConfigurationManager.getInstance();
    config.initialize({node: {id: 'runtime-profile-env-node'}});

    const events = [];
    const logger = {
      info: (msg, meta) => events.push({level: 'info', msg, meta}),
      warn: (msg, meta) => events.push({level: 'warn', msg, meta}),
    };

    t.equal(
      applyRuntimeNetworkTimingProfile({config, environment: {}, logger}),
      null,
      'no profile applied when env/option unset',
    );

    const appliedDefault = applyRuntimeNetworkTimingProfile({
      config,
      environment: {
        [ENTRYPOINT_ENV.NETWORK_TIMING_PROFILE]: NETWORK_TIMING_PROFILE.DEFAULT,
      },
      logger,
    });
    t.equal(appliedDefault.profileId, 'default');
    t.equal(events.at(-1).level, 'warn',
      'logs warning when effective 60ms heartbeat diverges from requested 50ms');

    const appliedSlow = applyRuntimeNetworkTimingProfile({
      config,
      environment: {
        [ENTRYPOINT_ENV.NETWORK_TIMING_PROFILE]:
          NETWORK_TIMING_PROFILE.EXPERIMENTAL_WIFI_SLOW,
      },
      logger,
    });
    t.equal(appliedSlow.profileId, 'experimental-wifi-slow');
    t.equal(events.at(-1).level, 'info',
      'logs info when tick-aligned slow Wi-Fi profile has zero discrepancies');
    t.equal(config.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS), 9000);
    t.equal(config.get(CONFIG_KEY.TIMEOUT_CONTROL_PLANE_OPERATION_BUDGET_MS), 25000);
  });

function createRecordingSeedGateway() {
  const inserted = new Map();
  return {
    inserted,
    controlPlaneSystemTableGateway: {
      async insertSystemTableRow(_tableName, row) {
        inserted.set(row.config_key, row);
        return {success: true, applied: true, affectedRows: 1};
      },
      async readRows() {
        return {rows: []};
      },
    },
  };
}

function createReadinessSystemTableCacheStub() {
  return {
    getAll: () => [],
    getShared: () => [],
    get: () => null,
    filter: () => [],
    getTableMutationVersion: () => 0,
    onCacheChange: () => {},
    offCacheChange: () => {},
  };
}

test('DynamicConfigService.seedConfiguration respects experimental-wifi-slow and keeps unprofiled defaults untouched',
  async (t) => {
    const previousEnvProfile = process.env[ENTRYPOINT_ENV.NETWORK_TIMING_PROFILE];
    delete process.env[ENTRYPOINT_ENV.NETWORK_TIMING_PROFILE];
    ConfigurationManager.resetInstance();
    t.teardown(() => {
      if (previousEnvProfile === undefined) {
        delete process.env[ENTRYPOINT_ENV.NETWORK_TIMING_PROFILE];
      } else {
        process.env[ENTRYPOINT_ENV.NETWORK_TIMING_PROFILE] = previousEnvProfile;
      }
      ConfigurationManager.resetInstance();
    });

    const unprofiledGateway = createRecordingSeedGateway();
    const unprofiledService = new DynamicConfigService({
      nodeId: 'seed-default-node',
      controlPlaneSystemTableGateway: unprofiledGateway.controlPlaneSystemTableGateway,
    });
    await unprofiledService.initialize();
    await unprofiledService.seedConfiguration(CONFIG_SEED_SOURCE.SYSTEM, {nowMs: 1000});
    t.equal(unprofiledGateway.inserted.get(CONFIG_KEY.RAFT_TICK_INTERVAL_MS).config_value, '20');
    t.equal(
      unprofiledGateway.inserted.get(CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS).config_value, '50');
    t.equal(
      unprofiledGateway.inserted.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS).config_value,
      '1000');
    t.equal(
      unprofiledGateway.inserted.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS).config_value,
      '3000');
    t.equal(
      unprofiledGateway.inserted.get(CONFIG_KEY.QUERY_COORDINATOR_QUERY_TIMEOUT_MS).config_value,
      '30000');

    const config = ConfigurationManager.getInstance();
    config.initialize({node: {id: 'seed-wifi-node'}});
    applyStaticNetworkTimingProfile(config, NETWORK_TIMING_PROFILE.EXPERIMENTAL_WIFI_SLOW);
    const profiledGateway = createRecordingSeedGateway();
    const profiledService = new DynamicConfigService({
      nodeId: 'seed-wifi-node',
      controlPlaneSystemTableGateway: profiledGateway.controlPlaneSystemTableGateway,
    });
    await profiledService.initialize();
    await profiledService.seedConfiguration(CONFIG_SEED_SOURCE.SYSTEM, {nowMs: 2000});
    t.equal(profiledGateway.inserted.get(CONFIG_KEY.RAFT_TICK_INTERVAL_MS).config_value, '50');
    t.equal(
      profiledGateway.inserted.get(CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS).config_value, '150');
    t.equal(
      profiledGateway.inserted.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS).config_value, '9000');
    t.equal(
      profiledGateway.inserted.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS).config_value, '18000');
    t.equal(
      profiledGateway.inserted.get(CONFIG_KEY.QUERY_COORDINATOR_QUERY_TIMEOUT_MS).config_value,
      '45000');

    ConfigurationManager.resetInstance();
    process.env[ENTRYPOINT_ENV.NETWORK_TIMING_PROFILE] =
      NETWORK_TIMING_PROFILE.EXPERIMENTAL_WIFI_SLOW;
    const envGateway = createRecordingSeedGateway();
    const envService = new DynamicConfigService({
      nodeId: 'seed-env-wifi-node',
      controlPlaneSystemTableGateway: envGateway.controlPlaneSystemTableGateway,
    });
    await envService.initialize();
    await envService.seedConfiguration(CONFIG_SEED_SOURCE.SYSTEM, {nowMs: 3000});
    t.equal(envGateway.inserted.get(CONFIG_KEY.RAFT_TICK_INTERVAL_MS).config_value, '50');
    t.equal(envGateway.inserted.get(CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS).config_value, '150');
    t.equal(envGateway.inserted.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS).config_value, '9000');
    t.equal(envGateway.inserted.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS).config_value, '18000');
  });

test('DynamicConfigService and startup wiring never overwrite experimental-wifi-slow with unprofiled system defaults',
  async (t) => {
    ConfigurationManager.resetInstance();
    let wiring = null;
    t.teardown(async () => {
      if (wiring) {
        await wiring.shutdown();
      }
      ConfigurationManager.resetInstance();
    });

    const config = ConfigurationManager.getInstance();
    config.initialize({node: {id: 'preserve-wifi-node'}});
    applyStaticNetworkTimingProfile(config, NETWORK_TIMING_PROFILE.EXPERIMENTAL_WIFI_SLOW);

    const staleSystemRows = {
      [CONFIG_KEY.RAFT_TICK_INTERVAL_MS]: {
        config_key: CONFIG_KEY.RAFT_TICK_INTERVAL_MS,
        config_value: '20',
        value_type: 'number',
        updated_by: CONFIG_SEED_SOURCE.SYSTEM,
      },
      [CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS]: {
        config_key: CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS,
        config_value: '50',
        value_type: 'number',
        updated_by: CONFIG_SEED_SOURCE.SYSTEM,
      },
      [CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS]: {
        config_key: CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS,
        config_value: '1000',
        value_type: 'number',
        updated_by: CONFIG_SEED_SOURCE.SYSTEM,
      },
      [CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS]: {
        config_key: CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS,
        config_value: '3000',
        value_type: 'number',
        updated_by: CONFIG_SEED_SOURCE.SYSTEM,
      },
      [CONFIG_KEY.QUERY_COORDINATOR_QUERY_TIMEOUT_MS]: {
        config_key: CONFIG_KEY.QUERY_COORDINATOR_QUERY_TIMEOUT_MS,
        config_value: '30000',
        value_type: 'number',
        updated_by: CONFIG_SEED_SOURCE.SYSTEM,
      },
    };

    const sqlEngine = {
      async executeQuery(sql, params = []) {
        if (sql.includes('WHERE config_key = ?')) {
          const row = staleSystemRows[params[0]];
          return {rows: row ? [row] : []};
        }
        return {rows: Object.values(staleSystemRows)};
      },
    };

    const dcs = new DynamicConfigService({nodeId: 'preserve-wifi-node', sqlQueryEngine: sqlEngine});
    await dcs.initialize();
    const observedWatcherUpdates = [];
    dcs.watch(CONFIG_KEY.RAFT_TICK_INTERVAL_MS, (val) => observedWatcherUpdates.push(val));

    t.equal(await dcs.get(CONFIG_KEY.RAFT_TICK_INTERVAL_MS), 50);
    t.equal(await dcs.get(CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS), 150);
    t.equal(await dcs.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS), 9000);
    t.equal(await dcs.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS), 18000);
    t.equal(await dcs.get(CONFIG_KEY.QUERY_COORDINATOR_QUERY_TIMEOUT_MS), 45000);

    const all = await dcs.getAll();
    t.equal(all[CONFIG_KEY.RAFT_TICK_INTERVAL_MS], 50);
    t.equal(all[CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS], 150);
    t.equal(all[CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS], 9000);
    t.equal(all[CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS], 18000);
    t.equal(all[CONFIG_KEY.QUERY_COORDINATOR_QUERY_TIMEOUT_MS], 45000);

    await dcs.handleCDCEvent({
      operation: 'UPSERT',
      data: {
        config_key: CONFIG_KEY.RAFT_TICK_INTERVAL_MS,
        config_value: '20',
        value_type: 'number',
        updated_by: CONFIG_SEED_SOURCE.SYSTEM,
      },
    });
    t.equal(await dcs.get(CONFIG_KEY.RAFT_TICK_INTERVAL_MS), 50,
      'system-seeded unprofiled CDC event must not clobber active profile');
    t.same(observedWatcherUpdates, []);

    await dcs.handleCDCEvent({
      operation: 'UPSERT',
      data: {
        config_key: CONFIG_KEY.RAFT_TICK_INTERVAL_MS,
        config_value: '40',
        value_type: 'number',
        updated_by: 'operator',
      },
    });
    t.equal(await dcs.get(CONFIG_KEY.RAFT_TICK_INTERVAL_MS), 40,
      'explicit non-system operator update remains honored');
    t.same(observedWatcherUpdates, [40]);

    const messageGroupService = new EventEmitter();
    wiring = await createDynamicConfigStartupWiring({
      nodeId: 'preserve-wifi-node',
      sqlQueryEngine: sqlEngine,
      messageGroupServices: [messageGroupService],
      networkTimingProfile: NETWORK_TIMING_PROFILE.EXPERIMENTAL_WIFI_SLOW,
    });
    messageGroupService.emit('cdcApplied', {
      tableName: 'config',
      operation: 'UPDATE',
      data: {
        config_key: CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS,
        config_value: '2000',
        value_type: 'number',
        updated_by: CONFIG_SEED_SOURCE.SYSTEM,
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 10));

    t.equal(config.get(CONFIG_KEY.RAFT_TICK_INTERVAL_MS), 50);
    t.equal(config.get(CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS), 150);
    t.equal(config.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS), 9000);
    t.equal(config.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS), 18000);
    t.equal(config.get(TRANSPORT_CONFIG_KEY.MESSAGE_TIMEOUT_MS), 12000);
    t.equal(config.get(CONFIG_KEY.TIMEOUT_CONTROL_PLANE_OPERATION_BUDGET_MS), 25000);
    t.same(wiring.effectiveRaftTiming().requested, {
      tickIntervalMs: 50,
      heartbeatMs: 150,
      electionMinMs: 9000,
      electionMaxMs: 18000,
    });
  });

async function snapshotProfileBounds(t, profileName) {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: `bounds-${profileName}`}});
  applyStaticNetworkTimingProfile(config, profileName);

  const relayCalls = [];
  const registeredHandlers = new Map();
  const routerStub = {
    reconnectIntervalMs: config.get(TRANSPORT_CONFIG_KEY.RECONNECT_INTERVAL_MS),
    connections: new Map([['n2', {state: 'connected'}]]),
    getConnectionState: () => 'connected',
    register: (addr, fn) => registeredHandlers.set(addr, fn),
    pingNode: async (targetNodeId, timeoutMs) => {
      relayCalls.push({targetNodeId, timeoutMs});
      return true;
    },
  };
  const swimRuntime = new MembershipSwimRuntime({
    nodeId: `bounds-${profileName}`,
    messageRouter: routerStub,
  });
  swimRuntime.start();
  const relayFn = registeredHandlers.get(`bounds-${profileName}/service/swim-relay`);
  await relayFn({payload: {targetNodeId: 'n2'}});
  await swimRuntime.stop();

  const view = new AuthoritativeControlPlaneView({nodeId: `bounds-${profileName}`});
  const readiness = new ControlPlaneReadinessService({
    nodeId: `bounds-${profileName}`,
    systemTableCache: createReadinessSystemTableCacheStub(),
  });
  const reconciler = new AuthoritativeNodeEvidenceReconciler({
    nodeId: `bounds-${profileName}`,
    workflowCoordinator: {runExclusive: async (_name, fn) => fn()},
  });
  const leaderOwner = new ServiceLeaderReadinessOwner({});
  const repo = new ReplicaOperationRepository({
    nodeId: `bounds-${profileName}`,
    systemTableCache: createReadinessSystemTableCacheStub(),
    cdcIntegrationService: {},
    controlPlaneSystemTableGateway: {submitMutation: async () => ({success: true})},
    logger: console,
    repairRetainedPlacement: async () => {},
    resolveRetainedPlacementRepairRoute: async () => null,
    prepareRetainedPlacementRepair: async () => null,
    reportRetainedRepairVerdict: () => {},
  });
  const leaseAuthority = NodeReadyLeaseAuthority.fromConfiguration();
  const heartbeatService = new HeartbeatService({
    nodeId: `bounds-${profileName}`,
    bootIncarnation: 1,
    systemTableCache: createReadinessSystemTableCacheStub(),
  });
  const coordinator = new ParallelQueryCoordinator({
    nodeId: `bounds-${profileName}`,
    partitionQueryExecutor: () => { throw new Error('timing inspection only'); },
  });

  const recoveryExecutor = {
    nodeId: `bounds-${profileName}`,
    nowFn: () => 1000,
    queryTimeoutMs: config.get(CONFIG_KEY.TIMEOUT_CONTROL_PLANE_OPERATION_BUDGET_MS),
    messageRouter: routerStub,
    getPartitionRecord: () => null,
  };
  const recoveryCandidate = {
    nodeId: 'n2',
    address: 'n2/service/control_plane_publications-p1-r1',
  };
  const writeAttemptBudget = createPartitionAttemptBudget({
    executor: recoveryExecutor,
    partitionId: 'control_plane_publications-p1',
    forRead: false,
    executionOptions: {
      timeoutMs: config.get(CONFIG_KEY.TIMEOUT_CONTROL_PLANE_OPERATION_BUDGET_MS),
    },
    routingReadinessDimension:
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
  });
  const delivery = writeAttemptBudget.buildRouterDeliveryOptions(
    [recoveryCandidate],
    0,
    new Set(),
  );
  const readAttemptBudget = createPartitionAttemptBudget({
    executor: recoveryExecutor,
    partitionId: 'control_plane_publications-p1',
    forRead: true,
    executionOptions: {
      timeoutMs: config.get(CONFIG_KEY.TIMEOUT_CONTROL_PLANE_OPERATION_BUDGET_MS),
    },
    routingReadinessDimension:
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
  });
  const readDelivery = readAttemptBudget.buildRouterDeliveryOptions(
    [recoveryCandidate],
    0,
    new Set(),
  );

  // Also test real startup initial read bound behavior with deterministic release.
  const resolvers = [];
  let released = false;
  const keepAliveTimer = setTimeout(() => {}, 15000);
  const slowEngine = {
    executeQuery() {
      if (released) {
        return Promise.resolve({rows: []});
      }
      return new Promise((resolve) => {
        resolvers.push(() => resolve({rows: []}));
      });
    },
  };
  const releaseTimer =
    profileName === NETWORK_TIMING_PROFILE.EXPERIMENTAL_WIFI_SLOW ?
      setTimeout(() => {
        released = true;
        while (resolvers.length > 0) {
          resolvers.shift()();
        }
      }, 350) :
      null;
  let startupWiring;
  try {
    startupWiring = await createDynamicConfigStartupWiring({
      nodeId: `bounds-${profileName}`,
      sqlQueryEngine: slowEngine,
      networkTimingProfile: profileName,
    });
  } finally {
    released = true;
    if (releaseTimer) {
      clearTimeout(releaseTimer);
    }
    clearTimeout(keepAliveTimer);
  }
  t.teardown(() => startupWiring.shutdown());
  const immediateStartupTickOutcome =
    startupWiring.startupOutcome().reads[CONFIG_KEY.RAFT_TICK_INTERVAL_MS];
  while (resolvers.length > 0) {
    resolvers.shift()();
  }
  await new Promise((resolve) => setTimeout(resolve, 25));

  return {
    messageTimeoutMs: config.get(TRANSPORT_CONFIG_KEY.MESSAGE_TIMEOUT_MS),
    pingTimeoutMs: config.get(TRANSPORT_CONFIG_KEY.PING_TIMEOUT_MS),
    reconnectIntervalMs: config.get(TRANSPORT_CONFIG_KEY.RECONNECT_INTERVAL_MS),
    startupInitialReadTimeoutMs:
      config.get(CONFIG_KEY.TIMEOUT_DYNAMIC_CONFIG_STARTUP_INITIAL_READ_MS),
    swimProbeTimeoutMs: swimRuntime._detector.scaledProbeTimeoutMs(),
    swimProbeIntervalMs: swimRuntime._detector._config.baseProbeIntervalMs,
    swimRelayPingTimeoutMs: relayCalls[0].timeoutMs,
    controlPlaneSqlTimeoutMs: resolveControlPlaneQueryTimeoutMs({}),
    controlPlaneQueryTimeoutMs: resolveControlPlaneAuthoritativeQueryTimeoutMs(1500),
    authoritativeViewQueryTimeoutMs: view.queryTimeoutMs,
    readinessRepairQueryTimeoutMs: readiness.authoritativeReadinessRepairQueryTimeoutMs,
    readinessDiagnosticsProbeMs: readiness.membershipPublicationDiagnosticsQueryTimeoutMs,
    reconcilerQueryTimeoutMs: reconciler.authoritativeReadinessRepairQueryTimeoutMs,
    leaderRefreshQueryTimeoutMs:
      leaderOwner.resolveAuthoritativeLeaderRefreshQueryTimeoutMs({}),
    replicaReadRetryTimeoutMs: repo.replicaOperationReadRetryTimeoutMs,
    operationPersistRetryTimeoutMs: repo.operationPersistRetryTimeoutMs,
    replicaMutationQueryTimeoutMs: repo.replicaOperationMutationQueryTimeoutMs,
    readyLeaseMs: leaseAuthority.readyLeaseMs,
    leaseRenewalIntervalMs: leaseAuthority.renewalIntervalMs,
    heartbeatIntervalMs: heartbeatService.heartbeatIntervalMs,
    heartbeatAttemptTimeoutMs: heartbeatService.heartbeatAttemptTimeoutMs,
    clusterMemberStaleHeartbeatMaxAgeMs: readiness.clusterMemberStaleHeartbeatMaxAgeMs,
    repairStaleHeartbeatMaxAgeMs: reconciler.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs,
    coordinatorQueryTimeoutMs: coordinator.queryTimeoutMs,
    recoveryCandidateDeliveryTimeoutMs: delivery.timeoutMs,
    recoveryReadProbeMs:
      readAttemptBudget.recoveryReadProbeMs(readDelivery, recoveryCandidate),
    dispatchReadinessRefreshTimeoutMs:
      ReplicaDispatchReplayHealthReadiness.prototype
        .normalizeDispatchReadinessRefreshTimeoutMs.call({
          operationDispatchRetryAfterMs: 250,
        }),
    readinessObservationProbeTimeoutMs:
      config.get(CONFIG_KEY.TIMEOUT_READINESS_OBSERVATION_PROBE_TIMEOUT_MS),
    immediateStartupTickOutcome,
    startupTickOutcome:
      startupWiring.startupOutcome().reads[CONFIG_KEY.RAFT_TICK_INTERVAL_MS],
  };
}

test('Stage 3 timeout bounds resolve to experimental-wifi-slow profile values while default and 1000ms readiness probes remain unchanged',
  async (t) => {
    t.teardown(() => ConfigurationManager.resetInstance());
    const defaults = await snapshotProfileBounds(t, NETWORK_TIMING_PROFILE.DEFAULT);
    t.same(defaults, {
      messageTimeoutMs: 5000,
      pingTimeoutMs: 1000,
      reconnectIntervalMs: 1000,
      startupInitialReadTimeoutMs: 300,
      swimProbeTimeoutMs: 500,
      swimProbeIntervalMs: 1000,
      swimRelayPingTimeoutMs: 1000,
      controlPlaneSqlTimeoutMs: 5000,
      controlPlaneQueryTimeoutMs: 1500,
      authoritativeViewQueryTimeoutMs: 1500,
      readinessRepairQueryTimeoutMs: 1500,
      readinessDiagnosticsProbeMs: 1000,
      reconcilerQueryTimeoutMs: 1500,
      leaderRefreshQueryTimeoutMs: 1500,
      replicaReadRetryTimeoutMs: 1000,
      operationPersistRetryTimeoutMs: 15000,
      replicaMutationQueryTimeoutMs: 15000,
      readyLeaseMs: 15000,
      leaseRenewalIntervalMs: 5000,
      heartbeatIntervalMs: 5000,
      heartbeatAttemptTimeoutMs: 6000,
      clusterMemberStaleHeartbeatMaxAgeMs: 30000,
      repairStaleHeartbeatMaxAgeMs: 10000,
      coordinatorQueryTimeoutMs: 30000,
      recoveryCandidateDeliveryTimeoutMs: 1000,
      recoveryReadProbeMs: 1000,
      dispatchReadinessRefreshTimeoutMs: 1000,
      readinessObservationProbeTimeoutMs: 1000,
      immediateStartupTickOutcome: DYNAMIC_CONFIG_STARTUP_OUTCOME.PENDING,
      startupTickOutcome: DYNAMIC_CONFIG_STARTUP_OUTCOME.APPLIED_LATE,
    }, 'default profile preserves all existing baseline timeouts and triggers 300ms startup bound');

    const slow = await snapshotProfileBounds(
      t,
      NETWORK_TIMING_PROFILE.EXPERIMENTAL_WIFI_SLOW,
    );
    t.same(slow, {
      messageTimeoutMs: 12000,
      pingTimeoutMs: 3000,
      reconnectIntervalMs: 5000,
      startupInitialReadTimeoutMs: 10000,
      swimProbeTimeoutMs: 5000,
      swimProbeIntervalMs: 8000,
      swimRelayPingTimeoutMs: 3000,
      controlPlaneSqlTimeoutMs: 25000,
      controlPlaneQueryTimeoutMs: 8000,
      authoritativeViewQueryTimeoutMs: 8000,
      readinessRepairQueryTimeoutMs: 8000,
      readinessDiagnosticsProbeMs: 1000,
      reconcilerQueryTimeoutMs: 8000,
      leaderRefreshQueryTimeoutMs: 8000,
      replicaReadRetryTimeoutMs: 10000,
      operationPersistRetryTimeoutMs: 30000,
      replicaMutationQueryTimeoutMs: 25000,
      readyLeaseMs: 90000,
      leaseRenewalIntervalMs: 30000,
      heartbeatIntervalMs: 15000,
      heartbeatAttemptTimeoutMs: 30000,
      clusterMemberStaleHeartbeatMaxAgeMs: 90000,
      repairStaleHeartbeatMaxAgeMs: 35000,
      coordinatorQueryTimeoutMs: 45000,
      recoveryCandidateDeliveryTimeoutMs: 5000,
      recoveryReadProbeMs: 5000,
      dispatchReadinessRefreshTimeoutMs: 1000,
      readinessObservationProbeTimeoutMs: 1000,
      immediateStartupTickOutcome: DYNAMIC_CONFIG_STARTUP_OUTCOME.APPLIED,
      startupTickOutcome: DYNAMIC_CONFIG_STARTUP_OUTCOME.APPLIED,
    }, 'experimental-wifi-slow applies profiled bounds while keeping readiness probes short at 1000ms');

    t.ok(slow.leaseRenewalIntervalMs > 28000,
      'experimental-wifi-slow renewal cadence exceeds ~28s jittered Raft election window');
    t.ok(slow.readyLeaseMs >= slow.leaseRenewalIntervalMs * 3,
      'experimental-wifi-slow readyLeaseMs provides 3x margin over renewal & election window');
    t.ok(slow.repairStaleHeartbeatMaxAgeMs > 28000,
      'repair stale-heartbeat threshold exceeds ~28s jittered Raft election window');
    t.ok(slow.clusterMemberStaleHeartbeatMaxAgeMs >= slow.readyLeaseMs,
      'cluster member stale-heartbeat threshold covers readyLeaseMs under slow Wi-Fi');
  });

test('immutable live native core createdCoreTuning rejects tick-changing in-place reconfig and effectiveRaftTiming reads live core truth',
  async (t) => {
    ConfigurationManager.resetInstance();
    let service = null;
    let wiring = null;
    t.teardown(async () => {
      if (wiring) {
        await wiring.shutdown();
      }
      if (service) {
        await service.shutdown();
      }
      ConfigurationManager.resetInstance();
    });

    const config = ConfigurationManager.getInstance();
    config.initialize({node: {id: 'live-core-timing-node'}});
    applyStaticNetworkTimingProfile(config, NETWORK_TIMING_PROFILE.DEFAULT);

    service = new PartitionService({
      partitionId: 'live-core-timing-p1',
      tableId: 'live_core_timing_table',
      tableName: 'live_core_timing',
      replicaId: 'live-core-timing-r1',
      replicaIds: ['live-core-timing-r1'],
      bootstrapMembership: genesisStamp(['live-core-timing-r1'], {}),
      nodeId: 'live-core-timing-node',
      dbPath: ':memory:',
      deferElection: true,
    });
    await service.initialize();

    const bootTruth = readPortEffectiveRaftTiming(service.raft);
    t.same(bootTruth.createdCoreTiming, {
      heartbeatMs: 50,
      tickIntervalMs: 20,
      electionMinMs: 1000,
      electionMaxMs: 2000,
    });
    t.same(bootTruth.createdCoreTuning, {
      electionTick: 50,
      heartbeatTick: 3,
      preVote: true,
      checkQuorum: true,
    });
    t.equal(bootTruth.pendingRecreation, false);

    // Identical native ticks (heartbeatTick=3, electionTick=50) apply in place.
    const sameTicksTurn = await service.raft.configureTick({
      tickIntervalMs: 20,
      heartbeatMs: 60,
      electionMinMs: 1000,
      electionMaxMs: 2000,
    });
    t.equal(sameTicksTurn.settled, true);
    t.equal(sameTicksTurn.result.outcome, 'CORE_OK');
    t.equal(sameTicksTurn.result.appliedToExistingCore, true);
    t.equal(sameTicksTurn.result.pendingRecreation, false);

    // Changing native ticks (electionTick 50 -> 180) must NOT claim in-place core change.
    const changedTicksTurn = await service.raft.configureTick({
      tickIntervalMs: 50,
      heartbeatMs: 150,
      electionMinMs: 9000,
      electionMaxMs: 18000,
    });
    t.equal(changedTicksTurn.settled, true);
    t.equal(changedTicksTurn.result.outcome, 'CORE_OK');
    t.equal(changedTicksTurn.result.appliedToExistingCore, false);
    t.equal(changedTicksTurn.result.pendingRecreation, true);
    t.equal(changedTicksTurn.result.createdCoreTuning.electionTick, 50);
    t.equal(changedTicksTurn.result.createdCoreTuning.heartbeatTick, 3);
    t.equal(changedTicksTurn.result.effective.electionTick, 50);
    t.equal(
      changedTicksTurn.result.configuredForFutureReplicas.effective.electionTick,
      180,
    );

    const appliedInPlace = service.applyRaftTimingConfig({
      tickIntervalMs: 50,
      heartbeatIntervalMs: 150,
      electionTimeoutMinMs: 9000,
      electionTimeoutMaxMs: 18000,
    });
    t.equal(appliedInPlace, false,
      'applyRaftTimingConfig returns false when live native core requires recreation');

    const serviceTruth = service.effectiveRaftTiming();
    t.equal(serviceTruth.effective.electionTick, 50);
    t.equal(serviceTruth.effective.effectiveElectionMinMs, 1000);
    t.equal(serviceTruth.pendingRecreation, true);

    const slowRows = {
      [CONFIG_KEY.RAFT_TICK_INTERVAL_MS]: {
        config_key: CONFIG_KEY.RAFT_TICK_INTERVAL_MS,
        config_value: '50',
        value_type: 'number',
      },
      [CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS]: {
        config_key: CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS,
        config_value: '150',
        value_type: 'number',
      },
      [CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS]: {
        config_key: CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS,
        config_value: '9000',
        value_type: 'number',
      },
      [CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS]: {
        config_key: CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS,
        config_value: '18000',
        value_type: 'number',
      },
    };
    wiring = await createDynamicConfigStartupWiring({
      nodeId: 'live-core-timing-node',
      sqlQueryEngine: createLocalConfigSqlEngine(slowRows),
      partitionServices: new Map([['live-core-timing-p1', service]]),
    });

    const wiringTruth = wiring.effectiveRaftTiming();
    t.equal(wiringTruth.appliedToExistingCore, false);
    t.equal(wiringTruth.pendingRecreation, true);
    t.equal(Array.isArray(wiringTruth.discrepancies), true,
      'summarizeLiveCoreEffectiveRaftTiming always returns a discrepancies array');
    t.equal(wiringTruth.effective.electionTick, 50,
      'effectiveRaftTiming reads back running group createdCoreTuning');
    t.equal(wiringTruth.effective.effectiveElectionMinMs, 1000);
    t.equal(wiringTruth.configuredForFutureReplicas.effective.electionTick, 180,
      'distinguishes configuredForFutureReplicas from live core effective tuning');
    t.equal(config.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS), 9000,
      'ConfigurationManager retains slow timing for future replicas');
  });

test('applyPortRaftTimingConfig refuses pending, held-lifecycle, closed, refused, failed, and result-less turns',
  async (t) => {
    ConfigurationManager.resetInstance();
    let heldService = null;
    let closedService = null;
    const heldResolvers = [];
    const releaseHeldDeliveries = () => {
      while (heldResolvers.length > 0) {
        heldResolvers.shift()({acknowledged: true});
      }
    };
    t.teardown(async () => {
      releaseHeldDeliveries();
      if (heldService) {
        await heldService.shutdown();
      }
      if (closedService) {
        await closedService.shutdown();
      }
      ConfigurationManager.resetInstance();
    });

    const config = ConfigurationManager.getInstance();
    config.initialize({node: {id: 'timing-turn-verify-node'}});
    applyStaticNetworkTimingProfile(config, NETWORK_TIMING_PROFILE.DEFAULT);

    // 1. Real operation port with held Raft lifecycle turn queue + pending retirement.
    const registeredTransportHandlers = new Map();
    const holdingTransport = {
      register: (address, handler) => registeredTransportHandlers.set(address, handler),
      getRegisteredHandler: (address) => registeredTransportHandlers.get(address) || null,
      unregisterExact: (address, handler) => {
        if (registeredTransportHandlers.get(address) !== handler) {
          return false;
        }
        registeredTransportHandlers.delete(address);
        return true;
      },
      deliver: () => new Promise((resolve) => {
        heldResolvers.push(resolve);
      }),
    };
    heldService = new PartitionService({
      partitionId: 'timing-turn-held-p1',
      tableId: 'timing_turn_held',
      tableName: 'timing_turn_held',
      replicaId: 'timing-turn-held-r1',
      replicaIds: ['timing-turn-held-r1', 'timing-turn-held-r2'],
      bootstrapMembership: genesisStamp(
        ['timing-turn-held-r1', 'timing-turn-held-r2'],
        {'timing-turn-held-r1': 'timing-turn-verify-node', 'timing-turn-held-r2': 'peer-2'},
      ),
      nodeId: 'timing-turn-verify-node',
      transport: holdingTransport,
      dbPath: ':memory:',
      deferElection: true,
    });
    await heldService.initialize();

    const campaignTurn = heldService.raft.campaign();
    t.equal(campaignTurn.settled, false,
      'real operation port campaign stays pending while outbound transport delivery is held');
    const retirePromise = retireReplicaLifecycle({
      runtime: heldService.raft,
      groupId: 'timing-turn-held-p1',
      replicaIdentity: 'timing-turn-held-r1',
      reason: 'test-held-turn-queue',
    });

    const baseParams = {
      heartbeatMs: 50,
      electionMinMs: 1000,
      electionMaxMs: 2000,
      hasTickInterval: true,
      tickIntervalMs: 20,
      previousTickIntervalMs: 20,
      rearmTimer: false,
    };
    const heldOutcome = applyPortRaftTimingConfig(heldService, baseParams);
    t.equal(heldOutcome.applied, false,
      'held-lifecycle refused turn must never count as applied');
    t.equal(heldOutcome.appliedToExistingCore, false,
      'held-lifecycle refused turn must report appliedToExistingCore: false');
    t.equal(heldOutcome.outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED);
    t.equal(heldOutcome.reason, 'retired');
    t.equal(heldOutcome.logExtra, null);
    t.equal(
      heldService.applyRaftTimingConfig({
        heartbeatIntervalMs: 50,
        electionTimeoutMinMs: 1000,
        electionTimeoutMaxMs: 2000,
        tickIntervalMs: 20,
      }),
      false,
      'PartitionService.applyRaftTimingConfig returns false on held-lifecycle refusal',
    );
    t.equal(readPortEffectiveRaftTiming(heldService.raft), null,
      'readPortEffectiveRaftTiming returns null when port refuses configureTick');

    releaseHeldDeliveries();
    await retirePromise;

    // 2. Real operation port after close -> CORE_REFUSED ('closed').
    closedService = new PartitionService({
      partitionId: 'timing-turn-closed-p1',
      tableId: 'timing_turn_closed',
      tableName: 'timing_turn_closed',
      replicaId: 'timing-turn-closed-r1',
      replicaIds: ['timing-turn-closed-r1'],
      bootstrapMembership: genesisStamp(['timing-turn-closed-r1'], {}),
      nodeId: 'timing-turn-verify-node',
      dbPath: ':memory:',
      deferElection: true,
    });
    await closedService.initialize();
    closedService.raft.close();

    const closedOutcome = applyPortRaftTimingConfig(closedService, baseParams);
    t.equal(closedOutcome.applied, false);
    t.equal(closedOutcome.appliedToExistingCore, false);
    t.equal(closedOutcome.outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED);
    t.equal(closedOutcome.reason, 'closed');
    t.equal(
      closedService.applyRaftTimingConfig({
        heartbeatIntervalMs: 50,
        electionTimeoutMinMs: 1000,
        electionTimeoutMaxMs: 2000,
        tickIntervalMs: 20,
      }),
      false,
      'closed operation port must never report applied: true',
    );

    // 3. Pending, refused, failed, and malformed configureTick turns never count as applied.
    const negativeCases = [
      ['pending turn', pendingTurn(new Promise(() => {})), 'pending', 'turn-pending'],
      ['refused lowercase outcome', {outcome: 'refused', reason: 'queue-held'}, 'refused', 'queue-held'],
      [
        'settled CORE_REFUSED turn',
        settledTurn({outcome: RAFT_OPERATION_OUTCOME.CORE_REFUSED, reason: 'retired'}),
        RAFT_OPERATION_OUTCOME.CORE_REFUSED,
        'retired',
      ],
      [
        'settled HOST_FAILURE turn',
        settledTurn({outcome: RAFT_OPERATION_OUTCOME.HOST_FAILURE, reason: 'disk-io'}),
        RAFT_OPERATION_OUTCOME.HOST_FAILURE,
        'disk-io',
      ],
      [
        'CORE_FATAL structured turn',
        {outcome: RAFT_OPERATION_OUTCOME.CORE_FATAL, reason: 'corrupt-store'},
        RAFT_OPERATION_OUTCOME.CORE_FATAL,
        'corrupt-store',
      ],
      [
        'CORE_OK turn with absent result',
        {outcome: RAFT_OPERATION_OUTCOME.CORE_OK, result: null, reason: 'unsettled'},
        RAFT_OPERATION_OUTCOME.CORE_OK,
        'missing-turn-result',
      ],
      [
        'settled turn with missing result',
        settledTurn(null),
        'unavailable',
        'missing-turn-result',
      ],
      ['empty object report', {}, 'unavailable', 'invalid-configure-tick-report'],
      ['null response', null, 'unavailable', 'configure-tick-unavailable'],
    ];
    for (const [label, turnAnswer, expectedOutcome, expectedReason] of negativeCases) {
      const stubReplica = {
        raft: {configureTick: () => turnAnswer},
        applyRuntimeTickInterval: () => {
          throw new Error(`applyRuntimeTickInterval must not run on ${label}`);
        },
      };
      const outcome = applyPortRaftTimingConfig(stubReplica, baseParams);
      t.equal(outcome.applied, false, `${label}: applied must be false`);
      t.equal(outcome.appliedToExistingCore, false,
        `${label}: appliedToExistingCore must be false`);
      t.equal(outcome.outcome, expectedOutcome, `${label}: preserves outcome`);
      t.equal(outcome.reason, expectedReason, `${label}: preserves reason`);
      t.equal(outcome.logExtra, null, `${label}: emits no applied log payload`);
    }

    // 4. Positive controls: valid CORE_OK structured turn and direct report.
    const okStructured = applyPortRaftTimingConfig(
      {
        raft: {
          configureTick: () => ({
            outcome: RAFT_OPERATION_OUTCOME.CORE_OK,
            reason: 'timing-configured',
            result: {appliedToExistingCore: true},
          }),
        },
      },
      baseParams,
    );
    t.equal(okStructured.applied, true);
    t.equal(okStructured.appliedToExistingCore, true);
    t.equal(okStructured.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);

    const pendingRecreationStructured = applyPortRaftTimingConfig(
      {
        raft: {
          configureTick: () => ({
            outcome: RAFT_OPERATION_OUTCOME.CORE_OK,
            reason: 'timing-pending-recreation',
            result: {appliedToExistingCore: false, pendingRecreation: true},
          }),
        },
      },
      baseParams,
    );
    t.equal(pendingRecreationStructured.applied, false);
    t.equal(pendingRecreationStructured.appliedToExistingCore, false);
    t.equal(pendingRecreationStructured.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);

    const okDirectReport = applyPortRaftTimingConfig(
      {
        raft: {
          configureTick: () => ({
            appliedToExistingCore: true,
            createdCoreTuning: {heartbeatTick: 3, electionTick: 50},
          }),
        },
      },
      baseParams,
    );
    t.equal(okDirectReport.applied, true);
    t.equal(okDirectReport.appliedToExistingCore, true);
  });
