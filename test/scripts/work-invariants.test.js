import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  REGISTRY_SCHEMA,
  findInvariantsForOwnerBoundary,
  indexInvariantsById,
  loadInvariantRegistry,
  validateInvariantRegistry,
} from '../../scripts/work-invariants.js';

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'invariants-'));
}

function writeRegistry(root, registry) {
  const dir = path.join(root, 'architecture', 'contracts');
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(
    path.join(dir, 'invariants.json'),
    JSON.stringify(registry, null, 2),
  );
}

function validPair() {
  return {
    schema: REGISTRY_SCHEMA,
    invariants: [
      {
        id: 'a-safe',
        owner: 'owner_a',
        boundary: 'boundary_x',
        kind: 'safety',
        statement: 'A holds.',
        formalPredicate: 'a',
        coupledWith: ['b-live'],
      },
      {
        id: 'b-live',
        owner: 'owner_a',
        boundary: 'boundary_x',
        kind: 'liveness',
        statement: 'B holds.',
        formalPredicate: '<>b',
        coupledWith: ['a-safe'],
      },
    ],
  };
}

tap.test('accepts a well-formed registry with symmetric coupling', (t) => {
  const errors = validateInvariantRegistry(validPair());
  t.same(errors, [], 'no errors for valid registry');
  t.end();
});

tap.test('rejects wrong schema', (t) => {
  const reg = validPair();
  reg.schema = 'bad';
  const errors = validateInvariantRegistry(reg);
  t.ok(errors.some((e) => e.includes('schema')), 'flags schema');
  t.end();
});

tap.test('rejects duplicate ids', (t) => {
  const reg = validPair();
  reg.invariants[1].id = 'a-safe';
  reg.invariants[1].coupledWith = [];
  reg.invariants[0].coupledWith = [];
  const errors = validateInvariantRegistry(reg);
  t.ok(errors.some((e) => e.includes('duplicate')), 'flags duplicate id');
  t.end();
});

tap.test('rejects invalid kind', (t) => {
  const reg = validPair();
  reg.invariants[0].kind = 'banana';
  const errors = validateInvariantRegistry(reg);
  t.ok(errors.some((e) => e.includes('kind')), 'flags kind');
  t.end();
});

tap.test('rejects unknown coupledWith reference', (t) => {
  const reg = validPair();
  reg.invariants[0].coupledWith = ['ghost'];
  const errors = validateInvariantRegistry(reg);
  t.ok(errors.some((e) => e.includes('unknown id')), 'flags unknown ref');
  t.end();
});

tap.test('rejects self coupling', (t) => {
  const reg = validPair();
  reg.invariants[0].coupledWith = ['a-safe'];
  const errors = validateInvariantRegistry(reg);
  t.ok(errors.some((e) => e.includes('itself')), 'flags self coupling');
  t.end();
});

tap.test('rejects asymmetric coupling', (t) => {
  const reg = validPair();
  reg.invariants[1].coupledWith = [];
  const errors = validateInvariantRegistry(reg);
  t.ok(errors.some((e) => e.includes('not symmetric')), 'flags asymmetry');
  t.end();
});

tap.test('flags missing modelRef/contractRef paths', (t) => {
  const root = tmpRoot();
  const reg = validPair();
  reg.invariants[0].modelRef = 'models/does-not-exist.tla';
  const errors = validateInvariantRegistry(reg, {rootDir: root});
  t.ok(errors.some((e) => e.includes('does not exist')), 'flags missing ref');
  t.end();
});

tap.test('load + lookup helpers work', (t) => {
  const root = tmpRoot();
  writeRegistry(root, validPair());
  const loaded = loadInvariantRegistry(null, root);
  t.equal(loaded.error, null, 'loads without error');
  const byId = indexInvariantsById(loaded.registry);
  t.ok(byId.has('a-safe'), 'indexes by id');
  const found = findInvariantsForOwnerBoundary(
    loaded.registry, 'owner_a', 'boundary_x',
  );
  t.equal(found.length, 2, 'finds both invariants for the pair');
  t.end();
});

tap.test('reports registry-not-found when absent', (t) => {
  const root = tmpRoot();
  const loaded = loadInvariantRegistry(null, root);
  t.equal(loaded.error, 'registry-not-found', 'signals missing registry');
  t.end();
});
