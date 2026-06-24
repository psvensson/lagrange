import {readFileSync} from 'node:fs';

import {test} from '../../src/test-helpers/tap.js';
import {
  shutdownAdminRuntimeComposition,
} from '../../src/entrypoint-runtime-admin-composition.js';

test('shutdownAdminRuntimeComposition releases admin runtime surfaces', async (t) => {
  const calls = [];
  const adminRuntime = {
    adminAPI: {
      async shutdown() {
        calls.push('admin-api');
      },
    },
    liveQueryWiring: {
      shutdown() {
        calls.push('live-query');
      },
    },
  };

  await shutdownAdminRuntimeComposition(adminRuntime);

  t.same(
    calls,
    ['admin-api', 'live-query'],
    'admin API must release its port before live query wiring is torn down',
  );
});

test('shutdownAdminRuntimeComposition tolerates absent early runtime', async (t) => {
  await shutdownAdminRuntimeComposition(null);
  await shutdownAdminRuntimeComposition({});

  t.pass('join failure cleanup may run before early admin runtime exists');
});

test('join failure path releases early admin runtime before reattempt', (t) => {
  const source = readFileSync('src/index.js', 'utf8');
  const joinFailureBlockMatch = source.match(
    /if \(!joinResult\.success\) \{[\s\S]*?const reattemptAllowed/,
  );

  t.ok(joinFailureBlockMatch, 'entrypoint should retain a join failure branch');
  t.match(
    joinFailureBlockMatch[0],
    /await bootstrapAPI\.shutdown\(\);\s*await shutdownAdminRuntimeComposition\(joinAdminRuntime\);\s*joinAdminRuntime = null;/,
    'join failure branch should release early admin runtime before retry logic',
  );
  // The provisional early SQL engine (LAGRANGE_EARLY_ADMIN_SQL_ENGINE) must also
  // be disposed on the failure path, AFTER the admin runtime that referenced it,
  // so a rejoin reattempt does not leak a per-engine sub-service set per attempt.
  t.match(
    joinFailureBlockMatch[0],
    /joinAdminRuntime = null;\s*(?:\/\/[^\n]*\n\s*)*await shutdownEarlyAdminSqlRuntime\(joinEarlySqlRuntime\);\s*joinEarlySqlRuntime = null;/,
    'join failure branch should dispose the early SQL runtime after the admin runtime',
  );
  t.end();
});
