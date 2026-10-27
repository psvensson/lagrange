# Independent design review R2: complete-vector outcome correction

Date: 2026-10-23. Reviewer: `subagent:/root/retained_effects_review`.
Worktree: `/mnt/data/peter/projects/.worktrees/mg-source-occurrence-delivery-20261023`.
Scope: bounded design rereview only. No production/test/metadata edits,
runtime execution, lab submission, commit or publication.

## Decision

**APPROVE the bounded R4 design correction for implementation**, exactly
`DESIGN-mg-complete-vector-outcome-correction-r2-2026-10-23.md`,
SHA256 `7ccbad6c08aebc6275a400f80fe7f6eb2007094479116cddb5b2d28f61b7a76c`.

The approval is for this explicitly recorded response-shape and normalization
correspondence correction under the existing MG interaction. It is not
approval of the moving production draft, any test, runtime behavior, the
other R1–R7 repairs, full interaction acceptance, retained-classification
authorization, startup, protected activation, durable transfer or merge.

The original proposal remains unchanged at
`f569b1c16e8ecb1cdf43d9b5b161c8a4ee120a65d2ef445d2f4a07d9f4676a72`.
Its independent REVISE record remains
`REVIEW-mg-complete-vector-outcome-correction-2026-10-23.md`,
SHA256 `19bbc21416cdbbefb0a3a8d1bdc1e18568e793e831892fe31694ee1188a582ab`.
R2 supersedes the proposal; it does not rewrite the earlier findings.

## Bounded correction disposition

**D1 resolved.** R2 requires the existing canonical
`sha256:` plus 64 lowercase hexadecimal representation, consumes the
existing `isSha256Digest` owner, and compares against
`cdcCommitWaitIdentity`. It therefore no longer creates a bare-hash variant
or rejects its own builder output. The field remains required; required
canonical fields must be own data properties, as recorded in R1's input
controls. No wrapper-local digest syntax is approved.

**D2 resolved.** R2 names `observeCdcCoverage` and
`completeCdcPropagation` explicitly. Both native and provisional coverage
retain the same validated `cdcVectorDigest`. Every covered source/target
observation must match the expected complete input vector before composition;
missing or mismatched binding is invalid/UNCOVERED. The aggregate preserves
that identity rather than hashing a new argument and relabeling old coverage.
The same condition applies to topology and source-subscriber continuation,
with current obligation, subscriber and topology bindings checked before
final consumption.

This directly closes the earlier symbolic counterexample:
coverage obtained for `[D,U1]` cannot be reused for `[D,U2]`, `[D]`,
or another ordering/multiplicity merely because D's receipts still match.
The added metadata is one existing identity in each already bounded coverage
record; no event payload history, new identity algorithm, registry or durable
receipt store is introduced.

## Unchanged normalization mechanism and boundaries

The remaining R1 mechanism is preserved, not widened:

- The existing MG capacity reservation precedes immutable capture and ordinary
  normalization. Exactly one normalized member preserves each validated input
  member and its order.
- A durable timestamp is validated and retained. Ordinary stamp fallback keeps
  the existing event/options/service-HLC rule; no transport or envelope owner
  gains a clock. Nonempty primitive strings remain assigned, without a new
  trim/coercion/HLC-syntax rule.
- Let I be captured incoming semantics and N the exact normalized command.
  Native waiter identity and forwarded completion validation use N. Only the
  same live MG admission that owns the I-to-N correspondence may translate a
  canonical N outcome's vector digest back to I's digest.
- Validation occurs before translation. The durable receipts, actual native
  group/index/term, every other result field, existing contradiction checks
  and remote transport checks survive unchanged. UNKNOWN, partial, malformed
  or contradictory replies cannot be repaired into acceptance.
- The command N stays unchanged across that admission's forwarding/retries.
  Later expiry, rollback, native lifetime replacement or a new public
  invocation cannot revive an old caller.
- Aggregation consumes already validated I-bound coverage. It does not acquire
  the MG owner's permission to translate a different N into I.

This retains the distinction between identity and authority: a matching digest
is correspondence metadata, not evidence that native application happened.
Actual afterCommit plus exact receipts remain required for native success.
Provisional coverage cannot authorize CDC_DELIVERED or completion-only work.

## Source and measurement gates retained

All R1 category coverage and finite proof requirements still apply. In
particular, implementation review must follow the digest through the actual
builders, validators, transient waiter, normalizer, application afterCommit,
real response wrappers, forwarding consumers, coverage representation,
zero-target/nonzero-target composer and source ACK gate.

The paired proof must show both legitimate mixed-vector completion and
rejection of changed ordinary members while D's receipts remain unchanged.
Required controls include direct and forwarded native positives; absent and
invalid ordinary stamps plus valid supplied stamps; durable stamp
preservation; literal missing/wrong/inherited digest negatives; committed and
provisional coverage reuse across altered vectors; incomplete target sets;
capacity/backpressure; and late, replaced or rolled-back work. Pure builders
are validator fixtures, not native application evidence.

R2 adds no retry, deadline extension, polling loop, input/event-count/fanout
cap or new durable authority. Its currentness and coverage requirements remain
within the existing source continuation and queue owners. Native raw-child
custody and exception-safe cleanup are separate pending repairs; this design
approval does not discharge them.

The named `cdc-source-native-delivery` contract/pair, source paths and
classified witnesses must accompany the implementation's exact source
checkpoint. The older observer checkpoint and the failed #1092 baseline
supply no implementation acceptance for this new design.

No new material design finding was found in the bounded R2 delta. The proposal,
historical R1 proposal and historical R1 review hashes were checked again at
review completion. Only this new review file was written by this reviewer.
