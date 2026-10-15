/**
 * Declarative SDK parity preflight, not an execution conformance runner.
 *
 * Canonical ABI shapes come from wit/world.wit through the inventory tool.
 * World/mode admission is a test expectation, not a grant or SDK policy.
 * No plan result is a certified run. Future adapters must supply witnessed
 * execution through the existing runtime/invocation owners.
 */

import fs from 'node:fs';
import path from 'node:path';

import {inspectWitHostSurface} from '../inspect-wit-host-surface.js';

const FIXTURE_PATH = 'test/fixtures/sdk-host-conformance-cases.json';
const WIT_PATH = 'wit/world.wit';
const PORTABILITY_PATH = 'docs/service-portability-capabilities.json';
const MODES = Object.freeze({
  request: 'context',
  call: 'call-context',
});
const WORLD_MODES = Object.freeze({
  'request-cell': ['request'],
  'call-cell': ['call'],
  'service-cell': ['request', 'call'],
  'service-cell-v2': ['request', 'call'],
});
const EXPECTATIONS = new Set(['accepted', 'refused']);
const CASE_FIELDS = new Set([
  'id', 'mode', 'interface', 'function', 'scenario', 'expectation',
]);
const PROVIDERS = Object.freeze(['wasm_component', 'oci_container']);
const NOT_EXECUTED = 'requires-runtime-evidence';
const UNAVAILABLE = 'provider-unavailable';

function loadSdkHostConformanceInputs(root = process.cwd()) {
  const text = (relative) =>
    fs.readFileSync(path.join(root, relative), 'utf8');
  return {
    inventory: inspectWitHostSurface(text(WIT_PATH)),
    fixture: JSON.parse(text(FIXTURE_PATH)),
    portability: JSON.parse(text(PORTABILITY_PATH)),
  };
}

function providerStatus(provider, portability) {
  const runtime = portability?.runtimes?.[provider];
  if (!runtime) return null;
  if (provider === 'wasm_component') {
    return runtime.genuineComponentExecution === true ?
      NOT_EXECUTED : UNAVAILABLE;
  }
  return runtime.realContainerActivation === true ?
    NOT_EXECUTED : UNAVAILABLE;
}

function evaluateSdkHostConformance(inputs) {
  const problems = [];
  const {inventory, fixture, portability} = inputs;
  if (fixture?.schemaVersion !== 1 ||
      fixture?.witSource !== inventory?.source ||
      fixture?.purpose !==
        'declarative-provider-parity-cases-no-runtime-execution' ||
      !Array.isArray(fixture?.cases)) {
    return {valid: false, problems: ['invalid fixture header'], plan: []};
  }

  const interfaces = new Map(inventory.interfaces.map(
    (entry) => [entry.name, entry]));
  const worldNames = new Set(inventory.worlds.map((world) => world.name));
  for (const name of worldNames) {
    if (!WORLD_MODES[name]) {
      problems.push(`unreviewed WIT world: ${name}`);
    }
  }
  for (const name of Object.keys(WORLD_MODES)) {
    if (!worldNames.has(name)) problems.push(`missing WIT world: ${name}`);
  }

  const seenIds = new Set();
  const cases = [];
  for (const item of fixture.cases) {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
        Object.keys(item).some((field) => !CASE_FIELDS.has(field)) ||
        Object.keys(item).length !== CASE_FIELDS.size ||
        !Object.values(item).every((value) => typeof value === 'string')) {
      problems.push('invalid case shape, including forbidden evidence/status');
      continue;
    }
    if (!/^[a-z][a-z0-9-]*$/u.test(item.id) ||
        !/^[a-z][a-z0-9-]*$/u.test(item.scenario) ||
        seenIds.has(item.id)) {
      problems.push(`duplicate or malformed case id/scenario: ${item.id}`);
      continue;
    }
    seenIds.add(item.id);
    if (!MODES[item.mode] || !EXPECTATIONS.has(item.expectation) ||
        !interfaces.get(item.interface)?.functions.some(
          (method) => method.name === item.function)) {
      problems.push(`case has unknown mode/import/expectation: ${item.id}`);
      continue;
    }
    if (item.expectation === 'accepted' &&
        MODES[item.mode] !== item.interface) {
      problems.push(`case grants capability in wrong mode: ${item.id}`);
    }

    // A combined world imports both interfaces but an admitted Binding
    // exposes only its mode's live host capabilities.
    const worlds = inventory.worlds.filter((world) =>
      WORLD_MODES[world.name]?.includes(item.mode) &&
      world.declaredImports.includes(item.interface));
    if (worlds.length === 0) {
      problems.push(`case cannot execute in any declared world: ${item.id}`);
    }
    cases.push({case: item, worlds: worlds.map((world) => world.name)});
  }

  for (const iface of inventory.interfaces) {
    if (!MODES[Object.keys(MODES).find(
      (mode) => MODES[mode] === iface.name)]) {
      problems.push(`unreviewed host interface: ${iface.name}`);
      continue;
    }
    for (const method of iface.functions) {
      const matching = cases.map((entry) => entry.case).filter((item) =>
        item.interface === iface.name && item.function === method.name);
      if (!matching.some((item) =>
        item.mode === Object.keys(MODES).find(
          (mode) => MODES[mode] === iface.name) &&
        item.expectation === 'accepted')) {
        problems.push(`missing admitted scenario: ${iface.name}.${method.name}`);
      }
      if (!matching.some((item) => item.expectation === 'refused')) {
        problems.push(`missing refusal scenario: ${iface.name}.${method.name}`);
      }
    }
  }

  const providerStates = Object.fromEntries(PROVIDERS.map((provider) => [
    provider, providerStatus(provider, portability),
  ]));
  for (const provider of PROVIDERS) {
    if (!providerStates[provider]) {
      problems.push(`missing provider capability state: ${provider}`);
    }
  }
  if (problems.length > 0) return {valid: false, problems, plan: []};

  const plan = PROVIDERS.flatMap((provider) => cases.flatMap((entry) =>
    entry.worlds.map((world) => ({
      provider,
      world,
      mode: entry.case.mode,
      hostImport: `${entry.case.interface}.${entry.case.function}`,
      caseId: entry.case.id,
      scenario: entry.case.scenario,
      expected: entry.case.expectation,
      status: providerStates[provider],
    }))));
  return {valid: true, problems, plan};
}

export {evaluateSdkHostConformance, loadSdkHostConformanceInputs};
