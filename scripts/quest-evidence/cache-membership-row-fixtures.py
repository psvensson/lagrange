#!/usr/bin/env python3
"""Reuse closed initial row fixtures, never an owner-mutated database."""
from pathlib import Path
import sys
p = Path(sys.argv[1]) / 'test/rebalancer/message-group-membership-branch-authorization.test.js'
s = p.read_text()
a = 'let schemaFixtureFile = null;'
assert s.count(a) == 1
s = s.replace(a, a + '\nconst operationFixtureFiles = new Map();', 1)
a = '  // Each case gets an independent file; no tested row or mutation is shared.\n  fs.copyFileSync(schemaFixtureFile, file);'
assert s.count(a) == 1
s = s.replace(a, '''  // Only a closed, never-exercised initial row is reusable. Each owner action
  // still receives a distinct WAL/FULL file and independent repository state.
  const cachedFixture = operationFixtureFiles.get(initial);
  fs.copyFileSync(cachedFixture ?? schemaFixtureFile, file);''', 1)
start = s.index('  const operation = {operationId: O, type: OperationType.REPLACE, partitionId: GROUP,')
end = s.index('  return {get repository()', start)
seed = s[start:end]
s = s[:start] + '  if (!cachedFixture) {\n' + ''.join('  '+line+'\n' if line else '\n' for line in seed.splitlines()) + '''    // Last-connection close checkpoints committed setup before copying. No
    // tested transition or failed-write state is ever copied to another test.
    db.close();
    const fixture = path.join(schemaFixtureDirectory, initial ? 'initial.sqlite' : 'learner.sqlite');
    fs.copyFileSync(file, fixture);
    operationFixtureFiles.set(initial, fixture);
    db = new Database(file);
    db.pragma('synchronous = FULL');
  }
  assert.equal(db.pragma('journal_mode', {simple: true}), 'wal');
  assert.equal(db.pragma('synchronous', {simple: true}), 2);
''' + s[end:]
p.write_text(s)
print('Initial and committed-learner rows built once through existing setup, closed and copied. Tested writes remain isolated WAL/FULL.')
