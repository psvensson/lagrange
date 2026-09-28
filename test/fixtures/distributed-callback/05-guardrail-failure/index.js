'use strict';

module.exports.run = async function run(ctx, _batch) {
  try {
    await ctx.call(
      'SELECT * FROM nodes',
      [],
      async (_rows, stageCtx) => {
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
