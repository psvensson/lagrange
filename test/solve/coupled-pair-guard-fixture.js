import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

import {buildManifest} from '../../scripts/checks/test-primary-classification.js';
import {
  IMPORT_GRAPH_PATH,
  IMPORT_GRAPH_SEAL_PATH,
} from '../../scripts/checks/impact-proof-cone-constants.js';
import {OWNER_DEBT} from '../../scripts/global-owner-debt-inventory/constants.js';
import {
  fileIdentity,
  importGraphResolverStateDigest,
  javascriptSourceDigest,
  listImportGraphInputFiles,
  listJavaScriptFiles,
} from '../../scripts/global-owner-debt-inventory/helpers.js';
import {runStep} from '../../scripts/solve/step.js';
import {saveQuest} from '../../scripts/solve/store.js';

const SOURCE_PATHS = Object.freeze([
  'scripts/left-a.js',
  'scripts/left-b.js',
  'scripts/right.js',
]);
const WITNESS_PATH = 'test/pair-witness.test.js';
const OTHER_WITNESS_PATH = 'test/other-witness.test.js';
const REGISTRY_PATH = 'test/shards/impact-contracts.json';
const PRODUCER_PATH = 'scripts/generate-global-owner-debt-inventory.js';
const PRIMARY_CLASSES_PATH = 'test/shards/primary-classes.json';
const GIT_COMMAND = 'git';
const UTF8_ENCODING = 'utf8';
const STDIO_IGNORE = 'ignore';
const STDIO_PIPE = 'pipe';
const DEFAULT_DESCRIPTION = 'fixture';
const REGISTRY_ID = 'impact-contracts';
const CONTRACT_ID = 'left-right-contract';
const PAIR_ID = 'left-right';
const LEFT_ENDPOINT_ID = 'left';
const RIGHT_ENDPOINT_ID = 'right';
const CONTRACT_DESCRIPTION = 'Both coupled owners are exercised together.';
const PAIR_DESCRIPTION =
  'Left-side behavior is coupled to right-side admission.';
const PRODUCER_SOURCE =
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
const GIT_INIT_ARGS = Object.freeze(['init']);
const GIT_EMAIL_ARGS = Object.freeze([
  'config', 'user.email', 'solver@example.com',
]);
const GIT_NAME_ARGS = Object.freeze(['config', 'user.name', 'Solver']);
const GIT_GPG_ARGS = Object.freeze(['config', 'commit.gpgsign', 'false']);
const PACKAGE_PATH = 'package.json';
const PACKAGE_SOURCE = '{"type":"module"}\n';
const SOURCE_BEFORE = 'export const state = \'before\';\n';
const OTHER_WITNESS_SOURCE = 'export const otherWitness = true;\n';
const GIT_ADD_ARGS = Object.freeze(['add', '-A']);
const GIT_COMMIT_ARGS = Object.freeze(['commit', '-m', 'base']);
const GIT_STATUS_ARGS = Object.freeze(['status', '--porcelain', '--']);
const GIT_GRAPH_CONTEXT_COMMIT_ARGS = Object.freeze([
  'commit', '--only', '--quiet', '-m', 'canonical graph context', '--',
]);
const GIT_REGISTRY_CONTEXT_COMMIT_ARGS = Object.freeze([
  'commit', '--only', '--quiet', '-m', 'registry context', '--',
]);

function git(root, args) {
  return execFileSync(GIT_COMMAND, args, {
    cwd: root,
    encoding: UTF8_ENCODING,
    stdio: [STDIO_IGNORE, STDIO_PIPE, STDIO_PIPE],
  }).trim();
}

function writeFile(root, relative, content) {
  const absolute = path.join(root, relative);
  fs.mkdirSync(path.dirname(absolute), {recursive: true});
  fs.writeFileSync(absolute, content);
}

function coupledPairManifest({
  withContract = true,
  description = DEFAULT_DESCRIPTION,
}) {
  return {
    schemaVersion: 2,
    id: REGISTRY_ID,
    description,
    contracts: withContract ? {
      [CONTRACT_ID]: {
        description: CONTRACT_DESCRIPTION,
        owners: [...SOURCE_PATHS],
        tests: [WITNESS_PATH],
      },
    } : {},
    coupledPairs: {
      [PAIR_ID]: {
        description: PAIR_DESCRIPTION,
        endpoints: [
          {id: LEFT_ENDPOINT_ID, owners: SOURCE_PATHS.slice(0, 2)},
          {id: RIGHT_ENDPOINT_ID, owners: [SOURCE_PATHS[2]]},
        ],
        contract: CONTRACT_ID,
        witnessTests: [WITNESS_PATH],
      },
    },
  };
}

function writeRegistry(root, manifest) {
  writeFile(root, REGISTRY_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
}

function writeCanonicalProducer(root) {
  writeFile(root, PRODUCER_PATH, PRODUCER_SOURCE);
}

function refreshCanonicalGraph(root) {
  const files = listJavaScriptFiles(root);
  const producerInputs = listImportGraphInputFiles(root);
  const resolverInputs = [];
  const degrees = Object.fromEntries(
    files.map((filePath) => [filePath, {in: 0, out: 0}]),
  );
  degrees[SOURCE_PATHS[0]].in = 1;
  degrees[WITNESS_PATH].out = 1;
  const graph = {
    schemaVersion: OWNER_DEBT.importGraphSchemaVersion,
    sourceDigest: javascriptSourceDigest(root, files),
    producerInputDigest: javascriptSourceDigest(root, producerInputs),
    fileDigests: Object.fromEntries(files.map((filePath) => [
      filePath,
      fileIdentity(root, filePath).sha256,
    ])),
    followedFileDigests: {},
    resolverInputs,
    resolverStateDigest: importGraphResolverStateDigest(root, resolverInputs),
    moduleCount: files.length,
    edgeCount: 1,
    unresolvedCount: 0,
    degrees,
    importers: {[SOURCE_PATHS[0]]: [WITNESS_PATH]},
  };
  graph.snapshotDigest = crypto.createHash(OWNER_DEBT.hashAlgorithm)
    .update(JSON.stringify(graph)).digest(OWNER_DEBT.hashEncoding);
  writeFile(root, IMPORT_GRAPH_PATH, `${JSON.stringify(graph)}\n`);
  writeFile(root, IMPORT_GRAPH_SEAL_PATH, `${JSON.stringify({
    schemaVersion: 1,
    importGraphSchemaVersion: graph.schemaVersion,
    sourceDigest: graph.sourceDigest,
    producerInputDigest: graph.producerInputDigest,
    resolverStateDigest: graph.resolverStateDigest,
    snapshotDigest: graph.snapshotDigest,
  }, null, 2)}\n`);
}

export function createCoupledPairFixture({
  withContract = true,
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'coupled-pair-guard-'));
  git(root, GIT_INIT_ARGS);
  git(root, GIT_EMAIL_ARGS);
  git(root, GIT_NAME_ARGS);
  git(root, GIT_GPG_ARGS);
  writeFile(root, PACKAGE_PATH, PACKAGE_SOURCE);
  for (const sourcePath of SOURCE_PATHS) {
    writeFile(root, sourcePath, SOURCE_BEFORE);
  }
  writeFile(root, WITNESS_PATH, `import '../${SOURCE_PATHS[0]}';\n`);
  writeFile(root, OTHER_WITNESS_PATH, OTHER_WITNESS_SOURCE);
  writeCanonicalProducer(root);
  const registry = coupledPairManifest({withContract});
  writeRegistry(root, registry);
  writeFile(root, PRIMARY_CLASSES_PATH,
    `${JSON.stringify(buildManifest(root), null, 2)}\n`);
  refreshCanonicalGraph(root);

  const id = 'coupled-pair-fixture';
  const oracle = path.join(root, 'solve', 'oracle', `${id}.json`);
  writeFile(root, path.relative(root, oracle), JSON.stringify({metric: 2, target: 0}));
  const metric = {probe: 'oracle', args: {file: oracle}};
  const quest = {
    id,
    authoringContractVersion: 1,
    verificationContractVersion: 2,
    statement: 'The coupled-pair landing fixture reaches zero.',
    priority: 1,
    class: 'process',
    links: {specRef: 'solve/epics/coupled-pair-fixture.md'},
    doneWhen: metric,
    frontiers: [{id: `${id}-main`, priority: 1, metric}],
    constraints: [],
  };
  saveQuest(root, quest);
  git(root, GIT_ADD_ARGS);
  git(root, GIT_COMMIT_ARGS);
  runStep(root, quest);

  let attemptNumber = 0;
  function record(values, metricValue) {
    if (attemptNumber > 0) runStep(root, quest);
    attemptNumber += 1;
    for (const [sourcePath, value] of Object.entries(values)) {
      writeFile(root, sourcePath, `export const state = '${value}';\n`);
    }
    fs.writeFileSync(oracle, JSON.stringify({metric: metricValue, target: 0}));
    // The refreshed canonical graph is tracked fixture context outside the
    // recorded candidate: a dirty graph/seal outside the recorded attempt
    // union would block the landing, so it lands in a context commit. The
    // candidate base stays the step-pinned base (the context commit touches
    // no candidate path), and the review snapshot copies the ambient triple,
    // which now matches the live tree the snapshot reproduces.
    refreshCanonicalGraph(root);
    const graphDelta = git(root, [...GIT_STATUS_ARGS,
      IMPORT_GRAPH_PATH, IMPORT_GRAPH_SEAL_PATH]);
    if (String(graphDelta).trim()) {
      git(root, [...GIT_GRAPH_CONTEXT_COMMIT_ARGS,
        IMPORT_GRAPH_PATH, IMPORT_GRAPH_SEAL_PATH]);
    }
    const content = git(root, [
      'diff', '--binary', '--full-index', '--no-ext-diff', 'HEAD', '--',
      ...SOURCE_PATHS, REGISTRY_PATH,
    ]);
    const artifact = path.join(
      root, 'solve', 'changes', id, `candidate-${attemptNumber}.diff`);
    fs.mkdirSync(path.dirname(artifact), {recursive: true});
    fs.writeFileSync(artifact, `${content}\n`);
    return runStep(root, quest, {
      changeRef: `diff:${path.relative(root, artifact)}`,
      summary: `record coupled-pair fixture attempt ${attemptNumber}`,
    });
  }

  return {
    root,
    id,
    quest,
    record,
    registryPath: path.join(root, REGISTRY_PATH),
    rewriteRegistry(options) {
      writeRegistry(root, coupledPairManifest(options));
    },
    mutateRegistry(mutate) {
      const manifest = JSON.parse(fs.readFileSync(
        path.join(root, REGISTRY_PATH), UTF8_ENCODING));
      mutate(manifest);
      writeRegistry(root, manifest);
    },
    deleteRegistry() {
      fs.rmSync(path.join(root, REGISTRY_PATH));
    },
    // Registry drift that another landing already committed: the rewritten
    // registry is tracked context outside the recorded candidate, and a
    // dirty uncovered path would block the landing before any review check.
    commitRegistryContext() {
      git(root, [...GIT_REGISTRY_CONTEXT_COMMIT_ARGS, REGISTRY_PATH]);
    },
  };
}

export function removeCoupledPairFixture(fixture) {
  fs.rmSync(fixture.root, {recursive: true, force: true});
}
