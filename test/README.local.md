# Local Test Procedures

## Document Role

This document holds local testing procedure and command examples that do not
belong in repo-wide steering policy.

Use this file for:

- full-suite execution procedure
- command examples
- local fast-check iteration guidance
- output-handling workflow

## Property-Based Test Iteration Guidance

Property-based tests using `fast-check` should keep iteration counts small
enough to stay inside the normal suite budget.

Project default:

- use `{numRuns: 10}` unless a specific suite documents a stronger reason to use
  a different count

## Full Suite Execution

The full suite can take a long time to run. Use one run per checkpoint and
analyze the saved output instead of rerunning immediately.

Suggested workflow:

```bash
npm test > /tmp/test-output.txt 2>&1
grep "# fail" /tmp/test-output.txt
grep "Error:" /tmp/test-output.txt
tail -50 /tmp/test-output.txt
rm /tmp/test-output.txt
```

## Output Handling

- Avoid overly verbose output when a smaller targeted run can answer the
  question.
- Save broad-run output to a file and inspect the file instead of rerunning.
- Summarize the relevant failures instead of pasting large raw logs into specs
  or review notes.

## Example Commands

Targeted runs use the committed fail-closed runner (`npm run test:file`) or
invoke tap (the suite runner) directly — the two are equivalent for green
runs; the runner additionally fails closed on empty TAP streams, skips, and
todos. Do NOT pass extra arguments to `npm test` — the `test` script is the
full sharded suite and silently ignores them, so `npm test -- <file>` and
`npm test -- --grep ...` run everything while appearing filtered.

```bash
npm run test:file -- test/storage/partition.test.js
npm run test:file -- --filter partition test/storage/*.test.js
npx tap test/storage/partition.test.js
npx tap test/storage/partition.test.js test/storage/table.test.js
```

`--filter <substring>` narrows the provided file list by path substring and
fails closed (nonzero) when nothing matches.
