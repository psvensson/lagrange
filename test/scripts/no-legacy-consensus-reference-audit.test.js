// The zero-reference ratchet for the retired consensus runtime (quest
// consensus-cutover quest). The scope is fixed and pinned here, its one
// exclusion is the historical solve/ record, and every surface it names is
// shown red on a seeded reference, in a filename and in content, in any case.

import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';

import {
  FIXED_SCAN_SCOPE,
  HISTORICAL_EXCLUSION,
  RETIRED_CONSENSUS_REFERENCE,
  auditRetiredConsensusReferences,
  isInFixedScope,
} from '../../scripts/checks/no-legacy-consensus-reference-audit.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '..', '..');
const CHECKER = 'scripts/checks/no-legacy-consensus-reference-audit.js';
const RUNTIME = ['Life', 'Raft'].join('');
const SCOPE_NAME = ['mark', 'wylde'].join('');
const SELECTION = ['RAFT', '_', 'PRO', 'VIDER'].join('');
const SELECTION_CAMEL = ['raft', 'Pro', 'vider'].join('');
const SELECTION_KEBAB = ['raft', '-', 'pro', 'vider'].join('');

const EXPECTED_SCOPE = Object.freeze([
  'src/',
  'test/',
  'scripts/',
  'examples/',
  'architecture/',
  'docs/current',
  'package.json',
  'package-lock.json',
  'Dockerfile',
  'test/distributed/',
]);

// One seeded reference per fixed surface: [path, content].
const SEEDED = Object.freeze([
  ['src/raft/any.js', `import x from '${SCOPE_NAME}';\n`],
  ['test/any.test.js', `// ${RUNTIME.toUpperCase()}\n`],
  ['scripts/tool.js', `process.env.${SELECTION};\n`],
  ['examples/app/main.js', `const ${SELECTION_CAMEL} = 1;\n`],
  ['architecture/overview.md', `uses ${RUNTIME.toLowerCase()}\n`],
  ['docs/current-capabilities.md', `${SELECTION_KEBAB}\n`],
  ['package.json', `{"dependencies": {"@${SCOPE_NAME}/x": "1"}}\n`],
  ['package-lock.json', `{"packages": {"node_modules/${RUNTIME}": {}}}\n`],
  ['Dockerfile', `ENV ${SELECTION}=x\n`],
  ['examples/app/Dockerfile.dev', `ENV ${SELECTION}=x\n`],
  ['test/distributed/config/five.json', `{"${SELECTION_CAMEL}": "x"}\n`],
]);
const SEEDED_NAMES = Object.freeze([
  `src/raft/${RUNTIME.toLowerCase()}-node.js`,
  `test/${SELECTION_KEBAB}.test.js`,
  `scripts/${SCOPE_NAME.toUpperCase()}.md`,
]);
const OUT_OF_SCOPE = Object.freeze([
  ['solve/quests/q/log.ndjson', `${RUNTIME}\n`],
  [`solve/quests/q/evidence/${RUNTIME}.json`, '{}\n'],
  ['README.md', `${RUNTIME}\n`],
  ['docs/history.md', `${RUNTIME}\n`],
]);

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-ref-'));
  for (const [relative, content] of files) {
    fs.mkdirSync(path.dirname(path.join(root, relative)), {recursive: true});
    fs.writeFileSync(path.join(root, relative), content);
  }
  execFileSync('git', ['init', '-q'], {cwd: root});
  return root;
}

function foundPaths(root) {
  return [...new Set(auditRetiredConsensusReferences(root).findings
    .map((finding) => finding.path))].sort();
}

test('the fixed scope and its single historical exclusion are pinned', () => {
  assert.deepEqual([...FIXED_SCAN_SCOPE], [...EXPECTED_SCOPE]);
  assert.equal(Object.isFrozen(FIXED_SCAN_SCOPE), true);
  assert.equal(HISTORICAL_EXCLUSION, 'solve/',
    'the one exclusion is the historical solve record');
  assert.equal(RETIRED_CONSENSUS_REFERENCE.flags.includes('i'), true,
    'matching is case-insensitive');
  for (const [relative] of [...SEEDED, ...SEEDED_NAMES.map((n) => [n])]) {
    assert.equal(isInFixedScope(relative), true, `${relative} is scanned`);
  }
  for (const [relative] of OUT_OF_SCOPE) {
    assert.equal(isInFixedScope(relative), false, `${relative} is not`);
  }
});

test('a seeded reference on every fixed surface reads red', () => {
  const root = fixture([...SEEDED, ...OUT_OF_SCOPE,
    ...SEEDED_NAMES.map((relative) => [relative, 'clean\n'])]);
  try {
    const expected = [...SEEDED.map(([relative]) => relative),
      ...SEEDED_NAMES].sort();
    assert.deepEqual(foundPaths(root), expected,
      'every seeded surface is found and nothing outside the scope is');
    const byKind = auditRetiredConsensusReferences(root).findings
      .filter((finding) => SEEDED_NAMES.includes(finding.path))
      .map((finding) => finding.kind);
    assert.deepEqual([...new Set(byKind)], ['filename'],
      'a retired filename is a finding even with clean content');
    const run = spawnSync(process.execPath, [path.join(ROOT, CHECKER)],
      {cwd: root, encoding: 'utf8'});
    assert.equal(run.status, 1, 'the checker exits red on the seeded tree');
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

test('reverting one surface to clean turns only that finding off', () => {
  const [first, ...rest] = SEEDED;
  const root = fixture([[first[0], 'clean\n'], ...rest]);
  try {
    assert.equal(foundPaths(root).includes(first[0]), false);
    assert.equal(foundPaths(root).length, rest.length);
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

test('the repository has zero retired consensus references', () => {
  const run = spawnSync(process.execPath, [CHECKER],
    {cwd: ROOT, encoding: 'utf8'});
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
});
