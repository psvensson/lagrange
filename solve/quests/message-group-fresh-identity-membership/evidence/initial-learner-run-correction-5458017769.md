# Initial learner run attribution correction

Corrects review 5458017769, comments 4220085990 and 4220086084, of
05a9883ae3ec0e556258bda73d99078ed2faab19. This is an append-only correction;
original logs, embedded canonical upload replies and archived bytes remain
unchanged. Their erroneous descriptive text must not be used as proof.

| Original run | Correct disposition |
| --- | --- |
| 37787377904 | Test-first missing-method red measured. Implementation step stopped on a test-line lint violation; positive unit/cache tests and mutations were NOT executed. No 161-assertion or live-cache pass belongs to this run. |
| 37788383916 | Behavior checks passed, including 161 reported unit assertions and the live-cache case; the unit-file timing check failed at 2,187ms. Mutation/publication steps did not complete. Overall run remains failed. |
| 37789951368 | Corrected isolated closed fixtures; 161 reported assertions, live-cache case, unchanged timing limits, and all three mutation controls passed. This is the successful proof run. |

The generic description written while retaining both failed archives in
37789951368 wrongly attributed the second run's behavioral success to the
first. That same text occurs in the append-only Quest log and in the embedded
canonical evidence reply inside evidence/initial-learner-37789951368.json.
This correction applies to BOTH occurrences, including copies embedded in
outputs; it does not reinterpret or replace the original artifacts. Archive
identity and hashes were unaffected. The PR description's original per-run
failure distinction was correct, but did not excuse this misleading metadata.

The runtime source, tests, measured SHAs and successful-run counts are
unchanged. No independent approval, full replacement, distributed acceptance
or cutover certification follows from this correction.
