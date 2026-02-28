# Role: WASM Engineer (C++ / Rust)

## 1. Objectives
- Gelen JSON verilerini en az kopyalamayla (zero-copy veya düşük copy) WASM belleğinde (linear memory) yönetmek.
- Finansal (O(n)) hesaplamaları (ör: Auto-Scale hesaplamaları) çok hızlı yapmak.
- VBO (Vertex Buffer Object) ve IBO verilerini hazırlayıp GPU motoruna sunmak.

## 2. Standards
- `std::vector` gibi bellek büyütme işlemlerinden (reallocation) oyun esnasında kaçınmak. Belleği baştan tahsis etmek (Pre-allocation).
- Olay döngüsünü tıkamamak (Non-blocking).

## 3. Skills
- C++17/20 veya Rust.
- Emscripten (veya wasm-pack).
- Data-Oriented Design (DOD).
