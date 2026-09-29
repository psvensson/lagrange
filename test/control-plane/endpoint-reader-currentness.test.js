/**
 * Endpoint readers (owner decision round 5, D2; invariant I9): endpoint state
 * of boot incarnation G1 is never current evidence for its replacement G2.
 * Semantic readers consume the endpoint incarnation authority's current view;
 * pure observational readers are recorded exceptions.
 */
import {test} from '../../src/test-helpers/tap.js';
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ENDPOINT_STATUS, STATE, TABLES, TRANSPORT_TYPE} from
  '../../src/constants/index.js';
import {EndpointSyncSourceClient} from
  '../../src/runtime/endpoint-sync-source-client.js';
import {planEndpointExports} from '../../src/runtime/endpoint-sync-planner.js';
import {resolveProjectedActiveNodeIds} from
  '../../src/control-plane/active-node-projection.js';
import {applyUnifiedRebalancerCriticalTopologyMethods} from
  '../../src/rebalancer/unified-rebalancer-critical-topology-methods.js';
import {registeredNodeRow} from '../test-helpers/endpoint-incarnation-fixture.js';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const NODE_ID = 'node-reuse';
const G1 = 1;
const G2 = 2;

function readyNode(incarnation) {
  return registeredNodeRow(NODE_ID, incarnation, {
    status: 'active',
    connection_state: STATE.READY,
    ready_lease_expires_at: Date.now() + 60_000,
    last_heartbeat: Date.now(),
  });
}

function nodeEndpoint(incarnation) {
  return {
    endpoint_id: `ep-${NODE_ID}-ws-g${incarnation}`,
    node_id: NODE_ID,
    transport_type: TRANSPORT_TYPE.WEBSOCKET,
    address: `ws://g${incarnation}-host:8082`,
    priority: 0,
    status: ENDPOINT_STATUS.ACTIVE,
    boot_incarnation: incarnation,
  };
}

function serviceEndpoint(incarnation) {
  return {
    endpoint_id: `sys-postgres-wire-ep-${NODE_ID}-g${incarnation}`,
    service_id: 'sys-postgres-wire',
    node_id: NODE_ID,
    protocol: 'postgresql',
    address: `10.0.0.${incarnation}`,
    port: 5432,
    health_status: 'healthy',
    metadata: '{}',
    updated_at: incarnation,
    boot_incarnation: incarnation,
  };
}

test('E1: the endpoint sync controller never advertises a G1 endpoint as ' +
  'current once NODES says G2', async (t) => {
  const client = new EndpointSyncSourceClient();
  const queries = [];
  // The admin stream answers the controller's two source reads: every
  // service endpoint (G1's lingering row and G2's) and the NODES rows.
  client._executeQueryOnce = async ({sql}) => {
    queries.push(sql);
    return /FROM nodes/u.test(sql) ?
      [{node_id: NODE_ID, boot_incarnation: G2}] :
      [serviceEndpoint(G1), serviceEndpoint(G2)];
  };
  const rows = await client.fetchEndpointRows({
    adminStreamUrl: 'ws://admin', maxRetries: 0});
  t.same(rows.map((row) => row.address), ['10.0.0.2'],
    'only the G2 endpoint reaches the controller');
  const plan = planEndpointExports(rows, {});
  t.same([...new Set(plan.exports.flatMap((exported) =>
    JSON.stringify(exported).match(/10\.0\.0\.\d/gu) || []))], ['10.0.0.2'],
  'the planned export advertises only the G2 address');
  t.ok(queries.some((sql) => /FROM nodes/u.test(sql)),
    'the controller judges currentness against NODES');
});

test('E2: a stale G1 endpoint with a READY G2 NODES row satisfies no ' +
  'endpoint-dependent readiness; only the G2 endpoint does', async (t) => {
  class Rebalancer {}
  applyUnifiedRebalancerCriticalTopologyMethods(Rebalancer);
  const cache = new SystemTableCache();
  cache.applySystemTableChange(TABLES.NODES, 'INSERT', readyNode(G2));
  const rebalancer = Object.assign(new Rebalancer(),
    {systemTableCache: cache});

  const staleOnly = [nodeEndpoint(G1)];
  t.equal(rebalancer.summarizeCriticalSystemEndpointVisibility([NODE_ID],
    staleOnly, {requiredReadyNodeCount: 1}).ready, false,
  'critical endpoint visibility is not satisfied by the G1 endpoint');
  const nowMs = Date.now();
  t.same(resolveProjectedActiveNodeIds({nodeRows: [readyNode(G2)], nowMs,
    nodeEndpointRows: staleOnly}),
  [], 'the active-node projection does not count G1 evidence for G2');

  const current = [nodeEndpoint(G1), nodeEndpoint(G2)];
  t.equal(rebalancer.summarizeCriticalSystemEndpointVisibility([NODE_ID],
    current, {requiredReadyNodeCount: 1}).ready, true,
  'the G2 endpoint satisfies it');
  t.same(resolveProjectedActiveNodeIds({nodeRows: [readyNode(G2)], nowMs,
    nodeEndpointRows: current}), [NODE_ID],
  'G2 is active on its own endpoint');
});

test('E3: the exempt raw endpoint query shows history and feeds no ' +
  'routing, readiness or admission', (t) => {
  const cache = new SystemTableCache();
  cache.applySystemTableChange(TABLES.NODES, 'INSERT', readyNode(G2));
  cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, 'INSERT',
    nodeEndpoint(G1));
  cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, 'INSERT',
    nodeEndpoint(G2));
  t.same(cache.getEndpointsForNode(NODE_ID).map((row) => row.boot_incarnation)
    .sort(), [G1, G2],
  'SystemTableCache.getEndpointsForNode is a raw (historical) row query');

  const callers = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (path.endsWith('.js')) {
        const source = readFileSync(path, 'utf8');
        if (/(?:[Cc]ache|cacheClient)\??\.getEndpointsForNode\(/u.test(source)) {
          callers.push(relative(REPO_ROOT, path));
        }
      }
    }
  };
  walk(join(REPO_ROOT, 'src'));
  t.same(callers, [], 'no production module consumes the raw query');
  t.end();
});
