# Independent delta review: currentness component witnesses R2

Reviewer: `subagent:/root/mg_delivery_design`. Date: 2026-10-23.

Verdict: **APPROVE the exact three-file component test revision for preservation
and measured validation**. Both finite R1 findings are resolved. This is static
test review, not an executed pass, production approval or native/composed proof.
No source/test/metadata/Quest-log/ref edit, runtime, commit, push or lab action
was performed; only this evidence file is written.

## Exact identity

Worktree: `/mnt/data/peter/projects/.worktrees/mg-source-occurrence-delivery-20261023`.
Base: `21cfd917d8ceb2f0c1435cade117c0c44a91a03a`.
R2 bundle: `/tmp/mg-currentness-witnesses-r2-20261023`.
Manifest SHA256:
`9fd9926778f4db36b8e1c1504db523008e1b1170d9e47dd1103180fc66ee05d6`.
Preserved R1 files: `/tmp/mg-currentness-witnesses-r1-20261023`.
Unchanged R1 review SHA256:
`e23eb6e063712ffbb13b53ba76c6d435219e568c485613ef36702cb100a70e14`.

| File | R2 SHA256 | Lines |
| --- | --- | ---: |
| `test/test-helpers/cdc-topology-progress-fixture.js` | `5df5b96b221c5811167301374e13cb64a35d4a1589e7c49276912e3ae2ceeca9` | 159 |
| `test/partition/partition-cdc-topology-progress-currentness.test.js` | `a769fc6d38892421f4e6d76c636ca4e981e79c53da74240f72a340bf0c134a37` | 162 |
| `test/bootstrap/cdc-propagation-source-owner-currentness.test.js` | `bd09ea41037440df8c173b834aa7b50c1578c60eff405a8499b38e5070345c6b` | 94 |

All three live files independently match the manifest and frozen R2 copies.
I compared each complete R1-to-R2 delta. The changes are exactly the two requested
corrections; the original engagement, route/lifetime, debt, no-ACK, requirement
growth, stable-prefix and mismatch assertions remain intact.

## W1 resolved: issued-domain boot values

The controlled target now begins with incarnation 1 and changes to 2. Both values
are asserted through the existing exported `isIssuedBootIncarnation` predicate
from `src/bootstrap/boot-incarnation-contract.js`. I inspected that named export
and its positive-safe-integer contract. This gives the currentness comparison a
faithful field-domain premise while remaining a controlled projection, not a
claim that this test reserved an incarnation or published a real NODES row.

## W2 resolved: captured preferred ingress while readiness is false

The existing selection test now sets the preferred owner's published readiness
false while explicitly retaining initialization. It checks the actual synchronous
selector, async selector, subscriber accessor and actual subscriber callback
under the same captured-owner options. The provisional answer is still bound to
that actual preferred group. It then preserves the original initialized=false
control, where selection and the callback move to the earlier valid relay.

This would distinguish the requested complete preference policy from a partial
repair that honors the preferred owner only when published readiness is true.
The additional test premise does not relax production readiness, fabricate native
leadership, or claim that retained raw-child replacement is measured here.

## Remaining boundary and next evidence

The R1 category pass and limitations continue to apply. These tests combine real
partition application/ledger/subscription and topology owners with controlled
recipient semantic answers and route projections. Their builder-produced native
tags are inputs to a source-consumer test, not native recipient commit evidence.
Positive committed cases establish ACK eligibility; actual ACK apply remains a
separate source witness. The author reports syntax and scoped ESLint/complexity-12
passing; runtime remains **UNEXECUTED**.

The exact preserved candidate must still engage the named assertions in the lab.
Setup/import/timeout-before-engagement failures are not semantic red evidence.
Native raw custody, held selected-owner replacement, complete-vector R4 semantics,
large-population progress, S2/W7, original-cohort classification, protected
activation, durable transfer and two-start acceptance are not closed by this
component-test approval. Final integrated source/checkpoint/registry/metadata
review and measured validation remain root-owned.
