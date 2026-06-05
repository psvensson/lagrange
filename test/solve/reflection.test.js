import tap from 'tap';

import {
  lastReflectionIndex,
  attemptsSinceReflection,
  reflectionDue,
  reflectionPrompt,
} from '../../scripts/solve/reflection.js';
import {
  EVENT_ATTEMPT,
  EVENT_REFLECTION,
  REFLECTION_INTERVAL,
} from '../../scripts/solve/constants.js';

const attempt = () => ({type: EVENT_ATTEMPT, frontier: 'f', progressed: false});
const reflection = () => ({type: EVENT_REFLECTION, frontier: 'f', trigger: 'cadence'});

tap.test('reflection cadence', async (t) => {
  t.test('not due before REFLECTION_INTERVAL attempts have passed', (t) => {
    const log = [];
    for (let i = 0; i < REFLECTION_INTERVAL - 1; i += 1) log.push(attempt());
    t.equal(reflectionDue(log), null, 'cadence has not yet elapsed');
    t.end();
  });

  t.test('due once REFLECTION_INTERVAL attempts have passed', (t) => {
    const log = [];
    for (let i = 0; i < REFLECTION_INTERVAL; i += 1) log.push(attempt());
    t.equal(reflectionDue(log), 'cadence', 'cadence fires at the interval');
    t.end();
  });

  t.test('a recorded reflection resets the cadence', (t) => {
    const log = [];
    for (let i = 0; i < REFLECTION_INTERVAL; i += 1) log.push(attempt());
    log.push(reflection());
    t.equal(reflectionDue(log), null, 'not due immediately after a reflection');
    t.equal(attemptsSinceReflection(log), 0, 'attempt count resets after a reflection');
    log.push(attempt());
    t.equal(attemptsSinceReflection(log), 1, 'counting resumes from the reflection');
    t.end();
  });
});

tap.test('reflection triggers', async (t) => {
  t.test('oscillation forces a reflection immediately', (t) => {
    t.equal(reflectionDue([], {oscillating: true}), 'oscillation', 'oscillation wins on sight');
    t.end();
  });

  t.test('scope pressure forces a reflection immediately', (t) => {
    t.equal(reflectionDue([], {scope: true}), 'scope-pressure', 'scope wins on sight');
    t.end();
  });

  t.test('oscillation takes precedence over scope', (t) => {
    t.equal(reflectionDue([], {oscillating: true, scope: true}), 'oscillation', 'oscillation first');
    t.end();
  });

  t.test('a trigger does not re-fire within the same cycle (no new attempt)', (t) => {
    const log = [attempt(), reflection()];
    t.equal(reflectionDue(log, {oscillating: true}), null,
      'already reflected this cycle: bounded to once per attempt');
    log.push(attempt());
    t.equal(reflectionDue(log, {oscillating: true}), 'oscillation',
      'the next attempt re-opens the reflection window');
    t.end();
  });
});

tap.test('reflection bookkeeping helpers', async (t) => {
  t.test('lastReflectionIndex points at the most recent reflection', (t) => {
    t.equal(lastReflectionIndex([]), -1, 'none recorded');
    const log = [attempt(), reflection(), attempt()];
    t.equal(lastReflectionIndex(log), 1, 'index of the reflection');
    t.end();
  });

  t.test('reflectionPrompt is a non-empty, gate-free instruction naming the quest', (t) => {
    const prompt = reflectionPrompt({id: 'q1'}, {frontier: 'main'}, 'oscillation');
    t.match(prompt, /q1/, 'names the quest');
    t.match(prompt, /main/, 'names the frontier');
    t.match(prompt, /No gate fires/, 'declares it a pure think turn');
    t.end();
  });
});
