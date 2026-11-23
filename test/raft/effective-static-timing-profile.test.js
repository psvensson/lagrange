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
import {CONFIG_KEY} from '../../src/config/config-constants.js';
import {TRANSPORT_CONFIG_KEY} from '../../src/constants/transport.js';
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
