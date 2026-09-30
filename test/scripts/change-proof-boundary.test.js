// Contract for the EXECUTABLE boundary of the change proof.
//
// Every other selection test calls the library. This one calls the command,
// because `npm test` is what a developer and a gate actually invoke, and the
// properties that matter live in the process boundary rather than in the plan:
//
//   exit status        a refusal that exits 0 is worse than no proof at all
//   zero test spawns   a refusal must not half-run a suite and then give up
//   printed words      the caller has to be able to READ why it refused
//
// Proved against a DISPOSABLE repository whose classified scheduler is a
// tripwire. The
// tripwire is what makes "invoked zero behavioural tests" an observation rather
// than an inference: it records the argv it was called with, so an unexpected
// execution leaves evidence instead of merely costing time. It also turns the
// positive cases into exact assertions about WHICH files would have run,
// without running a single one of them.
//
// The fixture is a copy rather than this checkout because the interesting
// inputs - an unclassifiable new file, an uncommitted dependency edit - must be
// constructed, and constructing them here would mean writing to the developer's
// tree, which is precisely what this workflow promises never to do.

import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';

import {
  ALLOW_RELEASE_PROOF_FLAG,
  CHECK_BASE_ENV,
  WORKSPACE_INJECTION_ENV,
} from '../../scripts/checks/change-selection-constants.js';
import {testsForSubsystem} from '../../scripts/check-subsystem.js';
import {loadSafetySpine} from '../../scripts/select-change-tests.js';
import {createChangeProofFixture} from './change-proof-fixture.js';

const root = process.cwd();
const UTF8 = 'utf8';
const BANNER = 'MODULAR PROOF NOT SAFE';
const RELEASE_COMMAND = 'npm run check:release';
const FULL_PROOF_OPTION = ALLOW_RELEASE_PROOF_FLAG;
const FULL_PROOF_MARKER = /^FULL_PROOF_EXECUTED$/gm;
const FULL_PROOF_FAILURE = 7;
// Any word a reader could mistake for a behavioural result.
const SUCCESS_WORDS = /\b(pass|passed|passing|ok \d+|# pass)\b/i;

const {fixtureEnv, proofFor, repo} = createChangeProofFixture({
  root,
  checkBaseEnvironment: CHECK_BASE_ENV,
  workspaceInjectionEnvironment: WORKSPACE_INJECTION_ENV,
});

function withDependency(name) {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json'), UTF8));
  manifest.dependencies = {...manifest.dependencies, [name]: '1.0.0'};
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

const spine = loadSafetySpine(root);

function releaseProofChanges(exitCode = 0) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), UTF8));
  // The actual npm command resolves this script in the disposable repository.
  // The tripwire replaces only the expensive corpus, not selection/dispatch.
  manifest.scripts['check:release'] =
    `node -e "console.log('FULL_PROOF_EXECUTED'); process.exit(${exitCode})"`;
  return {'Dockerfile': 'FROM scratch\n', 'package.json': JSON.stringify(manifest)};
}

test('explicit full-proof execution runs the canonical release command exactly once', () => {
  for (const env of [fixtureEnv(), {...fixtureEnv(), RUNNER_ENVIRONMENT: 'self-hosted'}]) {
    const proof = proofFor(releaseProofChanges(), {args: [FULL_PROOF_OPTION], env});
    assert.equal(proof.status, 0, proof.output);
    assert.equal(proof.invocation, null, 'no partial modular proof before the full proof');
    assert.equal([...proof.output.matchAll(FULL_PROOF_MARKER)].length, 1);
  }
});

test('full-proof child failure remains a failing gate with its exit status', () => {
  const proof = proofFor(releaseProofChanges(FULL_PROOF_FAILURE), {args: [FULL_PROOF_OPTION]});
  assert.equal(proof.status, FULL_PROOF_FAILURE, proof.output);
  assert.equal([...proof.output.matchAll(FULL_PROOF_MARKER)].length, 1);
  assert.equal(proof.invocation, null);
});

test('full-proof permission cannot hide unknown scope mixed with a release change', () => {
  const proof = proofFor({
    ...releaseProofChanges(),
    'src/brand-new-unmapped-area/thing.js': 'export {};\n',
  }, {args: [FULL_PROOF_OPTION]});
  assert.notEqual(proof.status, 0);
  assert.match(proof.output, /UNKNOWN_SCOPE/u);
  assert.equal([...proof.output.matchAll(FULL_PROOF_MARKER)].length, 0);
  assert.equal(proof.invocation, null);
});

test('full-proof permission cannot bypass invalid safety-spine authority', () => {
  const proof = proofFor({
    ...releaseProofChanges(),
    'test/shards/safety-spine.json': '{"tests":[]}',
  }, {args: [FULL_PROOF_OPTION]});
  assert.notEqual(proof.status, 0);
  assert.equal([...proof.output.matchAll(FULL_PROOF_MARKER)].length, 0);
  assert.equal(proof.invocation, null);
});

test('a hosted CI runner refuses the full corpus before spawning it', () => {
  const proof = proofFor(releaseProofChanges(), {
    args: [FULL_PROOF_OPTION],
    env: {...fixtureEnv(), RUNNER_ENVIRONMENT: 'github-hosted'},
  });
  assert.notEqual(proof.status, 0);
  assert.match(proof.output, /RELEASE_PROOF_RUNNER_UNAVAILABLE/u);
  assert.equal([...proof.output.matchAll(FULL_PROOF_MARKER)].length, 0);
  assert.equal(proof.invocation, null);
});

test('GitHub Actions cannot infer a supported runner from missing or unknown identity', () => {
  for (const runner of [undefined, 'unknown']) {
    const env = {...fixtureEnv(), GITHUB_ACTIONS: 'true'};
    if (runner !== undefined) env.RUNNER_ENVIRONMENT = runner;
    const proof = proofFor(releaseProofChanges(), {args: [FULL_PROOF_OPTION], env});
    assert.notEqual(proof.status, 0);
    assert.match(proof.output, /RELEASE_PROOF_REQUIRED/u);
    assert.match(proof.output, /RELEASE_PROOF_RUNNER_UNAVAILABLE/u);
    assert.equal([...proof.output.matchAll(FULL_PROOF_MARKER)].length, 0);
    assert.equal(proof.invocation, null);
  }
});

test('explain and list never execute a full proof even with permission', () => {
  for (const mode of ['--explain', '--list']) {
    const proof = proofFor(releaseProofChanges(), {args: [FULL_PROOF_OPTION, mode]});
    assert.notEqual(proof.status, 0);
    assert.equal([...proof.output.matchAll(FULL_PROOF_MARKER)].length, 0);
    assert.equal(proof.invocation, null);
  }
});

test('full-proof permission leaves ordinary changes on the selected modular path', () => {
  const proof = proofFor({'docs/development/note.md': '# note\n'}, {args: [FULL_PROOF_OPTION]});
  assert.equal(proof.status, 0);
  assert.deepEqual([...proof.invocation].sort(), [...spine].sort());
  assert.equal([...proof.output.matchAll(FULL_PROOF_MARKER)].length, 0);
});

test('the npm vocabulary is wired to the change proof', () => {
  // The single biggest behavioural lever in this workflow is that `npm test` is
  // NOT the whole suite. Repointing it at a broad script would silently restore
  // the old cost model while every contract below kept passing, so the wiring
  // is pinned here rather than left to a commit message.
  const scripts = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json'), UTF8)).scripts;
  assert.match(scripts.test, /select-change-tests\.js/,
    'npm test must be the change-proof orchestrator');
  assert.ok(!/test:sharded|test:fast|test:gate|test:ci/.test(scripts.test),
    'npm test must not be a broad suite alias');
  assert.match(scripts.check, /check-fast-static\.js/,
    'npm run check must run the fast static layer');
  assert.match(scripts.check, /npm test/,
    'npm run check must then run the change proof');
  assert.match(scripts.check, /npm test -- --allow-release-proof/u,
    'CI must execute the stronger proof when the selector requires it');
  assert.match(fs.readFileSync(path.join(root, 'scripts/solve/commands.js'), UTF8),
    /NPM_TEST_ARGUMENTS = Object.freeze\(\['test', '--', ALLOW_RELEASE_PROOF_FLAG\]\)/u,
    'Solver must use the same explicit full-proof handoff as CI');
});

test('an unclassifiable path refuses at the command boundary', () => {
  const proof = proofFor({'src/brand-new-unmapped-area/thing.js': 'export {};\n'});
  assert.notEqual(proof.status, 0,
    'a refusal that exits 0 would be read as a passing proof');
  assert.equal(proof.invocation, null,
    'a refusal must invoke ZERO behavioural tests, not a partial suite');
  assert.ok(proof.output.includes(BANNER),
    `the refusal must carry "${BANNER}"; got:\n${proof.output}`);
  assert.ok(proof.output.includes('UNKNOWN_SCOPE'),
    'the refusal must name its machine-readable reason code');
  assert.ok(!SUCCESS_WORDS.test(proof.output),
    `a refusal must not print anything readable as success:\n${proof.output}`);
});

test('an unclassifiable path does NOT suggest the release proof', () => {
  // check:release would "work" here, and that is exactly the problem: an
  // unmapped path is a taxonomy defect, and pointing operators at the most
  // expensive command teaches them to route around the fix.
  const proof = proofFor({'src/brand-new-unmapped-area/thing.js': 'export {};\n'});
  assert.ok(!proof.output.includes(RELEASE_COMMAND),
    `an unknown-scope refusal must not suggest ${RELEASE_COMMAND}`);
});

test('an UNCOMMITTED dependency edit refuses and names the release proof', () => {
  // The change is in the working tree only. Deriving the changed package fields
  // from committed revisions would report "no fields changed" and let the
  // broadest change in the repository take the modular path.
  const proof = proofFor({'package.json': withDependency('fixture-package')});
  assert.notEqual(proof.status, 0);
  assert.equal(proof.invocation, null,
    'a refusal must invoke ZERO behavioural tests');
  assert.ok(proof.output.includes(BANNER));
  assert.ok(proof.output.includes('RELEASE_PROOF_REQUIRED'),
    'the refusal must name its machine-readable reason code');
  assert.ok(proof.output.includes(RELEASE_COMMAND),
    'a release-proof refusal must say which stronger proof to run');
  assert.ok(!SUCCESS_WORDS.test(proof.output),
    `a refusal must not print anything readable as success:\n${proof.output}`);
});

test('a scripts-only package edit stays on the modular path', () => {
  // The commit that made `npm test` mean this command was itself a scripts-only
  // package.json edit. If that had demanded a release proof, the workflow would
  // have been unable to change its own test command.
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json'), UTF8));
  manifest.scripts = {...manifest.scripts, 'fixture:probe': 'node --version'};
  const proof = proofFor(
    {'package.json': `${JSON.stringify(manifest, null, 2)}\n`});
  assert.ok(!proof.output.includes(BANNER),
    `a scripts-only edit must not refuse; got:\n${proof.output}`);
  assert.notEqual(proof.invocation, null,
    'a scripts-only edit must select a real proof, not nothing');
});

test('a docs-only change executes exactly the safety spine', () => {
  const proof = proofFor({'docs/development/note.md': '# note\n'});
  assert.equal(proof.status, 0);
  assert.notEqual(proof.invocation, null,
    'inert does not mean unproved: the spine is unconditional');
  assert.deepEqual([...proof.invocation].sort(), [...spine].sort(),
    'a docs-only change must run the spine and nothing more');
});

test('a source change executes its owning subsystem AND the spine', () => {
  const proof = proofFor({'src/raft/fixture-consensus-thing.js': 'export {};\n'});
  assert.equal(proof.status, 0);
  const invoked = new Set(proof.invocation);
  for (const spineTest of spine) {
    assert.ok(invoked.has(spineTest),
      `${spineTest} is spine: it must run for every non-refused change`);
  }
  const owned = testsForSubsystem('storage-raft');
  assert.ok(owned.length > 0, 'the fixture subsystem must be non-empty');
  for (const ownedTest of owned) {
    assert.ok(invoked.has(ownedTest),
      `${ownedTest} owns the changed source: it must run`);
  }
});

test('the command never writes to the repository it inspects', () => {
  // The same read-only promise the static layer makes. Asserted here because
  // the orchestrator is the one that spawns other processes, and a spawned
  // generator writing to the tree would be invisible to a library-level test.
  const before = execFileSync('git', ['status', '--porcelain'],
    {cwd: repo, encoding: UTF8});
  proofFor({'docs/development/note.md': '# note\n'});
  const after = execFileSync('git', ['status', '--porcelain'],
    {cwd: repo, encoding: UTF8});
  assert.equal(after, before);
});
