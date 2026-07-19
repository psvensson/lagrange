import {test} from '../../src/test-helpers/tap.js';
import {
  resolveLiveConfirmationGate,
} from '../../scripts/run-effective-placement-serial-priority-planner-scenarios.js';

const FINGERPRINT = 'source-a';

function summary(runClass, options = {}) {
  const isProbe = runClass === 'probe';
  return {
    file: `${runClass}.summary.json`,
    value: {
      runClass,
      policy: {repetitions: isProbe ? 5 : 3},
      gatePassed: true,
      inconclusive: false,
      sessionStartedAt: isProbe ?
        '2026-07-19T12:00:00.000Z' :
        '2026-07-19T13:00:00.000Z',
      sessionCompletedAt: isProbe ?
        '2026-07-19T12:30:00.000Z' :
        '2026-07-19T14:00:00.000Z',
      sourceFingerprint: FINGERPRINT,
      completedSourceFingerprint: FINGERPRINT,
      sourceStable: true,
      ...options,
    },
  };
}

test('live closure requires an ordered source-bound probe then demo gate', (t) => {
  const probe = summary('probe');
  const demo = summary('demo');
  t.same(
    resolveLiveConfirmationGate([probe, demo], FINGERPRINT),
    {
      passed: true,
      probeSummary: 'probe.summary.json',
      demoSummary: 'demo.summary.json',
      sourceFingerprint: FINGERPRINT,
    },
  );
  t.equal(
    resolveLiveConfirmationGate([probe], FINGERPRINT).passed,
    false,
    'probe evidence alone cannot close',
  );
  t.equal(
    resolveLiveConfirmationGate([
      probe,
      summary('demo', {
        sessionStartedAt: '2026-07-19T11:00:00.000Z',
      }),
    ], FINGERPRINT).passed,
    false,
    'demo evidence must follow the probe gate',
  );
  t.equal(
    resolveLiveConfirmationGate([
      probe,
      summary('demo', {
        sourceFingerprint: 'source-b',
        completedSourceFingerprint: 'source-b',
      }),
    ], FINGERPRINT).passed,
    false,
    'both classes must measure the current source',
  );
  t.end();
});
