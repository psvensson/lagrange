// Attempt telemetry is DESCRIPTIVE: it records what an attempt cost to produce
// (dossier bytes, agent wall-clock) so the dossier budget can be sized against
// measured reality rather than an offline reconstruction — the first attempt at
// sizing it was wrong by 2x.
//
// The load-bearing property is that it changes NOTHING. It carries a wall-clock
// duration, so if it ever reached a violation identity, replacement matching would
// become nondeterministic and integrity resolution would break. These tests pin that
// it does not, and that absent telemetry stays legal for the whole historical corpus.

import tap from 'tap';

import {integrityViolationId} from '../../scripts/solve/integrity.js';
import {validateAttempt, METRIC_DIRECTION_LOWER_IS_BETTER}
  from '../../scripts/solve/honesty.js';

const okCtx = {fileExists: () => true, changeRefResolves: () => true};

function attempt(extra = {}) {
  return {
    metricBefore: 5,
    metricAfter: 3,
    metricDirection: METRIC_DIRECTION_LOWER_IS_BETTER,
    evidence: 'report.json',
    changeRef: 'diff:/tmp/x.diff',
    prevRungIndex: 1,
    rungIndex: 1,
    probeKey: '{"probe":"oracle"}',
    evidenceFingerprint: 'a'.repeat(64),
    ...extra,
  };
}

const TELEMETRY = Object.freeze({
  dossierBytes: 248_245,
  findingsBytes: 103_332,
  findingsCount: 383,
  agentDurationMs: 91_744,
});

tap.test('attempt telemetry is descriptive and never load-bearing', async (t) => {
  t.test('violation identity is invariant under telemetry', (t) => {
    // The critical property. integrityViolationId hashes only the violations, the
    // probe key and the evidence fingerprint — if wall-clock ms ever entered it,
    // every replacement/resolution match would break nondeterministically.
    const args = (extra) => ({
      quest: {id: 'demo'},
      generation: '2026-07-25T00:00:00.000Z',
      frontier: 'demo-main',
      scope: 'attempt-integrity',
      violations: ['evidence artifact missing: (none)'],
      attempt: attempt(extra),
    });
    t.equal(
      integrityViolationId(args({telemetry: TELEMETRY})),
      integrityViolationId(args({})),
      'the same attempt with and without telemetry yields one identity',
    );
    t.equal(
      integrityViolationId(args({telemetry: {...TELEMETRY, agentDurationMs: 1}})),
      integrityViolationId(args({telemetry: {...TELEMETRY, agentDurationMs: 999}})),
      'a different duration does not fork the identity',
    );
    t.end();
  });

  t.test('telemetry never affects honesty validation', (t) => {
    t.same(validateAttempt(attempt({telemetry: TELEMETRY}), okCtx), [],
      'a well-formed attempt stays well-formed');
    t.same(validateAttempt(attempt({telemetry: null}), okCtx), [],
      'absent telemetry is legal — the whole historical corpus lacks it');
    t.same(
      validateAttempt(attempt({
        telemetry: {dossierBytes: -1, agentDurationMs: Number.MAX_SAFE_INTEGER},
      }), okCtx),
      [],
      'even absurd telemetry is not a violation: attempts are judged by the probe',
    );
    t.end();
  });

  t.test('telemetry cannot rescue a genuinely dishonest attempt', (t) => {
    // The mirror property: being descriptive must not mean being exculpatory.
    const v = validateAttempt(
      attempt({metricAfter: null, telemetry: TELEMETRY}), okCtx);
    t.ok(v.some((e) => e.includes('finite numbers')),
      'a null metric is still rejected however much telemetry accompanies it');
    t.end();
  });
});
