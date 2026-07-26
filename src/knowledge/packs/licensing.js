// Who owns what. The single most expensive thing a printables shop can get
// wrong, because the bill arrives long after the sale and lands on the owner.
export default {
  id: 'licensing',
  division: 'etsy',
  title: 'Fonts, images and the right to sell what you made',
  summary: 'What may be used commercially, what may be resold, and what the buyer is allowed to do.',

  lessons: [
    'Every asset in a product needs a licence that permits commercial use AND resale of the finished item. Those are two different permissions and plenty of free assets grant only the first.',
    '"Free for personal use" means the font may not go in anything sold. This is the most common licence mistake in printables, and it is a mistake the foundry can invoice for years later.',
    'Google Fonts under the SIL Open Font License is safe for products sold commercially: the rendered text in a PDF is fine, and the font file itself may be embedded. What is never allowed is selling the font file as a product.',
    'This shop generates its own vector layouts using the PDF base fonts, so there is no font licence to worry about unless someone deliberately adds one. If a design brief asks for a specific font, the licence has to be checked before it is used, not after.',
    'Canva\'s free plan grants commercial use of most elements, but explicitly forbids selling a design where a stock element is the main thing being sold. A planner using a small icon is fine; a wall art print that IS the stock illustration is not.',
    'Canva Pro elements and templates may not be redistributed as editable templates. Selling a Canva template link to a design built from Pro elements breaks the licence even though the design itself is yours.',
    'Unsplash and Pexels licences permit commercial use but forbid selling the photo unmodified as the product. A mockup using a photo as a background is fine; a photo print is not.',
    'AI-generated imagery has unsettled copyright in most jurisdictions, which means it may not be defensible as yours and may not be registrable. Avoid it as the substance of a product; a background texture is a different risk to a wall art print.',
    'PLR ("private label rights") and "commercial use" bundles sold cheaply on Etsy are frequently themselves infringing. Buying a licence from someone who never had the right to grant it is no defence.',
    'Clip art bought from another Etsy seller usually comes with a licence limiting the number of end products or forbidding use in items sold as digital files. Read the limit; it is often 200 physical items and zero digital.',
    'Quotes are copyrighted. Song lyrics, film lines and poetry are not free to print because they are short. Attributed quotes from a named living author are the riskiest of all.',
    'Bible verses, folk sayings and out-of-copyright literature are safe, but a specific modern translation of the Bible is itself copyrighted. The King James Version is safe in most of the world.',
    'The shop must be able to answer "where did this come from?" for every element of every product. If that cannot be answered, the element does not go in.',
    'The buyer is buying a licence, not the artwork. Say so plainly: personal use, one household, no resale, no redistribution, no commercial use of the file itself.',
    'A buyer printing the planner for their own family is personal use. A childminder printing thirty copies for a nursery is commercial use, and that is a separate, more expensive licence you may choose to offer.',
    'Teachers are the exception worth planning for: classroom use of a single-classroom licence is normal in this market and expected. Say whether it is included rather than leaving it ambiguous.',
    'Never claim "commercial use included" unless the product genuinely carries that licence, because buyers treat that phrase as permission to resell your work.',
    'Every product ships a licence line in the read-me. A file with no stated terms is assumed by many buyers to be theirs to do anything with.',
    'Do not use the words "royalty free" to describe what the buyer gets. It has a specific meaning in stock licensing and it is not what a printables buyer is being sold.',
    'If a takedown arrives, comply first and argue afterwards. Etsy suspends shops that accumulate unanswered infringement reports, and a suspended shop loses every listing at once.',
  ],

  rules: {
    // Phrases that grant the buyer rights the shop does not intend to grant.
    // Checked in listing copy: saying these makes them true in the buyer's mind.
    overreachingLicenceClaims: [
      'commercial use included',
      'resell rights',
      'resale rights',
      'private label rights',
      'plr included',
      'unlimited commercial use',
      'you may resell',
      'sell as your own',
      'full rights',
      'royalty free',
    ],

    // Every product must say what the buyer may do with it. Any one of these
    // in the read-me satisfies it — the point is that terms exist, not that
    // they are worded a particular way.
    licenceStatementCues: [
      'personal use',
      'personal, non-commercial',
      'not for resale',
      'do not resell',
      'one household',
      'single classroom',
      'licence',
      'license',
    ],

    // Asset origins that need a human to confirm the licence before use.
    assetSourcesNeedingCheck: [
      'canva pro',
      'creative fabrica',
      'design bundles',
      'font bundles',
      'plr',
      'private label',
      'midjourney',
      'dall-e',
      'stable diffusion',
    ],
  },
};
