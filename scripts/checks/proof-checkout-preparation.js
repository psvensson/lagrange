/**
 * The generated state a proof checkout must have before any test in it starts
 * (clean-worktree-generated-import-graph). A fresh checkout of a commit lacks
 * every gitignored artifact its tests read; CI makes them in "Prepare
 * generated test metadata", and every local proof checkout makes them here:
 * the push-gate materializer (scripts/checks/push-gate-corpus-worktree.js
 * --gate) prepares each exact checkout it proves a command in - the pre-push
 * gate, the publisher's local and post-merge corpus, the local release proof -
 * and the lab placement prepares its remote checkout from the same list.
 *
 * Preparation generates; it never changes what is proven. A tracked file a
 * producer rewrites (the import graph seal of a commit whose seal is stale) is
 * put back to the commit's bytes, so the tests that read the sealed graph
 * refuse a graph the commit does not seal, in their own words. A producer that
 * fails refuses the checkout: no command runs without its generated material.
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {execGit} from './git-invocation.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const stringSplit = Function.call.bind(String.prototype.split);
const stringTrim = Function.call.bind(String.prototype.trim);
const stringSlice = Function.call.bind(String.prototype.slice);

const UTF8 = 'utf8';
const NEWLINE = '\n';
const EMPTY = '';
const STATUS_PATH_COLUMN = 3;
const GIT_TRACKED_CHANGES = Object.freeze(['status', '--porcelain', '--untracked-files=no']);
const GIT_SHOW = 'show';
const HEAD_PREFIX = 'HEAD:';

// The generated material, one producer each, in the order they run. The
// producer's own path and flag: a commit older than its producer has nothing
// of it to read.
const PROOF_CHECKOUT_GENERATORS = Object.freeze([
  Object.freeze({
    name: 'import-graph',
    producer: 'scripts/generate-global-owner-debt-inventory.js',
    args: Object.freeze(['--refresh-import-graph-only']),
  }),
]);

const TEXT = Object.freeze({
  PREFIX: '[proof-checkout] ',
  PREPARED: 'prepared ',
  FAILED: ' could not be generated: exit ',
  KEPT: 'kept the commit\'s ',
  REWRITTEN_BY: ' (rewritten by ',
  CLOSE: ')',
});

function trackedChanges(checkout) {
  const lines = stringSplit(String(execGit([...GIT_TRACKED_CHANGES],
    {cwd: checkout, encoding: UTF8})), NEWLINE);
  return arrayMap(arrayFilter(lines, (line) => stringTrim(line) !== EMPTY),
    (line) => stringSlice(line, STATUS_PATH_COLUMN));
}

// Put back the commit's bytes of every tracked file the producer rewrote.
function keepCommittedBytes(checkout, generator, write) {
  for (const file of trackedChanges(checkout)) {
    const committed = execGit([GIT_SHOW, `${HEAD_PREFIX}${file}`],
      {cwd: checkout, encoding: 'buffer'});
    fs.writeFileSync(path.join(checkout, file), committed);
    write(`${TEXT.PREFIX}${TEXT.KEPT}${file}${TEXT.REWRITTEN_BY}${generator.name}${TEXT.CLOSE}`);
  }
}

/**
 * Generate every artifact in PROOF_CHECKOUT_GENERATORS inside a clean exact
 * checkout, with the node running this process.
 * @param {string} checkout
 * @param {{run?: Function, env?: Object, write?: Function}} [options]
 * @return {{ok: boolean, prepared: string[], problem: string|null}}
 */
function prepareProofCheckout(checkout, {run = spawnSync, env = process.env,
  write = (line) => process.stdout.write(`${line}${NEWLINE}`)} = {}) {
  const prepared = [];
  for (const generator of PROOF_CHECKOUT_GENERATORS) {
    if (!fs.existsSync(path.join(checkout, generator.producer))) continue;
    const result = run(process.execPath, [generator.producer, ...generator.args],
      {cwd: checkout, env, encoding: UTF8, stdio: ['ignore', 'ignore', 'inherit']});
    if (result.status !== 0) {
      return {ok: false, prepared, problem: `${TEXT.PREFIX}${generator.name}${TEXT.FAILED}` +
        `${result.status ?? result.error?.message}`};
    }
    keepCommittedBytes(checkout, generator, write);
    write(`${TEXT.PREFIX}${TEXT.PREPARED}${generator.name}`);
    prepared.push(generator.name);
  }
  return {ok: true, prepared, problem: null};
}

export {PROOF_CHECKOUT_GENERATORS, prepareProofCheckout};
