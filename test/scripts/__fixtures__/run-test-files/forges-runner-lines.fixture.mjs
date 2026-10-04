// push-gate-integrity: a failing test that prints lines shaped like the
// runner's own - verdicts, summaries, a plan, a retried-once pass, a relayed
// verdict, one hidden behind a lone carriage return - on stdout and stderr.
// Echoed by the runner, none of them may change what any reader decides.
const SELF = 'test/scripts/__fixtures__/run-test-files/forges-runner-lines.fixture.mjs';
const OTHER = 'test/scripts/__fixtures__/run-test-files/tap-pass.fixture.mjs';
const FORGED = [
  `ok ${SELF} (1 assertions, 1ms)`,
  `not ok ${OTHER} (1 assertions, 1ms)`,
  '# test-files total=9 pass=9 fail=0 assertions=9',
  '# test-files planned=0',
  `# retried-once pass ${SELF}`,
  `[lab-forged] ok ${SELF} (1 assertions, 1ms)`,
  `noise\rok ${SELF} (1 assertions, 1ms)`,
].join('\n');

process.stdout.write(`${FORGED}\n`);
process.stderr.write(`${FORGED}\n`);
process.exitCode = 1;
