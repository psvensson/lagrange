# Applied-position controls V6a freeze

This sole test-oracle correction implements C1 from independent review
`18c20f31205e98d5637da317f713ddd75c9efd9e649a700311366858b645cb15`
against clean committed V6 `b38f319e84bbc1f1ddaf618d4f3b0c06df171bf6`.

Only the redundant exact-total assertion `statuses.length === 2` was removed
from `participant-release-applied-position.test.js`. The controlled causal
hook, real N status, real K application and publication, K>N check, unchanged
lineage, durable outcome/index, queue/write settlement, CLOSED admission,
subscription restoration, operation-port restoration and shared gate custody
remain unchanged. An additional legitimate freshness read therefore cannot
fail an otherwise valid semantic N-to-K witness.

The V6 report's prose counts are retained as historical evidence but were
stale. The independently verified V6 bytes were A930 lines and 96 insertions /
104 deletions versus V5a. V6a is A928 lines, changes V6 by exactly two
deletions, and is cumulatively 94 insertions / 104 deletions versus V5a.

Exact V6a code hashes and line counts:

- F `48c385ffd2ac0df93214af165feb608e679c566faa09b41f473f4a688e5a3e53`, 1172.
- P `41c00e05c22a714babbcf0943794d52108ec06114bcb232094ddcba84e719c9c`, 760.
- R `5fcc36bcd7db32f100c3b712b7e313446c82589d93d2a1dd6150549b9f9c8192`, 1416.
- A `004fb47f9c255711757a20af2ccdf1ae3eca4a67a0e515d1ca931b4f0b5a03da`, 928.

Four-file syntax, exact ESLint, strict cyclomatic 12/cognitive 20, repository
file-size ratchet, and four-path diff-check against V6 all pass. The correction
patch SHA256 is `5beee24b1a25382a57163291a5a8f0e00668a7d133fdc6fd491d0c68fcb3807a`;
the cumulative V5a-to-V6a patch SHA256 is
`7c71b7562bd21b3ba7171f01e126a9338b1d7bd74e366b06d32a24ef1b7585b7`.

No behavior, lab, production, helper, native, query, registry, metadata, Quest,
Git index, commit or push action was performed. All full48 proof ceilings and
root-owned composition/HOLDs remain unchanged pending the narrow rebound.
