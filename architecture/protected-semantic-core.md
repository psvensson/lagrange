# Protected Semantic Core

## Purpose

Phase 0.25 hardens the meanings that Phase 0.2 made expensive to discover.
Lagrange now has semantic facts where a locally plausible change can silently
violate a distant invariant: membership epochs, desired replication policy,
replica terminal outcomes, readiness/liveness, planning generations, operation
fences, placement eligibility, and similar owner interactions.

The goal is not to freeze Lagrange. The goal is to make a change to what
Lagrange *means* visibly different from an ordinary implementation change.

A future agent should be able to change adapters, diagnostics, scheduling,
query code, and ordinary consumers freely. If that change starts interpreting a
protected fact, bypasses its owner, or edits protected semantics, repository
mechanics should stop the ordinary path and require an explicit semantic-change
protocol.

## Threat model

The primary threat is an authorized contributor or coding agent making a
well-intentioned local repair with repository write access. Typical failures
include:

- coercing durable absence into a concrete value, such as SQL `NULL` becoming
  epoch `0`;
- recomputing heartbeat or readiness semantics at a consumer rather than asking
  their owner;
- treating current replica identities as desired replication policy;
- loosening a safety gate because the upstream owner is temporarily not live;
- creating a second cache, generation, timer, or state machine for a semantic
  fact that already has an owner; and
- changing a protected predicate while updating only the tests nearest to it.

Repository guards cannot defend against a malicious repository administrator or
credentials that are intentionally allowed to rewrite the guards themselves.
Literal inability to modify a kernel requires an external control such as a
ruleset, separate credentials, or a separately writable repository. Phase 0.25
must not pretend an in-repository check is a security boundary when the same
credential can simply delete it.

## Adversarial corrections to the naive library plan

### Do not build a god library

Only pure or nearly pure semantic meaning belongs in the protected semantic
kernel. Stateful lifecycle, subscriptions, timers, I/O, retries, orchestration,
and authority handoff stay with their existing owners.

Moving `RebalanceCoordinator`, `ControlPlaneReadinessService`, or another large
stateful service into a package would move complexity without clarifying
ownership.

### Do not split repositories first

A separate repository can make accidental edits harder, but an early split can
also make correctness worse:

- fixes that must be atomic across kernel and owner become version-skewed;
- agents may recreate shadow semantics in the main repository to avoid waiting
  for a kernel change;
- debugging and bisection become cross-repository operations; and
- an unstable API becomes prematurely compatibility-constrained.

Phase 0.25 therefore establishes and measures the boundary in-repository first.
A later credential/repository split is a graduation option only after the
boundary is shown to be narrow and stable.

### Do not protect files merely because they are complicated

Protection follows semantic blast radius, not file size or perceived
importance. A twenty-line decoder that distinguishes `NULL` from epoch `0` can
be more sensitive than a thousand-line adapter.

### Do not wrap every primitive

Opaque or branded values are useful where they prevent category errors, but the
system still needs simple durable and wire representations. The protected
boundary owns construction and decoding; consumers should not need a class
hierarchy for every integer or string.

### Do not treat green tests as authorization

A semantic change can make its nearby tests green while invalidating another
owner. Protected changes need explicit invariants, interaction ownership,
negative controls, and independent review in addition to ordinary tests.

## Target layers

### 1. Protected semantic kernel

The kernel contains deterministic functions and canonical values such as:

```text
raw durable value -> canonical semantic value
authoritative semantic inputs -> pure projection
state + event -> legal semantic transition
operation binding + current authority -> fence decision
policy + topology facts -> semantic placement decision
```

Kernel code must not own:

- SQL reads or writes;
- wall-clock access;
- timers;
- cache subscriptions;
- network calls;
- retries or backoff;
- logging as semantic input; or
- stateful owner lifecycle.

Time-dependent pure functions receive an explicit `nowMs` or an already-owned
semantic projection. They never call `Date.now()` as an independent authority.

### 2. Protected authority owners

Stateful owners remain ordinary source modules but their semantic boundaries are
protected. They own concerns such as:

- observing authoritative source changes;
- owning timers and deadlines;
- advancing generations;
- publishing completed snapshots;
- fencing stale work;
- lifecycle and shutdown; and
- the interaction from one owner to another.

The rule remains: every semantic concern has one authoritative owner, and every
interaction between owners has one owner.

### 3. Adapters and consumers

Storage, CDC, Raft, network, bootstrap, routing, rebalancing, query, and service
code may carry protected facts, but they do not reinterpret them.

The desired dependency shape is:

```text
consumers -> authority owners -> semantic kernel
adapters  -> authority owners -> semantic kernel
```

not:

```text
consumer -> raw durable/cache field -> local semantic decision
```

## Semantic authority inventory

The first 0.25 artifact is an inventory, not an extraction patch. For every
candidate protected fact it records:

- semantic fact and canonical vocabulary;
- authoritative owner;
- interaction owner(s);
- durable/wire representation;
- canonical decoder/constructor;
- legitimate interpretation sites;
- time or generation owner where relevant;
- consumers;
- current duplicate interpretation sites;
- blast radius if wrong; and
- migration/extraction difficulty.

Candidates are ranked. The protected set should begin small: roughly the
highest-risk 10–20 facts discovered by 0.2, not every value in the system.

## Interpretation guards

Protection must cover *negative space*: it is insufficient to create a good
helper while old code remains free to interpret the same raw field.

For selected facts, static guards should reject behavior-changing interpretation
outside the owner/kernel allowlist. Examples include direct semantic use of
fields such as membership epochs, desired replica counts, readiness lease or
heartbeat timestamps, and lifecycle status where an owner already defines the
meaning.

The guard is concerned with interpretation, not transport. An adapter may copy
`membership_epoch` from SQLite; it may not decide that `NULL` means `0`.

Where practical, imports should also be constrained so consumers depend on the
owner or kernel surface rather than owner-private implementation modules.

## Protected change control

A machine-readable protected-core manifest records the protected semantic
kernel, stateful owner boundaries, interpretation guards, and the small
root-of-trust enforcement set.

An ordinary change that touches a protected path or violates an interpretation
rule fails early with a typed diagnostic such as:

```text
PROTECTED_SEMANTIC_CHANGE_REQUIRES_AUTHORIZATION
```

A legitimate protected change carries a content-bound authorization artifact
that names:

- semantic owner and interaction owner;
- reason for change;
- whether meaning is intended to change or implementation only;
- invariant statements;
- required soundness/liveness/performance receipts as applicable;
- negative or mutation controls;
- independent review identity; and
- the exact reviewed content/diff digest.

Authorization for one diff cannot be reused after the protected bytes change.

### Protect the protection mechanism

The manifest, protected-change verifier, authorization verifier, and rules that
determine whether a path is protected form a small root of trust. They must be
subject to the same or stronger protected-change protocol. An ordinary patch
must not be able to remove a file from the manifest, weaken the verifier, then
change the newly unprotected semantic code in the same change.

This is still repository governance rather than a security boundary. External
rules or credentials are the only way to make the root of trust literally
unmodifiable by a given agent credential.

## Extraction protocol

Moving existing semantics into the kernel is an implementation-preserving
change unless explicitly declared otherwise.

Each extraction requires:

1. inventory all behavior-changing readers and producers;
2. pin current semantics with differential tests against the pre-extraction
   implementation;
3. route one owner/consumer class at a time through the canonical surface;
4. add a negative guard that makes the old interpretation path illegal;
5. use mutation controls proving the guard and receipts fail when the bypass is
   restored; and
6. remove the duplicate only after parity is demonstrated.

Extraction work must not opportunistically "clean up" semantics. If the old
meaning is wrong, fix that under its own semantic-change authorization first or
as an explicitly declared semantic change with its own receipts.

## Suggested pilot facts

The exact inventory decides the pilot, but 0.2 evidence makes these strong
candidates:

- durable membership epoch: unbound versus concrete epoch and stale fencing;
- desired replication factor versus current replica identity/holder state;
- node liveness/readiness semantic projection and time ownership;
- terminal replica-operation outcome and retirement semantics;
- planning/readiness generation identity; and
- formation/traffic-readiness admission decisions.

The pilot should include more than one kind of fact: at least one durable
decoder, one pure projection/transition, and one protected stateful interaction.

## Package boundary

An in-repository workspace/package is useful only if it improves dependency
enforcement. It is not a milestone goal by itself.

If used, the package exports a deliberately small public surface; owner-private
helpers are not exported merely for test convenience. Package extraction must
not introduce runtime duplication, alternate builds, or a generated artifact
whose source is difficult to inspect in normal review.

## Graduation to stronger physical isolation

At the end of 0.25, record evidence about:

- frequency of legitimate kernel edits;
- frequency of changes that need atomic edits across kernel and stateful owners;
- number and stability of public kernel entry points;
- incidence of attempted bypasses caught by interpretation guards; and
- whether ordinary feature work can proceed without touching protected code.

A later milestone may move the stable kernel to a separately writable
repository/package and give ordinary agents read-only credentials. Do so only
if the measured boundary is stable enough that physical separation reduces
risk rather than creating shadow semantics and version skew.

## 0.25 acceptance properties

Phase 0.25 is successful when:

- the highest-risk semantic facts have explicit owners and interaction owners;
- a small protected set is machine-readable;
- selected pure semantics have one canonical implementation and no alternate
  behavior-changing interpreter;
- an ordinary unauthorized protected edit fails before broad test execution;
- weakening the protected manifest or verifier is itself a protected change;
- extraction parity is proven differentially and by mutation controls;
- time-dependent semantics have an explicit clock/deadline owner rather than
  ambient clock reads at consumers; and
- a documented decision, based on boundary stability evidence, says whether
  stronger external credential/repository isolation is warranted next.

The milestone does not require that all core code be moved into a library, and
it does not claim that in-repository checks make a sufficiently privileged
credential unable to modify the repository.