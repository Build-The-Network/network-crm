const { google } = require('googleapis');
const http = require('http');

const [,, CLIENT_ID, CLIENT_SECRET] = process.argv;
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Usage: node get-gmail-token.js <CLIENT_ID> <CLIENT_SECRET>');
  process.exit(1);
}

const REDIRECT_URI = 'http://localhost:3001/callback';

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/gmail.send'],
});

console.log('\nOpen this URL in your browser and sign in as your-address@gmail.com:\n');
console.log(authUrl);
console.log('\nWaiting for callback on http://localhost:3001/callback ...\n');

const server = http.createServer(async (req, res) => {
  const { pathname, query } = new URL(req.url, 'http://localhost:3001');
  if (pathname !== '/callback') return;

  const code = new URLSearchParams(query).get('code');
  res.end('Done — check your terminal.');
  server.close();

  try {
    const { tokens } = await oauth2Client.getToken(code);
    console.log('SUCCESS. Set these 3 env vars in Railway:\n');
    console.log(`GMAIL_CLIENT_ID=${CLIENT_ID}`);
    console.log(`GMAIL_CLIENT_SECRET=${CLIENT_SECRET}`);
    console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
  } catch (e) {
    console.error('Failed to get tokens:', e.message);
  }
});

server.listen(3001);
