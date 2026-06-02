# Alloy Models

Alloy models in this directory describe structural architecture constraints:
ownership graphs, observer authority boundaries, handoff relationships, and
forbidden architecture shapes.

They complement, rather than replace, the existing model layers:

- TLA+ checks protocol behavior over time.
- Statecharts check lifecycle reachability and forbidden transitions.
- Decision tables check complete owner decision coverage.
- Alloy checks whether the architecture relation graph can take an invalid
  shape.

Validate with:

```sh
npm run model:alloy
```

The checker validates each `.als` file's `alloy-model` metadata block,
cross-checks invariant references against
`architecture/contracts/invariants.json`, executes Alloy, reads
`receipt.json` for command results, and writes
`test-output/reports/<model>-alloy.model.report.json`.

Expected command polarity:

- `runPredicates` must produce `SAT`; they prove the model admits at least one
  valid architecture shape.
- `forbiddenPredicates` must produce `UNSAT`; they encode bad architecture
  shapes that the model rules must reject.
- `invariantRefs[].assertion` check commands must produce `UNSAT`; Alloy found
  no counterexample within the command scope.

By default the checker auto-fetches the Alloy Linux x64 release into ignored
`tools/alloy-*` paths and verifies the release archive checksum before
extracting it. The repo-managed default binary is checksum-verified before use.
On other platforms set `ALLOY_BIN` to an Alloy 6 executable.
