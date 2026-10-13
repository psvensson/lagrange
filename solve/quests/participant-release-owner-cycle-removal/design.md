# Decision: consolidate the existing admission owner

Base: `77e091f64fb711fbc5ca40a7915ae85f01a5cf4e`, production unchanged from
`ffe35e77d51cbd4ba35fb30518de1307eaaa2eec`.

The two inherited cycles exist because facts reads admission state while the
same state owner performs RESUME using facts and the pure release contract.
Keep that state and its final guarded OPEN mutation in one lexical owner.
Consolidate the facts reader into transaction-pause and move the existing pure
drain predicate into release-contract. Delete the redundant facts module and
rewire consumers directly. There is no new owner, unchecked setter, compatibility
path or repeated predicate.

The read-only audit in `evidence/cycle-design-audit-v2.md` is retained verbatim,
including its appended rejection of the first, unsafe state-extraction proposal.
Its SHA-256 is `1c581d4eafffb8f8046b0913bc421fac78bcaf5e283fa70825d4d4f4370c39d6`.
Root has reviewed the existing facts, contract and pause source and authorizes
only this mechanical consolidation. The simulated zero-cycle graph is planning
evidence; the actual edited source must be checked independently.

Existing direct and real-owner tests provide the regression proof. Root will
place them on locked lab hosts after exact-byte independent review. No startup,
application-barrier, broader static, corpus, Quest landing or main approval is
implied by this decision.
