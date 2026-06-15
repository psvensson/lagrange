> Method kernel — portable. Keep the mechanism; this file is domain-neutral.

# Closure Ledger Index

## Document Role

This index is the front page of the closure ledger. The ledger is the working
artifact for hard-to-close and intermittent debugging: it narrows every stuck
failure to **one violated invariant at a time**, with one authoritative owner,
one witness, and one minimal repro.

Use this index to:

- see every open and closed closure record at a glance;
- find the file that holds a given record's full body;
- reach the grammar that every record must follow.

Do not use this index to hold record bodies. The index is a table; the detail
lives per record.

## How The Ledger Works

The atomic unit is one **closure record**. One record represents one violated
invariant — not one scenario run, not one stack trace. Two scenarios that fail on
the same first violated invariant share a record; one scenario that exposes two
distinct first violations becomes two records.

- Each record lives in its own file under
  [`records/CL-###.md`](records/) (e.g. `records/CL-007.md`).
- This `INDEX.md` carries one row per record so the set is scannable without
  opening every file.
- The record grammar — required fields, the status / concern / failure-class
  taxonomies, the stable-witness and first-violated-invariant rules, and the
  canonical record template — lives in
  [`closure-grammar.md`](closure-grammar.md). Read it before authoring or
  editing a record.

The loop is fixed: add or update a record **before** changing code, name the
first violated invariant, capture a stable witness, reduce the repro scope, land
the fix and its guard, rerun the gate, then update the record's status and
evidence. A record reaches `closed` only when the invariant is satisfied, the
guard exists and passes, the relevant gate reruns cleanly, and no forbidden
promotion input was introduced to obtain the green result.

## Records

| ID | Status | Concern | Title |
| --- | --- | --- | --- |
| [CL-000](records/CL-000.example.md) | narrowed | request-correctness | Concurrent signup returns 500 (uniqueness check races the insert) — worked example |

CL-000 is an illustrative example only; replace it with this project's own
records. When you add a record, append a row here and create the matching file
under `records/`.
