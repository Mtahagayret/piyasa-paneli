/* Piyasa Paneli v2 — kişisel finans terminali
 * Canlı fiyat: Binance (kripto, USDT/TRY, EUR/USDT, PAXG) + Finnhub (ABD, anahtar gerekli)
 * Geçmiş fiyat: Binance klines (kripto/altın/döviz) + Twelve Data (ABD/BIST, anahtar gerekli) + data.json geçmişi (BIST)
 * Temel analiz: Finnhub (ABD) + data.json (BIST)
 * Günlük içerik: data.json (her iş günü güncellenir)
 * Kişisel veri: tarayıcının localStorage'ı
 */
(() => {
  'use strict';

  // ================= Katalog =================
  const CATALOG = {
    NVDA: { name: 'Nvidia', type: 'us', cur: 'USD' },
    AAPL: { name: 'Apple', type: 'us', cur: 'USD' },
    TSLA: { name: 'Tesla', type: 'us', cur: 'USD' },
    MSFT: { name: 'Microsoft', type: 'us', cur: 'USD' },
    BTC: { name: 'Bitcoin', type: 'crypto', cur: 'USD', bin: 'BTCUSDT' },
    ETH: { name: 'Ethereum', type: 'crypto', cur: 'USD', bin: 'ETHUSDT' },
    XAUUSD: { name: 'Ons altın', type: 'gold', cur: 'USD', bin: 'PAXGUSDT', hint: 'PAXG bazlı' },
    GAUTRY: { name: 'Gram altın', type: 'gold', cur: 'TRY', derived: true, hint: 'ons × kur' },
    USDTRY: { name: 'Dolar/TL', type: 'fx', cur: 'TRY', bin: 'USDTTRY', hint: 'USDT bazlı' },
    EURTRY: { name: 'Euro/TL', type: 'fx', cur: 'TRY', derived: true },
    OIL: { name: 'Petrol (USO fonu)', type: 'us', cur: 'USD', fh: 'USO' },
  };
  const BIST = {
    AKBNK: 'Akbank', ALARK: 'Alarko Holding', ARCLK: 'Arçelik', ASELS: 'Aselsan', ASTOR: 'Astor Enerji', BIMAS: 'BİM',
    DOAS: 'Doğuş Otomotiv', EKGYO: 'Emlak Konut', ENKAI: 'Enka İnşaat', EREGL: 'Ereğli Demir Çelik', FROTO: 'Ford Otosan',
    GARAN: 'Garanti BBVA', GUBRF: 'Gübre Fabrikaları', HEKTS: 'Hektaş', ISCTR: 'İş Bankası (C)', KCHOL: 'Koç Holding',
    KOZAL: 'Koza Altın', KRDMD: 'Kardemir (D)', MGROS: 'Migros', PETKM: 'Petkim', PGSUS: 'Pegasus', SAHOL: 'Sabancı Holding',
    SASA: 'Sasa Polyester', SISE: 'Şişecam', TCELL: 'Turkcell', THYAO: 'Türk Hava Yolları', TOASO: 'Tofaş', TTKOM: 'Türk Telekom',
    TUPRS: 'Tüpraş', YKBNK: 'Yapı Kredi',
  };
  Object.entries(BIST).forEach(([k, n]) => { CATALOG[k] = { name: n, type: 'bist', cur: 'TRY' }; });
  const CRYPTO = { SOL: 'Solana', XRP: 'XRP', BNB: 'BNB', ADA: 'Cardano', DOGE: 'Dogecoin', AVAX: 'Avalanche', DOT: 'Polkadot',
    LINK: 'Chainlink', LTC: 'Litecoin', TRX: 'Tron', TON: 'Toncoin', SHIB: 'Shiba Inu', ATOM: 'Cosmos', NEAR: 'Near', ARB: 'Arbitrum', SUI: 'Sui' };
  const PROXIES = { SPY: 'S&P 500', QQQ: 'Nasdaq', DIA: 'Dow Jones' };
  const BIN_AUX = ['PAXGUSDT', 'USDTTRY', 'EURUSDT'];
  const TYPE_LABEL = { us: 'ABD', bist: 'BIST', crypto: 'Kripto', gold: 'Altın', fx: 'Döviz' };
  const DEFAULT_WATCH = ['NVDA', 'AAPL', 'TSLA', 'MSFT', 'THYAO', 'ASELS', 'BIMAS', 'TUPRS', 'BTC', 'ETH', 'XAUUSD', 'GAUTRY', 'OIL'];
  const OZ = 31.1035;

  // ================= Sözlük (ⓘ açıklamaları) =================
  const GLOSSARY = {
    canli: 'Fiyat, borsadan saniye saniye gelen veriyle güncelleniyor.',
    gunluk: 'Bu fiyat son kapanış verisidir. Her iş günü gece güncellenir.',
    h24: 'Kripto 7/24 işlem gördüğü için değişim son 24 saate göre hesaplanır.',
    gram: 'Gram altın = ons altın fiyatı × dolar kuru ÷ 31,1. Bir ons 31,1 gramdır.',
    paxg: 'PAXG, bir ons fiziki altına dayalı bir kripto paradır. Fiyatı ons altını yakından izler, bu yüzden canlı altın fiyatı için kullanıyoruz.',
    usdt: 'USDT, değeri 1 dolara sabitlenmiş bir kripto paradır. USDT/TL kuru, dolar/TL kuruna çok yakındır.',
    proxy: 'Endeksin kendisi ücretsiz canlı yayında yok. Endeksi birebir takip eden fonun (SPY, QQQ, DIA) anlık değişimini dünkü kapanışa uygulayarak yaklaşık değer gösteriyoruz.',
    gercek: 'TL ile alınan bir varlık TL bazında kâr gösterebilir ama dolar da yükseldiyse aslında değer kaybetmiş olabilirsin. Dolar bazında kâr/zarar, enflasyondan arındırılmış gerçek getiriye daha yakındır.',
    ma: 'Hareketli ortalama (MA): Son N günün kapanış fiyatlarının ortalaması. Fiyat ortalamanın üzerindeyse trend yukarı kabul edilir. MA50 orta, MA200 uzun vadeli trendi gösterir.',
    rsi: 'RSI (Göreceli Güç Endeksi): 0-100 arası bir momentum ölçüsü. 70 üzeri "aşırı alım" (çok hızlı yükseldi), 30 altı "aşırı satım" (çok hızlı düştü) sayılır.',
    macd: 'MACD: Kısa ve uzun vadeli ortalamaların farkıdır. Sinyal çizgisini yukarı keserse momentum yukarı, aşağı keserse aşağı dönüyor demektir.',
    bb: 'Bollinger bantları: 20 günlük ortalamanın ±2 standart sapma etrafına çizilen bantlar. Fiyatın normal salınım aralığını gösterir. Bantlar daralırsa sert bir hareket yaklaşıyor olabilir.',
    cross: 'Altın kesişim: MA50\'nin MA200\'ü yukarı kesmesi (olumlu). Ölüm kesişimi: aşağı kesmesi (olumsuz).',
    vol: 'Oynaklık (volatilite): Fiyatın ne kadar sert dalgalandığını gösterir. Yıllık %20 sakin, %60+ çok oynak sayılır.',
    destek: 'Destek: Son 60 günün en düşük seviyesi, fiyatın düşüşte zorlandığı bölge. Direnç: En yüksek seviye, yükselişte zorlandığı bölge.',
    pe: 'F/K (Fiyat/Kazanç): Hisse fiyatı ÷ hisse başına yıllık kâr. "Şirketin bugünkü kârıyla kendini kaç yılda geri öder" gibi düşünebilirsin. Düşükse ucuz, yüksekse pahalı ya da büyüme bekleniyor demektir.',
    pb: 'PD/DD (Piyasa Değeri/Defter Değeri): Piyasanın şirkete biçtiği değer ÷ şirketin muhasebedeki özkaynağı. 1\'in altı, şirketin varlıklarından ucuza satıldığı anlamına gelir.',
    ps: 'F/S (Fiyat/Satış): Piyasa değeri ÷ yıllık satışlar. Henüz kâr etmeyen büyüme şirketlerini değerlemede işe yarar.',
    margin: 'Net kâr marjı: Her 100 birimlik satıştan kaç birimin net kâr olarak kaldığı.',
    roe: 'Özsermaye kârlılığı (ROE): Şirketin ortaklarının parasıyla ne kadar verimli kâr ürettiği. %15-20 üzeri güçlü sayılır.',
    de: 'Borç/Özsermaye: Şirketin borcunun kendi sermayesine oranı. Yüksekse faiz artışlarında şirket zorlanabilir.',
    growth: 'Büyüme: Son 12 ayın bir önceki yılın aynı dönemine göre değişimi.',
    div: 'Temettü verimi: Şirketin yıllık dağıttığı kâr payı ÷ hisse fiyatı.',
    beta: 'Beta: Hissenin piyasaya göre ne kadar oynak olduğu. 1 = piyasa kadar, 1,5 = piyasadan %50 daha oynak.',
    mcap: 'Piyasa değeri: Hisse fiyatı × toplam hisse sayısı, yani şirketin borsadaki toplam değeri.',
    alarm: 'Fiyat alarmı, panel tarayıcıda açıkken çalışır. Hedefe ulaşıldığında ekranda uyarı ve (izin verdiysen) bildirim çıkar.',
  };

  // ================= Kalıcı durum =================
  const STORE_KEY = 'piyasaPaneli.v1';
  const state = loadState();
  function loadState() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch (e) { s = {}; }
    let lists = Array.isArray(s.lists) ? s.lists : null;
    if (!lists) lists = [{ name: 'Ana liste', ids: Array.isArray(s.watch) ? s.watch : DEFAULT_WATCH.slice() }];
    return {
      lists, activeList: Math.min(s.activeList || 0, lists.length - 1),
      custom: s.custom || {}, portfolio: Array.isArray(s.portfolio) ? s.portfolio : [],
      notes: s.notes || {}, finnhubKey: s.finnhubKey || '', tdKey: s.tdKey || '',
      alarms: Array.isArray(s.alarms) ? s.alarms : [], seenTour: !!s.seenTour,
      ind: s.ind || { ma20: false, ma50: true, ma200: true, bb: false },
    };
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (e) { toast('Kaydedilemedi: tarayıcı depolaması dolu ya da kapalı'); }
  }
  const inst = (id) => CATALOG[id] || state.custom[id] || { name: id, type: 'us', cur: 'USD' };
  const watchedIds = () => Array.from(new Set(state.lists.flatMap(l => l.ids)));
  const trackedIds = () => Array.from(new Set([...watchedIds(), ...state.portfolio.map(h => h.id), ...state.alarms.filter(a => a.active).map(a => a.sym),
    'USDTRY', 'EURTRY', 'XAUUSD', 'GAUTRY', 'BTC', 'ETH', 'OIL', ...(detailId ? [detailId] : [])]));
  function ensureInst(id, def) { if (!CATALOG[id] && !state.custom[id] && def) { state.custom[id] = def; save(); } }

  // ================= Fiyat deposu =================
  const live = {};
  let daily = null;
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

  // ================= Binance =================
  let binWs = null, binRetry = 0, binKey = '';
  const binMap = {};
  function binSymbols() {
    const set = new Set(BIN_AUX);
    trackedIds().forEach(id => { const i = inst(id); if (i.bin) set.add(i.bin); });
    return Array.from(set).sort();
  }
  function onBinTick(sym, c, o) {
    binMap[sym] = { c, o };
    trackedIds().forEach(id => { const i = inst(id); if (i.bin === sym) setLive(id, c, o, 'binance'); });
    const p = binMap.PAXGUSDT, u = binMap.USDTTRY, e = binMap.EURUSDT;
    if (p && u) setLive('GAUTRY', p.c * u.c / OZ, p.o * u.o / OZ, 'binance');
    if (e && u) setLive('EURTRY', e.c * u.c, e.o * u.o, 'binance');
  }
  const BIN_HOSTS = ['https://api.binance.com', 'https://data-api.binance.vision'];
  async function binGet(path) {
    for (const h of BIN_HOSTS) {
      try { const r = await fetch(h + path); if (r.ok) return await r.json(); } catch (e) {}
    }
    throw new Error('binance');
  }
  async function binSnapshot() {
    try {
      const arr = await binGet(`/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(binSymbols()))}`);
      arr.forEach(t => onBinTick(t.symbol, +t.lastPrice, +t.openPrice));
    } catch (e) {}
  }
  function binConnect(force) {
    const syms = binSymbols(), key = syms.join(',');
    if (!force && binWs && binWs.readyState <= 1 && key === binKey) return;
    binKey = key;
    if (binWs) { try { binWs.onclose = null; binWs.close(); } catch (e) {} }
    setDot('dotBinance', 'wait');
    try { binWs = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${syms.map(s => s.toLowerCase() + '@ticker').join('/')}`); }
    catch (e) { setDot('dotBinance', 'off'); return; }
    binWs.onopen = () => { binRetry = 0; setDot('dotBinance', 'on'); };
    binWs.onmessage = (ev) => { try { const d = JSON.parse(ev.data).data; if (d && d.s) onBinTick(d.s, +d.c, +d.o); } catch (e) {} };
    binWs.onclose = () => { setDot('dotBinance', 'off'); binRetry = Math.min(binRetry + 1, 6); setTimeout(() => binConnect(true), 1000 * 2 ** binRetry); };
    binWs.onerror = () => { try { binWs.close(); } catch (e) {} };
  }

  // ================= Finnhub =================
  let fhWs = null, fhRetry = 0;
  const fhPrev = {}, fhSubs = new Set();
  function fhTickers() {
    const set = new Set(Object.keys(PROXIES));
    trackedIds().forEach(id => { const i = inst(id); if (i.type === 'us') set.add(i.fh || id); });
    return Array.from(set);
  }
  function idsForTicker(t) {
    const out = trackedIds().filter(id => { const i = inst(id); return i.type === 'us' && (i.fh || id) === t; });
    if (PROXIES[t]) out.push(t);
    return out;
  }
  async function fh(path) {
    const r = await fetch(`https://finnhub.io/api/v1${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(state.finnhubKey)}`);
    if (r.status === 401 || r.status === 403) throw Object.assign(new Error('auth'), { code: r.status });
    if (r.status === 429) throw Object.assign(new Error('limit'), { code: 429 });
    if (!r.ok) throw new Error('http ' + r.status);
    return r.json();
  }
  async function fhQuotes(only) {
    if (!state.finnhubKey) return;
    const list = only || fhTickers();
    let netFail = 0;
    for (const t of list) {
      try {
        const q = await fh(`/quote?symbol=${encodeURIComponent(t)}`);
        if (q && q.c > 0) { fhPrev[t] = q.pc; idsForTicker(t).forEach(id => setLive(id, q.c, q.pc, 'finnhub')); }
      } catch (e) {
        if (e.code === 401) { setDot('dotFinnhub', 'off'); toast('Finnhub anahtarı geçersiz görünüyor'); return; }
        if (!e.code) netFail++;
      }
    }
    if (list.length && netFail === list.length) { setDot('dotFinnhub', 'off'); toast('Finnhub\'a ulaşılamadı (reklam engelleyici veya ağ engeli olabilir)'); }
  }
  function fhSubscribe() {
    if (!fhWs || fhWs.readyState !== 1) return;
    fhTickers().forEach(t => { if (!fhSubs.has(t)) { fhWs.send(JSON.stringify({ type: 'subscribe', symbol: t })); fhSubs.add(t); } });
  }
  function fhConnect() {
    if (fhWs) { try { fhWs.onclose = null; fhWs.close(); } catch (e) {} fhWs = null; }
    fhSubs.clear();
    if (!state.finnhubKey) { setDot('dotFinnhub', 'off'); return; }
    try { fhWs = new WebSocket(`wss://ws.finnhub.io?token=${encodeURIComponent(state.finnhubKey)}`); } catch (e) { return; }
    fhWs.onopen = () => { fhRetry = 0; setDot('dotFinnhub', 'on'); fhSubscribe(); };
    fhWs.onmessage = (ev) => {
      try {
        const m = JSON.parse(ev.data);
        if (m.type !== 'trade' || !m.data) return;
        const lastBy = {}; m.data.forEach(tr => { lastBy[tr.s] = tr.p; });
        Object.entries(lastBy).forEach(([t, p]) => idsForTicker(t).forEach(id => setLive(id, p, fhPrev[t], 'finnhub')));
      } catch (e) {}
    };
    fhWs.onclose = () => { setDot('dotFinnhub', 'off'); fhRetry = Math.min(fhRetry + 1, 6); setTimeout(fhConnect, 1500 * 2 ** fhRetry); };
    fhWs.onerror = () => { try { fhWs.close(); } catch (e) {} };
  }
  // Yeni eklenen varlıkları akışlara dahil et
  function syncFeeds() {
    binSnapshot(); binConnect(false);
    const newT = fhTickers().filter(t => !(t in fhPrev));
    if (newT.length) fhQuotes(newT);
    fhSubscribe();
  }

  // ================= Geçmiş fiyat (mum) =================
  const memCandles = {};
  const todayStr = () => new Date().toISOString().slice(0, 10);
  function cacheGet(k) { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v && v.d === todayStr() ? v.v : null; } catch (e) { return null; } }
  function cacheSet(k, v) { try { localStorage.setItem(k, JSON.stringify({ d: todayStr(), v })); } catch (e) { /* dolu olabilir */ } }
  const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
  async function binKlines(sym) {
    const arr = await binGet(`/api/v3/klines?symbol=${sym}&interval=1d&limit=1000`);
    return arr.map(k => ({ time: isoDay(k[0]), open: +k[1], high: +k[2], low: +k[3], close: +k[4] }));
  }
  function combine(a, b, f) {
    const mb = new Map(b.map(x => [x.time, x]));
    return a.filter(x => mb.has(x.time)).map(x => { const y = mb.get(x.time);
      return { time: x.time, open: f(x.open, y.open), high: f(x.high, y.high), low: f(x.low, y.low), close: f(x.close, y.close) }; });
  }
  async function tdSeries(symbol, exchange) {
    if (!state.tdKey) throw Object.assign(new Error('td_key'), { need: 'td' });
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}${exchange ? '&exchange=' + exchange : ''}&interval=1day&outputsize=750&apikey=${encodeURIComponent(state.tdKey)}`;
    const j = await (await fetch(url)).json();
    if (j.status === 'error' || !j.values) throw Object.assign(new Error(j.message || 'td'), { td: j.code });
    return j.values.slice().reverse().map(v => ({ time: v.datetime.slice(0, 10), open: +v.open, high: +v.high, low: +v.low, close: +v.close }));
  }
  function bistHistory(id) {
    const h = daily && daily.history && daily.history[id];
    if (!h || !h.length) return [];
    return h.map(([d, c]) => ({ time: d, open: c, high: c, low: c, close: c }));
  }
  async function getCandles(id) {
    if (memCandles[id]) return memCandles[id];
    const ck = 'pp.c.' + id, cached = cacheGet(ck);
    if (cached && cached.ohlc) return (memCandles[id] = cached);
    const i = inst(id);
    let out;
    if (id === 'GAUTRY') {
      const [p, u] = await Promise.all([binKlines('PAXGUSDT'), binKlines('USDTTRY')]);
      out = { candles: combine(p, u, (a, b) => a * b / OZ), source: 'Binance (PAXG × USDT/TRY)', ohlc: true };
    } else if (id === 'EURTRY') {
      const [e, u] = await Promise.all([binKlines('EURUSDT'), binKlines('USDTTRY')]);
      out = { candles: combine(e, u, (a, b) => a * b), source: 'Binance (EUR/USDT × USDT/TRY)', ohlc: true };
    } else if (i.bin) {
      out = { candles: await binKlines(i.bin), source: 'Binance', ohlc: true };
    } else if (i.type === 'us') {
      out = { candles: await tdSeries(i.fh || id), source: 'Twelve Data', ohlc: true };
    } else if (i.type === 'bist') {
      try { out = { candles: await tdSeries(id, 'BIST'), source: 'Twelve Data', ohlc: true }; }
      catch (e) {
        const h = bistHistory(id);
        out = { candles: h, source: 'Günlük kapanışlar (panel arşivi)', ohlc: false,
          note: 'BIST için ücretsiz geçmiş veri sınırlı. Panel her gün kapanışları biriktiriyor, grafik zamanla dolacak.' };
      }
    } else throw new Error('kaynak yok');
    // Yalnızca tam (OHLC) veriyi günlük önbelleğe al; arşiv yedeği her açılışta data.json'dan taze okunsun
    if (out.candles.length && out.ohlc) cacheSet(ck, out);
    return (memCandles[id] = out);
  }

  // ================= Temel analiz =================
  async function getFundamentals(id) {
    const i = inst(id);
    if (i.type === 'bist') {
      const f = daily && daily.fundamentals && daily.fundamentals[id];
      return f ? { source: 'Günlük güncelleme', asOf: f.asOf, m: f, peers: [] } : { missing: true };
    }
    if (i.type !== 'us' || i.fh) return { notCompany: true };
    if (!state.finnhubKey) return { needKey: true };
    const ck = 'pp.f.' + id, cached = cacheGet(ck);
    if (cached) return cached;
    const [met, prof, peers] = await Promise.all([fh(`/stock/metric?symbol=${id}&metric=all`), fh(`/stock/profile2?symbol=${id}`), fh(`/stock/peers?symbol=${id}`).catch(() => [])]);
    const mapM = (x, p) => x ? {
      pe: x.peTTM ?? x.peBasicExclExtraTTM ?? x.peNormalizedAnnual, pb: x.pbQuarterly ?? x.pbAnnual, ps: x.psTTM ?? x.psAnnual,
      netMargin: x.netProfitMarginTTM ?? x.netProfitMarginAnnual, roe: x.roeTTM ?? x.roeRfy,
      de: x['totalDebt/totalEquityQuarterly'] ?? x['totalDebt/totalEquityAnnual'],
      revGrowth: x.revenueGrowthTTMYoy, epsGrowth: x.epsGrowthTTMYoy,
      div: x.currentDividendYieldTTM ?? x.dividendYieldIndicatedAnnual, beta: x.beta,
      mcap: p && p.marketCapitalization ? p.marketCapitalization * 1e6 : (x.marketCapitalization ? x.marketCapitalization * 1e6 : null),
    } : null;
    const res = { source: 'Finnhub', m: mapM(met.metric, prof), industry: prof.finnhubIndustry, cur: prof.currency || 'USD', peers: [] };
    const peerList = (Array.isArray(peers) ? peers : []).filter(p => p && p !== id && !p.includes('.')).slice(0, 4);
    const pm = await Promise.all(peerList.map(p => fh(`/stock/metric?symbol=${p}&metric=all`).then(r => ({ sym: p, m: mapM(r.metric) })).catch(() => null)));
    res.peers = pm.filter(x => x && x.m);
    cacheSet(ck, res);
    return res;
  }
  const FUND = [
    { k: 'pe', label: 'F/K', tip: 'pe', f: v => fmt(v, 1), a: v => v <= 0 ? ['down', 'Zarar ediyor'] : v < 15 ? ['up', 'Düşük, ucuz görünüyor'] : v <= 30 ? ['neutral', 'Makul'] : ['down', 'Yüksek: büyüme bekleniyor ya da pahalı'] },
    { k: 'pb', label: 'PD/DD', tip: 'pb', f: v => fmt(v, 2), a: v => v < 1 ? ['up', 'Defter değerinin altında'] : v <= 3 ? ['neutral', 'Makul'] : ['down', 'Defter değerinin çok üzerinde'] },
    { k: 'ps', label: 'F/S', tip: 'ps', f: v => fmt(v, 2), a: v => v < 2 ? ['up', 'Düşük'] : v <= 8 ? ['neutral', 'Orta'] : ['down', 'Yüksek'] },
    { k: 'netMargin', label: 'Net kâr marjı', tip: 'margin', f: v => '%' + fmt(v, 1), a: v => v < 0 ? ['down', 'Zarar'] : v < 10 ? ['neutral', 'Düşük'] : v < 20 ? ['up', 'İyi'] : ['up', 'Çok güçlü'] },
    { k: 'roe', label: 'Özsermaye kârlılığı', tip: 'roe', f: v => '%' + fmt(v, 1), a: v => v < 10 ? ['down', 'Zayıf'] : v < 20 ? ['neutral', 'İyi'] : ['up', 'Güçlü'] },
    { k: 'de', label: 'Borç/Özsermaye', tip: 'de', f: v => fmt(v, 2), a: v => v < 0.5 ? ['up', 'Düşük borç'] : v <= 1.5 ? ['neutral', 'Orta'] : ['down', 'Yüksek borç'] },
    { k: 'revGrowth', label: 'Satış büyümesi', tip: 'growth', f: v => '%' + fmt(v, 1), a: v => v < 0 ? ['down', 'Küçülüyor'] : v < 15 ? ['neutral', 'Ilımlı'] : ['up', 'Hızlı'] },
    { k: 'epsGrowth', label: 'Kâr büyümesi', tip: 'growth', f: v => '%' + fmt(v, 1), a: v => v < 0 ? ['down', 'Kâr düşüyor'] : v < 15 ? ['neutral', 'Ilımlı'] : ['up', 'Hızlı'] },
    { k: 'div', label: 'Temettü verimi', tip: 'div', f: v => '%' + fmt(v, 2), a: v => v <= 0 ? ['neutral', 'Temettü yok'] : v < 2 ? ['neutral', 'Düşük'] : ['up', 'Cazip'] },
    { k: 'beta', label: 'Beta', tip: 'beta', f: v => fmt(v, 2), a: v => v > 1.3 ? ['neutral', 'Piyasadan oynak'] : v < 0.8 ? ['neutral', 'Piyasadan sakin'] : ['neutral', 'Piyasaya yakın'] },
  ];

  // ================= Alarmlar =================
  function checkAlarms() {
    let fired = false;
    state.alarms.forEach(a => {
      if (!a.active) return;
      const q = quote(a.sym); if (!q || !q.live) return;
      if ((a.dir === 'above' && q.price >= a.price) || (a.dir === 'below' && q.price <= a.price)) {
        a.active = false; a.firedAt = Date.now(); a.firedPrice = q.price; fired = true;
        const i = inst(a.sym);
        const msg = `🔔 ${a.sym} ${a.dir === 'above' ? 'yükseldi' : 'düştü'}: ${money(q.price, i.cur)} (hedef ${money(a.price, i.cur)})`;
        toast(msg, 8000); beep();
        try { if ('Notification' in window && Notification.permission === 'granted') new Notification('Piyasa Paneli', { body: msg }); } catch (e) {}
      }
    });
    if (fired) { save(); updateAlarmBadge(); }
  }
  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.18].forEach(t => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 880; g.gain.value = 0.08;
        o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.12); });
    } catch (e) {}
  }
  function updateAlarmBadge() {
    const n = state.alarms.filter(a => a.active).length, b = $('#alarmBadge');
    if (b) { b.textContent = n; b.style.display = n ? '' : 'none'; }
  }
  function addAlarm(sym, dir, price) {
    const q = quote(sym);
    if (q && ((dir === 'above' && q.price >= price) || (dir === 'below' && q.price <= price))) {
      toast(`Fiyat zaten hedefin ${dir === 'above' ? 'üzerinde' : 'altında'}`); return false;
    }
    state.alarms.push({ sym, dir, price, active: true, createdAt: Date.now() });
    save(); updateAlarmBadge(); syncFeeds();
    try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch (e) {}
    toast('Alarm kuruldu'); return true;
  }

  // ================= Yardımcılar =================
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function fmt(n, dec) {
    if (n == null || !isFinite(n)) return '—';
    if (dec == null) dec = Math.abs(n) >= 1 ? 2 : 4;
    return n.toLocaleString('tr-TR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }
  function big(n, cur) {
    if (n == null || !isFinite(n)) return '—';
    const a = Math.abs(n), s = cur === 'TRY' ? ' ₺' : '';
    const p = cur === 'USD' ? '$' : '';
    if (a >= 1e12) return p + fmt(n / 1e12, 2) + ' trilyon' + s;
    if (a >= 1e9) return p + fmt(n / 1e9, 1) + ' milyar' + s;
    if (a >= 1e6) return p + fmt(n / 1e6, 1) + ' milyon' + s;
    return p + fmt(n, 0) + s;
  }
  const money = (n, c, dec) => n == null || !isFinite(n) ? '—' : (c === 'TRY' ? fmt(n, dec) + ' ₺' : (c === 'USD' ? '$' : '') + fmt(n, dec));
  const priceStr = (id, p) => inst(id).type === 'fx' ? fmt(p, 4) : money(p, inst(id).cur);
  function chg(p) {
    if (p == null || !isFinite(p)) return '<span class="chg">—</span>';
    const cls = p > 0 ? 'up' : p < 0 ? 'down' : '';
    return `<span class="chg ${cls}">${p > 0 ? '+' : ''}${fmt(p, 2)}%</span>`;
  }
  const tip = (k) => GLOSSARY[k] ? `<span class="tip" tabindex="0" role="button" aria-label="Açıklama" data-tip="${esc(GLOSSARY[k])}">ⓘ</span>` : '';
  function spark(hist, w = 90, h = 26) {
    if (!hist || hist.length < 2) return `<svg class="spark" width="${w}" height="${h}"><line x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}" stroke="rgba(160,190,230,.25)" stroke-dasharray="3 3"/></svg>`;
    const vs = hist.map(p => p.v), mn = Math.min(...vs), mx = Math.max(...vs), rg = mx - mn || 1;
    const pts = vs.map((v, i) => `${(i / (vs.length - 1) * w).toFixed(1)},${(h - 2 - (v - mn) / rg * (h - 4)).toFixed(1)}`).join(' ');
    const col = vs[vs.length - 1] >= vs[0] ? 'var(--up)' : 'var(--down)';
    return `<svg class="spark" width="${w}" height="${h}"><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  }
  function flashCls(key, price) {
    const prev = lastShown[key]; lastShown[key] = price;
    if (prev == null || price == null || prev === price) return '';
    return price > prev ? 'flash-up' : 'flash-down';
  }
  let toastT;
  function toast(msg, ms = 2600) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms);
  }
  function setDot(id, st) { const d = document.getElementById(id); if (d) d.className = 'dot ' + st; }
  const badgeFor = (q) => q ? (q.live ? `<span class="badge live">canlı</span>` : `<span class="badge">${esc(q.asOf || 'günlük')}</span>`) : '';
  const keyNotice = () => state.finnhubKey ? '' :
    `<div class="notice">ABD hisselerinin canlı akması için ücretsiz bir Finnhub anahtarı gerekiyor. <a href="#ayarlar">Ayarlar</a> sayfasından 1 dakikada ekleyebilirsin.</div>`;
  const detailHref = (id) => '#varlik-' + encodeURIComponent(id);

  // ================= Yönlendirme =================
  const VIEWS = {
    ozet: { title: 'Günlük Özet', render: renderOzet, refresh: refreshOzet },
    izleme: { title: 'İzleme Listeleri', render: renderIzleme, refresh: refreshWl },
    haberler: { title: 'Haberler', render: renderHaberler },
    portfoy: { title: 'Portföyüm', render: renderPortfoy, refresh: refreshPortfoy },
    takvim: { title: 'Ekonomik Takvim', render: renderTakvim },
    notlar: { title: 'Notlarım', render: renderNotlar },
    ayarlar: { title: 'Ayarlar', render: renderAyarlar },
    varlik: { title: '', render: renderDetay, refresh: refreshDetay },
  };
  let current = 'ozet', detailId = null;
  function renderView() {
    const v = VIEWS[current];
    $('#viewTitle').textContent = current === 'varlik' ? `${detailId} · ${inst(detailId).name}` : v.title;
    document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.view === current));
    destroyCharts();
    v.render($('#view'));
  }
  function route() {
    const h = decodeURIComponent((location.hash || '').replace('#', ''));
    if (h.startsWith('varlik-')) { current = 'varlik'; detailId = h.slice(7).toUpperCase(); syncFeeds(); }
    else { current = VIEWS[h] ? h : 'ozet'; detailId = null; }
    document.body.classList.remove('menu-open');
    closeSearch();
    renderView();
    window.scrollTo(0, 0);
  }

  // ================= Özet =================
  function tile(id) {
    const i = inst(id), q = quote(id);
    const tipK = id === 'GAUTRY' ? 'gram' : id === 'XAUUSD' ? 'paxg' : id === 'USDTRY' ? 'usdt' : i.type === 'crypto' ? 'h24' : '';
    return `<a class="card tile link ${q ? flashCls('t_' + id, q.price) : ''}" href="${detailHref(id)}">
      <div class="t-name"><span>${esc(i.name)} ${tipK ? tip(tipK) : ''}</span>${badgeFor(q)}</div>
      <div class="t-val">${q ? priceStr(id, q.price) : '—'}</div>
      <div class="t-sub">${q ? chg(q.changePct) : ''}${q && q.live && i.type === 'crypto' ? ' · 24s' : ''}</div></a>`;
  }
  function indexTile(m) {
    const px = m.proxy && live[m.proxy];
    let val = fmt(m.value), pct = m.changePct, badge = `<span class="badge">${esc(m.asOf || '')}</span>`, sub = '';
    if (px && px.changePct != null) {
      val = '≈ ' + fmt(m.value * (1 + px.changePct / 100)); pct = px.changePct;
      badge = '<span class="badge live">canlı</span>'; sub = ` · ${esc(m.proxy)} bazlı ${tip('proxy')}`;
    }
    return `<div class="card tile ${flashCls('i_' + m.id, val)}">
      <div class="t-name"><span>${esc(m.name)}</span>${badge}</div>
      <div class="t-val">${val}</div><div class="t-sub">${chg(pct)}${sub}</div></div>`;
  }
  function renderOzet(el) {
    if (!daily) { el.innerHTML = '<div class="empty">Veriler yükleniyor…</div>'; return; }
    const s = daily.summary || {};
    const mv = (m) => `<a class="mv-row link" href="${detailHref(m.sym)}"><span class="sym">${esc(m.sym)}</span><span>${fmt(m.price)} ₺ &nbsp;${chg(m.changePct)}</span></a>`;
    el.innerHTML = `${keyNotice()}
      <div class="card section">
        <div class="section-title">Günün hikâyesi · ${esc(daily.updatedLabel || '')}</div>
        <p class="headline">${esc(s.headline || '')}</p><p class="lead">${esc(s.text || '')}</p>
      </div>
      <div id="ozDyn"></div>
      <div class="section"><div class="section-title">${esc(s.moversTitle || 'Öne çıkanlar')}</div>
        <div class="movers">
          <div class="card"><h2>▲ Yükselenler</h2>${(s.movers?.up || []).map(mv).join('')}</div>
          <div class="card"><h2>▼ Düşenler</h2>${(s.movers?.down || []).map(mv).join('')}</div>
        </div></div>
      <p class="note-hint">İpucu: Herhangi bir kutuya tıklayarak o varlığın grafiğini, teknik ve temel analizini açabilirsin.</p>`;
    refreshOzet();
  }
  function refreshOzet() {
    const box = $('#ozDyn'); if (!box || !daily) return;
    box.innerHTML = `
      <div class="section"><div class="section-title">Endeksler</div><div class="grid g-tiles">${(daily.summary?.markets || []).map(indexTile).join('')}</div></div>
      <div class="section"><div class="section-title">Döviz ve altın</div><div class="grid g-tiles">${['USDTRY', 'EURTRY', 'XAUUSD', 'GAUTRY'].map(tile).join('')}</div></div>
      <div class="section"><div class="section-title">Kripto ve emtia</div><div class="grid g-tiles">${['BTC', 'ETH', 'OIL'].map(tile).join('')}</div></div>`;
  }

  // ================= Arama =================
  let searchT = null, searchSeq = 0;
  function localMatches(q) {
    const Q = q.toUpperCase(), ql = q.toLocaleLowerCase('tr');
    const pool = { ...CATALOG, ...state.custom };
    const res = [];
    Object.entries(pool).forEach(([id, i]) => { if (id.startsWith(Q) || i.name.toLocaleLowerCase('tr').includes(ql)) res.push({ id, name: i.name, type: i.type }); });
    Object.entries(CRYPTO).forEach(([s, n]) => { if (!pool[s] && (s.startsWith(Q) || n.toLowerCase().includes(ql))) res.push({ id: s, name: n, type: 'crypto', def: { name: n, type: 'crypto', cur: 'USD', bin: s + 'USDT' } }); });
    return res.sort((a, b) => (a.id === Q ? -1 : b.id === Q ? 1 : 0)).slice(0, 8);
  }
  async function doSearch(q) {
    const box = $('#searchRes'); if (!box) return;
    q = q.trim();
    if (!q) { closeSearch(); return; }
    const seq = ++searchSeq;
    let res = localMatches(q);
    const draw = (extra) => {
      if (seq !== searchSeq) return;
      const all = [...res, ...(extra || []).filter(x => !res.some(r => r.id === x.id))].slice(0, 12);
      box.innerHTML = all.length ? all.map((r, k) => `<button class="sr" data-k="${k}"><span class="sym">${esc(r.id)}</span><span class="sub">${esc(r.name)}</span><span class="flag">${TYPE_LABEL[r.type] || ''}</span></button>`).join('')
        : `<div class="sr-empty">Sonuç yok. ${state.finnhubKey ? '' : 'ABD hisselerini isimle aramak için Finnhub anahtarı ekle.'}<br>Kripto için sembolü yazıp Enter'a bas (ör. PEPE).</div>`;
      box.hidden = false; box._items = all;
    };
    draw();
    if (state.finnhubKey && q.length >= 2) {
      try {
        const j = await fh(`/search?q=${encodeURIComponent(q)}&exchange=US`);
        const extra = (j.result || []).filter(x => x.symbol && !x.symbol.includes('.') && /Common Stock|ETP|ADR/i.test(x.type || ''))
          .slice(0, 8).map(x => ({ id: x.symbol, name: x.description, type: 'us', def: { name: titleCase(x.description), type: 'us', cur: 'USD' } }));
        draw(extra);
      } catch (e) {}
    }
  }
  const titleCase = (s) => String(s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  function closeSearch() { const b = $('#searchRes'); if (b) { b.hidden = true; b.innerHTML = ''; } }
  function pickSearch(r) {
    if (!r) return;
    ensureInst(r.id, r.def);
    $('#searchIn').value = ''; closeSearch();
    location.hash = 'varlik-' + r.id;
  }
  function initSearch() {
    const inp = $('#searchIn');
    inp.addEventListener('input', () => { clearTimeout(searchT); searchT = setTimeout(() => doSearch(inp.value), 300); });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { inp.value = ''; closeSearch(); inp.blur(); }
      if (e.key === 'Enter') {
        e.preventDefault();
        const items = $('#searchRes')._items || [];
        if (items.length) pickSearch(items[0]);
        else {
          const s = inp.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/USDT$/, '');
          if (s) pickSearch({ id: s, def: { name: s, type: 'crypto', cur: 'USD', bin: s + 'USDT' } });
        }
      }
    });
    $('#searchRes').addEventListener('click', (e) => { const b = e.target.closest('.sr'); if (b) pickSearch($('#searchRes')._items[+b.dataset.k]); });
    document.addEventListener('click', (e) => { if (!e.target.closest('.search')) closeSearch(); });
    document.addEventListener('keydown', (e) => { if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); inp.focus(); } });
  }

  // ================= İzleme listeleri =================
  function renderIzleme(el) {
    el.innerHTML = `${keyNotice()}
      <div class="list-tabs" id="listTabs"></div>
      <div class="card section"><div class="tbl-wrap" id="wlTable"></div></div>
      <div class="grid g-2 section">
        <div class="card"><h2>Listeye varlık ekle</h2>
          <p class="note-hint" style="margin-top:0">En kolayı: üstteki <b>arama kutusuna</b> şirket ya da coin adını yaz ("apple", "aselsan", "solana"), açılan sayfada <b>Listeye ekle</b>'ye bas.</p>
          <form class="form" id="wlForm">
            <label class="field">Hızlı ekle (sembol) <input id="wlSym" placeholder="ör. AMZN, SOL, GARAN" maxlength="12"></label>
            <button class="btn" type="submit">Ekle</button>
          </form></div>
        <div class="card"><h2>Fiyat alarmları ${tip('alarm')}</h2><div id="alarmList"></div></div>
      </div>`;
    $('#wlForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const s = $('#wlSym').value.trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, '').replace(/USDT$/, '');
      if (!s) return;
      const r = localMatches(s).find(x => x.id === s);
      if (r) ensureInst(s, r.def);
      else if (CRYPTO[s]) ensureInst(s, { name: CRYPTO[s], type: 'crypto', cur: 'USD', bin: s + 'USDT' });
      else ensureInst(s, { name: s, type: 'us', cur: 'USD' });
      addToList(state.activeList, s); $('#wlSym').value = '';
    });
    $('#listTabs').addEventListener('click', onListTabs);
    $('#wlTable').addEventListener('click', onWlTable);
    $('#alarmList').addEventListener('click', onAlarmList);
    refreshIzleme();
  }
  function addToList(li, id) {
    const L = state.lists[li];
    if (!L.ids.includes(id)) { L.ids.push(id); save(); toast(`${id} "${L.name}" listesine eklendi`); syncFeeds(); }
    else toast(`${id} zaten "${L.name}" listesinde`);
    if (current === 'izleme') refreshIzleme();
  }
  function onListTabs(e) {
    const b = e.target.closest('[data-li],[data-act]'); if (!b) return;
    if (b.dataset.li != null) { state.activeList = +b.dataset.li; save(); refreshIzleme(); return; }
    const act = b.dataset.act, L = state.lists[state.activeList];
    if (act === 'new') { $('#listTabs').querySelector('.list-edit').hidden = false; $('#listName').value = ''; $('#listName').dataset.mode = 'new'; $('#listName').focus(); }
    if (act === 'rename') { $('#listTabs').querySelector('.list-edit').hidden = false; $('#listName').value = L.name; $('#listName').dataset.mode = 'rename'; $('#listName').focus(); }
    if (act === 'del') {
      if (state.lists.length < 2) { toast('En az bir liste kalmalı'); return; }
      if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'Emin misin? Tekrar bas'; setTimeout(() => { if (b.isConnected) { b.dataset.confirm = ''; b.textContent = 'Listeyi sil'; } }, 3000); return; }
      state.lists.splice(state.activeList, 1); state.activeList = 0; save(); toast(`"${L.name}" silindi`); refreshIzleme();
    }
    if (act === 'saveName') saveListName();
    if (act === 'cancelName') b.closest('.list-edit').hidden = true;
  }
  function saveListName() {
    const inp = $('#listName'), name = inp.value.trim().slice(0, 30);
    if (!name) return;
    if (inp.dataset.mode === 'new') { state.lists.push({ name, ids: [] }); state.activeList = state.lists.length - 1; toast(`"${name}" listesi oluşturuldu`); }
    else state.lists[state.activeList].name = name;
    save(); refreshIzleme();
  }
  function onWlTable(e) {
    const b = e.target.closest('button[data-act]');
    if (b) {
      e.preventDefault(); e.stopPropagation();
      const id = b.dataset.id, L = state.lists[state.activeList];
      if (b.dataset.act === 'rm') { L.ids = L.ids.filter(x => x !== id); save(); refreshIzleme(); toast(`${id} listeden çıkarıldı`); }
      if (b.dataset.act === 'up' || b.dataset.act === 'down') {
        const i = L.ids.indexOf(id), j = i + (b.dataset.act === 'up' ? -1 : 1);
        if (j >= 0 && j < L.ids.length) { [L.ids[i], L.ids[j]] = [L.ids[j], L.ids[i]]; save(); refreshIzleme(); }
      }
      return;
    }
    const row = e.target.closest('tr[data-id]'); if (row) location.hash = 'varlik-' + row.dataset.id;
  }
  function onAlarmList(e) {
    const b = e.target.closest('button[data-al]'); if (!b) return;
    state.alarms.splice(+b.dataset.al, 1); save(); updateAlarmBadge(); refreshAlarmList();
  }
  function alarmRows(filterSym) {
    const rows = state.alarms.map((a, k) => ({ a, k })).filter(x => !filterSym || x.a.sym === filterSym);
    if (!rows.length) return `<div class="note-hint">${filterSym ? 'Bu varlık için alarm yok.' : 'Henüz alarm yok. Bir varlığın sayfasından kurabilirsin.'}</div>`;
    return rows.map(({ a, k }) => {
      const i = inst(a.sym), q = quote(a.sym);
      const dist = q ? ((a.price / q.price - 1) * 100) : null;
      return `<div class="mv-row"><span><a class="sym" href="${detailHref(a.sym)}">${esc(a.sym)}</a> ${a.dir === 'above' ? '≥' : '≤'} ${money(a.price, i.cur)}
        <span class="sub">${a.active ? (dist != null ? `· mesafe ${fmt(dist, 1)}%` : '') : `· ✓ tetiklendi ${new Date(a.firedAt).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}`}</span></span>
        <button class="icon-btn" data-al="${k}" title="Sil">✕</button></div>`;
    }).join('');
  }
  function refreshAlarmList() { const b = $('#alarmList'); if (b) b.innerHTML = alarmRows(); const d = $('#dAlarmList'); if (d) d.innerHTML = alarmRows(detailId); }
  function refreshIzleme() { renderTabs(); refreshWl(); }
  function renderTabs() {
    const tabs = $('#listTabs'); if (!tabs) return;
    {
      tabs.innerHTML = state.lists.map((l, k) => `<button class="ltab ${k === state.activeList ? 'active' : ''}" data-li="${k}">${esc(l.name)} <span class="sub">${l.ids.length}</span></button>`).join('')
        + `<button class="ltab add" data-act="new">+ Yeni liste</button>
        <span class="ltools"><button class="btn ghost sm" data-act="rename">Yeniden adlandır</button><button class="btn ghost sm" data-act="del">Listeyi sil</button></span>
        <div class="list-edit" hidden><input id="listName" maxlength="30" placeholder="Liste adı (ör. Teknoloji)"><button class="btn sm" data-act="saveName">Kaydet</button><button class="btn ghost sm" data-act="cancelName">Vazgeç</button></div>`;
      const ln = $('#listName'); ln.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); saveListName(); } });
    }
  }
  function refreshWl() {
    const box = $('#wlTable'); if (!box) return;
    const L = state.lists[state.activeList];
    refreshAlarmList();
    if (!L.ids.length) { box.innerHTML = `<div class="empty">"${esc(L.name)}" listesi boş.<br>Üstteki arama kutusundan bir varlık bulup ekleyebilirsin.</div>`; return; }
    box.innerHTML = `<table class="tbl hover"><thead><tr>
        <th>Varlık</th><th class="hide-m">Piyasa</th><th class="num">Fiyat</th><th class="num">Değişim</th><th class="hide-m">Oturum seyri</th><th></th>
      </tr></thead><tbody>${L.ids.map(id => {
        const i = inst(id), q = quote(id);
        const status = q ? badgeFor(q) : (i.type === 'us' && !state.finnhubKey ? '<span class="badge gold">anahtar gerekli</span>' : i.type === 'bist' ? '<span class="badge">BIST 30 dışı</span>' : '<span class="badge">bekleniyor</span>');
        const al = state.alarms.some(a => a.active && a.sym === id) ? ' 🔔' : '';
        return `<tr data-id="${esc(id)}">
          <td><div class="sym">${esc(id)}<span class="muted">${state.notes[id] ? ' ✎' : ''}${al}</span></div><div class="sub">${esc(i.name)}</div></td>
          <td class="hide-m"><span class="flag">${TYPE_LABEL[i.type] || ''}</span>${status}</td>
          <td class="num ${q ? flashCls('w_' + id, q.price) : ''}">${q ? priceStr(id, q.price) : '—'}</td>
          <td class="num">${q ? chg(q.changePct) : '—'}</td>
          <td class="hide-m">${spark(q && q.hist)}</td>
          <td class="num nowrap"><button class="icon-btn hide-m" data-act="up" data-id="${esc(id)}" title="Yukarı taşı">↑</button><button class="icon-btn hide-m" data-act="down" data-id="${esc(id)}" title="Aşağı taşı">↓</button><button class="icon-btn" data-act="rm" data-id="${esc(id)}" title="Listeden çıkar">✕</button></td>
        </tr>`;
      }).join('')}</tbody></table>`;
  }

  // ================= Varlık detay sayfası =================
  let charts = [], mainSeries = null, detailCandles = null;
  function destroyCharts() { charts.forEach(c => { try { c.remove(); } catch (e) {} }); charts = []; mainSeries = null; detailCandles = null; }
  function renderDetay(el) {
    const id = detailId, i = inst(id);
    const listOpts = state.lists.map((l, k) => `<option value="${k}">${esc(l.name)}${l.ids.includes(id) ? ' ✓' : ''}</option>`).join('');
    el.innerHTML = `
      <div class="card section dhead">
        <div class="dh-left">
          <div class="dh-sym">${esc(id)} <span class="flag">${TYPE_LABEL[i.type] || ''}</span></div>
          <div class="sub">${esc(i.name)}${i.hint ? ' · ' + esc(i.hint) : ''}</div>
          <div id="dPrice"></div>
        </div>
        <div class="dh-actions">
          <div class="form"><label class="field">Listeye ekle <select id="dList">${listOpts}</select></label><button class="btn" id="dAdd">Ekle</button></div>
        </div>
        <div id="dPos" class="dpos"></div>
      </div>
      <div class="card section">
        <div class="chart-bar">
          <div class="seg" id="dRange"><button data-r="63">3A</button><button data-r="126">6A</button><button data-r="252" class="active">1Y</button><button data-r="756">3Y</button></div>
          <div class="seg" id="dInd">
            <label><input type="checkbox" data-k="ma20"> MA20</label><label><input type="checkbox" data-k="ma50"> MA50</label>
            <label><input type="checkbox" data-k="ma200"> MA200</label><label><input type="checkbox" data-k="bb"> Bollinger</label> ${tip('ma')}
          </div>
        </div>
        <div id="chMain" class="ch-main"><div class="empty">Grafik yükleniyor…</div></div>
        <div class="ch-label">RSI (14) ${tip('rsi')}</div><div id="chRsi" class="ch-sub"></div>
        <div class="ch-label">MACD ${tip('macd')}</div><div id="chMacd" class="ch-sub"></div>
        <div class="note-hint" id="chSrc"></div>
      </div>
      <div class="grid g-2 section">
        <div class="card"><h2>Teknik analiz</h2><div id="dTech"><div class="note-hint">Hesaplanıyor…</div></div></div>
        <div class="card"><h2>Temel analiz</h2><div id="dFund"><div class="note-hint">Yükleniyor…</div></div></div>
      </div>
      <div class="grid g-2 section">
        <div class="card"><h2>Fiyat alarmı ${tip('alarm')}</h2>
          <form class="form" id="dAlarmForm">
            <label class="field">Koşul <select id="dDir"><option value="above">Fiyat bunun üzerine çıkarsa</option><option value="below">Fiyat bunun altına inerse</option></select></label>
            <label class="field">Hedef fiyat <input id="dTarget" type="number" step="any" min="0" required></label>
            <button class="btn" type="submit">Alarm kur</button>
          </form><div id="dAlarmList" style="margin-top:10px"></div></div>
        <div class="card"><h2>Notlarım</h2><textarea class="note sm" id="dNote" placeholder="Bu varlıkla ilgili düşüncelerin, hedef fiyatın, alım-satım gerekçen…">${esc(state.notes[id] || '')}</textarea><div class="note-hint" id="dNoteSt">Yazdıkça otomatik kaydedilir.</div></div>
      </div>
      <p class="note-hint">Teknik ve temel analiz yorumları kurallara dayalı otomatik özetlerdir, yatırım tavsiyesi değildir.</p>`;
    const dl = $('#dList'); dl.value = String(state.activeList);
    $('#dAdd').addEventListener('click', () => { addToList(+dl.value, id); dl.innerHTML = state.lists.map((l, k) => `<option value="${k}">${esc(l.name)}${l.ids.includes(id) ? ' ✓' : ''}</option>`).join(''); });
    $('#dAlarmForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const p = parseFloat(String($('#dTarget').value).replace(',', '.'));
      if (!(p > 0)) return;
      if (addAlarm(id, $('#dDir').value, p)) { $('#dTarget').value = ''; refreshAlarmList(); }
    });
    let nt; $('#dNote').addEventListener('input', (e) => { clearTimeout(nt); const v = e.target.value; nt = setTimeout(() => {
      if (v.trim()) state.notes[id] = v; else delete state.notes[id]; save(); $('#dNoteSt').textContent = 'Kaydedildi · ' + new Date().toLocaleTimeString('tr-TR'); }, 400); });
    document.querySelectorAll('#dInd input').forEach(cb => { cb.checked = !!state.ind[cb.dataset.k]; cb.addEventListener('change', () => { state.ind[cb.dataset.k] = cb.checked; save(); drawCharts(); }); });
    $('#dRange').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; document.querySelectorAll('#dRange button').forEach(x => x.classList.toggle('active', x === b)); setRange(+b.dataset.r); });
    refreshAlarmList();
    refreshDetay();
    loadDetailData(id);
  }
  function refreshDetay() {
    const id = detailId, i = inst(id), q = quote(id);
    const pb = $('#dPrice'); if (!pb) return;
    pb.innerHTML = q ? `<div class="dh-price ${flashCls('d_' + id, q.price)}">${priceStr(id, q.price)}</div><div>${chg(q.changePct)} ${badgeFor(q)}</div>`
      : `<div class="dh-price">—</div><div class="note-hint">${i.type === 'us' && !state.finnhubKey ? 'Canlı fiyat için Finnhub anahtarı gerekli.' : i.type === 'bist' ? 'Bu hisse günlük veride yok (BIST 30 dışı olabilir).' : 'Fiyat bekleniyor…'}</div>`;
    const hs = state.portfolio.filter(h => h.id === id);
    const pos = $('#dPos');
    if (hs.length && q) {
      const qty = hs.reduce((a, h) => a + h.qty, 0), cost = hs.reduce((a, h) => a + h.qty * h.cost, 0);
      const sameCur = hs.every(h => h.costCur === i.cur);
      const val = qty * q.price;
      pos.innerHTML = `<div class="sub">Portföyünde</div><div><b>${fmt(qty, qty % 1 ? 4 : 0)}</b> adet · ${money(val, i.cur)}${sameCur ? ` · K/Z ${chg((val / cost - 1) * 100)}` : ''}</div>`;
    } else pos.innerHTML = '';
    // Canlı fiyatı son muma işle
    if (mainSeries && detailCandles && q && q.live && detailCandles.ohlc) {
      const c = detailCandles.candles, lastC = c[c.length - 1];
      if (lastC) {
        const t = todayStr();
        if (lastC.time === t) { lastC.close = q.price; lastC.high = Math.max(lastC.high, q.price); lastC.low = Math.min(lastC.low, q.price); }
        else if (t > lastC.time && inst(id).type === 'crypto') c.push({ time: t, open: lastC.close, high: Math.max(lastC.close, q.price), low: Math.min(lastC.close, q.price), close: q.price });
        try { mainSeries.update(c[c.length - 1]); } catch (e) {}
      }
    }
  }
  async function loadDetailData(id) {
    try {
      const data = await getCandles(id);
      if (detailId !== id) return;
      detailCandles = { ...data, candles: data.candles.map(x => ({ ...x })) };
      drawCharts();
      renderTech();
    } catch (e) {
      if (detailId !== id) return;
      const need = e.need === 'td';
      $('#chMain').innerHTML = `<div class="empty">${need ? `ABD hisselerinin geçmiş grafiği için ücretsiz bir <b>Twelve Data</b> anahtarı gerekiyor.<br><a href="#ayarlar">Ayarlar</a>'dan 1 dakikada ekleyebilirsin.`
        : e.td === 429 ? 'Twelve Data dakikalık sorgu sınırına ulaşıldı. 1 dakika sonra sayfayı yenile.'
        : e.message === 'binance' ? 'Binance\'ten geçmiş fiyat alınamadı. İnternet bağlantını kontrol edip sayfayı yenile.' : 'Grafik verisi alınamadı: ' + esc(e.message)}</div>`;
      $('#chRsi').innerHTML = ''; $('#chMacd').innerHTML = '';
      $('#dTech').innerHTML = `<div class="note-hint">Teknik analiz için geçmiş fiyat verisi gerekli.</div>`;
    }
    try { const f = await getFundamentals(id); if (detailId === id) renderFund(f); }
    catch (e) { if (detailId === id) $('#dFund').innerHTML = `<div class="note-hint">${e.code === 429 ? 'Sorgu sınırına ulaşıldı, 1 dakika sonra tekrar dene.' : 'Temel veriler alınamadı.'}</div>`; }
  }
  const CH_OPTS = () => ({
    layout: { background: { color: 'transparent' }, textColor: '#9FB2CF', fontFamily: 'Inter, sans-serif' },
    grid: { vertLines: { color: 'rgba(150,190,240,.07)' }, horzLines: { color: 'rgba(150,190,240,.07)' } },
    rightPriceScale: { borderColor: 'rgba(150,190,240,.2)', minimumWidth: 78 }, timeScale: { borderColor: 'rgba(150,190,240,.2)' },
    crosshair: { mode: 0 }, localization: { locale: 'tr-TR' }, handleScroll: { vertTouchDrag: false, mouseWheel: false }, handleScale: { mouseWheel: false },
  });
  function lineData(c, arr) { return arr.map((v, k) => v == null ? null : { time: c[k].time, value: v }).filter(Boolean); }
  let curRange = 252;
  function setRange(n) {
    curRange = n;
    if (!detailCandles || !charts.length) return;
    const len = detailCandles.candles.length;
    charts.forEach(ch => ch.timeScale().setVisibleLogicalRange({ from: Math.max(0, len - n), to: len + 2 }));
  }
  function drawCharts() {
    if (!detailCandles || !window.LightweightCharts) return;
    charts.forEach(c => { try { c.remove(); } catch (e) {} }); charts = [];
    const LC = window.LightweightCharts, c = detailCandles.candles, closes = c.map(x => x.close);
    const elM = $('#chMain'), elR = $('#chRsi'), elD = $('#chMacd');
    elM.innerHTML = ''; elR.innerHTML = ''; elD.innerHTML = '';
    $('#chSrc').textContent = `Kaynak: ${detailCandles.source} · ${c.length} günlük veri${detailCandles.note ? ' · ' + detailCandles.note : ''}`;
    if (c.length < 2) { elM.innerHTML = `<div class="empty">${esc(detailCandles.note || 'Yeterli veri yok.')}</div>`; return; }
    const pf = { type: 'price', precision: c[c.length - 1].close < 10 ? 4 : 2, minMove: c[c.length - 1].close < 10 ? 0.0001 : 0.01 };
    const main = LC.createChart(elM, { ...CH_OPTS(), height: elM.clientHeight || 360, width: elM.clientWidth });
    if (detailCandles.ohlc) {
      mainSeries = main.addCandlestickSeries({ upColor: '#34D399', downColor: '#F87171', borderVisible: false, wickUpColor: '#34D399', wickDownColor: '#F87171', priceFormat: pf });
      mainSeries.setData(c);
    } else {
      mainSeries = main.addLineSeries({ color: '#D9AE3F', lineWidth: 2, priceFormat: pf });
      mainSeries.setData(c.map(x => ({ time: x.time, value: x.close })));
    }
    const ln = (arr, color, w = 1.5, style = 0) => { const s = main.addLineSeries({ color, lineWidth: w, lineStyle: style, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }); s.setData(lineData(c, arr)); };
    if (state.ind.ma20) ln(TA.sma(closes, 20), '#5B9BF0');
    if (state.ind.ma50) ln(TA.sma(closes, 50), '#D9AE3F');
    if (state.ind.ma200) ln(TA.sma(closes, 200), '#B48CF2', 2);
    if (state.ind.bb) { const b = TA.bollinger(closes); ln(b.up, 'rgba(160,190,230,.6)', 1, 2); ln(b.lo, 'rgba(160,190,230,.6)', 1, 2); }
    charts.push(main);
    const sub = (el) => LC.createChart(el, { ...CH_OPTS(), height: el.clientHeight || 120, width: el.clientWidth, timeScale: { visible: false, borderColor: 'rgba(150,190,240,.2)' } });
    if (c.length > 20) {
      const r = sub(elR), rs = r.addLineSeries({ color: '#D9AE3F', lineWidth: 1.5, priceLineVisible: false });
      rs.setData(lineData(c, TA.rsi(closes, 14)));
      rs.createPriceLine({ price: 70, color: 'rgba(248,113,113,.6)', lineStyle: 2, lineWidth: 1, axisLabelVisible: true, title: '' });
      rs.createPriceLine({ price: 30, color: 'rgba(52,211,153,.6)', lineStyle: 2, lineWidth: 1, axisLabelVisible: true, title: '' });
      charts.push(r);
      const m = sub(elD), md = TA.macd(closes);
      const hs = m.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false });
      hs.setData(md.hist.map((v, k) => v == null ? null : { time: c[k].time, value: v, color: v >= 0 ? 'rgba(52,211,153,.55)' : 'rgba(248,113,113,.55)' }).filter(Boolean));
      const l1 = m.addLineSeries({ color: '#5B9BF0', lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false }); l1.setData(lineData(c, md.line));
      const l2 = m.addLineSeries({ color: '#D9AE3F', lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false }); l2.setData(lineData(c, md.signal));
      charts.push(m);
    }
    // Zaman eksenlerini senkronla
    let syncing = false;
    charts.forEach(ch => ch.timeScale().subscribeVisibleLogicalRangeChange(rg => {
      if (syncing || !rg) return; syncing = true; charts.forEach(o => { if (o !== ch) o.timeScale().setVisibleLogicalRange(rg); }); syncing = false;
    }));
    setRange(curRange);
  }
  function renderTech() {
    const box = $('#dTech'); if (!box || !detailCandles) return;
    const a = TA.analyze(detailCandles.candles);
    if (a.tooShort) { box.innerHTML = `<div class="note-hint">Teknik analiz için en az 30 günlük veri gerekiyor (şu an ${detailCandles.candles.length}). ${esc(detailCandles.note || '')}</div>`; return; }
    const i = inst(detailId), st = a.stats, P = (v) => priceStr(detailId, v);
    const ico = { up: '▲', down: '▼', neutral: '●', info: '●' };
    const tipOf = { ma50: 'ma', ma200: 'ma', ma20: 'ma', cross: 'cross', rsi: 'rsi', macd: 'macd', bb: 'bb' };
    box.innerHTML = `
      <div class="verdict ${a.verdict.signal}">${a.verdict.text}<span class="sub"> · ${a.items.filter(x => x.signal === 'up').length} olumlu, ${a.items.filter(x => x.signal === 'down').length} olumsuz sinyal</span></div>
      ${a.items.map(x => `<div class="sig"><div class="sig-h"><span class="sig-i ${x.signal}">${ico[x.signal]}</span><b>${esc(x.title)}</b> ${tip(tipOf[x.key])}<span class="sig-v">${esc(x.value)}</span></div><div class="sig-t">${esc(x.text)}</div></div>`).join('')}
      <div class="stats">
        <div><span class="sub">1 hafta</span>${chg(st.ch1w)}</div><div><span class="sub">1 ay</span>${chg(st.ch1m)}</div>
        <div><span class="sub">3 ay</span>${chg(st.ch3m)}</div><div><span class="sub">1 yıl</span>${chg(st.ch1y)}</div>
        <div><span class="sub">52 hf. en yüksek</span>${P(st.high52)}</div><div><span class="sub">52 hf. en düşük</span>${P(st.low52)}</div>
        <div><span class="sub">Destek ${tip('destek')}</span>${P(st.support)}</div><div><span class="sub">Direnç</span>${P(st.resistance)}</div>
        <div><span class="sub">Oynaklık (yıllık) ${tip('vol')}</span><span class="chg">%${fmt(st.vol, 0)}</span></div>
      </div>`;
  }
  function renderFund(f) {
    const box = $('#dFund'); if (!box) return;
    if (f.notCompany) { box.innerHTML = `<div class="note-hint">${esc(inst(detailId).name)} bir şirket hissesi değil. F/K, kâr marjı gibi temel analiz oranları şirketler için geçerlidir. Bu varlıkta fiyat hareketlerini ve teknik analizi takip etmek daha anlamlı.</div>`; return; }
    if (f.needKey) { box.innerHTML = `<div class="note-hint">ABD şirketlerinin temel verileri için Finnhub anahtarı gerekli. <a href="#ayarlar">Ayarlar</a>.</div>`; return; }
    if (f.missing) { box.innerHTML = `<div class="note-hint">Bu BIST hissesinin temel verileri henüz panelde yok. Günlük güncelleme sırasında BIST'in büyük şirketleri için F/K, PD/DD gibi oranlar ekleniyor.</div>`; return; }
    const m = f.m || {};
    const rows = FUND.filter(d => m[d.k] != null && isFinite(m[d.k]));
    let good = 0, bad = 0;
    const html = rows.map(d => { const [s, t] = d.a(m[d.k]); if (s === 'up') good++; if (s === 'down') bad++;
      return `<div class="frow"><span>${d.label} ${tip(d.tip)}</span><span class="fval">${d.f(m[d.k])}</span><span class="fa ${s}">${t}</span></div>`; }).join('');
    const verdict = good - bad >= 2 ? ['up', 'Temel görünüm güçlü'] : bad - good >= 2 ? ['down', 'Temel görünüm zayıf'] : ['neutral', 'Temel görünüm dengeli'];
    const peers = f.peers && f.peers.length ? `<div class="ch-label" style="margin-top:14px">Rakiplerle karşılaştırma</div>
      <div class="tbl-wrap"><table class="tbl compact"><thead><tr><th></th><th class="num">F/K</th><th class="num">Net marj</th><th class="num">ROE</th><th class="num">Büyüme</th></tr></thead><tbody>
      ${[{ sym: detailId, m }, ...f.peers].map((p, k) => `<tr class="${k === 0 ? 'me' : ''}"><td>${k ? `<a href="${detailHref(p.sym)}" class="sym">${esc(p.sym)}</a>` : `<b>${esc(p.sym)}</b>`}</td>
        <td class="num">${fmt(p.m.pe, 1)}</td><td class="num">${p.m.netMargin != null ? '%' + fmt(p.m.netMargin, 1) : '—'}</td><td class="num">${p.m.roe != null ? '%' + fmt(p.m.roe, 1) : '—'}</td><td class="num">${p.m.revGrowth != null ? '%' + fmt(p.m.revGrowth, 1) : '—'}</td></tr>`).join('')}
      </tbody></table></div>` : '';
    box.innerHTML = `<div class="verdict ${verdict[0]}">${verdict[1]}<span class="sub"> · ${good} güçlü, ${bad} zayıf yön</span></div>
      ${m.mcap ? `<div class="frow"><span>Piyasa değeri ${tip('mcap')}</span><span class="fval">${big(m.mcap, inst(detailId).cur)}</span><span class="fa neutral">${esc(f.industry || m.sector || '')}</span></div>` : ''}
      ${html || '<div class="note-hint">Oran verisi bulunamadı.</div>'}${peers}
      <div class="note-hint" style="margin-top:10px">Kaynak: ${esc(f.source)}${f.asOf ? ' · ' + esc(f.asOf) : ''}. Oranların "iyi/kötü" yorumu genel eşiklere dayanır, sektöre göre değişir.</div>`;
  }

  // ================= Haberler =================
  function renderHaberler(el) {
    const n = daily?.news || [];
    el.innerHTML = `<div class="section-title">${esc(daily?.updatedLabel || '')} itibarıyla</div>
      <div class="news">${n.map(x => `<article class="card news-item"><div class="tag">${esc(x.tag)}</div><h3>${esc(x.title)}</h3><p>${esc(x.text)}</p>
        <div class="why"><b>Neden önemli?</b> ${esc(x.why)}</div>
        ${x.url ? `<a class="src" href="${esc(x.url)}" target="_blank" rel="noopener">Kaynak: ${esc(x.source || 'bağlantı')} ↗</a>` : ''}</article>`).join('') || '<div class="empty">Haber yok.</div>'}</div>`;
  }

  // ================= Portföy =================
  function pfCalc() {
    const usd = quote('USDTRY')?.price;
    const rows = state.portfolio.map((h, idx) => {
      const i = inst(h.id), q = quote(h.id), px = q?.price, fxBuy = h.fxBuy || usd;
      let valTRY = null, valUSD = null, costTRY = null, costUSD = null;
      if (px != null && usd) { valTRY = i.cur === 'TRY' ? h.qty * px : h.qty * px * usd; valUSD = valTRY / usd; }
      if (fxBuy) { const cn = h.qty * h.cost; costTRY = h.costCur === 'TRY' ? cn : cn * fxBuy; costUSD = costTRY / fxBuy; }
      return { h, idx, i, q, valTRY, valUSD, costTRY, costUSD,
        plTRY: valTRY != null && costTRY != null ? valTRY - costTRY : null, plUSD: valUSD != null && costUSD != null ? valUSD - costUSD : null };
    });
    const sum = (k) => rows.reduce((a, r) => a + (r[k] ?? 0), 0);
    return { rows, usd, tot: { valTRY: sum('valTRY'), valUSD: sum('valUSD'), costTRY: sum('costTRY'), costUSD: sum('costUSD') } };
  }
  function renderPortfoy(el) {
    const ids = Array.from(new Set([...watchedIds(), ...Object.keys(CATALOG), ...Object.keys(state.custom)])).filter(id => !PROXIES[id]);
    const opts = ids.map(id => `<option value="${esc(id)}">${esc(id)} — ${esc(inst(id).name)}</option>`).join('');
    el.innerHTML = `<div id="pfDyn"></div>
      <div class="card section"><h2>Varlık ekle</h2>
        <form class="form" id="pfForm">
          <label class="field">Varlık <select id="pfId">${opts}</select></label>
          <label class="field">Adet / miktar <input id="pfQty" type="number" step="any" min="0" required placeholder="10"></label>
          <label class="field">Ort. alış fiyatı <input id="pfCost" type="number" step="any" min="0" required placeholder="300"></label>
          <label class="field">Alış para birimi <select id="pfCur"><option value="TRY">TL</option><option value="USD">USD</option></select></label>
          <label class="field">Alış günü dolar kuru (ops.) ${tip('gercek')} <input id="pfFx" type="number" step="any" min="0" placeholder="ör. 42,20"></label>
          <button class="btn" type="submit">Ekle</button>
        </form>
        <p class="note-hint" style="margin:10px 0 0">Gram altın için miktar = gram. Listede olmayan bir varlık için önce üstteki arama kutusundan bul.</p>
      </div>`;
    const sel = $('#pfId');
    const syncCur = () => { $('#pfCur').value = inst(sel.value).cur === 'TRY' ? 'TRY' : 'USD'; };
    sel.addEventListener('change', syncCur); syncCur();
    $('#pfForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const qty = parseFloat($('#pfQty').value), cost = parseFloat($('#pfCost').value), fx = parseFloat(String($('#pfFx').value).replace(',', '.'));
      if (!(qty > 0) || !(cost >= 0)) { toast('Adet ve fiyatı kontrol et'); return; }
      const h = { id: sel.value, qty, cost, costCur: $('#pfCur').value }; if (fx > 0) h.fxBuy = fx;
      state.portfolio.push(h); save(); toast(`${h.id} portföye eklendi`);
      $('#pfQty').value = ''; $('#pfCost').value = ''; $('#pfFx').value = '';
      syncFeeds(); refreshPortfoy();
    });
    $('#pfDyn').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-rm]'); if (!b) return;
      const h = state.portfolio[+b.dataset.rm]; if (!h) return;
      state.portfolio.splice(+b.dataset.rm, 1); save(); refreshPortfoy(); toast(`${h.id} portföyden silindi`);
    });
    refreshPortfoy();
  }
  const COLORS = ['#D9AE3F', '#5B9BF0', '#34D399', '#F0766B', '#B48CF2', '#4FD1C5', '#F6C177', '#8FA8CC', '#E57AB0', '#9AD36A'];
  function donut(parts) {
    const total = parts.reduce((a, p) => a + p.v, 0); if (!total) return '';
    let a0 = -Math.PI / 2; const R = 60, r = 38, c = 70;
    const pt = (rad, ang) => `${(c + rad * Math.cos(ang)).toFixed(2)} ${(c + rad * Math.sin(ang)).toFixed(2)}`;
    return `<svg width="140" height="140" viewBox="0 0 140 140">${parts.map((p, k) => {
      const a1 = a0 + p.v / total * Math.PI * 2, large = a1 - a0 > Math.PI ? 1 : 0;
      const d = parts.length === 1 ? `M ${c - R} ${c} A ${R} ${R} 0 1 1 ${c + R} ${c} A ${R} ${R} 0 1 1 ${c - R} ${c} M ${c - r} ${c} A ${r} ${r} 0 1 0 ${c + r} ${c} A ${r} ${r} 0 1 0 ${c - r} ${c}`
        : `M ${pt(R, a0)} A ${R} ${R} 0 ${large} 1 ${pt(R, a1)} L ${pt(r, a1)} A ${r} ${r} 0 ${large} 0 ${pt(r, a0)} Z`;
      a0 = a1; return `<path d="${d}" fill="${COLORS[k % COLORS.length]}" fill-rule="evenodd" stroke="#0B1D3A" stroke-width="1.5"/>`; }).join('')}</svg>`;
  }
  function refreshPortfoy() {
    const box = $('#pfDyn'); if (!box) return;
    if (!state.portfolio.length) { box.innerHTML = '<div class="card section empty">Henüz portföyüne varlık eklemedin. Aşağıdaki formdan başlayabilirsin.</div>'; return; }
    const { rows, usd, tot } = pfCalc();
    const plT = tot.valTRY - tot.costTRY, plU = tot.valUSD - tot.costUSD, pct = (a, b) => b ? a / b * 100 : null;
    const byId = {}; rows.forEach(r => { if (r.valTRY) byId[r.h.id] = (byId[r.h.id] || 0) + r.valTRY; });
    const parts = Object.entries(byId).map(([id, v]) => ({ id, v })).sort((a, b) => b.v - a.v);
    const plCell = (v, base) => v == null ? '—' : `<span class="chg ${v >= 0 ? 'up' : 'down'}">${v >= 0 ? '+' : ''}${fmt(v)}</span><div class="sub">${chg(pct(v, base))}</div>`;
    box.innerHTML = `
      <div class="totals section">
        <div class="card tile"><div class="t-name">Toplam değer (TL)</div><div class="t-val">${money(tot.valTRY, 'TRY')}</div><div class="t-sub">Kur: ${fmt(usd, 4)}</div></div>
        <div class="card tile"><div class="t-name">Toplam değer (USD)</div><div class="t-val">${money(tot.valUSD, 'USD')}</div><div class="t-sub">&nbsp;</div></div>
        <div class="card tile"><div class="t-name">Kâr/zarar (TL)</div><div class="t-val chg ${plT >= 0 ? 'up' : 'down'}">${plT >= 0 ? '+' : ''}${money(plT, 'TRY')}</div><div class="t-sub">${chg(pct(plT, tot.costTRY))}</div></div>
        <div class="card tile"><div class="t-name"><span>Kâr/zarar (USD) ${tip('gercek')}</span></div><div class="t-val chg ${plU >= 0 ? 'up' : 'down'}">${plU >= 0 ? '+' : ''}${money(plU, 'USD')}</div><div class="t-sub">${chg(pct(plU, tot.costUSD))} · gerçek getiri</div></div>
      </div>
      <div class="grid g-2 section">
        <div class="card"><h2>Dağılım</h2><div class="alloc">${donut(parts)}<div class="legend">${parts.map((p, k) => `<div><span class="sw" style="background:${COLORS[k % COLORS.length]}"></span>${esc(p.id)} · ${fmt(p.v / tot.valTRY * 100, 1)}%</div>`).join('')}</div></div></div>
        <div class="card"><h2>Piyasa bazında</h2>${Object.entries(rows.reduce((a, r) => { const k = TYPE_LABEL[r.i.type] || 'Diğer'; a[k] = (a[k] || 0) + (r.valTRY || 0); return a; }, {}))
          .sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="mv-row"><span>${k}</span><span class="chg">${money(v, 'TRY', 0)} · ${fmt(v / tot.valTRY * 100, 1)}%</span></div>`).join('')}</div>
      </div>
      <div class="card section"><div class="tbl-wrap"><table class="tbl"><thead><tr>
        <th>Varlık</th><th class="num">Adet</th><th class="num">Ort. alış</th><th class="num">Güncel</th><th class="num">Değer (TL)</th><th class="num hide-m">Değer (USD)</th><th class="num">K/Z (TL)</th><th class="num hide-m">K/Z (USD)</th><th></th>
      </tr></thead><tbody>${rows.map(r => `<tr>
        <td><a class="sym" href="${detailHref(r.h.id)}">${esc(r.h.id)}</a><div class="sub">${esc(r.i.name)}${r.q && r.q.live ? ' · canlı' : ''}</div></td>
        <td class="num">${fmt(r.h.qty, r.h.qty % 1 ? 4 : 0)}</td><td class="num">${money(r.h.cost, r.h.costCur)}</td>
        <td class="num ${r.q ? flashCls('p_' + r.idx, r.q.price) : ''}">${r.q ? money(r.q.price, r.i.cur) : '—'}</td>
        <td class="num">${money(r.valTRY, 'TRY')}</td><td class="num hide-m">${money(r.valUSD, 'USD')}</td>
        <td class="num">${plCell(r.plTRY, r.costTRY)}</td><td class="num hide-m">${plCell(r.plUSD, r.costUSD)}</td>
        <td class="num"><button class="icon-btn" data-rm="${r.idx}" title="Sil">✕</button></td></tr>`).join('')}</tbody></table></div></div>`;
  }

  // ================= Takvim =================
  function renderTakvim(el) {
    const items = (daily?.calendar || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.time || '').localeCompare(b.time || ''));
    const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Istanbul' })); today.setHours(0, 0, 0, 0);
    const groups = {}; items.forEach(x => { const k = x.when || x.date; (groups[k] = groups[k] || []).push(x); });
    const label = (x) => x.when ? esc(x.when) : new Date(x.date + 'T00:00:00').toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
    const until = (x) => { if (x.when || !x.date) return ''; const n = Math.round((new Date(x.date + 'T00:00:00') - today) / 864e5); return n === 0 ? 'bugün' : n === 1 ? 'yarın' : n > 1 ? `${n} gün sonra` : 'geçti'; };
    const imp = (n) => `<span class="imp">${[1, 2, 3].map(k => k <= n ? '●' : '<span class="off">●</span>').join('')}</span>`;
    el.innerHTML = (Object.values(groups).map(arr => `<div class="cal-day"><div class="cal-date">${label(arr[0])} <span class="sub">${until(arr[0])}</span></div>
      ${arr.map(x => `<div class="card cal-item"><div class="cal-time">${esc(x.time || '—')}</div>
        <div style="flex:1"><div><span class="flag">${esc(x.country || '')}</span><b>${esc(x.title)}</b></div>${x.note ? `<div class="sub" style="margin-top:4px">${esc(x.note)}</div>` : ''}</div>
        <div>${imp(x.importance || 1)}</div></div>`).join('')}</div>`).join('') || '<div class="empty">Takvimde etkinlik yok.</div>')
      + '<p class="note-hint">Saatler Türkiye saatidir. Önem: ●●● yüksek, ●●○ orta, ●○○ düşük.</p>';
  }

  // ================= Notlar =================
  let noteSel = 'GENEL';
  function renderNotlar(el) {
    const ids = ['GENEL', ...new Set([...watchedIds(), ...state.portfolio.map(h => h.id), ...Object.keys(state.notes).filter(k => k !== 'GENEL')])];
    if (!ids.includes(noteSel)) noteSel = 'GENEL';
    el.innerHTML = `<div class="notes-layout">
      <div class="card note-list" id="noteList">${ids.map(id => `<button data-id="${esc(id)}" class="${id === noteSel ? 'active' : ''}">${id === 'GENEL' ? 'Genel notlar' : esc(id)}${state.notes[id] ? '<span class="has">✎</span>' : ''}</button>`).join('')}</div>
      <div class="card"><h2 id="noteTitle"></h2><textarea class="note" id="noteText" placeholder="Düşüncelerin, hedef fiyatın, alım-satım gerekçen…"></textarea><div class="note-hint" id="noteStatus">Yazdıkça otomatik kaydedilir.</div></div></div>`;
    $('#noteList').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) selectNote(b.dataset.id); });
    let t;
    $('#noteText').addEventListener('input', (e) => {
      const v = e.target.value; clearTimeout(t);
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
    noteSel = id; const ta = $('#noteText'); if (!ta) return;
    document.querySelectorAll('#noteList button').forEach(b => b.classList.toggle('active', b.dataset.id === id));
    $('#noteTitle').textContent = id === 'GENEL' ? 'Genel notlar' : `${id} · ${inst(id).name}`;
    ta.value = state.notes[id] || ''; $('#noteStatus').textContent = 'Yazdıkça otomatik kaydedilir.';
  }

  // ================= Ayarlar =================
  function renderAyarlar(el) {
    el.innerHTML = `
      <div class="card section"><h2>Veri anahtarları</h2>
        <p class="note-hint" style="margin-top:0">İkisi de ücretsiz, kayıt 1 dakika sürer. Anahtarlar yalnızca bu tarayıcıda saklanır.</p>
        <div class="keybox">
          <div><b>1. Finnhub</b> · ABD hisselerinin canlı fiyatı, temel analiz, isimle arama<br>
            <span class="sub"><a href="https://finnhub.io/register" target="_blank" rel="noopener">finnhub.io/register</a> → giriş yapınca panelde görünen "API Key"</span></div>
          <form class="form" id="keyForm"><label class="field grow">Finnhub anahtarı <input id="keyIn" value="${esc(state.finnhubKey)}" placeholder="ör. c1a2b3c4d5..." autocomplete="off"></label><button class="btn" type="submit">Kaydet</button></form>
        </div>
        <div class="keybox">
          <div><b>2. Twelve Data</b> · ABD hisselerinin geçmiş grafiği ve teknik analizi<br>
            <span class="sub"><a href="https://twelvedata.com/register" target="_blank" rel="noopener">twelvedata.com/register</a> → Dashboard → "API Keys"</span></div>
          <form class="form" id="tdForm"><label class="field grow">Twelve Data anahtarı <input id="tdIn" value="${esc(state.tdKey)}" placeholder="ör. 9f8e7d..." autocomplete="off"></label><button class="btn" type="submit">Kaydet</button></form>
        </div>
        <p class="note-hint">Kripto, altın ve döviz için anahtar gerekmez. Bunlarda grafik ve teknik analiz anahtarsız çalışır.</p>
      </div>
      <div class="card section"><h2>Yedekleme</h2>
        <p class="note-hint" style="margin-top:0">Listelerin, portföyün, alarmların ve notların bu tarayıcıda saklanıyor. Başka cihaza taşımak için dışa aktar, diğer cihazda içe aktar.</p>
        <div class="form">
          <button class="btn" id="expBtn" type="button">Dışa aktar (.json)</button>
          <label class="btn ghost" style="cursor:pointer">İçe aktar<input type="file" id="impIn" accept="application/json,.json" hidden></label>
          <button class="btn ghost" id="tourBtn" type="button">Tanıtımı tekrar göster</button>
        </div></div>
      <div class="card"><h2>Veri kaynakları</h2>
        <div class="mv-row"><span>Kripto, USD/TRY, EUR/TRY, ons ve gram altın (canlı + grafik)</span><span class="muted">Binance</span></div>
        <div class="mv-row"><span>ABD hisseleri canlı fiyat, temel analiz, arama</span><span class="muted">Finnhub</span></div>
        <div class="mv-row"><span>ABD hisseleri geçmiş grafik</span><span class="muted">Twelve Data</span></div>
        <div class="mv-row"><span>BIST, kapanışlar, haberler, takvim, BIST temel verileri</span><span class="muted">Günlük güncelleme</span></div>
        <p class="note-hint">Grafikler <a href="https://www.tradingview.com/lightweight-charts/" target="_blank" rel="noopener">TradingView Lightweight Charts</a> ile çizilir. Kur ve altın, USDT ve PAXG paritelerinden hesaplanır. Bankalardaki fiyatlardan bir miktar farklı olabilir. Bu panel bilgi amaçlıdır, yatırım tavsiyesi değildir.</p>
      </div>`;
    $('#keyForm').addEventListener('submit', (e) => {
      e.preventDefault(); state.finnhubKey = $('#keyIn').value.trim(); save();
      toast(state.finnhubKey ? 'Finnhub anahtarı kaydedildi, bağlanılıyor…' : 'Anahtar silindi');
      Object.keys(fhPrev).forEach(k => delete fhPrev[k]); fhQuotes().then(fhConnect);
    });
    $('#tdForm').addEventListener('submit', async (e) => {
      e.preventDefault(); state.tdKey = $('#tdIn').value.trim(); save();
      Object.keys(memCandles).forEach(k => delete memCandles[k]);
      if (!state.tdKey) { toast('Anahtar silindi'); return; }
      toast('Kontrol ediliyor…');
      try { await tdSeries('AAPL'); toast('Twelve Data anahtarı çalışıyor ✓'); } catch (err) { toast(err.td === 401 ? 'Twelve Data anahtarı geçersiz' : 'Kontrol edilemedi: ' + err.message); }
    });
    $('#expBtn').addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
      a.download = 'piyasa-paneli-yedek-' + todayStr() + '.json'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    $('#impIn').addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const s = JSON.parse(await f.text());
        if (s.watch && !s.lists) s.lists = [{ name: 'Ana liste', ids: s.watch }];
        ['lists', 'activeList', 'custom', 'portfolio', 'notes', 'finnhubKey', 'tdKey', 'alarms', 'ind'].forEach(k => { if (s[k] !== undefined) state[k] = s[k]; });
        save(); toast('Yedek içe aktarıldı'); syncFeeds(); fhConnect(); updateAlarmBadge(); renderView();
      } catch (err) { toast('Dosya okunamadı'); }
    });
    $('#tourBtn').addEventListener('click', () => showTour(0));
  }

  // ================= Tanıtım turu =================
  const TOUR = [
    { t: 'Piyasa Paneli\'ne hoş geldin 👋', b: 'ABD borsası, Borsa İstanbul, döviz, altın ve kripto tek ekranda. Kısaca nasıl kullanılacağını göstereyim, 4 adım sürer.' },
    { t: 'Sol menü', b: '<b>Günlük Özet</b>: günün hikâyesi ve tüm piyasalar.<br><b>İzleme Listeleri</b>: takip ettiğin varlıklar ve alarmlar.<br><b>Portföyüm</b>: varlıklarının TL ve dolar bazında kâr/zararı.<br>Telefonda menüyü sol üstteki ☰ ile açarsın.' },
    { t: 'Arama ve varlık sayfası', b: 'Üstteki arama kutusuna "apple", "aselsan" ya da "solana" yaz. Açılan sayfada <b>mum grafiği</b>, <b>teknik analiz</b> (RSI, MACD, ortalamalar), <b>temel analiz</b> (F/K, kâr marjı…) ve alarm kurma var. Her kutuya tıklayınca da o sayfa açılır.' },
    { t: 'ⓘ işaretlerine dikkat', b: 'Bilmediğin bir terim gördüğünde yanındaki <span class="tip-demo">ⓘ</span> işaretine dokun, sade bir açıklama çıkar.<br><br>Son olarak: ABD hisseleri için <b>Ayarlar</b>\'dan iki ücretsiz anahtar (Finnhub, Twelve Data) ekleyebilirsin. Hazırsın!' },
  ];
  function showTour(k) {
    const o = $('#tour'); if (!o) return;
    if (k >= TOUR.length) { o.hidden = true; state.seenTour = true; save(); return; }
    const s = TOUR[k];
    o.innerHTML = `<div class="tour-box card"><div class="tour-step">${k + 1} / ${TOUR.length}</div><h3>${s.t}</h3><p>${s.b}</p>
      <div class="tour-dots">${TOUR.map((_, j) => `<span class="${j === k ? 'on' : ''}"></span>`).join('')}</div>
      <div class="tour-btns"><button class="btn ghost sm" data-t="skip">Atla</button><button class="btn" data-t="next">${k === TOUR.length - 1 ? 'Başla' : 'İleri →'}</button></div></div>`;
    o.hidden = false;
    o.onclick = (e) => { const b = e.target.closest('[data-t]'); if (!b) return; showTour(b.dataset.t === 'skip' ? TOUR.length : k + 1); };
  }

  // ================= Tooltip (dokunmatik için) =================
  function initTips() {
    const bubble = $('#tipBubble');
    const show = (el) => {
      bubble.textContent = el.dataset.tip; bubble.hidden = false;
      const r = el.getBoundingClientRect(), bw = Math.min(300, innerWidth - 24);
      bubble.style.width = bw + 'px';
      let left = r.left + r.width / 2 - bw / 2; left = Math.max(12, Math.min(left, innerWidth - bw - 12));
      bubble.style.left = left + 'px';
      const bh = bubble.offsetHeight;
      bubble.style.top = (r.top - bh - 8 > 8 ? r.top - bh - 8 : r.bottom + 8) + 'px';
    };
    let pinned = 0;
    const hide = () => { if (Date.now() - pinned > 600) bubble.hidden = true; };
    document.addEventListener('mouseover', (e) => { const t = e.target.closest('.tip'); if (t) show(t); });
    document.addEventListener('mouseout', (e) => { if (e.target.closest('.tip')) hide(); });
    document.addEventListener('click', (e) => { const t = e.target.closest('.tip'); if (t) { e.preventDefault(); e.stopPropagation(); pinned = Date.now(); show(t); } else { pinned = 0; hide(); } }, true);
    document.addEventListener('focusin', (e) => { const t = e.target.closest('.tip'); if (t) show(t); });
    window.addEventListener('scroll', hide, { passive: true });
  }

  // ================= Günlük veri =================
  let dailyLoadedOnce = false;
  async function loadDaily() {
    try {
      const r = await fetch('data.json?t=' + Date.now());
      daily = await r.json();
      $('#updLabel').textContent = 'Günlük veri: ' + (daily.updatedLabel || '—');
      Object.keys(daily.quotes || {}).forEach(id => dirty.add(id));
      if (!dailyLoadedOnce || ['ozet', 'haberler', 'takvim'].includes(current)) renderView();
      dailyLoadedOnce = true;
    } catch (e) { $('#updLabel').textContent = 'Günlük veri yüklenemedi'; }
  }

  // ================= Saat =================
  function marketOpen(tz, oh, om, ch, cm) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' })
      .formatToParts(new Date()).map(x => [x.type, x.value]));
    if (p.weekday === 'Sat' || p.weekday === 'Sun') return false;
    const m = +p.hour * 60 + +p.minute; return m >= oh * 60 + om && m < ch * 60 + cm;
  }
  function tickClock() {
    const t = new Date().toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' });
    const us = marketOpen('America/New_York', 9, 30, 16, 0), bist = marketOpen('Europe/Istanbul', 10, 0, 18, 0);
    $('#clock').innerHTML = `${t}<span class="mk"> · BIST ${bist ? '<span class="chg up">açık</span>' : 'kapalı'} · ABD ${us ? '<span class="chg up">açık</span>' : 'kapalı'}</span>`;
  }

  // ================= Arka plan =================
  function drawNet() {
    const svg = $('#bgNet'), w = innerWidth, h = innerHeight;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const pts = Array.from({ length: Math.round(w * h / 38000) }, () => [rnd() * w, rnd() * h]);
    let out = '';
    pts.forEach((a, i) => pts.slice(i + 1).forEach(b => { const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (d < 190) out += `<line x1="${a[0].toFixed(0)}" y1="${a[1].toFixed(0)}" x2="${b[0].toFixed(0)}" y2="${b[1].toFixed(0)}" stroke="rgba(150,190,240,${(0.12 * (1 - d / 190)).toFixed(3)})" stroke-width="1"/>`; }));
    pts.forEach(p => out += `<circle cx="${p[0].toFixed(0)}" cy="${p[1].toFixed(0)}" r="1.6" fill="rgba(180,210,250,.35)"/>`);
    svg.innerHTML = out;
  }

  // ================= Başlat =================
  $('#menuBtn').addEventListener('click', () => document.body.classList.toggle('menu-open'));
  $('#scrim').addEventListener('click', () => document.body.classList.remove('menu-open'));
  window.addEventListener('hashchange', route);
  let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { drawNet(); if (current === 'varlik') drawCharts(); }, 250); });
  initSearch(); initTips();
  drawNet(); tickClock(); setInterval(tickClock, 15000);
  route();
  loadDaily(); setInterval(loadDaily, 10 * 60 * 1000);
  binSnapshot(); binConnect(true); fhQuotes().then(fhConnect);
  setInterval(() => fhQuotes(), 60 * 1000);
  updateAlarmBadge();
  if (!state.seenTour) setTimeout(() => showTour(0), 600);
  setInterval(() => {
    if (!dirty.size) return;
    dirty.clear();
    checkAlarms();
    const v = VIEWS[current], ae = document.activeElement;
    if (v.refresh && !(ae && ae.closest && ae.closest('#pfDyn, .list-edit'))) v.refresh();
  }, 1200);

  window.__panel = { state, live, quote, pfCalc, setLive, getCandles, TA: window.TA };
})();
