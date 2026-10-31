'use strict';

// POLLER A — Pipeline Inference
//
// Runs every 60 seconds. Finds Notion rows where "Pipeline Type" is empty
// and infers the correct pipeline from which fields are populated:
//
//   "Hours/Weekly Available" non-empty → Network Beta   | Status: Applied
//   "Current Income"         non-empty → Ascension Waitlist | Status: Signed Up
//   Neither                            → log warning, skip
//
// This compensates for Tally's inability to set static property values.

const notion = require('../lib/notion');
const logger  = require('../lib/logger');

const TAG = 'pipeline-inference';

async function runOnce() {
  logger.info(TAG, 'Poll started');

  // Fetch rows where Pipeline Type is empty (select property is null/empty)
  let rows;
  try {
    rows = await notion.query({
      property: 'Pipeline Type',
      select: { is_empty: true },
    });
  } catch (err) {
    logger.error(TAG, 'Query failed:', err.message);
    return;
  }

  if (rows.length === 0) {
    logger.info(TAG, 'No rows need inference');
    return;
  }

  logger.info(TAG, `Found ${rows.length} row(s) to infer`);

  for (const row of rows) {
    const pageId = row.id;
    const name   = notion.getText(row, 'Name') || '(no name)';

    // Check Network Beta signal: "Hours/Weekly Available" field present
    const hoursField = notion.getText(row, 'Hours/Weekly Available');

    // Check Ascension Waitlist signal: "Current Income" field present
    const incomeField = notion.getText(row, 'Current Income');

    try {
      if (hoursField) {
        await notion.patch(pageId, {
          'Pipeline Type': notion.selectProp('Network Beta'),
          'Status':        notion.statusProp('Applied'),
        });
        logger.info(TAG, `[${name}] → Network Beta / Applied (hours field: "${hoursField}")`);

      } else if (incomeField) {
        await notion.patch(pageId, {
          'Pipeline Type': notion.selectProp('Ascension Waitlist'),
          'Status':        notion.statusProp('Signed Up'),
        });
        logger.info(TAG, `[${name}] → Ascension Waitlist / Signed Up (income field: "${incomeField}")`);

      } else {
        logger.warn(TAG, `[${name}] (${pageId}) has no inference signal — skipping. Likely manual or test row.`);
      }

      // Pace writes: Notion rate limit is ~3 req/s; each patch = 1 req.
      // With 100ms between writes we stay well under the limit.
      await new Promise(r => setTimeout(r, 100));

    } catch (err) {
      logger.error(TAG, `Failed to patch [${name}] (${pageId}):`, err.message);
    }
  }

  logger.info(TAG, 'Poll complete');
}

module.exports = { runOnce };
