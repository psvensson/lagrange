// Real release-owner composition for directly constructed PartitionServices.
// This fixture supplies transport/cache inputs, never a generation, OPEN flag,
// membership answer, pause override or fabricated release census.
import assert from 'node:assert/strict';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {ReplicaHandler} from '../../src/node/replica-handler-class.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {SQL_TRANSACTIONS_SCHEMA} from
  '../../src/bootstrap/system-table-workflow-schema-definitions.js';
import {INITIAL_PARTITION_IDS} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {TABLES} from '../../src/constants/tables.js';
import {runtimeBuildProvenance} from '../../src/diagnostics/runtime-build-provenance.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {PARTICIPANT_CUTOVER_OUTCOME as OUTCOME} from
  '../../src/partition/partition-participant-transaction-cutover-constants.js';
import {withFoundingStamp} from './partition-founding-stamp.js';

/**
 * Attach the production release recipient/recovery owners to a fixture group.
 * Callers retain service/database ownership; dispose only stops these owners
 * and the control service. host() tracks a legitimately recreated service.
 * @param {Array<Object>} services Initialized native partition replicas.
 * @param {Object} options Fixture directory and bounded request duration.
 * @return {Promise<Object>} host, release, dispose and exact release outcomes.
 */
async function attachPartitionReleaseOwners(services, {directory, budgetMs}) {
  const first = services[0];
  assert.ok(first?.transport && first.systemTableCache);
  const transport = first.transport;
  const handlers = new Map();
  const hosted = new Map();
  const outcomes = [];
  const host = (service) => {
    let handler = handlers.get(service.nodeId);
    if (!handler) {
      handler = new ReplicaHandler({nodeId: service.nodeId, ownerIncarnation: 1,
        systemTableCache: service.systemTableCache, cdcIntegrationService: {},
        createPartitionService: (options) => new PartitionService(options),
        messageRouter: transport, dataDir: directory});
      handler.registerWithRouter(transport);
      handlers.set(service.nodeId, handler);
    }
    hosted.set(service.replicaId, service);
    handler.replaceLocalReplicaService(service.replicaId, service);
  };
  services.forEach(host);
  const partitionId = INITIAL_PARTITION_IDS[TABLES.SQL_TRANSACTIONS];
  const replicaId = `${partitionId}-release-fixture-r1`;
  const control = new PartitionService(withFoundingStamp({
    partitionId, replicaId, replicaIds: [replicaId], nodeId: first.nodeId,
    tableId: TABLES.SQL_TRANSACTIONS, tableName: TABLES.SQL_TRANSACTIONS,
    schema: SQL_TRANSACTIONS_SCHEMA, systemTableCache: first.systemTableCache,
    transport, dbPath: path.join(directory, 'release-control.sqlite'),
    deferElection: true,
  }));
  const dispose = async () => {
    for (const handler of handlers.values()) {
      await handler.participantReleaseRecovery.shutdown();
      handler.unregisterFromRouter(transport);
    }
    await control.shutdown();
  };
  try {
    await control.initialize();
    host(control);
    await control.raft.campaign();
    assert.equal(control.raft.readStatus().role, RAFT_ROLE.LEADER);
  } catch (error) {
    await dispose();
    throw error;
  }
  const release = async (id) => {
    const build = await runtimeBuildProvenance();
    assert.equal(build.state, 'measured', build.reason);
    const deadline = first.timeSource.now() + budgetMs;
    let answer = null;
    do {
      const leader = [...hosted.values()].find((service) =>
        service.partitionId === id && !service.isShutdown &&
        service.raft?.readStatus().role === RAFT_ROLE.LEADER);
      assert.ok(leader, `release requires the actual leader of ${id}`);
      answer = await handlers.get(leader.nodeId).participantReleaseRecovery
        .releaseOperator({partitionId: id, targetBuildDigest: build.digest,
          deadlineAtMs: deadline});
      outcomes.push(answer);
      if (answer.outcome === OUTCOME.CUT_OVER) return answer;
      const remaining = deadline - first.timeSource.now();
      if (remaining <= 0 || !Number.isSafeInteger(answer.retryAfterMs)) break;
      await delay(Math.min(answer.retryAfterMs, remaining));
    } while (first.timeSource.now() < deadline);
    assert.equal(answer?.outcome, OUTCOME.CUT_OVER,
      `real release refused: ${JSON.stringify(answer)}`);
    return answer;
  };
  return {host, release, dispose, outcomes};
}

export {attachPartitionReleaseOwners};
