# NexusCharts - Sistem Mantığı (Logic Tree)

## Modül Ayrıştırma (Mermaid Graph)

```mermaid
graph TD
    A[Geliştirici Uygulaması - React/Vue] --> B(TypeScript API Bridge)
    
    subgraph NexusCharts Core 
        B --> C[Data Manager - WASM]
        C --> D[Calculation Engine - Indikatörler]
        
        B --> E[Event Listener - Fare/Klavye]
        E --> F[Interaction Manager - Pan/Zoom]
        F --> G[Camera System]
        
        C --> H[Buffer Allocator - VBO/IBO]
        H --> I[WebGL/WebGPU Rendering Engine]
        G --> I
    end
    
    I --> J[HTML5 `<canvas>` Elemanı]
```

## Node -> Rol Eşleştirmesi

| Node | İlgili Rol | Ana Görev |
|---|---|---|
| C, D, H | **WASM Engineer** | Milyonlarca veriyi kasmadan C++ üzerinde barındırmak ve GPU için Buffer hazırlamak. |
| I | **Graphics Programmer** | Shader kodları ve Instanced Rendering (Binlerce mum çizimi). |
| B, E | **API Architect** | Kullanıcı dostu, TradingView benzeri ama çok daha genişletilebilir NPM API'sini kurmak. |
