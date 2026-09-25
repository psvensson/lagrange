# Owner decision D1 (2026-09-25, binding): a new replica bootstraps from current committed membership

**Choice.** Option 1. When the source is still part of the authoritative committed configuration, the source is included in the target replica's bootstrap membership.

This is a semantic correction to the committed-membership (R2) boundary. It is not a special-case mechanism for making the membership-changed event work.

## Constraints

1. **Bootstrap reflects reality, not desired topology.**
   - The target's initial membership comes from the authoritative configuration at that point in the workflow.
   - If the source is still a committed voter, the target's initial membership includes it.
   - Never build it from the final desired replica set as if the REPLACE had already happened.
   - A temporary shape holding both source and target is legitimate until the source removal commits.
2. **No synthetic removal event.** The sequence is:
   1. the target starts with committed membership that includes the source;
   2. the target becomes safe and current;
   3. leadership moves, if needed;
   4. the REPLACE proposes the source removal;
   5. Raft commits and applies the change;
   6. the target observes the real ConfState transition;
   7. membership-changed wakes the owner;
   8. the owner rereads authoritative membership;
   9. the REPLACE completes only once the source is absent from effective voter membership.

   The event is caused by the real transition and is never fabricated.
3. **The event is a wake-up only.** On membership-changed, reread the applied/committed ConfState through the operation-only port. Check the source is absent from every voter-bearing part, including the outgoing voters of a joint configuration. A duplicate, delayed or stale event must be harmless.
4. **Verify the R2 boundary explicitly** with a focused committed-membership witness. It must prove:
   - the target's bootstrap membership equals the authoritative current configuration;
   - the source stays represented while it is actually a voter;
   - no removal is invented before the ConfChange commits;
   - after the real removal, the target observes the changed configuration;
   - restart and recovery give the same membership;
   - ordinary, non-REPLACE bootstrap is unchanged, unless the same invariant requires the correction there too.

   Inspect every caller of the bootstrap constructor. If one expects DESIRED membership rather than OBSERVED committed membership, do not silently change all callers. Make the semantic distinction explicit at the owner boundary.
5. **Not REPLACE-specific if the lower contract is general.** If the contract is "a new replica is initialised from the group's authoritative committed configuration", fix that owner once and let REPLACE use it. Never write `if (replace) add the old source back`. If two concepts genuinely exist (for example bootstrapCommittedMembership and desiredReplicaSet), keep them explicitly separate rather than changing an existing field's meaning.
6. **Temporary over-replication.** Verify each of these, and prove the planner interaction once:
   - quorum uses the committed configuration;
   - no code assumes a REPLACE preserves exact RF at target creation;
   - placement diagnostics understand the temporary extra voter;
   - the generic planner does not treat the temporary source as independently removable surplus while the REPLACE is active.
7. **RF=1 has a valid path.** Completion must not depend on an uninvolved replica. Use the membership-change semantics the Raft layer already supports. Never weaken quorum or membership safety to force RF=1 through.
8. **Failure of this witness is an R2 defect.** If the target cannot safely bootstrap from the actual committed membership, stop and repair that boundary. Never work around it with any of these:
   - a third-replica read;
   - polling another node for completion;
   - treating desired placement as committed;
   - a REPLACE-only synthetic membership view.
