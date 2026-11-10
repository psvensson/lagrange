// Precision contract for the code-navigability detectors.
//
// scripts/checks/code-navigability-detectors.js is the only place each
// navigability or fallback pattern is recognised (epic
// code-navigability-and-mistake-resistance, Mechanism: one detector per
// pattern). The budget rows, the guideline audit and the census all read its
// sites, so a detector that over- or under-counts moves every one of them.
// Each detector is therefore pinned here by a positive snippet with an exact
// count and by the nearest negative shapes that must NOT be counted.

import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  detectAliasExports,
  detectCatchReturnsDefault,
  detectIdentityKeyedModuleState,
  detectInheritanceDepthOverTwo,
  detectLegacyTermIdentifiers,
  detectNavigabilityPatterns,
  detectOwnerPortFeatureDetection,
  detectPrototypeCopyBags,
  detectReexportOnlyModules,
  detectRowFieldAliasReads,
  detectStateReadDefaults,
  detectSystemTableRawColumnReads,
  detectTwoSourceFallbackReads,
  detectTypeofDualPaths,
  detectValueOrPromiseThenChecks,
  parseNavigabilitySource,
  SYSTEM_TABLE_COLUMNS,
} from '../../scripts/checks/code-navigability-detectors.js';
import {SYSTEM_TABLE_SCHEMAS} from '../../src/bootstrap/system-table-schemas-constants.js';

const UTF8 = 'utf8';
const SAMPLE_FILE = 'src/sample.js';

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function sitesOf(detector, source, file = SAMPLE_FILE) {
  return detector(parseNavigabilitySource(source, file));
}

function countOf(detector, source, file = SAMPLE_FILE) {
  return sitesOf(detector, source, file).length;
}

function assertSiteShape(site, row, source, file = SAMPLE_FILE) {
  assert.equal(site.row, row);
  assert.equal(site.file, file);
  const slice = source.slice(site.range[0], site.range[1]);
  assert.equal(site.hash, sha256(`${file}\n${slice}`),
    'the site hash binds the file and the exact source slice');
  assert.equal(typeof site.loc.start.line, 'number');
}

test('owner_port_feature_detection counts typeof member function checks', () => {
  const positive = [
    'function f(o) {',
    '  if (typeof this.port.read === \'function\') return 1;',
    '  if (typeof o.write !== TYPE.FUNCTION) return 2;',
    '  if (typeof o?.open === \'function\') return 3;',
    '  if (typeof o.seal === LOCAL_STR_FUNCTION) return 4;',
    '  if (typeof o.sign !== TYPEOF.FUNCTION) return 5;',
    '  if (typeof o.watch === WATCHDOG_FUNCTION_TYPE) return 6;',
    '  return \'function\' === typeof o.close;',
    '}',
  ].join('\n');
  const sites = sitesOf(detectOwnerPortFeatureDetection, positive);
  assert.equal(sites.length, 7,
    'an optional-chained member is a member; a constant ending FUNCTION is \'function\'');
  assertSiteShape(sites[0], 'owner_port_feature_detection', positive);

  const negative = [
    'function g(fn, o) {',
    '  if (typeof fn === \'function\') return 1;',
    '  if (typeof o.then === \'function\') return 2;',
    '  if (typeof o?.catch === \'function\') return 2;',
    '  if (typeof o.read === \'string\') return 3;',
    '  if (typeof o.read === isFunctional) return 4;',
    '  if (typeof o.read === TYPE.FUNCTIONAL) return 4;',
    '  return typeof o.read;',
    '}',
  ].join('\n');
  assert.equal(countOf(detectOwnerPortFeatureDetection, negative), 0,
    'an identifier argument, a then or catch check, another type and a bare typeof ' +
    'are not owner-port feature detection');
});

test('value_or_promise_then_checks counts only typeof x.then function checks', () => {
  const positive = [
    'function f(result, port, answered, cond) {',
    '  if (typeof result.then === \'function\') return result;',
    '  if (typeof result?.then === \'function\') return result;',
    '  if (typeof result.catch === \'function\') return result;',
    '  const a = answered?.then ? 1 : 2;',
    '  if (!cond.catch) return a;',
    '  if (result instanceof Promise) return a;',
    '  if (typeof result.then === LOCAL_STR_FUNCTION) return a;',
    '  if (typeof result.then === \'object\') return a;',
    '  return typeof port.answer.then !== \'function\';',
    '}',
  ].join('\n');
  const sites = sitesOf(detectValueOrPromiseThenChecks, positive);
  assert.deepEqual(sites.map((site) => positive.slice(site.range[0], site.range[1])), [
    'typeof result.then === \'function\'', 'typeof result?.then === \'function\'',
    'typeof result.catch === \'function\'', 'answered?.then', '!cond.catch',
    'result instanceof Promise', 'typeof result.then === LOCAL_STR_FUNCTION',
    'typeof result.then === \'object\'', 'typeof port.answer.then !== \'function\'']);
  assertSiteShape(sites[0], 'value_or_promise_then_checks', positive);

  const negative = [
    'function g(then, port) {',
    '  if (typeof then === \'function\') return 1;',
    '  if (typeof port.read === \'function\') return 2;',
    '  const p = Promise.resolve(port);',
    '  const q = port.then;',
    '  if (port instanceof Map) return p;',
    '  const kind = typeof port.then;',
    '  return kind == \'object\' ? q : p;',
    '}',
  ].join('\n');
  assert.equal(countOf(detectValueOrPromiseThenChecks, negative), 0,
    'Promise.resolve, a then read outside a test, another class and a ' +
    'typeof not compared strictly are not value-or-promise checks');

  // The exclusion is one function in one file: both the path
  // src/raft/raft-rs-turn-answer.js and an enclosing function named
  // turnFromForeignAnswer, never a basename or a module.
  const adapter = 'src/raft/raft-rs-turn-answer.js';
  const probe = 'export function turnFromForeignAnswer(answer) {\n' +
    '  return typeof answer?.then === \'function\';\n}\n';
  assert.equal(countOf(detectValueOrPromiseThenChecks, probe, adapter), 0,
    'the designated foreign-answer adapter is the one legitimate probe');
  const bound = 'export const turnFromForeignAnswer = (answer) =>\n' +
    '  (answer instanceof Promise ? answer : null);\n';
  assert.equal(countOf(detectValueOrPromiseThenChecks, bound, adapter), 0,
    'a function bound to the adapter name is the adapter too');
  for (const elsewhere of ['src/other/raft-rs-turn-answer.js', 'src/raft-rs-turn-answer.js',
    'src/values/turn-answer.js', 'src/raft/raft-rs-answer.js']) {
    assert.equal(countOf(detectValueOrPromiseThenChecks, probe, elsewhere), 1,
      `the same probe in ${elsewhere} counts`);
  }
  const sibling = `${probe}export function settle(answer) {\n` +
    '  return answer?.then ? answer : null;\n}\n';
  const siblingSites = sitesOf(detectValueOrPromiseThenChecks, sibling, adapter);
  assert.deepEqual(siblingSites.map((site) => sibling.slice(site.range[0], site.range[1])),
    ['answer?.then'], 'another function in the adapter file counts');
});

test('identity_keyed_module_state counts argument-free module-scope stores', () => {
  const positive = [
    'const owners = new WeakMap();',
    'let pending = new Map(), seen = new Set();',
    'var marks = new WeakSet();',
    'export const registry = new Map();',
  ].join('\n');
  const sites = sitesOf(detectIdentityKeyedModuleState, positive);
  assert.equal(sites.length, 5, 'an exported module-scope store counts too');
  assertSiteShape(sites[0], 'identity_keyed_module_state', positive);

  const negative = [
    'const seeded = new Map([[1, 2]]);',
    'const other = new Registry();',
    'function local() {',
    '  const scoped = new Map();',
    '  return scoped;',
    '}',
  ].join('\n');
  assert.equal(countOf(detectIdentityKeyedModuleState, negative), 0,
    'a seeded store, another constructor and a function-local store are ' +
    'not module-scope identity state');
});

test('prototype_copy_bags counts getOwnPropertyNames over a prototype', () => {
  const positive = [
    'const a = Object.getOwnPropertyNames(Owner.prototype);',
    'const b = Reflect.getOwnPropertyNames(Other.prototype);',
    'const c = Object.getOwnPropertyNames(Chained?.prototype);',
  ].join('\n');
  const sites = sitesOf(detectPrototypeCopyBags, positive);
  assert.equal(sites.length, 3, 'an optionally chained prototype argument counts');
  assertSiteShape(sites[0], 'prototype_copy_bags', positive);

  const negative = [
    'const a = Object.getOwnPropertyNames(instance);',
    'const b = Object.getOwnPropertyNames(Owner[\'prototype\']);',
    'const c = Object.keys(Owner.prototype);',
  ].join('\n');
  assert.equal(countOf(detectPrototypeCopyBags, negative), 0);
});

test('inheritance_depth_over_two follows extends chains across files', () => {
  const first = parseNavigabilitySource([
    'class A {}',
    'class B extends A {}',
    'class C extends B {}',
  ].join('\n'), 'src/first.js');
  const second = parseNavigabilitySource([
    'class D extends C {}',
    'const E = class E extends D {};',
    'class F extends External {}',
    'class G extends mixin(A) {}',
  ].join('\n'), 'src/second.js');
  const sites = detectInheritanceDepthOverTwo([first, second]);
  assert.deepEqual(sites.map((site) => site.file).sort(),
    ['src/second.js', 'src/second.js'],
    'D (depth 3) and E (depth 4) are over two; C at exactly two, an ' +
    'unresolved superclass and a call-expression superclass are not');
  assert.equal(sites[0].row, 'inheritance_depth_over_two');

  const cycle = [
    parseNavigabilitySource('class P extends Q {}', 'src/p.js'),
    parseNavigabilitySource('class Q extends P {}', 'src/q.js'),
  ];
  assert.equal(detectInheritanceDepthOverTwo(cycle).length, 0,
    'a cycle terminates and is not counted as a deep chain');
});

test('row_field_alias_reads counts one name read in two spellings', () => {
  const positive = [
    'function f(row) {',
    '  const a = row.raft_role || row.raftRole;',
    '  const b = row.workflowStep ?? row.workflow_step;',
    '  const c = row[COLUMN.NODE_ID] || row.nodeId;',
    '  const d = row?.node_id ?? row?.nodeId;',
    '  const e = row.node_id || row[\'nodeId\'];',
    '  return [a, b, c, d, e];',
    '}',
  ].join('\n');
  const sites = sitesOf(detectRowFieldAliasReads, positive);
  assert.equal(sites.length, 5, 'optional chains and a string-literal spelling count');
  assertSiteShape(sites[0], 'row_field_alias_reads', positive);

  const negative = [
    'function g(row, other, key) {',
    '  const a = row.status || row.state;',
    '  const b = row.name || row.name;',
    '  const c = row[COLUMN.NODE_ID] || other.nodeId;',
    '  const d = row.node_id || \'none\';',
    '  const e = row[key] || row.key;',
    '  const h = row.node_id && row.nodeId;',
    '  const i = row.node_id || other.nodeId;',
    '  const j = options.host || ADMIN_DEFAULT.HOST;',
    '  const k = row[COLUMN.NODE_ID] || row[LEGACY.NODE_ID];',
    '  return [a, b, c, d, e, h, i, j, k];',
    '}',
  ].join('\n');
  assert.equal(countOf(detectRowFieldAliasReads, negative), 0,
    'different names, one identical spelling, two objects behind a ' +
    'computed column, a literal default, an identifier key, &&, two ' +
    'objects and one spelling through two constants are not alias reads');

  const chained = [
    'function h(row, x) {',
    '  const a = x || row.node_id || row.nodeId;',
    '  const b = row[COLUMN.TABLE_ID] ?? row?.table_id ?? row?.tableId ?? null;',
    '  const c = row.group_id || x || row.groupId;',
    '  return [a, b, c];',
    '}',
  ].join('\n');
  const chainSites = sitesOf(detectRowFieldAliasReads, chained);
  const chainSlice = (site) => chained.slice(site.range[0], site.range[1]);
  assert.deepEqual(chainSites.map(chainSlice), [
    'row.node_id || row.nodeId',
    'row[COLUMN.TABLE_ID] ?? row?.table_id',
    'row?.table_id ?? row?.tableId',
  ], 'every adjacent pair of a flattened chain counts, at any position; ' +
    'a pair split by another term is not adjacent');
});

test('state_read_defaults counts a default on a state field read', () => {
  const positive = [
    'function f(row, op) {',
    '  const a = row.status || \'idle\';',
    '  const b = op.raftRole ?? null;',
    '  const c = row[COLUMN.WORKFLOW_STEP] || \'start\';',
    '  const d = this.phase || 0;',
    '  const e = op?.status || \'\';',
    '  const g = row[\'status\'] || 1;',
    '  return [a, b, c, d, e, g];',
    '}',
  ].join('\n');
  const sites = sitesOf(detectStateReadDefaults, positive);
  assert.equal(sites.length, 6, 'an optional-chained or string-keyed state read counts');
  assertSiteShape(sites[0], 'state_read_defaults', positive);

  const negative = [
    'function g(row, x) {',
    '  const a = row.state || \'idle\';',
    '  const b = x || row.status;',
    '  const c = row.status && x;',
    '  const d = row[STATUS] || 1;',
    '  return [a, b, c, d];',
    '}',
  ].join('\n');
  assert.equal(countOf(detectStateReadDefaults, negative), 0);

  const chained = [
    'function h(row, error, x) {',
    '  const a = x || row.status || \'idle\';',
    '  const b = error.statusCode || error.status || row.phase || 500;',
    '  const c = x ?? y ?? row.step;',
    '  return [a, b, c];',
    '}',
  ].join('\n');
  assert.deepEqual(sitesOf(detectStateReadDefaults, chained).map((site) =>
    chained.slice(site.range[0], site.range[1])),
  ['row.status', 'error.status', 'row.phase'],
  'every defaulted state read of a flattened chain counts, at any position; ' +
    'a state read in last position is the default');
});

test('two_source_fallback_reads counts one chain reading two objects', () => {
  const positive = [
    'function f(a, b, c, options) {',
    '  const p = a.x || b.y;',
    '  const q = this.limit || options.limit;',
    '  const r = this.a.x || this.b.y;',
    '  const s = a.x ?? b.y ?? c.z;',
    '  const t = a?.x || b.y;',
    '  const u = options.x || options.diagnostics?.x;',
    '  const w = this.x || this.y.z;',
    '  return [p, q, r, s, t, u, w];',
    '}',
  ].join('\n');
  const sites = sitesOf(detectTwoSourceFallbackReads, positive);
  assert.equal(sites.length, 7, 'a three-term chain counts once');
  assertSiteShape(sites[3], 'two_source_fallback_reads', positive);
  const slice = (range) => positive.slice(range[0], range[1]);
  assert.equal(slice(sites[3].range), 'a.x ?? b.y ?? c.z', 'the site is the whole chain');
  assert.deepEqual(sites[3].terms.map(slice), ['a.x', 'b.y', 'c.z']);
  assert.equal(slice(sites[3].sides.primary), 'a.x', 'primary is the leftmost term');
  assert.equal(slice(sites[3].sides.fallback), 'c.z', 'fallback is the last term');

  const negative = [
    'function g(a, b) {',
    '  const p = this.a.x || this.a.y;',
    '  const q = a.x || \'default\';',
    '  const r = a.x || (b.y && b.z);',
    '  const s = a.x && b.y;',
    '  const t = def[COLUMN.SERVICE_ID] || def.service_id;',
    '  const u = a?.x || a.y;',
    '  return [p, q, r, s, t, u];',
    '}',
  ].join('\n');
  assert.equal(countOf(detectTwoSourceFallbackReads, negative), 0,
    'two fields of one object (also through a column constant or an ' +
    'optional chain), a literal default, a single member term and && are ' +
    'not two-source reads');

  // The object a member reads is keyed by its AST, not its text: spacing,
  // comments, `['b']`, a static template and `?.` read the same object;
  // a computed index by value or by expression is part of the path.
  const sameObject = [
    'function k(a, i) {',
    '  const p = a.b.x || a[\'b\'].y;',
    '  const q = a?.b.x || a.b ?. y;',
    '  const r = a[`b`].x || a /* c */ .b.y;',
    '  const s = a[0].x || a[0].y;',
    '  const t = a[i].x || a[i].y;',
    '  const u = f(a).x || f(i).y;',
    '  return [p, q, r, s, t, u];',
    '}',
  ].join('\n');
  assert.equal(countOf(detectTwoSourceFallbackReads, sameObject), 0,
    'one object however it is spelled is one source');
  const otherObject = [
    'function m(a, i) {',
    '  const p = a.b.x || a.c.x;',
    '  const q = a[0].x || a[1].x;',
    '  const r = a[i].x || a[j].x;',
    '  const s = f(a).x || g(a).x;',
    '  const t = f(a).x || f(a, i).x;',
    '  return [p, q, r, s, t];',
    '}',
  ].join('\n');
  assert.equal(countOf(detectTwoSourceFallbackReads, otherObject), 5,
    'another path, index, index expression, callee or arity is another object');

  // A parenthesised optional chain as an object, `(a?.b).x`, is keyed as
  // its plain member: it reads object a.b, and c.y is another object.
  assert.equal(countOf(detectTwoSourceFallbackReads,
    'export const p = (a?.b).x || a.b.y;\n'), 0, '(a?.b).x and a.b.y read one object');
  assert.equal(countOf(detectTwoSourceFallbackReads,
    'export const q = (a?.b).x || c.y;\n'), 1, '(a?.b).x and c.y read two objects');
});

test('typeof_dual_paths counts a typeof function test with an alternate', () => {
  const positive = [
    'function f(fn, x, q) {',
    '  if (typeof this.port.read === \'function\') { a(); } else { b(); }',
    '  const v = typeof fn === \'function\' ? fn() : null;',
    '  if (x && typeof x.y === TYPE.FUNCTION) { a(); } else if (q) { b(); }',
    '  const w = typeof fn === LOCAL_STR_FUNCTION ? fn() : null;',
    '  return [v, w];',
    '}',
  ].join('\n');
  const sites = sitesOf(detectTypeofDualPaths, positive);
  assert.equal(sites.length, 4, 'a local constant for \'function\' is the same comparison');
  assertSiteShape(sites[1], 'typeof_dual_paths', positive);
  const slice = (range) => positive.slice(range[0], range[1]);
  assert.equal(slice(sites[0].sides.primary), '{ a(); }', '=== takes the consequent');
  assert.equal(slice(sites[0].sides.fallback), '{ b(); }');
  assert.equal(slice(sites[1].sides.primary), 'fn()');
  assert.equal(slice(sites[1].sides.fallback), 'null');

  const inverted = [
    'function h(fn) {',
    '  const p = typeof fn !== \'function\' ? \'absent\' : fn();',
    '  const q = !(typeof fn === \'function\') ? \'absent\' : fn();',
    '  const r = !(typeof fn !== \'function\') ? fn() : \'absent\';',
    '  return [p, q, r];',
    '}',
  ].join('\n');
  const invertedSites = sitesOf(detectTypeofDualPaths, inverted);
  assert.deepEqual(invertedSites.map((site) =>
    inverted.slice(site.sides.primary[0], site.sides.primary[1])),
  ['fn()', 'fn()', 'fn()'], '!== and an odd number of ! swap the sides');
  assert.deepEqual(invertedSites.map((site) =>
    inverted.slice(site.sides.fallback[0], site.sides.fallback[1])),
  ['\'absent\'', '\'absent\'', '\'absent\'']);

  const negative = [
    'function g(fn, x) {',
    '  if (typeof fn === \'function\') { a(); }',
    '  if (typeof fn === \'string\') { a(); } else { b(); }',
    '  if (typeof fn == \'function\') { a(); } else { b(); }',
    '  const v = x ? fn() : null;',
    '  return v;',
    '}',
  ].join('\n');
  assert.equal(countOf(detectTypeofDualPaths, negative), 0,
    'no alternate, another type, a loose == and a test without typeof are ' +
    'not dual paths');
});

test('catch_returns_default counts a catch that ends returning a default', () => {
  const positive = [
    'function f() {',
    '  try { a(); } catch (error) { return null; }',
    '  try { a(); } catch { log(); return {}; }',
    '  try { a(); } catch { return []; }',
    '  try { a(); } catch { return; }',
    '  try { a(); } catch { return undefined; }',
    '  try { a(); } catch { return \'none\'; }',
    '}',
  ].join('\n');
  const sites = sitesOf(detectCatchReturnsDefault, positive);
  assert.equal(sites.length, 6);
  assertSiteShape(sites[0], 'catch_returns_default', positive);
  assert.equal(positive.slice(sites[0].range[0], sites[0].range[1]),
    'catch (error) { return null; }', 'the site is the catch clause');
  const sides = sites[1].sides;
  assert.equal(positive.slice(sides.primary[0], sides.primary[1]), '{ a(); }',
    'primary is the try block');
  assert.equal(positive.slice(sides.fallback[0], sides.fallback[1]),
    '{ log(); return {}; }', 'fallback is the catch body');

  const negative = [
    'function g(x) {',
    '  try { a(); } catch (error) { return compute(error); }',
    '  try { a(); } catch (error) { throw error; }',
    '  try { a(); } catch (error) { if (x) return null; throw error; }',
    '  try { a(); } catch (error) { record(error); }',
    '}',
  ].join('\n');
  assert.equal(countOf(detectCatchReturnsDefault, negative), 0);
});

test('reexport_only_modules counts a module of imports and re-exports', () => {
  const positive = [
    'export * from \'./a.js\';',
    'export {b} from \'./b.js\';',
    'import c from \'./c.js\';',
    'export {c};',
  ].join('\n');
  const sites = sitesOf(detectReexportOnlyModules, positive);
  assert.equal(sites.length, 1);
  assert.equal(sites[0].row, 'reexport_only_modules');

  assert.equal(countOf(detectReexportOnlyModules, ''), 0,
    'an empty module is not a re-export module');
  assert.equal(countOf(detectReexportOnlyModules,
    'export * from \'./a.js\';\nexport const x = 1;'), 0);
  assert.equal(countOf(detectReexportOnlyModules,
    'import a from \'./a.js\';\na();'), 0);
});

test('alias_exports counts an export specifier under another name', () => {
  const positive = [
    'const a = 1;',
    'const z = 2;',
    'export {a as b, z};',
    'export {c as default} from \'./c.js\';',
  ].join('\n');
  const sites = sitesOf(detectAliasExports, positive);
  assert.equal(sites.length, 2);
  assertSiteShape(sites[0], 'alias_exports', positive);

  const negative = [
    'import {a as b} from \'./a.js\';',
    'export {b};',
    'export * as ns from \'./n.js\';',
  ].join('\n');
  assert.equal(countOf(detectAliasExports, negative), 0,
    'an import alias, a same-name export and a namespace re-export are ' +
    'not alias exports');
});

test('legacy_term_identifiers counts legacy vocabulary outside foreign members', () => {
  const positive = [
    'const legacyRows = 1;',
    'function readFallback() {}',
    'this.compatMode = true;',
    'const oldValue = x[legacyKey];',
    'const OLD_LEASE = holdOld(v1Payload);',
  ].join('\n');
  const sites = sitesOf(detectLegacyTermIdentifiers, positive);
  assert.deepEqual(
    sites.map((site) => positive.slice(site.range[0], site.range[1])),
    ['legacyRows', 'readFallback', 'compatMode', 'oldValue', 'legacyKey',
      'OLD_LEASE', 'holdOld', 'v1Payload']);
  assertSiteShape(sites[0], 'legacy_term_identifiers', positive);

  const shorthand = [
    'import {legacyA} from \'./a.js\';',
    'const {legacyB} = o;',
    'const p = {legacyB, legacyA};',
    'export {legacyA};',
  ].join('\n');
  assert.deepEqual(
    sitesOf(detectLegacyTermIdentifiers, shorthand).map((site) =>
      shorthand.slice(site.range[0], site.range[1])),
    ['legacyA', 'legacyB', 'legacyB', 'legacyA', 'legacyA'],
    'a shorthand specifier or property is one token');

  const negative = [
    'obj.fallbackPath = 2;',
    'const holders = placeholder(thresholds);',
    'const told = \'legacy\';',
  ].join('\n');
  assert.equal(countOf(detectLegacyTermIdentifiers, negative), 0,
    'a foreign member property, old inside a word (holders, placeholder, ' +
    'thresholds, told) and a string are not legacy identifiers');
});

test('detectNavigabilityPatterns scans src only and numbers identical sites', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'navigability-detectors-'));
  const write = (relative, text) => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, text, UTF8);
  };
  const guarded = 'function f() {\n' +
    '  try { a(); } catch { return null; }\n' +
    '  try { a(); } catch { return null; }\n}\n';
  write('src/nested/guarded.js', guarded);
  write('src/ports.js', 'const ok = typeof o.read === \'function\';\n');
  write('test/outside.test.js', 'const ok = typeof o.read === \'function\';\n');
  write('scripts/outside.js', 'const ok = typeof o.read === \'function\';\n');
  const both = 'export function f(a, b) {\n  return a.status || b.status;\n}\n';
  write('src/both.js', both);

  const {sites, counts} = detectNavigabilityPatterns(root);
  assert.equal(counts.owner_port_feature_detection, 1, 'test and scripts are not scanned');
  assert.equal(counts.catch_returns_default, 2);
  const catches = sites.filter((site) => site.row === 'catch_returns_default');
  assert.deepEqual(catches.map((site) => site.file),
    ['src/nested/guarded.js', 'src/nested/guarded.js'], 'files are repo-relative with /');
  assert.equal(catches[0].hash, catches[1].hash, 'identical slices hash alike');
  assert.equal(catches[0].hash,
    sha256('src/nested/guarded.js\ncatch { return null; }'));
  assert.deepEqual(catches.map((site) => site.occurrence), [0, 1],
    'occurrence tells identical sites in one file apart');

  // One chain that is a two-source read and holds a defaulted state read is
  // one site of each row, each numbered within its own row and spanning what
  // its row counts: the two-source site is the chain, the state-default site
  // is the state-read term (epic table: one count per such read). The two
  // hashes therefore differ; identity carries the row, so they never collide.
  // The per-pattern detector numbers each site as the scan does.
  const shared = sites.filter((site) => site.file === 'src/both.js');
  assert.deepEqual(shared.map((site) => [site.row, site.occurrence]).sort(),
    [['state_read_defaults', 0], ['two_source_fallback_reads', 0]]);
  const bySharedRow = Object.fromEntries(shared.map((site) => [site.row, site]));
  assert.equal(bySharedRow.two_source_fallback_reads.hash,
    sha256('src/both.js\na.status || b.status'), 'the two-source site is the chain');
  assert.equal(bySharedRow.state_read_defaults.hash,
    sha256('src/both.js\na.status'), 'the state-default site is the defaulted term');
  const pairs = [
    [detectTwoSourceFallbackReads, 'two_source_fallback_reads'],
    [detectStateReadDefaults, 'state_read_defaults'],
  ];
  for (const [detector, row] of pairs) {
    const alone = sitesOf(detector, both, 'src/both.js')[0];
    assert.deepEqual([alone.hash, alone.occurrence],
      [bySharedRow[row].hash, bySharedRow[row].occurrence]);
  }
  for (const site of sites) {
    for (const key of ['row', 'file', 'range', 'loc', 'hash', 'occurrence', 'kind', 'detail']) {
      assert.ok(Object.hasOwn(site, key), `a site carries ${key}`);
    }
  }
});

// Two identical sites in one file are told apart by occurrence, and the
// per-pattern entry point numbers them exactly as the full scan does.
test('the per-pattern entry point numbers identical sites as the full scan does', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'navigability-occurrence-'));
  const file = 'src/twice.js';
  const text = 'export function f(a, b) {\n  const p = a.x || b.y;\n' +
    '  const q = a.x || b.y;\n  return [p, q];\n}\n';
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, file), text, UTF8);
  const scanned = detectNavigabilityPatterns(root).sites
    .filter((site) => site.row === 'two_source_fallback_reads');
  const alone = sitesOf(detectTwoSourceFallbackReads, text, file);
  const identity = (site) => [site.file, site.hash, site.occurrence, site.range];
  assert.deepEqual(scanned.map((site) => site.occurrence), [0, 1]);
  assert.equal(scanned[0].hash, scanned[1].hash, 'the two sites are identical slices');
  assert.deepEqual(alone.map(identity), scanned.map(identity),
    'both entry points give occurrences 0 and 1 to the same sites');
});

// system_table_raw_column_reads_outside_decoder: an own column of services,
// nodes or replica_operations counts wherever it is read; a shared column
// counts only on an object whose scope also reads an own column of that
// table; writes, SQL text and object-literal keys never count.
test('system_table_raw_column_reads_outside_decoder counts reads, never writes', () => {
  const row = 'system_table_raw_column_reads_outside_decoder';
  const source = [
    'export function f(row, other, COLUMN) {',
    '  const role = row.raft_role;',
    '  const node = row.node_id;',
    '  const step = row[COLUMN.WORKFLOW_STEP];',
    '  const quoted = row[\'connection_state\'];',
    '  const unattributed = other.status;',
    '  const optional = row?.last_heartbeat;',
    '  row.raft_role = \'leader\';',
    '  delete row.node_address;',
    '  other.workflow_step += 1;',
    '  const built = {raft_role: role, [COLUMN.NODE_ADDRESS]: node};',
    '  const sql = \'UPDATE services SET raft_role = ? WHERE node_id = ?\';',
    '  const called = other.type();',
    '  return [step, quoted, unattributed, optional, built, sql, called];',
    '}',
    'export function g(row) {',
    '  return row.node_id;',
    '}',
    'export function h(input) {',
    '  const {source_node_id: source, status} = input;',
    '  return [source, status, (inner) => inner.status];',
    '}',
  ].join('\n');
  const sites = sitesOf(detectSystemTableRawColumnReads, source);
  assert.deepEqual(sites.map((site) => site.detail), [
    'services:raft_role',
    'services+nodes:node_id',
    'replica_operations:workflow_step',
    'nodes:connection_state',
    'nodes:last_heartbeat',
    'replica_operations:source_node_id',
    'replica_operations:status',
  ], 'own columns count outright; node_id on row counts for both evidenced ' +
    'tables; other.status, g\'s lone node_id and the nested inner.status have ' +
    'no own-column evidence in their scope; writes, keys, SQL text and a ' +
    'callee never count');
  for (const site of sites) assertSiteShape(site, row, source);
});

// Verifier finding F-d: a `COLUMN.X` naming no column of the three tables,
// read on an object that also carries an own-column read, once crashed the
// attribution (TypeError); it is not a column read at all.
test('a COLUMN constant of another table beside an own-column read is not a site', () => {
  const source = 'export function f(row, COLUMN) {\n' +
    '  return [row.raft_role, row[COLUMN.TABLE_NAME], row[COLUMN.NOT_A_COLUMN]];\n}\n';
  assert.deepEqual(sitesOf(detectSystemTableRawColumnReads, source)
    .map((site) => site.detail), ['services:raft_role']);
});

test('a table\'s decoder module is the one place its raw columns are not sites', () => {
  const source = 'export function d(row) {\n  return [row.raft_role, row.status, ' +
    'row.last_heartbeat];\n}\n';
  const inServicesDecoder = sitesOf(detectSystemTableRawColumnReads, source,
    'src/control-plane/services-row-decoder.js');
  assert.deepEqual(inServicesDecoder.map((site) => site.detail),
    ['services+nodes:status', 'nodes:last_heartbeat'],
    'the services decoder reads services columns; a nodes column there still counts, ' +
    'and so does a shared column evidenced for nodes too');
  const inReplicaDecoder = sitesOf(detectSystemTableRawColumnReads,
    'export function d(row) {\n  return [row.workflow_step, row.status];\n}\n',
    'src/rebalancer/replica-operations-row-decoder.js');
  assert.deepEqual(inReplicaDecoder, []);
  const elsewhere = sitesOf(detectSystemTableRawColumnReads, source, 'src/services-reader.js');
  assert.deepEqual(elsewhere.map((site) => site.detail),
    ['services:raft_role', 'services+nodes:status', 'nodes:last_heartbeat']);
});

test('the system-table column lists are the stored schemas', () => {
  const owners = new Map();
  for (const schema of SYSTEM_TABLE_SCHEMAS) {
    for (const column of schema.columns) {
      if (!owners.has(column.name)) owners.set(column.name, []);
      owners.get(column.name).push(schema.tableName);
    }
  }
  for (const [table, {own, shared}] of Object.entries(SYSTEM_TABLE_COLUMNS)) {
    const schema = SYSTEM_TABLE_SCHEMAS.find((candidate) => candidate.tableName === table);
    assert.ok(schema, `${table} is a system table`);
    assert.deepEqual([...own, ...shared].sort(),
      schema.columns.map((column) => column.name).sort(),
      `${table}: own + shared are exactly the stored columns`);
    for (const column of own) {
      assert.deepEqual(owners.get(column), [table], `${table}.${column} is stored by no other table`);
    }
    for (const column of shared) {
      assert.ok(owners.get(column).length > 1 || column === 'type',
        `${table}.${column} is shared (or the generic word type)`);
    }
  }
});
