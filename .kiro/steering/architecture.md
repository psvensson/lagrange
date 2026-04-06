# Architecture Steering Pointer

## Document Role

This document governs architecture-document lookup only.

Use this file for:

- locating the canonical architecture entrypoint
- understanding where current owner maps and subsystem detail live

Do not use this file for:

- stable implementation rules
- testing policy
- style guidance
- roadmap scope decisions

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
