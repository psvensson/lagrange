# Distributed Closure Grammar

## Overview

This document defines the exact grammar used to close the remaining
distributed-runtime gaps for the membership lifecycle and placement hard
cutover.

It exists for Task 27 and Task 28 specifically. Deterministic owner-path
closure is already present. The remaining work is distributed closure under
boot, join, restart, rejoin, and rebalance churn.

The goal is to stop describing failures as narrative stories and instead track
them as one violated invariant at a time.

## Why This Grammar Exists

Late distributed failures in this repository have a repeated shape:

1. several subsystems look locally reasonable
2. one global convergence witness stays non-terminal
3. logs suggest many possible causes at once
4. ad hoc fixes change the failure shape without closing the boundary

The grammar below narrows every failure to one closure record with one
authoritative owner, one violated invariant, one witness, and one minimal repro.

## Closure Unit

The atomic unit of distributed debugging is one `closure record`.

One closure record represents one violated invariant, not one scenario run and
not one stack trace.

If one rolling-restart run and one seed-restart-under-load run fail for the
same first violated invariant, they belong in the same record.

If one scenario shows two distinct first violated invariants, create two
records.

## Record Fields

Every closure record in the ledger SHALL contain the fields below.

| Field | Meaning | Required Content |
| --- | --- | --- |
| `id` | Stable record id | `CL-###` |
| `status` | Current closure state | one value from the status taxonomy |
| `concern` | Semantic boundary under investigation | one value from the concern taxonomy |
| `failureClass` | Main failure shape | one value from the failure-class taxonomy |
| `firstViolatedInvariant` | The earliest invariant believed to fail | one sentence, falsifiable |
| `authoritativeOwner` | Canonical owner for the invariant | concrete component or owner path |
| `authoritativeState` | State that decides truth | concrete row, epoch, workflow, or projection contract |
| `allowedEvidence` | Inputs the owner may consume | explicit list |
| `forbiddenPromotionInputs` | Signals that must not act as semantic truth | explicit list |
| `convergenceTrigger` | Event or queue that should move the system forward | explicit owner trigger |
| `stableWitness` | Observable proof the invariant is satisfied | explicit witness shape |
| `entryGate` | Which scenario gate exposed the problem | concrete gate name |
| `currentSymptom` | Present observable failure | short factual summary |
| `scope` | Smallest known repro scope | scenario or targeted test shape |
| `nextFalsificationStep` | Next experiment that can disprove the leading theory | one concrete step |
| `requiredGuard` | Test, assertion, or diagnostic needed before closure | specific artifact |
| `reproducedBy` | How the record reached `reproduced` before any fix | a repro test path, OR a measured precondition-recurrence rate + gate id |
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
   The fix has landed and a guard exists, but the full distributed exit gate is
   not yet rerun cleanly.
6. `closed`
   The invariant is satisfied, the guard exists, and the relevant distributed
   evidence is green.
7. `parked`
   The record is intentionally deferred with a written reason and boundary.

### Status Transition Rule — reproduced-before-fix (MANDATORY)

A record SHALL NOT enter `fix_in_progress` until it is at least `reproduced`,
where `reproduced` means ONE of:

- (a) a deterministic or semi-deterministic targeted repro exists (a test or a
  fault-injected scenario that surfaces the first violated invariant on demand);
  OR
- (b) the precondition's recurrence rate has been MEASURED on a statistical gate
  (so a fix gated on a rare precondition is known-rare BEFORE it is authored).

Rationale: non-deterministic convergence fixes have repeatedly landed correct
but INERT — the precondition did not recur for multiple gate rounds, costing
hours of gate wall to discover the fix never engaged (see CL-001 variant A,
gates 075853Z + 085729Z). Measuring recurrence first, or building a repro first,
is cheaper than fix-then-discover-it's-rare.

Tools: `npm run analyze:precondition-recurrence -- <gate-run-glob>` measures (b)
across a gate's runs; `npm run analyze:fix-engagement -- <capture-logs-run>`
confirms a landed fix actually fired (drive trace with the fix's signal field
non-zero) rather than re-mining it by hand each round.

Record the satisfied branch in the `reproducedBy` field (see Record Fields).

## Concern Taxonomy

Every record SHALL use one primary concern:

1. `membership-publication`
2. `restart-rejoin-identity`
3. `placement-priority-spread`
4. `readiness-projection`
5. `projection-runtime`
6. `startup-runtime-handoff`
7. `harness-control-snapshot`
8. `gateway-authoritative-read`

If a bug spans more than one concern, choose the concern that owns the first
violated invariant. Cross-concern effects belong in `notes`, not as a second
primary concern.

## Failure-Class Taxonomy

Every record SHALL use one primary failure class:

1. `owner-bypass`
2. `mixed-truth`
3. `stale-fence`
4. `convergence-lag`
5. `witness-gap`
6. `harness-oracle-gap`
7. `priority-invariant-breach`

## Stable Witness Rules

The stable witness is the most important field in the grammar.

It must be:

1. monotonic or near-monotonic where possible
2. attributable to one owner or one gate
3. comparable across nodes
4. cheap enough to collect on every red distributed run

Preferred witness shapes in this repository are:

1. published membership epoch agreement
2. published active-node set agreement
3. control-snapshot coverage and selected node diagnostics
4. publication convergence reason codes
5. priority control-plane spread summary
6. owner-queue depth and last-drained owner key
7. authoritative read success versus timeout on one gateway path
8. replica-operation step monotonicity for priority work

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

Typical forbidden promotion inputs in this repository are:

1. cache visibility used as completion proof
2. transport connectivity used as membership truth
3. bootstrap or join phase booleans used after handoff
4. handler registration used as active membership proof
5. raw service rows used as canonical leader or active-set truth

## Repro Rule

A record is not ready for a runtime fix until the `scope` and
`nextFalsificationStep` fields identify the smallest experiment that can change
confidence.

Prefer this progression:

1. distributed scenario artifact
2. reduced scenario slice
3. targeted characterization test
4. owner-path regression or guard

Do not jump directly from a red scenario to a broad runtime rewrite.

## Closure Rule

A record may move to `closed` only when all of the following are true:

1. the first violated invariant is no longer violated
2. the required guard exists and passes
3. the relevant distributed gate reruns cleanly
4. no forbidden promotion input was introduced to obtain the green result

## Ledger Update Rule

Task 27 and Task 28 work SHALL follow this loop:

1. add or update a ledger record before changing runtime code
2. identify the first violated invariant
3. capture or improve the stable witness
4. reduce the repro scope
5. land the fix and the guard
6. rerun the relevant distributed gate
7. update the ledger status and evidence

## Operator Workflow

Use this workflow after every Task 27 scenario rerun.

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

### 3. Before Changing Runtime Code

1. Confirm the matching record is at least `narrowed`.
2. Confirm the record names one concrete owner and one concrete stable witness.
3. Confirm the next code change is intended to move that witness, not to add a
   parallel path or broader fallback.

### 4. After A Guard Or Fix Lands

1. Update the record status to `fix_in_progress` or `guarded`.
2. Add the test, harness assertion, or diagnostic artifact under
   `Required Guard` and `Evidence`.
3. Replace the `Next Falsification Step` with the next distributed rerun that
   should prove or disprove closure.

### 5. After A Green Rerun

1. Verify the relevant gate is green for the same reason the record expected.
2. Confirm no forbidden promotion input was introduced to obtain the green
   result.
3. Move the record to `closed` only when the guard exists and the witness now
   satisfies the record's `Exit Criteria`.
4. Leave the record at `guarded` if deterministic evidence is green but the
   distributed exit gate still needs confirmation.

## Canonical Record Template

Use this exact template for new records:

```markdown
## CL-### Short Title

- Status: open
- Concern: membership-publication
- Failure Class: convergence-lag
- First Violated Invariant: One sentence.
- Authoritative Owner: Component or owner path.
- Authoritative State: Concrete state or row.
- Allowed Evidence: item, item, item.
- Forbidden Promotion Inputs: item, item, item.
- Convergence Trigger: Concrete queue, event, or owner action.
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

## Relationship To Existing Spec Artifacts

This grammar does not replace the architecture or task plan.

It complements them:

1. `requirements.md` defines what the hard cutover must satisfy
2. `design.md` defines the target owner model
3. `deletion-inventory.md` records what old runtime paths were removed
4. `closure-ledger.md` indexes the remaining distributed invariant failures;
   each record lives in its own file under `closure-ledger/CL-###.md`

The ledger is the working artifact for Task 27 and the evidence artifact for
Task 28.