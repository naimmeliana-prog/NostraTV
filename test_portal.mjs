/**
 * test_portal.mjs — Diagnóstico directo del portal Stalker
 * Ejecutar con: node test_portal.mjs
 */

const PORTAL = 'http://mag.greatott.me:80';
const MAC    = '00:1A:79:74:B1:B9';
const BASE   = `${PORTAL}/server/load.php`;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (SMART-TV; Linux; Tizen 5.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/2.1 Chrome/56.0.2924.0 TV Safari/537.36',
  'X-User-Agent': 'Model: MAG250; Link: WiFi',
  'Accept': '*/*',
  'X-Requested-With': 'XMLHttpRequest',
};

function buildCookie(mac, token) {
  let c = `mac=${encodeURIComponent(mac)}; stb_lang=es; timezone=Europe/Madrid`;
  if (token) c += `; token=${encodeURIComponent(token)}`;
  return c;
}

async function stk(action, type, token, extra = '') {
  const cookie = buildCookie(MAC, token);
  const url = `${BASE}?type=${type}&action=${action}&mac=${encodeURIComponent(MAC)}${extra}&JsHttpRequest=1-xml`;
  const resp = await fetch(url, {
    headers: { ...HEADERS, Cookie: cookie }
  });
  const text = await resp.text();
  return { status: resp.status, text };
}

function parseResponse(text) {
  const t = text.trim();
  if (!t) return { error: 'EMPTY_RESPONSE' };
  if (t.startsWith('<')) return { format: 'XML', snippet: t.substring(0, 200) };

  let jsonStr = t;
  if (jsonStr.startsWith('js=')) jsonStr = jsonStr.slice(3);
  else if (jsonStr.startsWith('var js=')) jsonStr = jsonStr.slice(7);
  if (jsonStr.includes('/*') && jsonStr.includes('*/')) {
    jsonStr = jsonStr.substring(jsonStr.indexOf('*/') + 2).trim();
  }
  if (jsonStr.endsWith(';')) jsonStr = jsonStr.slice(0, -1);

  try {
    const parsed = JSON.parse(jsonStr);
    return { format: 'JSON', parsed };
  } catch(e) {
    return { format: 'UNKNOWN', snippet: t.substring(0, 300) };
  }
}

async function run() {
  console.log('='.repeat(60));
  console.log('DIAGNÓSTICO PORTAL STALKER');
  console.log(`Portal: ${PORTAL}`);
  console.log(`MAC:    ${MAC}`);
  console.log('='.repeat(60));

  // STEP 1: Handshake
  console.log('\n--- STEP 1: HANDSHAKE ---');
  const hs = await stk('handshake', 'stb', null);
  console.log('HTTP Status:', hs.status);
  console.log('Raw (primeros 400 chars):', hs.text.substring(0, 400));
  const hsData = parseResponse(hs.text);
  console.log('Formato detectado:', hsData.format || hsData.error);
  if (hsData.parsed) console.log('Datos:', JSON.stringify(hsData.parsed, null, 2));

  // Extraer token
  let token = null;
  if (hsData.parsed) {
    const d = hsData.parsed;
    if (d.js && d.js.token) token = d.js.token;
    else if (d.result && d.result.token) token = d.result.token;
    else if (d.token) token = d.token;
  }
  console.log('\n>>> TOKEN EXTRAÍDO:', token || '❌ NO TOKEN');

  if (!token) {
    console.log('\n⛔ Sin token no podemos continuar. El handshake ha fallado.');
    return;
  }

  // STEP 2: get_profile
  console.log('\n--- STEP 2: GET_PROFILE ---');
  const prof = await stk('get_profile', 'stb', token);
  console.log('HTTP Status:', prof.status);
  console.log('Raw (primeros 400 chars):', prof.text.substring(0, 400));
  const profData = parseResponse(prof.text);
  console.log('Formato detectado:', profData.format || profData.error);
  if (profData.parsed) console.log('Datos:', JSON.stringify(profData.parsed, null, 2).substring(0, 600));

  // STEP 3: get_genres (ITV)
  console.log('\n--- STEP 3: ITV GET_GENRES ---');
  const genres = await stk('get_genres', 'itv', token);
  console.log('HTTP Status:', genres.status);
  console.log('Raw (primeros 400 chars):', genres.text.substring(0, 400));
  const genresData = parseResponse(genres.text);
  console.log('Formato detectado:', genresData.format || genresData.error);
  if (genresData.parsed) {
    const arr = genresData.parsed.js || genresData.parsed.result || genresData.parsed;
    console.log('Número de géneros:', Array.isArray(arr) ? arr.length : 'no es array');
    if (Array.isArray(arr) && arr.length > 0) console.log('Primer género:', arr[0]);
  }

  // STEP 4: get_all_channels
  console.log('\n--- STEP 4: ITV GET_ALL_CHANNELS ---');
  const chans = await stk('get_all_channels', 'itv', token);
  console.log('HTTP Status:', chans.status);
  console.log('Raw (primeros 400 chars):', chans.text.substring(0, 400));
  const chansData = parseResponse(chans.text);
  console.log('Formato detectado:', chansData.format || chansData.error);
  if (chansData.parsed) {
    const d = chansData.parsed;
    const arr = (d.js && d.js.data) || d.js || (d.result && d.result.data) || d.result || d;
    console.log('Número de canales:', Array.isArray(arr) ? arr.length : 'no es array / keys: ' + Object.keys(d).join(', '));
    if (Array.isArray(arr) && arr.length > 0) console.log('Primer canal:', JSON.stringify(arr[0]));
  }

  // STEP 5: get_ordered_list fallback
  console.log('\n--- STEP 5: ITV GET_ORDERED_LIST (fallback) ---');
  const ordered = await stk('get_ordered_list', 'itv', token, '&p=1&sortby=number&fav=0');
  console.log('HTTP Status:', ordered.status);
  console.log('Raw (primeros 400 chars):', ordered.text.substring(0, 400));
  const orderedData = parseResponse(ordered.text);
  console.log('Formato detectado:', orderedData.format || orderedData.error);
  if (orderedData.parsed) {
    const d = orderedData.parsed;
    const arr = (d.js && d.js.data) || d.js || (d.result && d.result.data) || d.result || d;
    console.log('Número de items:', Array.isArray(arr) ? arr.length : 'no es array / keys: ' + Object.keys(d).join(', '));
    if (Array.isArray(arr) && arr.length > 0) console.log('Primer item:', JSON.stringify(arr[0]));
  }

  console.log('\n' + '='.repeat(60));
  console.log('DIAGNÓSTICO COMPLETADO');
  console.log('='.repeat(60));
}

run().catch(e => console.error('Error fatal:', e));
