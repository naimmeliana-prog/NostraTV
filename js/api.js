/**
 * NOSTRA TV - Unified IPTV Engine
 * Stalker implementation mirrors the working Python stalker-m3u tool exactly.
 * Key: MAC goes in Cookie header, token in Cookie + Authorization Bearer.
 */

const STALKER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36';
const STALKER_X_USER_AGENT = 'Model: MAG250; Link: WiFi';

const STALKER_ENTRY_POINTS = [
  '/server/load.php',
  '/portal.php',
  '/c/server/load.php',
  '/stalker_portal/server/load.php',
];

class ApiEngine {
  constructor() {}

  // =========================================================================
  // LOW-LEVEL: fetch wrapper with cookie-based MAC auth (mirrors Python impl)
  // =========================================================================
  _stalkerFetch(url, mac, token, proxyUrl = '') {
    let activeProxy = proxyUrl;

    if (!activeProxy) {
      const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || 
                          window.location.hostname.startsWith('192.168.') || window.location.hostname.startsWith('10.');
      if (isLocalHost && window.location.protocol.startsWith('http')) {
        activeProxy = `${window.location.origin}/api/stalker-proxy`;
      } else {
        // Fallback to the Cloudflare Worker proxy when running on TV or external browser (requires no PC server!)
        activeProxy = 'https://nostratv.naimmeliana.workers.dev/';
      }
    }

    if (activeProxy) {
      const target = `${activeProxy}?url=${encodeURIComponent(url)}&mac=${encodeURIComponent(mac)}&token=${encodeURIComponent(token || '')}`;
      if (window.appLog) window.appLog(`Proxy Stalker: ${url.substring(0, 40)}...`, '#eab308');
      return fetch(target, { method: 'GET', cache: 'no-cache' })
        .then(r => {
          if (!r.ok) throw new Error(`HTTP ${r.status} via Proxy`);
          return r.json();
        });
    }

    let cookie = `mac=${mac}; stb_lang=en; timezone=Europe/London`;
    if (token) cookie += `; token=${token}`;

    const headers = {
      'User-Agent': STALKER_USER_AGENT,
      'X-User-Agent': STALKER_X_USER_AGENT,
      'Cookie': cookie,
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    return fetch(url, { method: 'GET', headers, cache: 'no-cache' })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
        return r.json();
      });
  }

  _js(data) {
    if (data && typeof data === 'object') {
      return data.js !== undefined ? data.js : data;
    }
    return {};
  }

  // =========================================================================
  // STALKER HANDSHAKE — MAC in Cookie, no MAC in query
  // =========================================================================
  async _stalkerHandshake(baseUrl, mac, proxy = '') {
    for (const ep of STALKER_ENTRY_POINTS) {
      const url = `${baseUrl}${ep}?type=stb&action=handshake&mac=${mac}&JsHttpRequest=1-xml`;
      if (window.appLog) window.appLog(`Handshake: ${ep}`, '#94a3b8');
      try {
        const data = await this._stalkerFetch(url, mac, null, proxy);
        const js = this._js(data);
        const token = (js && js.token) ? js.token : null;
        if (token) {
          if (window.appLog) window.appLog(`✓ Token OK (${ep}): ${token.substring(0, 12)}...`, '#22c55e');
          return { entry: ep, token };
        }
        if (window.appLog) window.appLog(`${ep}: sin token → ${JSON.stringify(data).substring(0, 80)}`, '#eab308');
      } catch(e) {
        if (window.appLog) window.appLog(`${ep}: ${e.message}`, '#ef4444');
      }
    }
    throw new Error(`Handshake fallido en todos los endpoints de ${baseUrl}`);
  }

  // =========================================================================
  // STALKER REQUEST — after handshake, MAC+token in cookies
  // =========================================================================
  async _stalkerReq(baseUrl, entry, mac, token, params, proxy = '') {
    const q = new URLSearchParams({ ...params, JsHttpRequest: '1-xml' }).toString();
    const url = `${baseUrl}${entry}?${q}`;
    const data = await this._stalkerFetch(url, mac, token, proxy);
    return this._js(data);
  }

  // =========================================================================
  // MAIN: Load Stalker Portal
  // =========================================================================
  async loadStalkerPortal(portalUrl, macAddress, proxy = '') {
    const base = portalUrl.replace(/\/+$/, '');
    const mac  = macAddress.trim().toUpperCase();

    if (window.appLog) window.appLog(`Portal: ${base}  MAC: ${mac}`, '#8b5cf6');

    // Step 1: Handshake
    const { entry, token } = await this._stalkerHandshake(base, mac, proxy);

    // Step 2: Profile (for expiry)
    let expDate = 'Activa';
    try {
      const profile = await this._stalkerReq(base, entry, mac, token, { type: 'stb', action: 'get_profile' }, proxy);
      expDate = profile.expire_billing_date || profile.end_date || 'Activa';
      if (window.appLog) window.appLog(`Perfil OK. Exp: ${expDate}`, '#22c55e');
    } catch(e) {
      if (window.appLog) window.appLog(`Perfil no disponible: ${e.message}`, '#eab308');
    }

    // Step 3: Load ITV, VOD, Series
    const live    = await this._loadStalkerITV(base, entry, mac, token, proxy);
    const vod     = await this._loadStalkerVOD(base, entry, mac, token, proxy);
    const series  = await this._loadStalkerSeries(base, entry, mac, token, proxy);

    // Persist token+entry for playback
    try {
      const pls  = JSON.parse(localStorage.getItem('nostratv_playlists') || '[]');
      const aid  = localStorage.getItem('nostratv_active_playlist_id');
      const idx  = pls.findIndex(p => p.id === aid);
      if (idx !== -1) {
        pls[idx].stalkerConfig = { ...pls[idx].stalkerConfig, entry, token, base, proxy };
        localStorage.setItem('nostratv_playlists', JSON.stringify(pls));
      }
    } catch(e) {}

    return {
      expiration: expDate, live, vod, series,
      categories: {
        live:   [...new Set(live.map(i => i.group))].sort(),
        vod:    [...new Set(vod.map(i => i.group))].sort(),
        series: [...new Set(series.map(i => i.group))].sort(),
      },
      stalkerConfig: { portalUrl: base, mac, entry, token, proxy }
    };
  }

  // =========================================================================
  // ITV (Live TV) — uses get_genres (not get_categories!)
  // =========================================================================
  // =========================================================================
  // ITV (Live TV) — uses get_genres (not get_categories!)
  // =========================================================================
  async _loadStalkerITV(base, entry, mac, token, proxy = '') {
    if (window.appLog) window.appLog('Cargando géneros ITV...', '#94a3b8');
    let genres = [];
    try {
      const data = await this._stalkerReq(base, entry, mac, token, { type: 'itv', action: 'get_genres' }, proxy);
      genres = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
      if (window.appLog) window.appLog(`ITV: ${genres.length} géneros`, '#94a3b8');
    } catch(e) {
      if (window.appLog) window.appLog(`ITV get_genres error: ${e.message}`, '#ef4444');
      return [];
    }

    const items = [];
    for (const g of genres) {
      const gid   = String(g.id || g.genre_id || '');
      const group = this._cleanTitle(String(g.title || g.genre_title || gid));
      if (!gid) continue;
      const channels = await this._stalkerList(base, entry, mac, token, 'itv', 'genre', gid, proxy);
      for (const ch of channels) {
        const cmd = this._cleanCmd(String(ch.cmd || ''));
        if (!cmd) continue;
        items.push({
          id: `stk_live_${ch.id}`, cmd: ch.cmd, title: ch.name || 'Canal',
          num: ch.number || '', group,
          logo: ch.logo ? (ch.logo.startsWith('http') ? ch.logo : `${base}/misc/logos/320/${ch.logo}`) : '',
          epgId: ch.xmltv_id || '', type: 'live', isStalker: true
        });
      }
    }
    if (window.appLog) window.appLog(`ITV: ${items.length} canales`, '#22c55e');
    return items;
  }

  // =========================================================================
  // VOD — uses get_categories + category param
  // =========================================================================
  async _loadStalkerVOD(base, entry, mac, token, proxy = '') {
    if (window.appLog) window.appLog('Cargando categorías VOD...', '#94a3b8');
    let cats = [];
    try {
      const data = await this._stalkerReq(base, entry, mac, token, { type: 'vod', action: 'get_categories' }, proxy);
      cats = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : Object.values(data || {}));
      if (window.appLog) window.appLog(`VOD: ${cats.length} categorías`, '#94a3b8');
    } catch(e) {
      if (window.appLog) window.appLog(`VOD get_categories error: ${e.message}`, '#ef4444');
      return [];
    }

    const items = [];
    for (const c of cats.slice(0, 30)) { // limit for first load
      const cid   = String(c.id || c.category_id || '');
      const group = this._cleanTitle(String(c.title || c.category_name || cid));
      if (!cid) continue;
      const movies = await this._stalkerList(base, entry, mac, token, 'vod', 'category', cid, proxy);
      for (const v of movies) {
        items.push({
          id: `stk_vod_${v.id}`, cmd: v.cmd, title: v.name || 'Película',
          group, logo: v.screenshot_uri || v.pic || '', type: 'vod', isStalker: true
        });
      }
    }
    if (window.appLog) window.appLog(`VOD: ${items.length} películas`, '#22c55e');
    return items;
  }

  // =========================================================================
  // SERIES
  // =========================================================================
  async _loadStalkerSeries(base, entry, mac, token, proxy = '') {
    if (window.appLog) window.appLog('Cargando categorías Series...', '#94a3b8');
    let cats = [];
    try {
      const data = await this._stalkerReq(base, entry, mac, token, { type: 'series', action: 'get_categories' }, proxy);
      cats = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : Object.values(data || {}));
      if (window.appLog) window.appLog(`Series: ${cats.length} categorías`, '#94a3b8');
    } catch(e) {
      if (window.appLog) window.appLog(`Series get_categories error: ${e.message}`, '#ef4444');
      return [];
    }

    const items = [];
    for (const c of cats.slice(0, 20)) {
      const cid   = String(c.id || c.category_id || '');
      const group = this._cleanTitle(String(c.title || c.category_name || cid));
      if (!cid) continue;
      const series = await this._stalkerList(base, entry, mac, token, 'series', 'category', cid, proxy);
      for (const s of series) {
        items.push({
          id: `stk_series_${s.id}`, seriesId: s.id, cmd: s.cmd, title: s.name || 'Serie',
          group, logo: s.screenshot_uri || s.pic || '', plot: s.description || '',
          type: 'series', isStalker: true
        });
      }
    }
    if (window.appLog) window.appLog(`Series: ${items.length} series`, '#22c55e');
    return items;
  }

  // =========================================================================
  // PAGINATED LIST FETCHER (mirrors Python list_channels)
  // =========================================================================
  async _stalkerList(base, entry, mac, token, type, filterKey, filterId, proxy = '') {
    const items = [];
    let page = 1;
    while (page <= 50) {
      try {
        const params = { type, action: 'get_ordered_list', p: page, sortby: 'added' };
        params[filterKey] = filterId;
        const js = await this._stalkerReq(base, entry, mac, token, params, proxy);
        let data = js.data || [];
        if (!Array.isArray(data)) data = Object.values(data);
        if (!data.length) break;
        items.push(...data);
        const total = parseInt(js.total_items || 0);
        if (total > 0 && items.length >= total) break;
        page++;
      } catch(e) {
        break;
      }
    }
    return items;
  }

  // =========================================================================
  // RESOLVE STALKER STREAM LINK for playback
  // =========================================================================
  async createStalkerLink(portalUrl, entry, mac, token, cmd, type, seriesNum, proxy = '') {
    const clean = this._cleanCmd(String(cmd || ''));
    if (clean.startsWith('http://') || clean.startsWith('https://')) return clean;

    const params = {
      type: type === 'series' ? 'vod' : type,
      action: 'create_link',
      cmd: clean,
    };
    if (seriesNum != null) params.series = String(seriesNum);

    const q = new URLSearchParams({ ...params, JsHttpRequest: '1-xml' }).toString();
    const url = `${portalUrl}${entry}?${q}`;
    try {
      const data = await this._stalkerFetch(url, mac, token, proxy);
      const js   = this._js(data);
      const streamUrl = this._cleanCmd(String(js.cmd || js.url || ''));
      return streamUrl || clean;
    } catch(e) {
      if (window.appLog) window.appLog(`create_link error: ${e.message}`, '#ef4444');
      return clean;
    }
  }

  // =========================================================================
  // STALKER SERIES EPISODES
  // =========================================================================
  async getStalkerSeriesInfo(portalUrl, entry, mac, token, seriesId, proxy = '') {
    const q = new URLSearchParams({
      type: 'series', action: 'get_ordered_list',
      movie_id: String(seriesId), p: '1', JsHttpRequest: '1-xml'
    }).toString();
    try {
      const data = await this._stalkerFetch(`${portalUrl}${entry}?${q}`, mac, token, proxy);
      const js   = this._js(data);
      let rawData = js.data || [];
      if (!Array.isArray(rawData)) rawData = Object.values(rawData);

      const seasons = rawData.map((si, idx) => {
        const sNum = idx + 1;
        let eps = si.series || [];
        if (!Array.isArray(eps)) eps = Object.values(eps);
        const episodes = eps.length > 0
          ? eps.map((ep, ei) => {
              const en = (typeof ep === 'object' && ep.series_number) ? ep.series_number : (ei + 1);
              return { id: `ep_stk_s${sNum}_e${en}`, title: `E${en} - ${typeof ep === 'object' ? ep.name || 'Episodio' : 'Episodio'}`,
                       num: en, seasonCmd: si.cmd || si.id, episodeNum: en, isStalker: true, type: 'series' };
            })
          : [{ id: `ep_stk_s${sNum}_e1`, title: 'Episodio 1', num: 1, seasonCmd: si.cmd || si.id, episodeNum: 1, isStalker: true, type: 'series' }];
        return { seasonNum: sNum, title: `Temporada ${sNum}`, episodes };
      });
      return { seasons };
    } catch(e) {
      return { seasons: [] };
    }
  }

  // =========================================================================
  // HELPERS
  // =========================================================================
  _cleanCmd(raw) {
    return raw.replace(/^(?:ffmpeg|ffrt)\s+/i, '').replace(/^\d+:\d+\s+/, '').trim();
  }

  _cleanTitle(title) {
    return title.replace(/^[|]?\s*[A-Z]{2}[|]\s*/, '').trim() || title;
  }

  // =========================================================================
  // CORS FALLBACK FETCH
  // =========================================================================
  async _fetchWithCorsFallback(url, options = {}) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      throw new Error(`HTTP status ${res.status}`);
    } catch (e) {
      // Check if it is a local network IP address (e.g. 192.168.x.x, 10.x.x.x, localhost, etc.)
      const isLocal = url.includes('localhost') || url.includes('127.0.0.1') || 
                      /https?:\/\/(?:192\.168\.|10\.|172\.(?:1[6-9]|2[0-9]|3[0-1])\.)/i.test(url);
      
      if (isLocal) {
        if (window.appLog) window.appLog(`Error red local: ${e.message}. No se usa proxy CORS.`, '#ef4444');
        throw e;
      }
      
      const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(url)}`;
      if (window.appLog) window.appLog(`→ Usando Proxy CORS: ${url.substring(0, 45)}...`, '#eab308');
      const res = await fetch(proxyUrl, options);
      if (!res.ok) throw new Error(`Proxy error HTTP ${res.status}`);
      return res;
    }
  }

  // =========================================================================
  // M3U PARSER
  // =========================================================================
  async loadM3uPlaylist(url) {
    if (window.appLog) window.appLog(`Cargando M3U: ${url}`, '#8b5cf6');
    try {
      const resp = await this._fetchWithCorsFallback(url);
      const text = await resp.text();
      const result = this._parseM3u(text);
      if (window.appLog) window.appLog(`M3U: ${result.live.length} TV, ${result.vod.length} Films, ${result.series.length} Series`, '#22c55e');
      return result;
    } catch(e) {
      if (window.appLog) window.appLog(`M3U error: ${e.message}`, '#ef4444');
      throw e;
    }
  }

  _parseM3u(text) {
    const lines = text.split(/\r?\n/);
    const live = [], vod = [], series = [];
    let cur = null;
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      if (line.startsWith('#EXTINF:')) {
        cur = this._parseExtinf(line);
      } else if (!line.startsWith('#') && cur) {
        cur.url = line;
        const g = (cur.group || '').toUpperCase();
        const t = (cur.title || '').toUpperCase();
        const isSeries = g.includes('SERIE') || g.includes('SEASON') || g.includes('TEMPORADA') || /S\d+E\d+/i.test(t);
        const isVod = !isSeries && (g.includes('PELICULA') || g.includes('MOVIE') || g.includes('VOD') || g.includes('FILM') || g.includes('CINE') || line.endsWith('.mp4') || line.endsWith('.mkv'));
        if (isSeries) { cur.type = 'series'; series.push(cur); }
        else if (isVod) { cur.type = 'vod'; vod.push(cur); }
        else { cur.type = 'live'; live.push(cur); }
        cur = null;
      }
    }
    return { live, vod, series,
      categories: {
        live:   [...new Set(live.map(i => i.group))].sort(),
        vod:    [...new Set(vod.map(i => i.group))].sort(),
        series: [...new Set(series.map(i => i.group))].sort()
      }
    };
  }

  _parseExtinf(line) {
    const item = { id: 'm3u_' + Math.random().toString(36).substr(2, 9), title: 'Canal', group: 'General', logo: '' };
    const logo  = line.match(/tvg-logo="([^"]*)"/i);
    const group = line.match(/group-title="([^"]*)"/i);
    if (logo)  item.logo  = logo[1];
    if (group) item.group = group[1];
    const comma = line.lastIndexOf(',');
    if (comma !== -1) item.title = line.substring(comma + 1).trim();
    return item;
  }

  // =========================================================================
  // XTREAM CODES
  // =========================================================================
  async loadXtreamPlaylist(host, username, password) {
    const base = `${host.replace(/\/+$/, '')}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
    try {
      const auth = await this._fetchWithCorsFallback(base).then(r => r.json());
      if (auth.user_info && auth.user_info.auth === 0) throw new Error('Credenciales incorrectas');
      const expDate = auth.user_info?.exp_date ? new Date(parseInt(auth.user_info.exp_date) * 1000).toLocaleDateString() : 'Ilimitado';
      const [lC, lS, vC, vS, srC, srS] = await Promise.all([
        this._fetchWithCorsFallback(`${base}&action=get_live_categories`).then(r => r.json()).catch(() => []),
        this._fetchWithCorsFallback(`${base}&action=get_live_streams`).then(r => r.json()).catch(() => []),
        this._fetchWithCorsFallback(`${base}&action=get_vod_categories`).then(r => r.json()).catch(() => []),
        this._fetchWithCorsFallback(`${base}&action=get_vod_streams`).then(r => r.json()).catch(() => []),
        this._fetchWithCorsFallback(`${base}&action=get_series_categories`).then(r => r.json()).catch(() => []),
        this._fetchWithCorsFallback(`${base}&action=get_series`).then(r => r.json()).catch(() => [])
      ]);
      const h = host.replace(/\/+$/, '');
      const lCM  = (Array.isArray(lC)  ? lC  : []).reduce((a, c) => ({ ...a, [c.category_id]: c.category_name }), {});
      const vCM  = (Array.isArray(vC)  ? vC  : []).reduce((a, c) => ({ ...a, [c.category_id]: c.category_name }), {});
      const srCM = (Array.isArray(srC) ? srC : []).reduce((a, c) => ({ ...a, [c.category_id]: c.category_name }), {});
      const live   = (Array.isArray(lS)  ? lS  : []).map(s => ({ id: `xt_live_${s.stream_id}`, streamId: s.stream_id, title: s.name, group: lCM[s.category_id] || 'Canales', logo: s.stream_icon || '', url: `${h}/live/${username}/${password}/${s.stream_id}.ts`, type: 'live' }));
      const vod    = (Array.isArray(vS)  ? vS  : []).map(v => ({ id: `xt_vod_${v.stream_id}`,  streamId: v.stream_id,  title: v.name, group: vCM[v.category_id]  || 'Películas', logo: v.stream_icon || '', url: `${h}/movie/${username}/${password}/${v.stream_id}.${v.container_extension || 'mp4'}`, type: 'vod' }));
      const series = (Array.isArray(srS) ? srS : []).map(s => ({ id: `xt_series_${s.series_id}`, seriesId: s.series_id, title: s.name, group: srCM[s.category_id] || 'Series', logo: s.cover || '', type: 'series' }));
      return { expiration: expDate, live, vod, series,
        categories: { live: Object.values(lCM).sort(), vod: Object.values(vCM).sort(), series: Object.values(srCM).sort() },
        xtreamConfig: { host: h, username, password }
      };
    } catch(e) {
      if (window.appLog) window.appLog(`Xtream error: ${e.message}`, '#ef4444');
      throw e;
    }
  }
}

window.apiEngine = new ApiEngine();
