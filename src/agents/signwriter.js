// THE SIGNWRITER — one job: making sure people can find the shop.
//
// Every other agent asks whether a product is good. This one only asks whether
// anybody will ever see it, which is a different question with different
// answers. A beautiful listing nobody reaches earns exactly nothing.
import Agent from './base.js';
import { sweep } from '../etsy/seo-audit.js';
import { rulesFor } from '../knowledge/index.js';
import { setSetting, getSetting } from '../core/db.js';

export class Signwriter extends Agent {
  constructor() {
    super({
      id: 'signwriter',
      name: 'The Signwriter',
      title: 'search keeper',
      station: 'signpost',
      division: 'etsy',
      colour: '#c9a86a',
      handles: ['signwriter.audit'],
      voice: 'Specific and unhurried. Names the listing, the problem, and the one thing to change.',
      purpose: `
You do one thing: you make sure buyers can find what this shop sells. You read
every listing's title, tags and description the way Etsy's search does, and you
read the whole catalogue the way a shop owner should — looking for listings
that compete with each other and for searches nobody here is covering.

You never rewrite a live listing yourself. Changing one resets what Etsy has
learned about it, so you say what to change and let the owner choose when.
You would rather leave a good-enough title alone than churn it.`,
    });
  }

  async handle(job) {
    this.moveTo('signpost', 'reading the shop');

    const settleDays = rulesFor('signwriter').seo?.settleDays ?? 28;
    const report = sweep({ settleDays });

    // Keep the last sweep so the panel and the station counter have something
    // to show without redoing the work on every state refresh.
    setSetting('seo_report', JSON.stringify({ ...report, at: Date.now() }));

    if (!report.checked) {
      this.say('Nothing listed yet, so there is nothing to be found. I will look again once something is up.', {
        kind: 'seo',
        discord: false,
      });
      this.setStatus('idle');
      return { result: { checked: 0 } };
    }

    // Say the useful thing, not the whole thing. The panel has the full list;
    // the feed gets what a person would act on today.
    const worst = report.findings.filter((f) => f.severity === 'bad').slice(0, 3);
    if (worst.length) {
      this.say(
        `${report.summary}\n` + worst.map((f) => `• ${f.sku ? `${f.sku}: ` : ''}${f.what}`).join('\n'),
        { kind: 'seo', level: 'warn', meta: { counts: report.counts } }
      );
    } else if (report.counts.poor) {
      this.say(report.summary, { kind: 'seo', discord: false });
    } else {
      // Quiet is the goal, and saying so once a day is worth more than silence
      // that could equally mean the agent has stopped running.
      const lastQuiet = Number(getSetting('seo_last_quiet', '0'));
      if (Date.now() - lastQuiet > 20 * 3600 * 1000) {
        setSetting('seo_last_quiet', String(Date.now()));
        this.say(`${report.checked} listing(s) checked. Nothing hurting your search position.`, {
          kind: 'seo',
          level: 'good',
          discord: false,
        });
      }
    }

    this.goHome();
    return { result: { checked: report.checked, counts: report.counts } };
  }
}

export default Signwriter;
