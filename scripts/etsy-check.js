// Is the Etsy connection actually working, and which shop is it pointing at?
//
//   npm run etsy:check
//
// The authorisation script gets you a token. This tells you whether that token
// works, finds your shop id if it is missing, and — when something is wrong —
// says what Etsy actually replied rather than leaving you to guess. The first
// version of etsy-auth.js swallowed a failed shop lookup silently, which is
// exactly the kind of silence that wastes an evening.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import config from '../src/core/config.js';

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const amber = (s) => `\x1b[33m${s}\x1b[0m`;

const BASE = 'https://api.etsy.com/v3';

console.log(`\n${bold('Etsy connection check')}\n`);

// --- what we have to work with ---------------------------------------------

const keystring = config.etsy.keystring;
const token = config.etsy.accessToken;
const refresh = config.etsy.refreshToken;

const report = (label, ok, detail = '') =>
  console.log(`  ${ok ? green('✓') : red('×')} ${label}${detail ? dim(`  ${detail}`) : ''}`);

report('ETSY_KEYSTRING is set', Boolean(keystring), keystring ? `${keystring.slice(0, 6)}…` : 'missing');
report('ETSY_ACCESS_TOKEN is set', Boolean(token), token ? `${String(token).split('.')[0]}.…` : 'missing');
report('ETSY_REFRESH_TOKEN is set', Boolean(refresh), refresh ? 'present' : 'missing — you will have to re-auth in an hour');
report('ETSY_SHOP_ID is set', Boolean(config.etsy.shopId), config.etsy.shopId || 'missing — this script will try to find it');

if (!keystring || !token) {
  console.log(`\n${red('Stop here.')} Run ${bold('npm run etsy:auth')} first.\n`);
  process.exit(1);
}

const headers = { 'x-api-key': keystring, authorization: `Bearer ${token}` };

/** Call Etsy and always come back with something printable. */
async function ask(path) {
  try {
    const res = await fetch(`${BASE}${path}`, { headers });
    const text = await res.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    return { ok: false, status: 0, body: `network: ${err.message}` };
  }
}

// --- does the token work at all? -------------------------------------------

console.log(`\n${bold('Talking to Etsy')}\n`);

const me = await ask('/application/users/me');
if (me.ok) {
  report('the token is accepted', true, `user ${me.body.user_id ?? '?'}`);
} else {
  report('the token is accepted', false, `HTTP ${me.status}`);
  console.log(`\n  Etsy said: ${dim(JSON.stringify(me.body).slice(0, 300))}\n`);
  if (me.status === 401) {
    console.log('  A 401 means the token has expired or was revoked. Run npm run etsy:auth again.\n');
  } else if (me.status === 403) {
    // Etsy's own words for this are "API key not found or not active", which
    // covers three quite different situations. Say all three.
    console.log('  A 403 here means Etsy did not accept the keystring, not the token. Either:');
    console.log('    · ETSY_KEYSTRING has a typo — check it against your app page;');
    console.log('    · the app has not been approved for API access yet (Etsy reviews these); or');
    console.log('    · the app was created, then deleted or deactivated.\n');
    console.log('  https://www.etsy.com/developers/your-apps\n');
  } else if (me.status === 404) {
    console.log('  A 404 on /users/me means this account has no Etsy user record the API can see,');
    console.log('  which usually means you authorised with the wrong account.\n');
  }
  process.exit(1);
}

// --- which shop? -----------------------------------------------------------

let shopId = config.etsy.shopId || '';
let shopName = '';

// users/me carries the shop id directly for most accounts.
if (!shopId && me.body?.shop_id) shopId = String(me.body.shop_id);

// Failing that, ask for the shops this user owns.
if (!shopId) {
  const userId = me.body?.user_id || String(token).split('.')[0];
  const shops = await ask(`/application/users/${userId}/shops`);
  if (shops.ok) {
    const found = shops.body?.shop_id || shops.body?.results?.[0]?.shop_id;
    if (found) shopId = String(found);
    shopName = shops.body?.shop_name || shops.body?.results?.[0]?.shop_name || '';
  } else {
    report('looked up your shop', false, `HTTP ${shops.status}`);
    console.log(`\n  Etsy said: ${dim(JSON.stringify(shops.body).slice(0, 300))}\n`);
  }
}

if (shopId) {
  const shop = await ask(`/application/shops/${shopId}`);
  if (shop.ok) {
    shopName = shop.body?.shop_name || shopName;
    report('found your shop', true, `${shopName || 'unnamed'} (${shopId})`);
    report('listings can be read', true, `${shop.body?.listing_active_count ?? '?'} active listings`);
  } else {
    report('found your shop', false, `shop ${shopId} → HTTP ${shop.status}`);
    console.log(`\n  Etsy said: ${dim(JSON.stringify(shop.body).slice(0, 300))}\n`);
  }
} else {
  report('found your shop', false, 'no shop id anywhere');
  console.log(`
  ${amber('This is the usual cause:')} the Etsy account you authorised does not have an
  open shop, or the shop is on a different account to the one you signed in
  with. Etsy also returns nothing here while a shop is still in draft — it has
  to be opened before it has an id.

  If you know your shop is open, find the id by hand:

    1. Sign in to Etsy and open your Shop Manager.
    2. The URL of any of your own listings contains /listing/<listing_id>/ —
       open one, then run:

         curl -s -H "x-api-key: ${keystring}" \\
              -H "authorization: Bearer $ETSY_ACCESS_TOKEN" \\
              "${BASE}/application/listings/<listing_id>" | grep shop_id

    3. Put the number in .env as ETSY_SHOP_ID and run this check again.
`);
  process.exit(1);
}

// --- write it back so it stops being a question ----------------------------

if (shopId && shopId !== config.etsy.shopId) {
  const path = join(config.root, '.env');
  const lines = existsSync(path) ? readFileSync(path, 'utf8').split(/\r?\n/) : [];
  const index = lines.findIndex((line) => line.trim().startsWith('ETSY_SHOP_ID='));
  if (index === -1) lines.push(`ETSY_SHOP_ID=${shopId}`);
  else lines[index] = `ETSY_SHOP_ID=${shopId}`;
  writeFileSync(path, lines.join('\n'));
  console.log(`\n  ${green('✓')} Wrote ETSY_SHOP_ID=${shopId} into .env`);
}

// --- can it actually do the job? -------------------------------------------

console.log(`\n${bold('Permissions the Shopkeeper needs')}\n`);

const listings = await ask(`/application/shops/${shopId}/listings?limit=1`);
report('read your listings (listings_r)', listings.ok, listings.ok ? '' : `HTTP ${listings.status}`);

const receipts = await ask(`/application/shops/${shopId}/receipts?limit=1`);
report(
  'read your sales (transactions_r)',
  receipts.ok,
  receipts.ok ? 'the Ledger can track earnings' : `HTTP ${receipts.status} — earnings tracking will be off`
);

// Writing is deliberately not tested: the only honest test is creating a
// listing, and creating one nobody asked for is exactly what this project
// promises never to do. The scope was requested at authorisation; if it was
// refused, the first real listing will say so plainly.
console.log(`  ${dim('· write access is not tested here — see the note below')}`);

console.log(`
${bold('Where that leaves you')}

  ${green('Connected.')} ${shopName || 'Your shop'} (${shopId})
  New listings will be created as ${bold(config.etsy.publishMode.toUpperCase())}.

  Restart the dashboard and the Office will say "Connected" instead of "link up".
  ${dim('npm start')}

  Write access is not checked by this script on purpose: the only real test is
  creating a listing, and creating one you did not ask for is the thing this
  project promises not to do. Approve one product in the Review Hall and watch
  it appear as a draft in Etsy — that is the honest test.
`);
process.exit(0);
