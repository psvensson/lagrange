# Canonical JSON serializer repair

Base: live main `49fba99e1ad27acf83a75fdcee1f89a061377de4`, independently
retrieved by the sole transport owner on 2026-11-12. Its source matches the
earlier main used during extraction; the intervening merge changes architecture,
roadmap and Quest documentation. The updated applicable guidance was read.

This PR isolates an existing contract repair from the larger Lagrange WIP.
`serializeJsonData` and `digest` remain the sole owners of canonical JSON
serialization. Arrays must satisfy the same dense own-data contract at every
depth; a cycle is invalid data. An active-ancestor set rejects cycles while
allowing repeated acyclic subtrees. Serializer options are read only from
validated own data descriptors, so prototype properties cannot choose formatting
or digest ordering and accessors are not invoked.

The diagnostics forwarding module is deleted. Its two production consumers and
one functional test import the existing shared owner directly. The identity-only
forwarding test is retired with that module. Functional diagnostics assertions
and the serializer's existing positive controls remain intact.

The fourteen added controls retain malformed nested arrays, inherited array
indices, cycles, inherited or accessor options, proxy options and useful ordinary
serialization. No row-capture API or CDC/lifecycle/storage change is included.

| Claim | Discriminating counterexample and witness |
| --- | --- |
| Every nested array is canonical data | An own index getter or inherited value in a hole must be refused before the callback runs; ordinary dense nested data still serializes. |
| Cycles produce the declared refusal | A record or array that contains itself must produce the canonical TypeError; repeating the same acyclic subtree at two keys remains useful. |
| Options cannot acquire authority from callbacks | Inherited formatting/order properties, own accessors and proxy options cannot run callbacks or change the digest; ordinary own options preserve their requested behavior. |
| Diagnostics has one implementation owner | Both actual calculator consumers import the shared module directly and their functional root runs after the forwarding file is removed. |

These functions are synchronous and own no durable state, routing epoch or
external resource. The active-ancestor set belongs to one serialization and is
released through `finally`; it is not a registry of application identities.

The original serializer and hostile-intrinsics helper blobs are identical on
the main base and the preserved original9248 tree. Original lab3194 must be read
in full before attributing its result. A later pass on this extracted PR still
requires its own exact source identity, selected caller coverage, generated
metadata and static gates. This note grants no merge or release acceptance.

History inspected while developing the shared correction includes the earlier
canonical-JSON extraction and the retained-seed controls for mutable array
iteration. Primary language semantics explain why generic array iteration can
skip absent elements and why normal JSON serialization can invoke `toJSON`:

- https://tc39.es/ecma262/2025/multipage/indexed-collections.html#sec-array.prototype.every
- https://tc39.es/ecma262/2025/multipage/structured-data.html#sec-serializejsonproperty

The current main PR workflow uses GitHub-hosted tests with retry-on-failure.
Any draft created against a pinned review base records that merge retargeting
and the required main gates remain pending under the user's physical-lab-only
instruction. No CI skip marker or workflow relaxation is part of this patch.
