/* AI Aura Reader — psychic-reading-online.net. Автономний скрипт без залежностей.
 * Інтерфейс: силует у трьох шарах світіння; кольори й сила світіння змінюють аури вживу; відповідь приходить потоком від Worker. */
(function () {
  'use strict';
  var root = document.getElementById('aura-app');
  var cfgEl = document.getElementById('aura-config');
  if (!root || !cfgEl) return;
  var cfg;
  try { cfg = JSON.parse(cfgEl.textContent); } catch (e) { return; }

  var COLORS = [
    { id: 'red', name: 'Red', hex: '#e5484d', word: 'Drive and heat' },
    { id: 'orange', name: 'Orange', hex: '#f08a3c', word: 'Creative and social' },
    { id: 'yellow', name: 'Yellow', hex: '#f2cc4b', word: 'Curious and bright' },
    { id: 'green', name: 'Green', hex: '#4cb782', word: 'Growth and balance' },
    { id: 'turquoise', name: 'Turquoise', hex: '#38c3c1', word: 'Clear and open' },
    { id: 'blue', name: 'Blue', hex: '#4a7be0', word: 'Calm and steady' },
    { id: 'violet', name: 'Violet', hex: '#9470e6', word: 'Intuitive and dreamy' },
    { id: 'pink', name: 'Pink', hex: '#ee8fb5', word: 'Tender and warm' },
    { id: 'white', name: 'White', hex: '#f6f1e4', word: 'Open and resting' }
  ];
  var LAYERS = [
    { key: 'core', label: 'Inner glow', ask: 'How you feel right now', rx: 82, ry: 108 },
    { key: 'body', label: 'Middle layer', ask: 'What you are carrying', rx: 128, ry: 160 },
    { key: 'edge', label: 'Outer edge', ask: 'What you show other people', rx: 172, ry: 206 }
  ];
  var LEVEL_NAMES = { 1: 'Faint', 2: 'Steady', 3: 'Radiant' };
  var LEVEL_OPACITY = { 1: 0.34, 2: 0.62, 3: 0.92 };
  var FOCUS = [['general', 'General'], ['love', 'Love'], ['work', 'Work'], ['energy', 'Energy and rest']];
  var cDef = {}; COLORS.forEach(function (c) { cDef[c.id] = c; });

  var params = new URLSearchParams(location.search);
  var state = {
    layer: 'core',
    sel: { core: null, body: null, edge: null },
    lvl: { core: 2, body: 2, edge: 2 },
    focus: FOCUS.some(function (f) { return f[0] === params.get('focus'); }) ? params.get('focus') : 'general',
    reader: null,
    busy: false,
    ctrl: null
  };
  var wanted = params.get('reader');
  cfg.readers.forEach(function (r) { if (r.slug === wanted) state.reader = r.slug; });
  if (!state.reader) state.reader = (cfg.readers.filter(function (r) { return r.slug === 'nathan-cross'; })[0] || cfg.readers[0]).slug;

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function layerDef(k) { return LAYERS.filter(function (l) { return l.key === k; })[0]; }
  function reader() { return cfg.readers.filter(function (r) { return r.slug === state.reader; })[0]; }
  function endpoint() {
    var local = /^(127\.0\.0\.1|localhost)$/.test(location.hostname);
    return local ? 'http://127.0.0.1:8793/api/ai-aura/' : ((window.PRON_AURA && window.PRON_AURA.endpoint) || '/api/ai-aura/');
  }

  /* ---------- каркас ---------- */
  var ns = 'http://www.w3.org/2000/svg';
  var svg =
    '<svg class="aura-svg" viewBox="0 0 400 440" role="img" aria-label="A silhouette surrounded by three layers of coloured light">' +
    '<defs>' +
    LAYERS.map(function (l) {
      return '<radialGradient id="ag-' + l.key + '" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="var(--ac-' + l.key + ',#2a4c52)" stop-opacity="1"/>' +
        '<stop offset="62%" stop-color="var(--ac-' + l.key + ',#2a4c52)" stop-opacity=".75"/><stop offset="100%" stop-color="var(--ac-' + l.key + ',#2a4c52)" stop-opacity="0"/></radialGradient>';
    }).join('') +
    '<filter id="ablur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7"/></filter>' +
    '</defs>' +
    '<g class="aura-field">' +
    LAYERS.slice().reverse().map(function (l) {
      return '<g class="aura-layer aura-l-' + l.key + '" data-layer="' + l.key + '"><ellipse class="aura-glow" cx="200" cy="228" rx="' + l.rx + '" ry="' + l.ry +
        '" fill="url(#ag-' + l.key + ')" filter="url(#ablur)" opacity=".22"/>' +
        '<ellipse class="aura-ring" cx="200" cy="228" rx="' + l.rx + '" ry="' + l.ry + '" fill="none"/></g>';
    }).join('') +
    '</g>' +
    '<g class="aura-figure" aria-hidden="true"><circle cx="200" cy="198" r="26"/><path d="M142 330 C142 262 168 236 200 236 C232 236 258 262 258 330 Z"/></g>' +
    '<g class="aura-tags" aria-hidden="true">' +
    LAYERS.map(function (l) {
      return '<text class="aura-tag aura-tag-' + l.key + '" x="200" y="' + (228 - l.ry + 17) + '" text-anchor="middle">' + l.label.toUpperCase() + '</text>';
    }).join('') +
    '</g></svg>';

  root.innerHTML =
    '<div class="aura-grid">' +
    '<div class="aura-stage" id="aura-stage">' + svg + '<p class="aura-stage-hint" id="aura-hint">Tap a layer of light, then pick its colour.</p></div>' +
    '<div class="aura-panel">' +
    '<div class="aura-step"><span class="aura-num">1</span><h2 class="aura-h">Choose a layer</h2>' +
    '<div class="aura-layers" role="radiogroup" aria-label="Layer"></div></div>' +
    '<div class="aura-step"><span class="aura-num">2</span><h2 class="aura-h">Pick its colour</h2>' +
    '<div class="aura-swatches" role="radiogroup" aria-label="Colour"></div>' +
    '<p class="aura-colorword" id="aura-cw" aria-live="polite">&nbsp;</p>' +
    '<label class="aura-slider"><span>Glow strength: <strong id="aura-lvl-name">Steady</strong></span>' +
    '<input type="range" id="aura-lvl" min="1" max="3" step="1" value="2" aria-label="Glow strength"></label></div>' +
    '<div class="aura-step"><span class="aura-num">3</span><h2 class="aura-h">Set the focus</h2>' +
    '<div class="aura-chips" role="radiogroup" aria-label="Focus"></div>' +
    '<label class="aura-field-label" for="aura-note">Anything on your mind? <em>(optional)</em></label>' +
    '<input id="aura-note" class="aura-note" type="text" maxlength="200" placeholder="A few words about what is going on" autocomplete="off">' +
    '<div class="aura-prompts" id="aura-prompts"></div></div>' +
    '<div class="aura-step"><span class="aura-num">4</span><h2 class="aura-h">Pick a voice</h2>' +
    '<div class="aura-voices" role="radiogroup" aria-label="Reader voice"></div></div>' +
    '<button type="button" class="aura-go" id="aura-go" disabled>Read my aura</button>' +
    '<p class="aura-small" id="aura-need">Choose a colour for all three layers to begin.</p>' +
    '</div></div>' +
    '<section class="aura-result" id="aura-result" hidden aria-live="polite"></section>';

  var layersBox = root.querySelector('.aura-layers');
  var swBox = root.querySelector('.aura-swatches');
  var chipBox = root.querySelector('.aura-chips');
  var voiceBox = root.querySelector('.aura-voices');
  var lvl = root.querySelector('#aura-lvl');
  var lvlName = root.querySelector('#aura-lvl-name');
  var goBtn = root.querySelector('#aura-go');
  var needTxt = root.querySelector('#aura-need');
  var note = root.querySelector('#aura-note');
  var promptsBox = root.querySelector('#aura-prompts');
  var resultBox = root.querySelector('#aura-result');
  var cw = root.querySelector('#aura-cw');
  var hint = root.querySelector('#aura-hint');

  LAYERS.forEach(function (l) {
    var b = el('button', 'aura-layer-btn', '<i class="aura-dot"></i><span><strong>' + l.label + '</strong><small>' + l.ask + '</small></span>');
    b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.layer = l.key;
    b.addEventListener('click', function () { selectLayer(l.key); });
    layersBox.appendChild(b);
  });
  COLORS.forEach(function (c) {
    var b = el('button', 'aura-sw', '<span class="aura-sw-dot" style="background:' + c.hex + '"></span><span class="aura-sw-name">' + c.name + '</span>');
    b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.color = c.id; b.setAttribute('aria-label', c.name + ': ' + c.word);
    b.addEventListener('click', function () { setColor(c.id); });
    swBox.appendChild(b);
  });
  FOCUS.forEach(function (f) {
    var b = el('button', 'aura-chip', esc(f[1]));
    b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.focus = f[0];
    b.addEventListener('click', function () { state.focus = f[0]; paint(); });
    chipBox.appendChild(b);
  });
  cfg.readers.forEach(function (r) {
    var b = el('button', 'aura-voice', '<img src="' + esc(r.avatar) + '" alt="" width="56" height="56" loading="lazy"><span><strong>' + esc(r.first) + '</strong><small>' + esc(r.lens) + '</small></span>');
    b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.reader = r.slug;
    b.setAttribute('aria-label', r.name + ', ' + r.lens);
    b.addEventListener('click', function () { state.reader = r.slug; paint(); });
    voiceBox.appendChild(b);
  });
  Array.prototype.forEach.call(root.querySelectorAll('.aura-layer'), function (g) {
    g.addEventListener('click', function () { selectLayer(g.dataset.layer); });
  });

  lvl.addEventListener('input', function () { state.lvl[state.layer] = +lvl.value; paint(); });
  note.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); if (!goBtn.disabled) run(); } });
  goBtn.addEventListener('click', run);

  function selectLayer(k) { state.layer = k; paint(); }
  function setColor(id) {
    state.sel[state.layer] = id;
    var order = ['core', 'body', 'edge'];
    var next = order.filter(function (k) { return !state.sel[k]; })[0];
    if (next) state.layer = next;
    paint();
  }
  function ready() { return !!(state.sel.core && state.sel.body && state.sel.edge); }

  function paint() {
    var cur = state.layer;
    root.querySelector('.aura-stage').className = 'aura-stage sel-' + cur;
    LAYERS.forEach(function (l) {
      var c = state.sel[l.key] ? cDef[state.sel[l.key]] : null;
      var g = root.querySelector('.aura-l-' + l.key);
      var glow = g.querySelector('.aura-glow');
      var stage = root.querySelector('.aura-stage');
      stage.style.setProperty('--ac-' + l.key, c ? c.hex : '#2a4c52');
      glow.setAttribute('opacity', c ? LEVEL_OPACITY[state.lvl[l.key]] : 0.22);
      g.classList.toggle('is-cur', l.key === cur);
      g.classList.toggle('is-set', !!c);
      var btn = layersBox.querySelector('[data-layer="' + l.key + '"]');
      btn.setAttribute('aria-checked', l.key === cur ? 'true' : 'false');
      btn.classList.toggle('on', l.key === cur);
      btn.querySelector('.aura-dot').style.background = c ? c.hex : 'transparent';
      btn.querySelector('small').textContent = c ? c.name + ', ' + LEVEL_NAMES[state.lvl[l.key]].toLowerCase() : l.ask;
    });
    Array.prototype.forEach.call(swBox.children, function (b) {
      var on = state.sel[cur] === b.dataset.color;
      b.setAttribute('aria-checked', on ? 'true' : 'false'); b.classList.toggle('on', on);
    });
    var cc = state.sel[cur] ? cDef[state.sel[cur]] : null;
    cw.innerHTML = cc ? '<strong>' + cc.name + '</strong> &middot; ' + cc.word : 'Choose a colour for the ' + layerDef(cur).label.toLowerCase() + '.';
    lvl.value = state.lvl[cur]; lvlName.textContent = LEVEL_NAMES[state.lvl[cur]];
    lvl.disabled = !cc;
    Array.prototype.forEach.call(chipBox.children, function (b) { var on = b.dataset.focus === state.focus; b.setAttribute('aria-checked', on ? 'true' : 'false'); b.classList.toggle('on', on); });
    Array.prototype.forEach.call(voiceBox.children, function (b) { var on = b.dataset.reader === state.reader; b.setAttribute('aria-checked', on ? 'true' : 'false'); b.classList.toggle('on', on); });
    var rd = reader();
    promptsBox.innerHTML = '';
    (rd.prompts || []).forEach(function (p) {
      var b = el('button', 'aura-prompt', esc(p)); b.type = 'button';
      b.addEventListener('click', function () { note.value = p; note.focus(); });
      promptsBox.appendChild(b);
    });
    goBtn.disabled = !ready() || state.busy;
    needTxt.hidden = ready();
    hint.textContent = ready() ? 'Your aura is ready to read.' : 'Tap a layer of light, then pick its colour.';
  }

  /* ---------- відповідь ---------- */
  function fmt(text) {
    return text.split(/\n\s*\n/).map(function (p) {
      var h = esc(p.trim()).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
      return h ? '<p>' + h + '</p>' : '';
    }).join('');
  }
  function summary() {
    return '<ul class="aura-sum">' + LAYERS.map(function (l) {
      var c = cDef[state.sel[l.key]];
      return '<li><i style="background:' + c.hex + ';opacity:' + (0.45 + state.lvl[l.key] * 0.18) + '"></i><span><small>' + l.label + '</small><strong>' + c.name + ' &middot; ' + LEVEL_NAMES[state.lvl[l.key]] + '</strong></span></li>';
    }).join('') + '</ul>';
  }
  function showError(msg) {
    var box = resultBox.querySelector('.aura-text');
    box.innerHTML = '<p class="aura-error">' + esc(msg) + '</p>';
    resultBox.querySelector('.aura-actions').hidden = false;
  }
  function run() {
    if (state.busy || !ready()) return;
    state.busy = true; paint();
    var rd = reader();
    resultBox.hidden = false;
    resultBox.innerHTML =
      '<div class="aura-result-head"><span class="aura-ai-badge">AI-written reflection</span><h2>Your aura, read in ' + esc(rd.first) + '&rsquo;s voice</h2>' + summary() + '</div>' +
      '<div class="aura-text aura-wait"><span class="aura-pulse"></span><span class="aura-pulse"></span><span class="aura-pulse"></span><em>Reading your three layers&hellip;</em></div>' +
      '<p class="aura-disclaimer">An automated reflection for entertainment and self-reflection, written in a style inspired by ' + esc(rd.name) + '. It is not a live session and not professional advice.</p>' +
      '<div class="aura-actions" hidden><button type="button" class="aura-btn" data-act="again">Read it again</button>' +
      '<button type="button" class="aura-btn ghost" data-act="edit">Change my colours</button>' +
      '<a class="aura-btn live" href="' + esc(cfg.live_url) + '">Talk with a live reader</a></div>';
    resultBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
    resultBox.querySelector('[data-act="again"]').addEventListener('click', run);
    resultBox.querySelector('[data-act="edit"]').addEventListener('click', function () {
      root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    var box = resultBox.querySelector('.aura-text');
    var actions = resultBox.querySelector('.aura-actions');
    var body = {
      reader: state.reader, focus: state.focus, note: note.value.trim().slice(0, 200),
      layers: {
        core: { c: state.sel.core, l: state.lvl.core }, body: { c: state.sel.body, l: state.lvl.body }, edge: { c: state.sel.edge, l: state.lvl.edge }
      }
    };
    state.ctrl = new AbortController();
    var timer = setTimeout(function () { state.ctrl.abort(); }, 90000);
    var acc = ''; var cut = false;
    fetch(endpoint(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: state.ctrl.signal })
      .then(function (res) {
        if (!res.ok) {
          return res.json().catch(function () { return {}; }).then(function (j) { throw new Error(j.error || 'The reading is unavailable right now.'); });
        }
        var rdr = res.body.getReader(); var dec = new TextDecoder(); var buf = '';
        function pump() {
          return rdr.read().then(function (r) {
            if (r.done) return;
            buf += dec.decode(r.value, { stream: true });
            var lines = buf.split('\n'); buf = lines.pop();
            lines.forEach(function (ln) {
              ln = ln.trim();
              if (ln.indexOf('data:') !== 0) return;
              var p = ln.slice(5).trim();
              if (p === '[DONE]') return;
              try { var j = JSON.parse(p); if (j.t) acc += j.t; if (j.cut) cut = true; } catch (e) { /* неповний рядок */ }
            });
            box.classList.remove('aura-wait');
            box.innerHTML = fmt(acc) + '<span class="aura-caret"></span>';
            return pump();
          });
        }
        return pump();
      })
      .then(function () {
        if (!acc.trim()) throw new Error('The reading came back empty. Please try again.');
        box.innerHTML = fmt(acc);
        if (cut) box.insertAdjacentHTML('beforeend', '<p class="aura-error">The reflection was cut short. Try again for a fuller one.</p>');
        actions.hidden = false;
      })
      .catch(function (err) {
        if (acc.trim()) { box.innerHTML = fmt(acc) + '<p class="aura-error">The reflection was cut short. Try again for a fuller one.</p>'; actions.hidden = false; }
        else { box.classList.remove('aura-wait'); showError(err && err.name === 'AbortError' ? 'This is taking too long. Please try again.' : (err && err.message) || 'Something went wrong. Please try again.'); }
      })
      .then(function () { clearTimeout(timer); state.busy = false; paint(); });
  }

  paint();
})();
