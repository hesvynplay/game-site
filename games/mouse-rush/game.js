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
  { name:"Kitchen",     sky:"#ffe9c2", sky2:"#ffd089", ground:"#eccfa0", ground2:"#d8b483", line:"#fff4dd", accent:"#ff8a5b", wall:"#fff0d6", wall2:"#ffd9a0", scene:"kitchen" },
  { name:"Living Room", sky:"#d9e6ff", sky2:"#b9cdf2", ground:"#caa57a", ground2:"#b58e63", line:"#f2e6d4", accent:"#7a6cff", wall:"#efe2cf", wall2:"#d8c2a3", scene:"room" },
  { name:"Wall Gap",    sky:"#3a3550", sky2:"#26223a", ground:"#4a4360", ground2:"#3a3450", line:"#6b6390", accent:"#9c8bff", wall:"#4a4360", wall2:"#2e2942", scene:"gap" },
  { name:"Sewer",       sky:"#16302c", sky2:"#0c1d1b", ground:"#234440", ground2:"#152f2c", line:"#46857d", accent:"#42d6c0", wall:"#1e3b37", wall2:"#102521", scene:"sewer" },
  { name:"Back Alley",  sky:"#3b3242", sky2:"#221c2c", ground:"#54505c", ground2:"#3c3844", line:"#86809a", accent:"#ff7a4d", wall:"#574a58", wall2:"#352d3a", scene:"alley" },
  { name:"City Street", sky:"#bcd2e8", sky2:"#9bb6d4", ground:"#6c6c74", ground2:"#56565e", line:"#c9c9d2", accent:"#ffd23e", wall:"#aebccd", wall2:"#8090a4", scene:"city" },
  { name:"Garden",      sky:"#cdeeff", sky2:"#a6e0ef", ground:"#6fae54", ground2:"#5a9444", line:"#bff0a0", accent:"#ff6fa5", wall:"#bfe6a8", wall2:"#94c87e", scene:"garden" },
  { name:"Store",       sky:"#fff0f5", sky2:"#ffd7e6", ground:"#ded7e6", ground2:"#c4bcce", line:"#ffffff", accent:"#ff5d8f", wall:"#ffe2ee", wall2:"#ffc1da", scene:"store" },
  { name:"Rooftop",     sky:"#ffd1a6", sky2:"#ff9e7a", ground:"#7a6f86", ground2:"#615870", line:"#a89ab8", accent:"#ff5b6e", wall:"#8a7d96", wall2:"#665b72", scene:"rooftop" },
  { name:"Night City",  sky:"#1a1340", sky2:"#0a0720", ground:"#241d44", ground2:"#120d2e", line:"#6a59c8", accent:"#ff3d8b", wall:"#241d54", wall2:"#120c34", scene:"night" }
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
    shake:0, worldFlash:0, levelBanner:0, levelPop:0, catWarn:0, hurtFlash:0, expr:"normal",
    entities:[], particles:[], decals:[], otherMice:[], warns:[],
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
  game.entities = []; game.particles = []; game.warns = [];
  game.onAir=false; game.jump=0; game.jumpV=0; game.expr="normal";
  game.hurtFlash=0; game.shake=0; game.catWarn=0;
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
  // DANGER WARNING: flash a marker over the lane where a deadly thing is coming
  game.warns.push({ lane, life:1, kind });
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
  game.hurtFlash=1; game.shake=20;
  for(let i=0;i<22;i++) game.particles.push(p(centerX, playerY-10, ["#ff7a4d","#ffd23e","#fff"][(Math.random()*3)|0]));
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
    game.levelBanner = 1.0; game.levelPop = 1.0;
    // burst of stars at the banner
    for(let i=0;i<18;i++) game.particles.push(p(centerX, H*0.42, ["#ffd23e","#ff7a4d","#5fd38a","#fff"][(Math.random()*4)|0]));
    if(curWorldIndex()!==prevWorld){ game.worldFlash = 1.0; game.shake=Math.max(game.shake,6); }
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
  if(game.levelPop>0) game.levelPop-=dt*2.2;
  if(game.hurtFlash>0) game.hurtFlash-=dt*1.8;
  for(const wn of game.warns){ wn.life-=dt*1.3; }
  game.warns = game.warns.filter(wn=>wn.life>0);

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

    // per-lane DANGER warnings (badge hovers over the threatened lane near the horizon)
    for(const wn of game.warns){
      const lx=laneX(wn.lane,0.18), ly=projY(0.18);
      const pulse=0.6+0.4*Math.sin((game.t)*18);
      ctx.globalAlpha=Math.min(1,wn.life*1.6)*pulse;
      drawWarning(lx, ly, 16);
      ctx.globalAlpha=1;
    }
    // cat warning marker (extra, center top)
    if(game.catWarn>0.02){
      ctx.globalAlpha=Math.min(1,game.catWarn*1.4);
      drawWarning(centerX, horizonY+6, 22);
      ctx.globalAlpha=1;
    }
    // level / world banners
    if(game.worldFlash>0.02) drawWorldBanner(w);
    else if(game.levelBanner>0.02) drawLevelBanner();

    // DEATH red flash + vignette
    if(game.hurtFlash>0.02){
      ctx.globalAlpha=game.hurtFlash*0.45; ctx.fillStyle="#ff2b2b"; ctx.fillRect(-40,-40,W+80,H+80);
      const vg=ctx.createRadialGradient(centerX,playerY,40,centerX,playerY,Math.max(W,H)*0.7);
      vg.addColorStop(0,"rgba(0,0,0,0)"); vg.addColorStop(1,"rgba(120,0,0,"+(game.hurtFlash*0.7)+")");
      ctx.globalAlpha=1; ctx.fillStyle=vg; ctx.fillRect(-40,-40,W+80,H+80);
    }
  }
  ctx.restore();
}

// distance-based scroll (world streams to the LEFT => feels like dashing right/forward)
function scrollX(factor){ return game ? (game.dist*factor) : (last*0.02*factor); }

function drawBackground(w){
  // --- sky gradient ---
  const g=ctx.createLinearGradient(0,0,0,horizonY+4);
  g.addColorStop(0,w.sky); g.addColorStop(1,w.sky2);
  ctx.fillStyle=g; ctx.fillRect(0,0,W,horizonY+4);
  // --- ambient light source ---
  if(w.scene==="night"){
    ctx.globalAlpha=0.4; const rg=ctx.createRadialGradient(W*0.5,horizonY,10,W*0.5,horizonY,W*0.6);
    rg.addColorStop(0,"#3a2a7a"); rg.addColorStop(1,"rgba(0,0,0,0)"); ctx.fillStyle=rg; ctx.fillRect(0,0,W,horizonY); ctx.globalAlpha=1;
  } else if(w.scene==="kitchen"||w.scene==="store"||w.scene==="rooftop"){
    ctx.globalAlpha=0.5; const rg=ctx.createRadialGradient(W*0.72,horizonY*0.4,8,W*0.72,horizonY*0.4,horizonY*1.4);
    rg.addColorStop(0,"#fff6e0"); rg.addColorStop(1,"rgba(255,255,255,0)"); ctx.fillStyle=rg; ctx.fillRect(0,0,W,horizonY); ctx.globalAlpha=1;
  }
  // --- 3 parallax layers ---
  drawParallax(w);
}

// tile a motif horizontally across the screen with a leftward scroll
function tileMotif(spacing, off, yBase, draw){
  let start = -((off % spacing) + spacing) % spacing;
  for(let x=start; x<W+spacing; x+=spacing){ draw(x, yBase); }
}

function drawParallax(w){
  const hY=horizonY;
  // FAR layer (slow)
  const far=scrollX(0.22);
  ctx.save();
  switch(w.scene){
    case "kitchen": // window light + tiled wall band
      ctx.fillStyle="rgba(255,255,255,.45)";
      tileMotif(220,far,0,(x)=>{ rrFill(x+30,hY-78,150,70,8,"rgba(255,255,255,.5)"); });
      break;
    case "sewer": // distant tunnel arches
      tileMotif(160,far,0,(x)=>{ ctx.fillStyle="rgba(0,0,0,.35)"; ctx.beginPath(); ctx.arc(x+60,hY,46,Math.PI,0); ctx.fill(); });
      break;
    case "alley": // far building silhouettes
      tileMotif(140,far,0,(x)=>{ const h=50+((x*7)%60); ctx.fillStyle="rgba(0,0,0,.30)"; ctx.fillRect(x,hY-h,90,h); });
      break;
    case "night": // skyline + neon
      tileMotif(120,far,0,(x)=>{ const h=60+((x*13)%80); ctx.fillStyle="#0c0826"; ctx.fillRect(x,hY-h,80,h);
        ctx.fillStyle=["#ff3d8b","#42d6c0","#ffd23e"][(x|0)%3]; ctx.globalAlpha=.8; ctx.fillRect(x+12,hY-h+14,32,5); ctx.globalAlpha=1; });
      break;
    case "city":
      tileMotif(130,far,0,(x)=>{ const h=70+((x*11)%70); ctx.fillStyle="rgba(90,110,140,.5)"; ctx.fillRect(x,hY-h,86,h); });
      break;
    case "garden":
      ctx.fillStyle="rgba(255,255,255,.6)"; const cl=scrollX(0.12);
      tileMotif(200,cl,0,(x)=>{ cloud(x, hY*0.35, 26); });
      break;
    default:
      ctx.fillStyle="rgba(255,255,255,.5)"; const cl2=scrollX(0.12);
      tileMotif(220,cl2,0,(x)=>{ cloud(x, hY*0.4, 24); });
  }
  ctx.restore();

  // MID layer (medium) — props sitting on the horizon line
  const mid=scrollX(0.6);
  ctx.save();
  switch(w.scene){
    case "kitchen": // counter with plates & utensils
      ctx.fillStyle="#caa06a"; ctx.fillRect(0,hY-22,W,24);
      tileMotif(150,mid,0,(x)=>{ rrFill(x+20,hY-40,40,20,10,"#fff"); ctx.strokeStyle="#d8c4a0"; ctx.lineWidth=2; ctx.beginPath(); ctx.ellipse(x+40,hY-30,12,5,0,0,6.28); ctx.stroke();
        ctx.strokeStyle="#9a8a6a"; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(x+100,hY-44); ctx.lineTo(x+100,hY-22); ctx.stroke(); });
      break;
    case "sewer": // pipes running along the horizon + drips
      ctx.fillStyle="#0c1d1b"; ctx.fillRect(0,hY-26,W,28);
      ctx.strokeStyle="#3a5f5a"; ctx.lineWidth=10; ctx.beginPath(); ctx.moveTo(0,hY-16); ctx.lineTo(W,hY-16); ctx.stroke();
      tileMotif(120,mid,0,(x)=>{ ctx.fillStyle="#2a4a45"; ctx.beginPath(); ctx.arc(x+30,hY-16,9,0,6.28); ctx.fill();
        ctx.fillStyle="#7fe6d6"; ctx.globalAlpha=.5; ctx.beginPath(); ctx.arc(x+30, hY-16 + ((scrollX(2)+x)%40)*0.4, 2.2,0,6.28); ctx.fill(); ctx.globalAlpha=1; });
      break;
    case "alley": // trash cans, bins, fence
      tileMotif(170,mid,0,(x)=>{ rrFill(x+20,hY-34,26,34,5,"#46414e"); rrFill(x+18,hY-38,30,7,4,"#5a5564");
        ctx.fillStyle="#3a3642"; ctx.fillRect(x+70,hY-30,40,30); for(let i=0;i<4;i++){ctx.strokeStyle="#2c2934";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+72+i*10,hY-30);ctx.lineTo(x+72+i*10,hY);ctx.stroke();} });
      break;
    case "night":
      tileMotif(150,mid,0,(x)=>{ ctx.fillStyle="#1a1248"; ctx.fillRect(x,hY-50,70,50);
        ctx.fillStyle="#42d6c0"; ctx.globalAlpha=.7; ctx.fillRect(x+10,hY-40,50,4); ctx.globalAlpha=1; });
      break;
    case "garden":
      tileMotif(140,mid,0,(x)=>{ ctx.fillStyle="#4f8c3a"; ctx.beginPath(); ctx.arc(x+30,hY-10,22,Math.PI,0); ctx.fill(); ctx.fillStyle="#5a9444"; ctx.fillRect(x+24,hY-12,12,12); });
      break;
    case "city":
      ctx.fillStyle="#5a5560"; ctx.fillRect(0,hY-14,W,16);
      tileMotif(200,mid,0,(x)=>{ rrFill(x+40,hY-46,8,34,3,"#8a8694"); rrFill(x+34,hY-50,20,8,3,"#ffd23e"); });
      break;
    default:
      tileMotif(180,mid,0,(x)=>{ ctx.fillStyle="rgba(0,0,0,.12)"; ctx.beginPath(); ctx.arc(x+40,hY,26,Math.PI,0); ctx.fill(); });
  }
  ctx.restore();
}

function rrFill(x,y,wd,h,r,c){ ctx.fillStyle=c; ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+wd,y,x+wd,y+h,r); ctx.arcTo(x+wd,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+wd,y,r); ctx.fill(); }
function cloud(x,y,r){ ctx.beginPath(); ctx.arc(x,y,r,0,6.28); ctx.arc(x+r,y+4,r*0.8,0,6.28); ctx.arc(x-r*0.9,y+6,r*0.7,0,6.28); ctx.fill(); }

// inner edge of the running floor at depth t (walls live outside this)
function floorEdge(side, t){ return centerX + side*(laneGap*1.7*t); }

function drawGround(w){
  // base floor
  const g=ctx.createLinearGradient(0,horizonY,0,H);
  g.addColorStop(0,w.ground); g.addColorStop(1,w.ground2);
  ctx.fillStyle=g; ctx.fillRect(0,horizonY,W,H-horizonY);

  drawSideWalls(w);
  drawFloorTexture(w);

  // lane dividers (subtle, help readability)
  ctx.strokeStyle=w.line; ctx.globalAlpha=0.35; ctx.lineWidth=2;
  for(let l=1;l<3;l++){
    const lane=l-0.5;
    ctx.beginPath(); ctx.moveTo(laneX(lane,0.02), projY(0.02)); ctx.lineTo(laneX(lane,1), projY(1)); ctx.stroke();
  }
  ctx.globalAlpha=1;

  drawSpeedLines(w);
}

// receding side walls => strong depth + tunnel feel
function drawSideWalls(w){
  for(const side of [-1,1]){
    const exTop=floorEdge(side,0.02), exBot=floorEdge(side,1);
    const edge = side<0?0:W;
    ctx.beginPath();
    ctx.moveTo(edge,horizonY); ctx.lineTo(exTop,projY(0.02)); ctx.lineTo(exBot,H); ctx.lineTo(edge,H); ctx.closePath();
    const wg=ctx.createLinearGradient(0,horizonY,0,H); wg.addColorStop(0,w.wall2); wg.addColorStop(1,w.wall);
    ctx.fillStyle=wg; ctx.fill();
    // wall surface detail (scrolls toward viewer for speed)
    ctx.save(); ctx.clip();
    const scroll=(game?(game.dist*0.02):0)%1;
    if(w.scene==="kitchen"||w.scene==="store"){ // tiles
      ctx.strokeStyle="rgba(255,255,255,.25)"; ctx.lineWidth=1.5;
      for(let i=0;i<12;i++){ let t=(i/12+scroll)%1; const y=projY(t); ctx.beginPath(); ctx.moveTo(side<0?0:floorEdge(side,t),y); ctx.lineTo(side<0?floorEdge(side,t):W,y); ctx.stroke(); }
    } else if(w.scene==="alley"||w.scene==="city"){ // bricks
      ctx.strokeStyle="rgba(0,0,0,.22)"; ctx.lineWidth=1.5;
      for(let i=0;i<10;i++){ let t=(i/10+scroll)%1; const y=projY(t); ctx.beginPath(); ctx.moveTo(side<0?0:floorEdge(side,t),y); ctx.lineTo(side<0?floorEdge(side,t):W,y); ctx.stroke(); }
    } else if(w.scene==="sewer"){ // wet sheen streaks
      ctx.strokeStyle="rgba(120,230,214,.18)"; ctx.lineWidth=2;
      for(let i=0;i<8;i++){ let t=(i/8+scroll)%1; const y=projY(t); ctx.beginPath(); ctx.moveTo(edge,y); ctx.lineTo(floorEdge(side,t),y); ctx.stroke(); }
    }
    // ambient occlusion where wall meets floor
    const ao=ctx.createLinearGradient(exTop,0,edge,0); ao.addColorStop(0,"rgba(0,0,0,.28)"); ao.addColorStop(1,"rgba(0,0,0,0)");
    ctx.restore();
  }
  // soft shade along both wall/floor seams
  for(const side of [-1,1]){
    ctx.strokeStyle="rgba(0,0,0,.22)"; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(floorEdge(side,0.02),projY(0.02)); ctx.lineTo(floorEdge(side,1),H); ctx.stroke();
  }
}

// floor surface: world texture + bold rungs streaming toward the viewer
function drawFloorTexture(w){
  const scroll=(game?(game.dist*0.025):0)%1;
  ctx.save();
  // clip to the floor trapezoid
  ctx.beginPath();
  ctx.moveTo(floorEdge(-1,0.02),projY(0.02)); ctx.lineTo(floorEdge(1,0.02),projY(0.02));
  ctx.lineTo(floorEdge(1,1),H); ctx.lineTo(floorEdge(-1,1),H); ctx.closePath(); ctx.clip();

  if(w.scene==="kitchen"||w.scene==="store"){
    // checker tiles
    for(let i=0;i<14;i++){
      let t=(i/14+scroll)%1, t2=((i+1)/14+scroll)%1; if(t2<t) t2=1;
      const y1=projY(t), y2=projY(t2);
      for(let c=-2;c<=2;c++){
        if(((i+c)&1)===0){ ctx.fillStyle="rgba(255,255,255,.16)"; }
        else { ctx.fillStyle="rgba(0,0,0,.06)"; }
        const xa=laneX(1.5+c*0.7,t), xb=laneX(1.5+c*0.7,t2), xa2=laneX(2.2+c*0.7,t), xb2=laneX(2.2+c*0.7,t2);
        ctx.beginPath(); ctx.moveTo(xa,y1); ctx.lineTo(xa2,y1); ctx.lineTo(xb2,y2); ctx.lineTo(xb,y2); ctx.closePath(); ctx.fill();
      }
    }
  } else if(w.scene==="sewer"){
    // water sheen
    const sg=ctx.createLinearGradient(0,horizonY,0,H); sg.addColorStop(0,"rgba(60,160,150,.0)"); sg.addColorStop(1,"rgba(80,220,200,.18)");
    ctx.fillStyle=sg; ctx.fillRect(0,horizonY,W,H-horizonY);
    ctx.fillStyle="rgba(180,255,245,.10)";
    for(let i=0;i<6;i++){ let t=(i/6+scroll)%1; const y=projY(t); ctx.fillRect(0,y,W,2+4*t); }
  }
  // bold depth rungs (every world) — the core "speed" cue
  ctx.strokeStyle=w.line; 
  for(let i=0;i<12;i++){
    let t=(i/12+scroll)%1; const y=projY(t);
    ctx.globalAlpha=0.10+0.35*t; ctx.lineWidth=1+4*t;
    ctx.beginPath(); ctx.moveTo(floorEdge(-1,t),y); ctx.lineTo(floorEdge(1,t),y); ctx.stroke();
  }
  ctx.globalAlpha=1;
  ctx.restore();
}

// horizontal speed streaks that intensify with level/speed (sells the dash)
function drawSpeedLines(w){
  if(!game) return;
  const intensity=Math.min(1,(game.speed-0.5)*1.3);
  if(intensity<=0.05) return;
  ctx.save(); ctx.globalAlpha=0.10+0.22*intensity; ctx.strokeStyle=w.scene==="night"?w.accent:"#ffffff"; ctx.lineCap="round";
  const n=6+Math.floor(intensity*6);
  for(let i=0;i<n;i++){
    const seed=(i*97)%100/100;
    const yy=horizonY+ (seed)*(H-horizonY);
    const len=40+seed*120;
    const x=W - ((scrollX(6)+i*180)%(W+200));
    const side=yy>playerY-40?1:1;
    ctx.lineWidth=1+2*seed;
    ctx.beginPath(); ctx.moveTo(x,yy); ctx.lineTo(x-len,yy); ctx.stroke();
  }
  ctx.restore();
}

function depthStyle(t){ return { x:0, y:projY(t), s:projScale(t) }; }

function drawEntity(e,w){
  const t=e.t, s=projScale(t), x=laneX(e.lane,t), y=projY(t);
  // ROLE RING under each object => instantly communicates what it is.
  // gold = food (grab), red = danger (avoid), blue = friendly rival (ignore)
  const role = (e.kind==="food") ? "#ffce3a"
             : (e.kind==="rmouse") ? "#7aa6ff"
             : "#ff4d4d";
  // soft drop shadow
  ctx.globalAlpha=0.16*Math.min(1,t+0.2); ctx.fillStyle="#000";
  ctx.beginPath(); ctx.ellipse(x,y+11*s,19*s,6*s,0,0,6.28); ctx.fill();
  // colored ring (skip for airborne bird, which lives above its shadow decal)
  if(e.kind!=="bird"){
    ctx.globalAlpha=0.30*Math.min(1,t+0.2);
    ctx.strokeStyle=role; ctx.lineWidth=3*s;
    ctx.beginPath(); ctx.ellipse(x,y+11*s,17*s,5*s,0,0,6.28); ctx.stroke();
    if(e.kind!=="food" && e.kind!=="rmouse"){ // extra pulse glow for danger
      ctx.globalAlpha=0.12*Math.min(1,t+0.2)*(0.6+0.4*Math.sin((game?game.t:0)*6));
      ctx.fillStyle=role; ctx.beginPath(); ctx.ellipse(x,y+11*s,17*s,5*s,0,0,6.28); ctx.fill();
    }
  }
  ctx.globalAlpha=1;

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
const INK="#2a2350"; // shared bold outline color (CrazyGames-style readability)
function rrPath(x,y,wd,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+wd,y,x+wd,y+h,r); ctx.arcTo(x+wd,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+wd,y,r); ctx.closePath(); }
function rr(x,y,wd,h,r){ rrPath(x,y,wd,h,r); ctx.fill(); }
function rrOutline(x,y,wd,h,r,fill,lw){ rrPath(x,y,wd,h,r); ctx.fillStyle=fill; ctx.fill(); ctx.strokeStyle=INK; ctx.lineWidth=lw; ctx.stroke(); }

function drawFood(x,y,s,kind){
  const bob=Math.sin((game?game.t:0)*4 + x*0.05)*1.6*s;
  y=y-6*s+bob;
  if(kind===0){ // CHEESE wedge — bright, holey, glossy
    ctx.fillStyle="#e0990c";                       // side/depth face
    ctx.beginPath(); ctx.moveTo(x-15*s,y+8*s); ctx.lineTo(x+15*s,y+8*s); ctx.lineTo(x+15*s,y+13*s); ctx.lineTo(x-15*s,y+13*s); ctx.closePath(); ctx.fill();
    ctx.fillStyle="#ffd21f";                        // top wedge
    ctx.beginPath(); ctx.moveTo(x-15*s,y+8*s); ctx.lineTo(x+15*s,y+8*s); ctx.lineTo(x+3*s,y-13*s); ctx.closePath();
    ctx.fill(); ctx.strokeStyle=INK; ctx.lineWidth=2.6*s; ctx.stroke();
    ctx.fillStyle="#e0990c";                        // holes
    ctx.beginPath(); ctx.arc(x-5*s,y+1*s,2.6*s,0,6.28); ctx.arc(x+6*s,y+4*s,1.9*s,0,6.28); ctx.arc(x+1*s,y-5*s,1.5*s,0,6.28); ctx.fill();
    ctx.fillStyle="rgba(255,255,255,.55)";          // gloss
    ctx.beginPath(); ctx.moveTo(x-11*s,y+5*s); ctx.lineTo(x-7*s,y+5*s); ctx.lineTo(x-10*s,y-3*s); ctx.closePath(); ctx.fill();
  } else if(kind===1){ // BREAD loaf
    ctx.beginPath(); ctx.ellipse(x,y+3*s,14*s,10*s,0,0,6.28);
    ctx.fillStyle="#e9b56a"; ctx.fill(); ctx.strokeStyle=INK; ctx.lineWidth=2.4*s; ctx.stroke();
    ctx.strokeStyle="#b5803f"; ctx.lineWidth=1.8*s;   // top scoring
    for(let i=-1;i<=1;i++){ ctx.beginPath(); ctx.moveTo(x+i*7*s-2*s,y-2*s); ctx.lineTo(x+i*7*s+2*s,y-6*s); ctx.stroke(); }
    ctx.fillStyle="rgba(255,255,255,.4)"; ctx.beginPath(); ctx.ellipse(x-5*s,y,4*s,2*s,0,0,6.28); ctx.fill();
  } else { // SEED / acorn
    rrPath(x-8*s,y-8*s,16*s,7*s,3*s); ctx.fillStyle="#7a5230"; ctx.fill(); ctx.strokeStyle=INK; ctx.lineWidth=2*s; ctx.stroke(); // cap
    ctx.beginPath(); ctx.ellipse(x,y+3*s,8*s,9*s,0,0,6.28); ctx.fillStyle="#caa46a"; ctx.fill(); ctx.stroke(); // body
    ctx.fillStyle="rgba(255,255,255,.4)"; ctx.beginPath(); ctx.ellipse(x-2*s,y+1*s,2*s,3*s,0,0,6.28); ctx.fill();
  }
}
function drawTrap(x,y,s){
  // wooden base (wide, low silhouette = unmistakably a trap)
  rrOutline(x-16*s,y-1*s,32*s,12*s,3*s,"#c08a4e",2.4*s);
  ctx.fillStyle="#8a5e2e"; ctx.beginPath(); ctx.arc(x-11*s,y+5*s,1.6*s,0,6.28); ctx.arc(x+11*s,y+5*s,1.6*s,0,6.28); ctx.fill(); // screws
  // steel snap bar (semicircle) — the iconic trap shape
  ctx.strokeStyle="#9aa0ad"; ctx.lineWidth=4*s; ctx.lineCap="round";
  ctx.beginPath(); ctx.arc(x,y-1*s,13*s,Math.PI*1.04,Math.PI*1.96); ctx.stroke();
  ctx.strokeStyle=INK; ctx.lineWidth=1.4*s;
  ctx.beginPath(); ctx.arc(x,y-1*s,13*s,Math.PI*1.04,Math.PI*1.96); ctx.stroke();
  // red trigger + cheese bait
  ctx.fillStyle="#ff3b3b"; rrOutline(x+9*s,y-3*s,5*s,7*s,1.5*s,"#ff3b3b",1.4*s);
  ctx.fillStyle="#ffd21f"; ctx.beginPath(); ctx.moveTo(x-4*s,y+5*s); ctx.lineTo(x+4*s,y+5*s); ctx.lineTo(x,y-1*s); ctx.closePath(); ctx.fill(); ctx.strokeStyle=INK; ctx.lineWidth=1.4*s; ctx.stroke();
}
function drawBug(x,y,s,w){
  // cute ladybug dome (red base matches the danger ring, but kept friendly/round)
  ctx.fillStyle="#1c1736"; // little head
  ctx.beginPath(); ctx.arc(x,y-9*s,5*s,0,6.28); ctx.fill();
  ctx.strokeStyle=INK; ctx.lineWidth=1.4*s; // antennae
  ctx.beginPath(); ctx.moveTo(x-2*s,y-12*s); ctx.lineTo(x-5*s,y-17*s); ctx.moveTo(x+2*s,y-12*s); ctx.lineTo(x+5*s,y-17*s); ctx.stroke();
  ctx.fillStyle="#ff4d4d"; ctx.beginPath(); ctx.arc(x,y-2*s,12*s,Math.PI,0); ctx.closePath(); ctx.fill();
  ctx.strokeStyle=INK; ctx.lineWidth=2.4*s; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x,y-14*s); ctx.lineTo(x,y-2*s); ctx.stroke(); // wing split
  ctx.fillStyle="#1c1736"; ctx.beginPath(); ctx.arc(x-5*s,y-5*s,2*s,0,6.28); ctx.arc(x+5*s,y-6*s,1.8*s,0,6.28); ctx.arc(x-3*s,y-9*s,1.4*s,0,6.28); ctx.fill(); // spots
  ctx.fillStyle="#fff"; ctx.beginPath(); ctx.arc(x-2*s,y-10*s,1.4*s,0,6.28); ctx.arc(x+2*s,y-10*s,1.4*s,0,6.28); ctx.fill(); // eyes
}
function drawCat(x,y,s){
  // tall pointy ears first (read as CAT at a glance)
  ctx.fillStyle="#6f6498";
  ctx.beginPath(); ctx.moveTo(x-17*s,y-8*s); ctx.lineTo(x-12*s,y-30*s); ctx.lineTo(x-2*s,y-13*s); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x+17*s,y-8*s); ctx.lineTo(x+12*s,y-30*s); ctx.lineTo(x+2*s,y-13*s); ctx.closePath(); ctx.fill();
  ctx.fillStyle="#ff8fb0"; // inner ears
  ctx.beginPath(); ctx.moveTo(x-13*s,y-12*s); ctx.lineTo(x-11*s,y-24*s); ctx.lineTo(x-6*s,y-14*s); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x+13*s,y-12*s); ctx.lineTo(x+11*s,y-24*s); ctx.lineTo(x+6*s,y-14*s); ctx.closePath(); ctx.fill();
  // head
  ctx.beginPath(); ctx.arc(x,y-5*s,17*s,0,6.28); ctx.fillStyle="#7a6fa6"; ctx.fill(); ctx.strokeStyle=INK; ctx.lineWidth=2.6*s; ctx.stroke();
  // angry slanted eyes (menacing => clearly a threat)
  ctx.fillStyle="#ffd23e";
  ctx.beginPath(); ctx.ellipse(x-7*s,y-6*s,5*s,5*s,0,0,6.28); ctx.ellipse(x+7*s,y-6*s,5*s,5*s,0,0,6.28); ctx.fill();
  ctx.fillStyle="#1c1736";
  ctx.beginPath(); ctx.ellipse(x-7*s,y-6*s,1.8*s,4.5*s,0,0,6.28); ctx.ellipse(x+7*s,y-6*s,1.8*s,4.5*s,0,0,6.28); ctx.fill();
  ctx.strokeStyle=INK; ctx.lineWidth=2.4*s; // angry brows
  ctx.beginPath(); ctx.moveTo(x-12*s,y-13*s); ctx.lineTo(x-3*s,y-9*s); ctx.moveTo(x+12*s,y-13*s); ctx.lineTo(x+3*s,y-9*s); ctx.stroke();
  // nose + fang mouth
  ctx.fillStyle="#ff7a4d"; ctx.beginPath(); ctx.moveTo(x-2*s,y); ctx.lineTo(x+2*s,y); ctx.lineTo(x,y+2*s); ctx.closePath(); ctx.fill();
  ctx.fillStyle="#fff"; ctx.beginPath(); ctx.moveTo(x-3*s,y+4*s); ctx.lineTo(x-1*s,y+8*s); ctx.lineTo(x+1*s,y+4*s); ctx.closePath(); ctx.moveTo(x+1*s,y+4*s); ctx.lineTo(x+3*s,y+8*s); ctx.lineTo(x+5*s,y+4*s); ctx.fill();
  // whiskers
  ctx.strokeStyle="rgba(255,255,255,.7)"; ctx.lineWidth=1.4*s;
  ctx.beginPath(); ctx.moveTo(x-8*s,y+2*s); ctx.lineTo(x-20*s,y); ctx.moveTo(x+8*s,y+2*s); ctx.lineTo(x+20*s,y); ctx.stroke();
}
function drawBird(x,y,s){
  // spread wings (big V) — instantly reads as a swooping bird
  ctx.fillStyle="#5b5386";
  ctx.beginPath(); ctx.moveTo(x-3*s,y); ctx.quadraticCurveTo(x-18*s,y-16*s,x-30*s,y-6*s); ctx.quadraticCurveTo(x-18*s,y-4*s,x-3*s,y+4*s); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x+3*s,y); ctx.quadraticCurveTo(x+18*s,y-16*s,x+30*s,y-6*s); ctx.quadraticCurveTo(x+18*s,y-4*s,x+3*s,y+4*s); ctx.closePath(); ctx.fill();
  ctx.strokeStyle=INK; ctx.lineWidth=2*s; ctx.stroke();
  // body
  ctx.beginPath(); ctx.ellipse(x,y,11*s,10*s,0,0,6.28); ctx.fillStyle="#6f66a0"; ctx.fill(); ctx.lineWidth=2.4*s; ctx.stroke();
  // beak
  ctx.fillStyle="#ffb02e"; ctx.beginPath(); ctx.moveTo(x+9*s,y-1*s); ctx.lineTo(x+18*s,y+1*s); ctx.lineTo(x+9*s,y+4*s); ctx.closePath(); ctx.fill(); ctx.strokeStyle=INK; ctx.lineWidth=1.4*s; ctx.stroke();
  // eye
  ctx.fillStyle="#fff"; ctx.beginPath(); ctx.arc(x+4*s,y-2*s,3*s,0,6.28); ctx.fill();
  ctx.fillStyle="#1c1736"; ctx.beginPath(); ctx.arc(x+5*s,y-2*s,1.4*s,0,6.28); ctx.fill();
}
function drawHand(x,y,s){
  ctx.strokeStyle=INK; ctx.lineWidth=2.4*s; ctx.lineJoin="round";
  // wrist/arm from the top
  rrOutline(x-8*s,y-36*s,16*s,20*s,6*s,"#f2c9a4",2.4*s);
  // palm
  ctx.beginPath(); ctx.arc(x,y-14*s,11*s,0,6.28); ctx.fillStyle="#f2c9a4"; ctx.fill(); ctx.stroke();
  // four fingers reaching DOWN (spread) + thumb => clearly a grabbing hand
  for(let i=0;i<4;i++){ rrOutline(x-9*s+i*5.2*s, y-8*s, 4*s, 16*s, 2*s, "#f2c9a4", 2*s); }
  rrOutline(x-13*s, y-16*s, 5*s, 12*s, 2.4*s, "#f2c9a4", 2*s); // thumb
  // shading
  ctx.fillStyle="rgba(0,0,0,.08)"; ctx.beginPath(); ctx.arc(x,y-14*s,11*s,0.2,Math.PI-0.2); ctx.fill();
}
function drawFurniture(x,y,s,w){
  const k=(Math.abs((x|0))%3);
  if(k===0){ // can / box (solid obstacle)
    rrOutline(x-13*s,y-20*s,26*s,26*s,4*s,w.accent,2.6*s);
    ctx.fillStyle="rgba(255,255,255,.85)"; rr(x-13*s,y-9*s,26*s,7*s,0); // label band
    ctx.fillStyle="rgba(255,255,255,.3)"; rr(x-10*s,y-18*s,5*s,22*s,2*s); // highlight
  } else if(k===1){ // stone/rock
    ctx.beginPath(); ctx.moveTo(x-14*s,y+4*s); ctx.lineTo(x-9*s,y-12*s); ctx.lineTo(x+4*s,y-15*s); ctx.lineTo(x+14*s,y-3*s); ctx.lineTo(x+9*s,y+5*s); ctx.closePath();
    ctx.fillStyle="#8a8694"; ctx.fill(); ctx.strokeStyle=INK; ctx.lineWidth=2.6*s; ctx.stroke();
    ctx.fillStyle="rgba(255,255,255,.25)"; ctx.beginPath(); ctx.moveTo(x-6*s,y-9*s); ctx.lineTo(x+2*s,y-11*s); ctx.lineTo(x-2*s,y-3*s); ctx.closePath(); ctx.fill();
  } else { // crate stack
    rrOutline(x-12*s,y-12*s,24*s,18*s,3*s,w.accent,2.6*s);
    ctx.strokeStyle=INK; ctx.lineWidth=1.8*s;
    ctx.beginPath(); ctx.moveTo(x-12*s,y-3*s); ctx.lineTo(x+12*s,y-3*s); ctx.moveTo(x,y-12*s); ctx.lineTo(x,y+6*s); ctx.stroke();
  }
}
function drawRMouse(x,y,s){
  // muted gray-blue, slightly faded => clearly a harmless background runner
  ctx.globalAlpha=0.9;
  ctx.fillStyle="#9aa6c8"; // ears
  ctx.beginPath(); ctx.arc(x-8*s,y-15*s,6*s,0,6.28); ctx.arc(x+8*s,y-15*s,6*s,0,6.28); ctx.fill();
  ctx.beginPath(); ctx.arc(x,y-6*s,12*s,0,6.28); ctx.fillStyle="#aeb8d6"; ctx.fill();
  ctx.strokeStyle="#5a6488"; ctx.lineWidth=2*s; ctx.stroke();
  ctx.fillStyle="#3a4060"; ctx.beginPath(); ctx.arc(x-4*s,y-7*s,1.6*s,0,6.28); ctx.arc(x+4*s,y-7*s,1.6*s,0,6.28); ctx.fill();
  ctx.fillStyle="#ff8fb0"; ctx.beginPath(); ctx.arc(x,y-3*s,1.8*s,0,6.28); ctx.fill();
  ctx.strokeStyle="#5a6488"; ctx.lineWidth=1.6*s; ctx.lineCap="round"; // tail
  ctx.beginPath(); ctx.moveTo(x-11*s,y-2*s); ctx.quadraticCurveTo(x-22*s,y-2*s,x-20*s,y-12*s); ctx.stroke();
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

  // running feet (alternate) — sells forward motion; tucked when airborne
  ctx.fillStyle="#b9aee0";
  if(!game.onAir){
    const ph=Math.sin(game.t*14);
    ctx.beginPath(); ctx.ellipse(x-6*s, y+13*s + ph*2.4*s, 6*s,4*s,0,0,6.28); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x+8*s, y+13*s - ph*2.4*s, 6*s,4*s,0,0,6.28); ctx.fill();
  } else {
    ctx.beginPath(); ctx.ellipse(x-3*s, y+12*s, 5*s,4*s,0,0,6.28); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x+7*s, y+12*s, 5*s,4*s,0,0,6.28); ctx.fill();
  }

  // tail
  ctx.strokeStyle="#c9bff0"; ctx.lineWidth=4*s; ctx.lineCap="round";
  ctx.beginPath(); ctx.moveTo(x-18*s,y+2*s); ctx.quadraticCurveTo(x-34*s,y+ (Math.sin(game.t*10)*6)*s, x-30*s,y-12*s); ctx.stroke();

  // ears (outlined, pink inner)
  ctx.fillStyle="#cfc6e6"; ctx.strokeStyle=INK; ctx.lineWidth=2.2*s;
  ctx.beginPath(); ctx.arc(x-12*s,y-20*s,9*s,0,6.28); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(x+12*s,y-20*s,9*s,0,6.28); ctx.fill(); ctx.stroke();
  ctx.fillStyle="#ff9ec4";
  ctx.beginPath(); ctx.arc(x-12*s,y-20*s,4.5*s,0,6.28); ctx.arc(x+12*s,y-20*s,4.5*s,0,6.28); ctx.fill();

  // body (outlined) + belly
  ctx.fillStyle="#d7cef0"; ctx.strokeStyle=INK; ctx.lineWidth=2.6*s;
  ctx.beginPath(); ctx.ellipse(x,y-4*s,18*s,17*s,0,0,6.28); ctx.fill(); ctx.stroke();
  ctx.fillStyle="#efeafb"; ctx.beginPath(); ctx.ellipse(x,y+3*s,11*s,10*s,0,0,6.28); ctx.fill();

  const e=game.expr;
  // blush cheeks (not when dead)
  if(e!=="dead"){ ctx.fillStyle="rgba(255,140,180,.55)"; ctx.beginPath(); ctx.ellipse(x-11*s,y+0*s,3.4*s,2.4*s,0,0,6.28); ctx.ellipse(x+11*s,y+0*s,3.4*s,2.4*s,0,0,6.28); ctx.fill(); }

  // eyes by expression
  ctx.fillStyle="#1c1736";
  if(e==="dead"){
    drawX(x-6*s,y-6*s,4.2*s); drawX(x+6*s,y-6*s,4.2*s);
  } else if(e==="happy"){
    ctx.strokeStyle="#1c1736"; ctx.lineWidth=2.6*s; ctx.lineCap="round";
    ctx.beginPath(); ctx.arc(x-6*s,y-4*s,3.4*s,Math.PI*1.1,Math.PI*1.9); ctx.arc(x+6*s,y-4*s,3.4*s,Math.PI*1.1,Math.PI*1.9); ctx.stroke();
  } else if(e==="scared"){
    ctx.fillStyle="#fff"; ctx.strokeStyle=INK; ctx.lineWidth=1.8*s;
    ctx.beginPath(); ctx.arc(x-6*s,y-6*s,5*s,0,6.28); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(x+6*s,y-6*s,5*s,0,6.28); ctx.fill(); ctx.stroke();
    ctx.fillStyle="#1c1736"; ctx.beginPath(); ctx.arc(x-6*s,y-5*s,2*s,0,6.28); ctx.arc(x+6*s,y-5*s,2*s,0,6.28); ctx.fill();
    ctx.fillStyle="#6fd3ff"; ctx.beginPath(); ctx.moveTo(x+13*s,y-12*s); ctx.quadraticCurveTo(x+16*s,y-6*s,x+13*s,y-6*s); ctx.quadraticCurveTo(x+10*s,y-6*s,x+13*s,y-12*s); ctx.fill(); // sweat
  } else if(e==="focus"){
    ctx.strokeStyle=INK; ctx.lineWidth=2.8*s; ctx.lineCap="round";
    ctx.beginPath(); ctx.moveTo(x-9*s,y-8*s); ctx.lineTo(x-3*s,y-6*s); ctx.moveTo(x+9*s,y-8*s); ctx.lineTo(x+3*s,y-6*s); ctx.stroke(); // determined brows
    ctx.fillStyle="#1c1736"; ctx.beginPath(); ctx.arc(x-6*s,y-4*s,2.2*s,0,6.28); ctx.arc(x+6*s,y-4*s,2.2*s,0,6.28); ctx.fill();
  } else { // normal — big glossy eyes
    ctx.beginPath(); ctx.arc(x-6*s,y-6*s,3.6*s,0,6.28); ctx.arc(x+6*s,y-6*s,3.6*s,0,6.28); ctx.fill();
    ctx.fillStyle="#fff"; ctx.beginPath(); ctx.arc(x-4.5*s,y-7.5*s,1.5*s,0,6.28); ctx.arc(x+7.5*s,y-7.5*s,1.5*s,0,6.28); ctx.fill();
  }
  // nose
  ctx.fillStyle="#ff7aa6"; ctx.strokeStyle=INK; ctx.lineWidth=1.2*s;
  ctx.beginPath(); ctx.arc(x,y-1*s,2.8*s,0,6.28); ctx.fill(); ctx.stroke();
  // mouth
  ctx.strokeStyle=INK; ctx.lineWidth=1.8*s; ctx.lineCap="round";
  if(e==="scared"){ ctx.fillStyle="#1c1736"; ctx.beginPath(); ctx.ellipse(x,y+5*s,2.4*s,3*s,0,0,6.28); ctx.fill(); }
  else if(e==="dead"){ ctx.beginPath(); ctx.moveTo(x-4*s,y+5*s); ctx.lineTo(x-1*s,y+3*s); ctx.lineTo(x+2*s,y+5*s); ctx.lineTo(x+5*s,y+3*s); ctx.stroke(); }
  else { ctx.beginPath(); ctx.arc(x,y+1*s,3.2*s,0.12,Math.PI-0.12); ctx.stroke(); }
  // whiskers
  ctx.strokeStyle="rgba(28,23,54,.55)"; ctx.lineWidth=1.3*s;
  for(let i=-1;i<=1;i++){ ctx.beginPath(); ctx.moveTo(x-4*s,y+i*2.4*s+1*s); ctx.lineTo(x-17*s,y+i*4.5*s-2*s); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x+4*s,y+i*2.4*s+1*s); ctx.lineTo(x+17*s,y+i*4.5*s-2*s); ctx.stroke(); }
}
function drawX(x,y,r){ ctx.strokeStyle="#1c1736"; ctx.lineWidth=2.4; ctx.beginPath(); ctx.moveTo(x-r,y-r); ctx.lineTo(x+r,y+r); ctx.moveTo(x+r,y-r); ctx.lineTo(x-r,y+r); ctx.stroke(); }

function drawLevelBanner(){
  const a=Math.min(1,game.levelBanner*1.4);
  const pop=1 + (game.levelPop>0?game.levelPop*0.5:0); // scale-in pop
  ctx.save(); ctx.globalAlpha=a; ctx.textAlign="center";
  ctx.translate(centerX, H*0.42); ctx.scale(pop,pop);
  // soft glow plate
  ctx.fillStyle="rgba(255,210,62,.18)"; ctx.beginPath(); ctx.ellipse(0,-6,Math.min(W*0.34,200),34,0,0,6.28); ctx.fill();
  // sunburst rays
  ctx.strokeStyle="rgba(255,255,255,.35)"; ctx.lineWidth=3;
  for(let i=0;i<10;i++){ const ang=game.t*0.6+i*0.628; ctx.beginPath(); ctx.moveTo(Math.cos(ang)*40,Math.sin(ang)*24); ctx.lineTo(Math.cos(ang)*70,Math.sin(ang)*42); ctx.stroke(); }
  const fs=Math.floor(Math.min(W*0.1,48));
  ctx.font="800 "+fs+"px Baloo 2, sans-serif";
  ctx.lineWidth=6; ctx.strokeStyle="#2a2350"; ctx.strokeText("LEVEL "+game.level,0,fs*0.34);
  ctx.fillStyle="#ffd23e"; ctx.fillText("LEVEL "+game.level,0,fs*0.34);
  ctx.restore(); ctx.globalAlpha=1; ctx.textAlign="start";
}
function drawWorldBanner(w){
  const a=Math.min(1,game.worldFlash*1.6);
  // white flash sweep
  ctx.globalAlpha=Math.max(0,(game.worldFlash-0.6))*2.5; ctx.fillStyle="#fff"; ctx.fillRect(-40,-40,W+80,H+80);
  // accent ribbon
  ctx.globalAlpha=a*0.92; ctx.fillStyle=w.accent; ctx.fillRect(0,H*0.34,W,H*0.16);
  ctx.globalAlpha=a*0.25; ctx.fillStyle="#fff"; ctx.fillRect(0,H*0.34,W,3); ctx.fillRect(0,H*0.50-3,W,3);
  ctx.globalAlpha=a; ctx.textAlign="center";
  ctx.fillStyle="rgba(255,255,255,.85)"; ctx.font="800 16px Baloo 2, sans-serif";
  ctx.fillText("WORLD "+(curWorldIndex()+1), centerX, H*0.39);
  const fs=Math.floor(Math.min(W*0.095,46));
  ctx.font="800 "+fs+"px Baloo 2, sans-serif";
  ctx.lineWidth=6; ctx.strokeStyle="#2a2350"; ctx.strokeText(w.name, centerX, H*0.46);
  ctx.fillStyle="#fff"; ctx.fillText(w.name, centerX, H*0.46);
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
