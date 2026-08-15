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

test('join failure path has no provisional full-admin runtime to release', (t) => {
  const source = readFileSync('src/lagrange-runtime-startup.js', 'utf8');
  const joinFailureBlockMatch = source.match(
    /if \(!joinResult\.success\) \{[\s\S]*?return startJoinNode\([\s\S]*?\n {2}\}/,
  );

  t.ok(joinFailureBlockMatch, 'entrypoint should retain a join failure branch');
  t.notMatch(
    source,
    /onLocalAdminRuntimeReady:\s*async/,
    'entrypoint must not start full admin from the pre-join runtime callback',
  );
  t.notMatch(
    joinFailureBlockMatch[0],
    /shutdownAdminRuntimeComposition|shutdownEarlyAdminSqlRuntime/,
    'failed join only owns bootstrap cleanup because admin has not started',
  );
  t.end();
});
