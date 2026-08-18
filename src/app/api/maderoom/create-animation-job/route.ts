import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  buildFinalVeoPrompt,
  normalizeMasterPrompt,
  parseAnimations,
  parseVideoStyle,
  splitVoiceScript,
  validateMasterPrompt,
} from "@/lib/maderoom/parser";
import { SCENE_NAMES } from "@/lib/maderoom/defaults";

export const runtime = "nodejs";

function extensionFromFile(file: File) {
  const original = file.name || "image.png";
  const ext = original.split(".").pop()?.toLowerCase() || "png";
  return ext.replace(/[^a-z0-9]/g, "") || "png";
}

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const form = await request.formData();

    const title = String(form.get("title") || "Proyecto Maderoom Web");
    const category = String(form.get("category") || "cocina");
    const selectedVoice = String(form.get("selected_voice") || "marin");
    const masterPromptRaw = String(form.get("master_prompt") || "");
    const voiceScript = String(form.get("voice_script") || "");
    const masterPrompt = normalizeMasterPrompt(masterPromptRaw);

    const errors = validateMasterPrompt(masterPrompt);
    const voiceParts = splitVoiceScript(voiceScript);

    if (voiceScript.trim() && voiceParts.length !== 6) {
      errors.push(`La voz debe tener 6 bloques separados por ---. Encontré ${voiceParts.length}.`);
    }

    const sceneFiles = SCENE_NAMES.map((name, index) => ({
      name,
      file: form.get(`scene_file_${index + 1}`),
    }));

    for (const item of sceneFiles) {
      if (!(item.file instanceof File) || item.file.size === 0) {
        errors.push(`Falta imagen para ${item.name}.`);
      }
    }

    if (errors.length) {
      return NextResponse.json({ ok: false, errors }, { status: 400 });
    }

    const videoStyle = parseVideoStyle(masterPrompt);
    const animations = parseAnimations(masterPrompt);

    const { data: project, error: projectError } = await supabase
      .from("maderoom_projects")
      .insert({
        title,
        category,
        selected_voice: selectedVoice,
        master_animation_prompt: masterPrompt,
        video_style: videoStyle,
        voice_script: voiceScript,
        scene_duration_seconds: 5,
        veo_duration_seconds: 6,
        aspect_ratio: "9:16",
        veo_model: process.env.VEO_MODEL || "veo-3.1-lite-generate-preview",
        status: "ready",
      })
      .select("id")
      .single();

    if (projectError || !project) {
      throw new Error(projectError?.message || "No se pudo crear el proyecto.");
    }

    const projectId = project.id as string;
    const sceneRows = [];

    for (let index = 0; index < SCENE_NAMES.length; index++) {
      const name = SCENE_NAMES[index];
      const file = sceneFiles[index].file as File;
      const ext = extensionFromFile(file);
      const storagePath = `${projectId}/${String(index + 1).padStart(2, "0")}_${name}.${ext}`;
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);

      const { error: uploadError } = await supabase.storage
        .from("project-images")
        .upload(storagePath, bytes, {
          contentType: file.type || "image/png",
          upsert: true,
        });

      if (uploadError) {
        throw new Error(`Error subiendo ${name}: ${uploadError.message}`);
      }

      const { data: publicData } = supabase.storage
        .from("project-images")
        .getPublicUrl(storagePath);

      const animation = animations.find((item) => item.name === name)?.animation || "";
      const voiceText = voiceParts[index] || "";
      const finalVeoPrompt = buildFinalVeoPrompt(videoStyle, animation);

      sceneRows.push({
        project_id: projectId,
        scene_number: index + 1,
        name,
        status: "image_uploaded",
        image_path: storagePath,
        image_url: publicData.publicUrl,
        animation_prompt: animation,
        final_veo_prompt: finalVeoPrompt,
        voice_text: voiceText,
        duration_seconds: 5,
      });
    }

    const { data: scenes, error: scenesError } = await supabase
      .from("maderoom_scenes")
      .insert(sceneRows)
      .select("id,name,scene_number");

    if (scenesError) {
      throw new Error(scenesError.message);
    }

    const { data: job, error: jobError } = await supabase
      .from("maderoom_jobs")
      .insert({
        project_id: projectId,
        job_type: "generate_animations",
        status: "queued",
        progress: 0,
        current_step: "Esperando worker de Veo Lite",
        payload: {
          scene_count: 6,
          model: process.env.VEO_MODEL || "veo-3.1-lite-generate-preview",
          veo_request_seconds: 6,
          output_seconds: 5,
          aspect_ratio: "9:16",
        },
      })
      .select("id")
      .single();

    if (jobError || !job) {
      throw new Error(jobError?.message || "No se pudo crear el job.");
    }

    await supabase.from("maderoom_job_logs").insert({
      job_id: job.id,
      project_id: projectId,
      level: "success",
      message: "Job de animaciones creado desde la web.",
      data: { scenes },
    });

    return NextResponse.json({
      ok: true,
      project_id: projectId,
      job_id: job.id,
      scenes,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
