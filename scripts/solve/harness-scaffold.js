// Harness scaffold — writes the deterministic evidence-harness skeleton for a
// test-receipt quest (scripts/quest-evidence-<id>.js) with one receipt
// placeholder per required receipt id, so a new quest starts from a file the
// shared runtime already runs instead of from a hand-copied sibling (~20 min
// per quest measured). Never overwrites, never seals anything; the skeleton
// fails its receipts until each testFile (or testNamePattern) is filled in,
// which is exactly the fail-closed shape the probe expects.

import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const SCRIPTS_DIR = 'scripts';
const HARNESS_PREFIX = 'quest-evidence-';
const HARNESS_SUFFIX = '.js';
const RUNTIME_MODULE = './quest-evidence-harness-runtime.js';
const TEST_RECEIPT_PROBE = 'test-receipt';
const GIT_BINARY = 'git';
const GIT_ADD_INTENT_ARGUMENTS = Object.freeze(['add', '-N', '--']);
const TEXT_ENCODING = 'utf8';
const TODO_TEST_FILE = 'null /* TODO: test file under test/ */';
const TODO_DETAIL = 'TODO: one-line claim this receipt proves';
const LINE_SEPARATOR = '\n';
const INDENT = '  ';
const HEADER_COMMENT_LINES = Object.freeze([
  '// declarations only. The shared runtime',
  '// (scripts/quest-evidence-harness-runtime.js) re-runs each recorded proof',
  '// command and writes the probe artifact. Fill every testFile (a whole',
  '// test file) or testNamePattern (an anchored ^...$ node:test name) before',
  '// the receipt can pass; a placeholder receipt fails closed.',
  '',
  'import path from \'node:path\';',
  '',
  'import {',
]);
const IMPORT_CLOSE_PREFIX = '} from \'';
const IMPORT_CLOSE_SUFFIX = '\';';
const RECEIPTS_OPEN_LINES = Object.freeze(['', 'const RECEIPTS = Object.freeze([']);
const RECEIPTS_CLOSE_LINES = Object.freeze([']);', '']);
const RUN_OPEN_LINES = Object.freeze(['', 'runQuestEvidenceHarness({']);
const RUN_OUTPUT_LINE =
  `${INDENT}outputFile: path.join(...OUTPUT_FILE.split('/')),`;
const RUN_RECEIPTS_LINE = `${INDENT}receipts: RECEIPTS,`;
const RUN_QUEST_LINE = `${INDENT}questId: QUEST_ID,`;
const RUN_CLOSE_LINES = Object.freeze(['});', '']);
const HEADER_PREFIX = '// Deterministic evidence harness for the ';
const HEADER_SUFFIX = ' quest: receipt';
const QUEST_ID_DECLARATION = 'const QUEST_ID = ';
const OUTPUT_FILE_DECLARATION = 'const OUTPUT_FILE = ';
const STATEMENT_END = ';';

export function questHarnessPath(questId) {
  return path.posix.join(SCRIPTS_DIR, `${HARNESS_PREFIX}${questId}${HARNESS_SUFFIX}`);
}

export function isTestReceiptQuest(quest) {
  return quest?.doneWhen?.probe === TEST_RECEIPT_PROBE;
}

export function questHarnessMissing(root, quest) {
  return isTestReceiptQuest(quest) &&
    !fs.existsSync(path.join(root, questHarnessPath(quest.id)));
}

function receiptBlock(id) {
  return [
    `${INDENT}Object.freeze({`,
    `${INDENT}${INDENT}id: ${JSON.stringify(id)},`,
    `${INDENT}${INDENT}testFile: ${TODO_TEST_FILE},`,
    `${INDENT}${INDENT}testNamePattern: null,`,
    `${INDENT}${INDENT}detail: ${JSON.stringify(TODO_DETAIL)},`,
    `${INDENT}}),`,
  ].join(LINE_SEPARATOR);
}

export function renderQuestHarness(quest) {
  const receiptIds = quest?.doneWhen?.args?.requiredReceipts || [];
  const outputFile = quest?.doneWhen?.args?.file ||
    `solve/evidence/${quest.id}.receipt.json`;
  return [
    `${HEADER_PREFIX}${quest.id}${HEADER_SUFFIX}`,
    ...HEADER_COMMENT_LINES,
    `${INDENT}runQuestEvidenceHarness,`,
    `${IMPORT_CLOSE_PREFIX}${RUNTIME_MODULE}${IMPORT_CLOSE_SUFFIX}`,
    ...RECEIPTS_OPEN_LINES,
    ...receiptIds.map(receiptBlock),
    ...RECEIPTS_CLOSE_LINES,
    `${QUEST_ID_DECLARATION}${JSON.stringify(quest.id)}${STATEMENT_END}`,
    `${OUTPUT_FILE_DECLARATION}${JSON.stringify(outputFile)}${STATEMENT_END}`,
    ...RUN_OPEN_LINES,
    RUN_QUEST_LINE,
    RUN_OUTPUT_LINE,
    RUN_RECEIPTS_LINE,
    ...RUN_CLOSE_LINES,
  ].join(LINE_SEPARATOR);
}

// Writes the skeleton when absent and stages intent-to-add so the sealed
// attempt diff sees it. Returns {path, created}; an existing file is never
// touched and reports created: false.
export function scaffoldQuestHarness(root, quest) {
  const relative = questHarnessPath(quest.id);
  const absolute = path.join(root, relative);
  if (!isTestReceiptQuest(quest)) return {path: relative, created: false};
  if (fs.existsSync(absolute)) return {path: relative, created: false};
  fs.mkdirSync(path.dirname(absolute), {recursive: true});
  fs.writeFileSync(absolute, renderQuestHarness(quest), TEXT_ENCODING);
  spawnSync(GIT_BINARY, [...GIT_ADD_INTENT_ARGUMENTS, relative],
    {cwd: root, encoding: TEXT_ENCODING});
  return {path: relative, created: true};
}
