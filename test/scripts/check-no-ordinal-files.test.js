import {test} from '../../src/test-helpers/tap.js';
import {findOrdinalFiles, runCheck} from '../../scripts/check-no-ordinal-files.js';

const CLEAN_PATHS = [
  'src/query/partition-resolver.js',
  'src/control-plane/control-plane-readiness-service-node-methods.js',
  'src/control-plane/control-plane-readiness-service-shared.js',
];
const ORDINAL_PATHS = [
  'src/query/query-executor-segment-2-part-1.js',
  'src/rebalancer/operation-workflow-owner-segment-5-stage-3.js',
];

test('findOrdinalFiles flags numbered segment/stage/part files', (t) => {
  t.same(
    findOrdinalFiles([...CLEAN_PATHS, ...ORDINAL_PATHS]).sort(),
    [...ORDINAL_PATHS].sort(),
    'only the numbered ordinal files are reported',
  );
  t.end();
});

test('findOrdinalFiles passes semantic suffixes (-shared, -node-methods)', (t) => {
  t.same(findOrdinalFiles(CLEAN_PATHS), [], 'semantic suffixes are not ordinals');
  t.end();
});

test('runCheck is ok on a clean path list', async (t) => {
  const result = await runCheck(CLEAN_PATHS);
  t.equal(result.ok, true);
  t.end();
});

test('runCheck fails and names offenders on an ordinal path list', async (t) => {
  const result = await runCheck([...CLEAN_PATHS, ...ORDINAL_PATHS]);
  t.equal(result.ok, false);
  t.match(result.message, /query-executor-segment-2-part-1\.js/u);
  t.end();
});

test('runCheck passes against the live src/ tree (migration stays at zero)',
  async (t) => {
    const result = await runCheck();
    t.equal(
      result.ok,
      true,
      'no ordinal files under src/ — the gate would catch a regression',
    );
    t.end();
  },
);
