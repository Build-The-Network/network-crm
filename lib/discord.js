'use strict';

// Discord REST API wrapper — invite generation only.
// Uses bot token from DISCORD_BOT_TOKEN env var.
// Channel ID is passed in from DISCORD_CHANNEL_ID env var.
//
// Rate limit: Discord enforces per-route limits. We handle 429s with
// exponential backoff up to MAX_RETRIES attempts.

const https = require('https');
const logger = require('./logger');

const DISCORD_API_BASE = 'discord.com';
const API_VERSION      = 'v10';
const MAX_RETRIES      = 5;
const BASE_BACKOFF_MS  = 1000;

function getToken() {
  const t = process.env.DISCORD_BOT_TOKEN;
  if (!t) throw new Error('DISCORD_BOT_TOKEN is not set');
  return t;
}

function getChannelId() {
  const c = process.env.DISCORD_CHANNEL_ID;
  if (!c) throw new Error('DISCORD_CHANNEL_ID is not set');
  return c;
}

/** Make an authenticated Discord API request. Returns parsed JSON body. */
function discordRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: DISCORD_API_BASE,
      path: `/api/${API_VERSION}${path}`,
      method,
      headers: {
        'Authorization': `Bot ${getToken()}`,
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Create a single-use Discord invite for the configured channel.
 * @param {number} maxAgeSecs  Invite expiry in seconds (default 86400 = 24h)
 * @returns {string}           Full invite URL, e.g. https://discord.gg/XXXXXXX
 */
async function createInvite(maxAgeSecs = 86400) {
  const channelId = getChannelId();
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    const { status, body } = await discordRequest(
      'POST',
      `/channels/${channelId}/invites`,
      {
        max_age: maxAgeSecs,   // seconds until invite expires (0 = never)
        max_uses: 1,           // single-use
        unique: true,          // generate a unique code each time
      }
    );

    if (status === 200 || status === 201) {
      const url = `https://discord.gg/${body.code}`;
      logger.info('discord', `Invite created: ${url} (expires in ${maxAgeSecs}s)`);
      return url;
    }

    if (status === 429) {
      const retryAfterMs = (body.retry_after ?? 1) * 1000;
      const delay = Math.max(retryAfterMs, BASE_BACKOFF_MS * Math.pow(2, attempt));
      logger.warn('discord', `Rate limited. Retrying in ${delay}ms (attempt ${attempt + 1})`);
      await new Promise(r => setTimeout(r, delay));
      attempt++;
      continue;
    }

    throw new Error(`Discord API error ${status}: ${JSON.stringify(body)}`);
  }

  throw new Error(`Failed to create Discord invite after ${MAX_RETRIES} attempts`);
}

module.exports = { createInvite };
