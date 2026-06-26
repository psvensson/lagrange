# Promoted findings — quest learnings that became durable rules

Files here are source steering: each one carries a single normative statement
promoted from a Quest finding, so a hard-won lesson becomes a versioned, shared,
CI-gated guardrail instead of living only in transient external memory.

## How a file gets here

`node scripts/solve.js promote-finding --id <quest> --frontier <f> --domain <d>
[--match <substr> | --ts <iso>] [--slug <slug>]` reads the matching finding from the
quest's append-only log and writes `<date>-<quest>-<slug>.md` from `_template.md`,
then appends a matching `sources[]` entry to
`docs/steering/llm-pack.config.json`. Promotion is an explicit human act; the
command only stages the file — you still run the regeneration and review the diff.

## What the steering generator actually reads (important)

The pack generator (`scripts/generate-steering-llm-pack.js`) does **not** read this
template's front-matter for `domain` or `strength`:

- **domain** comes from the `sources[]` config entry that `promote-finding` appends
  (that is why `--domain` is required at promotion time).
- **strength** is inferred from the body text — the statement MUST contain a
  normative keyword. The generator (`inferStrength` in
  `scripts/generate-steering-llm-pack.js`) recognizes: `MUST`, `MUST NOT`, `SHALL`,
  `SHALL NOT`, `NEVER`, `DO NOT`, `FORBIDDEN`, `REQUIRED`, `SHOULD`, `MAY`, and a
  sentence-leading `ONLY`.
  A body with no such keyword is classified `info` and will NOT surface as a rule.

So: write the body as a single normative sentence. The front-matter `source:` line
is for human traceability back to the originating quest.

## After promoting

```
npm run steering:llm:pack   # regenerate the compact packs from source
npm run steering:check      # fails if the committed packs drift from source
```

A promoted finding **always** lands in `rules.json` and is immediately queryable:

```
npm run rule -- --id <assigned-id>      # e.g. GOV-0062
npm run rule -- --domain governance     # browse the domain
```

It enters the **compact** domain pack (`docs/steering/llm/<domain>.md`) only if its
score clears that domain's `maxRules` cap — promoted findings default to
`priority: 100`, so in a crowded domain they are queryable but may not surface in the
always-loaded pack. To force one into the compact pack, raise its `priority` in the
`sources[]` entry above the cap cutoff. The rule CLI is the durable home either way;
the source citation points back to this file (whose name carries the quest id).

Review the regenerated rule, then commit.
