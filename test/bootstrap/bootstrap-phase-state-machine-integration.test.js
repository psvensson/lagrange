import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {BOOTSTRAP_PHASE} from '../../src/bootstrap/bootstrap-constants.js';
import {NODE_STATE} from '../../src/constants/node-state.js';
import {BOOTSTRAP_SUB_PHASE} from '../../src/node/node-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();

  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: 'test-bootstrap-state-machine-node'},
    logging: {level: 'error'},
  });

  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

test('BootstrapService - uses NodeLifecycleStateMachine for phases', async (t) => {
  initializeTestEnvironment();
  const bootstrap = new BootstrapService({nodeId: 'test-node'});

  t.ok(
    bootstrap.lifecycleStateMachine,
    'bootstrap should expose lifecycle state machine',
  );
  t.equal(
    bootstrap.lifecycleStateMachine.getState(),
    NODE_STATE.STARTING,
    'lifecycle state machine should start at STARTING',
  );
  t.equal(
    bootstrap.lifecycleStateMachine.getSubPhase(),
    null,
    'sub-phase should start as null',
  );
});

test('BootstrapService - out-of-order phase is silently rejected', async (t) => {
  initializeTestEnvironment();
  const bootstrap = new BootstrapService({nodeId: 'test-node'});

  // Attempting PARTITIONS before INFRASTRUCTURE should not transition
  await bootstrap.executePhase(
    BOOTSTRAP_PHASE.PARTITIONS, async () => {},
  );
  // Sub-phase should remain null since PARTITIONS is not valid
  // from null (must go INFRASTRUCTURE first)
  t.equal(
    bootstrap.lifecycleStateMachine.getSubPhase(),
    null,
    'sub-phase should remain null after invalid transition',
  );
});

test('BootstrapService - valid phase order transitions sub-phases', async (t) => {
  initializeTestEnvironment();
  const bootstrap = new BootstrapService({nodeId: 'test-node'});

  await bootstrap.executePhase(
    BOOTSTRAP_PHASE.INFRASTRUCTURE, async () => {},
  );
  t.equal(
    bootstrap.lifecycleStateMachine.getSubPhase(),
    BOOTSTRAP_SUB_PHASE.INFRASTRUCTURE,
    'sub-phase should be INFRASTRUCTURE after first phase',
  );

  await bootstrap.executePhase(
    BOOTSTRAP_PHASE.MESSAGE_GROUPS, async () => {},
  );
  t.equal(
    bootstrap.lifecycleStateMachine.getSubPhase(),
    BOOTSTRAP_SUB_PHASE.MESSAGE_GROUPS,
    'sub-phase should be MESSAGE_GROUPS after second phase',
  );
});
