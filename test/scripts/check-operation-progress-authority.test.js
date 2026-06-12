import fs from 'node:fs';
import {test} from '../../src/test-helpers/tap.js';
import {
  collectOrdinalFileViolations,
  collectOwnerMapViolations,
  ownerMapHasSemanticSuccessor,
} from '../../scripts/check-operation-progress-authority.js';

const ENCODING_UTF8 = 'utf8';
const OWNER_MAP_PATH = 'architecture/current-owner-maps.md';
const NAMED_LEGACY_FILES = Object.freeze([
  'src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js',
  'src/control-plane/priority-recovery-snapshot-stage-10.js',
]);

test('operation progress authority guard requires semantic successor targets', (t) => {
  const ownerMap = fs.readFileSync(OWNER_MAP_PATH, ENCODING_UTF8);

  for (const file of NAMED_LEGACY_FILES) {
    t.equal(
      ownerMapHasSemanticSuccessor(ownerMap, file),
      true,
      `${file} has removal ledger row with semantic successor`,
    );
  }
  t.same(collectOwnerMapViolations(ownerMap), []);
  t.end();
});

test('operation progress authority guard rejects new ordinal files', (t) => {
  const violations = collectOrdinalFileViolations([
    'src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js',
    'src/rebalancer/operation-workflow-owner-segment-99.js',
    'src/control-plane/priority-recovery-snapshot-stage-10.js',
    'src/control-plane/priority-recovery-snapshot-stage-99.js',
  ]);

  t.match(violations.join('\n'), /operation-workflow-owner-segment-99/u);
  t.match(violations.join('\n'), /priority-recovery-snapshot-stage-99/u);
  t.end();
});

test('named semantic-decomposition files are compatibility wrappers', (t) => {
  for (const file of NAMED_LEGACY_FILES) {
    const content = fs.readFileSync(file, ENCODING_UTF8);
    t.match(content, /^export\s+\{/u, `${file} re-exports semantic module`);
    t.notMatch(content, /\bfunction\b|\bclass\b|\bconst\b/u,
      `${file} has no owned implementation logic`);
  }
  t.end();
});
