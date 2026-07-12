import { Referee } from './js/game/referee.js';
import { GameClient } from './js/game/state.js';
import { rollCrates } from './js/game/loot.js';
import { getMission } from './js/missions/registry.js';
import './js/missions/idealgas.js';

const mission = getMission('idealgas');
const seed = 12345;
function makeBus(){
  const adapters=new Map();
  function create(id){
    const listeners={msg:[]};
    const adapter={id,
      on(evt,cb){ if(!listeners[evt])listeners[evt]=[]; listeners[evt].push(cb); return ()=>{}; },
      send(type,payload){ for(const [oid,o] of adapters){ if(oid===id) continue; (o._listeners.msg||[]).forEach(cb=>cb({id,type,payload})); } }
    };
    adapter._listeners=listeners; adapters.set(id,adapter); return adapter;
  }
  return {create};
}
const bus = makeBus();
const hostAdapter = bus.create('host');
const roster=[{id:'host',profile:{team:'OX'}},{id:'peer',profile:{team:'RE'}}];
const referee = new Referee({adapter:hostAdapter, mission, seed, roster, cfg:{}});
const hostGC = new GameClient({adapter:hostAdapter, myId:'host', myTeam:'OX', mission, seed});
hostGC.on('deny', (ev) => console.log('DENY', JSON.stringify(ev)));
referee.start(Date.now());
const crates = rollCrates(mission, seed);
const partIds = mission.parts.map(p=>p.id);
const taken = new Set();
for (const partId of partIds) {
  const crate = crates.find(c=>c.kind==='part' && c.itemId===partId && !taken.has(c.id));
  taken.add(crate.id);
  console.log('trying crate', crate.id, 'for', partId, 'prog before=', referee.prog.OX, 'inv before=', hostGC.myInv());
  hostGC.tryPickup('crate', crate.id);
  if (hostGC.myInv().length>=2) { hostGC.tryDeposit(); }
}
