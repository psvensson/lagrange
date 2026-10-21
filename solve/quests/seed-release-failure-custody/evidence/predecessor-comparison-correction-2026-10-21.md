# Additive predecessor comparison correction

This corrects only the interpretation of the first-assertion equality field in
the immutable predecessor packet. The original report, matrix, raw attempts and
64-file manifest remain unchanged. The packet manifest is
`a721689a8676e46ee545fc345745a918149cb2f2fec67317d8f1d7b1c16c6239`;
the original report is
`8a2ec6cde8fc54e74284009a2c5d21f4c2de679106c3ed7bcd6bdeea978965a7`.

Independent review
`428e9c6f7a67ceb3579e79d1b65275365e14b220170265c04f062d511079fd15`
verified all 102 exact test pairs, the three runner-owner blobs, all five
planned host/ledger sets, retry0, and 204 raw result-block extractions. It
approves the bounded observation that all 102 selected files reported red on
both candidate393 and predecessor847 on their original hosts. It does not
approve an unchanged cause for every file or a passing product gate.

The corrected breakdown is **96 matching indexed first failing assertion
texts, five differing texts, and one pair with no indexed first assertion**.
The original equality field counted `null == null` for
`test/bootstrap/phase-failure-handling.property.test.js` as a match. That file
was killed by the unchanged 600000ms runner budget: candidate600045ms,
predecessor600089ms, 14 reported assertion counts in each. The outer verdicts
are at original candidate controller line34285 and predecessor Lenovo
controller line2899. This is a matching runner-timeout observation, not a
matching assertion or established internal cause. The five text variations
retain the bounds stated in the original report.

The complete captured controller streams are preserved, but the canonical
runner itself elided verbose TAP from three predecessor streams: Adams430444,
Lenovo84028, and TV375780 bytes. Preserving those streams does not restore the
omitted child output. Exact material causes beyond the retained excerpts remain
unproven; matching outer verdicts cannot fill that gap. The independently
reviewed four prioritized examples remain valid at their stated attribution
ceilings. No rerun, budget change or failure waiver follows from this correction.

The original candidate run remains 1159 pass, 99 reported red and three
unreported; its separate same-candidate Lenovo supplement reported those three
red. The predecessor slice measures all 102 resulting red observations only.
It does not measure the other 1159 candidate-green files at the predecessor or
exclude masked/new failures behind an earlier failing assertion. Host factors
remain as recorded. The broad gate is RED and all historical obligations remain.

Restore the four immutable predecessor assets using
`predecessor-publication-2026-10-21.json` before checking the complete original
manifest. Canonical evidence upload downloaded and rehashed each asset before
recording it. This is evidence preservation, not Solver landing, product
publication, main movement or release certification.
