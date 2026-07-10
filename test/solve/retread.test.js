import tap from 'tap';

import {
  extractStatementTokens,
  parseRevertLog,
  findRevertOverlaps,
  lineageRulesOut,
  renderRetreadLines,
  retreadCheckLines,
} from '../../scripts/solve/retread.js';

// Mirrors the real incident: the statement cites the file (with :line-range) that
// the same-morning revert commit touched, and names the CL id from its subject.
const STATEMENT =
  'drain the surplus by coupling removal at the CL-043 serialization layer ' +
  '(operation-workflow-remove-safety-evaluator.js:378-412), not via ' +
  'src/rebalancer/move-planner-move-calculation-methods.js';
const REVERT_LOG =
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\trevert(voter-ready-60s): remove Phase 2 CL-045\n' +
  'src/rebalancer/operation-workflow-remove-safety-evaluator.js\n' +
  '\n' +
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\trevert(other): unrelated\n' +
  'src/other/unrelated-file.js\n';

tap.test('extractStatementTokens pulls file basenames and CL ids', (t) => {
  const tokens = extractStatementTokens(STATEMENT);
  t.ok(tokens.basenames.has('operation-workflow-remove-safety-evaluator.js'),
    'bare basename with :line-range suffix extracted');
  t.ok(tokens.basenames.has('move-planner-move-calculation-methods.js'),
    'path-qualified citation extracted by basename');
  t.ok(tokens.closureIds.has('CL-043'));
  t.same(extractStatementTokens(''), {basenames: new Set(), closureIds: new Set()});
  t.end();
});

tap.test('parseRevertLog splits commits and their touched files', (t) => {
  const commits = parseRevertLog(REVERT_LOG);
  t.equal(commits.length, 2);
  t.equal(commits[0].subject, 'revert(voter-ready-60s): remove Phase 2 CL-045');
  t.same(commits[0].files,
    ['src/rebalancer/operation-workflow-remove-safety-evaluator.js']);
  t.same(parseRevertLog(''), []);
  t.end();
});

tap.test('findRevertOverlaps flags the cited-file revert only', (t) => {
  const overlaps = findRevertOverlaps(STATEMENT,
    {root: '/nowhere', revertLog: () => REVERT_LOG});
  t.equal(overlaps.length, 1, 'the unrelated revert does not match');
  t.equal(overlaps[0].sha, 'aaaaaaaa');
  t.same(overlaps[0].files,
    ['src/rebalancer/operation-workflow-remove-safety-evaluator.js']);
  t.end();
});

tap.test('findRevertOverlaps matches a CL id in the revert subject', (t) => {
  const overlaps = findRevertOverlaps('re-attempt the CL-045 lever',
    {root: '/nowhere', revertLog: () => REVERT_LOG});
  t.equal(overlaps.length, 1);
  t.same(overlaps[0].closureIds, ['CL-045']);
  t.end();
});

tap.test('findRevertOverlaps degrades to [] when git is unavailable', (t) => {
  t.same(findRevertOverlaps(STATEMENT, {root: '/nowhere', revertLog: () => null}),
    []);
  t.same(findRevertOverlaps('no citations here',
    {root: '/nowhere', revertLog: () => t.fail('must not run git') || ''}),
  [], 'a statement citing nothing never shells out');
  t.end();
});

tap.test('lineageRulesOut collects parent + sibling levers, minus own', (t) => {
  const quest = {id: 'child-b', links: {parentQuest: 'parent'}};
  const corpus = [
    {id: 'parent', links: {}},
    {id: 'child-a', links: {parentQuest: 'parent'}},
    {id: 'child-b', links: {parentQuest: 'parent'}},
    {id: 'stranger', links: {parentQuest: 'someone-else'}},
  ];
  const findings = {
    'parent': [{rulesOut: 'lever-p', claim: 'p'}],
    'child-a': [{rulesOut: 'lever-a', claim: 'a'}],
    'child-b': [{rulesOut: 'lever-p', claim: 'inherited copy'}],
  };
  const entries = lineageRulesOut('/nowhere', quest, {
    loadQuests: () => corpus,
    readRulesOut: (root, id) => findings[id] || [],
  });
  t.same(entries.map((e) => e.rulesOut), ['lever-a'],
    'parent lever already on the quest is deduped; stranger is out of lineage');
  t.same(lineageRulesOut('/nowhere', {id: 'q', links: {}}, {}), [],
    'no parent -> no lineage');
  t.end();
});

tap.test('renderRetreadLines and retreadCheckLines produce printable output', (t) => {
  const lines = renderRetreadLines(
    [{sha: 'aaaaaaaa', subject: 's', files: ['f.js'], closureIds: []}],
    [{questId: 'parent', rulesOut: 'lever-p'}]);
  t.match(lines[0], /RETREAD WARNING: revert aaaaaaaa/);
  t.match(lines[1], /Lineage rulesOut/);
  t.match(lines[2], /\[parent\] lever-p/);
  t.same(renderRetreadLines([], []), []);

  const checkLines = retreadCheckLines('/nowhere',
    {id: 'q', statement: STATEMENT, links: {}},
    {revertLog: () => REVERT_LOG, loadQuests: () => [], readRulesOut: () => []});
  t.equal(checkLines.length, 1, 'one overlap, no lineage');
  t.match(checkLines[0], /RETREAD WARNING/);
  t.end();
});
