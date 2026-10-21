---
audience: development
documentClass: evidence
---

# Deliberately defective custody control - never merge

Base: a0dc88427b61a51d3cea7fc2ff8cdaa7fbdf7ec5.
The sole product change closes native consensus/database resources in the
WASM retirement catch before rethrowing its original refusal. This is an
independently reviewed diagnostic treatment, not a proposed repair.
The unchanged exact-handler identity test must first initialize a real DB,
observe the typed refusal and retained handler, then fail its exact retained
DB/open assertions. Setup failure or native close failure is not a valid kill.
No acceptance, main merge, or release use is authorized for this branch.

The normal pre-commit hook refused the existing free-floating `error` field
literal in this unchanged owner boundary. Its output is preserved beside
this document. The runbook's LAGRANGE_SKIP_PRECOMMIT=1 exception is used
only to preserve this deliberately defective non-main diagnostic. It is not
a green gate or a landing exception. Generated metadata was produced by the
normal hook before it refused.
