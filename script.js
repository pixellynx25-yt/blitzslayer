/* BLITZ SLAYER V2
   - 3 actions per round
   - Skip always visible (penalty: reset streak + energy reduction next round)
   - Cards: only set specified by user
   - Manual.exe behavior: same tab before battle, new tab during battle
*/
(() => {
  'use strict';

  const $ = (q) => document.querySelector(q);

  // DOM
  const startScreen = $('#startScreen');
  const btnStart = $('#btnStart');
  const btnManualStart = $('#btnManualStart');

  const hud = $('#hud');
  const roundVal = $('#roundVal');
  const energyVal = $('#energyVal');
  const energyFill = $('#energyFill');
  const actionsVal = $('#actionsVal');
  const voidBanner = $('#voidBanner');
  const turnToast = $('#turnToast');
  const manualBtn = $('#manualBtn');

  const scene = $('#scene');
  const aiGridEl = $('#aiGrid');
  const pGridEl = $('#pGrid');
  const aiModulesEl = $('#aiModules');
  const pModulesEl = $('#pModules');

  const setupPanel = $('#setupPanel');
  const setupTask = $('#setupTask');
  const btnBattle = $('#btnBattle');
  const setupMobile = $('#setupMobile');
  const mRotate = $('#mRotate');
  const mConfirm = $('#mConfirm');

  const handDock = $('#handDock');
  const handOff = $('#handOff');
  const handOther = $('#handOther');
  const deckLeftEl = $('#deckLeft');
  const skipBtn = $('#skipBtn');

  const confirmBar = $('#confirmBar');
  const confirmText = $('#confirmText');
  const confirmYes = $('#confirmYes');
  const confirmNo = $('#confirmNo');

  const feedEl = $('#feed');
  const fxLayer = $('#fxLayer');

  const aiWave = $('#aiWave');
  const aiEmote = $('#aiEmote');

  // Audio drawer
  const audioDrawer = $('#audioDrawer');
  const audioTab = $('#audioTab');
  const audioToggle = $('#audioToggle');
  const audioVol = $('#audioVol');

  // Grid
  const GRID = 15;

  // Modules
  const MODULES = [
    { name:'MAINFRAME', pts:[[0,0],[1,0],[2,0],[3,0],[4,0]] },
    { name:'FIREWALL', pts:[[0,0],[1,0],[2,0],[0,1],[1,1],[2,1]] },
    { name:'DATABASE', pts:[[0,0],[1,0],[0,1],[1,1]] },
    { name:'PROXY', pts:[[0,0],[1,0],[1,1],[2,1]] },
    { name:'CHIP', pts:[[0,0],[1,0]] }
  ];

  // Cards (only those specified)
  const CARD_DEF = [
    // Offense (Target Enemy)
    { id:'vstr', n:'VECTOR STRIKE', t:'off', how:'enemy', base:2, d:'Hit 1 selected cell.' },
    { id:'bpkt', n:'BURST PACKET', t:'off', how:'enemy_col', base:3, d:'Select a column: fire 3 random shots inside it.' },
    { id:'lbom', n:'LOGIC BOMB', t:'off', how:'enemy', base:4, d:'Explode at target: hit adjacent cells.' },

    // Intel (Target Enemy)
    { id:'sonr', n:'SONAR PULSE', t:'intel', how:'enemy', base:1, d:'Scan 3×3 area for signals.' },
    { id:'trac', n:'TRACE ROUTE', t:'intel', how:'trace_pick', base:2, d:'Choose row/column: count + approximate highlights.' },

    // Intel (Instant)
    { id:'dkey', n:'DECRYPTION KEY', t:'intel', how:'instant', base:2, d:'Reveal one random enemy segment coordinate.' },

    // Utility (Target Self)
    { id:'ptch', n:'PATCH v1.0', t:'util', how:'self', base:2, d:'Repair one damaged segment.' },
    { id:'gshf', n:'GHOST SHIFT', t:'util', how:'ghost', base:3, d:'Move one undamaged ship one step.' },

    // Utility (Instant)
    { id:'ovcl', n:'OVERCLOCK', t:'util', how:'instant', base:0, d:'+2 Energy immediately.' },
    { id:'rb00', n:'REBOOT', t:'util', how:'instant', base:2, d:'Return last used card this round.' },

    // Counter (Instant)
    { id:'fwal', n:'FIREWALL', t:'counter', how:'instant', base:1, d:'Block the AI’s next attack.' },
    { id:'sjam', n:'SIGNAL JAMMER', t:'counter', how:'instant', base:2, d:'AI loses its next turn.' },

    // Malware (Instant)
    { id:'mlwr', n:'GLITCH', t:'mal', how:'instant', base:2, d:'Paralyze AI for 1 round.' },
  ];

  // Dynamic cost (E3), max 4
  function cardCost(card){
    // base + pressure factor; cap at 4
    let c = card.base ?? 1;

    // Make high streak slightly increase heavy offense cost (risk-reward)
    if(card.t === 'off'){
      c += Math.min(1, Math.floor(S.streak/3));
    }
    // Malware/counter slightly cheaper when behind (comeback)
    const behind = S.pHitsTaken > S.aiHitsTaken;
    if(behind && (card.t==='mal' || card.t==='counter')) c = Math.max(1, c-1);

    return Math.min(4, Math.max(0, c));
  }

  // State
  const S = {
    mode: 'MENU',        // MENU | SETUP | BATTLE | END
    round: 1,
    energy: 3,
    actions: 3,
    streak: 0,
    lastUsedThisRound: null,
    didAttackThisRound: false,

    // deck/hand
    deck: [],
    hand: [],
    activeIdx: null,

    // setup
    modIdx: 0,
    rotation: 0,
    lastX: 0,
    lastY: 0,
    pFleet: new Set(),
    aiFleet: new Set(),
    pGroups: {}, // id -> {shape, coords[]}
    aiGroups: {},

    // grids
    pCells: {},
    aiCells: {},

    // effects
    firewall: false,       // blocks next AI attack (C1 only one counter active)
    jamNextAi: false,      // AI loses its next turn
    malwareTurns: 0,       // M1: 1 AI turn
    pending: null,         // pending action state machine
    pendingUtility: false, // blocks other actions while waiting confirm/target
    turnLock: false,       // prevents clicks during AI animation

    // stats
    pHitsTaken: 0,
    aiHitsTaken: 0,

    // AI memory
    aiKnownHits: [],
    aiLastPlayerTypes: [],

    // Module tracking
    aiModuleDots: [],
    pModuleDots: [],
    aiDestroyedModules: new Set(),
    pDestroyedModules: new Set(),

    // UI
    feedLimit: 70,
  };

  const HAND_CAP_OFF = 2;
  const HAND_CAP_OTH = 4;

  // Audio mapping (user supplies files)
  const AUDIO_MAP = {
    music: {
      start: 'library/audio/music/start.mp3',
      battle: 'library/audio/music/battle.mp3',
      void: 'library/audio/music/void.mp3',
      end_win: 'library/audio/music/end_win.mp3',
      end_lose: 'library/audio/music/end_lose.mp3',
      end_draw: 'library/audio/music/end_draw.mp3',
    },
    sfx: {
      ui_click: 'library/audio/sfx/ui_click.wav',
      card_select: 'library/audio/sfx/card_select.wav',
      card_play: 'library/audio/sfx/card_play.wav',
      beam: 'library/audio/sfx/beam.wav',
      hit: 'library/audio/sfx/hit.wav',
      miss: 'library/audio/sfx/miss.wav',
      scan: 'library/audio/sfx/scan.wav',
      repair: 'library/audio/sfx/repair.wav',
      move: 'library/audio/sfx/move.wav',
      shield: 'library/audio/sfx/shield.wav',
      jam: 'library/audio/sfx/jam.wav',
      reboot: 'library/audio/sfx/reboot.wav',
      malware: 'library/audio/sfx/malware.wav',
      turn_ai: 'library/audio/sfx/turn_ai.wav',
      turn_player: 'library/audio/sfx/turn_player.wav',
      win: 'library/audio/sfx/win.wav',
      lose: 'library/audio/sfx/lose.wav',
      draw: 'library/audio/sfx/draw.wav',
    }
  };

  const audio = {
    enabled: false,
    vol: 0.5,
    music: new Audio(),
    sfx: new Map(),
    currentTrack: null,
  };
  audio.music.loop = true;
  audio.music.src = AUDIO_MAP.music['start'];
  audio.music.volume = audio.vol;

  function loadSfx(key){
    if(audio.sfx.has(key)) return audio.sfx.get(key);
    const a = new Audio(AUDIO_MAP.sfx[key]);
    a.preload = 'auto';
    a.volume = audio.vol;
    audio.sfx.set(key, a);
    return a;
  }
  function playSfx(key){
    if(!audio.enabled) return;
    try{
      const a = loadSfx(key);
      a.currentTime = 0;
      a.volume = audio.vol;
      a.play().catch(()=>{});
    }catch{}
  }
  function setMusic(trackKey){
    audio.currentTrack = trackKey;
    audio.music.src = AUDIO_MAP.music[trackKey] || '';
    audio.music.volume = audio.vol;
    if(audio.enabled){
      audio.music.play().catch(()=>{});
    }
  }
  function stopMusic(){
    audio.music.pause();
  }

  function openAudio(){ audioDrawer.classList.add('open'); }
  function closeAudio(){ audioDrawer.classList.remove('open'); }

  // Manual behavior
  function openManual(){
    playSfx('ui_click');
    if(S.mode === 'BATTLE'){
      window.open('manual.html?mode=battle', '_blank', 'noopener');
    } else {
      // same tab before battle
      location.href = 'manual.html';
    }
  }

  // ---------- UI helpers ----------
  function show(){
    startScreen.style.display='none';
    hud.style.display='flex';
    scene.style.display='flex';
    handDock.style.display='block';
    hud.setAttribute('aria-hidden','false');
    scene.setAttribute('aria-hidden','false');
    handDock.setAttribute('aria-hidden','false');
  }
  function showSetupOnly(){
    // Hand stays hidden until battle starts
    handDock.style.display='none';
    handDock.setAttribute('aria-hidden','true');
  }

  function toast(text, isAi=false){
    turnToast.textContent = text;
    turnToast.className = 'toast' + (isAi ? ' ai' : '');
    turnToast.style.display = 'block';
    turnToast.setAttribute('aria-hidden','false');
    setTimeout(() => {
      turnToast.style.display='none';
      turnToast.setAttribute('aria-hidden','true');
    }, 950);
  }

  function feedRound(){
    const div = document.createElement('div');
    div.className = 'feedRound';
    div.textContent = `— ROUND ${S.round} —`;
    feedEl.appendChild(div);
  }

  function logMsg(type, msg, isAi=false){
    const item = document.createElement('div');
    item.className = 'feedItem' + (isAi ? ' ai' : '');
    item.innerHTML = `
      <div class="feedItem__top">
        <div class="feedItem__who">${isAi ? '>> AI' : '>> USER'}</div>
        <div class="feedItem__type">${type}</div>
      </div>
      <div class="feedItem__msg">${msg}</div>
    `;
    feedEl.appendChild(item);
    // limit
    while(feedEl.childNodes.length > S.feedLimit) feedEl.removeChild(feedEl.firstChild);
    // autoscroll to bottom
    feedEl.scrollTop = feedEl.scrollHeight;
  }

  function updateHUD(){
    roundVal.textContent = `${S.round}/50`;
    energyVal.textContent = String(S.energy);
    energyFill.style.width = `${Math.min(100, (S.energy/10)*100)}%`;
    actionsVal.textContent = '● '.repeat(S.actions).trim() || '—';
    deckLeftEl.textContent = String(S.deck.length);
    voidBanner.style.display = (S.round >= 30 ? 'block' : 'none');
  }

  // ---------- Grid creation ----------
  function buildGrids(){
    aiGridEl.innerHTML=''; pGridEl.innerHTML='';
    S.aiCells={}; S.pCells={};

    for(let y=0;y<GRID;y++){
      for(let x=0;x<GRID;x++){
        const a = document.createElement('div');
        a.className='cell';
        a.addEventListener('click', () => onEnemyClick(x,y));
        aiGridEl.appendChild(a);
        S.aiCells[`${x},${y}`]=a;

        const p = document.createElement('div');
        p.className='cell';
        p.addEventListener('mouseenter', () => { S.lastX=x; S.lastY=y; if(S.mode==='SETUP' || S.pending?.kind==='ghost_move') drawGhost(); });
        p.addEventListener('click', () => onPlayerClick(x,y));
        pGridEl.appendChild(p);
        S.pCells[`${x},${y}`]=p;
      }
    }
  }

  function clearGhost(){
    // Only clear transient preview class, keep selection states
    for(const c of Object.values(S.pCells)) c.classList.remove('ghost','ghost-preview');
  }

  function clearAllGhostStates(){
    // Complete clear of all ghost-related classes
    for(const c of Object.values(S.pCells)) c.classList.remove('ghost','ghost-selected','ghost-preview','ghost-available');
  }

  function highlightAvailableModules(){
    // Turn all undamaged modules blue
    for(const mid in S.pGroups){
      const group = S.pGroups[mid];
      const isDamaged = group.coords.some(k => S.pCells[k].classList.contains('hit'));
      if(!isDamaged){
        group.coords.forEach(k => {
          const c = S.pCells[k];
          if(c) c.classList.add('ghost-available');
        });
      }
    }
  }

  function clearAvailableHighlight(){
    for(const c of Object.values(S.pCells)) c.classList.remove('ghost-available');
  }

  function rotatePts(pts, deg){
    const r = deg * Math.PI/180;
    const cos = Math.cos(r), sin = Math.sin(r);
    return pts.map(([ox,oy]) => [Math.round(ox*cos - oy*sin), Math.round(ox*sin + oy*cos)]);
  }

  function coordsAt(x,y, pts){
    const rp = rotatePts(pts, S.rotation);
    return rp.map(([ox,oy]) => [x+ox, y+oy]);
  }

  function drawGhost(){
    clearGhost();
    let pts;
    if(S.mode==='SETUP'){
      pts = MODULES[S.modIdx].pts;
    }else{
      // Ghost shift no longer uses drawGhost (instant teleport)
      return;
    }
    for(const [tx,ty] of coordsAt(S.lastX, S.lastY, pts)){
      const k = `${tx},${ty}`;
      if(S.pCells[k]) S.pCells[k].classList.add('ghost');
    }
  }

  function deployModule(){
    const mod = MODULES[S.modIdx];
    const pts = coordsAt(S.lastX,S.lastY, mod.pts);

    const ok = pts.every(([tx,ty]) => tx>=0 && tx<GRID && ty>=0 && ty<GRID && !S.pFleet.has(`${tx},${ty}`));
    if(!ok) return;

    const mid = `m${S.modIdx}`;
    S.pGroups[mid] = { shape: mod.pts, coords: [] };

    for(const [tx,ty] of pts){
      const k = `${tx},${ty}`;
      S.pFleet.add(k);
      S.pGroups[mid].coords.push(k);
      const cell = S.pCells[k];
      cell.classList.add('pmod','blink');
      cell.dataset.mid = mid;
      setTimeout(()=>cell.classList.remove('blink'), 220);
    }

    S.modIdx++;
    if(S.modIdx < MODULES.length){
      setupTask.textContent = `DEPLOY: ${MODULES[S.modIdx].name}`;
    } else {
      setupTask.textContent = 'LINK READY';
      btnBattle.style.display='inline-flex';
    }
  }

  function deployAI(){
    S.aiFleet = new Set();
    S.aiGroups = {};
    MODULES.forEach((mod, i) => {
      let placed=false;
      while(!placed){
        const rx = (Math.random()*GRID)|0;
        const ry = (Math.random()*GRID)|0;
        const rot = [0,90,180,270][(Math.random()*4)|0];
        const rp = rotatePts(mod.pts, rot).map(([ox,oy]) => [rx+ox, ry+oy]);
        if(rp.every(([tx,ty]) => tx>=0 && tx<GRID && ty>=0 && ty<GRID && !S.aiFleet.has(`${tx},${ty}`))){
          const mid = `a${i}`;
          S.aiGroups[mid] = { coords: [] };
          rp.forEach(([tx,ty]) => {
            const k=`${tx},${ty}`;
            S.aiFleet.add(k);
            S.aiGroups[mid].coords.push(k);
          });
          placed=true;
        }
      }
    });
  }

  function initializeModuleDots(){
    // Create dots for AI modules
    aiModulesEl.innerHTML = '';
    S.aiModuleDots = [];
    S.aiDestroyedModules = new Set();
    for(let i = 0; i < MODULES.length; i++){
      const dot = document.createElement('div');
      dot.className = 'module-dot';
      dot.dataset.index = i;
      aiModulesEl.appendChild(dot);
      S.aiModuleDots.push(dot);
    }

    // Create dots for player modules
    pModulesEl.innerHTML = '';
    S.pModuleDots = [];
    S.pDestroyedModules = new Set();
    for(let i = 0; i < MODULES.length; i++){
      const dot = document.createElement('div');
      dot.className = 'module-dot';
      dot.dataset.index = i;
      pModulesEl.appendChild(dot);
      S.pModuleDots.push(dot);
    }
  }

  function spawnParticles(x, y){
    // Create particle burst effect
    const particleCount = 12;
    for(let i = 0; i < particleCount; i++){
      const angle = (i / particleCount) * Math.PI * 2;
      const speed = 3 + Math.random() * 2;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      
      const particle = document.createElement('div');
      particle.style.position = 'absolute';
      particle.style.left = x + 'px';
      particle.style.top = y + 'px';
      particle.style.width = '6px';
      particle.style.height = '6px';
      particle.style.borderRadius = '50%';
      particle.style.background = 'rgba(255,68,68,.85)';
      particle.style.boxShadow = '0 0 8px rgba(255,68,68,.65)';
      particle.style.pointerEvents = 'none';
      particle.style.zIndex = '500';
      fxLayer.appendChild(particle);

      let duration = 0;
      const interval = setInterval(() => {
        duration += 16;
        x += vx;
        y += vy;
        vy += 0.15; // gravity
        particle.style.left = x + 'px';
        particle.style.top = y + 'px';
        particle.style.opacity = Math.max(0, 1 - duration / 500);
        
        if(duration >= 500){
          clearInterval(interval);
          particle.remove();
        }
      }, 16);
    }
  }

  function checkModuleDestruction(isAi){
    const groups = isAi ? S.aiGroups : S.pGroups;
    const cells = isAi ? S.aiCells : S.pCells;
    const dots = isAi ? S.aiModuleDots : S.pModuleDots;
    const destroyed = isAi ? S.aiDestroyedModules : S.pDestroyedModules;

    for(const mid in groups){
      const group = groups[mid];
      const isFullyDestroyed = group.coords.every(k => cells[k].classList.contains('hit'));
      const midIndex = parseInt(mid.substring(1));

      if(isFullyDestroyed && !destroyed.has(midIndex)){
        // Module just got destroyed
        destroyed.add(midIndex);
        
        // Mark dot as destroyed
        if(dots[midIndex]){
          dots[midIndex].classList.add('destroyed');
          
          // Spawn particles from the center of the module
          const gridEl = isAi ? aiGridEl : pGridEl;
          const gridRect = gridEl.getBoundingClientRect();
          const firstCoord = group.coords[0];
          const [cx, cy] = firstCoord.split(',').map(Number);
          const cellRect = cells[firstCoord].getBoundingClientRect();
          const particleX = cellRect.left - gridRect.left + cellRect.width/2 + gridRect.left;
          const particleY = cellRect.top - gridRect.top + cellRect.height/2 + gridRect.top;
          
          spawnParticles(particleX, particleY);
          
          // Log the destruction
          const moduleName = MODULES[midIndex].name;
          logMsg('STATUS', `${isAi ? 'AI' : 'PLAYER'} MODULE DESTROYED: ${moduleName}`, isAi);
        }
      }
    }
  }

  // ---------- Deck / Hand ----------
  function buildDeck(){
    S.deck = [];
    // weighted composition: keep balanced and predictable (D1)
    const add = (id, count) => {
      const def = CARD_DEF.find(c=>c.id===id);
      for(let i=0;i<count;i++) S.deck.push({...def});
    };

    // Offense (ensure availability)
    add('vstr', 7);
    add('bpkt', 5);
    add('lbom', 4);

    // Intel
    add('sonr', 6);
    add('trac', 5);
    add('dkey', 3);

    // Utility
    add('ptch', 5);
    add('gshf', 3);
    add('ovcl', 4);
    add('rb00', 3);

    // Counter
    add('fwal', 4);
    add('sjam', 3);

    // Malware
    add('mlwr', 3);

    // shuffle
    S.deck.sort(()=>Math.random()-0.5);
  }

  function handCounts(){
    let off=0, other=0;
    for(const c of S.hand){
      if(c.t==='off') off++; else other++;
    }
    return {off, other};
  }

  function drawFrom(type){
    const idx = S.deck.findIndex(c => c.t === type);
    if(idx < 0) return null;
    return S.deck.splice(idx,1)[0];
  }

  function drawStrategic(){
    if(S.deck.length <= 0) return;
    const {off, other} = handCounts();

    // caps
    if(off >= HAND_CAP_OFF && other >= HAND_CAP_OTH) return;

    // decide desired type
    let want = 'other';
    const needOff = off < 1; // guarantee at least one offense
    if(needOff && off < HAND_CAP_OFF) want = 'off';
    else if(off >= HAND_CAP_OFF && other < HAND_CAP_OTH) want = 'other';
    else if(other >= HAND_CAP_OTH && off < HAND_CAP_OFF) want = 'off';
    else {
      // predictable: 1 offense every 2 rounds if not maxed
      want = (S.round % 2 === 1 && off < HAND_CAP_OFF) ? 'off' : 'other';
    }

    let card = null;
    if(want === 'off'){
      card = drawFrom('off');
      if(!card) card = S.deck.shift();
    } else {
      // other = intel/util/counter/mal
      const idx = S.deck.findIndex(c => c.t !== 'off');
      if(idx >= 0) card = S.deck.splice(idx,1)[0];
      else card = S.deck.shift();
    }

    if(!card) return;

    // Respect caps by trimming oldest from the overflowing type
    const after = handCounts();
    if(card.t === 'off' && after.off >= HAND_CAP_OFF){
      const drop = S.hand.findIndex(c=>c.t==='off');
      if(drop>=0) S.hand.splice(drop,1);
    }
    if(card.t !== 'off' && after.other >= HAND_CAP_OTH){
      const drop = S.hand.findIndex(c=>c.t!=='off');
      if(drop>=0) S.hand.splice(drop,1);
    }

    S.hand.push(card);
  }

  function renderHand(){
    handOff.innerHTML=''; handOther.innerHTML='';
    const costed = S.hand.map((c, i) => ({...c, i, cost: cardCost(c)}));

    const mk = (c) => {
      const el = document.createElement('div');
      el.className = 'card' + (S.activeIdx===c.i ? ' sel' : '');
      el.innerHTML = `
        <div class="card__top">
          <span class="badge ${badgeClass(c.t)}">${badgeLabel(c.t)}</span>
          <span class="card__cost">⚡${c.cost} • ⬤</span>
        </div>
        <div class="card__name">${c.n}</div>
        <div class="card__desc">${c.d}</div>
      `;
      el.addEventListener('click', () => selectCard(c.i));
      return el;
    };

    for(const c of costed){
      if(c.t === 'off') handOff.appendChild(mk(c));
      else handOther.appendChild(mk(c));
    }
  }

  function badgeClass(t){
    if(t==='off') return 'off';
    if(t==='intel') return 'intel';
    if(t==='util') return 'util';
    if(t==='counter') return 'counter';
    return 'mal';
  }
  function badgeLabel(t){
    if(t==='off') return 'OFFENSE';
    if(t==='intel') return 'INTEL';
    if(t==='util') return 'UTILITY';
    if(t==='counter') return 'COUNTER';
    return 'MALWARE';
  }

  function clearSelection(){
    S.activeIdx = null;
    S.pending = null;
    S.pendingUtility = false;
    S.ghostMode = null;
    hideConfirm();
    clearGhost();
    renderHand();
  }

  function selectCard(i){
    if(S.mode !== 'BATTLE') return;
    if(S.turnLock) return;
    if(S.pendingUtility) return;

    S.activeIdx = i;
    renderHand();
    playSfx('card_select');

    // If this is a utility/counter/malware/intel card with instant action, prompt Apply/Discard immediately
    const card = S.hand[i];
    if(!card) return;
    const isInstantCard = (card.how === 'instant');
    if(isInstantCard || (card.t === 'util' || card.t === 'counter' || card.t === 'mal')){
      showConfirm(`${card.n}: ${card.d}`, () => {
        // attempt to play the card
        if(card.how === 'self'){
          // Self-targeting utilities (PATCH): automatically repair a random damaged segment
          if(card.id === 'ptch'){
            // Find all damaged segments that can be repaired (from modules that still have at least 1 undamaged segment)
            let repairableSegments = [];
            for(const mid in S.pGroups){
              const group = S.pGroups[mid];
              const hasUndamagedSegment = group.coords.some(k => !S.pCells[k].classList.contains('hit'));
              // Only repair if module still has at least one undamaged segment
              if(hasUndamagedSegment){
                group.coords.forEach(k => {
                  if(S.pCells[k].classList.contains('hit')){
                    repairableSegments.push(k);
                  }
                });
              }
            }

            if(repairableSegments.length === 0){
              logMsg('UTILITY', 'PATCH cannot be applied: no damaged segments to repair.');
              return;
            }

            const cost = cardCost(card);
            if(!spend(cost)){
              logMsg('UTILITY', 'PATCH failed: insufficient resources.');
              return;
            }

            // Pick a random repairable segment
            const randomSegment = repairableSegments[(Math.random() * repairableSegments.length) | 0];
            const cell = S.pCells[randomSegment];
            cell.classList.remove('hit');
            cell.classList.add('pmod','blink');
            setTimeout(()=>cell.classList.remove('blink'), 220);

            playSfx('repair');
            logMsg('UTILITY', 'PATCH: segment repaired.');
            consumeCard();
            afterPlayerAction();
            return;
          }
        } else if(card.how === 'ghost'){
          // Ghost shift: spend cost immediately, consume card, then auto-teleport
          const cost = cardCost(card);
          if(!spend(cost)){
            logMsg('UTILITY', 'GHOST SHIFT failed: insufficient resources.');
            return;
          }
          
          // Consume the card immediately
          consumeCard();
          
          // Highlight available modules
          highlightAvailableModules();
          logMsg('UTILITY', 'GHOST SHIFT: selecting target module...');
          
          // Wait 0.5 seconds, then pick a random module and teleport it
          setTimeout(() => {
            executeGhostShift();
          }, 500);
        } else if(card.how === 'instant'){
          // Instant effects (OVCL, RB00, FWAL, SJAM, MLWR, DKEY) execute immediately
          playInstant(card);
        }
      });
    }
  }

  // ---------- Confirm bar for risky self/instant utilities (professional UX) ----------
  function showConfirm(text, onYes){
    confirmText.textContent = text;
    confirmBar.style.display = 'flex';
    confirmBar.setAttribute('aria-hidden','false');
    // default labels for utility/counter confirmation
    confirmYes.textContent = 'APPLY';
    confirmNo.textContent = 'DISCARD';
    S.pendingUtility = true;
    const yes = () => { onYes(); hideConfirm(); };
    const no = () => { hideConfirm(); clearSelection(); };
    confirmYes.onclick = yes;
    confirmNo.onclick = no;
  }
  function hideConfirm(){
    confirmBar.style.display = 'none';
    confirmBar.setAttribute('aria-hidden','true');
    confirmYes.onclick = null;
    confirmNo.onclick = null;
    S.pendingUtility = false;
  }

  // ---------- Spend resources ----------
  function canSpend(cost){
    if(S.actions <= 0) return false;
    return S.energy >= cost;
  }
  function spend(cost){
    if(!canSpend(cost)) return false;
    S.actions -= 1;
    S.energy -= cost;
    updateHUD();
    return true;
  }

  // ---------- Enemy interactions ----------
  function cellAtEnemy(x,y){ return S.aiCells[`${x},${y}`]; }
  function cellAtPlayer(x,y){ return S.pCells[`${x},${y}`]; }

  function pingAI(x,y){
    const k = `${x},${y}`;
    const c = S.aiCells[k];
    if(!c) return {hit:false, already:false};
    if(c.classList.contains('hit') || c.classList.contains('miss')) return {hit:false, already:true};

    const hit = S.aiFleet.has(k);
    c.classList.add(hit ? 'hit' : 'miss', 'blink');
    setTimeout(()=>c.classList.remove('blink'), 220);

    // feedback
    spawnBeamFromBoards(false, x, y);
    fxShake(hit);
    playSfx(hit ? 'hit' : 'miss');

    if(hit){
      S.streak += 1; // B1 streak
      S.aiHitsTaken += 1;
      S.didAttackThisRound = true;
    }
    return {hit, already:false};
  }

  function scan3x3(x,y){
    let found = 0;
    for(let ix=x-1; ix<=x+1; ix++){
      for(let iy=y-1; iy<=y+1; iy++){
        if(S.aiFleet.has(`${ix},${iy}`)) found++;
      }
    }
    // mark center with small reveal pulse (doesn't reveal exact segments)
    const c = cellAtEnemy(x,y);
    if(c){
      c.classList.add('blink');
      c.textContent = found > 0 ? '!!' : '0';
      setTimeout(()=>{ c.classList.remove('blink'); c.textContent=''; }, 850);
    }
    playSfx('scan');
    logMsg('INTEL', `SONAR: ${found>0 ? 'SIGNAL DETECTED' : 'NO SIGNAL'} (3×3)`);
  }

  function tracePick(x,y){
    // show mini confirm to pick row/col
    const col = x, row = y;
    showConfirm('TRACE ROUTE: Scan ROW or COLUMN?', () => { /* overridden */ });
    // Replace buttons with Row/Col
    confirmText.textContent = 'TRACE ROUTE: choose scan target';
    confirmYes.textContent = 'ROW';
    confirmNo.textContent = 'COLUMN';

    confirmYes.onclick = () => {
      hideConfirm();
      performTrace('row', row);
      clearSelection();
      afterPlayerAction();
    };
    confirmNo.onclick = () => {
      hideConfirm();
      performTrace('col', col);
      clearSelection();
      afterPlayerAction();
    };
  }

  function performTrace(kind, idx){
    // Count segments in row/col
    let count = 0;
    if(kind==='row'){
      for(let x=0;x<GRID;x++) if(S.aiFleet.has(`${x},${idx}`)) count++;
      // approximate highlights: choose up to 4 random cells in the row (not exact reveal)
      approxHints(kind, idx, Math.min(4, Math.max(1, Math.floor(count/2) || (count>0?1:0))));
    } else {
      for(let y=0;y<GRID;y++) if(S.aiFleet.has(`${idx},${y}`)) count++;
      approxHints(kind, idx, Math.min(4, Math.max(1, Math.floor(count/2) || (count>0?1:0))));
    }
    playSfx('scan');
    logMsg('INTEL', `TRACE ${kind.toUpperCase()} ${idx+1}: detected ${count} segment(s).`);
  }

  function approxHints(kind, idx, n){
    // clear old hints gradually? We'll just add transient hints
    const picks = new Set();
    const maxTries = 40;
    let tries = 0;
    while(picks.size < n && tries++ < maxTries){
      const r = (Math.random()*GRID)|0;
      picks.add(r);
    }
    for(const r of picks){
      const k = (kind==='row') ? `${r},${idx}` : `${idx},${r}`;
      const c = S.aiCells[k];
      if(!c) continue;
      if(c.classList.contains('hit') || c.classList.contains('miss')) continue;
      c.classList.add('hint','blink');
      setTimeout(()=>{ c.classList.remove('blink'); }, 220);
      setTimeout(()=>{ c.classList.remove('hint'); }, 1200);
    }
  }

  function revealRandomEnemy(){
    // reveal 1 random real segment coordinate
    const arr = Array.from(S.aiFleet);
    if(arr.length===0) return;
    const k = arr[(Math.random()*arr.length)|0];
    const c = S.aiCells[k];
    if(c && !c.classList.contains('hit') && !c.classList.contains('miss')){
      c.classList.add('reveal','blink');
      setTimeout(()=>c.classList.remove('blink'), 220);
      setTimeout(()=>c.classList.remove('reveal'), 1500);
    }
    playSfx('scan');
    logMsg('INTEL', `DECRYPTION KEY: revealed coordinate ${k}.`);
  }

  function executeGhostShift(){
    // Get all available (undamaged) modules
    let availableMids = [];
    for(const mid in S.pGroups){
      const group = S.pGroups[mid];
      const isDamaged = group.coords.some(k => S.pCells[k].classList.contains('hit'));
      if(!isDamaged){
        availableMids.push(mid);
      }
    }

    if(availableMids.length === 0){
      logMsg('UTILITY', 'GHOST SHIFT: no available modules to teleport.');
      clearAllGhostStates();
      return;
    }

    // Pick a random module
    const mid = availableMids[(Math.random() * availableMids.length) | 0];
    const group = S.pGroups[mid];
    const shape = group.shape;
    let validPositions = [];

    // Find all valid positions for this module
    for(let tx = 0; tx < GRID; tx++){
      for(let ty = 0; ty < GRID; ty++){
        const newCoords = coordsAt(tx, ty, shape);
        
        // Check bounds
        const inBounds = newCoords.every(([nx, ny]) => nx>=0 && nx<GRID && ny>=0 && ny<GRID);
        if(!inBounds) continue;

        // Check no collision with other modules
        const newKeys = newCoords.map(([nx,ny])=>`${nx},${ny}`);
        const hasModuleCollision = newKeys.some(nk => S.pFleet.has(nk) && !group.coords.includes(nk));
        if(hasModuleCollision) continue;

        // Check no hit cells
        const hasHitCollision = newKeys.some(nk => S.pCells[nk]?.classList.contains('hit'));
        if(hasHitCollision) continue;

        // This position is valid
        validPositions.push({ x: tx, y: ty, keys: newKeys });
      }
    }

    if(validPositions.length === 0){
      logMsg('UTILITY', 'GHOST SHIFT: no valid positions for teleport.');
      clearAllGhostStates();
      return;
    }

    // Pick a random valid position
    const randomPos = validPositions[(Math.random() * validPositions.length) | 0];
    const newKeys = randomPos.keys;

    // Mark selected module for visual feedback
    group.coords.forEach(k => {
      const c = S.pCells[k];
      if(c) c.classList.add('ghost-selected');
    });

    logMsg('UTILITY', 'GHOST SHIFT: teleporting module...');
    playSfx('move');

    // Wait 0.5 seconds then apply placement effect and move
    setTimeout(() => {
      // Remove old positions from fleet
      group.coords.forEach(oldK => {
        S.pFleet.delete(oldK);
        const c = S.pCells[oldK];
        c.classList.remove('pmod', 'ghost-selected', 'ghost', 'ghost-preview', 'ghost-available');
        c.dataset.mid = '';
      });

      // Apply new positions with blink effect
      group.coords = newKeys;
      newKeys.forEach(nk => {
        S.pFleet.add(nk);
        const c = S.pCells[nk];
        c.classList.add('pmod','blink');
        c.dataset.mid = mid;
        setTimeout(()=>c.classList.remove('blink'),220);
      });

      logMsg('UTILITY', 'GHOST SHIFT: deployment successful.');
      clearAllGhostStates();
      afterPlayerAction();
    }, 500);
  }

  // ---------- Player grid interactions ----------
  function onPlayerClick(x,y){
    if(S.mode==='SETUP'){
      // nothing (deploy via Q/confirm)
      return;
    }
    if(S.mode!=='BATTLE') return;
    if(S.turnLock) return;
    
    // Ghost shift is now fully automatic, no manual interaction needed
    
    if(S.activeIdx===null) return;

    const card = S.hand[S.activeIdx];
    if(!card) return;

  }

  // ---------- Enemy click handler (cards that target enemy) ----------
  function onEnemyClick(x,y){
    if(S.mode !== 'BATTLE') return;
    if(S.turnLock) return;

    // If we're in ghost move mode, ignore enemy clicks
    if(S.pending?.kind === 'ghost_move') return;

    if(S.activeIdx === null) return;
    const card = S.hand[S.activeIdx];
    if(!card) return;

    // TARGET ENEMY cards
    if(card.how === 'enemy' || card.how === 'enemy_col' || card.how === 'trace_pick'){
      const cost = cardCost(card);
      if(!spend(cost)) return;

      playSfx('card_play');
      logMsg('EXECUTE', `${card.n} (⚡${cost})`);
      S.lastUsedThisRound = card;

      // Track AI adaptation
      trackPlayerType(card.t);

      if(card.id === 'vstr'){
        pingAI(x,y);
      }
      else if(card.id === 'bpkt'){
        // column selected; 3 random shots within column (may repeat)
        for(let i=0;i<3;i++){
          const ry = (Math.random()*GRID)|0;
          pingAI(x, ry);
        }
      }
      else if(card.id === 'lbom'){
        for(let ix=x-1; ix<=x+1; ix++){
          for(let iy=y-1; iy<=y+1; iy++){
            pingAI(ix,iy);
          }
        }
      }
      else if(card.id === 'sonr'){
        scan3x3(x,y);
      }
      else if(card.id === 'trac'){
        // trace uses row/col chooser; consuming already done, but we need to delay after action until choice made
        // Put card back? Instead: perform choice now, and afterPlayerAction occurs inside confirm callbacks.
        // We already spent the action+energy, so don't double-end.
        consumeCard();
        tracePick(x,y);
        updateHUD();
        renderHand();
        return;
      }

      consumeCard();
      afterPlayerAction();
      return;
    }

    // other cards should not target enemy
  }

  // ---------- Instant cards ----------
  function playInstant(card){
    const cost = cardCost(card);
    if(!spend(cost)){
      logMsg('STATUS', `Not enough resources for ${card.n}.`);
      return;
    }

    playSfx('card_play');
    logMsg('EXECUTE', `${card.n} (⚡${cost})`);
    S.lastUsedThisRound = card;
    trackPlayerType(card.t);

    switch(card.id){
      case 'dkey':
        revealRandomEnemy();
        break;
      case 'ovcl':
        // confirm
        S.energy = Math.min(10, S.energy + 2);
        logMsg('UTILITY', 'OVERCLOCK: +2 Energy.');
        break;
      case 'rb00':
        // return last used card this round (R1)
        if(S.lastUsedThisRound && S.lastUsedThisRound.id !== 'rb00'){
          const toReturn = {...S.lastUsedThisRound};
          // add to hand respecting caps
          S.hand.push(toReturn);
          logMsg('UTILITY', `REBOOT: restored ${toReturn.n}.`);
          playSfx('reboot');
        } else {
          logMsg('UTILITY', 'REBOOT: no valid card to restore this round.');
        }
        break;
      case 'fwal':
        // C1 only one counter active -> overwrite state
        S.firewall = true;
        S.jamNextAi = false;
        logMsg('COUNTER', 'FIREWALL armed: next AI attack blocked.');
        playSfx('shield');
        break;
      case 'sjam':
        S.jamNextAi = true;
        S.firewall = false;
        logMsg('COUNTER', 'SIGNAL JAMMER: AI will lose its next turn.');
        playSfx('jam');
        break;
      case 'mlwr':
        S.malwareTurns = 1; // M1
        logMsg('MALWARE', 'GLITCH deployed: Paralyze AI for 1 round.');
        playSfx('malware');
        break;
    }

    consumeCard();
    afterPlayerAction();
  }

  function consumeCard(){
    if(S.activeIdx === null) return;
    const used = S.hand.splice(S.activeIdx,1)[0];
    S.activeIdx = null;
    // lastUsedThisRound should be the card used (except reboot)
    if(used && used.id !== 'rb00') S.lastUsedThisRound = used;
    renderHand();
  }

  function trackPlayerType(t){
    S.aiLastPlayerTypes.push(t);
    if(S.aiLastPlayerTypes.length > 6) S.aiLastPlayerTypes.shift();
  }

  // ---------- Post action / round end ----------
  function afterPlayerAction(allowEnd=true){
    updateHUD();
    renderHand();
    if(!allowEnd) return;

    // If actions are zero -> end player round automatically
    if(S.actions <= 0){
      endPlayerRound('ACTIONS_USED');
      return;
    }
  }

  function endPlayerRound(reason){
    // record how the round ended so finishRound can compute regen
    S.endReason = reason;
    if(reason === 'SKIP'){
      S.streak = 0;           // C2
      logMsg('STATUS', 'TURN SKIPPED: streak reset.');
    }
    // Prepare for AI turn
    S.turnLock = true;
    toast('AI TURN', true);
    playSfx('turn_ai');

    setTimeout(() => aiTurn(), 650);
  }

  // Skip always visible; only works on player turn in battle
  function onSkip(){
    if(S.mode !== 'BATTLE') return;
    if(S.turnLock) return;
    if(S.pendingUtility) return;
    clearSelection();
    endPlayerRound('SKIP');
  }

  // ---------- AI Turn (chaotic + adaptive + mocking) ----------
  function aiTurn(){
    // AI can be jammed
    if(S.jamNextAi){
      S.jamNextAi = false;
      aiReact('😈', 'JAMMED… YOU CHEAT.');
      logMsg('STATUS', 'AI TURN SKIPPED', true);
      finishRound();
      return;
    }

    // Malware debuff: AI loses strategy (only single random ping)
    const debuffed = S.malwareTurns > 0;
    if(debuffed) S.malwareTurns--;

    // Firewall blocks next AI attack
    if(S.firewall){
      S.firewall = false;
      aiReact('🛡️', 'FIREWALL… ANNOYING.');
      logMsg('COUNTER', 'FIREWALL blocked AI attack.', true);
      finishRound();
      return;
    }

    // After round 30, AI becomes aggressive and vigorous
    const isAggressive = S.round >= 30;

    // Choose AI action type based on personality: chaotic + adaptive
    // Adaptive: if player used many offense recently, AI uses more intel/probing; else uses offense pressure.
    const last = S.aiLastPlayerTypes.join(',');
    const offenseHeavy = (last.match(/off/g) || []).length >= 3;

    let roll = Math.random();
    let mode = 'strike';

    if(debuffed){
      mode = 'strike';
    } else if(isAggressive){
      // In aggressive mode: favor burst attacks
      if(roll < 0.50){
        mode = 'burst'; // 50% burst attacks
      } else if(roll < 0.25){
        mode = 'probe';
      } else {
        mode = 'strike';
      }
    } else if(roll < 0.25){
      mode = offenseHeavy ? 'probe' : 'burst';
    } else if(roll < 0.55){
      mode = 'strike';
    } else {
      mode = offenseHeavy ? 'strike' : 'probe';
    }

    if(mode === 'burst'){
      const burstCount = isAggressive ? 5 : 3; // 5 shots in aggressive mode, 3 normally
      aiReact('😈', isAggressive ? 'SYSTEM OVERLOAD INCOMING!' : 'BURSTING YOUR CORE.');
      logMsg('OFFENSE', `BURST PACKET (AI) ×${burstCount}`, true);
      for(let i=0;i<burstCount;i++){
        aiPing((Math.random()*GRID)|0, (Math.random()*GRID)|0);
      }
      finishRound();
      return;
    }

    if(mode === 'probe'){
      aiReact('🧠', 'SCANNING YOUR PATTERNS.');
      logMsg('INTEL', 'PROBE', true);
      // pick a known ship coordinate from pFleet and strike it (intel-probe)
      const arr = Array.from(S.pFleet);
      const k = arr[(Math.random()*arr.length)|0];
      const [tx,ty] = k.split(',').map(Number);
      aiPing(tx,ty);
      finishRound();
      return;
    }

    // strike: targeted near known hit (adaptive), else random
    let tx=null, ty=null;
    if(!debuffed && S.aiKnownHits.length > 0){
      // In aggressive mode: 90% chance to target known hits, otherwise 75%
      const hitChance = isAggressive ? 0.90 : 0.75;
      if(Math.random() < hitChance){
        const base = S.aiKnownHits[(Math.random()*S.aiKnownHits.length)|0];
        const [bx,by] = base.split(',').map(Number);
        const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
        dirs.sort(()=>Math.random()-0.5);
        for(const [dx,dy] of dirs){
          const nx = bx+dx, ny = by+dy;
          const k = `${nx},${ny}`;
          if(S.pCells[k] && !S.pCells[k].classList.contains('hit') && !S.pCells[k].classList.contains('miss')){
            tx=nx; ty=ny; break;
          }
        }
      }
    }
    if(tx===null){
      tx = (Math.random()*GRID)|0;
      ty = (Math.random()*GRID)|0;
    }

    aiReact('😏', isAggressive ? 'FINAL STRIKE INCOMING!' : 'YOUR DEFENSE IS WEAK.');
    aiPing(tx,ty);
    finishRound();
  }

  function aiPing(x,y){
    const k = `${x},${y}`;
    const cell = S.pCells[k];
    if(!cell) return;
    if(cell.classList.contains('hit') || cell.classList.contains('miss')) return;

    const hit = S.pFleet.has(k);
    cell.classList.add(hit ? 'hit' : 'miss', 'blink');
    setTimeout(()=>cell.classList.remove('blink'), 220);

    spawnBeamFromBoards(true, x, y);
    fxShake(hit);
    playSfx(hit ? 'hit' : 'miss');

    if(hit){
      S.pHitsTaken += 1;
      S.aiKnownHits.push(k);
      logMsg('PULSE', `CRITICAL @ ${k}`, true);
    } else {
      logMsg('PULSE', `MISS @ ${k}`, true);
    }
  }

  function finishRound(){
    // check end
    const end = checkEnd();
    if(end) return;

    // round advance
    S.round += 1;

    // Check if round reached 30 and switch to void music
    if(S.round === 30){
      setMusic('void');
    }

    // regen energy: default +3. If player finished all actions, grant +5.
    let regen = 3;
    if(S.endReason === 'ACTIONS_USED') regen = 5;
    else if(S.endReason === 'SKIP') regen = 3;
    S.endReason = null;
    S.energy = Math.min(10, S.energy + regen);

    // reset actions and per-round trackers
    S.actions = 3;
    S.lastUsedThisRound = null;
    S.didAttackThisRound = false;

    // draw exactly one card per round
    drawStrategic();

    // Ensure at least 1 offense if possible
    ensureOffenseInHand();

    // update UI, unlock
    feedRound();
    toast('YOUR TURN', false);
    playSfx('turn_player');
    S.turnLock = false;
    updateHUD();
    renderHand();

    // hard timeout draw
    if(S.round > 50){
      endGame('DRAW');
    }
  }

  function ensureOffenseInHand(){
    const {off, other} = handCounts();
    if(off > 0) return;
    const c = drawFrom('off');
    if(c){
      // if other full, drop oldest other
      if(other >= HAND_CAP_OTH){
        const idx = S.hand.findIndex(x=>x.t!=='off');
        if(idx>=0) S.hand.splice(idx,1);
      }
      S.hand.push(c);
    }
  }

  function checkEnd(){
    // Check for module destruction and update dots
    checkModuleDestruction(true);
    checkModuleDestruction(false);

    // all ai hit?
    const aiAll = Array.from(S.aiFleet).every(k => S.aiCells[k].classList.contains('hit'));
    const pAll = Array.from(S.pFleet).every(k => S.pCells[k].classList.contains('hit'));
    if(aiAll){ endGame('WIN'); return true; }
    if(pAll){ endGame('LOSE'); return true; }

    // sudden death after round 30: first full module destroyed ends immediately
    if(S.round >= 30){
      for(const mid in S.aiGroups){
        if(S.aiGroups[mid].coords.every(k => S.aiCells[k].classList.contains('hit'))){
          endGame('WIN'); return true;
        }
      }
      for(const mid in S.pGroups){
        if(S.pGroups[mid].coords.every(k => S.pCells[k].classList.contains('hit'))){
          endGame('LOSE'); return true;
        }
      }
    }
    return false;
  }

  function endGame(result){
    S.mode='END';
    S.turnLock = true;

    playSfx(result === 'WIN' ? 'win' : result === 'LOSE' ? 'lose' : 'draw');
    setMusic(result === 'WIN' ? 'end_win' : result === 'LOSE' ? 'end_lose' : 'end_draw');

    if(result === 'WIN'){
      // Player wins: AI glitches and dies
      aiReact('💀', 'SYSTEM ERROR', 2000);
      setTimeout(()=> aiWaveFlatline(true), 400);
      setTimeout(()=> spawnGlitchSparks(), 600);
      setTimeout(()=> showEndPanel('VICTORY', result), 1600);
    }
    else if(result === 'LOSE'){
      // AI wins: violent laughing wave
      aiReact('😂', 'HAHA', 2000);
      setTimeout(()=> aiWaveLaugh(), 200);
      setTimeout(()=> fxShake(true), 300);
      setTimeout(()=> spawnGlitchSparks(), 800);
      setTimeout(()=> showEndPanel('DEFEAT', result), 2000);
    }
    else {
      // Draw
      aiReact('😡', 'TIMEOUT', 1800);
      setTimeout(()=> showEndPanel('DRAW', result), 1800);
    }
  }

  function spawnGlitchSparks(){
    const count = 12;
    for(let i=0; i<count; i++){
      const spark = document.createElement('div');
      spark.className = 'glitch-spark';
      spark.style.position = 'fixed';
      spark.style.left = Math.random()*window.innerWidth + 'px';
      spark.style.top = Math.random()*window.innerHeight + 'px';
      spark.style.width = '3px';
      spark.style.height = '3px';
      spark.style.background = Math.random() > 0.5 ? '#00f2ff' : '#ff0055';
      spark.style.borderRadius = '50%';
      spark.style.boxShadow = '0 0 8px ' + (Math.random() > 0.5 ? '#00f2ff' : '#ff0055');
      spark.style.pointerEvents = 'none';
      spark.style.zIndex = '1999';
      fxLayer.appendChild(spark);
      
      const duration = 400 + Math.random()*300;
      const startTime = Date.now();
      
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(1, elapsed / duration);
        spark.style.opacity = 1 - progress;
        spark.style.transform = `translate(${Math.random()*40-20}px, ${Math.random()*40-20}px)`;
        
        if(progress < 1) requestAnimationFrame(animate);
        else spark.remove();
      };
      animate();
    }
  }

  function showEndPanel(title, result){
    const endPanel = $('#endPanel');
    const endResult = $('#endResult');
    const endRounds = $('#endRounds');
    const endEnergy = $('#endEnergy');
    const endStreak = $('#endStreak');
    const endRestart = $('#endRestart');
    const endMenu = $('#endMenu');

    endResult.textContent = title;
    endRounds.textContent = `${S.round}/50`;
    endEnergy.textContent = String(S.energy);
    endStreak.textContent = String(S.streak);

    endPanel.setAttribute('aria-hidden', 'false');
    endPanel.classList.add('show');

    // Flash effect for victory
    if(result === 'WIN'){
      setTimeout(()=> endPanel.classList.add('flash'), 100);
    }

    endRestart.onclick = () => {
      playSfx('ui_click');
      location.reload();
    };

    endMenu.onclick = () => {
      playSfx('ui_click');
      location.href = 'index.html';
    };
  }

  // ---------- Effects ----------
  function fxShake(intense=false){
    document.body.classList.add('shake');
    if(intense) document.body.classList.add('glitchFilter');
    setTimeout(()=> document.body.classList.remove('shake'), intense?260:200);
    setTimeout(()=> document.body.classList.remove('glitchFilter'), 420);
  }

  function spawnBeam(x1,y1,x2,y2){
    const dx = x2-x1, dy = y2-y1;
    const len = Math.hypot(dx,dy);
    const ang = Math.atan2(dy,dx) * 180/Math.PI;
    const el = document.createElement('div');
    el.className='beam';
    
    // Add aggressive styling after round 30
    if(S.round >= 30){
      el.classList.add('aggressive');
    }
    
    el.style.left = `${x1}px`;
    el.style.top = `${y1}px`;
    el.style.width = `${len}px`;
    el.style.transform = `rotate(${ang}deg)`;
    fxLayer.appendChild(el);
    playSfx('beam');
    
    // Keep aggressive beams visible slightly longer
    const duration = S.round >= 20 ? 320 : 260;
    setTimeout(()=> el.remove(), duration);
  }

  function spawnBeamFromBoards(isAi, x, y){
    // from aiWave box or from player board center
    const targetCell = (isAi ? cellAtPlayer(x,y) : cellAtEnemy(x,y));
    if(!targetCell) return;

    const r = targetCell.getBoundingClientRect();
    const tx = r.left + r.width/2;
    const ty = r.top + r.height/2;

    const srcRect = (isAi ? aiWave : pGridEl).getBoundingClientRect();
    const sx = srcRect.left + srcRect.width/2;
    const sy = srcRect.top + srcRect.height/2;

    spawnBeam(sx, sy, tx, ty);
  }

  // ---------- AI Wave (red gradient wave with emoji silhouette) ----------
  let waveT = 0;
  let waveMode = 'normal'; // normal | laugh | flat
  let waveDeathProgress = 0; // 0 to 1 for color drain animation
  const wctx = aiWave.getContext('2d');

  function aiReact(emoji, text, dur=900){
    aiEmote.textContent = `${emoji}  ${text}`;
    aiEmote.style.display = 'block';
    aiEmote.setAttribute('aria-hidden','false');
    setTimeout(()=>{ aiEmote.style.display='none'; aiEmote.setAttribute('aria-hidden','true'); }, dur);
    // influence wave
    if(text.includes('LOSE') || emoji==='😂') waveMode='laugh';
    else if(emoji==='💀') waveMode='flat';
    else waveMode='normal';
  }

  function aiWaveLaugh(){
    waveMode='laugh';
    setTimeout(()=> waveMode='normal', 900);
  }
  function aiWaveFlatline(stay=false){
    waveMode='flat';
    // Start color drain animation
    waveDeathProgress = 0;
    const startTime = Date.now();
    const drainDuration = 1200;
    
    const drainAnim = () => {
      const elapsed = Date.now() - startTime;
      waveDeathProgress = Math.min(1, elapsed / drainDuration);
      if(waveDeathProgress < 1) requestAnimationFrame(drainAnim);
    };
    drainAnim();
    
    if(!stay) setTimeout(()=> { waveMode='normal'; waveDeathProgress=0; }, drainDuration + 200);
  }

  function drawWave(){
    const w = aiWave.width, h = aiWave.height;
    wctx.clearRect(0,0,w,h);

    // background - drain to gray if dying
    let bgColor0, bgColor1;
    if(waveDeathProgress > 0){
      const dp = waveDeathProgress;
      // Interpolate from red to gray
      bgColor0 = `rgba(${Math.round(255*(1-dp*0.8))},${Math.round(dp*100)},${Math.round(dp*100)},${0.16*(1-dp)})`;
      bgColor1 = `rgba(${Math.round(200*(1-dp*0.8))},${Math.round(dp*80)},${Math.round(dp*80)},${0.02*(1-dp)})`;
    } else {
      bgColor0 = 'rgba(255,0,85,.16)';
      bgColor1 = 'rgba(255,0,85,.02)';
    }
    
    const bg = wctx.createLinearGradient(0,0,w,h);
    bg.addColorStop(0, bgColor0);
    bg.addColorStop(1, bgColor1);
    wctx.fillStyle = bg;
    wctx.fillRect(0,0,w,h);

    // Add static glitch during death
    if(waveDeathProgress > 0.3){
      const glitchIntensity = (waveDeathProgress - 0.3) * 2;
      for(let i=0; i<h; i+=10){
        if(Math.random() < glitchIntensity * 0.5){
          wctx.fillStyle = `rgba(200,200,200,${0.1*glitchIntensity})`;
          wctx.fillRect(Math.random()*w, i, Math.random()*50, 8);
        }
      }
    }

    // wave shape
    const baseAmp = (waveMode==='laugh') ? 22 : (waveMode==='flat' ? 1 : 12);
    const amp = (S.round >= 20) ? baseAmp * 2.0 : baseAmp;
    const baseFreq = (waveMode==='laugh') ? 0.020 : 0.015;
    const freq = (S.round >= 20) ? baseFreq * 1.5 : baseFreq;
    const speed = (waveMode==='laugh') ? 0.12 : 0.07;

    // Color gradient - drain to gray
    let gradColor0, gradColor1, gradColor2;
    if(waveDeathProgress > 0){
      const dp = waveDeathProgress;
      gradColor0 = `rgba(${Math.round(255*(1-dp*0.8))},${Math.round(dp*100)},${Math.round(dp*100)},${0.10*(1-dp)})`;
      gradColor1 = `rgba(${Math.round(255*(1-dp*0.6))},${Math.round(dp*120)},${Math.round(dp*120)},${0.55*(1-dp)})`;
      gradColor2 = `rgba(${Math.round(200*(1-dp*0.8))},${Math.round(dp*80)},${Math.round(dp*80)},${0.12*(1-dp)})`;
    } else {
      gradColor0 = 'rgba(255,0,85,.10)';
      gradColor1 = 'rgba(255,0,85,.55)';
      gradColor2 = 'rgba(255,0,85,.12)';
    }

    const grad = wctx.createLinearGradient(0,0,w,0);
    grad.addColorStop(0, gradColor0);
    grad.addColorStop(0.5, gradColor1);
    grad.addColorStop(1, gradColor2);
    wctx.strokeStyle = grad;
    wctx.lineWidth = 3;

    wctx.beginPath();
    for(let x=0;x<=w;x++){
      const y = h/2 + Math.sin((x*freq) + waveT)*amp + Math.sin((x*freq*0.5) + waveT*1.8)* (amp*0.35);
      if(x===0) wctx.moveTo(x,y);
      else wctx.lineTo(x,y);
    }
    wctx.stroke();

    // subtle glow - fade during death
    const glowAlpha = waveDeathProgress > 0 ? 0.35 * (1 - waveDeathProgress) : 0.35;
    wctx.shadowColor = `rgba(255,0,85,${glowAlpha})`;
    wctx.shadowBlur = 18;
    wctx.stroke();

    wctx.shadowBlur = 0;

    waveT += speed;
    requestAnimationFrame(drawWave);
  }

  // ---------- Input handling for setup ----------
  function onKey(e){
    if(S.mode === 'SETUP'){
      if(e.key.toLowerCase()==='r'){
        S.rotation = (S.rotation + 90) % 360;
        drawGhost();
      }
      if(e.key.toLowerCase()==='q'){
        deployModule();
      }
    }
    if(S.mode === 'BATTLE' && S.ghostMode === 'move'){
      // Ghost Shift is no longer in move mode (instant teleport)
      // This block kept for backwards compatibility but shouldn't be reached
    }
  }

  // During ghost shift move: clicking a player cell finalizes move
  function onPlayerClickMove(x,y){
    if(S.pending?.kind!=='ghost_move') return false;
    finalizeGhostMove(x,y);
    return true;
  }

  // Patch player click handler to handle move mode
  const _onPlayerClick = onPlayerClick;
  function onPlayerClick(x,y){
    if(S.mode==='BATTLE' && S.pending?.kind==='ghost_move'){
      onPlayerClickMove(x,y);
      return;
    }
    _onPlayerClick(x,y);
  }

  // ---------- Battle start ----------
  function begin(){
    show();
    buildGrids();
    buildDeck();
    initializeModuleDots();

    // init setup state
    S.mode='SETUP';
    S.round=1; S.energy=3; S.actions=3; S.streak=0;
    S.endReason = null; S.lastUsedThisRound=null; S.didAttackThisRound=false;
    S.activeIdx=null;
    S.modIdx=0; S.rotation=0;
    S.pFleet=new Set(); S.aiFleet=new Set();
    S.pGroups={}; S.aiGroups={};
    S.aiKnownHits=[]; S.aiLastPlayerTypes=[];
    S.firewall=false; S.jamNextAi=false; S.malwareTurns=0;
    S.turnLock=false; S.pending=null; S.pendingUtility=false;
    S.ghostMode=null; S.ghostTargetMid=null; S.ghostCost=null;
    S.pHitsTaken=0; S.aiHitsTaken=0;

    feedEl.innerHTML='';
    feedRound();
    logMsg('SYSTEM', 'ARCHITECT MODE: deploy your modules.');
    updateHUD();
    renderHand();
    showSetupOnly();
    setupTask.textContent = 'DEPLOY: MAINFRAME';
    btnBattle.style.display='none';
    setupPanel.style.display='block';

    setMusic('start');

    // listeners (setup)
    window.addEventListener('keydown', onKey);
  }

  function beginBattle(){
    // hide setup and show hand
    setupPanel.style.display='none';
    handDock.style.display='block';
    handDock.setAttribute('aria-hidden','false');
    setupMobile.style.display='none';

    // deploy AI
    deployAI();

    // deal starting hand (guarantee offense)
    S.hand = [];
    const firstOff = drawFrom('off');
    if(firstOff) S.hand.push(firstOff);
    while(S.hand.length < 5) drawStrategic();
    ensureOffenseInHand();

    S.mode='BATTLE';
    S.turnLock=false;
    S.actions=3;
    S.energy=3;

    feedRound();
    logMsg('SYSTEM', 'BATTLE START.');
    toast('YOUR TURN', false);
    playSfx('turn_player');

    setMusic('battle');

    updateHUD();
    renderHand();
  }

  // ---------- Start / Menu actions ----------
  btnStart.addEventListener('click', () => {
    playSfx('ui_click');
    startScreen.style.display='none';
    begin();
  });
  btnManualStart.addEventListener('click', openManual);
  manualBtn.addEventListener('click', openManual);

  btnBattle.addEventListener('click', () => {
    playSfx('ui_click');
    beginBattle();
  });

  // Mobile setup
  mRotate.addEventListener('click', () => {
    if(S.mode!=='SETUP') return;
    S.rotation=(S.rotation+90)%360;
    drawGhost();
  });
  mConfirm.addEventListener('click', () => {
    if(S.mode!=='SETUP') return;
    deployModule();
  });

  // Audio controls
  audioTab.addEventListener('mouseenter', openAudio);
  audioTab.addEventListener('click', () => {
    if(audioDrawer.classList.contains('open')) closeAudio();
    else openAudio();
  });
  audioDrawer.addEventListener('mouseleave', closeAudio);
  audioToggle.addEventListener('click', () => {
    audio.enabled = !audio.enabled;
    audioToggle.textContent = audio.enabled ? 'SOUND: ON' : 'SOUND: OFF';
    if(audio.enabled){
      audio.music.volume = audio.vol;
      if(!audio.currentTrack) setMusic(S.mode==='BATTLE' ? 'battle' : 'start');
      else setMusic(audio.currentTrack);
    } else {
      stopMusic();
    }
  });
  audioVol.addEventListener('input', () => {
    audio.vol = Number(audioVol.value)/100;
    audio.music.volume = audio.vol;
  });

  // Skip button
  skipBtn.addEventListener('click', onSkip);

  // Grid handlers are attached in buildGrids -> using onEnemyClick/onPlayerClick,
  // so we need to ensure those names point to the implementations.
  // We already declared implementations above; now re-bind correct references:

  // Fix hoist confusion by assigning to window-scoped function refs:
  // (safe in IIFE context)
  const enemyImpl = (x,y) => {
    if(S.mode !== 'BATTLE') return;
    if(S.turnLock) return;

    // ghost move ignores enemy clicks
    if(S.pending?.kind==='ghost_move') return;

    if(S.activeIdx === null) return;
    const card = S.hand[S.activeIdx];
    if(!card) return;

    // Instant cards
    if(card.how === 'instant'){
      // some instants should ask confirm for professionalism:
      if(card.id === 'ovcl'){
        const cost = cardCost(card);
        if(!canSpend(cost)) return;
        showConfirm(`Apply OVERCLOCK (+2 Energy)? (⚡${cost})`, () => {
          playInstant(card);
        });
        return;
      }
      if(card.id === 'rb00'){
        const cost = cardCost(card);
        if(!canSpend(cost)) return;
        showConfirm(`Apply REBOOT (restore last used card)? (⚡${cost})`, () => {
          playInstant(card);
        });
        return;
      }
      // malware/counter/instant intel can trigger immediately
      playInstant(card);
      return;
    }

    // Target enemy cards
    if(card.how === 'enemy' || card.how === 'enemy_col' || card.how === 'trace_pick'){
      const cost = cardCost(card);
      if(!spend(cost)) return;

      playSfx('card_play');
      logMsg('EXECUTE', `${card.n} (⚡${cost})`);
      trackPlayerType(card.t);

      if(card.id === 'vstr'){
        pingAI(x,y);
      } else if(card.id === 'bpkt'){
        for(let i=0;i<3;i++){
          const ry = (Math.random()*GRID)|0;
          pingAI(x, ry);
        }
      } else if(card.id === 'lbom'){
        for(let ix=x-1; ix<=x+1; ix++){
          for(let iy=y-1; iy<=y+1; iy++){
            pingAI(ix,iy);
          }
        }
      } else if(card.id === 'sonr'){
        scan3x3(x,y);
      } else if(card.id === 'trac'){
        consumeCard();
        tracePick(x,y);
        updateHUD();
        renderHand();
        return;
      }

      consumeCard();
      afterPlayerAction();
      return;
    }
  };

  // Rewire enemy cell listeners to use enemyImpl (because we created cells earlier in begin())
  function rewireEnemyClicks(){
    for(let y=0;y<GRID;y++){
      for(let x=0;x<GRID;x++){
        const k=`${x},${y}`;
        const el=S.aiCells[k];
        if(!el) continue;
        el.onclick = () => enemyImpl(x,y);
      }
    }
  }
  function rewirePlayerClicks(){
    for(let y=0;y<GRID;y++){
      for(let x=0;x<GRID;x++){
        const k=`${x},${y}`;
        const el=S.pCells[k];
        if(!el) continue;
        el.onclick = () => onPlayerClick(x,y);
        el.onmouseenter = () => { S.lastX=x; S.lastY=y; if(S.mode==='SETUP') drawGhost(); };
      }
    }
  }

  // Manual button overlap safety
  // (CSS already pins. no further code needed.)

  // Start wave animation immediately
  drawWave();

})();
