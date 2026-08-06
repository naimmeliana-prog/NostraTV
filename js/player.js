/**
 * NOSTRA TV - Video Player Engine (HLS.js + Native webOS Player + PIP + Auto-Replay)
 */

class PlayerEngine {
  constructor() {
    this.mainVideo = null;
    this.pipVideo = null;
    this.hls = null;
    this.currentItem = null;
    this.isPlaying = false;
    this.isPipActive = false;
    
    // Auto-Replay Backoff State
    this.retryCount = 0;
    this.maxRetries = 5;
    this.retryTimer = null;
    this.vodSaveInterval = null;
    this.osdHideTimer = null;

    // Aspect Ratios
    this.aspectRatios = ['contain', 'cover', 'fill'];
    this.currentAspectIdx = 0;

    // Audio & Subtitle Tracks
    this.audioTracks = [];
    this.subtitleTracks = [];
  }

  init() {
    this.mainVideo = document.getElementById('main-video');
    this.pipVideo = document.getElementById('pip-video');

    if (this.mainVideo) {
      this.mainVideo.addEventListener('playing', () => this.onPlaybackStarted());
      this.mainVideo.addEventListener('pause', () => this.onPlaybackPaused());
      this.mainVideo.addEventListener('error', (e) => this.onPlaybackError(e));
      this.mainVideo.addEventListener('ended', () => this.onPlaybackEnded());
      this.mainVideo.addEventListener('timeupdate', () => this.onTimeUpdate());
    }

    // PIP Buttons
    const btnExpand = document.getElementById('btn-pip-expand');
    const btnClose = document.getElementById('btn-pip-close');

    if (btnExpand) btnExpand.addEventListener('click', () => this.restoreFromPip());
    if (btnClose) btnClose.addEventListener('click', () => this.closePip());

    // Timeline Seek Bar Input
    const seekBar = document.getElementById('vod-seek-bar');
    if (seekBar) {
      seekBar.addEventListener('input', (e) => {
        if (this.mainVideo && this.mainVideo.duration) {
          const targetTime = (parseFloat(e.target.value) / 100) * this.mainVideo.duration;
          this.mainVideo.currentTime = targetTime;
        }
      });
    }

    // Rewind / Forward / PlayPause / Stop Controls
    const btnRewind = document.getElementById('btn-rewind-10');
    const btnForward = document.getElementById('btn-forward-10');
    const btnPlayPause = document.getElementById('btn-play-pause');
    const btnStop = document.getElementById('btn-stop-player');
    const btnAudio = document.getElementById('btn-audio-tracks');
    const btnSub = document.getElementById('btn-sub-tracks');

    if (btnRewind) btnRewind.addEventListener('click', () => this.rewind(10));
    if (btnForward) btnForward.addEventListener('click', () => this.forward(10));
    if (btnPlayPause) btnPlayPause.addEventListener('click', () => this.togglePlayPause());
    if (btnStop) btnStop.addEventListener('click', () => this.stop());
    if (btnAudio) btnAudio.addEventListener('click', () => this.openTrackPicker('audio'));
    if (btnSub) btnSub.addEventListener('click', () => this.openTrackPicker('subtitles'));
  }

  async playItem(item, startPosition = 0) {
    this.closePip();
    this.currentItem = item;
    this.retryCount = 0;

    const overlay = document.getElementById('player-overlay');
    const spinner = document.getElementById('player-spinner');
    const toast = document.getElementById('replay-toast');

    if (overlay) overlay.classList.remove('hidden');
    if (spinner) spinner.classList.remove('hidden');
    if (toast) toast.classList.add('hidden');

    this.updateOsdInfo(item);

    let streamUrl = item.url || '';

    // Resolve Stalker link if Stalker item
    if (item.isStalker && item.cmd) {
      const activePl = storageManager.getActivePlaylist();
      if (activePl && activePl.stalkerConfig) {
        const { portalUrl, entry, mac, token } = activePl.stalkerConfig;
        streamUrl = await apiEngine.createStalkerLink(
          portalUrl,
          entry,
          mac,
          token,
          item.cmd,
          item.type === 'series' ? 'series' : (item.type === 'vod' ? 'vod' : 'itv'),
          item.seriesNum !== undefined ? item.seriesNum : null
        );
      }
    }

    if (!streamUrl) {
      console.error('[PlayerEngine] Could not obtain stream URL for item:', item);
      if (spinner) spinner.classList.add('hidden');
      if (toast) {
        const msg = document.getElementById('replay-toast-msg');
        if (msg) msg.textContent = 'Error: Enlace de emisión no disponible.';
        toast.classList.remove('hidden');
      }
      return;
    }

    this.loadStreamSource(streamUrl, startPosition);
  }

  loadStreamSource(url, startPosition = 0) {
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }

    const isHls = url.includes('.m3u8') || url.includes('type=m3u8') || url.includes('/live/') || url.includes('.ts');

    if (isHls && Hls.isSupported()) {
      this.hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 60
      });

      this.hls.loadSource(url);
      this.hls.attachMedia(this.mainVideo);

      this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (startPosition > 0) this.mainVideo.currentTime = startPosition;
        this.mainVideo.play().catch(e => console.warn('[PlayerEngine] Autoplay prevented:', e));

        // Read Audio & Subtitle Tracks from HLS
        this.audioTracks = this.hls.audioTracks || [];
        this.subtitleTracks = this.hls.subtitleTracks || [];
      });

      this.hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.warn('[PlayerEngine] HLS Fatal Network Error, attempting recovery...');
              this.handleAutoReplay();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.warn('[PlayerEngine] HLS Fatal Media Error, recovering media...');
              this.hls.recoverMediaError();
              break;
            default:
              this.handleAutoReplay();
              break;
          }
        }
      });
    } else {
      // Native HTML5 Video Fallback (MP4, TS, WebOS Media Engine)
      this.mainVideo.src = url;
      if (startPosition > 0) this.mainVideo.currentTime = startPosition;
      this.mainVideo.play().catch(e => console.warn('[PlayerEngine] Native play error:', e));
    }

    this.startVodSaveLoop();
    this.showOsdTemporarily();
  }

  onPlaybackStarted() {
    this.isPlaying = true;
    this.retryCount = 0;

    const spinner = document.getElementById('player-spinner');
    const toast = document.getElementById('replay-toast');
    const btnPlayPause = document.getElementById('btn-play-pause');

    if (spinner) spinner.classList.add('hidden');
    if (toast) toast.classList.add('hidden');
    if (btnPlayPause) btnPlayPause.textContent = '⏯️ Pausa';

    if (this.currentItem) {
      storageManager.addToHistory(this.currentItem);
    }
  }

  onPlaybackPaused() {
    this.isPlaying = false;
    const btnPlayPause = document.getElementById('btn-play-pause');
    if (btnPlayPause) btnPlayPause.textContent = '▶️ Play';
  }

  togglePlayPause() {
    if (!this.mainVideo) return;
    if (this.mainVideo.paused) {
      this.mainVideo.play();
    } else {
      this.mainVideo.pause();
    }
  }

  stop() {
    this.closePlayer();
  }

  rewind(seconds = 10) {
    if (!this.mainVideo) return;
    this.mainVideo.currentTime = Math.max(0, this.mainVideo.currentTime - seconds);
    this.showOsdTemporarily();
  }

  forward(seconds = 10) {
    if (!this.mainVideo) return;
    const dur = this.mainVideo.duration || Infinity;
    this.mainVideo.currentTime = Math.min(dur, this.mainVideo.currentTime + seconds);
    this.showOsdTemporarily();
  }

  openTrackPicker(trackType) {
    const modal = document.getElementById('modal-track-picker');
    const titleEl = document.getElementById('track-picker-title');
    const optionsBox = document.getElementById('track-picker-options');

    if (!modal || !optionsBox) return;

    optionsBox.innerHTML = '';

    if (trackType === 'audio') {
      if (titleEl) titleEl.textContent = 'Pistas de Audio';

      const tracks = this.audioTracks.length > 0 ? this.audioTracks : [
        { id: 0, name: 'Principal (Por defecto)', lang: 'es' }
      ];

      tracks.forEach((track, idx) => {
        const item = document.createElement('div');
        item.className = 'cat-item focusable';
        item.innerHTML = `<span>🔊 ${track.name || track.lang || `Pista ${idx + 1}`}</span>`;
        item.addEventListener('click', () => {
          if (this.hls) this.hls.audioTrack = idx;
          modal.classList.add('hidden');
        });
        optionsBox.appendChild(item);
      });
    } else {
      if (titleEl) titleEl.textContent = 'Pistas de Subtítulos';

      // Disabled Option
      const disableItem = document.createElement('div');
      disableItem.className = 'cat-item focusable';
      disableItem.innerHTML = `<span>🚫 Desactivados</span>`;
      disableItem.addEventListener('click', () => {
        if (this.hls) this.hls.subtitleTrack = -1;
        modal.classList.add('hidden');
      });
      optionsBox.appendChild(disableItem);

      const tracks = this.subtitleTracks.length > 0 ? this.subtitleTracks : [];

      tracks.forEach((track, idx) => {
        const item = document.createElement('div');
        item.className = 'cat-item focusable';
        item.innerHTML = `<span>💬 ${track.name || track.lang || `Subtítulo ${idx + 1}`}</span>`;
        item.addEventListener('click', () => {
          if (this.hls) this.hls.subtitleTrack = idx;
          modal.classList.add('hidden');
        });
        optionsBox.appendChild(item);
      });
    }

    modal.classList.remove('hidden');
    focusEngine.updateFocusables();
  }

  // AUTO-REPLAY WITH EXPONENTIAL BACKOFF
  handleAutoReplay() {
    const settings = storageManager.getSettings();
    if (!settings.autoReplay) return;

    if (this.retryCount >= (settings.maxRetries || this.maxRetries)) {
      console.error('[PlayerEngine] Max retries reached. Stream playback failed.');
      const toast = document.getElementById('replay-toast');
      const toastMsg = document.getElementById('replay-toast-msg');
      if (toastMsg) toastMsg.textContent = 'Imposible conectar con el canal. Revisa tu conexión.';
      if (toast) toast.classList.remove('hidden');
      return;
    }

    this.retryCount++;
    const backoffMs = Math.pow(2, this.retryCount - 1) * 1000;

    const toast = document.getElementById('replay-toast');
    const toastMsg = document.getElementById('replay-toast-msg');
    if (toastMsg) toastMsg.textContent = `Reconectando transmisión (intento ${this.retryCount}/${settings.maxRetries || 5})...`;
    if (toast) toast.classList.remove('hidden');

    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      if (this.currentItem) {
        console.log(`[PlayerEngine] Retrying stream (${this.retryCount})...`);
        this.loadStreamSource(this.currentItem.url, this.mainVideo.currentTime || 0);
      }
    }, backoffMs);
  }

  onPlaybackEnded() {
    this.isPlaying = false;
    if (this.currentItem && (this.currentItem.type === 'vod' || this.currentItem.type === 'series')) {
      storageManager.saveVodPosition(this.currentItem.id, 0);
    }
    this.closePlayer();
  }

  onTimeUpdate() {
    if (!this.mainVideo) return;
    const current = this.mainVideo.currentTime || 0;
    const duration = this.mainVideo.duration || 0;

    const seekRange = document.getElementById('vod-seek-bar');
    const curTimeTxt = document.getElementById('vod-time-current');
    const totTimeTxt = document.getElementById('vod-time-total');

    if (seekRange && duration > 0) {
      seekRange.value = (current / duration) * 100;
      if (curTimeTxt) curTimeTxt.textContent = this.formatSeconds(current);
      if (totTimeTxt) totTimeTxt.textContent = this.formatSeconds(duration);
    }
  }

  startVodSaveLoop() {
    clearInterval(this.vodSaveInterval);
    this.vodSaveInterval = setInterval(() => {
      if (this.isPlaying && this.currentItem && (this.currentItem.type === 'vod' || this.currentItem.type === 'series')) {
        const curSeconds = this.mainVideo ? this.mainVideo.currentTime : 0;
        if (curSeconds > 10) {
          storageManager.saveVodPosition(this.currentItem.id, curSeconds);
        }
      }
    }, 5000);
  }

  enablePipMode() {
    if (!this.currentItem || this.currentItem.type !== 'live') {
      this.closePlayer();
      return;
    }

    const overlay = document.getElementById('player-overlay');
    const pipContainer = document.getElementById('pip-container');
    const pipName = document.getElementById('pip-channel-name');

    if (overlay) overlay.classList.add('hidden');
    if (pipName) pipName.textContent = this.currentItem.title || 'Canal PIP';

    if (this.pipVideo && this.mainVideo) {
      this.pipVideo.src = this.mainVideo.src;
      this.pipVideo.currentTime = this.mainVideo.currentTime;
      this.pipVideo.play();
    }

    if (pipContainer) pipContainer.classList.remove('hidden');
    this.isPipActive = true;
  }

  restoreFromPip() {
    const pipContainer = document.getElementById('pip-container');
    if (pipContainer) pipContainer.classList.add('hidden');
    this.isPipActive = false;

    if (this.currentItem) {
      const curPos = this.pipVideo ? this.pipVideo.currentTime : 0;
      this.playItem(this.currentItem, curPos);
    }
  }

  closePip() {
    const pipContainer = document.getElementById('pip-container');
    if (pipContainer) pipContainer.classList.add('hidden');
    if (this.pipVideo) {
      this.pipVideo.pause();
      this.pipVideo.src = '';
    }
    this.isPipActive = false;
  }

  closePlayer() {
    const overlay = document.getElementById('player-overlay');
    if (overlay) overlay.classList.add('hidden');

    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }

    if (this.mainVideo) {
      this.mainVideo.pause();
      this.mainVideo.src = '';
    }

    clearInterval(this.vodSaveInterval);
    clearTimeout(this.retryTimer);
    this.isPlaying = false;
  }

  updateOsdInfo(item) {
    const titleEl = document.getElementById('osd-channel-title');
    const groupEl = document.getElementById('osd-channel-group');
    const logoEl = document.getElementById('osd-channel-logo');
    const numEl = document.getElementById('osd-channel-num');

    if (titleEl) titleEl.textContent = item.title || 'Canal';
    if (groupEl) groupEl.textContent = item.group || 'Categoría';
    if (numEl) numEl.textContent = item.num ? item.num.toString().padStart(3, '0') : '001';

    if (logoEl) {
      if (item.logo) {
        logoEl.src = item.logo;
        logoEl.classList.remove('hidden');
      } else {
        logoEl.classList.add('hidden');
      }
    }

    const vodTimeline = document.getElementById('vod-timeline-container');
    if (vodTimeline) {
      if (item.type === 'vod' || item.type === 'series') {
        vodTimeline.classList.remove('hidden');
      } else {
        vodTimeline.classList.add('hidden');
      }
    }

    if (window.epgEngine) {
      const epg = window.epgEngine.getEpgNowAndNext(item.epgId);
      const nowTitle = document.getElementById('osd-epg-now-title');
      const nowTime = document.getElementById('osd-epg-now-time');
      const progress = document.getElementById('osd-epg-progress');
      const nextTitle = document.getElementById('osd-epg-next-title');
      const nextTime = document.getElementById('osd-epg-next-time');

      if (nowTitle) nowTitle.textContent = epg.now.title;
      if (nowTime) nowTime.textContent = epg.now.time;
      if (progress) progress.style.width = `${epg.now.progress}%`;
      if (nextTitle) nextTitle.textContent = epg.next.title;
      if (nextTime) nextTime.textContent = epg.next.time;
    }
  }

  toggleAspect() {
    this.currentAspectIdx = (this.currentAspectIdx + 1) % this.aspectRatios.length;
    const mode = this.aspectRatios[this.currentAspectIdx];
    if (this.mainVideo) this.mainVideo.style.objectFit = mode;
    const btn = document.getElementById('btn-aspect-ratio');
    if (btn) btn.textContent = `📺 ${mode.toUpperCase()}`;
  }

  showOsdTemporarily() {
    const osd = document.getElementById('player-osd');
    if (!osd) return;
    osd.classList.remove('fade-out');
    clearTimeout(this.osdHideTimer);
    this.osdHideTimer = setTimeout(() => {
      osd.classList.add('fade-out');
    }, 6000);
  }

  formatSeconds(sec) {
    if (isNaN(sec) || sec < 0) return '00:00';
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = Math.floor(sec % 60);
    if (hrs > 0) {
      return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
}

window.playerEngine = new PlayerEngine();
