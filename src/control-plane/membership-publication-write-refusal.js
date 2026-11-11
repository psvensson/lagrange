// Why a membership publication coordinator refused a publication write
// before asking the publications owner (the owner's and the change's own
// refusals are named by control-plane-publication-change.js and
// membership-publication-row-changes.js).
const MEMBERSHIP_PUBLICATION_WRITE_REFUSAL = Object.freeze({
  // The coordinator was built without the publications owner.
  PUBLICATIONS_OWNER_UNAVAILABLE: 'publications_owner_unavailable',
  // A node acknowledges only for itself.
  NOT_SELF: 'acknowledging_node_not_self',
  // Only the publications write leader abandons a publication.
  NOT_PUBLICATION_OWNER: 'not_publication_owner',
});

export {MEMBERSHIP_PUBLICATION_WRITE_REFUSAL};
