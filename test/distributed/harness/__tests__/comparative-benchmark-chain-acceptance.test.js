// Adversarial acceptance through the WHOLE comparative-benchmark chain (owner
// brief section J, quest comparative-benchmark-evidence-repair): the fake
// product behind the real workload driver, the composed v2 record, the record
// validator, a temp append-only raw store and invalidation ledger, admission,
// the matrix, every renderer and the recomputation check. Every case asserts
// on the publication layer: the published matrix JSON and the rendered
// Markdown, HTML and SVG. Owners: real-product-workload-drivers.js
// (executeBenchmarkWorkload), raw-observation-record.js (validateRunRecord),
// benchmark-claim-admission.js (admitClaim), comparative-matrix-runner.js,
// raw-observation-campaign-specs.js (regenerateAllBenchmarkArtifactsFromAdmitted)
// and scripts/checks/comparative-benchmark-recompute.js.
//
// Evidence ceiling: the product is a controlled fake and the deployer fields are
// fixture stand-ins; the suite proves the chain's classification, admission and
// publication of each case, not any product's behaviour.
import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {snapshotRepositoryPublication} from './comparative-benchmark-chain-acceptance-chain.js';
import {GATE_CASES} from './comparative-benchmark-chain-acceptance-cases-gates.js';
import {OUTCOME_CASES} from './comparative-benchmark-chain-acceptance-cases-outcomes.js';
import {PUBLICATION_CASES} from './comparative-benchmark-chain-acceptance-cases-publication.js';

const REPOSITORY_BEFORE = snapshotRepositoryPublication();

for (const [title, cases] of [['operation outcomes', OUTCOME_CASES],
  ['gates, readiness, action claims and dispatch', GATE_CASES],
  ['identity, evidence and publication verification', PUBLICATION_CASES]]) {
  describe(`comparative benchmark chain acceptance: ${title}`, () => {
    for (const [name, run] of cases) it(name, run);
  });
}

describe('comparative benchmark chain acceptance: fixture containment', () => {
  it('no fixture output was written under data/ or docs/benchmarks of the repository', () => {
    assert.deepEqual(snapshotRepositoryPublication(), REPOSITORY_BEFORE);
  });
});
