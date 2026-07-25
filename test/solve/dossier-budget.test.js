// The dossier handed to each fresh agent must be bounded. See dossier-budget.js for
// the measurements behind the policy; these pin the behaviour that makes it safe.

import tap from 'tap';

import {
  projectFinding,
  selectDossierFindings,
} from '../../scripts/solve/dossier-budget.js';

function finding(i, extra = {}) {
  return {claim: `finding ${i}`, kind: null, rulesOut: null,
    evidence: null, verification: null, ...extra};
}

tap.test('dossier findings budget', async (t) => {
  t.test('field projection drops what no reader reads', (t) => {
    // The single highest-leverage cut: applyFinding copies verification and the two
    // classification blobs into the projection, but only claim/kind/rulesOut are ever
    // rendered. On one real Quest those unread fields were 99,653 of 116,478 bytes.
    const projected = projectFinding({
      claim: 'c', kind: 'repro-on-head', rulesOut: 'lever-x',
      verification: {huge: 'x'.repeat(50_000)},
      regressionClassification: {a: 1},
      scopePressureClassification: {b: 2},
      evidence: 'report.json',
    });
    t.same(Object.keys(projected).sort(), ['claim', 'kind', 'rulesOut'],
      'only the fields a reader uses survive');
    t.notOk('verification' in projected, 'the largest unread field is gone');
    t.end();
  });

  t.test('no budget means no elision', (t) => {
    const out = selectDossierFindings([finding(1), finding(2)], {});
    t.equal(out.kept.length, 2);
    t.equal(out.elidedCount, 0);
    t.equal(out.totalCount, 2);
    t.end();
  });

  t.test('an over-budget set keeps the newest and reports the elision', (t) => {
    const many = Array.from({length: 200}, (_, i) => finding(i));
    const out = selectDossierFindings(many, {maxBytes: 400});
    t.ok(out.kept.length > 0, 'something is kept');
    t.ok(out.kept.length < 200, 'and something is elided');
    t.equal(out.elidedCount, 200 - out.kept.length, 'the count is exact');
    t.equal(out.totalCount, 200);
    t.ok(out.kept.at(-1).claim.includes('199'),
      'the newest finding is kept — it bears on the attempt being made');
    t.end();
  });

  t.test('kept findings stay in chronological order', (t) => {
    const many = Array.from({length: 50}, (_, i) => finding(i));
    const out = selectDossierFindings(many, {maxBytes: 200});
    const indices = out.kept.map((f) => Number(f.claim.split(' ')[1]));
    t.same(indices, [...indices].sort((a, b) => a - b),
      'the prompt reads oldest-to-newest');
    t.end();
  });

  t.test('an elided ruled-out lever still contributes its label', (t) => {
    // Losing a claim costs an explanation; losing a LABEL costs a re-derivation,
    // because the label is what retread.js matches on and retread suppresses lineage
    // levers on the assumption the dossier replays them.
    const old = Array.from({length: 100}, (_, i) =>
      finding(i, {rulesOut: `lever-${i}`}));
    const out = selectDossierFindings(old, {maxBytes: 300});
    t.ok(out.elidedCount > 0, 'the set is genuinely over budget');
    t.ok(out.ruledOutIndex.length > 0, 'elided levers survive as labels');
    t.ok(out.ruledOutIndex.includes('lever-0'),
      'the oldest ruled-out lever is still named');
    t.end();
  });

  t.test('a label already carried in full is not repeated in the index', (t) => {
    const items = [
      finding(1, {rulesOut: 'shared-lever'}),
      finding(2, {rulesOut: 'shared-lever'}),
    ];
    const out = selectDossierFindings(items, {maxBytes: 60});
    for (const label of out.ruledOutIndex) {
      t.notOk(out.kept.some((f) => f.rulesOut === label),
        'the index never duplicates a lever already shown in full');
    }
    t.end();
  });

  t.test('an over-long claim is truncated with a marker, never dropped', (t) => {
    const out = selectDossierFindings(
      [finding(1, {claim: 'x'.repeat(5000), rulesOut: 'lever'})],
      {maxBytes: 100_000, maxClaimBytes: 100});
    t.equal(out.kept.length, 1, 'the finding survives');
    t.match(out.kept[0].claim, /\[truncated\]/u, 'truncation is visible');
    t.equal(out.kept[0].rulesOut, 'lever', 'its lever is intact');
    t.end();
  });

  t.test('empty and malformed input are handled without elision', (t) => {
    t.same(selectDossierFindings([], {maxBytes: 100}),
      {kept: [], ruledOutIndex: [], elidedCount: 0, totalCount: 0});
    t.same(selectDossierFindings(undefined, {maxBytes: 100}).kept, []);
    t.end();
  });

  t.test('the budget actually bounds the result', (t) => {
    // The property the whole module exists for: output size must not grow with input.
    const small = selectDossierFindings(
      Array.from({length: 50}, (_, i) => finding(i)), {maxBytes: 2000});
    const huge = selectDossierFindings(
      Array.from({length: 5000}, (_, i) => finding(i)), {maxBytes: 2000});
    const size = (out) => Buffer.byteLength(JSON.stringify(out.kept), 'utf8');
    t.ok(size(huge) <= 2000, 'a 5000-finding Quest still fits the budget');
    t.ok(size(huge) <= size(small) * 2,
      '100x the input does not grow the dossier');
    t.end();
  });
});
