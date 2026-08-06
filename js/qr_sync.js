/**
 * NOSTRA TV - Wireless QR Code & PIN Synchronization Client
 * Uses a free public cloud key-value store (kvdb.io) so NO PC/local server is needed.
 */

class QrSyncClient {
  constructor() {
    this.pinCode = null;
    this.pollInterval = null;
    // Shared public bucket ID for secure data relay
    this.bucketId = 'K3n8g4U2w8V9u4H1y7e9Pq';
  }

  async init() {
    this.generatePinCode();
    this.setupQrCode();
    this.startListening();
  }

  generatePinCode() {
    // Generate a simple 6 digit PIN: XXX-XXX
    const part1 = Math.floor(100 + Math.random() * 900);
    const part2 = Math.floor(100 + Math.random() * 900);
    this.pinCode = `${part1}-${part2}`;

    const pinEl = document.getElementById('sync-pin-code');
    if (pinEl) pinEl.textContent = this.pinCode;
  }

  setupQrCode() {
    const qrBox = document.getElementById('qr-code-box');
    const webUrlEl = document.getElementById('sync-web-url');

    // A public mirror of sync.html hosted statically on GitHub Pages/Cloudflare
    // Users can access this page from any mobile phone connected to the Internet
    const targetUrl = `https://naimmeliana-prog.github.io/NostraTV/sync.html?pin=${this.pinCode}`;
    if (webUrlEl) webUrlEl.textContent = targetUrl;

    if (qrBox) {
      const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(targetUrl)}`;
      qrBox.innerHTML = `<img src="${qrApiUrl}" alt="QR Code" style="width:180px; height:180px; border-radius:12px;" />`;
    }
  }

  startListening() {
    clearInterval(this.pollInterval);
    const url = `https://kvdb.io/${this.bucketId}/nostra_pin_${this.pinCode.replace('-', '')}`;

    if (window.appLog) window.appLog(`Esperando lista en nube PIN: ${this.pinCode}`, '#94a3b8');

    this.pollInterval = setInterval(async () => {
      try {
        const resp = await fetch(url);
        if (resp.ok) {
          const text = await resp.text();
          if (text && text.trim()) {
            const payload = JSON.parse(text);
            if (payload && payload.playlist) {
              if (window.appLog) window.appLog('¡Lista recibida desde el móvil!', '#22c55e');

              const savedPl = storageManager.addPlaylist(payload.playlist);
              uiController.loadPlaylistData(savedPl);
              uiController.renderPlaylistsView();

              const statusEl = document.getElementById('sync-status');
              if (statusEl) {
                statusEl.textContent = '¡Playlist recibida con éxito!';
                statusEl.style.color = '#22c55e';
              }

              // Delete the key from the cloud bucket to clean up
              fetch(url, { method: 'DELETE' }).catch(() => {});

              setTimeout(() => {
                const modal = document.getElementById('modal-qr-sync');
                if (modal) modal.classList.add('hidden');
              }, 2000);

              clearInterval(this.pollInterval);
            }
          }
        }
      } catch (e) {
        // Silent catch for network drops
      }
    }, 4000);
  }
}

window.qrSyncClient = new QrSyncClient();
