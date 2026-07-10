import tap from 'tap';

import {
  buildSealFreshnessAdvisory,
  REPRO_ON_HEAD_FINDING_KIND,
} from '../../scripts/solve/seal-freshness.js';
import {EVENT_FINDING} from '../../scripts/solve/constants.js';

const SEAL_SHA = 'a'.repeat(40);
const quest = (over = {}) => ({
  id: 'q1',
  links: {sealedAtCommit: SEAL_SHA},
  ...over,
});
const options = (diff) => ({root: '/nowhere', diffNamesSince: () => diff});

tap.test('fires when src/ drifted since the seal and no repro finding exists', (t) => {
  const advisory = buildSealFreshnessAdvisory(
    quest(), [], options('src/a.js\nsrc/b.js\n'));
  t.ok(advisory, 'advisory present');
  t.equal(advisory.kind, 'seal-freshness');
  t.equal(advisory.severity, 'advisory');
  t.equal(advisory.changedSrcFiles, 2);
  t.match(advisory.message, /reproduce the sealed symptom/i);
  t.match(advisory.command, new RegExp(`--kind ${REPRO_ON_HEAD_FINDING_KIND}`),
    'names the exact finding command');
  t.end();
});

tap.test('silent when no src/ drift since the seal', (t) => {
  t.equal(buildSealFreshnessAdvisory(quest(), [], options('')), null);
  t.equal(buildSealFreshnessAdvisory(quest(), [], options('\n \n')), null,
    'whitespace-only diff output counts as no drift');
  t.end();
});

tap.test('silent once a repro-on-head finding exists', (t) => {
  const log = [
    {type: EVENT_FINDING, kind: 'other'},
    {type: EVENT_FINDING, kind: REPRO_ON_HEAD_FINDING_KIND},
  ];
  t.equal(buildSealFreshnessAdvisory(quest(), log, options('src/a.js\n')), null);
  t.end();
});

tap.test('silent for legacy quests without sealedAtCommit', (t) => {
  t.equal(
    buildSealFreshnessAdvisory(quest({links: {}}), [], options('src/a.js\n')),
    null);
  t.equal(
    buildSealFreshnessAdvisory(quest({links: undefined}), [], options('src/a.js\n')),
    null);
  t.equal(
    buildSealFreshnessAdvisory(
      quest({links: {sealedAtCommit: '  '}}), [], options('src/a.js\n')),
    null, 'blank sha treated as absent');
  t.end();
});

tap.test('silent when git cannot answer (diff runner returns null)', (t) => {
  t.equal(buildSealFreshnessAdvisory(quest(), [], options(null)), null);
  t.end();
});
