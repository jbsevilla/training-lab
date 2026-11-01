// Netlify Function: proxy a la API de Anthropic. La clave vive en la variable de entorno ANTHROPIC_API_KEY.
const ALLOWED_MODELS = ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'];
const DEFAULT_MODEL = 'claude-sonnet-5-5';

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  // Sondeo de disponibilidad (no consume tokens): GET ?estado
  if (event.httpMethod === 'GET' && event.queryStringParameters && 'estado' in event.queryStringParameters) return { statusCode: 200, headers, body: JSON.stringify({ ok: true, clave: !!process.env.ANTHROPIC_API_KEY }) };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Usa POST' }) };
  if (!process.env.ANTHROPIC_API_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Falta la variable ANTHROPIC_API_KEY en Netlify' }) };
  let b; try { b = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON no válido' }) }; }
  const payload = {
    model: ALLOWED_MODELS.includes(b.model) ? b.model : DEFAULT_MODEL,
    max_tokens: Math.min(+b.max_tokens || 2000, 8000),
    messages: Array.isArray(b.messages) ? b.messages : [],
    ...(b.system ? { system: b.system } : {}),
    ...(typeof b.temperature === 'number' ? { temperature: b.temperature } : {})
  };
  // Netlify corta las funciones síncronas a los 60 s: cortamos antes para devolver un error claro.
  const send = async (body) => {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 55000);
    try {
      return await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: ctl.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify(body)
      });
    } finally { clearTimeout(t); }
  };
  try {
    let r = await send(payload);
    let text = await r.text();
    // Si el modelo no admite 'temperature', se repite sin ese parámetro.
    if (r.status === 400 && 'temperature' in payload && /temperature/i.test(text)) {
      delete payload.temperature; r = await send(payload); text = await r.text();
    }
    return { statusCode: r.status, headers, body: text };
  } catch (e) {
    if (e.name === 'AbortError') return { statusCode: 504, headers, body: JSON.stringify({ error: 'La IA tardó más de 55 s (límite de Netlify). Prueba con un texto más corto.' }) };
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo contactar con la API: ' + e.message }) };
  }
};
