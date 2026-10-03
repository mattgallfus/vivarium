export const DT = 1 / 30;
export const WIDTH = 1600, HEIGHT = 1000;
export const BOUNDS = {speed:[30,120], acceleration:[20,100], perception:[40,250], size:[0.5,2], threshold:[0.6,0.95], persistence:[0,1]};
export const DEFAULTS = {foodRate:7, mutation:0.12, metabolism:1, patchiness:0, initialPopulation:80};
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export class Random {
  constructor(seed=184223){this.state=seed>>>0;this.spare=null;}
  next(){let t=this.state=(this.state+0x6D2B79F5)>>>0;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;}
  range(a,b){return a+(b-a)*this.next();}
  normal(){if(this.spare!==null){const n=this.spare;this.spare=null;return n;}const u=Math.max(1e-10,this.next()),v=this.next(),r=Math.sqrt(-2*Math.log(u));this.spare=r*Math.sin(2*Math.PI*v);return r*Math.cos(2*Math.PI*v);}
}
export function delta(a,b,extent){let d=b-a;if(d>extent/2)d-=extent;if(d<-extent/2)d+=extent;return d;}
export function displacement(a,b){const x=delta(a.x,b.x,WIDTH),y=delta(a.y,b.y,HEIGHT);return {x,y,d2:x*x+y*y};}

export class SpatialHash {
  constructor(cell=100){this.cell=cell;this.cols=Math.ceil(WIDTH/cell);this.rows=Math.ceil(HEIGHT/cell);this.cells=new Map();}
  clear(){this.cells.clear();}
  insert(e){const key=Math.floor(e.x/this.cell)+this.cols*Math.floor(e.y/this.cell);if(!this.cells.has(key))this.cells.set(key,[]);this.cells.get(key).push(e);}
  query(e,r){const cx=Math.floor(e.x/this.cell),cy=Math.floor(e.y/this.cell),n=Math.ceil(r/this.cell),result=[],seen=new Set();for(let y=-n;y<=n;y++)for(let x=-n;x<=n;x++){const key=((cx+x+this.cols)%this.cols)+this.cols*((cy+y+this.rows)%this.rows);if(seen.has(key))continue;seen.add(key);for(const v of this.cells.get(key)||[])if(displacement(e,v).d2<=r*r)result.push(v);}return result;}
}

export class World {
  constructor(seed=184223,settings={}){
    this.seed=seed>>>0;this.rng=new Random(this.seed);this.settings={...DEFAULTS,...settings};this.time=0;this.nextId=1;this.creatures=[];this.food=[];this.births=0;this.deaths={starvation:0,age:0};this.history=[];this.events=[];this.foodCredit=0;this.sampleCredit=0;this.safetyLimited=false;this.index=new SpatialHash();
    for(let i=0;i<300;i++)this.spawnFood();
    for(let i=0;i<this.settings.initialPopulation;i++)this.spawnCreature();
    this.sample();
  }
  genome(){return {speed:this.rng.range(50,82),acceleration:this.rng.range(45,75),perception:this.rng.range(100,180),size:this.rng.range(.8,1.2),threshold:this.rng.range(.72,.84),persistence:this.rng.range(.4,.8)};}
  spawnCreature(position=null){const g=this.genome();const c={id:this.nextId++,x:position?.x??this.rng.range(0,WIDTH),y:position?.y??this.rng.range(0,HEIGHT),vx:0,vy:0,heading:this.rng.range(-Math.PI,Math.PI),energy:55*g.size,age:0,genome:g,generation:0,parent:null,lineage:0,cooldown:0,action:'WANDER',targetId:null,foodEaten:0,offspring:0,distance:0,events:[],wanderTimer:0,wanderAngle:0};c.lineage=c.id;this.creatures.push(c);return c;}
  spawnFood(position=null){let x=position?.x??this.rng.range(0,WIDTH),y=position?.y??this.rng.range(0,HEIGHT);if(!position&&this.rng.next()<this.settings.patchiness){const patch=Math.floor(this.rng.range(0,4));x=((patch%2?1150:450)+this.rng.normal()*135+WIDTH)%WIDTH;y=((patch<2?320:700)+this.rng.normal()*110+HEIGHT)%HEIGHT;}this.food.push({id:this.nextId++,x,y,energy:24});}
  log(c,text){const event={time:this.time,text};c.events.push(event);if(c.events.length>10)c.events.shift();this.events.unshift({time:this.time,text:`#${c.id} ${text}`});if(this.events.length>30)this.events.pop();}
  maxEnergy(c){return 100*c.genome.size;}
  update(dt=DT){
    this.time+=dt;this.foodCredit+=this.settings.foodRate*dt;while(this.foodCredit>=1){if(this.food.length<1200)this.spawnFood();this.foodCredit-=1;}
    this.index.clear();for(const food of this.food)this.index.insert(food);
    const consumed=new Set(),survivors=[],children=[];
    for(const c of this.creatures){
      const g=c.genome;c.age+=dt;c.cooldown=Math.max(0,c.cooldown-dt);c.wanderTimer-=dt;
      let target=null,best=Infinity;
      if(c.energy<this.maxEnergy(c)*.95)for(const f of this.index.query(c,g.perception)){if(consumed.has(f.id))continue;const d=displacement(c,f);if(d.d2<best){best=d.d2;target=f;}}
      let ax,ay;
      if(target){const d=displacement(c,target),len=Math.sqrt(d.d2)||1;ax=d.x/len*g.speed-c.vx;ay=d.y/len*g.speed-c.vy;if(c.targetId!==target.id)this.log(c,`found food #${target.id}`);c.action='SEEK FOOD';c.targetId=target.id;}
      else {if(c.wanderTimer<=0){c.wanderAngle=c.heading+this.rng.range(-Math.PI,Math.PI)*(1-g.persistence);c.wanderTimer=this.rng.range(.5,1.7);}ax=Math.cos(c.wanderAngle)*g.speed*.72-c.vx;ay=Math.sin(c.wanderAngle)*g.speed*.72-c.vy;c.action='WANDER';c.targetId=null;}
      const alen=Math.hypot(ax,ay);if(alen>g.acceleration){ax*=g.acceleration/alen;ay*=g.acceleration/alen;}c.vx+=ax*dt;c.vy+=ay*dt;
      let speed=Math.hypot(c.vx,c.vy);if(speed>g.speed){c.vx*=g.speed/speed;c.vy*=g.speed/speed;speed=g.speed;}
      if(speed>.1)c.heading=Math.atan2(c.vy,c.vx);c.x=(c.x+c.vx*dt+WIDTH)%WIDTH;c.y=(c.y+c.vy*dt+HEIGHT)%HEIGHT;c.distance+=speed*dt;
      // Resolve against the index, so crossing a pellet while wandering also counts.
      for(const f of this.index.query(c,7+5*g.size)){if(consumed.has(f.id))continue;consumed.add(f.id);c.energy=Math.min(this.maxEnergy(c),c.energy+f.energy);c.foodEaten++;this.log(c,`ate food #${f.id}`);}
      const cost=(.32+.001*g.perception+.12*g.size*g.size+speed*speed*g.size*.000024)*this.settings.metabolism;c.energy-=cost*dt;
      if(c.energy<=0||c.age>180+80*g.size){const cause=c.energy<=0?'starvation':'age';this.deaths[cause]++;this.log(c,`died of ${cause}`);continue;}
      if(c.age>18&&c.cooldown===0&&c.energy>=this.maxEnergy(c)*g.threshold){
        if(this.creatures.length+children.length>=1500){this.safetyLimited=true;}else{
          const childGenome={...g};for(const [key,[lo,hi]] of Object.entries(BOUNDS))if(this.rng.next()<this.settings.mutation)childGenome[key]=clamp(childGenome[key]+this.rng.normal()*(hi-lo)*.035,lo,hi);
          const allocation=Math.min(32*g.size,100*childGenome.size);c.energy-=allocation;c.cooldown=16;c.offspring++;const angle=this.rng.range(-Math.PI,Math.PI);
          const child={...c,id:this.nextId++,x:(c.x+Math.cos(angle)*14+WIDTH)%WIDTH,y:(c.y+Math.sin(angle)*14+HEIGHT)%HEIGHT,vx:0,vy:0,energy:allocation,age:0,genome:childGenome,generation:c.generation+1,parent:c.id,cooldown:16,action:'WANDER',targetId:null,foodEaten:0,offspring:0,distance:0,events:[],wanderTimer:0};children.push(child);this.births++;this.log(c,`gave birth to #${child.id}`);
        }
      }
      survivors.push(c);
    }
    this.creatures=survivors.concat(children);this.food=this.food.filter(f=>!consumed.has(f.id));this.sampleCredit+=dt;if(this.sampleCredit>=1){this.sampleCredit-=1;this.sample();}
  }
  sample(){const n=this.creatures.length;const stats={time:this.time,population:n,food:this.food.length,births:this.births,deaths:this.deaths.starvation+this.deaths.age,generation:0,energy:0,traits:{},variance:{}};for(const key of Object.keys(BOUNDS)){const mean=n?this.creatures.reduce((s,c)=>s+c.genome[key],0)/n:0;stats.traits[key]=mean;stats.variance[key]=n?this.creatures.reduce((s,c)=>s+(c.genome[key]-mean)**2,0)/n:0;}for(const c of this.creatures){stats.generation=Math.max(stats.generation,c.generation);stats.energy+=c.energy/Math.max(1,n);}this.stats=stats;this.history.push(stats);if(this.history.length>1200)this.history.shift();return stats;}
  save(){return JSON.stringify({saveVersion:1,seed:this.seed,rng:{state:this.rng.state,spare:this.rng.spare},settings:this.settings,time:this.time,nextId:this.nextId,creatures:this.creatures,food:this.food,births:this.births,deaths:this.deaths,history:this.history,events:this.events,foodCredit:this.foodCredit,sampleCredit:this.sampleCredit,safetyLimited:this.safetyLimited});}
  static load(json){const d=JSON.parse(json);if(d.saveVersion!==1)throw new Error('Unsupported save version.');
    const finite=v=>typeof v==='number'&&Number.isFinite(v);const integer=v=>Number.isSafeInteger(v)&&v>=0;
    if(!integer(d.seed)||!finite(d.time)||d.time<0||!integer(d.nextId)||!d.rng||!integer(d.rng.state)||d.rng.state>4294967295||!(d.rng.spare===null||finite(d.rng.spare)))throw new Error('Invalid world state.');
    const ranges={foodRate:[0,20],mutation:[0,1],metabolism:[.1,3],patchiness:[0,1],initialPopulation:[0,500]};for(const [k,[a,b]]of Object.entries(ranges))if(!finite(d.settings?.[k])||d.settings[k]<a||d.settings[k]>b)throw new Error('Invalid world settings.');
    if(!Array.isArray(d.creatures)||d.creatures.length>1500||!Array.isArray(d.food)||d.food.length>1200||!Array.isArray(d.history)||d.history.length>1200||!Array.isArray(d.events)||d.events.length>30)throw new Error('Invalid entity counts.');
    const ids=new Set();for(const e of [...d.creatures,...d.food]){if(!integer(e.id)||ids.has(e.id)||e.id>=d.nextId||!finite(e.x)||!finite(e.y)||e.x<0||e.x>=WIDTH||e.y<0||e.y>=HEIGHT)throw new Error('Invalid entity position or identity.');ids.add(e.id);}
    for(const c of d.creatures){for(const k of ['vx','vy','heading','energy','age','cooldown','foodEaten','offspring','distance','wanderTimer','wanderAngle'])if(!finite(c[k]))throw new Error('Invalid creature state.');if(c.energy<=0||c.age<0||!integer(c.generation)||!integer(c.lineage)||!(c.parent===null||integer(c.parent))||!Array.isArray(c.events)||c.events.length>10)throw new Error('Invalid creature history.');for(const [k,[a,b]] of Object.entries(BOUNDS))if(!finite(c.genome?.[k])||c.genome[k]<a||c.genome[k]>b)throw new Error('Invalid genome.');}
    for(const f of d.food)if(!finite(f.energy)||f.energy<=0||f.energy>1000)throw new Error('Invalid food energy.');
    for(const k of ['births','foodCredit','sampleCredit'])if(!finite(d[k])||d[k]<0)throw new Error('Invalid counters.');if(!integer(d.deaths?.starvation)||!integer(d.deaths?.age))throw new Error('Invalid death counters.');
    for(const h of d.history){if(!finite(h.time)||!integer(h.population)||!integer(h.food)||!integer(h.generation)||!finite(h.energy))throw new Error('Invalid statistics.');for(const k of Object.keys(BOUNDS))if(!finite(h.traits?.[k])||!finite(h.variance?.[k]))throw new Error('Invalid trait statistics.');}
    for(const e of [...d.events,...d.creatures.flatMap(c=>c.events)])if(!finite(e.time)||typeof e.text!=='string'||e.text.length>300)throw new Error('Invalid event log.');
    const w=new World(d.seed,{...d.settings,initialPopulation:0});w.settings={...d.settings};for(const k of ['time','nextId','creatures','food','births','deaths','history','events','foodCredit','sampleCredit','safetyLimited'])w[k]=d[k];w.rng.state=d.rng.state;w.rng.spare=d.rng.spare;w.stats=w.history.at(-1)||w.sample();return w;
  }
}
