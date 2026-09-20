// Receipt: backend-seam-selects-explicitly-and-liferaft-behaviour-is-unchanged
//
// Three things are measured here, none of them from a literal this file owns:
//   1. the seam's selection, read from the seam;
//   2. the seam's interface, derived by parsing `src` - the production call
//      census - and compared against what each backend actually exposes;
//   3. that routing liferaft through the seam changes nothing liferaft does,
//      measured by driving the same operations on a seam-built provider and a
//      directly built one and comparing the effects they had.

import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  RAFT_BACKEND,
  RAFT_BACKEND_DEFAULT,
  RAFT_BACKEND_NAMES,
  RAFT_BACKEND_OPTION,
  RAFT_BACKEND_SELECTION_SOURCE,
} from '../../../src/raft/raft-backend-constants.js';
import {
  createRaftProvider,
  selectRaftBackend,
} from '../../../src/raft/raft-backend-selection.js';
import {LiferaftProvider} from '../../../src/raft/liferaft-provider.js';
import {RaftRsWasmProvider} from '../../../src/raft/raft-rs-provider.js';
import {
  RAFT_RS_PROVIDER_DEFERRED,
  RAFT_RS_PROVIDER_METHOD,
  RAFT_RS_PROVIDER_SERVED,
} from '../../../src/raft/raft-rs-provider-constants.js';
import {
  censusNames,
  deriveProductionRaftCallCensus,
} from './production-raft-call-census.js';

const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SOURCE_ROOT = path.join(REPOSITORY_ROOT, 'src');
const SEAM_MODULE = 'src/raft/raft-backend-selection.js';
const OPTION_ASSIGNMENT = new RegExp(`${RAFT_BACKEND_OPTION}\\s*:`, 'u');
const UNKNOWN_BACKEND = 'raft-rs-native';
const STUB_TIMEOUT_MS = 7;
const STUB_TERM = 4;
const STUB_COMMITTED_INDEX = 9;

function sourceFiles(directory, collected = []) {
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      sourceFiles(absolute, collected);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      collected.push(absolute);
    }
  }
  return collected;
}

// A liferaft node stub that records what was done to it. The two providers
// under comparison each get their own, and the two recordings are compared.
function liferaftNodeStub() {
  const effects = [];
  return {
    effects,
    term: STUB_TERM,
    log: {committedIndex: STUB_COMMITTED_INDEX},
    timers: {clear: (name) => effects.push(['timers.clear', name])},
    command: (value) => {
      effects.push(['command', value]);
      return Promise.resolve();
    },
    join: (address) => effects.push(['join', address]),
    heartbeat: (value) => effects.push(['heartbeat', value]),
    timeout: () => {
      effects.push(['timeout']);
      return STUB_TIMEOUT_MS;
    },
    end: () => effects.push(['end']),
  };
}

async function driveLiferaftSurface(provider, node) {
  const returned = [];
  await provider.propose(node, 'a-command');
  provider.joinPeer(node, 'an-address');
  provider.startElectionTimer(node);
  provider.requestElectionNow(node);
  provider.clearTimers(node, 'heartbeat');
  returned.push(provider.getCurrentTerm(node));
  returned.push(provider.getCommittedIndex(node));
  provider.shutdownNode(node);
  return returned;
}

test('an absent backend selection is liferaft, and it says so by name',
  async () => {
    assert.deepEqual(selectRaftBackend({}), {
      backend: RAFT_BACKEND.LIFERAFT,
      source: RAFT_BACKEND_SELECTION_SOURCE.DEFAULT,
    });
    assert.deepEqual(selectRaftBackend(), {
      backend: RAFT_BACKEND_DEFAULT,
      source: RAFT_BACKEND_SELECTION_SOURCE.DEFAULT,
    });
    assert.ok(createRaftProvider({}) instanceof LiferaftProvider);
  });

test('the experimental backend is reached only by naming it', async () => {
  assert.deepEqual(
    selectRaftBackend({[RAFT_BACKEND_OPTION]: RAFT_BACKEND.RAFT_RS_WASM}),
    {
      backend: RAFT_BACKEND.RAFT_RS_WASM,
      source: RAFT_BACKEND_SELECTION_SOURCE.CONFIGURED,
    });
  const provider = createRaftProvider({
    [RAFT_BACKEND_OPTION]: RAFT_BACKEND.RAFT_RS_WASM,
  });
  assert.ok(provider instanceof RaftRsWasmProvider);
});

test('a backend name the seam does not know is refused, never defaulted',
  async () => {
    assert.throws(
      () => selectRaftBackend({[RAFT_BACKEND_OPTION]: UNKNOWN_BACKEND}),
      (error) => error.message.includes(UNKNOWN_BACKEND) &&
        RAFT_BACKEND_NAMES.every((name) => error.message.includes(name)));
    assert.throws(
      () => selectRaftBackend({[RAFT_BACKEND_OPTION]: false}),
      /must be a string/u);
  });

test('no production module configures the experimental backend', async () => {
  const naming = sourceFiles(SOURCE_ROOT)
    .filter((file) => OPTION_ASSIGNMENT.test(fs.readFileSync(file, 'utf8')))
    .map((file) => path.relative(REPOSITORY_ROOT, file));
  assert.deepEqual(naming, [],
    'a production module that sets the backend option would make the ' +
    'experimental backend reachable without a configuration naming it');
  // The check can fail: the same regex over a module that DID configure the
  // backend finds it. Without this the empty result above proves nothing.
  assert.ok(OPTION_ASSIGNMENT.test(
    `const options = {${RAFT_BACKEND_OPTION}: ` +
    `'${RAFT_BACKEND.RAFT_RS_WASM}'};`));
  const seamSource = fs.readFileSync(
    path.join(REPOSITORY_ROOT, SEAM_MODULE), 'utf8');
  assert.ok(seamSource.includes('RAFT_BACKEND_OPTION'),
    'the seam module is the one place that reads the option');
});

test('the seam interface is the census of what production calls', async () => {
  const census = censusNames(deriveProductionRaftCallCensus());
  assert.ok(census.providerMethods.length > 0);
  const liferaft = new LiferaftProvider();
  for (const name of census.providerMethods) {
    assert.equal(typeof liferaft[name], 'function',
      `liferaft must serve ${name}, which production calls on the seam`);
  }
  const served = new Set(RAFT_RS_PROVIDER_SERVED);
  const deferred = new Set(Object.keys(RAFT_RS_PROVIDER_DEFERRED));
  assert.deepEqual(
    [...served].filter((name) => deferred.has(name)), [],
    'a seam name is served or deferred, never both');
  assert.deepEqual(
    [...new Set([...served, ...deferred])].sort(),
    census.providerMethods.slice().sort(),
    'served and deferred must partition the census exactly: a seam name ' +
    'that is in neither is a name the backend silently does not answer');
  assert.deepEqual(
    Object.values(RAFT_RS_PROVIDER_METHOD).slice().sort(),
    census.providerMethods.slice().sort());
});

test('every seam name the experimental backend defers refuses by name',
  async () => {
    const provider = createRaftProvider({
      [RAFT_BACKEND_OPTION]: RAFT_BACKEND.RAFT_RS_WASM,
    });
    for (const [name, reason] of Object.entries(RAFT_RS_PROVIDER_DEFERRED)) {
      assert.equal(typeof provider[name], 'function',
        `${name} must exist at the seam so a caller gets a typed refusal`);
      assert.throws(() => provider[name](), (error) =>
        error.message.includes(name) && error.message.includes(reason),
      `${name} must refuse with the reason it is deferred`);
    }
    for (const name of RAFT_RS_PROVIDER_SERVED) {
      assert.equal(typeof provider[name], 'function');
    }
  });

test('routing liferaft through the seam changes nothing liferaft does',
  async () => {
    const throughSeam = createRaftProvider({});
    const direct = new LiferaftProvider();
    assert.equal(throughSeam.constructor, LiferaftProvider);
    const seamNode = liferaftNodeStub();
    const directNode = liferaftNodeStub();
    const seamReturned = await driveLiferaftSurface(throughSeam, seamNode);
    const directReturned = await driveLiferaftSurface(direct, directNode);
    assert.deepEqual(seamNode.effects, directNode.effects,
      'the seam selects a provider; it must not change what that provider ' +
      'does to the node it was given');
    assert.deepEqual(seamReturned, directReturned);
    assert.ok(seamNode.effects.length > 0);
  });
