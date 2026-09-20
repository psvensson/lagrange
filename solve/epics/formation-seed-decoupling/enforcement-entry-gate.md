# Enforcement entry gate

Generated from `overflow-budget-decision-matrix.json` by `test/rebalancer/overflow-budget-audit-render.js`. Do not edit by hand.

The owner's nine items, each with a status and the matrix rows and tests that support it. The enforce quest is authored from this document, not from the existing guard.

- **measured at head**: 902714be831a8dea3963b0e6cc098932e6b5457b
- **demonstrated**: 0
- **not yet**: 7
- **blocked on an owner decision**: 2

## The items

### 1. every current budget admission path is classified

- **status**: **not-yet**
- **row selection**: all (at least 27 row(s))
- **matrix rows**: five-minted-spread-cure-add, five-establishing-window-unminted-cure-add, five-undeclared-partition-row-unminted-cure-add, five-minted-authorization-stale-at-promotion, five-expand-for-spread-add, five-under-representation-add, five-relocation-handoff-overlap, five-relocation-census-disagreement-overlap, five-paired-relocation-replace, five-operation-not-visible-to-the-guard, five-row-rematerialization, five-initial-provisioning-add, ledger-expand-for-spread-add, ledger-under-representation-add, ledger-relocation-handoff-overlap, ledger-relocation-census-disagreement-overlap, ledger-paired-relocation-replace, ledger-operation-not-visible-to-the-guard, ledger-row-rematerialization, ledger-initial-provisioning-add, owner-partition-services, owner-partition-nodes, owner-partition-partitions, owner-partition-message_groups, owner-partition-tables, owner-partition-config, remainder-non-priority-critical-partitions
- **requirements**: noSupportingRowUnclassified
- **what is missing**: noSupportingRowUnclassified
- **tests**: test/partition/overflow-budget-admitted-case-grid.test.js, test/rebalancer/overflow-budget-add-like-producer-census.test.js, test/partition/overflow-budget-unmintable-partitions.test.js
- **note**: The ENUMERATION is mechanical - the grid, the producer census and the partition sets all re-run, so a path added later turns a receipt red. The CLASSIFICATION is not complete: seventeen of the twenty-seven rows are still-unclassified, each stating what would classify it, and a path whose producer or whose consistency is unsettled is not a classified path.

### 2. every legitimate reachable path has an identified semantic owner

- **status**: **not-yet**
  - open finding: spread-recovery-decision-has-two-owners
  - RECORDED WEAKNESS: this item lists blocking findings but does not require them resolved, so they do not gate its status (correctionToRound3.inheritedWeaknesses: blocking-findings-are-listed-but-not-required)
- **row selection**: guardReachable (at least 20 row(s))
- **matrix rows**: five-minted-spread-cure-add, five-establishing-window-unminted-cure-add, five-undeclared-partition-row-unminted-cure-add, five-minted-authorization-stale-at-promotion, five-expand-for-spread-add, five-under-representation-add, five-relocation-handoff-overlap, five-relocation-census-disagreement-overlap, five-paired-relocation-replace, five-operation-not-visible-to-the-guard, five-row-rematerialization, five-initial-provisioning-add, ledger-expand-for-spread-add, ledger-under-representation-add, ledger-relocation-handoff-overlap, ledger-relocation-census-disagreement-overlap, ledger-paired-relocation-replace, ledger-operation-not-visible-to-the-guard, ledger-row-rematerialization, ledger-initial-provisioning-add
- **requirements**: noSupportingRowUnclassified, everySupportingRowHasAnOwner
- **what is missing**: noSupportingRowUnclassified, everySupportingRowHasAnOwner
- **tests**: test/partition/overflow-budget-unmintable-partitions.test.js, test/rebalancer/overflow-budget-unhealthy-source-replace.test.js
- **note**: The item selects every guard-reachable row. Most carry semanticOwner none_identified with the reason stated. The relocation REPLACE HAS an identified owner, and the finding attached to it is that the condition it decides is the same distinct-node spread condition the cure policy owns for ADDs - one semantic, two decision owners.

### 3. every such owner either already mints the required authority or has a precisely scoped repair quest to do so

- **status**: **blocked-on-owner-decision**
  - blocking owner decision: whether to establish ONE spread-recovery decision owner that both the ADD and the REPLACE mechanism consume, and where the distinct-node condition is decided
  - blocking owner decision: whether to widen the mint to the expand condition
  - blocking owner decision: what the mint states as its membership identity, which decides whether the ESTABLISHING window can ever mint
  - blocking owner decision: whether an undeclared partition row should withhold the plan rather than only the mint
  - open finding: spread-recovery-decision-has-two-owners
  - open finding: cross-partition-coupling-is-legacy
  - RECORDED WEAKNESS: this item lists blocking findings but does not require them resolved, so they do not gate its status (correctionToRound3.inheritedWeaknesses: blocking-findings-are-listed-but-not-required)
- **row selection**: byDisposition: explicit-authority-required (at least 1 row(s))
- **matrix rows**: five-minted-spread-cure-add
- **requirements**: everyAuthorityRequiredRowMintsOrHasARepairGroup
- **what is missing**: nothing: every requirement is met
- **tests**: test/rebalancer/overflow-budget-mintable-five-routes.test.js, test/rebalancer/overflow-budget-unhealthy-source-replace.test.js
- **note**: BLOCKED by owner decisions, and it stays blocked until the matrix is frozen: the owner's decision 9 puts this item after the freeze. One owner mints today. Every other authority-required row carries a repair GROUP naming its semantic cause, and nothing is started.

### 4. REPLACE semantics are classified

- **status**: **not-yet**
  - open finding: chained-relocation-is-a-serialization-defect
  - open finding: spread-recovery-decision-has-two-owners
  - RECORDED WEAKNESS: this item lists blocking findings but does not require them resolved, so they do not gate its status (correctionToRound3.inheritedWeaknesses: blocking-findings-are-listed-but-not-required)
- **row selection**: byOperationTypeOnly: REPLACE (at least 6 row(s))
- **matrix rows**: five-relocation-handoff-overlap, five-relocation-census-disagreement-overlap, five-paired-relocation-replace, ledger-relocation-handoff-overlap, ledger-relocation-census-disagreement-overlap, ledger-paired-relocation-replace
- **requirements**: noSupportingRowUnclassified
- **what is missing**: noSupportingRowUnclassified
- **tests**: test/rebalancer/overflow-budget-unhealthy-source-replace.test.js, test/partition/overflow-budget-unmintable-partitions.test.js
- **note**: The relocation REPLACE is classified as a distinct-node spread condition cured by a REPLACE, and its ORDINARY hand-off overlap is measured to need no budget over the complete stated domain. The ADDITIONAL overlap is not classified: it is reached only through a disagreement between two membership views, which is a consistency finding and never an authorization. The PAIRED relocation is not driven at all, so its dependency is unknown.

### 5. the complete epoch domain, including observedMembershipEpoch, is inventoried and has one canonical predicate

- **status**: **blocked-on-owner-decision**
  - blocking owner decision: which canonical membership-publication identity the authorization carries, and which single owner resolves it for both the mint and the validation
  - open finding: epoch-readers-diverge-and-the-domain-is-not-closed
- **row selection**: byRepairGroup: close-topology-publication-version-identity, establishing-publication-semantics (at least 2 row(s))
- **matrix rows**: five-establishing-window-unminted-cure-add, five-minted-authorization-stale-at-promotion
- **requirements**: noSupportingRowUnclassified, namedFindingsResolved
- **what is missing**: noSupportingRowUnclassified, namedFindingsResolved
- **tests**: test/rebalancer/overflow-budget-add-like-producer-census.test.js, test/control-plane/membership-epoch-reader-divergence.test.js
- **note**: BLOCKED, and NOT complete. The inventory groups its entries three ways - traced members of the suspected domain, aliases reached through data flow, and unresolved version-like values of unknown semantic relationship - and 32 entries are in the third group. There IS one TYPE predicate, isBoundMembershipPublicationEpoch; there is NOT one canonical READER, because the two readers do not observe the same object. No canonical reader is chosen in this attempt. What is missing: the 32 unresolved values traced to their owners, and the owner's choice of identity.

### 6. the meaning of the authorized count is defined

- **status**: **not-yet**
  - open finding: membership-ceiling-may-undercount-the-union
- **row selection**: none (at least 0 row(s))
- **matrix rows**: none (owner-level)
- **requirements**: namedFindingsResolved
- **what is missing**: namedFindingsResolved
- **tests**: test/rebalancer/overflow-budget-carried-forward-details.test.js
- **note**: NOT YET, and no formula is chosen here. What the quantity IS was measured: the peak of the status view and the raft-role view. What is NOT established is whether either view contains the other - MEASURED, the max can undercount the union of the two by 2 - so max(|A|, |B|) is not known to bound |A union B|. What is missing: the containment invariant proved or refuted as SETS over the five recorded identity cases. The name effectiveMembershipDuringTransition is a labelled hypothesis and is NOT a proposal of record.

### 7. authorization identity and type binding is settled

- **status**: **not-yet**
  - open finding: row-type-is-not-part-of-authority-identity
  - open finding: partition-identity-is-not-on-the-record
  - open finding: membership-ceiling-may-undercount-the-union
- **row selection**: none (at least 0 row(s))
- **matrix rows**: none (owner-level)
- **requirements**: namedFindingsResolved
- **what is missing**: namedFindingsResolved
- **tests**: test/rebalancer/overflow-budget-carried-forward-details.test.js, test/rebalancer/spread-cure-authorization-future-transition.test.js
- **note**: NOT YET. Settled as FINDINGS, not as a binding: the operation type is not part of identity today, partition identity is carried only through the destination replica id, and the bound the record states is a quantity whose set identity is unestablished. What is missing: all three bound before any second kind could be minted.

### 8. only honoured can grant

- **status**: **not-yet**
  - noted owner decision: where the bound is folded in: into the outcome itself, or into the consumer rule
  - open finding: honoured-does-not-include-the-bound
  - required external artifact (quest at solve/quests/authorization-identity-and-evaluation; observed satisfied: false): authorization-identity-and-evaluation-quest - The sealed identity and evaluation quest, in which the whole contract collapses into one honoured outcome. It does not exist at this head, and this item cannot be demonstrated before it lands.
- **row selection**: none (at least 0 row(s))
- **matrix rows**: none (owner-level)
- **requirements**: namedFindingsResolved, requiredExternalArtifactsExist
- **what is missing**: namedFindingsResolved, requiredExternalArtifactsExist
- **tests**: test/rebalancer/spread-cure-authorization-future-transition.test.js
- **note**: NOT YET, by the owner's rule 5. Today's honoured is NOT the complete evaluation result: the landed evaluation decides it WITHOUT the authorized bound - a record authorizing five voters is honoured for a promotion to eight - and wouldBeWithinAuthorizedBound is a separate field. For THIS AUDIT ONLY the pin is the conjunction, and every wrong rule dies against the case set. The inherited requirement is recorded verbatim under the grant rule: after that quest, the only consumer rule is `outcome === honoured`; every bound and identity failure produces a non-honoured outcome.

### 9. there is a falsifier for each authority boundary, not merely happy-path formation evidence

- **status**: **not-yet**
  - open finding: future-epoch-is-honoured
  - open finding: invalid-supplied-epoch-is-not-evaluated
  - open finding: intent-unknown-is-unreachable-from-a-row
  - open finding: honoured-does-not-include-the-bound
- **row selection**: byId: five-minted-authorization-stale-at-promotion (at least 1 row(s))
- **matrix rows**: five-minted-authorization-stale-at-promotion
- **requirements**: noSupportingRowUnclassified, namedFindingsResolved
- **what is missing**: noSupportingRowUnclassified, namedFindingsResolved
- **tests**: test/rebalancer/spread-cure-authorization-future-transition.test.js
- **note**: NOT YET. Every named boundary has a falsifier, every refusal reason the owner defines is in the case set, and the bound cases now include at the bound, one above, one below, unreadable, missing, zero and very small. But four boundaries do NOT refuse today. Until the enforce quest decides what each must do, the boundary set is pinned and incomplete.

