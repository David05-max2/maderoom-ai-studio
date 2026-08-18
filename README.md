# Maderoom AI Studio

App web para crear videos verticales desde:

- 6 imágenes verticales 9:16
- 1 prompt maestro para Veo Lite
- 1 bloque de voz separado por `---`
- Supabase Database + Storage + Jobs

## Estado actual

Primera versión web con Next.js + Supabase.

Flujo inicial:

1. subir 6 imágenes,
2. pegar prompt maestro,
3. corregir nombres y duración a 5 segundos,
4. crear proyecto en Supabase,
5. crear escenas,
6. crear job `generate_animations` para el worker de Veo Lite.

## Variables necesarias

Crea `.env.local` usando `.env.example` como guía.

```env
NEXT_PUBLIC_SUPABASE_URL=https://qlwcxovrdglmmvprddvj.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=tu_publishable_key
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
GEMINI_API_KEY=tu_google_ai_studio_key
VEO_MODEL=veo-3.1-lite-generate-preview
VEO_REQUEST_SECONDS=6
VEO_OUTPUT_SECONDS=5
```

## Desarrollo

```bash
npm install
npm run dev
```
