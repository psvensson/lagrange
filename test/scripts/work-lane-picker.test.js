import {test} from '../../src/test-helpers/tap.js';
import {
  CANONICAL_WORKFLOW_LANES,
  LEGACY_LANE_ALIASES,
  canonicalLaneForPackageLane,
  recommendLane,
  recommendLaneForPackage,
  runCli,
} from '../../scripts/work-lane-picker.js';

test('lane picker exposes seven canonical lane buckets', (t) => {
  t.same(CANONICAL_WORKFLOW_LANES, [
    'read-doc',
    'maintenance',
    'proof',
    'experiment',
    'runtime',
    'scenario',
    'discovery',
  ]);
  t.equal(Object.keys(LEGACY_LANE_ALIASES).length >= 13, true);
  t.end();
});

test('lane picker maps legacy package lanes to canonical buckets', (t) => {
  t.equal(canonicalLaneForPackageLane('read-review-doc-only'), 'read-doc');
  t.equal(canonicalLaneForPackageLane('mechanical-maintenance'), 'maintenance');
  t.equal(canonicalLaneForPackageLane('lightweight-maintenance'), 'maintenance');
  t.equal(canonicalLaneForPackageLane('test-only-proof'), 'proof');
  t.equal(canonicalLaneForPackageLane('diagnostic-classification'), 'proof');
  t.equal(canonicalLaneForPackageLane('experiment'), 'experiment');
  t.equal(canonicalLaneForPackageLane('bounded-experiment'), 'experiment');
  t.equal(canonicalLaneForPackageLane('single-file-runtime'), 'runtime');
  t.equal(canonicalLaneForPackageLane('runtime-owner-boundary'), 'runtime');
  t.equal(canonicalLaneForPackageLane('scenario-release-gate'), 'scenario');
  t.equal(canonicalLaneForPackageLane('causal-escalation'), 'scenario');
  t.equal(canonicalLaneForPackageLane('discovery'), 'discovery');
  t.end();
});

test('lane picker recommends compatible package lanes from signals', (t) => {
  t.equal(recommendLane({docsOnly: true}).packageLane, 'read-review-doc-only');
  t.equal(recommendLane({script: true}).packageLane, 'lightweight-maintenance');
  t.equal(recommendLane({testsOnly: true}).packageLane, 'test-only-proof');
  t.equal(
    recommendLane({classification: true}).packageLane,
    'diagnostic-classification',
  );
  t.equal(recommendLane({experiment: true}).packageLane, 'experiment');
  t.equal(
    recommendLane({runtime: true, oneFile: true}).packageLane,
    'single-file-runtime',
  );
  t.equal(
    recommendLane({runtime: true}).packageLane,
    'runtime-owner-boundary',
  );
  t.equal(
    recommendLane({scenario: true}).packageLane,
    'scenario-release-gate',
  );
  t.equal(recommendLane({discovery: true}).packageLane, 'discovery');
  t.end();
});

test('lane picker renders CLI output and package recommendations', (t) => {
  const rendered = runCli(['--docs-only']);
  const packageRecommendation = recommendLaneForPackage({
    lane: 'runtime-owner-boundary',
  });

  t.match(rendered, /Canonical lane: `read-doc`/u);
  t.match(rendered, /Package lane: `read-review-doc-only`/u);
  t.equal(packageRecommendation.canonicalLane, 'runtime');
  t.equal(packageRecommendation.packageLane, 'runtime-owner-boundary');
  t.end();
});
