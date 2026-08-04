/**
 * Local handler module imported by lagrange.service.js — its presence
 * proves the generated entry's static import graph spans more than one
 * developer module without any bundling or source rewriting.
 */
const HEALTH_BODY = Object.freeze({status: 'ok'});

function accountHealthHandler(_request, {json}) {
  return json(HEALTH_BODY);
}

export {accountHealthHandler};
