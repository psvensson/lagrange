# Production V2 and controls V4 preservation checkpoint

This is a non-main WIP preservation checkpoint. Production V2 is under independent content review and already has concrete revision findings; it is not an approved candidate. Controls V4 are frozen and awaiting independent content review. No candidate behavior has run, no Quest has landed, and all five acceptance receipts remain false.

## Exact immutable inputs

- Source V2: `be8a54cbbd270501c50ac573c54f251dd9e4f35c`, tree `f00be5e95926dc152e0862965a41d673a6702dad`, source tree `1382406d83de3e9ebcde92b9d2ccb7266e8d6538`. Remote `continue/rs-raft-applied-position-source-v2-20261014` verified at this SHA. Snapshot `/tmp/session-worktree-7wUvpP/tree`; use committed bytes, since unrelated copied root evidence remains uncommitted there.
- Controls V4: `ce69f3acb911a8f648c01f96b17334478ab9f511`, tree `f909eb57aa4846882138266639962b9ce59f3c21`. Remote `continue/rs-raft-applied-position-controls-v4-20261014` verified at this SHA. Snapshot `/tmp/session-worktree-y7BULy/tree`; test-only input on older source, not a qualified behavior negative.
- Native V10 source control: `c12840725e12c87855b2942566313ecee37bc487`; exact qualified same-host red and independent assessment remain in the preceding `ef99b5fc4519079774348b479e8b5d94f14cb058` checkpoint. The premature result had 9942 ms left; it was not a timeout/setup failure.

## Retained evidence

`evidence/applied-position-production-v2` retains the exact whole source and correction patches, 17-path source/impact manifest, actual static outputs, canonical metadata input, and custody manifest `1164eaf4d13e0a5de63261274697218fd2c63a5d4f7bbed8c446e254b1e6a6c4`.

`evidence/control-batch-v4/frozen-content-v4` retains the exact three-file patch and static outputs under custody `acc1f02929bb43403f77a5fd0c1d36dd0165888534e2632dea4de1a607af5480`. Source-only content review and behavioral testing remain separate requirements. The isolated controls worktree still owns its three dirty paths; they have not been integrated here.

`evidence/applied-position-production-v2/static-attribution` proves 16 introduced literal-owner violations (O10, R5, lifecycle1). The unused-export ratchet is identically 1449 against 1416 on predecessor, V1 and V2: attributable increase zero. Neither inherited debt nor new debt is waived. V2 static logs that were emitted in an older ignored output directory were retained under distinct V2 paths; committed V1 evidence was not rewritten.

`evidence/shared-ingress-source-v1` retains the canonical source baselines: membership and leadership transfer pass four assertions on tv-dator; the old handler fixture on lenovo stops unfinished after CREATE initiates, with 84 queued children unexecuted. That is not positive coverage for REMOVE or the remaining dispatcher. Missing real fixture dependencies are a recorded theory, not proven causal closure.

## Work still open

The complete immutable source review must consolidate the post-await consumption fence, monotonic applied-progress handling, missing nested-record guards, mutable array operations, explicit budget ceiling, and introduced literal-owner debt before one bounded correction batch. Preserve the timer terminalization, fixed resource custody, ordinary facts policy, and canonical final census/query-proof/control-owner/RESUME sequence.

Frozen V4 controls need complete independent content review and any required same-owner falsifiers. Final query preservation remains on hold until the source action and final controls are reviewed. Its delivery gate is extracted from the protocol control, not the native witness. Final fixture composition invalidates older transitive-fixture proof; regenerate the canonical helper cone and exact paired lab inputs.

Next behavior work is canonical locked native candidate/source pairing, retained-dirty treatment, focused protocol/recovery controls, the final query witness, same-host startup checks at unchanged bounds, and the full helper/static/corpus gates. Existing startup exhausted deadlines remain system bugs. The broader FreshMG, TX1/TX2, snapshot provenance, CDC, zero-Liferaft runtime and exact-main certification gates remain open.

Latest usage telemetry at preparation: 17 percent remaining. Below five percent, freeze implementation, commit and WIP-push all owned worktrees and evidence, verify remote SHAs, and write the final exact handover. Do not treat this preservation checkpoint as completion.
