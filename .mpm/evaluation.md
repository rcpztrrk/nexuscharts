# NexusCharts - Teknik Plan ve Gereksinimler

## 1. Proje Kimliği (Identity)
- **Adı:** NexusCharts
- **Vizyon:** TradingView'in `lightweight-charts` kütüphanesini ezip geçecek, WebGL/WASM destekli, saniyede milyonlarca mumu (candlestick) sıfır gecikmeyle çizebilen, özel çizim araçlarına (drawing tools) tam yetki veren açık kaynaklı finansal grafik kütüphanesi.
- **Odak:** Hardcore performans, veri yoğunluklu analizler (Orderbook heatmap, tick data), açık mimari.

## 2. Teknik Gereksinimler (Tech Stack)
- **Core Engine:** C++ (veya Rust) derlenmiş WebAssembly (WASM).
- **Rendering:** WebGL 2.0 (veya WebGPU).
- **Interface / API:** TypeScript (Geliştiricilerin React/Vue projelerine kolayca NPM paketi olarak kurabilmesi için).
- **Build Tool:** CMake / Emscripten, Rollup / Vite (JS tarafı).

## 3. Gerekli Roller (Ajanlar)
| Rol | Tanım | Dosya |
|---|---|---|
| **WASM Engineer** | C++ veri yapılarını ve bellek yönetimini WASM'a bağlar. | `roles/wasm_engineer.md` |
| **Graphics Programmer** | WebGL 2.0 shader'larını (Instanced Rendering vb.) yazar. | `roles/graphics_programmer.md` |
| **API Architect** | Type-safe TypeScript köprüsünü (Bridge) tasarlar. | `roles/api_architect.md` |

## 4. Riskler ve Çözümler
- **Risk 1:** C++ ve JS arasında veri kopyalama (Copy/Serialization) darboğazı.
  - *Çözüm:* JSON stringify kullanmak yerine, doğrudan WebAssembly bellek tahsisatı (SharedArrayBuffer) üzerinden verileri okumak.
- **Risk 2:** Açık kaynak camiasının C++ koduna katkı vermekten çekinmesi.
  - *Çözüm:* Engine çok iyi kapsüllenmeli (Encapsulation). Pluginler ve İndikatörler tamamen TypeScript üzerinden yazılabilmeli.

## 5. Başarı Kriterleri
- NPM kütüphanesi olarak kurulabilmeli (`npm i nexuscharts`).
- API üzerinden grafiğe dışarıdan Trend Çizgisi, Fibonacci rahatlıkla eklenebilmeli.
- 1 Milyon tick verisi eklendiğinde bile pan/zoom anında FPS 60'ın altına düşmemeli.
