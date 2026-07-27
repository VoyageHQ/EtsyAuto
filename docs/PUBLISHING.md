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
npm run etsy:push     # upload now, in the foreground, with nothing hidden
npm run etsy:redraft  # replace drafts that went up without images
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

### What actually goes up

A draft created this way arrives complete:

* up to **10 listing images**, watermarked with your logo;
* up to **5 download files** — the PDFs, and any spreadsheets alongside them,
  each labelled with its real content type so Etsy does not call a CSV a PDF;
* the title, the 13 tags, the materials and the description.

Etsy will not take SVG, and the mockups are SVG so they can embed the real
pages at any size for nothing. The Shopkeeper rasterises them itself at upload
time, using whatever browser the machine has — Chrome, Chromium, Edge or Brave.
You do not need to press **save pngs** first; that button just does the same
job in your own browser, and any PNGs it has already made are reused.

If no browser can be found the product is **held**, not listed without pictures:
Etsy cannot publish an imageless listing, so a draft without one is not a
finished job. It shows in the Shopfront with a **send to etsy** button.

### When nothing appears in your Etsy drafts

Uploading needs three variables in `.env`: `ETSY_KEYSTRING`,
`ETSY_ACCESS_TOKEN` and `ETSY_SHOP_ID`. Any one of them empty used to send
every approved listing down the pack-it-into-a-folder route with a cheerful
message, which is indistinguishable from success if you are not looking for it.

Now:

* **Some but not all set** — the Shopkeeper refuses, names the empty line, and
  holds the product. The Office tile says which variable is missing.
* **Etsy refuses the listing** — reported as a failure with Etsy's own words,
  and the product held. A `401` means your sign-in expired: `npm run etsy:auth`.
* **None set** — packing is the whole job, and it says so.

To see all of it at once, in the foreground:

```bash
npm run etsy:push              # what would go up, nothing changed
npm run etsy:push -- --yes     # upload, and print Etsy's real reply
npm run etsy:push -- HV-0004 --yes
```

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
