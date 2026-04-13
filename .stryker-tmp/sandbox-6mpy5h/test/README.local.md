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

```bash
npm test -- test/storage/partition.test.js
npm test -- --grep "should insert"
npm test -- --grep "exact test name"
```
