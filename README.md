# Piyasa Paneli

Kişisel finans terminali: ABD borsası, Borsa İstanbul, döviz, altın, kripto ve emtia tek ekranda.

## Sürüm 2'de yeni
- Üst çubukta **arama** (isimle: "apple", "aselsan", "solana")
- **Varlık sayfası**: mum grafiği, MA20/50/200, Bollinger, RSI, MACD, Türkçe teknik yorum, temel analiz (F/K, PD/DD, marjlar, büyüme, rakip karşılaştırması), alarm ve not
- **Birden fazla izleme listesi** ve **fiyat alarmları**
- İlk açılışta **tanıtım turu**, terimlerin yanında **ⓘ açıklamalar**

## Bölümler
- **Günlük Özet**: endeksler, döviz/altın, kripto/emtia, günün hikâyesi, BIST'te öne çıkanlar
- **İzleme Listesi**: canlı fiyatlar, oturum içi mini grafik, ekle/çıkar/sırala
- **Haberler**: günün 4-6 haberi ve "neden önemli" notu
- **Portföyüm**: TL ve USD bazında değer, kâr/zarar, dağılım
- **Ekonomik Takvim**: yaklaşan kritik veriler ve bilançolar
- **Notlarım**: varlık bazında kişisel notlar

## Veri kaynakları
| Veri | Kaynak | Sıklık |
|---|---|---|
| Kripto, USD/TRY, EUR/TRY, ons/gram altın | Binance (WebSocket) | Canlı |
| ABD hisseleri, SPY/QQQ/DIA, USO | Finnhub (ücretsiz anahtar, Ayarlar'dan girilir) | Canlı |
| Geçmiş grafik (kripto/altın/döviz) | Binance | Anahtarsız |
| Geçmiş grafik (ABD) | Twelve Data (ücretsiz anahtar) | Günlük önbellek |
| BIST, kapanışlar, haberler, takvim, BIST temel verileri ve kapanış arşivi | `data.json` | Her iş günü |

Kişisel veriler (portföy, notlar, izleme listesi, API anahtarı) yalnızca tarayıcının `localStorage`'ında tutulur. Ayarlar > Yedekleme ile dışa/içe aktarılabilir.

## Dosyalar
- `index.html`, `styles.css`, `app.js`, `ta.js` (teknik analiz hesapları): uygulama (derleme gerektirmez)
- `lib/lightweight-charts.js`: TradingView Lightweight Charts v4.2 (Apache 2.0)
- `data.json`: günlük güncellenen içerik

Bilgi amaçlıdır, yatırım tavsiyesi değildir.
