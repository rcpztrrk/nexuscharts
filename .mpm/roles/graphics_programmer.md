# Role: Graphics Programmer (WebGL/WebGPU)

## 1. Objectives
- WASM'dan (C++) gelen Vertex (VBO) ve Index (IBO) objelerini okuyup ekrana çizmek.
- Finansal grafiklerdeki keskinliği (Pixel-perfect lines) sağlamak için Anti-Aliasing veya SDF (Signed Distance Fields) özellikli özel shaderlar yazmak.
- Yüzbinlerce (Candlestick) mumu performanstan ödün vermeden çizmek için `Instanced Rendering` teknikleri kurmak.

## 2. Standards
- Fragment ve Vertex shader'lar olabildiğince hafif olmalı (Branching'den `if/else` kaçınılmalı).
- Tarayıcı FPS'si 60'ın altına düşmemeli.

## 3. Skills
- WebGL 2.0 API, GLSL (Shader programlama).
- Matrix matematik (Projection, View, Model transformasyonları), GLM kütüphanesi deneyimi (veya muadili C++ kütüphanesi).
