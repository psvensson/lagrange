#!/usr/bin/env python3
"""Tighten only the cache-integration fixture; no runtime timing/policy edits."""
from pathlib import Path
import sys

p = Path(sys.argv[1]) / 'test/integration/message-group-membership-claim-cache.integration.test.js'
s = p.read_text()
replacements = [
    ("import {test} from 'node:test';", "import {test} from 'node:test';\nimport {performance} from 'node:perf_hooks';"),
    ('  {timeout: 120000}, async () => {', '''  {timeout: 30000}, async () => {
    const started = performance.now();
    const timings = [];
    const mark = (phase) => timings.push({phase,
      elapsedMs: Math.round(performance.now() - started)});'''),
    ('        config: TEST_CONFIG.bootstrap});', '''        // Eliminate the fixture's intentional per-replica pacing, not the
        // runtime election/leadership safety requirements or assertion budget.
        config: {...TEST_CONFIG.bootstrap, replicaStaggerDelayMs: 0}});'''),
    ('      booted = await bootstrap.bootstrap();', '      booted = await bootstrap.bootstrap();\n      mark(\'bootstrap\');'),
    ('      await coordinator.shutdown();', '      await coordinator.shutdown();\n      mark(\'coordinator-quiesced\');'),
    ('      const nulled = await cdc.updateSystemTableRow', '      mark(\'operation-inserted\');\n      const nulled = await cdc.updateSystemTableRow'),
    ('      const before = cache.get(TABLE, id);', '      mark(\'null-lease-visible\');\n      const before = cache.get(TABLE, id);'),
    ("      assert.equal(claimed.outcome, 'recorded', JSON.stringify(claimed));", "      mark('claim-returned');\n      assert.equal(claimed.outcome, 'recorded', JSON.stringify(claimed));"),
    ('      const visible = cache.get(TABLE, id);', '      mark(\'claim-cache-visible\');\n      const visible = cache.get(TABLE, id);'),
    ('      await gracefulShutdown(bootstrap, booted, null);\n      await cleanupTestEnvironment();', '''      mark('teardown-start');
      await gracefulShutdown(bootstrap, booted, null);
      mark('bootstrap-stopped');
      await cleanupTestEnvironment();
      mark('cleanup-complete');
      console.log(JSON.stringify({schema: 'membership-cache-timing/1',
        budgetMs: 30000, fixtureReplicaStaggerDelayMs: 0, timings}));'''),
]
for before, after in replacements:
    assert s.count(before) == 1, before
    s = s.replace(before, after, 1)
p.write_text(s)
