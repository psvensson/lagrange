// v2 record validation: quest.json, log entries, epic front-matter.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  ENTRY_TYPE, FINDING_KIND, NEXT_OWNER, PROBE, QUEST_SCHEMA, QUEST_STATUS,
  THEORY_STATUS, VERDICT, entryProblems, epicProblems, questProblems,
} from '../../scripts/solve/schema.js';

const SHA = 'a'.repeat(40);
const STATEMENT = 'The thing is true.';
const QUEST_ID = 'demo-quest';
const EPIC_ID = 'demo-epic';
const ORACLE_FILE = 'solve/quests/demo-quest/evidence/oracle.json';
const NOT_A_SLUG = 'Not A Slug';
const CLASS_FIX = 'fix';
const CLASS_PRODUCT = 'product';
const VERIFIER = 'subagent:v1';
const PLAIN_VERIFIER = 'me';
const PROOF_DETERMINISTIC = 'deterministic';
const EPIC_STATUS_OPEN = 'open';
const EPIC_STATUS_DONE = 'done';
const CONSTRAINT_ID = 'c1';

function quest(overrides = {}) {
  return {
    schema: QUEST_SCHEMA, id: QUEST_ID, statement: STATEMENT, epic: EPIC_ID,
    doneWhen: {probe: PROBE.ORACLE, args: {file: ORACLE_FILE}},
    constraints: [{id: CONSTRAINT_ID, statement: STATEMENT}],
    ...overrides,
  };
}

test('a well-formed quest has no problems; sealed adds the sha rule', () => {
  assert.deepEqual(questProblems(quest()), []);
  assert.equal(questProblems(quest(), {sealed: true}).length, 1);
  assert.deepEqual(questProblems(quest({sealedAt: SHA}), {sealed: true}), []);
});

test('every quest rule names its field', () => {
  const problems = questProblems(quest({
    schema: undefined, id: NOT_A_SLUG, statement: '', epic: undefined,
    doneWhen: {probe: 'nope'}, constraints: [{id: CONSTRAINT_ID}], frontiers: [],
  }));
  for (const field of ['schema', 'id', 'statement', 'epic', 'doneWhen', 'constraints', 'frontiers']) {
    assert.ok(problems.some((problem) => problem.includes(field)), `${field}: ${problems}`);
  }
  assert.equal(questProblems(null).length, 1);
});

test('a fix needs no epic; any other class does', () => {
  assert.deepEqual(questProblems(quest({class: CLASS_FIX, epic: undefined})), []);
  assert.equal(questProblems(quest({class: CLASS_PRODUCT, epic: undefined})).length, 1);
});

test('log entries: four types, typed findings, verifier prefix, blocked owner', () => {
  assert.deepEqual(entryProblems({type: ENTRY_TYPE.ATTEMPT, text: STATEMENT}), []);
  assert.deepEqual(entryProblems({type: ENTRY_TYPE.FINDING, text: STATEMENT}), []);
  assert.deepEqual(entryProblems({type: ENTRY_TYPE.FINDING, kind: FINDING_KIND.THEORY,
    status: THEORY_STATUS.ACTIVE, text: STATEMENT}), []);
  assert.equal(entryProblems({type: ENTRY_TYPE.FINDING, kind: FINDING_KIND.THEORY,
    text: STATEMENT}).length, 1, 'a theory needs a status');
  assert.equal(entryProblems({type: ENTRY_TYPE.FINDING, kind: 'live-vibes', text: STATEMENT})
    .length, 1);
  assert.deepEqual(entryProblems({type: ENTRY_TYPE.VERIFICATION, text: STATEMENT,
    verifier: VERIFIER, verdict: VERDICT.REJECT}), []);
  assert.equal(entryProblems({type: ENTRY_TYPE.VERIFICATION, text: STATEMENT,
    verifier: PLAIN_VERIFIER, verdict: VERDICT.APPROVE}).length, 1, 'verifier is a subagent');
  assert.equal(entryProblems({type: ENTRY_TYPE.TERMINAL, text: STATEMENT,
    status: QUEST_STATUS.BLOCKED}).length, 1, 'blocked needs nextOwner');
  assert.deepEqual(entryProblems({type: ENTRY_TYPE.TERMINAL, text: STATEMENT,
    status: QUEST_STATUS.BLOCKED, nextOwner: NEXT_OWNER.JUDGMENT}), []);
  assert.equal(entryProblems({type: 'gate-decision', text: STATEMENT}).length, 1);
  assert.equal(entryProblems({type: ENTRY_TYPE.ATTEMPT, text: ''}).length, 1);
});

test('epic front-matter: open needs doneWhen unless legacy', () => {
  const front = {id: EPIC_ID, status: EPIC_STATUS_OPEN, proof: PROOF_DETERMINISTIC,
    quests: [], authorizes: []};
  assert.equal(epicProblems(front).length, 1);
  assert.deepEqual(epicProblems({...front, legacy: true}), []);
  assert.deepEqual(epicProblems({...front, doneWhen: {probe: PROBE.SCRIPT,
    args: {command: 'node scripts/checks/x.js'}}}), []);
  assert.deepEqual(epicProblems({...front, status: EPIC_STATUS_DONE}), []);
  assert.equal(epicProblems({...front, quests: null, authorizes: null, legacy: true}).length, 2);
  assert.equal(epicProblems(null).length, 1);
});
