import tap from 'tap';

import {
  checkCliDocs,
  evaluateCliDocs,
  loadCliDocuments,
} from '../../scripts/check-cli-docs.js';

tap.test('checked-in CLI docs match the executable view registry', (t) => {
  const result = checkCliDocs();

  t.equal(result.valid, true, result.problems.join('\n'));
  t.same(result.problems, []);
  t.end();
});

tap.test('stale service shortcut is rejected', (t) => {
  const documents = structuredClone(loadCliDocuments());
  documents['src/cli/README.md'] = documents['src/cli/README.md']
    .replace('| `2` | Replicas |', '| `2` | Services |');

  const result = evaluateCliDocs(documents);

  t.equal(result.valid, false);
  t.match(result.problems.join('\n'), /stale key 2 = Services/u);
  t.end();
});
