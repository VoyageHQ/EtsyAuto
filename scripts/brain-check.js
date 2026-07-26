// Is the brain actually on, and does it answer?
//
//   npm run brain:check
//
// The Office can only report what .env says. This asks the model a real
// question and shows you what came back, which is the only way to know the
// difference between "configured" and "working".
import config from '../src/core/config.js';
import { llm } from '../src/core/llm.js';

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const amber = (s) => `\x1b[33m${s}\x1b[0m`;

console.log(`\n${bold('Brain check')}\n`);
console.log(`  provider  ${bold(llm.provider)}`);

if (llm.provider === 'offline') {
  console.log(`  model     ${dim('none — the agents use their built-in craft')}\n`);
  console.log(`${amber('The brain is off.')} That is a working shop, just a less inventive one:`);
  console.log('the Scout picks from a built-in corpus, the Scribe writes to rules, and every');
  console.log('knowledge pack that can be enforced in code still is.\n');
  console.log(`${bold('To switch it on, pick one:')}\n`);
  console.log(`  ${bold('A local model — free forever, nothing leaves your machine')}`);
  console.log(dim('    Install Ollama from https://ollama.com, then:'));
  console.log(dim('      ollama pull llama3.1'));
  console.log(dim('    and in .env:'));
  console.log('      LLM_PROVIDER=openai');
  console.log('      LLM_BASE_URL=http://localhost:11434/v1');
  console.log('      LLM_MODEL=llama3.1\n');
  console.log(`  ${bold('Claude — costs money, much better at this job')}`);
  console.log(dim('    Get a key at https://console.anthropic.com, then in .env:'));
  console.log('      LLM_PROVIDER=anthropic');
  console.log('      ANTHROPIC_API_KEY=sk-ant-…');
  console.log(`      ANTHROPIC_MODEL=${config.llm.anthropicModel}\n`);
  console.log(`  ${bold('Any OpenAI-compatible endpoint')}`);
  console.log(dim('    Groq, OpenRouter, LM Studio, vLLM — same three lines as Ollama with'));
  console.log(dim('    a different base URL, plus LLM_API_KEY if the host wants one.\n'));
  console.log(dim('  Then run this again. Nothing to install in this project either way.\n'));
  process.exit(1);
}

console.log(`  model     ${bold(llm.describe())}`);
if (llm.provider === 'openai') console.log(`  endpoint  ${config.llm.baseUrl || dim('not set')}`);
console.log('');

// --- is it even configured enough to try? ----------------------------------

if (!llm.enabled) {
  console.log(`${red('Configured but not usable.')}\n`);
  if (llm.provider === 'anthropic') {
    console.log('  LLM_PROVIDER=anthropic needs ANTHROPIC_API_KEY, which is empty.\n');
  } else {
    const missing = [
      !config.llm.baseUrl && 'LLM_BASE_URL',
      !config.llm.model && 'LLM_MODEL',
    ].filter(Boolean);
    console.log(`  LLM_PROVIDER=openai needs ${missing.join(' and ')}, which ${missing.length > 1 ? 'are' : 'is'} empty.\n`);
  }
  process.exit(1);
}

// --- ask it something ------------------------------------------------------

console.log(dim('  Asking it a real question…\n'));
const started = Date.now();

try {
  const answer = await llm.complete({
    agent: 'brain-check',
    system: 'You are helping test a connection. Answer in one short sentence.',
    prompt: 'Name one thing that makes a printable budget planner sell well on Etsy.',
    maxTokens: 120,
  });
  const took = ((Date.now() - started) / 1000).toFixed(1);

  if (!String(answer).trim()) {
    console.log(`  ${red('×')} it connected but said nothing.\n`);
    process.exit(1);
  }

  console.log(`  ${green('✓')} answered in ${took}s\n`);
  console.log(`  ${dim('"' + String(answer).trim().slice(0, 260) + '"')}\n`);

  // JSON is what the agents actually depend on, and plenty of small local
  // models can hold a conversation but not produce parseable JSON. Worth
  // knowing before you wonder why the Scout is still using its corpus.
  const structured = await llm.completeJson({
    agent: 'brain-check',
    system: 'You return JSON and nothing else.',
    prompt: 'Return {"ok": true, "category": "budget planners"}',
    maxTokens: 120,
  });
  if (structured && typeof structured === 'object') {
    console.log(`  ${green('✓')} it can return JSON, which is what the agents need\n`);
  } else {
    console.log(`  ${amber('!')} it answers in prose but would not return usable JSON.`);
    console.log('    The agents ask for JSON for ideas, research and listing copy, and fall');
    console.log('    back to their offline craft when it does not parse. A bigger local model');
    console.log('    usually fixes this — llama3.1:8b struggles, 70b does not.\n');
  }

  console.log(`${bold('The brain is on.')} Restart the dashboard and the Office will say so.`);
  console.log(dim('  npm start\n'));

  if (config.llm.dailyTokens) {
    console.log(dim(`  Daily cap: ${config.llm.dailyTokens.toLocaleString()} tokens. Past it the agents`));
    console.log(dim('  fall back to offline craft rather than spending more.\n'));
  } else if (llm.provider === 'anthropic') {
    console.log(`${amber('No spend cap set.')} This provider costs money per call and the loop runs`);
    console.log('every 20 seconds. Set LLM_DAILY_TOKENS in .env before leaving it running.\n');
  }
  process.exit(0);
} catch (err) {
  console.log(`  ${red('×')} ${err.message}\n`);

  const message = String(err.message).toLowerCase();
  if (message.includes('econnrefused') || message.includes('fetch failed')) {
    console.log('  Nothing is listening at that address. If this is Ollama, check it is running:');
    console.log(dim('    ollama serve        # in another terminal'));
    console.log(dim('    ollama list         # what you have pulled\n'));
  } else if (message.includes('401') || message.includes('authentication')) {
    console.log('  The key was refused. Check it has not been revoked or mistyped.\n');
  } else if (message.includes('404') || message.includes('not found')) {
    console.log(`  The endpoint took the request but does not know "${llm.describe()}".`);
    console.log(dim('    ollama list     # for a local model, the name must match exactly\n'));
  } else if (message.includes('429') || message.includes('rate')) {
    console.log('  Rate limited. It is configured correctly — just busy or over a free tier.\n');
  } else if (message.includes('cap reached')) {
    console.log('  The daily token cap is spent, so this behaved exactly as designed.');
    console.log('  Raise LLM_DAILY_TOKENS or wait until midnight.\n');
  }
  process.exit(1);
}
