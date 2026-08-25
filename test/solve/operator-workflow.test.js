import tap from 'tap';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';

import {
  continueQuestWorkflow,
  landQuestWorkflow,
  startQuestWorkflow,
} from '../../scripts/solve/operator-workflow.js';
import {
  isAttemptRecordActionCode,
} from '../../scripts/solve/next-action.js';
import {workflowFailure} from '../../scripts/solve/workflow-envelope.js';
import {buildNextProjection} from '../../scripts/solve/next.js';
import {assertReviewCurrent} from '../../scripts/solve/review-request.js';
import {landingReviewPreflight} from '../../scripts/solve/landing-preflight.js';
import {inspectChangeArtifact} from '../../scripts/solve/change-artifact.js';
import {runStep} from '../../scripts/solve/step.js';
import {
  appendEvent,
  boundVerifierRejectionEvents,
  loadQuest,
  projectState,
  readLog,
  saveQuest,
} from '../../scripts/solve/store.js';
import {
  terminalVerificationProblems,
  verificationState,
} from '../../scripts/solve/verification.js';
import {
  EVENT_GATE_DECISION,
  EVENT_THEORY_OPTION_DECLARED,
  EVENT_THEORY_SELECTED,
  OUTCOME_BLOCKED,
  THEORY_RESULT_FALSIFIED,
} from '../../scripts/solve/constants.js';
import {buildManifest} from '../../scripts/checks/test-primary-classification.js';
import {OWNER_DEBT} from '../../scripts/global-owner-debt-inventory/constants.js';
import {
  fileIdentity,
  importGraphResolverStateDigest,
  javascriptSourceDigest,
  listImportGraphInputFiles,
  listJavaScriptFiles,
} from '../../scripts/global-owner-debt-inventory/helpers.js';
import {makeOracleQuest} from './solve-test-quest-fixture.js';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'operator-workflow-'));
}

function simpleDiff(root, questId, name = 'change') {
  const file = path.join(root, 'solve', 'changes', questId, `${name}.diff`);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, [
    'diff --git a/docs/demo.md b/docs/demo.md',
    '--- a/docs/demo.md',
    '+++ b/docs/demo.md',
    '@@ -1 +1 @@',
    '-before',
    '+after',
    '',
  ].join('\n'));
  return `diff:${path.relative(root, file)}`;
}

function git(root, args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function landingFixture(changedPath = 'scripts/demo.js', finalMetric = 0,
  verificationTemplates = []) {
  const root = tmp();
  git(root, ['init']);
  git(root, ['config', 'user.email', 'solver@example.com']);
  git(root, ['config', 'user.name', 'Solver']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  stageCanonicalImportGraphTriple(root);
  const id = changedPath === 'package.json' ? 'solver-facade-land' : 'facade-land';
  const oracle = path.join(root, 'solve', 'oracle', `${id}.json`);
  fs.mkdirSync(path.dirname(oracle), {recursive: true});
  const changedFile = path.join(root, changedPath);
  fs.mkdirSync(path.dirname(changedFile), {recursive: true});
  fs.writeFileSync(oracle, JSON.stringify({metric: 1, target: 0}));
  fs.writeFileSync(changedFile, changedPath === 'package.json' ?
    '{"version":1}\n' : 'export const value = 1;\n');
  const metric = {probe: 'oracle', args: {file: oracle}};
  const quest = {
    id,
    authoringContractVersion: 1,
    verificationContractVersion: 2,
    statement: 'The façade landing fixture reaches zero.',
    priority: 1,
    class: 'process',
    links: {specRef: 'solve/epics/facade.md'},
    doneWhen: metric,
    frontiers: [{id: `${id}-main`, priority: 1, metric}],
    constraints: [],
  };
  if (verificationTemplates.length > 0) {
    quest.verificationTemplates = verificationTemplates;
  }
  saveQuest(root, quest);
  // Stage the proof-cone runnable inputs before the base commit so they are
  // tracked context (not untracked source the auto-diff refuses): a witness
  // test (non-empty primary classification census), the impact-contract
  // registry the proof cone requires, and the classification manifest.
  // The witness imports the demo module through a same-directory shim so the
  // canonical graph carries a real dependency edge (the proof-cone input
  // gate refuses an edgeless graph).
  const demoShimPath = path.join(root, 'test', 'demo-shim.js');
  fs.mkdirSync(path.dirname(demoShimPath), {recursive: true});
  fs.writeFileSync(demoShimPath, 'export {value} from \'../scripts/demo.js\';\n');
  const witnessPath = path.join(root, 'test', 'landing-witness.test.js');
  fs.writeFileSync(
    witnessPath,
    'import \'./demo-shim.js\';\n' +
      'import tap from \'tap\';\ntap.pass(\'landing witness\');\n',
  );
  const primaryClassesPath = path.join(
    root, 'test', 'shards', 'primary-classes.json');
  fs.writeFileSync(
    primaryClassesPath,
    `${JSON.stringify(buildManifest(root), null, 2)}\n`,
  );
  const registryPath = path.join(root, 'test', 'shards',
    'impact-contracts.json');
  fs.writeFileSync(registryPath, `${JSON.stringify({
    schemaVersion: 2,
    id: 'impact-contracts',
    description: 'landing fixture registry',
    contracts: {},
    coupledPairs: {},
  }, null, 2)}\n`);
  git(root, ['add', '-A']);
  git(root, ['commit', '-m', 'base']);
  runStep(root, quest);
  fs.writeFileSync(changedFile, changedPath === 'package.json' ?
    '{"version":2}\n' : 'export const value = 2;\n');
  fs.writeFileSync(oracle, JSON.stringify({metric: finalMetric, target: 0}));
  const content = git(root, [
    'diff', '--binary', '--full-index', '--no-ext-diff', 'HEAD', '--',
    changedPath,
  ]);
  const artifact = path.join(root, 'solve', 'changes', id, 'candidate.diff');
  fs.mkdirSync(path.dirname(artifact), {recursive: true});
  fs.writeFileSync(artifact, `${content}\n`);
  runStep(root, quest, {
    changeRef: `diff:${path.relative(root, artifact)}`,
    summary: 'change the landing fixture',
  });
  // Re-stamp the canonical graph over the final working tree so the landing
  // preflight's live producer-input comparison sees fresh digests.
  stageCanonicalImportGraphTriple(root);
  return {root, id};
}

// The landing preflight verifies the canonical import-graph producer triple
// (scripts/generate-global-owner-debt-inventory.js +
// test-output/analysis/global-owner-debt-import-graph.json +
// test/shards/impact-graph-seal.json) against the fixture root
// (scripts/solve/landing-preflight.js canonicalImportGraphProblem): the
// producer runs as `node <producer> --verify-import-graph` with the fixture
// root as cwd, and the staged graph and seal must match the live
// recomputation over the fixture's JavaScript files. This stages the
// coupled-pair fixture's proven pattern (test/solve/coupled-pair-guard-
// fixture.js): a receipt-printing stub producer plus a graph and seal
// computed with the REAL imported digest helpers, so the canonical
// comparison is genuine without dragging dependency-cruiser into a tmpdir.
const IMPORT_GRAPH_PATH =
  'test-output/analysis/global-owner-debt-import-graph.json';
const IMPORT_GRAPH_SEAL_PATH = 'test/shards/impact-graph-seal.json';
const IMPORT_GRAPH_PRODUCER_SOURCE =
  'import crypto from \'node:crypto\';\n' +
  'import fs from \'node:fs\';\n' +
  `const graphBytes = fs.readFileSync('${IMPORT_GRAPH_PATH}');\n` +
  `const sealBytes = fs.readFileSync('${IMPORT_GRAPH_SEAL_PATH}');\n` +
  'const digest = (bytes) => crypto.createHash(\'sha256\')' +
    '.update(bytes).digest(\'hex\');\n' +
  'process.stdout.write(JSON.stringify({\n' +
  '  snapshotDigest: JSON.parse(graphBytes).snapshotDigest,\n' +
  '  graphByteDigest: digest(graphBytes),\n' +
  '  sealByteDigest: digest(sealBytes),\n' +
  '}) + \'\\n\');\n';

function stageCanonicalImportGraphTriple(root) {
  const files = listJavaScriptFiles(root);
  const producerInputs = listImportGraphInputFiles(root);
  const degrees = Object.fromEntries(
    files.map((filePath) => [filePath, {in: 0, out: 0}]),
  );
  const importers = {};
  let edgeCount = 0;
  for (const filePath of files) {
    const content = fs.readFileSync(path.join(root, filePath), 'utf8');
    const importMatches = content.matchAll(
      /import\s[^'"]*['"]\.{1,2}\/([^'"]+)['"]/gu);
    for (const match of importMatches) {
      const target = path.posix.normalize(
        path.posix.join(path.posix.dirname(filePath), match[1]));
      if (!Object.hasOwn(degrees, target)) continue;
      degrees[target].in += 1;
      degrees[filePath].out += 1;
      if (!importers[target]) importers[target] = [];
      importers[target].push(filePath);
      edgeCount += 1;
    }
  }
  const graph = {
    schemaVersion: OWNER_DEBT.importGraphSchemaVersion,
    sourceDigest: javascriptSourceDigest(root, files),
    producerInputDigest: javascriptSourceDigest(root, producerInputs),
    fileDigests: Object.fromEntries(files.map((filePath) => [
      filePath,
      fileIdentity(root, filePath).sha256,
    ])),
    followedFileDigests: {},
    resolverInputs: [],
    resolverStateDigest: importGraphResolverStateDigest(root, []),
    moduleCount: files.length,
    edgeCount,
    unresolvedCount: 0,
    degrees,
    importers,
  };
  // The snapshot digest binds exactly the canonical snapshot serialization
  // (scripts/generate-global-owner-debt-inventory.js serializeImportGraph):
  // every field except the digest itself, in declaration order, with
  // degrees and importers key-sorted and importer lists de-duplicated.
  const snapshot = {
    schemaVersion: graph.schemaVersion,
    sourceDigest: graph.sourceDigest,
    producerInputDigest: graph.producerInputDigest,
    fileDigests: graph.fileDigests,
    followedFileDigests: graph.followedFileDigests,
    resolverInputs: graph.resolverInputs,
    resolverStateDigest: graph.resolverStateDigest,
    moduleCount: graph.moduleCount,
    edgeCount: graph.edgeCount,
    unresolvedCount: graph.unresolvedCount,
    degrees: Object.fromEntries(Object.entries(graph.degrees).sort()),
    importers: Object.fromEntries(Object.entries(graph.importers)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([target, list]) => [target, [...new Set(list)].sort()])),
  };
  graph.degrees = snapshot.degrees;
  graph.importers = snapshot.importers;
  graph.snapshotDigest = crypto.createHash(OWNER_DEBT.hashAlgorithm)
    .update(JSON.stringify(snapshot)).digest(OWNER_DEBT.hashEncoding);
  const graphPath = path.join(root, IMPORT_GRAPH_PATH);
  const sealPath = path.join(root, IMPORT_GRAPH_SEAL_PATH);
  fs.mkdirSync(path.dirname(graphPath), {recursive: true});
  fs.mkdirSync(path.dirname(sealPath), {recursive: true});
  fs.writeFileSync(graphPath, `${JSON.stringify(graph)}\n`);
  fs.writeFileSync(sealPath, `${JSON.stringify({
    schemaVersion: 1,
    importGraphSchemaVersion: graph.schemaVersion,
    sourceDigest: graph.sourceDigest,
    producerInputDigest: graph.producerInputDigest,
    resolverStateDigest: graph.resolverStateDigest,
    snapshotDigest: graph.snapshotDigest,
  }, null, 2)}\n`);
  fs.mkdirSync(path.join(root, 'scripts'), {recursive: true});
  fs.writeFileSync(
    path.join(root, 'scripts', 'generate-global-owner-debt-inventory.js'),
    IMPORT_GRAPH_PRODUCER_SOURCE,
  );
}

function nonSourceLandingFixture() {
  const root = tmp();
  git(root, ['init']);
  git(root, ['config', 'user.email', 'solver@example.com']);
  git(root, ['config', 'user.name', 'Solver']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  const id = 'facade-doc-land';
  const oracle = path.join(root, 'solve', 'oracle', `${id}.json`);
  const doc = path.join(root, 'docs', 'demo.md');
  fs.mkdirSync(path.dirname(oracle), {recursive: true});
  fs.mkdirSync(path.dirname(doc), {recursive: true});
  fs.writeFileSync(oracle, JSON.stringify({metric: 1, target: 0}));
  fs.writeFileSync(doc, 'before\n');
  const metric = {probe: 'oracle', args: {file: oracle}};
  const quest = {
    id,
    authoringContractVersion: 1,
    verificationContractVersion: 2,
    statement: 'The façade documentation fixture reaches zero.',
    priority: 1,
    class: 'process',
    links: {specRef: 'solve/epics/facade.md'},
    doneWhen: metric,
    frontiers: [{id: `${id}-main`, priority: 1, metric}],
    constraints: [],
  };
  saveQuest(root, quest);
  git(root, ['add', '-A']);
  git(root, ['commit', '-m', 'base']);
  runStep(root, quest);
  fs.writeFileSync(doc, 'after\n');
  fs.writeFileSync(oracle, JSON.stringify({metric: 0, target: 0}));
  const artifact = path.join(root, 'solve', 'changes', id, 'candidate.diff');
  fs.mkdirSync(path.dirname(artifact), {recursive: true});
  fs.writeFileSync(artifact, `${git(root, [
    'diff', '--binary', '--full-index', '--no-ext-diff', 'HEAD', '--', 'docs/demo.md',
  ])}\n`);
  runStep(root, quest, {
    changeRef: `diff:${path.relative(root, artifact)}`,
    summary: 'change the documentation fixture',
  });
  return {root, id};
}

// Harness watchdog, not a latency contract, and it lifts the cap for every
// test in this file: run-test-files.js derives TAP_TIMEOUT from the largest
// {timeout: ...} declared here, and TAP_TIMEOUT is the only thing that raises
// tap's silent 30s per-test cap. This file spawns real Solver CLI processes;
// healthy execution measures ~25s, so it sat barely under the cap and tipped
// over intermittently under suite load (observed 36.9s). 120s keeps a genuine
// hang detectable without changing a single assertion.
const WORKFLOW_TIMEOUT_MS = 120000;

tap.test('next exposes stable action codes and continue dispatches only those codes',
  {timeout: WORKFLOW_TIMEOUT_MS},
  (t) => {
    const root = tmp();
    const {quest} = makeOracleQuest(root);
    const started = startQuestWorkflow(root, {
      id: quest.id,
      doctor: {ok: true, recommendedMode: 'supervised'},
    });
    t.equal(started.lint.status, 'pass');
    t.equal(started.next.action.code, 'begin-step');
    t.equal(readLog(root, quest.id).length, 0,
      'start validates without sealing or beginning');

    t.throws(() => continueQuestWorkflow(root, {
      id: quest.id,
      ['auto-diff']: true,
      summary: 'premature capture',
    }), /begin-step does not accept/iu);
    const begun = continueQuestWorkflow(root, {id: quest.id});
    t.equal(begun.executed, true);
    t.equal(begun.operation, 'begin-step');
    t.equal(begun.next.action.code, 'record-attempt');
    t.throws(() => continueQuestWorkflow(root, {id: quest.id}),
      /requires --summary/iu);
    const committed = continueQuestWorkflow(root, {
      id: quest.id,
      changeRef: simpleDiff(root, quest.id),
      summary: 'record the explicit fixture change',
    });
    t.equal(committed.operation, 'record-attempt');
    t.equal(readLog(root, quest.id).filter((event) => event.type === 'attempt').length, 1);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

tap.test('attempt recording has one current term and accepts the legacy code', (t) => {
  t.equal(isAttemptRecordActionCode('record-attempt'), true);
  t.equal(isAttemptRecordActionCode('commit-step'), true,
    'persisted legacy projections remain executable');
  t.equal(isAttemptRecordActionCode('git-commit'), false);
  t.same(
    workflowFailure(new Error(
      'scope-pressure precommit blocked: split into bounded Quest declarations')),
    {
      ok: false,
      error: {
        code: 'scope-grew',
        category: 'scope',
        message: 'scope-pressure precommit blocked: split into bounded Quest declarations',
        requiresJudgment: false,
        repair: {code: 'record-covered-scope', payload: {paths: [], splitPlan: []}},
      },
    },
    'automation receives a code and payload, not a shell command',
  );
  t.end();
});

tap.test('continue treats a commit summary as implicit auto-diff capture', (t) => {
  const root = tmp();
  git(root, ['init']);
  git(root, ['config', 'user.email', 'solver@example.com']);
  git(root, ['config', 'user.name', 'Solver']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  const {quest, oracle} = makeOracleQuest(root);
  fs.mkdirSync(path.join(root, 'src'), {recursive: true});
  fs.writeFileSync(path.join(root, 'src', 'demo.js'), 'before\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '-m', 'base']);

  continueQuestWorkflow(root, {id: quest.id});
  fs.writeFileSync(path.join(root, 'src', 'demo.js'), 'after\n');
  fs.writeFileSync(oracle, JSON.stringify({metric: 1, target: 0}));
  const committed = continueQuestWorkflow(root, {
    id: quest.id,
    summary: 'capture the changed source automatically',
  });

  t.equal(committed.operation, 'record-attempt');
  t.match(committed.result.changeRef,
    /^diff:solve\/changes\/demo\/attempt-1\.diff(?:\.json)?$/u);
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('continue excludes inventories left dirty by a failed final commit', (t) => {
  const root = tmp();
  git(root, ['init']);
  git(root, ['config', 'user.email', 'solver@example.com']);
  git(root, ['config', 'user.name', 'Solver']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  const {quest, oracle} = makeOracleQuest(root);
  const source = path.join(root, 'src', 'demo.js');
  const inventory = path.join(root,
    'solve/changes/global-owner-debt-inventory/inventory.json');
  const priorAttemptObject = path.join(root,
    'solve/artifacts/sha256/aa/prior.diff.gz');
  fs.mkdirSync(path.dirname(source), {recursive: true});
  fs.mkdirSync(path.dirname(inventory), {recursive: true});
  fs.writeFileSync(source, 'before\n');
  fs.writeFileSync(inventory, '{"epoch":"before"}\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '-m', 'base']);

  continueQuestWorkflow(root, {id: quest.id});
  fs.writeFileSync(source, 'after\n');
  fs.writeFileSync(inventory, '{"epoch":"refreshed"}\n');
  fs.mkdirSync(path.dirname(priorAttemptObject), {recursive: true});
  fs.writeFileSync(priorAttemptObject, 'prior immutable object\n');
  git(root, ['add', priorAttemptObject]);
  fs.writeFileSync(oracle, JSON.stringify({metric: 1, target: 0}));
  const committed = continueQuestWorkflow(root, {
    id: quest.id,
    summary: 'capture only authored source after a failed landing',
  });
  const inspection = inspectChangeArtifact(
    root, quest, committed.result.changeRef);

  t.ok(inspection.changedPaths.includes('src/demo.js'),
    'the authored replacement remains in the attempt');
  t.notOk(inspection.changedPaths.includes(
    'solve/changes/global-owner-debt-inventory/inventory.json'),
  'final-commit projections never inflate a replacement attempt');
  t.notOk(inspection.changedPaths.includes(
    'solve/artifacts/sha256/aa/prior.diff.gz'),
  'prior attempt objects never inflate their replacement attempt');
  t.match(fs.readFileSync(inventory, 'utf8'), /refreshed/u,
    'the generated output remains dirty for the next final commit');
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('continue executes a ready source checkpoint through the facade', (t) => {
  const {root, id} = landingFixture('scripts/demo.js', 1);
  const dossier = buildNextProjection(root, id)
    .verification.checkpointPreflight.candidate.dossier;
  appendEvent(root, id, {
    type: 'finding',
    frontier: `${id}-main`,
    kind: 'verifier-approval',
    claim: 'independent checkpoint verification passed',
    evidence: 'subagent:facade-checkpoint',
    verification: {
      schemaVersion: 2,
      scope: 'candidate',
      fingerprint: dossier.fingerprint,
      baseCommit: dossier.baseCommit,
      paths: dossier.paths,
      sourcePaths: dossier.sourcePaths,
      firstAttemptIndex: dossier.firstAttemptIndex,
      lastAttemptIndex: dossier.lastAttemptIndex,
    },
  });
  t.equal(buildNextProjection(root, id).action.code, 'checkpoint');
  const beforeHead = git(root, ['rev-parse', 'HEAD']);

  const result = continueQuestWorkflow(root, {id});

  t.equal(result.executed, true);
  t.equal(result.operation, 'checkpoint');
  t.match(result.result, /checkpointed/u);
  t.not(git(root, ['rev-parse', 'HEAD']), beforeHead);
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('start optionally creates and lints a draft without declaring it', (t) => {
  const root = tmp();
  const cli = path.resolve('scripts/solve.js');
  const result = spawnSync(process.execPath, [
    cli,
    'start',
    '--root', root,
    '--id', 'created-by-start',
    '--statement', 'The start façade creates a lintable draft.',
    '--class', 'process',
    '--spec-ref', 'solve/epics/facade.md',
    '--json',
  ], {encoding: 'utf8'});
  t.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  t.equal(output.lint.status, 'pass');
  t.equal(output.next.action.code, 'begin-step');
  t.equal(readLog(root, 'created-by-start').length, 0,
    'start does not declare or begin the new draft');
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('continue never executes rendered command strings or gate actions', (t) => {
  const root = tmp();
  const {quest} = makeOracleQuest(root);
  const sentinel = path.join(root, 'rendered-command-ran');
  appendEvent(root, quest.id, {
    type: EVENT_GATE_DECISION,
    frontier: `${quest.id}-main`,
    disposition: 'reroute',
    code: 'blocked-scope',
    outcome: OUTCOME_BLOCKED,
    problems: ['operator judgment required'],
    nextCommand: `node -e "require('fs').writeFileSync('${sentinel}', 'bad')"`,
  });
  const projection = buildNextProjection(root, quest.id);
  t.equal(projection.action.code, 'operator-action');
  const result = continueQuestWorkflow(root, {id: quest.id});
  t.equal(result.executed, false);
  t.equal(fs.existsSync(sentinel), false);
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('land rejects drift and records rejection without committing', (t) => {
  const {root, id} = landingFixture();
  const beforeHead = git(root, ['rev-parse', 'HEAD']);
  const projection = buildNextProjection(root, id);
  t.equal(projection.action.code, 'request-verification');
  const fingerprint = projection.verification.candidateFingerprint;
  t.throws(() => landQuestWorkflow(root, {
    id,
    verifier: 'facade-reviewer',
    verdict: 'reject',
    fingerprint: `sha256:${'0'.repeat(64)}`,
  }), /does not match current candidate bytes/iu);
  t.throws(() => landQuestWorkflow(root, {
    id,
    verifier: 'facade-reviewer',
    verdict: 'reject',
    fingerprint,
    receipt: 'review:facade-rejection',
  }), /a rejection requires/u,
  'a rejection without a categorized finding list is refused');
  const rejected = landQuestWorkflow(root, {
    id,
    verifier: 'facade-reviewer',
    verdict: 'reject',
    fingerprint,
    receipt: 'review:facade-rejection',
    finding: 'correctness: the rejected candidate omitted paired comparison',
  });
  t.equal(rejected.committed, false);
  t.equal(git(root, ['rev-parse', 'HEAD']), beforeHead);
  t.ok(readLog(root, id).some((event) =>
    event.kind === 'verifier-rejection' &&
    event.verification?.fingerprint === fingerprint));
  t.equal(rejected.next.quest.status, 'open',
    'the categorized rejection itself reopens the Quest');
  t.equal(rejected.next.action.code, 'replace-rejected-attempt');
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('one continue summary begins and captures a rejected replacement', (t) => {
  const {root, id} = landingFixture();
  const before = buildNextProjection(root, id);
  const rejectedFingerprint = before.verification.candidateFingerprint;
  landQuestWorkflow(root, {
    id,
    verifier: 'facade-reviewer',
    verdict: 'reject',
    fingerprint: rejectedFingerprint,
    receipt: 'review:facade-rejection',
    finding: 'correctness: the candidate omitted the replacement behavior',
  });

  fs.writeFileSync(path.join(root, 'scripts', 'demo.js'),
    'export const value = 3;\n');
  const replaced = continueQuestWorkflow(root, {
    id,
    summary: 'capture the verifier-required replacement',
  });

  t.equal(replaced.operation, 'replace-rejected-attempt');
  t.equal(replaced.begin.terminal, null,
    'the same call begins against the automatically reopened projection');
  t.match(replaced.result.changeRef,
    /^diff:solve\/changes\/facade-land\/attempt-1\.diff(?:\.json)?$/u);
  t.equal(readLog(root, id).filter((event) => event.type === 'attempt').length, 2);
  t.not(buildNextProjection(root, id).verification.candidateFingerprint,
    rejectedFingerprint, 'the one-call replacement has new exact bytes');
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('land validates aggregate approval and scope-safely commits without push', (t) => {
  const {root, id} = landingFixture();
  const beforeHead = git(root, ['rev-parse', 'HEAD']);
  const fingerprint = buildNextProjection(root, id).verification.aggregateFingerprint;
  t.throws(() => landQuestWorkflow(root, {
    id,
    verifier: 'facade-reviewer',
    verdict: 'approve',
    fingerprint,
  }), /--receipt/iu);
  const landed = landQuestWorkflow(root, {
    id,
    verifier: 'facade-reviewer',
    verdict: 'approve',
    fingerprint,
    receipt: 'review:facade-approval',
  });
  t.equal(landed.committed, true);
  t.not(git(root, ['rev-parse', 'HEAD']), beforeHead);
  t.equal(landed.commit.pushed, false);
  t.equal(landed.next.action.code, 'land');
  // The fixture re-stamps its canonical import-graph triple after the final
  // runStep, so the graph and seal are intentionally dirty fixture context
  // outside the landed candidate scope.
  t.equal(
    git(root, ['status', '--porcelain', '-uall'])
      .split('\n')
      .filter((line) => line.length > 0 &&
        !line.endsWith('global-owner-debt-import-graph.json') &&
        !line.endsWith('impact-graph-seal.json') &&
        !line.includes('solve/state/landing-preflight/') &&
        !line.includes('solve/state/reviews/'))
      .join('\n'),
    '',
  );
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('land issues an immutable review id and accepts a verdict by id', (t) => {
  const {root, id} = landingFixture();
  const requested = landQuestWorkflow(root, {id});
  t.equal(requested.verdict, 'needs-review');
  t.equal(requested.review.preflight.cached, false,
    'the review is minted only after a fresh changed-path preflight');
  t.match(requested.review.id, /^review-[0-9a-f]{24}$/u);
  t.equal(requested.committed, false);
  t.equal(fs.existsSync(path.join(
    root,
    'solve/state/reviews',
    `${requested.review.id}.json`,
  )), true);

  const repeated = landQuestWorkflow(root, {id});
  t.equal(repeated.review.id, requested.review.id,
    'unchanged bytes retain the immutable review identity');
  t.equal(repeated.review.preflight.cached, true,
    'the source-digest result is reused instead of rerunning checkers');

  const landed = landQuestWorkflow(root, {
    id,
    review: requested.review.id,
    verifier: 'review-id-verifier',
    verdict: 'approve',
    receipt: 'review:immutable-id',
  });
  t.equal(landed.committed, true);
  t.equal(landed.fingerprint, requested.review.manifest.aggregate.fingerprint);
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('land binds the additive template bar and ingests one structured verdict file',
  (t) => {
    const {root, id} = landingFixture(
      'scripts/demo.js', 0, ['adversarial-js-intrinsics']);
    const valuesDescriptor = Object.getOwnPropertyDescriptor(Map.prototype, 'values');
    const hasDescriptor = Object.getOwnPropertyDescriptor(Map.prototype, 'has');
    Reflect.defineProperty(Map.prototype, 'values', {
      configurable: true,
      value() {
        if (Reflect.apply(hasDescriptor.value, this, ['adversarial-js-intrinsics'])) {
          return {
            next: () => ({done: true}),
            [Symbol.iterator]() {
              return this;
            },
          };
        }
        return Reflect.apply(valuesDescriptor.value, this, []);
      },
      writable: true,
    });
    let requested;
    try {
      requested = landQuestWorkflow(root, {id});
    } finally {
      Reflect.defineProperty(Map.prototype, 'values', valuesDescriptor);
    }
    t.equal(requested.review.manifest.schemaVersion, 3);
    t.same(requested.review.manifest.requiredReviewTemplates.map(
      (entry) => entry.category), ['adversarial-js-intrinsics']);
    t.equal(requested.review.manifest.sourceEpoch.headCommit,
      git(root, ['rev-parse', 'HEAD']));
    t.equal(requested.review.manifest.proofPlan.status, 'pass');

    fs.writeFileSync(path.join(root, 'review-evidence.txt'),
      'intrinsics checklist completed\n');
    fs.writeFileSync(path.join(root, 'verdict.json'), `${JSON.stringify({
      schemaVersion: 'solver-verifier-verdict/1',
      reviewId: requested.review.id,
      verifierId: 'structured-reviewer',
      verdict: 'approve',
      completedTemplateItems: [{
        category: 'adversarial-js-intrinsics',
        evidencePaths: ['review-evidence.txt'],
      }],
      findings: [],
      externalReceiptRef: 'subagent-receipt:structured-reviewer',
    }, null, 2)}\n`);
    const landed = landQuestWorkflow(root, {
      id,
      review: requested.review.id,
      ['verdict-file']: 'verdict.json',
    });
    t.equal(landed.committed, true);
    const finding = readLog(root, id).find(
      (event) => event.kind === 'verifier-approval');
    t.equal(finding.evidence, 'subagent:structured-reviewer');
    t.equal(finding.verification.reviewEnvelope.reviewId, requested.review.id);
    const completed = finding.verification.reviewEnvelope.completedTemplateItems[0];
    t.equal(completed.category, 'adversarial-js-intrinsics');
    t.equal(completed.evidence[0].path, 'review-evidence.txt');
    t.match(completed.evidence[0].sha256, /^sha256:[0-9a-f]{64}$/u);
    t.equal(completed.evidence[0].size > 0, true);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

tap.test('structured verdict fails closed on incomplete template accounting', (t) => {
  const {root, id} = landingFixture(
    'scripts/demo.js', 0, ['adversarial-js-intrinsics']);
  const requested = landQuestWorkflow(root, {id});
  fs.writeFileSync(path.join(root, 'verdict.json'), `${JSON.stringify({
    schemaVersion: 'solver-verifier-verdict/1',
    reviewId: requested.review.id,
    verifierId: 'structured-reviewer',
    verdict: 'approve',
    completedTemplateItems: [],
    findings: [],
    externalReceiptRef: 'subagent-receipt:structured-reviewer',
  })}\n`);
  t.throws(() => landQuestWorkflow(root, {
    id,
    review: requested.review.id,
    ['verdict-file']: 'verdict.json',
  }), /template accounting mismatch.*missing adversarial-js-intrinsics/iu);
  t.notOk(readLog(root, id).some((event) => event.kind === 'verifier-approval'));
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('structured verdict remains canonical through the hostile ledger tail', (t) => {
  const {root, id} = landingFixture(
    'scripts/demo.js', 0, ['adversarial-js-intrinsics']);
  const requested = landQuestWorkflow(root, {id});
  const summary = 'tail consumers must preserve the category-complete verifier finding';
  fs.writeFileSync(path.join(root, 'review-evidence.txt'), 'tail checklist completed\n');
  fs.writeFileSync(path.join(root, 'verdict.json'), `${JSON.stringify({
    schemaVersion: 'solver-verifier-verdict/1',
    reviewId: requested.review.id,
    verifierId: 'tail-verifier',
    verdict: 'reject',
    completedTemplateItems: [{
      category: 'adversarial-js-intrinsics',
      evidencePaths: ['review-evidence.txt'],
    }],
    findings: [{category: 'adversarial-js-intrinsics', summary}],
    externalReceiptRef: 'subagent-receipt:tail-verifier',
  }, null, 2)}\n`);

  const everyDescriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'every');
  const filterDescriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'filter');
  const isArrayDescriptor = Object.getOwnPropertyDescriptor(Array, 'isArray');
  const includesDescriptor = Object.getOwnPropertyDescriptor(
    Array.prototype, 'includes');
  const iteratorDescriptor = Object.getOwnPropertyDescriptor(
    Array.prototype, Symbol.iterator);
  const mapDescriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'map');
  const pushDescriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'push');
  const sliceDescriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'slice');
  const someDescriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'some');
  const hasDescriptor = Object.getOwnPropertyDescriptor(Set.prototype, 'has');
  const parseDescriptor = Object.getOwnPropertyDescriptor(JSON, 'parse');
  const stringifyDescriptor = Object.getOwnPropertyDescriptor(JSON, 'stringify');
  const integerDescriptor = Object.getOwnPropertyDescriptor(Number, 'isInteger');
  const startsWithDescriptor = Object.getOwnPropertyDescriptor(
    String.prototype, 'startsWith');
  const testDescriptor = Object.getOwnPropertyDescriptor(RegExp.prototype, 'test');
  const trimDescriptor = Object.getOwnPropertyDescriptor(String.prototype, 'trim');
  Reflect.defineProperty(Array.prototype, 'every', {
    configurable: true,
    value(callback, thisArg) {
      if (this[0]?.category === 'adversarial-js-intrinsics') return true;
      return Reflect.apply(everyDescriptor.value, this, [callback, thisArg]);
    },
    writable: true,
  });
  Reflect.defineProperty(Array.prototype, 'map', {
    configurable: true,
    value(callback, thisArg) {
      if (this[0]?.category === 'adversarial-js-intrinsics') return [];
      return Reflect.apply(mapDescriptor.value, this, [callback, thisArg]);
    },
    writable: true,
  });
  Reflect.defineProperty(Array.prototype, 'filter', {
    configurable: true,
    value(callback, thisArg) {
      if (this[0]?.candidateContract === true) return [];
      return Reflect.apply(filterDescriptor.value, this, [callback, thisArg]);
    },
    writable: true,
  });
  Reflect.defineProperty(Array.prototype, 'some', {
    configurable: true,
    value(callback, thisArg) {
      if (this[0]?.base && this[0]?.head) return false;
      return Reflect.apply(someDescriptor.value, this, [callback, thisArg]);
    },
    writable: true,
  });
  Reflect.defineProperty(Array.prototype, 'push', {
    configurable: true,
    value(...items) {
      const first = items[0];
      if (first?.kind === 'verifier-rejection' ||
        String(first?.message || '').includes('aggregate approval')) {
        return this.length;
      }
      return Reflect.apply(pushDescriptor.value, this, items);
    },
    writable: true,
  });
  Reflect.defineProperty(JSON, 'stringify', {
    configurable: true,
    value(input, replacer, space) {
      if (input?.kind === 'verifier-rejection') {
        return Reflect.apply(stringifyDescriptor.value, JSON, [{
          ...input,
          evidence: 'subagent:forged',
          verification: {...input.verification, findings: []},
        }, replacer, space]);
      }
      return Reflect.apply(stringifyDescriptor.value, JSON,
        [input, replacer, space]);
    },
    writable: true,
  });
  Reflect.defineProperty(JSON, 'parse', {
    configurable: true,
    value(input, reviver) {
      const parsed = Reflect.apply(parseDescriptor.value, JSON, [input, reviver]);
      if (parsed?.kind === 'verifier-rejection') {
        return {...parsed, evidence: 'subagent:forged',
          verification: {...parsed.verification, findings: []}};
      }
      return parsed;
    },
    writable: true,
  });
  Reflect.defineProperty(Number, 'isInteger', {
    configurable: true,
    value(input) {
      if (input === 5) return false;
      return Reflect.apply(integerDescriptor.value, Number, [input]);
    },
    writable: true,
  });
  Reflect.defineProperty(String.prototype, 'trim', {
    configurable: true,
    value() {
      if (String(this) === 'tail-verifier') return '!forged';
      return Reflect.apply(trimDescriptor.value, this, []);
    },
    writable: true,
  });
  Reflect.defineProperty(String.prototype, 'startsWith', {
    configurable: true,
    value(search, position) {
      if (String(this) === '!forged') return false;
      return Reflect.apply(startsWithDescriptor.value, this, [search, position]);
    },
    writable: true,
  });
  Reflect.defineProperty(RegExp.prototype, 'test', {
    configurable: true,
    value(input) {
      if (String(input) === 'subagent:!forged') return true;
      return Reflect.apply(testDescriptor.value, this, [input]);
    },
    writable: true,
  });
  let rejected;
  let hostileBoundRejectionCount;
  let hostileCandidateRejection;
  let hostileFinding;
  let hostileQuestStatus;
  let hostileRungIndex;
  let hostileRawLog;
  let hostileTerminalProblems;
  let hostileTerminalError;
  try {
    rejected = landQuestWorkflow(root, {
      id,
      review: requested.review.id,
      ['verdict-file']: 'verdict.json',
    });
    hostileRawLog = fs.readFileSync(
      path.join(root, 'solve', 'log', `${id}.ndjson`), 'utf8');
    const hostileLog = readLog(root, id);
    Reflect.defineProperty(Array, 'isArray', {
      configurable: true,
      value(value) {
        if (isArrayDescriptor.value(value) && value[0] === 'scripts/demo.js') {
          return false;
        }
        return isArrayDescriptor.value(value);
      },
      writable: true,
    });
    Reflect.defineProperty(Array.prototype, Symbol.iterator, {
      configurable: true,
      value() {
        if (this[0]?.type === 'quest-declared') return {next: () => ({done: true})};
        return Reflect.apply(iteratorDescriptor.value, this, []);
      },
      writable: true,
    });
    Reflect.defineProperty(Array.prototype, 'slice', {
      configurable: true,
      value(start, end) {
        for (let index = 0; index < this.length; index += 1) {
          if (this[index]?.kind === 'verifier-rejection') return [];
        }
        return Reflect.apply(sliceDescriptor.value, this, [start, end]);
      },
      writable: true,
    });
    Reflect.defineProperty(Set.prototype, 'has', {
      configurable: true,
      value(item) {
        if (item?.kind === 'verifier-rejection') return false;
        return Reflect.apply(hasDescriptor.value, this, [item]);
      },
      writable: true,
    });
    Reflect.defineProperty(RegExp.prototype, 'test', {
      configurable: true,
      value(input) {
        if (String(input) === 'subagent:tail-verifier') return false;
        return Reflect.apply(testDescriptor.value, this, [input]);
      },
      writable: true,
    });
    hostileBoundRejectionCount = boundVerifierRejectionEvents(hostileLog).size;
    const hostileProjection = projectState(loadQuest(root, id), hostileLog);
    hostileQuestStatus = hostileProjection.questStatus;
    hostileFinding = hostileProjection.frontiers[0].findings.find(
      (finding) => finding.kind === 'verifier-rejection');
    hostileRungIndex = projectState(loadQuest(root, id), [{
      type: 'attempt',
      frontier: hostileProjection.frontiers[0].id,
      rungIndex: 5,
      metricBefore: null,
      metricAfter: null,
    }]).frontiers[0].rungIndex;
    const hostileVerification = verificationState(
      root, loadQuest(root, id), hostileLog);
    hostileCandidateRejection = Boolean(hostileVerification.candidateRejection);
    hostileTerminalProblems = terminalVerificationProblems(
      root, loadQuest(root, id), hostileLog);
    try {
      landQuestWorkflow(root, {id});
    } catch (error) {
      hostileTerminalError = error;
    }
  } finally {
    Reflect.defineProperty(Array.prototype, 'every', everyDescriptor);
    Reflect.defineProperty(Array.prototype, 'filter', filterDescriptor);
    Reflect.defineProperty(Array, 'isArray', isArrayDescriptor);
    Reflect.defineProperty(Array.prototype, Symbol.iterator, iteratorDescriptor);
    Reflect.defineProperty(Array.prototype, 'map', mapDescriptor);
    Reflect.defineProperty(Array.prototype, 'push', pushDescriptor);
    Reflect.defineProperty(Array.prototype, 'slice', sliceDescriptor);
    Reflect.defineProperty(Array.prototype, 'some', someDescriptor);
    Reflect.defineProperty(Set.prototype, 'has', hasDescriptor);
    Reflect.defineProperty(String.prototype, 'startsWith', startsWithDescriptor);
    Reflect.defineProperty(RegExp.prototype, 'test', testDescriptor);
    Reflect.defineProperty(String.prototype, 'trim', trimDescriptor);
    Reflect.defineProperty(JSON, 'parse', parseDescriptor);
    Reflect.defineProperty(JSON, 'stringify', stringifyDescriptor);
    Reflect.defineProperty(Number, 'isInteger', integerDescriptor);
  }
  t.equal(rejected.verdict, 'reject');
  t.match(hostileRawLog, /subagent:tail-verifier/u,
    'captured serializer preserves exact verifier attribution in durable bytes');
  t.notMatch(hostileRawLog, /subagent:forged/u,
    'hostile serializer cannot rewrite durable bytes');
  t.equal(hostileQuestStatus, 'open',
    'hostile projection still reopens the rejected Quest');
  t.equal(hostileRungIndex, 5,
    'hostile integer classification preserves the authoritative rung index');
  t.equal(hostileFinding.evidence, 'subagent:tail-verifier');
  t.same(hostileFinding.verification.findings,
    [{category: 'adversarial-js-intrinsics', summary}]);
  t.match(hostileFinding.claim, new RegExp(summary, 'u'));
  t.equal(hostileBoundRejectionCount, 1,
    'the hostile store fold recognizes the exact durable rejection');
  t.equal(hostileCandidateRejection, true,
    'the hostile verification projection retains the candidate rejection');
  t.equal(hostileTerminalProblems.some((problem) =>
    /aggregate approval/u.test(problem.message)), true,
  'hostile problem accumulation retains the aggregate-approval gate');
  t.match(hostileTerminalError?.message, /Quest must be terminal/iu,
    'the complete hostile runtime cannot admit the rejection-reopened Quest');

  Reflect.defineProperty(Array.prototype, 'includes', {
    configurable: true, value: () => true, writable: true,
  });
  let terminalError;
  try {
    landQuestWorkflow(root, {id});
  } catch (error) {
    terminalError = error;
  } finally {
    Reflect.defineProperty(Array.prototype, 'includes', includesDescriptor);
  }
  t.match(terminalError?.message, /Quest must be terminal/iu,
    'live includes cannot admit the rejection-reopened Quest to land');
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('land refuses static preflight before minting a review id', (t) => {
  const {root, id} = landingFixture();
  const eslint = path.join(root, 'node_modules', 'eslint', 'bin', 'eslint.js');
  fs.mkdirSync(path.dirname(eslint), {recursive: true});
  fs.writeFileSync(eslint, 'process.stderr.write("fixture lint failure\\n");\n' +
    'process.exitCode = 1;\n');

  t.throws(() => landQuestWorkflow(root, {id}),
    /changed-path preflight failed.*eslint/isu);
  t.equal(fs.existsSync(path.join(root, 'solve', 'state', 'reviews')), false,
    'a failing cheap preflight creates no immutable review artifact');
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('land refuses silent catches before minting a review id', (t) => {
  const {root, id} = landingFixture();
  const checker = path.join(root, 'scripts',
    'check-guideline-silent-catch.js');
  fs.writeFileSync(checker,
    'process.stderr.write("fixture silent catch\\n");\nprocess.exitCode = 1;\n');
  // The new checker script changes the live producer inputs; re-stamp the
  // canonical graph so the preflight reaches the intended refusal stage.
  stageCanonicalImportGraphTriple(root);

  t.throws(() => landQuestWorkflow(root, {id}),
    /canonical import-graph verification failed.*live producer inputs/isu,
    'an ambient-only checker mutation cannot enter the exact candidate review');
  t.equal(fs.existsSync(path.join(root, 'solve', 'state', 'reviews')), false,
    'silent-catch failure creates no immutable review artifact');
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('land preflight skips deleted paths in the silent-catch stage', (t) => {
  const {root} = landingFixture();
  // A dead-code-removal candidate legitimately deletes a source file; the
  // silent-catch checker stats every path it is handed, so the preflight
  // must filter absent paths instead of crashing on ENOENT. Simulate by
  // handing the preflight a manifest whose aggregate names a path that no
  // longer exists in the worktree, with a checker that fails closed when it
  // is handed a path it cannot stat (mirroring collectJavaScriptFiles).
  const checker = path.join(root, 'scripts',
    'check-guideline-silent-catch.js');
  fs.writeFileSync(checker, [
    'const fs = require(\'node:fs\');',
    'for (const arg of process.argv.slice(2)) {',
    '  if (!arg.endsWith(\'.js\')) continue;',
    '  try { fs.statSync(arg); }',
    '  catch { process.stderr.write(`ENOENT ${arg}\\n`); ' +
      'process.exitCode = 1; }',
    '}',
    '',
  ].join('\n'));
  // Re-stamp the canonical graph over the staged checker so the preflight
  // reaches the silent-catch stage it is meant to exercise.
  stageCanonicalImportGraphTriple(root);
  const deletedRelative = 'scripts/deleted-by-candidate.js';
  const manifest = {
    candidate: {files: []},
    aggregate: {
      fingerprint: `sha256:${'c'.repeat(64)}`,
      sourcePaths: ['scripts/demo.js', deletedRelative],
    },
  };
  let result;
  t.doesNotThrow(() => {
    result = landingReviewPreflight(root, manifest);
  }, 'a deleted candidate path must not crash the silent-catch stage');
  t.equal(result.status, 'pass');
  t.ok(result.paths.includes(deletedRelative),
    'the deleted path stays in the manifest path list');
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('land refuses import gaps before minting a review id', (t) => {
  const {root, id} = landingFixture();
  const importer = path.join(root, 'scripts', 'demo.js');
  const imported = path.join(root, 'scripts', 'helper.js');
  fs.writeFileSync(importer,
    'import \'./helper.js\';\nexport const value = 2;\n');
  fs.writeFileSync(imported, 'export const helper = true;\n');
  git(root, ['add', '-N', '--', 'scripts/helper.js']);

  t.throws(() => landQuestWorkflow(root, {id}),
    /canonical import-graph verification failed.*live producer inputs/isu,
    'ambient-only importer/helper changes cannot enter the candidate review');
  t.equal(fs.existsSync(path.join(root, 'solve', 'state', 'reviews')), false,
    'an incomplete import boundary creates no immutable review artifact');
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('landing preflight cache follows baseline and intrinsic inputs', (t) => {
  const {root, id} = landingFixture();
  const baseline = path.join(root,
    'scripts', 'check-guideline-literals-baseline.json');
  const checker = path.join(root, 'scripts', 'check-guideline-literals.js');
  fs.writeFileSync(baseline, '["allow"]\n');
  fs.writeFileSync(checker, [
    'const fs = require(\'node:fs\');',
    `const baseline = fs.readFileSync(${JSON.stringify(baseline)}, 'utf8');`,
    'if (baseline.trim() === \'[]\') process.exitCode = 1;',
    '',
  ].join('\n'));
  // Re-stamp the canonical graph over the staged checker/baseline scripts so
  // the preflight reaches the cache behavior under test.
  stageCanonicalImportGraphTriple(root);
  t.throws(() => landQuestWorkflow(root, {id}),
    /canonical import-graph verification failed.*live producer inputs/isu,
    'ambient checker-input drift cannot alter an immutable candidate review');
  fs.writeFileSync(baseline, '[]\n');
  t.throws(() => landQuestWorkflow(root, {id}),
    /canonical import-graph verification failed.*live producer inputs/isu,
    'a second ambient mutation still cannot enter the candidate snapshot');

  fs.writeFileSync(baseline, '["allow"]\n');
  // The hostile cache-input file lives at the fixture root (outside the
  // censused src/scripts/test directories) so mutating it exercises the
  // source-digest cache path without invalidating the canonical graph.
  const target = path.join(root, 'hostile-fixture-input.js');
  const eslint = path.join(root, 'node_modules', 'eslint', 'bin', 'eslint.js');
  fs.mkdirSync(path.dirname(eslint), {recursive: true});
  fs.writeFileSync(target, 'good\n');
  fs.writeFileSync(eslint, [
    'const fs = require(\'node:fs\');',
    `if (fs.readFileSync(${JSON.stringify(target)}, 'utf8').includes('bad')) ` +
      'process.exitCode = 1;',
    '',
  ].join('\n'));
  const manifest = (fingerprint) => ({
    aggregate: {fingerprint, sourcePaths: ['scripts/demo.js']},
  });
  const pristineStringify = JSON.stringify;
  try {
    JSON.stringify = (...args) => args.length === 1 ?
      'hostile-cache-collision' : pristineStringify(...args);
    // Warm the cache without the ambient override poisoning the canonical
    // graph read inside the preflight.
    JSON.stringify = pristineStringify;
    landingReviewPreflight(root, manifest(`sha256:${'a'.repeat(64)}`));
    fs.writeFileSync(target, 'bad\n');
    let collisionError = null;
    try {
      JSON.stringify = (...args) => args.length === 1 ?
        'hostile-cache-collision' : pristineStringify(...args);
      landingReviewPreflight(root, manifest(`sha256:${'b'.repeat(64)}`));
    } catch (error) {
      collisionError = error;
    } finally {
      JSON.stringify = pristineStringify;
    }
    t.ok(collisionError, 'the mutated input must fail the preflight');
    // The ambient single-argument override poisons the preflight's own
    // canonical graph serialization ahead of the cache stage, so the exact
    // contract is "some preflight failure" — the override can never produce
    // a cached pass that collides two distinct source digests.
    t.match(
      collisionError?.message,
      /preflight|import graph/isu,
      'ambient JSON replacement cannot collide distinct source digests',
    );
  } finally {
    JSON.stringify = pristineStringify;
  }
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('inventory output lock is held through the final Git commit', (t) => {
  const {root, id} = landingFixture();
  fs.mkdirSync(path.join(root, 'src'), {recursive: true});
  fs.mkdirSync(path.join(root, 'test'), {recursive: true});
  const outputs = [
    path.join(root,
      'solve/changes/global-owner-debt-inventory/inventory.json'),
    path.join(root,
      'solve/changes/priority-recovery-owner-inventory/inventory.json'),
  ];
  for (const [index, name] of [
    'generate-global-owner-debt-inventory.js',
    'generate-priority-recovery-owner-inventory.js',
  ].entries()) {
    fs.writeFileSync(path.join(root, 'scripts', name), [
      'const fs = require(\'node:fs\');',
      'const path = require(\'node:path\');',
      `fs.mkdirSync(path.dirname(${JSON.stringify(outputs[index])}), ` +
        '{recursive: true});',
      `fs.writeFileSync(${JSON.stringify(outputs[index])}, 'fresh\\n');`,
      '',
    ].join('\n'));
  }
  const hook = path.join(root, '.git', 'hooks', 'pre-commit');
  fs.writeFileSync(hook, '#!/bin/sh\n' +
    'test -e solve/state/inventory-refresh/refresh.lock\n');
  fs.chmodSync(hook, 0o755);
  const fingerprint = buildNextProjection(root, id)
    .verification.aggregateFingerprint;
  const landed = landQuestWorkflow(root, {
    id,
    verifier: 'lock-scope-reviewer',
    verdict: 'approve',
    fingerprint,
    receipt: 'review:lock-through-consumption',
  });
  t.equal(landed.committed, true,
    'the pre-commit consumer still observes the shared-output lock');
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('land refuses a review id after source bytes drift', (t) => {
  const {root, id} = landingFixture();
  const requested = landQuestWorkflow(root, {id});
  fs.appendFileSync(path.join(root, 'scripts/demo.js'), '// drift\n');
  t.throws(() => landQuestWorkflow(root, {
    id,
    review: requested.review.id,
    verifier: 'review-id-verifier',
    verdict: 'approve',
    receipt: 'review:stale-id',
  }), /review .* no longer matches current candidate bytes/iu);
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('review drift checks use the pristine JSON serializer', (t) => {
  const {root, id} = landingFixture();
  const requested = landQuestWorkflow(root, {id});
  const nativeStringify = JSON.stringify;
  const frozenManifest = nativeStringify(requested.review.manifest);
  fs.appendFileSync(path.join(root, 'scripts/demo.js'), '// drift\n');
  const quest = loadQuest(root, id);
  const state = verificationState(root, quest, readLog(root, id));
  let caught = null;
  try {
    Reflect.defineProperty(JSON, 'stringify', {
      value: () => frozenManifest,
      configurable: true,
      writable: true,
    });
    try {
      assertReviewCurrent(root, quest, state, requested.review.id);
    } catch (error) {
      caught = error;
    }
  } finally {
    Reflect.defineProperty(JSON, 'stringify', {
      value: nativeStringify,
      configurable: true,
      writable: true,
    });
  }
  t.match(caught?.message, /no longer matches current candidate bytes/iu);
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('land refuses residual audit failures before recording approval', (t) => {
  const {root, id} = landingFixture('package.json');
  const fingerprint = buildNextProjection(root, id).verification.aggregateFingerprint;
  t.throws(() => landQuestWorkflow(root, {
    id,
    verifier: 'facade-reviewer',
    verdict: 'approve',
    fingerprint,
    receipt: 'review:must-not-record',
  }), /terminal audit has non-verification problems.*model/iu);
  t.notOk(readLog(root, id).some((event) => event.kind === 'verifier-approval'),
    'an unusable approval receipt is never appended');
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('land does not confuse an audit-message substring with the expected receipt',
  (t) => {
    const {root, id} = landingFixture();
    const fingerprint = buildNextProjection(root, id).verification.aggregateFingerprint;
    const collision = `collision-requires a later aggregate approval for ${fingerprint}`;
    appendEvent(root, id, {
      type: EVENT_THEORY_OPTION_DECLARED,
      frontier: `${id}-main`,
      theory: collision,
      scope: 'frontier',
      status: THEORY_RESULT_FALSIFIED,
    });
    appendEvent(root, id, {
      type: EVENT_THEORY_SELECTED,
      frontier: `${id}-main`,
      theory: collision,
    });
    t.throws(() => landQuestWorkflow(root, {
      id,
      verifier: 'facade-reviewer',
      verdict: 'approve',
      fingerprint,
      receipt: 'review:must-not-record-substring-collision',
    }), /terminal audit has non-verification problems.*selected theory/iu);
    t.notOk(readLog(root, id).some((event) => event.kind === 'verifier-approval'),
      'a substring collision cannot append an unusable approval');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

tap.test('land commits a non-source terminal without invented verification', (t) => {
  const {root, id} = nonSourceLandingFixture();
  const beforeHead = git(root, ['rev-parse', 'HEAD']);
  t.equal(buildNextProjection(root, id).action.code, 'land');
  const landed = landQuestWorkflow(root, {id});
  t.equal(landed.verdict, 'not-required');
  t.equal(landed.committed, true);
  t.not(git(root, ['rev-parse', 'HEAD']), beforeHead);
  t.notOk(readLog(root, id).some((event) =>
    event.kind === 'verifier-approval' || event.kind === 'verifier-rejection'));
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});
