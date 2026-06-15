> Method kernel — portable. Keep the mechanism; this file is domain-neutral.

# Closure Grammar

## Overview

This document defines the exact grammar used to close hard-to-close and
intermittent failures — the kind where the system looks locally reasonable
everywhere but one global property never settles.

The goal is to stop describing failures as narrative stories and instead track
them as one violated invariant at a time.

## Why This Grammar Exists

Hard, intermittent failures have a repeated shape:

1. several parts of the system look locally reasonable
2. one global property stays wrong or never settles
3. logs suggest many possible causes at once
4. ad hoc fixes change the failure shape without closing the boundary

The grammar below narrows every failure to one closure record with one
authoritative owner, one violated invariant, one witness, and one minimal repro.

## Closure Unit

The atomic unit of debugging is one `closure record`.

One closure record represents one violated invariant, not one scenario run and
not one stack trace.

If two different runs fail for the same first violated invariant, they belong in
the same record.

If one run shows two distinct first violated invariants, create two records.

## Record Fields

Every closure record in the ledger SHALL contain the fields below.

| Field | Meaning | Required Content |
| --- | --- | --- |
| `id` | Stable record id | `CL-###` |
| `status` | Current closure state | one value from the status taxonomy |
| `concern` | Semantic boundary under investigation | one value from the project's concern taxonomy |
| `failureClass` | Main failure shape | one value from the project's failure-class taxonomy |
| `firstViolatedInvariant` | The earliest invariant believed to fail | one sentence, falsifiable |
| `authoritativeOwner` | Canonical owner for the invariant | concrete component or owner path |
| `authoritativeState` | State that decides truth | concrete row, record, workflow, or contract |
| `allowedEvidence` | Inputs the owner may consume | explicit list |
| `forbiddenPromotionInputs` | Signals that must not act as semantic truth | explicit list |
| `progressTrigger` | Event or queue that should move the system forward | explicit owner trigger |
| `stableWitness` | Observable proof the invariant is satisfied | explicit witness shape |
| `entryGate` | Which scenario gate exposed the problem | concrete gate name |
| `currentSymptom` | Present observable failure | short factual summary |
| `scope` | Smallest known repro scope | scenario or targeted test shape |
| `nextFalsificationStep` | Next experiment that can disprove the leading theory | one concrete step |
| `requiredGuard` | Test, assertion, or diagnostic needed before closure | specific artifact |
| `evidence` | Current supporting facts | flat list of facts or file references |
| `exitCriteria` | What must be true to close the record | flat list of conditions |
| `notes` | Temporary analysis notes | short factual notes only |

## Status Taxonomy

Every record SHALL use exactly one status:

1. `open`
   The invariant is named, but the minimal repro or first violation is still
   soft.
2. `narrowed`
   The first violated invariant is named and the search space is materially
   reduced.
3. `reproduced`
   A deterministic or semi-deterministic targeted repro exists.
4. `fix_in_progress`
   A concrete code or harness change is underway against this record.
5. `guarded`
   The fix has landed and a guard exists, but the full exit gate is not yet
   rerun cleanly.
6. `closed`
   The invariant is satisfied, the guard exists, and the relevant evidence is
   green.
7. `parked`
   The record is intentionally deferred with a written reason and boundary.

## Concern Taxonomy

The `concern` enumeration is **project-defined**. Each project SHALL define its
own set of concerns that name the real semantic boundaries and owners in its
system, list them here, and use exactly one primary concern per record.

A short set of neutral example values, to be replaced with your own:

1. `request-correctness`
2. `data-integrity`
3. `resource-leak`
4. `auth`
5. `performance`

If a bug spans more than one concern, choose the concern that owns the first
violated invariant. Cross-concern effects belong in `notes`, not as a second
primary concern.

## Failure-Class Taxonomy

The `failureClass` enumeration is also **project-defined**. Each project SHALL
define its own set of failure shapes, list them here, and use exactly one primary
failure class per record.

A short set of neutral example values, to be replaced with your own:

1. `race`
2. `stale-read`
3. `unhandled-error`
4. `resource-exhaustion`
5. `contract-mismatch`

## Stable Witness Rules

The stable witness is the most important field in the grammar.

It must be:

1. monotonic or near-monotonic where possible
2. attributable to one owner or one gate
3. comparable across the relevant scope
4. cheap enough to collect on every red run

Neutral witness shapes that satisfy these rules:

1. status-code distribution for one path under a probe
2. count of invariant violations observed over a run
3. queue depth and last-drained item for the owner's work queue
4. a monotonic progress counter that should only advance
5. success-versus-timeout ratio on one critical path

Free-form log narratives are not stable witnesses.

## First Violated Invariant Rule

The ledger MUST track the earliest invariant believed to fail, not the loudest
downstream timeout.

Use this order:

1. owner truth violated
2. owner truth not observable through its canonical witness
3. downstream gate times out

If the first violated invariant changes after investigation, update the record
instead of creating a second record for the downstream symptom.

## Allowed And Forbidden Inputs Rule

Every record MUST spell out both:

1. signals the owner is allowed to consume
2. signals that are allowed as diagnostics only and must not promote truth

This is the main protection against sliding back into mixed-source semantics.

Typical forbidden promotion inputs are:

1. cache visibility used as completion proof
2. a read-then-write existence check used as a uniqueness guarantee
3. phase booleans used after a handoff has occurred
4. handler registration used as readiness proof

## Repro Rule

A record is not ready for a fix until the `scope` and `nextFalsificationStep`
fields identify the smallest experiment that can change confidence.

Prefer this progression:

1. full scenario artifact
2. reduced scenario slice
3. targeted characterization test
4. owner-path regression or guard

Do not jump directly from a red scenario to a broad runtime rewrite.

## Closure Rule

A record may move to `closed` only when all of the following are true:

1. the first violated invariant is no longer violated
2. the required guard exists and passes
3. the relevant gate reruns cleanly
4. no forbidden promotion input was introduced to obtain the green result

## Ledger Update Rule

Work against the ledger SHALL follow this loop:

1. add or update a ledger record before changing code
2. identify the first violated invariant
3. capture or improve the stable witness
4. reduce the repro scope
5. land the fix and the guard
6. rerun the relevant gate
7. update the ledger status and evidence

## Operator Workflow

Use this workflow after every scenario rerun.

### 1. Before The Rerun

1. Identify which existing closure record the rerun is expected to inform.
2. If no record matches the expected failure surface, add a new `open` record
   before running the scenario.
3. Write down the exact gate being exercised and the witness expected to move.

### 2. After A Red Rerun

1. Capture the first violated invariant, not just the outer timeout.
2. Paste the new witness facts into the matching record's `Evidence` section.
3. Update `Current Symptom`, `Scope`, and `Next Falsification Step` using the
   new witness output.
4. If the rerun exposed a different earlier invariant than the record names,
   rewrite that record around the earlier invariant instead of creating a
   duplicate downstream record.
5. If the rerun revealed a second independent first violation, create a new
   record for it.

### 3. Before Changing Code

1. Confirm the matching record is at least `narrowed`.
2. Confirm the record names one concrete owner and one concrete stable witness.
3. Confirm the next code change is intended to move that witness, not to add a
   parallel path or broader fallback.

### 4. After A Guard Or Fix Lands

1. Update the record status to `fix_in_progress` or `guarded`.
2. Add the test, harness assertion, or diagnostic artifact under
   `Required Guard` and `Evidence`.
3. Replace the `Next Falsification Step` with the next rerun that should prove or
   disprove closure.

### 5. After A Green Rerun

1. Verify the relevant gate is green for the same reason the record expected.
2. Confirm no forbidden promotion input was introduced to obtain the green
   result.
3. Move the record to `closed` only when the guard exists and the witness now
   satisfies the record's `Exit Criteria`.
4. Leave the record at `guarded` if deterministic evidence is green but the full
   exit gate still needs confirmation.

## Canonical Record Template

Use this exact template for new records:

```markdown
## CL-### Short Title

- Status: open
- Concern: <one value from this project's concern taxonomy>
- Failure Class: <one value from this project's failure-class taxonomy>
- First Violated Invariant: One sentence.
- Authoritative Owner: Component or owner path.
- Authoritative State: Concrete state or row.
- Allowed Evidence: item, item, item.
- Forbidden Promotion Inputs: item, item, item.
- Progress Trigger: Concrete queue, event, or owner action.
- Stable Witness: Concrete witness object or gate-visible fact.
- Entry Gate: Scenario gate name.
- Current Symptom: One factual sentence.
- Scope: Smallest known repro scope.
- Next Falsification Step: Next concrete experiment.
- Required Guard: Specific test or diagnostic artifact.

### Evidence

1. Fact.
2. Fact.

### Exit Criteria

1. Condition.
2. Condition.

### Notes

1. Short factual note.
```

## Relationship To Other Artifacts

This grammar does not replace the project's architecture or task plan. It
complements them.

This ledger is the working artifact for hard-to-close failures: it indexes the
remaining stuck invariant failures, and each record lives in its own file under
`records/CL-###.md`. Whatever documents define your requirements, target design,
and removed code paths sit alongside the ledger — the ledger is where one
violated invariant at a time gets narrowed, guarded, and closed.
