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
 * @return {Promise<Object>} host, release/releaseOnce, dispose and exact
 *   release outcomes.
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
    const failures = [];
    const handlerEntries = [...handlers];
    const shutdowns = await Promise.allSettled(handlerEntries.map(([, handler]) =>
      handler.participantReleaseRecovery.shutdown()));
    for (const [index, answer] of shutdowns.entries()) {
      if (answer.status === 'rejected') {
        failures.push(Object.freeze({phase: 'release-recovery-shutdown',
          nodeId: handlerEntries[index][0], error: answer.reason}));
      }
    }
    for (const [nodeId, handler] of handlerEntries) {
      try {
        handler.unregisterFromRouter(transport);
      } catch (error) {
        failures.push(Object.freeze({phase: 'handler-unregister', nodeId,
          error}));
      }
    }
    try {
      await control.shutdown();
    } catch (error) {
      failures.push(Object.freeze({phase: 'control-shutdown',
        replicaId: control.replicaId, error}));
    }
    if (failures.length > 0) {
      const aggregate = new AggregateError(failures.map(({error}) => error),
        `release-owner shutdown failed; retained temporary directory ${directory}`);
      aggregate.shutdownFailures = failures;
      aggregate.retainedDirectory = directory;
      throw aggregate;
    }
  };
  try {
    await control.initialize();
    host(control);
    await control.raft.campaign();
    assert.equal(control.raft.readStatus().role, RAFT_ROLE.LEADER);
  } catch (error) {
    try {
      await dispose();
    } catch (cleanupError) {
      const aggregate = new AggregateError([error, cleanupError], error.message,
        {cause: error});
      aggregate.cleanupFailure = cleanupError;
      aggregate.retainedDirectory = cleanupError.retainedDirectory ?? directory;
      throw aggregate;
    }
    throw error;
  }
  const prepareRelease = async () => {
    const build = await runtimeBuildProvenance();
    assert.equal(build.state, 'measured', build.reason);
    return {build, deadline: first.timeSource.now() + budgetMs};
  };
  const invokeRelease = async (id, prepared) => {
    const {build, deadline} = prepared;
    const leader = [...hosted.values()].find((service) =>
      service.partitionId === id && !service.isShutdown &&
      service.raft?.readStatus().role === RAFT_ROLE.LEADER);
    assert.ok(leader, `release requires the actual leader of ${id}`);
    const answer = await handlers.get(leader.nodeId).participantReleaseRecovery
      .releaseOperator({partitionId: id, targetBuildDigest: build.digest,
        deadlineAtMs: deadline});
    outcomes.push(answer);
    return answer;
  };
  const releaseOnce = async (id) => invokeRelease(id, await prepareRelease());
  const release = async (id) => {
    const prepared = await prepareRelease();
    let answer = null;
    do {
      answer = await invokeRelease(id, prepared);
      if (answer.outcome === OUTCOME.CUT_OVER) return answer;
      const remaining = prepared.deadline - first.timeSource.now();
      if (remaining <= 0 || !Number.isSafeInteger(answer.retryAfterMs)) break;
      await delay(Math.min(answer.retryAfterMs, remaining));
    } while (first.timeSource.now() < prepared.deadline);
    assert.equal(answer?.outcome, OUTCOME.CUT_OVER,
      `real release refused: ${JSON.stringify(answer)}`);
    return answer;
  };
  // Expose the existing native control service for witnesses that must read
  // a real coordinator decision; its ownership and disposal stay here.
  return {host, release, releaseOnce, dispose, outcomes, control};
}

export {attachPartitionReleaseOwners};
