/**
 * NOSTRA TV - Unified IPTV Engine
 * Stalker implementation mirrors the working Python stalker-m3u tool exactly.
 * Key: MAC goes in Cookie header, token in Cookie + Authorization Bearer.
 */

// MAG STB emulation headers (most compatible with Stalker middleware)
const STALKER_USER_AGENT = 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3';
const STALKER_X_USER_AGENT = 'Model: MAG250; Link: WiFi';

// Cloudflare Worker proxy URL — IMPORTANT: deploy cloudflare-worker.js to CF Workers and set this URL.
// Instructions in the cloudflare-worker.js file.
const CF_WORKER_URL = 'https://nostratv.naimmeliana.workers.dev/';

// Public CORS proxy fallback for Stalker (some portals work with this)
// Note: this may not work for all portals as Cookie headers might be stripped
const PUBLIC_PROXY_FALLBACK = 'https://corsproxy.io/?url=';

const STALKER_ENTRY_POINTS = [
  '/server/load.php',
  '/portal.php',
  '/c/server/load.php',
  '/stalker_portal/server/load.php',
];

// Minimal MD5 implementation + WebCrypto SHA helpers for Stalker MAC Portal authentication
const CryptoHelpers = (() => {
  function md5cycle(x, k) {
    let a = x[0], b = x[1], c = x[2], d = x[3];
    a = ff(a,b,c,d,k[0],7,-680876936); d = ff(d,a,b,c,k[1],12,-389564586); c = ff(c,d,a,b,k[2],17,606105819); b = ff(b,c,d,a,k[3],22,-1044525330);
    a = ff(a,b,c,d,k[4],7,-176418897); d = ff(d,a,b,c,k[5],12,1200080426); c = ff(c,d,a,b,k[6],17,-1473231341); b = ff(b,c,d,a,k[7],22,-45705983);
    a = ff(a,b,c,d,k[8],7,1770035416); d = ff(d,a,b,c,k[9],12,-1958414417); c = ff(c,d,a,b,k[10],17,-42063); b = ff(b,c,d,a,k[11],22,-1990404162);
    a = ff(a,b,c,d,k[12],7,1804603682); d = ff(d,a,b,c,k[13],12,-40341101); c = ff(c,d,a,b,k[14],17,-1502002290); b = ff(b,c,d,a,k[15],22,1236535329);
    a = gg(a,b,c,d,k[1],5,-165796510); d = gg(d,a,b,c,k[6],9,-1069501632); c = gg(c,d,a,b,k[11],14,643717713); b = gg(b,c,d,a,k[0],20,-373897302);
    a = gg(a,b,c,d,k[5],5,-701558691); d = gg(d,a,b,c,k[10],9,38016083); c = gg(c,d,a,b,k[15],14,-660478335); b = gg(b,c,d,a,k[4],20,-405537848);
    a = gg(a,b,c,d,k[9],5,568446438); d = gg(d,a,b,c,k[14],9,-1019803690); c = gg(c,d,a,b,k[3],14,-187363961); b = gg(b,c,d,a,k[8],20,1163531501);
    a = gg(a,b,c,d,k[13],5,-1444681467); d = gg(d,a,b,c,k[2],9,-51403784); c = gg(c,d,a,b,k[7],14,1735328473); b = gg(b,c,d,a,k[12],20,-1926607734);
    a = hh(a,b,c,d,k[5],4,-378558); d = hh(d,a,b,c,k[8],11,-2022574463); c = hh(c,d,a,b,k[11],16,1839030562); b = hh(b,c,d,a,k[14],23,-35309556);
    a = hh(a,b,c,d,k[1],4,-1530992060); d = hh(d,a,b,c,k[4],11,1272893353); c = hh(c,d,a,b,k[7],16,-155497632); b = hh(b,c,d,a,k[10],23,-1094730640);
    a = hh(a,b,c,d,k[13],4,681279174); d = hh(d,a,b,c,k[0],11,-358537222); c = hh(c,d,a,b,k[3],16,-722521979); b = hh(b,c,d,a,k[6],23,76029189);
    a = hh(a,b,c,d,k[9],4,-640364487); d = hh(d,a,b,c,k[12],11,-421815835); c = hh(c,d,a,b,k[15],16,530742520); b = hh(b,c,d,a,k[2],23,-995338651);
    a = ii(a,b,c,d,k[0],6,-198630844); d = ii(d,a,b,c,k[7],10,1126891415); c = ii(c,d,a,b,k[14],15,-1416354905); b = ii(b,c,d,a,k[5],21,-57434055);
    a = ii(a,b,c,d,k[12],6,1700485571); d = ii(d,a,b,c,k[3],10,-1894986606); c = ii(c,d,a,b,k[10],15,-1051523); b = ii(b,c,d,a,k[1],21,-2054922799);
    a = ii(a,b,c,d,k[8],6,1873313359); d = ii(d,a,b,c,k[15],10,-30611744); c = ii(c,d,a,b,k[6],15,-1560198380); b = ii(b,c,d,a,k[13],21,1309151649);
    a = ii(a,b,c,d,k[4],6,-145523070); d = ii(d,a,b,c,k[11],10,-1120210379); c = ii(c,d,a,b,k[2],15,718787259); b = ii(b,c,d,a,k[9],21,-343485551);
    x[0] = add32(a, x[0]); x[1] = add32(b, x[1]); x[2] = add32(c, x[2]); x[3] = add32(d, x[3]);
  }
  function cmn(q,a,b,x,s,t){ a=add32(add32(a,q),add32(x,t)); return add32((a<<s)|(a>>>(32-s)),b); }
  function ff(a,b,c,d,x,s,t){ return cmn((b&c)|((~b)&d),a,b,x,s,t); }
  function gg(a,b,c,d,x,s,t){ return cmn((b&d)|(c&(~d)),a,b,x,s,t); }
  function hh(a,b,c,d,x,s,t){ return cmn(b^c^d,a,b,x,s,t); }
  function ii(a,b,c,d,x,s,t){ return cmn(c^(b|(~d)),a,b,x,s,t); }
  function md51(s){ const n=s.length; const state=[1732584193,-271733879,-1732584194,271733878]; let i; for(i=64;i<=n;i+=64) md5cycle(state, md5blk(s.substring(i-64,i))); s=s.substring(i-64); const tail=new Array(16).fill(0); for(i=0;i<s.length;i++) tail[i>>2]|=s.charCodeAt(i)<<((i%4)<<3); tail[i>>2]|=0x80<<((i%4)<<3); if(i>55){ md5cycle(state,tail); tail.fill(0); } tail[14]=n*8; md5cycle(state,tail); return state; }
  function md5blk(s){ const md5blks=[]; for(let i=0;i<64;i+=4) md5blks[i>>2]=s.charCodeAt(i)+(s.charCodeAt(i+1)<<8)+(s.charCodeAt(i+2)<<16)+(s.charCodeAt(i+3)<<24); return md5blks; }
  const hex_chr='0123456789abcdef'.split(''); function rhex(n){ let s='',j=0; for(;j<4;j++) s+=hex_chr[(n>>(j*8+4))&15]+hex_chr[(n>>(j*8))&15]; return s; }
  function hex(x){ for(let i=0;i<x.length;i++) x[i]=rhex(x[i]); return x.join(''); }
  function add32(a,b){ return (a+b)&0xffffffff; }
  function md5(s){ return hex(md51(unescape(encodeURIComponent(s)))); }
  async function digestHex(algo, text){
    const enc=new TextEncoder();
    const buf=await crypto.subtle.digest(algo, enc.encode(text));
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  return {
    md5,
    sha1: t=>digestHex('SHA-1',t),
    sha256: t=>digestHex('SHA-256',t)
  };
})();

class ApiEngine {
  constructor() {}

  // =========================================================================
  // LOW-LEVEL: fetch wrapper with cookie-based MAC auth (mirrors Python impl)
  // =========================================================================
  /**
   * Stalker fetch with automatic proxy selection.
   * Priority: custom proxy → local Node server → CF Worker → direct (TV only)
   */
  async _stalkerFetch(url, mac, token, proxyUrl = '') {
    const isLocal = window.location.hostname === 'localhost' ||
                    window.location.hostname === '127.0.0.1' ||
                    window.location.hostname.startsWith('192.168.') ||
                    window.location.hostname.startsWith('10.');

    const isTV = navigator.userAgent.toLowerCase().includes('webos') || 
                 window.location.protocol === 'file:';

    // Append mac and token to the URL query string if they are not already there
    // This is required for browsers/engines that strip the Cookie header on direct fetch
    let targetUrl = url;
    try {
      const parsedUrl = new URL(targetUrl);
      let changed = false;
      if (mac && !parsedUrl.searchParams.has('mac')) {
        parsedUrl.searchParams.set('mac', mac);
        changed = true;
      }
      if (token && !parsedUrl.searchParams.has('token')) {
        parsedUrl.searchParams.set('token', token);
        changed = true;
      }
      if (changed) {
        targetUrl = parsedUrl.toString();
      }
    } catch (e) {}

    // Determine active proxy
    let activeProxy = proxyUrl;
    if (!activeProxy) {
      if (isLocal && window.location.protocol.startsWith('http')) {
        activeProxy = `${window.location.origin}/api/stalker-proxy`;
      } else if (isTV) {
        // Packaged WebOS App runs natively and can bypass CORS directly. No proxy needed!
        activeProxy = '';
      } else {
        activeProxy = CF_WORKER_URL;
      }
    }

    // Try with proxy
    if (activeProxy) {
      const proxyTarget = `${activeProxy.replace(/\/$/, '')}?url=${encodeURIComponent(targetUrl)}&mac=${encodeURIComponent(mac)}&token=${encodeURIComponent(token || '')}`;
      if (window.appLog) window.appLog(`[Proxy] ${activeProxy.split('/')[2]} → ${targetUrl.substring(0, 35)}...`, '#eab308');
      try {
        const r = await fetch(proxyTarget, { method: 'GET', cache: 'no-cache' });
        if (!r.ok) {
          const errText = await r.text().catch(() => '');
          throw new Error(`Proxy HTTP ${r.status}: ${errText.substring(0, 80)}`);
        }
        const text = await r.text();
        try {
          return JSON.parse(text);
        } catch(je) {
          if (window.appLog) window.appLog(`JSON parse error: ${text.substring(0, 60)}`, '#ef4444');
          throw new Error(`Invalid JSON from proxy: ${text.substring(0, 40)}`);
        }
      } catch(e) {
        if (window.appLog) window.appLog(`Proxy falló: ${e.message}`, '#ef4444');
        // If the primary proxy fails, try direct (webOS TV can sometimes bypass CORS for same-origin portals)
        if (!isLocal) {
          if (window.appLog) window.appLog('Intentando conexión directa...', '#eab308');
        }
      }
    }

    // Direct fetch (works on webOS TV native, fails on browser due to CORS)
    let cookie = `mac=${mac}; stb_lang=en; timezone=Europe/London`;
    if (token) cookie += `; token=${token}`;

    const headers = {
      'User-Agent': STALKER_USER_AGENT,
      'X-User-Agent': STALKER_X_USER_AGENT,
      'Cookie': cookie,
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    if (window.appLog) window.appLog(`[Direct] ${targetUrl.substring(0, 50)}`, '#94a3b8');
    const r = await fetch(targetUrl, { method: 'GET', headers, cache: 'no-cache' });
    if (!r.ok) throw new Error(`HTTP ${r.status} directo para ${targetUrl}`);
    const text = await r.text();
    try {
      return JSON.parse(text);
    } catch(je) {
      throw new Error(`JSON inválido (${r.status}): ${text.substring(0, 60)}`);
    }
  }

  _js(data) {
    if (data && typeof data === 'object') {
      return data.js !== undefined ? data.js : data;
    }
    return {};
  }

  // =========================================================================
  // STALKER HANDSHAKE — supports simple and prehash token handshakes
  // =========================================================================
  async _stalkerHandshake(baseUrl, mac, proxy = '') {
    for (const ep of STALKER_ENTRY_POINTS) {
      if (window.appLog) window.appLog(`Handshake: ${ep}`, '#94a3b8');
      
      // Try Simple handshake first
      try {
        const url = `${baseUrl}${ep}?type=stb&action=handshake&mac=${mac}&JsHttpRequest=1-xml`;
        const data = await this._stalkerFetch(url, mac, null, proxy);
        const js = this._js(data);
        const token = (js && js.token) ? js.token : null;
        
        let randomVal = (js && js.random) || '';
        if (!randomVal) {
          randomVal = Array.from({length:40}, () => Math.floor(Math.random()*16).toString(16)).join('');
        }
        localStorage.setItem(`nostratv_stalker_random_${mac}`, randomVal.toLowerCase());
        
        if (token) {
          if (window.appLog) window.appLog(`✓ Token simple OK (${ep}): ${token.substring(0, 12)}...`, '#22c55e');
          return { entry: ep, token };
        }
      } catch(e) {
        if (window.appLog) window.appLog(`Simple ${ep} falló: ${e.message}`, '#94a3b8');
      }

      // Try Alternative token/prehash handshake (old Stalker method)
      try {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        const randomToken = Array.from({length:32}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
        const prehash = (await CryptoHelpers.sha1(randomToken)).toLowerCase();
        
        const url = `${baseUrl}${ep}?type=stb&action=handshake&mac=${mac}&token=${randomToken}&prehash=${prehash}&JsHttpRequest=1-xml`;
        const data = await this._stalkerFetch(url, mac, null, proxy);
        const js = this._js(data);
        const token = (js && js.token) ? js.token : null;
        
        let randomVal = (js && js.random) || '';
        if (!randomVal) {
          randomVal = Array.from({length:40}, () => Math.floor(Math.random()*16).toString(16)).join('');
        }
        localStorage.setItem(`nostratv_stalker_random_${mac}`, randomVal.toLowerCase());

        if (token) {
          if (window.appLog) window.appLog(`✓ Token prehash OK (${ep}): ${token.substring(0, 12)}...`, '#22c55e');
          return { entry: ep, token };
        }
      } catch(e) {
        if (window.appLog) window.appLog(`Prehash ${ep} falló: ${e.message}`, '#ef4444');
      }
    }
    throw new Error(`Handshake fallido en todos los endpoints de ${baseUrl}`);
  }

  // =========================================================================
  // STALKER SECOND STEP SIGNATURE AUTHENTICATION (MAG250 emulation)
  // =========================================================================
  async _getUpgradedToken(baseUrl, entry, mac, token, proxy = '') {
    let activeToken = token;
    let expDate = 'Activa';
    try {
      const serial = CryptoHelpers.md5(mac).slice(0, 13).toUpperCase();
      const deviceId = (await CryptoHelpers.sha256(mac)).toUpperCase();
      const signature = (await CryptoHelpers.sha256(`${mac}${serial}${deviceId}${deviceId}`)).toUpperCase();
      const hwVersion2 = (await CryptoHelpers.sha1(mac)).toLowerCase();
      
      const randomVal = localStorage.getItem(`nostratv_stalker_random_${mac}`) || 
                        Array.from({length:40}, () => Math.floor(Math.random()*16).toString(16)).join('');
      
      const metrics = JSON.stringify({ mac, sn: serial, type: 'STB', model: 'MAG250', uid: '', random: randomVal.toLowerCase() });
      
      const profileParams = {
        type: 'stb',
        action: 'get_profile',
        hd: '1',
        ver: 'ImageDescription: 0.2.18-r23-250; ImageDate: Thu Sep 13 11:31:16 EEST 2018; PORTAL version: 5.6.2; API Version: JS API version: 343; STB API version: 146; Player Engine version: 0x58c',
        num_banks: '2',
        sn: serial,
        stb_type: 'MAG250',
        client_type: 'STB',
        image_version: '218',
        video_out: 'hdmi',
        device_id: deviceId,
        device_id2: deviceId,
        signature: signature,
        auth_second_step: '1',
        hw_version: '1.7-BD-00',
        not_valid_token: '0',
        metrics: metrics,
        hw_version_2: hwVersion2,
        timestamp: String(Math.floor(Date.now()/1000)),
        api_signature: '262',
        prehash: ''
      };

      const q = new URLSearchParams({ ...profileParams, JsHttpRequest: '1-xml' }).toString();
      const url = `${baseUrl}${entry}?${q}`;
      
      const profile = await this._stalkerFetch(url, mac, token, proxy);
      let profileJs = this._js(profile);
      
      if (profileJs) {
        expDate = profileJs.expire_billing_date || profileJs.end_date || profileJs.exp_date || profileJs.expire_date || 'Activa';
        if (profileJs.token) {
          activeToken = profileJs.token;
          if (window.appLog) window.appLog(`✓ Perfil firmado OK. Exp: ${expDate}`, '#22c55e');
        }
      }
    } catch (e) {
      if (window.appLog) window.appLog(`Firma perfil error (usando token base): ${e.message}`, '#eab308');
    }
    return { token: activeToken, expDate };
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
    const handshakeResult = await this._stalkerHandshake(base, mac, proxy);
    const entry = handshakeResult.entry;
    
    // Step 2: Upgraded Second Step Signature Auth
    if (window.appLog) window.appLog('Firmando perfil dispositivo...', '#94a3b8');
    const { token, expDate } = await this._getUpgradedToken(base, entry, mac, handshakeResult.token, proxy);
    
    // Antiflood wait
    await new Promise(r => setTimeout(r, 600));

    // Step 3: Load ITV, VOD, Series
    const live    = await this._loadStalkerITV(base, entry, mac, token, proxy);
    await new Promise(r => setTimeout(r, 600));
    
    const vod     = await this._loadStalkerVOD(base, entry, mac, token, proxy);
    await new Promise(r => setTimeout(r, 600));
    
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
  // ITV (Live TV) — optimized single-request channel loading
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
    
    // Try to load all channels in a single request first (like StreamVault does!)
    if (window.appLog) window.appLog('Cargando todos los canales (get_all_channels)...', '#94a3b8');
    let rawChannels = [];
    try {
      const allData = await this._stalkerReq(base, entry, mac, token, { type: 'itv', action: 'get_all_channels' }, proxy);
      rawChannels = allData.data || allData || [];
      if (!Array.isArray(rawChannels)) rawChannels = Object.values(rawChannels);
    } catch (e) {
      if (window.appLog) window.appLog('get_all_channels falló, intentando get_ordered_list...', '#eab308');
      try {
        const orderedData = await this._stalkerReq(base, entry, mac, token, { type: 'itv', action: 'get_ordered_list' }, proxy);
        rawChannels = orderedData.data || orderedData || [];
        if (!Array.isArray(rawChannels)) rawChannels = Object.values(rawChannels);
      } catch (e2) {
        if (window.appLog) window.appLog(`ITV loading failed: ${e2.message}`, '#ef4444');
      }
    }

    // If we loaded channels successfully in a single query:
    if (Array.isArray(rawChannels) && rawChannels.length > 0) {
      for (const ch of rawChannels) {
        const cmd = this._cleanCmd(String(ch.cmd || ''));
        if (!cmd) continue;
        
        let group = 'Otros';
        if (ch.tv_genre_id && genres.length > 0) {
          const matchedGenre = genres.find(g => String(g.id || g.genre_id || '') === String(ch.tv_genre_id));
          if (matchedGenre) group = this._cleanTitle(String(matchedGenre.title || matchedGenre.genre_title || matchedGenre.name || ''));
        }
        
        items.push({
          id: `stk_live_${ch.id}`, cmd: ch.cmd, title: ch.name || 'Canal',
          num: ch.number || '', group,
          logo: ch.logo ? (ch.logo.startsWith('http') ? ch.logo : `${base}/misc/logos/320/${ch.logo}`) : '',
          epgId: ch.xmltv_id || '', type: 'live', isStalker: true
        });
      }
    } else {
      // Fallback: load genre by genre (original slow code, but only if all-channels failed)
      if (window.appLog) window.appLog('Cargando canales por género (lento)...', '#eab308');
      for (const g of genres) {
        const gid   = String(g.id || g.genre_id || '');
        const group = this._cleanTitle(String(g.title || g.genre_title || gid));
        if (!gid) continue;
        const channels = await this._stalkerList(base, entry, mac, token, 'itv', 'genre', gid, proxy, 2);
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
        await new Promise(r => setTimeout(r, 400)); // anti-flood delay
      }
    }
    
    if (window.appLog) window.appLog(`ITV: ${items.length} canales`, '#22c55e');
    return items;
  }

  // =========================================================================
  // VOD — uses get_categories + category param (limited pages for speed)
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
    // Prioritize/limit category load to prevent anti-flood rate limits
    const catsToLoad = cats.slice(0, 12);
    for (const c of catsToLoad) {
      const cid   = String(c.id || c.category_id || '');
      const group = this._cleanTitle(String(c.title || c.category_name || cid));
      if (!cid) continue;
      
      const movies = await this._stalkerList(base, entry, mac, token, 'vod', 'category', cid, proxy, 1);
      for (const v of movies) {
        items.push({
          id: `stk_vod_${v.id}`, cmd: v.cmd, title: v.name || 'Película',
          group, logo: v.screenshot_uri || v.pic || '', type: 'vod', isStalker: true
        });
      }
      await new Promise(r => setTimeout(r, 400)); // prevent 429 flood
    }
    if (window.appLog) window.appLog(`VOD: ${items.length} películas`, '#22c55e');
    return items;
  }

  // =========================================================================
  // SERIES (limited pages for speed)
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
    const catsToLoad = cats.slice(0, 8);
    for (const c of catsToLoad) {
      const cid   = String(c.id || c.category_id || '');
      const group = this._cleanTitle(String(c.title || c.category_name || cid));
      if (!cid) continue;
      
      const series = await this._stalkerList(base, entry, mac, token, 'series', 'category', cid, proxy, 1);
      for (const s of series) {
        items.push({
          id: `stk_series_${s.id}`, seriesId: s.id, cmd: s.cmd, title: s.name || 'Serie',
          group, logo: s.screenshot_uri || s.pic || '', plot: s.description || '',
          type: 'series', isStalker: true
        });
      }
      await new Promise(r => setTimeout(r, 400)); // prevent 429 flood
    }
    if (window.appLog) window.appLog(`Series: ${items.length} series`, '#22c55e');
    return items;
  }

  // =========================================================================
  // PAGINATED LIST FETCHER (supports configurable max pages)
  // =========================================================================
  async _stalkerList(base, entry, mac, token, type, filterKey, filterId, proxy = '', maxPages = 1) {
    const items = [];
    let page = 1;
    while (page <= maxPages) {
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
  // RESOLVE STALKER STREAM LINK for playback (with empty stream param recovery)
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
      let streamUrl = this._cleanCmd(String(js.cmd || js.url || ''));
      
      // Fix empty stream parameter if stripped by Stalker portal (e.g. mag.greatott.me)
      if (streamUrl && (streamUrl.includes('stream=&') || streamUrl.endsWith('stream='))) {
        let match = clean.match(/[&?]stream=([0-9a-zA-Z_]+)/);
        let streamId = match ? match[1] : null;
        if (!streamId) {
          const cleanCmd = clean.replace(/\.(ts|mp4|mpg|mpeg|mkv|avi|mov|wmv|flv|webm)$/i, '');
          const idMatch = cleanCmd.match(/(\d+)\D*$/);
          if (idMatch) streamId = idMatch[1];
        }
        if (!streamId && clean.includes('ch_id=')) {
          let chMatch = clean.match(/ch_id=(\d+)/);
          if (chMatch) streamId = chMatch[1];
        }
        if (streamId) {
          streamUrl = streamUrl.replace('stream=', `stream=${streamId}`);
          if (window.appLog) window.appLog(`[LinkFix] Injected stream ID: ${streamId}`, '#22c55e');
        }
      }
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
