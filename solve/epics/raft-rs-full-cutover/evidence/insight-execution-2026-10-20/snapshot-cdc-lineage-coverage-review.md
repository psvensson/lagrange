---
audience: development
documentClass: evidence
---

# Snapshot and CDC lineage/coverage review

Date: 2026-10-20. Read-only review by `subagent:release_recovery_writer`.
Source candidate: `0e9ff4fdc11152e6b4da39adb5a1046615d19be4` in
`/mnt/data/peter/projects/.worktrees/control-refusal-provenance-20261020`.
The source and test files cited here have no staged or unstaged changes;
concurrent staged diagnostic source work is outside this review.
The report is authored in the separate witness worktree at
`be93c7e5d9a76a39e76a530c93715521b2281356`.

Scope is work package E / M7 of the
[approved plan](../../insight-execution-plan-2026-10-20.md), with the shared
M6 handoff and TX1 receipt-8 prerequisite. This is source correspondence and
gate inventory, not a new design or implementation verdict. No source, test,
design, seal or receipt changed. No native test, static suite, lab, production
or publisher was run for this review.

## Separate claim verdicts

| Claim | Observed current boundary | Verdict |
| --- | --- | --- |
| A source commit can retain notification debt and stable event identity | Existing application/CDC owners record obligations with data and retain original event payload/identity for redelivery. | Source correspondence established; exact-candidate end-to-end receipt 8 remains unresolved. |
| Source debt is discharged only after recipient committed application | Exact receipt helpers exist, but their committed builder/validator have no outside caller in the inspected `src` census. The live subscriber delivery path accepts a settled answer unless it is an explicit non-provisional failure. | **UNRESOLVED** through the actual recipient path. Helper existence is not enforcement evidence. |
| An HLC/table maximum discards an unseen independent-stream event | The inspected CDC handler warns on older timestamps and still applies the event; it also tracks per-key timestamps. | The specific abstract drop is not established in this handler. Its maxima still do not certify stream coverage. |
| Snapshot-to-stream continuity is complete for current rs-raft application partitions | Existing system-table catch-up supplies witnessed hydration, but the rs-raft snapshot copy path is a membership image and the partition cadence reports unsupported committed-log checkpointing. | **UNRESOLVED** application coverage; neither hydration nor membership snapshot is a generic gap-free stream certificate. |
| Split/merge transfers complete old/new lineage coverage | Source scope evidence binds a descriptor/version; no lineage-transfer proof was found in the inspected path. | **UNRESOLVED**. No data-only transfer or global high-water mark may be promoted to coverage. |
| Retention, restart progress and resource bounds are certified | Durable debt and bounded in-memory buffers coexist. Historical resource design approval explicitly retains source HOLD. | **UNRESOLVED**, separately from safety. |

## Existing source owners

**Durable origin and replay identity.**
`src/partition/partition-cdc-obligation.js:95-112,146-169` captures each
operation's event while its result is current, records owed events inside the
application transaction and schedules delivery after commit. The ledger
owner's `partition-cdc-obligation-ledger.js:63-106,148-161` writes exact owed
rows and moves their delivered flag only through the committed
acknowledgement application. Its tail at `:109-114` is explicitly a finite
scan bound, not proof of a delivered prefix.

`src/partition/cdc-event-buffer.js:38-46` gives durable events a deduplication
identity containing source partition and event key. The ordinary fallback
identity is a different population. A bounded buffer and delivered sliding
window can evict old in-memory events (`:106-128,207-220`); they must not be
treated as complete retained history.

**Source descriptor scope.**
`src/cdc/cdc-source-scope-evidence.js:22-45` binds partition/table identity,
range, partition version and active version into a descriptor digest and
scope ID, for the existing bootstrap-genesis or replica-create authority.
`:61-72` checks the service's partition/table/range before attaching it.
This identifies an event's stated source scope. It is not a coverage
certificate, a complete range census, or a transfer from an old lineage to
successor lineages.

**Delivery completion boundary.**
`src/cdc/cdc-delivery-outcome.js:28-60,74-96` defines event/digest/group/
position-bound committed receipts and exact validation. A source-name
search found `buildCommittedCdcOutcome` and `isCommittedCdcOutcome` only
within this module in current `src`; imports of this module in the
partition delivery owners select `isProvisionalCdcOutcome`.

The actual `src/partition/partition-cdc-delivery.js:442-461` invokes the
subscriber and rejects explicit `success: false` unless the answer is
provisional. It does not call the committed receipt validator.
`partition-cdc-obligation-delivery.js:457-474` checks current lane and
subscriber-set stability, retains debt for a provisional answer, and
acknowledges other settled callbacks. The acknowledgement is then proposed
through the existing source owner. This source boundary identifies the next
required recipient-custody proof; it does not by itself establish which
answer the actual production recipient returns in the disputed schedule.

The full operation to discriminate is:

`committed source mutation -> owed row with original payload -> registered
subscriber/actual recipient -> recipient committed application -> source
CDC_DELIVERED commit -> lost-response/restart replay -> remaining debt owner`.

Transport delivery, callback completion, provisional ingress and recipient
committed application must remain distinct observations along that path.

**HLC order is not coverage.**
`src/message-group/cdc-handler.js:459-484` compares older timestamps, logs
the observation and still calls the canonical cache application.
`:542-563` retains per-key and per-table maxima. This inspection does not
find the model's A:100/B:1 discard rule in this code. Those maxima nevertheless
cannot prove that an unseen event from another ordered stream was received,
or that a new lineage inherited every prior obligation.

**Existing catch-up and absence authority.**
`src/cdc/cdc-integration-service-authoritative-catchup.js:18-25,243-329`
uses the existing authoritative read path after subscription setup.
An observation must advance and its rows must be valid before hydration.
Cache-only absence sweep is limited to a witnessed leader read and carries
the pre-read mutation snapshot/time (`:308-325`). It does not grant removal
from a stale local replica or incomplete follower observation. This is an
existing owner to preserve when testing snapshot/stream races; it is not a
replacement for explicit per-stream/lineage coverage.

**Application snapshot and retention.**
`src/raft/snapshot-checkpoint-store.js:302-313` scrubs all non-peer
application tables from the rs-raft copy path.
`src/partition/partition-snapshot-cadence.js:8-19,70-73` reports
`COMMITTED_LOG_UNSUPPORTED` for the eligible partition tick.
`partition-cdc-obligation-constants.js:79-81` leaves owed-row snapshot
retention and delivered-row reclamation to the existing retention owner.
The [D review](tx1-tx2-prerequisite-review.md) records the related
prepared/outcome custody gates. No current application snapshot or safe
reclamation guarantee follows from the membership payload or a legacy
SQLite checkpoint receipt.

## Current witnesses and preserved failures

- `test/partition/partition-cdc-obligation.test.js` contains the existing
  O-series controllable-replica witnesses: atomic debt, exact original
  payload, acknowledgements, restart redelivery, stale-tenure completion,
  provisional debt and same-row event identity. Its header explicitly says
  controllable replicas. Header lines 4-6 record the R-series sibling name
  `cdc-obligation-recovery.integration.test.js`. That named sibling is absent
  from the inspected candidate's CDC test directory; the recorded header
  claim cannot supply a current test link or native evidence.
- `test/message-group/message-group-native-custody-handoff.test.js:120-214`
  uses a real ordinary source INSERT, source obligations and a native RF3
  recipient. It holds recipient entries, changes recipient leadership,
  replaces the uncommitted suffix and requests source redelivery. This is
  an existing discriminator to preserve, not a newly green result. Its
  producer members share the fixture's node identity and the harness
  controls delivery in process; it is not a physical cross-host certificate.
- `solve/epics/raft-rs-full-cutover/composition-report-2026-10-17.md:207`
  preserves that native test's first failure:
  `"exact actual recipient proposal is retained 0 !== 1"` at test line 146.
  That failure precedes the later source-custody assertion. It is failed
  setup/engagement of the claimed recipient cut, not proof of safety and
  not a reproduction of the later semantic failure. The historical
  composition verdict retains it; this review did not rerun it.
- `test/cdc/cdc-authoritative-catchup-hydration.test.js:320-528` contains
  witnessed-leader versus follower/local/failed-read controls, missing causal
  proof, malformed/duplicate rows and complete-presence refusal.
  `cdc-authoritative-catchup-terminal.test.js:81-98` covers terminal stop
  boundaries. These controlled witnesses do not alone prove split/merge
  lineage transfer or full distributed snapshot/stream continuity.

## Preserved design and ownership limits

The saved round-twelve resource review,
`solve/quests/replicated-transaction-decision-and-apply/evidence/cdc-resource-round12-independent-f6802647/review-cdc-c17-resource-round12-checkpoint.md`,
approves **design only** for document hash
`b4b0294f4e91f09773f708e5e006c936c9617129e550dcfa2707032d07c76269`.
It explicitly leaves resource **SOURCE HOLD**, runtime/profile prerequisites,
source review, cumulative native/transport/cache witnesses, normal startup,
original-event lost-ACK delivery and merge acceptance open. This historical
review must not be recast as current source acceptance.

The round-twelve report's reference key at lines 81-85 names historical
subjects under its `C` namespace, explicitly defined there as
`/mnt/data/peter/projects/.worktrees/tx1-cdc-20261011`:
`C/src/cdc/cdc-coverage-reconcile-owner.js`,
`C/src/cdc/cdc-coverage-transfer-owner.js`, `C/src/cdc/cdc-coverage-domain.js`,
`C/src/partition/partition-cdc-source-coverage.js` and
`C/src/cache/system-table-cache-cdc-source-order.js`.
The corresponding files are absent from the inspected candidate. These are
addresses in that preserved review's worktree, not current product paths.
Some also remain in the dirty historical CDC worktree; neither location
makes them current product implementation. See the D report's dated worktree
inventory before attempting any reuse.

`architecture/live-query-data-plane.md:5-9` also labels its contract approved
direction rather than current capability. Its `:97-120` boundary requires
per-partition frontier/barrier, replay safety and reset/fresh snapshot when
exact continuation cannot be proved. Preserve that requirement without
claiming the approved direction is implemented.

## Bounded continuation gates

First restore or explain the existing native custody witness's earliest
unengaged recipient-proposal prerequisite through actual owners. Then retain
the exact original event across recipient commit, lost reply, tenure change,
source acknowledgement and restart, with an engaged positive and targeted
semantic negative. Do not weaken the later custody assertion to make its
prerequisite pass.

Separately prove two independently ordered streams, same-lineage
snapshot-to-stream handoff, missing/compacted history recovery and
lineage-changing split/merge. The successor must expose explicit complete
coverage or the existing typed resynchronization path before the old source's
obligation can be retired. Coordinate this proof with TX1/TX2 prepared and
retry-result custody. Preserve safety, recovery progress and resource limits
as separate verdicts.

M7, the shared M6 handoff, and parent TX1 receipt 8 remain **UNRESOLVED**.
This review authorizes no new stream controller, metadata ledger, global
cursor, TTL-based reclamation, source repair, acceptance or release.

## Reference correction, 2026-10-20

Commit `32dfdc388cf80c695b70207e1b659bce8d5d6ad5` preserves this report before
the correction, with SHA-256
`9b47df3b0542629023cec293de0ba799dae0332e68c6329341be008263fcb4f8`.
The six missing-file mentions now point to their actual evidence: the
existing O-series header and the preserved round-twelve review's historical
worktree namespace. This follows the Git/Solver provenance boundary in
`docs/development/documentation-lifecycle.md`; it does not classify absent
files as current implementation. The absence findings, claim verdicts and
continuation gates are unchanged. No historical record, source, test, seal
or receipt is changed by this correction.
