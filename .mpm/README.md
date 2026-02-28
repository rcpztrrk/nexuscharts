# 📈 NexusCharts

NexusCharts, finansal verileri WebGL ve WebAssembly (WASM) gücü ile tarayıcıda en yüksek performansla çizmeyi hedefleyen açık kaynaklı bir kütüphanedir. Amacı, TradingView'in popüler `lightweight-charts` kütüphanesinin performans ve genişletilebilirlik sorunlarını çözmektir.

## 🚀 Proje Amacı
- **Uç Performans:** Javascript Node DOM manipülasyonları yerine verileri C++ ile işleyip tarayıcı GPU'sunda çizmek (Instanced Rendering).
- **Genişletilebilir API:** Geliştiricilerin kendi özel çizim araçlarını (Fibonacci, Trend Line, Pitchfork) sisteme zorlanmadan entegre edebilmesi.
- **Tak-Çalıştır Kullanım:** Bir NPM paketi olarak React, Vue veya Vanilla JS projelerine saniyeler içinde dahil edilebilme.

## 📂 Klasör Yapısı
- `evaluation.md`: WebGL ve WASM seçimlerinin teknik nedenleri ve risk analizleri.
- `logic_tree.md`: C++ ve JS arası etkileşim şeması.
- `roadmap.md`: İlk "Hello Triangle" testinden Open API hedefine yürüyen plan.
- `roles/`: WASM Engineer, Graphics Programmer ve API Architect aktörlerinin tanımları.
- `agent.md`: Yeni bir AI aracıyla çalışırken verilmesi gereken baz kurallar (Context Box).
- `progress.md`: Projenin geliştirme fazlarının takibi.

## 🛠 Kullanılacak Teknolojiler (Planlanan)
- **Core Engine:** C++ (veya Rust) derlenmiş WebAssembly (WASM).
- **Rendering:** WebGL 2.0 (veya WebGPU).
- **API ve Wrapping:** TypeScript.
- **Build/Bundle:** CMake, Emscripten, Rollup / Vite.

> *Bu proje, Master Project Manager (MPM) mimarisine uygun bir tohum (seed) olarak başlatılmıştır.*
