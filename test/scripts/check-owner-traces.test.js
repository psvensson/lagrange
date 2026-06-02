import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import tap from 'tap';

import {
  collectTraceViolations,
  validateTraceSuite,
} from '../../scripts/check-owner-traces.js';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'owner-trace-test-'));
}

tap.test('owner trace checker accepts repository trace suite', (t) => {
  const result = validateTraceSuite(
    path.resolve('architecture/models/traces/core-owner-trace-examples.json'),
  );
  t.same(result.errors, []);
  t.end();
});

tap.test('owner trace checker detects stale readiness promotion', (t) => {
  const violations = collectTraceViolations({
    events: [
      {
        actor: 'owner',
        action: 'owner_outcome',
        outcome: 'ready',
        evidence: 'authoritative',
        ownerEpoch: 2,
      },
      {actor: 'owner', action: 'serviceable', service: 'sql'},
      {actor: 'owner', action: 'serviceable', service: 'query_transport'},
      {actor: 'owner', action: 'fresh_projection', observedEpoch: 1},
      {actor: 'observer', action: 'readiness_promoted', observedEpoch: 1},
    ],
  });
  t.same(violations, ['stale-projection-never-promotes-readiness']);
  t.end();
});

tap.test('owner trace checker does not accept observer-authored owner evidence', (t) => {
  const violations = collectTraceViolations({
    events: [
      {
        actor: 'observer',
        action: 'owner_outcome',
        outcome: 'ready',
        evidence: 'authoritative',
        ownerEpoch: 1,
      },
      {actor: 'observer', action: 'serviceable', service: 'sql'},
      {actor: 'observer', action: 'serviceable', service: 'query_transport'},
      {actor: 'observer', action: 'fresh_projection', observedEpoch: 1},
      {actor: 'observer', action: 'readiness_promoted', observedEpoch: 1},
    ],
  });
  t.same(violations, [
    'owner-outcome-before-observer',
    'ready-requires-serviceable-canonical-leader',
    'stale-projection-never-promotes-readiness',
  ]);
  t.end();
});

tap.test('owner trace checker rejects valid traces with hidden violations', (t) => {
  const root = tmp();
  const filePath = path.join(root, 'trace-suite.json');
  fs.writeFileSync(filePath, JSON.stringify({
    schema: 'owner-trace-suite-v1',
    id: 'bad-suite',
    owner: 'architecture_owner',
    boundary: 'core_system_logic',
    invariants: [
      {
        id: 'owner-outcome-before-observer',
        statement: 'owner outcome before observer',
      },
    ],
    validTraces: [
      {
        id: 'bad-valid-trace',
        events: [
          {actor: 'observer', action: 'projection'},
        ],
      },
    ],
    forbiddenTraces: [
      {
        id: 'known-bad',
        expectedViolations: ['owner-outcome-before-observer'],
        events: [
          {actor: 'observer', action: 'projection'},
        ],
      },
    ],
  }, null, 2));

  const result = validateTraceSuite(filePath);
  t.match(
    result.errors.join('\n'),
    /validTraces\[0\] violates owner-outcome-before-observer/u,
  );
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});
