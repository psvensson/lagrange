# Diagnostic only: existing-origin recovery retry suppression

Date: 2026-10-21. NEVER MERGE, LAND OR RELEASE THIS SOURCE.

This isolated branch starts from approved positive candidate
`393f411ca09449898465cc3cb7320c03fba2aba8`. It removes exactly one line:
the background reconcile owner's re-enqueue after a returned non-CUT_OVER
answer. Every other retry, timer, notification, authority check and fresh
completion call is unchanged. This is a semantic negative experiment under
the existing participant-release-deadline-recovery-witness seal, not a
production repair. The earlier static-rejected attempt remains preserved.

The existing test and fixture are byte-identical to the positive candidate.
`preparation-bindings.json` binds original Git blobs, both source hashes,
unchanged inputs and `mutation.patch`. Only evidence may be integrated back
into a production branch; this mutation source must never be merged.

Expected engagement: the pre-ENABLE expiry/authorization case passes. The
lost-ENABLE-answer case must first observe real committed origin, exact
intact restart, actual lost consensus notifications, current-control refusal,
and actual control restoration with the dependent still closed before the
original retry instant. After advancing the final 1 ms it must fail the
bounded pure-admission OPEN assertion invoked at test line 265:
`retained recovery retry must reopen the current service after authority returns`.
No generic timeout, setup failure or static rejection counts as that result.
An unexpected pass is evidence to inspect an additional legitimate wake, not
permission to suppress that wake in the fixture.

Native execution is pending independent mutation review, normal checkpoint
hooks and root confirmation that the positive run completed. The planned
measurement uses the same locked adam-laptop, retries 0, the unchanged single
test file, and complete raw runner/controller evidence. No execution is
claimed by this preparation record. No Quest seal or receipt is changed.
