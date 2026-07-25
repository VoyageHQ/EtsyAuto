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

const instances = [
  new Manager(),
  new Scout(),
  new Researcher(),
  new Maker(),
  new Copywriter(),
  new QA(),
  new Lister(),
  new Curator(),
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

export default agents;
