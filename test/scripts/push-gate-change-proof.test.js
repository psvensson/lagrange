// The push gate's test stage decides between the change proof and the whole
// corpus as a pure function of the plan, and the gate is wired to that
// decision: the post-push manifest ends in it, the hook feeds it the remote
// base, and the corpus ratchets no longer materialise a second worktree.

import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

import {
  FULL_CORPUS_SHARE,
  FULL_CORPUS_TRIGGER_RULES,
  PROOF_MODE,
  PUSH_FULL_CORPUS_ENV,
  RANGE_SOURCE,
  REFUSAL_UNKNOWN_SCOPE,
  SELECTION_PRECISE,
  SELECTION_REFUSED,
  SELECTION_WIDENED,
} from '../../scripts/checks/change-selection-constants.js';
import {
  decidePushProof,
  fullCorpusTriggers,
  recordCorpusProof,
  runDecision,
} from '../../scripts/checks/push-gate-change-proof.js';
import {
  OBSERVATION_KIND_FILE,
  SUBSYSTEM_MANIFEST_PATH,
} from '../../scripts/checks/test-subsystem-classification-constants.js';
import {loadSealedImporters} from '../../scripts/checks/helper-import-closure.js';
import {CORPUS_FULL_PROOF} from '../../scripts/proof-authority.js';
import {buildExecutionPlan} from '../../scripts/select-change-tests.js';

const UTF8 = 'utf8';
const CORPUS_SIZE = 2000;
const SPINE_COUNT = 29;
const CHANGE_PROOF_SCRIPT = 'scripts/checks/push-gate-change-proof.js';
const POSTPUSH_MANIFEST =
  'test/manifests/project-hardening-proof-postpush-manifest.json';
const PRE_PUSH_HOOK = '.githooks/pre-push';
const ORDINARY_SOURCE = 'src/raft/log.js';
const ENV_UNSET = Object.freeze({});
// One real file per trigger rule, so a rule can never match nothing.
const TRIGGERING_FILES = Object.freeze([
  'test/shards/safety-spine.json',
  'test/shards/impact-contracts.json',
  'test/manifests/project-hardening-proof-postpush-manifest.json',
  'scripts/run-test-files.js',
  'scripts/run-classified-test-files.js',
  'scripts/lab/probe.js',
  'scripts/lab/process.js',
  'scripts/lab/state.js',
  'scripts/plan-test-lane.js',
  'scripts/select-change-tests.js',
  'scripts/check-subsystem.js',
  'scripts/checks/wait-for-load-headroom.js',
  'scripts/checks/change-selection.js',
  'scripts/checks/change-selection-constants.js',
  'scripts/checks/changed-paths.js',
  'scripts/checks/change-proof-string-collections.js',
  'scripts/checks/helper-import-closure.js',
  'scripts/checks/push-gate-change-proof.js',
  'scripts/checks/test-primary-classification.js',
  'scripts/checks/impact-proof-cone-constants.js',
  'scripts/checks/test-timeout-declarations.js',
  'scripts/generate-test-subsystem-classes.js',
  'scripts/run-project-hardening-acceptance.js',
  'scripts/checks/acceptance-proof-manifest-runner.js',
  '.githooks/pre-push',
  '.taprc',
]);
// Generated state travels with ordinary changes: the seal with every JS edit,
// the census manifests with every changed test. Neither may trip the corpus.
const ORDINARY_FILES = Object.freeze([
  ORDINARY_SOURCE,
  'test/shards/impact-graph-seal.json',
  'test/shards/subsystem-classes.json',
  'test/shards/primary-classes.json',
  'test/shards/resource-classes.json',
  'test/shards/impact-coverage.json',
  // The selector owns package semantics; the gate carries no second authority.
  'package.json',
  'package-lock.json',
  'test/raft/log.test.js',
  'scripts/checks/release-preflight.js',
  'scripts/solve.js',
  'docs/development/solver-runbook.md',
  'test/bootstrap/api-fixtures.js',
]);

function planOf(overrides = {}) {
  const selectedCount = 271;
  const tests = [];
  for (let index = 0; index < SPINE_COUNT + selectedCount; index += 1) {
    tests.push({path: `test/x/${index}.test.js`, reasons: ['r']});
  }
  return {
    kind: SELECTION_WIDENED,
    refusalCode: null,
    refusals: [],
    changedPaths: [ORDINARY_SOURCE],
    spineCount: SPINE_COUNT,
    selectedCount,
    tests,
    ...overrides,
  };
}

function decide(overrides = {}, env = ENV_UNSET,
  rangeSource = RANGE_SOURCE.ENVIRONMENT) {
  return decidePushProof({
    plan: planOf(overrides), corpusSize: CORPUS_SIZE, rangeSource, env,
  });
}

test('an ordinary source change runs the change proof', () => {
  assert.deepEqual(decide(), {mode: PROOF_MODE.CHANGE_PROOF, reasons: []});
  assert.equal(decide({kind: SELECTION_PRECISE, changedPaths: ['docs/x.md']})
    .mode, PROOF_MODE.CHANGE_PROOF);
});

test('the operator can ask for the whole corpus', () => {
  const decision = decide({}, {[PUSH_FULL_CORPUS_ENV]: '1'});
  assert.equal(decision.mode, PROOF_MODE.FULL_CORPUS);
  assert.match(decision.reasons[0], new RegExp(PUSH_FULL_CORPUS_ENV));
});

test('a refused selection runs the whole corpus, never nothing', () => {
  const decision = decide({
    kind: SELECTION_REFUSED, refusalCode: REFUSAL_UNKNOWN_SCOPE,
    refusals: ['SAFE TEST SCOPE UNKNOWN'], selectedCount: 0,
  });
  assert.equal(decision.mode, PROOF_MODE.FULL_CORPUS);
  assert.deepEqual(decision.reasons,
    [`selection refused: ${REFUSAL_UNKNOWN_SCOPE}`]);
});

test('a change to the selection machinery, runner, curated state or hook runs the whole corpus', () => {
  for (const file of TRIGGERING_FILES) {
    assert.ok(fs.existsSync(file), `${file} is a real file`);
    assert.equal(fullCorpusTriggers([file]).length, 1,
      `${file} triggers exactly one rule`);
    assert.equal(decide({changedPaths: [ORDINARY_SOURCE, file]}).mode,
      PROOF_MODE.FULL_CORPUS);
  }
  for (const file of ORDINARY_FILES) {
    assert.deepEqual(fullCorpusTriggers([file]), [], `${file} is ordinary`);
  }
  const hitRules = new Set(fullCorpusTriggers([...TRIGGERING_FILES])
    .map((reason) => reason.split(':')[0]));
  for (const rule of FULL_CORPUS_TRIGGER_RULES) {
    assert.ok(hitRules.has(`changed ${rule.id}`),
      `rule ${rule.id} matches a real file`);
  }
});

test('a cone above half the corpus runs the whole corpus', () => {
  const limit = CORPUS_SIZE * FULL_CORPUS_SHARE;
  const large = planOf().tests.slice(0, 1);
  while (large.length <= limit) large.push({path: `t${large.length}`, reasons: ['r']});
  const decision = decide({tests: large, selectedCount: large.length - SPINE_COUNT});
  assert.equal(decision.mode, PROOF_MODE.FULL_CORPUS);
  assert.match(decision.reasons[0], /cone is 1001 of 2000/u);
  assert.equal(decide({tests: large.slice(0, limit)}).mode,
    PROOF_MODE.CHANGE_PROOF, 'exactly half is still a saving');
});

test('a proof range that is only the working tree runs the whole corpus', () => {
  assert.equal(decide({}, ENV_UNSET, RANGE_SOURCE.WORKTREE).mode,
    PROOF_MODE.FULL_CORPUS);
  assert.equal(decide({}, ENV_UNSET, RANGE_SOURCE.PUBLICATION).mode,
    PROOF_MODE.CHANGE_PROOF);
});

test('the gate is wired to the decision', () => {
  const manifest = JSON.parse(fs.readFileSync(POSTPUSH_MANIFEST, UTF8));
  const last = manifest.commands[manifest.commands.length - 1];
  assert.equal(last.executable, 'node');
  assert.deepEqual(last.argv, [CHANGE_PROOF_SCRIPT],
    'the post-push manifest ends in the change proof');
  for (const command of manifest.commands) {
    for (const argument of command.argv) {
      assert.doesNotMatch(argument, /^test:(fast|all)$/u,
        `${command.id} must not run a corpus script unconditionally`);
    }
  }
  const hook = fs.readFileSync(PRE_PUSH_HOOK, UTF8);
  assert.match(hook, /export LAGRANGE_CHECK_BASE="\$\{MAIN_REMOTE_SHA\}"/u,
    'the hook feeds the remote sha of main as the proof base');
  assert.match(hook, /push-gate-corpus-worktree\.js --in-place/u,
    'inside the exact-HEAD worktree the ratchets run in place');
  assert.match(hook, /test:gate:postpush/u);
});

test('the stage explains its decision without running a test', () => {
  const result = spawnSync(process.execPath, [CHANGE_PROOF_SCRIPT, '--explain'],
    {encoding: UTF8, env: {...process.env, LAGRANGE_CHECK_BASE: 'HEAD'}});
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /proof range: HEAD \(environment\)/u);
  assert.match(result.stdout, /test stage: (change-proof|full-corpus)/u);
});

// The gate must not be proved by the thing a change altered: every repository
// module the gate's entry points import, transitively, must trip a full-corpus
// trigger. Derived from the sealed import graph - the selector's own authority
// on who imports whom, dynamic imports included - so the trigger list cannot
// drift away from the gate's real closure.
const GATE_ENTRY_POINTS = Object.freeze([
  'scripts/checks/push-gate-change-proof.js',
  'scripts/select-change-tests.js',
  'scripts/run-classified-test-files.js',
  'scripts/run-test-files.js',
  'scripts/plan-test-lane.js',
  'scripts/check-subsystem.js',
  'scripts/generate-test-primary-classes.js',
  'scripts/generate-test-resource-classes.js',
  'scripts/generate-test-subsystem-classes.js',
  // The scheduler that launches the proof and hands it its environment.
  'scripts/run-project-hardening-acceptance.js',
  'scripts/checks/acceptance-proof-manifest-runner.js',
]);
let sealedImports = null;

// importer -> the modules it imports, inverted from the sealed importer map.
function sealedImportsOf(module) {
  if (sealedImports === null) {
    const sealed = loadSealedImporters(process.cwd());
    assert.ok(sealed.ok, `the sealed import graph: ${sealed.problem}`);
    sealedImports = new Map();
    for (const [imported, importers] of Object.entries(sealed.importers)) {
      for (const importer of importers) {
        sealedImports.set(importer,
          [...(sealedImports.get(importer) ?? []), imported]);
      }
    }
  }
  return sealedImports.get(module) ?? [];
}

// Repository modules only: builtins and node_modules are not the gate's code.
function gateImportClosure(entryPoints = GATE_ENTRY_POINTS) {
  const tracked = new Set(trackedFiles());
  const closure = new Set();
  const frontier = [...entryPoints];
  while (frontier.length > 0) {
    const current = frontier.pop();
    if (closure.has(current) || !tracked.has(current)) continue;
    closure.add(current);
    frontier.push(...sealedImportsOf(current));
  }
  return [...closure].sort();
}

test('every module in the gate\'s own import closure trips a full-corpus trigger', () => {
  const closure = gateImportClosure();
  assert.ok(closure.length > GATE_ENTRY_POINTS.length,
    'the closure reaches beyond the entry points');
  const untriggered = closure.filter((file) =>
    fullCorpusTriggers([file]).length === 0);
  assert.deepEqual(untriggered, [],
    'a change here would select, schedule or execute its own proof');
});

// A trigger directory also holds files the gate never reads. The directory
// rules stay fail-closed - any file under them, a new one included, runs the
// whole corpus - except a file its rule exempts BY NAME. An exemption holds
// only while nothing the gate runs names or opens the file and a test observes
// it by name, so the file's own cone carries its proof. The incident: a commit
// to pre-push-stages.json ran the corpus (~40 minutes) although its 179-test
// cone already held both tests that observe it.
const INCIDENT_FILE = 'test/manifests/pre-push-stages.json';
// The module that declares the exemptions, and the export that carries them.
const EXEMPTION_DECLARATION = 'scripts/checks/change-selection-constants.js';
const EXEMPTION_MAP_EXPORT = 'FULL_CORPUS_TRIGGER_RULES';
const GATE_DEFINERS = Object.freeze([
  POSTPUSH_MANIFEST,
  'test/manifests/proof-obligations.json',
  'test/shards/safety-spine.json',
  'test/shards/impact-contracts.json',
  PRE_PUSH_HOOK,
]);
const UNLISTED_FILES = Object.freeze([
  'test/manifests/unlisted-gate-manifest.json',
  '.githooks/post-merge',
]);
const SCRIPT_MENTION_PATTERN = /scripts\/[\w./-]+?\.[cm]?js\b/gu;
const NPM_RUN_PATTERN = /npm run(?: -s)? ([\w:.-]+)/gu;
const PACKAGE_SCRIPT_REASON_PATTERN = /the ([\w:.-]+) package script/gu;
const NAMED_IMPORT_PATTERN = /\bimport\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/gu;
const JS_FILE_PATTERN = /\.[cm]?js$/u;
const JSON_FILE_PATTERN = /\.json$/u;
const TEST_FILE_PATTERN = /\.test\.js$/u;
const JS_COMMENT_LINE = /^\s*(?:\/\/|\/?\*)/u;
const SHELL_COMMENT_LINE = /^\s*#/u;
const NPM_EXECUTABLE = 'npm';
const PACKAGE_JSON = 'package.json';
// Where code that could consume a repository file lives; tests observe, they
// do not consume.
const CONSUMER_ROOTS = Object.freeze(['scripts', 'src', '.github', '.githooks',
  PACKAGE_JSON]);
const GIT_GREP_NO_MATCH = 1;
const WITNESS_FILE = path.relative(process.cwd(), fileURLToPath(import.meta.url))
  .split(path.sep).join(path.posix.sep);
const EXEMPTIONS = Object.freeze(FULL_CORPUS_TRIGGER_RULES.flatMap((rule) =>
  Object.entries(rule.exempt ?? {}).map(([file, reason]) =>
    ({rule, file, reason}))));
const EXEMPT_FILES = Object.freeze(EXEMPTIONS.map(({file}) => file));

function trackedFiles() {
  const result = spawnSync('git', ['ls-files', '-z'], {encoding: UTF8});
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.split('\0').filter(Boolean);
}

// The declaration carries each exempted path and its reason as DATA: both
// literals are taken out before the census reads the module as code, so a
// reason may name any reader without being followed as one. Each literal must
// occur exactly as often as the map holds it - a reformatted map turns the
// census red rather than hiding a reader behind the subtraction.
function withoutExemptionMap(text) {
  const expected = new Map();
  for (const {file, reason} of EXEMPTIONS) {
    for (const literal of [file, reason]) {
      expected.set(literal, (expected.get(literal) ?? 0) + 1);
    }
  }
  let rest = text;
  for (const [literal, count] of expected) {
    const quoted = `'${literal}'`;
    assert.equal(rest.split(quoted).length - 1, count,
      `${EXEMPTION_DECLARATION} declares '${literal}' ${count} time(s)`);
    rest = rest.replaceAll(quoted, '');
  }
  return rest;
}

// Code only: a comment that names a file reads nothing.
function codeOf(file, text) {
  if (JSON_FILE_PATTERN.test(file)) return text;
  const comment = JS_FILE_PATTERN.test(file) ? JS_COMMENT_LINE :
    SHELL_COMMENT_LINE;
  const code = text.split('\n').filter((line) => !comment.test(line))
    .join('\n');
  return file === EXEMPTION_DECLARATION ? withoutExemptionMap(code) : code;
}

function codeText(file) {
  return codeOf(file, fs.readFileSync(file, UTF8));
}

// The package scripts an acceptance manifest runs through npm.
function manifestNpmRuns(file, text, packageScripts) {
  if (!JSON_FILE_PATTERN.test(file)) return [];
  const commands = JSON.parse(text).commands;
  if (!Array.isArray(commands)) return [];
  return commands.filter((command) => command.executable === NPM_EXECUTABLE)
    .flatMap((command) => command.argv.filter((argument) =>
      Object.hasOwn(packageScripts, argument)));
}

function packageScripts() {
  return JSON.parse(fs.readFileSync(PACKAGE_JSON, UTF8)).scripts;
}

// Everything the push gate reads as code, keyed by reader: every tracked file
// that trips a trigger (the rules' own account of what selects, schedules or
// executes the proof), the package scripts the hook and the manifests run
// (through `npm run`, transitively), and every module the scripts they name
// import. JavaScript runs npm through an argv array, so an `npm run` inside it
// is an operator hint (`run: npm run check:release`), not an execution.
function gateReadCode() {
  const scripts = packageScripts();
  const code = new Map();
  const entries = [];
  const runs = [];
  const follow = (text, runsNpm = true) => {
    for (const match of text.matchAll(SCRIPT_MENTION_PATTERN)) {
      entries.push(match[0]);
    }
    if (!runsNpm) return;
    for (const match of text.matchAll(NPM_RUN_PATTERN)) runs.push(match[1]);
  };
  for (const file of trackedFiles()) {
    if (fullCorpusTriggers([file]).length === 0) continue;
    const text = codeText(file);
    code.set(file, text);
    follow(text, !JS_FILE_PATTERN.test(file));
    runs.push(...manifestNpmRuns(file, text, scripts));
    if (JS_FILE_PATTERN.test(file)) entries.push(file);
  }
  const ran = new Set();
  while (runs.length > 0) {
    const name = runs.pop();
    if (ran.has(name) || !Object.hasOwn(scripts, name)) continue;
    ran.add(name);
    code.set(`package.json scripts["${name}"]`, scripts[name]);
    follow(scripts[name]);
  }
  for (const file of gateImportClosure(entries)) {
    code.set(file, codeText(file));
  }
  return code;
}

// Every code file outside the tests that names this file (by basename, in code
// rather than a comment): what the exemption's reason must name, no more and
// no less.
function codeNaming(file) {
  const name = path.posix.basename(file);
  const result = spawnSync('git',
    ['grep', '-l', '-z', '-F', name, '--', ...CONSUMER_ROOTS], {encoding: UTF8});
  assert.ok(result.status === 0 || result.status === GIT_GREP_NO_MATCH,
    result.stderr);
  return result.stdout.split('\0').filter((reader) => reader !== '' &&
    reader !== file && codeText(reader).includes(name)).sort();
}

// The readers a reason names: script paths, and a package script by name
// (package.json, which must carry the file in that script's body).
function readersNamedBy(file, reason) {
  const scripts = packageScripts();
  const named = [...reason.matchAll(SCRIPT_MENTION_PATTERN)].map(([m]) => m);
  for (const [, script] of reason.matchAll(PACKAGE_SCRIPT_REASON_PATTERN)) {
    assert.ok(Object.hasOwn(scripts, script) &&
      scripts[script].includes(path.posix.basename(file)),
    `${file}: the ${script} package script names it`);
    named.push(PACKAGE_JSON);
  }
  return [...new Set(named)].sort();
}

function subsystemManifest() {
  return JSON.parse(fs.readFileSync(SUBSYSTEM_MANIFEST_PATH, UTF8));
}

// The tests that assert ABOUT the exemptions rather than observe the files:
// those importing the exemption map's export from its declaration (found
// through the sealed graph's importers, then by their import statement). Naming
// an exempted file there is a claim about the map, so it never counts as an
// observation - this witness is one of them.
function exemptionAsserters() {
  return (loadSealedImporters(process.cwd()).importers[EXEMPTION_DECLARATION] ??
    []).filter((importer) => TEST_FILE_PATTERN.test(importer) &&
    [...fs.readFileSync(importer, UTF8).matchAll(NAMED_IMPORT_PATTERN)].some(
      ([, names, specifier]) => path.posix.normalize(path.posix.join(
        path.posix.dirname(importer), specifier)) === EXEMPTION_DECLARATION &&
        names.split(',').map((name) => name.trim())
          .includes(EXEMPTION_MAP_EXPORT)))
    .sort();
}

// The tests that observe a file by name; a directory observation is not one,
// and neither is a test that names it only to assert about its exemption.
function namedObservers(file) {
  const {observations} = subsystemManifest();
  const asserters = new Set(exemptionAsserters());
  return Object.keys(observations).filter((testFile) =>
    !asserters.has(testFile) &&
    (observations[testFile][OBSERVATION_KIND_FILE] ?? []).includes(file))
    .sort();
}

// The gate's decision for a change to these files, on the real selection.
function realDecision(...files) {
  const plan = buildExecutionPlan({
    changedPaths: files, packageFields: [], lockfileGraphChanged: false,
  });
  return {
    plan,
    decision: decidePushProof({
      plan, corpusSize: corpusSizeNow(), rangeSource: RANGE_SOURCE.ENVIRONMENT,
      env: ENV_UNSET,
    }),
  };
}

function corpusSizeNow() {
  return Object.keys(subsystemManifest().classes).length;
}

// The proof path's file reads, traced at run time: a fresh process wraps fs
// BEFORE the selector and the change proof load, so a read at module load
// counts as much as one during the decision, and a path computed at run time
// is seen as the path it resolves to. A directory listing (a name walk) is
// kept apart from a content read: only a content read makes the decision
// depend on a file's bytes. One process runs every exempted file's real
// selection, so the cone and the trace come from the same run.
const TRACE_CONTENT_CALLS = Object.freeze(
  ['readFileSync', 'openSync', 'createReadStream', 'readFile', 'open']);
const TRACE_LISTING_CALLS = Object.freeze(
  ['readdirSync', 'opendirSync', 'readdir', 'opendir']);
const TRACE_LOAD_PHASE = 'module load';
const TRACE_SCRIPT = `
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
const input = JSON.parse(process.argv[1]);
const trace = {[input.loadPhase]: {content: [], listing: []}};
let phase = input.loadPhase;
const relative = (target) => typeof target === 'number' ? null :
  path.relative(process.cwd(), target instanceof URL ? fileURLToPath(target) :
    path.resolve(String(target))).split(path.sep).join('/');
const wrap = (owner, name, kind) => {
  const original = owner[name];
  if (typeof original !== 'function') return;
  owner[name] = function traced(target, ...rest) {
    const file = relative(target);
    if (file !== null) trace[phase][kind].push(file);
    return Reflect.apply(original, this, [target, ...rest]);
  };
};
for (const owner of [fs, fs.promises]) {
  for (const name of input.contentCalls) wrap(owner, name, 'content');
  for (const name of input.listingCalls) wrap(owner, name, 'listing');
}
syncBuiltinESMExports();
const {buildExecutionPlan} = await import(pathToFileURL(input.selector).href);
const {decidePushProof} = await import(pathToFileURL(input.proof).href);
const results = [];
for (const file of input.files) {
  phase = file;
  trace[file] = {content: [], listing: []};
  const plan = buildExecutionPlan(
    {changedPaths: [file], packageFields: [], lockfileGraphChanged: false});
  const decision = decidePushProof({plan, corpusSize: input.corpusSize,
    rangeSource: input.rangeSource, env: {}});
  results.push({file, decision, cone: plan.tests.map((entry) => entry.path)});
}
process.stdout.write(JSON.stringify({results, trace}));
`;
let tracedSelections = null;

function exemptSelections() {
  if (tracedSelections !== null) return tracedSelections;
  const result = spawnSync(process.execPath,
    ['--input-type=module', '-e', TRACE_SCRIPT, JSON.stringify({
      files: EXEMPT_FILES, selector: 'scripts/select-change-tests.js',
      proof: CHANGE_PROOF_SCRIPT, corpusSize: corpusSizeNow(),
      rangeSource: RANGE_SOURCE.ENVIRONMENT, loadPhase: TRACE_LOAD_PHASE,
      contentCalls: TRACE_CONTENT_CALLS, listingCalls: TRACE_LISTING_CALLS,
    })], {encoding: UTF8, maxBuffer: 64 * 1024 * 1024});
  assert.equal(result.status, 0, result.stderr);
  tracedSelections = JSON.parse(result.stdout);
  return tracedSelections;
}

test('a change to a file the gate never reads runs the change proof, its observers in the cone', () => {
  assert.ok(EXEMPT_FILES.includes(INCIDENT_FILE), 'the incident file is exempted');
  const {results} = exemptSelections();
  assert.deepEqual(results.map(({file}) => file), EXEMPT_FILES,
    'every exempted file is selected');
  for (const {file, decision, cone} of results) {
    assert.deepEqual(decision, {mode: PROOF_MODE.CHANGE_PROOF, reasons: []},
      `${file} is proved by its cone`);
    const selected = new Set(cone);
    for (const observer of namedObservers(file)) {
      assert.ok(selected.has(observer), `${file}: ${observer} is in its cone`);
    }
  }
});

test('a change to a gate definer or an unexempted file under a trigger directory runs the whole corpus', () => {
  const exemptingRules = FULL_CORPUS_TRIGGER_RULES.filter((rule) =>
    rule.exempt !== undefined);
  const underExemptingRules = trackedFiles().filter((file) =>
    exemptingRules.some((rule) => rule.pattern.test(file)) &&
    !EXEMPT_FILES.includes(file));
  const files = [...new Set([...GATE_DEFINERS, ...UNLISTED_FILES,
    ...underExemptingRules])];
  // One real selection over all of them: each must be named as a trigger.
  const {decision} = realDecision(...files);
  assert.equal(decision.mode, PROOF_MODE.FULL_CORPUS);
  for (const file of files) {
    assert.ok(!EXEMPT_FILES.includes(file), `${file} is never exempted`);
    assert.ok(decision.reasons.includes(`changed ${FULL_CORPUS_TRIGGER_RULES
      .find((rule) => rule.pattern.test(file)).id}: ${file}`),
    `${file} is named as the trigger`);
  }
});

test('an exemption holds only while nothing the gate runs names the file', () => {
  assert.ok(EXEMPT_FILES.includes(INCIDENT_FILE), 'the incident file is exempted');
  const code = gateReadCode();
  assert.ok(code.has(PRE_PUSH_HOOK) && code.has(CHANGE_PROOF_SCRIPT) &&
    code.has('scripts/checks/run-static-audits.js'),
  'the census reaches the hook, the change proof and what the gate runs');
  const {trace} = exemptSelections();
  const contentReads = Object.values(trace).flatMap(({content}) => content);
  assert.ok(contentReads.includes(SUBSYSTEM_MANIFEST_PATH),
    'the trace sees the selection read its census');
  for (const {rule, file, reason} of EXEMPTIONS) {
    assert.ok(fs.existsSync(file), `${file} is a real file`);
    assert.ok(rule.pattern.test(file), `${file} is under its own rule`);
    const readers = readersNamedBy(file, reason);
    assert.ok(readers.length > 0, `${file}: its reason names who reads it`);
    assert.deepEqual(readers, codeNaming(file),
      `${file}: its reason names exactly the code that names it`);
    const name = path.posix.basename(file);
    const gateReaders = [...code].filter(([reader, text]) => reader !== file &&
      text.includes(name)).map(([reader]) => reader);
    assert.deepEqual(gateReaders, [], `${file} is named by the gate`);
    const openedBy = Object.entries(trace).filter(([, {content}]) =>
      content.includes(file)).map(([phase]) => phase);
    assert.deepEqual(openedBy, [],
      `${file} is opened by the proof path (a listing is not a read)`);
  }
  assert.deepEqual(partialPathsUnderExemptingDirectories(code), [],
    'the gate names a path under an exempting directory the census cannot follow');
});

// A path the gate spells under an exempting directory must be a whole tracked
// file or a directory (a listing). Anything else - `test/manifests/x-$(...)`,
// a prefix completed at run time - is a name no census can follow, so it is
// refused rather than trusted.
function partialPathsUnderExemptingDirectories(code) {
  const tracked = trackedFiles();
  const known = new Set(tracked);
  for (const file of tracked) {
    const segments = file.split(path.posix.sep);
    for (let depth = 1; depth < segments.length; depth += 1) {
      known.add(segments.slice(0, depth).join(path.posix.sep));
    }
  }
  const directories = [...new Set(EXEMPT_FILES.map((file) =>
    path.posix.dirname(file)))].map((directory) =>
    directory.replaceAll(/[.*+?^${}()|[\]\\/]/gu, '\\$&'));
  const mention = new RegExp(`(?:${directories.join('|')})(?:/[\\w./-]*)?`, 'gu');
  const partial = [];
  for (const [reader, text] of code) {
    for (const [spelled] of text.matchAll(mention)) {
      if (!known.has(spelled.replace(/\/$/u, ''))) {
        partial.push(`${reader}: ${spelled}`);
      }
    }
  }
  return [...new Set(partial)].sort();
}

test('an exemption holds only while a test observes the file by name', () => {
  assert.ok(EXEMPT_FILES.includes(INCIDENT_FILE), 'the incident file is exempted');
  assert.ok(exemptionAsserters().includes(WITNESS_FILE),
    'this witness is known as an asserter, not an observer');
  for (const file of EXEMPT_FILES) {
    assert.ok(namedObservers(file).length > 0,
      `${file} has a test that observes it by name`);
  }
});

// A green whole-corpus run is a durable fact about that commit: the gate
// records it so the post-push canary can skip a corpus already proved for the
// same sha (before this, a gate that refused early cost a 74-minute re-proof).
// The authority is spawned, never imported, so the gate's import closure keeps
// tripping its own triggers.
const PROVED_SHA = 'c'.repeat(40);
const STATUS_ARGUMENTS = Object.freeze(['status', '--porcelain']);
const ANCESTOR_ARGUMENTS = Object.freeze(['merge-base', '--is-ancestor']);
// A tree that IS the commit: HEAD equals the sha, nothing modified. The spy
// records what it was asked, because the question matters: dropping
// --untracked-files=no is what makes a smuggled fixture block the receipt,
// and an unpinned flag list could regress silently (verifier round 3).
const provingTree = (sha, asked = []) => (command, args) => {
  asked.push(args);
  return args[0] === 'rev-parse' ? {status: 0, stdout: `${sha}\n`} :
    {status: 0, stdout: ''};
};

test('a green whole-corpus run records a receipt through the authority CLI', () => {
  const calls = [];
  const lines = [];
  const asked = [];
  const recorded = recordCorpusProof(PROVED_SHA, {
    git: provingTree(PROVED_SHA, asked),
    spawn: (command, args, options) => {
      calls.push({args, command, cwd: options.cwd});
      return {status: 0};
    },
    write: (value) => lines.push(value),
  });
  assert.equal(recorded, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, process.execPath);
  assert.deepEqual(calls[0].args, ['scripts/proof-authority.js', 'record',
    CORPUS_FULL_PROOF, PROVED_SHA],
  'the gate records the contract the authority owns, for this sha');
  assert.match(lines.join(''), /whole-corpus receipt for c{40}/u);
  // Untracked files are counted: a committed test whose fixture exists only in
  // the tree must not be able to mint a receipt for HEAD. And the commit must
  // already be on origin/main, or the receipt's own push would re-enter the
  // gate (proof-ref-push-fast-path).
  assert.deepEqual(asked, [
    ['rev-parse', 'HEAD'],
    [...STATUS_ARGUMENTS],
    [...ANCESTOR_ARGUMENTS, PROVED_SHA, 'origin/main'],
  ], 'HEAD, a porcelain status counting untracked files, then published-ness');
});

// Inside the gate the pushed sha is not on origin/main yet, so recording
// there would push a receipt ref that the fast path cannot exempt: it would
// re-enter the gate and hang until the 60 s bound killed it, which is why no
// receipt was ever written before this quest. The gate defers; the publisher
// records after the push it verified.
test('an unpublished commit defers its receipt to the publisher', () => {
  const lines = [];
  const asked = [];
  assert.equal(recordCorpusProof(PROVED_SHA, {
    git: (command, args) => {
      asked.push(args);
      if (args[0] === 'rev-parse') return {status: 0, stdout: `${PROVED_SHA}\n`};
      if (args[0] === 'merge-base') return {status: 1, stdout: ''};
      return {status: 0, stdout: ''};
    },
    spawn: () => {
      throw new Error('the authority must not be called for an unpublished commit');
    },
    write: (value) => lines.push(value),
  }), null);
  assert.match(lines.join(''), /not on origin\/main yet/u);
  assert.deepEqual(asked.at(-1), [...ANCESTOR_ARGUMENTS, PROVED_SHA, 'origin/main']);
});

// A manual invocation gates HEAD plus whatever is in the tree. A receipt
// minted there would let the canary skip a corpus that never ran on that
// commit, so the tree must BE the commit (verifier round 1).
test('only a tree that is the commit may mint its receipt', () => {
  for (const [label, git] of [
    ['a modified tree', (command, args) => args[0] === 'rev-parse' ?
      {status: 0, stdout: `${PROVED_SHA}\n`} :
      {status: 0, stdout: ' M src/raft/log.js\n'}],
    ['another commit checked out', () => ({status: 0, stdout: `${'e'.repeat(40)}\n`})],
    ['git unavailable', () => ({status: 128, stdout: ''})],
  ]) {
    const lines = [];
    assert.equal(recordCorpusProof(PROVED_SHA, {
      git,
      spawn: () => {
        throw new Error(`${label}: the authority must not be called`);
      },
      write: (value) => lines.push(value),
    }), null, label);
    assert.match(lines.join(''), /this tree is not that commit/u, label);
  }
});

// The seam the whole reuse rests on: a cone proof proves no corpus, so it must
// never mint a corpus receipt, and neither may a red full-corpus run.
test('only a green whole-corpus run records, never a cone and never a red run', () => {
  const plan = {tests: [{path: 'test/a.test.js'}]};
  const recordedFor = [];
  const scopes = [];
  // The scope writer is injected: this file is in the safety spine, so a
  // witness that called the real writer would stamp fullCorpus:true into the
  // artifact ci uploads on every push, and the canary would skip the corpus
  // for ever (verifier round 2). The guard below proves it stays untouched.
  const realScopeFile = path.join(process.cwd(), 'test-output/proof-scope.json');
  const scopeBefore = fs.existsSync(realScopeFile) ?
    fs.readFileSync(realScopeFile, UTF8) : null;
  const runners = (mode, status) => ({
    head: () => PROVED_SHA,
    record: (sha) => recordedFor.push([mode, sha]),
    runCone: () => status,
    runFull: () => status,
    writeScope: (scope) => scopes.push(scope),
  });

  assert.equal(runDecision(plan, {mode: PROOF_MODE.CHANGE_PROOF},
    runners('cone', 0)), 0);
  assert.deepEqual(recordedFor, [],
    'a cone proof proves no corpus and records nothing');

  assert.equal(runDecision(plan, {mode: PROOF_MODE.FULL_CORPUS},
    runners('full-red', 3)), 3);
  assert.deepEqual(recordedFor, [], 'a red corpus records nothing');

  assert.equal(runDecision(plan, {mode: PROOF_MODE.FULL_CORPUS},
    runners('full-green', 0)), 0);
  assert.deepEqual(recordedFor, [['full-green', PROVED_SHA]],
    'the green whole-corpus run records exactly one receipt, for its own head');

  // Every run still reports its scope, and to the injected writer only.
  assert.deepEqual(scopes.map((scope) => scope.fullCorpus),
    [false, true, true]);
  assert.deepEqual(scopes.map((scope) => scope.head),
    [PROVED_SHA, PROVED_SHA, PROVED_SHA]);
  const scopeAfter = fs.existsSync(realScopeFile) ?
    fs.readFileSync(realScopeFile, UTF8) : null;
  assert.equal(scopeAfter, scopeBefore,
    'the witness must never write the proof scope ci uploads');
});

test('recording is best effort: the gate never fails on bookkeeping', () => {
  const lines = [];
  assert.equal(recordCorpusProof('d'.repeat(40), {
    git: provingTree('d'.repeat(40)),
    spawn: () => ({status: 1, stderr: 'proof store unavailable\n'}),
    write: (value) => lines.push(value),
  }), false);
  assert.match(lines.join(''),
    /whole-corpus receipt not recorded: proof store unavailable/u);

  const unspawned = [];
  assert.equal(recordCorpusProof(null,
    {git: provingTree(PROVED_SHA), spawn: () => {
      throw new Error('no sha means nothing to record');
    }, write: (value) => unspawned.push(value)}), null);
  assert.deepEqual(unspawned, [], 'no sha, no receipt, no noise');
});
