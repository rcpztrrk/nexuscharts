# NexusCharts - Yol Haritası (Roadmap)

## Faz 1: "Hello Triangle" (Core Setup MVP)
**Hedef:** C++ (veya Rust) kodunu Emscripten ile derleyip, bir `<canvas>` üzerinde ilk WebGL çizimini yapmak.
- [ ] CMake / Emscripten projelerinin C++ için kurulması.
- [ ] TypeScript npm package yapısının (Rollup/Tailwind vs.) hazırlanması.
- [ ] TypeScript'den çağrılan (exported) fonksiyonlarla C++ dünyasına veri basma yeteneği.

## Faz 2: "Render The Ticks" (Grid & Candles)
**Hedef:** WebGL motorunu sadece mum (candlestick) ve zaman eksenini çizecek şekilde optimize etmek.
- [ ] `Orthographic Camera` (2D Matrix projeksiyon) mantığının C++ tarafında kurulması.
- [ ] `Instanced Rendering` tekniği ile ekrandaki tüm mumların tek bir "Draw Call" ile GPU'ya yollanması.
- [ ] Dinamik X (Zaman) ve Y (Fiyat) ekseni hesaplayıcıları ve cizgilerin (Grid) çizimi.

## Faz 3: "Pan & Zoom" (Interaction)
**Hedef:** Yüksek performanslı ve "yağ gibi akan" kaydırma deneyimi.
- [ ] Fare ve Tekerlek (Mouse Wheel) eventlerinin TS'den yakalanıp WASM Camera objesine aktarılması.
- [ ] Y-Ekseni otomatik ölçekleme (Auto-scaling = ekrandaki mumların en yüksek ve en düşük değerine göre ekranı daraltma).

## Faz 4: "The Developer Open API" (Extensibility)
**Hedef:** Bu kütüphaneyi kullananların kendi trend çizgilerini, Fibonacci'lerini API ile rahatça çizebilmesi (Lightweight Charts'ı ezeceğimiz yer).
- [ ] API üzerinden `addDrawing({ type: 'Line', p1: {time, price}, p2: {...} })` gibi basit komutlar.
- [ ] `Custom Series` yeteneği (örneğin mum haricinde Histogram, Area gibi yapılar).
