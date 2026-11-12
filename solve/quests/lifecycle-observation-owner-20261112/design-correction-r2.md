# Evidence-container validation correction

The first implementation was independently rejected at manifest
cd7fb17b47028aab36c90b21f03d1298618942af73004d418c7687f6892ebda1.
The report remains unchanged in test-output/lifecycle-observation-20261112/final-review.md.
Its two source-derived counterexamples were then measured on the unchanged candidate:
the dedicated nested-container regression has nine intended failures and one valid
control. Exact source and raw TAP are retained. This supersedes no first red.

The lifecycle codec must establish that every evidence container is data before
serialization. It now traverses containers using the existing isRecord and
isDenseDataArray primitives, reading members only after that container is known to
hold own enumerable data. It rejects cycles and noncanonical arrays, including
accessors, inherited indexes, extra named/Symbol fields and subclasses. Scalar
serialization remains with serializeJsonData. This is the lifecycle carrier's
validation, not a second general serializer or a change to the shared utility.

Both decode and encode use explicit own serializer options (spacing 0, sortKeys
false). Inherited option getters cannot execute or make valid evidence unavailable.
The dedicated tests cover both encode and decode under those polluted prototypes,
and rejection followed by valid retirement on the same owner. Existing canonical
hostile-intrinsics helpers restore every mutation. Valid empty/dense nested arrays,
NULL and empty-object terminal evidence remain valid.

The ambient-intrinsics audit invocation scanned zero files because its protected
domain excludes these files. It supplies no lifecycle coverage and will be labeled
not applicable, not used as proof. Source review and engaged adversarial witnesses
provide the relevant evidence. All other previously measured observations retain
their stated limits; a renewed independent review must bind the corrected candidate.
