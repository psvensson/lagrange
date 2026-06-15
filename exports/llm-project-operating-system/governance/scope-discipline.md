> Method kernel — portable. Keep the mechanism; this file is domain-neutral.

# Scope Discipline

## Document Role

This document governs how the scope gate constrains what may be implemented in
this repository. It is the rule; the data it operates on lives in the edition
matrix ([`edition-matrix.template.md`](edition-matrix.template.md), which a real
project renames and fills in).

Use this file to decide whether a unit of work — a Quest, a spec, a code change —
is in scope here. Do not use it to define product behavior, testing policy, or
style; those live in their own steering.

## The Rule

Work is gated to in-scope feature areas:

1. A feature area whose implementation home is **this repo** may drive specs,
   tasks, and code here.
2. A feature area whose implementation home is **external/commercial** (or any
   home other than this repo) is **visibility-only** here. It may be referenced
   as context, but it must not define implementation work in this repository.
3. A feature area that is **not yet classified** is out of scope until an
   edition and implementation home are assigned to it. Unclassified never
   defaults into scope.

The matrix is the single source of truth for this decision. If a request does
not correspond to an in-scope row, the work does not start until the matrix is
amended — sharpen the gate first, then implement.

## Visibility-Only Means Visibility-Only

External rows exist in the matrix so the repository understands the larger
product it is part of. They are not a backlog to pull from. The one narrow
exception is shared substrate: work may proceed here on substrate that an
external feature consumes, but only when the implementation home of the substrate
itself is this repo, the work does not implement the external-only behavior or
operator surfaces, and the active Quest names that boundary explicitly.

## Adding A New Scope Decision

When a request touches an area not yet on the matrix, or proposes to move an
area's ownership:

1. Add or amend the row in the edition matrix first: feature area, edition,
   implementation home, canonical backlog pointer, and the `May drive work in
   this repo?` answer.
2. Set `May drive work in this repo?` to `Yes` only when the implementation home
   is this repo.
3. Land the matrix change with the Quest that discovered the need for it — do not
   leave the scope decision as chat-only memory.
4. Only then author or continue the Quest, citing the row that makes the work
   valid.

A scope correction discovered during implementation is itself legitimate work:
record it, fix the row, and proceed under the corrected gate. The discipline is
not "never change scope" — it is "never change scope silently, and never
implement ahead of the gate."
