import t from 'tap';

const expectedSeconds = Number(process.env.TEST_EXPECTED_TAP_BUDGET_SECONDS);
const MILLISECONDS_PER_SECOND = 1000;

t.equal(process.env.TAP_TIMEOUT, String(expectedSeconds),
  'the canonical runner exports the expected root budget');
t.equal(t.options.timeout, expectedSeconds * MILLISECONDS_PER_SECOND,
  'the real TAP root consumes that budget');
t.end();
