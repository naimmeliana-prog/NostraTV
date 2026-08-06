# NOSTRA TV - Native IPTV App for LG webOS 6.5.3+ (6.x)

**NOSTRA TV** es una app IPTV premium nativa desarrollada para **LG webOS 6.5.3** (compatible con webOS 6.x+). Reproduce listas **M3U**, **Xtream Codes** y portales **MAC Stalker** con una interfaz moderna, fluida y optimizada para mando a distancia (Magic Remote y teclas de color).

---

## ⚡ Características Principales

- **Login en 3 Modos**:
  - **M3U**: URL directa + EPG XMLTV opcional.
  - **Xtream Codes**: Host/Servidor + Usuario + Contraseña.
  - **MAC Stalker**: Portal URL + Dirección MAC (portado del motor `stalker-m3u`).
- **Subida de Playlists vía QR / PIN**: Carga credenciales desde tu PC o móvil conectándote en la misma red WiFi.
- **Inicio Estilo TiviPlayer**: Cuatro tiles principales (TV en Vivo, Películas, Series, Playlists) + botones rápidos de ajustes/reinicio y reloj digital gigante.
- **TV en Vivo con PIP (Picture-In-Picture)**: Al navegar por las listas mientras ves un canal, la emisión continúa en una mini-ventana flotante.
- **Carga de Series y Episodios**: Vía `get_series_info` de Xtream Codes o `create_link` de Stalker.
- **Guía EPG**: Sincronizada con la hora local de tu LG webOS.
- **Acceso Directo con Teclas de Color**:
  - 🔴 **Rojo**: Añadir / Quitar Favoritos.
  - 🟢 **Verde**: Recientes / Últimos vistos.
  - 🟡 **Amarillo**: Ordenar (A-Z / Z-A).
  - 🔵 **Azul**: Filtrar categorías (*Seleccionar todo / Ninguna*).
- **Auto-Replay**: Reconexión automática con backoff exponencial en caso de corte en la emisión.
- **Resume VOD**: Memoriza la posición de las películas o series y pregunta *"Continuar desde X"* o *"Empezar desde el principio"*.
- **Magic Remote + DPAD**: Navegación espacial ultra-rápida optimizada para el mando de la TV.

---

## 🛠️ Instalación y Uso

### 1. Servidor Node.js para Carga Inalámbrica (Opcional)

Si deseas subir listas desde tu teléfono móvil o PC a través del código QR:

```bash
cd nostra-tv
npm install
npm start
```

Visita `http://localhost:3000` en la TV o escanea el código QR desde tu smartphone.

### 2. Despliegue en LG webOS (Developer Mode)

Con la CLI de webOS oficial (`webos-cli`):

```bash
ares-package .
ares-install com.nostratv.app_1.0.0_all.ipk -d <TV_NAME>
ares-launch com.nostratv.app -d <TV_NAME>
```

---

## 📁 Estructura del Código

- `appinfo.json`: Manifiesto de la aplicación LG webOS.
- `index.html`: Estructura principal y maquetación de la app.
- `sync.html`: Web portal para subir listas desde el móvil/PC.
- `css/style.css`: Estilos glassmorphism en paleta neón azul-morado.
- `js/api.js`: Engine M3U, Xtream Codes y Stalker MAC Portal.
- `js/epg.js`: Lógica EPG XMLTV y reloj local.
- `js/player.js`: Reproductor HLS.js, HTML5, PIP y auto-replay backoff.
- `js/focus.js`: Sistema de foco direccional D-Pad y soporte Magic Remote.
- `js/storage.js`: Gestor de LocalStorage (Favoritos, Recientes, Playlists, Posición VOD).
- `js/ui.js`: Control de vistas, modals y teclas de color.
- `js/qr_sync.js`: Cliente de recepción inalámbrica.
- `server/index.js`: Backend Node.js Express.
