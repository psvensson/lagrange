/**
 * createCostTable — the per-op virtual-time cost model for the VirtualNetwork
 * single-core seam (deterministic-directed-testing-plan.md cost-model increment).
 *
 * A cost table maps an operation key -> {fixedMs, perUnitMs}. cost(opKey, inputSize)
 * returns the whole-millisecond virtual-time charge for that op:
 *   round(fixedMs + perUnitMs * inputSize), floored at 0.
 * Unknown opKeys cost 0 (additive/safe — an un-modeled op never charges), so a
 * partial cost table only slows the ops it names and is byte-identical elsewhere.
 *
 * Production-inertness: nothing in src/ constructs a cost table; it is a test-harness
 * input handed to createVirtualNetwork({costTable}). With no cost table injected the
 * network charges nothing and is byte-for-byte the current behavior.
 */

const COST_TABLE_NUM_ZERO = 0;

/**
 * Build a cost table from a spec mapping opKey -> {fixedMs, perUnitMs}.
 * @param {Object} [spec] - opKey -> {fixedMs, perUnitMs}.
 * @return {{cost: function(string, number): number}}
 */
function createCostTable(spec = {}) {
  const table = spec && typeof spec === 'object' ? spec : {};
  return Object.freeze({
    /**
     * Virtual-ms charge for an op on an input of inputSize units. Unknown ops cost 0.
     * @param {string} opKey
     * @param {number} [inputSize=0]
     * @return {number} non-negative whole milliseconds.
     */
    cost(opKey, inputSize) {
      const entry = Object.prototype.hasOwnProperty.call(table, opKey) ?
        table[opKey] :
        null;
      if (!entry) {
        return COST_TABLE_NUM_ZERO;
      }
      const fixedMs = Number(entry.fixedMs) || COST_TABLE_NUM_ZERO;
      const perUnitMs = Number(entry.perUnitMs) || COST_TABLE_NUM_ZERO;
      const units = Number(inputSize) || COST_TABLE_NUM_ZERO;
      return Math.max(
        COST_TABLE_NUM_ZERO,
        Math.round(fixedMs + perUnitMs * units),
      );
    },
  });
}

export {createCostTable};
