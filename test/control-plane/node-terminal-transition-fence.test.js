/**
 * A previous process incarnation must never shut down or withdraw its
 * replacement (owner decision D3, 2026-09-29). Graceful shutdown and
 * failed-join withdrawal carry the exact registered boot incarnation in the
 * final durable mutation; a lost acknowledgement resolves by authoritative
 * readback of that exact incarnation, with no retry queue.
 */
import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {COLUMN, SERVICE_STATUS, STATE, TABLES} from
  '../../src/constants/index.js';
import {NodeRegistrationOwner} from
  '../../src/bootstrap/shared/node-registration-owner.js';
import {NODE_TERMINAL_TRANSITION_OUTCOME} from
  '../../src/control-plane/node-terminal-transition-fence.js';
import {HeartbeatService, initEnv} from
  './heartbeat-memory-trend-test-helpers.js';

const NODE_ID = 'node-terminal-fence';
const G1 = 1;
const G2 = 2;
const SILENT_LOGGER = Object.freeze({
  debug: () => {}, info: () => {}, warn: () => {}, error: () => {},
});

function readyRow(bootIncarnation) {
  return {
    node_id: NODE_ID,
    node_address: '10.0.0.9:8080',
    status: SERVICE_STATUS.ACTIVE,
    connection_state: STATE.READY,
    boot_incarnation: bootIncarnation,
    ready_lease_expires_at: 5000,
    last_heartbeat: 100,
    created_at: 10,
    updated_at: 100,
  };
}

// A durable NODES row behind the gateway: exact-predicate UPDATEs, an
// authoritative readback, and one-shot lost/unknown acknowledgements.
function createNodesGateway(row) {
  const durable = new Map([[row.node_id, {...row}]]);
  const writes = [];
  let nextAcknowledgement = null;
  return {
    durable,
    writes,
    loseNextAcknowledgement(kind) {
      nextAcknowledgement = kind;
    },
    async updateSystemTableRow(tableName, whereClause, data) {
      writes.push({tableName, whereClause});
      const acknowledgement = nextAcknowledgement;
      nextAcknowledgement = null;
      if (acknowledgement === 'unapplied') {
        throw new Error('fixture outcome unknown before apply');
      }
      const current = tableName === TABLES.NODES ?
        durable.get(whereClause[COLUMN.NODE_ID]) : null;
      const matches = Boolean(current) && Object.entries(whereClause)
        .every(([column, value]) => current[column] === value);
      if (matches) durable.set(current.node_id, {...current, ...data});
      if (acknowledgement === 'lost') {
        throw new Error('fixture acknowledgement lost after apply');
      }
      return {success: true, partitionResult: {affectedRows: matches ? 1 : 0}};
    },
    async readAuthoritativeRows(_tableName, _sql, params) {
      const current = durable.get(params[0]);
      return {success: true, rows: current ? [{...current}] : []};
    },
  };
}

function shutdownService(gateway, bootIncarnation) {
  return new HeartbeatService({
    nodeId: NODE_ID,
    nodeAddress: '10.0.0.9:8080',
    bootIncarnation,
    controlPlaneSystemTableGateway: gateway,
    systemTableCache: {get: () => readyRow(bootIncarnation)},
    now: () => 9000,
  });
}

function withdrawalOwner(gateway, bootIncarnation) {
  const owner = new NodeRegistrationOwner({
    nodeId: NODE_ID,
    nodeAddress: '10.0.0.9:8080',
    delegates: {
      getLogger: () => SILENT_LOGGER,
      getNow: () => () => 9000,
      getSleep: () => async () => {},
      getBootIncarnation: () => bootIncarnation,
    },
  });
  owner.getJoinAdmissionWriteRetryTimeoutMs = () => 0;
  owner.getJoinAdmissionControlPlaneSystemTableGateway = () => gateway;
  owner.readAuthoritativeMetaEndpointRowsOutcome = async () => ({rows: []});
  return owner;
}

function resetEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

test('delayed G1 shutdown cannot stop the READY G2 replacement', async (t) => {
  initEnv();
  t.teardown(resetEnvironment);
  const gateway = createNodesGateway(readyRow(G2));
  const before = {...gateway.durable.get(NODE_ID)};
  t.equal(await shutdownService(gateway, G1).reportNodeShutdown(), false,
    'the stale-incarnation shutdown reports nothing published');
  t.same(gateway.writes[0].whereClause,
    {node_id: NODE_ID, boot_incarnation: G1},
    'the final mutation itself carries G1');
  t.same(gateway.durable.get(NODE_ID), before, 'G2 READY is unchanged');
});

test('G1 shutdown with a lost ack completes by exact readback', async (t) => {
  initEnv();
  t.teardown(resetEnvironment);
  const gateway = createNodesGateway(readyRow(G1));
  gateway.loseNextAcknowledgement('lost');
  t.equal(await shutdownService(gateway, G1).reportNodeShutdown(), true,
    'the durable G1 destination is idempotent completion');
  t.match(gateway.durable.get(NODE_ID), {boot_incarnation: G1,
    status: SERVICE_STATUS.STOPPED, connection_state: STATE.DISCONNECTED});

  const unknown = createNodesGateway(readyRow(G1));
  unknown.loseNextAcknowledgement('unapplied');
  await t.rejects(shutdownService(unknown, G1).reportNodeShutdown(),
    /outcome unknown/u, 'an unapplied unknown outcome invents no success');
  t.equal(unknown.durable.get(NODE_ID).connection_state, STATE.READY);
});

test('delayed G1 failed-join withdrawal cannot withdraw the READY G2 replacement',
  async (t) => {
    initEnv();
    t.teardown(resetEnvironment);
    const gateway = createNodesGateway(readyRow(G2));
    const before = {...gateway.durable.get(NODE_ID)};
    const result = await withdrawalOwner(gateway, G1)
      .withdrawFailedJoinAdmission({registeredNodeId: NODE_ID});
    t.equal(result.accepted, false, 'the stale withdrawal is not accepted');
    t.equal(result.outcome,
      NODE_TERMINAL_TRANSITION_OUTCOME.REFUSED_STALE_INCARNATION,
      'the G1 withdrawal is classified stale-incarnation');
    t.same(gateway.writes.map((write) => write.tableName), [TABLES.NODES],
      'no endpoint of the replacement is withdrawn');
    t.same(gateway.durable.get(NODE_ID), before, 'G2 READY is unchanged');
  });

test('G1 failed-join withdrawal with a lost ack completes by exact readback',
  async (t) => {
    initEnv();
    t.teardown(resetEnvironment);
    const gateway = createNodesGateway(readyRow(G1));
    gateway.loseNextAcknowledgement('lost');
    const result = await withdrawalOwner(gateway, G1)
      .withdrawFailedJoinAdmission({registeredNodeId: NODE_ID});
    t.equal(result.success, true, 'idempotent completion');
    t.equal(result.outcome,
      NODE_TERMINAL_TRANSITION_OUTCOME.RESOLVED_BY_READBACK);
    t.match(gateway.durable.get(NODE_ID), {boot_incarnation: G1,
      status: SERVICE_STATUS.STOPPED});
  });
