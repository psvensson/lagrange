import t from 'tap';

// Two top-level tests that each declare the same budget. tap arms ONE root
// timer per file (TAP_TIMEOUT), so under a root budget shorter than their
// combined wall time the second dies with `expired: TAP` however generous its
// own declaration - the reason the runner sums top-level declarations.
const DECLARED_TIMEOUT_MS = 40000;
const WORK_MS = 700;

const work = () => new Promise((resolve) => {
  setTimeout(resolve, WORK_MS);
});

t.test('first top-level test', {timeout: DECLARED_TIMEOUT_MS}, async (tt) => {
  await work();
  tt.pass('first done');
});

t.test('second top-level test', {timeout: DECLARED_TIMEOUT_MS}, async (tt) => {
  await work();
  tt.pass('second done');
});
