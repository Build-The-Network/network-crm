'use strict';

// Structured logger — every line is prefixed with ISO timestamp + level tag.
// One hour of errors is tracked for the /health endpoint.

const ERROR_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const errorTimestamps = []; // rolling list of error epoch-ms

function timestamp() {
  return new Date().toISOString();
}

function pruneErrors() {
  const cutoff = Date.now() - ERROR_WINDOW_MS;
  while (errorTimestamps.length && errorTimestamps[0] < cutoff) {
    errorTimestamps.shift();
  }
}

function info(tag, msg, ...args) {
  console.log(`[${timestamp()}] [INFO] [${tag}]`, msg, ...args);
}

function warn(tag, msg, ...args) {
  console.warn(`[${timestamp()}] [WARN] [${tag}]`, msg, ...args);
}

function error(tag, msg, ...args) {
  console.error(`[${timestamp()}] [ERROR] [${tag}]`, msg, ...args);
  pruneErrors();
  errorTimestamps.push(Date.now());
}

function errorsLastHour() {
  pruneErrors();
  return errorTimestamps.length;
}

module.exports = { info, warn, error, errorsLastHour };
