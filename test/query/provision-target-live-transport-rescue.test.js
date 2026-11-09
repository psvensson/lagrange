/**
 * Provisioning consumes the committed serving cohort. Observer-local trust,
 * cache and router evidence cannot provide an alternate target decision.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  createSQLQueryEngineProvisioningMethods,
} from '../../src/query/sql-query-engine-provisioning-methods.js';
import {createProvisioningReadyService} from './sql-query-engine-test-support.js';

const METHODS = createSQLQueryEngineProvisioningMethods();

function makeEngine(nodeIds) {
  let readinessCalls = 0;
  let retiredTrustCalls = 0;
  const owner = createProvisioningReadyService(
    nodeIds.map((nodeId) => ({node_id: nodeId})),
  );
  const engine = {
    nodeId: 'coordinator',
    controlPlaneReadinessService: {
      answerServeCohort() {
        readinessCalls += 1;
        return owner.answerServeCohort();
      },
      getProvisioningNodeTrustViewSync() {
        retiredTrustCalls += 1;
        return [{nodeId: 'projection-only', serveEligible: true}];
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
  return {
    engine, owner,
    getReadinessCalls: () => readinessCalls,
    getRetiredTrustCalls: () => retiredTrustCalls,
  };
}

test('provisioning selects targets from one committed serving cohort', (t) => {
  const fixture = makeEngine(['node-1']);
  const diagnostics = fixture.engine.resolveProvisionTargetNodeDiagnostics(1);
  t.same(diagnostics.strictNodeIds, ['node-1']);
  t.same(diagnostics.selectedNodeIds, ['node-1']);
  t.equal(fixture.getReadinessCalls(), 1);
  t.equal(fixture.getRetiredTrustCalls(), 0);
  t.end();
});

test('repair eligibility cannot replace committed serving eligibility', (t) => {
  const fixture = makeEngine(['node-2']);
  fixture.owner.answerServeEligibility = () => ({
    state: 'ready', decision: 'not_eligible', reasons: ['node_not_published'],
  });
  const diagnostics = fixture.engine.resolveProvisionTargetNodeDiagnostics(1);
  t.same(diagnostics.strictNodeIds, []);
  t.same(diagnostics.degradedFallbackNodeIds, []);
  t.same(diagnostics.selectedNodeIds, []);
  t.equal(diagnostics.usedDegradedFallback, false);
  t.equal(fixture.getRetiredTrustCalls(), 0);
  t.end();
});

test('missing or null committed authority cannot consume a positive trust projection', (t) => {
  for (const missing of [false, true]) {
    const fixture = makeEngine(['coordinator']);
    if (missing) delete fixture.engine.controlPlaneReadinessService.answerServeCohort;
    else fixture.engine.controlPlaneReadinessService.answerServeCohort = () => null;
    const diagnostics = fixture.engine.resolveProvisionTargetNodeDiagnostics(1);
    t.same(diagnostics.selectedNodeIds, [], 'missing cohort stays unavailable');
    t.equal(fixture.getRetiredTrustCalls(), 0, 'no alternate reader is consulted');
  }
  t.end();
});

test('an empty committed cohort is consumed once through target resolution', (t) => {
  const fixture = makeEngine([]);
  const resolution = fixture.engine.resolveProvisionTargetNodeIdsWithDiagnostics(1);
  const contextualTargets = fixture.engine.resolveProvisionTargetNodeIdsForContext(
    null, 1, resolution.diagnostics,
  );
  t.same(resolution.nodeIds, []);
  t.same(contextualTargets, []);
  t.equal(fixture.getReadinessCalls(), 1);
  t.equal(fixture.getRetiredTrustCalls(), 0);
  t.end();
});
