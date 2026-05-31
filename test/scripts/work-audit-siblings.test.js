import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {test} from '../../src/test-helpers/tap.js';
import {
  buildSiblingAudit,
  isAdminPath,
  normalizedScope,
  parseArgs,
  renderSiblingAudit,
  runCli,
} from '../../scripts/work-audit-siblings.js';

const TEMP_PREFIX = 'work-audit-siblings-';
const ENCODING_UTF8 = 'utf8';
const WORK_PACKAGES_DIRECTORY = path.join('work', 'packages');

function packageFile(metadata) {
  return [
    '# Package',
    '',
    '<!-- work-package',
    JSON.stringify(metadata, null, 2),
    '-->',
    '',
  ].join('\n');
}

function metadata({
  owner = 'runtime_owner',
  boundary = 'runtime_boundary',
  opened = '2026-05-25',
  writeScope = [],
}) {
  return {
    schema: 'work-package-v2',
    status: 'done',
    intent: {
      opened,
      lane: 'runtime-owner-boundary',
      owner,
      boundary,
      dominantReason: 'test',
      currentState: 'test',
      nextAction: 'test',
    },
    scope: {
      writeScope,
      handoffFiles: [],
      generatedFiles: [],
      candidateRuntimeFiles: [],
      commitScope: writeScope,
    },
    gates: {
      stabilityCredit: 'local-proof-only',
      whyHighestLeverageNow: 'test',
    },
    modelFit: {
      packageClass: 'runtime-owner-boundary',
      intendedMinimumModel: 'gpt-5.3-codex',
      scopeShape: 'owner-boundary-contraction',
      outputProfile: 'high',
      ambiguityScore: 1,
      escalationTriggers: ['test'],
    },
    execution: {
      theoryLedgerRefs: [],
      proof: {commands: ['test']},
    },
  };
}

async function makeTempRoot(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), TEMP_PREFIX));
  t.teardown(async () => {
    await fs.rm(root, {recursive: true, force: true});
  });
  await fs.mkdir(path.join(root, WORK_PACKAGES_DIRECTORY), {recursive: true});
  return root;
}

async function writePackage(root, fileName, metadataValue) {
  await fs.writeFile(
    path.join(root, WORK_PACKAGES_DIRECTORY, fileName),
    packageFile(metadataValue),
    ENCODING_UTF8,
  );
}

test('sibling audit excludes admin-only paths by default', (t) => {
  t.equal(isAdminPath('work/packages/done-20260525-a.md'), true);
  t.equal(isAdminPath('work/sprints/current-blocker.json'), true);
  t.same(
    normalizedScope([
      'src/runtime.js',
      'work/packages/done-20260525-a.md',
      'work/sprints/current-blocker.json',
    ]),
    ['src/runtime.js'],
  );
  t.same(
    normalizedScope(['work/packages/done-20260525-a.md'], {
      includeAdmin: true,
    }),
    ['work/packages/done-20260525-a.md'],
  );
  t.end();
});

test('sibling audit finds pair and cluster matches for repeated durable scope',
  async (t) => {
    const root = await makeTempRoot(t);
    await writePackage(root, 'done-20260525-a.md', metadata({
      writeScope: [
        'src/rebalancer/ports.js',
        'test/rebalancer/ports.test.js',
        'work/packages/done-20260525-a.md',
      ],
    }));
    await writePackage(root, 'done-20260525-b.md', metadata({
      writeScope: [
        'src/rebalancer/ports.js',
        'test/rebalancer/ports.test.js',
        'work/packages/done-20260525-b.md',
      ],
    }));
    await writePackage(root, 'done-20260525-c.md', metadata({
      writeScope: ['src/other.js'],
    }));

    const audit = await buildSiblingAudit({
      root,
      threshold: 1,
      minShared: 2,
    });
    const rendered = renderSiblingAudit(audit, {
      threshold: 1,
      minShared: 2,
      cluster: true,
      details: true,
      limit: 10,
    });

    t.equal(audit.records.length, 3);
    t.equal(audit.matches.length, 1);
    t.equal(audit.clusters.length, 1);
    t.notOk(audit.clusters[0].sharedScope.some(([filePath]) =>
      filePath.startsWith('work/packages/')));
    t.match(rendered, 'Clusters: 1');
    t.match(rendered, 'src/rebalancer/ports.js');
  });

test('sibling audit filters by date owner and boundary', async (t) => {
  const root = await makeTempRoot(t);
  await writePackage(root, 'done-20260524-old.md', metadata({
    opened: '2026-05-24',
    writeScope: ['src/rebalancer/ports.js'],
  }));
  await writePackage(root, 'done-20260525-a.md', metadata({
    owner: 'workflow_owner',
    boundary: 'tracker',
    writeScope: ['scripts/work-audit-siblings.js'],
  }));
  await writePackage(root, 'done-20260525-b.md', metadata({
    owner: 'workflow_owner',
    boundary: 'tracker',
    writeScope: ['scripts/work-audit-siblings.js'],
  }));
  await writePackage(root, 'done-20260525-c.md', metadata({
    owner: 'other_owner',
    boundary: 'tracker',
    writeScope: ['scripts/work-audit-siblings.js'],
  }));

  const output = await runCli([
    '--since',
    '2026-05-25',
    '--owner',
    'workflow_owner',
    '--boundary',
    'tracker',
    '--threshold',
    '1',
  ], {root});

  t.match(output, 'Scanned scoped packages: 2');
  t.match(output, 'Pair matches: 1');
  t.notMatch(output, 'other_owner');
});

test('sibling audit argument parser exposes cluster and threshold controls',
  (t) => {
    t.same(parseArgs(['--cluster', '--threshold', '0.5', '--min-shared', '2']), {
      threshold: 0.5,
      minShared: 2,
      sinceDate: '',
      owner: '',
      boundary: '',
      includeAdmin: false,
      cluster: true,
      details: false,
      limit: 25,
      help: false,
    });
    t.end();
  });
