import {test} from '../../src/test-helpers/tap.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {
  REBALANCE_COORDINATOR_LOG_MSG,
} from '../../src/rebalancer/rebalancer-constants.js';

test('RebalanceCoordinator logs bounded query-operation diagnostics',
  async (t) => {
    const warnings = [];
    const error = new Error(
      'Distributed operation failed due to participant failures',
    );
    error.code = 'CONTROL_PLANE_PRESSURE_DEGRADED';
    error.retryAfterMs = 250;

    RebalanceCoordinator.prototype.logQueryOperationsFailure.call(
      {
        nodeId: 'node-rebalance-diag',
        logger: {
          warn(message, fields) {
            warnings.push({message, fields});
          },
          error() {
            t.fail('retryable control-plane failures should stay warnings');
          },
        },
        isLocalRouterBackpressured() {
          return true;
        },
      },
      error,
    );

    t.equal(warnings.length, 1, 'should emit one bounded warning');
    t.equal(
      warnings[0]?.message,
      REBALANCE_COORDINATOR_LOG_MSG.QUERY_OPERATIONS_FAILED,
      'warning should use the canonical log message',
    );
    t.equal(warnings[0]?.fields?.backpressured, true,
      'warning should include current router backpressure state');
    t.equal(warnings[0]?.fields?.queryDurationMs, null,
      'warning should include a query duration placeholder');
    t.equal(warnings[0]?.fields?.rowCount, null,
      'warning should include a row-count placeholder');
  });

test('RebalanceCoordinator logs the first failed participant summary',
  async (t) => {
    const warnings = [];
    const error = new Error(
      'Distributed operation failed due to participant failures',
    );
    error.code = 'DISTRIBUTED_PARTICIPANT_FAILURE';
    error.tableName = 'replica_operations';
    error.participantFailures = [{
      partitionId: 'replica_operations-p1',
      participantNodeId: 'node-pressure',
      participantAddress: 'ws://node-pressure:7001',
      errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
      error: 'Outbound queue for node node-pressure is saturated',
      durationMs: 412,
      retryAfterMs: 250,
      backpressured: true,
      failedTable: 'replica_operations',
    }];
    error.firstFailedParticipant = error.participantFailures[0];

    RebalanceCoordinator.prototype.logQueryOperationsFailure.call(
      {
        nodeId: 'node-rebalance-diag',
        logger: {
          warn(message, fields) {
            warnings.push({message, fields});
          },
          error() {
            t.fail('participant-failure diagnostics should stay bounded');
          },
        },
        isLocalRouterBackpressured() {
          return false;
        },
      },
      error,
      {
        queryDurationMs: 512,
        rowCount: 0,
      },
    );

    t.equal(warnings.length, 1, 'should emit one bounded warning');
    t.equal(
      warnings[0]?.message,
      REBALANCE_COORDINATOR_LOG_MSG.QUERY_OPERATIONS_FAILED,
      'warning should use the canonical log message',
    );
    t.equal(
      warnings[0]?.fields?.tableName,
      'replica_operations',
      'warning should preserve the failed table name',
    );
    t.equal(
      warnings[0]?.fields?.firstFailedParticipant?.participantNodeId,
      'node-pressure',
      'warning should expose the first failed participant node',
    );
    t.equal(
      warnings[0]?.fields?.firstFailedParticipant?.durationMs,
      412,
      'warning should expose the first failed participant duration',
    );
    t.equal(
      warnings[0]?.fields?.firstFailedParticipant?.backpressured,
      true,
      'warning should expose the first failed participant pressure state',
    );
  });
