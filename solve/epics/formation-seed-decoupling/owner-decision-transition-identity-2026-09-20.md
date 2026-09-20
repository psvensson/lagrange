# Owner decision: stop the matrix, derive identity from production transitions (owner, 2026-09-20)

**Status: binding.** Taken after the third independent rejection of
`overflow-budget-audit-evidence-binding`. Option 2 of the lead's report.

## The architectural result

> The current audit matrix does not have a mechanically authoritative
> definition of what makes a row represent a particular producer/state
> condition. For the seventeen still-unclassified rows, that identity
> ultimately lives in prose.

That is evidence, not another validator defect. The successor is not widened,
gets no fourth repair, and nobody manufactures structural row identity inside
the current matrix machinery.

> The old matrix could measure many useful properties, but it could not
> mechanically establish the identity of the semantic state being measured. The
> next model must obtain that identity from production-owned transition state
> rather than from audit-authored row declarations.

## 1. The successor is stopped as rejected-by-architecture

Preserved: all three verification reports, all three attempted repairs, the
exact staged tree, the attacks demonstrating the self-declared-row-identity
problem, and the fact that no production file changed. The matrix is not called
frozen. No further successor exists to keep strengthening this matrix
representation.

## 2. The verified results are preserved apart from a matrix freeze

A sealed, records-only **verified evidence packet**
([evidence/overflow-budget-audit-verified-packet-2026-09-20](evidence/overflow-budget-audit-verified-packet-2026-09-20/README.md))
holds only propositions the independent verifiers established structurally. It
is not "the frozen audit matrix", does not pretend all 27 rows have structural
identity, and does not change the inherited gate contract. It states:

> This packet preserves independently verified propositions from the superseded
> audit. It is not a structurally complete classification of all admission
> states and is not an authority specification.

Contents, as directed: the D3 hand-off result under the structural subject
`budget-dependent-authority-requirement` (relocation reachable; guard state
reachable; 720 REPLACE hand-off states per partition on all six budget-evaluated
partitions, each under the actual and the zero budget; zero decision
differences; non-vacuous with a non-zero budget in 540; so no budget-replacement
authority for the ordinary hand-off class; no ledger-local overflow authority
demonstrated); the chained-REPLACE real-chain result (ACTIVE prior target
suppresses, SYNCING permits, budget admits and zero refuses, associated with
membership-view disagreement, not a legitimate concurrent-replacement authority
class); the proved-unreachable results whose proposition is structurally
defined; the minted spread-cure result; all genuine run-produced receipts; the
incomplete epoch/version inventory; split ADD/REPLACE ownership of the
spread-recovery semantic; no second REPLACE authority kind; no ledger authority;
unminted establishing/undeclared-row cases unresolved; the nine gate statuses as
observations of this audit version, not a future gate contract; producer
identity not guard-visible; lab attribution unrecoverable for the ledger and
operation-less cases.

## 3. The seventeen prose-identified rows are not frozen

> These rows distinguish triggering conditions in prose. Their dependencies may
> have been measured over broader structural domains, but their individual row
> identities are not mechanically derived from production state.

Future tooling never treats those row ids as canonical semantic identities, and
they carry no authoritative gate weight in a future enforcement design without
being re-established under the new structural model. This is the central result
of the failed freeze attempt.

## 4. Step 2 begins, with a redefined first deliverable

> Find the smallest production-derived structural representation that uniquely
> identifies a partition membership transition and the semantic condition under
> which it exists.

No new matrix row ids. Investigate whether the existing system can expose
something structurally equivalent to a `PartitionTransitionIdentity`: partition
id; base membership/topology generation; semantic transition owner; reason /
transition class; source membership; target membership; replica identities and
roles; transition state; permitted next operation or step. The exact schema
comes from production ownership and state; this shape is not imposed if the
system proves a different one.

## 5. The explicit-transition hypothesis is tested first

Can Lagrange represent `committed membership` + `one explicit in-progress
membership transition` instead of reconstructing legality from counts, SYNCING
status, independent membership views, operation-table presence and
compatibility overflow? First falsifiers:

- **Identity disagreement.** view A = {A,B,C}, view B = {A,B,D}: a count-only
  abstraction says 3 and 3; the structural model must expose that four replica
  identities participate and explain their roles.
- **Chained REPLACE.** Drive the verified condition (previous target ACTIVE;
  previous target SYNCING) and determine which authoritative transition state
  lets the replacement owner distinguish them. Ask: *is there already an
  unresolved membership transition when the second REPLACE is produced?* If
  yes, test the candidate invariant: *at most one unresolved membership
  transition exists per partition unless the transition protocol explicitly
  permits composition.* The second REPLACE is not authorized merely because
  today's compatibility budget admits it.
- **ADD versus REPLACE.** Can both be different steps/mechanisms under the same
  spread-recovery transition authority, one structural identity covering the
  semantic reason while constraining which operation step is permitted?

## 6. Version/epoch domains are closed in support of transition identity

Continue the epoch census, including aliases without `epoch` in the name.
Determine whether there are one or several semantic generations (for example
membership/topology generation; publication/shape generation). For each real
domain: authoritative writer; what event advances it; monotonicity properties;
consumers; aliases; canonical validation predicate. The transition identity
binds to the generation describing the membership state from which the
transition was authorized. The guard never determines "current epoch"
independently.

## 7. The membership ceiling is a hypothesis, not the next goal

No quest whose objective is merely to prove `max(status count, raft-role
count)`. Ask whether explicit identities and roles make that number derived: if
a transition representation says committed, incoming and outgoing members, any
ceiling is computable from it for diagnostics. `authorizedMembershipCeiling`
stays primary authority only if evidence shows identities/roles cannot provide
the invariant and a count-based contract is demonstrably sufficient.

## 8. The new audit is defined around production-derived transition identities

Once the model exists the old 27-row matrix is not repaired. A new read-only
audit derives its admission classes mechanically from the production transition
representation:

> The test discovers or constructs a production transition state, and its
> semantic identity is emitted by the production-owned representation itself.

The audit never asks a row to declare which producer or triggering condition it
represents. Old evidence is mapped onto the new states where possible; rows may
merge, disappear or split. The old matrix is evidence about behavior, not the
future ontology.

## 9. Owner repairs and enforcement stay closed

Not yet: spread-owner unification; new authorization kinds; epoch enforcement;
membership transition enforcement; overflow-budget removal.

The order from here:

1. Seal the verified evidence packet from the stopped audit.
2. Close topology/publication version domains.
3. Establish production-derived membership-transition identity and roles.
4. Determine whether counts/ceilings are derived or authoritative.
5. Define complete authorization evaluation around that transition identity so
   `honoured` is the whole result.
6. Design semantic-owner repairs.
7. Build a new read-only audit whose classes derive from production transition
   state.
8. Verify that audit adversarially.
9. Author enforcement from the verified model.
10. Certification.

## 10. Repository handling

The stopped successor and its verification record are committed as historical
evidence. Trivial generated-document rendering defects are fixed only if
necessary for the archival record and unable to alter a substantive claim;
otherwise recorded and the rejected tree left unchanged (they were recorded, not
fixed). No freeze manifest for the 27-row matrix. Nothing is published solely
because of this decision.
