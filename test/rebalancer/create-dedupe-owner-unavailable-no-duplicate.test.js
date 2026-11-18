/**
 * The create dedupe read ("is there already an in-flight operation for this
 * entity and target?") is the owner's. It used to accept an option, on by
 * default, that answered a failed read from the cache projection, so a
 * failed dedupe read could report "none" and create a duplicate. The option
 * and the cache answer are deleted: a dedupe read that did not answer is
 * the typed unavailability and the create waits.
 *
 * Paired, from the coordinator's create entry (createOperation) on the test
 * coordinator, the fault injected at the repository's replica_operations
 * read port: (a) the owner cannot answer the dedupe read - nothing is
 * created and the typed unavailability surfaces; (b) the owner answers - the
 * same create returns the existing operation and still nothing new is
 * created; a create for another target proceeds.
 */
import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {SQL} from '../../src/rebalancer/replica-operation-repository.js';
import {
  isOperationVisibilityUnavailableError,
} from '../../src/rebalancer/replica-operation-repository-operation-visibility.js';
import {createTestCoordinator} from './test-helpers.js';

function injectDedupeReadFault(coordinator) {
  const port = {failing: false, failedReads: 0};
  const repository = coordinator.repository;
  const ownerRead = repository.executeReplicaOperationsRead.bind(repository);
  repository.executeReplicaOperationsRead = async (sql, params, options) => {
    if (port.failing && sql === SQL.SELECT_IN_FLIGHT_FOR_ENTITY_NODE) {
      port.failedReads += 1;
      return {
        success: false,
        error: 'ROUTER_NO_CONNECTION',
        errorCode: 'ROUTER_NO_CONNECTION',
        rows: [],
      };
    }
    return ownerRead(sql, params, options);
  };
  return port;
}

test('an unanswered dedupe read creates nothing; the owner\'s answer returns ' +
  'the existing operation', async (t) => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
  const coordinator = createTestCoordinator({
    nodeId: 'seed-node',
    enableTimeouts: false,
  });
  coordinator.initialize();
  const port = injectDedupeReadFault(coordinator);
  const move = {
    type: 'ADD',
    partitionId: 'nodes-p1',
    nodeId: 'node-2',
    replicaId: 'replica-1',
  };
  try {
    const first = await coordinator.createOperation(move);
    t.ok(first.operationId, 'the first create persists one operation');
    t.equal(coordinator.stats.operationsCreated, 1, 'one operation');

    // (a) The owner cannot answer the dedupe read for the same intent.
    coordinator.recentOperationIntents.clear();
    port.failing = true;
    const unanswered = await coordinator.createOperation({
      ...move, replicaId: 'replica-2',
    }).then((value) => ({value}), (error) => ({error}));
    t.ok(port.failedReads > 0, 'the dedupe read reached the owner port');
    t.equal(isOperationVisibilityUnavailableError(unanswered.error), true,
      'the create waits with the typed unavailability');
    t.equal(unanswered.value, undefined, 'and answers no operation');
    t.equal(coordinator.stats.operationsCreated, 1,
      'no second operation is created on the unanswered read');

    // (b) The owner answers: the same create finds the existing operation.
    port.failing = false;
    coordinator.recentOperationIntents.clear();
    const answered = await coordinator.createOperation({
      ...move, replicaId: 'replica-2',
    });
    t.equal(answered.operationId, first.operationId,
      'the owner names the existing operation');
    t.equal(coordinator.stats.operationsCreated, 1, 'still one operation');
    const other = await coordinator.createOperation({
      ...move, nodeId: 'node-3', replicaId: 'replica-3',
    });
    t.not(other.operationId, first.operationId,
      'a create for another target proceeds');
    t.equal(coordinator.stats.operationsCreated, 2, 'and is created once');
  } finally {
    await coordinator.shutdown();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});

test('the repository dedupe read has no cache answer: a failed read throws ' +
  'even when the cache projects a matching row', async (t) => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
  const coordinator = createTestCoordinator({
    nodeId: 'seed-node',
    enableTimeouts: false,
  });
  coordinator.initialize();
  const port = injectDedupeReadFault(coordinator);
  try {
    const first = await coordinator.createOperation({
      type: 'ADD', partitionId: 'nodes-p1', nodeId: 'node-2',
      replicaId: 'replica-1',
    });
    port.failing = true;
    const outcome = await coordinator.repository.queryExistingInFlightOperation(
      'nodes-p1', 'node-2', first.entityType, first.entityId, {},
      () => true,
    ).then((value) => ({value}), (error) => ({error}));
    t.equal(isOperationVisibilityUnavailableError(outcome.error), true,
      'the default read is the owner\'s: unavailable, never the cache row');
  } finally {
    await coordinator.shutdown();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});
