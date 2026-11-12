# Traversal without mutable method dispatch

R2 was independently rejected at manifest
33558f869cb8f870f8cb4b56d1bc2f54c8b4d3d06dad60dfe97676ea202d2a36.
Its Set-based cycle detector introduced callback dispatch between validation and
child reads. Retained R2 experiments show eight failures/one valid control, then
nine failures/two controls in the expanded witness. The latter observes two
getter executions when Set.prototype.add installs an accessor on an array after
its descriptor check. The reviewer report and all first reds remain unchanged.

R3 removes Set from validation entirely. The private ancestor path is an array
whose entries are installed by the existing captured appendOwnArrayValue primitive,
read by index, and removed through its own length field. Cycle checks use only
identity comparison of those own entries. There is no prototype method dispatch
between a container's strict-data check and its child reads. Repeated acyclic
objects remain valid, while the existing cycle witness still refuses.

The shipping regression now covers replaced Set constructor/has/add/delete during
both encoding and decoding, plus the actual accessor-installation attack and a
shared-object control. The old standalone test is rerun unchanged for a true A/B.
This changes only the lifecycle codec and its dedicated test; the shared utility,
other owners, native/storage constructors and durable value vocabulary stay intact.
Renewed review remains Astra max, with no higher escalation tier claimed.
