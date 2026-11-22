// Witness (red before the planner carries it): a create the coordinator
// refuses with the typed SERVICES-inventory deferral (the allocator's, the
// retired REPLACE-source check's, the address hint's) reaches the planner's
// skipped-move log line with the read's own reason, not only the skip reason.
//
// Production path: UnifiedRebalancer.executeMove -> executeMoveViaCoordinator
// -> buildCoordinatorCreationErrorResult -> logSkippedMoveOutcome, with the
// refusal built by the coordinator's own buildServicesInventoryUnavailableError.
// Substituted: the coordinator's createOperation throws that refusal (the
// owner-fact read that produces it is witnessed in the guard witnesses), the
// coordinator's move-safety read answers "no objection", and the target's
// readiness gate is passed (not the subject).
import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  REBALANCER_LOG_MSG,
  REBALANCER_SKIP_REASON,
} from '../../src/rebalancer/rebalancer-constants.js';
import {EntityType, MoveType} from '../../src/rebalancer/unified-rebalancer.js';
import {createTestCoordinator, createTestRebalancer} from './test-helpers.js';

const NODE_ID = 'node-1';
const PARTITION_ID = 'partition-1';
const TARGET_NODE_ID = 'node-2';
const READ_REASON = 'owner_fact_not_leader';

test('the skipped-move log line names the typed reason of an unavailable SERVICES read',
  async (t) => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    ConfigurationManager.getInstance().initialize({node: {id: NODE_ID}});
    LoggingService.getInstance().initialize({level: 'error'});
    t.teardown(() => {
      LoggingService.resetInstance();
      ConfigurationManager.resetInstance();
    });
    const coordinator = createTestCoordinator({nodeId: NODE_ID});
    const rebalancer = createTestRebalancer({entityId: PARTITION_ID,
      entityType: EntityType.PARTITION, nodeId: NODE_ID, rebalanceCoordinator: coordinator});
    t.teardown(() => {
      rebalancer.shutdown();
      coordinator.shutdown?.();
    });
    coordinator.getMoveSafetyError = async () => null;
    coordinator.createOperation = async (request) => {
      throw coordinator.buildServicesInventoryUnavailableError({reason: READ_REASON},
        {entityType: request.entityType, entityId: request.entityId});
    };
    rebalancer.resolveMoveTargetReadinessSkip = async () => null;
    const records = [];
    const info = rebalancer.logger.info.bind(rebalancer.logger);
    rebalancer.logger.info = (message, fields) => {
      records.push({message, fields});
      return info(message, fields);
    };

    const outcome = await rebalancer.executeMove({type: MoveType.ADD,
      partitionId: PARTITION_ID, entityType: EntityType.PARTITION, entityId: PARTITION_ID,
      nodeId: TARGET_NODE_ID, replicaId: null});
    const skipped = records.find(({message}) => message === REBALANCER_LOG_MSG.MOVE_SKIPPED);
    t.comment(`OBSERVATION move-skipped ${JSON.stringify({outcome, fields: skipped?.fields})}`);

    t.equal(outcome?.skipped, true, 'the move is skipped, not failed');
    t.equal(outcome?.reason, REBALANCER_SKIP_REASON.SERVICES_INVENTORY_UNAVAILABLE,
      'the skip names the unavailable SERVICES inventory');
    t.ok(skipped, 'the planner logged the skipped move');
    t.equal(skipped?.fields?.reason, REBALANCER_SKIP_REASON.SERVICES_INVENTORY_UNAVAILABLE,
      'the log line carries the skip reason');
    t.equal(skipped?.fields?.error?.reasonCode, READ_REASON,
      'the log line carries the read\'s own typed reason');
  },
);
