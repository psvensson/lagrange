# Preparation input: dependency path clarification

This additive clarification preserves the original acquisition-custody finding
in `original-handoff-preparation-acquisition-custody-2026-10-21.md`, SHA256
`995c603e3c211954ca196c1c8576a23df4f6ef3aff3ecedb2c29c9d36d409335`,
as published on the preservation branch at
`32bbec205b8dd4d64ce1f5b78b4712068dbe108a`. Its bytes and conclusions are
unchanged.

Two C++ references in that finding use a dependency-relative path: the native
constructor reference at line 28 and the dependency hash table at line 39.
Both identify `node_modules/better-sqlite3/src/better_sqlite3.cpp`, inspected
from the locally installed better-sqlite3 11.10.0. Neither identifies a file
under Lagrange's own source directory. The original note's dependency source
hash remains `551abc7d9feea0ad2acb97f33125c5e8800d6d84a1da4390512d08743f924b1e`.
This is source inspection, not lab binary attestation or an injected native
constructor-failure experiment.

The documentation-current checker interprets those two inline references as
repository-relative paths. Its existing implementation has no external
classification or supersession registry for a frozen finding. In the next
unit's worktree, the captured check reports 294 errors: 292 inherited and two
from the byte-identical copy of this raw input. Those findings remain reported;
this clarification does not make the check pass. Do not rewrite the recorded
input, relocate it, add an exemption, or claim a green audit from this note.

The next unit may continue its separately reviewed bounded source attempt.
Documentation audit repair and any eventual landing remain separate gates.
