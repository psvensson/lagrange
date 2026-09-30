/**
 * Seven real production entrypoints. Each process owns its runtime globals,
 * listeners and persistent state; readiness is measured through public owners.
 */
import {test} from '../../src/test-helpers/tap.js';
import {HTTP_STATUS, META_SERVICE_ID, NODE_STATE, SERVICE_STATUS, SERVICE_TYPE} from '../../src/constants/index.js';
import {ADMIN_STATUS} from '../../src/admin/admin-constants.js';
import {WASM_SERVICE_PROTOCOL, WASM_SERVICE_HEALTH_STATUS} from '../../src/wasm-service/wasm-service-constants.js';
import {isNodeRecordReady} from '../../src/node/node-readiness-policy.js';
import {BOOTSTRAP_API_LOG_MSG} from '../../src/bootstrap/bootstrap-api-constants.js';
import {JOINING_LOG_MSG} from '../../src/bootstrap/node-joining-constants.js';
import {MESSAGE_GROUP_ASSIGNMENT_STRATEGY} from
  '../../src/bootstrap/message-group-assignment-constants.js';
import {MESSAGE_GROUP_SERVICE_LITERAL} from '../../src/message-group/message-group-service-runtime-support.js';
import {FORMATION_CLEANUP_CEILING_MS, createProcessFormationScenario, messageIs, queryNode} from
  './helpers/process-formation-scenario.js';
import {matchesNodeContext} from './helpers/process-formation-log-context.js';

const SEED_NODE_ID = '550e8400-e29b-41d4-a716-446655440600';
const JOINING_NODE_IDS = Object.freeze([
  '550e8400-e29b-41d4-a716-446655440601',
  '550e8400-e29b-41d4-a716-446655440602',
  '550e8400-e29b-41d4-a716-446655440603',
  '550e8400-e29b-41d4-a716-446655440604',
  '550e8400-e29b-41d4-a716-446655440605',
  '550e8400-e29b-41d4-a716-446655440606',
]);
const ALL_NODE_IDS = [SEED_NODE_ID, ...JOINING_NODE_IDS];
const DISCOVERY_SQL = 'SELECT * FROM service_discovery_local(\'nodes\')';
const NODE_ROWS_SQL = 'SELECT * FROM nodes';

function healthyDiscoveryReplicas(rows) {
  const services = rows[0]?.services || [];
  const service = services.find((entry) =>
    entry.protocol === WASM_SERVICE_PROTOCOL.POSTGRESQL &&
    entry.serviceIds?.includes(META_SERVICE_ID.POSTGRES_WIRE),
  );
  return (service?.replicas || []).filter((replica) =>
    replica.healthStatus === WASM_SERVICE_HEALTH_STATUS.HEALTHY &&
    replica.readiness?.routingReady === true &&
    replica.readiness?.schemaReady === true,
  );
}

function hasAllNodeIds(rows, field) {
  const ids = new Set(rows.map((row) => row[field]));
  return ALL_NODE_IDS.every((nodeId) => ids.has(nodeId));
}

async function waitForMessageGroupRows(scenario, observer, nodeId) {
  return scenario.waitFor(observer, async (context) => {
    const rows = await queryNode(observer,
      `SELECT * FROM services WHERE node_id = '${nodeId}'`, context);
    const active = rows.filter((row) =>
      row.service_type === SERVICE_TYPE.MESSAGE_GROUP &&
      row.status === SERVICE_STATUS.ACTIVE,
    );
    return {ready: active.length >= 1, value: active, diagnostic: rows};
  }, 'message_group_not_published');
}

async function assertJoiner(t, scenario, node, completion) {
  const label = node.nodeId;
  t.equal(completion.nodeId, label, `${label} joins successfully`);
  t.ok(completion.messageGroupCount >= 1, `${label} owns a local message group`);
  const seed = scenario.cluster.nodes[0];
  const assignment = await scenario.findLog(seed, (entry) =>
    messageIs(entry, BOOTSTRAP_API_LOG_MSG.RESPONSE_PREPARED) &&
    matchesNodeContext(entry, {emitterNodeId: seed.nodeId, subjectNodeId: label}),
  'message_group_assignment_not_observed');
  const recognizedStrategy = assignment?.strategy ===
      MESSAGE_GROUP_ASSIGNMENT_STRATEGY.MOVE_REPLICA ||
    assignment?.strategy === MESSAGE_GROUP_ASSIGNMENT_STRATEGY.CREATE_SELF_HOSTED;
  t.equal(recognizedStrategy, true,
    `${label} is offered a canonical message-group assignment strategy`);
  t.ok(typeof assignment?.groupId === 'string' && assignment.groupId.length > 0,
    `${label} is offered a concrete message-group identity`);
  const consumed = await scenario.findLog(node, (entry) => {
    if (entry.nodeId !== label || entry.groupId !== assignment.groupId) return false;
    if (assignment.strategy === MESSAGE_GROUP_ASSIGNMENT_STRATEGY.MOVE_REPLICA) {
      return messageIs(entry, JOINING_LOG_MSG.JOIN_ASSIGNMENT_RECEIVED) &&
        entry.strategy === assignment.strategy;
    }
    return assignment.strategy === MESSAGE_GROUP_ASSIGNMENT_STRATEGY.CREATE_SELF_HOSTED &&
      messageIs(entry, JOINING_LOG_MSG.SELF_HOSTED_CREATED);
  }, 'message_group_assignment_not_consumed');
  t.equal(consumed.groupId, assignment.groupId,
    `${label} consumes the exact assignment prepared by the seed`);
  const localRows = await waitForMessageGroupRows(scenario, node, label);
  const initialized = await scenario.findLog(node, (entry) =>
    messageIs(entry, MESSAGE_GROUP_SERVICE_LITERAL.MESSAGE_GROUP_SERVICE_INITIALIZED) &&
    localRows.some((row) => row.service_id === entry.replicaId),
  'local_message_group_initialization_not_observed');
  const initializedRow = localRows.find((row) => row.service_id === initialized.replicaId);
  const registered = await scenario.findLog(node, (entry) =>
    messageIs(entry, JOINING_LOG_MSG.JOIN_HANDLER_REGISTERED) &&
    entry.nodeId === label && entry.unifiedAddress === initializedRow.address,
  'local_message_group_handler_not_observed');
  t.ok(initialized.replicaId, `${label} initializes an actual local replica`);
  t.equal(registered.unifiedAddress, initializedRow.address,
    `${label} registers that local replica at its published address`);
  t.ok(localRows.length >= 1 && localRows.every((row) => row.address?.length > 0),
    `${label} publishes initialized active routable local message-group services`);
  t.equal(completion.lifecycleState, NODE_STATE.READY,
    `${label} lifecycle transitions to READY`);
  const ready = await scenario.ready(node);
  t.equal(ready.startupRuntimeHandoff.joinLifecycleState, NODE_STATE.READY,
    `${label} production handoff preserves READY`);
  const seedRows = await waitForMessageGroupRows(scenario, scenario.cluster.nodes[0], label);
  t.ok(seedRows.length >= 1, `seed cache observes active services for ${label}`);
  t.ok(seedRows.every((row) => typeof row.address === 'string' && row.address.length > 0),
    `seed service rows for ${label} have routable addresses`);
}

async function assertAdmin(t, scenario, node) {
  const label = node.nodeId;
  t.ok(node.adminPort > 0, `${label} production admin API binds a port`);
  const health = await scenario.health(node);
  t.equal(health.status, HTTP_STATUS.OK, `${label} admin health endpoint is reachable`);
  t.equal(health.body.status, ADMIN_STATUS.HEALTHY, `${label} production admin API is healthy`);
  const rows = await scenario.query(node, 'SELECT node_id FROM nodes LIMIT 1');
  t.ok(rows.length >= 1, `${label} real admin WS query returns node rows`);
  const ownRows = await scenario.query(node,
    `SELECT node_id FROM nodes WHERE node_id = '${label}'`);
  t.ok(ownRows.some((row) => row.node_id === label),
    `${label} exposes its own system cache through its own SQL engine`);
  const replicas = await scenario.waitFor(node, async (context) => {
    const discovery = await queryNode(node, DISCOVERY_SQL, context);
    const healthy = healthyDiscoveryReplicas(discovery);
    return {
      ready: hasAllNodeIds(healthy, 'nodeId'),
      value: healthy,
      diagnostic: discovery,
    };
  }, 'discovery_not_ready');
  t.ok(replicas.length >= ALL_NODE_IDS.length,
    `${label} table-scoped discovery sees all seven healthy pg replicas`);
  t.ok(hasAllNodeIds(replicas, 'nodeId'),
    `${label} discovery proves distinct peers, not duplicate rows`);
  t.ok(replicas.every((replica) =>
    replica.readiness.routingReady && replica.readiness.schemaReady),
  `${label} discovered replicas are route/schema ready`);
}

test('message group formation across seven production entrypoint processes',
  {timeout: FORMATION_CLEANUP_CEILING_MS}, async (t) => {
    const scenario = await createProcessFormationScenario(t, import.meta.url);
    t.comment(`Process logs: ${scenario.dataRoot}`);
    const seed = await scenario.startNode(SEED_NODE_ID);
    t.equal((await scenario.ready(seed)).ready, true, 'seed bootstrap succeeds');
    t.ok((await scenario.query(seed, NODE_ROWS_SQL)).length > 0,
      'seed system cache is available through production SQL');
    // Acquire all joiners after the seed. No outer retries or logical-node
    // constructors: concurrency matches the production cluster-start boundary.
    const nodes = [];
    for (const nodeId of JOINING_NODE_IDS) {
      nodes.push(await scenario.startNode(nodeId, [scenario.address(seed)]));
    }
    const completions = await Promise.all(nodes.map((node) => scenario.joined(node)));
    for (let index = 0; index < nodes.length; index += 1) {
      await assertJoiner(t, scenario, nodes[index], completions[index]);
    }
    const readyRows = await scenario.waitFor(seed, async (context) => {
      const rows = await queryNode(seed, NODE_ROWS_SQL, context);
      const ready = rows.filter((row) =>
        isNodeRecordReady(row, {now: Date.now(), requireActiveStatus: true}),
      );
      return {ready: hasAllNodeIds(ready, 'node_id'), value: ready, diagnostic: rows};
    }, 'membership_not_ready');
    t.ok(hasAllNodeIds(readyRows, 'node_id'), 'seed and every joiner reach ready state');
    t.ok(completions.reduce((total, entry) => total + entry.messageGroupCount, 0) >= nodes.length,
      'formation creates at least one local message-group replica per joiner');
    for (const node of scenario.cluster.nodes) await assertAdmin(t, scenario, node);
    t.equal(new Set(scenario.cluster.nodes.map((node) => node.process.pid)).size,
      ALL_NODE_IDS.length, 'seven independent process-global runtime domains');
    await scenario.finish();
  });
