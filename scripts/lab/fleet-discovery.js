// Live fleet facts and the exact source requirement those facts are measured against.
import fs from 'node:fs';
import path from 'node:path';
import {GIT_OUTPUT_BOUND, isGitOutputTooLarge} from '../checks/git-invocation.js';
import {labLockText} from './machine-hold.js';
import {TEXT_UTF8} from './process.js';
import {gitAt} from './placement-source.js';
import {REQUIREMENT_SOURCE, corpusReadiness, graphDigestOf, lockfileGraphDigest,
  probeTestCapability} from './test-capability.js';

const EMPTY = '';

const FLEET_CONTROLLER_NAME = '(controller)';
const FLEET_DEFAULT_REPO_PATH = '~/projects/lagrange';

async function settleProbe(probe, input) {
  try {
    return {capability: await probe(input), error: null};
  } catch (error) {
    return {capability: null, error: error.message};
  }
}

/**
 * Discover the fleet: the controller and every inventory machine with an ssh
 * target, probed in parallel. A machine reached twice - listed in the
 * inventory AND being the controller - is recognised by its boot identity
 * and marked, so it is never counted as two machines. Nothing here chooses
 * where anything runs; it records what each machine can do.
 * @param {Object} input
 * @param {Array<Object>} input.nodes inventory nodes
 * @param {string} input.controllerRepoPath this checkout
 * @param {string} input.lockGraphSha256 the dependency graph a run would need
 * @param {string} input.nodeMinimum package.json engines floor
 * @param {Function} [input.probe]
 * @return {Promise<Array<Object>>}
 */
export async function discoverFleet({nodes, controllerRepoPath, lockGraphSha256,
  nodeMinimum, probe = probeTestCapability}) {
  // The node major a run activates, taken from the engines floor rather than
  // written down a second time.
  const nodeMajor = String(nodeMinimum || EMPTY).split('.')[0];
  const targets = [{name: FLEET_CONTROLLER_NAME, controller: true,
    input: {sshTarget: null, repoPath: controllerRepoPath, nodeMajor}}];
  for (const node of nodes) {
    if (!node || !node.ssh) continue;
    targets.push({name: node.name, controller: false,
      input: {sshTarget: node.ssh, repoPath: node.repoPath || FLEET_DEFAULT_REPO_PATH,
        nodeMajor}});
  }
  const outcomes = await Promise.all(
    targets.map((target) => settleProbe(probe, target.input)));
  const firstByMachine = new Map();
  return targets.map((target, index) => {
    const {capability, error} = outcomes[index];
    const bootId = capability?.bootId ?? null;
    const sameMachineAs = bootId && firstByMachine.has(bootId) ?
      firstByMachine.get(bootId) : null;
    if (bootId && !sameMachineAs) firstByMachine.set(bootId, target.name);
    return {
      name: target.name,
      controller: target.controller,
      capability,
      error,
      sameMachineAs,
      readiness: corpusReadiness(capability, {lockGraphSha256, nodeMinimum}),
    };
  });
}

export {FLEET_CONTROLLER_NAME, FLEET_DEFAULT_REPO_PATH};

const FLEET_NAME_COLUMN = 16;
const FLEET_FACTOR_DIGITS = 2;
const FLEET_GRAPH_DIGITS = 12;
const FLEET_UNKNOWN = '?';
const FLEET_TEXT = Object.freeze({
  UNREACHABLE: 'unreachable: ',
  SAME_MACHINE: 'same machine as ',
  READY: 'ready',
  NOT_READY: 'not ready: ',
  GAPS_OPEN: ' (gaps: ',
  GAPS_CLOSE: ')',
  LIST: ', ',
  LOCK: ' | ',
  REQUIREMENT: 'requirement: ',
  WORKING_TREE: 'the working tree (no commit named)',
  COMMIT: 'commit ',
  GRAPH: ', dependency graph ',
  NODE: ', node >= ',
});

/**
 * Record one discovery pass in the inventory state. A machine that answered
 * gets its fresh facts; one that did not KEEPS its last known facts but also
 * records the failed attempt, so placement can never mistake stale facts for
 * live ones (verifier round 1).
 * @param {Object} state the lab inventory state
 * @param {Array<Object>} fleet discoverFleet's result
 * @param {number} [now]
 * @return {Object} the same state
 */
export function recordFleet(state, fleet, now = Date.now()) {
  for (const entry of fleet) {
    const target = entry.controller ?
      (state.controller = {...(state.controller || {})}) :
      state.nodes?.[entry.name];
    if (!target) continue;
    if (entry.capability) {
      target.testCapability = entry.capability;
      delete target.lastProbeFailure;
    } else {
      target.lastProbeFailure = {at: now, error: entry.error};
    }
  }
  return state;
}

/**
 * One line per machine: identity-merged, unreachable, ready or not, and the
 * gaps placement would route around, with speed relative to the controller;
 * then who holds the machine under the lab convention, when it answered.
 * @param {Array<Object>} fleet
 * @return {string[]}
 */
export function formatFleet(fleet) {
  const reference = fleet.find((entry) => entry.controller)?.capability?.cpuSampleMs;
  return fleet.map((entry) => {
    const cap = entry.capability;
    const factor = cap?.cpuSampleMs && reference ?
      (cap.cpuSampleMs / reference).toFixed(FLEET_FACTOR_DIGITS) : FLEET_UNKNOWN;
    return `${entry.name.padEnd(FLEET_NAME_COLUMN)} cores=${cap?.cores ?? FLEET_UNKNOWN} ` +
      `speed x${factor} ${fleetVerdict(entry)}${fleetGaps(entry)}${fleetLock(cap)}`;
  });
}

/**
 * One line naming what a fleet was measured against: a commit, or the
 * working tree when no commit was named.
 * @param {{source: string, lockGraphSha256: string|null, nodeMinimum: string}} requirement
 * @return {string}
 */
export function formatFleetRequirement({source, lockGraphSha256, nodeMinimum}) {
  const what = source === REQUIREMENT_SOURCE.WORKING_TREE ?
    FLEET_TEXT.WORKING_TREE : `${FLEET_TEXT.COMMIT}${source}`;
  return `${FLEET_TEXT.REQUIREMENT}${what}${FLEET_TEXT.GRAPH}` +
    `${String(lockGraphSha256 || FLEET_UNKNOWN).slice(0, FLEET_GRAPH_DIGITS)}` +
    `${FLEET_TEXT.NODE}${nodeMinimum || FLEET_UNKNOWN}`;
}

function fleetLock(capability) {
  return capability?.machineLock ?
    `${FLEET_TEXT.LOCK}${labLockText(capability.machineLock)}` : EMPTY;
}

function fleetVerdict(entry) {
  if (entry.error) return `${FLEET_TEXT.UNREACHABLE}${entry.error}`;
  if (entry.sameMachineAs) return `${FLEET_TEXT.SAME_MACHINE}${entry.sameMachineAs}`;
  return entry.readiness.ready ? FLEET_TEXT.READY :
    `${FLEET_TEXT.NOT_READY}${entry.readiness.missing.join(FLEET_TEXT.LIST)}`;
}

function fleetGaps(entry) {
  return entry.readiness.gaps.length > 0 ?
    `${FLEET_TEXT.GAPS_OPEN}${entry.readiness.gaps.join(FLEET_TEXT.LIST)}` +
    `${FLEET_TEXT.GAPS_CLOSE}` : EMPTY;
}

const REQUIREMENT_FILE = Object.freeze({PACKAGE: 'package.json', LOCK: 'package-lock.json'});
const REQUIREMENT_TEXT = Object.freeze({
  UNREADABLE: 'no requirement: cannot read ',
  AT: ' at ',
  TOO_LARGE: ' is larger than the requirement read bound of ',
  BYTES: ' bytes',
});
// Why discovery for a placed run failed, as a code a caller can name.
const DISCOVERY_FAILURE = Object.freeze({
  REQUIREMENT_UNREADABLE: 'lab-requirement-unreadable',
  REQUIREMENT_TOO_LARGE: 'lab-requirement-too-large',
  INVENTORY_UNREADABLE: 'lab-inventory-unreadable',
});
const REQUIREMENT_FAILURES = new Set([DISCOVERY_FAILURE.REQUIREMENT_UNREADABLE,
  DISCOVERY_FAILURE.REQUIREMENT_TOO_LARGE]);

function discoveryFailure(code, message, cause = undefined) {
  return Object.assign(new Error(message, {cause}), {code});
}
/**
 * The requirement a machine must meet to run a commit's corpus: the
 * dependency graph its lockfile describes and its engines floor. With a sha
 * both are read from that commit - the one a run places - and a commit that
 * cannot be read throws rather than falling back; with none they are the
 * working tree's, and `source` says which. A commit's file larger than
 * GIT_OUTPUT_BOUND.COMMAND throws its own failure (REQUIREMENT_TOO_LARGE).
 * @param {string} root
 * @param {string|null} [sha]
 * @return {{source: string, lockGraphSha256: string|null, nodeMinimum: string}}
 */
export function fleetRequirement(root, sha = null) {
  const read = (file) => {
    if (!sha) return fs.readFileSync(path.join(root, file), TEXT_UTF8);
    let shown;
    try {
      shown = gitAt(root, ['show', `${sha}:${file}`]);
    } catch (error) {
      if (!isGitOutputTooLarge(error)) throw error;
      throw discoveryFailure(DISCOVERY_FAILURE.REQUIREMENT_TOO_LARGE,
        `${file}${REQUIREMENT_TEXT.AT}${sha}${REQUIREMENT_TEXT.TOO_LARGE}` +
        `${GIT_OUTPUT_BOUND.COMMAND}${REQUIREMENT_TEXT.BYTES}`, error);
    }
    if (shown.status !== 0) {
      throw discoveryFailure(DISCOVERY_FAILURE.REQUIREMENT_UNREADABLE,
        `${REQUIREMENT_TEXT.UNREADABLE}${file}${REQUIREMENT_TEXT.AT}${sha}`, shown.error);
    }
    return shown.stdout;
  };
  const manifest = JSON.parse(read(REQUIREMENT_FILE.PACKAGE));
  return {
    source: sha || REQUIREMENT_SOURCE.WORKING_TREE,
    lockGraphSha256: lockfileGraphDigest(read(REQUIREMENT_FILE.LOCK), graphDigestOf),
    nodeMinimum: String(manifest.engines?.node || EMPTY).replace(/^>=\s*/u, EMPTY),
  };
}

export {DISCOVERY_FAILURE, FLEET_FACTOR_DIGITS, FLEET_UNKNOWN, REQUIREMENT_FAILURES,
  discoveryFailure, fleetVerdict};
