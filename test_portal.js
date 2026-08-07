const http = require('http');

const PORTAL = 'http://mag.greatott.me:80';
const MAC    = '00:1A:79:74:B1:B9';
const BASE   = `${PORTAL}/server/load.php`;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (SMART-TV; Linux; Tizen 5.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/2.1 Chrome/56.0.2924.0 TV Safari/537.36',
  'X-User-Agent': 'Model: MAG250; Link: WiFi',
  'Accept': '*/*',
  'X-Requested-With': 'XMLHttpRequest',
};

const wait = (ms) => new Promise(r => setTimeout(r, ms));

function buildCookie(mac, token) {
  let c = `mac=${encodeURIComponent(mac)}; stb_lang=es; timezone=Europe/Madrid`;
  if (token) c += `; token=${encodeURIComponent(token)}`;
  return c;
}

function httpGet(url, extraHeaders) {
  return new Promise((resolve, reject) => {
    http.get(url, { headers: { ...HEADERS, ...extraHeaders } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, text: data }));
    }).on('error', reject);
  });
}

function parseResponse(text) {
  const t = text.trim();
  if (!t) return { error: 'EMPTY_RESPONSE' };
  if (t.startsWith('<')) return { format: 'XML/HTML', snippet: t.substring(0, 100) };
  let jsonStr = t;
  if (jsonStr.startsWith('js=')) jsonStr = jsonStr.slice(3);
  else if (jsonStr.startsWith('var js=')) jsonStr = jsonStr.slice(7);
  if (jsonStr.includes('/*') && jsonStr.includes('*/'))
    jsonStr = jsonStr.substring(jsonStr.indexOf('*/') + 2).trim();
  if (jsonStr.endsWith(';')) jsonStr = jsonStr.slice(0, -1);
  try { return { format: 'JSON', parsed: JSON.parse(jsonStr) }; }
  catch(e) { return { format: 'UNKNOWN', snippet: t.substring(0, 200) }; }
}

async function stk(action, type, token, extra) {
  const cookie = buildCookie(MAC, token);
  const url = `${BASE}?type=${type}&action=${action}&mac=${encodeURIComponent(MAC)}${extra||''}&JsHttpRequest=1-xml`;
  return httpGet(url, { Cookie: cookie });
}

async function run() {
  console.log('='.repeat(60));
  console.log('TEST CON DELAYS - Portal Stalker');
  console.log('='.repeat(60));

  // STEP 1: Handshake
  console.log('\n[STEP 1] HANDSHAKE...');
  const hs = await stk('handshake', 'stb', null);
  const hsData = parseResponse(hs.text);
  const d = hsData.parsed || {};
  const token = (d.js && d.js.token) || (d.result && d.result.token) || d.token || null;
  console.log(`Status: ${hs.status} | Token: ${token || 'NULO'}`);

  if (!token) { console.log('FALLO: sin token'); return; }

  // STEP 2: get_profile (con 2s de espera)
  console.log('\n[STEP 2] Esperando 2000ms antes de get_profile...');
  await wait(2000);
  console.log('[STEP 2] GET_PROFILE...');
  const prof = await stk('get_profile', 'stb', token);
  console.log(`Status: ${prof.status} | RAW: ${prof.text.substring(0,100)}`);

  // STEP 3: get_genres (con 2s)
  console.log('\n[STEP 3] Esperando 2000ms antes de get_genres...');
  await wait(2000);
  console.log('[STEP 3] GET_GENRES...');
  const genres = await stk('get_genres', 'itv', token);
  console.log(`Status: ${genres.status} | RAW: ${genres.text.substring(0,100)}`);

  // STEP 4: get_all_channels (con 2s)
  console.log('\n[STEP 4] Esperando 2000ms antes de get_all_channels...');
  await wait(2000);
  console.log('[STEP 4] GET_ALL_CHANNELS...');
  const chans = await stk('get_all_channels', 'itv', token);
  console.log(`Status: ${chans.status} | RAW: ${chans.text.substring(0,150)}`);
  if (chans.status === 200) {
    const cd = parseResponse(chans.text);
    if (cd.parsed) {
      const x = cd.parsed;
      const arr = (x.js && x.js.data) || x.js || (x.result && x.result.data) || x.result || x;
      console.log(`Canales: ${Array.isArray(arr) ? arr.length : 'NO ARRAY, keys=' + Object.keys(x).join(',')}`);
      if (Array.isArray(arr) && arr.length > 0) console.log('Primer canal:', JSON.stringify(arr[0]));
    }
  }

  // STEP 5: get_ordered_list (con 2s) si get_all_channels fallo
  console.log('\n[STEP 5] Esperando 2000ms antes de get_ordered_list...');
  await wait(2000);
  console.log('[STEP 5] GET_ORDERED_LIST...');
  const ordered = await stk('get_ordered_list', 'itv', token, '&p=1&sortby=number');
  console.log(`Status: ${ordered.status} | RAW: ${ordered.text.substring(0,150)}`);
  if (ordered.status === 200) {
    const od = parseResponse(ordered.text);
    if (od.parsed) {
      const x = od.parsed;
      const arr = (x.js && x.js.data) || x.js || (x.result && x.result.data) || x.result || x;
      console.log(`Items: ${Array.isArray(arr) ? arr.length : 'NO ARRAY, keys=' + Object.keys(x).join(',')}`);
      if (Array.isArray(arr) && arr.length > 0) console.log('Primer item:', JSON.stringify(arr[0]));
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('TEST CON DELAYS COMPLETADO');
}

run().catch(e => console.error('Error:', e.message));
