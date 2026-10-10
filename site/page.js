/* Page-local behaviour for the caveman-indonesia landing page.
   The engine (scrollcraft.js) stays untouched. Everything bespoke lives here:
     1. pahat basa-basi  the chisel, driven from the peak act's --sc-p
     2. numbers           filled from data.js, formatted id-ID, ticked on entry
     3. copy buttons
   All figures come from window.IRIT, generated from the benchmark. */
(function () {
  'use strict';

  var D = window.IRIT;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var nf1 = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  var nf0 = new Intl.NumberFormat('id-ID');
  if (reduce) document.documentElement.classList.add('is-reduced');

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function smooth(t) { t = clamp01(t); return t * t * (3 - 2 * t); }
  function esc(s) { return s.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function inlineCode(s) { return esc(s).replace(/`([^`]+)`/g, '<code>$1</code>'); }

  /* ------------------------------------------------------------ numbers -- */
  function fillNumbers() {
    if (!D) return;
    Array.prototype.forEach.call(document.querySelectorAll('[data-mode]'), function (el) {
      var m = D.modes[el.getAttribute('data-mode')];
      if (!m) return;
      el.querySelector('[data-mode-text]').innerHTML = inlineCode(m.text);
      el.querySelector('[data-mode-tokens]').textContent = nf0.format(m.tokens);
    });
    var st = document.querySelector('[data-skill-tokens]');
    if (st) st.textContent = nf0.format(D.skillTokens);

    var ledger = document.querySelector('[data-ledger]');
    if (!ledger) return;
    var rows = {};
    Array.prototype.forEach.call(ledger.querySelectorAll('[data-row]'), function (tr) {
      var key = tr.getAttribute('data-row');
      var tokens = key === 'normal' ? D.bench.normal : D.bench[key].tokens;
      tr.querySelector('[data-v]').textContent = nf0.format(tokens);
      tr.querySelector('.bar').style.setProperty('--w', (tokens / D.bench.normal).toFixed(4));
      var save = tr.querySelector('[data-save]');
      if (save) { rows[key] = { el: save, to: D.bench[key].saved }; save.textContent = nf1.format(D.bench[key].saved) + '%'; }
    });
    if (reduce || !('IntersectionObserver' in window)) { ledger.classList.add('is-in'); return; }
    Object.keys(rows).forEach(function (k) { rows[k].el.textContent = nf1.format(0) + '%'; });
    var io = new IntersectionObserver(function (entries) {
      if (!entries.some(function (e) { return e.isIntersecting; })) return;
      io.disconnect();
      ledger.classList.add('is-in');
      var t0 = performance.now(), ms = 1400;
      (function tick(now) {
        var t = clamp01((now - t0) / ms), e = 1 - Math.pow(1 - t, 3);
        Object.keys(rows).forEach(function (k) { rows[k].el.textContent = nf1.format(rows[k].to * e) + '%'; });
        if (t < 1) requestAnimationFrame(tick);
      })(t0);
    }, { threshold: 0.5 });
    io.observe(ledger);
  }

  /* -------------------------------------------------------------- chisel -- */
  // Windows in the peak act's progress for each chisel stage:
  // 0 pembuka, 1 penutup, 2 sapaan and ragu-ragu, 3 kata kosong.
  var STAGES = [[0.06, 0.17], [0.17, 0.28], [0.28, 0.36], [0.36, 0.58]];
  var SWAP = [0.66, 0.8];       // normal reply hands over to the irit reply
  var CRACK = 0.3;              // share of a token's window spent cracking before it falls

  function tokenize(p, pieces) {
    if (!pieces || pieces.join('') !== p.textContent) return null;   // never show pieces that are not the text
    p.textContent = '';
    return pieces.map(function (t) {
      var s = document.createElement('span');
      s.className = 'tok';
      s.textContent = t;
      p.appendChild(s);
      return s;
    });
  }

  function initChisel() {
    var act = document.getElementById('pahat');
    if (!act || !D) return;
    var stage = act.querySelector('.chisel__stage');
    var body = act.querySelector('.chisel__body');
    var normalP = act.querySelector('[data-reply="normal"]');
    var iritP = act.querySelector('[data-reply="singkat"]');
    var numEl = act.querySelector('[data-chisel-num]');
    var phaseEl = act.querySelector('[data-chisel-phase]');

    var spans = tokenize(normalP, D.normal.map(function (t) { return t.t; }));
    var iritSpans = tokenize(iritP, D.singkat);
    if (!spans || !iritSpans) return;

    // Fluff tokens grouped by stage, in reading order, each with a fixed random fall.
    var seed = 7;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    var groups = [[], [], [], []];
    D.normal.forEach(function (t, i) {
      if (t.f === undefined) return;
      groups[t.s].push({ el: spans[i], dx: (rnd() - 0.5) * 120, rot: (rnd() - 0.5) * 70, drop: 140 + rnd() * 120, f: -1, shard: null });
    });
    var fluff = [];
    groups.forEach(function (g, s) {
      var w0 = STAGES[s][0], w1 = STAGES[s][1], n = g.length;
      g.forEach(function (tok, k) {
        tok.start = w0 + (w1 - w0) * 0.55 * (n > 1 ? k / (n - 1) : 0);
        tok.dur = (w1 - w0) * 0.45;
        fluff.push(tok);
      });
    });

    var PHASES = [
      'Jawaban biasa, apa adanya.',
      'Basa-basi pembuka rontok.',
      'Doa penutup ikut rontok.',
      'Sapaan dan ragu-ragu.',
      'Kata kosong yang tidak menambah isi.',
      'Basa-basinya saja ' + nf0.format(D.fluffCount) + ' token.',
      'Lalu ditulis padat dari awal.',
      'Isinya sama. Kode tetap utuh.'
    ];
    function phaseAt(p) {
      if (p < STAGES[0][0]) return 0;
      for (var s = 0; s < STAGES.length; s++) if (p < STAGES[s][1]) return s + 1;
      if (p < SWAP[0]) return 5;
      if (p < SWAP[1]) return 6;
      return 7;
    }

    function dropShard(tok) { if (tok.shard) { tok.shard.remove(); tok.shard = null; } }
    function makeShard(tok) {
      var r = tok.el.getClientRects()[0], b = body.getBoundingClientRect();
      if (!r) return null;
      var sh = document.createElement('span');
      sh.className = 'tok-shard';
      sh.setAttribute('aria-hidden', 'true');
      sh.textContent = tok.el.textContent;
      sh.style.left = (r.left - b.left) + 'px';
      sh.style.top = (r.top - b.top) + 'px';
      body.appendChild(sh);
      return sh;
    }

    var last = -1, lastPhase = -1;
    function render(p) {
      var removed = 0, falling = 0, motion = 0;
      var swapM = smooth((p - SWAP[0]) / (SWAP[1] - SWAP[0]));

      for (var i = 0; i < fluff.length; i++) {
        var tok = fluff[i];
        var f = clamp01((p - tok.start) / tok.dur);
        if (f >= CRACK) removed++;
        if (f === tok.f) { if (f > 0 && f < 1) falling++; continue; }
        tok.f = f;
        tok.el.classList.toggle('is-cracking', f > 0 && f < CRACK);
        tok.el.classList.toggle('is-gone', f >= CRACK);
        if (reduce || f < CRACK || f >= 1 || swapM > 0.5) { dropShard(tok); continue; }
        if (!tok.shard) tok.shard = makeShard(tok);
        if (!tok.shard) continue;
        var g = (f - CRACK) / (1 - CRACK), e = g * g;
        tok.shard.style.transform = 'translate3d(' + (tok.dx * g).toFixed(1) + 'px,' + (tok.drop * e).toFixed(1) + 'px,0) rotate(' + (tok.rot * g).toFixed(1) + 'deg)';
        tok.shard.style.opacity = (1 - g).toFixed(3);
        falling++; motion += g;
      }

      // Counter: 160 minus what broke off, then down to the real irit reply.
      var afterChisel = D.normalCount - removed;
      var count = p < SWAP[0] ? afterChisel : Math.round(D.afterChisel + (D.singkat.length - D.afterChisel) * swapM);
      numEl.textContent = nf0.format(count);

      normalP.style.opacity = (1 - swapM).toFixed(3);
      normalP.style.transform = reduce ? 'none' : 'translate3d(0,' + (-swapM * 24).toFixed(1) + 'px,0)';
      iritP.style.opacity = swapM > 0 ? '1' : '0';
      var n = iritSpans.length;
      for (var k = 0; k < n; k++) iritSpans[k].style.opacity = clamp01(swapM * 1.7 - (k / n) * 0.7).toFixed(3);

      var ph = phaseAt(p);
      if (ph !== lastPhase) { phaseEl.textContent = PHASES[ph]; lastPhase = ph; }
      stage.setAttribute('data-phase', swapM >= 1 ? 'irit' : 'normal');
      stage.setAttribute('data-sc-verify-state', count + '|' + ph + '|' + swapM.toFixed(2) + '|' + falling + '|' + motion.toFixed(1));
    }

    function frame() {
      var p = parseFloat(act.style.getPropertyValue('--sc-p'));
      if (!isNaN(p) && p !== last) { last = p; render(p); }
      requestAnimationFrame(frame);
    }
    addEventListener('resize', function () { fluff.forEach(function (t) { dropShard(t); t.f = -1; }); last = -1; });
    render(0);
    requestAnimationFrame(frame);
  }

  /* ---------------------------------------------------------------- copy -- */
  function initCopy() {
    var status = document.querySelector('[data-copy-status]');
    Array.prototype.forEach.call(document.querySelectorAll('[data-copy]'), function (btn) {
      var label = btn.textContent, timer;
      btn.addEventListener('click', function () {
        var text = btn.getAttribute('data-copy');
        var done = function () {
          btn.textContent = 'Tersalin';
          btn.setAttribute('data-done', '');
          if (status) status.textContent = 'Perintah disalin: ' + text;
          clearTimeout(timer);
          timer = setTimeout(function () { btn.textContent = label; btn.removeAttribute('data-done'); }, 1800);
        };
        if (navigator.clipboard && window.isSecureContext) {
          navigator.clipboard.writeText(text).then(done, function () { selectCode(btn); });
        } else {
          selectCode(btn);
        }
      });
    });
    // Fallback: select the command so the visitor can copy it by hand. No false "Tersalin".
    function selectCode(btn) {
      var code = btn.parentNode.querySelector('code');
      var r = document.createRange(); r.selectNodeContents(code);
      var sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      if (status) status.textContent = 'Perintah sudah dipilih. Tekan Ctrl+C atau Cmd+C untuk menyalin.';
    }
  }

  /* ------------------------------------------------------- hero mark fit -- */
  // The wordmark is sized from the viewport width (39vw, 46vw on phones). On a
  // short or very wide window that runs it into the headline. Fit it on its
  // INK, not its font box: the font box carries a deep empty band below the
  // baseline, which is what made the old size overlap. Lift the word until its
  // baseline clears the headline; the empty band above may leave the screen,
  // the letters (the dots on the i's included) may not. Shrink only if the
  // letters themselves do not fit between the top edge and the headline.
  var inkCtx = document.createElement('canvas').getContext('2d');
  function inkMetrics(el, fs) {
    var cs = getComputedStyle(el);
    inkCtx.font = cs.fontWeight + ' ' + fs + 'px ' + cs.fontFamily;
    var m = inkCtx.measureText(el.textContent.trim());
    return { asc: m.actualBoundingBoxAscent, desc: m.actualBoundingBoxDescent };
  }
  function fitMark() {
    var mark = document.querySelector('.hero__mark');
    var copy = document.querySelector('.hero__copy');
    var stage = document.querySelector('.hero__stage');
    if (!mark || !copy || !stage) return;
    var small = matchMedia('(max-width: 860px)').matches;
    var vw = document.documentElement.clientWidth, vh = stage.clientHeight;
    var fs = (small ? 0.46 : 0.39) * vw;

    mark.style.setProperty('--mark-fs', fs.toFixed(1) + 'px');
    mark.style.setProperty('--mark-shift', '0');
    mark.style.scale = '1';
    var st = stage.getBoundingClientRect().top;
    var top = mark.getBoundingClientRect().top - st;
    var probe = document.createElement('span');          // zero-height box sitting on the baseline
    probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
    mark.appendChild(probe);
    var base = probe.getBoundingClientRect().bottom - st;
    probe.remove();
    mark.style.scale = '';
    var ink = inkMetrics(mark, fs);
    var inkTop = base - ink.asc, inkBottom = base + ink.desc;

    var edge = Math.max(12, vh * 0.025);                  // letters keep this much air at the top
    var limit = copy.getBoundingClientRect().top - st - Math.max(16, vh * 0.03);
    var k = Math.min(1, (limit - edge) / (inkBottom - inkTop));
    // Scaled about the element top: offsets from `top` grow by k.
    var shift = Math.max(0, top + (inkBottom - top) * k - limit);
    mark.style.setProperty('--mark-fs', (fs * k).toFixed(1) + 'px');
    mark.style.setProperty('--mark-shift', shift.toFixed(1));
  }

  /* --------------------------------------------------------------- theme -- */
  // The head script set the first theme. Here: the switch, following the
  // system until the visitor picks, and the light-mode canvas drift.
  function initTheme() {
    var root = document.documentElement;
    var btn = document.querySelector('[data-theme-toggle]');
    var meta = document.querySelector('meta[name="theme-color"]');
    var sys = matchMedia('(prefers-color-scheme: light)');
    var lastCanvas = null;
    function saved() { try { return localStorage.getItem('irit-theme'); } catch (e) { return null; } }
    function apply(t) {
      root.setAttribute('data-theme', t);
      btn.querySelector('.theme__label').textContent = t === 'light' ? 'Mode gelap' : 'Mode terang';
      if (meta) meta.setAttribute('content', t === 'light' ? '#f3efe9' : '#0c0c0d');
      lastCanvas = null;
    }
    if (!btn) return;
    apply(root.getAttribute('data-theme') === 'light' ? 'light' : 'dark');

    btn.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      try { localStorage.setItem('irit-theme', next); } catch (e) {}
      if (reduce || !document.startViewTransition) { apply(next); return; }
      var r = btn.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      var R = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      document.startViewTransition(function () { apply(next); }).ready.then(function () {
        root.animate({ clipPath: ['circle(0px at ' + x + 'px ' + y + 'px)', 'circle(' + R + 'px at ' + x + 'px ' + y + 'px)'] },
          { duration: 620, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)', pseudoElement: '::view-transition-new(root)' });
      });
    });
    sys.addEventListener('change', function (e) {
      var s = saved();
      if (s !== 'light' && s !== 'dark') apply(e.matches ? 'light' : 'dark');
    });

    // The engine interpolates --sc-canvas between the dark act colours. Mirror
    // that offset onto paper: a slightly warmer, darker act stays one on paper.
    var BASE = [12, 12, 13], PAPER = [243, 239, 233];
    (function drift() {
      if (root.getAttribute('data-theme') === 'light') {
        var c = root.style.getPropertyValue('--sc-canvas');
        if (c !== lastCanvas) {
          lastCanvas = c;
          var m = c.match(/\d+/g);
          if (m && m.length >= 3) {
            var d = [m[0] - BASE[0], m[1] - BASE[1], m[2] - BASE[2]], avg = (d[0] + d[1] + d[2]) / 3;
            root.style.setProperty('--canvas-light', 'rgb(' + [0, 1, 2].map(function (i) {
              return Math.round(PAPER[i] - avg * 1.6 + (d[i] - avg));
            }).join(',') + ')');
          }
        }
      }
      requestAnimationFrame(drift);
    })();
  }

  initTheme();
  fitMark();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitMark);
  var fitTimer;
  addEventListener('resize', function () { clearTimeout(fitTimer); fitTimer = setTimeout(fitMark, 80); });

  fillNumbers();
  initChisel();
  initCopy();
})();
