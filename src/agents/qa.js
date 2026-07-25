// THE INSPECTOR — the last gate before anything reaches your shop. Opens
// every file, reads every tag, and refuses to wave through work that would
// earn a one-star review.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import Agent from './base.js';
import config from '../core/config.js';
import { getProduct, ideaFor, assetsFor, getListing, setStage } from '../pipeline/products.js';
import { auditListing } from '../etsy/seo.js';
import { ask } from '../core/approvals.js';
import { money } from '../core/util.js';

export class QA extends Agent {
  constructor() {
    super({
      id: 'qa',
      name: 'The Inspector',
      title: 'quality gate',
      station: 'review-hall',
      colour: '#e08a8a',
      handles: ['qa.review'],
      voice: 'Blunt but fair. Lists what is wrong and what would fix it. No praise padding.',
      purpose: `
You are the last check before a product reaches the shop. You look for the
things that cause refunds and bad reviews: files that will not open, pages
that will print clipped, titles that break Etsy's rules, descriptions that do
not admit the product is a download, and prices that make no sense.

You would rather send something back than let it out half done.`,
    });
  }

  async handle(job) {
    const product = getProduct(job.payload.productId);
    if (!product) return { result: { skipped: 'product gone' } };
    const idea = ideaFor(product) || { title: product.title };
    const listing = getListing(product.id);
    this.moveTo('review-hall', `checking ${product.sku}`);

    const problems = [];
    const notes = [];

    // --- the files ---------------------------------------------------------
    const assets = assetsFor(product.id);
    const pdfs = assets.filter((a) => a.kind === 'pdf' && a.role === 'deliverable');
    const mockups = assets.filter((a) => a.role === 'mockup');

    if (!pdfs.length) problems.push('No PDF was produced at all.');
    for (const pdf of pdfs) {
      const path = join(config.root, pdf.path);
      if (!existsSync(path)) {
        problems.push(`Missing file on disk: ${pdf.path}`);
        continue;
      }
      const buf = readFileSync(path);
      if (buf.length < 2000) problems.push(`${pdf.label} is suspiciously small (${buf.length} bytes).`);
      const head = buf.subarray(0, 8).toString('latin1');
      const tail = buf.subarray(-1024).toString('latin1');
      if (!head.startsWith('%PDF-')) problems.push(`${pdf.label} is not a valid PDF.`);
      if (!tail.includes('%%EOF')) problems.push(`${pdf.label} is truncated.`);
    }
    if (!pdfs.some((p) => /a4/i.test(p.label)) || !pdfs.some((p) => /letter/i.test(p.label))) {
      const fixedRatio = (product.spec?.pages || []).every((p) => p.paper && p.paper !== 'A4');
      if (!fixedRatio) notes.push('Only one paper size was produced. Buyers outside the UK will ask.');
    }
    if (mockups.length < 2) problems.push('Fewer than two listing images. Etsy listings need at least five ideally.');
    const pageCount = product.spec?.pages?.length || 0;
    if (pageCount < 2) problems.push('The product is a single page. That is thin for a paid download.');

    // --- the listing -------------------------------------------------------
    if (!listing) {
      problems.push('No listing copy was written.');
    } else {
      problems.push(...auditListing(listing));
      if (listing.description && /!{1,}/.test(listing.title)) {
        notes.push('Exclamation marks in the title read as spam on Etsy.');
      }
      const price = Number(listing.price || product.price || 0);
      if (price > 0 && idea.price_high && price > Number(idea.price_high) * 1.6) {
        notes.push(`Price ${money(price, config.currency)} is well above the researched ceiling.`);
      }
    }

    // --- a model can catch what a rule cannot ------------------------------
    if (listing) {
      const secondOpinion = await this.thinkOr(() => null, {
        task: `reviewing ${product.sku}`,
        json: true,
        maxTokens: 900,
        prompt: `
Review this Etsy listing for a digital download. Be strict but only flag real
problems — things that would cause a refund, a policy strike or a bad review.

Title: ${listing.title}
Tags: ${listing.tags.join(', ')}
Price: ${money(listing.price, config.currency)}
Pages: ${pageCount}
Description:
${String(listing.description).slice(0, 2500)}

Return JSON: { "problems": ["..."], "notes": ["..."], "verdict": "pass" | "fix" }
Empty arrays are a perfectly good answer.`.trim(),
      });
      if (secondOpinion?.problems?.length) {
        problems.push(...secondOpinion.problems.slice(0, 6).map((p) => String(p).slice(0, 200)));
      }
      if (secondOpinion?.notes?.length) {
        notes.push(...secondOpinion.notes.slice(0, 4).map((p) => String(p).slice(0, 200)));
      }
    }

    // --- verdict -----------------------------------------------------------
    if (problems.length) {
      this.say(
        `${product.sku} sent back. ${problems.length} problem(s): ${problems.slice(0, 3).join(' · ')}`,
        { kind: 'rejected', level: 'warn', meta: { productId: product.id, problems } }
      );
      setStage(product.id, 'design', { status: 'blocked' });
      ask({
        kind: 'question',
        refId: product.id,
        agent: this.id,
        station: 'review-hall',
        title: `${product.sku} failed review — ${problems[0]}`,
        detail:
          [`**${product.title}**`, '', 'Problems:', ...problems.map((p) => `- ${p}`)].join('\n') +
          '\n\nRebuild sends it back to the Workshop. Park it leaves it alone.',
        options: [
          { value: 'rebuild', label: 'Rebuild it' },
          { value: 'park', label: 'Park it for now' },
          { value: 'abandon', label: 'Abandon it' },
        ],
      });
      this.goHome();
      return { result: { verdict: 'fail', problems } };
    }

    setStage(product.id, 'ready', { status: 'active' });
    this.say(
      `${product.sku} passed. ${pageCount} pages, ${mockups.length} images, ` +
        `priced at ${money(listing?.price, config.currency)}.` +
        (notes.length ? ` Worth knowing: ${notes[0]}` : ''),
      { kind: 'passed', level: 'good', meta: { productId: product.id, notes } }
    );

    ask({
      kind: 'listing',
      refId: product.id,
      agent: this.id,
      station: 'review-hall',
      title: `${product.sku} is ready to list — ${product.title}`,
      detail: [
        `**${listing?.title || product.title}**`,
        '',
        `Price: ${money(listing?.price, config.currency)}  ·  ${pageCount} pages  ·  ${mockups.length} images`,
        `Tags: ${(listing?.tags || []).join(', ')}`,
        notes.length ? `\nNotes: ${notes.join(' · ')}` : '',
        '',
        config.etsy.enabled
          ? 'Approving creates a DRAFT listing in your Etsy shop. It never goes on sale on its own.'
          : 'Approving packs an upload folder in out/ with the title, tags and description ready to paste.',
      ].join('\n'),
      options: [
        { value: 'publish', label: config.etsy.enabled ? 'Create the draft' : 'Pack it for upload' },
        { value: 'changes', label: 'Send back for changes' },
        { value: 'hold', label: 'Hold it' },
      ],
    });

    this.goHome();
    return { result: { verdict: 'pass', notes } };
  }
}

export default QA;
