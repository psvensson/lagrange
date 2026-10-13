# Applied-position source static attribution V2

## Binding and method

This is read-only attribution against the immutable source inputs:

- predecessor: `9ba9a1941b2326d0d0bcfa49c581cc2fcf74af8d`
- rejected production V1: `bb976f03b1dca9989cfd990af7f188e490ac5243`
- reviewed production V2: `be8a54cbbd270501c50ac573c54f251dd9e4f35c`, source tree `1382406d83de3e9ebcde92b9d2ccb7266e8d6538`

All ten correction-path worktree hashes matched `be8a54c...` before this attribution. No source, test, metadata, baseline, or Quest file was changed.

The literal comparison uses the repository's exported canonical `collectMagicLiteralViolationsFromSource` implementation on `git show <ref>:<path>`, plus the ordinary scoped `node scripts/check-guideline-literals.js <16 paths>` report on V2. The unused-export comparison runs the existing `npm run test:unused:exports` and `npm run test:unused:ratchet` unchanged in archives of each immutable ref and on V2.

## Literal audit

The current scoped checker reports **32 new / 0 inherited** findings in the 16 applied-position source paths. “New” here means absent from the checker baseline; it does not mean introduced by this Quest. Exact ref comparison gives:

| Path | `9ba9` | rejected V1 | V2 | Whole change | V2 correction |
| --- | ---: | ---: | ---: | ---: | ---: |
| `participant-release-applied-position-observation.js` | 0, file absent | 3 | 10 | +10 | +7 |
| `replica-handler-participant-release.js` | 3 | 3 | 8 | +5 | +5 |
| `replica-handler-lifecycle-methods.js` | 0 | 0 | 1 | +1 | +1 |
| `participant-release-client.js` | 3 | 3 | 3 | 0 | 0 |
| `replica-handler-participant-cutover.js` | 6 | 6 | 6 | 0 | 0 |
| `partition-participant-release-contract.js` | 4 | 4 | 4 | 0 | 0 |
| all other owned source paths | 0 | 0 | 0 | 0 | 0 |
| **Total** | **16** | **19** | **32** | **+16** | **+13** |

Thus CL3, K4, and cutover6 are exact predecessor debt. They are not attributable to either the whole applied-position change or V2. V1 introduced O's three missing-fact literals. V2 introduced seven more O literals, five R dispatch-kind literals, and one lifecycle consumer literal.

### Attributable V2 findings and owners

`src/node/participant-release-applied-position-observation.js`:

- Lines 65: `'service-registry'`, `'service-shutdown'`, `'timer'`. These are names of O's fixed resource slots. Their existing canonical owner is the local observation resource-slot table; a correction should name the local slot labels once rather than create shared protocol vocabulary.
- Line 235: `'service shutdown listener owner unavailable'`. This is O's local resource-acquisition failure text; its owner is a named module-local observation error constant.
- Lines 282–284: numeric slot indices `4`, `5`, `6`. These belong to the same local resource-slot table. Named local indices or destructured named slots remove the positional literals without changing acquisition order.

`src/node/replica-handler-participant-release.js`:

- Lines 81, 146, 149: `'release'`; lines 133 and 136: `'malformed'`, `'ordinary'`. These are the strict ingress capture-result kinds, not release action policy. Their canonical shared owner should be the existing `src/node/replica-handler-constants.js`, consumed by both the capture owner and lifecycle dispatcher. `PARTICIPANT_RELEASE_ACTION.RELEASE` is not a complete replacement because PAUSE/ENABLE/OBSERVE requests also have capture kind `release`.

`src/node/replica-handler-lifecycle-methods.js`:

- Line 138: `'malformed'` is the consumer-side duplicate of the capture kind above. It should consume the same replica-handler constant owner; it must not introduce a second predicate or infer a participant-release request again.

### Whole-change findings introduced before V2

O lines 52, 139 and 298 add `'replica_release_reply'` and `'release_deadline'`. These are participant-release refusal fact names already repeated by the existing client, cutover, and recipient. Their appropriate canonical owner is the existing `src/partition/partition-participant-transaction-cutover-constants.js`, as a named participant-release missing-fact vocabulary. This would replace occurrences, not add a classifier.

The three predecessor R findings (`'replica-lifecycle'`, `'release_deadline'`, `'hosted_replica'`), CL3, cutover6, and K4 remain real unbaselined debt, but exact ref evidence excludes them from this change's attributable count. In particular, K's `COMMIT`/`COMMITTED`/`ROLLBACK`/`ROLLED_BACK` literals existed unchanged at `9ba9`; they require their transaction decision/status owner rather than an applied-position repair.

## Unused exports

The canonical ratchet result is exactly **1449 > 1416** on all three immutable inputs:

- `9ba9`: 1449
- rejected V1 `bb976`: 1449
- V2 `be8a54c`: 1449

The full canonical issue lists are identical. Their only changed-path issue is `releaseFactsDefect`; it was already exported and externally unused at `9ba9`, V1, and V2. Its line moved from 187 to 188 to 201. Every export added for the applied-position unit has a current production consumer, including observation start/cancel, clock/budget, ingress capture, generation validation, and observation assessment owners.

Therefore the unused-export increase attributable to the whole applied-position change is **0**, and the increase attributable to V2 is **0**. The +33 ratchet red predates the exact `9ba9` source input and must not be charged to this unit or waived by it. No baseline change is justified.

## Claim limits

This report attributes only literal and unused-export findings. It does not approve source semantics, close the Quest, or convert the inherited global reds into green evidence. The separate full source review remains authoritative for behavior and owner-boundary correctness.
