# Executed retry-suppression discriminator — diagnostic source never merges

Date: 2026-10-21. This is an additive result record; the earlier preparation
record remains historical and unchanged. The measured source is diagnostic
`e88d94ef5bbeaf5c20759fa66518cbd06b1df94c`, based on production candidate
`393f411ca09449898465cc3cb7320c03fba2aba8`. Only the single post-answer
non-CUT_OVER background retry enqueue was removed. The complete source diff
matches the independently reviewed patch; every test JavaScript file is
byte-identical to the positive candidate. Normal hooks passed without bypass.
The non-main branch was pushed and its exact remote SHA verified before the run.

The canonical lab API selected and locked adam-laptop, used its ordinary lane
with jobs=4, preserved retries=0, and copied the complete terminal ledger. It
honoured the existing thermal hold (77°C to 41°C). The automatic lab factor was
2.0 for this diagnostic, versus 1.9 in the same-host positive. Neither factor
was overridden; this is not an identical-environment timing comparison. The
semantic retry clock and original protocol budget were unchanged. The first
attempt exited 1 after 8,930ms: one file failed, with one case passing and one
case failing. The runner's two reported assertions are two top-level cases,
not a count of every internal assertion. There were no cancelled or skipped
cases, setup error, timeout result, or cleanup error.

The expiry/authorization case passed. The second case failed exactly at
`expectOpenFromExistingRecovery` line 145, called by `proveRetainedRetry`
line 265: “retained recovery retry must reopen the current service after
authority returns”; expected true, actual false. In the frozen sequential
oracle, reaching this call requires the real ENABLE answer to have been
lost only after native origin commit, the original origin to survive intact
service recreation, actual consensus notifications to have been dropped,
the registered recovery route to refuse missing current control, and the
actual control replacement to become leader and reopen. The dependent was
still closed at cadence minus 1ms, with no new dependent inspect or fabricated
wake. Advancing the final 1ms then failed the bounded pure admission check.
The subsequent CUT_OVER report, repeated native write and final origin checks
were not executed in this negative; they passed in the unmutated positive.

The matching positive ledger at the existing seed-release-failure-custody
Quest, evidence/composed-393f411ca, reports this unchanged file PASS, attempt1,
retries0, 7,832ms, within the independently reviewed 32-file/838-reported run.
This paired result demonstrates that the existing post-refusal background
retry is necessary for this engaged schedule. The historical static-rejected
attempt remains a static rejection and is not counted as native evidence.

Limits: intact same-process one-member native recreation and the selected
registered release/recovery interaction only. No cold public bootstrap,
pre-origin permission, partial native loss, cross-host safety, unbounded
liveness, broad performance, Quest landing or release certification is proved.
Only this evidence packet may be integrated into a production branch; the
mutation source must never be merged. Independent result classification and
any applicable composed/landing gates are separate.
