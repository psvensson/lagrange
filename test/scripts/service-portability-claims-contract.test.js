import tap from 'tap';

import {
  evaluateSdkHostConformance,
  loadSdkHostConformanceInputs,
} from '../../scripts/checks/sdk-host-conformance-plan.js';

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

function sdkInputs() {
  return loadSdkHostConformanceInputs();
}

tap.test('SDK host fixture plan covers the WIT methods without false parity ' +
  'certification', (t) => {
  const result = evaluateSdkHostConformance(sdkInputs());
  t.equal(result.valid, true, result.problems.join('; '));
  t.ok(result.plan.length > 0);
  t.ok(result.plan.every((entry) => entry.status !== 'passed' &&
    entry.status !== 'certified'));
  t.ok(result.plan.some((entry) =>
    entry.provider === 'wasm_component' &&
    entry.status === 'requires-runtime-evidence'));
  t.ok(result.plan.some((entry) =>
    entry.provider === 'oci_container' &&
    entry.status === 'provider-unavailable'));
  t.end();
});

tap.test('SDK host fixtures preserve the combined-world mode boundary',
  (t) => {
    const result = evaluateSdkHostConformance(sdkInputs());
    t.equal(result.valid, true, result.problems.join('; '));
    const crossMode = result.plan.filter((entry) =>
      entry.world === 'service-cell' &&
      ((entry.mode === 'call' && entry.hostImport.startsWith('context.')) ||
       (entry.mode === 'request' &&
        entry.hostImport.startsWith('call-context.'))));
    t.ok(crossMode.length > 0);
    t.ok(crossMode.every((entry) => entry.expected === 'refused'));
    t.end();
  });

tap.test('an extra WIT import cannot silently lack SDK parity cases',
  (t) => {
    const inputs = sdkInputs();
    inputs.inventory.interfaces[0].functions.push({
      name: 'surprise',
      signature: 'func() -> bool',
    });
    const result = evaluateSdkHostConformance(inputs);
    t.equal(result.valid, false);
    t.match(result.problems.join('; '), /missing admitted scenario/u);
    t.end();
  });

tap.test('a fixture cannot invent SDK host privileges or unknown methods',
  (t) => {
    const inputs = sdkInputs();
    inputs.fixture.cases[0].function = 'unsupported-table-scan';
    const result = evaluateSdkHostConformance(inputs);
    t.equal(result.valid, false);
    t.match(result.problems.join('; '), /unknown mode\/import/u);
    t.end();
  });

tap.test('native SDK parity cannot be claimed by smuggling a passed state',
  (t) => {
    const inputs = sdkInputs();
    inputs.fixture.cases[0].status = 'passed';
    const result = evaluateSdkHostConformance(inputs);
    t.equal(result.valid, false);
    t.match(result.problems.join('; '), /forbidden evidence\/status/u);
    t.end();
  });

tap.test('native container activation alone is not host-capability proof',
  (t) => {
    const inputs = sdkInputs();
    inputs.portability.runtimes.oci_container.realContainerActivation = true;
    const result = evaluateSdkHostConformance(inputs);
    t.equal(result.valid, true, result.problems.join('; '));
    t.ok(result.plan.filter((entry) =>
      entry.provider === 'oci_container').every((entry) =>
      entry.status === 'requires-runtime-evidence'));
    t.end();
  });

tap.test('an unreviewed WIT world fails the SDK case inventory closed',
  (t) => {
    const inputs = sdkInputs();
    inputs.inventory.worlds.push({
      name: 'surprise-world',
      declaredImports: ['context'],
      exports: [],
    });
    const result = evaluateSdkHostConformance(inputs);
    t.equal(result.valid, false);
    t.match(result.problems.join('; '), /unreviewed WIT world/u);
    t.end();
  });

tap.test('a wrong-mode accepted fixture is refused before planning',
  (t) => {
    const inputs = sdkInputs();
    inputs.fixture.cases.find((item) =>
      item.id === 'call-read-denied').expectation = 'accepted';
    const result = evaluateSdkHostConformance(inputs);
    t.equal(result.valid, false);
    t.match(result.problems.join('; '), /wrong mode/u);
    t.end();
  });

tap.test('WIT import removal cannot quietly drop an execution world',
  (t) => {
    const inputs = sdkInputs();
    inputs.inventory.worlds.find((world) =>
      world.name === 'request-cell').declaredImports = [];
    const result = evaluateSdkHostConformance(inputs);
    t.equal(result.valid, false);
    t.match(result.problems.join('; '), /WIT world admission changed/u);
    t.end();
  });

tap.test('a deleted refusal fixture cannot silently appear covered',
  (t) => {
    const inputs = sdkInputs();
    inputs.fixture.cases = inputs.fixture.cases.filter((item) =>
      item.id !== 'call-read-denied');
    const result = evaluateSdkHostConformance(inputs);
    t.equal(result.valid, false);
    t.match(result.problems.join('; '), /missing refusal scenario/u);
    t.end();
  });

tap.test('duplicate fixture identifiers are not allowed', (t) => {
  const inputs = sdkInputs();
  inputs.fixture.cases.push({...inputs.fixture.cases[0]});
  const result = evaluateSdkHostConformance(inputs);
  t.equal(result.valid, false);
  t.match(result.problems.join('; '), /duplicate or malformed case/u);
  t.end();
});
