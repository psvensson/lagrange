import {test} from '../../src/test-helpers/tap.js';
import {TABLES} from '../../src/constants/index.js';
import {AdminServiceDiscovery} from '../../src/admin/admin-service-discovery.js';
import {
  ControlPlaneSystemTableGateway,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';

function createRecordingLogger() {
  const entries = {
    warn: [],
    info: [],
  };
  return {
    entries,
    warn(message, fields) {
      entries.warn.push({message, fields});
    },
    info(message, fields) {
      entries.info.push({message, fields});
    },
  };
}

test('authoritative discovery repair preserves participant attribution under control-plane pressure',
  async (t) => {
    const cdcReads = [];
    const cdcIntegrationService = {
      async executeAuthoritativeSystemTableRead(
        tableName,
        sql,
        params,
        options,
      ) {
        cdcReads.push({tableName, sql, params, options});
        if (tableName === TABLES.SERVICES) {
          return {
            success: false,
            errorCode: 'DISTRIBUTED_PARTICIPANT_FAILURE',
            error: 'Distributed operation failed due to participant failures',
            retryAfterMs: 250,
            failedPartitions: ['services-p1'],
            partitionErrors: [{
              partitionId: 'services-p1',
              participantNodeId: 'node-pressure',
              participantAddress: 'ws://node-pressure:7001',
              errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
              error: 'Outbound queue for node node-pressure is saturated',
              durationMs: 412,
              retryAfterMs: 250,
              backpressured: true,
              failedTable: TABLES.SERVICES,
            }],
            participantFailures: [{
              partitionId: 'services-p1',
              participantNodeId: 'node-pressure',
              participantAddress: 'ws://node-pressure:7001',
              errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
              error: 'Outbound queue for node node-pressure is saturated',
              durationMs: 412,
              retryAfterMs: 250,
              backpressured: true,
              failedTable: TABLES.SERVICES,
            }],
            firstFailedParticipant: {
              partitionId: 'services-p1',
              participantNodeId: 'node-pressure',
              participantAddress: 'ws://node-pressure:7001',
              errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
              error: 'Outbound queue for node node-pressure is saturated',
              durationMs: 412,
              retryAfterMs: 250,
              backpressured: true,
              failedTable: TABLES.SERVICES,
            },
          };
        }
        return {
          success: true,
          tableName,
          rows: [],
          count: 0,
          source: 'local_partition_replica',
        };
      },
    };
    const gateway = new ControlPlaneSystemTableGateway({
      nodeId: 'integration-node',
      cdcIntegrationService,
      sqlQueryEngine: {
        async executeQuery() {
          t.fail('integration repro should stay on the authoritative CDC read path');
        },
      },
    });
    const logger = createRecordingLogger();
    const discovery = new AdminServiceDiscovery({
      nodeId: 'integration-node',
      systemTableCache: {
        getAll() {
          return [];
        },
      },
      cacheMutationTarget: {
        applySystemTableChange() {},
      },
      controlPlaneSystemTableGateway: gateway,
    });
    discovery.logger = logger;

    const repair = await discovery.ensureAuthoritativeDiscoveryCacheRepair({
      reason: 'integration-authoritative-read-pressure',
    });

    t.equal(repair.applied, false, 'repair should fail under participant pressure');
    t.same(
      repair.failedTables,
      [TABLES.SERVICES],
      'repair should surface the failed table',
    );
    t.same(
      repair.causeChain,
      ['query_participant_failure', 'control_plane_backpressure'],
      'repair should preserve the bounded cause chain',
    );
    t.equal(
      repair.firstFailedParticipant?.participantNodeId,
      'node-pressure',
      'repair should preserve the first failed participant',
    );
    t.equal(cdcReads.length > 0, true,
      'repair should execute through the canonical gateway authoritative read path');
    t.equal(
      cdcReads[0]?.options?.queryOptions?.routingReadinessDimension,
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      'gateway should preserve control-plane recovery routing for authoritative reads',
    );
    t.equal(logger.entries.warn.length, 1, 'repair should emit one bounded warning');
    t.same(
      logger.entries.warn[0]?.fields?.causeChain,
      ['query_participant_failure', 'control_plane_backpressure'],
      'warning should preserve the bounded cause chain',
    );
    t.equal(
      logger.entries.warn[0]?.fields?.firstFailedParticipant?.participantNodeId,
      'node-pressure',
      'warning should preserve the first failed participant',
    );
  });
