// Slash commands, so you can run the shop from your phone.
import config from '../core/config.js';
import { all, count, getSetting, setSetting, one } from '../core/db.js';
import { agentList } from '../agents/registry.js';
import { decideIdeas, requestIdeas } from '../pipeline/orchestrator.js';
import { openApprovals, answer } from '../core/approvals.js';
import { teach } from '../core/memory.js';
import { getProductBySku, getListing, listProducts } from '../pipeline/products.js';
import { money, truncate } from '../core/util.js';

const STRING = 3;
const INTEGER = 4;

export function commandDefinitions() {
  return [
    {
      name: 'ideas',
      description: 'Ask the Scout for a fresh list of product ideas',
      options: [
        { name: 'count', description: 'How many (default 8)', type: INTEGER, required: false },
        { name: 'theme', description: 'Focus on something, e.g. adhd or christmas', type: STRING, required: false },
      ],
    },
    { name: 'queue', description: 'Show the ideas waiting for your yes or no' },
    {
      name: 'approve',
      description: 'Approve ideas by their number from /queue',
      options: [{ name: 'numbers', description: 'e.g. 1,3,5', type: STRING, required: true }],
    },
    {
      name: 'reject',
      description: 'Turn ideas down, and teach the Scout why',
      options: [
        { name: 'numbers', description: 'e.g. 2,4', type: STRING, required: true },
        { name: 'reason', description: 'Why not? This becomes a lesson.', type: STRING, required: false },
      ],
    },
    { name: 'status', description: 'What the valley is up to right now' },
    {
      name: 'teach',
      description: 'Teach an agent a rule it will follow from now on',
      options: [
        {
          name: 'agent',
          description: 'Who learns it',
          type: STRING,
          required: true,
          choices: [
            { name: 'everyone', value: 'everyone' },
            ...agentList().map((a) => ({ name: a.name, value: a.id })),
          ],
        },
        { name: 'lesson', description: 'The rule, written as an instruction', type: STRING, required: true },
      ],
    },
    {
      name: 'product',
      description: 'Look up a product by SKU',
      options: [{ name: 'sku', description: 'e.g. HV-0001', type: STRING, required: true }],
    },
    { name: 'waiting', description: 'Everything that needs a decision from you' },
  ];
}

/**
 * @param {object} interaction the raw gateway payload
 * @returns {Promise<{content: string, components?: any[]}>}
 */
export async function handleCommand(interaction) {
  const name = interaction.data?.name;
  const options = Object.fromEntries((interaction.data?.options || []).map((o) => [o.name, o.value]));

  switch (name) {
    case 'ideas': {
      requestIdeas(Number(options.count) || 8, options.theme || null);
      return {
        content:
          `The Scout is on it${options.theme ? ` — focusing on **${options.theme}**` : ''}. ` +
          'It will post the list in its own channel, then use `/queue` to rank them.',
      };
    }

    case 'queue':
      return ideaQueue();

    case 'approve':
    case 'reject': {
      const ids = resolveNumbers(options.numbers);
      if (!ids.length) return { content: 'I could not match those numbers. Run `/queue` first.' };
      const decision = name === 'approve' ? 'approved' : 'rejected';
      decideIdeas(ids, decision, options.reason || '', 'discord');
      const extra =
        name === 'reject' && options.reason
          ? ` The Scout has learned: "${options.reason}".`
          : name === 'approve'
            ? ' Production starts on the next tick.'
            : '';
      return { content: `${ids.length} idea(s) ${decision}.${extra}` };
    }

    case 'status':
      return { content: statusReport() };

    case 'teach': {
      const target = options.agent === 'everyone' ? null : options.agent;
      teach(target, options.lesson, 'discord');
      return {
        content: `Taught ${target ? `**${target}**` : 'everyone'}: "${options.lesson}". It applies from the next job onwards.`,
      };
    }

    case 'product': {
      const product = getProductBySku(String(options.sku).toUpperCase());
      if (!product) return { content: `No product with SKU ${options.sku}.` };
      const listing = getListing(product.id);
      return {
        content: [
          `**${product.title}** (${product.sku})`,
          `Stage: ${product.stage} · Status: ${product.status} · ${product.spec?.pages?.length || 0} pages`,
          listing
            ? `Price: ${money(listing.price, config.currency)}\nTags: ${listing.tags.join(', ')}`
            : 'No listing copy written yet.',
          product.dir ? `Files: \`out/${product.dir}/\`` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      };
    }

    case 'waiting': {
      const items = openApprovals();
      if (!items.length) return { content: 'Nothing needs you. The valley is getting on with it.' };
      return {
        content: items.map((a, i) => `**${i + 1}.** ${a.title}`).join('\n'),
        components: buttonRows(items.slice(0, 4)),
      };
    }

    default:
      return { content: 'I do not know that one yet.' };
  }
}

/** Buttons on a message, so approving is one tap on a phone. */
export function buttonRows(approvals) {
  return approvals.slice(0, 5).map((approval) => ({
    type: 1,
    components: approval.options.slice(0, 5).map((option, i) => ({
      type: 2,
      style: i === 0 ? 3 : 2,
      label: truncate(option.label, 78),
      custom_id: `ans:${approval.id}:${option.value}`,
    })),
  }));
}

export async function handleComponent(interaction) {
  const [kind, id, value] = String(interaction.data?.custom_id || '').split(':');
  if (kind !== 'ans') return { content: 'That button has expired.' };
  try {
    const approval = answer(id, value, 'discord');
    if (approval.kind === 'ideas') {
      return { content: 'Right — use `/queue` to see the list and `/approve 1,2` to pick.' };
    }
    return { content: `Noted: **${value}** on "${approval.title}".` };
  } catch (err) {
    return { content: `Could not do that: ${err.message}` };
  }
}

function ideaQueue() {
  const ideas = all(
    "SELECT * FROM ideas WHERE status = 'proposed' ORDER BY score DESC, created_at DESC LIMIT 15"
  );
  if (!ideas.length) {
    return { content: 'Nothing waiting. Run `/ideas` and the Scout will bring you a batch.' };
  }
  setSetting('discord_idea_index', JSON.stringify(ideas.map((i) => i.id)));

  const lines = ideas.map((idea, i) => {
    const price = `${money(idea.price_low, config.currency)}–${money(idea.price_high, config.currency)}`;
    return (
      `**${i + 1}.** ${idea.title}\n` +
      `> ${truncate(idea.pitch || '', 160)}\n` +
      `> _${idea.category} · effort ${idea.effort}/5 · demand ${idea.demand}/5 · ${price} · score ${idea.score}_`
    );
  });

  return {
    content: truncate(
      [`**${ideas.length} ideas waiting.**`, ...lines, '', 'Then: `/approve 1,3` or `/reject 2 reason`'].join('\n'),
      1900
    ),
  };
}

function resolveNumbers(input) {
  const index = JSON.parse(getSetting('discord_idea_index', '[]'));
  const numbers = String(input || '')
    .split(/[\s,]+/)
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n >= 1);
  return [...new Set(numbers)].map((n) => index[n - 1]).filter(Boolean);
}

function statusReport() {
  const waiting = count("SELECT COUNT(*) FROM ideas WHERE status = 'proposed'");
  const building = listProducts("WHERE status = 'active' AND stage NOT IN ('listed')");
  const live = count("SELECT COUNT(*) FROM listings WHERE status IN ('live','exported')");
  const needsYou = openApprovals().length;
  const campaign = one('SELECT * FROM campaigns ORDER BY starts_at DESC LIMIT 1');

  return [
    `**${config.valleyName}**`,
    `${waiting} idea(s) waiting for your yes or no.`,
    building.length
      ? `In production: ${building.map((p) => `${p.sku} ${p.title} (${p.stage})`).join(', ')}`
      : 'Nothing in production.',
    `${live} listing(s) packed or live.`,
    needsYou ? `**${needsYou} thing(s) need a decision** — /waiting` : 'Nothing needs a decision.',
    campaign ? `Season: ${campaign.name} — ${campaign.theme}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export default { commandDefinitions, handleCommand, handleComponent, buttonRows };
