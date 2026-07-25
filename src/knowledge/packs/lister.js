// The Shopkeeper: getting a listing live without tripping over Etsy's plumbing.
export default {
  id: 'lister',
  agent: 'lister',
  division: 'etsy',
  title: 'Publishing mechanics',
  summary: 'Images, files, settings and the things that quietly break a listing.',

  lessons: [
    'The first listing image is the thumbnail, and it is the entire click decision. It must show the product itself, readable at the size of a postage stamp, not a lifestyle scene.',
    'Etsy displays listing images at 4:3. Build at 2000 pixels wide or more so it stays sharp on a laptop, and check the important text is not near the edges where the crop bites.',
    'Use the whole gallery. A sensible order is: hero, what you get, a close-up someone can actually read, the pages laid out, then how it works.',
    'Etsy accepts up to five digital files per listing, each up to 20MB. If a product needs more, bundle related pages into one PDF rather than shipping eight separate files.',
    'Name the files the way the buyer will see them in their downloads folder. "adhd-cleaning-chart-A4.pdf" is helpful; "final_v3_new.pdf" looks unprofessional and gets messaged about.',
    'Set quantity to 999 and auto-renew on for every digital listing. A digital item that sells out because quantity was 1 is a silent, expensive mistake.',
    'Digital listings need no shipping profile and no processing time. If Etsy asks for either, the listing type is wrong.',
    'Fill in the attributes and pick the most specific category available. Attributes feed Etsy search directly and most sellers leave them blank.',
    'Create the listing as a draft first and look at it as a buyer would before it goes live. The preview catches image order and title truncation that nothing else does.',
    'When the API refuses a listing, read the actual error before retrying. Repeated failed attempts against the same bad payload is how an app gets rate limited.',
    'Never change a live listing\'s title and tags repeatedly. Etsy re-learns the listing each time and the ranking resets; give a change four weeks before judging it.',
    'Renewing a listing does not reset its history and is not a ranking trick. Renew because the listing expired, not as a strategy.',
    'Record the live listing URL against the product as soon as it is up. Without it nothing downstream can track what the listing earns.',
  ],

  rules: {
    images: { minWidth: 2000, ratio: '4:3', min: 4, ideal: 7 },
    files: { max: 5, maxBytes: 20 * 1024 * 1024 },
    order: ['hero', 'contents', 'closeup', 'pages', 'how it works'],
    settings: { quantity: 999, autoRenew: true, processingTime: null, shippingProfile: null },
  },
};
