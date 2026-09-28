import tap from 'tap';

import {
  checkServicePortabilityClaimsContract,
  evaluateServicePortabilityClaimsContract,
  loadServicePortabilityClaimsContract,
} from '../../scripts/checks/service-portability-claims-contract.js';

function evaluateMutation(mutate) {
  const input = structuredClone(loadServicePortabilityClaimsContract());
  const baseline = evaluateServicePortabilityClaimsContract(input);
  if (!baseline.valid) {
    throw new Error(`mutation baseline is invalid: ${baseline.problems.join('; ')}`);
  }
  const before = JSON.stringify(input);
  mutate(input);
  if (JSON.stringify(input) === before) {
    throw new Error('claims mutation did not change its input');
  }
  return evaluateServicePortabilityClaimsContract(input);
}

tap.test('live public capability claims match current runtime evidence', (t) => {
  const result = checkServicePortabilityClaimsContract();
  t.equal(result.valid, true, result.problems.join('\n'));
  t.same(result.problems, []);
  t.end();
});

tap.test('public docs cannot reintroduce the retired runtime name', (t) => {
  const result = evaluateMutation((input) => {
    input.documents['README.md'] += '\nUse native_js for callbacks.\n';
  });
  t.equal(result.valid, false);
  t.equal(result.problems.length, 1);
  t.match(result.problems.join('\n'), /forbidden capability claim/iu);
  t.end();
});

tap.test('runtime providers cannot drift into separate service APIs', (t) => {
  const result = evaluateMutation((input) => {
    input.capabilities.runtimes.oci_container.serviceApi = 'oci_specific';
  });
  t.equal(result.valid, false);
  t.equal(result.problems.length, 1);
  t.match(result.problems.join('\n'), /shared service API/iu);
  t.end();
});

tap.test('OCI managed execution cannot be claimed before provider cutover',
  (t) => {
    const result = evaluateMutation((input) => {
      input.capabilities.runtimes.oci_container.realContainerActivation = true;
    });
    t.equal(result.valid, false);
    t.equal(result.problems.length, 1);
    t.match(result.problems.join('\n'), /remain false/iu);
    t.end();
  });

tap.test('public docs reject a separate OCI API claim', (t) => {
  const result = evaluateMutation((input) => {
    input.documents['docs/native-programming-model.md'] +=
      '\nOCI uses a separate OCI service API.\n';
  });
  t.equal(result.valid, false);
  t.equal(result.problems.length, 1);
  t.match(result.problems.join('\n'), /forbidden capability claim/iu);
  t.end();
});

tap.test('runtime implementation drift requires a capability-contract update',
  (t) => {
    const result = evaluateMutation((input) => {
      input.evidence.ociDriver = input.evidence.ociDriver
        .replace('this._prepared = new Map()', 'this._prepared = createRuntime()');
    });
    t.equal(result.valid, false);
    t.equal(result.problems.length, 1);
    t.match(result.problems.join('\n'), /lifecycle scaffolding/iu);
    t.end();
  });
