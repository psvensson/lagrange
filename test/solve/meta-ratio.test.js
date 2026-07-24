import tap from 'tap';

import {
  classifyCommitPaths,
  renderMetaRatio,
} from '../../scripts/solve/meta-ratio.js';

tap.test('commit meta-ratio', async (t) => {
  t.test('classifies commits by touched paths', (t) => {
    t.equal(classifyCommitPaths(['src/a.js', 'solve/log/x.ndjson']), 'product',
      'a landing co-located with its ledger update is product, not overhead');
    t.equal(classifyCommitPaths(['examples/demo.js']), 'product');
    t.equal(classifyCommitPaths(['test/a.test.js', 'docs/x.md']), 'test-only');
    t.equal(classifyCommitPaths(['solve/quests/q.json']), 'meta');
    t.equal(classifyCommitPaths(['scripts/solve/next.js', 'docs/a.md']), 'meta');
    t.equal(classifyCommitPaths([]), 'meta', 'pathless commits count as meta');
    t.end();
  });

  t.test('renders shares and the over-half advisory', (t) => {
    const md = renderMetaRatio({
      days: 4,
      total: 10,
      tally: {'product': 3, 'test-only': 1, 'meta': 6},
      shares: {product: 0.3, testOnly: 0.1, meta: 0.6},
    });
    t.match(md, /last 4 day\(s\), 10 commit\(s\)/u);
    t.match(md, /product .*: 3 \(30%\)/u);
    t.match(md, /meta .*: 6 \(60%\)/u);
    t.match(md, /meta share exceeds half/u,
      'advisory fires above the 50% line');
    t.end();
  });

  t.test('stays quiet at or below half, and on an empty window', (t) => {
    const balanced = renderMetaRatio({
      days: 4,
      total: 10,
      tally: {'product': 5, 'test-only': 0, 'meta': 5},
      shares: {product: 0.5, testOnly: 0, meta: 0.5},
    });
    t.notMatch(balanced, /exceeds half/u);
    const empty = renderMetaRatio({
      days: 4,
      total: 0,
      tally: {'product': 0, 'test-only': 0, 'meta': 0},
      shares: {product: 0, testOnly: 0, meta: 0},
    });
    t.notMatch(empty, /exceeds half/u, 'no advisory without commits');
    t.end();
  });
});
