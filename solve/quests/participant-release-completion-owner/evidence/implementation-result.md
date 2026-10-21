---
audience: development
documentClass: current
---

# Bounded completion implementation and measured result

Reviewed source checkpoint: 90fb37194121ea793197d26e845c2d38a9c9efc0.
Normal hooks passed without overrides or baseline changes. The three product
owners delegate seed/fresh CREATE response-to-delay completion to the existing
participant-release client. The original single-attempt/redirect primitive,
receiver authority and existing-origin background queue are unchanged.

Original behavior was measured before repair: fefc75988807f2e89733ebaf2bc3a844d8ca311f
passed the three seed/fresh/cohort files with 14 reported cases. Additive
original-source getter checkpoint 5691a034adcd8b982fbf9c1e9ac1272e06546bdb passed
all seven fresh CREATE cases, including exact outcome-read counts. Both used
locked adams-gamla with retries disabled. The same frozen entry witnesses
passed on the repaired source.

| Repaired file | Runner-reported count |
| --- | ---: |
| seed-participant-release-failure-projection.test.js | 7 |
| seed-release-once-per-cohort.test.js | 1 |
| participant-release-fresh-create-completion.test.js | 7 |
| participant-release-completion-owner.test.js | 12 |
| check-guideline-decision-boundaries.test.js | 96 |
| replica-handler-release-recovery.test.js | 25 |
| participant-release-protocol.test.js | 16 |

The exact seven-file run passed with 164 total runner-reported counts, every
ledger row on attempt one and retriedOnce false. These counts mix the runner's
assertion/case accounting; internal node:assert calls are not independently
counted. The input, controller, result, complete ledger and SHA256 manifest
are in [the repaired packet](repaired-90fb37194/SHA256SUMS).

Twelve declared audit test cases include genuine and adversarial source
correspondence: timing/guard/input changes, spoofed imports, binding writes
and shadows, lexical relocation, returned-method overwrite, copies, extra
callers and nested control routing. The positive includes the legitimate
outer distinct-cohort loop. This is executed static source-mutation rejection,
not a native runtime mutation kill. Existing native protocol/recovery files
supply separate composed component controls; no distributed startup or
retained-store admission result follows.

The canonical full raw decision audit over src and scripts changed from
791 findings/664 identities to 789/662. Only the two actual caller-local retry
identities disappeared, each one to zero. No other identity increased or
decreased; all remaining findings are obligations. The safe complete identity
delta and raw artifact hashes are in [audit-identity-delta.json](audit-identity-delta.json).
Raw reports remain in the execution tree's test-output packet for external
preservation. No allowance or baseline was edited.

Independent review verified the source, all declared categories, exact Git
blobs, packet hashes, unchanged existing regression witnesses and complete
identity delta. Its final measured-result disposition is appended to
[independent-review.md](independent-review.md). Earlier REVISE findings and
attempts remain preserved. The unavailable first audit-support byte artifact
is explicitly documented; its recorded hash is not presented as recovered.

Root composition, applicable change-proof/Quest gates and terminal owner
work remain separate. The receipt remains red. Separate existing-origin
retry-suppression evidence, full startup authority, U1 and release obligations
are unchanged. This result authorizes no main merge or publication.
