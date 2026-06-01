import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {test} from '../../src/test-helpers/tap.js';
import {
  buildCeremonyAudit,
  isDurableWorkPath,
  isPureCeremonyPackage,
  parseArgs,
  renderCeremonyAudit,
  runCli,
} from '../../scripts/work-audit-ceremony.js';

const TEMP_PREFIX = 'work-audit-ceremony-';
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

function metadata({owner, lane, writeScope = [], refs = []}) {
  return {
    schema: 'work-package-v2',
    status: 'done',
    intent: {
      opened: '2026-05-25',
      lane,
      owner,
      boundary: 'workflow_acceleration',
      dominantReason: 'test',
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
    execution: {
      theoryLedgerRefs: refs,
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

test('durable work paths identify implementation, tooling, architecture, and specs',
  (t) => {
    t.equal(isDurableWorkPath('src/runtime.js'), true);
    t.equal(isDurableWorkPath('test/scripts/work-audit.test.js'), true);
    t.equal(isDurableWorkPath('scripts/work-audit-ceremony.js'), true);
    t.equal(isDurableWorkPath('architecture/contracts/quest-lifecycle.md'), true);
    t.equal(isDurableWorkPath('docs/specs/statecharts/quest-lifecycle.json'), true);
    t.equal(isDurableWorkPath('work/RULES.md'), false);
    t.end();
  });

test('pure ceremony predicate ignores durable-work and theory-ledger packages',
  (t) => {
  t.equal(isPureCeremonyPackage(metadata({
    owner: 'workflow',
    lane: 'lightweight-maintenance',
    writeScope: ['work/RULES.md'],
  })), true);
  t.equal(isPureCeremonyPackage(metadata({
    owner: 'runtime',
    lane: 'runtime-owner-boundary',
    writeScope: ['src/runtime.js'],
  })), false);
  t.equal(isPureCeremonyPackage(metadata({
    owner: 'workflow',
    lane: 'lightweight-maintenance',
    writeScope: ['scripts/work-audit-ceremony.js'],
  })), false);
  t.equal(isPureCeremonyPackage(metadata({
    owner: 'workflow',
    lane: 'lightweight-maintenance',
    writeScope: ['work/RULES.md'],
    refs: ['theory-20260525-test'],
  })), false);
    t.end();
  });

test('ceremony audit summarizes packages by owner and lane', async (t) => {
  const root = await makeTempRoot(t);
  await writePackage(root, 'done-20260524-runtime.md', metadata({
    owner: 'runtime_owner',
    lane: 'runtime-owner-boundary',
    writeScope: ['src/runtime.js'],
  }));
  await writePackage(root, 'done-20260525-workflow-a.md', metadata({
    owner: 'workflow_tooling_owner',
    lane: 'lightweight-maintenance',
    writeScope: ['work/RULES.md'],
  }));
  await writePackage(root, 'done-20260525-workflow-b.md', metadata({
    owner: 'workflow_tooling_owner',
    lane: 'lightweight-maintenance',
    writeScope: ['work/README.md'],
  }));
  await writePackage(root, 'done-20260525-tooling.md', metadata({
    owner: 'workflow_tooling_owner',
    lane: 'lightweight-maintenance',
    writeScope: ['scripts/work-audit-ceremony.js'],
  }));

  const audit = await buildCeremonyAudit({root, sinceDate: '2026-05-25'});
  const rendered = renderCeremonyAudit(audit, {summary: true});

  t.equal(audit.scanned, 4);
  t.equal(audit.packages.length, 2);
  t.match(rendered, 'Pure-ceremony packages: 2');
  t.match(rendered, 'lightweight-maintenance: 2');
  t.match(rendered, 'workflow_tooling_owner: 2');
  t.notMatch(rendered, 'Package Examples');
});

test('ceremony audit details are bounded by limit', async (t) => {
  const root = await makeTempRoot(t);
  await writePackage(root, 'done-20260525-one.md', metadata({
    owner: 'workflow_one',
    lane: 'lightweight-maintenance',
    writeScope: ['work/RULES.md'],
  }));
  await writePackage(root, 'done-20260525-two.md', metadata({
    owner: 'workflow_two',
    lane: 'lightweight-maintenance',
    writeScope: ['work/README.md'],
  }));

  const output = await runCli(['--details', '--limit', '1'], {root});

  t.match(output, 'Package Examples');
  t.match(output, 'done-20260525-one.md');
  t.notMatch(output, 'done-20260525-two.md');
  t.match(output, '1 more');
});

test('ceremony audit argument parser defaults to summary mode', (t) => {
  t.same(parseArgs([]), {
    sinceDate: '',
    limit: 25,
    details: false,
    summary: true,
    byLane: false,
    byOwner: false,
    help: false,
  });
  t.equal(parseArgs(['--details', '--limit', '0']).limit, 0);
  t.equal(parseArgs(['--details']).summary, false);
  t.end();
});
