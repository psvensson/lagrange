/**
 * W7 migration characterization: SQL provisioning consumes the readiness
 * owner's observer-local trust view and never reconstructs trust from cache or
 * router state.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  createSQLQueryEngineProvisioningMethods,
} from '../../src/query/sql-query-engine-provisioning-methods.js';

const METHODS = createSQLQueryEngineProvisioningMethods();

function makeEngine(nodeTrustStates) {
  let readinessCalls = 0;
  const engine = {
    nodeId: 'coordinator',
    controlPlaneReadinessService: {
      getProvisioningNodeTrustViewSync() {
        readinessCalls += 1;
        return nodeTrustStates;
      },
    },
    get systemCache() {
      throw new Error('SQL provisioning must not read systemCache');
    },
    get messageRouter() {
      throw new Error('SQL provisioning must not read messageRouter');
    },
  };
  engine.orderProvisionTargetNodeIds =
    METHODS.orderProvisionTargetNodeIds.value;
  engine.resolveProvisionTargetNodeDiagnostics =
    METHODS.resolveProvisionTargetNodeDiagnostics.value;
  engine.resolveProvisionTargetNodeIdsWithDiagnostics =
    METHODS.resolveProvisionTargetNodeIdsWithDiagnostics.value;
  engine.resolveProvisionTargetNodeIdsForContext =
    METHODS.resolveProvisionTargetNodeIdsForContext.value;
  engine.normalizeTargetNodeIds = METHODS.normalizeTargetNodeIds.value;
  return {engine, getReadinessCalls: () => readinessCalls};
}

test('W7: serve-eligible trust is selected strictly through the readiness ' +
  'owner', (t) => {
  const fixture = makeEngine([
    {nodeId: 'node-1', repairEligible: true, serveEligible: true},
  ]);
  const diagnostics = fixture.engine.resolveProvisionTargetNodeDiagnostics(1);

  t.same(diagnostics.strictNodeIds, ['node-1']);
  t.same(diagnostics.selectedNodeIds, ['node-1']);
  t.equal(fixture.getReadinessCalls(), 1,
    'one readiness-owner view supplies the whole decision');
  t.end();
});

test('W7: repair-only trust is an explicit degraded fallback, not a cache ' +
  'heuristic', (t) => {
  const fixture = makeEngine([
    {nodeId: 'node-2', repairEligible: true, serveEligible: false},
  ]);
  const diagnostics = fixture.engine.resolveProvisionTargetNodeDiagnostics(1);

  t.same(diagnostics.strictNodeIds, []);
  t.same(diagnostics.degradedFallbackNodeIds, ['node-2']);
  t.same(diagnostics.selectedNodeIds, ['node-2']);
  t.equal(diagnostics.usedDegradedFallback, true);
  t.end();
});

test('W7: an untrusted node stays excluded and SQL has no local-node escape ' +
  'hatch', (t) => {
  const fixture = makeEngine([
    {nodeId: 'coordinator', repairEligible: false, serveEligible: false},
  ]);
  const diagnostics = fixture.engine.resolveProvisionTargetNodeDiagnostics(1);

  t.same(diagnostics.strictNodeIds, []);
  t.same(diagnostics.degradedFallbackNodeIds, []);
  t.same(diagnostics.selectedNodeIds, [],
    'the local SQL node is not admitted outside the readiness owner');
  t.end();
});

test('W7: an empty owner view is consumed exactly once through full target ' +
  'resolution', (t) => {
  const fixture = makeEngine([]);
  const resolution = fixture.engine
    .resolveProvisionTargetNodeIdsWithDiagnostics(1);
  const contextualTargets = fixture.engine.resolveProvisionTargetNodeIdsForContext(
    null,
    1,
    resolution.diagnostics,
  );

  t.same(resolution.nodeIds, []);
  t.same(contextualTargets, []);
  t.equal(fixture.getReadinessCalls(), 1,
    'empty trust is a real owner answer, not a signal to reconstruct it');
  t.end();
});
