# Training Lab

Plataforma personal de entrenamiento. Un solo `index.html` y dos funciones de Netlify.

## Estructura

```
index.html                     Aplicación completa
netlify.toml                   Configuración de Netlify (sin paso de build)
netlify/functions/claude.js    Proxy a la API de Anthropic (usa ANTHROPIC_API_KEY)
netlify/functions/fetch-article.js  Lectura de publicaciones públicas para la Biblioteca
```

## Configuración en Netlify

- Build command: vacío. Publish directory: `.` (lo fija `netlify.toml`).
- Variable de entorno `ANTHROPIC_API_KEY` con la clave de la API de Anthropic. Nunca se sube al repositorio.

## Comprobación

`/.netlify/functions/claude?estado` debe responder `{"ok":true,"clave":true}`.

## Datos

Las actividades, archivos originales y biblioteca se guardan en el navegador (IndexedDB) de cada dispositivo.
Usa "Copia de seguridad" en Importar para llevarlos a otro dispositivo o conservarlos.
