import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qlwcxovrdglmmvprddvj.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TTS_MODEL = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';
const LYRIA_MODEL = process.env.LYRIA_MODEL || 'lyria-3-clip-preview';

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.log('Falta SUPABASE_SERVICE_ROLE_KEY en GitHub Secrets. No puedo leer/escribir Supabase desde el worker.');
  process.exit(0);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function getSetting(key) {
  const { data, error } = await supabase
    .from('maderoom_app_settings')
    .select('setting_value')
    .eq('setting_key', key)
    .maybeSingle();
  if (error) {
    console.log(`No pude leer setting ${key}:`, error.message);
    return null;
  }
  return data?.setting_value || null;
}

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

async function getQueuedFullJob() {
  const { data, error } = await supabase
    .from('maderoom_jobs')
    .select('*')
    .in('job_type', ['generate_full_video', 'generate_voice', 'generate_music', 'compose_final_video'])
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

async function downloadFromStorage(bucket, storagePath, localPath) {
  const { data, error } = await supabase.storage.from(bucket).download(storagePath);
  if (error) throw error;
  const buffer = Buffer.from(await data.arrayBuffer());
  await fs.writeFile(localPath, buffer);
  return buffer;
}

async function generateVoice(openai, project, scene, tmpDir) {
  if (scene.voice_audio_path) return scene.voice_audio_path;
  if (!scene.voice_text?.trim()) throw new Error(`La escena ${scene.scene_number} no tiene texto de voz.`);

  const output = path.join(tmpDir, `voz_${String(scene.scene_number).padStart(2, '0')}.mp3`);
  const mp3 = await openai.audio.speech.create({
    model: TTS_MODEL,
    voice: project.selected_voice || 'marin',
    input: scene.voice_text,
    instructions: 'Habla en español latino neutro, profesional, cálido y confiable. Narración premium para diseño interior. Ritmo claro, pausas naturales, tono elegante y educativo. No sonar robótico. No exagerar emoción.',
    response_format: 'mp3',
    speed: 1,
  });

  const buffer = Buffer.from(await mp3.arrayBuffer());
  await fs.writeFile(output, buffer);

  const storagePath = `${project.id}/voices/voz_${String(scene.scene_number).padStart(2, '0')}_${scene.name}.mp3`;
  const { error } = await supabase.storage.from('scene-voices').upload(storagePath, buffer, {
    contentType: 'audio/mpeg',
    upsert: true,
  });
  if (error) throw error;

  const publicUrl = supabase.storage.from('scene-voices').getPublicUrl(storagePath).data.publicUrl;
  await updateScene(scene.id, { status: 'voice_ready', voice_audio_path: storagePath, voice_audio_url: publicUrl });
  await supabase.from('maderoom_assets').insert({
    project_id: project.id,
    scene_id: scene.id,
    asset_type: 'voice',
    bucket: 'scene-voices',
    storage_path: storagePath,
    public_url: publicUrl,
    filename: path.basename(storagePath),
    mime_type: 'audio/mpeg',
    size_bytes: buffer.length,
  });

  return storagePath;
}

async function generateMusic(googleAI, project, tmpDir) {
  const existing = project.music_track_path || project?.metadata?.music_track_path;
  if (existing) return existing;

  const prompt = project.music_prompt || '30-second instrumental premium luxury interior design Reel background, modern Latin urban groove, soft afrobeat percussion, warm bass, no vocals, no lyrics, leave space for Spanish voiceover.';
  const interaction = await googleAI.interactions.create({ model: LYRIA_MODEL, input: prompt });
  const audio = interaction.outputAudio || interaction.output_audio;
  if (!audio?.data) throw new Error('Lyria no devolvió audio.');

  const buffer = Buffer.from(audio.data, 'base64');
  const localPath = path.join(tmpDir, 'melodia_maderoom.mp3');
  await fs.writeFile(localPath, buffer);

  const storagePath = `${project.id}/music/melodia_maderoom.mp3`;
  const { error } = await supabase.storage.from('music-tracks').upload(storagePath, buffer, {
    contentType: 'audio/mpeg',
    upsert: true,
  });
  if (error) throw error;

  const publicUrl = supabase.storage.from('music-tracks').getPublicUrl(storagePath).data.publicUrl;
  await supabase.from('maderoom_assets').insert({
    project_id: project.id,
    asset_type: 'music',
    bucket: 'music-tracks',
    storage_path: storagePath,
    public_url: publicUrl,
    filename: 'melodia_maderoom.mp3',
    mime_type: 'audio/mpeg',
    size_bytes: buffer.length,
  });

  return storagePath;
}

async function composeFinalVideo(project, scenes, musicStoragePath, tmpDir) {
  const sceneFiles = [];
  const clipListPath = path.join(tmpDir, 'clips.txt');
  const voiceListPath = path.join(tmpDir, 'voices.txt');
  const concatVideoPath = path.join(tmpDir, 'video_concat.mp4');
  const concatVoicePath = path.join(tmpDir, 'voice_concat.mp3');
  const finalPath = path.join(tmpDir, 'video_final_maderoom.mp4');
  const musicPath = path.join(tmpDir, 'music.mp3');

  for (const scene of scenes) {
    if (!scene.animation_video_path) throw new Error(`Falta animación de escena ${scene.scene_number}.`);
    if (!scene.voice_audio_path) throw new Error(`Falta voz de escena ${scene.scene_number}.`);
    const videoLocal = path.join(tmpDir, `${String(scene.scene_number).padStart(2, '0')}_${scene.name}.mp4`);
    const voiceLocal = path.join(tmpDir, `voz_${String(scene.scene_number).padStart(2, '0')}.mp3`);
    await downloadFromStorage('scene-animations', scene.animation_video_path, videoLocal);
    await downloadFromStorage('scene-voices', scene.voice_audio_path, voiceLocal);
    sceneFiles.push({ videoLocal, voiceLocal });
  }

  await downloadFromStorage('music-tracks', musicStoragePath, musicPath);
  await fs.writeFile(clipListPath, sceneFiles.map((x) => `file '${x.videoLocal.replace(/'/g, "'\\''")}'`).join('\n'));
  await fs.writeFile(voiceListPath, sceneFiles.map((x) => `file '${x.voiceLocal.replace(/'/g, "'\\''")}'`).join('\n'));

  let ff = spawnSync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', clipListPath, '-c', 'copy', concatVideoPath], { encoding: 'utf-8' });
  if (ff.status !== 0) {
    ff = spawnSync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', clipListPath, '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-c:a', 'aac', concatVideoPath], { encoding: 'utf-8' });
    if (ff.status !== 0) throw new Error(`No pude concatenar videos: ${ff.stderr}`);
  }

  ff = spawnSync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', voiceListPath, '-c', 'copy', concatVoicePath], { encoding: 'utf-8' });
  if (ff.status !== 0) {
    ff = spawnSync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', voiceListPath, '-c:a', 'libmp3lame', concatVoicePath], { encoding: 'utf-8' });
    if (ff.status !== 0) throw new Error(`No pude concatenar voces: ${ff.stderr}`);
  }

  ff = spawnSync('ffmpeg', [
    '-y',
    '-i', concatVideoPath,
    '-i', concatVoicePath,
    '-stream_loop', '-1', '-i', musicPath,
    '-filter_complex', `[1:a]volume=${Number(project.voice_volume || 1)}[voice];[2:a]volume=${Number(project.music_volume || 0.15)}[music];[voice][music]amix=inputs=2:duration=first:dropout_transition=2[a]`,
    '-map', '0:v:0',
    '-map', '[a]',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-shortest',
    finalPath,
  ], { encoding: 'utf-8' });

  if (ff.status !== 0 || !existsSync(finalPath)) throw new Error(`No pude componer video final: ${ff.stderr}`);

  const buffer = await fs.readFile(finalPath);
  const storagePath = `${project.id}/final/video_final_maderoom.mp4`;
  const { error } = await supabase.storage.from('final-videos').upload(storagePath, buffer, {
    contentType: 'video/mp4',
    upsert: true,
  });
  if (error) throw error;

  const publicUrl = supabase.storage.from('final-videos').getPublicUrl(storagePath).data.publicUrl;
  await updateProject(project.id, { status: 'completed', final_video_path: storagePath, final_video_url: publicUrl });
  await supabase.from('maderoom_assets').insert({
    project_id: project.id,
    asset_type: 'final_video',
    bucket: 'final-videos',
    storage_path: storagePath,
    public_url: publicUrl,
    filename: 'video_final_maderoom.mp4',
    mime_type: 'video/mp4',
    size_bytes: buffer.length,
  });

  return { storagePath, publicUrl };
}

async function processFullJob(job, geminiApiKey, openaiApiKey) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'maderoom-full-'));
  const project = await getProject(job.project_id);
  let scenes = await getScenes(project.id);

  if (scenes.length !== 6) {
    await updateJob(job.id, { status: 'queued', current_step: `Esperando 6 escenas. Hay ${scenes.length}`, error_message: null });
    await log(job, 'warn', `El proyecto debe tener 6 escenas. Encontré ${scenes.length}.`);
    return;
  }

  const readyAnimations = scenes.filter((s) => Boolean(s.animation_video_path)).length;
  if (readyAnimations < 6) {
    await updateJob(job.id, { status: 'queued', current_step: `Esperando animaciones ${readyAnimations}/6`, progress: 0, error_message: null });
    await updateProject(project.id, { status: 'waiting_animations', error_message: null });
    await log(job, 'info', `Esperando animaciones. Listas ${readyAnimations}/6.`);
    return;
  }

  if (!openaiApiKey) {
    await updateJob(job.id, { status: 'queued', current_step: 'Falta OPENAI_API_KEY en Configuración', error_message: null });
    await updateProject(project.id, { status: 'waiting_config', error_message: 'Falta OPENAI_API_KEY en Configuración' });
    await log(job, 'warn', 'Falta OPENAI_API_KEY. Agrega la clave en Configuración.');
    return;
  }

  if (!geminiApiKey) {
    await updateJob(job.id, { status: 'queued', current_step: 'Falta GEMINI_API_KEY en Configuración', error_message: null });
    await updateProject(project.id, { status: 'waiting_config', error_message: 'Falta GEMINI_API_KEY en Configuración' });
    await log(job, 'warn', 'Falta GEMINI_API_KEY. Agrega la clave en Configuración.');
    return;
  }

  const openai = new OpenAI({ apiKey: openaiApiKey });
  const googleAI = new GoogleGenAI({ apiKey: geminiApiKey });

  await updateJob(job.id, { status: 'running', started_at: new Date().toISOString(), current_step: 'Generando voces', attempts: (job.attempts || 0) + 1 });
  await updateProject(project.id, { status: 'generating_voice', error_message: null });
  await log(job, 'info', 'Iniciando generación de voces por escena.');

  for (let i = 0; i < scenes.length; i++) {
    await generateVoice(openai, project, scenes[i], tmpDir);
    await updateJob(job.id, { progress: Math.round(((i + 1) / 18) * 100), current_step: `Voz ${i + 1}/6 lista` });
  }

  await updateProject(project.id, { status: 'generating_music' });
  await updateJob(job.id, { current_step: 'Generando melodía con Lyria' });
  await log(job, 'info', 'Generando melodía con Lyria.');
  const musicPath = await generateMusic(googleAI, project, tmpDir);

  await updateProject(project.id, { status: 'composing_final' });
  await updateJob(job.id, { progress: 75, current_step: 'Componiendo video final con FFmpeg' });
  await log(job, 'info', 'Componiendo video final.');

  scenes = await getScenes(project.id);
  const final = await composeFinalVideo(project, scenes, musicPath, tmpDir);

  await updateJob(job.id, { status: 'completed', progress: 100, current_step: 'Video final completado', finished_at: new Date().toISOString(), result: final });
  await log(job, 'success', 'Video final completado.', final);
}

async function main() {
  const job = await getQueuedFullJob();
  if (!job) {
    console.log('No hay jobs de voz/música/composición en cola.');
    return;
  }

  const geminiApiKey = process.env.GEMINI_API_KEY || await getSetting('GEMINI_API_KEY');
  const openaiApiKey = process.env.OPENAI_API_KEY || await getSetting('OPENAI_API_KEY');

  try {
    await processFullJob(job, geminiApiKey, openaiApiKey);
  } catch (error) {
    console.error(error);
    await updateJob(job.id, { status: 'failed', error_message: String(error?.message || error), current_step: 'Error en full worker', finished_at: new Date().toISOString() });
    await updateProject(job.project_id, { status: 'error', error_message: String(error?.message || error) });
    await log(job, 'error', String(error?.message || error));
    process.exit(1);
  }
}

await main();