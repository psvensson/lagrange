# Process custody: accepted for bounded continuation

Operator instruction on 16 October 2026: use this ChatGPT session as reviewer
between stages and continue when the repair can be accepted. This is author
review, not an independent subagent. No independent receipt, terminal Solver
landing, main merge or whole-release approval is inferred.

Accepted source: 1603b31a90e1c1d814898ddfa4de4851aae9865e.
Tree: a8d721c3fcb7489878d933a94f66a2d0cc7c2601.
Original custody correction: 0cdf38556a4e11d35417c8378bfacf04f1a5ba18.
Frozen review witnesses: 9712d2633ed3d188faa2a418cca58c87db08045b.
The production repair remains isolated in draft PR127.

## Review verdicts and measured correction

Initial review: REVISE. The lock repair had passing focused evidence but real
startup silently discarded its cleanup rejection. The test-only witness first
ran through actual startLagrangeRuntime, with disclosed BootstrapAPI collaborator
faults and a real open SQLite resource. It gave eight passing cases and one
exact STARTUP_MUST_PRESERVE_ORIGINAL_AND_CLEANUP_FAILURES failure. Directory
exclusion still held; the missing cleanup cause was the defect.

Correction design: ACCEPT for measurement. The existing runStartupWithCleanup
function moved to the existing startup acquisition-ledger owner. Dual failure
is AggregateError with original startup error first, cleanup rejection second,
and cause=original. Healthy cleanup preserves the exact original rejection.
Successful startup returns its runtime and releases only ledger bookkeeping.
The wrapper still releases directory custody only after successful shutdown.
No alternate coordinator, retry, timeout, grant or recovery path was added.

Postmeasurement review: ACCEPT the bounded process-custody behavior and error
handoff as the basis for continued WIP implementation. This acceptance does
not close the larger creation/genesis interaction or the full static gate.

## First local-lab results, unchanged witnesses

All three runs used lenovo-laptop, existing classified placement, normal locked
dependencies, retry=0 and unchanged automatic hardware calibration policy.
The baseline, candidate and mutation reported calibrated factor 2.3. Thermal
checks passed; NVMe was unmeasured, so no SSD-temperature proof is claimed.

| Treatment | Source | Result | Whole-file milliseconds |
| --- | --- | --- | --- |
| Error-reporting baseline | 9712d263 | 8 pass / 1 semantic fail | 11179 |
| Corrected review suite | 1603b31a | 9 pass / 0 fail | 8323 |
| Original startup custody | 1603b31a | 2 reported assertions pass | 626 |
| Original shutdown custody | 1603b31a | 3 reported assertions pass | 2026 |
| Durable replica generation | 1603b31a | 191 reported assertions pass | 3318 |
| Application-database composition | 1603b31a | 43 reported assertions pass | 6032 |
| Remove handle retention only | 81413603 | 8 pass / 1 semantic fail | 8106 |

The candidate has five passing files and 248 reported assertions. These counts
include parent entries where the existing runner reports them; they are not
248 independent distributed scenarios. No failed test was rerun until green.

The source-only mutation 814136034c9b973b3e0e6129c2370316e6e7441c removes one
heldDataDirectoryDatabases.add(database) call. It is preserved on
proof/rs-raft-custody-no-retention-20261016, not a product candidate. The actual
wrapper was garbage-collected and a contender acquired the directory while
the owner process was alive: LIVE_PROCESS_RELEASED_DIRECTORY_WITH_UNRETIRED_RESOURCE.
Every other new case passed. This is an engaged semantic negative, not missing
capability, setup failure, cancellation or timeout. The good source branch was
never changed into the mutation.

## Exact request and log bindings

Baseline request: 7b43ae4b28004534be9666f9c653c21c, COMPLETE 11:36:24Z.
Request SHA256: 16b87678036cbac81faadca399827fdd2f2cf99b19340ca3dfea865007576755.
Log: 5968 bytes, SHA256 34caf6515ca9be0ed9ee4066064af6fff1bdab9770ae7e1b9639ce1e60d3c7b8.

Candidate request: d7907c823e0045eba4c029940196f971, COMPLETE 11:48:02Z.
Request SHA256: decbdfc919a637a4a9546d01f38d363a51e125d71736d3399f74ecb5e10debba.
Log: 1844 bytes, SHA256 41b5792c7d5b201f56c4b6ffd34cba904e6e8b53721c3b64c13e2c0f1ffabbc6.
The complete returned candidate executor log was copied and independently
rehashed in the cloud with identical length and digest.

Mutation request: cde9d9d7fc7b450da96c3f46add41186, COMPLETE 11:49:40Z.
Request SHA256: 4475eb4cdf8e4eac960878b728df477e69e08f5568633f0cfb8397b10e0e87fb.
Log: 6003 bytes, SHA256 15bb2a91fbf3e5ac7eb72c5ab27ddea2e5e1f84a842212a1d2ad0029f914d7b4.
Its returned tail omits the first three bytes; no complete exported raw-archive
verification is claimed. Native per-case artifacts remain with the local
executor. Controller/request/source identities were checked against requests.

Frozen child SHA256: 38029bc42f93587e05baffc7dcee185fa3c0d13b10848d302c6f8218878bb2be.
Frozen review test SHA256: 311ddde9098d761c82ca72cf3254c23e94416f7b50ba839a967fda58297ed509.
The original two custody witnesses also remain byte-identical.

## Review categories and limits

Ownership/admission: SQLite alone arbitrates the directory; the Set retains
native resources after wrapper collection. It is not a permission registry.
No timeout or missing map can release an outstanding resource.

Error handling: actual dual startup/cleanup failure is inspectable. All five
falsy rejection values retain failure. Every ordinary cleanup is attempted.
The public facade retains its existing error normalization and underlying cause.

Concurrency/lifetime: acquisition-before-abort and registration-before-abort
are unchanged. The existing shutdown owner shares its settlement. Repeated
one-use ledger unwind does not replay cleanup or grant another process rights.
Native rollback/close failures remain observable; successful explicit release
and actual process death restore availability. No new single-flight algorithm.

Harness/recovery: real child processes, WeakRef collection, SQLite exclusion,
production startup with explicit collaborator faults, and healthy controls.
This is not healthy full-cluster startup, RF3, a multi-host consensus run,
seed-loss, snapshot install or power-loss certification.

Static: scoped ESLint, strict storage/ledger cyclomatic and cognitive checks,
three-owner literal/decision/grammar guards, canonical test metadata and
import-graph refresh, shard checks and source whitespace passed. Startup is
787 lines, below its unchanged 800-line ceiling. The previously retained full
owner-debt regeneration memory failure and full global/static/change-cone
acceptance remain open; no baseline or memory limit was raised. Interrupted
cloud static commands were not misclassified as behavioral evidence.

## Next stage: creation selection and resource CAS

The existing ServiceDefinitionsOwner component fixture and nine oracle cases
have been reviewed for an initial capability measurement. The fixture uses
real schema generation, metadata owners, CDC mutation construction and SQLite;
its authoritative reads explicitly adapt to a single in-memory component DB.
It proves neither QueryEngine/Raft consensus nor physical lifetime completion.

Current production lacks service_instances schema registration and the R2
selection/resource methods. The next initial run must preserve that failure,
not inject a fixture-only schema or claim a missing method is a semantic
regression. Subsequent implementation belongs in the existing schema and
ServiceDefinitionsOwner/gateway/CDC interaction, with exactly one authoritative
CAS and no local serialization as arbitration. The R2 contract remains the
whole-interaction authority. No catalog activation, OCI, Images, F1/W07 ordering
supersession or release-current-control expansion is authorized by this stage.
