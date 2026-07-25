// THE SCRIBE — writes the listing. Shelves its work in the Library.
import Agent from './base.js';
import { getProduct, ideaFor, advance, saveListing } from '../pipeline/products.js';
import { buildListing, copyPrompt } from '../etsy/listing.js';
import { auditListing } from '../etsy/seo.js';

export class Copywriter extends Agent {
  constructor() {
    super({
      id: 'copywriter',
      name: 'The Scribe',
      title: 'listing writer',
      station: 'library',
      colour: '#c8a7d8',
      handles: ['copywriter.listing'],
      voice: 'Warm, plain English, British spelling. Writes like a person who has used the thing.',
      purpose: `
You write the title, tags and description that decide whether anyone ever
finds or buys the product.

Rules you never break:
- Never claim anything that is not true. No invented reviews, no "best
  selling", no fake scarcity, no made-up statistics.
- No "unlock", "elevate", "game changer", "in today's fast-paced world".
- No emoji, no exclamation marks, no ALL CAPS shouting in the title.
- Say clearly that it is a digital download and nothing gets posted. Being
  vague about that is the number one cause of refund requests and bad reviews.
- The first line of the description must speak to the buyer's problem, not
  announce the product name.`,
    });
  }

  async handle(job) {
    const product = getProduct(job.payload.productId);
    if (!product) return { result: { skipped: 'product gone' } };
    const idea = ideaFor(product) || { title: product.title, keywords: [], category: product.category };
    this.moveTo('library', `writing ${product.sku}`);

    const pageCount = product.spec?.pages?.length || 5;
    const body = await this.thinkOr(() => null, {
      task: `writing ${product.sku}`,
      maxTokens: 1200,
      temperature: 0.9,
      prompt: copyPrompt({ idea, spec: product.spec, pageCount, research: product.research }),
    });

    const listing = buildListing({
      idea,
      product,
      spec: product.spec,
      pageCount,
      research: product.research,
      body: body ? String(body).trim() : null,
    });

    saveListing(product.id, { ...listing, status: 'draft' });

    const problems = auditListing(listing);
    this.say(
      `${product.sku} written. Title ${listing.title.length}/140, ${listing.tags.length} tags` +
        (problems.length ? `, ${problems.length} thing(s) for the Inspector.` : ', clean.'),
      { kind: 'wrote', level: problems.length ? 'warn' : 'good', meta: { productId: product.id } }
    );

    advance(product);
    this.goHome();
    return { result: { title: listing.title, tags: listing.tags, problems } };
  }
}

export default Copywriter;
