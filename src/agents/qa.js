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
import { recordFailures } from '../core/retro.js';
import { rulesFor } from '../knowledge/index.js';
import {
  findTrademarks,
  findBannedPhrases,
  findPlaceholders,
  findShameLanguage,
  findOverPromises,
  findFiller,
  findMedicalClaims,
  findPolicyTraps,
  findOverreachingLicence,
  licenceTermsStated,
  imageProblems,
} from '../knowledge/apply.js';
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
      const minBytes = rulesFor('qa').thresholds?.minPdfBytes ?? 3000;
      if (buf.length < minBytes) {
        problems.push(`${pdf.label} is suspiciously small (${buf.length} bytes).`);
      }
      const head = buf.subarray(0, 8).toString('latin1');
      const tail = buf.subarray(-1024).toString('latin1');
      if (!head.startsWith('%PDF-')) problems.push(`${pdf.label} is not a valid PDF.`);
      if (!tail.includes('%%EOF')) problems.push(`${pdf.label} is truncated.`);
    }
    if (!pdfs.some((p) => /a4/i.test(p.label)) || !pdfs.some((p) => /letter/i.test(p.label))) {
      const fixedRatio = (product.spec?.pages || []).every((p) => p.paper && p.paper !== 'A4');
      if (!fixedRatio) notes.push('Only one paper size was produced. Buyers outside the UK will ask.');
    }
    const bar = rulesFor('qa').thresholds || {};

    // For a digital download the images are the product, so read them rather
    // than counting them: the listing-images pack knows what the first one
    // has to say and what must never be baked into any of them.
    problems.push(
      ...imageProblems(
        mockups.map((m) => {
          const abs = join(config.root, m.path || '');
          return {
            label: m.label,
            role: m.role,
            svg: /\.svg$/i.test(m.path || '') && existsSync(abs) ? readFileSync(abs, 'utf8') : undefined,
          };
        })
      )
    );

    const pageCount = product.spec?.pages?.length || 0;
    if (pageCount < (bar.minPages ?? 3)) {
      problems.push(
        `${pageCount} page(s) is thin for a paid download. Under ${bar.minPages ?? 3} needs to be a poster, not a pack.`
      );
    }

    // --- what the knowledge packs say to refuse ----------------------------
    // These run with or without a model, because a trademark in a title is a
    // shop-closing problem and must never depend on a model noticing it.
    const listingText = listing
      ? `${listing.title} ${listing.description} ${(listing.tags || []).join(' ')}`
      : product.title;
    const fileNames = assets.map((a) => a.path).join(' ');

    const trademarks = findTrademarks(listingText, fileNames, product.title);
    if (trademarks.length) {
      problems.push(
        `Trademark risk — remove "${trademarks.join('", "')}" from the listing and the filenames. ` +
          'This is what closes shops.'
      );
    }

    const banned = findBannedPhrases(listingText);
    if (banned.length) {
      problems.push(`Unprovable or filler claims: "${banned.slice(0, 3).join('", "')}".`);
    }

    const placeholders = findPlaceholders(listingText);
    if (placeholders.length) {
      problems.push(`Unfinished content left in: "${placeholders.join('", "')}".`);
    }

    const specText = JSON.stringify(product.spec || {});
    const shame = findShameLanguage(specText);
    if (shame.length) {
      problems.push(
        `Shaming language on the pages: "${shame.join('", "')}". These buyers have been told they are ` +
          'lazy quite enough.'
      );
    }

    const overPromised = findOverPromises(listingText, product.spec);
    if (overPromised.length) {
      problems.push(
        `The listing promises "${overPromised.join('", "')}" but no such file is included.`
      );
    }

    const filler = findFiller(listing?.description || '');
    if (filler.length > 1) {
      notes.push(`Copy reads as machine-written: "${filler.slice(0, 2).join('", "')}".`);
    }

    // A supportive product and a medical device claim are separated by one
    // verb. "Helps with" is the shop's whole business; "treats" is regulated.
    const medical = findMedicalClaims(listingText + ' ' + specText);
    if (medical.length) {
      problems.push(
        `Medical claim: "${medical.join('", "')}". Supportive is fine, therapeutic is regulated — ` +
          'say what the product helps someone do, never what it treats.'
      );
    }

    const policyTraps = findPolicyTraps(listingText);
    if (policyTraps.length) {
      problems.push(
        `Against Etsy policy: "${policyTraps.join('", "')}". This suspends shops rather than losing sales.`
      );
    }

    // Buyers read a licence promise as permission. If the product does not
    // carry that licence, the sentence is the whole dispute.
    const overreach = findOverreachingLicence(listingText);
    if (overreach.length) {
      problems.push(
        `The listing grants rights the shop does not intend: "${overreach.join('", "')}". ` +
          'Remove it unless the product genuinely carries that licence.'
      );
    }

    // Every product must tell the buyer what they may do with it. Silence is
    // read as permission to do anything.
    const readme = assets.find((a) => /READ-ME/i.test(a.path || ''));
    if (listing && !licenceTermsStated(`${listing.description} ${readme?.label || ''}`)) {
      notes.push('Nothing tells the buyer what they may do with the file. Say "personal use" plainly.');
    }


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
      // Second time seeing a problem class? Teach whoever caused it, so the
      // same rejection does not keep happening.
      recordFailures(product.id, problems);
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
