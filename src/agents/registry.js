// The roster. Add a villager here and it appears on the map, in the sidebar,
// and gets its own Discord channel — no other wiring needed.
import Manager from './manager.js';
import Scout from './scout.js';
import Researcher from './researcher.js';
import Maker from './maker.js';
import Copywriter from './copywriter.js';
import QA from './qa.js';
import Lister from './lister.js';
import Curator from './curator.js';
import Signwriter from './signwriter.js';
import Harbourmaster from './harbourmaster.js';
import Prospector from './prospector.js';
import Analyst from './analyst.js';
import Architect from './architect.js';
import Builder from './builder.js';
import Marketer from './marketer.js';

const instances = [
  // The Etsy shop.
  new Manager(),
  new Scout(),
  new Researcher(),
  new Maker(),
  new Copywriter(),
  new QA(),
  new Lister(),
  new Curator(),
  new Signwriter(),
  // The venture arm. Separate people, separate data, same dashboard.
  new Harbourmaster(),
  new Prospector(),
  new Analyst(),
  new Architect(),
  new Builder(),
  new Marketer(),
];

export const agents = new Map(instances.map((a) => [a.id, a]));

export const agentList = () => [...agents.values()];

export const getAgent = (id) => agents.get(id) || null;

/** Which agent should pick up a job kind. */
export function agentForKind(kind) {
  for (const agent of agents.values()) {
    if (agent.handles.includes(kind)) return agent;
  }
  return null;
}

export const roster = () => agentList().map((a) => a.toJSON());

/** Just one side of the business. */
export const agentsIn = (division) => agentList().filter((a) => a.division === division);

export default agents;
