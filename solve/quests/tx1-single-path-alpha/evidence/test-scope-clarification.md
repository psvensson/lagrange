# TX1 test-scope clarification

Date: 2026-10-13

This note distinguishes the historical frozen-V3 changed-path cohort from the
current canonical gate obligation.  It records scope only; no additional test
was run.

## Frozen V3

`frozen-v3-change-cone.log` (SHA-256
`d3442759afba5f9e76066e348abee22d365f14054853f9ff7e68a30b3f6d95a1`)
records selector outcome `WIDENED`, `1146 unique test(s)`, with one
`convergence-probe` explicitly observed elsewhere.  The corresponding lab
result `frozen-v3-broad-lab-result.json` (SHA-256
`c067bc95d95223dfe21a9d214fbe2125576516a1f60615a2325c8cb3b7a29990`)
identifies candidate `775504a9792b7b2f21b1cc6d92406c8d1df26d97`, scope
`all changed-path lanes, canonical split on four locked physical lab
machines`, and reports 1146 files: 1054 passed, 92 failed, 35018 assertions.

That run was the explicit changed-path cohort.  It was not a whole-corpus
proof.  At the same candidate, `FULL_CORPUS_TRIGGER_RULES` already classified
`test/shards/impact-contracts.json` as changed selection state, so the
push-gate authority would choose its full-corpus branch even though the lower
selector could describe a bounded WIDENED cone.  The cohort also failed and
therefore cannot support a green proof of either scope.

## Current frozen metadata

Read-only `node scripts/select-change-tests.js --list --explain` against the
canonical publication range refuses modular selection:

```text
selection:
  REFUSED

MODULAR PROOF NOT SAFE
  reason: RELEASE_PROOF_REQUIRED
  change alters the published/shipped surface: Dockerfile
  run: npm run check:release
```

Read-only `node scripts/checks/push-gate-change-proof.js --explain` resolves
the publication merge-base as
`d60c309216ccc86712a26766b83c97b0583ab919`, reports `REFUSED, 32 test(s)
(32 spine, 0 selected)`, and chooses `test stage: full-corpus`.  Its reasons
include the `RELEASE_PROOF_REQUIRED` refusal and changed selection state at
`test/shards/impact-contracts.json` (alongside other branch-range gate-owner
changes).  Thus 32 is the refusal's safety-spine plan, not the required
behavioural corpus.

The current primary-class census contains 2366 files:

- 2060 unit
- 4 packaging
- 97 integration
- 202 bootstrap
- 3 convergence-probe

The full-corpus gate command is `npm run test:all`, which includes unit,
packaging, integration and bootstrap: **2363 gating test files**.  The three
convergence probes are intentionally outside that gating command and are
observed by `npm run test:convergence-probes`.  `npm run check:release` is the
stronger release proof requested by the selector; it runs complete CI
(`test:static`, `model:contracts`, the same 2363-file `test:all`, and the
endpoint-sync chart test) followed by the release hardening tail.

Checkpoint wording must therefore say that frozen V3 measured a failing
1146-file changed-path cohort.  Current canonical acceptance requires the
release/full proof whose behavioural corpus is 2363 files, with the remaining
three classified convergence probes observed separately.  Neither obligation
is satisfied by the historical 1146-file run.
