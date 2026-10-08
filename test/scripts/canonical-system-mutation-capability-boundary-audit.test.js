import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  auditCanonicalSystemMutationCapabilityBoundary,
} from '../../scripts/checks/canonical-system-mutation-capability-boundary-audit.js';

function auditMutant(source) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'capability-audit-'));
  try {
    const file = path.join(root, 'src', 'partition', 'mutant.js');
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, source);
    return auditCanonicalSystemMutationCapabilityBoundary({root});
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
}

test('capability audit detects independent alias and callback mutants', () => {
  const mutants = [
    ['computed database alias',
      'const key = \'db\'; export const leak = (service) => service[key];',
      'raw-database'],
    ['destructured raft alias',
      'export function leak(service) { const {raft} = service; return raft; }',
      'raw-consensus-port'],
    ['getter queue alias',
      'export class Leak { get proposalQueue() { return {}; } }',
      'mutable-proposal-state'],
    ['returned apply callback',
      'export const leak = (service) => service.applyCommittedEntry;',
      'direct-committed-application'],
    ['facade backreference',
      'export const leak = (service) => ({rawService: service});',
      'service-backreference'],
    ['bound database execution',
      'export const leak = (service) => service.db.exec.bind(service.db);',
      'raw-database'],
  ];
  for (const [label, source, category] of mutants) {
    const violations = auditMutant(source);
    assert.ok(violations.some((entry) => entry.category === category), label);
  }
});

test('capability audit accepts a narrow immutable observation', () => {
  assert.deepEqual(auditMutant(
    'export const readStatus = (service) => Object.freeze({id: service.id});'),
  []);
});
