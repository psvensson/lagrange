---
audience: development
documentClass: current
---

# Durable proof receipts

A proof about immutable repository content is a property of the exact commit,
not of the machine, workflow, branch, or wall-clock time that happened to prove
it. Lagrange therefore records reusable content proofs once and makes every
later consumer ask one authority whether that proof already exists.

## Authority

`scripts/proof-authority.js` owns the semantic question:

> Has proof contract P been satisfied for exact commit SHA S?

Consumers do not infer this from GitHub Actions history, branch names, local
files, timestamps, or a successful command they happen to remember. They ask
the proof authority and receive one of three outcomes:

- `proven` - a valid durable receipt exists for exactly `(P, S)`;
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
The first permanent contract is:

```text
release-full-v1
```

The version is part of the semantic identity. If the meaning of the release
proof is deliberately superseded in a way that must also apply to previously
proven commits, introduce a new contract identity such as `release-full-v2`.
Do not reinterpret an existing receipt.

For ordinary evolution of the repository, a changed proof implementation also
means a changed commit SHA, so the new commit has no receipt until proved.

## Permanent versus freshness-bound checks

Not every successful check is a permanent proof.

`release-full-v1` is reusable because its subject is immutable repository
content and its proof contract is content-oriented. Once that exact commit has
passed, running the same proof again adds no information.

Checks whose truth can change without the commit changing remain
freshness-bound. Examples include:

- whether npm is reachable or will accept a publication now;
- whether the current npm trusted-publisher binding is valid;
- whether current Docker Hub credentials still grant push scope;
- whether an external service is available now.

Those checks may be performed before an expensive proof and again immediately
before publication, but a historical green result is not an eternal receipt.
The proof authority must not promote such a check to permanent reuse merely to
save time.

## Release interaction

The intended release flow is:

1. Run the fast, freshness-bound npm/Docker/GitHub publication preflight.
2. Ask for `release-full-v1` on the exact candidate SHA.
3. If `proven`, do not wake the GCP proof runner and do not rerun the corpus.
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
proof, but it has not created reusable shared evidence. It should report the
exact record command; an authorized recorder can persist the result without
rerunning the proof. Until then, remote consumers correctly see `unproven`.
