/**
 * The rule set is governed by a sealed manifest, not by a count.
 *
 * The previous revision held the rules to exactly twenty-five, and when
 * adversarial verification found a twenty-sixth independently violable
 * invariant the number is what bent the model: two invariants were folded into
 * one rule to keep the integer. These scenarios make the manifest the
 * criterion and the integer a consequence, and they prove the split that
 * followed is semantic rather than editorial - each of the two rules is
 * violable while the other holds.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';

import {
  alwaysLoadClosure, declaredRules, unregisteredOperationReferences,
} from '../../scripts/checks/check-steering-diet.js';
import {
  ruleSetManifest, ruleSetOffences, sealedRuleCount, supersessionOffences,
} from '../../scripts/checks/check-rule-set.js';
import {epicScopeProblems} from '../../scripts/solve/guards.js';
import {
  ACTION, authorizeAction, isAuthorized,
} from '../../scripts/action-authority.js';

const ROUTER_MD = 'docs/steering/router.md';
const ROUTER_DIR = 'docs/steering';
const PACKAGE = 'package.json';
const SPLIT_TABLE = 'docs/specs/decision-tables/steering-rule-authority-split.json';
const SCOPE_MECHANISM = 'scripts/solve/guards.js';
const AUTHORITY_MECHANISM = 'scripts/action-authority.js';
// A change set and a publish request, each shaped so that only one of the two
// facts under test varies. The scope mechanism never sees the publish request
// and the authority mechanism never sees the paths, which is what makes the
// two verdicts independent rather than asserted to be.
const SCOPE_FIXTURE = Object.freeze({
  quest: Object.freeze({id: 'a-quest'}),
  epic: Object.freeze({id: 'an-epic', front: Object.freeze({authorizes: ['docs']})}),
  within: Object.freeze(['docs/a.md', 'solve/quests/a-quest/quest.json']),
  outside: Object.freeze(['docs/a.md', 'src/partition/partition-service.js']),
});
const RED_HEAD = '1111111111111111111111111111111111111111';
const AUTHORITY_FIXTURE = Object.freeze({
  context: Object.freeze({redHead: RED_HEAD}),
  authorised: Object.freeze({action: ACTION.PUBLISH_HEAD_ON_RED,
    head: RED_HEAD, reason: 'the head this repairs'}),
  absent: null,
});
const RULES_MD = 'docs/steering/rules.md';
const ALWAYS_LOAD_BUDGET = 360;
const SCOPE_RULE = 'R16';
const AUTHORIZATION_RULE = 'R26';
const LINK = /\]\(([^)#\s]+)(?:#[^)]*)?\)/gu;
const RUN_COMMAND = /`npm run ([\w:-]+)`/gu;
const IMPLEMENTATION_IDENTITY = /[\w-]+\.(?:js|json|md|sh)\b|\/|npm run |--[a-z]/u;
const RULE_FIELDS = Object.freeze(['Invariant', 'Owner', 'On conflict']);
const MINIMUM_AUTHORITY = 10;
// The head this rule set's current revision supersedes.
const PUBLISHED_HEAD = 'c0670a2af496aa246a8c5ccd2d23efbe9e54fb52';
// The tasks an agent starts from, and the owner each must still reach.
const REPRESENTATIVE_TASKS = Object.freeze([
  {task: 'ordinary code change', owner: 'architecture'},
  {task: 'quest creation and landing', owner: 'quest-lifecycle'},
  {task: 'guard or checker modification', owner: 'guideline-audits'},
  {task: 'architecture or owner change', owner: 'owner-interactions'},
  {task: 'red-main repair', owner: 'publication'},
]);

function routerRows() {
  const rows = fs.readFileSync(ROUTER_MD, 'utf8').split('\n');
  return new Map(rows.flatMap((line) => {
    const match = /^\|\s*`([\w-]+)`\s*\|([^|]*)\|/u.exec(line);
    return match ? [[match[1], match[2]]] : [];
  }));
}

function resolvedAuthorities(cell, scripts) {
  const files = [...cell.matchAll(LINK)]
    .map((match) => path.join(ROUTER_DIR, match[1]))
    .filter((file) => fs.existsSync(file));
  const commands = [...cell.matchAll(RUN_COMMAND)]
    .map((match) => match[1])
    .filter((command) => Object.hasOwn(scripts, command));
  return [...files, ...commands];
}

function ruleById(id) {
  return declaredRules().find((rule) => rule.id === id);
}

function splitTable() {
  return JSON.parse(fs.readFileSync(SPLIT_TABLE, 'utf8'));
}

test('manifest and rule bodies agree entry for entry', () => {
  const manifest = ruleSetManifest();
  assert.ok(manifest, 'the sealed rule-set manifest exists');
  assert.deepEqual(ruleSetOffences(), [],
    'the current rules are exactly what the manifest seals');
  assert.equal(sealedRuleCount(), declaredRules().length,
    'the count is derived from the manifest, not asserted against a literal');
});

test('rule ids are unique and contiguous', () => {
  const ids = ruleSetManifest().rules.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids, ids.map((_unused, index) =>
    `R${String(index + 1).padStart(2, '0')}`));
  assert.deepEqual(declaredRules().map((rule) => rule.id), ids,
    'the bodies carry the same ids in the same order');
});

test('one independently violable invariant per rule', () => {
  const entries = ruleSetManifest().rules;
  const invariants = entries.map((entry) => entry.invariant);
  assert.equal(new Set(invariants).size, invariants.length,
    'no two rules carry the same invariant');
  for (const entry of entries) {
    assert.ok(typeof entry.invariant === 'string' && entry.invariant.length > 0,
      `${entry.id} names no invariant`);
  }
  // The two rules this revision split are the ones whose independence is
  // modelled; the model is what proves the split was not editorial.
  const modelled = new Set([SCOPE_RULE, AUTHORIZATION_RULE]);
  for (const id of modelled) {
    assert.ok(entries.some((entry) => entry.id === id), `${id} is not sealed`);
  }
});

test('exactly one owner key per rule', () => {
  for (const entry of ruleSetManifest().rules) {
    assert.equal(typeof entry.owner, 'string');
    assert.equal(entry.owner.includes(','), false,
      `${entry.id} names more than one owner`);
    assert.equal(ruleById(entry.id).fields.Owner.replaceAll('`', ''), entry.owner,
      `${entry.id}'s body names a different owner than the manifest`);
  }
});

test('every owner key resolves through the router', () => {
  const rows = routerRows();
  const scripts = JSON.parse(fs.readFileSync(PACKAGE, 'utf8')).scripts;
  for (const entry of ruleSetManifest().rules) {
    assert.equal(rows.has(entry.owner), true,
      `${entry.id} routes to ${entry.owner}, which the router has no row for`);
    const authorities = resolvedAuthorities(rows.get(entry.owner), scripts);
    assert.ok(authorities.length > 0,
      `${entry.owner} resolves to nothing that exists`);
  }
});

test('no implementation identity leaks into a rule', () => {
  for (const rule of declaredRules()) {
    for (const field of RULE_FIELDS) {
      assert.equal(IMPLEMENTATION_IDENTITY.test(rule.fields[field]), false,
        `${rule.id} ${field} names an implementation: ${rule.fields[field]}`);
    }
  }
});

test('R16 owns all of R16 and none of R26', () => {
  const scope = ruleById(SCOPE_RULE);
  const text = [scope.title, ...RULE_FIELDS.map((field) => scope.fields[field])].join(' ');
  // The authorization vocabulary must be gone from the scope rule entirely:
  // leaving any of it folded in is what this revision exists to undo.
  for (const word of ['irreversible', 'outward', 'authorit', 'authoriz']) {
    assert.equal(text.toLowerCase().includes(word), false,
      `${SCOPE_RULE} still carries authorization vocabulary: ${word}`);
  }
  assert.match(scope.fields.Invariant, /scope/iu,
    `${SCOPE_RULE} still states the scope invariant`);
  // And the action vocabulary lives in exactly one rule, so it cannot be
  // folded back into a second one without this failing.
  // And the converse: the authorization rule must not have become a second
  // statement of the scope invariant.
  const authority = ruleById(AUTHORIZATION_RULE);
  const authorityText =
    [authority.title, ...RULE_FIELDS.map((field) => authority.fields[field])].join(' ');
  for (const word of ['scope', 'only what', 'stays inside', 'was told to']) {
    assert.equal(authorityText.toLowerCase().includes(word), false,
      `${AUTHORIZATION_RULE} restates the scope invariant: ${word}`);
  }
  const carriers = declaredRules().filter((rule) =>
    /irreversible|outward/iu.test(
      [rule.title, ...RULE_FIELDS.map((field) => rule.fields[field])].join(' ')));
  assert.deepEqual(carriers.map((rule) => rule.id), [AUTHORIZATION_RULE],
    'exactly one rule speaks about outward or irreversible actions');
});

test('R26 routes to the real authorization boundary', () => {
  const entry = ruleSetManifest().rules.find((row) => row.id === AUTHORIZATION_RULE);
  assert.ok(entry, `${AUTHORIZATION_RULE} is not sealed`);
  const rows = routerRows();
  const scripts = JSON.parse(fs.readFileSync(PACKAGE, 'utf8')).scripts;
  const authorities = resolvedAuthorities(rows.get(entry.owner), scripts);
  assert.ok(authorities.length > 0,
    `${entry.owner} resolves to nothing that exists`);
  // An owner invented to make the rule green would resolve only to prose. At
  // least one authority behind it has to be something that runs.
  const executable = authorities.filter((authority) =>
    Object.hasOwn(scripts, authority) || authority.endsWith('.js'));
  assert.ok(executable.length > 0,
    `${entry.owner} resolves only to documents; the authorization boundary ` +
    'needs a mechanism that enforces it');
  const rule = ruleById(AUTHORIZATION_RULE);
  assert.match(rule.fields.Invariant, /authorit|authoris|authoriz/iu,
    'R26 states the authorization invariant');
});

test('the always-load transitive path is within 360 lines', () => {
  const closure = alwaysLoadClosure();
  assert.ok(closure.files.includes(RULES_MD));
  assert.ok(closure.lines <= ALWAYS_LOAD_BUDGET,
    `always-load path is ${closure.lines} lines`);
});

test('registered-operation closure remains green', () => {
  assert.deepEqual(unregisteredOperationReferences(), []);
});

test('representative tasks reach their owner from the always-load layer', () => {
  const rows = routerRows();
  const owners = new Set(declaredRules().map((rule) =>
    rule.fields.Owner.replaceAll('`', '')));
  const scripts = JSON.parse(fs.readFileSync(PACKAGE, 'utf8')).scripts;
  for (const {task, owner} of REPRESENTATIVE_TASKS) {
    assert.equal(rows.has(owner), true, `${task}: router has no ${owner}`);
    assert.equal(owners.has(owner), true, `${task}: no rule routes to ${owner}`);
    for (const authority of resolvedAuthorities(rows.get(owner), scripts)) {
      if (!fs.existsSync(authority)) continue;
      assert.ok(fs.readFileSync(authority, 'utf8').split('\n').length > MINIMUM_AUTHORITY,
        `${task}: ${owner} routes to a stub at ${authority}`);
    }
  }
});

// R16's mechanism: the landing guard refuses a path the sealed scope does not
// authorise. It is given no publish request and cannot see one.
function scopeVerdict(scope) {
  const paths = SCOPE_FIXTURE[scope];
  return epicScopeProblems(SCOPE_FIXTURE.quest, SCOPE_FIXTURE.epic, [...paths])
    .length === 0 ? 'holds' : 'violated';
}

// R26's mechanism: the authority refuses an outward action the operator has
// not authorized. It is given no paths and cannot see any.
function authorityVerdict(authorization) {
  return isAuthorized(authorizeAction({
    action: ACTION.PUBLISH_HEAD_ON_RED,
    signal: AUTHORITY_FIXTURE[authorization],
    context: AUTHORITY_FIXTURE.context,
  })) ? 'holds' : 'violated';
}

function authorityOf(id) {
  const entry = ruleSetManifest().rules.find((row) => row.id === id);
  const scripts = JSON.parse(fs.readFileSync(PACKAGE, 'utf8')).scripts;
  return resolvedAuthorities(routerRows().get(entry.owner), scripts);
}

test('the two rules route to owners that share no authority', () => {
  // An editorial split would leave both rules pointing at the same place. The
  // owners here resolve to disjoint sets, and each set contains the mechanism
  // that realises its rule.
  const scope = authorityOf(SCOPE_RULE);
  const authority = authorityOf(AUTHORIZATION_RULE);
  assert.ok(scope.includes(SCOPE_MECHANISM),
    `${SCOPE_RULE} does not route to the mechanism that enforces it`);
  assert.ok(authority.includes(AUTHORITY_MECHANISM),
    `${AUTHORIZATION_RULE} does not route to the mechanism that enforces it`);
  const shared = scope.filter((entry) => authority.includes(entry));
  assert.deepEqual(shared, [],
    'the two rules resolve to a shared authority, so they are not separately owned');
});

test('authorization removed inside scope fails R26 only', () => {
  // Measured on the mechanisms themselves, not on a table describing them.
  assert.equal(scopeVerdict('within'), 'holds',
    'the change set stays inside what the sealed scope authorises');
  assert.equal(authorityVerdict('absent'), 'violated',
    'the outward action is refused because its operator signal is incomplete');
});

test('scope left with valid authorization fails R16 only', () => {
  assert.equal(scopeVerdict('outside'), 'violated',
    'the change set reaches a path the sealed scope does not authorise');
  assert.equal(authorityVerdict('authorised'), 'holds',
    'the outward action carries the operator signal it needs');
});

test('neither verdict moves with the other rule\'s input', () => {
  // The independence itself: the scope mechanism is a function of the paths
  // alone and the authority mechanism of the request alone, so no combination
  // of the two facts can make one verdict depend on the other.
  for (const scope of ['within', 'outside']) {
    const before = scopeVerdict(scope);
    authorityVerdict('absent');
    authorityVerdict('authorised');
    assert.equal(scopeVerdict(scope), before,
      `R16's verdict moved when the authorization fact changed at ${scope}`);
  }
  for (const authorization of ['authorised', 'absent']) {
    const before = authorityVerdict(authorization);
    scopeVerdict('within');
    scopeVerdict('outside');
    assert.equal(authorityVerdict(authorization), before,
      `R26's verdict moved when the scope fact changed at ${authorization}`);
  }
});

test('the modelled table matches what the mechanisms actually do', () => {
  // The decision table is the model; the mechanisms are the evidence. Checking
  // the model against them is what stops the table from asserting its own
  // conclusion.
  const table = splitTable();
  assert.equal(table.rules.length, 4, 'every combination is stated exactly once');
  const seen = new Set();
  for (const row of table.rules) {
    const scope = row.when.unitStaysWithinAuthorisedScope;
    const authorization = row.when.operatorAuthorisedTheOutwardFacingAction;
    seen.add(`${scope}/${authorization}`);
    assert.equal(row.outcome.r16, scopeVerdict(scope),
      `the model disagrees with the scope mechanism at ${scope}`);
    assert.equal(row.outcome.r26, authorityVerdict(authorization),
      `the model disagrees with the authority mechanism at ${authorization}`);
  }
  assert.equal(seen.size, 4, 'the model is total over both facts');
});

test('growing the sealed rule set requires a revision, not an edit', () => {
  // Two coordinated file edits must not be enough to add a rule: which rules
  // exist is the thing the manifest seals. Built from synthetic manifests so
  // the property is proved independently of the live one.
  const previous = {revision: 1, rules: [{id: 'R01', invariant: 'a', owner: 'steering'}]};
  const unchanged = {...previous};
  const grown = {...previous,
    rules: [...previous.rules, {id: 'R02', invariant: 'b', owner: 'steering'}]};
  const revised = {...grown, revision: 2,
    supersedes: {revision: 1, head: PUBLISHED_HEAD, rules: previous.rules.length,
      reason: 'the model gained an invariant'}};

  assert.deepEqual(supersessionOffences(previous, unchanged), [],
    'an unchanged rule set is not a revision');
  assert.notDeepEqual(supersessionOffences(previous, grown), [],
    'a changed rule set carrying the same revision is refused');
  assert.deepEqual(supersessionOffences(previous, revised), [],
    'a deliberate revision that names what it supersedes is accepted');
  for (const [field, value, why] of [
    ['revision', 0, 'does not supersede its predecessor'],
    ['head', 'a-label', 'names no published head'],
    ['rules', previous.rules.length + 2, 'misstates what its predecessor sealed'],
    ['reason', '', 'gives no reason'],
  ]) {
    assert.notDeepEqual(
      supersessionOffences(previous,
        {...revised, supersedes: {...revised.supersedes, [field]: value}}),
      [], `a revision that ${why} is refused`);
  }
  // The manifest at the last commit is normally this same revision rather
  // than the one it supersedes, so it cannot answer how many the predecessor
  // sealed. Comparing it as though it could is what made this check pass in a
  // working tree and fail in the publish gate's worktree at the same head.
  const sameRevision = {...revised};
  assert.deepEqual(supersessionOffences(sameRevision, sameRevision), [],
    'a committed manifest of this revision is not its own predecessor');
  assert.notDeepEqual(
    supersessionOffences(previous,
      {...revised, supersedes: {...revised.supersedes, rules: 99}}),
    [], 'a misstated predecessor count is still refused when it can be checked');
  // And the sealed manifest in the tree is itself a well-formed revision.
  assert.deepEqual(ruleSetOffences(), []);
});

test('the always-load layer states no rule count', () => {
  // A written total is the criterion coming back: it can only drift from the
  // manifest or become the thing the model is fitted to again.
  assert.deepEqual(ruleSetOffences(), [],
    'no always-load document states how many rules there are');
});
