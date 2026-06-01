import tap from 'tap';

import {rungName, rungPrompt} from '../../scripts/solve/ladder.js';
import {
  RUNG_LOCAL_FIX,
  RUNG_MODEL,
  RUNG_PARK,
  PARK_RUNG_INDEX,
} from '../../scripts/solve/constants.js';

const TASK = {
  quest: {statement: 'Pass the demo scenario.'},
  frontierDef: {id: 'demo-main'},
  metricName: 'priority',
  rungIndex: 0,
  metricHistory: [4, 3, 3],
};

tap.test('ladder dossier (P2)', async (t) => {
  t.test('rungName maps index to ladder rung and clamps to park', (t) => {
    t.equal(rungName(0), RUNG_LOCAL_FIX);
    t.equal(rungName(2), RUNG_MODEL);
    t.equal(rungName(PARK_RUNG_INDEX), RUNG_PARK);
    t.equal(rungName(99), RUNG_PARK, 'out-of-range clamps to park');
    t.end();
  });

  t.test('prompt carries quest, frontier, rung and metric history', (t) => {
    const out = rungPrompt(TASK);
    t.match(out, /Goal: Pass the demo scenario/);
    t.match(out, /Frontier: demo-main/);
    t.match(out, /Rung 0 \(local-fix\)/);
    t.match(out, /4 -> 3 -> 3/, 'shows the metric history');
    t.end();
  });

  t.test('prompt replays prior findings and ruled-out approaches', (t) => {
    const out = rungPrompt({
      ...TASK,
      findings: [
        {claim: 'model proves layer L keeps liveness', evidence: 'tla:L.cfg'},
        {claim: 'retry-on-timeout does not converge', rulesOut: 'retry-on-timeout'},
      ],
    });
    t.match(out, /Known findings/, 'has a findings section');
    t.match(out, /model proves layer L keeps liveness/);
    t.match(out, /rules out: retry-on-timeout/, 'surfaces the dead end');
    t.end();
  });

  t.test('no findings => no findings section', (t) => {
    t.notMatch(rungPrompt(TASK), /Known findings/);
    t.end();
  });
});
