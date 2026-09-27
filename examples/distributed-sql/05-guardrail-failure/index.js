'use strict';

// Negative example: deliberately request nested work that is not bounded by the
// contract. Success for this example means the runtime refuses it. Keeping the
// refusal executable is more useful than merely documenting the guardrail.
module.exports.run = async function run(ctx, _batch) {
  try {
    await ctx.call(
      'SELECT * FROM nodes',
      [],
      async (_rows, stageCtx) => {
        // No predicate, LIMIT, or other bound: this is the call the runtime
        // must reject rather than allowing accidental recursive fanout.
        await stageCtx.call('SELECT * FROM nodes');
        return null;
      },
      {batchSize: 1},
    );

    return [{
      ok: false,
      error: 'Expected nested unbounded call to be rejected',
    }];
  } catch (error) {
    return [{
      ok: true,
      error: error.message,
    }];
  }
};
