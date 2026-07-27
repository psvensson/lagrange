import {test} from '../../../../src/test-helpers/tap.js';
import {
  validateBenchmarkResourceEvidenceRoot,
} from '../benchmark-resource-evidence-root.js';
import {
  BENCHMARK_RESOURCE_EFFECT_DIRECTION,
  BENCHMARK_RESOURCE_EFFECT_UNIT,
} from '../benchmark-resource-contract-constants.js';
import {
  createBenchmarkResourceEvidenceFixture,
} from './benchmark-resource-evidence-test-fixture.js';

test('whole-topology root recomputes independent capacity and cost effects',
  (t) => {
    const fixture = createBenchmarkResourceEvidenceFixture();
    const validation =
      validateBenchmarkResourceEvidenceRoot(fixture.receipt);

    t.same(validation, {
      valid: true,
      reason: 'valid',
      claimEligible: false,
      matrixId: 'resource-fixture-matrix-v1',
      cellCount: 1,
      artifactCount: fixture.artifacts.length,
    });
    t.equal(
      fixture.capacityEffect.direction,
      BENCHMARK_RESOURCE_EFFECT_DIRECTION.HIGHER_IS_BETTER,
    );
    t.equal(
      fixture.costEffect.direction,
      BENCHMARK_RESOURCE_EFFECT_DIRECTION.LOWER_IS_BETTER,
    );
    t.equal(
      fixture.costEffect.valueUnit,
      BENCHMARK_RESOURCE_EFFECT_UNIT.COST,
    );
    t.equal(fixture.capacityEffect.estimate, 1.2);
    t.ok(fixture.costEffect.estimate > 1);
    t.equal(fixture.costs.length, 2);
    t.end();
  });
