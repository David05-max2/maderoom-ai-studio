import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const VEO_MODEL = process.env.VEO_MODEL || 'veo-3.1-lite-generate-preview';
const VEO_REQUEST_SECONDS = Number(process.env.VEO_REQUEST_SECONDS || '6');
const VEO_OUTPUT_SECONDS = Number(process.env.VEO_OUTPUT_SECONDS || '5');

if (!SUPABASE_URL) throw new Error('Falta SUPABASE_URL');
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY');
if (!GEMINI_API_KEY) throw new Error('Falta GEMINI_API_KEY');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

async function log(job, level, message, data = {}) {
  console.log(`[${level}] ${message}`);
  await supabase.from('maderoom_job_logs').insert({
    job_id: job.id,
    project_id: job.project_id,
    level,
    message,
    data,
  });
}

async function updateJob(jobId, patch) {
  const { error } = await supabase.from('maderoom_jobs').update(patch).eq('id', jobId);
  if (error) throw error;
}

async function updateProject(projectId, patch) {
  const { error } = await supabase.from('maderoom_projects').update(patch).eq('id', projectId);
  if (error) throw error;
}

async function updateScene(sceneId, patch) {
  const { error } = await supabase.from('maderoom_scenes').update(patch).eq('id', sceneId);
  if (error) throw error;
}

async function getQueuedJob() {
  const { data, error } = await supabase
    .from('maderoom_jobs')
    .select('*')
    .eq('job_type', 'generate_animations')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function getProject(projectId) {
  const { data, error } = await supabase.from('maderoom_projects').select('*').eq('id', projectId).single();
  if (error) throw error;
  return data;
}

async function getScenes(projectId) {
  const { data, error } = await supabase
    .from('maderoom_scenes')
    .select('*')
    .eq('project_id', projectId)
    .order('scene_number', { ascending: true });

  if (error) throw error;
  return data || [];
}

async function downloadSceneImage(scene, tmpDir) {
  const { data, error } = await supabase.storage.from('project-images').download(scene.image_path);
  if (error) throw error;

  const arrayBuffer = await data.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const mimeType = data.type || 'image/png';
  const ext = mimeType.includes('jpeg') ? 'jpg' : mimeType.includes('webp') ? 'webp' : 'png';
  const filePath = path.join(tmpDir, `${String(scene.scene_number).padStart(2, '0')}_${scene.name}.${ext}`);
  await fs.writeFile(filePath, buffer);
  return { buffer, mimeType, filePath };
}

async function generateVideoWithVeo(scene, imageBuffer, mimeType, rawOutputPath) {
  let operation = await ai.models.generateVideos({
    model: VEO_MODEL,
    prompt: scene.final_veo_prompt,
    image: {
      imageBytes: imageBuffer.toString('base64'),
      mimeType,
    },
    config: {
      aspectRatio: '9:16',
      durationSeconds: VEO_REQUEST_SECONDS,
      resolution: '720p',
    },
  });

  while (!operation.done) {
    await new Promise((resolve) => setTimeout(resolve, 10000));
    operation = await ai.operations.getVideosOperation({ operation });
  }

  if (!operation.response?.generatedVideos?.length) {
    throw new Error('Veo no devolvió video generado.');
  }

  await ai.files.download({
    file: operation.response.generatedVideos[0].video,
    downloadPath: rawOutputPath,
  });

  if (!existsSync(rawOutputPath)) {
    throw new Error('No se descargó el archivo de video desde Veo.');
  }
}

async function trimVideo(rawPath, finalPath) {
  const ffmpeg = spawnSync('ffmpeg', ['-y', '-i', rawPath, '-t', String(VEO_OUTPUT_SECONDS), '-c', 'copy', finalPath], {
    encoding: 'utf-8',
  });

  if (ffmpeg.status !== 0 || !existsSync(finalPath)) {
    console.warn('FFmpeg copy trim falló, intentando reencode:', ffmpeg.stderr);
    const retry = spawnSync('ffmpeg', ['-y', '-i', rawPath, '-t', String(VEO_OUTPUT_SECONDS), '-vf', 'scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2', '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-c:a', 'aac', '-b:a', '128k', finalPath], { encoding: 'utf-8' });
    if (retry.status !== 0 || !existsSync(finalPath)) {
      throw new Error(`FFmpeg no pudo recortar video: ${retry.stderr || ffmpeg.stderr}`);
    }
  }
}

async function uploadAnimation(project, scene, finalPath) {
  const bytes = await fs.readFile(finalPath);
  const storagePath = `${project.id}/animations/${String(scene.scene_number).padStart(2, '0')}_${scene.name}.mp4`;

  const { error } = await supabase.storage.from('scene-animations').upload(storagePath, bytes, {
    contentType: 'video/mp4',
    upsert: true,
  });
  if (error) throw error;

  const publicUrl = supabase.storage.from('scene-animations').getPublicUrl(storagePath).data.publicUrl;

  await updateScene(scene.id, {
    status: 'animation_ready',
    animation_video_path: storagePath,
    animation_video_url: publicUrl,
    duration_seconds: VEO_OUTPUT_SECONDS,
    error_message: null,
  });

  await supabase.from('maderoom_assets').insert({
    project_id: project.id,
    scene_id: scene.id,
    asset_type: 'animation',
    bucket: 'scene-animations',
    storage_path: storagePath,
    public_url: publicUrl,
    filename: path.basename(storagePath),
    mime_type: 'video/mp4',
    size_bytes: bytes.length,
    metadata: { source: 'veo-lite', trimmed_to_seconds: VEO_OUTPUT_SECONDS },
  });

  return { storagePath, publicUrl };
}

async function processJob(job) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'maderoom-'));
  const project = await getProject(job.project_id);
  const scenes = await getScenes(job.project_id);

  if (scenes.length !== 6) {
    throw new Error(`El proyecto debe tener 6 escenas. Encontré ${scenes.length}.`);
  }

  await updateJob(job.id, { status: 'running', started_at: new Date().toISOString(), current_step: 'Iniciando Veo Lite', attempts: (job.attempts || 0) + 1 });
  await updateProject(project.id, { status: 'generating_animations', error_message: null });
  await log(job, 'info', 'Worker iniciado para generar 6 animaciones con Veo Lite.');

  for (let index = 0; index < scenes.length; index++) {
    const scene = scenes[index];
    const progressBase = Math.round((index / scenes.length) * 100);

    if (scene.animation_video_path) {
      await log(job, 'info', `Escena ${scene.scene_number} ya tenía animación. Saltando.`, { scene: scene.name });
      continue;
    }

    await updateJob(job.id, { progress: progressBase, current_step: `Animando escena ${scene.scene_number}/6: ${scene.name}` });
    await updateScene(scene.id, { status: 'animating', error_message: null });
    await log(job, 'info', `Generando escena ${scene.scene_number}: ${scene.name}`);

    const { buffer, mimeType } = await downloadSceneImage(scene, tmpDir);
    const rawPath = path.join(tmpDir, `${scene.name}_raw.mp4`);
    const finalPath = path.join(tmpDir, `${scene.name}_5s.mp4`);

    await generateVideoWithVeo(scene, buffer, mimeType, rawPath);
    await trimVideo(rawPath, finalPath);
    const uploaded = await uploadAnimation(project, scene, finalPath);

    await log(job, 'success', `Escena ${scene.scene_number} animada y guardada.`, uploaded);
    await updateJob(job.id, { progress: Math.round(((index + 1) / scenes.length) * 100), current_step: `Escena ${scene.scene_number}/6 lista` });
  }

  await updateProject(project.id, { status: 'animations_ready' });
  await updateJob(job.id, { status: 'completed', progress: 100, current_step: 'Animaciones completadas', finished_at: new Date().toISOString(), result: { scenes: 6, output_seconds: VEO_OUTPUT_SECONDS } });
  await log(job, 'success', 'Todas las animaciones fueron generadas correctamente.');
}

async function main() {
  const job = await getQueuedJob();

  if (!job) {
    console.log('No hay jobs generate_animations en cola.');
    return;
  }

  try {
    await processJob(job);
  } catch (error) {
    console.error(error);
    await updateJob(job.id, { status: 'failed', error_message: String(error?.message || error), current_step: 'Error en worker', finished_at: new Date().toISOString() });
    await updateProject(job.project_id, { status: 'error', error_message: String(error?.message || error) });
    await log(job, 'error', String(error?.message || error));
    process.exit(1);
  }
}

await main();
