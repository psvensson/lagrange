# Local Cluster Bootstrap And Getting-Started Path

## Why

The repo already has substantial runtime and bootstrap machinery, but the
day-zero operator path is still fragmented. The roadmap rows for
`lagrange cluster init`, `lagrange node start`, `lagrange cluster join`,
`docker-compose` cluster, and the getting-started tutorial are still open, and
there is no compose file in the tree.

That leaves new users reconstructing startup flow from internal bootstrap
owners instead of following one canonical local-cluster path.

## Scope Basis

Roadmap Phase `0.5 — External Usability`:

1. `Cluster Deployment Experience`
2. `Developer Workflow`

Both rows are AGPL-scoped in `edition-matrix.md`.

## In Scope

1. Define one user-facing local-cluster path for `cluster init`, seed start,
   and node join.
2. Add one local compose-based deployment that uses the same bootstrap and
   join semantics as the CLI path.
3. Add end-user getting-started documentation that follows that exact path.
4. Add one smoke validation path that proves a fresh checkout can reach the
   first successful SQL query.

## Out Of Scope

1. Kubernetes Helm packaging.
2. WASM publish/deploy/scale workflow.
3. Production HA orchestration or cloud-specific deployment surfaces.

## Invariants

1. Local bootstrap must reuse the existing bootstrap and join owners rather
   than inventing a second startup path.
2. Compose, CLI, and getting-started documentation must describe the same
   canonical startup flow.
3. The first-run path must fail closed with explicit diagnostics instead of
   hiding bootstrap/readiness errors behind shell glue.

## Hotspots

1. `src/cli/`
2. `src/bootstrap/`
3. `scripts/`
4. `docs/`
5. `README.md`
6. `examples/`

## Detection / Analysis Tasks

- [ ] Inventory the current local startup entry points and their drift.
- [ ] Define the minimal day-zero command sequence from empty workspace to
      routable cluster.
- [ ] Confirm which bootstrap and join owners the new CLI path must delegate
      to directly.
- [ ] Confirm the smallest compose layout that still proves seed startup and
      at least one joining node.

## Implementation Tasks

- [ ] Add CLI surfaces for local cluster initialization, seed start, and node
      join.
- [ ] Add one compose file and supporting config that exercise the same path.
- [ ] Write the getting-started guide against those commands only.
- [ ] Add a smoke script or focused integration test that proves the guide
      still works.

## Validation

1. Targeted CLI and bootstrap unit tests.
2. Targeted bootstrap/join integration coverage.
3. One local compose smoke that reaches a successful SQL query.
4. Any touched docs or example validation needed to prevent drift.

## Done When

1. A fresh user can initialize a local cluster, start the seed, join another
   node, and run the first query through one documented path.
2. The repo has one compose-backed local deployment surface instead of only
   internal bootstrap knowledge.
3. Getting-started no longer depends on hand-assembled internal commands.

