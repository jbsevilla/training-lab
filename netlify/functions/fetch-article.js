// Netlify Function: descarga de páginas públicas para la Biblioteca metodológica.
// - Sólo http/https y hosts públicos (bloquea localhost y redes privadas).
// - Respeta robots.txt (User-agent: *). No envía cookies ni credenciales: nunca accede a zonas privadas.
// - Admite peticiones condicionales (ETag / Last-Modified) para no reprocesar lo que no ha cambiado.
const UA = 'TrainingLab-Biblioteca/1.0 (uso personal; lectura de contenido publico)';
const MAX_BYTES = 3 * 1024 * 1024;
const robotsCache = new Map();

function isPrivateHost(h) {
  h = h.toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (/^127\.|^10\.|^192\.168\.|^169\.254\.|^0\./.test(h)) return true;
  const m = h.match(/^172\.(\d+)\./); if (m && +m[1] >= 16 && +m[1] <= 31) return true;
  if (h.startsWith('[') || h === '::1') return true;
  return false;
}
async function robotsAllows(u) {
  const origin = u.origin;
  let rules = robotsCache.get(origin);
  if (!rules) {
    rules = { disallow: [], allow: [] };
    try {
      const r = await fetch(origin + '/robots.txt', { headers: { 'User-Agent': UA }, redirect: 'follow' });
      if (r.ok) {
        let applies = false;
        for (const raw of (await r.text()).split(/\r?\n/)) {
          const line = raw.replace(/#.*/, '').trim(); if (!line) continue;
          const [k, ...rest] = line.split(':'); const v = rest.join(':').trim();
          if (/^user-agent$/i.test(k)) applies = v === '*' || /traininglab/i.test(v);
          else if (applies && /^disallow$/i.test(k) && v) rules.disallow.push(v);
          else if (applies && /^allow$/i.test(k) && v) rules.allow.push(v);
        }
      }
    } catch { rules.unknown = true; }
    robotsCache.set(origin, rules);
  }
  const path = u.pathname + u.search;
  // Patrones de robots.txt: '*' = cualquier secuencia, '$' final = fin de URL; gana la regla más larga.
  const toRe = p => new RegExp('^' + p.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\?\$$/, '$'));
  const match = arr => arr.filter(p => { try { return toRe(p).test(path); } catch { return false; } }).reduce((m, p) => Math.max(m, p.length), -1);
  const d = match(rules.disallow), a = match(rules.allow);
  return d < 0 || a >= d ? (rules.unknown ? 'unknown' : 'allowed') : 'disallowed';
}

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (event.httpMethod === 'GET' && event.queryStringParameters && 'estado' in event.queryStringParameters) return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Usa POST' }) };
  let body; try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON no válido' }) }; }
  let u; try { u = new URL(body.url); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'URL no válida' }) }; }
  if (!/^https?:$/.test(u.protocol) || isPrivateHost(u.hostname)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Sólo se admiten URLs públicas http/https' }) };

  const robots = await robotsAllows(u);
  if (robots === 'disallowed') return { statusCode: 200, headers, body: JSON.stringify({ ok: false, robots, status: 0 }) };

  const reqHeaders = { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,application/xml,application/pdf;q=0.9,*/*;q=0.5', 'Accept-Language': 'es-ES,es;q=0.9' };
  if (body.etag) reqHeaders['If-None-Match'] = body.etag;
  if (body.lastModified) reqHeaders['If-Modified-Since'] = body.lastModified;
  let r;
  try { r = await fetch(u.toString(), { headers: reqHeaders, redirect: 'follow', signal: AbortSignal.timeout(20000) }); }
  catch (e) { return { statusCode: 200, headers, body: JSON.stringify({ ok: false, status: 0, error: 'No se pudo conectar: ' + e.message, robots }) }; }

  const out = { ok: r.ok, status: r.status, finalUrl: r.url, contentType: r.headers.get('content-type') || '', etag: r.headers.get('etag'), lastModified: r.headers.get('last-modified'), robots };
  if (r.status === 304) return { statusCode: 200, headers, body: JSON.stringify({ ...out, ok: true, notModified: true }) };
  if (!r.ok) return { statusCode: 200, headers, body: JSON.stringify(out) };

  const buf = Buffer.from(await r.arrayBuffer());
  const truncated = buf.length > MAX_BYTES;
  const slice = truncated ? buf.subarray(0, MAX_BYTES) : buf;
  if (/application\/pdf/i.test(out.contentType)) out.base64 = slice.toString('base64');
  else out.html = slice.toString('utf8');
  out.truncated = truncated;
  return { statusCode: 200, headers, body: JSON.stringify(out) };
};

exports._robotsAllows = robotsAllows;
