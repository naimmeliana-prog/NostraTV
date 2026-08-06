/**
 * NOSTRA TV - Main UI & View Controller
 */

class UiController {
  constructor() {
    this.currentView = 'home'; // 'home', 'section', 'playlists'
    this.currentSection = 'live'; // 'live', 'vod', 'series'
    this.currentCategory = 'all';
    this.loadedData = { live: [], vod: [], series: [], categories: { live: [], vod: [], series: [] } };

    this.selectedVodItem = null;
    this.selectedVodPosition = 0;
  }

  init() {
    this.bindEvents();
    this.updateClock();
    setInterval(() => this.updateClock(), 1000);
    this.setupColorKeys();
    this.renderHomeCounts();
    this.renderPlaylistsView();
  }

  bindEvents() {
    // Home Tiles Navigation
    document.querySelectorAll('.home-tile').forEach(tile => {
      tile.addEventListener('click', (e) => {
        const sec = e.currentTarget.getAttribute('data-section');
        if (sec === 'playlists') {
          this.switchView('playlists');
        } else {
          this.openSection(sec);
        }
      });
    });

    // Back to Home Buttons
    document.querySelectorAll('[data-action="go-home"]').forEach(btn => {
      btn.addEventListener('click', () => this.switchView('home'));
    });

    // Header Quick Buttons
    const btnSync = document.getElementById('btn-header-sync');
    const btnReload = document.getElementById('btn-header-reload');
    const btnSettings = document.getElementById('btn-header-settings');
    const btnAddPl = document.getElementById('btn-add-playlist');

    if (btnSync) btnSync.addEventListener('click', () => this.showModal('modal-qr-sync'));
    if (btnReload) btnReload.addEventListener('click', () => this.reloadCurrentPlaylist());
    if (btnSettings) btnSettings.addEventListener('click', () => this.switchView('playlists'));
    if (btnAddPl) btnAddPl.addEventListener('click', () => this.openAddPlaylistModal());

    // Search Input (Compatibility with webOS On-Screen Keyboard)
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      const handleSearch = (e) => this.filterAndRenderGrid(e.target.value);
      ['input', 'keyup', 'change', 'search'].forEach(evt => {
        searchInput.addEventListener(evt, handleSearch);
      });
    }



    // Modal Close Buttons
    document.querySelectorAll('[data-action="close-modal"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const backdrop = e.currentTarget.closest('.modal-backdrop');
        if (backdrop) backdrop.classList.add('hidden');
      });
    });

    // Form Playlist Save
    const btnSavePl = document.getElementById('btn-save-playlist');
    if (btnSavePl) btnSavePl.addEventListener('click', () => this.handleSavePlaylist());

    // Mode Selector Tabs in Form
    document.querySelectorAll('.tab-btn').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const mode = e.currentTarget.getAttribute('data-mode');
        document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
        e.currentTarget.classList.add('active');

        document.getElementById('form-playlist-mode').value = mode;
        document.getElementById('fields-m3u').classList.toggle('hidden', mode !== 'm3u');
        document.getElementById('fields-xtream').classList.toggle('hidden', mode !== 'xtream');
        document.getElementById('fields-stalker').classList.toggle('hidden', mode !== 'stalker');
      });
    });

    // Player OSD Controls
    const btnClosePlayer = document.getElementById('btn-close-player');
    const btnAspect = document.getElementById('btn-aspect-ratio');
    const btnFav = document.getElementById('btn-player-fav');

    if (btnClosePlayer) btnClosePlayer.addEventListener('click', () => {
      if (playerEngine.currentItem && playerEngine.currentItem.type === 'live') {
        playerEngine.enablePipMode();
      } else {
        playerEngine.closePlayer();
      }
    });

    if (btnAspect) btnAspect.addEventListener('click', () => playerEngine.toggleAspect());
    if (btnFav) btnFav.addEventListener('click', () => this.toggleCurrentFavorite());

    // VOD Resume Dialog Buttons
    const btnResumeYes = document.getElementById('btn-resume-yes');
    const btnResumeNo = document.getElementById('btn-resume-no');

    if (btnResumeYes) btnResumeYes.addEventListener('click', () => {
      document.getElementById('modal-resume-vod').classList.add('hidden');
      if (this.selectedVodItem) {
        playerEngine.playItem(this.selectedVodItem, this.selectedVodPosition);
      }
    });

    if (btnResumeNo) btnResumeNo.addEventListener('click', () => {
      document.getElementById('modal-resume-vod').classList.add('hidden');
      if (this.selectedVodItem) {
        playerEngine.playItem(this.selectedVodItem, 0);
      }
    });

    // Category Filter Actions (Blue Key Modal)
    const btnCatSelectAll = document.getElementById('btn-cat-select-all');
    const btnCatDeselectAll = document.getElementById('btn-cat-deselect-all');
    const btnApplyCatFilter = document.getElementById('btn-apply-category-filter');

    if (btnCatSelectAll) btnCatSelectAll.addEventListener('click', () => {
      document.querySelectorAll('.cat-chk').forEach(c => c.checked = true);
    });

    if (btnCatDeselectAll) btnCatDeselectAll.addEventListener('click', () => {
      document.querySelectorAll('.cat-chk').forEach(c => c.checked = false);
    });

    if (btnApplyCatFilter) btnApplyCatFilter.addEventListener('click', () => {
      document.getElementById('modal-category-filter').classList.add('hidden');
      this.filterAndRenderGrid();
    });
  }

  setupColorKeys() {
    focusEngine.setColorKeyHandler('RED', () => this.handleRedKey());
    focusEngine.setColorKeyHandler('GREEN', () => {
      // Toggle debug overlay
      const dbg = document.getElementById('debug-overlay');
      if (dbg) dbg.style.display = dbg.style.display === 'none' ? 'block' : 'none';
    });
    focusEngine.setColorKeyHandler('YELLOW', () => this.handleYellowKey());
    focusEngine.setColorKeyHandler('BLUE', () => this.handleBlueKey());

    // Push Back button handler — runs before OS handles it
    focusEngine.pushBackHandler(() => {
      const playerOverlay = document.getElementById('player-overlay');
      if (playerOverlay && !playerOverlay.classList.contains('hidden')) {
        if (playerEngine.currentItem && playerEngine.currentItem.type === 'live') {
          playerEngine.enablePipMode();
        } else {
          playerEngine.closePlayer();
        }
        return;
      }
      const openModal = document.querySelector('.modal-backdrop:not(.hidden)');
      if (openModal) {
        openModal.classList.add('hidden');
        focusEngine.updateFocusables();
        return;
      }
      if (this.currentView !== 'home') {
        this.switchView('home');
        return;
      }
      // On home, do nothing (don't exit app)
    });
  }

  updateClock() {
    const now = new Date();
    const curTime = now.toLocaleTimeString('es-ES', { hour12: false });
    const optionsDate = { weekday: 'short', day: '2-digit', month: 'short' };
    const curDate = now.toLocaleDateString('es-ES', optionsDate);

    const elTime = document.getElementById('clock-time');
    const elDate = document.getElementById('clock-date');
    const elOsdClock = document.getElementById('osd-clock');

    if (elTime) elTime.textContent = curTime;
    if (elDate) elDate.textContent = curDate;
    if (elOsdClock) elOsdClock.textContent = curTime.substring(0, 5);
  }

  switchView(viewName) {
    this.currentView = viewName;
    document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));

    const targetView = document.getElementById(`view-${viewName}`);
    if (targetView) targetView.classList.add('active');

    focusEngine.updateFocusables();
  }

  openSection(section) {
    this.currentSection = section;
    this.switchView('section');

    const titleEl = document.getElementById('section-title');
    if (titleEl) {
      if (section === 'live') titleEl.textContent = 'TV en Vivo';
      if (section === 'vod') titleEl.textContent = 'Películas';
      if (section === 'series') titleEl.textContent = 'Series';
    }

    const lastCat = storageManager.getLastCategory(section);
    this.currentCategory = lastCat;

    this.renderCategoriesList();
    this.filterAndRenderGrid();
  }

  renderCategoriesList() {
    const catContainer = document.getElementById('category-list');
    if (!catContainer) return;

    catContainer.innerHTML = '';

    const categories = this.loadedData.categories[this.currentSection] || [];
    const items = ['Todas las Categorías', '⭐ Favoritos', ...categories];

    items.forEach(cat => {
      const btn = document.createElement('div');
      btn.className = `cat-item focusable ${this.currentCategory === cat ? 'active' : ''}`;
      btn.setAttribute('data-cat', cat);

      const label = document.createElement('span');
      label.textContent = cat;

      const badge = document.createElement('span');
      badge.className = 'cat-badge';
      if (cat === 'Todas las Categorías') {
        badge.textContent = (this.loadedData[this.currentSection] || []).length;
      } else if (cat === '⭐ Favoritos') {
        badge.textContent = storageManager.getFavorites().length;
      } else {
        const count = (this.loadedData[this.currentSection] || []).filter(i => i.group === cat).length;
        badge.textContent = count;
      }

      btn.appendChild(label);
      btn.appendChild(badge);

      btn.addEventListener('click', () => {
        this.currentCategory = cat;
        storageManager.saveLastCategory(this.currentSection, cat);
        document.querySelectorAll('.cat-item').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        this.filterAndRenderGrid();
      });

      catContainer.appendChild(btn);
    });
  }

  filterAndRenderGrid(searchQuery = '') {
    const grid = document.getElementById('media-grid');
    const emptyMsg = document.getElementById('empty-grid-msg');
    const breadcrumbCat = document.getElementById('breadcrumb-category');
    const breadcrumbCount = document.getElementById('breadcrumb-count');

    if (!grid) return;
    grid.innerHTML = '';

    // STRICT SECTION FILTERING: Only show items matching this.currentSection!
    let items = [...(this.loadedData[this.currentSection] || [])];

    if (this.currentCategory === '⭐ Favoritos') {
      const favIds = storageManager.getFavorites();
      items = items.filter(i => favIds.includes(i.id));
    } else if (this.currentCategory !== 'Todas las Categorías') {
      items = items.filter(i => i.group === this.currentCategory);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter(i => (i.title || '').toLowerCase().includes(q));
    }

    const sortMode = storageManager.getSortMode();
    if (sortMode === 'az') items.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    if (sortMode === 'za') items.sort((a, b) => (b.title || '').localeCompare(a.title || ''));

    if (breadcrumbCat) breadcrumbCat.textContent = this.currentCategory;
    if (breadcrumbCount) breadcrumbCount.textContent = `(${items.length} elementos)`;

    if (items.length === 0) {
      if (emptyMsg) emptyMsg.classList.remove('hidden');
      return;
    }

    if (emptyMsg) emptyMsg.classList.add('hidden');

    items.forEach(item => {
      const card = document.createElement('div');
      card.className = 'media-card focusable';
      card.setAttribute('tabindex', '0');

      const isFav = storageManager.isFavorite(item.id);

      card.innerHTML = `
        <div class="media-poster-box">
          ${item.logo ? `<img src="${item.logo}" class="${item.type === 'live' ? 'channel-logo-img' : 'media-poster-img'}" alt="Poster" />` : `<span style="font-size:32px;">📺</span>`}
          ${isFav ? `<span class="card-fav-star">★</span>` : ''}
        </div>
        <div class="media-card-info">
          <span class="card-num">${item.num ? `#${item.num}` : item.group}</span>
          <h4 class="card-title">${item.title}</h4>
        </div>
      `;

      card.addEventListener('click', () => this.handleMediaCardClick(item));
      grid.appendChild(card);
    });

    focusEngine.updateFocusables();
  }

  async handleMediaCardClick(item) {
    if (item.type === 'series') {
      await this.openSeriesDetailModal(item);
      return;
    }

    if (item.type === 'vod') {
      const pos = storageManager.getVodPosition(item.id);
      if (pos > 10) {
        this.selectedVodItem = item;
        this.selectedVodPosition = pos;
        const timeTxt = playerEngine.formatSeconds(pos);
        document.getElementById('resume-time-text').textContent = timeTxt;
        document.getElementById('resume-btn-time').textContent = timeTxt;
        this.showModal('modal-resume-vod');
        return;
      }
    }

    playerEngine.playItem(item);
  }

  async openSeriesDetailModal(seriesItem) {
    const modal = document.getElementById('modal-series-detail');
    const titleEl = document.getElementById('series-detail-title');
    const plotEl = document.getElementById('series-plot');
    const seasonsBar = document.getElementById('seasons-tab-bar');
    const episodesGrid = document.getElementById('episodes-list-container');

    if (titleEl) titleEl.textContent = seriesItem.title;
    if (plotEl) plotEl.textContent = seriesItem.plot || 'Cargando información de la serie...';
    if (seasonsBar) seasonsBar.innerHTML = 'Cargando episodios...';
    if (episodesGrid) episodesGrid.innerHTML = '';

    this.showModal('modal-series-detail');

    const activePl = storageManager.getActivePlaylist();
    if (!activePl) return;

    let seasons = [];

    if (activePl.type === 'xtream' && activePl.xtreamConfig) {
      const { host, username, password } = activePl.xtreamConfig;
      const seriesInfo = await apiEngine.getXtreamSeriesInfo(host, username, password, seriesItem.seriesId);
      if (plotEl && seriesInfo.plot) plotEl.textContent = seriesInfo.plot;
      seasons = seriesInfo.seasons || [];
    } else if (activePl.type === 'stalker' && activePl.stalkerConfig) {
      const { portalUrl, entry, mac, token, proxy } = activePl.stalkerConfig;
      const seriesInfo = await apiEngine.getStalkerSeriesInfo(portalUrl, entry, mac, token, seriesItem.seriesId, proxy);
      seasons = seriesInfo.seasons || [];
    } else {
      seasons = [
        {
          seasonNum: 1,
          title: 'Temporada 1',
          episodes: [
            {
              id: `${seriesItem.id}_ep1`,
              title: `${seriesItem.title} - Episodio 1`,
              url: seriesItem.url,
              type: 'series'
            }
          ]
        }
      ];
    }

    if (seasonsBar) seasonsBar.innerHTML = '';

    if (seasons.length === 0) {
      if (episodesGrid) episodesGrid.innerHTML = '<p style="padding:20px;">No se encontraron episodios para esta serie.</p>';
      return;
    }

    seasons.forEach((season, idx) => {
      const tab = document.createElement('button');
      tab.className = `tab-btn focusable ${idx === 0 ? 'active' : ''}`;
      tab.textContent = season.title;
      tab.addEventListener('click', () => {
        document.querySelectorAll('#seasons-tab-bar .tab-btn').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.renderEpisodes(season.episodes);
      });
      seasonsBar.appendChild(tab);
    });

    this.renderEpisodes(seasons[0].episodes);
  }

  renderEpisodes(episodes) {
    const grid = document.getElementById('episodes-list-container');
    if (!grid) return;
    grid.innerHTML = '';

    episodes.forEach(ep => {
      const btn = document.createElement('div');
      btn.className = 'cat-item focusable';
      btn.innerHTML = `<span>${ep.title}</span><span class="cat-badge">${ep.duration || '▶ Play'}</span>`;
      btn.addEventListener('click', () => {
        document.getElementById('modal-series-detail').classList.add('hidden');
        playerEngine.playItem(ep);
      });
      grid.appendChild(btn);
    });

    focusEngine.updateFocusables();
  }

  // COLOR KEY ACTION SHORTCUTS
  handleRedKey() {
    if (focusEngine.currentFocusedElement) {
      const card = focusEngine.currentFocusedElement.closest('.media-card');
      if (card) {
        card.click();
      }
    }
  }

  handleGreenKey() {
    this.currentCategory = '⭐ Favoritos';
    this.openSection(this.currentSection);
  }

  handleYellowKey() {
    const modes = ['az', 'za'];
    const cur = storageManager.getSortMode();
    const nextMode = modes[(modes.indexOf(cur) + 1) % modes.length];
    storageManager.setSortMode(nextMode);

    const badge = document.getElementById('pill-sort-status');
    if (badge) badge.textContent = `Orden: ${nextMode.toUpperCase()}`;

    this.filterAndRenderGrid();
  }

  handleBlueKey() {
    const container = document.getElementById('category-filter-checkboxes');
    if (!container) return;

    container.innerHTML = '';
    const categories = this.loadedData.categories[this.currentSection] || [];

    categories.forEach(cat => {
      const row = document.createElement('label');
      row.className = 'form-group focusable';
      row.style.flexDirection = 'row';
      row.style.alignItems = 'center';
      row.style.cursor = 'pointer';

      row.innerHTML = `
        <input type="checkbox" class="cat-chk" value="${cat}" checked style="width:20px; height:20px;" />
        <span style="font-size:16px; margin-left:10px;">${cat}</span>
      `;

      container.appendChild(row);
    });

    this.showModal('modal-category-filter');
  }

  toggleCurrentFavorite() {
    if (playerEngine.currentItem) {
      const isFav = storageManager.toggleFavorite(playerEngine.currentItem.id);
      const btn = document.getElementById('btn-player-fav');
      if (btn) btn.textContent = isFav ? '❤️ Favorito' : '🤍 Añadir a Fav';
    }
  }

  // PLAYLIST MANAGER VIEW WITH EDIT & EXPIRATION DATE
  renderPlaylistsView() {
    const container = document.getElementById('playlists-list-container');
    if (!container) return;

    container.innerHTML = '';
    const playlists = storageManager.getPlaylists();
    const activeId = storageManager.getActivePlaylistId();

    this.renderHomeCounts();

    if (playlists.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1/-1; text-align:center; padding:60px;">
          <h3>No tienes ninguna lista de reproducción cargada</h3>
          <p style="color:var(--text-muted); margin-top:10px;">Haz clic en "+ Añadir Nueva Playlist" o escanea el código QR desde tu móvil.</p>
        </div>
      `;
      return;
    }

    playlists.forEach(pl => {
      const isActive = pl.id === activeId;
      const card = document.createElement('div');
      card.className = `playlist-card ${isActive ? 'active-card' : ''}`;

      const expDateText = pl.expiration || 'Activa (Sin Expiración)';

      card.innerHTML = `
        <span class="pl-type">${pl.type}</span>
        <h3 class="pl-name">${pl.name}</h3>
        <p style="font-size:13px; color:var(--text-muted);">Estado: <strong style="color:${isActive ? '#22c55e' : '#94a3b8'};">${isActive ? 'ACTIVA Y CARGADA' : 'Inactiva'}</strong></p>
        <p style="font-size:13px; color:var(--text-muted);">Expiración: <span style="color:var(--accent-cyan); font-weight:600;">${expDateText}</span></p>

        <div class="pl-actions">
          ${!isActive ? `<button class="btn-primary focusable" data-action="activate-pl" data-id="${pl.id}">Activar</button>` : `<button class="btn-secondary" disabled>Activa</button>`}
          <button class="btn-secondary focusable" data-action="edit-pl" data-id="${pl.id}">Editar ✏️</button>
          <button class="btn-secondary focusable" data-action="delete-pl" data-id="${pl.id}">Eliminar 🗑️</button>
        </div>
      `;

      const btnAct = card.querySelector('[data-action="activate-pl"]');
      const btnEdit = card.querySelector('[data-action="edit-pl"]');
      const btnDel = card.querySelector('[data-action="delete-pl"]');

      if (btnAct) btnAct.addEventListener('click', () => {
        storageManager.setActivePlaylistId(pl.id);
        this.loadPlaylistData(pl);
        this.renderPlaylistsView();
      });

      if (btnEdit) btnEdit.addEventListener('click', () => {
        this.openEditPlaylistModal(pl);
      });

      if (btnDel) btnDel.addEventListener('click', () => {
        storageManager.deletePlaylist(pl.id);
        this.renderPlaylistsView();
      });

      container.appendChild(card);
    });

    focusEngine.updateFocusables();
  }

  async loadPlaylistData(playlist) {
    if (!playlist) return;
    try {
      let data = null;
      if (playlist.type === 'm3u') {
        data = await apiEngine.loadM3uPlaylist(playlist.url);
        if (playlist.epgUrl) epgEngine.loadEpgXml(playlist.epgUrl);
      } else if (playlist.type === 'xtream') {
        data = await apiEngine.loadXtreamPlaylist(playlist.xtreamConfig.host, playlist.xtreamConfig.username, playlist.xtreamConfig.password);
      } else if (playlist.type === 'stalker') {
        data = await apiEngine.loadStalkerPortal(playlist.stalkerConfig.portalUrl, playlist.stalkerConfig.mac, playlist.stalkerConfig.proxy);
      }

      if (data) {
        this.loadedData = data;
        if (data.expiration) {
          playlist.expiration = data.expiration;
          storageManager.updatePlaylist(playlist.id, { expiration: data.expiration });
        }
        this.renderHomeCounts();

        if (this.currentView === 'section') {
          this.renderCategoriesList();
          this.filterAndRenderGrid();
        }

        const nameEl = document.getElementById('active-playlist-name');
        const badgeEl = document.getElementById('active-playlist-badge');
        const expHeaderEl = document.getElementById('info-active-exp');

        if (nameEl) nameEl.textContent = playlist.name;
        if (expHeaderEl) expHeaderEl.textContent = playlist.expiration || 'Activa';
        if (badgeEl) {
          badgeEl.className = 'playlist-pill pill-active';
        }
      }
    } catch (e) {
      console.error('[UiController] Could not load playlist data:', e);
      const badgeEl = document.getElementById('active-playlist-badge');
      if (badgeEl) badgeEl.className = 'playlist-pill pill-error';
    }
  }

  async reloadCurrentPlaylist() {
    const activePl = storageManager.getActivePlaylist();
    if (activePl) {
      const nameEl = document.getElementById('active-playlist-name');
      if (nameEl) nameEl.textContent = 'Recargando...';
      await this.loadPlaylistData(activePl);
      if (this.currentView === 'section') {
        this.renderCategoriesList();
        this.filterAndRenderGrid();
      }
    }
  }

  renderHomeCounts() {
    const liveCount = document.getElementById('home-count-live');
    const vodCount = document.getElementById('home-count-vod');
    const seriesCount = document.getElementById('home-count-series');
    const plCount = document.getElementById('home-count-playlists');

    if (liveCount) liveCount.textContent = `${(this.loadedData.live || []).length} Canales`;
    if (vodCount) vodCount.textContent = `${(this.loadedData.vod || []).length} Películas`;
    if (seriesCount) seriesCount.textContent = `${(this.loadedData.series || []).length} Series`;
    if (plCount) plCount.textContent = `${storageManager.getPlaylists().length} Listas`;
  }

  openAddPlaylistModal() {
    document.getElementById('modal-form-title').textContent = 'Añadir Nueva Lista IPTV';
    document.getElementById('form-playlist-id').value = '';
    document.getElementById('input-playlist-name').value = '';
    document.getElementById('input-m3u-url').value = '';
    document.getElementById('input-m3u-epg').value = '';
    document.getElementById('input-xtream-host').value = '';
    document.getElementById('input-xtream-user').value = '';
    document.getElementById('input-xtream-pass').value = '';
    document.getElementById('input-stalker-url').value = '';
    document.getElementById('input-stalker-mac').value = '';
    document.getElementById('input-stalker-proxy').value = '';

    document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
    document.querySelector('.tab-btn[data-mode="m3u"]').classList.add('active');
    document.getElementById('form-playlist-mode').value = 'm3u';
    document.getElementById('fields-m3u').classList.remove('hidden');
    document.getElementById('fields-xtream').classList.add('hidden');
    document.getElementById('fields-stalker').classList.add('hidden');

    this.showModal('modal-playlist-form');
  }

  openEditPlaylistModal(playlist) {
    document.getElementById('modal-form-title').textContent = 'Editar Playlist IPTV';
    document.getElementById('form-playlist-id').value = playlist.id;
    document.getElementById('input-playlist-name').value = playlist.name || '';
    document.getElementById('form-playlist-mode').value = playlist.type;

    document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
    const modeTab = document.querySelector(`.tab-btn[data-mode="${playlist.type}"]`);
    if (modeTab) modeTab.classList.add('active');

    document.getElementById('fields-m3u').classList.toggle('hidden', playlist.type !== 'm3u');
    document.getElementById('fields-xtream').classList.toggle('hidden', playlist.type !== 'xtream');
    document.getElementById('fields-stalker').classList.toggle('hidden', playlist.type !== 'stalker');

    if (playlist.type === 'm3u') {
      document.getElementById('input-m3u-url').value = playlist.url || '';
      document.getElementById('input-m3u-epg').value = playlist.epgUrl || '';
    } else if (playlist.type === 'xtream' && playlist.xtreamConfig) {
      document.getElementById('input-xtream-host').value = playlist.xtreamConfig.host || '';
      document.getElementById('input-xtream-user').value = playlist.xtreamConfig.username || '';
      document.getElementById('input-xtream-pass').value = playlist.xtreamConfig.password || '';
    } else if (playlist.type === 'stalker' && playlist.stalkerConfig) {
      document.getElementById('input-stalker-url').value = playlist.stalkerConfig.portalUrl || '';
      document.getElementById('input-stalker-mac').value = playlist.stalkerConfig.mac || '';
      document.getElementById('input-stalker-proxy').value = playlist.stalkerConfig.proxy || '';
    }

    this.showModal('modal-playlist-form');
  }

  handleSavePlaylist() {
    const id = document.getElementById('form-playlist-id').value;
    const name = document.getElementById('input-playlist-name').value.trim();
    const mode = document.getElementById('form-playlist-mode').value;

    if (!name) {
      alert('Introduce un nombre para la lista.');
      return;
    }

    let playlistData = { name, type: mode };

    if (mode === 'm3u') {
      const url = document.getElementById('input-m3u-url').value.trim();
      const epgUrl = document.getElementById('input-m3u-epg').value.trim();
      if (!url) { alert('Introduce la URL M3U'); return; }
      playlistData.url = url;
      playlistData.epgUrl = epgUrl;
    } else if (mode === 'xtream') {
      const host = document.getElementById('input-xtream-host').value.trim();
      const user = document.getElementById('input-xtream-user').value.trim();
      const pass = document.getElementById('input-xtream-pass').value.trim();
      if (!host || !user || !pass) { alert('Completa todos los campos de Xtream Codes'); return; }
      playlistData.xtreamConfig = { host, username: user, password: pass };
    } else if (mode === 'stalker') {
      const url = document.getElementById('input-stalker-url').value.trim();
      const mac = document.getElementById('input-stalker-mac').value.trim();
      const proxy = document.getElementById('input-stalker-proxy').value.trim();
      if (!url || !mac) { alert('Completa los datos del Portal Stalker'); return; }
      playlistData.stalkerConfig = { portalUrl: url, mac, proxy };
    }

    let savedPl = null;
    if (id) {
      savedPl = storageManager.updatePlaylist(id, playlistData);
    } else {
      savedPl = storageManager.addPlaylist(playlistData);
    }

    document.getElementById('modal-playlist-form').classList.add('hidden');
    if (savedPl) this.loadPlaylistData(savedPl);
    this.renderPlaylistsView();
  }

  showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('hidden');
      focusEngine.updateFocusables();
    }
  }
}

window.uiController = new UiController();
