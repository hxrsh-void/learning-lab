/* ===== Vermilion Moon: game layer ===== */
(function(){
'use strict';

var CHAPTERS = [
  { sel:'#hero',     id:'gate',  glyph:'門', name:'The Hidden Gate',
    verse:'You passed under alone, yet something crossed beside you, uninvited and silent.',
    keyword:'follows you' },
  { sel:'#gate',     id:'stone', glyph:'石', name:'The Stone Lantern',
    verse:'A small sun kept in stone. Its light wakes things that are not light.',
    keyword:'born of light' },
  { sel:'#pathways', id:'pond',  glyph:'水', name:'The Still Water',
    verse:'It sleeps on the water but is never wet. When the last candle dies, it dies beside it.',
    keyword:'dies with light' },
  { sel:'#lessons',  id:'bell',  glyph:'鐘', name:'The Bronze Bell',
    verse:'The bell\u2019s voice fades on the air. The listener beneath it leaves no footprints.',
    keyword:'no footprints' },
  { sel:'#eternity', id:'pine',  glyph:'松', name:'The Old Pine',
    verse:'At noon it crouches at your feet. At dusk it stretches long across the moss.',
    keyword:'stretches long' }
];
var SAVE_KEY = 'vermilion-moon-v1';
var HINTS = [
  'A light breathes somewhere on this screen. Follow the glow.',
  'Each chapter of the walk hides one seal. Scroll slowly.',
  'Five seals: gate, lantern, water, bell, pine.'
];
var FINAL_HINT = 'The seals each whispered a piece of the name.';

/* ---------- state ---------- */
var collected = {}, wrongGuesses = 0, startTime = null;
var playing = false, finished = false, hintIdx = 0, currentIdx = 0;
try {
  var saved = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
  if (saved && saved.seals) {
    saved.seals.forEach(function(id){ collected[id] = true; });
    wrongGuesses = saved.wrong || 0;
    if (saved.started) startTime = saved.started;
  }
} catch(e) {}
function save(){
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({
    seals: Object.keys(collected), wrong: wrongGuesses, started: startTime })); } catch(e){}
}
function sealCount(){ return Object.keys(collected).length; }

/* ---------- audio (generated, no assets) ---------- */
var AC = null, master = null, muted = false;
function initAudio(){
  if (AC) return;
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain(); master.gain.value = 0.5; master.connect(AC.destination);
    var len = AC.sampleRate * 3, buf = AC.createBuffer(1, len, AC.sampleRate), d = buf.getChannelData(0);
    for (var i=0;i<len;i++) d[i] = Math.random()*2-1;
    var src = AC.createBufferSource(); src.buffer = buf; src.loop = true;
    var lp = AC.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value = 260;
    var windGain = AC.createGain(); windGain.gain.value = 0.05;
    src.connect(lp); lp.connect(windGain); windGain.connect(master); src.start();
    var lfo = AC.createOscillator(), lfoG = AC.createGain();
    lfo.frequency.value = 0.09; lfoG.gain.value = 0.028;
    lfo.connect(lfoG); lfoG.connect(windGain.gain); lfo.start();
  } catch(e) {}
}
function tone(freqs, dur, vol, type){
  if (!AC || muted) return;
  var t = AC.currentTime;
  freqs.forEach(function(f, i){
    var o = AC.createOscillator(), g = AC.createGain();
    o.type = type || 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol/(i+1), t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.1);
  });
}
var sfx = {
  chime: function(){ tone([880, 1318, 1760], 1.6, 0.16); },
  bell:  function(){ tone([110, 165, 220], 3.5, 0.3); },
  thud:  function(){ tone([72], 0.7, 0.32, 'triangle'); },
  swell: function(){ tone([523,659,784,1046], 3.2, 0.13);
    setTimeout(function(){ tone([784,1046,1318], 3.5, 0.1); }, 350); }
};
function setMuted(m){
  muted = m; if (master) master.gain.value = m ? 0 : 0.5;
  document.getElementById('kg-mute').textContent = m ? '✕' : '♪';
}

/* ---------- DOM ---------- */
function el(tag, cls, html){
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
var root = document.body;

/* HUD */
var hud = el('div', '', ''); hud.id = 'kg-hud';
CHAPTERS.forEach(function(c){
  var s = el('div', 'kg-slot', c.glyph); s.id = 'kg-slot-' + c.id; hud.appendChild(s);
});
var timer = el('span', '', '00:00'); timer.id = 'kg-timer'; hud.appendChild(timer);
var hintBtn = el('button', 'kg-icon', '?'); hintBtn.id = 'kg-hint'; hintBtn.title = 'Hint'; hud.appendChild(hintBtn);
var muteBtn = el('button', 'kg-icon', '♪'); muteBtn.id = 'kg-mute'; muteBtn.title = 'Sound'; hud.appendChild(muteBtn);
root.appendChild(hud);

/* orb */
var orb = el('button', '', '<span class="kg-orb-glyph">門</span><span class="kg-orb-label">a seal stirs</span>');
orb.id = 'kg-orb'; root.appendChild(orb);
var orbGlyph = orb.querySelector('.kg-orb-glyph');
var orbLabel = orb.querySelector('.kg-orb-label');

/* fade */
var fade = el('div'); fade.id = 'kg-fade'; root.appendChild(fade);

/* overlay factory */
function makeOverlay(id, inner){
  var o = el('div', 'kg-overlay kg-hidden', '<div class="kg-panel">' + inner + '</div>');
  o.id = id; o.style.display = 'none'; root.appendChild(o); return o;
}
var intro = makeOverlay('kg-intro',
  '<div class="kg-moonmark"></div>' +
  '<div class="kg-kicker">A temple mystery</div>' +
  '<h1 class="kg-title">Vermilion Moon<small>朱月</small></h1>' +
  '<div class="kg-sub">The Five Seals</div>' +
  '<p class="kg-story">Once a century, the <b>vermilion moon</b> rises over the mountain temple. ' +
  'Tonight the <b>warden</b> that keeps these halls has come apart, ' +
  'scattered into <b>five seals</b> along the night walk.<br><br>' +
  'Find them as you wander. Learn its name. Restore the warden before the moon sets.</p>' +
  '<button class="kg-btn" id="kg-begin">Begin the vigil</button>' +
  '<p class="kg-tip">Scroll the walk · when a light breathes, tap it<br>Sound on for the full atmosphere</p>');
var sealModal = makeOverlay('kg-seal',
  '<div class="kg-glyph" id="kg-glyph"></div>' +
  '<div class="kg-sealname" id="kg-sealname"></div>' +
  '<p class="kg-verse" id="kg-verse"></p>' +
  '<p class="kg-keyword">The seal whispers: <span id="kg-keyword"></span></p>' +
  '<div class="kg-count" id="kg-count"></div>' +
  '<button class="kg-btn" id="kg-continue">Continue</button>');
var finalModal = makeOverlay('kg-final',
  '<div class="kg-kicker">The temple door</div>' +
  '<p class="kg-verse">“I am born of light, yet I am not light.<br>' +
  'I follow your every step, yet leave no footprints.<br>' +
  'When the last candle dies, I die beside it.<br><br>Speak my name.”</p>' +
  '<button class="kg-choice" data-answer="moon">The Vermilion Moon</button>' +
  '<button class="kg-choice" data-answer="shadow">The Temple\u2019s Shadow</button>' +
  '<button class="kg-choice" data-answer="wind">The Night Wind</button>' +
  '<p class="kg-tip" id="kg-final-tip"></p>');
var ending = makeOverlay('kg-ending',
  '<div class="kg-kicker" style="color:#c9a24a">The warden restored</div>' +
  '<div class="kg-glyph" style="background:#e6bb6a;color:#2a1608">影</div>' +
  '<p class="kg-story">The seals flare gold. Light pours from the hall - and out of it steps ' +
  'the temple\u2019s own <b>shadow</b>, whole again.<br><br>' +
  'It bows to you, once, deeply. The vermilion moon softens toward dawn. ' +
  'The mountain sleeps. The warden walks.</p>' +
  '<div class="kg-stats" id="kg-stats"></div>' +
  '<button class="kg-btn" id="kg-again">Play again</button>' +
  '<p class="kg-credit">Vermilion Moon · a temple mystery</p>');

var overlays = [intro, sealModal, finalModal, ending];
function showOverlay(o){
  overlays.forEach(function(x){
    if (x === o){ x.style.display = 'flex'; requestAnimationFrame(function(){ x.classList.remove('kg-hidden'); }); }
    else {
      x.classList.add('kg-hidden');
      setTimeout(function(){ if (x.classList.contains('kg-hidden')) x.style.display = 'none'; }, 650);
    }
  });
  document.body.classList.toggle('is-locked', !!o);
  updateOrb();
}

/* ---------- chapter tracking ---------- */
var sections = CHAPTERS.map(function(c){ return document.querySelector(c.sel); });
function detectChapter(){
  var mid = innerHeight * 0.5, best = 0, bestScore = Infinity;
  sections.forEach(function(s, i){
    if (!s) return;
    var r = s.getBoundingClientRect();
    var score;
    if (r.top <= mid && r.bottom >= mid) score = 0;
    else score = Math.min(Math.abs(r.top - mid), Math.abs(r.bottom - mid));
    if (score < bestScore){ bestScore = score; best = i; }
  });
  currentIdx = best;
  updateOrb();
}
var ticking = false;
addEventListener('scroll', function(){
  if (ticking) return; ticking = true;
  requestAnimationFrame(function(){ ticking = false; detectChapter(); });
}, {passive:true});

function updateOrb(){
  if (!playing || finished || document.querySelector('.kg-overlay:not(.kg-hidden)')){
    orb.classList.remove('on'); return;
  }
  if (sealCount() >= CHAPTERS.length){
    orb.classList.add('on'); orb.classList.add('gold');
    orbGlyph.textContent = '扉'; orbLabel.textContent = 'the door listens';
    return;
  }
  orb.classList.remove('gold');
  var c = CHAPTERS[currentIdx];
  if (collected[c.id]){ orb.classList.remove('on'); return; }
  orbGlyph.textContent = c.glyph; orbLabel.textContent = 'a seal stirs';
  orb.classList.add('on');
}

/* ---------- game actions ---------- */
function refreshSlots(){
  CHAPTERS.forEach(function(c){
    document.getElementById('kg-slot-' + c.id).classList.toggle('got', !!collected[c.id]);
  });
}
function collectCurrent(){
  var c = CHAPTERS[currentIdx];
  if (collected[c.id]) return;
  collected[c.id] = true; save(); refreshSlots(); sfx.chime();
  if (sealCount() >= CHAPTERS.length) sfx.bell();
  document.getElementById('kg-glyph').textContent = c.glyph;
  document.getElementById('kg-sealname').textContent = c.name;
  document.getElementById('kg-verse').textContent = c.verse;
  document.getElementById('kg-keyword').textContent = c.keyword;
  document.getElementById('kg-count').textContent = sealCount() >= CHAPTERS.length
    ? 'All five seals recovered - the temple door is listening'
    : 'Seal ' + sealCount() + ' of 5';
  showOverlay(sealModal);
}
orb.addEventListener('click', function(){
  if (sealCount() >= CHAPTERS.length){ openFinal(); } else { collectCurrent(); }
});
document.getElementById('kg-continue').addEventListener('click', function(){ showOverlay(null); });
function openFinal(){
  if (finished) return;
  document.getElementById('kg-final-tip').textContent = '';
  showOverlay(finalModal); sfx.bell();
}
Array.prototype.forEach.call(document.querySelectorAll('.kg-choice'), function(btn){
  btn.addEventListener('click', function(){
    if (btn.getAttribute('data-answer') === 'shadow'){ endGame(); return; }
    wrongGuesses++; save(); sfx.thud();
    btn.classList.add('kg-shake');
    setTimeout(function(){ btn.classList.remove('kg-shake'); }, 500);
    document.getElementById('kg-final-tip').textContent = 'The ground shudders. That is not its name.';
  });
});
function endGame(){
  finished = true;
  var secs = Math.max(0, Math.floor((Date.now() - (startTime || Date.now()))/1000));
  var mm = String(Math.floor(secs/60)).padStart(2,'0'), ss = String(secs%60).padStart(2,'0');
  document.getElementById('kg-stats').innerHTML =
    'Warden restored in <b>' + mm + ':' + ss + '</b><br>Seals <b>5 / 5</b> · wrong names spoken <b>' + wrongGuesses + '</b>';
  showOverlay(null); sfx.swell();
  fade.classList.add('on');
  setTimeout(function(){ fade.classList.remove('on'); showOverlay(ending); }, 2400);
}
document.getElementById('kg-again').addEventListener('click', function(){
  localStorage.removeItem(SAVE_KEY); location.reload();
});
hintBtn.addEventListener('click', function(){
  if (!playing || finished) return;
  var msg = sealCount() >= CHAPTERS.length ? FINAL_HINT : HINTS[hintIdx++ % HINTS.length];
  document.getElementById('kg-glyph').textContent = '月';
  document.getElementById('kg-sealname').textContent = 'A whisper';
  document.getElementById('kg-verse').textContent = msg;
  document.getElementById('kg-keyword').textContent = '';
  document.getElementById('kg-count').textContent = 'Seal ' + sealCount() + ' of 5';
  showOverlay(sealModal);
});
muteBtn.addEventListener('click', function(){ setMuted(!muted); });
document.getElementById('kg-begin').addEventListener('click', function(){
  initAudio();
  if (AC && AC.state === 'suspended') AC.resume();
  playing = true; startTime = startTime || Date.now(); save();
  hud.classList.add('on');
  showOverlay(null);
});

/* timer */
setInterval(function(){
  if (!playing || finished || !startTime) return;
  var s = Math.floor((Date.now() - startTime)/1000);
  timer.textContent = String(Math.floor(s/60)).padStart(2,'0') + ':' + String(s%60).padStart(2,'0');
}, 1000);

/* boot */
refreshSlots();
detectChapter();
showOverlay(intro);
})();
