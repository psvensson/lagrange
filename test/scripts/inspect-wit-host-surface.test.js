/**
 * Adversarial witness: the WIT inventory must not hide type/use dependencies.
 * Canonical ABI remains wit/world.wit. Pin selected sealed types and require
 * the inventory to expose the full structural type definition.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from '../../src/test-helpers/tap.js';
import {inspectWitHostSurface} from '../../scripts/inspect-wit-host-surface.js';

const WIT = readFileSync(new URL('../../wit/world.wit', import.meta.url),
  'utf8');

test('inventory resolves canonical world use of the row type', (t) => {
  const inventory = inspectWitHostSurface(WIT);
  for (const name of ['call-cell', 'service-cell', 'service-cell-v2']) {
    const world = inventory.worlds.find((entry) => entry.name === name);
    assert.deepEqual(world.uses, [{
      interface: 'call-context', types: ['row'],
    }]);
  }
  t.end();
});

test('unknown interface and type use both fail closed', (t) => {
  assert.throws(() => inspectWitHostSurface(WIT.replace(
    'use call-context.{row};', 'use unknown-context.{row};')),
  /Unresolved WIT use/u);
  assert.throws(() => inspectWitHostSurface(WIT.replace(
    'use call-context.{row};', 'use call-context.{missing};')),
  /Unresolved WIT use/u);
  t.end();
});

test('unsupported world declarations fail rather than disappear', (t) => {
  assert.throws(() => inspectWitHostSurface(WIT.replace(
    '  import context;', '  inject context;')),
  /Unparsed WIT world/u);
  assert.throws(() => inspectWitHostSurface(WIT.replace(
    '  use call-context.{row};', '  use call-context.row;')),
  /Unrecognized WIT use/u);
  t.end();
});

test('sealed request binding-call error ABI remains typed', (t) => {
  const inventory = inspectWitHostSurface(WIT);
  const ctx = inventory.interfaces.find((entry) => entry.name === 'context');
  const error = ctx.types.find((entry) => entry.name === 'binding-call-error');
  assert.equal(error.kind, 'record');
  assert.deepEqual(error.members, [
    'code: string,', 'message: string,', 'retryable: bool,',
  ]);
  const mutated = inspectWitHostSurface(WIT.replace(
    'retryable: bool,', 'retryable: string,'));
  assert.notDeepEqual(
    mutated.interfaces.find((entry) => entry.name === 'context').types,
    ctx.types, 'changing a referenced type changes the inventory');
  t.end();
});

test('sealed call-context row and deny types remain represented', (t) => {
  const inventory = inspectWitHostSurface(WIT);
  const ctx = inventory.interfaces.find((entry) => entry.name ===
    'call-context');
  const byName = Object.fromEntries(ctx.types.map((item) =>
    [item.name, item]));
  assert.deepEqual(byName['cell-value'].members, [
    'null-value,', 'integer(s64),', 'real(f64),', 'text(string),',
  ]);
  assert.deepEqual(byName['column'].members, [
    'name: string,', 'val: cell-value,',
  ]);
  assert.deepEqual(byName['row'].members, ['columns: list<column>,']);
  assert.deepEqual(byName['deny-code'].members, [
    'undeclared-capability,', 'budget-exhausted,', 'invalid-argument,',
  ]);
  t.end();
});

test('unparsed or malformed WIT type definitions fail closed', (t) => {
  assert.throws(() => inspectWitHostSurface(WIT.replace(
    'record row {', 'type row {')), /Unparsed declaration/u);
  assert.throws(() => inspectWitHostSurface(WIT.replace(
    'retryable: bool,', 'retryable: bool;')),
  /Unrecognized or repeated WIT type member/u);
  t.end();
});
