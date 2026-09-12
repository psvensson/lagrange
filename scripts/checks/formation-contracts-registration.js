/**
 * Unbound invariant citations in the derived harness model.
 *
 *   node scripts/checks/formation-contracts-registration.js [--metric] [--json]
 *
 * Asks test/distributed/harness/owner-interaction-model.js how each
 * registered invariant binds and prints three counts - hosted through a
 * registered contract, model-witnessed by a named check the model:contracts
 * chain runs, unbound - with every unbound citation and every dangling model
 * pointer named. The last stdout line is the unbound number; exit 0 only when
 * it is 0 and no pointer dangles. This is the
 * `formation-contracts-registration` quest's probe and it derives from the
 * registry, so it moves only when a citation is registered or retired.
 */
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {invariantBindings} from '../../test/distributed/harness/owner-interaction-model.js';

const arrayIncludes = Function.call.bind(Array.prototype.includes);

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ARGV_OFFSET = 2;
const JSON_FLAG = '--json';
const METRIC_FLAG = '--metric';
const JSON_INDENT = 2;
const LINE_SEPARATOR = '\n';
const EXIT_OK = 0;
const EXIT_UNBOUND = 1;
const UNBOUND_MARK = 'UNBOUND';
const MODEL_WITNESSED_MARK = 'MODEL-WITNESSED';
const PROBLEM_MARK = 'PROBLEM';
const COUNTS_PREFIX = 'counts: hosted=';
const MODEL_WITNESSED_COUNT_PREFIX = ' model-witnessed=';
const UNBOUND_COUNT_PREFIX = ' unbound=';

// Three counts, never one: the metric is the unbound count, but the receipt
// always shows the hosted and model-witnessed counts beside it, and a
// model-witnessed pointer that does not resolve is a problem that fails the
// probe even when the unbound count is zero.
async function main(argv) {
  const bindings = await invariantBindings(REPO_ROOT);
  const unbound = bindings.unbound.length;
  const problems = bindings.problems.length;
  if (arrayIncludes(argv, JSON_FLAG)) {
    process.stdout.write(`${JSON.stringify({
      bound: bindings.bound, modelWitnessed: bindings.modelWitnessed,
      unbound: bindings.unbound, problems: bindings.problems,
    }, null, JSON_INDENT)}${LINE_SEPARATOR}`);
  } else if (!arrayIncludes(argv, METRIC_FLAG)) {
    for (const entry of bindings.modelWitnessed) {
      process.stdout.write(`${MODEL_WITNESSED_MARK} ${entry.owner} ${entry.id} -> ` +
        `${entry.witness.kind} ${entry.witness.name} in ${entry.witness.model}${LINE_SEPARATOR}`);
    }
    for (const entry of bindings.unbound) {
      process.stdout.write(
        `${UNBOUND_MARK} ${entry.owner} ${entry.id} -> ${entry.contractRef}${LINE_SEPARATOR}`);
    }
    for (const problem of bindings.problems) {
      process.stdout.write(`${PROBLEM_MARK} ${problem}${LINE_SEPARATOR}`);
    }
    process.stdout.write(`${COUNTS_PREFIX}${bindings.bound.length}` +
      `${MODEL_WITNESSED_COUNT_PREFIX}${bindings.modelWitnessed.length}` +
      `${UNBOUND_COUNT_PREFIX}${unbound}${LINE_SEPARATOR}`);
  }
  process.stdout.write(`${unbound}${LINE_SEPARATOR}`);
  return unbound === 0 && problems === 0 ? EXIT_OK : EXIT_UNBOUND;
}

const isMainModule = process.argv[1] &&
  import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href;

if (isMainModule) {
  process.exitCode = await main(process.argv.slice(ARGV_OFFSET));
}
