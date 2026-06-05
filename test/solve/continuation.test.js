import tap from 'tap';

import {
  CONTINUATION_ALLOWED,
  CONTINUATION_BLOCKED_METRIC_PROJECTION,
  CONTINUATION_BLOCKED_MEASUREMENT,
  CONTINUATION_BLOCKED_SCOPE,
  CONTINUATION_BLOCKED_THEORY,
  CONTINUATION_BLOCKED_UNRECORDED_EVIDENCE,
  continuationDisposition,
  continuationFromHealth,
  unrecordedEvidenceContinuation,
} from '../../scripts/solve/continuation.js';
import {DISPOSITION_REROUTE} from '../../scripts/solve/constants.js';

tap.test('continuation gate classification', async (t) => {
  t.test('allows a quiet open frontier', (t) => {
    const result = continuationFromHealth({
      frontier: 'demo-main',
      signals: [],
    });
    t.equal(result.status, CONTINUATION_ALLOWED);
    t.same(result.problems, []);
    t.end();
  });

  t.test('hard projection mismatch outranks theory work', (t) => {
    const result = continuationFromHealth({
      frontier: 'demo-main',
      signals: [
        {type: 'frontier-theory-required', severity: 'medium'},
        {
          type: 'live-probe-diverges-from-projection',
          projectedMetric: 4,
          liveMetric: 7,
          severity: 'high',
        },
      ],
    });
    t.equal(result.status, CONTINUATION_BLOCKED_METRIC_PROJECTION);
    t.match(result.problems.join('\n'), /live frontier metric 7/u);
    t.end();
  });

  t.test('scope terminal is a hard gate', (t) => {
    const result = continuationFromHealth({
      frontier: 'demo-main',
      signals: [
        {type: 'scope-pressure-terminal', mechanism: '61 changed files'},
      ],
    });
    t.equal(result.status, CONTINUATION_BLOCKED_SCOPE);
    t.match(result.problems.join('\n'), /61 changed files/u);
    t.end();
  });

  t.test('theory-required remains a non-terminal continuation status', (t) => {
    const result = continuationFromHealth({
      frontier: 'demo-main',
      signals: [
        {type: 'frontier-theory-required', mechanism: 'demo-main'},
      ],
    });
    t.equal(result.status, CONTINUATION_BLOCKED_THEORY);
    t.end();
  });

  t.test('model-contract evidence blocks when execution requires model evidence', (t) => {
    const passive = continuationFromHealth({
      frontier: 'demo-main',
      signals: [
        {
          type: 'model-contract-evidence-required',
          mechanism: 'npm run model:contracts',
        },
      ],
    });
    t.equal(passive.status, CONTINUATION_ALLOWED,
      'manual begin can still pin a sample before commit-time model evidence');

    const strict = continuationFromHealth({
      frontier: 'demo-main',
      signals: [
        {
          type: 'model-contract-evidence-required',
          mechanism: 'npm run model:contracts',
        },
      ],
    }, {requireModelEvidence: true});
    t.equal(strict.status, CONTINUATION_BLOCKED_THEORY);
    t.match(strict.problems.join('\n'), /model evidence required/u);
    t.end();
  });

  t.test('cannot-measure remains blocked when no open frontier exists', (t) => {
    const result = continuationFromHealth({
      frontier: null,
      questStatus: 'exhausted',
      signals: [
        {type: 'cannot-measure', mechanism: 'demo-main'},
      ],
    });
    t.equal(result.status, CONTINUATION_BLOCKED_MEASUREMENT);
    t.match(result.problems.join('\n'), /cannot-measure/u);
    t.end();
  });
});

tap.test('unrecorded-evidence routes through the graded gate, not a hard throw', async (t) => {
  const continuation = unrecordedEvidenceContinuation({
    frontier: 'demo-main',
    command: 'node scripts/solve.js ingest-evidence --id demo --frontier demo-main ' +
      '--evidence report.json',
  });
  t.equal(continuation.status, CONTINUATION_BLOCKED_UNRECORDED_EVIDENCE);

  const decided = continuationDisposition(continuation, {
    questId: 'demo',
    frontier: 'demo-main',
  });
  t.equal(decided.disposition, DISPOSITION_REROUTE,
    'unrecorded evidence is a recoverable reroute, never a terminal stop');
  t.match(decided.nextCommand, /ingest-evidence/u,
    'the actionable ingest command is surfaced as the next move');
  t.end();
});
