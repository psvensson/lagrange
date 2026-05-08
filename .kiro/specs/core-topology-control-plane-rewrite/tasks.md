# Core Topology Control-Plane Rewrite Tasks

## 1. Spec And Roadmap Rebaseline

- [x] Archive old root-level package files outside the rewrite queue.
- [x] Archive old root-level active/todo sprint files outside the rewrite
      sprint.
- [x] Create the rewrite idea, active sprint, active package, and successor
      package queue.
- [x] Create requirements, design, and task specs.
- [x] Rebaseline `roadmap.md` so the rewrite sprint is the current Phase 0.1
      representative track.
- [x] Update current-blocker handoff.
- [ ] Commit and push the focused setup package slice.

## 2. Owner Boundary Inventory

- [ ] Inventory boot, join, rejoin, partitioning, rebalancing, publication,
      projection, and readiness decision paths.
- [ ] Map each path to membership, placement, operation, publication, or
      projection/readiness.
- [ ] Identify duplicated evidence interpretation and forbidden fallbacks.
- [ ] Produce the focused runtime package sequence for extraction.

## 3. Boot Join Rejoin Kernel

- [ ] Define the membership owner transition model.
- [ ] Cut boot, join, and rejoin flows over to membership owner outcomes.
- [ ] Prove restart and rejoin durability with focused tests.
- [ ] Preserve pressure and timeout correctness without readiness-side repair.

## 4. Partitioning Rebalancing Kernel

- [ ] Define placement owner policy and intent vocabulary.
- [ ] Define operation owner lifecycle, retry, resume, and terminal vocabulary.
- [ ] Cut split, move, repair, and recovery paths over to placement and
      operation owner contracts.
- [ ] Prove operation scheduling and workflow progress under representative
      pressure.

## 5. Projection Readiness Contract

- [ ] Define the canonical projection snapshot and revision stream.
- [ ] Define internal, repair, and serve readiness states.
- [ ] Cut diagnostics, admin, harness, and runtime readers over to the shared
      contract.
- [ ] Prove consumers no longer recreate readiness from raw evidence.

## 6. Legacy Path Deletion And Proof

- [ ] Delete superseded topology fallback paths and shadow vocabularies.
- [ ] Add structural guards against transitional-path imports or calls.
- [ ] Run the Phase 0.1 representative proof ladder.
- [ ] Reconcile roadmap, sprint, package, and current-blocker truth.
