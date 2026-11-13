/* Teknik analiz: göstergeler ve sade Türkçe yorumlar.
 * Saf fonksiyonlar; tarayıcıda window.TA, Node'da module.exports.
 * Girdi: candles = [{time, open, high, low, close}] (eskiden yeniye)
 */
(function (root) {
  'use strict';

  function sma(vals, n) {
    const out = new Array(vals.length).fill(null);
    let s = 0;
    for (let i = 0; i < vals.length; i++) {
      s += vals[i];
      if (i >= n) s -= vals[i - n];
      if (i >= n - 1) out[i] = s / n;
    }
    return out;
  }

  function ema(vals, n) {
    const out = new Array(vals.length).fill(null);
    if (vals.length < n) return out;
    const k = 2 / (n + 1);
    let prev = vals.slice(0, n).reduce((a, b) => a + b, 0) / n;
    out[n - 1] = prev;
    for (let i = n; i < vals.length; i++) { prev = vals[i] * k + prev * (1 - k); out[i] = prev; }
    return out;
  }

  // Wilder RSI
  function rsi(vals, n = 14) {
    const out = new Array(vals.length).fill(null);
    if (vals.length <= n) return out;
    let g = 0, l = 0;
    for (let i = 1; i <= n; i++) { const d = vals[i] - vals[i - 1]; if (d >= 0) g += d; else l -= d; }
    g /= n; l /= n;
    out[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    for (let i = n + 1; i < vals.length; i++) {
      const d = vals[i] - vals[i - 1];
      g = (g * (n - 1) + Math.max(d, 0)) / n;
      l = (l * (n - 1) + Math.max(-d, 0)) / n;
      out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    }
    return out;
  }

  function macd(vals, f = 12, s = 26, sig = 9) {
    const ef = ema(vals, f), es = ema(vals, s);
    const line = vals.map((_, i) => ef[i] != null && es[i] != null ? ef[i] - es[i] : null);
    const start = line.findIndex(v => v != null);
    const signal = new Array(vals.length).fill(null);
    if (start >= 0) {
      const sub = ema(line.slice(start), sig);
      sub.forEach((v, i) => { signal[start + i] = v; });
    }
    const hist = line.map((v, i) => v != null && signal[i] != null ? v - signal[i] : null);
    return { line, signal, hist };
  }

  function bollinger(vals, n = 20, k = 2) {
    const mid = sma(vals, n);
    const up = new Array(vals.length).fill(null), lo = new Array(vals.length).fill(null);
    for (let i = n - 1; i < vals.length; i++) {
      const w = vals.slice(i - n + 1, i + 1), m = mid[i];
      const sd = Math.sqrt(w.reduce((a, v) => a + (v - m) ** 2, 0) / n);
      up[i] = m + k * sd; lo[i] = m - k * sd;
    }
    return { mid, up, lo };
  }

  const last = (arr) => { for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i]; return null; };
  const fmtP = (v) => v == null ? '—' : v.toLocaleString('tr-TR', { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 2 });

  /* Her gösterge için: { key, title, value, signal: 'up'|'down'|'neutral', text } */
  function analyze(candles) {
    const c = candles.map(x => x.close);
    const n = c.length;
    const res = { items: [], score: 0, count: 0, stats: {} };
    if (n < 30) { res.tooShort = true; return res; }
    const price = c[n - 1];
    const push = (it) => { res.items.push(it); if (it.signal === 'up') res.score++; if (it.signal === 'down') res.score--; if (it.signal !== 'info') res.count++; };

    // Trend: hareketli ortalamalar
    const m20 = last(sma(c, 20)), m50 = n >= 50 ? last(sma(c, 50)) : null, m200 = n >= 200 ? last(sma(c, 200)) : null;
    if (m50 != null) {
      const above = price > m50;
      push({ key: 'ma50', title: 'Orta vadeli trend (MA50)', value: fmtP(m50), signal: above ? 'up' : 'down',
        text: above ? `Fiyat son 50 günün ortalamasının üzerinde. Orta vadede alıcılar daha baskın.`
                    : `Fiyat son 50 günün ortalamasının altında. Orta vadede satıcılar daha baskın.` });
    }
    if (m200 != null) {
      const above = price > m200;
      push({ key: 'ma200', title: 'Uzun vadeli trend (MA200)', value: fmtP(m200), signal: above ? 'up' : 'down',
        text: above ? `Fiyat 200 günlük ortalamanın üzerinde: uzun vadeli yükseliş trendi sürüyor.`
                    : `Fiyat 200 günlük ortalamanın altında: uzun vadede düşüş trendi var. Birçok yatırımcı bu çizgiyi "boğa/ayı sınırı" olarak izler.` });
      // Altın / ölüm kesişimi (son 20 günde)
      const s50 = sma(c, 50), s200 = sma(c, 200);
      for (let i = n - 1; i >= Math.max(n - 20, 200); i--) {
        const a = s50[i] - s200[i], b = s50[i - 1] - s200[i - 1];
        if (a > 0 && b <= 0) { push({ key: 'cross', title: 'Altın kesişim', value: `${n - 1 - i} gün önce`, signal: 'up', text: 'MA50, MA200\'ü yukarı kesti. Klasik olarak güçlü bir yükseliş sinyali sayılır.' }); break; }
        if (a < 0 && b >= 0) { push({ key: 'cross', title: 'Ölüm kesişimi', value: `${n - 1 - i} gün önce`, signal: 'down', text: 'MA50, MA200\'ü aşağı kesti. Klasik olarak uzun vadeli zayıflık sinyali sayılır.' }); break; }
      }
    } else if (m20 != null && m50 == null) {
      push({ key: 'ma20', title: 'Kısa vadeli trend (MA20)', value: fmtP(m20), signal: price > m20 ? 'up' : 'down',
        text: price > m20 ? 'Fiyat 20 günlük ortalamanın üzerinde.' : 'Fiyat 20 günlük ortalamanın altında.' });
    }

    // RSI
    const r = last(rsi(c, 14));
    if (r != null) {
      let signal = 'neutral', text;
      if (r >= 70) { signal = 'down'; text = `RSI ${r.toFixed(0)}: aşırı alım bölgesinde. Fiyat kısa sürede çok yükseldi, kâr satışı/düzeltme riski arttı.`; }
      else if (r <= 30) { signal = 'up'; text = `RSI ${r.toFixed(0)}: aşırı satım bölgesinde. Fiyat kısa sürede çok düştü, tepki yükselişi gelebilir.`; }
      else if (r >= 55) { signal = 'up'; text = `RSI ${r.toFixed(0)}: alıcılar hafif önde, ama henüz aşırı alım yok.`; }
      else if (r <= 45) { signal = 'down'; text = `RSI ${r.toFixed(0)}: satıcılar hafif önde, ama henüz aşırı satım yok.`; }
      else text = `RSI ${r.toFixed(0)}: nötr bölge, alıcılar ve satıcılar dengede.`;
      push({ key: 'rsi', title: 'RSI (14) · momentum', value: r.toFixed(1), signal, text });
    }

    // MACD
    const md = macd(c);
    const L = last(md.line), S = last(md.signal);
    if (L != null && S != null) {
      let crossAgo = null, crossUp = null;
      for (let i = n - 1; i >= Math.max(n - 10, 1); i--) {
        const a = md.hist[i], b = md.hist[i - 1];
        if (a == null || b == null) break;
        if ((a > 0) !== (b > 0)) { crossAgo = n - 1 - i; crossUp = a > 0; break; }
      }
      const up = L > S;
      let text = up ? 'MACD sinyal çizgisinin üzerinde: yukarı yönlü momentum var.' : 'MACD sinyal çizgisinin altında: aşağı yönlü momentum var.';
      if (crossAgo != null) text += ` ${crossAgo === 0 ? 'Bugün' : crossAgo + ' gün önce'} ${crossUp ? 'yukarı' : 'aşağı'} kesişim oldu, yani yön ${crossUp ? 'yukarı' : 'aşağı'} döndü.`;
      push({ key: 'macd', title: 'MACD · momentum yönü', value: (L - S).toFixed(Math.abs(L) < 1 ? 4 : 2), signal: up ? 'up' : 'down', text });
    }

    // Bollinger
    const bb = bollinger(c);
    const U = last(bb.up), D = last(bb.lo), M = last(bb.mid);
    if (U != null) {
      const pos = (price - D) / (U - D); // 0 alt bant, 1 üst bant
      const widths = bb.up.map((u, i) => u != null ? (u - bb.lo[i]) / bb.mid[i] : null).filter(v => v != null);
      const w = widths[widths.length - 1], minW = Math.min(...widths.slice(-120));
      let signal = 'neutral', text;
      if (pos > 1) { signal = 'down'; text = 'Fiyat üst bandın dışına çıktı: aşırı gerilmiş, geri çekilme olası.'; }
      else if (pos < 0) { signal = 'up'; text = 'Fiyat alt bandın dışına indi: aşırı satılmış, tepki gelebilir.'; }
      else if (pos > 0.8) text = 'Fiyat üst banda yakın: güçlü ama gerilmeye başlıyor.';
      else if (pos < 0.2) text = 'Fiyat alt banda yakın: zayıf ama destek bölgesinde.';
      else text = 'Fiyat bantların ortasında: belirgin bir aşırılık yok.';
      if (w <= minW * 1.1) text += ' Bantlar çok daraldı ("sıkışma"): genelde sert bir hareket öncesi görülür.';
      push({ key: 'bb', title: 'Bollinger bantları · oynaklık', value: `%${Math.round(pos * 100)}`, signal, text });
    }

    // İstatistikler
    const look = (d) => n > d ? (price / c[n - 1 - d] - 1) * 100 : null;
    const yr = candles.slice(-252);
    res.stats = {
      high52: Math.max(...yr.map(x => x.high)), low52: Math.min(...yr.map(x => x.low)),
      ch1w: look(5), ch1m: look(21), ch3m: look(63), ch1y: look(252),
      vol: (() => { // yıllık oynaklık
        const rets = c.slice(-61).map((v, i, a) => i ? Math.log(v / a[i - 1]) : null).filter(v => v != null);
        const m = rets.reduce((a, b) => a + b, 0) / rets.length;
        return Math.sqrt(rets.reduce((a, b) => a + (b - m) ** 2, 0) / rets.length) * Math.sqrt(252) * 100;
      })(),
    };
    // Destek / direnç: son 60 günün dip ve tepesi
    const w60 = candles.slice(-60);
    res.stats.support = Math.min(...w60.map(x => x.low));
    res.stats.resistance = Math.max(...w60.map(x => x.high));

    const s = res.score;
    res.verdict = s >= 2 ? { signal: 'up', text: 'Teknik görünüm olumlu' }
      : s <= -2 ? { signal: 'down', text: 'Teknik görünüm olumsuz' }
      : { signal: 'neutral', text: 'Teknik görünüm karışık' };
    return res;
  }

  const api = { sma, ema, rsi, macd, bollinger, analyze };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TA = api;
})(typeof window !== 'undefined' ? window : this);
