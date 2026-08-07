/**
 * NOSTRA TV - Cloudflare Worker Proxy for Stalker/MAC Portals
 * 
 * DEPLOYMENT INSTRUCTIONS:
 * 1. Go to https://dash.cloudflare.com/ → Workers & Pages → Create Worker
 * 2. Name it: nostratv-proxy  (or any name)
 * 3. Paste this entire file content into the editor
 * 4. Click "Deploy"
 * 5. Copy the Worker URL (e.g. https://nostratv-proxy.YOUR-ACCOUNT.workers.dev)
 * 6. Open NostraTV app → Settings → Proxy URL → paste the URL
 *    OR update the DEFAULT_PROXY_URL constant in js/api.js
 */

const STALKER_USER_AGENT = 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3';
const STALKER_X_USER_AGENT = 'Model: MAG250; Link: WiFi';

// Allowed origins for CORS (set to * for maximum compatibility)
const ALLOWED_ORIGIN = '*';

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');
    const mac       = url.searchParams.get('mac');
    const token     = url.searchParams.get('token') || '';

    // Validate required params
    if (!targetUrl || !mac) {
      return new Response(JSON.stringify({ error: 'Missing required parameters: url and mac' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        },
      });
    }

    // Security: only allow http/https schemes
    let parsedTarget;
    try {
      parsedTarget = new URL(targetUrl);
      if (!['http:', 'https:'].includes(parsedTarget.protocol)) {
        throw new Error('Invalid protocol');
      }
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid target URL' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        },
      });
    }

    // Build Stalker cookie
    let cookie = `mac=${encodeURIComponent(mac)}; stb_lang=es; timezone=Europe/Madrid`;
    if (token) cookie += `; token=${encodeURIComponent(token)}`;

    let host = parsedTarget.host;
    let referer = `${parsedTarget.protocol}//${parsedTarget.host}/c/`;
    let origin = `${parsedTarget.protocol}//${parsedTarget.host}`;

    const proxyHeaders = {
      'User-Agent': STALKER_USER_AGENT,
      'X-User-Agent': STALKER_X_USER_AGENT,
      'Cookie': cookie,
      'Accept': '*/*',
      'X-Requested-With': 'XMLHttpRequest',
      'X-Stalker-User-Agent': STALKER_USER_AGENT,
      'X-Stalker-Referer': referer,
      'X-Stalker-Host': host,
      'Origin': origin,
      'X-User-Card': 'true',
      'X-User-MAC': mac,
      'X-Stalker-Cookie': cookie
    };
    if (token) proxyHeaders['Authorization'] = `Bearer ${token}`;

    try {
      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: proxyHeaders,
        // Follow redirects
        redirect: 'follow',
      });

      const responseBody = await response.arrayBuffer();

      return new Response(responseBody, {
        status: response.status,
        headers: {
          'Content-Type': response.headers.get('content-type') || 'application/json',
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Cache-Control': 'no-cache',
          'X-Proxied-From': parsedTarget.hostname,
        },
      });

    } catch (e) {
      return new Response(JSON.stringify({ error: `Proxy error: ${e.message}` }), {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        },
      });
    }
  },
};
