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
const IDENTIFIER_PATTERN = /^[a-z][a-z0-9-]*$/u;
const FIXTURE_PURPOSE = 'declarative-provider-parity-cases-no-runtime-execution';

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

function validFixtureHeader(fixture, inventory) {
  return fixture?.schemaVersion === 1 &&
    fixture?.witSource === inventory?.source &&
    fixture?.purpose === FIXTURE_PURPOSE &&
    Array.isArray(fixture?.cases);
}

function validateWorlds(inventory, problems) {
  const present = new Set(inventory.worlds.map((world) => world.name));
  for (const world of inventory.worlds) {
    const modes = WORLD_MODES[world.name];
    if (!modes) {
      problems.push(`unreviewed WIT world: ${world.name}`);
      continue;
    }
    const required = modes.map((mode) => MODES[mode]);
    if (world.declaredImports.length !== required.length ||
        required.some((iface) => !world.declaredImports.includes(iface))) {
      problems.push(`WIT world admission changed: ${world.name}`);
    }
  }
  for (const name of Object.keys(WORLD_MODES)) {
    if (!present.has(name)) problems.push(`missing WIT world: ${name}`);
  }
}

function validCaseShape(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  const fields = Object.keys(item);
  return fields.length === CASE_FIELDS.size &&
    fields.every((field) => CASE_FIELDS.has(field) &&
      typeof item[field] === 'string');
}

function validCaseIdentity(item, seen) {
  return IDENTIFIER_PATTERN.test(item.id) &&
    IDENTIFIER_PATTERN.test(item.scenario) && !seen.has(item.id);
}

function knownHostMethod(item, interfaces) {
  return Boolean(MODES[item.mode]) &&
    EXPECTATIONS.has(item.expectation) &&
    Boolean(interfaces.get(item.interface)?.functions.some(
      (method) => method.name === item.function));
}

function eligibleWorlds(item, worlds) {
  return worlds.filter((world) =>
    WORLD_MODES[world.name]?.includes(item.mode) &&
      world.declaredImports.includes(item.interface)).map(
    (world) => world.name);
}

function validateCase(item, context) {
  const {interfaces, worlds, seen, problems} = context;
  if (!validCaseShape(item)) {
    problems.push('invalid case shape, including forbidden evidence/status');
    return null;
  }
  if (!validCaseIdentity(item, seen)) {
    problems.push(`duplicate or malformed case id/scenario: ${item.id}`);
    return null;
  }
  seen.add(item.id);
  if (!knownHostMethod(item, interfaces)) {
    problems.push(`case has unknown mode/import/expectation: ${item.id}`);
    return null;
  }
  if (item.expectation === 'accepted' && MODES[item.mode] !== item.interface) {
    problems.push(`case grants capability in wrong mode: ${item.id}`);
  }
  const candidates = eligibleWorlds(item, worlds);
  if (candidates.length === 0) {
    problems.push(`case cannot execute in any declared world: ${item.id}`);
  }
  return {case: item, worlds: candidates};
}

function collectCases(inventory, fixture, problems) {
  const context = {
    interfaces: new Map(inventory.interfaces.map(
      (entry) => [entry.name, entry])),
    worlds: inventory.worlds,
    seen: new Set(),
    problems,
  };
  return fixture.cases.map((item) => validateCase(item, context))
    .filter(Boolean);
}

function validateMethodCoverage(inventory, cases, problems) {
  const byInterface = new Map(Object.entries(MODES).map(
    ([mode, iface]) => [iface, mode]));
  for (const iface of inventory.interfaces) {
    const mode = byInterface.get(iface.name);
    if (!mode) {
      problems.push(`unreviewed host interface: ${iface.name}`);
      continue;
    }
    for (const method of iface.functions) {
      const matching = cases.map((entry) => entry.case).filter((item) =>
        item.interface === iface.name && item.function === method.name);
      if (!matching.some((item) =>
        item.mode === mode && item.expectation === 'accepted')) {
        problems.push(`missing admitted scenario: ${iface.name}.${method.name}`);
      }
      if (!matching.some((item) => item.expectation === 'refused')) {
        problems.push(`missing refusal scenario: ${iface.name}.${method.name}`);
      }
    }
  }
}

function validateProviders(portability, problems) {
  const states = Object.fromEntries(PROVIDERS.map((provider) => [
    provider, providerStatus(provider, portability),
  ]));
  for (const provider of PROVIDERS) {
    if (!states[provider]) {
      problems.push(`missing provider capability state: ${provider}`);
    }
  }
  return states;
}

function createUnexecutedPlan(cases, states) {
  return PROVIDERS.flatMap((provider) => cases.flatMap((entry) =>
    entry.worlds.map((world) => ({
      provider,
      world,
      mode: entry.case.mode,
      hostImport: `${entry.case.interface}.${entry.case.function}`,
      caseId: entry.case.id,
      scenario: entry.case.scenario,
      expected: entry.case.expectation,
      status: states[provider],
    }))));
}

function evaluateSdkHostConformance(inputs) {
  const problems = [];
  const {inventory, fixture, portability} = inputs;
  if (!validFixtureHeader(fixture, inventory)) {
    return {valid: false, problems: ['invalid fixture header'], plan: []};
  }
  validateWorlds(inventory, problems);
  const cases = collectCases(inventory, fixture, problems);
  validateMethodCoverage(inventory, cases, problems);
  const providerStates = validateProviders(portability, problems);
  if (problems.length > 0) return {valid: false, problems, plan: []};
  return {
    valid: true,
    problems,
    plan: createUnexecutedPlan(cases, providerStates),
  };
}

export {evaluateSdkHostConformance, loadSdkHostConformanceInputs};
