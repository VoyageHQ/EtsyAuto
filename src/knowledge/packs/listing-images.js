// The Lister: what the buyer actually looks at. For a digital download the
// images are the product — nobody can pick it up, so the photos do all the
// convincing on their own.
export default {
  id: 'listing-images',
  agent: 'lister',
  division: 'etsy',
  title: 'Listing images, and the ten seconds they get',
  summary: 'What the ten images are for, in order, and why the first one is most of the sale.',

  lessons: [
    'The first image is shown at about 230 pixels wide in search results. Whatever cannot be read at that size does not exist. Design the thumbnail first and the full-size image second.',
    'A buyer scrolling search sees your first image next to forty others for roughly one second. It has to answer "what is this" before it tries to answer anything else.',
    'Etsy allows ten images. Use all ten. Listings with three images convert worse than listings with ten, and the marginal cost of another render is nothing.',
    'A workable order: 1) what it is, at a glance. 2) every page laid out in a grid so the buyer can count them. 3) a close-up of one page so they can read the detail. 4) it printed and in use. 5) what formats and sizes are included. 6-9) the remaining pages in detail. 10) how the download works.',
    'The image showing every page in a grid is the one that stops "how many pages is this?" questions, and those questions cost more time than they look.',
    'Show the product in use, not just as flat pages. A printed chart on a fridge sells better than a perfect flat render, because the buyer is imagining their own fridge.',
    'Etsy crops the thumbnail towards square. Anything important near the edges of a 4:3 image gets cut off in search even though it looks fine on the listing page.',
    'Put text on the first image, but three or four words at most: "12 Page Budget Planner", not a paragraph. Text under about 40px in a 2000px image is illegible in the thumbnail.',
    'Say "INSTANT DOWNLOAD" or "PRINTABLE" on the first image. A buyer who thinks a physical item is coming leaves a bad review no matter how good the file is.',
    'Never put a price on an image. Prices change, images stay, and a mismatch reads as a bait and switch.',
    'Do not use a plain white background for the first image. Every listing around yours is on white; a soft tint or a real surface is what makes the eye stop.',
    'Keep one visual system across the shop: the same corner radius, the same shadow, the same three or four background tones. A cohesive grid of listings looks like a shop and an inconsistent one looks like a bootleg.',
    'Mockups must be honest. If the mockup shows a colour version and the file is black and white, that is the refund arriving in a week.',
    'Etsy wants images at least 2000px on the shortest side. Smaller and it will not offer zoom, and buyers use zoom to check whether they can actually write in the boxes.',
    'The last image earns its place by removing doubt: what you receive, how it arrives, what to do if it does not. Doubt at the last moment is what abandons a basket.',
    'A video is worth more than a tenth image if there is one to make, because it is rarer and Etsy surfaces it. A slow scroll through the pages is enough; no narration needed.',
    'Alt text on images is read by screen readers and indexed. Describe the product plainly rather than stuffing keywords into it.',
  ],

  rules: {
    images: {
      // Etsy's own limits, and what the shop should aim for inside them.
      max: 10,
      target: 8,
      // Below this a listing measurably underperforms, so the Inspector says so.
      minAcceptable: 4,
      minLongEdgePx: 2000,
      // Words the first image should carry so nobody thinks a parcel is coming.
      firstImageMustSuggest: ['printable', 'instant download', 'digital', 'download', 'print at home'],
      // Things that must never be baked into an image.
      neverOnImages: ['£', '$', '€', 'sale ends', 'discount code', 'free shipping'],
    },
  },
};
