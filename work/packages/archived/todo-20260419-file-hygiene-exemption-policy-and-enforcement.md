# File-Hygiene Exemption Policy And Enforcement

## Why

Some tracked files will always violate a strict line-count rule because they
are generated artifacts, lockfiles, or archival material. The repo needs one
explicit exemption policy and one enforcement script so the housekeeping rule
is precise and durable.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Define the exemption policy for generated artifacts, lockfiles, and archive
   material.
2. Add an automated check that fails on any non-exempt tracked file over
   `1500` lines.
3. Add formatting heuristics for compressed source files so new compressed
   files are caught early.

## Initial Exemption Candidates

1. `package-lock.json`
2. `.kiro/steering/llm/rules.json`
3. archived spec/playback artifacts under `.playback/` and `.tmp/.playback/`

## Residual Closure Inventory

- [ ] The repo has one explicit exemption list.
- [ ] The repo has one automated file-hygiene guard.
- [ ] The guard distinguishes source debt from intentional generated/artifact
      files.
