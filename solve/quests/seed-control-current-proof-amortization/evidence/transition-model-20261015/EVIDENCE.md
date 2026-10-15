# Transition-model evidence (2026-10-15)

Design head this evidence was measured against: the review branch head
committing this directory, whose parent is the published revision-2 design
`3db821fa7c12bbf05f1d878b9da6af5147417b64`. See `runner-output.txt` for the
exact per-scenario result lines and `summary.json` for machine-readable
results.

Exact commands (run from the review worktree root):

```sh
node scripts/checks/participant-release-committed-disposition-transition-model.js \
  --evidence-dir solve/quests/seed-control-current-proof-amortization/evidence/transition-model-20261015
# exit 0; per-scenario lines preserved in runner-output.txt

npx eslint test/model/participant-release-disposition/model.js \
  scripts/checks/participant-release-committed-disposition-transition-model.js
# exit 0
```

Files:

- `runner-output.txt` - console result of the run above.
- `rev2-counterevidence.json` - red traces against the published revision-2
  T rows, executed exactly as published: the retained counterexamples for
  review items A-G with their trace tails.
- `rev3-correction-evidence.json` - the same schedules under the corrected
  transition-table rules: zero violations, every named positive claim
  recorded with its observed values.
- `summary.json` - both result sets plus the stated exploration bounds.

Bounds: fixed finite schedules (7 scenarios, 2 rules, 1-8 committed entries
each, two replicas, apply events equal to committed entries). No exhaustive
interleaving, no unbounded model checking, no liveness or timing property is
claimed. The corresponding model is
`test/model/participant-release-disposition/model.js`.
