# Attempt 5 baseline comparison

Compared the replacement working tree with a detached worktree at
`0527723bde04267c6a845be4f1ef263849bfbf81`.

## Rebalancer regression suites

| Test | Replacement | Baseline |
| --- | --- | --- |
| `rebalance-coordinator-stopping-reconcile-source-removal.test.js` | 21/21 pass | not rerun; this was the attempt-4 regression and is green after restoring the non-runtime fallback |
| `rebalance-coordinator-timeout-cache-visibility.test.js` | 155 pass, 14 fail | 155 pass, 14 fail, with the same eight failing test cases |
| `replace-replica-workflow.test.js` | 174 pass, 63 fail | 174 pass, 63 fail |

The broad timeout and REPLACE failures are therefore unchanged branch-baseline
debt rather than replacement regressions.

## Static unused-export ratchet

`npm run test:unused:ratchet` reports 1,644 unused exports in both the
replacement worktree and detached baseline, against the repository baseline of
1,628. The replacement queue helper exports only its consumed facade builder;
none of the replacement source files appears in the unused-export report.

## Replacement-specific gates

- Focused owner/dispatch/repository surface: 8/8 files, 865 assertions pass.
- Target-progress, non-runtime fallback, and generic queue smoke: 3/3 files,
  173 assertions pass.
- ESLint, diff check, file-size ratchet, literal audit, decision-boundary
  audit, runtime-grammar audit, and model contracts pass.
- Behavioral DT is green/fix, red/revert, green/restore:
  `solve/changes/dt-prove/replica-dispatch-runtime-target-progress-wake.test.js-2026-07-20T01-32-19-847Z.json`.
