import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {LogsTableService} from '../../src/logging/logs-table-service.js';
import {
  CONTROL_PLANE_ROLLOUT_CONTROL,
  CONTROL_PLANE_ROLLOUT_DEFAULT,
  assertRequiredControlPlaneRollout,
  resolveControlPlaneRolloutControls,
} from '../../src/runtime/control-plane-rollout-controls.js';

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: 'test-node'},
      logging: {level: 'error'},
    });
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

test('ControlPlaneRolloutControls - defaults to required controls enabled', async (t) => {
  const controls = resolveControlPlaneRolloutControls();
  t.equal(
    controls[CONTROL_PLANE_ROLLOUT_CONTROL.LIFECYCLE_PROBES],
    CONTROL_PLANE_ROLLOUT_DEFAULT.LIFECYCLE_PROBES,
    'lifecycle probes should default to required enabled',
  );
  t.equal(
    controls[CONTROL_PLANE_ROLLOUT_CONTROL.WORK_CLASS_SCHEDULER],
    CONTROL_PLANE_ROLLOUT_DEFAULT.WORK_CLASS_SCHEDULER,
    'work class scheduler should default to required enabled',
  );
  t.equal(
    controls[CONTROL_PLANE_ROLLOUT_CONTROL.DURABLE_JOIN_SESSIONS],
    CONTROL_PLANE_ROLLOUT_DEFAULT.DURABLE_JOIN_SESSIONS,
    'durable join sessions should default to required enabled',
  );
});

test('ControlPlaneRolloutControls - parses string and numeric boolean controls', async (t) => {
  const controls = resolveControlPlaneRolloutControls({
    lifecycleProbes: '1',
    workClassScheduler: 'true',
    durableJoinSessions: '0',
  });
  t.equal(controls.lifecycleProbes, true, 'should parse numeric true string');
  t.equal(controls.workClassScheduler, true, 'should parse textual true string');
  t.equal(controls.durableJoinSessions, false, 'should parse numeric false string');
});

test('ControlPlaneRolloutControls - rejects disabled required control', async (t) => {
  t.throws(() => {
    assertRequiredControlPlaneRollout({
      owner: 'test-owner',
      controls: {
        lifecycleProbes: false,
        workClassScheduler: true,
        durableJoinSessions: true,
      },
      required: [CONTROL_PLANE_ROLLOUT_CONTROL.LIFECYCLE_PROBES],
    });
  }, /test-owner/,
  'required rollout control should reject disabled value');
});

test('BootstrapAPI - enforces lifecycle probe rollout control', async (t) => {
  initializeTestEnvironment();

  t.throws(() => {
    new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: {
        get() {
          return null;
        },
        getAll() {
          return [];
        },
        getReadyNodes() {
          return [];
        },
        filter() {
          return [];
        },
        find() {
          return null;
        },
      },
      rolloutControls: {
        lifecycleProbes: false,
      },
    });
  }, /lifecycleProbes/,
  'bootstrap API should fail fast when lifecycle probes control is disabled');
});

test('BootstrapService - enforces work class scheduler rollout control', async (t) => {
  t.throws(() => {
    new BootstrapService({
      nodeId: 'seed-node-1',
      nodeAddress: 'localhost:8080',
      rolloutControls: {
        workClassScheduler: false,
      },
    });
  }, /workClassScheduler/,
  'bootstrap service should fail fast when scheduler control is disabled');
});

test('NodeJoiningService - enforces durable join sessions rollout control', async (t) => {
  initializeTestEnvironment();

  t.throws(() => {
    new NodeJoiningService({
      nodeId: 'join-node-1',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
      rolloutControls: {
        durableJoinSessions: false,
      },
    });
  }, /durableJoinSessions/,
  'joining service should fail fast when durable join sessions control is disabled');
});

test('LogsTableService - enforces work class scheduler rollout control', async (t) => {
  t.throws(() => {
    new LogsTableService({
      rolloutControls: {
        workClassScheduler: false,
      },
    });
  }, /workClassScheduler/,
  'logs table service should fail fast when scheduler control is disabled');
});
