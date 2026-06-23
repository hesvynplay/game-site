/* =====================================================================
   Mouse Rush — image-based 2D side-scrolling runner (Canvas 2D, vanilla).
   Storybook style. PNG assets via drawImage(). No external libs.
   Rules: every obstacle is avoidable by JUMP or SLIDE. No "hand".
   No unavoidable / screen-blocking obstacles. Hitboxes < sprite size.
   ===================================================================== */
(() => {
"use strict";

/* ---------------- canvas setup ---------------- */
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = true;
const $ = (id) => document.getElementById(id);

let W=0,H=0,DPR=1,SC=1,groundY=0,mouseX=0;
function resize(){
  DPR = Math.min(window.devicePixelRatio||1, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.floor(W*DPR); canvas.height = Math.floor(H*DPR);
  canvas.style.width=W+"px"; canvas.style.height=H+"px";
  ctx.setTransform(DPR,0,0,DPR,0,0);
  SC = Math.max(0.7, Math.min(1.4, H/720));
  groundY = H*0.82;
  mouseX = W*0.26;
}
window.addEventListener("resize", resize);
resize();

/* ---------------- asset manifest (no hand) ---------------- */
const A = "assets/";
const MANIFEST = {
  // player
  m_idle:A+"player/mouse_idle.png", m_run1:A+"player/mouse_run_01.png", m_run2:A+"player/mouse_run_02.png",
  m_run3:A+"player/mouse_run_03.png", m_run4:A+"player/mouse_run_04.png", m_jump:A+"player/mouse_jump.png",
  m_slide:A+"player/mouse_slide.png", m_happy:A+"player/mouse_happy.png", m_surprised:A+"player/mouse_surprised.png",
  m_over:A+"player/mouse_gameover.png", m_shadow:A+"player/mouse_shadow.png", dust:A+"player/dust_puff.png",
  // items
  cheese:A+"items/cheese.png", crumb:A+"items/breadcrumb.png", seed:A+"items/seed.png",
  sparkle:A+"items/sparkle.png", starburst:A+"items/starburst.png",
  // enemies (hand intentionally NOT included)
  trap:A+"enemies/mousetrap.png", cat_gray:A+"enemies/cat_gray.png", cat_black:A+"enemies/cat_black.png",
  bird_shadow:A+"enemies/bird_shadow.png", bird:A+"enemies/bird_attack.png",
  bug_lady:A+"enemies/bug_ladybug.png", bug_pill:A+"enemies/bug_pillbug.png",
  // backgrounds
  kitchen_back:A+"backgrounds/kitchen_back.png", kitchen_mid:A+"backgrounds/kitchen_mid.png",
  kitchen_front:A+"backgrounds/kitchen_front.png", kitchen_ground:A+"backgrounds/kitchen_ground.png",
  sewer_back:A+"backgrounds/sewer_back.png", sewer_mid:A+"backgrounds/sewer_mid.png",
  sewer_front:A+"backgrounds/sewer_front.png", sewer_ground:A+"backgrounds/sewer_ground.png",
  alley_back:A+"backgrounds/alley_back.png", alley_mid:A+"backgrounds/alley_mid.png",
  alley_front:A+"backgrounds/alley_front.png", alley_ground:A+"backgrounds/alley_ground.png",
  city_back:A+"backgrounds/city_back.png", city_mid:A+"backgrounds/city_mid.png",
  city_front:A+"backgrounds/city_front.png", city_ground:A+"backgrounds/city_ground.png"
};
const IMG = {};
function getImg(k){ const i=IMG[k]; return (i && i.ok) ? i.img : null; }

/* ---------------- preloadAssets() ---------------- */
function preloadAssets(done){
  const keys = Object.keys(MANIFEST);
  let settled = 0;
  const fill=$("loadingFill"), pct=$("loadingPct");
  keys.forEach(k=>{
    const img = new Image();
    IMG[k] = { img, ok:false };
    img.onload = ()=>{ IMG[k].ok = (img.naturalWidth>0); tick(); };
    img.onerror = ()=>{ console.warn("[Mouse Rush] missing asset:", MANIFEST[k]); tick(); };
    img.src = MANIFEST[k];
  });
  function tick(){
    settled++;
    const p = Math.round(settled/keys.length*100);
    if(fill) fill.style.width = p+"%";
    if(pct) pct.textContent = p+"%";
    if(settled>=keys.length) setTimeout(done, 200);
  }
}

/* ---------------- world definitions ---------------- */
const WORLDS = [
  { name:"Kitchen",     back:"kitchen_back", mid:"kitchen_mid", front:"kitchen_front", ground:"kitchen_ground", sky:"#ffe7bd", fb:"#e9c79a" },
  { name:"Sewer",       back:"sewer_back",   mid:"sewer_mid",   front:"sewer_front",   ground:"sewer_ground",   sky:"#16302c", fb:"#214741" },
  { name:"Back Alley",  back:"alley_back",   mid:"alley_mid",   front:"alley_front",   ground:"alley_ground",   sky:"#3b3242", fb:"#544c5e" },
  { name:"City Street", back:"city_back",    mid:"city_mid",    front:"city_front",    ground:"city_ground",    sky:"#bcd2e8", fb:"#6c6c74" }
];
function worldIndexForLevel(lv){ return Math.floor((lv-1)/10) % WORLDS.length; }

/* ---------------- obstacle catalog ----------------
   avoidType: "jump"  -> ground hazard, clear by jumping
              "slide" -> overhead hazard, clear by sliding under
   drawH = visual height (px*SC). hb* = hitbox (kept smaller than sprite).
   All jump-heights are below the jump apex (~130*SC) so they ARE clearable.
   All slide-hazards float above the slide gap so they ARE duck-able.        */
const OBSTACLE_DEFS = {
  trap:      { avoidType:"jump",  drawH:46, hbW:46, hbH:30 },
  bug_lady:  { avoidType:"jump",  drawH:32, hbW:24, hbH:22 },
  bug_pill:  { avoidType:"jump",  drawH:32, hbW:24, hbH:22 },
  cat_gray:  { avoidType:"jump",  drawH:70, hbW:58, hbH:50 },
  cat_black: { avoidType:"jump",  drawH:74, hbW:60, hbH:52 },
  bird:      { avoidType:"slide", drawH:52, hbW:56, hbH:36 }
};

/* WORLD_OBSTACLES: weighted pools per world (no hand anywhere) */
const WORLD_OBSTACLES = [
  [ {key:"trap",w:8}, {key:"cat_gray",w:1} ],                                   // Kitchen — easy
  [ {key:"bug_pill",w:8}, {key:"trap",w:2} ],                                   // Sewer — small bugs
  [ {key:"cat_gray",w:4}, {key:"cat_black",w:3}, {key:"trap",w:3}, {key:"bug_pill",w:2} ], // Back Alley — cats
  [ {key:"bird",w:6}, {key:"cat_gray",w:3}, {key:"bug_lady",w:3} ]              // City — birds & cats
];
function pickObstacleKey(wi){
  const pool=WORLD_OBSTACLES[wi];
  let total=0; for(const e of pool) total+=e.w;
  let r=Math.random()*total;
  for(const e of pool){ r-=e.w; if(r<=0) return e.key; }
  return pool[0].key;
}

/* ---------------- player state ---------------- */
const RUN_FRAMES = ["m_run1","m_run2","m_run3","m_run4"];
const JUMP_V = 800*1;   // base jump velocity (scaled below); apex ~ 139px*SC
let player;
function resetPlayer(){
  player = { y:0, vy:0, onGround:true, sliding:false, slideT:0, anim:0, animT:0, happyT:0, dustT:0, dead:false };
}

/* ---------------- game state ---------------- */
const LOAD=0, TITLE=1, PLAY=2, OVER=3;
let state = LOAD;
let game;
function newGame(){
  game = {
    scroll:0, speed:300*SC, dist:0, score:0, level:1, cheese:0,
    spawnT:1.2, itemT:0.9, obstacles:[], items:[], fx:[], dusts:[],
    shake:0, flash:0, worldIdx:0, banner:0
  };
  resetPlayer();
}

/* ---------------- localStorage handling ---------------- */
const LS = {
  get(k,d){ try{ const v=localStorage.getItem(k); return v===null?d:(+v||0); }catch(e){ return d; } },
  set(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }
};
let bestScore = LS.get("mouseRushBestScore",0);
let bestLevel = LS.get("mouseRushBestLevel",1);
let retryCount = LS.get("mouseRushRetryCount",0);

/* ---------------- input handling ---------------- */
function jump(){
  if(state!==PLAY||player.dead) return;
  if(player.onGround){ player.vy = -JUMP_V*SC; player.onGround=false; player.sliding=false; }
}
function slide(){
  if(state!==PLAY||player.dead) return;
  if(player.onGround){ player.sliding=true; player.slideT=0.6; }
}
window.addEventListener("keydown",(e)=>{
  if(e.code==="Space"||e.code==="ArrowUp"||e.code==="KeyW"){ jump(); e.preventDefault(); }
  else if(e.code==="ArrowDown"||e.code==="KeyS"){ slide(); e.preventDefault(); }
  else if(e.code==="Enter"){ if(state===TITLE||state===OVER) startPlay(); }
});
let tsX=0,tsY=0,tActive=false,tHandled=false;
function ps(x,y){ tsX=x;tsY=y;tActive=true;tHandled=false; }
function pm(x,y){
  if(!tActive||tHandled) return;
  const dy=y-tsY;
  if(dy<-40){ jump(); tHandled=true; }
  else if(dy>40){ slide(); tHandled=true; }
}
function pe(){ if(tActive && !tHandled) jump(); tActive=false; } // tap = jump
canvas.addEventListener("touchstart",(e)=>{const t=e.changedTouches[0];ps(t.clientX,t.clientY);e.preventDefault();},{passive:false});
canvas.addEventListener("touchmove",(e)=>{const t=e.changedTouches[0];pm(t.clientX,t.clientY);e.preventDefault();},{passive:false});
canvas.addEventListener("touchend",(e)=>{pe();e.preventDefault();},{passive:false});
canvas.addEventListener("mousedown",(e)=>ps(e.clientX,e.clientY));
window.addEventListener("mouseup",()=>pe());

$("playBtn").addEventListener("click", startPlay);
$("retryBtn").addEventListener("click", startPlay);

/* ---------------- spacing / safety helpers ---------------- */
// keep a clear gap so the player always has a reachable safe route
function reactionGap(){ return Math.max(240*SC, game.speed*0.78); }
function spaceFree(x, pad){
  for(const o of game.obstacles){ if(Math.abs(o.x - x) < pad + o.drawW*0.5) return false; }
  for(const it of game.items){ if(Math.abs(it.x - x) < pad + it.r) return false; }
  return true;
}

/* ---------------- obstacle spawning ---------------- */
function spawnObstacle(){
  const spawnX = W + 70*SC;
  // guarantee spacing so no unavoidable back-to-back combo can occur
  if(!spaceFree(spawnX, reactionGap())) return;
  const key = pickObstacleKey(game.worldIdx);
  const def = OBSTACLE_DEFS[key];
  if(!def || (def.avoidType!=="jump" && def.avoidType!=="slide")) return; // safety: only jump/slide
  const drawH = def.drawH*SC, hbW = def.hbW*SC, hbH = def.hbH*SC;
  const drawW = drawH; // aspect fixed at draw time from the image; this is a spacing proxy
  const ob = {
    key, avoidType:def.avoidType, drawH, drawW, hbW, hbH, x:spawnX,
    footY: def.avoidType==="jump" ? groundY : groundY - 54*SC,  // overhead floats above the slide gap
    shadow: (key==="bird")
  };
  game.obstacles.push(ob);
}

/* ---------------- item spawning ---------------- */
function spawnItem(){
  const spawnX = W + 70*SC;
  if(!spaceFree(spawnX, 80*SC)) return;        // never overlap an obstacle
  const r=Math.random();
  const key = r<0.8?"cheese":(r<0.92?"crumb":"seed");
  const high = Math.random()<0.32;             // some cheese up high (reachable by jump apex)
  const footY = high ? groundY - (96+Math.random()*28)*SC : groundY - (8+Math.random()*8)*SC;
  game.items.push({ key, x:spawnX, footY, r:18*SC, taken:false });
}

/* ---------------- particles / effects ---------------- */
function addFX(key,x,y){ game.fx.push({key,x,y,t:1,r:(20+Math.random()*10)*SC}); }
function addDust(){ game.dusts.push({x:mouseX-26*SC, y:groundY, t:1}); }

/* ---------------- flow ---------------- */
function startPlay(){
  newGame(); state=PLAY;
  $("title").classList.add("hidden"); $("over").classList.add("hidden");
  $("loading").classList.add("hidden"); $("hud").classList.remove("hidden");
}
function showTitle(){
  state=TITLE;
  $("titleBest").textContent=Math.floor(bestScore);
  $("titleMaxLv").textContent=bestLevel;
  $("loading").classList.add("hidden"); $("title").classList.remove("hidden");
  $("hud").classList.add("hidden"); $("over").classList.add("hidden");
}
function gameOver(){
  if(state!==PLAY) return;
  state=OVER; player.dead=true; game.shake=20; game.flash=1;
  const sc=Math.floor(game.score);
  const isBest = sc>bestScore;
  if(isBest){ bestScore=sc; LS.set("mouseRushBestScore",sc); }
  if(game.level>bestLevel){ bestLevel=game.level; LS.set("mouseRushBestLevel",bestLevel); }
  retryCount++; LS.set("mouseRushRetryCount",retryCount);
  $("overScore").textContent=sc;
  $("overLevel").textContent=game.level;
  $("overCheese").textContent=game.cheese;
  $("overBest").textContent=Math.floor(bestScore);
  $("newBest").classList.toggle("hidden",!isBest);
  setTimeout(()=>{ $("hud").classList.add("hidden"); $("over").classList.remove("hidden"); }, 320);
}

/* ---------------- collision detection ---------------- */
function mouseBox(){
  const mw=40*SC;
  if(player.sliding){ return { x:mouseX-mw/2, y:groundY-40*SC, w:mw, h:40*SC }; }
  const mh=76*SC;
  return { x:mouseX-mw/2, y:groundY - mh + player.y, w:mw, h:mh };
}
function obstacleBox(o){
  return { x:o.x-o.hbW/2, y:o.footY-o.hbH, w:o.hbW, h:o.hbH };
}
function hit(a,b){ return a.x<b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y; }

/* ---------------- update loop ---------------- */
let last=0;
function update(dt){
  if(state!==PLAY) return;
  game.speed = (300 + game.level*16)*SC;
  game.scroll += game.speed*dt;
  game.dist += game.speed*dt;
  game.score += game.speed*dt*0.05;

  // level / world (first ~1400px = level 1, then ramps)
  const lv = 1 + Math.floor(game.dist/(1400*SC));
  if(lv>game.level){
    const pw=game.worldIdx;
    game.level=lv; game.worldIdx=worldIndexForLevel(lv);
    if(game.worldIdx!==pw){ game.banner=1.6; game.flash=Math.max(game.flash,0.5); }
  }

  // player physics
  if(!player.onGround){
    player.vy += 2300*SC*dt;
    player.y += player.vy*dt;
    if(player.y>=0){ player.y=0; player.vy=0; player.onGround=true; }
  }
  if(player.sliding){ player.slideT-=dt; if(player.slideT<=0) player.sliding=false; }
  if(player.happyT>0) player.happyT-=dt;
  player.animT+=dt;
  const frameDur=Math.max(0.05, 0.12 - game.level*0.002);
  if(player.animT>=frameDur){ player.animT=0; player.anim=(player.anim+1)%RUN_FRAMES.length; }
  if(player.onGround && !player.sliding){ player.dustT-=dt; if(player.dustT<=0){ addDust(); player.dustT=0.16; } }

  // spawn (easy start: long gaps early, tighten with level but spacing-guarded)
  game.spawnT-=dt;
  if(game.spawnT<=0){ spawnObstacle(); game.spawnT = Math.max(0.7, 1.5 - game.level*0.02)*(0.8+Math.random()*0.5); }
  game.itemT-=dt;
  if(game.itemT<=0){ spawnItem(); game.itemT = (0.55+Math.random()*0.7); }

  // move + collide obstacles
  const mb=mouseBox();
  for(const o of game.obstacles){ o.x -= game.speed*dt; }
  for(const o of game.obstacles){ if(hit(mb,obstacleBox(o))){ gameOver(); break; } }
  game.obstacles = game.obstacles.filter(o=>o.x>-120*SC);

  // move + collect items
  for(const it of game.items){ it.x -= game.speed*dt; }
  for(const it of game.items){
    if(it.taken) continue;
    const ib={ x:it.x-it.r, y:it.footY-it.r, w:it.r*2, h:it.r*2 };
    if(hit(mb,ib)){
      it.taken=true;
      if(it.key==="cheese"){ game.cheese++; game.score+=12; } else { game.score+=6; }
      player.happyT=0.5;
      addFX(Math.random()<0.5?"sparkle":"starburst", it.x, it.footY-it.r);
    }
  }
  game.items = game.items.filter(it=>!it.taken && it.x>-80*SC);

  // fx & dust
  for(const f of game.fx){ f.t-=dt*2.2; }
  game.fx = game.fx.filter(f=>f.t>0);
  for(const d of game.dusts){ d.t-=dt*2.6; d.x-=game.speed*dt; }
  game.dusts = game.dusts.filter(d=>d.t>0);

  if(game.shake>0) game.shake*=0.86;
  if(game.flash>0) game.flash-=dt*1.6;
  if(game.banner>0) game.banner-=dt;

  // HUD
  $("hudScore").textContent=Math.floor(game.score);
  $("hudLevel").textContent=game.level;
  $("hudWorld").textContent=WORLDS[game.worldIdx].name;
  $("hudCheese").textContent=game.cheese;
}

/* ---------------- draw helpers ---------------- */
function drawTiled(key, factor, drawY, drawH, fbColor){
  const img=getImg(key);
  const off = (game?game.scroll:last*0.05)*factor;
  if(img){
    const aspect = img.naturalWidth/img.naturalHeight;
    const tw = drawH*aspect;
    let start = -((off % tw)+tw)%tw;
    for(let x=start; x<W+tw; x+=tw){ ctx.drawImage(img, x, drawY, tw, drawH); }
  } else if(fbColor){ ctx.fillStyle=fbColor; ctx.fillRect(0,drawY,W,drawH); }
}
function drawSprite(key, cx, footY, targetH, fb){
  const img=getImg(key);
  if(img){
    const aspect=img.naturalWidth/img.naturalHeight;
    const w=targetH*aspect;
    ctx.drawImage(img, cx-w/2, footY-targetH, w, targetH);
  } else if(fb){ fb(cx,footY,targetH); }
}

/* ---------------- draw loop ---------------- */
function render(){
  ctx.save();
  if(game && game.shake>0.4){ ctx.translate((Math.random()-0.5)*game.shake,(Math.random()-0.5)*game.shake); }
  const w = WORLDS[game?game.worldIdx:0];

  ctx.fillStyle=w.sky; ctx.fillRect(-40,-40,W+80,H+80);
  drawTiled(w.back, 0.15, 0, H, w.sky);
  drawTiled(w.mid, 0.35, H*0.12, H*0.78, null);
  drawTiled(w.front, 0.6, H*0.30, H*0.62, null);
  drawTiled(w.ground, 1.0, groundY-6*SC, H-groundY+6*SC, w.fb);

  if(game){
    // items
    for(const it of game.items){
      drawSprite(it.key, it.x, it.footY+it.r, it.r*2.2, (cx,fy,h)=>{ ctx.fillStyle="#ffd21f"; ctx.beginPath(); ctx.arc(cx,fy-h/2,h*0.4,0,6.28); ctx.fill(); });
    }
    // obstacles (bird shows a diegetic ground shadow — not a UI warning)
    for(const o of game.obstacles){
      if(o.shadow){ drawSprite("bird_shadow", o.x, groundY+2*SC, 16*SC, null); }
      drawSprite(o.key, o.x, o.footY, o.drawH, (cx,fy,h)=>{
        ctx.fillStyle=(o.avoidType==="jump")?"#c8607a":"#7aa06a";
        ctx.beginPath(); ctx.ellipse(cx,fy-h*0.5,h*0.42,h*0.5,0,0,6.28); ctx.fill();
      });
    }
    // player shadow
    const shScale = 1 - Math.min(0.6, (-player.y)/(260*SC));
    const sh=getImg("m_shadow");
    if(sh){ const aw=70*SC*shScale, ah=aw*(sh.naturalHeight/sh.naturalWidth); ctx.globalAlpha=0.5*shScale; ctx.drawImage(sh, mouseX-aw/2, groundY-ah*0.4, aw, ah); ctx.globalAlpha=1; }
    else { ctx.globalAlpha=0.22*shScale; ctx.fillStyle="#000"; ctx.beginPath(); ctx.ellipse(mouseX,groundY,30*SC*shScale,8*SC*shScale,0,0,6.28); ctx.fill(); ctx.globalAlpha=1; }

    // dust
    for(const d of game.dusts){ ctx.globalAlpha=Math.max(0,d.t)*0.8; drawSprite("dust", d.x, d.y, 26*SC, (cx,fy,h)=>{ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(cx,fy-h/2,h*0.4,0,6.28);ctx.fill();}); }
    ctx.globalAlpha=1;

    // player
    let key="m_run1";
    if(player.dead) key="m_over";
    else if(!player.onGround) key="m_jump";
    else if(player.sliding) key="m_slide";
    else if(player.happyT>0) key="m_happy";
    else key=RUN_FRAMES[player.anim];
    const ph = player.sliding ? 56*SC : 84*SC;
    const footY = player.sliding ? groundY : groundY + player.y;
    drawSprite(key, mouseX, footY, ph, (cx,fy,h)=>{ ctx.fillStyle="#d7cef0"; ctx.strokeStyle="#221a44"; ctx.lineWidth=3; ctx.beginPath(); ctx.ellipse(cx,fy-h*0.45,h*0.32,h*0.42,0,0,6.28); ctx.fill(); ctx.stroke(); });

    // collect fx
    for(const f of game.fx){ ctx.globalAlpha=Math.max(0,f.t); drawSprite(f.key, f.x, f.y+f.r, f.r*2, (cx,fy,h)=>{ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(cx,fy-h/2,h*0.4,0,6.28);ctx.fill();}); }
    ctx.globalAlpha=1;

    // world-change banner
    if(game.banner>0.02){
      const a=Math.min(1,game.banner*1.2);
      ctx.globalAlpha=a*0.9; ctx.fillStyle="rgba(28,23,54,.5)"; ctx.fillRect(0,H*0.36,W,H*0.13);
      ctx.globalAlpha=a; ctx.textAlign="center"; ctx.fillStyle="#fff";
      ctx.font="800 "+Math.floor(Math.min(W*0.09,46))+"px Baloo 2, sans-serif";
      ctx.lineWidth=6; ctx.strokeStyle="#221a44"; ctx.strokeText(WORLDS[game.worldIdx].name, W/2, H*0.45);
      ctx.fillText(WORLDS[game.worldIdx].name, W/2, H*0.45);
      ctx.globalAlpha=1; ctx.textAlign="start";
    }
    if(game.flash>0.02){ ctx.globalAlpha=game.flash*0.4; ctx.fillStyle="#ff2b2b"; ctx.fillRect(-40,-40,W+80,H+80); ctx.globalAlpha=1; }
  }
  ctx.restore();
}

/* ---------------- main loop ---------------- */
function frame(ts){
  const dt=Math.min(0.05,(ts-last)/1000)||0.016; last=ts;
  update(dt); render();
  requestAnimationFrame(frame);
}

/* ---------------- boot ---------------- */
preloadAssets(()=>{ showTitle(); });
requestAnimationFrame(frame);

})();
