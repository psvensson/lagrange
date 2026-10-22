---
audience: development
documentClass: current
---

# Durable proof receipts

A registered content proof retains the exact source, contract, and producer
that established it. Its contract determines whether and how another consumer
may reuse it. Lagrange records these proofs durably and makes consumers ask one
authority; a past pass is not a general claim about current service health,
physical fault domains, or execution conditions.

## Authority

`scripts/proof-authority.js` owns the semantic question:

> Has proof contract P been satisfied for exact commit SHA S?

Consumers do not infer this from GitHub Actions history, branch names, local
files, timestamps, or a successful command they happen to remember. They ask
the proof authority and receive one of three outcomes:

- `proven` - a valid receipt covers `(P, S)` through the contract's permitted
  resolution, with the original proving SHA retained;
- `unproven` - the authoritative store is reachable and no receipt exists;
- `unavailable` - the authority cannot establish either fact, including a
  malformed or conflicting stored receipt.

Only `proven` permits reuse. `unavailable` never turns into a guessed pass.
A caller may elect to run the proof again when reuse is unavailable, but it may
not claim that the earlier proof was found.

## Identity and persistence

Permanent receipts are stored outside normal source history under:

```text
refs/lagrange-proofs/<proof-id>/<40-character-commit-sha>
```

Each ref points to an annotated Git tag object. The tag object targets the
proven commit directly and its JSON message records the receipt schema, proof
contract, exact subject SHA, `passed` outcome, completion time, reuse class,
and producer provenance.

There is deliberately no mutable `proofs.json` ledger and no dependency on
GitHub Actions retention. The Git object hash protects the receipt contents;
the ref name binds proof identity to subject identity; a normal non-force push
creates a missing receipt but cannot replace an existing non-commit receipt.
Recording the same valid proof again is therefore an idempotent read, not a
rewrite.

Proof refs are evidence, not release tags, and live outside `refs/tags/`.
They do not affect version ordering or `latest` release selection.

## Proof contracts

A receipt is keyed by **proof contract plus commit SHA**, never by SHA alone.
Current contracts registered in `scripts/proof-authority.js` are:

| Contract | Permitted reuse |
| --- | --- |
| `release-full-v1` | Exact SHA, or the release-content identity explicitly computed by `scripts/release-proof-identity.js`. |
| `corpus-full-v1` | Exact SHA only; release-content equivalence does not cover every assertion in the corpus. |

The release identity has one owner. It masks the release version in the declared
version-authority files and excludes only the owned non-runtime records named
by that implementation. Consumers must not add their own ignored paths, generic
timestamp stripping, or hand-written equivalence rules. Identity reuse requires
the requested subject checked out cleanly so the authority can compute its
identity. The result distinguishes `exact-sha` from `release-content-identity`
and retains `provenBy`; it does not rewrite the historical receipt as a new run.

The proof-contract version is part of the semantic identity. If the meaning of the release
proof is deliberately superseded in a way that must also apply to previously
proven commits, introduce a new contract identity such as `release-full-v2`.
Do not reinterpret an existing receipt.

Changed behavior, proof implementation, dependencies, configuration, or tests
change the release identity unless covered by its explicit normalization. The
authority, not the caller, decides whether an existing receipt remains eligible.
A new SHA alone does not force a release rerun when that registered equivalence
is established; it still requires its own exact-SHA corpus proof where that
contract applies.

## Permanent versus freshness-bound checks

Not every successful check is a permanent proof.

`release-full-v1` is registered as a reusable content proof. That registration
covers its defined proof, not arbitrary operational observations included in a
report. Reuse must preserve the original evidence ceiling and relevant input
applicability. A dependency, configuration, test, or environment change that
alters the claim requires the responsible proof owner's assessment; unchanged
source paths alone are insufficient.

Checks whose truth can change without the commit changing remain
freshness-bound. Examples include:

- whether npm is reachable or will accept a publication now;
- whether the current npm trusted-publisher binding is valid;
- whether current Docker Hub credentials still grant push scope;
- whether an external service is available now;
- current physical capacity, thermal admission, and network or storage health;
- a fresh statistical sample, soak, or recovery observation under new conditions.

Those checks may be performed before an expensive proof and again immediately
before publication, but a historical green result is not an eternal receipt.
The proof authority must not promote such a check to permanent reuse merely to
save time.

## Release interaction

The intended release flow is:

1. Run the fast, freshness-bound npm/Docker/GitHub publication preflight.
2. Ask for `release-full-v1` on the exact candidate SHA.
3. If `proven`, reuse that registered release proof without waking its proof
   runner. A separate required corpus claim still follows `corpus-full-v1`.
4. If `unproven`, run the full proof once.
5. After a successful new proof, a GitHub-hosted recorder with `contents: write`
   records the durable receipt. The self-hosted proof runner retains read-only
   repository permissions.
6. Local release preflight and the tag publication workflow ask the same proof
   authority. They never recover proof state by searching workflow history.

The recorder is an outward repository mutation and therefore consumes the
repository ActionAuthority. Recording a successful registered immutable-SHA
proof has explicit standing authority; inventing or rewriting a receipt does
not.

## Other producers and consumers

The storage and resolution protocol is deliberately independent of GitHub
Actions. A proof may run on GCP, another CI system, or a maintainer machine.
Once its successful result is recorded through the proof authority, any later
process with read access to the Git remote can resolve the same receipt.

A local producer that lacks permission to record has still performed useful
proof, but it has not created reusable shared evidence. Preserve its exact
command, source, contract, result, and provenance and route them to the existing
authorized recorder. That owner can persist a valid result without rerunning the
proof or requesting authority already granted. Until a receipt is recorded,
remote consumers correctly see `unproven`.

Repair completion, representative public-service success, and full release
acceptance remain separate claims. A narrower receipt must never satisfy a
broader bar. Reuse goes through this authority and the current proof selector;
no parallel cache, mutable success summary, or new proof service is introduced.
