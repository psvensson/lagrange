// A violation must be emitted under a policy it can actually satisfy. The emitter
// used to hardcode fresh-accepted-sample, which requires a replacement identity
// (frontier + probe key + failed evidence fingerprint). An attempt that produced no
// evidence at all cannot supply one, so the violation was born malformed —
// unresolvedIntegrityViolations short-circuits on malformed BEFORE consulting the
// resolved set, making the Quest unlandable from the instant it was written and
// repairable only by resealing the whole contract in a successor Quest. That is
// what retired minimal-deployment-boot-cell-placement for zero product delta.

import tap from 'tap';

import {
  INTEGRITY_RESOLUTION_FRESH_SAMPLE,
  INTEGRITY_RESOLUTION_NEW_QUEST,
  integrityResolutionPolicyFor,
  malformedIntegrityViolationReasons,
} from '../../scripts/solve/integrity.js';

const REPLACEABLE = Object.freeze({
  frontier: 'demo-main',
  replacementProbeKey: '{"probe":"oracle"}',
  failedEvidenceFingerprint: 'a'.repeat(64),
});

function violation(extra = {}) {
  return {
    type: 'violation',
    eventSchemaVersion: 2,
    scope: 'attempt-integrity',
    violationId: 'demo:gen:attempt-integrity:demo-main:abc',
    violations: ['evidence artifact missing: (none)'],
    ...REPLACEABLE,
    ...extra,
  };
}

tap.test('integrity resolution policy is chosen from the data', async (t) => {
  t.test('a violation with a full replacement identity takes a fresh sample', (t) => {
    t.equal(integrityResolutionPolicyFor(REPLACEABLE),
      INTEGRITY_RESOLUTION_FRESH_SAMPLE);
    t.end();
  });

  t.test('a violation with no failed evidence takes new-quest-only', (t) => {
    // The boot-cell case: the sole violation was "evidence artifact missing", so
    // there is no fingerprint a replacement sample could ever replace.
    t.equal(
      integrityResolutionPolicyFor({...REPLACEABLE, failedEvidenceFingerprint: null}),
      INTEGRITY_RESOLUTION_NEW_QUEST,
    );
    t.end();
  });

  t.test('a missing probe key or frontier also takes new-quest-only', (t) => {
    t.equal(
      integrityResolutionPolicyFor({...REPLACEABLE, replacementProbeKey: ''}),
      INTEGRITY_RESOLUTION_NEW_QUEST,
      'a fresh sample cannot be re-measured without a probe identity',
    );
    t.equal(
      integrityResolutionPolicyFor({...REPLACEABLE, frontier: ''}),
      INTEGRITY_RESOLUTION_NEW_QUEST,
      'a fresh sample cannot be re-measured without a frontier',
    );
    t.end();
  });

  t.test('the chosen policy never produces a malformed violation', (t) => {
    // The property that actually matters: whatever the emitter knows, the event it
    // writes must be well-formed, because a malformed one can never be cleared.
    for (const missing of [
      {},
      {failedEvidenceFingerprint: null},
      {replacementProbeKey: ''},
      {frontier: ''},
      {failedEvidenceFingerprint: null, replacementProbeKey: ''},
    ]) {
      const candidate = violation(missing);
      const event = {
        ...candidate,
        resolutionPolicy: integrityResolutionPolicyFor(candidate),
      };
      t.same(malformedIntegrityViolationReasons(event), [],
        `well-formed for ${JSON.stringify(missing)}`);
    }
    t.end();
  });

  t.test('hardcoding a fresh sample is what made these unresolvable', (t) => {
    // Pin the old behavior as the counterexample so a regression is unambiguous.
    const event = {
      ...violation({failedEvidenceFingerprint: null}),
      resolutionPolicy: INTEGRITY_RESOLUTION_FRESH_SAMPLE,
    };
    t.ok(malformedIntegrityViolationReasons(event)
      .some((reason) => reason.includes('failed evidence')),
    'the old emit path wrote a violation no attempt could ever clear');
    t.end();
  });
});
