# Architectural guidance: membership transitions, not overflow numbers (owner, 2026-09-19)

**Status: guidance.**
- It is not scope.
- It applies when classifying findings and when designing the next repair
  quests.
- It does not retrofit the running audit, and it opens nothing.
- The order of work is unchanged:
  1. finish and freeze the trustworthy audit;
  2. close the version and epoch domain;
  3. investigate membership identity and transition invariants;
  4. define complete authorization identity and evaluation;
  5. repair the semantic owners;
  6. re-run the audit;
  7. only then author enforcement.
- During steps 2-4, test explicitly whether an explicit
  membership-transition object makes the proposed membership-ceiling
  abstraction unnecessary or merely derived.
- If it does, prefer the stronger representation. Do not spend effort
  proving a numeric abstraction that mature Raft systems avoid.

Comparison basis: TiKV/PD, CockroachDB, etcd/Raft and Yugabyte-style Raft
membership handling. Borrow invariants and state-machine shapes, never
components.

**Core lesson.**
- Mature systems do not represent temporary membership exceptions as a broad
  numeric allowance.
- They separate:
  - desired policy;
  - committed or current membership;
  - transition state;
  - stale-version fencing;
  - the semantic reason for the transition.
- The compatibility overflow budget is legacy to eliminate. It is not a
  specification to reproduce.

1. **Prefer an explicit membership transition over an overflow number.**
   - Raft joint consensus represents a transition with old and new
     configurations, or with incoming and outgoing roles.
   - Investigate a long-term primitive such as `PartitionTransition`:
     - partition identity;
     - semantic authority;
     - base topology or publication generation;
     - source membership;
     - intended target membership;
     - replica roles;
     - transition state;
     - allowed next operations.
   - Example: `{A,B,C} -> {A,C,D}`, with D incoming and B outgoing.
   - Four replicas observed temporarily is then a consequence of a
     legitimate transition, not the reason it is legal.
   - This is the preferred direction. It is not redesigned inside the
     current audit.
2. **Reconsider whether a membership ceiling is the right primitive.**
   - Take view A = {A,B,C} and view B = {A,B,D}. Both count 3 while four
     identities participate.
   - A formula over counts is therefore not enough.
   - First ask whether the system can expose one authoritative
     transition-membership representation with identities and roles.
   - If it can, counts become derived safety checks.
   - Keep a ceiling as a first-class authority field only if an invariant
     over the member sets makes the count sufficient.
3. **Serialize membership transitions unless composition is explicitly
   designed.**
   - etcd/Raft refuses another configuration change while one is unresolved.
   - Candidate invariant: a partition has at most one unresolved membership
     transition unless its protocol explicitly permits composition.
   - The chained-REPLACE evidence is first a transition-state consistency
     problem.
   - The question is why the replacement owner can believe it may start
     another transition while the authoritative membership still contains
     the previous incoming SYNCING member.
4. **One semantic owner across ADD and REPLACE** (the PD Operator analogue).
   - The intent is "repair distinct-node spread".
   - ADD, promote, transfer and remove are steps.
   - The shape is: spread-recovery owner -> authorizes a partition
     transition -> operations execute permitted steps.
   - Mechanism never becomes authority identity.
5. **Epoch and version identity is explicit and monotonic.**
   - Region epochs and descriptor generations are the models. A state that
     changes and later looks identical is still distinguishable.
   - The authorization binds to the membership or publication generation
     against which the transition was authorized, never to "a recent epoch".
   - The alias inventory may show several concepts conflated.
   - The dedicated epoch work must:
     - establish whether there is one domain or several;
     - separate membership or topology version from partition-shape or
       publication version where they differ;
     - name one authoritative writer per domain;
     - provide one canonical validation predicate;
     - make generations monotonic where fencing needs historical identity.
   - The guard never reconstructs "current epoch".
6. **Desired replication policy stays separate from observed membership.**
   - Current membership is runtime state.
   - Desired RF is declared policy. It is never inferred from replica
     identities or transition state.
   - Formation and recovery may run with fewer replicas, or differently
     staged replicas, without changing declared RF.
7. **Bootstrap is an explicit lifecycle or transition state, not a policy
   exception.**
   - Possible distinct transition types:
     - initial provisioning or bootstrap;
     - steady-state spread recovery;
     - ordinary replacement;
     - others, independently owned.
   - Bootstrap is never hidden in a generic allowance.
   - Initial provisioning is not classified as spread recovery merely
     because both create replicas.
8. **Typed transition and failure state has one carrier.**
   - When the parked denial-cause work resumes, prefer a common structured
     envelope with these fields:
     - owner;
     - class;
     - subject;
     - operation or transition id;
     - authoritative reason;
     - topology generation;
     - typed details.
   - That replaces adding a field to every projection.
   - Presentation layers present the evidence. They do not own its
     preservation.
   - This work stays behind the authority path.
9. **Bind authorization identity explicitly.** Investigate at least:
   - partition identity;
   - transition identity;
   - semantic authority kind;
   - base generation;
   - replica identities and roles;
   - allowed operation or step;
   - destination and source, where semantic.

   The schema follows from the verified authority model. It is not fixed
   now.
10. **A PD-style transition object, without PD's centralized topology.**
    - The flow is: semantic decision -> tracked per-partition transition ->
      ordered allowed steps -> completion.
    - A possible long-term shape has four parts:
      - `PartitionPolicy` {desiredReplicationFactor};
      - `CommittedMembership` {generation, members and roles};
      - `PartitionTransition` {id, authority owner, reason, base generation,
        from membership, target membership, state, allowed next steps};
      - `AuthorizationEvaluation`, which checks the partition, the
        transition, the semantic owner, the generation, and that the
        requested operation is an allowed step. If all hold, the outcome is
        `honoured`.
    - The guard validates an explicit transition authorization. It does not
      reconstruct why an operation ought to be legal.
11. **Use these lessons to challenge, not pre-decide.** The running audit is
    not retrofitted to this model.

**Direction.**
- Policy says what steady state should be.
- One semantic owner authorizes a named transition from one membership
  generation to another.
- Replica roles describe the temporary state.
- Operations execute that transition.
- One generation fence prevents stale execution.
- The guard validates the transition and does not infer legitimacy.
