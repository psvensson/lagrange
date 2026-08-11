#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {types as utilTypes} from 'node:util';

import {
  appendOwnArrayValue,
  copyArrayByIndex,
  digest as digestCanonicalJsonData,
  isDenseDataArray,
  isRecord,
  joinArrayByIndex,
} from '../../src/utils/canonical-json-data.js';

import {
  PRIMARY_CLASS_MANIFEST_PATH,
  loadManifest as loadPrimaryManifest,
  verifyManifest as verifyPrimaryManifest,
} from './test-primary-classification.js';

const REGISTRY_SCHEMA_VERSION = 2;
const DEFAULT_REGISTRY_PATH = 'test/shards/impact-contracts.json';
const REGISTRY_ID = 'impact-contracts';
const TEST_FILE_SUFFIX = '.test.js';
const UTF8_ENCODING = 'utf8';
const WINDOWS_PATH_SEPARATOR = '\\';
const REPOSITORY_ROOT_PATH = '.';
const REPOSITORY_ROOT_DIRECTORY_PATH = './';
const PARENT_PATH_SEGMENT = '..';
const PARENT_PATH_PREFIX = '../';
const PROBLEM_PATH_EMPTY = 'path must be a non-empty string';
const PROBLEM_CONTRACTS_EMPTY =
  'contracts manifest lacks a non-empty contracts object';
const PROBLEM_REGISTRY_NOT_OBJECT = 'impact contract registry must be an object';
const PROBLEM_REGISTRY_NOT_CANONICAL =
  'impact contract registry must be canonical own-property JSON data';
const PROBLEM_ARRAY_NOT_CANONICAL = 'expected a dense own-data array';
const PROBLEM_RECORD_NOT_CANONICAL =
  'expected a plain or null-prototype own-data record';
const PROBLEM_CYCLIC_IDENTITY = 'cyclic object identity';
const PROBLEM_SCHEMA_VERSION_UNSUPPORTED =
  'unsupported impact contract registry schemaVersion: ';
const PROBLEM_COUPLED_PAIRS_EMPTY =
  'impact contract registry lacks a non-empty coupledPairs object';
const PROBLEM_REGISTRY_UNAVAILABLE = 'impact contract registry is unavailable';
const PROBLEM_JOIN_SEPARATOR = '; ';
const SNAPSHOT_MAX_DEPTH = 64;
const SNAPSHOT_MAX_NODES = 20000;

const MATCH_EXACT = 'exact';
const MATCH_DIRECTORY = 'directory';
const MATCH_STEM_PREFIX = 'stem-prefix';
const PATH_SPEC_STATE = Object.freeze({
  PRESENT: 'present',
  ABSENT: 'absent',
});
const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayIsArray = Array.isArray;
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringIncludes = Function.call.bind(String.prototype.includes);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const arraySort = Function.call.bind(Array.prototype.sort);
const mapGet = Function.call.bind(Map.prototype.get);
const mapForEach = Function.call.bind(Map.prototype.forEach);
const mapHas = Function.call.bind(Map.prototype.has);
const mapSet = Function.call.bind(Map.prototype.set);
const setAdd = Function.call.bind(Set.prototype.add);
const setForEach = Function.call.bind(Set.prototype.forEach);
const setHas = Function.call.bind(Set.prototype.has);
const numberIsFinite = Number.isFinite;
const numberIsInteger = Number.isInteger;
const numberIsSafeInteger = Number.isSafeInteger;
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectKeys = Object.keys;
const objectIs = Object.is;
const jsonParse = JSON.parse;
const valueIsProxy = utilTypes.isProxy;
const MapConstructor = Map;
const SetConstructor = Set;

function appendProblem(problems, problem) {
  appendOwnArrayValue(problems, problem);
}

function snapshotPrimitive(value, location, problems) {
  if (value === null || typeof value === 'string' ||
      typeof value === 'boolean') {
    return {accepted: true, value};
  }
  if (typeof value === 'number' && numberIsFinite(value) &&
      !objectIs(value, -0) &&
      (!numberIsInteger(value) || numberIsSafeInteger(value))) {
    return {accepted: true, value};
  }
  appendProblem(
    problems,
    `${PROBLEM_REGISTRY_NOT_CANONICAL} at ${location}`,
  );
  return {accepted: false, value: null};
}

function snapshotArray(value, state, location, depth) {
  if (!isDenseDataArray(value)) {
    appendProblem(
      state.problems,
      `${PROBLEM_REGISTRY_NOT_CANONICAL} at ${location}: ` +
        PROBLEM_ARRAY_NOT_CANONICAL,
    );
    return {accepted: false, value: null};
  }
  const snapshot = [];
  let accepted = true;
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = objectGetOwnPropertyDescriptor(value, String(index));
    const child = snapshotValue(
      descriptor.value,
      state,
      `${location}[${index}]`,
      depth + 1,
    );
    appendOwnArrayValue(snapshot, child.value);
    accepted = child.accepted && accepted;
  }
  return {accepted, value: objectFreeze(snapshot)};
}

function snapshotRecord(value, state, location, depth) {
  if (!isRecord(value)) {
    appendProblem(
      state.problems,
      `${PROBLEM_REGISTRY_NOT_CANONICAL} at ${location}: ` +
        PROBLEM_RECORD_NOT_CANONICAL,
    );
    return {accepted: false, value: null};
  }
  const snapshot = objectCreate(null);
  const keys = objectKeys(value);
  let accepted = true;
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = objectGetOwnPropertyDescriptor(value, key);
    const child = snapshotValue(
      descriptor.value,
      state,
      `${location}.${key}`,
      depth + 1,
    );
    objectDefineProperty(snapshot, key, {
      configurable: false,
      enumerable: true,
      writable: false,
      value: child.value,
    });
    accepted = child.accepted && accepted;
  }
  return {accepted, value: objectFreeze(snapshot)};
}

function snapshotValue(value, state, location, depth) {
  state.nodeCount += 1;
  if (depth > SNAPSHOT_MAX_DEPTH || state.nodeCount > SNAPSHOT_MAX_NODES) {
    appendProblem(
      state.problems,
      `${PROBLEM_REGISTRY_NOT_CANONICAL} at ${location}: snapshot bound exceeded`,
    );
    return {accepted: false, value: null};
  }
  if (value === null || typeof value !== 'object') {
    return snapshotPrimitive(value, location, state.problems);
  }
  if (valueIsProxy(value)) {
    appendProblem(
      state.problems,
      `${PROBLEM_REGISTRY_NOT_CANONICAL} at ${location}: proxy objects are refused`,
    );
    return {accepted: false, value: null};
  }
  for (let index = 0; index < state.ancestors.length; index += 1) {
    if (state.ancestors[index] === value) {
      appendProblem(
        state.problems,
        `${PROBLEM_REGISTRY_NOT_CANONICAL} at ${location}: ` +
          PROBLEM_CYCLIC_IDENTITY,
      );
      return {accepted: false, value: null};
    }
  }
  appendOwnArrayValue(state.ancestors, value);
  const result = arrayIsArray(value) ?
    snapshotArray(value, state, location, depth) :
    snapshotRecord(value, state, location, depth);
  state.ancestors.length -= 1;
  return result;
}

function snapshotManifest(manifest) {
  const problems = [];
  const result = snapshotValue(manifest, {
    ancestors: [],
    nodeCount: 0,
    problems,
  }, '$', 0);
  if (!result.accepted || !isRecord(result.value)) {
    if (problems.length === 0) appendProblem(problems, PROBLEM_REGISTRY_NOT_OBJECT);
    return {manifest: null, problems};
  }
  return {manifest: result.value, problems};
}

export function impactContractRegistryDigest(manifest) {
  const snapshot = snapshotManifest(manifest);
  if (snapshot.problems.length > 0) return null;
  return digestCanonicalJsonData(snapshot.manifest);
}

function pathProblem(spec) {
  if (typeof spec !== 'string' || spec.length === 0) {
    return PROBLEM_PATH_EMPTY;
  }
  if (path.isAbsolute(spec) || stringIncludes(spec, WINDOWS_PATH_SEPARATOR)) {
    return `path must be repository-relative POSIX syntax: ${spec}`;
  }
  const normalized = path.posix.normalize(spec);
  if (normalized === REPOSITORY_ROOT_PATH ||
      normalized === REPOSITORY_ROOT_DIRECTORY_PATH) {
    return `path must not name the repository root: ${spec}`;
  }
  const expected = stringEndsWith(spec, '/') && !stringEndsWith(normalized, '/') ?
    `${normalized}/` : normalized;
  if (normalized === PARENT_PATH_SEGMENT ||
      stringStartsWith(normalized, PARENT_PATH_PREFIX) || expected !== spec) {
    return `path must be normalized and stay inside the repository: ${spec}`;
  }
  return null;
}

function siblingStemExists(root, spec) {
  const parent = path.join(root, path.posix.dirname(spec));
  if (!fs.existsSync(parent) || !fs.statSync(parent).isDirectory()) return false;
  const stem = path.posix.basename(spec);
  return arraySome(
    fs.readdirSync(parent),
    (entry) => stringStartsWith(entry, stem),
  );
}

function describePathSpec(root, spec) {
  const problem = pathProblem(spec);
  if (problem) {
    return {spec, kind: MATCH_EXACT, live: false, problem};
  }
  const absolute = path.join(root, spec);
  const state = fs.existsSync(absolute) ?
    PATH_SPEC_STATE.PRESENT : PATH_SPEC_STATE.ABSENT;
  switch (state) {
  case PATH_SPEC_STATE.PRESENT: {
    const stat = fs.statSync(absolute);
    return {
      spec,
      kind: stat.isDirectory() ? MATCH_DIRECTORY : MATCH_EXACT,
      live: stat.isDirectory() || stat.isFile(),
      problem: null,
    };
  }
  case PATH_SPEC_STATE.ABSENT: {
    const kind = stringEndsWith(spec, '/') ? MATCH_DIRECTORY : MATCH_STEM_PREFIX;
    return {
      spec,
      kind,
      live: kind === MATCH_STEM_PREFIX && siblingStemExists(root, spec),
      problem: null,
    };
  }
  default:
    throw new Error(`unknown path-spec state: ${state}`);
  }
}

function impactPathSpecMatches(matcher, candidatePath) {
  if (!matcher || typeof candidatePath !== 'string') return false;
  if (matcher.kind === MATCH_EXACT) return candidatePath === matcher.spec;
  if (matcher.kind === MATCH_DIRECTORY) {
    const prefix = stringEndsWith(matcher.spec, '/') ?
      matcher.spec : `${matcher.spec}/`;
    return candidatePath === matcher.spec || stringStartsWith(candidatePath, prefix);
  }
  return stringStartsWith(candidatePath, matcher.spec);
}

function matcherCovers(outer, inner) {
  if (outer.kind === MATCH_EXACT) {
    return inner.kind === MATCH_EXACT && outer.spec === inner.spec;
  }
  if (outer.kind === MATCH_DIRECTORY) {
    const prefix = stringEndsWith(outer.spec, '/') ?
      outer.spec : `${outer.spec}/`;
    return inner.spec === outer.spec || stringStartsWith(inner.spec, prefix);
  }
  return stringStartsWith(inner.spec, outer.spec);
}

function validatePathArray(root, value, label, problems, options = {}) {
  if (!arrayIsArray(value) || value.length === 0) {
    appendProblem(problems, `${label} must be a non-empty array`);
    return [];
  }
  const seen = new SetConstructor();
  const matchers = [];
  for (let index = 0; index < value.length; index += 1) {
    const spec = value[index];
    const matcher = describePathSpec(root, spec);
    if (matcher.problem) {
      appendProblem(problems, `${label} ${matcher.problem}`);
      continue;
    }
    if (setHas(seen, spec)) {
      appendProblem(problems, `${label} has duplicate path: ${spec}`);
      continue;
    }
    setAdd(seen, spec);
    if (options.exactTest === true &&
        (matcher.kind !== MATCH_EXACT || !stringEndsWith(spec, TEST_FILE_SUFFIX))) {
      appendProblem(
        problems,
        `${label} must name an exact ${TEST_FILE_SUFFIX} file: ${spec}`,
      );
    }
    if (!matcher.live) appendProblem(problems, `${label} has a dead path: ${spec}`);
    appendOwnArrayValue(matchers, matcher);
  }
  return matchers;
}

function validateContracts(root, contracts, problems) {
  const records = new MapConstructor();
  const contractOwners = new MapConstructor();
  const contractTests = new MapConstructor();
  if (!isRecord(contracts) || objectKeys(contracts).length === 0) {
    appendProblem(problems, PROBLEM_CONTRACTS_EMPTY);
    return {records, contractOwners, contractTests};
  }
  const names = objectKeys(contracts);
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index];
    const entry = contracts[name];
    const entryProblems = [];
    if (!isRecord(entry)) {
      appendProblem(problems, `contract ${name} must be an object`);
      continue;
    }
    if (typeof entry.description !== 'string' || entry.description.length === 0) {
      appendProblem(entryProblems, `contract ${name} lacks a description`);
    }
    const owners = validatePathArray(
      root, entry.owners, `contract ${name} owner`, entryProblems);
    const tests = validatePathArray(
      root, entry.tests, `contract ${name} test`, entryProblems);
    for (let problemIndex = 0;
      problemIndex < entryProblems.length;
      problemIndex += 1) {
      appendProblem(problems, entryProblems[problemIndex]);
    }
    mapSet(records, name, {name, owners, tests, problems: entryProblems});
    mapSet(
      contractTests,
      name,
      arrayIsArray(entry.tests) ? copyArrayByIndex(entry.tests) : [],
    );
    for (let ownerIndex = 0; ownerIndex < owners.length; ownerIndex += 1) {
      const owner = owners[ownerIndex];
      if (!mapHas(contractOwners, owner.spec)) {
        mapSet(contractOwners, owner.spec, []);
      }
      appendOwnArrayValue(mapGet(contractOwners, owner.spec), name);
    }
  }
  return {records, contractOwners, contractTests};
}

function endpointsOverlap(left, right) {
  return arraySome(left.owners, (leftOwner) =>
    arraySome(right.owners, (rightOwner) =>
      matcherCovers(leftOwner, rightOwner) ||
      matcherCovers(rightOwner, leftOwner)));
}

function validateWitnessClassification(id, witnessMatchers, primaryTests, problems) {
  for (let index = 0; index < witnessMatchers.length; index += 1) {
    const witness = witnessMatchers[index];
    if (!setHas(primaryTests, witness.spec)) {
      appendProblem(
        problems,
        `coupled pair ${id} witness is not primary-classified: ${witness.spec}`,
      );
    }
  }
}

function validatePairEndpoints(root, id, endpoints, problems) {
  if (!arrayIsArray(endpoints) || endpoints.length !== 2) {
    appendProblem(problems, `coupled pair ${id} must declare exactly two endpoints`);
    return [];
  }
  const endpointIds = new SetConstructor();
  const result = [];
  for (let index = 0; index < endpoints.length; index += 1) {
    const endpoint = endpoints[index];
    if (!isRecord(endpoint) || typeof endpoint.id !== 'string' ||
        endpoint.id.length === 0) {
      appendProblem(problems, `coupled pair ${id} has an endpoint without an id`);
      continue;
    }
    if (setHas(endpointIds, endpoint.id)) {
      appendProblem(
        problems,
        `coupled pair ${id} has duplicate endpoint id: ${endpoint.id}`,
      );
      continue;
    }
    setAdd(endpointIds, endpoint.id);
    appendOwnArrayValue(result, {
      id: endpoint.id,
      owners: validatePathArray(
        root,
        endpoint.owners,
        `coupled pair ${id} endpoint ${endpoint.id} owner`,
        problems,
      ),
    });
  }
  if (result.length === 2 && endpointsOverlap(result[0], result[1])) {
    appendProblem(
      problems,
      `coupled pair ${id} endpoints have overlapping owner paths`,
    );
  }
  return result;
}

function validatePairContract(id, contractName, endpoints, contracts, problems) {
  const contract = mapGet(contracts.records, contractName);
  if (typeof contractName !== 'string' || !contract) {
    appendProblem(
      problems,
      `coupled pair ${id} references unknown contract: ${contractName}`,
    );
    return null;
  }
  for (let endpointIndex = 0;
    endpointIndex < endpoints.length;
    endpointIndex += 1) {
    const endpoint = endpoints[endpointIndex];
    for (let ownerIndex = 0;
      ownerIndex < endpoint.owners.length;
      ownerIndex += 1) {
      const owner = endpoint.owners[ownerIndex];
      if (!arraySome(contract.owners, (contractOwner) =>
        matcherCovers(contractOwner, owner))) {
        appendProblem(
          problems,
          `coupled pair ${id} endpoint ${endpoint.id} owner is not covered ` +
          `by contract ${contractName}: ${owner.spec}`,
        );
      }
    }
  }
  return contract;
}

function validatePairWitnesses(root, pair, entry, contract, primaryTests) {
  const witnessMatchers = validatePathArray(
    root,
    entry.witnessTests,
    `coupled pair ${pair.id} witness`,
    pair.problems,
    {exactTest: true},
  );
  validateWitnessClassification(
    pair.id, witnessMatchers, primaryTests, pair.problems);
  if (!contract) return;
  const contractTestSpecs = new SetConstructor();
  for (let index = 0; index < contract.tests.length; index += 1) {
    setAdd(contractTestSpecs, contract.tests[index].spec);
  }
  for (let index = 0; index < witnessMatchers.length; index += 1) {
    const witness = witnessMatchers[index];
    if (!setHas(contractTestSpecs, witness.spec)) {
      appendProblem(
        pair.problems,
        `coupled pair ${pair.id} witness is not an exact test of contract ` +
        `${entry.contract}: ${witness.spec}`,
      );
    }
  }
}

function validatePair(root, id, entry, contracts, primaryTests) {
  const problems = [];
  const pair = {
    id,
    description: entry?.description,
    contract: entry?.contract,
    endpoints: [],
    witnessTests: arrayIsArray(entry?.witnessTests) ?
      copyArrayByIndex(entry.witnessTests) : [],
    problems,
  };
  if (!isRecord(entry)) {
    appendProblem(problems, `coupled pair ${id} must be an object`);
    return pair;
  }
  if (typeof entry.description !== 'string' || entry.description.length === 0) {
    appendProblem(problems, `coupled pair ${id} lacks a description`);
  }
  pair.endpoints = validatePairEndpoints(
    root, id, entry.endpoints, problems);
  const contract = validatePairContract(
    id, entry.contract, pair.endpoints, contracts, problems);
  validatePairWitnesses(root, pair, entry, contract, primaryTests);
  return pair;
}

function loadPrimaryTests(root, problems) {
  const loaded = loadPrimaryManifest(root, PRIMARY_CLASS_MANIFEST_PATH);
  if (!loaded.ok) {
    for (let index = 0; index < loaded.problems.length; index += 1) {
      appendProblem(problems, loaded.problems[index]);
    }
    return new SetConstructor();
  }
  const manifestProblems = verifyPrimaryManifest(root, loaded.manifest);
  if (manifestProblems.length > 0) {
    for (let index = 0; index < manifestProblems.length; index += 1) {
      appendProblem(problems, manifestProblems[index]);
    }
    return new SetConstructor();
  }
  const primaryTests = new SetConstructor();
  const testPaths = objectKeys(loaded.manifest.classes || {});
  for (let index = 0; index < testPaths.length; index += 1) {
    setAdd(primaryTests, testPaths[index]);
  }
  return primaryTests;
}

export function buildImpactContractRegistry(root, manifest) {
  const snapshot = snapshotManifest(manifest);
  const problems = copyArrayByIndex(snapshot.problems);
  const canonicalManifest = snapshot.manifest;
  const digest = problems.length === 0 ?
    digestCanonicalJsonData(canonicalManifest) : null;
  const registry = {
    root,
    manifest: canonicalManifest,
    digest,
    contracts: new MapConstructor(),
    contractOwners: new MapConstructor(),
    contractTests: new MapConstructor(),
    coupledPairs: [],
    problems,
  };
  if (!isRecord(canonicalManifest)) {
    if (problems.length === 0) appendProblem(problems, PROBLEM_REGISTRY_NOT_OBJECT);
    return {registry, problems, digest};
  }
  if (canonicalManifest.schemaVersion !== REGISTRY_SCHEMA_VERSION) {
    appendProblem(
      problems,
      PROBLEM_SCHEMA_VERSION_UNSUPPORTED +
        `${canonicalManifest.schemaVersion}`,
    );
  }
  if (canonicalManifest.id !== REGISTRY_ID) {
    appendProblem(problems, `impact contract registry id must be ${REGISTRY_ID}`);
  }
  const contracts = validateContracts(root, canonicalManifest.contracts, problems);
  const primaryTests = loadPrimaryTests(root, problems);
  registry.contracts = contracts.records;
  registry.contractOwners = contracts.contractOwners;
  registry.contractTests = contracts.contractTests;
  if (!isRecord(canonicalManifest.coupledPairs) ||
      objectKeys(canonicalManifest.coupledPairs).length === 0) {
    appendProblem(problems, PROBLEM_COUPLED_PAIRS_EMPTY);
    return {registry, problems, digest};
  }
  const pairIds = objectKeys(canonicalManifest.coupledPairs);
  for (let index = 0; index < pairIds.length; index += 1) {
    const id = pairIds[index];
    const entry = canonicalManifest.coupledPairs[id];
    const pair = validatePair(root, id, entry, contracts, primaryTests);
    appendOwnArrayValue(registry.coupledPairs, pair);
    for (let problemIndex = 0;
      problemIndex < pair.problems.length;
      problemIndex += 1) {
      appendProblem(problems, pair.problems[problemIndex]);
    }
  }
  return {registry, problems, digest};
}

export function loadImpactContractRegistry(
  root,
  manifestPath = DEFAULT_REGISTRY_PATH,
) {
  const absolute = path.join(root, manifestPath);
  if (!fs.existsSync(absolute)) {
    return {
      registry: null,
      problems: [`missing impact contract registry: ${manifestPath}`],
      digest: null,
    };
  }
  let manifest;
  try {
    manifest = jsonParse(fs.readFileSync(absolute, UTF8_ENCODING));
  } catch (error) {
    return {
      registry: null,
      problems: [`invalid JSON in ${manifestPath}: ${error.message}`],
      digest: null,
    };
  }
  return buildImpactContractRegistry(root, manifest);
}

export function contractsForChangedPath(registry, changedPath) {
  const names = new SetConstructor();
  if (!registry?.contracts) return [];
  mapForEach(registry.contracts, (contract) => {
    if (arraySome(contract.owners, (owner) =>
      impactPathSpecMatches(owner, changedPath))) {
      setAdd(names, contract.name);
    }
  });
  const sorted = [];
  setForEach(names, (name) => appendOwnArrayValue(sorted, name));
  arraySort(sorted);
  return sorted;
}

export function expandContractTests(registry, contractNames, classifiedTests) {
  const selected = new SetConstructor();
  for (let nameIndex = 0; nameIndex < contractNames.length; nameIndex += 1) {
    const name = contractNames[nameIndex];
    const contract = mapGet(registry?.contracts, name);
    if (!contract) continue;
    for (let matcherIndex = 0;
      matcherIndex < contract.tests.length;
      matcherIndex += 1) {
      const matcher = contract.tests[matcherIndex];
      for (let testIndex = 0;
        testIndex < classifiedTests.length;
        testIndex += 1) {
        const testPath = classifiedTests[testIndex];
        if (impactPathSpecMatches(matcher, testPath)) setAdd(selected, testPath);
      }
    }
  }
  return selected;
}

export function evaluateCoupledPairGuards(registry, changedPaths) {
  if (!registry) {
    return {problems: [PROBLEM_REGISTRY_UNAVAILABLE], triggeredPairs: []};
  }
  const problems = copyArrayByIndex(registry.problems);
  const triggeredPairs = [];
  for (let pairIndex = 0;
    pairIndex < registry.coupledPairs.length;
    pairIndex += 1) {
    const pair = registry.coupledPairs[pairIndex];
    if (pair.endpoints.length !== 2) continue;
    const matchedPaths = objectCreate(null);
    for (let endpointIndex = 0;
      endpointIndex < pair.endpoints.length;
      endpointIndex += 1) {
      const endpoint = pair.endpoints[endpointIndex];
      objectDefineProperty(matchedPaths, endpoint.id, {
        configurable: false,
        enumerable: true,
        writable: false,
        value: arrayFilter(changedPaths, (changedPath) =>
          arraySome(endpoint.owners, (owner) =>
            impactPathSpecMatches(owner, changedPath))),
      });
    }
    if (!arrayEvery(pair.endpoints, (endpoint) =>
      matchedPaths[endpoint.id].length > 0)) continue;
    const triggered = {
      id: pair.id,
      leftEndpointId: pair.endpoints[0].id,
      rightEndpointId: pair.endpoints[1].id,
      endpointIds: arrayMap(pair.endpoints, (endpoint) => endpoint.id),
      matchedPaths,
      contract: pair.contract,
      witnessTests: copyArrayByIndex(pair.witnessTests),
    };
    appendOwnArrayValue(triggeredPairs, triggered);
    if (pair.problems.length > 0) {
      appendProblem(
        problems,
        `coupled pair ${pair.id} is triggered without a complete contract ` +
        `edge: ${joinArrayByIndex(pair.problems, PROBLEM_JOIN_SEPARATOR)}`,
      );
    }
  }
  return {problems, triggeredPairs};
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const result = loadImpactContractRegistry(root);
  if (result.problems.length > 0) {
    for (let index = 0; index < result.problems.length; index += 1) {
      process.stderr.write(`${result.problems[index]}\n`);
    }
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `impact-contracts: PASS (${result.registry.contracts.size} contracts, ` +
    `${result.registry.coupledPairs.length} coupled pairs, ${result.digest})\n`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
