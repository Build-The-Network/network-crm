'use strict';

// ─── Credential loader ────────────────────────────────────────────────────────
// Load dotenv first so all process.env reads downstream see the values.
// Also reads .notion-token / .notion-db-id from gitignored credential files
// if the env vars aren't already set (e.g. in local dev without Railway).

require('dotenv').config();

const fs   = require('fs');
const path = require('path');

function loadCredFile(filename, envKey) {
  if (process.env[envKey]) return; // already set (Railway injects via env vars)
  const filePath = path.join(__dirname, filename);
  if (fs.existsSync(filePath)) {
    process.env[envKey] = fs.readFileSync(filePath, 'utf8').trim();
  }
}

loadCredFile('.notion-token',       'NOTION_TOKEN');
loadCredFile('.notion-db-id',       'NOTION_DB_ID');
loadCredFile('.discord-channel-id', 'DISCORD_CHANNEL_ID');

// ─── Dependencies ─────────────────────────────────────────────────────────────

const express = require('express');
const logger  = require('./lib/logger');

const pipelineInference = require('./pollers/pipeline-inference');
const inviteSender      = require('./pollers/invite-sender');
const rejectSender      = require('./pollers/reject-sender');

// ─── Health state ─────────────────────────────────────────────────────────────

const startTime = Date.now();
const lastPoll  = {
  pipeline_inference: null,
  invite_sender:      null,
  reject_sender:      null,
};

// ─── Poller runner ────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 60_000; // 60 seconds

async function runPoller(name, fn, lastPollKey) {
  try {
    await fn();
    lastPoll[lastPollKey] = new Date().toISOString();
  } catch (err) {
    // Individual poller errors are caught here as a last resort.
    // Each poller's runOnce() already has internal try/catch.
    logger.error(name, 'Unhandled error in poller:', err.message);
  }
}

function startPollers() {
  // Run all three pollers immediately on startup, then on interval.
  const pollers = [
    { name: 'pipeline-inference', fn: pipelineInference.runOnce, key: 'pipeline_inference' },
    { name: 'invite-sender',      fn: inviteSender.runOnce,      key: 'invite_sender'      },
    { name: 'reject-sender',      fn: rejectSender.runOnce,      key: 'reject_sender'      },
  ];

  for (const { name, fn, key } of pollers) {
    // Initial run
    runPoller(name, fn, key);

    // Recurring interval — each poller runs on its own independent timer
    // so a slow poll on one doesn't delay the others.
    setInterval(() => runPoller(name, fn, key), POLL_INTERVAL_MS);
  }

  logger.info('server', `All pollers started (interval: ${POLL_INTERVAL_MS / 1000}s)`);
}

// ─── Express server ───────────────────────────────────────────────────────────

const app  = express();
const PORT = process.env.PORT || 3000;

app.get('/health', (_req, res) => {
  res.json({
    status:          'ok',
    uptime_seconds:  Math.floor((Date.now() - startTime) / 1000),
    last_poll:       lastPoll,
    errors_last_hour: logger.errorsLastHour(),
  });
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  logger.info('server', `Listening on port ${PORT}`);
  startPollers();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('server', 'SIGTERM received — shutting down');
  process.exit(0);
});
