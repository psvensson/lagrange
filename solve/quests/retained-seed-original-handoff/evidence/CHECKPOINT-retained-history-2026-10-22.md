# Retained native history and participant origin checkpoint

## Current disposition

The bounded implementation is complete and independently source-reviewed.
Candidate runtime verification is pending: the two existing lab requests have
no controller admission or terminal receipts as of 2026-10-22 15:38:51 UTC.
This is a WIP preservation checkpoint, not a completed startup handoff,
Quest landing, main merge or publication approval.

| Binding | Identity |
| --- | --- |
| Preserved candidate | `cb822d6fcf8c7b78b34a718772d06488490bc0da` |
| Candidate branch | `work/original-handoff-boundaries-20261021-cloud` |
| Separate proof-record branch | `work/original-retained-proof-records-20261022` |
| Parent and measured baseline | `79fa766ed290c5545cf4017ee589b86e440e0e47` |
| Repository tree | `3b3a2471e9670fac863b2a380a998c2dc2cf1c29` |
| Production tree | `d2ce2fdae880c6b2ec9c78fbcc03f164ec3213ba` |
| Test tree | `fc2296064ae7a02826a8c249054dab01a98f473e` |
| Reviewed 14-file content manifest | `1779af01d1910bc34d49a6a707846e23128be9b26dd686adf3fb62a75c8163e3` |

The candidate branch must retain this exact target while requests #820/#821
await admission. Additional proof records can be preserved on a separate
evidence branch without moving the requested source ref. Source and test bytes
have not changed since independent approval.

## Implemented owner interaction

The existing native durable-store owner now exposes a read-only retained
history observation. It validates raw SQLite values before normalization can
erase malformed representations. It checks required rows, exact integer
positions, applied/commit/last ordering, suffix continuity, term relationships,
configuration representation, canonical base64 and the existing proposal
decoder. Positions remain exact decimal strings and BigInts. The result is a
deeply frozen view from one synchronous read snapshot, with applied,
committed-pending and locally uncommitted ranges kept distinct.

Original preparation consumes that owner observation before application
inspection and again at final native construction. It requires the declared
founder configuration. Snapshot coverage and retained configuration commands
remain unavailable for original admission; this unit does not manufacture
application permission from native validity.

The participant store observes its generation row and native history in one
owned read transaction. The existing command-byte owner recognizes canonical
retained generation-origin commands using the original producer fields and
stamp. A null applied-origin row is no longer treated as sufficient evidence
of pre-origin history: the result distinguishes pre-origin, locally pending,
committed-pending, applied, unavailable and contrary states. A recorded origin
must match the first applied canonical origin's exact index and term.
Legitimate repeats retain that first origin and the current generation.

Observation performs no DDL, schema repair, proposal, replay, apply, write or
generation reset. Other SQL, transaction and message-group commands remain
explicitly unclassified. It creates no admission capability, safe-history
boolean, cached approval or competing durable ledger. Startup still returns
`CLASSIFICATION_UNAVAILABLE` for the unfinished complete classification.

The seven production files and both registered interactions are bound in
[review Entries 4 and 5](REVIEW-retained-history-2026-10-22.md). Their complete
file hashes, category dispositions and import-direction review are retained
there. The runtime contract and impact metadata name the two interactions:
native observation into original preparation, and native observation into
participant-origin correspondence.

## Measured baseline and unchanged witnesses

[Lab #814](https://github.com/psvensson/lagrange-lab/issues/814#issuecomment-6343537626)
ran the test-only baseline at exact `79fa766e` on tv-dator. Its runner reported
24 tests: 12 pass and 12 fail, with zero cancellations, skips or todos. Eleven
engaged negative leaves failed with `Missing expected exception`; the twelfth
failure is their parent. The missing-applied-row negative already passed, as
did the coherent applied=1/commit=2/last=3 control and nine existing cases.
These are acceptance-gap failures, not setup, import or timeout failures.

The negative bodies' later callback-count and custody assertions were not
reached after their baseline exception assertions failed. Those assertions
must execute on the candidate before the repair is called runtime-proven.

The complete 19,425-byte failed log is retained as
[RUNTIME-retained-baseline-79fa766e-2026-10-22.txt](RUNTIME-retained-baseline-79fa766e-2026-10-22.txt),
SHA-256 `7b62dbbf0a0a45c26244eb281da920f5dcbfe233d3204bd1eeaa0c17b942a2e4`.
Read-only export #815 and evidence #816 recovered those exact bytes without
rerunning the tests. All baseline and export execution, thermal and container
scopes are closed. Exact receipts and interpretation are in
[MEASUREMENT-retained-baseline-2026-10-22.json](MEASUREMENT-retained-baseline-2026-10-22.json).

The 12,401-byte cold-inspection witness is unchanged from that baseline:
SHA-256 `a1f4d8ee7f4fb5e457195d383c28512be0c23f4e74684b8e0b07caacc346fe3d`.
The new witnesses cover raw native corruption, coherent pending ranges,
snapshot limits, participant correspondence, repeated origins, unclassified
effects and final-opening rechecks. The RF1/RF3 integration witnesses use actual
ENABLE production, native persistence and application faults to observe
pending states and replay. Their design is independently approved; their
candidate runtime success has not yet been observed.

## Static evidence and its limits

The normal staged precommit was run before WIP preservation. It finished with
exit 1 and one counted refusing gate: three decision-boundary findings in the
unchanged `canonicalDecisionRecord` and `buildDecisionRecord` functions.
Detached baseline scanning and complete function-byte comparison independently
attribute all three to inherited source. No baseline was raised and no finding
was waived. The existing preparation complexity 28 is report-only in the
unchanged hook. Full output and attribution are retained in
[STATIC-retained-candidate-precommit-2026-10-22.txt](STATIC-retained-candidate-precommit-2026-10-22.txt)
and [STATIC-retained-inherited-byte-decisions-2026-10-22.json](STATIC-retained-inherited-byte-decisions-2026-10-22.json).

Canonical inventories and all generated test metadata were regenerated by the
normal hook. The shard audit passes 2,440 classifications; impact contracts
pass 69 contracts and 42 coupled pairs. The documented non-main WIP route was
used only after preserving the actual refusing hook result.

While lab intake remained unobserved, an isolated detached checkout of exact
`cb822d6f` ran the read-only fast-static command with explicit base `1262e9c9`.
All 14 listed checks passed, including dependency boundaries, shard metadata,
lint for 12 changed JavaScript files and scoped metrics. Exit was zero and the
tracked checkout remained unchanged. The run used Node v24.19.0 and a declared
symlink to the existing dependency installation; it was not a fresh lab
`npm ci` run. Full output and environment are in
[MEASUREMENT-retained-cb822d6f-local-static-2026-10-22.json](MEASUREMENT-retained-cb822d6f-local-static-2026-10-22.json).

Fast-static does not include the source decision-boundary scanner that refused
the normal hook. Its pass therefore does not clear that separate RED or provide
whole-corpus, landing or release clearance. No runtime tests were run locally.

## Pending lab requests and submission correction

| Request | Exact identity | Intended evidence |
| --- | --- | --- |
| [#820](https://github.com/psvensson/lagrange-lab/issues/820) | `1c795ef8bfa44d4ba1a835ba150467bd` | Fourteen-file runtime neighborhood at cb822d6f |
| [#821](https://github.com/psvensson/lagrange-lab/issues/821) | `48e77e2c48ca4c90a242a431bbc91d35` | Fresh setup, shard audit, explicit-base fast-static and tracked-tree check at cb822d6f |

Both requests expire at 2026-10-22 17:28:18.350 UTC. The exact selections,
source and static delivery are retained in
[REQUEST-retained-candidate-cb822d6f-2026-10-22.json](REQUEST-retained-candidate-cb822d6f-2026-10-22.json).

Root initially wrapped the issue bodies and static delivery comment in
Markdown JSON fences. The installed controller parses complete bodies directly
as JSON; those initial bodies were inadmissible. Root corrected the existing
issue bodies and existing comment 6344551273 in place at 15:34 UTC, preserving
request IDs, intended content, source and expiry. Both root and the independent
lab observer verified direct JSON parsing and exact static payload integrity.
This submission error is retained separately from candidate test results in
[REQUEST-retained-format-correction-2026-10-22.json](REQUEST-retained-format-correction-2026-10-22.json).

After correction, neither request had an admission receipt. An earlier plain
JSON nonexecuting ping #819 also had no receipt. The
[lab operator record](https://github.com/psvensson/lagrange-lab/issues/657#issuecomment-6344538276)
identifies the missing observation as the controller account's
`lagrange-lab-bridge.service` status and recent user journal. Connected tools do
not expose a direct controller shell. Silence does not establish service
failure, rate exhaustion, worker capacity, queue state or execution state.
No blind reinstall, restart, duplicate execution request or new ping was made.

Root retains ownership of #820/#821; lab_lane observes read-only. Candidate
execution, thermal and container scopes are unobserved, so none is claimed
closed. Once intake is restored, inspect these existing request identities
before any successor request, particularly if their expiry has passed.

## Completion work and later dependencies

To finish this bounded unit, collect the original requests' terminal receipts,
verify source and actual host, retain complete logs with receipt hashes, inspect
every new assertion and exact selected/completed file and runner counts, and
obtain independent result review. Any candidate failure must remain in the
evidence chain and be resolved in its existing owner interaction. The focused
fourteen-file selection is not a whole-corpus gate; the source selector's
raft-wide escalation remains a later landing obligation.

Full retained SQL/MG effect classification, snapshot/application correspondence,
cold membership plumbing, protected activation through leader acknowledgment
and durable transfer, public admission exclusions, and the composed original
two-start proof remain unfinished. All eight handoff receipts and the original
seal remain unchanged. No source from this checkpoint has been merged to main.
