# Piyasa Paneli

Kişisel finans terminali: ABD borsası, Borsa İstanbul, döviz, altın, kripto ve emtia tek ekranda.

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
| BIST, kapanışlar, haberler, takvim | `data.json` | Her iş günü |

Kişisel veriler (portföy, notlar, izleme listesi, API anahtarı) yalnızca tarayıcının `localStorage`'ında tutulur. Ayarlar > Yedekleme ile dışa/içe aktarılabilir.

## Dosyalar
- `index.html`, `styles.css`, `app.js`: uygulama (derleme gerektirmez)
- `data.json`: günlük güncellenen içerik

Bilgi amaçlıdır, yatırım tavsiyesi değildir.
