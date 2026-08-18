# Secretos necesarios para ejecutar el pipeline real

Para que GitHub Actions pueda procesar los jobs reales debes crear estos secrets en el repositorio:

`Settings > Secrets and variables > Actions > New repository secret`

## Secrets requeridos

```env
SUPABASE_URL=https://qlwcxovrdglmmvprddvj.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key_de_supabase
GEMINI_API_KEY=tu_api_key_de_google_ai_studio
OPENAI_API_KEY=tu_api_key_de_openai
```

## Qué hace cada uno

- `SUPABASE_URL`: URL del proyecto Supabase.
- `SUPABASE_SERVICE_ROLE_KEY`: permite al worker leer/escribir Storage, tablas y jobs.
- `GEMINI_API_KEY`: permite generar animaciones con Veo Lite y música con Lyria.
- `OPENAI_API_KEY`: permite generar las voces por escena.

## Orden de uso

1. Abre la web de GitHub Pages.
2. Sube 6 imágenes.
3. Crea el job de animaciones.
4. Ejecuta GitHub Action: `Process Maderoom Animation Jobs`.
5. Cuando las animaciones estén listas, crea un job `generate_full_video`.
6. Ejecuta GitHub Action: `Process Maderoom Full Video Jobs`.

## Notas importantes

- Veo 3.1 Lite genera 4, 6 u 8 segundos. El worker pide 6 segundos y recorta a 5 segundos con FFmpeg.
- El video se guarda en Supabase Storage en el bucket `final-videos`.
- Las animaciones se guardan en `scene-animations`.
- Las voces se guardan en `scene-voices`.
- La música se guarda en `music-tracks`.
