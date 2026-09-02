import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  loadImpactContractRegistry,
} from '../../scripts/checks/impact-contract-registry.js';
import {
  OWNER_DEBT,
  OWNER_DEBT_RESOLVER_STATE,
} from '../../scripts/global-owner-debt-inventory/constants.js';
import {
  fileIdentity,
  importGraphResolverStateDigest,
  javascriptSourceDigest,
  listImportGraphInputFiles,
  listJavaScriptFiles,
} from '../../scripts/global-owner-debt-inventory/helpers.js';
import {
  assertRunnableProofSelection,
  selectProofCone,
  selectRunnableFullProofCensus,
  testImpactDecision,
} from '../../scripts/checks/impact-proof-cone.js';
import {
  REASON_SEMANTIC_CONTRACT,
  MODE_FATAL,
} from '../../scripts/checks/impact-proof-cone-constants.js';
import {
  buildManifest as buildPrimaryManifest,
} from '../../scripts/checks/test-primary-classification.js';
import {evaluateCoverage} from
  '../../scripts/checks/impact-proof-cone-inputs.js';
import {
  canonicalImportGraphProblem,
  landingReviewPreflight,
  landingProofConeFromSelection,
} from '../../scripts/solve/landing-preflight.js';

function writeFixture(rootDirectory, relativePath, content = '') {
  const absolute = path.join(rootDirectory, relativePath);
  fs.mkdirSync(path.dirname(absolute), {recursive: true});
  fs.writeFileSync(absolute, content);
}

function importGraphPath(rootDirectory) {
  return path.join(rootDirectory,
    'test-output/analysis/global-owner-debt-import-graph.json');
}

function rewriteImportGraph(rootDirectory, mutate) {
  const graphPath = importGraphPath(rootDirectory);
  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  mutate(graph);
  delete graph.snapshotDigest;
  graph.snapshotDigest = crypto.createHash(OWNER_DEBT.hashAlgorithm)
    .update(JSON.stringify(graph)).digest(OWNER_DEBT.hashEncoding);
  fs.writeFileSync(graphPath, JSON.stringify(graph));
}

function rewriteImportGraphAndSeal(rootDirectory, mutate) {
  rewriteImportGraph(rootDirectory, mutate);
  const graph = JSON.parse(fs.readFileSync(
    importGraphPath(rootDirectory), 'utf8'));
  writeFixture(
    rootDirectory,
    'test/shards/impact-graph-seal.json',
    JSON.stringify({
      schemaVersion: 1,
      importGraphSchemaVersion: graph.schemaVersion,
      sourceDigest: graph.sourceDigest,
      producerInputDigest: graph.producerInputDigest,
      resolverStateDigest: graph.resolverStateDigest,
      snapshotDigest: graph.snapshotDigest,
    }),
  );
}

function rewriteCoverage(rootDirectory, mutate) {
  const coveragePath = path.join(
    rootDirectory, 'test/shards/impact-coverage.json');
  const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
  mutate(coverage);
  fs.writeFileSync(coveragePath, JSON.stringify(coverage));
}

function addFollowedModuleEvidence(
  rootDirectory, graph, modulePath, canonicalPath = modulePath) {
  if (!Object.hasOwn(graph.degrees, modulePath)) {
    graph.degrees[modulePath] = {in: 0, out: 0};
    graph.moduleCount += 1;
  }
  graph.followedFileDigests[canonicalPath] = fileIdentity(
    rootDirectory, canonicalPath).sha256;
}

function assertFullCensus(rootDirectory, changedPath = 'src/exact-owner.js') {
  const {selection, problems} = selectProofCone(rootDirectory, [changedPath]);
  assert.equal(selection.fullSuite, true);
  assert.equal(selection.selectedTests.length, selection.counts.totalTests);
  assert.ok(problems.length > 0);
}

function selectorFixture() {
  const rootDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'impact-proof-cone-'));
  const sourcePaths = [
    'src/exact-owner.js',
    'src/directory/owner.js',
    'src/stem-owner.js',
    'src/multi-owner.js',
  ];
  const testPaths = [
    'test/exact.test.js',
    'test/directory.test.js',
    'test/stem.test.js',
    'test/multi-a.test.js',
    'test/multi-b.test.js',
  ];
  for (const sourcePath of sourcePaths) {
    writeFixture(rootDirectory, sourcePath, 'export default 1;\n');
  }
  for (const testPath of testPaths) writeFixture(rootDirectory, testPath);
  writeFixture(rootDirectory, 'examples/graph-input.js', 'export default 1;\n');
  writeFixture(rootDirectory, 'package.json', '{"type":"module"}\n');
  writeFixture(rootDirectory, 'README.md', 'fixture\n');
  writeFixture(
    rootDirectory,
    'node_modules/fixture-package/package.json',
    '{"name":"fixture-package","type":"module","exports":"./dist/index.js"}\n',
  );
  fs.mkdirSync(path.join(
    rootDirectory, 'node_modules/fixture-package/dist'), {recursive: true});
  writeFixture(
    rootDirectory,
    'test/exact.test.js',
    'import \'../src/exact-owner.js\';\n',
  );
  writeFixture(
    rootDirectory,
    'scripts/generate-global-owner-debt-inventory.js',
    'import crypto from \'node:crypto\';\n' +
    'import fs from \'node:fs\';\n' +
    'const graphBytes = fs.readFileSync(' +
      '\'test-output/analysis/global-owner-debt-import-graph.json\');\n' +
    'const sealBytes = fs.readFileSync(\'test/shards/impact-graph-seal.json\');\n' +
    'const digest = (bytes) => crypto.createHash(\'sha256\')' +
      '.update(bytes).digest(\'hex\');\n' +
    'process.stdout.write(JSON.stringify({\n' +
    '  snapshotDigest: JSON.parse(graphBytes).snapshotDigest,\n' +
    '  graphByteDigest: digest(graphBytes),\n' +
    '  sealByteDigest: digest(sealBytes),\n' +
    '}) + \'\\n\');\n',
  );
  const primaryManifest = buildPrimaryManifest(rootDirectory);
  writeFixture(
    rootDirectory,
    'test/shards/primary-classes.json',
    JSON.stringify(primaryManifest),
  );
  const contracts = {
    schemaVersion: 2,
    id: 'impact-contracts',
    contracts: {
      'exact': {
        description: 'Exact owner contract.',
        owners: ['src/exact-owner.js'],
        tests: ['test/exact.test.js'],
      },
      'directory': {
        description: 'Directory owner contract.',
        owners: ['src/directory/'],
        tests: ['test/directory.test.js'],
      },
      'stem': {
        description: 'Legacy stem owner contract.',
        owners: ['src/stem-'],
        tests: ['test/stem.test.js'],
      },
      'multi-a': {
        description: 'First multi-owner contract.',
        owners: ['src/multi-owner.js'],
        tests: ['test/multi-a.test.js'],
      },
      'multi-b': {
        description: 'Second multi-owner contract.',
        owners: ['src/multi-owner.js'],
        tests: ['test/multi-b.test.js'],
      },
      'pair': {
        description: 'Fixture coupled-pair contract.',
        owners: ['src/exact-owner.js', 'src/directory/'],
        tests: ['test/exact.test.js'],
      },
    },
    coupledPairs: {
      'fixture-pair': {
        description: 'Fixture exact and directory coupling.',
        endpoints: [
          {id: 'exact', owners: ['src/exact-owner.js']},
          {id: 'directory', owners: ['src/directory/']},
        ],
        contract: 'pair',
        witnessTests: ['test/exact.test.js'],
      },
    },
  };
  writeFixture(
    rootDirectory,
    'test/shards/impact-contracts.json',
    JSON.stringify(contracts),
  );
  const javascriptFiles = listJavaScriptFiles(rootDirectory);
  const producerInputFiles = listImportGraphInputFiles(rootDirectory);
  const resolverInputs = [{
    from: 'src/exact-owner.js',
    specifier: 'fixture-package',
    state: OWNER_DEBT_RESOLVER_STATE.unresolved,
  }];
  const resolverStateDigest = importGraphResolverStateDigest(
    rootDirectory, resolverInputs);
  const degrees = Object.fromEntries(
    javascriptFiles.map((filePath) => [filePath, {in: 0, out: 0}]),
  );
  degrees['src/exact-owner.js'].in = 1;
  degrees['test/exact.test.js'].out = 1;
  const importGraph = {
    schemaVersion: OWNER_DEBT.importGraphSchemaVersion,
    sourceDigest: javascriptSourceDigest(rootDirectory, javascriptFiles),
    producerInputDigest: javascriptSourceDigest(
      rootDirectory, producerInputFiles),
    fileDigests: Object.fromEntries(javascriptFiles.map((filePath) => [
      filePath,
      fileIdentity(rootDirectory, filePath).sha256,
    ])),
    followedFileDigests: {},
    resolverInputs,
    resolverStateDigest,
    moduleCount: javascriptFiles.length,
    edgeCount: 1,
    unresolvedCount: 0,
    degrees,
    importers: {'src/exact-owner.js': ['test/exact.test.js']},
  };
  importGraph.snapshotDigest = crypto.createHash(OWNER_DEBT.hashAlgorithm)
    .update(JSON.stringify(importGraph)).digest(OWNER_DEBT.hashEncoding);
  writeFixture(
    rootDirectory,
    'test-output/analysis/global-owner-debt-import-graph.json',
    JSON.stringify(importGraph),
  );
  writeFixture(
    rootDirectory,
    'test/shards/impact-graph-seal.json',
    JSON.stringify({
      schemaVersion: 1,
      importGraphSchemaVersion: importGraph.schemaVersion,
      sourceDigest: importGraph.sourceDigest,
      producerInputDigest: importGraph.producerInputDigest,
      resolverStateDigest: importGraph.resolverStateDigest,
      snapshotDigest: importGraph.snapshotDigest,
    }),
  );
  writeFixture(
    rootDirectory,
    'test/shards/impact-coverage.json',
    JSON.stringify({
      schemaVersion: 1,
      sourceDigest: 'a'.repeat(64),
      fileDigests: Object.fromEntries(sourcePaths.map((sourcePath) => [
        sourcePath,
        fileIdentity(rootDirectory, sourcePath).sha256,
      ])),
      tests: {
        'test/exact.test.js': ['src/exact-owner.js'],
        'test/directory.test.js': ['src/directory/owner.js'],
        'test/stem.test.js': ['src/stem-owner.js'],
        'test/multi-a.test.js': ['src/multi-owner.js'],
        'test/multi-b.test.js': ['src/multi-owner.js'],
      },
    }),
  );
  return {rootDirectory, contracts, primaryManifest};
}

function withSelectorFixture(callback) {
  const fixture = selectorFixture();
  try {
    return callback(fixture);
  } finally {
    fs.rmSync(fixture.rootDirectory, {recursive: true, force: true});
  }
}

test('exact, directory, and legacy stem owners select their claimant tests', () => {
  withSelectorFixture(({rootDirectory}) => {
    const cases = [
      ['src/exact-owner.js', 'exact', 'test/exact.test.js'],
      ['src/directory/owner.js', 'directory', 'test/directory.test.js'],
      ['src/stem-owner.js', 'stem', 'test/stem.test.js'],
    ];
    for (const [changedPath, contract, claimant] of cases) {
      const {selection, problems} = selectProofCone(rootDirectory, [changedPath]);
      assert.deepEqual(problems, []);
      assert.equal(selection.fullSuite, false);
      assert.ok(selection.changedContracts.includes(contract));
      assert.ok(selection.selectedTests.includes(claimant));
    }
  });
});

test('multi-contract claimant reasons name only the edge each test exercises', () => {
  withSelectorFixture(({rootDirectory}) => {
    const {selection, problems} = selectProofCone(
      rootDirectory, ['src/multi-owner.js']);
    assert.deepEqual(problems, []);
    assert.equal(selection.fullSuite, false);
    const semanticReasons = (testPath) => selection.testReasons[testPath]
      .filter((reason) => reason.startsWith(`${REASON_SEMANTIC_CONTRACT}:`));
    assert.deepEqual(semanticReasons('test/multi-a.test.js'),
      [`${REASON_SEMANTIC_CONTRACT}:multi-a`]);
    assert.deepEqual(semanticReasons('test/multi-b.test.js'),
      [`${REASON_SEMANTIC_CONTRACT}:multi-b`]);
  });
});

test('malformed contracts input preserves the primary census on full escalation', () => {
  withSelectorFixture(({rootDirectory}) => {
    writeFixture(rootDirectory, 'test/shards/impact-contracts.json', '{');
    const {selection, problems} = selectProofCone(
      rootDirectory, ['src/exact-owner.js']);
    assert.equal(selection.fullSuite, true);
    assert.equal(selection.counts.totalTests, 5);
    assert.equal(selection.selectedTests.length, selection.counts.totalTests);
    assert.ok(problems.some((problem) => problem.includes('invalid JSON')));
  });
});

test('invalid primary manifests derive a live full census instead of trusting stored classes', () => {
  const invalidPrimary = [
    () => '{',
    (manifest) => JSON.stringify({...manifest, classes: {}}),
    (manifest) => {
      const withoutClasses = {...manifest};
      delete withoutClasses.classes;
      return JSON.stringify(withoutClasses);
    },
  ];
  for (const buildInvalid of invalidPrimary) {
    withSelectorFixture(({rootDirectory, primaryManifest}) => {
      writeFixture(
        rootDirectory,
        'test/shards/primary-classes.json',
        buildInvalid(primaryManifest),
      );
      const {selection, problems} = selectProofCone(
        rootDirectory, ['src/exact-owner.js']);
      assert.equal(selection.fullSuite, true);
      assert.equal(selection.counts.totalTests, 5);
      assert.equal(selection.selectedTests.length, selection.counts.totalTests);
      assert.ok(problems.length > 0);
    });
  }
});

test('malformed import graph shapes fail closed to the verified census', () => {
  const invalidGraphs = [
    null,
    {},
    {sourceDigest: 'fixture', importers: []},
    {sourceDigest: 'fixture', importers: {'src/exact-owner.js': 2}},
    {sourceDigest: 'fixture', importers: {'src/exact-owner.js': [2]}},
  ];
  for (const invalidGraph of invalidGraphs) {
    withSelectorFixture(({rootDirectory}) => {
      writeFixture(
        rootDirectory,
        'test-output/analysis/global-owner-debt-import-graph.json',
        JSON.stringify(invalidGraph),
      );
      const {selection, problems} = selectProofCone(
        rootDirectory, ['src/exact-owner.js']);
      assert.equal(selection.fullSuite, true);
      assert.equal(selection.selectedTests.length, 5);
      assert.ok(problems.some((problem) => problem.includes('import graph')));
    });
  }
});

test('malformed coverage edge shapes fail closed without iterating non-arrays', () => {
  withSelectorFixture(({rootDirectory}) => {
    writeFixture(
      rootDirectory,
      'test/shards/impact-coverage.json',
      JSON.stringify({
        schemaVersion: 1,
        sourceDigest: 'fixture',
        fileDigests: {},
        tests: {'test/exact.test.js': 2},
      }),
    );
    const {selection, problems} = selectProofCone(
      rootDirectory, ['src/exact-owner.js']);
    assert.equal(selection.fullSuite, true);
    assert.equal(selection.selectedTests.length, 5);
    assert.ok(problems.some((problem) => problem.includes('coverage snapshot')));
  });
});

test('coverage freshness refuses missing, empty, and malformed content digests', () => {
  const invalidDigests = [undefined, '', 'not-a-sha256-digest'];
  for (const invalidDigest of invalidDigests) {
    withSelectorFixture(({rootDirectory}) => {
      const fileDigests = invalidDigest === undefined ? {} :
        {'src/exact-owner.js': invalidDigest};
      writeFixture(
        rootDirectory,
        'test/shards/impact-coverage.json',
        JSON.stringify({
          schemaVersion: 1,
          sourceDigest: 'a'.repeat(64),
          fileDigests,
          tests: {'test/exact.test.js': ['src/exact-owner.js']},
        }),
      );
      const {selection, problems} = selectProofCone(
        rootDirectory, ['src/exact-owner.js']);
      assert.equal(selection.fullSuite, true);
      assert.equal(selection.selectedTests.length, 5);
      assert.ok(problems.some((problem) => problem.includes('coverage snapshot')));
    });
  }
});

test('coverage share refuses tests outside the verified primary census', () => {
  withSelectorFixture(({rootDirectory}) => {
    writeFixture(
      rootDirectory,
      'test/shards/impact-coverage.json',
      JSON.stringify({
        schemaVersion: 1,
        sourceDigest: 'a'.repeat(64),
        fileDigests: {},
        tests: {'test/ghost.test.js': []},
      }),
    );
    const {selection, problems} = selectProofCone(
      rootDirectory, ['src/exact-owner.js']);
    assert.equal(selection.fullSuite, true);
    assert.equal(selection.selectedTests.length, 5);
    assert.ok(problems.some((problem) => problem.includes('non-primary test')));
  });
});

test('import graph source identity and edge evidence cannot be replaced by emptiness', () => {
  withSelectorFixture(({rootDirectory}) => {
    const graphPath = path.join(rootDirectory,
      'test-output/analysis/global-owner-debt-import-graph.json');
    const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
    graph.sourceDigest = 'f'.repeat(64);
    graph.importers = {};
    graph.edgeCount = 1;
    graph.unresolvedCount = 1;
    fs.writeFileSync(graphPath, JSON.stringify(graph));
    const {selection, problems} = selectProofCone(
      rootDirectory, ['src/exact-owner.js']);
    assert.equal(selection.fullSuite, true);
    assert.equal(selection.selectedTests.length, 5);
    assert.ok(problems.some((problem) => problem.includes('import graph')));
  });
});

test('self-consistent import graph forgeries cannot replace the canonical producer', () => {
  withSelectorFixture(({rootDirectory}) => {
    rewriteImportGraph(rootDirectory, (graph) => {
      graph.degrees['src/exact-owner.js'].in = 0;
      graph.degrees['src/directory/owner.js'].in = 1;
      graph.importers = {
        'src/directory/owner.js': ['test/exact.test.js'],
      };
    });
    assertFullCensus(rootDirectory);
  });
});

test('import graph live source and file identities survive a rebound self-hash', () => {
  const mutations = [
    (graph) => {
      graph.sourceDigest = 'f'.repeat(64);
    },
    (graph) => {
      graph.fileDigests['src/exact-owner.js'] = 'f'.repeat(64);
    },
  ];
  for (const mutate of mutations) {
    withSelectorFixture(({rootDirectory}) => {
      rewriteImportGraph(rootDirectory, mutate);
      assertFullCensus(rootDirectory);
    });
  }
  withSelectorFixture(({rootDirectory}) => {
    writeFixture(rootDirectory, 'src/exact-owner.js', 'export const changed = true;\n');
    assertFullCensus(rootDirectory);
  });
});

test('live graph cache invalidates same-size rewrites with restored mtime', () => {
  withSelectorFixture(({rootDirectory}) => {
    const first = selectProofCone(rootDirectory, ['src/exact-owner.js']);
    assert.deepEqual(first.problems, []);
    const sourcePath = path.join(rootDirectory, 'src/exact-owner.js');
    const before = fs.statSync(sourcePath);
    fs.writeFileSync(sourcePath, 'export default 2;\n');
    fs.utimesSync(sourcePath, before.atime, before.mtime);
    assertFullCensus(rootDirectory);
  });
});

test('followed transitive module content invalidates same-size cached evidence', () => {
  withSelectorFixture(({rootDirectory}) => {
    const followedPath = 'workspace/transitive.js';
    writeFixture(rootDirectory, followedPath, 'export default 1;\n');
    rewriteImportGraphAndSeal(rootDirectory, (graph) => {
      addFollowedModuleEvidence(rootDirectory, graph, followedPath);
    });
    assert.deepEqual(selectProofCone(
      rootDirectory, ['src/exact-owner.js']).problems, []);
    const absolute = path.join(rootDirectory, followedPath);
    const before = fs.statSync(absolute);
    fs.writeFileSync(absolute, 'export default 2;\n');
    fs.utimesSync(absolute, before.atime, before.mtime);
    assertFullCensus(rootDirectory);
  });
});

test('followed module evidence binds a regular package nested workspace symlink', () => {
  withSelectorFixture(({rootDirectory}) => {
    const modulePath = 'node_modules/fixture-package/dist/nested.js';
    const canonicalPath = 'workspace/nested.js';
    writeFixture(rootDirectory, canonicalPath, 'export default 1;\n');
    fs.symlinkSync('../../../workspace/nested.js', path.join(
      rootDirectory, modulePath));
    rewriteImportGraphAndSeal(rootDirectory, (graph) => {
      addFollowedModuleEvidence(
        rootDirectory, graph, modulePath, canonicalPath);
      const resolvedInputs = [{
        from: 'src/exact-owner.js',
        specifier: 'fixture-package',
        state: OWNER_DEBT_RESOLVER_STATE.resolved,
        target: modulePath,
      }];
      graph.resolverInputs = resolvedInputs;
      graph.resolverStateDigest = importGraphResolverStateDigest(
        rootDirectory, resolvedInputs);
    });
    assert.deepEqual(selectProofCone(
      rootDirectory, ['src/exact-owner.js']).problems, []);
    writeFixture(rootDirectory, canonicalPath, 'export default 2;\n');
    assertFullCensus(rootDirectory);
  });
});

test('followed file digest schema and live census fail closed', () => {
  const cases = [
    {
      name: 'missing field',
      mutate: (rootDirectory, graph) => {
        delete graph.followedFileDigests;
      },
      problem: 'followedFileDigests must map paths',
    },
    {
      name: 'malformed map',
      mutate: (rootDirectory, graph) => {
        graph.followedFileDigests = {
          'workspace/malformed.js': 'not-a-sha256-digest',
        };
      },
      problem: 'followedFileDigests must map paths',
    },
    {
      name: 'missing emitted module',
      mutate: (rootDirectory, graph) => {
        const followedPath = 'workspace/missing.js';
        writeFixture(rootDirectory, followedPath, 'export default 1;\n');
        graph.degrees[followedPath] = {in: 0, out: 0};
        graph.moduleCount += 1;
      },
      problem: 'followed file census is not exact',
    },
    {
      name: 'extra un-emitted module',
      mutate: (rootDirectory, graph) => {
        const extraPath = 'workspace/extra.js';
        writeFixture(rootDirectory, extraPath, 'export default 1;\n');
        graph.followedFileDigests[extraPath] = fileIdentity(
          rootDirectory, extraPath).sha256;
      },
      problem: 'followed file census is not exact',
    },
    {
      name: 'primary census overlap',
      mutate: (rootDirectory, graph) => {
        graph.followedFileDigests['src/exact-owner.js'] =
          graph.fileDigests['src/exact-owner.js'];
      },
      problem: 'followed file census is not exact',
    },
    {
      name: 'stale content',
      mutate: (rootDirectory, graph) => {
        const stalePath = 'workspace/stale.js';
        writeFixture(rootDirectory, stalePath, 'export default 1;\n');
        addFollowedModuleEvidence(rootDirectory, graph, stalePath);
        graph.followedFileDigests[stalePath] = 'f'.repeat(64);
      },
      problem: 'followed file content is stale: workspace/stale.js',
    },
  ];
  for (const scenario of cases) {
    withSelectorFixture(({rootDirectory}) => {
      rewriteImportGraphAndSeal(rootDirectory, (graph) => {
        scenario.mutate(rootDirectory, graph);
      });
      const {selection, problems} = selectProofCone(
        rootDirectory, ['src/exact-owner.js']);
      assert.equal(selection.fullSuite, true, scenario.name);
      assert.equal(selection.selectedTests.length,
        selection.counts.totalTests, scenario.name);
      assert.ok(problems.some((problem) =>
        problem.includes(scenario.problem)), `${scenario.name}: ${problems}`);
    });
  }
});

test('live graph cache retries when bytes change during identity capture', () => {
  withSelectorFixture(({rootDirectory}) => {
    const first = selectProofCone(rootDirectory, ['src/exact-owner.js']);
    assert.deepEqual(first.problems, []);
    const sourcePath = path.join(rootDirectory, 'src/exact-owner.js');
    const originalLstatSync = fs.lstatSync;
    let changed = false;
    fs.lstatSync = (...args) => {
      const result = originalLstatSync(...args);
      if (!changed && args[0] === sourcePath) {
        changed = true;
        fs.writeFileSync(sourcePath, 'export default 2;\n');
      }
      return result;
    };
    try {
      assertFullCensus(rootDirectory);
    } finally {
      fs.lstatSync = originalLstatSync;
    }
  });
});

test('import graph producer identity includes out-of-census resolution inputs', () => {
  const inputMutations = [
    ['examples/graph-input.js', 'export default 2;\n'],
    ['package.json', '{"type":"module","imports":{}}\n'],
  ];
  for (const [inputPath, content] of inputMutations) {
    withSelectorFixture(({rootDirectory}) => {
      writeFixture(rootDirectory, inputPath, content);
      assertFullCensus(rootDirectory);
    });
  }
});

test('import graph resolver identity invalidates when a bare import becomes resolvable', () => {
  withSelectorFixture(({rootDirectory}) => {
    const first = selectProofCone(rootDirectory, ['src/exact-owner.js']);
    assert.deepEqual(first.problems, []);
    writeFixture(
      rootDirectory,
      'node_modules/fixture-package/dist/index.js',
      'export default true;\n',
    );
    assertFullCensus(rootDirectory);
    const resolvedTarget = 'node_modules/fixture-package/dist/index.js';
    const resolvedInputs = [{
      from: 'src/exact-owner.js',
      specifier: 'fixture-package',
      state: OWNER_DEBT_RESOLVER_STATE.resolved,
      target: resolvedTarget,
    }];
    rewriteImportGraphAndSeal(rootDirectory, (graph) => {
      graph.resolverInputs = resolvedInputs;
      graph.resolverStateDigest = importGraphResolverStateDigest(
        rootDirectory, resolvedInputs);
      graph.degrees[resolvedTarget] = {in: 0, out: 0};
      graph.followedFileDigests[resolvedTarget] = fileIdentity(
        rootDirectory, resolvedTarget).sha256;
      graph.moduleCount += 1;
    });
    assert.deepEqual(selectProofCone(
      rootDirectory, ['src/exact-owner.js']).problems, []);
    const resolvedDigest = importGraphResolverStateDigest(
      rootDirectory, resolvedInputs);
    const secondRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'resolver-portability-'));
    try {
      writeFixture(
        secondRoot,
        'node_modules/fixture-package/package.json',
        '{"name":"fixture-package","type":"module","exports":"./dist/index.js"}\n',
      );
      writeFixture(
        secondRoot,
        'node_modules/fixture-package/dist/index.js',
        'export default true;\n',
      );
      assert.equal(importGraphResolverStateDigest(
        secondRoot, resolvedInputs), resolvedDigest);
    } finally {
      fs.rmSync(secondRoot, {recursive: true, force: true});
    }
    fs.unlinkSync(path.join(rootDirectory, resolvedTarget));
    assertFullCensus(rootDirectory);
  });
});

test('resolved probe identity binds higher-priority sibling candidates', () => {
  const rootDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'resolver-sibling-priority-'));
  try {
    writeFixture(
      rootDirectory,
      'node_modules/fixture-package/package.json',
      '{"name":"fixture-package","main":"./dist/main"}\n',
    );
    writeFixture(
      rootDirectory,
      'node_modules/fixture-package/dist/main.ts',
      'export default true;\n',
    );
    const staleProbe = [{
      from: 'src/importer.js',
      specifier: 'fixture-package',
      state: OWNER_DEBT_RESOLVER_STATE.resolved,
      target: 'node_modules/fixture-package/dist/main.ts',
    }];
    const before = importGraphResolverStateDigest(rootDirectory, staleProbe);
    writeFixture(
      rootDirectory,
      'node_modules/fixture-package/dist/main.js',
      'export default true;\n',
    );
    assert.notEqual(
      importGraphResolverStateDigest(rootDirectory, staleProbe),
      before,
    );
  } finally {
    fs.rmSync(rootDirectory, {recursive: true, force: true});
  }
});

test('resolved probe identity binds symlinked manifests and candidate viability', () => {
  const rootDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'resolver-symlink-surface-'));
  try {
    writeFixture(rootDirectory, 'metadata/package.json',
      '{"name":"fixture-package","main":"./dist/main"}\n');
    writeFixture(rootDirectory,
      'node_modules/fixture-package/dist/main.ts', 'export default true;\n');
    fs.symlinkSync('../../metadata/package.json', path.join(
      rootDirectory, 'node_modules/fixture-package/package.json'));
    fs.symlinkSync('../../../candidate.js', path.join(
      rootDirectory, 'node_modules/fixture-package/dist/main.js'));
    const staleProbe = [{
      from: 'src/importer.js',
      specifier: 'fixture-package',
      state: OWNER_DEBT_RESOLVER_STATE.resolved,
      target: 'node_modules/fixture-package/dist/main.ts',
    }];
    const beforeCandidate = importGraphResolverStateDigest(
      rootDirectory, staleProbe);
    writeFixture(rootDirectory, 'candidate.js', 'export default true;\n');
    const afterCandidate = importGraphResolverStateDigest(
      rootDirectory, staleProbe);
    assert.notEqual(afterCandidate, beforeCandidate);
    writeFixture(rootDirectory, 'metadata/package.json',
      '{"name":"fixture-package","main":"./candidate.js"}\n');
    assert.notEqual(
      importGraphResolverStateDigest(rootDirectory, staleProbe),
      afterCandidate,
    );
  } finally {
    fs.rmSync(rootDirectory, {recursive: true, force: true});
  }
});

test('resolved probe identity binds a symlinked bare package root portably', () => {
  const firstRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'resolver-link-root-a-'));
  const secondRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'resolver-link-root-b-'));
  try {
    for (const rootDirectory of [firstRoot, secondRoot]) {
      writeFixture(rootDirectory, 'workspace-a/package.json',
        '{"name":"fixture-package","main":"./index.js"}\n');
      writeFixture(rootDirectory, 'workspace-a/index.js', 'export default true;\n');
      writeFixture(rootDirectory, 'workspace-b/package.json',
        '{"name":"fixture-package","main":"./index.js"}\n');
      writeFixture(rootDirectory, 'workspace-b/index.js', 'export default false;\n');
      fs.mkdirSync(path.join(rootDirectory, 'node_modules'), {recursive: true});
      fs.symlinkSync('../workspace-a', path.join(
        rootDirectory, 'node_modules/fixture-package'));
    }
    const staleProbe = [{
      from: 'src/importer.js',
      specifier: 'fixture-package',
      state: OWNER_DEBT_RESOLVER_STATE.resolved,
      target: 'workspace-a/index.js',
    }];
    const before = importGraphResolverStateDigest(firstRoot, staleProbe);
    assert.equal(importGraphResolverStateDigest(secondRoot, staleProbe), before);
    fs.unlinkSync(path.join(firstRoot, 'node_modules/fixture-package'));
    fs.symlinkSync('../workspace-b', path.join(
      firstRoot, 'node_modules/fixture-package'));
    assert.notEqual(importGraphResolverStateDigest(firstRoot, staleProbe), before);
  } finally {
    fs.rmSync(firstRoot, {recursive: true, force: true});
    fs.rmSync(secondRoot, {recursive: true, force: true});
  }
});

test('bare probe identity binds importer-ancestor lookup roots', () => {
  const rootDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'resolver-nested-lookup-'));
  try {
    writeFixture(rootDirectory, 'node_modules/fixture-package/package.json',
      '{"name":"fixture-package","main":"./index.js"}\n');
    writeFixture(rootDirectory, 'node_modules/fixture-package/index.js',
      'export default true;\n');
    const staleProbe = [{
      from: 'packages/app/src/importer.js',
      specifier: 'fixture-package',
      state: OWNER_DEBT_RESOLVER_STATE.resolved,
      target: 'node_modules/fixture-package/index.js',
    }];
    const before = importGraphResolverStateDigest(rootDirectory, staleProbe);
    writeFixture(rootDirectory,
      'packages/app/src/node_modules/fixture-package/package.json',
      '{"name":"fixture-package","main":"./index.js"}\n');
    writeFixture(rootDirectory,
      'packages/app/src/node_modules/fixture-package/index.js',
      'export default false;\n');
    assert.notEqual(importGraphResolverStateDigest(rootDirectory, staleProbe), before);
  } finally {
    fs.rmSync(rootDirectory, {recursive: true, force: true});
  }
});

test('resolver surfaces fail closed on escape, cycles, and noncanonical probes', () => {
  const rootDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'resolver-bounds-'));
  try {
    fs.mkdirSync(path.join(rootDirectory, 'node_modules'), {recursive: true});
    fs.symlinkSync('/', path.join(rootDirectory, 'node_modules/escape'));
    fs.symlinkSync('cycle', path.join(rootDirectory, 'node_modules/cycle'));
    const unresolvedProbe = (specifier) => [{
      from: 'src/importer.js',
      specifier,
      state: OWNER_DEBT_RESOLVER_STATE.unresolved,
    }];
    assert.throws(() => importGraphResolverStateDigest(
      rootDirectory, unresolvedProbe('escape')),
    (error) => error.code === 'RESOLVER_SURFACE_ESCAPE');
    assert.throws(() => importGraphResolverStateDigest(
      rootDirectory, unresolvedProbe('cycle')),
    (error) => error.code === 'RESOLVER_SURFACE_SYMLINK_CYCLE');
    assert.throws(() => importGraphResolverStateDigest(rootDirectory, [{
      from: '../outside.js',
      specifier: 'fixture-package',
      state: OWNER_DEBT_RESOLVER_STATE.unresolved,
    }]), (error) => error.code === 'RESOLVER_SURFACE_NONCANONICAL_PROBE');
  } finally {
    fs.rmSync(rootDirectory, {recursive: true, force: true});
  }
});

test('linked workspace probe identity binds followed source content', () => {
  const rootDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'resolver-followed-content-'));
  try {
    writeFixture(rootDirectory, 'workspace/package.json',
      '{"name":"fixture-package","main":"./index.js"}\n');
    writeFixture(rootDirectory, 'workspace/index.js', 'import \'./dep-a.js\';\n');
    writeFixture(rootDirectory, 'workspace/dep-a.js', 'export default 1;\n');
    writeFixture(rootDirectory, 'workspace/dep-b.js', 'export default 2;\n');
    fs.mkdirSync(path.join(rootDirectory, 'node_modules'), {recursive: true});
    fs.symlinkSync('../workspace', path.join(
      rootDirectory, 'node_modules/fixture-package'));
    const staleProbe = [{
      from: 'src/importer.js',
      specifier: 'fixture-package',
      state: OWNER_DEBT_RESOLVER_STATE.resolved,
      target: 'workspace/index.js',
    }];
    const before = importGraphResolverStateDigest(rootDirectory, staleProbe);
    writeFixture(rootDirectory, 'workspace/index.js', 'import \'./dep-b.js\';\n');
    assert.notEqual(importGraphResolverStateDigest(rootDirectory, staleProbe), before);
  } finally {
    fs.rmSync(rootDirectory, {recursive: true, force: true});
  }
});

test('malformed degree and inherited importer shapes widen without throwing', () => {
  const mutations = [
    (graph) => {
      graph.degrees['src/exact-owner.js'] = null;
    },
    (graph) => {
      graph.importers = {'src/exact-owner.js': ['constructor']};
    },
  ];
  for (const mutate of mutations) {
    withSelectorFixture(({rootDirectory}) => {
      rewriteImportGraph(rootDirectory, mutate);
      assert.doesNotThrow(() => assertFullCensus(rootDirectory));
    });
  }
});

test('coverage provenance and exact edge digest union are mandatory', () => {
  const mutations = [
    (coverage) => {
      coverage.schemaVersion = 2;
    },
    (coverage) => {
      coverage.sourceDigest = {};
    },
    (coverage) => {
      coverage.tests['test/exact.test.js'] = [];
    },
    (coverage) => {
      coverage.fileDigests['src/ghost.js'] = 'f'.repeat(64);
    },
  ];
  for (const mutate of mutations) {
    withSelectorFixture(({rootDirectory}) => {
      rewriteCoverage(rootDirectory, mutate);
      assertFullCensus(rootDirectory);
    });
  }
});

test('coverage edges require canonical producer paths and regular files', () => {
  const cases = [
    (rootDirectory, coverage) => {
      coverage.tests['test/exact.test.js'] = ['src'];
      delete coverage.fileDigests['src/exact-owner.js'];
      coverage.fileDigests.src = 'f'.repeat(64);
    },
    (rootDirectory, coverage) => {
      const alias = 'src/directory/../exact-owner.js';
      coverage.tests['test/exact.test.js'] = [alias];
      delete coverage.fileDigests['src/exact-owner.js'];
      coverage.fileDigests[alias] = fileIdentity(
        rootDirectory, 'src/exact-owner.js').sha256;
    },
    (rootDirectory, coverage) => {
      coverage.tests['test/exact.test.js'] = ['README.md'];
      delete coverage.fileDigests['src/exact-owner.js'];
      coverage.fileDigests['README.md'] = fileIdentity(
        rootDirectory, 'README.md').sha256;
    },
    (rootDirectory, coverage) => {
      coverage.tests['test/exact.test.js'] = [
        'src/exact-owner.js',
        'src/exact-owner.js',
      ];
    },
    (rootDirectory, coverage) => {
      const symlinkPath = 'src/symlinked.js';
      fs.symlinkSync(path.join(rootDirectory, 'README.md'),
        path.join(rootDirectory, symlinkPath));
      coverage.tests['test/exact.test.js'] = [symlinkPath];
      delete coverage.fileDigests['src/exact-owner.js'];
      coverage.fileDigests[symlinkPath] = fileIdentity(
        rootDirectory, symlinkPath).sha256;
    },
  ];
  for (const mutate of cases) {
    withSelectorFixture(({rootDirectory}) => {
      rewriteCoverage(rootDirectory, (coverage) =>
        mutate(rootDirectory, coverage));
      assert.doesNotThrow(() => assertFullCensus(rootDirectory));
    });
  }
});

test('coverage rejects symlink ancestors outside the repository', () => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-outside-'));
  try {
    writeFixture(outside, 'covered.js', 'export default true;\n');
    withSelectorFixture(({rootDirectory}) => {
      fs.symlinkSync(outside, path.join(rootDirectory, 'src/outside-link'));
      rewriteCoverage(rootDirectory, (coverage) => {
        const coveredPath = 'src/outside-link/covered.js';
        coverage.tests['test/exact.test.js'] = [coveredPath];
        delete coverage.fileDigests['src/exact-owner.js'];
        coverage.fileDigests[coveredPath] = fileIdentity(
          rootDirectory, coveredPath).sha256;
      });
      assertFullCensus(rootDirectory);
    });
  } finally {
    fs.rmSync(outside, {recursive: true, force: true});
  }
});

test('coverage permits a canonical file beneath a symlinked repository root', () => {
  withSelectorFixture(({rootDirectory}) => {
    const rootLink = `${rootDirectory}-link`;
    fs.symlinkSync(rootDirectory, rootLink);
    try {
      const {problems} = selectProofCone(rootLink, ['src/exact-owner.js']);
      assert.deepEqual(problems, []);
    } finally {
      fs.unlinkSync(rootLink);
    }
  });
});

test('coverage rejects a regular file swapped to a symlink during validation', () => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-swap-'));
  try {
    writeFixture(outside, 'covered.js', 'export default 1;\n');
    withSelectorFixture(({rootDirectory}) => {
      const coveredPath = path.join(rootDirectory, 'src/exact-owner.js');
      const originalLstatSync = fs.lstatSync;
      let visits = 0;
      fs.lstatSync = (...args) => {
        const result = originalLstatSync(...args);
        if (args[0] === coveredPath && ++visits === 3) {
          fs.unlinkSync(coveredPath);
          fs.symlinkSync(path.join(outside, 'covered.js'), coveredPath);
        }
        return result;
      };
      try {
        const selected = selectProofCone(rootDirectory, ['src/exact-owner.js']);
        assert.equal(selected.selection.fullSuite, true);
        assert.ok(selected.problems.some((problem) =>
          problem.includes('coverage snapshot inputs changed during validation')));
      } finally {
        fs.lstatSync = originalLstatSync;
      }
    });
  } finally {
    fs.rmSync(outside, {recursive: true, force: true});
  }
});

test('coverage freshness is rebound to each root and file generation', () => {
  const firstRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-root-a-'));
  const secondRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-root-b-'));
  try {
    writeFixture(firstRoot, 'src/covered.js', 'export default 1;\n');
    const snapshot = {
      schemaVersion: 1,
      sourceDigest: 'a'.repeat(64),
      fileDigests: {
        'src/covered.js': fileIdentity(firstRoot, 'src/covered.js').sha256,
      },
      tests: {'test/covered.test.js': ['src/covered.js']},
    };
    assert.equal(evaluateCoverage(firstRoot, snapshot, 1).fresh, true);
    assert.equal(evaluateCoverage(secondRoot, snapshot, 1).fresh, false);
    writeFixture(firstRoot, 'src/covered.js', 'export default 2;\n');
    assert.equal(evaluateCoverage(firstRoot, snapshot, 1).fresh, false);
  } finally {
    fs.rmSync(firstRoot, {recursive: true, force: true});
    fs.rmSync(secondRoot, {recursive: true, force: true});
  }
});

test('coverage descriptor close failure becomes stale instead of throwing', () => {
  const rootDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-close-'));
  try {
    writeFixture(rootDirectory, 'src/covered.js', 'export default 1;\n');
    const snapshot = {
      schemaVersion: 1,
      sourceDigest: 'a'.repeat(64),
      fileDigests: {
        'src/covered.js': fileIdentity(rootDirectory, 'src/covered.js').sha256,
      },
      tests: {'test/covered.test.js': ['src/covered.js']},
    };
    const originalCloseSync = fs.closeSync;
    fs.closeSync = () => {
      throw new Error('injected close failure');
    };
    try {
      const coverage = evaluateCoverage(rootDirectory, snapshot, 1);
      assert.equal(coverage.fresh, false);
      assert.equal(coverage.staleEdges, 1);
    } finally {
      fs.closeSync = originalCloseSync;
    }
  } finally {
    fs.rmSync(rootDirectory, {recursive: true, force: true});
  }
});

test('coverage double-read rejects same-size rewrite with unchanged metadata', () => {
  const rootDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-reread-'));
  try {
    writeFixture(rootDirectory, 'src/covered.js', 'export default 1;\n');
    const snapshot = {
      schemaVersion: 1,
      sourceDigest: 'a'.repeat(64),
      fileDigests: {
        'src/covered.js': fileIdentity(rootDirectory, 'src/covered.js').sha256,
      },
      tests: {'test/covered.test.js': ['src/covered.js']},
    };
    const originalReadSync = fs.readSync;
    let swapped = false;
    fs.readSync = (...args) => {
      const bytesRead = originalReadSync(...args);
      if (!swapped) {
        swapped = true;
        writeFixture(rootDirectory, 'src/covered.js', 'export default 2;\n');
      }
      return bytesRead;
    };
    try {
      const coverage = evaluateCoverage(rootDirectory, snapshot, 1);
      assert.equal(coverage.fresh, false);
      assert.equal(coverage.staleEdges, 1);
    } finally {
      fs.readSync = originalReadSync;
    }
  } finally {
    fs.rmSync(rootDirectory, {recursive: true, force: true});
  }
});

test('the full-census API verifies stale and empty primary manifests', () => {
  withSelectorFixture(({rootDirectory, primaryManifest}) => {
    writeFixture(rootDirectory, 'test/shards/primary-classes.json', JSON.stringify({
      ...primaryManifest,
      classes: {'test/ghost.test.js': 'fast'},
    }));
    const selection = selectRunnableFullProofCensus(rootDirectory);
    assert.equal(selection.fullSuite, true);
    assert.equal(selection.selectedTests.length, 5);
    assert.ok(!selection.selectedTests.includes('test/ghost.test.js'));
  });

  const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'proof-census-empty-'));
  try {
    fs.mkdirSync(path.join(emptyRoot, 'src'), {recursive: true});
    fs.mkdirSync(path.join(emptyRoot, 'scripts'), {recursive: true});
    fs.mkdirSync(path.join(emptyRoot, 'test'), {recursive: true});
    assert.throws(
      () => selectRunnableFullProofCensus(emptyRoot),
      /not runnable.*empty live test census/isu,
    );
  } finally {
    fs.rmSync(emptyRoot, {recursive: true, force: true});
  }
});

test('unavailable or empty live census is a typed fatal decision', () => {
  const brokenRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'proof-cone-fatal-'));
  fs.mkdirSync(path.join(brokenRoot, 'src'), {recursive: true});
  fs.writeFileSync(path.join(brokenRoot, 'src', 'owner.js'), '');
  fs.writeFileSync(path.join(brokenRoot, 'test'), 'not-a-directory');
  try {
    const broken = selectProofCone(brokenRoot, ['src/owner.js']).selection;
    assert.equal(broken.runnable, false);
    assert.equal(testImpactDecision(broken).mode, MODE_FATAL);
    assert.throws(() => assertRunnableProofSelection(broken), /not runnable/iu);
    assert.throws(
      () => landingProofConeFromSelection(broken, 'candidate-digest'),
      /not runnable/iu,
    );
  } finally {
    fs.rmSync(brokenRoot, {recursive: true, force: true});
  }

  const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'proof-cone-empty-'));
  fs.mkdirSync(path.join(emptyRoot, 'src'), {recursive: true});
  fs.mkdirSync(path.join(emptyRoot, 'scripts'), {recursive: true});
  fs.mkdirSync(path.join(emptyRoot, 'test'), {recursive: true});
  writeFixture(
    emptyRoot,
    'test/shards/primary-classes.json',
    JSON.stringify(buildPrimaryManifest(emptyRoot)),
  );
  try {
    const empty = selectProofCone(emptyRoot, ['src/owner.js']).selection;
    assert.equal(empty.runnable, false);
    assert.equal(empty.fullSuite, false);
    assert.throws(() => assertRunnableProofSelection(empty), /empty live test census/iu);
  } finally {
    fs.rmSync(emptyRoot, {recursive: true, force: true});
  }
});

test('landing preflight refuses stale graph and seal bytes before cache reuse', () => {
  withSelectorFixture(({rootDirectory}) => {
    const producerPath = path.join(
      rootDirectory, 'scripts/generate-global-owner-debt-inventory.js');
    const producerStub = path.join(rootDirectory, 'producer-stub.js');
    const graphPath = importGraphPath(rootDirectory);
    const graphBytes = fs.readFileSync(graphPath, 'utf8');
    const graphDigest = JSON.parse(graphBytes).snapshotDigest;
    const sealPath = path.join(
      rootDirectory, 'test/shards/impact-graph-seal.json');
    const sealBytes = fs.readFileSync(sealPath, 'utf8');
    const canonicalReceipt = JSON.stringify({
      snapshotDigest: graphDigest,
      graphByteDigest: crypto.createHash(OWNER_DEBT.hashAlgorithm)
        .update(graphBytes).digest(OWNER_DEBT.hashEncoding),
      sealByteDigest: crypto.createHash(OWNER_DEBT.hashAlgorithm)
        .update(sealBytes).digest(OWNER_DEBT.hashEncoding),
    });
    const receiptOutput = `${canonicalReceipt}\n`;
    const passingProducer = fs.readFileSync(producerPath, 'utf8');
    const manifest = {
      candidate: {files: []},
      aggregate: {
        fingerprint: `sha256:${'a'.repeat(64)}`,
        sourcePaths: ['src/exact-owner.js'],
      },
    };
    const first = landingReviewPreflight(rootDirectory, manifest);
    assert.equal(first.cached, false);

    writeFixture(
      rootDirectory,
      'scripts/generate-global-owner-debt-inventory.js',
      'import fs from \'node:fs\';\n' +
      `const graph = JSON.parse(fs.readFileSync('${graphPath}', 'utf8'));\n` +
      `process.stdout.write(${JSON.stringify(receiptOutput)});\n` +
      'graph.importers = {};\n' +
      `fs.writeFileSync('${graphPath}', JSON.stringify(graph));\n`,
    );
    assert.throws(() => landingReviewPreflight(rootDirectory, manifest),
      /canonical import-graph verification failed.*verified bytes changed/isu);
    fs.writeFileSync(graphPath, graphBytes);
    writeFixture(rootDirectory,
      'scripts/generate-global-owner-debt-inventory.js', passingProducer);

    writeFixture(
      rootDirectory,
      'scripts/generate-global-owner-debt-inventory.js',
      'import fs from \'node:fs\';\n' +
      `const seal = JSON.parse(fs.readFileSync('${sealPath}', 'utf8'));\n` +
      `process.stdout.write(${JSON.stringify(receiptOutput)});\n` +
      `seal.snapshotDigest = '${'f'.repeat(64)}';\n` +
      `fs.writeFileSync('${sealPath}', JSON.stringify(seal));\n`,
    );
    assert.throws(() => landingReviewPreflight(rootDirectory, manifest),
      /canonical import-graph verification failed.*verified bytes changed/isu);
    fs.writeFileSync(sealPath, sealBytes);
    writeFixture(rootDirectory,
      'scripts/generate-global-owner-debt-inventory.js', passingProducer);

    fs.unlinkSync(producerPath);
    assert.throws(() => landingReviewPreflight(rootDirectory, manifest),
      /canonical import-graph verification failed.*generate-global.*is missing/isu);

    writeFixture(rootDirectory, 'producer-stub.js', passingProducer);
    fs.symlinkSync(producerStub, producerPath);
    assert.throws(() => landingReviewPreflight(rootDirectory, manifest),
      /canonical import-graph verification failed.*not a regular file/isu);
    fs.unlinkSync(producerPath);

    fs.unlinkSync(importGraphPath(rootDirectory));
    fs.unlinkSync(path.join(
      rootDirectory, 'test/shards/impact-graph-seal.json'));
    assert.throws(() => landingReviewPreflight(rootDirectory, manifest),
      /canonical import-graph verification failed.*generate-global.*is missing/isu);
  });
});

test('canonical graph verification hard-kills a non-terminating producer', () => {
  withSelectorFixture(({rootDirectory}) => {
    writeFixture(
      rootDirectory,
      'scripts/generate-global-owner-debt-inventory.js',
      'process.on(\'SIGTERM\', () => {});\nsetInterval(() => {}, 1000);\n',
    );
    const started = Date.now();
    const problem = canonicalImportGraphProblem(rootDirectory, 100);
    assert.ok(Date.now() - started < 1_000);
    assert.match(problem,
      /canonical import-graph verification failed.*timed out twice/isu);
  });
});

test('receipt binds the exact registry digest and changes with registry semantics', () => {
  withSelectorFixture(({rootDirectory, contracts}) => {
    const firstRegistry = loadImpactContractRegistry(rootDirectory);
    const first = selectProofCone(rootDirectory, ['src/exact-owner.js']).selection;
    assert.equal(first.inputs.contractRegistryDigest, firstRegistry.digest);

    contracts.contracts.exact.description = 'Changed exact owner contract.';
    writeFixture(
      rootDirectory,
      'test/shards/impact-contracts.json',
      JSON.stringify(contracts),
    );
    const second = selectProofCone(rootDirectory, ['src/exact-owner.js']).selection;
    assert.notEqual(
      second.inputs.contractRegistryDigest,
      first.inputs.contractRegistryDigest,
    );
  });
});
