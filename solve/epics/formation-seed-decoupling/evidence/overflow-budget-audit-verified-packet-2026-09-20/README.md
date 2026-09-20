# Verified evidence packet: the overflow-budget audit (sealed 2026-09-20)

> This packet preserves independently verified propositions from the superseded
> audit. It is not a structurally complete classification of all admission
> states and is not an authority specification.

It is **not** the frozen audit matrix. The 27-row matrix was never frozen and no
freeze manifest exists. Three independent adversarial verification rounds of
the successor quest `overflow-budget-audit-evidence-binding` each rejected a
freeze on one root, the third classifying it architectural:

> The current audit matrix does not have a mechanically authoritative
> definition of what makes a row represent a particular producer/state
> condition. For the seventeen still-unclassified rows, that identity
> ultimately lives in prose.

The owner stopped the successor on that result (2026-09-20). This packet keeps
what the verifiers did establish structurally, apart from any matrix freeze.

## What is here

- `packet.json` - the propositions, each with the run-produced receipts or the
  verification rounds that establish it. Every number is copied by a builder
  from the verified tree, never typed.
- `receipts.json` - the 212 genuine run-produced receipts. They measure
  partitions, state slices and drives. Nothing in them says which audit row
  they are about; that join is the unresolved defect.
- `verification/round-1.md`, `round-2.md`, `round-3.md` - the three verifier
  reports in full.
- `attacks/` - the three verifiers' attack scripts, stored as text. They ran
  against fixture copies of the verified trees and are not runnable from here.
  The round-3 attack that demonstrated gate item 4 by eight producer
  re-declarations is `attacks/verifier3/r3a.mjs.txt` and `r3c.mjs.txt`.
- `historical/` - the matrix, its markdown, the gate document, the epoch
  inventory and the round-3 pin, byte-for-byte from the verified tree. Historical
  audit material, **not frozen**, with known unrepaired rendering defects listed
  in `packet.json`.
- `MANIFEST.json` - a sha256 per file and the packet's content digest.

## The seventeen prose-identified rows

> These rows distinguish triggering conditions in prose. Their dependencies may
> have been measured over broader structural domains, but their individual row
> identities are not mechanically derived from production state.

Tooling must not treat those row ids, or any row id in `historical/`, as
canonical semantic identities. They carry no authoritative gate weight in a
future enforcement design until re-established under a production-derived
structural model. The nine gate statuses are observations of this audit
version, not a future gate contract.

## Where the exact verified tree is

Tree `24370784febda5c40e3a8484aae9205c43707369`, commit `966231c6e`, local tag
`audit-evidence-binding/round-3-verified-tree`; the quest branch
`quest/audit-evidence-binding` holds the same content plus two hook-regenerated
files and the terminal entry. No production file changed. Local only; not
published by this packet.

## Carried forward

> The old matrix could measure many useful properties, but it could not
> mechanically establish the identity of the semantic state being measured. The
> next model must obtain that identity from production-owned transition state
> rather than from audit-authored row declarations.
