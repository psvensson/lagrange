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

## Change Proof And Full-Suite Checkpoints

`npm test` runs the change-proof orchestrator, not the complete suite. Use
`npm run check:release` at the full-suite checkpoints required by the
[harness owner](guidelines/harness.md#what-the-four-commands-prove). Analyze the
original output before repeating a run; a retry never replaces its first failure.

For a change-proof invocation, retain a unique result directory and the command's
actual status. Record relevant configuration and runner identity with this result:

```bash
(
  mkdir -p test-output/manual
  run_dir=$(mktemp -d test-output/manual/run.XXXXXX) || exit 1
  git rev-parse HEAD > "$run_dir/source.txt"
  printf '%s\n' 'npm test' > "$run_dir/command.txt"
  if npm test > "$run_dir/output.log" 2>&1; then
    test_status=0
  else
    test_status=$?
  fi
  printf '%s\n' "$test_status" > "$run_dir/exit-status.txt"
  tail -50 "$run_dir/output.log"
  printf 'Original output: %s/output.log\n' "$run_dir"
  exit "$test_status"
)
```

The tail is a diagnostic view, not the complete evidence. Retain the original
output through the existing evidence owner before cleaning the workspace.

## Output Handling

- Avoid overly verbose output when a smaller targeted run can answer the
  question.
- Save broad-run output to a file and inspect the file instead of rerunning.
- Summarize the relevant failures instead of pasting large raw logs into specs
  or review notes.

## Example Commands

Targeted runs use `npm run test:file -- <explicit-file-paths>`, the classified
runner that owns execution placement and resource policy and fails closed on
empty TAP streams, skips and todos. Raw `npx tap` does not carry those same
guarantees. Do not pass file or filter arguments to `npm test`: the change-proof
orchestrator does not use them to select a targeted file run.

```bash
npm run test:file -- test/scripts/check-file-size-thresholds.test.js
npm run test:file -- test/solve/guards.test.js test/solve/commands.test.js
```
