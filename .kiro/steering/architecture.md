# Architecture Steering Pointer

The canonical architecture entrypoint lives at `../../architecture.md`.

Use that root document for component ownership, runtime boundaries, and
implementation architecture. Supporting system-description documents may live
under `../../architecture/`, but `../../architecture.md` remains the root
index and canonical entrypoint. This steering file exists for discoverability
only.

When architecture changes:
- update `../../architecture.md`
- update any affected supporting files under `../../architecture/`
- keep this pointer intact so steering lookups resolve to the canonical file
