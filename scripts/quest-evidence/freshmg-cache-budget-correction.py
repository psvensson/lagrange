#!/usr/bin/env python3
"""Tighten the cache fixture and declare its proof responsibility, not runtime policy."""
from pathlib import Path
import sys

root = Path(sys.argv[1])
p = root / 'test/integration/message-group-membership-claim-cache.integration.test.js'
s = p.read_text()
replacements = [
    ("import {test} from 'node:test';", "import {test} from 'node:test';\nimport {performance} from 'node:perf_hooks';"),
    ('  {timeout: 120000}, async () => {', '''  {timeout: 30000}, async () => {
    const started = performance.now();
    const timings = [];
    const mark = (phase) => timings.push({phase,
      elapsedMs: Math.round(performance.now() - started)});'''),
    ('        config: TEST_CONFIG.bootstrap});', '''        // Eliminate fixture per-replica pacing, not runtime election safety.
        config: {...TEST_CONFIG.bootstrap, replicaStaggerDelayMs: 0}});'''),
    ('      booted = await bootstrap.bootstrap();', "      booted = await bootstrap.bootstrap();\n      mark('bootstrap');"),
    ('      await coordinator.shutdown();', "      await coordinator.shutdown();\n      mark('coordinator-quiesced');"),
    ('      const nulled = await cdc.updateSystemTableRow', "      mark('operation-inserted');\n      const nulled = await cdc.updateSystemTableRow"),
    ('      const before = cache.get(TABLE, id);', "      mark('null-lease-visible');\n      const before = cache.get(TABLE, id);"),
    ("      assert.equal(claimed.outcome, 'recorded', JSON.stringify(claimed));", "      mark('claim-returned');\n      assert.equal(claimed.outcome, 'recorded', JSON.stringify(claimed));"),
    ('      const visible = cache.get(TABLE, id);', "      mark('claim-cache-visible');\n      const visible = cache.get(TABLE, id);"),
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

# The filename matches both membership/bootstrap and message/transport rules.
# Its assertion is metadata visibility, not election or transport behavior.
# Add a reasoned exact override to the existing producer's declared taxonomy;
# all generated files are subsequently produced by test:metadata:refresh.
p = root / 'scripts/checks/test-subsystem-classification-constants.js'
s = p.read_text()
anchor = 'export const SUBSYSTEM_OVERRIDES = Object.freeze({\n'
assert s.count(anchor) == 1
assert "'test/integration/message-group-membership-claim-cache.integration.test.js':" not in s
addition = '''  'test/integration/message-group-membership-claim-cache.integration.test.js': {
    subsystem: SUBSYSTEM_CDC_METADATA,
    reason: 'proves repository mutation visibility in SystemTableCache; seed and message group supply the fixture, not the asserted responsibility',
  },
'''
p.write_text(s.replace(anchor, anchor + addition, 1))
