/**
 * The one test-layer value owner for a node boot incarnation. Production
 * components that participate in a node boot lifecycle require an explicit
 * incarnation issued by the boot incarnation owner (>= 1, never 0; absence is
 * refused). A unit test that constructs such a component directly models a
 * node on the first boot of a virgin data directory, whose first reservation
 * is 1. Tests take the value from here: no per-test filesystem reservation,
 * no second issuer, and no test teaches that 0 means current or default.
 */
const TEST_BOOT_INCARNATION = 1;

export {TEST_BOOT_INCARNATION};
