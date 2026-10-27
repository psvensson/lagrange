# Lab stopped status — 2026-10-18

The lab agent is stopped. No successful issue creation was confirmed by that agent. No runner or returned asynchronous cell ID remains. Root's set-B #192 is COMPLETE FAIL at04:55:08Z. No next set-B job was submitted.

## First stage replacement is SUBMISSION_UNCERTAIN

The last attempted agent action was github_create_issue for `[lab-job] c057e0b45fd2f2f4017b88425f18ec83`, replacement for #173, host tv-dator, source381750de29af647d446b19adedf1da53eb712093 on refs/heads/probe/rs-raft-stage1c-381750de2-20261017. The exact body is saved in the manifest; canonical digest0435b239a934ff707fba4226b6e4895d5dc61715a7068e705c76870b56845d93.

A retry create call was interrupted after approximately579seconds without returning an issue ID or cell ID. Its immediately preceding exact-ID search returned zero, which does not prove absence after the interrupted mutation. Root's subsequent latest-five issue collection still ended at#192, but submission must remain uncertain until the original ID and current controller/issue state are inspected. Do not blindly retry.

The other three replacements were NEVER SUBMITTED: b40ecd8f1348c2eb6c36633dc2b38fce (#174),44b6ff22c17482e8f60fbf2d494dfbf9 (#175),b86c2ddf52983d5bc883d22edbb8392d (#176). All four immutable bodies expire08:45:10UTC on2026-10-18.

The older attempted ping641dfaf05361a98c6fe3867cc68aab1f had no successful returned issue. Searches after that interruption returned no issue; it was not retried. The real verified ping#188 is preserved separately and is only its timestamped state.

No stage-1c acceptance classification, #177 six-failure signature collection, or #184 first-failure comparison was completed by the lab agent. It changed no controller, host authorization, original request, source file or other project's work.
