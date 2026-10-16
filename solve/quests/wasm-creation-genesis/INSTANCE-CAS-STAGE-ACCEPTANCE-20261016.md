# Instance selection and resource metadata CAS: accepted for bounded continuation

Author review under the operator's 16 October instruction to use this ChatGPT
session as reviewer between stages. Verdict: ACCEPT the bounded metadata
interaction for continued WIP integration. This is not independent verification,
terminal Quest landing, physical activation, a main merge or release approval.

## Exact source and ownership

Candidate: 588b8803ab6bd27c799e1fa5130fd5fb63dff4e5.
Branch: work/rs-raft-instance-cas-20261016.
Tree: f43115518a897b102278bcd4c95d9019702ff687.
Source subtree: 82ca50fecafcffb0d8410657d6c02782cbc0de38.
Test subtree: 7e597a331d2e69a6990f1f0143cad7af825d0ef2.
Frozen test-only parent: bf3fc96e3ffc859134374fcdff74c76b4593542c.
Base: af976fe9212cd06c062f93ec9dda7c2b3747a148, accepted schema branch / PR128.

ServiceDefinitionsOwner owns selection and resource state in one retained row.
Its private SystemMetadataOwnerBase adapter uses the existing authoritative-read
and gateway/CDC mutation path. UPDATE compares service identity, format and exact
prior canonical state. No local lock arbitrates outcomes and no semantic CAS
loop reconstructs a new request after an unknown answer. A zero-row successful
envelope is not success; one authoritative resolution preserves the original
request's recorded outcome or uncertainty.

The authenticated command owner constructs the complete immutable request but
neither submits it nor certifies external durable caller storage. The existing
service-definition identity formula has one shared owner. Immutable revision
eligibility/configuration comes from the existing catalog owner. Selection,
original winner/loser replay, content conflict, monotonic history exclusion,
nine fixed resource slots, exact ordinal/token handling, and predecessor-aware
metadata grants are implemented. Sixteen decisions and the approved byte limits
bound state; malformed requests and corrupt retained rows are refused.

Historical selection success is not present serving permission. These methods
remain disconnected from ordinary physical CREATE, serving and retirement.

## Review decisions and retained development failures

See INSTANCE-CAS-STAGE-REVIEW-20261016.md for the pre-lab scope and review.
The nine original oracle assertions are unchanged. Two early local attempts
passed their inner assertions but failed the existing runner's diagnostic-line
bound. Their captured failing output remains retained. The evidence formatter
now emits numbered chunks of the same JSON, not less evidence or a larger limit.

Author review required a correction before lab submission: a failed resolution
read after an uncertain submission must return UNKNOWN, with a reason, rather
than appear to be pre-admission UNAVAILABLE. The final companion explicitly
covers that distinction, request mutation, malformed state, forged bindings,
lost replies, immutable command construction and two overlapping row updates.
All final witness bytes were frozen before the physical lab comparisons.

## First completed physical-lab results

All jobs used the existing placement, machine-lock, classification, dependency,
thermal and hardware-calibration owners. Retry was zero; no controller fallback
ran tests. No production deadline, timeout, baseline or thermal policy changed.

| Candidate files | Actual host | Reported assertions | Whole-file milliseconds |
| --- | --- | --- | --- |
| service-instance-creation-cas | lenovo-laptop | 9 pass | 1322 |
| service-instance-selection-admission | lenovo-laptop | 23 pass | 1170 |
| service-install-catalog-owner | lenovo-laptop | 19 pass | 915 |
| service-lifecycle-command-owner | lenovo-laptop | 6 pass | 895 |
| service-instance-table-schema | lenovo-laptop | 6 pass | 1040 |
| service-installation-reconciler | tv-dator | 11 pass | 463 |
| service-install-lifecycle-cli | tv-dator | 11 pass | 636 |
| service-lifecycle-sql-control-surface | tv-dator | 17 pass | 1025 |
| service-lifecycle-pgwire-executor-handoff | tv-dator | 3 pass | 703 |
| request-binding-service-definition-owner | tv-dator | 13 pass | 1225 |

Candidate total: ten distinct files, 118 reported assertions, no failed files.
This is not 118 distributed scenarios. The new metadata fixture uses real SQLite
and existing owners/CDC mutation construction, with authoritative reads adapted
to one in-memory component database. These separate-host test runs are not a
physical multi-host Raft/quorum or crash-durability certification.

## Source-only falsifier, same frozen tests

Proof-only branch: proof/rs-raft-instance-cas-no-state-predicate-20261016.
Mutation: c4f889f8e6dd4bd687f205cd608319055534a67d, parent is the candidate.
Only the prior-state comparison in service-instance-metadata.js was removed.
No other source, test, classification or dependency bytes changed.

On the same physical Lenovo host, the companion gave 21 pass / 2 fail:
- Selection overtook an in-flight grant. The broken source reported PUBLISHED
  where the unchanged witness required STALE_BINDING.
- Another resource update overtook a close. The broken source reported CLOSED
  where the unchanged witness required STATE_CHANGED.

Those are engaged semantic ordering failures, not import, setup or timeout
failures. The original nine-case file also failed (8 pass / 1 fail); its terminal
summary is retained, but that additional failure is not separately credited as
a classified causal witness here. Combined mutation totals are 29 pass / 3 fail,
32 reported assertions, two failed files. The product branch was never changed
into this intentionally incorrect source. No negative job was retried for green.

Lenovo candidate calibration was 2.3; mutation calibration was 2.2. TV was 1.5.
The calibration policy is unchanged, not the measured scheduling factor. No
speedup or identical scheduling claim follows. Lenovo thermal checks passed but
NVMe was unmeasured. TV observed CPU 60 C and NVMe 46 C for the neighbor run.

## Request, evidence and publication bindings

Candidate request 326352df21484097a301a2c565926709, COMPLETE 13:53:03Z, exit 0.
Request digest: 76c19602ca192cf39f82159105f4ba87979e4212089b6739e4ee169e54f8c1c4.
Executor log: 1823 bytes, SHA256
53a945e1b191f6ed9733c72fe70050e190e6b49f10f113cd26af18137918e8af.

Neighbor request 4896e8d56d23461484f85e3b50d9e7a6, COMPLETE 13:56:33Z, exit 0.
Request digest: 28bf556e2fb82abebdf6aa747d2b0b919706756b613e24c2fdf58ba7645f6247.
Executor log: 1505 bytes, SHA256
4d011828d1aabac9665ca61ecf7db9853c5ce509d5a836b2ee858d1b7ab9324e.
Both complete returned positive logs were copied and rehashed in the cloud;
lengths and digests exactly match their controller-reported raw-log identities.

Mutation request 94640ae002874f0e8f9aae257c2a5a82, COMPLETE 13:54:40Z, exit 1.
Request digest: 1d0275bfaf69a0f6b7b3e3cdb95723ad21bf0350a08c98e99114197651eff25e.
Executor log: 145821 bytes, SHA256
1e4d18b5b64da12361dc40d1afda939bf843c921f2057417ea49942fa8e27608.
The returned tail plus bounded ranges [0,8000), [8000,16000) and [144321,145821)
were read, including both named companion failures and both terminal summaries.
The complete mutation raw log and native artifacts were not exported. Redacted
chunks are not falsely claimed to hash as the raw stream. Full raw evidence
remains with the existing local executor. All source and evidence jobs in this
checkpoint have terminal results; the last evidence read completed 14:01:51Z.

Publication-only run 38910961023, artifact 12049882986, ZIP SHA256
eecbaf854a03c8099c8b26b05e56d1ca33d4a6bd6ed67019183db29a13be8abb.
The downloaded manifest members, test/source patches, eighteen postimages,
source/test subtree identities and raw remote commits were verified. The carrier
used real remote ancestry and a normal non-force update. Two single-character
transport insertions were corrected only after both uploaded and intended blob
identities were verified; the complete payload and final trees also matched.
No product test or acceptance gate was executed or certified by that carrier.

## Static acceptance and next mandatory interaction

Scoped ESLint, new-module cyclomatic/cognitive checks, nine-owner literals,
decision/grammar checks, impact registry validation (64 contracts / 35 pairs),
canonical metadata/import-graph generation and shard checks passed. The catalog
owner remains 793 lines, under its unchanged 800-line ceiling. An interrupted
initial graph invocation was retained separately; the final canonical refresh
completed with exit zero. There are 2397 classified tests.

The previously retained full owner-debt analyzer heap failure, whole static
acceptance and complete change-cone/corpus qualification remain OPEN. They were
not waived by this author verdict. No independent Solver receipt is fabricated.

Next integration must retain original operation intent before dispatch; consume
canonical physical peer/route/directory identities (including alias exclusion);
admit common genesis/membership before a serving grant; record local grants and
RETIRED-before-CLOSED durably; join create/start/publication/cleanup continuations;
and wake the existing reconcile owner when the last predecessor resource closes.
Recovery scans and the real metadata RF3/quorum/process-loss proofs remain owed.

A metadata token does not certify genesis or physical retirement. Current
node/replica fields are original request data, not a proof of physical alias
absence. Ordinary creation/serving is not redirected to this incomplete composed
interaction. The creation/genesis Quest receipts remain false. Main, the shared
local staged work, controller policy and other implementation lanes are untouched.
