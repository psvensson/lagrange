# Rejected first implementation, preserved before correction

Base: fefc75988807f2e89733ebaf2bc3a844d8ca311f. Apply source.patch to this base
in an isolated checkout to reproduce the exact three product files and
main checker reviewed. SOURCE-SHA256SUMS records their SHA256 identities.
The initial audit test is preserved verbatim as initial-audit-test.txt:
ea50aba3299671a4ea6ce864dcdcf109817afd571d96a1c4197a1608cad1ae27.
No repaired-source native run occurred on this rejected candidate.

Independent review required: remove fresh caller's extra outcome getter
read using an explicit completion decision; reject checked dependency writes
and catch shadows; require actual lexical ownership and canonical table and
diagnostic imports. The complete REVISE and following corrective attempt
are append-only Quest log entries dated 2026-10-21T05:05Z.

Preservation limitation: original audit-support hash was
4cb828494d0c72833f775808a2f1a3a11b9d9ccd956bf47eadf71eb46f919dbe.
Its bytes were not separately frozen before the bounded audit refinements
began. Neither the writer nor reviewer retained an exact copy. Therefore
this packet does not claim an executable reconstruction of that support
module or complete byte-for-byte rejected candidate. Its original reviewed
hash and findings remain recorded; no guessed reconstruction substitutes.
