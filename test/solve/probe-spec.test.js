import tap from 'tap';

import {
  eventProbeKey,
  metricKindFromProbeSpec,
  stableProbeKey,
} from '../../scripts/solve/probe-spec.js';

tap.test('probe spec identity', async (t) => {
  t.test('stable key ignores object insertion order', (t) => {
    const a = {probe: 'scenario-harness', args: {scenario: 'rr', metric: 'distance'}};
    const b = {probe: 'scenario-harness', args: {metric: 'distance', scenario: 'rr'}};
    t.equal(stableProbeKey(a), stableProbeKey(b));
    t.end();
  });

  t.test('event key falls back to evidence identity', (t) => {
    const event = {
      evidenceIdentity: {
        probe: 'oracle',
        args: {file: 'oracle.json'},
      },
    };
    t.equal(eventProbeKey(event), stableProbeKey({probe: 'oracle', args: {file: 'oracle.json'}}));
    t.end();
  });

  t.test('metric kind is read from probe args', (t) => {
    t.equal(
      metricKindFromProbeSpec({
        probe: 'scenario-harness',
        args: {scenario: 'rr', metric: 'distance'},
      }),
      'distance',
    );
    t.equal(metricKindFromProbeSpec({probe: 'oracle', args: {file: 'o'}}), null);
    t.end();
  });
});
