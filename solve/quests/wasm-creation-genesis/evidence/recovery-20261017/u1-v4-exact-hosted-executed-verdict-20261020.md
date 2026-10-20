# U1 V4 ordinary retained wake — exact executed owner positive/source-only negative

**2026-10-20. Bounded independent source/oracle observation, not final U1 approval.**

## Claim and exact-byte applicability

The original, unmodified integration oracle is
`test/wasm-service/bound-creation-restart.integration.test.js`,
Git blob **`862f922b065286fcf5dd4f4f8475bbb09a872160`**.
Its ordinary HELD-J-behind-exact-F case (line 1208) first checks:
- foreign identity, unavailable grant and RESOURCE_CLOSED do not enqueue J;
- an exact qualified wake leaves `memo.wakePending` set while F's execution
  gate is held, without mutating F's execution or plan;
- after release, J re-enters its **original** operation exactly once, with
  the original retained journal row and replica still intact.

The production owner tested is
`src/node/runtime-service-bound-creation-route.js`,
Git blob **`0648fb505c1dc47899989ba49eb9056f8703a089`**.
Both these Git blobs are exactly equal to those at frozen integrated candidate
`be25caa5f0c3612feec662d4feaa9ba28f8f34df`.
The temporary selector test `u1-v4-isolated-existing-wake.test.js`
is **not** part of that candidate and is not to be integrated without
normal oracle/metadata review.

## New verification with no local-controller dependency

[Hosted Actions exact paired run 39430564435](https://github.com/psvensson/lagrange/actions/runs/39430564435)
completed **successfully** on 2026-10-20 with two Node 22 Ubuntu runners,
retry=0, pinned detached checkouts and byte-equal selector/oracle.

| Treatment | Checkout SHA | Terminal executor result |
|---|---|---|
| Unmodified production source | `537ae826473f8fa8a20e28d783aa5fe76301ffbd` | 1 selected file PASS / 1 runner assertion, job `118654219111`. The wrapper explicitly demands **exactly one original test PASS**, so an all-skipped result cannot masquerade as green. |
| Source-only wake-bit deletion | `83e2a9679f3ec3e59134b8bb37b323a104d48c8c` | 1 selected file FAIL / 1 runner assertion, job `118654219788`. The wrapper prints original test failure `ORDINARY_J_WAKE_WAS_LOST_BEHIND_F`. Matrix verifies expected semantic RED, not import/setup/timeout. |

Both checkouts use identical wrapper Git blob
`547fa61d739ea420647656ef31807d32e0390c9e`.
The mutant's only source edit removes the `memo.wakePending = true` assignment in
`WAKE_ACTION.MEMO`; the original integration oracle, all other source and
tests are intact. This is an executed discrimination of the actual V4
ordinary memo-wake retention at the same production owner bytes as current U1.

The workflow and raw logs are preserved on isolated
`verify/u1-v4-exact-hosted-20261020`, commit
`1291fc69a2808c2a95d5eb9f7b65d71c5016e3dc`.
This new pair independently resolves the **all-skipped false-positive** seen
when the target test was selected imprecisely. The older hosted Actions
`39405150063` is corroborating earlier evidence; the new run adds the
explicit original-case execution count guard.

## Disposition, scope ceiling, and next gate

**ACCEPT narrowly:** V4 ordinary HELD memo wake is retained by the original
handler owner while exact F owns the gate, and this guarantee is falsifiable
by removal of its retained bit. Do **not** describe this as native storage
retirement, crash/reboot recovery, cross-host permission validation, or
whole-U1 approval. The two additional replacement cases in the original file
were not independently selected by this one-case wrapper; they retain their
prior whole-file test evidence. Keep U1 open for the complete 55-item review,
remaining owner/physical proof ceilings, the 119 pre-existing selected-cone
red files and their attribution, exact final-candidate static/publish
prerequisites, and later U2/activation gates.

This review branch alters no U1 production source or test and does not merge
the deliberately defective mutation branch.
