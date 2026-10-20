# U1 integrated exact-candidate proof checkpoint — 2026-10-20

**Candidate:** `be25caa5f0c3612feec662d4feaa9ba28f8f34df`,
branch `work/u1-integration-candidate-20261020`.
**Disposition:** whole-U1 fast-static + exact targeted positive proof PASSED;
**U1 combined acceptance remains OPEN**. This document is on a separate
review-only branch; it changes no source, tests or generated manifest.
Do not merge mutation or probe branches.

## Frozen composition / source of truth

Starting from prior `ccdd6938` (15+23 positive), the candidate incorporates:

1. Producer-derived 2,413-test primary/resource/subsystem classifications,
   and source/test-only ESLint corrections from
   `work/u1-static-lint-corrective-20261020`
   (static-positive parent `31c6284b`).
2. The single generic execution-gate owner's reviewed-in-source correction
   from `e0461e46`, `4868a934`, `eabba728`: a request only
   joins `IN_PROGRESS` when its exact operation type **and** captured body
   match an installed generic entry. A foreign operation is refused with
   retry custody; a nameless unowned `CREATING` memo cannot invent work.
   No new observer, queue, retry owner or physical replacement authority.
3. Two normal public-ingress CREATE/REMOVE duplicate tests from
   `a2305a8d1cc3c2e0e94212ca7f95b08dc240bb56`, covering one
   actual admission and one eventual lifecycle execution. The earlier
   synthetic REMOVE fixture was rejected by these stricter semantics;
   no production safeguard was relaxed to satisfy it.
4. Producer-derived current import-graph seal from a detached checkout of
   `84c5e0fb4c4d7192fa5d25c3e7354304793dfc32`.
   The original refresh/verify executed at
   [lab #512](https://github.com/psvensson/lagrange-lab/issues/512);
   only `test/shards/impact-graph-seal.json` was transcribed byte-for-byte
   from its owner output. The metadata producer's ignored runtime graph
   report was not fabricated or added to the repository.
   Source code was unchanged by the seal commit.

## Executed positives at **one final immutable commit**

| Proof | Original terminal lab receipt | Result |
| --- | --- | --- |
| Canonical primary/resource/subsystem classes, isolated producer refresh and verifier, whole-U1 static | [#513](https://github.com/psvensson/lagrange-lab/issues/513) at diagnostic `29984ea9`, inspecting detached **`be25caa5`** | **PASS 1/1**: classifications **2,413**; canonical graph refresh/verify clean and seal *unchanged*; fast-static **PASS**, original sealed base `381750de`, 718 changed paths / 55 JavaScript files; 13 listed static subchecks green. |
| U1 15-file focused selection | [#514](https://github.com/psvensson/lagrange-lab/issues/514) | **PASS 15/15 files, 421 runner-reported assertions**, `tv-dator`, exact `be25caa5`. |
| U1 23-file compatibility selection | [#515](https://github.com/psvensson/lagrange-lab/issues/515) | **PASS 23/23 files, 958 runner-reported assertions**, `lenovo-laptop`, exact `be25caa5`. |
| New generic real-ingress fixture before integration | [#510](https://github.com/psvensson/lagrange-lab/issues/510) | **PASS 2/2 files, 53 runner-reported assertions**, original `a2305a8d`. |

The exact final 15+23 is **38/38 selected files**, **1,379**
runner-reported assertions. This is not an independent reviewer approval,
whole-test-cone execution, release proof or multi-host native certification.

The fixed failure before correction was a synthetic handler test that placed
a `REMOVE` entry in `inProgressOperations` without its canonical operation
identity and captured inbound request; the corrected test uses
`handleRemoveReplica` to perform a real admission, then repeats the exact
envelope and proves one STOP. The current fixture additionally does this for
CREATE. These are test-fixture corrections, **not** broadened source authority.

## Negative-control and ordinary-cone status at this checkpoint

Prior source-only P0–P5, V1/V2/V3/V6/V7/V8/V9 evidence is preserved in the
earlier unchanged U1 ledgers. Two new *final-test-tree* controls were submitted
for distinct generic ACK guarantees:

- [#517](https://github.com/psvensson/lagrange-lab/issues/517),
  source-only `b590d4cb`: remove exact request matching in the existing
  generic gate and permit wrong-operation ACKs.
- [#518](https://github.com/psvensson/lagrange-lab/issues/518),
  source-only `4c61a4ce`: revive a false `IN_PROGRESS` when a nameless
  `CREATING` memo has no installed execution.

Both mutation commits have `be25caa5` as their direct parent and change only
their named **production** file, not tests. Their terminal results must be
inspected before credit; an unexecuted mutation is not proof.

A read-only selector census was submitted at
[#516](https://github.com/psvensson/lagrange-lab/issues/516)
to run the repository's actual `--base 381750de --list/--explain` selector
without executing or writing proof-scope state. **No numeric changed-cone
execution credit** is transferred from the 38-file shortlist.

## Seven acceptance gates against this exact subject

| Gate | Disposition |
| --- | --- |
| U1-1 exact source reconciliation | Historical nine-path approvals + synchronous handler evidence and current ten-path source inventory preserved; **new generic shared-gate correction still needs an independently qualified final source verdict**. |
| U1-2 immutable oracle checkpoint | **Integrated and frozen** at `be25caa5`; new real-ingress test fixtures require independently qualified oracle review, not merely green execution. |
| U1-3 canonical static/generated | **Focused owner run PASSED at exact source** (lab #513). Ordinary pre-publish hooks and full changed-owner test selector execution are separate; GitHub contents writes are not the `npm run publish` owner. |
| U1-4 focused positive | **PASS 15/15** at exact immutable commit #514. |
| U1-5 meaningful source controls | Most required historical mechanisms have bounded original negative evidence. The final generic ACK mutations #517/#518 and remaining v3 V4 wake/progress evidence have not been accepted as executed here. |
| U1-6 affected-owner compatibility | **PASS 23/23** at exact commit #515. The ordinary change selector's full chosen cone is not yet executed/certified. |
| U1-7 independent combined conclusion | **OPEN:** no independent all-55-checks verdict at this precise source/test tree; consequently no U2, activation or main merge. |

These boundaries preserve the split between local scheduling, durable
journal state, physical generation, exact transport handler admission and
post-commit publication. No generic completion or expired timeout is promoted
to proof of any other owner's finality.
