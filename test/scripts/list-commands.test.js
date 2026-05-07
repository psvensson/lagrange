import {test} from '../../src/test-helpers/tap.js';
import {
  COMMAND_GROUPS,
  renderCommandList,
} from '../../scripts/list-commands.js';

test('command list includes LLM orientation and focused guardrails', (t) => {
  const rendered = renderCommandList();

  t.match(rendered, 'npm run work:context');
  t.match(rendered, 'npm run guard:guideline:constant-names:file');
  t.match(rendered, 'npm run test:metrics:scoped -- <files...>');
  t.ok(COMMAND_GROUPS.length > 0, 'command groups should be exported for tests');
  t.end();
});
