// Contract for the system-table-retention acceptance budget.
//
// scripts/checks/system-table-retention-budget.js is the epic's `doneWhen`.
// Two things can go wrong with it.
//
// It can stop refusing: a declaration that no longer covers TABLES would
// still print a number, and a new table would get no declared lifetime. So
// each refusal is asserted here against a known-bad declaration built from a
// good fixture: a missing table, an unknown table, a retained entry without
// an owner or with an owner that is not in the tree, an unbounded entry
// without a quest record, an unknown class, a missing reason.
//
// It can miscount: the fixture's class counts are asserted exactly, and the
// committed declaration is asserted to cover the real TABLES with the
// baseline the epic records. That last number failing because a table was
// retired is the intended behaviour: lower it here and in the epic summary
// in the change that lands the retention owner.

import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';

import {
  LIFETIME_CLASS, PROBLEM, measureSystemTableRetention, unrecognisedArgument,
} from '../../scripts/checks/system-table-retention-budget.js';

const SCRIPT = 'scripts/checks/system-table-retention-budget.js';
const UTF8 = 'utf8';
const BASELINE_UNBOUNDED = 24;

const FIXTURE_TABLES = Object.freeze({
  NODES: 'nodes', SERVICES: 'services', LOGS: 'logs', CODE: 'code',
});
const OWNER_FILE = 'src/owner.js';
const QUEST_ID = 'logs-retention';
const FIXTURE_FILES = Object.freeze({
  [OWNER_FILE]: 'class TombstoneOwner { release() {} }\nfunction reclaim() {}\n',
  [`solve/quests/${QUEST_ID}/quest.json`]: '{}',
});

function readFixtureText(relativePath) {
  return Object.hasOwn(FIXTURE_FILES, relativePath) ? FIXTURE_FILES[relativePath] : null;
}

function goodDeclaration() {
  return {
    systemTables: {
      nodes: {class: LIFETIME_CLASS.BOUNDED_BY_NATURE, reason: 'one row per node'},
      services: {
        class: LIFETIME_CLASS.RETAINED,
        owner: `${OWNER_FILE}:TombstoneOwner.release`,
        reason: 'tombstones released',
      },
      logs: {class: LIFETIME_CLASS.UNBOUNDED, quest: QUEST_ID, reason: 'never deleted'},
      code: {class: LIFETIME_CLASS.INERT, reason: 'no writer'},
    },
    partitionInternalTables: {
      _obligations: {
        class: LIFETIME_CLASS.RETAINED, owner: `${OWNER_FILE}:reclaim`, reason: 'reclaimed',
      },
      _outcomes: {class: LIFETIME_CLASS.UNBOUNDED, quest: QUEST_ID, reason: 'no delete'},
    },
  };
}

function measure(declaration, tables = FIXTURE_TABLES) {
  return measureSystemTableRetention({tables, declaration, readText: readFixtureText});
}

function refusalOf(mutate) {
  const declaration = goodDeclaration();
  mutate(declaration);
  const measured = measure(declaration);
  assert.notEqual(measured.problems.length, 0);
  return measured.problems;
}

function run(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {cwd: process.cwd(), encoding: UTF8});
}

test('a covering declaration is counted by class, both sections', () => {
  const measured = measure(goodDeclaration());
  assert.deepEqual(measured.problems, []);
  assert.deepEqual(measured.classes, {
    [LIFETIME_CLASS.BOUNDED_BY_NATURE]: ['nodes'],
    [LIFETIME_CLASS.RETAINED]: ['services', '_obligations'],
    [LIFETIME_CLASS.UNBOUNDED]: ['logs', '_outcomes'],
    [LIFETIME_CLASS.INERT]: ['code'],
  });
  assert.equal(measured.unbounded, 2);
});

test('the metric is zero only when no table is unbounded', () => {
  const declaration = goodDeclaration();
  declaration.systemTables.logs = {
    class: LIFETIME_CLASS.RETAINED, owner: `${OWNER_FILE}:reclaim`, reason: 'bounded now',
  };
  delete declaration.partitionInternalTables._outcomes;
  const measured = measure(declaration);
  assert.deepEqual(measured.problems, []);
  assert.equal(measured.unbounded, 0);
});

test('a table in TABLES without a declared lifetime is refused', () => {
  const problems = refusalOf((declaration) => {
    delete declaration.systemTables.logs;
  });
  assert.deepEqual(problems, [`${PROBLEM.UNDECLARED}logs`]);
  assert.deepEqual(
    measure(goodDeclaration(), {...FIXTURE_TABLES, NEW_TABLE: 'new_table'}).problems,
    [`${PROBLEM.UNDECLARED}new_table`]);
});

test('a declared table that is not in TABLES is refused', () => {
  const problems = refusalOf((declaration) => {
    declaration.systemTables.ghosts = {class: LIFETIME_CLASS.INERT, reason: 'gone'};
  });
  assert.deepEqual(problems, [`${PROBLEM.UNKNOWN_TABLE}ghosts`]);
});

test('an inherited property name is not a declared table', () => {
  const measured = measure(goodDeclaration(), {...FIXTURE_TABLES, TRAP: 'constructor'});
  assert.deepEqual(measured.problems, [`${PROBLEM.UNDECLARED}constructor`]);
});

test('a retained entry needs an owner that is in the tree', () => {
  assert.deepEqual(refusalOf((declaration) => {
    delete declaration.systemTables.services.owner;
  }), [`${PROBLEM.OWNER_MISSING}services`]);
  for (const owner of [
    OWNER_FILE, 'src/absent.js:release', `${OWNER_FILE}:TombstoneOwner.absent`,
    `${OWNER_FILE}:`, ':release',
  ]) {
    assert.deepEqual(refusalOf((declaration) => {
      declaration.partitionInternalTables._obligations.owner = owner;
    }), [`${PROBLEM.OWNER_NOT_FOUND}_obligations -> ${owner}`]);
  }
});

test('an unbounded entry needs a quest record', () => {
  assert.deepEqual(refusalOf((declaration) => {
    delete declaration.systemTables.logs.quest;
  }), [`${PROBLEM.QUEST_MISSING}logs`]);
  for (const quest of ['no-such-quest', '../logs-retention']) {
    assert.deepEqual(refusalOf((declaration) => {
      declaration.systemTables.logs.quest = quest;
    }), [`${PROBLEM.QUEST_NOT_FOUND}logs -> ${quest}`]);
  }
});

test('an unknown class, a missing reason and a non-object entry are refused', () => {
  assert.deepEqual(refusalOf((declaration) => {
    declaration.systemTables.code.class = 'forever';
  }), [`${PROBLEM.CLASS}code`]);
  assert.deepEqual(refusalOf((declaration) => {
    declaration.systemTables.code.reason = '';
  }), [`${PROBLEM.REASON}code`]);
  assert.deepEqual(refusalOf((declaration) => {
    declaration.systemTables.code = 'inert';
  }), [`${PROBLEM.ENTRY_SHAPE}code`]);
});

test('an unreadable declaration or a missing section is refused, never counted', () => {
  for (const declaration of [null, [], 'text']) {
    assert.deepEqual(measure(declaration).problems, [PROBLEM.DECLARATION_UNREADABLE]);
  }
  assert.deepEqual(refusalOf((declaration) => {
    delete declaration.partitionInternalTables;
  }), [`${PROBLEM.SECTION_MISSING}partitionInternalTables`]);
});

test('only --metric and --json are arguments', () => {
  assert.equal(unrecognisedArgument([]), undefined);
  assert.equal(unrecognisedArgument(['--metric', '--json']), undefined);
  assert.equal(unrecognisedArgument(['--metric', '--rows']), '--rows');
  const refused = run(['--metric=1']);
  assert.equal(refused.status, 1);
  assert.equal(refused.stdout, '');
  assert.match(refused.stderr, /unrecognised argument: --metric=1/u);
});

test('the committed declaration covers TABLES and prints the baseline, red', () => {
  const metric = run(['--metric']);
  assert.equal(metric.stderr, '');
  assert.equal(metric.stdout, `${BASELINE_UNBOUNDED}\n`);
  assert.equal(metric.status, 1);

  const json = run(['--json']);
  const lines = json.stdout.trimEnd().split('\n');
  assert.equal(lines.at(-1), String(BASELINE_UNBOUNDED));
  const report = JSON.parse(lines.slice(0, -1).join('\n'));
  assert.equal(report.unbounded, BASELINE_UNBOUNDED);
  assert.equal(report.classes[LIFETIME_CLASS.UNBOUNDED].length, BASELINE_UNBOUNDED);

  const table = run([]);
  assert.equal(table.stdout.trimEnd().split('\n').at(-1), String(BASELINE_UNBOUNDED));
});
