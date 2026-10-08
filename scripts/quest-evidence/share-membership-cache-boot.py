#!/usr/bin/env python3
"""Share one real seed lifetime; retain separate FAILED and REMOVED fixtures."""
from pathlib import Path
import hashlib
import sys
import textwrap

root = Path(sys.argv[1]).resolve()
p = root / 'test/integration/message-group-membership-claim-cache.integration.test.js'
raw = p.read_bytes()
blob = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
assert blob == 'd910f93cbec084a7d7af5ea426118920d2bb145f', 'cache source drift'
s = raw.decode()
header = s[:s.index('for (const settlement of [')]
setup_start = s.index('      const started = performance.now();')
body_start = s.index('        const now = Date.now();')
end = s.index('      } finally {', body_start)
case = textwrap.dedent(s[body_start:end])
case = case.replace('repository = new ReplicaOperationRepository(',
                    'const repository = new ReplicaOperationRepository(', 1)
anchor = 'controlPlaneSystemTableGateway: gateway, logger: coordinator.logger});'
assert case.count(anchor) == 1
case = case.replace(anchor, anchor + '\nt.after(() => repository.markShuttingDown());', 1)
case = case.replace('const id = `cache-claim-${now}`;',
                    'const id = `cache-claim-${settlement.status}-${now}`;', 1)
case = case.replace('const group = `cache-visibility-fixture-${now}`;',
                    'const group = `cache-visibility-fixture-${settlement.status}-${now}`;', 1)
setup = textwrap.dedent(s[setup_start:body_start]).replace('let repository;\n', '')
helper = """// Each case owns a distinct row and repository facade. Only the expensive
// seed/SQL/Raft/CDC lifetime is shared; reconciliation remains quiesced.
async function exerciseSettlement(t, settlement,
  {bootstrap, port, cache, cdc, gateway, coordinator, mark}) {
""" + textwrap.indent(case, '  ') + '}\n\n'
main = """test('repository failed and successful T1 cases share one SQL/Raft/cache seed',
  {timeout: 30000}, async (t) => {
""" + textwrap.indent(setup, '    ') + """      for (const settlement of [
        {status: ReplicaStatus.FAILED, step: WORKFLOW_STEP.FAILED},
        {status: ReplicaStatus.REMOVED, step: WORKFLOW_STEP.REMOVED},
      ]) {
        await t.test(settlement.status, (caseTest) => exerciseSettlement(caseTest,
          settlement, {bootstrap, port, cache, cdc, gateway, coordinator,
            mark: (phase) => mark(`${settlement.status}:${phase}`)}));
      }
    } finally {
      mark('teardown-start');
      await gracefulShutdown(bootstrap, booted, null);
      mark('bootstrap-stopped');
      await cleanupTestEnvironment();
      mark('cleanup-complete');
      const elapsedMs = Math.round(performance.now() - started);
      console.log(JSON.stringify({schema: 'membership-cache-timing/2',
        budgetMs: 30000, elapsedMs, fixtureReplicaStaggerDelayMs: 0, timings}));
      assert.ok(elapsedMs < 30000, 'both cases and joined teardown must fit the existing 30s budget');
    }
  });
"""
p.write_text(header + helper + main)
print('One seed lifetime; both original assertion bodies retained; distinct rows/facades; 30s unchanged.')
