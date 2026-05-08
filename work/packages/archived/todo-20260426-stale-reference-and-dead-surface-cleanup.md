# Stale Reference And Dead Surface Cleanup

## Why

Stale imports, unresolved JSDoc paths, empty imports, unused split files, and
dead helper surfaces mislead both humans and LLMs during search-driven changes.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Fix unresolved references reported by static tooling.
2. Delete or reconnect unused files after proving they are not hidden entry
   points.
3. Remove empty imports and stale generated split-file remnants.

## Out Of Scope

1. Deleting dirty worktree files without proving ownership.
2. Large runtime behavior refactors.

## Residual Closure Inventory

- [ ] `npm run test:unused` has no unresolved imports.
- [ ] Any remaining unused-file report is classified as inherited or queued.
- [ ] Deleted files are not hidden scenario or test entry points.
