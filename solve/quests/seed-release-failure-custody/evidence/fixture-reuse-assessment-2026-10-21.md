---
audience: development
documentClass: evidence
---

# PR139 fixture reuse assessment

Date: 2026-10-21.
Reviewer: `subagent:/root/physical_custody_review`.
Execution candidate: `2016726f66bdb910e8b4de04bdedb89d2689bb0d`.
The execution checkout was clean at inspection. This assessment used local
source and read-only GitHub CLI/API calls; no fetch, merge, source/test edit,
test run, staging or commit was performed. This document is the sole added
file and does not approve composition or landing.

## Live preservation state

[PR139](https://github.com/psvensson/lagrange/pull/139) remains OPEN, draft and
unmerged. Its exact head is
`e14736eeda2dd5d9dc9f36227e18fcc320e892f2`, branch
`fix/rsraft-historical-transport-fixtures-20261020`, targeting
`work/u1-integration-candidate-20261020`. Its first fixture commit's parent
is `be25caa5f0c3612feec662d4feaa9ba28f8f34df`.

GitHub returned no PR reviews, review comments or issue comments. The body
claims independent measurement and supplies runs, but no content-bound
independent fixture review artifact is linked. This is a verification gap,
not proof that no independent review ever occurred elsewhere.

The complete PR delta is four files: three test fixtures and generated
`test/shards/impact-graph-seal.json`. No production source, Quest declaration
or Quest log is added. The generated impact seal is not a Quest acceptance
seal and must not be transplanted into the current composed candidate.

## Exact changes and compatible preimages

All three test preimages in PR139 exactly match the current execution
candidate's blobs. Applying their substantive changes would therefore have
no preimage conflict, but that is not semantic acceptance.

| Test under `test/` | Current/preimage blob | PR139 blob |
| --- | --- | --- |
| `address/address-manager-peer-location-authority.test.js` | `67243c063cb81f3d1cbe0b7641b28ea658d0bdd7` | `58b02ebd4fc29d9034692861bc6b77cf3e740232` |
| `node/replica-transport-handler-identity.test.js` | `e5d277a3ccc6d7d61c3ca80dfa661cd778e1909e` | `1159098eb9dc462affefcc0903ff8f1027bd99c1` |
| `partition/raft-rs-transport-demux.test.js` | `322cf59055941614b14acda3bd29f1a7ade5dfb5` | `054382db75021537315cbaaaf3eb30edb9776a26` |

The address and demux fixture edits replace no-op register/unregister
methods with a Map-backed registration, exact-handler getter and conditional
exact unregister. They preserve routing and envelope assertions. This is a
correct model of the actual identity API for those positive fixtures; it
does not establish conformance of every production transport.

The negative fixture keeps the presence-only transport. Its partition,
message-group and WASM cases change successful-return expectations to
`t.rejects` with the canonical REFUSED_NO_IDENTITY code. Existing reporting
and retained-handler checks remain. These assertions match the current
production owner at `src/node/replica-transport-handler-identity.js:30-35`.
The same inherited mismatch was measured on both current-lineage candidates
in [owner-regression-comparison.md](owner-regression-comparison.md).

## Blocking harness custody gap

PR139's WASM case at lines 188-199 initializes the real replica, expects
shutdown rejection, checks handler retention/reporting, then unconditionally
deletes its temporary directory. It performs no successful shutdown retry
and does not verify database closure before deletion.

This matters on the exact current source:

- `src/wasm-service/wasm-service-replica-lifecycle.js:290-298` checks exact
  handler retirement before calling `releaseWasmServiceReplicaConsensus`.
- Refusal throws at line 293, leaving that later release unexecuted and
  marking CLEANUP_REQUIRED at lines 302-304.
- `shutdownWasmServiceReplica` at lines 326-358 can retry the same object
  from CLEANUP_REQUIRED; it captures the retained handler and intent.

The lifecycle blob `e4e78970acb29041e78257b87bd96742d9687190` and retirement
identity-owner blob `28d363f59fb792974235e00bc6e86a25f0b49e1a` are identical
in PR139, its final measured fixture source and current execution. The gap
is therefore present in the historically green fixture, not introduced by
the cleanup repair.

Required fixture completion: preserve the deliberately non-identity negative
through its assertions; positively observe exact retained resource custody;
then restore a genuine exact-identity capability in the fixture transport
and retry the same replica's ordinary shutdown. Confirm exact handler
retirement and closure of the original resource before deleting the
directory. Do not null the handler, fake ALREADY_ABSENT, directly close the
database to bypass its owner, or use process exit as cleanup proof. If
settlement fails, retain the directory and primary plus cleanup failures.
The other negative children should likewise settle any retained fixture
obligations through their real retirement owners after proving refusal.

## Measured history and its limits

Read-back confirmed completed successful workflow statuses for the referenced
runs. Their success is not proof that the deliberately failing baseline
passed: the comparative workflow expects its original fixture to fail.

- [39436090157](https://github.com/psvensson/lagrange/actions/runs/39436090157):
  earlier comparative workflow head
  `e419e558a445070a5de2fe0a8a6a30d17a71cc98`.
- [39436953640](https://github.com/psvensson/lagrange/actions/runs/39436953640):
  final comparative workflow head
  `357d4d1ea558d4b7c6cd715631bf0a69326ea463`; the workflow explicitly checked
  out original `be25caa5f0c3612feec662d4feaa9ba28f8f34df` and corrected
  `35a5c1eceb7f1cb17f96cdd756f6e92ffd3487fb`, with retries disabled. Its log
  records original 0/3 files PASS, 66 assertions, and corrected 3/3 files
  PASS, 68 assertions. The three corrected test blobs above and generated
  seal blob `64515f1031fa287777e957a4a02ccf4c16f49e3c` match PR139 exactly.
- [39436993433](https://github.com/psvensson/lagrange/actions/runs/39436993433):
  metadata workflow head `e83da7987efad9b89900fe8d2420eab43b910d56`, also
  checking out `35a5c1eceb7f1cb17f96cdd756f6e92ffd3487fb`. The log records
  canonical metadata production and fast-static PASS against base
  `381750de29af647d446b19adedf1da53eb712093`.

The final comparative workflow used separate Ubuntu matrix jobs; this is
not a same-physical-host comparison. The complete artifact archives were
not downloaded in this assessment. Actions logs and workflow checkout
references were read; no result is transferred to current composed source
or to the required new custody assertions.

## Existing scope and next bounded unit

The existing `wasm-creation-genesis` Quest declaration is byte-identical
across PR139, measured fixture source and current execution (blob
`ccab5631cf7b471e704de3e79021563f6c8697ef`), sealed at
`f6c3698be77043ddd19e3a2a923a6d0ac6d2a9a9`. It already owns exact physical
identity and resource custody, with required async-custody, static-cone and
independent-final-review receipts. It remains the authority for the WASM
behavior; these fixture assertions are supplemental evidence, not a new
U1 acceptance or reason to widen its seal.

No dedicated Quest seal for the three historical fixture repairs was found
in the PR delta or inspected preserved fixture paths. Reuse the three
existing tests and PR patch as provenance, not an invented completed unit.
For the multi-attempt repair/composition work, the smallest bounded child
under the existing `raft-rs-full-cutover` epic should cover these three
fixture contracts, including completion of the negative fixture's resource
lifetime. Keep their historical recovery obligation connected to U1 but
separate from the `seed-release-failure-custody` seal. Do not create a new
epic or absorb address-routing changes into cleanup acceptance.

Before composition acceptance, independently review the amended fixture,
preserve the original red/green evidence and the newly identified cleanup
gap, measure the exact composed tests through the authorized runner, and
regenerate metadata for that actual candidate. The behavior-meaningful test
gate in `test/guidelines/fixtures.md` requires the bounded production-owner
and direct-collaborator guideline audit; a historical fast-static PASS does
not substitute. Preserve positive identity/successor controls and meaningful
negative enforcement, with exact resource settlement asserted in the same
negative fixture.

Verdict: the two positive fixture adapters and three typed-refusal
expectation corrections are reusable in principle. PR139 as-is is
insufficient for accepted composition because its WASM teardown abandons
retained cleanup custody, independent fixture approval is not established
by the available references, and current-candidate gates remain unmeasured.
No merge, main movement, U1 closure or release approval is given.
