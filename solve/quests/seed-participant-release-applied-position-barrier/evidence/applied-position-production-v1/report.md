# Applied-position production V1 freeze

## Binding

- Base HEAD: `9ba9a1941b2326d0d0bcfa49c581cc2fcf74af8d`
- Base tree: `c8bc996fe10cca221c68b5ca7954d1a51066d17d`
- Authorized source tree: `b09288511757fd86ef92553ac235c8d0fed0b345`
- Frozen changed-path aggregate SHA-256: `70948d03c450ef34c934a5544ede4d654cec267bad0e2c5e0db18d9559b9385c`
- Full per-file hashes and sizes: `freeze-manifest.json`
- Exact scoped patch, including the untracked new source module: `scoped-source-diff.patch`

The pre-existing/root-owned Quest log and evidence changes shown by worktree
status are excluded. No test, Quest, generated metadata, commit, or Git history
was changed by this implementation.

## Implemented contract

- Removed the unused participant `DRAIN` action/branch and added the internal
  `OBSERVE_APPLIED_POSITION` action.
- After successful ENABLE, cutover performs one observation cohort carrying
  the exact enabled origin, then preserves the existing fresh final INSPECT,
  query proof, full classifier, current-control-owner check, and RESUME.
- Added one bounded observation record per current replica. It subscribes
  before its first canonical facts read, coalesces one in-flight refresh plus
  a retained dirty wake, joins exact matching requests, refuses conflicts, and
  re-observes after an in-flight stale UNAVAILABLE when the exact lifecycle is
  still current. Service/port/registry/generation/term/configuration/build,
  pause, and deadline fences remain authoritative.
- Added payload-free `APPLIED_PROGRESS` publication after successful runtime
  status publication, first per runtime generation and on applied-index
  advance. Its marker is independent of status-read caches.
- Added service `SHUTDOWN_STARTED`, handler pre-await cancellation, direct
  service-registry replacement/removal wakes, and identity-checked cleanup of
  timers/listeners/records.
- Reused the existing release clock observation and one client-owned budget
  calculation. The carried observation deadline never exceeds the original
  attempt deadline or existing 5000 ms cap. Overall expiry remains
  `release_deadline`; RPC-only expiry is `replica_release_reply` with canonical
  `message_timeout`.
- Updated both impact-contract representations and separated the coupled
  Ready/runtime endpoint from the application/release endpoint.

## Static checks

- Syntax: exit 0 (`syntax.log`).
- Exact ESLint over all changed JS: exit 0 (`eslint.log`).
- Diff whitespace: exit 0 (`diff-check.log`).
- Dependency cruise: exit 0, 5300 modules / 22439 dependencies
  (`dependencies.log`).
- Impact contracts: exit 0, 62 contracts / 33 coupled pairs, digest
  `5d7c4a33321e4243579a4c1f8d7a32f8f1efb2f0a322c21a7d2d2b436ce94b1c`
  (`impact-contracts.log`).
- Shard/classification checks: exit 0, 2369 tests current (`shards.log`).
- File-size ratchet: exit 0, source 25/27 and tests 21/21 (`file-size.log`).
  The new owner is 220 lines; the changed runtime owner remains an inherited
  oversized file.

Scoped strict cyclomatic exits 1 with eight inherited sites. Exact HEAD input
has the same eight functions and values: cutover 15/30, cleanup 14, contract
19/33/35, runtime 14/30 (`base-cyclomatic.log` versus
`complexity-scoped-strict.log`). No new owner is over threshold.

Scoped strict cognitive exits 1 with two inherited sites. Exact HEAD input has
the same values: cutover 23 and runtime 30 (`base-cognitive-v2.log` versus
`cognitive-scoped-strict.log`). The earlier `base-cognitive.log` records an
unsuccessful direct ESLint-plugin invocation and is not evidence; the V2 log
uses the repository checker.

No behavioral or lab test was run, as required. Source behavior and Quest
acceptance remain HOLD for independent exact-byte review and root-owned lab
measurement.
