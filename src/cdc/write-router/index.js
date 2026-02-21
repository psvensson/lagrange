/**
 * CDC write-router strategies.
 */

import {TYPEOF} from '../../constants/index.js';

const WRITE_ROUTER_ERROR_MSG = Object.freeze({
  EXECUTE_REQUIRED: 'Write router requires an execute function',
});

const WRITE_ROUTER_MODE = Object.freeze({
  BOOTSTRAP_DIRECT: 'bootstrap-direct',
  SQL_ROUTED: 'sql-routed',
});

function assertExecuteFunction(execute) {
  if (typeof execute !== TYPEOF.FUNCTION) {
    throw new Error(WRITE_ROUTER_ERROR_MSG.EXECUTE_REQUIRED);
  }
}

class BootstrapDirectWriteRouter {
  constructor(options = {}) {
    assertExecuteFunction(options.execute);
    this.executeFn = options.execute;
    this.mode = WRITE_ROUTER_MODE.BOOTSTRAP_DIRECT;
  }

  async execute(sql, params = []) {
    return this.executeFn(sql, params);
  }
}

class SqlWriteRouter {
  constructor(options = {}) {
    assertExecuteFunction(options.execute);
    this.executeFn = options.execute;
    this.mode = WRITE_ROUTER_MODE.SQL_ROUTED;
  }

  async execute(sql, params = []) {
    return this.executeFn(sql, params);
  }
}

function createBootstrapDirectWriteRouter(options = {}) {
  return new BootstrapDirectWriteRouter(options);
}

function createSqlWriteRouter(options = {}) {
  return new SqlWriteRouter(options);
}

export {
  WRITE_ROUTER_ERROR_MSG,
  WRITE_ROUTER_MODE,
  BootstrapDirectWriteRouter,
  SqlWriteRouter,
  createBootstrapDirectWriteRouter,
  createSqlWriteRouter,
};
