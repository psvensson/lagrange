// v2 store: derived quest state over v2 and verbatim v1 entries, and the
// front-matter parser.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  ENTRY_TYPE, FINDING_KIND, NEXT_OWNER, QUEST_STATUS, VERDICT,
} from '../../scripts/solve/schema.js';
import {
  appendEntry, classifyEntry, isQuestLogPath, listEpics, listQuestIds,
  parseFrontMatter, questState, readLog, writeQuest,
} from '../../scripts/solve/store.js';

const TEXT = 'x';
const QUEST_ID = 'q';
const VERIFIER = 'subagent:v';
const STATUS_DONE = 'done';
const README = 'README.md';
const TEMPLATE = '_template.md';
const EPIC_A = 'a';
const EPIC_B = 'b';

function attempt() {
  return {type: ENTRY_TYPE.ATTEMPT, text: TEXT};
}

function verification(verdict) {
  return {type: ENTRY_TYPE.VERIFICATION, text: TEXT, verifier: VERIFIER, verdict};
}

test('state: open, then blocked until the next attempt, then solved', () => {
  assert.equal(questState([]).status, QUEST_STATUS.OPEN);
  const blocked = questState([attempt(), {type: ENTRY_TYPE.TERMINAL, text: TEXT,
    status: QUEST_STATUS.BLOCKED, nextOwner: NEXT_OWNER.JUDGMENT}]);
  assert.equal(blocked.status, QUEST_STATUS.BLOCKED);
  assert.equal(blocked.blocked.nextOwner, NEXT_OWNER.JUDGMENT);
  const resumed = questState([attempt(), {type: ENTRY_TYPE.TERMINAL, text: TEXT,
    status: QUEST_STATUS.BLOCKED, nextOwner: NEXT_OWNER.JUDGMENT}, attempt()]);
  assert.equal(resumed.status, QUEST_STATUS.OPEN);
  assert.equal(resumed.attempts.length, 2);
  const solved = questState([attempt(), {type: ENTRY_TYPE.TERMINAL, text: TEXT,
    status: QUEST_STATUS.SOLVED}]);
  assert.equal(solved.status, QUEST_STATUS.SOLVED);
  assert.equal(solved.terminal, true);
});

test('state: verification currency and the altitude counter', () => {
  const rejected = questState([attempt(), verification(VERDICT.REJECT)]);
  assert.equal(rejected.verificationIsCurrent, true);
  assert.equal(rejected.lastVerification.verdict, VERDICT.REJECT);
  const stale = questState([attempt(), verification(VERDICT.REJECT), attempt()]);
  assert.equal(stale.verificationIsCurrent, false);
  const altitude = questState([attempt(), attempt(), {type: ENTRY_TYPE.FINDING, text: TEXT,
    kind: FINDING_KIND.ALTITUDE_CHECK}, attempt()]);
  assert.equal(altitude.attempts.length, 3);
  assert.equal(altitude.attemptsSinceAltitudeCheck.length, 1);
  const sealed = questState([{type: ENTRY_TYPE.FINDING, text: TEXT, kind: FINDING_KIND.DECISION,
    seal: {sealedAt: 'a'.repeat(40), metric: 3}}]);
  assert.equal(sealed.seal.seal.metric, 3);
});

test('legacy v1 entries classify into the four types', () => {
  assert.equal(classifyEntry({type: 'evidence-ingested'}), ENTRY_TYPE.FINDING);
  assert.equal(classifyEntry({type: 'theory-result'}), ENTRY_TYPE.FINDING);
  assert.equal(classifyEntry({type: 'finding', kind: 'verifier-rejection'}),
    ENTRY_TYPE.VERIFICATION);
  assert.equal(classifyEntry({type: 'attempt'}), ENTRY_TYPE.ATTEMPT);
  assert.equal(classifyEntry({type: 'park'}), ENTRY_TYPE.TERMINAL);
  assert.equal(classifyEntry({type: 'gate-decision'}), null);
  const v1 = questState([{type: 'quest-declared'}, {type: 'attempt'},
    {type: 'finding', kind: 'verifier-approval'}, {type: 'solved', frontier: 'f'},
    {type: 'quest', status: 'solved'}]);
  assert.equal(v1.status, QUEST_STATUS.SOLVED);
  assert.equal(v1.verificationIsCurrent, true);
  assert.equal(questState([{type: 'park', reason: TEXT}]).status, QUEST_STATUS.EXHAUSTED);
});

test('front-matter: scalars, lists, empty lists and nested doneWhen', () => {
  const parsed = parseFrontMatter(['---', 'id: e', 'status: open', 'legacy: true',
    'roadmapRow: null', 'doneWhen:', '  probe: script', '  args:',
    '    command: node scripts/checks/x.js', '    target: 0', 'quests:', '  - q1', '  - q2',
    'authorizes: []', '---', '', '# Title', ''].join('\n'));
  assert.deepEqual(parsed.front, {id: 'e', status: 'open', legacy: true, roadmapRow: null,
    doneWhen: {probe: 'script', args: {command: 'node scripts/checks/x.js', target: 0}},
    quests: ['q1', 'q2'], authorizes: []});
  assert.equal(parsed.body.trim(), '# Title');
  assert.equal(parseFrontMatter('# no front').front, null);
});

test('disk: quest dirs, append-only log, epics skip README and template', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'solve-v2-store-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  writeQuest(root, {id: QUEST_ID});
  appendEntry(root, QUEST_ID, attempt());
  appendEntry(root, QUEST_ID, attempt());
  assert.deepEqual(listQuestIds(root), [QUEST_ID]);
  const log = readLog(root, QUEST_ID);
  assert.equal(log.length, 2);
  assert.ok(log[0].ts);
  const epics = path.join(root, 'solve', 'epics');
  fs.mkdirSync(epics, {recursive: true});
  for (const name of [`${EPIC_A}.md`, `${EPIC_B}.md`, README, TEMPLATE]) {
    fs.writeFileSync(path.join(epics, name), `---\nid: ${name}\nstatus: ${STATUS_DONE}\n---\n`);
  }
  assert.deepEqual(listEpics(root).map((epic) => epic.id).sort(), [EPIC_A, EPIC_B]);
});

test('the quest-log path is exactly one canonical file per quest', () => {
  // A guard over the live operating surface may treat this one file as
  // historical record, so the boundary is stated adversarially here.
  for (const history of ['solve/quests/demo-quest/log.ndjson',
    'solve/quests/q9/log.ndjson', 'solve/quests/a-b-c-1/log.ndjson']) {
    assert.equal(isQuestLogPath(history), true, history);
  }
  const notHistory = [
    // The authored record and everything else under the quest stay governed.
    'solve/quests/demo-quest/quest.json',
    'solve/quests/demo-quest/evidence/receipt.json',
    'solve/quests/demo-quest/evidence/log.ndjson',
    'solve/quests/demo-quest',
    'solve/quests/log.ndjson',
    // Non-canonical quest ids are not quests.
    'solve/quests/Demo-Quest/log.ndjson',
    'solve/quests/not a slug/log.ndjson',
    'solve/quests/-leading/log.ndjson',
    'solve/quests/a/log.ndjson',
    'solve/quests/../log.ndjson',
    'solve/quests/./log.ndjson',
    // Lookalikes.
    'solve/quests/demo-quest/log.ndjson.bak',
    'solve/quests/demo-quest/log.ndjsonx',
    'solve/quests/demo-quest/log.ndjson/inner',
    'solve/quests/demo-quest/nested/log.ndjson',
    'x/solve/quests/demo-quest/log.ndjson',
    'solve//quests/demo-quest/log.ndjson',
    'SOLVE/quests/demo-quest/log.ndjson',
    // Deleted v1 locations get no special treatment.
    'solve/log/demo-quest.ndjson',
    'solve/report/demo-quest.md',
    'solve/autonomous/state.json',
    'solve/changes/demo-quest/attempt-1.diff',
    // Live surface stays governed even when it names the same strings.
    'docs/steering/rules.md',
    'docs/steering/workflow-guidelines/solver-quests.md',
    'scripts/solve/store.js',
    'AGENTS.md',
    'src/thing.js',
  ];
  for (const live of notHistory) {
    assert.equal(isQuestLogPath(live), false, live);
  }
});
