/**
 * The two live-surface guards (no-kiro, no-legacy-naming) exempt exactly one
 * kind of file: a quest's append-only log, whose path the solve store owns.
 * The cutover moved that record from `solve/log/` into the quest directory,
 * and a stale exemption is as dangerous as a missing one, so the boundary is
 * asserted here rather than left to the guards' comments.
 */

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  ALLOWED_PREFIXES as KIRO_PREFIXES, isAllowed as kiroAllows,
} from '../../scripts/check-no-kiro-refs.js';
import {
  ALLOWED_PREFIXES as LEGACY_PREFIXES, isAllowed as legacyAllows,
} from '../../scripts/check-no-legacy-naming.js';

const QUEST_LOG = 'solve/quests/demo-quest/log.ndjson';
const GOVERNED = Object.freeze([
  'solve/quests/demo-quest/quest.json',
  'solve/quests/demo-quest/evidence/receipt.json',
  'docs/steering/llm/core.md',
  'docs/steering/workflow-guidelines/solver-quests.md',
  'docs/development/solver-runbook.md',
  'AGENTS.md',
  'scripts/solve/store.js',
  'src/thing.js',
]);
// Directories the cutover deleted: an exemption naming one is dead taxonomy
// that would silently stop protecting the record it was written for.
const DELETED_V1_PREFIXES = Object.freeze([
  'solve/log/', 'solve/report/', 'solve/autonomous/', 'solve/changes/',
]);

for (const [name, allows, prefixes] of [
  ['no-kiro', kiroAllows, KIRO_PREFIXES],
  ['no-legacy-naming', legacyAllows, LEGACY_PREFIXES],
]) {
  test(`${name} exempts the quest log and nothing else under a quest`, () => {
    assert.equal(allows(QUEST_LOG), true);
    for (const file of GOVERNED) {
      assert.equal(allows(file), false, `${name} must still govern ${file}`);
    }
  });

  test(`${name} carries no exemption for a deleted v1 directory`, () => {
    for (const prefix of DELETED_V1_PREFIXES) {
      assert.equal(prefixes.includes(prefix), false,
        `${name} still names ${prefix}`);
      assert.equal(allows(`${prefix}anything.md`), false);
    }
  });
}
