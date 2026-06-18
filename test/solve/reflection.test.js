import tap from 'tap';

import {
  lastReflectionIndex,
  attemptsSinceReflection,
  lastAltitudeReflectionIndex,
  attemptsSinceAltitudeReflection,
  reflectionDue,
  altitudeReflectionDue,
  reflectionPrompt,
  altitudeReflectionPrompt,
} from '../../scripts/solve/reflection.js';
import {
  EVENT_ATTEMPT,
  EVENT_REFLECTION,
  REFLECTION_INTERVAL,
  ALTITUDE_REFLECTION_INTERVAL,
} from '../../scripts/solve/constants.js';

const attempt = () => ({type: EVENT_ATTEMPT, frontier: 'f', progressed: false});
const reflection = () => ({type: EVENT_REFLECTION, frontier: 'f', trigger: 'cadence', kind: 'micro'});
const altitudeReflection = () =>
  ({type: EVENT_REFLECTION, frontier: 'f', trigger: 'altitude-cadence', kind: 'altitude'});

tap.test('micro reflection cadence', async (t) => {
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

  t.test('scope pressure forces a micro reflection immediately', (t) => {
    t.equal(reflectionDue([], {scope: true}), 'scope-pressure', 'scope wins on sight');
    t.end();
  });

  t.test('oscillation is NOT a micro trigger (it routes to altitude)', (t) => {
    t.equal(reflectionDue([], {oscillating: true}), null,
      'oscillation no longer fires the micro reflection');
    t.end();
  });
});

tap.test('altitude reflection triggers', async (t) => {
  t.test('oscillation forces an altitude reflection immediately', (t) => {
    t.equal(altitudeReflectionDue([], {oscillating: true}), 'oscillation',
      'a bouncing coupling means the frame is suspect');
    t.end();
  });

  t.test('coarse cadence fires once ALTITUDE_REFLECTION_INTERVAL attempts have passed', (t) => {
    const log = [];
    for (let i = 0; i < ALTITUDE_REFLECTION_INTERVAL - 1; i += 1) log.push(attempt());
    t.equal(altitudeReflectionDue(log), null, 'coarse cadence has not yet elapsed');
    log.push(attempt());
    t.equal(altitudeReflectionDue(log), 'altitude-cadence', 'coarse cadence fires at the interval');
    t.end();
  });

  t.test('the altitude cadence counts only altitude reflections', (t) => {
    const log = [];
    for (let i = 0; i < ALTITUDE_REFLECTION_INTERVAL; i += 1) log.push(attempt());
    // A micro reflection resets the micro cadence but NOT the altitude cadence.
    log.push(reflection());
    t.equal(attemptsSinceAltitudeReflection(log), ALTITUDE_REFLECTION_INTERVAL,
      'a micro reflection does not reset the altitude cadence');
    log.push(attempt());
    t.equal(altitudeReflectionDue(log), 'altitude-cadence',
      'still due: only an altitude reflection resets it');
    // An altitude reflection does reset it.
    log.push(altitudeReflection());
    t.equal(attemptsSinceAltitudeReflection(log), 0, 'altitude reflection resets the count');
    t.equal(altitudeReflectionDue(log), null, 'not due immediately after an altitude reflection');
    t.end();
  });

  t.test('a trigger does not re-fire within the same cycle (no new attempt)', (t) => {
    const log = [attempt(), altitudeReflection()];
    t.equal(altitudeReflectionDue(log, {oscillating: true}), null,
      'already reflected this cycle: bounded to once per attempt');
    log.push(attempt());
    t.equal(altitudeReflectionDue(log, {oscillating: true}), 'oscillation',
      'the next attempt re-opens the reflection window');
    t.end();
  });
});

tap.test('reflection bookkeeping helpers', async (t) => {
  t.test('lastReflectionIndex points at the most recent reflection of any kind', (t) => {
    t.equal(lastReflectionIndex([]), -1, 'none recorded');
    const log = [attempt(), reflection(), attempt()];
    t.equal(lastReflectionIndex(log), 1, 'index of the reflection');
    t.end();
  });

  t.test('lastAltitudeReflectionIndex ignores micro reflections', (t) => {
    t.equal(lastAltitudeReflectionIndex([]), -1, 'none recorded');
    const log = [attempt(), reflection(), altitudeReflection(), attempt(), reflection()];
    t.equal(lastAltitudeReflectionIndex(log), 2, 'index of the altitude reflection, not the later micro one');
    t.end();
  });

  t.test('reflectionPrompt is a non-empty, gate-free instruction naming the quest', (t) => {
    const prompt = reflectionPrompt({id: 'q1'}, {frontier: 'main'}, 'oscillation');
    t.match(prompt, /q1/, 'names the quest');
    t.match(prompt, /main/, 'names the frontier');
    t.match(prompt, /No gate fires/, 'declares it a pure think turn');
    t.end();
  });

  t.test('altitudeReflectionPrompt questions the frame and demands durable capture', (t) => {
    const prompt = altitudeReflectionPrompt({id: 'q2'}, {frontier: 'main'}, 'oscillation');
    t.match(prompt, /q2/, 'names the quest');
    t.match(prompt, /ALTITUDE/, 'asks about altitude');
    t.match(prompt, /EXHAUST and pivot/, 'names the pivot outcome');
    t.match(prompt, /finding|epic|system theory/, 'demands durable capture');
    t.match(prompt, /No gate fires/, 'declares it a pure think turn');
    t.end();
  });
});
