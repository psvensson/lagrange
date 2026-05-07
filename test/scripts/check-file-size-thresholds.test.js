import {test} from '../../src/test-helpers/tap.js';
import {
  buildOwnerBoundaryGuidanceEntries,
} from '../../scripts/check-file-size-thresholds.js';

const SEGMENT_FILE_PATH =
  'src/rebalancer/operation-workflow-owner-segment-5-stage-5.js';
const NON_SEGMENT_FILE_PATH = 'src/rebalancer/operation-workflow-owner.js';
const SOURCE_SCOPE = 'source';
const SEGMENT_LINES = 901;
const SEGMENT_THRESHOLD = 800;

test('owner-boundary guidance targets oversized segment files only', (t) => {
  const guidanceEntries = buildOwnerBoundaryGuidanceEntries([
    {
      scope: SOURCE_SCOPE,
      path: SEGMENT_FILE_PATH,
      lines: SEGMENT_LINES,
      threshold: SEGMENT_THRESHOLD,
    },
    {
      scope: SOURCE_SCOPE,
      path: NON_SEGMENT_FILE_PATH,
      lines: SEGMENT_LINES,
      threshold: SEGMENT_THRESHOLD,
    },
  ]);

  t.equal(guidanceEntries.length, 1);
  t.equal(guidanceEntries[0].path, SEGMENT_FILE_PATH);
  t.match(guidanceEntries[0].guidance, /owner\/boundary helper/u);
  t.match(guidanceEntries[0].guidance, /existing entrypoint/u);
  t.end();
});
