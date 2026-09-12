// The seven-node cold-formation harness model, derived from the registered
// owner contracts.
//
// An interaction the harness exercises is modelled by a HOST: the real
// production owner modules, imported, with every function they export sealed
// against override. Nothing here is typed by hand: the set of interactions is
// the registry's coupled pairs and its contracts with owners under src/, the
// owners are the paths those records name, and the sealed surface is what the
// modules actually export. A stand-in - an object built by hand to play an
// owner's part - has no place in this model, which is the point: the model
// went stale for a day (2026-09-09) because a hand-wired stand-in kept
// modelling an interaction the owners had changed.
//
// Invariant owners are hosted through the contract each invariant cites: an
// invariant whose contractRef is a registered contract is witnessed by that
// contract's host; one whose contract is not registered is reported, never
// silently counted as hosted.

import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

import {
  loadImpactContractRegistry,
} from '../../../scripts/checks/impact-contract-registry.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayMap = Function.call.bind(Array.prototype.map);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);

const UTF8 = 'utf8';
const SOURCE_PREFIX = 'src/';
const JAVASCRIPT_SUFFIX = '.js';
const MARKDOWN_SUFFIX = '.md';
const INVARIANTS_PATH = 'architecture/contracts/invariants.json';
const FUNCTION_TYPE = 'function';
const HOST_KIND = Object.freeze({PAIR: 'pair', CONTRACT: 'contract'});
const SEALED_HOST_ERROR_PREFIX = 'owner host must inherit ';
const SEALED_HOST_ERROR_SUFFIX = ' from production';

// Owners arrive as the registry's own records - {spec, kind} - and are
// resolved by the registry's vocabulary, never re-classified here: an exact
// owner is one module; a stem-prefix owner is every module in its directory
// whose name starts with the stem; a directory owner is a contract scope with
// no overridable surface of its own, recorded and not loaded (loading a whole
// tree would run module-level side effects that belong to the runtime, not
// to a model of it).
const OWNER_KIND = Object.freeze({
  EXACT: 'exact', DIRECTORY: 'directory', STEM_PREFIX: 'stem-prefix',
});

function stemPrefixModules(root, spec) {
  const directory = path.posix.dirname(spec);
  const stem = path.posix.basename(spec);
  const absolute = path.join(root, directory);
  if (!fs.existsSync(absolute)) return [];
  return arrayMap(
    arrayFilter(fs.readdirSync(absolute), (name) =>
      stringStartsWith(name, stem) && stringEndsWith(name, JAVASCRIPT_SUFFIX)),
    (name) => `${directory}/${name}`);
}

function resolveOwner(root, record) {
  if (record.kind === OWNER_KIND.DIRECTORY) return {modules: [], scopes: [record.spec]};
  if (record.kind === OWNER_KIND.STEM_PREFIX) {
    return {modules: stemPrefixModules(root, record.spec), scopes: []};
  }
  return {modules: stringEndsWith(record.spec, JAVASCRIPT_SUFFIX) ? [record.spec] : [],
    scopes: []};
}

async function functionExports(root, modulePath) {
  const namespace = await import(pathToFileURL(path.join(root, modulePath)).href);
  return arrayFilter(Object.keys(namespace),
    (name) => typeof namespace[name] === FUNCTION_TYPE);
}

// The host: production modules loaded, their exported functions the sealed
// surface. `create()` returns an object that inherits every export and throws
// if a caller tries to hand it an override for a sealed name - the shape of
// test/convergence/membership-publication-owner-driver-host.js.
async function buildHost(root, kind, id, owners) {
  const modules = [];
  const scopes = [];
  for (const record of owners) {
    const resolved = resolveOwner(root, record);
    modules.push(...resolved.modules);
    scopes.push(...resolved.scopes);
  }
  const sealed = new Set();
  const namespaces = [];
  for (const modulePath of modules) {
    const namespace = await import(pathToFileURL(path.join(root, modulePath)).href);
    namespaces.push(namespace);
    for (const name of await functionExports(root, modulePath)) sealed.add(name);
  }
  const sealedMethods = [...sealed].sort();
  return Object.freeze({
    kind, id, owners: modules, scopes, sealedMethods, seam: null,
    create(overrides = {}) {
      for (const name of sealedMethods) {
        if (Object.prototype.hasOwnProperty.call(overrides, name)) {
          throw new TypeError(
            `${SEALED_HOST_ERROR_PREFIX}${name}${SEALED_HOST_ERROR_SUFFIX}`);
        }
      }
      const host = Object.create(null);
      for (const namespace of namespaces) {
        for (const name of Object.keys(namespace)) host[name] = namespace[name];
      }
      return Object.assign(host, overrides);
    },
  });
}

// A SEAM is an interaction the harness stands in for by contract rather than
// hosting the real owner: the registry pair declares the stand-in module, the
// contract cases both legs run, the seam's conformance run and the test where
// the owner is real. The model records it as seamed-here, real-there; a pointer
// that dangles, or a real test that is not a witness of the pair, is a
// problem the receipt test turns red on - the same mechanism as an unbound
// invariant citation.
const SEAM_POINTERS = Object.freeze(['stub', 'contractCases', 'conformanceTest', 'realTest']);

function validatedSeam(root, pair, declared) {
  const problems = [];
  for (const pointer of SEAM_POINTERS) {
    const target = declared[pointer];
    if (typeof target !== 'string' || !fs.existsSync(path.join(root, target))) {
      problems.push(`${pointer} dangles: ${String(target)}`);
    }
  }
  const witnesses = arrayMap(pair.witnessTests, (witness) => witness.spec || witness);
  for (const pointer of ['conformanceTest', 'realTest']) {
    if (typeof declared[pointer] === 'string' &&
        !arrayIncludes(witnesses, declared[pointer])) {
      problems.push(`${pointer} is not a witness of the pair: ${declared[pointer]}`);
    }
  }
  return Object.freeze({
    seamedIn: declared.stub, contractCases: declared.contractCases,
    conformanceTest: declared.conformanceTest, realIn: declared.realTest,
    problems: Object.freeze(problems),
  });
}

/**
 * Every registered interaction, hosted. Map from interaction id to host.
 * @param {string} root repository root
 * @return {Promise<Map<string, object>>}
 */
export async function hostedInteractions(root) {
  const loaded = loadImpactContractRegistry(root);
  if (loaded.problems.length > 0) {
    throw new Error(`impact contract registry: ${loaded.problems.join('; ')}`);
  }
  const hosts = new Map();
  const registry = loaded.registry;
  for (const pair of registry.coupledPairs) {
    const owners = [];
    for (const endpoint of pair.endpoints) owners.push(...endpoint.owners);
    const host = await buildHost(root, HOST_KIND.PAIR, pair.id, owners);
    const declared = registry.manifest.coupledPairs[pair.id]?.harnessSeam;
    hosts.set(pair.id, declared ?
      Object.freeze({...host, seam: validatedSeam(root, pair, declared)}) : host);
  }
  for (const [id, contract] of registry.contracts) {
    const owners = arrayFilter(contract.owners,
      (record) => stringStartsWith(record.spec, SOURCE_PREFIX));
    if (owners.length === 0) continue;
    hosts.set(id, await buildHost(root, HOST_KIND.CONTRACT, id, owners));
  }
  return hosts;
}

function contractIdOf(contractRef) {
  const base = path.posix.basename(String(contractRef || ''));
  return stringEndsWith(base, MARKDOWN_SUFFIX) ?
    base.slice(0, -MARKDOWN_SUFFIX.length) : base;
}

/**
 * How each registered invariant binds to the model. An invariant whose
 * contractRef names a contract the registry knows is BOUND to that contract's
 * host; one whose contract the registry does not know is UNBOUND and listed
 * with its id, so the gap is a number the harness reports rather than a
 * citation nobody can witness. The model grows bound as the registry grows.
 * @param {string} root
 * @return {Promise<{bound: Array<{id: string, owner: string, contract: string}>,
 *   unbound: Array<{id: string, owner: string, contractRef: string}>,
 *   hostedOwners: Set<string>}>}
 */
export async function invariantBindings(root) {
  const hosts = await hostedInteractions(root);
  const invariants = JSON.parse(
    fs.readFileSync(path.join(root, INVARIANTS_PATH), UTF8)).invariants;
  const bound = [];
  const unbound = [];
  const hostedOwners = new Set();
  for (const invariant of invariants) {
    const contract = contractIdOf(invariant.contractRef);
    if (hosts.has(contract)) {
      bound.push({id: invariant.id, owner: invariant.owner, contract});
      hostedOwners.add(invariant.owner);
    } else {
      unbound.push({id: invariant.id, owner: invariant.owner,
        contractRef: invariant.contractRef});
    }
  }
  return {bound: arrayMap(bound, (entry) => entry),
    unbound: arrayMap(unbound, (entry) => entry), hostedOwners};
}
