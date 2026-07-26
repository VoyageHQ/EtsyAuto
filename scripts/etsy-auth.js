// Gets the Etsy access token, which is the bit the API actually needs.
//
//   node scripts/etsy-auth.js
//
// Etsy uses OAuth 2.0 with PKCE. Your keystring and shared secret on their own
// cannot create a listing; they only let you ask for a token. This script does
// the whole dance and writes the result into .env for you.
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import config from '../src/core/config.js';

const PORT = Number(process.env.ETSY_OAUTH_PORT || 3003);
const REDIRECT = `http://localhost:${PORT}/oauth/redirect`;
const SCOPES = ['listings_r', 'listings_w', 'listings_d', 'shops_r', 'shops_w', 'transactions_r'];

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;

if (!config.etsy.keystring) {
  console.error(
    '\nETSY_KEYSTRING is missing from .env. Copy it from https://www.etsy.com/developers/your-apps\n'
  );
  process.exit(1);
}

const base64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
const verifier = base64url(randomBytes(48));
const challenge = base64url(createHash('sha256').update(verifier).digest());
const state = base64url(randomBytes(12));

const authUrl =
  'https://www.etsy.com/oauth/connect?' +
  new URLSearchParams({
    response_type: 'code',
    redirect_uri: REDIRECT,
    scope: SCOPES.join(' '),
    client_id: config.etsy.keystring,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

console.log(`\n${bold('Etsy authorisation')}\n`);
console.log('1. Open this in the browser where you are signed in to Etsy:\n');
console.log(`   ${authUrl}\n`);
console.log(`2. Approve it. Etsy sends you back to ${dim(REDIRECT)} and this script catches the code.\n`);
console.log(dim(`   Waiting on port ${PORT}… (ctrl-c to give up)\n`));

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== '/oauth/redirect') {
    res.writeHead(404).end('Nothing here.');
    return;
  }

  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error || !code) {
    res.writeHead(400, { 'content-type': 'text/html' }).end(
      `<h1>Etsy said no</h1><p>${error || 'no code came back'}</p>`
    );
    console.error(`\nEtsy returned an error: ${error || 'no code'}\n`);
    process.exit(1);
  }
  if (returnedState !== state) {
    res.writeHead(400).end('State mismatch — start again.');
    console.error('\nState did not match. Run the script again.\n');
    process.exit(1);
  }

  try {
    const tokenRes = await fetch('https://api.etsy.com/v3/public/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: config.etsy.keystring,
        redirect_uri: REDIRECT,
        code,
        code_verifier: verifier,
      }),
    });
    const text = await tokenRes.text();
    if (!tokenRes.ok) throw new Error(`${tokenRes.status}: ${text.slice(0, 300)}`);
    const tokens = JSON.parse(text);

    // The token's own user id is the prefix before the dot.
    const userId = String(tokens.access_token).split('.')[0];
    const auth = {
      'x-api-key': config.etsy.keystring,
      authorization: `Bearer ${tokens.access_token}`,
    };

    // Finding the shop used to fail silently, which left people staring at an
    // Office that still said "link up" with no idea why. Try both endpoints
    // Etsy offers and keep whatever went wrong so it can be printed.
    let shopId = config.etsy.shopId;
    let shopWhy = '';
    if (!shopId) {
      for (const path of [
        'https://api.etsy.com/v3/application/users/me',
        `https://api.etsy.com/v3/application/users/${userId}/shops`,
      ]) {
        try {
          const res = await fetch(path, { headers: auth });
          const text = await res.text();
          if (!res.ok) {
            shopWhy = `${path.split('/application')[1]} → HTTP ${res.status}: ${text.slice(0, 160)}`;
            continue;
          }
          const data = JSON.parse(text);
          const found = data.shop_id || data.results?.[0]?.shop_id;
          if (found) {
            shopId = String(found);
            break;
          }
          shopWhy = `${path.split('/application')[1]} → answered, but carried no shop_id`;
        } catch (err) {
          shopWhy = `${path.split('/application')[1]} → ${err.message}`;
        }
      }
    }

    writeEnv({
      ETSY_ACCESS_TOKEN: tokens.access_token,
      ETSY_REFRESH_TOKEN: tokens.refresh_token,
      ...(shopId ? { ETSY_SHOP_ID: shopId } : {}),
    });

    res.writeHead(200, { 'content-type': 'text/html' }).end(
      '<h1>Done</h1><p>You can close this tab. The tokens are in your .env file.</p>'
    );

    console.log(`${green('✓')} Access token stored in .env`);
    console.log(`${green('✓')} Refresh token stored in .env ${dim('(it renews itself from now on)')}`);
    if (shopId) {
      console.log(`${green('✓')} Shop id ${shopId} stored in .env\n`);
    } else {
      console.log(`\n${bold('Could not work out your shop id.')} The token is fine — this is the last step.\n`);
      if (shopWhy) console.log(dim(`  Etsy said: ${showWhy(shopWhy)}\n`));
      console.log('  Usually this means the Etsy account you just authorised has no open shop,');
      console.log('  or the shop belongs to a different account. A shop still in draft on Etsy');
      console.log('  does not have an id yet.\n');
      console.log(`  Run ${bold('npm run etsy:check')} — it retries the lookup, writes the id into .env`);
      console.log('  if it finds one, and tells you exactly what Etsy replied if it does not.\n');
    }
    console.log(dim('Listings will be created as DRAFTS. Nothing goes on sale unless you set'));
    console.log(dim('ETSY_PUBLISH_MODE=active yourself.\n'));
    server.close(() => process.exit(0));
  } catch (err) {
    res.writeHead(500, { 'content-type': 'text/html' }).end(`<h1>Failed</h1><pre>${err.message}</pre>`);
    console.error(`\nToken exchange failed: ${err.message}\n`);
    process.exit(1);
  }
});

server.listen(PORT);

const showWhy = (why) => String(why).replace(/\s+/g, ' ').slice(0, 220);

/** Update .env in place, keeping comments and anything already there. */
function writeEnv(values) {
  const path = join(config.root, '.env');
  let lines = existsSync(path) ? readFileSync(path, 'utf8').split(/\r?\n/) : [];
  for (const [key, value] of Object.entries(values)) {
    const index = lines.findIndex((line) => line.trim().startsWith(`${key}=`));
    if (index === -1) lines.push(`${key}=${value}`);
    else lines[index] = `${key}=${value}`;
  }
  writeFileSync(path, lines.join('\n'));
}
