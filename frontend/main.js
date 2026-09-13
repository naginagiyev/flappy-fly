import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { BrainView } from "./brain-view.js";

var stage = document.getElementById('stage');
var topHud = document.getElementById('top-hud');
var activityPanelEl = document.getElementById('activity-panel');
var scoreEl = document.getElementById('score');
var startScreen = document.getElementById('start-screen');
var overScreen = document.getElementById('gameover-screen');
var finalScoreEl = document.getElementById('final-score');
var bestScoreEl = document.getElementById('best-score');
var obstacleCountEl = document.getElementById('obstacle-count');
var overTitleEl = document.getElementById('over-title');
var dimmer = document.getElementById('dimmer');
var btnStart = document.getElementById('btn-start');
var btnRetry = document.getElementById('btn-retry');

var scene = new THREE.Scene();
var camera = new THREE.PerspectiveCamera(50, window.innerWidth/window.innerHeight, 0.1, 100);
camera.position.set(0,0,9);
var baseCamY = 0;

var renderer = new THREE.WebGLRenderer({ antialias:true, alpha:false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);

var clock = new THREE.Clock();

var FLOOR_Y = -3.9;
var CEIL_Y = 3.9;
var halfW = 6, halfH = 4.196;
var FLY_X = -2.2;

function updateBounds(){
  var w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w/h;
  camera.updateProjectionMatrix();
  halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov/2)) * camera.position.z;
  halfW = halfH * camera.aspect;
  FLY_X = -halfW * 0.34;
  renderer.setSize(w,h);
}
window.addEventListener('resize', updateBounds);

var ambient = new THREE.AmbientLight(0xfff1d6, 0.75);
scene.add(ambient);
var lamp = new THREE.DirectionalLight(0xffe4b0, 0.9);
lamp.position.set(4,6,8);
lamp.castShadow = true;
lamp.shadow.mapSize.set(1024,1024);
lamp.shadow.camera.left = -12; lamp.shadow.camera.right = 12;
lamp.shadow.camera.top = 8; lamp.shadow.camera.bottom = -8;
scene.add(lamp);
var rim = new THREE.PointLight(0x66c2ff, 0.5, 12);
rim.position.set(-2,1,4);
scene.add(rim);

function canvasTexture(draw, w, h){
  var c = document.createElement('canvas'); c.width=w; c.height=h;
  var ctx = c.getContext('2d');
  draw(ctx,w,h);
  var t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

var wallpaper = new THREE.Mesh(
  new THREE.PlaneGeometry(80,20),
  new THREE.MeshBasicMaterial({ color: 0xF7C48B })
);
wallpaper.position.set(0,1.2,-9);
scene.add(wallpaper);

var floorTex = canvasTexture(function(ctx,w,h){
  ctx.fillStyle='#B97A56'; ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='#8C5A3C'; ctx.lineWidth=4;
  var cell=64;
  for(var x=0;x<=w;x+=cell){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
  ctx.fillStyle='rgba(255,255,255,0.06)';
  for(var y=0;y<h;y+=cell){ ctx.fillRect(0,y,w,4); }
}, 512, 128);
floorTex.wrapS = THREE.RepeatWrapping;
floorTex.repeat.set(16,1);

var floor = new THREE.Mesh(
  new THREE.PlaneGeometry(90,3),
  new THREE.MeshStandardMaterial({ map: floorTex, roughness:0.85 })
);
floor.position.set(0, FLOOR_Y - 1.5, 0);
floor.receiveShadow = true;
scene.add(floor);

var ceiling = new THREE.Mesh(
  new THREE.PlaneGeometry(90,3),
  new THREE.MeshStandardMaterial({ color:0xFBF3E4, roughness:0.95 })
);
ceiling.position.set(0, CEIL_Y + 1.5, 0);
scene.add(ceiling);

var dust = new THREE.Group();
var dustData = [];
for(var d=0; d<44; d++){
  var m = new THREE.Mesh(
    new THREE.SphereGeometry(0.02 + Math.random()*0.025, 6, 6),
    new THREE.MeshBasicMaterial({ color:0xFFF6DE, transparent:true, opacity:0.5 })
  );
  m.position.set((Math.random()*2-1)*halfW*1.4, (Math.random()*2-1)*3.8, (Math.random()*2-1)*3 + 1);
  dustData.push({ mesh:m, spd: 0.15+Math.random()*0.25, ph: Math.random()*Math.PI*2 });
  dust.add(m);
}
scene.add(dust);

function makeFly(){
  var fly = new THREE.Group();
  var model = new THREE.Group();
  model.rotation.y = Math.PI/2;
  fly.add(model);

  var bodyMat = new THREE.MeshStandardMaterial({ color:0x2B2438, roughness:0.35, metalness:0.35 });
  var sheenMat = new THREE.MeshStandardMaterial({ color:0x4F86C6, roughness:0.25, metalness:0.5, transparent:true, opacity:0.35 });

  var abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.34,16,16), bodyMat);
  abdomen.scale.set(1,0.85,1.25);
  abdomen.position.set(0,-0.02,-0.1);
  abdomen.castShadow = true;
  model.add(abdomen);

  var sheen = new THREE.Mesh(new THREE.SphereGeometry(0.345,16,16), sheenMat);
  sheen.scale.copy(abdomen.scale);
  sheen.position.copy(abdomen.position);
  model.add(sheen);

  var head = new THREE.Mesh(new THREE.SphereGeometry(0.22,16,16), bodyMat);
  head.position.set(0,0.06,0.28);
  head.castShadow = true;
  model.add(head);

  var eyeMat = new THREE.MeshStandardMaterial({ color:0xC1272D, roughness:0.15, metalness:0.2, emissive:0x300000, emissiveIntensity:0.2 });
  var eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.13,12,12), eyeMat);
  eyeL.position.set(-0.15,0.09,0.36); model.add(eyeL);
  var eyeR = eyeL.clone(); eyeR.position.x = 0.15; model.add(eyeR);

  var legMat = new THREE.MeshStandardMaterial({ color:0x1A1620, roughness:0.6 });
  var legs = [];
  for(var i=0;i<3;i++){
    var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015,0.015,0.42,5), legMat);
    leg.position.set((i-1)*0.14, -0.32, -0.05 + i*0.05);
    leg.rotation.z = (i-1)*0.35;
    model.add(leg);
    legs.push(leg);
  }

  var wingMat = new THREE.MeshStandardMaterial({ color:0xCFE8F3, roughness:0.2, metalness:0.1, transparent:true, opacity:0.55, side:THREE.DoubleSide });
  function makeWing(sign){
    var pivot = new THREE.Group();
    pivot.position.set(sign*0.06, 0.14, -0.02);
    var wing = new THREE.Mesh(new THREE.CircleGeometry(0.36, 16, 0, Math.PI), wingMat);
    wing.rotation.x = -Math.PI/2;
    wing.position.set(sign*0.3, 0, 0);
    wing.scale.set(sign,1,1.5);
    pivot.add(wing);
    return { pivot:pivot, wing:wing };
  }
  var wingL = makeWing(-1); model.add(wingL.pivot);
  var wingR = makeWing(1); model.add(wingR.pivot);

  var body = new THREE.Group();
  body.add(abdomen); body.add(sheen); body.add(head); body.add(eyeL); body.add(eyeR);
  legs.forEach(function(l){ body.add(l); });
  model.add(body);

  fly.userData = { wingL:wingL, wingR:wingR, body:body, legs:legs };
  return fly;
}

var fly = makeFly();
scene.add(fly);

var flyVel = 0;
var flapAnim = 0;
var wingPhase = 0;
var GRAVITY = -20;
var FLAP_IMPULSE = 5.2;
var MAX_FALL = -10;

var trailPool = [];
function spawnTrail(){
  var geo = new THREE.SphereGeometry(0.035,6,6);
  var mat = new THREE.MeshBasicMaterial({ color:0xFFE8B0, transparent:true, opacity:0.5 });
  var m = new THREE.Mesh(geo,mat);
  m.position.copy(fly.position);
  m.position.x -= 0.2;
  scene.add(m);
  trailPool.push({ mesh:m, life:0.5, age:0 });
}

var bursts = [];
function spawnBurst(pos, color, count, spread, life){
  for(var i=0;i<count;i++){
    var geo = new THREE.SphereGeometry(0.04 + Math.random()*0.03, 6, 6);
    var mat = new THREE.MeshBasicMaterial({ color:color, transparent:true, opacity:0.9 });
    var m = new THREE.Mesh(geo, mat);
    m.position.copy(pos);
    scene.add(m);
    var ang = Math.random()*Math.PI*2;
    var el = (Math.random()-0.5)*Math.PI*0.6;
    var spd = spread*(0.5+Math.random()*0.5);
    bursts.push({
      mesh:m,
      vel:new THREE.Vector3(Math.cos(ang)*Math.cos(el)*spd, Math.sin(el)*spd + 1.5, Math.sin(ang)*Math.cos(el)*spd*0.3),
      life:life, age:0
    });
  }
}

var swatterColors = [0xFF6F91,0xFFC145,0x4FB0C6,0x8AC24A,0xB96FD1];
var jarColors = [0xE85D4E,0xF2B33D,0x5A9E6F,0x4A7FB5];

function makeSwatterTexture(hex){
  var col = '#'+hex.toString(16).padStart(6,'0');
  return canvasTexture(function(ctx,w,h){
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle = col;
    var r = 34;
    ctx.beginPath();
    ctx.moveTo(r,4); ctx.lineTo(w-r,4);
    ctx.quadraticCurveTo(w-4,4,w-4,r);
    ctx.lineTo(w-4,h-r);
    ctx.quadraticCurveTo(w-4,h-4,w-r,h-4);
    ctx.lineTo(r,h-4);
    ctx.quadraticCurveTo(4,h-4,4,h-r);
    ctx.lineTo(4,r);
    ctx.quadraticCurveTo(4,4,r,4);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth=6; ctx.strokeStyle='rgba(0,0,0,0.18)'; ctx.stroke();
    ctx.globalCompositeOperation = 'destination-out';
    var step=22;
    for(var y=step; y<h-step; y+=step){
      for(var x=step; x<w-step; x+=step){
        ctx.beginPath(); ctx.arc(x,y,7,0,Math.PI*2); ctx.fill();
      }
    }
  }, 256, 340);
}

function makeSwatterPair(x, gapCenter, gapHalf, colorHex){
  var group = new THREE.Group();
  group.position.x = x;

  var paddleH = 1.5, paddleW = 1.1;
  var paddleBottom = gapCenter + gapHalf;
  var paddleTop = paddleBottom + paddleH;
  var handleTop = CEIL_Y + 4;
  var handleLen = handleTop - paddleTop;

  var handleMat = new THREE.MeshStandardMaterial({ color:0xD8B384, roughness:0.5, metalness:0.1 });
  var handle = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.06,handleLen,8), handleMat);
  handle.position.set(0, paddleTop + handleLen/2, 0);
  handle.castShadow = true;
  group.add(handle);

  var tex = makeSwatterTexture(colorHex);
  var paddleMat = new THREE.MeshStandardMaterial({ map:tex, transparent:true, roughness:0.55, side:THREE.DoubleSide });
  var paddle = new THREE.Mesh(new THREE.PlaneGeometry(paddleW,paddleH), paddleMat);
  paddle.position.set(0, paddleBottom + paddleH/2, 0.02);
  paddle.castShadow = true;
  group.add(paddle);

  var backer = new THREE.Mesh(new THREE.PlaneGeometry(paddleW*0.96,paddleH*0.96), new THREE.MeshBasicMaterial({ color:0x000000, transparent:true, opacity:0.12 }));
  backer.position.copy(paddle.position); backer.position.z -= 0.03;
  group.add(backer);

  group.userData = {
    type:'swatter',
    bottomY: paddle.position.y - paddleH/2,
    halfWidth: paddleW/2,
    swingPhase: Math.random()*Math.PI*2
  };
  return group;
}

function makeJarStack(x, topY){
  var group = new THREE.Group();
  group.position.x = x;
  var y = FLOOR_Y;
  var colorPick = jarColors[Math.floor(Math.random()*jarColors.length)];
  var maxTopY = -100;
  var guard = 0;
  while(y < topY - 0.2 && guard < 8){
    guard++;
    var h = 0.7 + Math.random()*0.35;
    var r = 0.34 + Math.random()*0.14;
    if(y + h > topY) h = Math.max(0.3, topY - y);
    var color = jarColors[(colorPick + guard) % jarColors.length];
    var mat = new THREE.MeshStandardMaterial({ color:color, roughness:0.4, metalness:0.25 });
    var can = new THREE.Mesh(new THREE.CylinderGeometry(r*0.94,r,h,14), mat);
    can.position.set((Math.random()-0.5)*0.04*guard, y + h/2, (Math.random()-0.5)*0.05);
    can.castShadow = true;
    can.receiveShadow = true;
    group.add(can);

    var lid = new THREE.Mesh(new THREE.CylinderGeometry(r*0.96,r*0.96,0.06,14), new THREE.MeshStandardMaterial({ color:0xCFCFCF, roughness:0.3, metalness:0.6 }));
    lid.position.set(can.position.x, y + h + 0.01, can.position.z);
    group.add(lid);

    y += h;
    maxTopY = y;
  }
  group.userData = { type:'jars', topY:maxTopY, halfWidth:0.5, wobblePhase: Math.random()*Math.PI*2 };
  return group;
}

var obstacles = [];
var spawnTimer = 0;
var SPAWN_DIST = 7;
var speed = 4.5;
var score = 0;
var best = 0;
var passedCount = 0;
var GAP = 3.2;

function spawnObstacle(){
  var x = halfW + 2.2;
  var margin = 0.9;
  var center = FLOOR_Y + margin + GAP/2 + Math.random()*((CEIL_Y - margin) - (FLOOR_Y + margin + GAP) );
  var colorHex = swatterColors[Math.floor(Math.random()*swatterColors.length)];
  var top = makeSwatterPair(x, center, GAP/2, colorHex);
  var bottom = makeJarStack(x, center - GAP/2);
  scene.add(top); scene.add(bottom);
  var rec = { x:x, top:top, bottom:bottom, passed:false };
  obstacles.push(rec);
}

function clearObstacle(rec){
  scene.remove(rec.top); scene.remove(rec.bottom);
  disposeGroup(rec.top); disposeGroup(rec.bottom);
}
function disposeGroup(g){
  g.traverse(function(o){
    if(o.geometry) o.geometry.dispose();
    if(o.material){
      if(o.material.map) o.material.map.dispose();
      o.material.dispose();
    }
  });
}

var audioCtx = null;
function ensureAudio(){
  if(!audioCtx){
    try{ audioCtx = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){}
  }
}
function tone(freqStart, freqEnd, dur, type, vol){
  if(!audioCtx) return;
  var t0 = audioCtx.currentTime;
  var osc = audioCtx.createOscillator();
  var gain = audioCtx.createGain();
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(freqStart, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20,freqEnd), t0+dur);
  gain.gain.setValueAtTime(vol||0.12, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0+dur);
  osc.connect(gain); gain.connect(audioCtx.destination);
  osc.start(t0); osc.stop(t0+dur);
}
function playFlap(){ tone(230,150,0.09,'sawtooth',0.05); }
function playScore(){ tone(700,1000,0.12,'sine',0.08); }
function playSplat(){
  if(!audioCtx) return;
  var t0 = audioCtx.currentTime;
  var bufferSize = audioCtx.sampleRate*0.3;
  var buffer = audioCtx.createBuffer(1,bufferSize,audioCtx.sampleRate);
  var data = buffer.getChannelData(0);
  for(var i=0;i<bufferSize;i++){ data[i] = (Math.random()*2-1)*(1-i/bufferSize); }
  var noise = audioCtx.createBufferSource(); noise.buffer = buffer;
  var filter = audioCtx.createBiquadFilter(); filter.type='lowpass'; filter.frequency.value=800;
  var gain = audioCtx.createGain(); gain.gain.setValueAtTime(0.35,t0); gain.gain.exponentialRampToValueAtTime(0.001,t0+0.3);
  noise.connect(filter); filter.connect(gain); gain.connect(audioCtx.destination);
  noise.start(t0);
  tone(160,50,0.35,'sawtooth',0.15);
}

var STATE = { READY:'ready', PLAYING:'playing', OVER:'over' };
var state = STATE.READY;
var shakeMag = 0;

function resetGame(){
  obstacles.forEach(clearObstacle);
  obstacles = [];
  trailPool.forEach(function(p){ scene.remove(p.mesh); });
  trailPool = [];
  bursts.forEach(function(b){ scene.remove(b.mesh); });
  bursts = [];

  fly.position.set(FLY_X, 0.3, 0);
  fly.rotation.set(0,0,0);
  fly.userData.body.scale.set(1,1,1);
  flyVel = 0;
  flapAnim = 0;
  score = 0;
  passedCount = 0;
  speed = 4;
  spawnTimer = SPAWN_DIST * 0.6;
  scoreEl.textContent = '0';
  dimmer.classList.remove('on');
}

function startGame(){
  ensureAudio();
  resetGame();
  state = STATE.PLAYING;
  overScreen.classList.remove('enter');
  overScreen.classList.add('hidden');
  startScreen.classList.remove('enter');
  setTimeout(function(){ startScreen.classList.add('hidden'); }, 20);
  topHud.classList.add('show');
  activityPanelEl.style.display = '';
}

function handleStartInput(){
  if(state === STATE.READY) startGame();
}

function brainFlap(){
  if(state !== STATE.PLAYING) return;
  flyVel = FLAP_IMPULSE;
  flapAnim = 1;
  playFlap();
  spawnBurst(fly.position, 0xFFF3C0, 4, 1.4, 0.35);
}

function endGame(){
  state = STATE.OVER;
  activityPanelEl.style.display = 'none';
  playSplat();
  shakeMag = 0.35;
  dimmer.classList.add('on');
  spawnBurst(fly.position, 0xFFD24C, 14, 3.2, 0.7);
  if(score > best) best = score;

  overTitleEl.textContent = score > 0 && score === best && score >= 3 ? 'New Best!' : 'Splat!';
  bestScoreEl.textContent = String(best);
  obstacleCountEl.textContent = String(passedCount);

  var animScore = { v:0 };
  var startT = performance.now();
  function tick(now){
    var p = Math.min(1, (now-startT)/650);
    var eased = 1-Math.pow(1-p,3);
    finalScoreEl.textContent = String(Math.round(eased*score));
    if(p<1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  setTimeout(function(){
    overScreen.classList.remove('hidden');
    requestAnimationFrame(function(){ overScreen.classList.add('enter'); });
  }, 260);
}

btnStart.addEventListener('click', function(){
  ensureAudio();
  startScreen.classList.remove('enter');
  handleStartInput();
});
btnRetry.addEventListener('click', function(){
  overScreen.classList.remove('enter');
  setTimeout(function(){
    overScreen.classList.add('hidden');
    startGame();
  }, 260);
});

requestAnimationFrame(function(){
  startScreen.classList.add('enter');
});

function checkCollision(){
  var r = 0.32;
  var fx = fly.position.x, fy = fly.position.y;

  if(fy - r < FLOOR_Y) return true;
  if(fy + r > CEIL_Y + 1.2) return true;

  for(var i=0;i<obstacles.length;i++){
    var o = obstacles[i];
    var dx = Math.abs(fx - o.x);
    if(dx < o.top.userData.halfWidth + r){
      if(fy + r > o.top.userData.bottomY) return true;
    }
    if(dx < o.bottom.userData.halfWidth + r){
      if(fy - r < o.bottom.userData.topY) return true;
    }
  }
  return false;
}

var brainView = new BrainView(document.getElementById('brain-view-canvas'));

var WS_URL = 'ws://localhost:8765';
var VISUAL_BAR_MAX = 3000;
var DN_BAR_MAX = 10;
var ws = null;
var wsReady = false;
var awaitingReply = false;

function connectWs(){
  ws = new WebSocket(WS_URL);
  ws.onopen = function(){ wsReady = true; };
  ws.onclose = function(){
    wsReady = false;
    awaitingReply = false;
    setTimeout(connectWs, 1500);
  };
  ws.onerror = function(){};
  ws.onmessage = function(ev){
    awaitingReply = false;
    var data = JSON.parse(ev.data);
    if(data.flap) brainFlap();
    updateActivityBars(data.activity);
    brainView.applySpikes(data.spiked);
  };
}
connectWs();

function setBar(id, value, max){
  var pct = Math.max(0, Math.min(100, (value/max)*100));
  document.getElementById(id).style.width = pct + '%';
}
function updateActivityBars(activity){
  if(!activity) return;
  setBar('bar-visual', activity.visual ?? 0, VISUAL_BAR_MAX);
  setBar('bar-dnp01l', activity.DNp01_L ?? 0, DN_BAR_MAX);
  setBar('bar-dnp01r', activity.DNp01_R ?? 0, DN_BAR_MAX);
  setBar('bar-dnp03l', activity.DNp03_L ?? 0, DN_BAR_MAX);
  setBar('bar-dnp03r', activity.DNp03_R ?? 0, DN_BAR_MAX);
}

function nearestObstacle(){
  var bestObstacle = null;
  for(var i=0;i<obstacles.length;i++){
    var o = obstacles[i];
    var hw = Math.max(o.top.userData.halfWidth, o.bottom.userData.halfWidth);
    if(o.x + hw < fly.position.x - 0.32) continue;
    if(bestObstacle === null || o.x < bestObstacle.x) bestObstacle = o;
  }
  return bestObstacle;
}

function sendStateToBrain(){
  if(!wsReady || awaitingReply) return;
  var o = nearestObstacle();
  var spawnX = halfW + 2.2;
  var pipeDx = 1.0;
  var gapTopNorm = 0.0;
  var gapBottomNorm = 1.0;
  if(o){
    pipeDx = Math.max(0, Math.min(1, (o.x - fly.position.x) / (spawnX - FLY_X)));
    var gapWorldTop = o.top.userData.bottomY;
    var gapWorldBottom = o.bottom.userData.topY;
    gapTopNorm = (CEIL_Y - gapWorldTop) / (CEIL_Y - FLOOR_Y);
    gapBottomNorm = (CEIL_Y - gapWorldBottom) / (CEIL_Y - FLOOR_Y);
  }
  var birdYNorm = (CEIL_Y - fly.position.y) / (CEIL_Y - FLOOR_Y);

  awaitingReply = true;
  ws.send(JSON.stringify({
    bird_y: birdYNorm,
    gap_top: gapTopNorm,
    gap_bottom: gapBottomNorm,
    pipe_dx: pipeDx,
    alive: state === STATE.PLAYING,
  }));
}

var trailTimer = 0;

function animate(){
  requestAnimationFrame(animate);
  var dt = Math.min(clock.getDelta(), 0.035);
  var elapsed = clock.elapsedTime;

  dustData.forEach(function(p){
    p.mesh.position.y += Math.sin(elapsed*p.spd + p.ph)*0.0025;
    p.mesh.position.x -= dt*0.15;
    if(p.mesh.position.x < -halfW*1.5) p.mesh.position.x = halfW*1.5;
  });

  floorTex.offset.x += dt*speed*0.09;

  flapAnim = Math.max(0, flapAnim - dt*3.2);

  if(state === STATE.PLAYING){
    flyVel += GRAVITY*dt;
    if(flyVel < MAX_FALL) flyVel = MAX_FALL;
    fly.position.y += flyVel*dt;

    var targetRot = THREE.MathUtils.clamp(flyVel*0.05, -0.6, 0.9);
    fly.rotation.z = THREE.MathUtils.lerp(fly.rotation.z, targetRot, dt*8);

    trailTimer -= dt;
    if(trailTimer <= 0){ spawnTrail(); trailTimer = 0.045; }

    spawnTimer -= dt*speed;
    if(spawnTimer <= 0){ spawnObstacle(); spawnTimer = SPAWN_DIST; }

    for(var i=obstacles.length-1;i>=0;i--){
      var o = obstacles[i];
      o.x -= speed*dt;
      o.top.position.x = o.x;
      o.bottom.position.x = o.x;

      o.top.userData.swingPhase += dt;
      o.top.rotation.z = Math.sin(o.top.userData.swingPhase*1.3)*0.035;
      o.bottom.userData.wobblePhase += dt;
      o.bottom.rotation.z = Math.sin(o.bottom.userData.wobblePhase*1.7)*0.012;

      if(!o.passed && o.x < fly.position.x){
        o.passed = true;
        score++; passedCount++;
        scoreEl.textContent = String(score);
        playScore();
        scoreEl.style.transform = 'scale(1.25)';
        setTimeout(function(){ scoreEl.style.transform='scale(1)'; }, 140);
      }
      if(o.x < -halfW - 3){
        clearObstacle(o);
        obstacles.splice(i,1);
      }
    }

    if(checkCollision()) endGame();
    else sendStateToBrain();
  } else if(state === STATE.READY){
    fly.position.y = 0.3 + Math.sin(elapsed*2.2)*0.18;
    fly.rotation.z = Math.sin(elapsed*2.2)*0.08;
  } else if(state === STATE.OVER){
    fly.rotation.z += dt*6;
    fly.position.y -= dt*2.4;
    fly.userData.body.scale.lerp(new THREE.Vector3(1.3,0.55,1.3), dt*4);
  }

  var wingSpeed = state===STATE.PLAYING||state===STATE.READY ? (16 + flapAnim*20) : 2;
  var wingAmp = state===STATE.OVER ? 0.05 : (0.35 + flapAnim*0.5);
  wingPhase += dt*wingSpeed;
  fly.userData.wingL.pivot.rotation.z = Math.sin(wingPhase)*wingAmp;
  fly.userData.wingR.pivot.rotation.z = -Math.sin(wingPhase)*wingAmp;

  var bodyScaleY = 1 - flapAnim*0.22;
  var bodyScaleXZ = 1 + flapAnim*0.12;
  if(state !== STATE.OVER){
    fly.userData.body.scale.set(
      THREE.MathUtils.lerp(fly.userData.body.scale.x, bodyScaleXZ, dt*10),
      THREE.MathUtils.lerp(fly.userData.body.scale.y, bodyScaleY, dt*10),
      THREE.MathUtils.lerp(fly.userData.body.scale.z, bodyScaleXZ, dt*10)
    );
  }

  for(var t=trailPool.length-1;t>=0;t--){
    var tp = trailPool[t];
    tp.age += dt;
    tp.mesh.position.x -= dt*1.2;
    tp.mesh.material.opacity = 0.5*(1 - tp.age/tp.life);
    tp.mesh.scale.setScalar(1 + tp.age*1.5);
    if(tp.age >= tp.life){ scene.remove(tp.mesh); tp.mesh.geometry.dispose(); tp.mesh.material.dispose(); trailPool.splice(t,1); }
  }
  for(var b=bursts.length-1;b>=0;b--){
    var bu = bursts[b];
    bu.age += dt;
    bu.vel.y -= dt*6;
    bu.mesh.position.addScaledVector(bu.vel, dt);
    bu.mesh.material.opacity = 0.9*(1 - bu.age/bu.life);
    if(bu.age >= bu.life){ scene.remove(bu.mesh); bu.mesh.geometry.dispose(); bu.mesh.material.dispose(); bursts.splice(b,1); }
  }

  shakeMag *= 0.9;
  var sx = (Math.random()-0.5)*shakeMag;
  var sy = (Math.random()-0.5)*shakeMag;
  camera.position.x = sx;
  camera.position.y = baseCamY + sy + THREE.MathUtils.clamp(fly.position.y*0.06, -0.3, 0.3);
  rim.position.set(fly.position.x+1, fly.position.y+1, 4);

  brainView.render();
  renderer.render(scene, camera);
}

updateBounds();
resetGame();
animate();
