// Execution-closure admission falsifiers (test-only).
//
// The runner owns the final execution-budget admission, the timeout-declaration
// extraction owner owns runtime classification and declaration interpretation,
// and the import-graph producer owns reachability. These falsifiers pin what
// an admission decision must do when a test file's budget lives ACROSS its
// import closure, not only in the entry file's own source:
//
//   B1  two imported modules each register a top-level 40s tap test; under a
//       60s watchdog the 80s requirement must be refused, never admitted at
//       tap's 30s default.
//   B2  two import paths reach the same module; its declarations count once
//       per process, not once per import edge.
//   B3  an indirect chain through another .test.js file retains the complete
//       runtime closure.
//   B4  a proven pure node:test wrapper is never subjected to TAP admission.
//   B5  an absent or stale execution profile must not produce an ordinary
//       green verdict from an incomplete budget.
//   B6  an explicit whitespace-only TAP_TIMEOUT must not bypass the canonical
//       validation tap itself applies.
//   B7  TAP-specific declaration extraction problems must not refuse a proven
//       pure node:test consumer.
//
// Every assertion uses only existing runner result contracts
// (runTestFiles, BUDGET_UNFIT/TAP_TIMEOUT_INVALID failure codes, the
// exported TAP_TIMEOUT the child observes, status 'not_started'). No new
// symbols are demanded. Fixtures live beneath the gitignored test-output/
// tree, exactly like runner-budget-admission.test.js.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {after, afterEach, before, describe, it} from 'node:test';
import {runTestFiles} from '../../scripts/run-test-files.js';

const DEFAULT_WATCHDOG_MS = 600000;
const CLOSURE_WATCHDOG_MS = 60000;
const CLOSURE_MARGIN_SECONDS = 54;
const TAP_HELPER = JSON.stringify('../../src/test-helpers/tap.js');

// Keep ambient lane/host budget policy out of every case, unchanged from the
// frozen falsifiers.
const AMBIENT_BUDGET_KEYS = Object.freeze([
  'TAP_TIMEOUT',
  'TAP_TIMEOUT_FLOOR',
  'LAGRANGE_TEST_MACHINE_FACTOR',
]);

// The graphs the runner consults for closure profiles. B5 borrows their
// absence: the files are only ever hidden for the duration of one case and
// restored in a finally block.
const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '../..');
const GRAPH_DIRECTORY = path.join(REPOSITORY_ROOT,
  'test-output/analysis');
const GRAPH_FILE =
  path.join(GRAPH_DIRECTORY, 'global-owner-debt-import-graph.json');

const MODULE_A_BODY =
  `import {test} from ${TAP_HELPER};\n` +
  'test(\'module a declares 40s\', {timeout: 40000}, async () => {});\n';
const MODULE_B_BODY =
  `import {test} from ${TAP_HELPER};\n` +
  'test(\'module b declares 40s\', {timeout: 40000}, async () => {});\n';

describe('execution closure admission', () => {
  const ambientBudgetValues = {};
  const temporaryDirectories = [];

  before(() => {
    fs.mkdirSync(path.join(REPOSITORY_ROOT, 'test-output'),
      {recursive: true});
    for (const key of AMBIENT_BUDGET_KEYS) {
      ambientBudgetValues[key] = process.env[key];
      delete process.env[key];
    }
  });

  after(() => {
    for (const key of AMBIENT_BUDGET_KEYS) {
      if (ambientBudgetValues[key] === undefined) delete process.env[key];
      else process.env[key] = ambientBudgetValues[key];
    }
  });

  afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {recursive: true, force: true})));
  });

  async function makeClosureDirectory() {
    const directory = await mkdtemp(path.join('test-output',
      'execution-closure-'));
    temporaryDirectories.push(directory);
    fs.writeFileSync(path.join(directory, 'module-a.mjs'), MODULE_A_BODY);
    fs.writeFileSync(path.join(directory, 'module-b.mjs'), MODULE_B_BODY);
    return directory;
  }

  async function admit(file, options = {}) {
    const resultsDirectory = await mkdtemp(path.join(tmpdir(), 'closure-'));
    temporaryDirectories.push(resultsDirectory);
    const summary = await runTestFiles([file], {
      jobs: 1, print: false, resultsDirectory, ...options,
    });
    const result = summary.results?.[0];
    return {summary, result,
      reasons: JSON.stringify(result?.reasons ?? [])};
  }

  it('B1 refuses an entrypoint whose import closure needs 80s under a 60s watchdog, before it starts', async () => {
    const directory = await makeClosureDirectory();
    const ranMarker = path.join(directory, 'ran.marker');
    const entry = path.join(directory, 'b1-entry.mjs');
    fs.writeFileSync(entry,
      'import fs from \'node:fs\';\n' +
      'import \'./module-a.mjs\';\nimport \'./module-b.mjs\';\n' +
      `import {test} from ${TAP_HELPER};\n` +
      'test(\'b1 entry body\', async () => {\n' +
      `  fs.writeFileSync(${JSON.stringify(ranMarker)}, 'ran');\n});\n`);
    const admitted = await admit(entry, {timeoutMs: CLOSURE_WATCHDOG_MS});
    assert.equal(admitted.result?.failureCode, 'BUDGET_UNFIT',
      `the complete closure requirement is refused, typed: ${admitted.reasons}`);
    assert.equal(admitted.result?.status, 'not_started',
      `a refused closure never starts a process: ${admitted.reasons}`);
    assert.equal(admitted.result?.requestedRootSeconds, 80,
      `the 40s+40s closure requirement, not the 30s default: ${admitted.reasons}`);
    assert.equal(admitted.result?.marginSeconds, CLOSURE_MARGIN_SECONDS);
    assert.equal(admitted.summary.ok, false,
      `admitting the entrypoint at tap's 30s default would silently cap its callers: ${admitted.reasons}`);
    assert.equal(fs.existsSync(ranMarker), false,
      'the entry body must never execute under the refusal');
  });

  it('B2 counts declarations once per process for a module two import paths reach, not once per import edge', async () => {
    const directory = await makeClosureDirectory();
    const observedFile = path.join(directory, 'observed.txt');
    fs.writeFileSync(path.join(directory, 'diamond-shared.mjs'),
      MODULE_A_BODY.replace('module a declares 40s', 'diamond shared declares 40s'));
    fs.writeFileSync(path.join(directory, 'diamond-a.mjs'),
      'import \'./diamond-shared.mjs\';\n');
    fs.writeFileSync(path.join(directory, 'diamond-b.mjs'),
      'import \'./diamond-shared.mjs\';\n');
    const entry = path.join(directory, 'b2-entry.mjs');
    fs.writeFileSync(entry,
      'import fs from \'node:fs\';\n' +
      'import \'./diamond-a.mjs\';\nimport \'./diamond-b.mjs\';\n' +
      `import {test} from ${TAP_HELPER};\n` +
      'test(\'b2 entry body\', async () => {\n' +
      `  fs.writeFileSync(${JSON.stringify(observedFile)},\n` +
      '    process.env.TAP_TIMEOUT ?? \'unexported\');\n});\n');
    const admitted = await admit(entry, {timeoutMs: DEFAULT_WATCHDOG_MS});
    assert.equal(admitted.summary.ok, true,
      `a complete 40s closure fits the default watchdog: ${admitted.reasons}`);
    assert.ok(fs.existsSync(observedFile), `the diamond entry ran: ${admitted.reasons}`);
    const observed = fs.readFileSync(observedFile, 'utf8').trim();
    assert.equal(observed, '40',
      'the shared module is aggregated once (40, never 80 from two edges, ' +
      `never the 30s default): observed ${observed}`);
  });

  it('B3 retains the complete runtime closure through an indirect chain that passes another .test.js file', async () => {
    const directory = await makeClosureDirectory();
    const observedFile = path.join(directory, 'observed.txt');
    fs.writeFileSync(path.join(directory, 'chain-through.test.js'),
      'import \'./module-a.mjs\';\n');
    const entry = path.join(directory, 'b3-entry.mjs');
    fs.writeFileSync(entry,
      'import fs from \'node:fs\';\n' +
      'import \'./chain-through.test.js\';\nimport \'./module-b.mjs\';\n' +
      `import {test} from ${TAP_HELPER};\n` +
      'test(\'b3 entry body\', async () => {\n' +
      `  fs.writeFileSync(${JSON.stringify(observedFile)},\n` +
      '    process.env.TAP_TIMEOUT ?? \'unexported\');\n});\n');
    const admitted = await admit(entry, {timeoutMs: CLOSURE_WATCHDOG_MS});
    assert.equal(admitted.result?.failureCode, 'BUDGET_UNFIT',
      `40s through the .test.js hop plus 40s direct is the complete 80s closure: ${admitted.reasons}`);
    assert.equal(admitted.result?.requestedRootSeconds, 80,
      `nothing is truncated at the .test.js boundary: ${admitted.reasons}`);
    assert.equal(admitted.result?.marginSeconds, CLOSURE_MARGIN_SECONDS);
    assert.equal(admitted.summary.ok, false);
    const controlDirectory = await makeClosureDirectory();
    const controlObserved = path.join(controlDirectory, 'observed.txt');
    const control = path.join(controlDirectory, 'b3-control.mjs');
    fs.writeFileSync(control,
      'import fs from \'node:fs\';\n' +
      'import \'./chain-through.test.js\';\n' +
      `import {test} from ${TAP_HELPER};\n` +
      'test(\'b3 control body\', async () => {\n' +
      `  fs.writeFileSync(${JSON.stringify(controlObserved)},\n` +
      '    process.env.TAP_TIMEOUT ?? \'unexported\');\n});\n');
    const controlAdmitted = await admit(control, {timeoutMs: DEFAULT_WATCHDOG_MS});
    assert.equal(controlAdmitted.summary.ok, true,
      `the chain through a .test.js file is preserved, not dropped: ${controlAdmitted.reasons}`);
    assert.equal(fs.readFileSync(controlObserved, 'utf8').trim(), '40',
      'a declaration reachable only through another .test.js file still counts');
  });

  it('B4 keeps a proven pure node:test wrapper outside TAP-specific budget admission', async () => {
    const directory = await makeClosureDirectory();
    const ranMarker = path.join(directory, 'ran.marker');
    fs.writeFileSync(path.join(directory, 'node-helper.mjs'),
      'import test from \'node:test\';\n' +
      'export const wrap = (name, options, body) => test(name, options, body);\n');
    const entry = path.join(directory, 'b4-entry.mjs');
    fs.writeFileSync(entry,
      'import fs from \'node:fs\';\n' +
      'import {wrap} from \'./node-helper.mjs\';\n' +
      'wrap(\'b4 node wrapper\', {timeout: 600000}, async () => {\n' +
      `  fs.writeFileSync(${JSON.stringify(ranMarker)}, 'ran');\n});\n`);
    const admitted = await admit(entry, {timeoutMs: 20000});
    assert.equal(admitted.summary.ok, true,
      `node:test wrappers never receive TAP admission, however small the watchdog: ${admitted.reasons}`);
    assert.doesNotMatch(admitted.reasons, /BUDGET_UNFIT|TAP_TIMEOUT_INVALID/,
      `no TAP-specific refusal reaches a pure node:test closure: ${admitted.reasons}`);
    assert.equal(fs.existsSync(ranMarker), true, 'the wrapper body ran');
  });

  it('B5 refuses rather than going green when no complete execution profile can be proven for the closure, and again when a profile module has since changed', async () => {
    const directory = await makeClosureDirectory();
    const entry = path.join(directory, 'b5-entry.mjs');
    // Declares nothing itself; whatever budget it has lives across the
    // import closure, so an entrypoint-only budget is provably incomplete.
    fs.writeFileSync(entry,
      'import \'./module-a.mjs\';\nimport \'./module-b.mjs\';\n' +
      `import {test} from ${TAP_HELPER};\n` +
      'test(\'b5 entry body\', async () => {});\n');
    assert.ok(!fs.existsSync(`${GRAPH_FILE}.assignment4e-borrowed`),
      'a previous B5 run left the repository graph misplaced');
    const graphWasPresent = fs.existsSync(GRAPH_FILE);
    const borrowedGraph = `${GRAPH_FILE}.assignment4e-borrowed`;
    try {
      // Where the graph exists it is borrowed away for exactly one decision;
      // where it does not exist (fresh checkout, CI) it is already absent and
      // the case observes the same contract without touching any file.
      if (graphWasPresent) fs.renameSync(GRAPH_FILE, borrowedGraph);
      const absent = await admit(entry, {timeoutMs: DEFAULT_WATCHDOG_MS});
      assert.equal(absent.summary.ok, false,
        `an entrypoint-only budget may not claim success when the profile is absent: ${absent.reasons}`);
      assert.equal(absent.result?.status, 'not_started',
        `an unprovable profile refuses before execution: ${absent.reasons}`);
      assert.ok(absent.result?.failureCode !== undefined,
        `the refusal is typed, never an ordinary green verdict: ${absent.reasons}`);
    } finally {
      if (fs.existsSync(borrowedGraph)) {
        fs.renameSync(borrowedGraph, GRAPH_FILE);
      }
    }
    // Stale: only observable where a profile was produced for an earlier
    // state of this closure. The changed sibling makes the budget the
    // entrypoint would be admitted under unprovable, so the run must not go
    // green on it either.
    if (graphWasPresent) {
      fs.appendFileSync(path.join(directory, 'module-b.mjs'),
        '// the closure has changed since the profile was produced\n');
      const stale = await admit(entry, {timeoutMs: DEFAULT_WATCHDOG_MS});
      assert.equal(stale.summary.ok, false,
        `a stale profile may not produce an ordinary green verdict: ${stale.reasons}`);
      assert.ok(stale.result?.failureCode !== undefined,
        `staleness is typed at admission, never absorbed: ${stale.reasons}`);
    }
  });

  it('B6 refuses an explicit whitespace-only TAP_TIMEOUT instead of silently bypassing canonical validation', async () => {
    const directory = await makeClosureDirectory();
    const entry = path.join(directory, 'b6-entry.mjs');
    fs.writeFileSync(entry,
      `import {test} from ${TAP_HELPER};\n` +
      'test(\'b6 entry body\', async () => {});\n');
    const admitted = await admit(entry,
      {env: {TAP_TIMEOUT: '   '}, timeoutMs: DEFAULT_WATCHDOG_MS});
    assert.equal(admitted.result?.failureCode, 'TAP_TIMEOUT_INVALID',
      `whitespace is a value Number() consumes, so the canonical grammar refuses it: ${admitted.reasons}`);
    assert.equal(admitted.result?.status, 'not_started',
      `a bypassed value never starts the file: ${admitted.reasons}`);
    assert.equal(admitted.summary.ok, false);
  });

  it('B7 lets a proven pure node:test consumer run even when its own declarations are ones only the TAP extractor could object to', async () => {
    const directory = await makeClosureDirectory();
    const ranMarker = path.join(directory, 'ran.marker');
    const entry = path.join(directory, 'b7-entry.mjs');
    fs.writeFileSync(entry,
      'import fs from \'node:fs\';\n' +
      'import {test} from \'node:test\';\n' +
      'const options = {timeout: 600000};\n' +
      'test(\'b7 node consumer\', {...options}, async () => {\n' +
      `  fs.writeFileSync(${JSON.stringify(ranMarker)}, 'ran');\n});\n`);
    const admitted = await admit(entry, {timeoutMs: DEFAULT_WATCHDOG_MS});
    assert.equal(admitted.summary.ok, true,
      `a pure node:test consumer is not TAP-declaration-controlled: ${admitted.reasons}`);
    assert.doesNotMatch(admitted.reasons, /timeout declaration|could not be parsed/,
      `TAP extraction problems must not refuse this consumer: ${admitted.reasons}`);
    assert.equal(fs.existsSync(ranMarker), true, 'the node:test body ran');
  });
});
