/**
 * Red-on-revert (spec node-liveness-veto-consolidation, stage 2): the DDL
 * provision-target connection gate must honour LIVE transport evidence over a
 * CDC-lagged `connection_state` cache column. Before this fix,
 * `resolveProvisionTargetNodeDiagnostics` derived `connectionEligible` from the
 * cached column ONLY, so a populated-but-stale-negative column wrongly excluded
 * a live, transport-connected node from `strictNodeIds` — the MODE-A shape
 * (`a79b3728`) that stranded a table at reduced replication.
 *
 * The fix is a MONOTONE OR-rescue: `... || hasLiveTransportEvidence(nodeId,
 * {messageRouter})`. It can only WIDEN eligibility. These cases pin all three
 * corners:
 *   A. stale-negative column + live-connected router  -> node RESCUED into
 *      strictNodeIds  (flips RED if the OR-disjunct is reverted).
 *   B. stale-negative column + genuinely-disconnected router -> STILL excluded
 *      (the rescue cannot admit a disconnected node; the atom fails closed).
 *   C. empty column -> STILL eligible (permissive default preserved; guards
 *      against a wholesale-replace regression that would fail-closed empties).
 */

import {test} from '../../src/test-helpers/tap.js';
import {TABLES, STATE} from '../../src/constants/index.js';
import {
  createSQLQueryEngineProvisioningMethods,
} from '../../src/query/sql-query-engine-provisioning-methods.js';

const METHODS = createSQLQueryEngineProvisioningMethods();

/**
 * Build a minimal engine `this` carrying only what the provisioning gate reads:
 * a systemCache (getAll branch), a live messageRouter, a nodeId, and the two
 * bound provisioning methods under test.
 * @param {{nodeRows: Array<Object>, liveStateByNode: Object}} opts
 * @return {Object} A fake engine with the provisioning methods bound.
 */
function makeEngine({nodeRows, liveStateByNode}) {
  const engine = {
    nodeId: 'coordinator',
    systemCache: {
      getAll(table) {
        return table === TABLES.NODES ? nodeRows : [];
      },
    },
    messageRouter: {
      getConnectionState(nodeId) {
        return liveStateByNode[nodeId] || STATE.DISCONNECTED;
      },
    },
  };
  engine.orderProvisionTargetNodeIds =
    METHODS.orderProvisionTargetNodeIds.value;
  engine.resolveProvisionTargetNodeDiagnostics =
    METHODS.resolveProvisionTargetNodeDiagnostics.value;
  return engine;
}

// A ready active node with NO ready-lease field is `ready === true`
// (isNodeRecordReady is only consulted when a lease is present), isolating the
// connection gate as the sole variable.
function readyNodeRow(nodeId, connectionState) {
  const row = {node_id: nodeId, status: 'active'};
  if (connectionState !== undefined) {
    row.connection_state = connectionState;
  }
  return row;
}

test('CASE A: a stale-negative connection_state column with a LIVE-connected ' +
  'router rescues the node into strictNodeIds (red-on-revert)', async (t) => {
  const engine = makeEngine({
    nodeRows: [readyNodeRow('node-1', STATE.DISCONNECTED)],
    liveStateByNode: {'node-1': STATE.CONNECTED},
  });
  const {strictNodeIds} = engine.resolveProvisionTargetNodeDiagnostics(1);
  t.ok(
    strictNodeIds.includes('node-1'),
    'node with a stale-disconnected cache column but live transport is ' +
      'provision-eligible (reverting the OR-rescue drops it -> RED)',
  );
});

test('CASE B: a stale-negative column with a genuinely-disconnected router ' +
  'stays excluded (rescue cannot invert safety)', async (t) => {
  const engine = makeEngine({
    nodeRows: [readyNodeRow('node-2', STATE.DISCONNECTED)],
    liveStateByNode: {'node-2': STATE.DISCONNECTED},
  });
  const {strictNodeIds} = engine.resolveProvisionTargetNodeDiagnostics(1);
  t.notOk(
    strictNodeIds.includes('node-2'),
    'a node that is disconnected in BOTH the cache and live transport is ' +
      'never admitted (atom fails closed)',
  );
});

test('CASE C: an empty connection_state column stays eligible (permissive ' +
  'default preserved; guards against a fail-closed replace regression)',
async (t) => {
  const engine = makeEngine({
    nodeRows: [readyNodeRow('node-3', undefined)],
    liveStateByNode: {'node-3': STATE.DISCONNECTED},
  });
  const {strictNodeIds} = engine.resolveProvisionTargetNodeDiagnostics(1);
  t.ok(
    strictNodeIds.includes('node-3'),
    'a node with no cached connection_state is eligible regardless of the ' +
      'live router (the !hasConnectionState default is unchanged)',
  );
});
