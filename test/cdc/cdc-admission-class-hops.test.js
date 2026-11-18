// The CDC admission class (dead-recipient measure 1, owner ruling
// 2026-11-11) is set only by a lifecycle owner and survives every hop that
// builds its options from a pick-list; a client cannot declare it. Each hop
// is driven through its real code with the next hop captured at its port.
// The whole chain, end to end, is partition-cdc-retirement-reserve-witness.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {afterEach, beforeEach, test} from 'node:test';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {SERVICE_STATUS, TABLES} from '../../src/constants/index.js';
import {CDC_ADMISSION_CLASS_ERROR, CDC_ADMISSION_CLASS_FIELD, CDC_ADMISSION_CLASS_REFUSAL_REASON,
  CDC_ADMISSION_INTENT_FIELD, PARTITION_CDC_ADMISSION_CLASS as CLASS, RECIPIENT_RETIREMENT_WRITE,
  RECIPIENT_RETIREMENT_WRITE_OPTIONS} from '../../src/partition/partition-cdc-admission-class.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {buildMutationSingleFlightKey} from
  '../../src/cdc/cdc-integration-service-coalesced-mutation.js';
import {createControlPlaneRuntimeBundle} from
  '../../src/control-plane/control-plane-runtime-bundle.js';
import {CONTROL_PLANE_MUTATION_MERGE_POLICY} from
  '../../src/control-plane/control-plane-system-table-gateway-shared.js';
import {applyNodeTerminalTransition} from '../../src/control-plane/node-terminal-transition-fence.js';
import {HeartbeatService} from '../../src/control-plane/heartbeat-service.js';
import {LeaseService} from '../../src/control-plane/lease-service.js';
import {NodesOwner} from '../../src/control-plane/owners/nodes-owner.js';
import {createNodeRegistrationPublicationMethods} from
  '../../src/bootstrap/shared/node-registration-owner-publication-methods.js';
import {MessageGroupServiceRowOwner} from
  '../../src/message-group/message-group-service-row-owner.js';
import {createSqlRequest} from '../../src/query/sql-request.js';
import {createDefaultPartitionRequestBuilder} from
  '../../src/query/query-executor-partition-request-builders.js';
import {withSurface} from '../query/unknown-outcome-surface-fixture.js';

const NODE = 'hop-node';
const INCARNATION = 1700000000001;
const SQL = `UPDATE ${TABLES.SERVICES} SET status = ? WHERE service_id = ?`;
const INTENT = Object.freeze({[CDC_ADMISSION_INTENT_FIELD]: RECIPIENT_RETIREMENT_WRITE});

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: NODE}});
  LoggingService.getInstance().initialize({level: 'fatal'});
});
afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

const intentOf = (options) => options?.[CDC_ADMISSION_INTENT_FIELD];

// A CDC integration service whose next hop (the routed write) is captured.
function capturingCdcService() {
  const service = new CDCIntegrationService({nodeId: NODE});
  const sent = [];
  service.executeSQL = async (sql, params, options) => {
    sent.push({sql, options});
    return {success: true, affectedRows: 1, changes: 1};
  };
  return {service, sent};
}

test('CDC mutation operations carry the intent from every pick-list (insert, update, upsert, ' +
  'delete); a retirement never joins an ordinary single flight', async () => {
  const {service, sent} = capturingCdcService();
  const row = {service_id: 's1', service_type: 'message_group', node_id: NODE,
    status: SERVICE_STATUS.STOPPED, created_at: 1, updated_at: 2};
  await service.insertSystemTableRow(TABLES.SERVICES, row, INTENT);
  await service.updateSystemTableRow(TABLES.SERVICES, {service_id: 's1'},
    {status: SERVICE_STATUS.STOPPED}, INTENT);
  await service.upsertSystemTableRow(TABLES.NODES, {node_id: 'n1', status: 'stopped'}, INTENT);
  await service.deleteSystemTableRow(TABLES.SERVICES, {service_id: 's1'}, INTENT);
  assert.deepEqual(sent.map(({options}) => intentOf(options) === RECIPIENT_RETIREMENT_WRITE),
    [true, true, true, true]);
  const key = (options) => buildMutationSingleFlightKey('update', TABLES.SERVICES, 's1',
    {data: {status: 'stopped'}}, options);
  assert.notEqual(key(INTENT), key({}), 'the class is part of the single-flight key');
  assert.equal(key({}), buildMutationSingleFlightKey('update', TABLES.SERVICES, 's1',
    {data: {status: 'stopped'}}, {}), 'an ordinary key is unchanged');
});

test('the routed write carries the class on both legs: every engine attempt and the ' +
  'local-leader leg; a forged intent is refused before either', async () => {
  const engineCalls = [];
  const legCalls = [];
  const service = new CDCIntegrationService({nodeId: NODE, sqlQueryEngine: {
    executeQuery: async (sql, params, options) => {
      engineCalls.push(options);
      return {success: true, affectedRows: 1};
    }}});
  service.initialize();
  try {
    // No local leader first: the engine attempt carries the intent.
    service.resolveLocalSystemTableServices = () => [];
    await service.executeSQL(SQL, ['stopped', 's1'], INTENT);
    assert.equal(intentOf(engineCalls[0]), RECIPIENT_RETIREMENT_WRITE);
    // A local leader: the leg's partition options carry the wire class.
    service.resolveLocalSystemTableServices = () => [{partitionId: 'services-p1',
      keyRange: {}, executeQuery: async (_sql, _params, options) => {
        legCalls.push(options);
        return {success: true, changes: 1};
      }}];
    await service.executeSQL(SQL, ['stopped', 's1'], INTENT);
    await service.executeSQL(SQL, ['stopped', 's1'], {});
    assert.deepEqual(legCalls.map((options) => options[CDC_ADMISSION_CLASS_FIELD]),
      [CLASS.RECIPIENT_RETIREMENT, undefined]);
    const forged = await service.executeSQL(SQL, ['stopped', 's1'],
      {[CDC_ADMISSION_INTENT_FIELD]: {admissionClass: CLASS.RECIPIENT_RETIREMENT}});
    assert.deepEqual([forged.errorCode, forged.reasonCode],
      [CDC_ADMISSION_CLASS_ERROR.REFUSED, CDC_ADMISSION_CLASS_REFUSAL_REASON.NOT_OWNER_INTENT]);
    assert.equal(legCalls.length, 2, 'a forged intent reached no partition');
  } finally {
    service.shutdown?.();
  }
});

test('the gateway carries the intent into its write options and keys coalescing by class',
  () => {
    const gateway = createControlPlaneRuntimeBundle({nodeId: NODE,
      sqlQueryEngine: {executeQuery: async () => ({success: true})}})
      .controlPlaneSystemTableGateway;
    const writeOptions = gateway.buildWriteOptions({...INTENT, coalescingKey: 'services:s1'},
      {tableName: TABLES.SERVICES, operationKind: 'update'});
    assert.equal(intentOf(writeOptions), RECIPIENT_RETIREMENT_WRITE);
    const mutation = {tableName: TABLES.SERVICES, operation: 'update',
      whereClause: {service_id: 's1'}, data: {status: 'stopped'}};
    for (const mergePolicy of [CONTROL_PLANE_MUTATION_MERGE_POLICY.SINGLE_FLIGHT,
      CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING]) {
      const keyOf = (options) => gateway.buildMutationCoalescingDescriptor(mutation,
        {coalescingKey: 'services:s1', mergePolicy, ...options}).requestKey;
      assert.notEqual(keyOf(INTENT), keyOf({}), `${mergePolicy}: a retirement keeps its class`);
    }
  });

test('the partition request builder stamps the class; an ordinary request carries none', () => {
  const build = (executionOptions) => createDefaultPartitionRequestBuilder({
    executionOptions, params: [], partitionId: 'p1', sql: SQL})();
  assert.equal(build({[CDC_ADMISSION_CLASS_FIELD]: CLASS.RECIPIENT_RETIREMENT})[
    CDC_ADMISSION_CLASS_FIELD], CLASS.RECIPIENT_RETIREMENT);
  assert.equal(Object.hasOwn(build({}), CDC_ADMISSION_CLASS_FIELD), false);
});

test('the engine: an owner intent becomes the partition class; a client request, a raw class ' +
  'or a forged intent is refused typed before anything executes; a classified write that ' +
  'would become a participant transaction is refused, never declassified', async () => {
  await withSurface([TABLES.SERVICES], async ({engine}) => {
    const options = engine.buildRoutedWriteExecutionOptions(TABLES.SERVICES,
      engine.getTableInfo(TABLES.SERVICES), 's', {...INTENT});
    assert.equal(options[CDC_ADMISSION_CLASS_FIELD], CLASS.RECIPIENT_RETIREMENT);
    assert.equal(Object.hasOwn(engine.buildRoutedWriteExecutionOptions(TABLES.SERVICES,
      engine.getTableInfo(TABLES.SERVICES), 's', {}), CDC_ADMISSION_CLASS_FIELD), false);

    const client = await engine.executeRequest({...createSqlRequest({statement: SQL,
      parameters: ['stopped', 's1']}), [CDC_ADMISSION_CLASS_FIELD]: CLASS.RECIPIENT_RETIREMENT});
    const raw = await engine.executeQuery(SQL, ['stopped', 's1'],
      {[CDC_ADMISSION_CLASS_FIELD]: CLASS.RECIPIENT_RETIREMENT});
    const forged = await engine.executeQuery(SQL, ['stopped', 's1'],
      {[CDC_ADMISSION_INTENT_FIELD]: {admissionClass: CLASS.RECIPIENT_RETIREMENT}});
    const reasons = [client, raw, forged].map((answer) => [answer.errorCode, answer.reasonCode]);
    assert.deepEqual(reasons, [
      [CDC_ADMISSION_CLASS_ERROR.REFUSED, CDC_ADMISSION_CLASS_REFUSAL_REASON.CLIENT_INGRESS],
      [CDC_ADMISSION_CLASS_ERROR.REFUSED, CDC_ADMISSION_CLASS_REFUSAL_REASON.NOT_OWNER_INTENT],
      [CDC_ADMISSION_CLASS_ERROR.REFUSED, CDC_ADMISSION_CLASS_REFUSAL_REASON.NOT_OWNER_INTENT]]);
    assert.equal(Object.hasOwn(createSqlRequest({statement: SQL,
      [CDC_ADMISSION_CLASS_FIELD]: CLASS.RECIPIENT_RETIREMENT}), CDC_ADMISSION_CLASS_FIELD), false,
    'the canonical client request constructor never carries a class');

    const twoParticipants = {partitionStatements: new Map([['a', {}], ['b', {}]])};
    const owned = await engine.runOwnedWriteStatement({sessionId: 'two-participants',
      queryOptions: {...INTENT}, writePlan: twoParticipants});
    assert.deepEqual([owned.settled?.errorCode, owned.settled?.reasonCode],
      [CDC_ADMISSION_CLASS_ERROR.REFUSED, CDC_ADMISSION_CLASS_REFUSAL_REASON.NOT_DIRECT_WRITE]);
  });
});

// A gateway double that records each mutation's options and applies it.
function recordingWriter() {
  const writes = [];
  const record = (operation) => async (tableName, ...args) => {
    writes.push({operation, tableName, options: args.at(-1)});
    return {success: true, affectedRows: 1, changes: 1, outcome: 'applied'};
  };
  return {writes, updateSystemTableRow: record('update'),
    deleteSystemTableRow: record('delete'), submitMutation: record('submit')};
}

test('the lifecycle owners declare the class on exactly their retirement writes', async () => {
  const writer = recordingWriter();
  // Message-group replica: STOPPED transition and staged removal; ACTIVE never.
  const rowOwner = new MessageGroupServiceRowOwner({systemTableWriter: writer});
  const live = {...MessageGroupServiceRowOwner.buildServiceRow({groupId: 'g1', replicaId: 'g1-r1',
    nodeId: NODE, status: SERVICE_STATUS.ACTIVE, timestamp: 10})};
  const stopped = await rowOwner.updateReplicaStatus({groupId: 'g1', replicaId: 'g1-r1',
    nodeId: NODE, status: SERVICE_STATUS.STOPPED, registrationEvidence: live});
  // The removal's readback is not composed here; its write is the hop.
  await assert.rejects(rowOwner.removeReplica({replicaId: 'g1-r1', stoppedRow: stopped}));
  // A node: its own terminal transition, the stranded-join reaper, removal.
  const fenced = [];
  await applyNodeTerminalTransition({gateway: writer, nodeId: NODE, bootIncarnation: INCARNATION,
    destination: {status: 'stopped'}, write: async (whereClause, retirement) => {
      fenced.push(retirement);
      return writer.updateSystemTableRow(TABLES.NODES, whereClause, {}, retirement);
    }});
  const lease = Object.create(LeaseService.prototype);
  Object.assign(lease, {logger: {info() {}, warn() {}}, emit() {},
    readyLeaseAuthority: {holdsLiveLease: () => false},
    isNodeTransportConnected: () => false, getControlPlaneSystemTableGateway: () => writer,
    reapStaleRowEndpoints: async () => {}});
  await lease.reapStrandedJoiningRows([{node_id: 'stranded', status: 'joining',
    boot_incarnation: INCARNATION}], 5);
  const nodesOwner = new NodesOwner({controlPlaneSystemTableGateway: writer});
  nodesOwner.requireGateway = () => writer;
  await nodesOwner.removeTerminalNode('gone', {bootIncarnation: INCARNATION, status: 'stopped'},
    {[CDC_ADMISSION_INTENT_FIELD]: undefined});
  const declared = writer.writes.map((write) => [write.tableName, write.operation,
    intentOf(write.options) === RECIPIENT_RETIREMENT_WRITE]);
  assert.deepEqual(declared, [
    [TABLES.SERVICES, 'update', true], [TABLES.SERVICES, 'delete', true],
    [TABLES.NODES, 'update', true], [TABLES.NODES, 'update', true],
    [TABLES.NODES, 'delete', true]]);
  assert.equal(fenced[0], RECIPIENT_RETIREMENT_WRITE_OPTIONS);

  // The two callers of the node fence spread what it passes into their own
  // write options: graceful shutdown and the failed-join withdrawal.
  const shutdown = recordingWriter();
  const heartbeat = Object.create(HeartbeatService.prototype);
  Object.assign(heartbeat, {nodeId: NODE, bootIncarnation: INCARNATION, now: () => 7,
    logger: {info() {}, warn() {}}, heartbeatConsecutiveFailures: 0,
    heartbeatPublicationDiagnostics: {}, systemTableCache: {get: () => ({node_id: NODE})},
    resolveHeartbeatWriteQueryTimeoutMs: () => 100,
    getControlPlaneSystemTableGateway: () => shutdown});
  await heartbeat.reportNodeShutdown();
  const registration = Object.defineProperties({nodeId: NODE, delegates: {
    getBootIncarnation: () => INCARNATION, getNow: () => () => 9, getLogger: () => null}},
  createNodeRegistrationPublicationMethods());
  const withdrawal = recordingWriter();
  registration.getJoinAdmissionControlPlaneSystemTableGateway = () => withdrawal;
  registration.getJoinTimeUpsertOptions = () => ({});
  registration.getJoinAdmissionWriteRetryTimeoutMs = () => 100;
  await registration.withdrawNodeMembershipAtIncarnation(NODE, 9);
  assert.deepEqual([shutdown, withdrawal].map((gateway) =>
    intentOf(gateway.writes[0]?.options) === RECIPIENT_RETIREMENT_WRITE), [true, true]);

  // A replica already STOPPED is not retired again: no write, no class.
  const again = recordingWriter();
  await new MessageGroupServiceRowOwner({systemTableWriter: again})
    .updateReplicaStatus({groupId: 'g1', replicaId: 'g1-r1', nodeId: NODE,
      status: SERVICE_STATUS.STOPPED, registrationEvidence: stopped});
  assert.equal(again.writes.length, 0);
});

// The intent is minted in one module and set only by the lifecycle owners:
// every other src module that names it would be a second owner.
test('only the lifecycle owners name the retirement intent', () => {
  const allowed = new Set([
    'src/partition/partition-cdc-admission-class.js',
    'src/message-group/message-group-service-row-owner.js',
    'src/control-plane/node-terminal-transition-fence.js',
    'src/control-plane/lease-service.js',
    'src/control-plane/owners/nodes-owner.js',
  ]);
  const named = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (file.endsWith('.js') &&
          /RECIPIENT_RETIREMENT_WRITE\b|RECIPIENT_RETIREMENT_WRITE_OPTIONS/
            .test(fs.readFileSync(file, 'utf8'))) {
        named.push(file);
      }
    }
  };
  walk('src');
  assert.deepEqual(named.filter((file) => !allowed.has(file)), []);
});
