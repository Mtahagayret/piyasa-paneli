/* Piyasa Paneli — kişisel finans terminali
 * Canlı veri: Binance (kripto, USDT/TRY, EUR/USDT, PAXG) + Finnhub (ABD hisseleri, anahtar gerekli)
 * Günlük veri: data.json (BIST, kapanışlar, haberler, takvim) — her iş günü güncellenir
 * Kişisel veri (izleme listesi, portföy, notlar, API anahtarı): tarayıcının localStorage'ı
 */
(() => {
  'use strict';

  // ---------- Varlık kataloğu ----------
  const CATALOG = {
    NVDA:   { name: 'Nvidia', type: 'us', cur: 'USD' },
    AAPL:   { name: 'Apple', type: 'us', cur: 'USD' },
    TSLA:   { name: 'Tesla', type: 'us', cur: 'USD' },
    MSFT:   { name: 'Microsoft', type: 'us', cur: 'USD' },
    THYAO:  { name: 'Türk Hava Yolları', type: 'bist', cur: 'TRY' },
    ASELS:  { name: 'Aselsan', type: 'bist', cur: 'TRY' },
    BIMAS:  { name: 'BİM', type: 'bist', cur: 'TRY' },
    TUPRS:  { name: 'Tüpraş', type: 'bist', cur: 'TRY' },
    KCHOL:  { name: 'Koç Holding', type: 'bist', cur: 'TRY' },
    AKBNK:  { name: 'Akbank', type: 'bist', cur: 'TRY' },
    BTC:    { name: 'Bitcoin', type: 'crypto', cur: 'USD', bin: 'BTCUSDT' },
    ETH:    { name: 'Ethereum', type: 'crypto', cur: 'USD', bin: 'ETHUSDT' },
    XAUUSD: { name: 'Ons altın', type: 'gold', cur: 'USD', bin: 'PAXGUSDT', hint: 'PAXG bazlı' },
    GAUTRY: { name: 'Gram altın', type: 'gold', cur: 'TRY', derived: true, hint: 'ons × kur' },
    USDTRY: { name: 'Dolar/TL', type: 'fx', cur: 'TRY', bin: 'USDTTRY', hint: 'USDT bazlı' },
    EURTRY: { name: 'Euro/TL', type: 'fx', cur: 'TRY', derived: true },
    OIL:    { name: 'Petrol (USO fonu)', type: 'us', cur: 'USD', fh: 'USO' },
  };
  const PROXIES = { SPY: 'S&P 500', QQQ: 'Nasdaq', DIA: 'Dow Jones' };
  const BIN_AUX = ['PAXGUSDT', 'USDTTRY', 'EURUSDT'];
  const TYPE_LABEL = { us: 'ABD', bist: 'BIST', crypto: 'Kripto', gold: 'Altın', fx: 'Döviz' };
  const DEFAULT_WATCH = ['NVDA', 'AAPL', 'TSLA', 'MSFT', 'THYAO', 'ASELS', 'BIMAS', 'TUPRS', 'BTC', 'ETH', 'XAUUSD', 'GAUTRY', 'OIL'];
  const OZ = 31.1035;

  // ---------- Kalıcı durum ----------
  const STORE_KEY = 'piyasaPaneli.v1';
  const state = loadState();
  function loadState() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch (e) { s = {}; }
    return {
      watch: Array.isArray(s.watch) ? s.watch : DEFAULT_WATCH.slice(),
      custom: s.custom || {},          // kullanıcının eklediği varlıklar
      portfolio: Array.isArray(s.portfolio) ? s.portfolio : [],
      notes: s.notes || {},
      finnhubKey: s.finnhubKey || '',
    };
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (e) { toast('Kaydedilemedi: tarayıcı depolaması kapalı olabilir'); }
  }
  const inst = (id) => CATALOG[id] || state.custom[id] || { name: id, type: 'us', cur: 'USD' };
  const allIds = () => Array.from(new Set([...Object.keys(CATALOG), ...Object.keys(state.custom)]));

  // ---------- Fiyat deposu ----------
  const live = {};   // id -> {price, prev, changePct, hist:[], ts, src}
  let daily = null;  // data.json
  const dirty = new Set();
  const lastShown = {};

  function setLive(id, price, prev, src) {
    if (!isFinite(price) || price <= 0) return;
    const L = live[id] || (live[id] = { hist: [] });
    L.price = price;
    if (isFinite(prev) && prev > 0) L.prev = prev;
    L.changePct = L.prev ? (price - L.prev) / L.prev * 100 : null;
    L.ts = Date.now(); L.src = src;
    const h = L.hist, now = Date.now();
    if (!h.length || now - h[h.length - 1].t > 4000) { h.push({ t: now, v: price }); if (h.length > 150) h.shift(); }
    else h[h.length - 1].v = price;
    dirty.add(id);
  }

  function quote(id) {
    const L = live[id];
    if (L && L.price) return { price: L.price, changePct: L.changePct, live: true, hist: L.hist };
    const d = daily && daily.quotes && daily.quotes[id];
    if (d && d.price != null) return { price: d.price, changePct: d.changePct, live: false, asOf: d.asOf, hist: [] };
    return null;
  }

  // ---------- Binance (kripto + kur + altın) ----------
  let binWs = null, binRetry = 0;
  function binSymbols() {
    const set = new Set(BIN_AUX);
    allIds().forEach(id => { const i = inst(id); if (i.bin) set.add(i.bin); });
    return Array.from(set);
  }
  const binMap = {}; // BINSYM -> {c, o}
  function onBinTick(sym, c, o) {
    binMap[sym] = { c, o };
    allIds().forEach(id => { const i = inst(id); if (i.bin === sym) setLive(id, c, o, 'binance'); });
    const p = binMap.PAXGUSDT, u = binMap.USDTTRY, e = binMap.EURUSDT;
    if (p && u) setLive('GAUTRY', p.c * u.c / OZ, p.o * u.o / OZ, 'binance');
    if (e && u) setLive('EURTRY', e.c * u.c, e.o * u.o, 'binance');
  }
  async function binSnapshot() {
    const syms = binSymbols();
    const qs = encodeURIComponent(JSON.stringify(syms));
    for (const host of ['https://api.binance.com', 'https://data-api.binance.vision']) {
      try {
        const r = await fetch(`${host}/api/v3/ticker/24hr?symbols=${qs}`);
        if (!r.ok) continue;
        const arr = await r.json();
        arr.forEach(t => onBinTick(t.symbol, +t.lastPrice, +t.openPrice));
        return true;
      } catch (e) { /* sıradaki host */ }
    }
    return false;
  }
  function binConnect() {
    if (binWs) { try { binWs.onclose = null; binWs.close(); } catch (e) {} }
    const streams = binSymbols().map(s => s.toLowerCase() + '@ticker').join('/');
    setDot('dotBinance', 'wait');
    try { binWs = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`); }
    catch (e) { setDot('dotBinance', 'off'); return; }
    binWs.onopen = () => { binRetry = 0; setDot('dotBinance', 'on'); };
    binWs.onmessage = (ev) => {
      try { const d = JSON.parse(ev.data).data; if (d && d.s) onBinTick(d.s, +d.c, +d.o); } catch (e) {}
    };
    binWs.onclose = () => {
      setDot('dotBinance', 'off');
      binRetry = Math.min(binRetry + 1, 6);
      setTimeout(binConnect, 1000 * 2 ** binRetry);
    };
    binWs.onerror = () => { try { binWs.close(); } catch (e) {} };
  }

  // ---------- Finnhub (ABD hisseleri) ----------
  let fhWs = null, fhRetry = 0;
  const fhPrev = {}; // ticker -> önceki kapanış
  function fhTickers() {
    const set = new Set(Object.keys(PROXIES));
    allIds().forEach(id => { const i = inst(id); if (i.type === 'us') set.add(i.fh || id); });
    return Array.from(set);
  }
  function idsForTicker(t) {
    const out = allIds().filter(id => { const i = inst(id); return i.type === 'us' && (i.fh || id) === t; });
    if (PROXIES[t]) out.push(t);
    return out;
  }
  async function fhQuotes() {
    if (!state.finnhubKey) return;
    let ok = 0, netFail = 0, n = 0;
    for (const t of fhTickers()) {
      n++;
      try {
        const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(t)}&token=${encodeURIComponent(state.finnhubKey)}`);
        if (r.status === 401 || r.status === 403) { setDot('dotFinnhub', 'off'); toast('Finnhub anahtarı geçersiz görünüyor'); return; }
        if (!r.ok) continue;
        const q = await r.json();
        if (q && q.c > 0) { fhPrev[t] = q.pc; idsForTicker(t).forEach(id => setLive(id, q.c, q.pc, 'finnhub')); ok++; }
      } catch (e) { netFail++; }
    }
    if (n && netFail === n) {
      setDot('dotFinnhub', 'off');
      toast(location.hostname.endsWith('claude.ai') || location.hostname.includes('claudeusercontent')
        ? 'Önizlemede canlı veri çalışmaz; GitHub sürümünü kullan'
        : 'Finnhub\'a ulaşılamadı (reklam engelleyici veya ağ engeli olabilir)');
    }
    if (ok && (!fhWs || fhWs.readyState !== 1)) setDot('dotFinnhub', 'wait');
  }
  function fhConnect() {
    if (fhWs) { try { fhWs.onclose = null; fhWs.close(); } catch (e) {} fhWs = null; }
    if (!state.finnhubKey) { setDot('dotFinnhub', 'off'); return; }
    try { fhWs = new WebSocket(`wss://ws.finnhub.io?token=${encodeURIComponent(state.finnhubKey)}`); }
    catch (e) { return; }
    fhWs.onopen = () => {
      fhRetry = 0; setDot('dotFinnhub', 'on');
      fhTickers().forEach(t => fhWs.send(JSON.stringify({ type: 'subscribe', symbol: t })));
    };
    fhWs.onmessage = (ev) => {
      try {
        const m = JSON.parse(ev.data);
        if (m.type !== 'trade' || !m.data) return;
        const lastBy = {};
        m.data.forEach(tr => { lastBy[tr.s] = tr.p; });
        Object.entries(lastBy).forEach(([t, p]) => idsForTicker(t).forEach(id => setLive(id, p, fhPrev[t], 'finnhub')));
      } catch (e) {}
    };
    fhWs.onclose = () => {
      setDot('dotFinnhub', 'off');
      fhRetry = Math.min(fhRetry + 1, 6);
      setTimeout(fhConnect, 1500 * 2 ** fhRetry);
    };
    fhWs.onerror = () => { try { fhWs.close(); } catch (e) {} };
  }
  function restartFeeds() { binSnapshot(); binConnect(); fhQuotes().then(fhConnect); }

  // ---------- Günlük veri ----------
  let dailyLoadedOnce = false;
  async function loadDaily() {
    try {
      const r = await fetch('data.json?t=' + Date.now());
      daily = await r.json();
      $('#updLabel').textContent = 'Günlük veri: ' + (daily.updatedLabel || '—');
      Object.keys(daily.quotes || {}).forEach(id => dirty.add(id));
      // Form/not yazarken ekranı sıfırlamamak için sadece okuma sayfalarını baştan çiz
      if (!dailyLoadedOnce || ['ozet', 'haberler', 'takvim'].includes(current)) renderView();
      dailyLoadedOnce = true;
    } catch (e) {
      $('#updLabel').textContent = 'Günlük veri yüklenemedi';
    }
  }

  // ---------- Yardımcılar ----------
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function fmt(n, dec) {
    if (n == null || !isFinite(n)) return '—';
    if (dec == null) dec = Math.abs(n) >= 1 ? 2 : 4;
    return n.toLocaleString('tr-TR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }
  const curSym = (c) => c === 'TRY' ? '₺' : c === 'USD' ? '$' : '';
  const money = (n, c, dec) => n == null || !isFinite(n) ? '—' : (c === 'TRY' ? fmt(n, dec) + ' ₺' : curSym(c) + fmt(n, dec));
  function chg(p) {
    if (p == null || !isFinite(p)) return '<span class="chg">—</span>';
    const cls = p > 0 ? 'up' : p < 0 ? 'down' : '';
    return `<span class="chg ${cls}">${p > 0 ? '+' : ''}${fmt(p, 2)}%</span>`;
  }
  function spark(hist, w = 90, h = 26) {
    if (!hist || hist.length < 2) return `<svg class="spark" width="${w}" height="${h}"><line x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}" stroke="rgba(160,190,230,.25)" stroke-dasharray="3 3"/></svg>`;
    const vs = hist.map(p => p.v), mn = Math.min(...vs), mx = Math.max(...vs), rg = mx - mn || 1;
    const pts = vs.map((v, i) => `${(i / (vs.length - 1) * w).toFixed(1)},${(h - 2 - (v - mn) / rg * (h - 4)).toFixed(1)}`).join(' ');
    const col = vs[vs.length - 1] >= vs[0] ? 'var(--up)' : 'var(--down)';
    return `<svg class="spark" width="${w}" height="${h}"><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  }
  function flashCls(id, price) {
    const prev = lastShown[id]; lastShown[id] = price;
    if (prev == null || price == null || prev === price) return '';
    return price > prev ? 'flash-up' : 'flash-down';
  }
  let toastT;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600);
  }
  function setDot(id, st) { const d = document.getElementById(id); if (d) d.className = 'dot ' + st; }
  const keyNotice = () => state.finnhubKey ? '' :
    `<div class="notice">ABD hisselerinin canlı akması için ücretsiz bir Finnhub anahtarı gerekiyor. <a href="#ayarlar">Ayarlar</a> sayfasından 1 dakikada ekleyebilirsin.</div>`;

  // ---------- Görünümler ----------
  const VIEWS = {
    ozet:     { title: 'Günlük Özet', render: renderOzet, refresh: refreshOzet },
    izleme:   { title: 'İzleme Listesi', render: renderIzleme, refresh: refreshIzleme },
    haberler: { title: 'Haberler', render: renderHaberler },
    portfoy:  { title: 'Portföyüm', render: renderPortfoy, refresh: refreshPortfoy },
    takvim:   { title: 'Ekonomik Takvim', render: renderTakvim },
    notlar:   { title: 'Notlarım', render: renderNotlar },
    ayarlar:  { title: 'Ayarlar', render: renderAyarlar },
  };
  let current = 'ozet';

  function renderView() {
    const v = VIEWS[current];
    $('#viewTitle').textContent = v.title;
    document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.view === current));
    v.render($('#view'));
  }
  function route() {
    const h = (location.hash || '').replace('#', '');
    current = VIEWS[h] ? h : 'ozet';
    document.body.classList.remove('menu-open');
    renderView();
    window.scrollTo(0, 0);
  }

  // --- Özet ---
  function tile(id, opts = {}) {
    const i = inst(id), q = quote(id);
    const val = q ? (i.type === 'fx' ? fmt(q.price, 4) : money(q.price, i.cur)) : '—';
    const badge = q && q.live ? '<span class="badge live">canlı</span>' : (q && q.asOf ? `<span class="badge">${esc(q.asOf)}</span>` : '');
    return `<div class="card tile ${q ? flashCls('t_' + id, q.price) : ''}">
      <div class="t-name"><span>${esc(opts.name || i.name)}</span>${badge}</div>
      <div class="t-val">${val}</div>
      <div class="t-sub">${q ? chg(q.changePct) : ''} ${i.hint ? '· ' + esc(i.hint) : ''}${q && q.live && i.type === 'crypto' ? ' · 24s' : ''}</div>
    </div>`;
  }
  function indexTile(m) {
    const px = m.proxy && live[m.proxy];
    let val = fmt(m.value), pct = m.changePct, badge = `<span class="badge">${esc(m.asOf || '')}</span>`, sub = '';
    if (px && px.changePct != null) {
      // Önceki kapanış × fonun anlık değişimi ≈ endeksin anlık seviyesi
      val = '≈ ' + fmt(m.value * (1 + px.changePct / 100));
      pct = px.changePct;
      badge = '<span class="badge live">canlı</span>';
      sub = ` · ${esc(m.proxy)} fonu bazlı`;
    }
    return `<div class="card tile ${flashCls('i_' + m.id, val)}">
      <div class="t-name"><span>${esc(m.name)}</span>${badge}</div>
      <div class="t-val">${val}</div>
      <div class="t-sub">${chg(pct)}${sub}</div></div>`;
  }
  function renderOzet(el) {
    if (!daily) { el.innerHTML = '<div class="empty">Veriler yükleniyor…</div>'; return; }
    const s = daily.summary || {};
    el.innerHTML = `
      ${keyNotice()}
      <div class="card section">
        <div class="section-title">Günün hikâyesi · ${esc(daily.updatedLabel || '')}</div>
        <p class="headline">${esc(s.headline || '')}</p>
        <p class="lead">${esc(s.text || '')}</p>
      </div>
      <div id="ozDyn"></div>
      <div class="section">
        <div class="section-title">${esc(s.moversTitle || 'Öne çıkanlar')}</div>
        <div class="movers">
          <div class="card"><h2>▲ Yükselenler</h2>${(s.movers?.up || []).map(m => `<div class="mv-row"><span class="sym">${esc(m.sym)}</span><span>${fmt(m.price)} ₺ &nbsp;${chg(m.changePct)}</span></div>`).join('')}</div>
          <div class="card"><h2>▼ Düşenler</h2>${(s.movers?.down || []).map(m => `<div class="mv-row"><span class="sym">${esc(m.sym)}</span><span>${fmt(m.price)} ₺ &nbsp;${chg(m.changePct)}</span></div>`).join('')}</div>
        </div>
      </div>`;
    refreshOzet();
  }
  function refreshOzet() {
    const box = $('#ozDyn'); if (!box || !daily) return;
    const mk = daily.summary?.markets || [];
    box.innerHTML = `
      <div class="section"><div class="section-title">Endeksler</div>
        <div class="grid g-tiles">${mk.map(indexTile).join('')}</div></div>
      <div class="section"><div class="section-title">Döviz ve altın</div>
        <div class="grid g-tiles">${['USDTRY', 'EURTRY', 'XAUUSD', 'GAUTRY'].map(id => tile(id)).join('')}</div></div>
      <div class="section"><div class="section-title">Kripto ve emtia</div>
        <div class="grid g-tiles">${['BTC', 'ETH', 'OIL'].map(id => tile(id)).join('')}</div></div>`;
  }

  // --- İzleme listesi ---
  function renderIzleme(el) {
    el.innerHTML = `
      ${keyNotice()}
      <div class="card section"><div class="tbl-wrap" id="wlTable"></div></div>
      <div class="card">
        <h2>Listeye ekle</h2>
        <form class="form" id="wlForm">
          <label class="field">Piyasa
            <select id="wlType">
              <option value="us">ABD hissesi / fonu (ör. AMZN)</option>
              <option value="crypto">Kripto (ör. SOL)</option>
              <option value="bist">BIST hissesi (ör. KCHOL)</option>
            </select></label>
          <label class="field">Sembol <input id="wlSym" placeholder="AMZN" maxlength="12" required></label>
          <label class="field">Ad (opsiyonel) <input id="wlName" placeholder="Amazon" maxlength="40"></label>
          <button class="btn" type="submit">Ekle</button>
        </form>
        <p class="note-hint" style="margin:10px 0 0">BIST hisseleri ücretsiz canlı yayında olmadığı için günlük kapanışla güncellenir. Yeni eklediğin BIST hissesi bir sonraki günlük güncellemede dolar.</p>
      </div>`;
    $('#wlForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const type = $('#wlType').value;
      let sym = $('#wlSym').value.trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, '');
      if (!sym) return;
      if (type === 'crypto') sym = sym.replace(/USDT$/, '');
      const id = sym;
      if (!CATALOG[id] && !state.custom[id]) {
        const def = { name: $('#wlName').value.trim() || sym, type, cur: type === 'bist' ? 'TRY' : 'USD' };
        if (type === 'crypto') def.bin = sym + 'USDT';
        state.custom[id] = def;
      }
      if (!state.watch.includes(id)) state.watch.push(id);
      save(); toast(`${sym} listeye eklendi`);
      $('#wlSym').value = ''; $('#wlName').value = '';
      restartFeeds(); refreshIzleme();
    });
    $('#wlTable').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]'); if (!b) return;
      const id = b.dataset.id;
      if (b.dataset.act === 'rm') { state.watch = state.watch.filter(x => x !== id); save(); refreshIzleme(); toast(`${id} listeden çıkarıldı`); }
      if (b.dataset.act === 'up' || b.dataset.act === 'down') {
        const i = state.watch.indexOf(id), j = i + (b.dataset.act === 'up' ? -1 : 1);
        if (j >= 0 && j < state.watch.length) { [state.watch[i], state.watch[j]] = [state.watch[j], state.watch[i]]; save(); refreshIzleme(); }
      }
      if (b.dataset.act === 'note') { noteSel = id; location.hash = 'notlar'; }
    });
    refreshIzleme();
  }
  function refreshIzleme() {
    const box = $('#wlTable'); if (!box) return;
    if (!state.watch.length) { box.innerHTML = '<div class="empty">Listen boş. Aşağıdan varlık ekleyebilirsin.</div>'; return; }
    box.innerHTML = `<table class="tbl"><thead><tr>
        <th>Varlık</th><th class="hide-m">Piyasa</th><th class="num">Fiyat</th><th class="num">Değişim</th><th class="hide-m">Seyir (oturum)</th><th></th>
      </tr></thead><tbody>${state.watch.map(id => {
        const i = inst(id), q = quote(id);
        const status = q ? (q.live ? '<span class="badge live">canlı</span>' : `<span class="badge">${esc(q.asOf || 'günlük')}</span>`)
          : (i.type === 'us' && !state.finnhubKey ? '<span class="badge gold">anahtar gerekli</span>' : '<span class="badge">bekleniyor</span>');
        const hasNote = state.notes[id] ? ' ✎' : '';
        return `<tr>
          <td><div class="sym">${esc(id)}<span class="muted">${hasNote}</span></div><div class="sub">${esc(i.name)}</div></td>
          <td class="hide-m"><span class="flag">${TYPE_LABEL[i.type] || ''}</span>${status}</td>
          <td class="num ${q ? flashCls('w_' + id, q.price) : ''}">${q ? (i.type === 'fx' ? fmt(q.price, 4) : money(q.price, i.cur)) : '—'}</td>
          <td class="num">${q ? chg(q.changePct) : '—'}</td>
          <td class="hide-m">${spark(q && q.hist)}</td>
          <td class="num"><button class="icon-btn hide-m" data-act="up" data-id="${esc(id)}" title="Yukarı">↑</button><button class="icon-btn hide-m" data-act="down" data-id="${esc(id)}" title="Aşağı">↓</button><button class="icon-btn" data-act="note" data-id="${esc(id)}" title="Not">✎</button><button class="icon-btn" data-act="rm" data-id="${esc(id)}" title="Çıkar">✕</button></td>
        </tr>`;
      }).join('')}</tbody></table>`;
  }

  // --- Haberler ---
  function renderHaberler(el) {
    const n = daily?.news || [];
    el.innerHTML = `<div class="section-title">${esc(daily?.updatedLabel || '')} itibarıyla</div>
      <div class="news">${n.map(x => `
        <article class="card news-item">
          <div class="tag">${esc(x.tag)}</div>
          <h3>${esc(x.title)}</h3>
          <p>${esc(x.text)}</p>
          <div class="why"><b>Neden önemli?</b> ${esc(x.why)}</div>
          ${x.url ? `<a class="src" href="${esc(x.url)}" target="_blank" rel="noopener">Kaynak: ${esc(x.source || 'bağlantı')} ↗</a>` : ''}
        </article>`).join('') || '<div class="empty">Haber yok.</div>'}</div>`;
  }

  // --- Portföy ---
  function pfCalc() {
    const usd = quote('USDTRY')?.price;
    const rows = state.portfolio.map((h, idx) => {
      const i = inst(h.id), q = quote(h.id);
      const px = q?.price;
      const fxNow = usd;
      const fxBuy = h.fxBuy || usd;
      let valTRY = null, valUSD = null;
      if (px != null && fxNow) {
        valTRY = i.cur === 'TRY' ? h.qty * px : h.qty * px * fxNow;
        valUSD = valTRY / fxNow;
      }
      const costNative = h.qty * h.cost;
      let costTRY = null, costUSD = null;
      if (fxBuy) {
        costTRY = h.costCur === 'TRY' ? costNative : costNative * fxBuy;
        costUSD = costTRY / fxBuy;
      }
      return { h, idx, i, q, valTRY, valUSD, costTRY, costUSD,
        plTRY: valTRY != null && costTRY != null ? valTRY - costTRY : null,
        plUSD: valUSD != null && costUSD != null ? valUSD - costUSD : null };
    });
    const sum = (k) => rows.reduce((a, r) => a + (r[k] ?? 0), 0);
    return { rows, usd, tot: { valTRY: sum('valTRY'), valUSD: sum('valUSD'), costTRY: sum('costTRY'), costUSD: sum('costUSD') } };
  }
  function renderPortfoy(el) {
    const opts = allIds().filter(id => !PROXIES[id]).map(id => `<option value="${esc(id)}">${esc(id)} — ${esc(inst(id).name)}</option>`).join('');
    el.innerHTML = `
      <div id="pfDyn"></div>
      <div class="card section">
        <h2>Varlık ekle</h2>
        <form class="form" id="pfForm">
          <label class="field">Varlık <select id="pfId">${opts}</select></label>
          <label class="field">Adet / miktar <input id="pfQty" type="number" step="any" min="0" required placeholder="10"></label>
          <label class="field">Ort. alış fiyatı <input id="pfCost" type="number" step="any" min="0" required placeholder="300"></label>
          <label class="field">Alış para birimi <select id="pfCur"><option value="TRY">TL</option><option value="USD">USD</option></select></label>
          <label class="field">Alış günü dolar kuru (ops.) <input id="pfFx" type="number" step="any" min="0" placeholder="ör. 42,20"></label>
          <button class="btn" type="submit">Ekle</button>
        </form>
        <p class="note-hint" style="margin:10px 0 0">Alış günündeki dolar kurunu girersen, TL yatırımlarının <b>dolar bazında gerçek getirisi</b> doğru hesaplanır. Girmezsen bugünkü kur kullanılır. Gram altın için miktar = gram. Listede olmayan bir hisse için önce İzleme Listesi'ne ekle.</p>
      </div>`;
    const sel = $('#pfId');
    const syncCur = () => { $('#pfCur').value = inst(sel.value).cur === 'TRY' ? 'TRY' : 'USD'; };
    sel.addEventListener('change', syncCur); syncCur();
    $('#pfForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const qty = parseFloat($('#pfQty').value), cost = parseFloat($('#pfCost').value);
      const fx = parseFloat(String($('#pfFx').value).replace(',', '.'));
      if (!(qty > 0) || !(cost >= 0)) { toast('Adet ve fiyatı kontrol et'); return; }
      const h = { id: sel.value, qty, cost, costCur: $('#pfCur').value };
      if (fx > 0) h.fxBuy = fx;
      state.portfolio.push(h); save(); toast(`${h.id} portföye eklendi`);
      $('#pfQty').value = ''; $('#pfCost').value = ''; $('#pfFx').value = '';
      restartFeeds(); refreshPortfoy();
    });
    $('#pfDyn').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-rm]'); if (!b) return;
      const idx = +b.dataset.rm, h = state.portfolio[idx];
      if (!h) return;
      state.portfolio.splice(idx, 1); save(); refreshPortfoy(); toast(`${h.id} portföyden silindi`);
    });
    refreshPortfoy();
  }
  const COLORS = ['#D9AE3F', '#5B9BF0', '#34D399', '#F0766B', '#B48CF2', '#4FD1C5', '#F6C177', '#8FA8CC', '#E57AB0', '#9AD36A'];
  function donut(parts) {
    const total = parts.reduce((a, p) => a + p.v, 0);
    if (!total) return '';
    let a0 = -Math.PI / 2; const R = 60, r = 38, c = 70;
    const arcs = parts.map((p, k) => {
      const a1 = a0 + p.v / total * Math.PI * 2;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const pt = (rad, ang) => `${(c + rad * Math.cos(ang)).toFixed(2)} ${(c + rad * Math.sin(ang)).toFixed(2)}`;
      const d = parts.length === 1
        ? `M ${c - R} ${c} A ${R} ${R} 0 1 1 ${c + R} ${c} A ${R} ${R} 0 1 1 ${c - R} ${c} M ${c - r} ${c} A ${r} ${r} 0 1 0 ${c + r} ${c} A ${r} ${r} 0 1 0 ${c - r} ${c}`
        : `M ${pt(R, a0)} A ${R} ${R} 0 ${large} 1 ${pt(R, a1)} L ${pt(r, a1)} A ${r} ${r} 0 ${large} 0 ${pt(r, a0)} Z`;
      a0 = a1;
      return `<path d="${d}" fill="${COLORS[k % COLORS.length]}" fill-rule="evenodd" stroke="#0B1D3A" stroke-width="1.5"/>`;
    }).join('');
    return `<svg width="140" height="140" viewBox="0 0 140 140">${arcs}</svg>`;
  }
  function refreshPortfoy() {
    const box = $('#pfDyn'); if (!box) return;
    if (!state.portfolio.length) {
      box.innerHTML = '<div class="card section empty">Henüz portföyüne varlık eklemedin. Aşağıdaki formdan başlayabilirsin.</div>';
      return;
    }
    const { rows, usd, tot } = pfCalc();
    const plT = tot.valTRY - tot.costTRY, plU = tot.valUSD - tot.costUSD;
    const pct = (a, b) => b ? a / b * 100 : null;
    const byId = {};
    rows.forEach(r => { if (r.valTRY) byId[r.h.id] = (byId[r.h.id] || 0) + r.valTRY; });
    const parts = Object.entries(byId).map(([id, v]) => ({ id, v })).sort((a, b) => b.v - a.v);
    box.innerHTML = `
      <div class="totals section">
        <div class="card tile"><div class="t-name">Toplam değer (TL)</div><div class="t-val">${money(tot.valTRY, 'TRY')}</div><div class="t-sub">Kur: ${fmt(usd, 4)}</div></div>
        <div class="card tile"><div class="t-name">Toplam değer (USD)</div><div class="t-val">${money(tot.valUSD, 'USD')}</div><div class="t-sub">&nbsp;</div></div>
        <div class="card tile"><div class="t-name">Kâr/zarar (TL)</div><div class="t-val ${plT >= 0 ? 'chg up' : 'chg down'}">${plT >= 0 ? '+' : ''}${money(plT, 'TRY')}</div><div class="t-sub">${chg(pct(plT, tot.costTRY))}</div></div>
        <div class="card tile"><div class="t-name">Kâr/zarar (USD) · gerçek getiri</div><div class="t-val ${plU >= 0 ? 'chg up' : 'chg down'}">${plU >= 0 ? '+' : ''}${money(plU, 'USD')}</div><div class="t-sub">${chg(pct(plU, tot.costUSD))}</div></div>
      </div>
      <div class="grid g-2 section">
        <div class="card"><h2>Dağılım</h2><div class="alloc">${donut(parts)}
          <div class="legend">${parts.map((p, k) => `<div><span class="sw" style="background:${COLORS[k % COLORS.length]}"></span>${esc(p.id)} · ${fmt(p.v / tot.valTRY * 100, 1)}%</div>`).join('')}</div></div></div>
        <div class="card"><h2>Piyasa bazında</h2>${Object.entries(rows.reduce((a, r) => { const k = TYPE_LABEL[r.i.type] || 'Diğer'; a[k] = (a[k] || 0) + (r.valTRY || 0); return a; }, {}))
          .sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="mv-row"><span>${k}</span><span class="chg">${money(v, 'TRY', 0)} · ${fmt(v / tot.valTRY * 100, 1)}%</span></div>`).join('')}</div>
      </div>
      <div class="card section"><div class="tbl-wrap"><table class="tbl"><thead><tr>
        <th>Varlık</th><th class="num">Adet</th><th class="num">Ort. alış</th><th class="num">Güncel</th><th class="num">Değer (TL)</th><th class="num hide-m">Değer (USD)</th><th class="num">K/Z (TL)</th><th class="num hide-m">K/Z (USD)</th><th></th>
      </tr></thead><tbody>${rows.map(r => `<tr>
        <td><div class="sym">${esc(r.h.id)}</div><div class="sub">${esc(r.i.name)}${r.q && r.q.live ? ' · canlı' : ''}</div></td>
        <td class="num">${fmt(r.h.qty, r.h.qty % 1 ? 4 : 0)}</td>
        <td class="num">${money(r.h.cost, r.h.costCur)}</td>
        <td class="num ${r.q ? flashCls('p_' + r.idx, r.q.price) : ''}">${r.q ? money(r.q.price, r.i.cur) : '—'}</td>
        <td class="num">${money(r.valTRY, 'TRY')}</td>
        <td class="num hide-m">${money(r.valUSD, 'USD')}</td>
        <td class="num">${r.plTRY == null ? '—' : `<span class="chg ${r.plTRY >= 0 ? 'up' : 'down'}">${r.plTRY >= 0 ? '+' : ''}${fmt(r.plTRY)}</span><div class="sub">${chg(pct(r.plTRY, r.costTRY))}</div>`}</td>
        <td class="num hide-m">${r.plUSD == null ? '—' : `<span class="chg ${r.plUSD >= 0 ? 'up' : 'down'}">${r.plUSD >= 0 ? '+' : ''}${fmt(r.plUSD)}</span><div class="sub">${chg(pct(r.plUSD, r.costUSD))}</div>`}</td>
        <td class="num"><button class="icon-btn" data-rm="${r.idx}" title="Sil">✕</button></td>
      </tr>`).join('')}</tbody></table></div></div>`;
  }

  // --- Takvim ---
  function renderTakvim(el) {
    const items = (daily?.calendar || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.time || '').localeCompare(b.time || ''));
    const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Istanbul' })); today.setHours(0, 0, 0, 0);
    const groups = {};
    items.forEach(x => { const k = x.when || x.date; (groups[k] = groups[k] || []).push(x); });
    const label = (k, x) => {
      if (x.when) return esc(x.when);
      const d = new Date(x.date + 'T00:00:00');
      return d.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
    };
    const until = (x) => {
      if (x.when || !x.date) return '';
      const d = new Date(x.date + 'T00:00:00'), n = Math.round((d - today) / 864e5);
      return n === 0 ? 'bugün' : n === 1 ? 'yarın' : n > 1 ? `${n} gün sonra` : 'geçti';
    };
    const imp = (n) => `<span class="imp">${[1, 2, 3].map(k => k <= n ? '●' : '<span class="off">●</span>').join('')}</span>`;
    el.innerHTML = Object.entries(groups).map(([k, arr]) => `
      <div class="cal-day">
        <div class="cal-date">${label(k, arr[0])} <span class="sub">${until(arr[0])}</span></div>
        ${arr.map(x => `<div class="card cal-item">
          <div class="cal-time">${esc(x.time || '—')}</div>
          <div style="flex:1"><div><span class="flag">${esc(x.country || '')}</span><b>${esc(x.title)}</b></div>
            ${x.note ? `<div class="sub" style="margin-top:4px">${esc(x.note)}</div>` : ''}</div>
          <div>${imp(x.importance || 1)}</div>
        </div>`).join('')}
      </div>`).join('') || '<div class="empty">Takvimde etkinlik yok.</div>';
    el.innerHTML += '<p class="note-hint">Saatler Türkiye saatidir. Önem: ●●● yüksek, ●●○ orta, ●○○ düşük.</p>';
  }

  // --- Notlar ---
  let noteSel = 'GENEL';
  function renderNotlar(el) {
    const ids = ['GENEL', ...new Set([...state.watch, ...state.portfolio.map(h => h.id), ...Object.keys(state.notes).filter(k => k !== 'GENEL')])];
    if (!ids.includes(noteSel)) noteSel = 'GENEL';
    el.innerHTML = `<div class="notes-layout">
      <div class="card note-list" id="noteList">${ids.map(id => `<button data-id="${esc(id)}" class="${id === noteSel ? 'active' : ''}">${id === 'GENEL' ? 'Genel notlar' : esc(id)}${state.notes[id] ? '<span class="has">✎</span>' : ''}</button>`).join('')}</div>
      <div class="card">
        <h2 id="noteTitle"></h2>
        <textarea class="note" id="noteText" placeholder="Bu varlıkla ilgili düşüncelerin, hedef fiyatın, alım-satım gerekçen…"></textarea>
        <div class="note-hint" id="noteStatus">Yazdıkça otomatik kaydedilir.</div>
      </div></div>`;
    $('#noteList').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) selectNote(b.dataset.id); });
    let t;
    $('#noteText').addEventListener('input', (e) => {
      const v = e.target.value;
      clearTimeout(t);
      t = setTimeout(() => {
        if (v.trim()) state.notes[noteSel] = v; else delete state.notes[noteSel];
        save(); $('#noteStatus').textContent = 'Kaydedildi · ' + new Date().toLocaleTimeString('tr-TR');
        const btn = $(`#noteList button[data-id="${CSS.escape(noteSel)}"]`);
        if (btn) btn.innerHTML = (noteSel === 'GENEL' ? 'Genel notlar' : esc(noteSel)) + (v.trim() ? '<span class="has">✎</span>' : '');
      }, 400);
    });
    selectNote(noteSel);
  }
  function selectNote(id) {
    noteSel = id;
    const ta = $('#noteText'); if (!ta) return;
    document.querySelectorAll('#noteList button').forEach(b => b.classList.toggle('active', b.dataset.id === id));
    $('#noteTitle').textContent = id === 'GENEL' ? 'Genel notlar' : `${id} · ${inst(id).name}`;
    ta.value = state.notes[id] || '';
    $('#noteStatus').textContent = 'Yazdıkça otomatik kaydedilir.';
  }

  // --- Ayarlar ---
  function renderAyarlar(el) {
    el.innerHTML = `
      <div class="card section">
        <h2>Finnhub API anahtarı (ABD hisseleri için)</h2>
        <ol class="muted" style="margin:0 0 12px; padding-left:18px">
          <li><a href="https://finnhub.io/register" target="_blank" rel="noopener" style="color:var(--gold)">finnhub.io/register</a> adresinden ücretsiz hesap aç.</li>
          <li>Panelde gördüğün <b>API Key</b>'i kopyala, aşağıya yapıştır.</li>
        </ol>
        <form class="form" id="keyForm">
          <label class="field" style="flex:1; min-width:220px">Anahtar <input id="keyIn" value="${esc(state.finnhubKey)}" placeholder="ör. c1a2b3c4d5..." autocomplete="off"></label>
          <button class="btn" type="submit">Kaydet ve bağlan</button>
        </form>
        <p class="note-hint" style="margin:10px 0 0">Anahtar yalnızca bu tarayıcıda saklanır. Ücretsiz plan kişisel kullanım için yeterli (dakikada 60 istek).</p>
      </div>
      <div class="card section">
        <h2>Yedekleme</h2>
        <p class="note-hint" style="margin-top:0">Portföyün, notların ve izleme listen bu tarayıcıda saklanıyor. Başka bir cihaza taşımak ya da yedeklemek için dışa aktar, diğer cihazda içe aktar.</p>
        <div class="form">
          <button class="btn" id="expBtn" type="button">Dışa aktar (.json)</button>
          <label class="btn ghost" style="cursor:pointer">İçe aktar<input type="file" id="impIn" accept="application/json,.json" hidden></label>
          <button class="btn ghost" id="resetBtn" type="button">İzleme listesini varsayılana döndür</button>
        </div>
      </div>
      <div class="card">
        <h2>Veri kaynakları</h2>
        <div class="mv-row"><span>Kripto, USD/TRY, EUR/TRY, ons ve gram altın</span><span class="muted">Binance · canlı</span></div>
        <div class="mv-row"><span>ABD hisseleri, endeks fonları (SPY, QQQ, DIA), petrol fonu (USO)</span><span class="muted">Finnhub · canlı</span></div>
        <div class="mv-row"><span>BIST, endeks kapanışları, haberler, takvim</span><span class="muted">Günlük güncelleme</span></div>
        <p class="note-hint">Kur ve altın fiyatları kripto borsasındaki USDT ve PAXG paritelerinden hesaplanır. Bankalardaki fiyatlardan bir miktar farklı olabilir. Bu panel bilgi amaçlıdır, yatırım tavsiyesi değildir.</p>
      </div>`;
    $('#keyForm').addEventListener('submit', (e) => {
      e.preventDefault();
      state.finnhubKey = $('#keyIn').value.trim(); save();
      toast(state.finnhubKey ? 'Anahtar kaydedildi, bağlanılıyor…' : 'Anahtar silindi');
      fhQuotes().then(fhConnect);
    });
    $('#expBtn').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'piyasa-paneli-yedek-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    $('#impIn').addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const s = JSON.parse(await f.text());
        ['watch', 'custom', 'portfolio', 'notes', 'finnhubKey'].forEach(k => { if (s[k] !== undefined) state[k] = s[k]; });
        save(); toast('Yedek içe aktarıldı'); restartFeeds(); renderView();
      } catch (err) { toast('Dosya okunamadı'); }
    });
    $('#resetBtn').addEventListener('click', () => { state.watch = DEFAULT_WATCH.slice(); save(); toast('İzleme listesi sıfırlandı'); });
  }

  // ---------- Saat ve piyasa durumu ----------
  function marketOpen(tz, oh, om, ch, cm) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' })
      .formatToParts(new Date()).map(x => [x.type, x.value]));
    if (p.weekday === 'Sat' || p.weekday === 'Sun') return false;
    const m = +p.hour * 60 + +p.minute;
    return m >= oh * 60 + om && m < ch * 60 + cm;
  }
  function tickClock() {
    const t = new Date().toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul' });
    const us = marketOpen('America/New_York', 9, 30, 16, 0), bist = marketOpen('Europe/Istanbul', 10, 0, 18, 0);
    $('#clock').innerHTML = `${t}<span class="mk"> · BIST ${bist ? '<span class="chg up">açık</span>' : 'kapalı'} · ABD ${us ? '<span class="chg up">açık</span>' : 'kapalı'}</span>`;
  }

  // ---------- Arka plan ağı ----------
  function drawNet() {
    const svg = $('#bgNet'), w = innerWidth, h = innerHeight;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const pts = Array.from({ length: Math.round(w * h / 38000) }, () => [rnd() * w, rnd() * h]);
    let out = '';
    pts.forEach((a, i) => pts.slice(i + 1).forEach(b => {
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (d < 190) out += `<line x1="${a[0].toFixed(0)}" y1="${a[1].toFixed(0)}" x2="${b[0].toFixed(0)}" y2="${b[1].toFixed(0)}" stroke="rgba(150,190,240,${(0.12 * (1 - d / 190)).toFixed(3)})" stroke-width="1"/>`;
    }));
    pts.forEach(p => out += `<circle cx="${p[0].toFixed(0)}" cy="${p[1].toFixed(0)}" r="1.6" fill="rgba(180,210,250,.35)"/>`);
    svg.innerHTML = out;
  }

  // ---------- Başlat ----------
  $('#menuBtn').addEventListener('click', () => document.body.classList.toggle('menu-open'));
  $('#scrim').addEventListener('click', () => document.body.classList.remove('menu-open'));
  window.addEventListener('hashchange', route);
  let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(drawNet, 200); });

  drawNet(); tickClock(); setInterval(tickClock, 1000);
  route();
  loadDaily(); setInterval(loadDaily, 10 * 60 * 1000);
  restartFeeds();
  setInterval(fhQuotes, 60 * 1000);
  setInterval(() => {
    if (!dirty.size) return;
    dirty.clear();
    const v = VIEWS[current];
    if (v.refresh && !document.activeElement?.closest?.('#pfDyn')) v.refresh();
  }, 1200);

  // Konsoldan test için
  window.__panel = { state, live, quote, pfCalc, setLive };
})();
