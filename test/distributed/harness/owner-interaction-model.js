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
// contract's host. An invariant whose subject is the architecture itself
// (ownership topology, state-machine shape, decision structure - declared as
// `subject: architecture` in the registry) is MODEL-WITNESSED when its
// modelRef resolves to a named check the model:contracts chain runs: an Alloy
// assertion that is declared and checked, a decision-table rule that names
// it, or a forbidden owner trace whose evaluator produces it. "Appears in the
// statechart" is not a check and does not bind. Everything else is reported
// unbound, never silently counted as hosted: the receipt carries three
// counts - hosted, model-witnessed, unbound - so no class hides a number.

import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

import {
  loadImpactContractRegistry,
} from '../../../scripts/checks/impact-contract-registry.js';
import {validateAlloyModel} from '../../../scripts/check-alloy-models.js';
import {validateDecisionTable} from '../../../scripts/check-decision-tables.js';
import {
  collectTraceViolations,
  validateTraceSuite,
} from '../../../scripts/check-owner-traces.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayFind = Function.call.bind(Array.prototype.find);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayMap = Function.call.bind(Array.prototype.map);
const regExpTest = Function.call.bind(RegExp.prototype.test);
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
const ARCHITECTURE_SUBJECT = 'architecture';
const ALLOY_SUFFIX = '.als';
const JSON_SUFFIX = '.json';
const DECISION_TABLE_SCHEMA = 'decision-table-v1';
const TRACE_SUITE_SCHEMA = 'owner-trace-suite-v1';
const MODEL_WITNESS_KIND = Object.freeze({
  ALLOY_ASSERTION: 'alloy-assertion',
  DECISION_TABLE_RULE: 'decision-table-rule',
  OWNER_TRACE_VIOLATION: 'owner-trace-violation',
});
const ALLOY_ASSERT_KEYWORD = 'assert';
const ALLOY_CHECK_KEYWORD = 'check';
const NO_MODEL_REF = 'no modelRef';
const NO_NAMED_CHECK_PREFIX = 'no named check for ';
const CHAIN_REJECTS_PREFIX = 'model:contracts chain rejects ';
const UNKNOWN_MODEL_KIND_PREFIX = 'no checker for model ';
const CONTRACTS_DIRECTORY = 'architecture/contracts';
const SYSTEM_CONTRACT_BLOCK = /<!--\s*system-contract\s*([\s\S]*?)-->/u;
const CLAIM_GROUPS = Object.freeze(['safetyInvariants', 'livenessExpectations']);
const FOREIGN_CLAIM_INFIX = ' claims ';
const FOREIGN_CLAIM_SUFFIX = ', which is cited by ';

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

function alloyKeywordPattern(keyword, name) {
  return new RegExp(`^\\s*${keyword}\\s+${name}\\b`, 'mu');
}

// A model witness is a NAMED check the chain runs, resolved with the chain's
// own validators so the model can never accept what the checker rejects.
function resolveAlloyWitness(root, invariant) {
  const absolute = path.join(root, invariant.modelRef);
  const validated = validateAlloyModel(absolute);
  if (validated.errors.length > 0) {
    return {problem: `${CHAIN_REJECTS_PREFIX}${invariant.modelRef}: ${validated.errors[0]}`};
  }
  const ref = arrayFind(validated.metadata.invariantRefs || [],
    (entry) => entry?.id === invariant.id);
  const name = ref?.assertion;
  if (typeof name !== 'string' || name.length === 0 ||
      !regExpTest(alloyKeywordPattern(ALLOY_ASSERT_KEYWORD, name), validated.content) ||
      !regExpTest(alloyKeywordPattern(ALLOY_CHECK_KEYWORD, name), validated.content)) {
    return {problem: `${NO_NAMED_CHECK_PREFIX}${invariant.id} in ${invariant.modelRef}`};
  }
  return {witness: {kind: MODEL_WITNESS_KIND.ALLOY_ASSERTION,
    model: invariant.modelRef, name}};
}

function resolveDecisionTableWitness(root, invariant, absolute) {
  const validated = validateDecisionTable(absolute);
  if (validated.errors.length > 0) {
    return {problem: `${CHAIN_REJECTS_PREFIX}${invariant.modelRef}: ${validated.errors[0]}`};
  }
  const rules = arrayFilter(validated.table.rules || [],
    (rule) => arrayIncludes(rule?.invariantRefs || [], invariant.id));
  if (rules.length === 0) {
    return {problem: `${NO_NAMED_CHECK_PREFIX}${invariant.id} in ${invariant.modelRef}`};
  }
  return {witness: {kind: MODEL_WITNESS_KIND.DECISION_TABLE_RULE,
    model: invariant.modelRef, name: arrayMap(rules, (rule) => rule.id).join(', ')}};
}

function resolveTraceSuiteWitness(root, invariant, absolute) {
  const validated = validateTraceSuite(absolute);
  if (validated.errors.length > 0) {
    return {problem: `${CHAIN_REJECTS_PREFIX}${invariant.modelRef}: ${validated.errors[0]}`};
  }
  // Named AND evaluated: the forbidden trace declares the violation and the
  // checker's evaluator actually produces it for that trace.
  const traces = arrayFilter(validated.suite.forbiddenTraces || [], (trace) =>
    arrayIncludes(trace?.expectedViolations || [], invariant.id) &&
    arrayIncludes(collectTraceViolations(trace), invariant.id));
  if (traces.length === 0) {
    return {problem: `${NO_NAMED_CHECK_PREFIX}${invariant.id} in ${invariant.modelRef}`};
  }
  return {witness: {kind: MODEL_WITNESS_KIND.OWNER_TRACE_VIOLATION,
    model: invariant.modelRef, name: arrayMap(traces, (trace) => trace.id).join(', ')}};
}

function resolveModelWitness(root, invariant) {
  const modelRef = invariant.modelRef;
  if (typeof modelRef !== 'string' || modelRef.length === 0) return {problem: NO_MODEL_REF};
  const absolute = path.join(root, modelRef);
  if (!fs.existsSync(absolute)) {
    return {problem: `${NO_NAMED_CHECK_PREFIX}${invariant.id}: ${modelRef} is missing`};
  }
  if (stringEndsWith(modelRef, ALLOY_SUFFIX)) return resolveAlloyWitness(root, invariant);
  if (stringEndsWith(modelRef, JSON_SUFFIX)) {
    const schema = JSON.parse(fs.readFileSync(absolute, UTF8))?.schema;
    if (schema === DECISION_TABLE_SCHEMA) {
      return resolveDecisionTableWitness(root, invariant, absolute);
    }
    if (schema === TRACE_SUITE_SCHEMA) {
      return resolveTraceSuiteWitness(root, invariant, absolute);
    }
    // A statechart lists invariants but names no property per invariant.
    return {problem: `${UNKNOWN_MODEL_KIND_PREFIX}${modelRef} (${schema})`};
  }
  return {problem: `${UNKNOWN_MODEL_KIND_PREFIX}${modelRef}`};
}

// Registry as a function, not a relation: an invariant is CLAIMED (asserted
// in safetyInvariants or livenessExpectations) by exactly one contract, the
// one it cites and whose witness goes red when its predicate is mutated. A
// contract that asserts another contract's invariant claims what its own
// witness never checks - the drift mechanism in miniature - and is a problem
// of the same class as a dangling pointer. A dependency belongs in
// systemTheory.invariantRefs, which references without asserting.
function contractClaimProblems(root, invariants) {
  const citedBy = new Map();
  for (const invariant of invariants) citedBy.set(invariant.id, invariant.contractRef);
  const directory = path.join(root, CONTRACTS_DIRECTORY);
  const problems = [];
  if (!fs.existsSync(directory)) return problems;
  for (const name of fs.readdirSync(directory)) {
    if (!stringEndsWith(name, MARKDOWN_SUFFIX)) continue;
    const contractPath = `${CONTRACTS_DIRECTORY}/${name}`;
    const block = SYSTEM_CONTRACT_BLOCK.exec(fs.readFileSync(path.join(root, contractPath), UTF8));
    if (!block) continue;
    const contract = JSON.parse(block[1]);
    for (const group of CLAIM_GROUPS) {
      for (const claim of contract[group] || []) {
        const cited = citedBy.get(claim?.id);
        if (cited !== undefined && cited !== contractPath) {
          problems.push(
            `${contractPath}${FOREIGN_CLAIM_INFIX}${claim.id}${FOREIGN_CLAIM_SUFFIX}${cited}`);
        }
      }
    }
  }
  return problems;
}

/**
 * How each registered invariant binds to the model. An invariant whose
 * contractRef names a contract the registry knows is BOUND to that contract's
 * host. An invariant declared `subject: architecture` whose modelRef resolves
 * to a named check the chain runs is MODEL-WITNESSED; one so declared whose
 * pointer dangles is a problem, and unbound - it never falls back to a host.
 * Everything else is UNBOUND and listed with its id, so the gap is a number
 * the harness reports rather than a citation nobody can witness. Three
 * counts, never one; and a contract that asserts an invariant another
 * contract cites is a problem too (see contractClaimProblems).
 * @param {string} root
 * @return {Promise<{bound: Array<{id: string, owner: string, contract: string}>,
 *   modelWitnessed: Array<{id: string, owner: string, witness: object}>,
 *   unbound: Array<{id: string, owner: string, contractRef: string}>,
 *   problems: string[], hostedOwners: Set<string>}>}
 */
export async function invariantBindings(root) {
  const hosts = await hostedInteractions(root);
  const invariants = JSON.parse(
    fs.readFileSync(path.join(root, INVARIANTS_PATH), UTF8)).invariants;
  const bound = [];
  const modelWitnessed = [];
  const unbound = [];
  const problems = [];
  const hostedOwners = new Set();
  for (const invariant of invariants) {
    // A declared architecture subject binds through its model check and
    // never through a host: a contract registered under the same citation
    // (for the runtime invariants that share the document) must not swallow
    // it, and a dangling model pointer is a problem, never a fallback.
    if (invariant.subject === ARCHITECTURE_SUBJECT) {
      const resolved = resolveModelWitness(root, invariant);
      if (resolved.witness) {
        modelWitnessed.push({id: invariant.id, owner: invariant.owner,
          witness: resolved.witness});
      } else {
        problems.push(`${invariant.id}: ${resolved.problem}`);
        unbound.push({id: invariant.id, owner: invariant.owner,
          contractRef: invariant.contractRef});
      }
      continue;
    }
    const contract = contractIdOf(invariant.contractRef);
    if (hosts.has(contract)) {
      bound.push({id: invariant.id, owner: invariant.owner, contract});
      hostedOwners.add(invariant.owner);
      continue;
    }
    unbound.push({id: invariant.id, owner: invariant.owner,
      contractRef: invariant.contractRef});
  }
  problems.push(...contractClaimProblems(root, invariants));
  return {bound: arrayMap(bound, (entry) => entry),
    modelWitnessed: arrayMap(modelWitnessed, (entry) => entry),
    unbound: arrayMap(unbound, (entry) => entry),
    problems: arrayMap(problems, (entry) => entry), hostedOwners};
}
