#!/usr/bin/env python3
"""Copy a closed schema-only fixture; tested owner writes remain WAL/FULL."""
from pathlib import Path
import sys
p = Path(sys.argv[1]) / 'test/rebalancer/message-group-membership-branch-authorization.test.js'
s = p.read_text()
old = "import {test} from 'node:test';"
assert s.count(old) == 1
s = s.replace(old, "import {after, before, test} from 'node:test';", 1)
old = """  db.exec(generateCreateTableSQL(REPLICA_OPERATIONS_SCHEMA));
  db.exec(generateCreateTableSQL(NODES_SCHEMA));
  for (const sql of generateCreateIndexSQL(REPLICA_OPERATIONS_SCHEMA)) db.exec(sql);
"""
assert s.count(old) == 1
s = s.replace(old, '', 1)
old = """  for (const nodeId of [OWNER, TARGET_NODE, 'third-node']) {
    const inserted = run(`INSERT INTO nodes
      (node_id,node_address,cpu_cores,memory_mb,disk_gb,last_heartbeat,boot_incarnation,created_at)
      VALUES (?,?,?,?,?,?,?,?)`, [nodeId, `${nodeId}:8000`, 2, 512, 10, NOW, 1, NOW]);
    assert.equal(inserted.affectedRows, 1);
  }
"""
assert s.count(old) == 1
s = s.replace(old, '', 1)
old = '  let db = new Database(file);'
assert s.count(old) == 1
s = s.replace(old, "  // Each case gets an independent file; no tested row or mutation is shared.\n  fs.copyFileSync(schemaFixtureFile, file);\n" + old, 1)
anchor = 'async function setup(t, {initial = false} = {}) {'
assert s.count(anchor) == 1
fixture = """// Schema/index/node creation is immutable setup, not the transaction under test.
// Build it once, close it completely, and clone its bytes for each case. Every
// owner mutation below still uses its own WAL/FULL database and reopen path.
let schemaFixtureDirectory = null;
let schemaFixtureFile = null;
before(() => {
  schemaFixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-schema-fixture-'));
  schemaFixtureFile = path.join(schemaFixtureDirectory, 'schema.sqlite');
  const template = new Database(schemaFixtureFile);
  try {
    template.pragma('synchronous = FULL');
    template.transaction(() => {
      template.exec(generateCreateTableSQL(REPLICA_OPERATIONS_SCHEMA));
      template.exec(generateCreateTableSQL(NODES_SCHEMA));
      for (const sql of generateCreateIndexSQL(REPLICA_OPERATIONS_SCHEMA)) template.exec(sql);
      const insert = template.prepare(`INSERT INTO nodes
        (node_id,node_address,cpu_cores,memory_mb,disk_gb,last_heartbeat,boot_incarnation,created_at)
        VALUES (?,?,?,?,?,?,?,?)`);
      for (const nodeId of [OWNER, TARGET_NODE, 'third-node']) {
        assert.equal(insert.run(nodeId, `${nodeId}:8000`, 2, 512, 10, NOW, 1, NOW).changes, 1);
      }
    })();
    assert.equal(template.inTransaction, false);
  } finally {
    template.close();
  }
});
after(() => {
  if (schemaFixtureDirectory) fs.rmSync(schemaFixtureDirectory, {recursive: true, force: true});
});

"""
s = s.replace(anchor, fixture + anchor, 1)
old = '  const attempts = await Promise.all([authorizeInitial(f, first), authorizeInitial(f, other, f.repo())]);'
assert s.count(old) == 1
s = s.replace(old, '  const attempts = await Promise.all([authorizeInitial(f, first),\n    authorizeInitial(f, other, f.repo())]);', 1)
p.write_text(s)
print('Isolated file-backed copies of closed schema fixture; owner commits/reopens remain WAL/FULL.')
