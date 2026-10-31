'use strict';

// POLLER C — Reject Sender
//
// Runs every 60 seconds. Finds rows where:
//   - "Status"       = "Rejected"
//   - "Email Sent at" is empty
//
// For each match:
//   - Renders network-reject.txt (or ascension-acknowledge.txt for Ascension rows)
//   - Sends email
//   - PATCHes Notion row: Email Sent at = NOW

const notion = require('../lib/notion');
const email  = require('../lib/email');
const logger = require('../lib/logger');

const TAG = 'reject-sender';

async function runOnce() {
  logger.info(TAG, 'Poll started');

  let rows;
  try {
    rows = await notion.query({
      and: [
        { property: 'Status',        status: { equals: 'Rejected' } },
        { property: 'Email Sent at', date:   { is_empty: true } },
      ],
    });
  } catch (err) {
    logger.error(TAG, 'Query failed:', err.message);
    return;
  }

  if (rows.length === 0) {
    logger.info(TAG, 'No rows pending reject email');
    return;
  }

  logger.info(TAG, `Found ${rows.length} row(s) pending reject email`);

  for (const row of rows) {
    const pageId      = row.id;
    const name        = notion.getText(row, 'Name')  || 'Applicant';
    const recipientEmail = notion.getText(row, 'Email');
    const pipelineType   = notion.getText(row, 'Pipeline Type');

    if (!recipientEmail) {
      logger.warn(TAG, `[${name}] (${pageId}) has no Email — skipping`);
      continue;
    }

    // Template selection: default to network-reject; use ascension template
    // if Pipeline Type = "Ascension Waitlist" (future-proofing).
    const template = pipelineType === 'Ascension Waitlist'
      ? 'network-reject.txt'   // same template for now; swap when Ascension-specific copy is ready
      : 'network-reject.txt';

    try {
      await email.sendTemplate(recipientEmail, template, { name });

      const today = new Date().toISOString().split('T')[0];
      await notion.patch(pageId, {
        'Email Sent at': notion.dateProp(today),
      });

      logger.info(TAG, `[${name}] reject sent → ${recipientEmail}`);

    } catch (err) {
      logger.error(TAG, `[${name}] (${pageId}) failed:`, err.message);
      // Do NOT mark as sent — will retry next poll
    }

    // Rate-limit buffer
    await new Promise(r => setTimeout(r, 200));
  }

  logger.info(TAG, 'Poll complete');
}

module.exports = { runOnce };
