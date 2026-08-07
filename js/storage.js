/**
 * NOSTRA TV - LocalStorage & Application State Manager
 */

const STORAGE_KEYS = {
  PLAYLISTS: 'nostratv_playlists',
  ACTIVE_PLAYLIST_ID: 'nostratv_active_playlist_id',
  FAVORITES: 'nostratv_favorites',
  HISTORY: 'nostratv_history',
  VOD_POSITIONS: 'nostratv_vod_positions',
  LAST_CATEGORIES: 'nostratv_last_categories',
  SORT_MODE: 'nostratv_sort_mode',
  SETTINGS: 'nostratv_settings'
};

class StorageManager {
  constructor() {
    this.initDefaults();
  }

  initDefaults() {
    let playlists = [];
    try {
      playlists = JSON.parse(localStorage.getItem(STORAGE_KEYS.PLAYLISTS)) || [];
    } catch (e) {}

    // Only initialize defaults if storage is completely empty
    if (!Array.isArray(playlists) || playlists.length === 0) {
      // Start with no default playlists — user will add their own via QR/PIN or the form
      localStorage.setItem(STORAGE_KEYS.PLAYLISTS, JSON.stringify([]));
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_PLAYLIST_ID);
    }
    if (!localStorage.getItem(STORAGE_KEYS.FAVORITES)) {
      localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.HISTORY)) {
      localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.VOD_POSITIONS)) {
      localStorage.setItem(STORAGE_KEYS.VOD_POSITIONS, JSON.stringify({}));
    }
    if (!localStorage.getItem(STORAGE_KEYS.LAST_CATEGORIES)) {
      localStorage.setItem(STORAGE_KEYS.LAST_CATEGORIES, JSON.stringify({ live: 'all', vod: 'all', series: 'all' }));
    }
    if (!localStorage.getItem(STORAGE_KEYS.SORT_MODE)) {
      localStorage.setItem(STORAGE_KEYS.SORT_MODE, 'az');
    }
    if (!localStorage.getItem(STORAGE_KEYS.SETTINGS)) {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify({
        autoReplay: true,
        maxRetries: 5,
        bufferSeconds: 10,
        rememberLastCategory: true
      }));
    }
  }

  // --- PLAYLISTS ---
  getPlaylists() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.PLAYLISTS)) || [];
    } catch (e) {
      return [];
    }
  }

  savePlaylists(playlists) {
    localStorage.setItem(STORAGE_KEYS.PLAYLISTS, JSON.stringify(playlists));
  }

  addPlaylist(playlist) {
    const playlists = this.getPlaylists();
    if (!playlist.id) {
      playlist.id = 'pl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    }
    playlist.addedAt = new Date().toISOString();
    playlist.status = playlist.status || 'loaded'; // 'active', 'loaded', 'expired', 'error'
    playlists.push(playlist);
    this.savePlaylists(playlists);
    
    // If it's the first playlist added, set as active automatically
    if (playlists.length === 1 || !this.getActivePlaylistId()) {
      this.setActivePlaylistId(playlist.id);
    }
    return playlist;
  }

  updatePlaylist(id, updatedFields) {
    const playlists = this.getPlaylists();
    const idx = playlists.findIndex(p => p.id === id);
    if (idx !== -1) {
      playlists[idx] = { ...playlists[idx], ...updatedFields };
      this.savePlaylists(playlists);
      return playlists[idx];
    }
    return null;
  }

  deletePlaylist(id) {
    let playlists = this.getPlaylists();
    playlists = playlists.filter(p => p.id !== id);
    this.savePlaylists(playlists);
    if (this.getActivePlaylistId() === id) {
      const nextActive = playlists[0] ? playlists[0].id : null;
      this.setActivePlaylistId(nextActive);
    }
  }

  getActivePlaylistId() {
    return localStorage.getItem(STORAGE_KEYS.ACTIVE_PLAYLIST_ID) || null;
  }

  setActivePlaylistId(id) {
    if (id) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_PLAYLIST_ID, id);
    } else {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_PLAYLIST_ID);
    }
  }

  getActivePlaylist() {
    const id = this.getActivePlaylistId();
    if (!id) return null;
    const playlists = this.getPlaylists();
    return playlists.find(p => p.id === id) || null;
  }

  // --- FAVORITES ---
  getFavorites() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.FAVORITES)) || [];
    } catch (e) {
      return [];
    }
  }

  isFavorite(itemUniqueId) {
    const favs = this.getFavorites();
    return favs.includes(itemUniqueId);
  }

  toggleFavorite(itemUniqueId) {
    let favs = this.getFavorites();
    if (favs.includes(itemUniqueId)) {
      favs = favs.filter(id => id !== itemUniqueId);
    } else {
      favs.unshift(itemUniqueId);
    }
    localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(favs));
    return favs.includes(itemUniqueId);
  }

  // --- RECENT HISTORY ---
  getHistory() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.HISTORY)) || [];
    } catch (e) {
      return [];
    }
  }

  addToHistory(item) {
    let history = this.getHistory();
    history = history.filter(h => h.id !== item.id);
    history.unshift({
      ...item,
      watchedAt: new Date().toISOString()
    });
    // Keep max 50 items
    if (history.length > 50) history = history.slice(0, 50);
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
  }

  // --- VOD PLAYBACK POSITIONS ---
  getVodPositions() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.VOD_POSITIONS)) || {};
    } catch (e) {
      return {};
    }
  }

  getVodPosition(itemUniqueId) {
    const pos = this.getVodPositions();
    return pos[itemUniqueId] || 0;
  }

  saveVodPosition(itemUniqueId, seconds) {
    const pos = this.getVodPositions();
    if (seconds < 10) {
      delete pos[itemUniqueId]; // Don't save less than 10s
    } else {
      pos[itemUniqueId] = Math.floor(seconds);
    }
    localStorage.setItem(STORAGE_KEYS.VOD_POSITIONS, JSON.stringify(pos));
  }

  // --- LAST VISITED CATEGORY ---
  getLastCategory(section) {
    try {
      const cats = JSON.parse(localStorage.getItem(STORAGE_KEYS.LAST_CATEGORIES)) || {};
      return cats[section] || 'all';
    } catch (e) {
      return 'all';
    }
  }

  saveLastCategory(section, catId) {
    try {
      const cats = JSON.parse(localStorage.getItem(STORAGE_KEYS.LAST_CATEGORIES)) || {};
      cats[section] = catId;
      localStorage.setItem(STORAGE_KEYS.LAST_CATEGORIES, JSON.stringify(cats));
    } catch (e) {}
  }

  // --- SORT & SETTINGS ---
  getSortMode() {
    return localStorage.getItem(STORAGE_KEYS.SORT_MODE) || 'az';
  }

  setSortMode(mode) {
    localStorage.setItem(STORAGE_KEYS.SORT_MODE, mode);
  }

  getSettings() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.SETTINGS)) || {};
    } catch (e) {
      return {};
    }
  }

  saveSettings(settings) {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  }
}

window.storageManager = new StorageManager();
