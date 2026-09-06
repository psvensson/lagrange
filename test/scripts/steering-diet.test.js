/**
 * Steering is a routing layer: twenty-five cross-cutting invariants, each
 * naming one owner, plus a table that turns an owner key into a path. These
 * scenarios are the acceptance tests for that shape. The strongest of them is
 * the router falsifier: a rule may not contain any implementation identity,
 * so renaming a checker or moving a file cannot require editing a rule.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';

import {
  alwaysLoadClosure, declaredRules, registeredVerbs, unregisteredOperationReferences,
} from '../../scripts/checks/check-steering-diet.js';
import {
  AUTHORED_IN_GENERATED_DIR, baselineInventory, countLines,
} from '../../scripts/checks/steering-baseline-inventory.js';

const RULES_MD = 'docs/steering/rules.md';
const ROUTER_MD = 'docs/steering/router.md';
const INVENTORY = 'solve/epics/solve-v2/steering-inventory.json';
const DISPOSITION = 'solve/epics/solve-v2/steering-disposition.json';
const PACKAGE = 'package.json';
const ROUTER_DIR = 'docs/steering';
// A disposition and the bucket it lands in are one decision, recorded twice.
const BUCKET_OF = Object.freeze({
  'move': 'always-load-invariant',
  'retain': 'owner-routing',
  'duplicate-delete': 'owner-duplication',
  'illustrative-delete': 'explanation-example',
  'historical-delete': 'historical-retired',
});
// Relocation drops the retired front-matter keys that named the pack and its
// parent index, so a destination may be a few lines shorter than the material
// it received. It may not be a stub of it.
const RELOCATION_ALLOWANCE = 4;
// An authority that is only a heading routes nowhere.
const MINIMUM_AUTHORITY = 10;
// Steps 2 and 3 of the load order at the frozen baseline, hand-curated
// despite living under the generated directory.
const BASELINE_ALWAYS_LOAD = Object.freeze([
  'docs/steering/llm/core.md',
  'docs/steering/llm/boot.md',
]);
// A router row carries either a path that resolves or a command the
// project actually defines. Anything else routes an agent nowhere.
const LINK = /\]\(([^)#\s]+)(?:#[^)]*)?\)/gu;
const RUN_COMMAND = /`npm run ([\w:-]+)`/gu;
const EXPECTED_RULES = 25;
const ALWAYS_LOAD_BUDGET = 360;
// An implementation identity in a rule is what makes steering grow back: the
// rule then has to be edited whenever the implementation moves.
const IMPLEMENTATION_IDENTITY = /[\w-]+\.(?:js|json|md|sh)\b|\/|npm run |--[a-z]/u;
// Every task an agent starts from must reach an owner through the always-load
// layer alone.
const REPRESENTATIVE_TASKS = Object.freeze([
  {task: 'ordinary code change', owner: 'architecture'},
  {task: 'quest creation and landing', owner: 'quest-lifecycle'},
  {task: 'guard or checker modification', owner: 'guideline-audits'},
  {task: 'architecture or owner change', owner: 'owner-interactions'},
  {task: 'red-main repair', owner: 'publication'},
]);

function ruleOwners() {
  return declaredRules().map((rule) => rule.fields.Owner.replaceAll('`', ''));
}

function routerRows() {
  const rows = fs.readFileSync(ROUTER_MD, 'utf8').split('\n');
  return new Map(rows.flatMap((line) => {
    const match = /^\|\s*`([\w-]+)`\s*\|([^|]*)\|/u.exec(line);
    return match ? [[match[1], match[2]]] : [];
  }));
}

function routerKeys() {
  return new Set(routerRows().keys());
}

// What an owner row actually resolves to: the files it names that exist, and
// the project commands it names that are defined.
function resolvedAuthorities(cell, scripts) {
  const files = [...cell.matchAll(LINK)]
    .map((match) => path.join(ROUTER_DIR, match[1]))
    .filter((file) => fs.existsSync(file));
  const commands = [...cell.matchAll(RUN_COMMAND)]
    .map((match) => match[1])
    .filter((command) => Object.hasOwn(scripts, command));
  return [...files, ...commands];
}

test('rules.md holds exactly twenty-five structural rules', () => {
  const rules = declaredRules();
  assert.equal(rules.length, EXPECTED_RULES);
  assert.deepEqual(rules.flatMap((rule) => rule.problems), [],
    'each rule states one invariant, one owner and one conflict resolution');
  assert.deepEqual(rules.map((rule) => rule.id),
    Array.from({length: EXPECTED_RULES},
      (_unused, index) => `R${String(index + 1).padStart(2, '0')}`));
});

test('no rule duplicates another rule', () => {
  const invariants = declaredRules().map((rule) => rule.fields.Invariant);
  assert.equal(new Set(invariants).size, invariants.length);
  const titles = declaredRules().map((rule) => rule.title.toLowerCase());
  assert.equal(new Set(titles).size, titles.length);
});

test('a detail change at an owner does not require editing rules.md', () => {
  // No rule may name a file, a command or a flag: an owner is named by key,
  // and the key becomes a path in exactly one place.
  for (const rule of declaredRules()) {
    for (const field of ['Invariant', 'Owner', 'On conflict']) {
      assert.equal(IMPLEMENTATION_IDENTITY.test(rule.fields[field]), false,
        `${rule.id} ${field} names an implementation: ${rule.fields[field]}`);
    }
  }
  // Every owner key resolves in the router, and the router is where paths live.
  const keys = routerKeys();
  for (const owner of ruleOwners()) {
    assert.equal(keys.has(owner), true, `router has no row for ${owner}`);
  }
  assert.match(fs.readFileSync(ROUTER_MD, 'utf8'), /architecture\/INDEX\.md/u,
    'the router is the layer that carries paths');
});

test('each representative task reaches its owner from the always-load layer', () => {
  const rows = routerRows();
  const owners = new Set(ruleOwners());
  const scripts = JSON.parse(fs.readFileSync(PACKAGE, 'utf8')).scripts;
  for (const {task, owner} of REPRESENTATIVE_TASKS) {
    assert.equal(rows.has(owner), true, `${task}: router has no ${owner}`);
    assert.equal(owners.has(owner), true, `${task}: no rule routes to ${owner}`);
    // The route has to arrive somewhere: a file that exists or a command the
    // project defines, and a document has to hold more than a heading.
    const authorities = resolvedAuthorities(rows.get(owner), scripts);
    assert.ok(authorities.length > 0, `${task}: ${owner} resolves to nothing`);
    for (const authority of authorities) {
      if (!fs.existsSync(authority)) continue;
      assert.ok(countLines(fs.readFileSync(authority, 'utf8')) > MINIMUM_AUTHORITY,
        `${task}: ${owner} routes to a stub at ${authority}`);
    }
  }
  // The layer that carries them is bounded and transitive.
  const closure = alwaysLoadClosure();
  assert.ok(closure.files.includes(RULES_MD) && closure.files.includes(ROUTER_MD));
  assert.ok(closure.lines <= ALWAYS_LOAD_BUDGET,
    `always-load path is ${closure.lines} lines`);
});

test('current steering refers only to registered solver operations', () => {
  // Registered-operation closure: the valid set comes from the canonical
  // command registry, so there is no historical vocabulary to maintain and
  // nothing can drift out of date.
  const registered = registeredVerbs();
  assert.ok(registered.size > 0);
  assert.deepEqual(unregisteredOperationReferences(), [],
    'steering refers only to operations the registry contains');
});

test('the inventory is re-derived from the frozen baseline, not transcribed', () => {
  // The accounting is only honest if the corpus it disposes of is enumerated
  // from the baseline itself. A hand-written inventory can be silent about a
  // file, and a ledger that sums to a total it also declares cannot detect
  // that silence.
  const committed = JSON.parse(fs.readFileSync(INVENTORY, 'utf8'));
  const derived = baselineInventory();
  assert.equal(committed.baseline, derived.baseline);
  assert.deepEqual(
    committed.entries.map((entry) => [entry.id, entry.lines]),
    derived.entries.map((entry) => [entry.id, entry.lines]),
    'the committed inventory is exactly what the baseline yields');
  assert.equal(committed.total, derived.total);
  assert.equal(Object.values(committed.totals).reduce((a, b) => a + b, 0),
    derived.total, 'the buckets account for the whole derived corpus');
});

test('the always-load layer of the baseline is inside the inventory', () => {
  // The two hand-curated pack files were steps 2 and 3 of the baseline load
  // order. Excluding them would omit the layer this work exists to shrink.
  // Named here literally rather than read from the module under test, so
  // shrinking that list cannot also shrink this expectation.
  const files = new Set(baselineInventory().entries.map((entry) => entry.file));
  for (const file of BASELINE_ALWAYS_LOAD) {
    assert.equal(files.has(file), true, `${file} is not accounted for`);
  }
  assert.deepEqual([...AUTHORED_IN_GENERATED_DIR].sort(), [...BASELINE_ALWAYS_LOAD].sort(),
    'the inventory owner still treats exactly those two files as authored');
});

test('the disposition ledger disposes every inventory section exactly once', () => {
  const inventory = JSON.parse(fs.readFileSync(INVENTORY, 'utf8'));
  const ledger = JSON.parse(fs.readFileSync(DISPOSITION, 'utf8'));
  const sections = ledger.rows.map((row) => row.section);
  assert.equal(new Set(sections).size, sections.length, 'no section disposed twice');
  assert.deepEqual(ledger.rows.map((row) => [row.originalLocation, row.lines]),
    inventory.entries.map((entry) => [entry.id, entry.lines]),
    'the ledger disposes exactly the sections the baseline yields');
  for (const [index, row] of ledger.rows.entries()) {
    assert.equal(row.bucket, BUCKET_OF[row.disposition],
      `${row.section} buckets ${row.disposition} as ${row.bucket}`);
    assert.equal(row.bucket, inventory.entries[index].bucket,
      `${row.section} is bucketed differently in the two ledgers`);
  }
  assert.equal(Object.values(ledger.totals).reduce((a, b) => a + b, 0),
    inventory.total, 'the disposition buckets sum to the whole frozen corpus');
});

test('no destination is a stub of the material the ledger sent to it', () => {
  // "Moved to its owner" is only true if the owner actually holds it. A move
  // into a one-line placeholder would otherwise pass every other check.
  const ledger = JSON.parse(fs.readFileSync(DISPOSITION, 'utf8'));
  const claimed = new Map();
  for (const row of ledger.rows) {
    if (!row.destination) continue;
    claimed.set(row.destination, (claimed.get(row.destination) || 0) + row.lines);
  }
  assert.ok(claimed.size > 0);
  for (const [destination, lines] of claimed) {
    assert.equal(fs.existsSync(destination), true,
      `${destination} does not exist`);
    const held = countLines(fs.readFileSync(destination, 'utf8'));
    assert.ok(held + RELOCATION_ALLOWANCE >= lines,
      `${destination} holds ${held} lines of the ${lines} the ledger sent it`);
  }
});

test('a file the ledger disposed entirely as deleted is gone', () => {
  // The ledger is only evidence if a "deleted" row means the material is
  // actually gone: otherwise the diet could be claimed without being done.
  const ledger = JSON.parse(fs.readFileSync(DISPOSITION, 'utf8'));
  const byFile = new Map();
  for (const row of ledger.rows) {
    byFile.set(row.file, [...byFile.get(row.file) || [], row]);
  }
  let deletedFiles = 0;
  for (const [file, rows] of byFile) {
    if (rows.some((row) => row.destination)) continue;
    deletedFiles += 1;
    assert.equal(fs.existsSync(file), false,
      `${file} was disposed entirely as deleted but still exists`);
  }
  assert.ok(deletedFiles > 0, 'the ledger records at least one full deletion');
});

test('every authority the router names resolves', () => {
  const text = fs.readFileSync(ROUTER_MD, 'utf8');
  const targets = [...text.matchAll(LINK)].map((match) => match[1]);
  assert.ok(targets.length > 0);
  for (const target of targets) {
    assert.equal(fs.existsSync(path.join(ROUTER_DIR, target)), true,
      `router points at a missing authority: ${target}`);
  }
  const scripts = JSON.parse(fs.readFileSync(PACKAGE, 'utf8')).scripts;
  const commands = [...text.matchAll(RUN_COMMAND)].map((match) => match[1]);
  assert.ok(commands.length > 0);
  for (const command of commands) {
    assert.equal(Object.hasOwn(scripts, command), true,
      `router names an undefined command: npm run ${command}`);
  }
});
