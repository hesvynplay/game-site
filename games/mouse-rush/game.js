/* =====================================================================
   Mouse Rush — pseudo-3D 3-lane runner. Vanilla JS + Canvas 2D.
   No build step, no image assets. Everything drawn with shapes.
   ===================================================================== */
(() => {
"use strict";

// ---------- DOM ----------
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const $ = (id) => document.getElementById(id);
const elHud = $("hud"), elTitle = $("title"), elOver = $("over");
const elLevel = $("hudLevel"), elWorld = $("hudWorld"), elWorldDot = $("hudWorldDot");
const elFood = $("hudFood"), elDist = $("hudDist"), elCombo = $("combo");
const elTitleBest = $("titleBest"), elTitleMaxLv = $("titleMaxLv");
const elOverDist = $("overDist"), elOverLevel = $("overLevel"), elOverFood = $("overFood");
const elOverBest = $("overBest"), elNewBest = $("newBest"), elContinue = $("continueBtn");

// ---------- Storage ----------
const LS = {
  get(k, d){ try{ const v = localStorage.getItem(k); return v===null?d:JSON.parse(v); }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
};
let bestDist = LS.get("mr_best", 0);
let maxLevel = LS.get("mr_maxlv", 1);
let retryCount = LS.get("mr_retry", 0);

// ---------- Worlds (10 themes) ----------
const WORLDS = [
  { name:"Kitchen",     sky:"#ffe9c2", sky2:"#ffd089", ground:"#e8c89b", ground2:"#d8b483", line:"#fff4dd", accent:"#ff8a5b", deco:"tile" },
  { name:"Living Room", sky:"#d9e6ff", sky2:"#b9cdf2", ground:"#caa57a", ground2:"#b58e63", line:"#f2e6d4", accent:"#7a6cff", deco:"wood" },
  { name:"Wall Gap",    sky:"#3a3550", sky2:"#26223a", ground:"#4a4360", ground2:"#3a3450", line:"#6b6390", accent:"#9c8bff", deco:"dust" },
  { name:"Sewer",       sky:"#1f3b3a", sky2:"#142826", ground:"#2c4a47", ground2:"#1f3735", line:"#3f6a66", accent:"#42d6c0", deco:"water" },
  { name:"Back Alley",  sky:"#3b3242", sky2:"#26202c", ground:"#5a5360", ground2:"#46404c", line:"#7a7286", accent:"#ff7a4d", deco:"brick" },
  { name:"City Street", sky:"#bcd2e8", sky2:"#9bb6d4", ground:"#6c6c74", ground2:"#56565e", line:"#c9c9d2", accent:"#ffd23e", deco:"road" },
  { name:"Garden",      sky:"#cdeeff", sky2:"#a6e0ef", ground:"#6fae54", ground2:"#5a9444", line:"#bff0a0", accent:"#ff6fa5", deco:"grass" },
  { name:"Store",       sky:"#fff0f5", sky2:"#ffd7e6", ground:"#d9d2e0", ground2:"#c4bcce", line:"#ffffff", accent:"#ff5d8f", deco:"tilewide" },
  { name:"Rooftop",     sky:"#ffd1a6", sky2:"#ff9e7a", ground:"#7a6f86", ground2:"#615870", line:"#a89ab8", accent:"#ff5b6e", deco:"shingle" },
  { name:"Night City",  sky:"#1a1340", sky2:"#0d0a26", ground:"#241d44", ground2:"#181233", line:"#5a4bb0", accent:"#ff3d8b", deco:"neon" }
];

// ---------- Layout ----------
let W=0, H=0, DPR=1, horizonY=0, groundTop=0, centerX=0, laneGap=0, playerY=0;
function resize(){
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.floor(W*DPR); canvas.height = Math.floor(H*DPR);
  canvas.style.width = W+"px"; canvas.style.height = H+"px";
  ctx.setTransform(DPR,0,0,DPR,0,0);
  horizonY = H*0.30;
  groundTop = horizonY;
  centerX = W/2;
  laneGap = Math.min(W*0.26, 150);
  playerY = H*0.82;
}
window.addEventListener("resize", resize);
resize();

// project lane center x at vertical progress t (0=horizon .. 1=player)
function laneX(lane, t){ return centerX + (lane-1)*laneGap*t; }
function projY(t){ return horizonY + t*(playerY-horizonY); }
function projScale(t){ return 0.22 + t*1.05; }

// ---------- Game state ----------
const TITLE=0, PLAY=1, OVER=2;
let state = TITLE;
let game = null;
const PLAYER_T = 0.93; // collision band near the player

function newGame(){
  game = {
    lane:1, lanePos:1, jump:0, jumpV:0, onAir:false,
    dist:0, level:1, food:0, combo:0, comboTimer:0,
    speed:0.55, spawnTimer:0, t:0,
    shake:0, worldFlash:0, levelBanner:0, catWarn:0, expr:"normal",
    entities:[], particles:[], decals:[], otherMice:[],
    revived:false
  };
}
function curWorldIndex(){ return Math.min(9, Math.floor((game.level-1)/10)); }
function levelInWorld(){ return ((game.level-1)%10)+1; }

// difficulty derived from level
function diff(){
  const lv = game.level;
  const base = 0.52 + Math.min(lv,100)*0.013;           // forward speed
  const endless = lv>100 ? (lv-100)*0.006 : 0;
  return {
    speed: base + endless,
    spawnEvery: Math.max(0.42, 1.15 - Math.min(lv,100)*0.0072), // seconds between spawns
    kinds: Math.min(7, 2 + Math.floor(lv/12))             // variety grows
  };
}

// ---------- Input ----------
function moveLane(dir){
  if(state!==PLAY) return;
  game.lane = Math.max(0, Math.min(2, game.lane+dir));
}
function jump(){
  if(state!==PLAY || game.onAir) return;
  game.onAir = true; game.jumpV = 1.0; game.expr="focus";
}
window.addEventListener("keydown", (e)=>{
  if(e.code==="ArrowLeft"||e.code==="KeyA") moveLane(-1);
  else if(e.code==="ArrowRight"||e.code==="KeyD") moveLane(1);
  else if(e.code==="ArrowUp"||e.code==="KeyW"||e.code==="Space"){ jump(); e.preventDefault(); }
  else if(e.code==="Enter"){ if(state===TITLE) startPlay(); else if(state===OVER) startPlay(); }
});
// touch / drag
let tStartX=0, tStartY=0, tLastLaneX=0, tActive=false, tMoved=false;
function onStart(x,y){ tStartX=x; tStartY=y; tLastLaneX=x; tActive=true; tMoved=false; }
function onMove(x,y){
  if(!tActive) return;
  const dx=x-tLastLaneX, dyTotal=y-tStartY;
  if(dyTotal < -55 && !tMoved){ jump(); tMoved=true; tStartY=y; }   // up swipe = jump
  const step = Math.min(W*0.16, 90);
  if(dx >  step){ moveLane(1);  tLastLaneX=x; tMoved=true; }
  if(dx < -step){ moveLane(-1); tLastLaneX=x; tMoved=true; }
}
function onEnd(){ tActive=false; }
canvas.addEventListener("touchstart",(e)=>{const t=e.changedTouches[0];onStart(t.clientX,t.clientY);e.preventDefault();},{passive:false});
canvas.addEventListener("touchmove",(e)=>{const t=e.changedTouches[0];onMove(t.clientX,t.clientY);e.preventDefault();},{passive:false});
canvas.addEventListener("touchend",(e)=>{onEnd();e.preventDefault();},{passive:false});
// mouse drag (desktop fallback)
let mDown=false;
canvas.addEventListener("mousedown",(e)=>{mDown=true;onStart(e.clientX,e.clientY);});
canvas.addEventListener("mousemove",(e)=>{if(mDown)onMove(e.clientX,e.clientY);});
window.addEventListener("mouseup",()=>{mDown=false;onEnd();});

$("playBtn").addEventListener("click", startPlay);
$("retryBtn").addEventListener("click", startPlay);
elContinue.addEventListener("click", revive);

// ---------- Flow ----------
function startPlay(){
  newGame();
  state = PLAY;
  elTitle.classList.add("hidden");
  elOver.classList.add("hidden");
  elHud.classList.remove("hidden");
}
function showTitle(){
  state = TITLE;
  elTitleBest.textContent = Math.floor(bestDist);
  elTitleMaxLv.textContent = maxLevel;
  elTitle.classList.remove("hidden");
  elOver.classList.add("hidden");
  elHud.classList.add("hidden");
}
function gameOver(){
  state = OVER;
  game.shake = 14;
  const d = Math.floor(game.dist);
  const isBest = d > bestDist;
  if(isBest){ bestDist = d; LS.set("mr_best", d); }
  if(game.level > maxLevel){ maxLevel = game.level; LS.set("mr_maxlv", maxLevel); }
  retryCount++; LS.set("mr_retry", retryCount);

  elOverDist.textContent = d;
  elOverLevel.textContent = game.level;
  elOverFood.textContent = game.food;
  elOverBest.textContent = Math.floor(bestDist);
  elNewBest.classList.toggle("hidden", !isBest);
  if(isBest) burstCelebrate();

  // AD: show interstitial every 3 retries (placeholder).
  // if(retryCount % 3 === 0){ /* showAd('interstitial', ...) */ }

  // AD: offer a rewarded "Continue" once per run (placeholder).
  elContinue.classList.toggle("hidden", game.revived);

  setTimeout(()=>{ elHud.classList.add("hidden"); elOver.classList.remove("hidden"); }, 260);
}
function revive(){
  // AD: play a rewarded ad here, then on success call this revive logic.
  if(!game) return;
  game.revived = true;
  game.entities = []; game.particles = [];
  game.onAir=false; game.jump=0; game.jumpV=0; game.expr="normal";
  state = PLAY;
  elOver.classList.add("hidden");
  elHud.classList.remove("hidden");
}

// ---------- Spawning ----------
function spawn(){
  const d = diff();
  const lane = (Math.random()*3)|0;
  // bias toward food vs obstacle
  const r = Math.random();
  if(r < 0.40){
    game.entities.push({ kind:"food", food:(Math.random()*3)|0, lane, t:0, resolved:false });
  } else {
    game.entities.push(makeObstacle(lane, d.kinds));
  }
  // occasional friendly rival mouse
  if(Math.random()<0.12){
    game.entities.push({ kind:"rmouse", lane:(Math.random()*3)|0, t:0, resolved:false, steal:Math.random()<0.5 });
  }
}
function makeObstacle(lane, kinds){
  // available kinds depend on world + variety
  const wi = curWorldIndex();
  let pool = ["trap","furniture"];
  if(kinds>=3) pool.push("bug");
  if(kinds>=4 || wi>=4) pool.push("cat");
  if(kinds>=5 || wi>=5) pool.push("bird");
  if(kinds>=6 || wi>=6) pool.push("hand");
  // world-flavored weighting
  if(wi===3) pool.push("bug","bug");        // sewer
  if(wi===4) pool.push("cat","cat");         // back alley cats
  if(wi===6) pool.push("bug","bird");        // garden
  if(wi===7) pool.push("hand","hand");       // store hands
  if(wi===9) pool.push("cat","hand","bird"); // night city complex
  const kind = pool[(Math.random()*pool.length)|0];
  const e = { kind, lane, t:0, resolved:false };
  if(kind==="cat") game.catWarn = 1.0;
  if(kind==="bird"){ game.decals.push({ kind:"shadow", lane, t:0, life:1 }); }
  return e;
}

// what happens when an entity reaches the player band
function resolve(e){
  e.resolved = true;
  const sameLane = (e.lane===game.lane);
  if(e.kind==="food"){
    if(sameLane){ eat(e); }
    return;
  }
  if(e.kind==="rmouse"){ return; } // friendly, no harm
  if(!sameLane) return;
  // jump rules
  const jumpableKinds = { trap:1, bug:1, furniture:1 };
  if(e.kind==="bird"){
    if(game.onAir){ return hit(); }   // birds hit you in the air
    return;                            // safe on the ground
  }
  if(jumpableKinds[e.kind]){
    if(game.onAir) return;             // jumped over it
    return hit();
  }
  // cat / hand: cannot jump over
  return hit();
}
function eat(e){
  game.food++; game.combo++; game.comboTimer=1.1;
  game.expr="happy";
  const x=laneX(e.lane,PLAYER_T), y=projY(PLAYER_T);
  sparkle(x,y,"#ffcc3e",10);
  if(game.combo>=3){ showCombo(game.combo); }
}
function hit(){
  if(state!==PLAY) return;
  game.expr="dead";
  for(let i=0;i<14;i++) game.particles.push(p(centerX, playerY, "#ff7a4d"));
  gameOver();
}

// ---------- Particles & effects ----------
function p(x,y,c){
  const a=Math.random()*6.28, s=1+Math.random()*3.4;
  return { x,y, vx:Math.cos(a)*s, vy:Math.sin(a)*s-1.5, life:1, c, r:2+Math.random()*3 };
}
function sparkle(x,y,c,n){ for(let i=0;i<n;i++) game.particles.push(p(x,y,c)); }
function burstCelebrate(){ for(let i=0;i<40;i++) game.particles.push(p(centerX, H*0.4, ["#ffcc3e","#ff7a4d","#5fd38a","#fff"][(Math.random()*4)|0])); }
function showCombo(n){
  elCombo.textContent = "x"+n+"!";
  elCombo.classList.remove("hidden");
  elCombo.style.animation="none"; void elCombo.offsetWidth; elCombo.style.animation="";
  clearTimeout(showCombo._t);
  showCombo._t=setTimeout(()=>elCombo.classList.add("hidden"),600);
}

// ---------- Update ----------
let last=0;
function update(dt){
  if(state!==PLAY) return;
  const d = diff();
  game.speed = d.speed;
  game.t += dt;

  // distance & level
  game.dist += game.speed * dt * 26;
  const lvByDist = 1 + Math.floor(game.dist/240);
  if(lvByDist>game.level){
    const prevWorld = curWorldIndex();
    game.level = lvByDist;
    game.levelBanner = 1.0;
    if(curWorldIndex()!==prevWorld){ game.worldFlash = 1.0; }
  }

  // combo decay
  if(game.comboTimer>0){ game.comboTimer-=dt; if(game.comboTimer<=0) game.combo=0; }

  // jump physics
  if(game.onAir){
    game.jump += game.jumpV*dt*3.2;
    game.jumpV -= dt*3.4;
    if(game.jump<=0){ game.jump=0; game.onAir=false; if(game.expr==="focus") game.expr="normal"; }
  }

  // expression by nearby cat
  if(game.catWarn>0){ game.catWarn-=dt; if(!game.onAir && game.expr!=="dead") game.expr="scared"; }
  else if(game.expr==="scared") game.expr="normal";
  if(game.expr==="happy" && game.comboTimer<=0.8) game.expr = game.onAir?"focus":"normal";

  // spawn
  game.spawnTimer -= dt;
  if(game.spawnTimer<=0){ spawn(); game.spawnTimer = d.spawnEvery*(0.7+Math.random()*0.6); }

  // move entities toward player
  for(const e of game.entities){
    e.t += game.speed*dt*0.9;
    if(!e.resolved && e.t>=PLAYER_T){ resolve(e); }
  }
  game.entities = game.entities.filter(e=> e.t < 1.18);

  // decals (bird shadows)
  for(const dc of game.decals){ dc.t += game.speed*dt*0.9; dc.life-=dt*0.4; }
  game.decals = game.decals.filter(dc=>dc.t<1.1 && dc.life>0);

  // particles
  for(const pt of game.particles){ pt.x+=pt.vx; pt.y+=pt.vy; pt.vy+=0.35; pt.life-=dt*1.7; }
  game.particles = game.particles.filter(pt=>pt.life>0);

  // timers
  if(game.shake>0) game.shake*=0.86;
  if(game.worldFlash>0) game.worldFlash-=dt*0.8;
  if(game.levelBanner>0) game.levelBanner-=dt*0.7;

  // HUD
  elLevel.textContent = game.level;
  const wi=curWorldIndex();
  elWorld.textContent = WORLDS[wi].name;
  elWorldDot.style.background = WORLDS[wi].accent;
  elFood.textContent = game.food;
  elDist.textContent = Math.floor(game.dist);
}

// ---------- Render ----------
function render(){
  ctx.save();
  let sx=0, sy=0;
  if(game && game.shake>0.4){ sx=(Math.random()-0.5)*game.shake; sy=(Math.random()-0.5)*game.shake; ctx.translate(sx,sy); }

  const wi = game ? curWorldIndex() : 0;
  const w = WORLDS[wi];
  drawBackground(w);
  drawGround(w);

  if(game){
    // sort by depth (far first)
    const all = [...game.decals.map(d=>({type:"decal",ref:d,t:d.t})),
                 ...game.entities.map(e=>({type:"ent",ref:e,t:e.t}))];
    all.sort((a,b)=>a.t-b.t);
    for(const o of all){
      if(o.type==="decal") drawDecal(o.ref,w);
      else drawEntity(o.ref,w);
    }
    drawPlayer();
    // particles
    for(const pt of game.particles){
      ctx.globalAlpha=Math.max(0,pt.life);
      ctx.fillStyle=pt.c;
      ctx.beginPath(); ctx.arc(pt.x,pt.y,pt.r,0,6.28); ctx.fill();
    }
    ctx.globalAlpha=1;

    // cat warning marker
    if(game.catWarn>0.02){
      ctx.globalAlpha=Math.min(1,game.catWarn*1.4);
      drawWarning(centerX, horizonY+8, 22);
      ctx.globalAlpha=1;
    }
    // level / world banners
    if(game.worldFlash>0.02) drawWorldBanner(w);
    else if(game.levelBanner>0.02) drawLevelBanner();
  }
  ctx.restore();
}

function drawBackground(w){
  const g=ctx.createLinearGradient(0,0,0,horizonY);
  g.addColorStop(0,w.sky); g.addColorStop(1,w.sky2);
  ctx.fillStyle=g; ctx.fillRect(0,0,W,horizonY+2);
  // neon glow / sun depending on world
  if(w.deco==="neon"){
    for(let i=0;i<6;i++){
      ctx.globalAlpha=0.25;
      ctx.fillStyle=[w.accent,"#42d6c0","#ffd23e"][i%3];
      const bx=(i*W/6+ (game?Math.sin(game.t*0.2+i)*8:0)); 
      ctx.fillRect(bx, horizonY-40-(i%3)*22, 14, 40+(i%3)*22);
      ctx.globalAlpha=1;
    }
  } else {
    ctx.globalAlpha=0.5; ctx.fillStyle="#ffffff";
    const cl = game?(game.t*10)%(W+120):0;
    for(let i=0;i<3;i++){ cloud((i*W/2.4 - cl + i*40 + W)% (W+160) -80, horizonY*0.4 + i*22, 26+i*6); }
    ctx.globalAlpha=1;
  }
}
function cloud(x,y,r){ ctx.beginPath(); ctx.arc(x,y,r,0,6.28); ctx.arc(x+r,y+4,r*0.8,0,6.28); ctx.arc(x-r*0.9,y+6,r*0.7,0,6.28); ctx.fill(); }

function drawGround(w){
  const g=ctx.createLinearGradient(0,horizonY,0,H);
  g.addColorStop(0,w.ground); g.addColorStop(1,w.ground2);
  ctx.fillStyle=g; ctx.fillRect(0,horizonY,W,H-horizonY);

  // lane dividers (converging to vanishing point) + scrolling rungs
  ctx.strokeStyle=w.line; ctx.globalAlpha=0.5; ctx.lineWidth=2;
  for(let l=0;l<=3;l++){
    const lane=l-0.5;
    ctx.beginPath();
    ctx.moveTo(laneX(lane,0.001), projY(0.001));
    ctx.lineTo(laneX(lane,1), projY(1));
    ctx.stroke();
  }
  // moving cross lines for speed feel
  const scroll = game? (game.dist*0.02)%1 : 0;
  ctx.globalAlpha=0.32;
  for(let i=0;i<10;i++){
    let t = (i/10 + scroll); if(t>1) t-=1;
    const y=projY(t), half=laneGap*1.5*t+10;
    ctx.lineWidth=1+2*t;
    ctx.beginPath(); ctx.moveTo(centerX-half,y); ctx.lineTo(centerX+half,y); ctx.stroke();
  }
  ctx.globalAlpha=1;
}

function depthStyle(t){ return { x:0, y:projY(t), s:projScale(t) }; }

function drawEntity(e,w){
  const t=e.t, s=projScale(t), x=laneX(e.lane,t), y=projY(t);
  // shadow
  ctx.globalAlpha=0.18*Math.min(1,t+0.2); ctx.fillStyle="#000";
  ctx.beginPath(); ctx.ellipse(x,y+10*s,18*s,6*s,0,0,6.28); ctx.fill(); ctx.globalAlpha=1;

  switch(e.kind){
    case "food": drawFood(x,y,s,e.food); break;
    case "trap": drawTrap(x,y,s); break;
    case "bug": drawBug(x,y,s,w); break;
    case "cat": drawCat(x,y,s); break;
    case "bird": drawBird(x,y - (1-t)*30*s, s); break;
    case "hand": drawHand(x,y,s); break;
    case "rmouse": drawRMouse(x,y,s); break;
    default: drawFurniture(x,y,s,w); break;
  }
}
function drawDecal(dc,w){
  if(dc.kind==="shadow"){
    const x=laneX(dc.lane,dc.t), y=projY(dc.t), s=projScale(dc.t);
    ctx.globalAlpha=0.25*dc.life; ctx.fillStyle="#000";
    ctx.beginPath(); ctx.ellipse(x,y,16*s,5*s,0,0,6.28); ctx.fill(); ctx.globalAlpha=1;
  }
}

// ----- shape art -----
function rr(x,y,wd,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+wd,y,x+wd,y+h,r); ctx.arcTo(x+wd,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+wd,y,r); ctx.fill(); }

function drawFood(x,y,s,kind){
  if(kind===0){ // cheese wedge
    ctx.fillStyle="#ffcf3a"; ctx.strokeStyle="#caa122"; ctx.lineWidth=2*s;
    ctx.beginPath(); ctx.moveTo(x-12*s,y+8*s); ctx.lineTo(x+12*s,y+8*s); ctx.lineTo(x,y-12*s); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle="#e0b62a"; ctx.beginPath(); ctx.arc(x-3*s,y+2*s,2*s,0,6.28); ctx.arc(x+4*s,y+4*s,1.6*s,0,6.28); ctx.fill();
  } else if(kind===1){ // bread crumb
    ctx.fillStyle="#e6b873"; rr(x-10*s,y-7*s,20*s,15*s,5*s);
    ctx.fillStyle="#c8965a"; ctx.beginPath(); ctx.arc(x-3*s,y,1.5*s,0,6.28); ctx.arc(x+3*s,y+2*s,1.5*s,0,6.28); ctx.fill();
  } else { // seed
    ctx.fillStyle="#caa46a"; ctx.beginPath(); ctx.ellipse(x,y,6*s,9*s,0,0,6.28); ctx.fill();
    ctx.fillStyle="#fff7e6"; ctx.beginPath(); ctx.ellipse(x-1.5*s,y-2*s,2*s,3*s,0,0,6.28); ctx.fill();
  }
}
function drawTrap(x,y,s){
  ctx.fillStyle="#caa46a"; rr(x-15*s,y-2*s,30*s,12*s,3*s);          // wooden base
  ctx.strokeStyle="#e23b3b"; ctx.lineWidth=3.4*s;
  ctx.beginPath(); ctx.arc(x,y,12*s,Math.PI*1.05,Math.PI*1.95); ctx.stroke(); // spring bar
  ctx.fillStyle="#ffe07a"; ctx.beginPath(); ctx.arc(x,y+2*s,4*s,0,6.28); ctx.fill(); // bait
}
function drawBug(x,y,s,w){
  ctx.fillStyle=w.accent; ctx.beginPath(); ctx.arc(x,y,11*s,0,6.28); ctx.fill();
  ctx.fillStyle="#1c1736"; // legs
  for(let i=-1;i<=1;i++){ ctx.fillRect(x-13*s, y-2*s+i*5*s, -5*s, 2*s); ctx.fillRect(x+13*s, y-2*s+i*5*s, 5*s, 2*s); }
  ctx.fillStyle="#fff"; ctx.beginPath(); ctx.arc(x-4*s,y-2*s,3*s,0,6.28); ctx.arc(x+4*s,y-2*s,3*s,0,6.28); ctx.fill();
  ctx.fillStyle="#1c1736"; ctx.beginPath(); ctx.arc(x-4*s,y-2*s,1.4*s,0,6.28); ctx.arc(x+4*s,y-2*s,1.4*s,0,6.28); ctx.fill();
  ctx.strokeStyle="#1c1736"; ctx.lineWidth=1.4*s; ctx.beginPath(); ctx.arc(x,y+3*s,3*s,0.1,Math.PI-0.1); ctx.stroke(); // smile
}
function drawCat(x,y,s){
  ctx.fillStyle="#8a7fb5"; // head
  ctx.beginPath(); ctx.arc(x,y-4*s,17*s,0,6.28); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x-15*s,y-14*s); ctx.lineTo(x-7*s,y-26*s); ctx.lineTo(x-3*s,y-15*s); ctx.fill(); // ears
  ctx.beginPath(); ctx.moveTo(x+15*s,y-14*s); ctx.lineTo(x+7*s,y-26*s); ctx.lineTo(x+3*s,y-15*s); ctx.fill();
  ctx.fillStyle="#ffd23e"; ctx.beginPath(); ctx.ellipse(x-6*s,y-5*s,4*s,5*s,0,0,6.28); ctx.ellipse(x+6*s,y-5*s,4*s,5*s,0,0,6.28); ctx.fill();
  ctx.fillStyle="#1c1736"; ctx.beginPath(); ctx.ellipse(x-6*s,y-5*s,1.6*s,4*s,0,0,6.28); ctx.ellipse(x+6*s,y-5*s,1.6*s,4*s,0,0,6.28); ctx.fill();
  ctx.fillStyle="#ff7a4d"; ctx.beginPath(); ctx.arc(x,y+1*s,2*s,0,6.28); ctx.fill();
}
function drawBird(x,y,s){
  ctx.fillStyle="#6b6390"; ctx.beginPath(); ctx.ellipse(x,y,12*s,9*s,0,0,6.28); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x-2*s,y-3*s); ctx.lineTo(x-22*s,y-12*s); ctx.lineTo(x-6*s,y+3*s); ctx.fill(); // wing
  ctx.beginPath(); ctx.moveTo(x+2*s,y-3*s); ctx.lineTo(x+22*s,y-12*s); ctx.lineTo(x+6*s,y+3*s); ctx.fill();
  ctx.fillStyle="#ffd23e"; ctx.beginPath(); ctx.moveTo(x+11*s,y); ctx.lineTo(x+18*s,y-2*s); ctx.lineTo(x+11*s,y+3*s); ctx.fill();
  ctx.fillStyle="#fff"; ctx.beginPath(); ctx.arc(x+6*s,y-3*s,2.2*s,0,6.28); ctx.fill();
  ctx.fillStyle="#1c1736"; ctx.beginPath(); ctx.arc(x+6*s,y-3*s,1.1*s,0,6.28); ctx.fill();
}
function drawHand(x,y,s){
  ctx.fillStyle="#f0c9a8";
  rr(x-9*s,y-30*s,18*s,34*s,8*s);   // arm/palm coming down
  for(let i=0;i<4;i++){ rr(x-9*s+i*5*s, y-2*s, 4*s, 12*s, 2*s); } // fingers
  ctx.fillStyle="#d9a784"; rr(x-9*s,y-30*s,18*s,6*s,4*s);
}
function drawFurniture(x,y,s,w){
  ctx.fillStyle=w.accent;
  const k=(Math.abs((x|0))%3);
  if(k===0){ rr(x-13*s,y-16*s,26*s,22*s,4*s); }           // box/can
  else if(k===1){ ctx.beginPath(); ctx.arc(x,y-2*s,13*s,0,6.28); ctx.fill(); ctx.fillStyle="#1c1736"; ctx.globalAlpha=.25; ctx.beginPath(); ctx.arc(x,y-2*s,13*s,0,6.28); ctx.fill(); ctx.globalAlpha=1; } // stone
  else { rr(x-6*s,y-22*s,12*s,28*s,4*s); rr(x-14*s,y-6*s,28*s,10*s,3*s); } // spoon-ish
}
function drawRMouse(x,y,s){
  ctx.globalAlpha=0.92;
  ctx.fillStyle="#b9aee0";
  ctx.beginPath(); ctx.arc(x,y-6*s,11*s,0,6.28); ctx.fill();
  ctx.beginPath(); ctx.arc(x-7*s,y-15*s,5*s,0,6.28); ctx.arc(x+7*s,y-15*s,5*s,0,6.28); ctx.fill();
  ctx.fillStyle="#1c1736"; ctx.beginPath(); ctx.arc(x-3*s,y-7*s,1.4*s,0,6.28); ctx.arc(x+3*s,y-7*s,1.4*s,0,6.28); ctx.fill();
  ctx.globalAlpha=1;
}
function drawWarning(x,y,r){
  ctx.fillStyle="#ff3d3d"; ctx.strokeStyle="#fff"; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(x,y-r); ctx.lineTo(x+r,y+r*0.8); ctx.lineTo(x-r,y+r*0.8); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle="#fff"; ctx.fillRect(x-2,y-r*0.4,4,r*0.8); ctx.beginPath(); ctx.arc(x,y+r*0.5,2.4,0,6.28); ctx.fill();
}

// ----- player mouse -----
function drawPlayer(){
  const t=PLAYER_T, baseX=laneX(game.lane,t);
  // ease toward lane visually
  game.lanePos += (game.lane-game.lanePos)*0.25;
  const x=laneX(game.lanePos,t);
  const s=projScale(t)*1.05;
  const bob = game.onAir?0:Math.sin(game.t*14)*2.2;
  const y=playerY - game.jump*120 - bob;

  // shadow shrinks while airborne
  const sh = game.onAir? 0.5 : 1;
  ctx.globalAlpha=0.22*sh; ctx.fillStyle="#000";
  ctx.beginPath(); ctx.ellipse(baseX, playerY+12, 24*s, 7*s*sh, 0,0,6.28); ctx.fill(); ctx.globalAlpha=1;

  // tail
  ctx.strokeStyle="#c9bff0"; ctx.lineWidth=4*s; ctx.lineCap="round";
  ctx.beginPath(); ctx.moveTo(x-18*s,y+2*s); ctx.quadraticCurveTo(x-34*s,y+ (Math.sin(game.t*10)*6)*s, x-30*s,y-12*s); ctx.stroke();

  // ears
  ctx.fillStyle="#e8c0d8";
  ctx.beginPath(); ctx.arc(x-12*s,y-22*s,8*s,0,6.28); ctx.arc(x+12*s,y-22*s,8*s,0,6.28); ctx.fill();
  ctx.fillStyle="#cfc6e6";
  ctx.beginPath(); ctx.arc(x-12*s,y-20*s,9*s,0,6.28); ctx.arc(x+12*s,y-20*s,9*s,0,6.28); ctx.fill();

  // body
  ctx.fillStyle="#cfc6e6";
  ctx.beginPath(); ctx.ellipse(x,y-4*s,17*s,16*s,0,0,6.28); ctx.fill();
  ctx.fillStyle="#e7e1f5"; ctx.beginPath(); ctx.ellipse(x,y+2*s,10*s,9*s,0,0,6.28); ctx.fill(); // belly

  // face by expression
  const e=game.expr;
  // eyes
  ctx.fillStyle="#1c1736";
  if(e==="dead"){
    drawX(x-6*s,y-6*s,4*s); drawX(x+6*s,y-6*s,4*s);
  } else if(e==="happy"){
    ctx.lineWidth=2.4*s; ctx.strokeStyle="#1c1736";
    ctx.beginPath(); ctx.arc(x-6*s,y-5*s,3*s,Math.PI,0); ctx.arc(x+6*s,y-5*s,3*s,Math.PI,0); ctx.stroke();
  } else if(e==="scared"){
    ctx.beginPath(); ctx.arc(x-6*s,y-6*s,4.2*s,0,6.28); ctx.arc(x+6*s,y-6*s,4.2*s,0,6.28); ctx.fill();
    ctx.fillStyle="#fff"; ctx.beginPath(); ctx.arc(x-7*s,y-7*s,1.6*s,0,6.28); ctx.arc(x+5*s,y-7*s,1.6*s,0,6.28); ctx.fill();
  } else if(e==="focus"){
    ctx.fillRect(x-9*s,y-6*s,6*s,2.4*s); ctx.fillRect(x+3*s,y-6*s,6*s,2.4*s);
  } else { // normal
    ctx.beginPath(); ctx.arc(x-6*s,y-6*s,2.6*s,0,6.28); ctx.arc(x+6*s,y-6*s,2.6*s,0,6.28); ctx.fill();
  }
  // nose
  ctx.fillStyle="#ff8fb0"; ctx.beginPath(); ctx.arc(x,y-1*s,2.6*s,0,6.28); ctx.fill();
  // mouth (smile except scared/dead)
  if(e!=="dead"&&e!=="scared"){ ctx.strokeStyle="#1c1736"; ctx.lineWidth=1.6*s; ctx.beginPath(); ctx.arc(x,y+1*s,3*s,0.15,Math.PI-0.15); ctx.stroke(); }
  // whiskers
  ctx.strokeStyle="rgba(28,23,54,.6)"; ctx.lineWidth=1.2*s;
  for(let i=-1;i<=1;i++){ ctx.beginPath(); ctx.moveTo(x-3*s,y+i*2*s); ctx.lineTo(x-16*s,y+i*4*s-2*s); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x+3*s,y+i*2*s); ctx.lineTo(x+16*s,y+i*4*s-2*s); ctx.stroke(); }
}
function drawX(x,y,r){ ctx.strokeStyle="#1c1736"; ctx.lineWidth=2.4; ctx.beginPath(); ctx.moveTo(x-r,y-r); ctx.lineTo(x+r,y+r); ctx.moveTo(x+r,y-r); ctx.lineTo(x-r,y+r); ctx.stroke(); }

function drawLevelBanner(){
  const a=Math.min(1,game.levelBanner*1.4);
  ctx.globalAlpha=a; ctx.textAlign="center"; ctx.fillStyle="#fff";
  ctx.font="800 "+Math.floor(Math.min(W*0.09,46))+"px Baloo 2, sans-serif";
  ctx.fillText("LEVEL "+game.level, centerX, H*0.42);
  ctx.globalAlpha=1; ctx.textAlign="start";
}
function drawWorldBanner(w){
  const a=Math.min(1,game.worldFlash*1.4);
  ctx.globalAlpha=a*0.85; ctx.fillStyle=w.accent; ctx.fillRect(0,H*0.36,W,H*0.14);
  ctx.globalAlpha=a; ctx.fillStyle="#fff"; ctx.textAlign="center";
  ctx.font="800 "+Math.floor(Math.min(W*0.085,44))+"px Baloo 2, sans-serif";
  ctx.fillText(w.name, centerX, H*0.45);
  ctx.font="800 16px Baloo 2, sans-serif"; ctx.globalAlpha=a*0.8;
  ctx.fillText("WORLD "+(curWorldIndex()+1), centerX, H*0.40);
  ctx.globalAlpha=1; ctx.textAlign="start";
}

// ---------- Loop ----------
function frame(ts){
  const dt=Math.min(0.05, (ts-last)/1000)||0.016; last=ts;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

// ---------- Boot ----------
showTitle();
requestAnimationFrame(frame);

})();
