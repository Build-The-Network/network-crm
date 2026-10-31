'use strict';

// POLLER B — Invite Sender
//
// Runs every 60 seconds. Finds Network Beta rows where:
//   - "Confirm Send"  is checked
//   - "Email Sent at" is empty
//   - "Pipeline Type" = "Network Beta"
//
// For each match:
//   1. Generate a single-use, 24h Discord invite via bot API
//   2. Render and send network-invite.txt email via Gmail
//   3. PATCH Notion row: Discord Invite URL, Email Sent at, uncheck Confirm Send
//
// On failure: log error, do NOT mark row as sent (will retry next poll).
// After 3 consecutive failures on the same row, write "ERROR: ..." to Notes.

const notion  = require('../lib/notion');
const discord = require('../lib/discord');
const email   = require('../lib/email');
const logger  = require('../lib/logger');

const TAG              = 'invite-sender';
const INVITE_EXPIRY_H  = 24;
const INVITE_EXPIRY_S  = INVITE_EXPIRY_H * 3600;

// Track consecutive failure counts per page ID so we can escalate to Notion notes.
const failureCounts = new Map();

async function runOnce() {
  logger.info(TAG, 'Poll started');

  let rows;
  try {
    rows = await notion.query({
      and: [
        { property: 'Confirm Send',  checkbox: { equals: true } },
        { property: 'Email Sent at', date:     { is_empty: true } },
        { property: 'Pipeline Type', select:   { equals: 'Network Beta' } },
      ],
    });
  } catch (err) {
    logger.error(TAG, 'Query failed:', err.message);
    return;
  }

  if (rows.length === 0) {
    logger.info(TAG, 'No rows pending invite');
    return;
  }

  logger.info(TAG, `Found ${rows.length} row(s) pending invite`);

  for (const row of rows) {
    const pageId      = row.id;
    const name        = notion.getText(row, 'Name')  || 'Member';
    const recipientEmail = notion.getText(row, 'Email');

    if (!recipientEmail) {
      logger.warn(TAG, `[${name}] (${pageId}) has no Email — skipping`);
      continue;
    }

    try {
      // 1. Generate Discord invite
      const inviteUrl = await discord.createInvite(INVITE_EXPIRY_S);

      // 2. Send invite email
      await email.sendTemplate(recipientEmail, 'network-invite.txt', {
        name,
        discord_invite_url: inviteUrl,
        expiry_hours:       String(INVITE_EXPIRY_H),
      });

      // 3. Patch Notion row — mark as sent, store invite URL, uncheck Confirm Send
      const now = new Date().toISOString();
      await notion.patch(pageId, {
        'Discord Invite URL': notion.urlProp(inviteUrl),
        'Email Sent at':      notion.dateProp(now.split('T')[0]),
        'Confirm Send':       notion.checkboxProp(false),
      });

      // Clear failure count on success
      failureCounts.delete(pageId);

      logger.info(TAG, `[${name}] invite sent → ${recipientEmail} | Discord: ${inviteUrl}`);

    } catch (err) {
      const failures = (failureCounts.get(pageId) ?? 0) + 1;
      failureCounts.set(pageId, failures);

      logger.error(TAG, `[${name}] (${pageId}) failed (attempt ${failures}):`, err.message);

      // After 3 consecutive failures, write error to Notion Notes so it surfaces in the dashboard.
      if (failures >= 3) {
        try {
          await notion.patch(pageId, {
            'Notes': notion.textProp(`ERROR: ${err.message}`),
          });
          logger.warn(TAG, `[${name}] written to Notion Notes after ${failures} failures`);
        } catch (patchErr) {
          logger.error(TAG, `[${name}] also failed to write error to Notes:`, patchErr.message);
        }
      }
    }

    // Rate-limit buffer between rows
    await new Promise(r => setTimeout(r, 200));
  }

  logger.info(TAG, 'Poll complete');
}

module.exports = { runOnce };
