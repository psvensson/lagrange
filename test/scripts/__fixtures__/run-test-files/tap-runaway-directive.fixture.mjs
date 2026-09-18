// A passing TAP line whose description runs past the analysis bound and
// carries its directive AFTER it: cut the line and the skip disappears, so
// the file reads as a plain pass. The runner must fail a file whose output it
// could not analyse whole rather than report a verdict it cannot stand behind
// (runner-output-bound, verifier round 2).
const RUNAWAY_BYTES = 1536 * 1024;

process.stdout.write('TAP version 13\n1..1\n');
process.stdout.write(`ok 1 - ${'d'.repeat(RUNAWAY_BYTES)} # SKIP a directive past the bound\n`);
