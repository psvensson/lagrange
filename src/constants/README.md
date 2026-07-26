# Constants And Domain Vocabulary

Constants exist to give one semantic concept one canonical vocabulary. They are
not a substitute for ordinary JavaScript literals.

## Choose The Owner First

- Put a system-wide domain vocabulary in the module that owns the concept.
- Put a module-specific vocabulary beside that module.
- Use a file-local constant when the value is private implementation detail.
- Reuse an existing canonical definition instead of creating a synonym or
  compatibility alias.

Number of call sites is not the deciding factor. A value used in three files is
not automatically a shared domain concept, and a critical state used in one
file may still deserve a named vocabulary.

Examples of established owners:

| Concept | Canonical location |
| --- | --- |
| Message types | `src/constants/messages.js` |
| System tables | `src/constants/tables.js` |
| Raft roles and packets | `src/raft/constants.js` |
| Partition lifecycle | `src/partition/partition-constants.js` |
| Table policy defaults | `src/policy/policy-constants.js` |
| Bootstrap phases | `src/bootstrap/bootstrap-constants.js` |
| Configuration keys and defaults | `src/config/` |
| Listener ports | `src/config/listener-port-model.js` |

Import the canonical definition directly or through the established
`src/constants/index.js` public barrel when that barrel already owns the export.

## What Not To Name

JavaScript-language primitives are not domain scalars. Write these directly:

```javascript
typeof value === 'string'
items.length === 0
index === -1
attempt + 1
```

Do not add new `TYPEOF.STRING`, `NUM.ZERO`, `LOCAL_NUM_ONE`, or equivalent
aliases. Existing uses are migration residue and should be inlined when nearby
work already touches them.

## Domain Vocabulary

Use a frozen object when a closed vocabulary is part of a boundary:

```javascript
const RAFT_ROLE = Object.freeze({
  FOLLOWER: 'follower',
  CANDIDATE: 'candidate',
  LEADER: 'leader',
  LEARNER: 'learner',
});
```

Use `UPPER_SNAKE_CASE` for the vocabulary object and its fixed members.
Parameterized message functions use `camelCase`:

```javascript
const PARTITION_ERROR = Object.freeze({
  NOT_FOUND: 'partition not found',
  routingFailed: (partitionId) =>
    `routing failed for partition ${partitionId}`,
});
```

## Avoid Compatibility Aliases

Do not import a canonical vocabulary and re-export it under a second name:

```javascript
// Avoid: creates two names for one concept.
const PARTITION_RAFT_ROLE = RAFT_ROLE;
```

Callers should import `RAFT_ROLE` from its owner. If a compatibility export
cannot yet be removed, treat it as migration debt rather than the example for
new code.

## Adding A Constant

1. Name the semantic concept and its owner.
2. Search for an existing vocabulary before creating one.
3. Decide whether the value is domain-wide, module-local, or an ordinary
   language literal.
4. Use one clear name and avoid aliases.
5. Freeze closed objects.
6. Document why a non-obvious threshold or policy value exists.
7. Run the repository literal, naming, lint, and targeted tests for the touched
   owner.
