import {test} from '../../src/test-helpers/tap.js';
import {
  buildCandidate,
  renderMarkdown,
} from '../../scripts/work-oversized-next.js';

const SEGMENT_FILE_PATH = 'src/rebalancer/unified-rebalancer-segment-5.js';
const SOURCE_SCOPE = 'source';
const SEGMENT_LINES = 2079;
const SEGMENT_THRESHOLD = 800;

test('oversized extraction candidates require semantic helper naming', (t) => {
  const candidate = buildCandidate({
    scope: SOURCE_SCOPE,
    path: SEGMENT_FILE_PATH,
    lines: SEGMENT_LINES,
    threshold: SEGMENT_THRESHOLD,
  });

  t.equal(candidate.slug, 'extract-semantic-helper-concern');
  t.match(candidate.semanticNamingRule, /Replace semantic-helper-concern/u);
  t.match(candidate.semanticNamingRule, /do not use digit characters/u);
  t.match(candidate.semanticNamingRule, /do not derive new filenames/u);
  t.match(candidate.packageCommand, /--slug extract-semantic-helper-concern/u);
  t.match(
    candidate.packageCommand,
    /Extract semantic owner-boundary helper from src\/rebalancer\/unified-rebalancer-segment-5\.js/u,
  );
  t.notOk(
    Object.hasOwn(candidate, 'sourceSlug'),
    'candidate should not expose a source-derived slug for new filenames',
  );
  t.notMatch(candidate.packageCommand, /extract-src-rebalancer/u);
  t.end();
});

test('oversized extraction markdown includes the semantic naming rule', (t) => {
  const candidate = buildCandidate({
    scope: SOURCE_SCOPE,
    path: SEGMENT_FILE_PATH,
    lines: SEGMENT_LINES,
    threshold: SEGMENT_THRESHOLD,
  });
  const markdown = renderMarkdown({
    sourceOversizedCount: 1,
    testOversizedCount: 0,
    candidateCount: 1,
    candidates: [candidate],
  });

  t.match(markdown, /Replace semantic-helper-concern/u);
  t.match(markdown, /Command template/u);
  t.notMatch(markdown, /extract-src-rebalancer/u);
  t.end();
});
