---
audience: development
documentClass: evidence
---

# RF3 retained-origin setup: diagnostic successor

The exact retained-history candidate `cb822d6fcf8c7b78b34a718772d06488490bc0da`
completed lab #835 on tv-dator. Its complete, hash-bound log reports thirteen
passing files and one failing integration file, with 221 runner-reported TAP
assertions across all fourteen files. The RF1 real committed ENABLE, cold
inspection and replay case passed. RF3 failed its first settled-state setup
assertion after the existing ten-second polling budget. Its ENABLE proposal,
held commit carrier and origin-transition assertions were not reached.

The failure is retained in
`MEASUREMENT-retained-cb822d6f-runtime-failure-2026-10-22.json` and
`RUNTIME-retained-cb822d6f-candidate-failure-2026-10-22.txt`. All execution,
thermal and container scopes are closed. The original npm setup failure #820
and the passing exact-source metadata/static result #821 are also retained.
Neither #820 nor the RF3 setup assertion is a semantic kill of the later
retained-origin transition requirements.

Independent review traced two relevant facts. Configuration entries are kept
as unclassified history but do not by themselves make the participant-origin
observation unavailable. Also, the settled-state witness compares native
ConfState arrays by representation order, while the existing
`raftRsConfStateKey` owner defines identity over the four separate role sets
and autoLeave. That comparison is an unsupported witness overconstraint, but
the failed run did not record the replica values needed to identify which
conjunct failed. Snapshot coverage, native progress and origin observation
remain possible explanations for this particular result.

The next measurement is diagnostic only. The integration witness captures the
views already read by the last evaluation of its unchanged predicate and
includes each replica's native frontiers, hard state, raw configuration,
coverage and origin state/reason in the assertion failure message. It performs
no extra database read, introduces no wait, and changes no acceptance check,
deadline, production byte or later RF1/RF3 assertion. The original
isDeepStrictEqual comparison remains in this diagnostic revision.

Run only the existing two-case integration file through the project runner
using the already reviewed explicit Node22.23.2 setup/execution recipe. A
passing diagnostic rerun alone cannot attribute the earlier failure. Any
correction follows the measured values and independent review; the complete
fourteen-file neighborhood and applicable exact-candidate static checks must
then be measured against the corrected revision. No handoff receipt or seal
changes, main merge, public serving or full-cutover acceptance follows.
