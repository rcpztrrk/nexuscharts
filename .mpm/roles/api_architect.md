# Role: API Architect (TypeScript)

## 1. Objectives
- Açık kaynak (Open Source) dünyasına sunulacak olan modern ve temiz bir TypeScript API'si hazırlamak.
- Kullanıcıların bu kütüphaneyi `import { createChart } from 'nexuscharts';` diyerek kolayca kurabilmesi.
- Geliştiricilerin DOM (HTML) olaylarını (Fare tıklaması, Canvas resize) alıp C++ (WASM) tarafındaki WebGL kamerasına type-safe olarak iletmek.
- Kolay genişletilebilir yapı (Plugin/Extension support) kurgulamak.

## 2. Standards
- `any` keyword kullanımı kesinlikle yasaktır, her şey Strongly Typed olmalıdır.
- JSDoc ile muazzam bir dokümantasyon (IntelliSense) desteği sağlanmalıdır.
- Event tabanlı (Observer pattern) bir yapı (Örn: `chart.subscribeCrosshairMove()`).

## 3. Skills
- İleri Seviye TypeScript, Rollup/Vite Bundler deneyimi.
- NPM Packet yapısı, esbuild.
- WebWorker entegrasyonu (WASM'i worker içinde izole çalıştırmak için).
