# Getting products onto Etsy

Two routes. The first needs nothing at all.

## Route 1 — the upload pack (default)

When you approve a finished product, the Shopkeeper writes everything into
`out/<SKU>-<name>/LISTING.md`:

1. The title, already within 140 characters, in a copy block.
2. All 13 tags, already the legal length, comma separated.
3. The full description.
4. The list of files to upload as the digital download.
5. The listing images to upload.
6. A table of the settings Etsy will ask for — digital, made to order, quantity
   999, and so on.

Open the **Shopfront** on the dashboard, press **save pngs**, and your browser
converts the SVG listing images into 2400×1800 PNGs saved next to them. That is
the only step that needs the dashboard rather than the terminal, because
rasterising is free in a browser and awkward everywhere else.

Then in Etsy: *Add a listing → Digital → paste, paste, paste, upload*. Around
two minutes.

Afterwards, paste the live listing URL into the Shopfront so the Ledger can
track it.

## Route 2 — the API

Optional, and it does not skip your approval — it just saves the pasting.

You already have a keystring and shared secret from
<https://www.etsy.com/developers/your-apps>. Those alone cannot create a
listing: Etsy's v3 API needs an OAuth access token tied to your shop.

```bash
npm run etsy:auth     # gets the token
npm run etsy:check    # proves it works, and finds your shop id
```

That script:

1. Builds the authorise URL with PKCE and prints it.
2. Waits on `http://localhost:3003/oauth/redirect` for Etsy to send you back.
   Add exactly that URL to your app's callback URLs in the Etsy developer
   console first, or Etsy will refuse.
3. Exchanges the code for an access token and a refresh token.
4. Works out your shop id.
5. Writes all three into `.env`.

Scopes requested: `listings_r listings_w listings_d shops_r shops_w
transactions_r`.

From then on, approving a listing creates a **draft** in your shop. The refresh
token renews itself, so this is a one-off.

### The safety rail

```
ETSY_PUBLISH_MODE=draft     # default — nothing ever goes on sale by itself
ETSY_PUBLISH_MODE=active    # listings go live the moment you approve them
```

Leave it on `draft` until you have seen a few come through and you trust it.

### Images and the API

Etsy will not take SVG. Press **save pngs** in the Shopfront *before*
approving, and the Shopkeeper attaches them to the draft. Approve first and the
draft is created without images, and it will tell you so — you can add them in
Etsy or rebuild and re-approve.

## Pricing

The Researcher gives a range, and the price lands inside it based on page count
and demand, ending in `.99` or `.49` like the rest of the marketplace. Nothing
stops you overriding it — edit the product's price and press rebuild.

Digital downloads sell on perceived value. A five-page pack with a specific
audience beats a thirty-page pack of filler, and buyers can tell the difference
from the preview images, which is why the Maker is told page one must be useful
on its own.

## What is deliberately not automated

- **Etsy Ads.** Money, and no agent should be spending yours.
- **Replying to buyers.** Your shop's voice, your reputation.
- **Going live without you.** Three gates, all on purpose.

## Etsy's rules worth knowing

- Digital listings must be honest that nothing is posted. The Inspector rejects
  descriptions that are vague about it.
- No brand, character or TV names in titles or tags. The Researcher flags this
  as a risk on every product; if you use a model, it will usually catch a
  specific one.
- You must have the right to sell what you list. Everything the Maker produces
  is generated vector work from this repo, so it is yours — but if you rebuild
  something in Canva, stick to elements marked free for commercial use and
  avoid its stock photography.
