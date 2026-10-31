'use strict';

// Email sending via Gmail SMTP + App Password (nodemailer).
// Requires GMAIL_USER and GMAIL_APP_PASSWORD env vars.
// App Password: generate at myaccount.google.com → Security → App Passwords
// (requires 2-Step Verification to be enabled on the account).

const nodemailer = require('nodemailer');
const fs         = require('fs');
const path       = require('path');
const logger     = require('./logger');

let _transport = null;

function transport() {
  if (!_transport) {
    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;
    if (!user || !pass) throw new Error('GMAIL_USER and GMAIL_APP_PASSWORD must be set');

    _transport = nodemailer.createTransport({
      host:   'smtp.gmail.com',
      port:   465,
      secure: true,
      auth:   { user, pass },
    });
  }
  return _transport;
}

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');

/** Load a template file and replace {{key}} placeholders. */
function renderTemplate(filename, vars = {}) {
  const filePath = path.join(TEMPLATES_DIR, filename);
  let text = fs.readFileSync(filePath, 'utf8');

  for (const [key, value] of Object.entries(vars)) {
    text = text.replaceAll(`{{${key}}}`, value ?? '');
  }

  // Extract Subject from first line ("Subject: ...")
  const lines = text.split('\n');
  let subject = '';
  let bodyStart = 0;
  if (lines[0].startsWith('Subject:')) {
    subject   = lines[0].replace(/^Subject:\s*/, '').trim();
    bodyStart = lines[1] === '' ? 2 : 1;
  }
  const body = lines.slice(bodyStart).join('\n').trim();

  return { subject, body };
}

/** Convert plain-text body to minimal HTML. */
function textToHtml(text) {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const paras = escaped.split(/\n{2,}/);
  return paras.map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('\n');
}

/**
 * Send an email rendered from a template file.
 * @param {string} to        Recipient email address
 * @param {string} template  Filename in /templates (e.g. 'network-invite.txt')
 * @param {object} vars      Template variable substitutions
 */
async function sendTemplate(to, template, vars = {}) {
  const from = process.env.GMAIL_USER;
  const { subject, body } = renderTemplate(template, vars);

  await transport().sendMail({
    from: `"Luccas" <${from}>`,
    to,
    subject,
    text: body,
    html: textToHtml(body),
  });

  logger.info('email', `Sent "${subject}" → ${to} (template: ${template})`);
}

module.exports = { sendTemplate };
