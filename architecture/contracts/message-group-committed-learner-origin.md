---
audience: development
documentClass: current
---

# Exact committed learner origin

Bounded continuation of the existing `message-group-fresh-identity-membership`
Quest after review `67dfc3b2b8f70a8dc67d79e7c840ba06be1ae168`.
Base: `8ece20f70392314ceba49e4e787b800bc14d07d6`.
This contract specifies the next implementation and its tests; it is not proof,
an independent approval, a changed sealed acceptance, or route activation.

## Recovery outcomes and authority

| Observed fact | Permitted continuation |
| --- | --- |
| The exact original learner action has committed and applied | Recover its historical result through the native owner; no reproposal merely because a reply or former runtime was lost. |
| Outcome unavailable, or no exact origin is retained | Keep UNKNOWN and the existing membership obligation. Neither current absence nor a missing record proves non-commitment. |
| A prior attempt is definitively fenced AND non-committed | A successor attempt needs a separately proved, durably ordered existing-owner transition. This increment DOES NOT issue it. |

The immutable logical target/operation/transition and a fenced execution attempt
are different. Do not overwrite the first issued permit with current native
term, configuration or runtime values. J1 forward recovery after promotion
authorization and ordinary-terminal/membership/cleanup/reservation separation
remain unchanged. No additional metadata reread, queue or cancellation owner.

## Retained fact, not another workflow ledger

The existing native Ready/application owner already decodes the managed
ConfChange context and reserves its permanent peer identity inside the same
SQLite transaction as ConfState and the applied index. A fresh identity is
never reused. Extend that SAME permanent reservation with one nullable encoded
learner origin. Only a managed ADD_LEARNER application writes it. It binds:

- group id;
- actual committed-entry index and term, as exact canonical decimal strings;
- the existing operation id, transition identity, permit sequence, stage,
  target replica identity and derived peer id.

The registry persists bytes; the existing committed-context owner defines and
validates their shape. No independent progress authority or unbounded history
per operation is added. Reapplying the identical origin is idempotent; a
conflicting origin cannot overwrite it. A preliminary reservation is NOT an
admission. An older reservation migrates to NULL, never synthesized success.

The origin, permanent identity and applied state commit or roll back together.
Replaying entries already folded into a joiner's bootstrap configuration may
recover provenance but MUST NOT reapply their historical ConfState to the core.

## Read contract

Extend the existing semantic committed-membership read with the explicit
`learner-action` purpose. It accepts group id plus the existing exact managed
ADD_LEARNER action tuple, snapshots/validates the request, and runs through the
native group's existing execution queue and recovery/lifecycle boundaries.
It returns frozen historical COMMITTED, UNRESOLVED, or REFUSED data. A record
beyond the same local applied/committed membership boundary is never returned
as committed. A mismatched or malformed record is not success. A closed or
unavailable owner is explicit unavailability.

The read does not require the OLD execution term/runtime to still be current:
those guard proposal execution, not observation of an already-committed fact.
It does not amend the original permit or grant a new proposal. Historical ADD
success is not current learner membership, a join descriptor, physical CREATE,
source removal, or release of the serialized membership obligation.

## Checkpoint retention and compatibility

The existing raft-rs checkpoint scrub retains permanent peer reservations but
removes sender-local native logs/state. The origin must therefore travel WITH
that reservation, be described in the checkpoint, and be compared with actual
payload bytes on read/install/recovery. Validate its group, target identity,
entry term and index against the checkpoint's applied boundary. A descriptor
must not erase, substitute or manufacture an origin.

Increment the UNRELEASED `raft_rs_replica_image` payload version from 1 to 2;
other payload kinds are unchanged. Version-1 images are explicitly unsupported
by the new origin-bearing contract, not silently treated as containing proof.
Old live reservation rows remain readable after the existing owner adds the
nullable field, but NULL cannot resolve an issued action. No supported upgrade
claim is made. Native snapshot catch-up completion is a separate existing gap.

## Required falsifiers and proof ceiling

Before source changes, run the new witness on the exact base and retain its
missing-purpose/absent-origin failure. Then use actual operation authorization,
native proposal/Ready/application, file-backed SQL and the checkpoint owners:

1. Intent or PROPOSED/uncommitted entries alone do not produce origin success.
2. Lose the proposal response, apply on the surviving voters, and recover the
   exact original action on another voter and after native reconstruction.
3. A newer leader/runtime refuses the old proposal fences but still answers
   the historical committed-origin read without rewriting the issued permit.
4. Wrong operation/transition/sequence/stage/target/group cannot borrow proof.
5. A real applied-state transaction failure also rolls back origin storage.
6. The scrubbed checkpoint contains no sender log yet preserves and validates
   the exact origin; an altered/missing origin or old payload version refuses.
7. Closing the actual owner and malformed/unavailable records fail closed.
8. Source-revert and focused mutations must fail the named relevant assertion,
   not a setup timeout or cancelled test.

Use existing test fixtures and impact-contract registration, unchanged native
fences, WAL/FULL settings and file budgets. No physical lab/GCP configuration
changes. This first increment does not wire the repository phase/stamp update,
registered membership route, full debt driver, successor issuance or CREATE.
Those remain behind the retained evidence and subsequent independent review.

A focused component pass is not shared-helper/full-cone proof, a physical
network test, two off-seed replacements, or final-main certification. The
existing full-lab FAIL, duration findings and final A1-v13 gate remain open.
