// Owner decision 2026-10-26 (Q4): the census owner detects a lifecycle-table
// write whatever binding spells the table (local constant, imported constant
// under any alias, namespace member, re-exported constant, interpolated next
// to an unresolvable column), and refuses a declared caller that hands its
// lifecycle operation on through a separate export (finding F1). The real
// tree has one lifecycle-table writer: the lifecycle owner (Q3).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

import {auditRaftRsOperationBoundary, lifecycleTableWriters} from
  '../../../scripts/checks/raft-rs-operation-boundary-audit.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const OWNER = 'src/raft/raft-rs-replica-lifecycle-owner.js';
const SQL_OUTSIDE_OWNER = 'lifecycle-sql-outside-owner';
const IMPORT_BYPASS = 'lifecycle-owner-import-bypass';
const CONSTANTS = 'raft-rs-replica-lifecycle-constants.js';
const CONSTANTS_SOURCE = 'const REPLICA_LIFECYCLE_TABLE = \'_raft_rs_replica_lifecycle\';\n' +
  'const RETIREMENT_TABLE = \'_raft_rs_retirement\';\n' +
  'const OTHER_TABLE = \'_raft_rs_peer_identity\';\n' +
  'export {REPLICA_LIFECYCLE_TABLE, RETIREMENT_TABLE, OTHER_TABLE};\n';
const COLUMNS_SOURCE = 'export const COLUMN = Object.freeze({ISSUE: \'original_allocation_issue\'});\n';
const RELAY_SOURCE = 'export {REPLICA_LIFECYCLE_TABLE as RELAYED} from \'./raft-rs-replica-lifecycle-constants.js\';\n';
const ALIAS_IMPORT = `import {REPLICA_LIFECYCLE_TABLE as TABLE} from './${CONSTANTS}';\n` +
  'import {COLUMN} from \'./columns.js\';\n';

function fixtureTree(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lifecycle-writer-census-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const raft = path.join(root, 'src', 'raft');
  fs.mkdirSync(raft, {recursive: true});
  for (const [name, source] of Object.entries({[CONSTANTS]: CONSTANTS_SOURCE,
    'columns.js': COLUMNS_SOURCE, 'relay.js': RELAY_SOURCE, ...files})) {
    fs.writeFileSync(path.join(raft, name), source);
  }
  return root;
}

test('the real tree has one lifecycle-table writer, the lifecycle owner', () => {
  assert.deepEqual(lifecycleTableWriters({root: ROOT}), [OWNER],
    'every allocation-field write and rights transition lives in the lifecycle owner');
  assert.deepEqual(auditRaftRsOperationBoundary({root: ROOT}).filter((entry) =>
    entry.code === SQL_OUTSIDE_OWNER), []);
});

// [label, writer source, detected as a second writer]
for (const [label, source, detected] of [
  ['aliased named import next to an unresolvable column',
    `${ALIAS_IMPORT}db.prepare(\`UPDATE \${TABLE} SET \${COLUMN.ISSUE} = ?\`).run(1);\n`, true],
  ['plain named import',
    `import {REPLICA_LIFECYCLE_TABLE} from './${CONSTANTS}';\n` +
    'db.prepare(`DELETE FROM ${REPLICA_LIFECYCLE_TABLE} WHERE group_id = ?`).run(1);\n', true],
  ['namespace import member',
    `import * as lifecycle from './${CONSTANTS}';\n` +
    'db.prepare(`INSERT INTO ${lifecycle.REPLICA_LIFECYCLE_TABLE} VALUES (?)`).run(1);\n', true],
  ['constant re-exported through another module',
    'import {RELAYED} from \'./relay.js\';\n' +
    'db.prepare(`UPDATE ${RELAYED} SET state = ?`).run(1);\n', true],
  ['local alias of an imported constant',
    `${ALIAS_IMPORT}const table = TABLE;\n` +
    'db.prepare(`UPDATE ${table} SET state = ?`).run(1);\n', true],
  ['concatenation around an unresolvable column',
    `${ALIAS_IMPORT}export const f = (db, column) => ` +
    'db.prepare(\'UPDATE \' + TABLE + \' SET \' + column + \' = ?\').run(1);\n', true],
  ['schema write with a loop-variable column',
    `${ALIAS_IMPORT}for (const column of Object.values(COLUMN)) ` +
    'db.exec(`ALTER TABLE ${TABLE} ADD COLUMN ${column} TEXT`);\n', true],
  ['retirement table behind an imported alias',
    `import {RETIREMENT_TABLE as R} from './${CONSTANTS}';\n` +
    'db.prepare(`UPDATE ${R} SET state = ?`).run(1);\n', true],
  ['read through an imported alias',
    `${ALIAS_IMPORT}db.prepare(\`SELECT state, \${COLUMN.ISSUE} FROM \${TABLE}\`).get();\n`, false],
  ['write to another table through the same constants module',
    `import {OTHER_TABLE as T} from './${CONSTANTS}';\n` +
    'db.prepare(`UPDATE ${T} SET state = ?`).run(1);\n', false],
]) {
  test(`lifecycle-table writer census: ${label}`, (t) => {
    const root = fixtureTree(t, {'second-writer.js': source});
    const found = auditRaftRsOperationBoundary({root}).filter((entry) =>
      entry.code === SQL_OUTSIDE_OWNER).map((entry) => entry.file);
    assert.deepEqual(found, detected ? ['src/raft/second-writer.js'] : []);
    assert.deepEqual(lifecycleTableWriters({root}),
      detected ? ['src/raft/second-writer.js'] : []);
  });
}

test('lifecycle-table writer census: the owner module is the writer, never a violation', (t) => {
  const root = fixtureTree(t, {'raft-rs-replica-lifecycle-owner.js':
    `${ALIAS_IMPORT}db.prepare(\`UPDATE \${TABLE} SET \${COLUMN.ISSUE} = ?\`).run(1);\n`});
  assert.deepEqual(lifecycleTableWriters({root}), [OWNER]);
  assert.deepEqual(auditRaftRsOperationBoundary({root}).filter((entry) =>
    entry.code === SQL_OUTSIDE_OWNER), []);
});

// Finding F1: an import of the declared operation followed by a separate
// export of that binding is refused like `export {op} from`.
const OPERATION = 'prepareReplicaLifecycleForOriginalAllocation';
const OPERATION_IMPORT = `import {${OPERATION}} from './raft-rs-replica-lifecycle-owner.js';\n`;
for (const [label, source, accepted] of [
  ['import used locally', `${OPERATION_IMPORT}export function bear(r) { return ${OPERATION}(r); }\n`, true],
  ['unrelated local export', `${OPERATION_IMPORT}const other = 1;\nexport {other};\n`, true],
  ['indirect re-export', `${OPERATION_IMPORT}export {${OPERATION}};\n`, false],
  ['indirect re-export under another name', `${OPERATION_IMPORT}export {${OPERATION} as bear};\n`, false],
  ['re-export of an aliased import',
    `import {${OPERATION} as bear} from './raft-rs-replica-lifecycle-owner.js';\nexport {bear};\n`, false],
  ['exported constant binding', `${OPERATION_IMPORT}export const bear = ${OPERATION};\n`, false],
  ['default export', `${OPERATION_IMPORT}export default ${OPERATION};\n`, false],
  ['direct re-export', `export {${OPERATION}} from './raft-rs-replica-lifecycle-owner.js';\n`, false],
]) {
  test(`lifecycle operation re-export census: ${label}`, (t) => {
    const root = fixtureTree(t, {'raft-rs-original-allocation-preparation.js': source});
    const refused = auditRaftRsOperationBoundary({root}).some((entry) =>
      entry.code === IMPORT_BYPASS);
    assert.equal(refused, !accepted);
  });
}
