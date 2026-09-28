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

tap.test('service API cannot drift from runtime-neutral', (t) => {
  const result = evaluateMutation((input) => {
    input.capabilities.serviceApi.model = 'provider_specific';
  });
  t.equal(result.valid, false);
  t.equal(result.problems.length, 1);
  t.match(result.problems[0], /runtime-neutral/iu);
  t.end();
});

tap.test('WASM must project the canonical service API', (t) => {
  const result = evaluateMutation((input) => {
    input.capabilities.runtimes.wasm_component.applicationApi =
      'wasm_specific_api';
  });
  t.equal(result.valid, false);
  t.equal(result.problems.length, 1);
  t.match(result.problems[0], /canonical service API/iu);
  t.end();
});

tap.test('OCI target must project the canonical service API', (t) => {
  const result = evaluateMutation((input) => {
    input.capabilities.runtimes.oci_container.applicationApi =
      'oci_specific_api';
  });
  t.equal(result.valid, false);
  t.equal(result.problems.length, 1);
  t.match(result.problems[0], /canonical service API/iu);
  t.end();
});

tap.test('public docs cannot reintroduce the internal runtime identifier',
  (t) => {
    const result = evaluateMutation((input) => {
      input.documents['README.md'] += '\nnative_js\n';
    });
    t.equal(result.valid, false);
    t.equal(result.problems.length, 1);
    t.match(result.problems[0], /forbidden service-surface claim/iu);
    t.end();
  });

tap.test('public deploy docs cannot require an internal artifact layout',
  (t) => {
    const result = evaluateMutation((input) => {
      input.documents['docs/service-deployment-guide.md'] +=
        '\nlagrange service deploy . --layout .lagrange/oci\n';
    });
    t.equal(result.valid, false);
    t.equal(result.problems.length, 1);
    t.match(result.problems[0], /forbidden service-surface claim/iu);
    t.end();
  });

tap.test('OCI invocation support cannot be claimed before provider cutover',
  (t) => {
    const result = evaluateMutation((input) => {
      input.documents['docs/current-capabilities-and-limitations.md'] +=
        '\nOCI callback invocation is supported.\n';
    });
    t.equal(result.valid, false);
    t.equal(result.problems.length, 1);
    t.match(result.problems[0], /forbidden service-surface claim/iu);
    t.end();
  });

tap.test('OCI implementation drift requires capability-contract update',
  (t) => {
    const result = evaluateMutation((input) => {
      input.evidence.ociCallback = input.evidence.ociCallback
        .replaceAll('REGISTRY_OCI_CONTAINER_GATED', 'OCI_READY');
    });
    t.equal(result.valid, false);
    t.equal(result.problems.length, 1);
    t.match(result.problems[0], /unsupported invocation/iu);
    t.end();
  });
