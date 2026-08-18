"use client";

import { useMemo, useState } from "react";
import { DEFAULT_MASTER_PROMPT, DEFAULT_VOICE_SCRIPT, SCENE_NAMES } from "@/lib/maderoom/defaults";
import { normalizeMasterPrompt, parseAnimations, splitVoiceScript, validateMasterPrompt } from "@/lib/maderoom/parser";

type PreviewImage = {
  file: File | null;
  url: string;
};

export default function Home() {
  const [activeTab, setActiveTab] = useState("imagenes");
  const [title, setTitle] = useState("Cocina educativa premium");
  const [category, setCategory] = useState("cocina");
  const [selectedVoice, setSelectedVoice] = useState("marin");
  const [masterPrompt, setMasterPrompt] = useState(DEFAULT_MASTER_PROMPT);
  const [voiceScript, setVoiceScript] = useState(DEFAULT_VOICE_SCRIPT);
  const [images, setImages] = useState<PreviewImage[]>(
    SCENE_NAMES.map(() => ({ file: null, url: "" }))
  );
  const [status, setStatus] = useState("Esperando acción…");
  const [loading, setLoading] = useState(false);

  const normalizedPrompt = useMemo(() => normalizeMasterPrompt(masterPrompt), [masterPrompt]);
  const animations = useMemo(() => parseAnimations(normalizedPrompt), [normalizedPrompt]);
  const voiceBlocks = useMemo(() => splitVoiceScript(voiceScript), [voiceScript]);
  const validationErrors = useMemo(() => {
    const errors = validateMasterPrompt(normalizedPrompt);

    images.forEach((image, index) => {
      if (!image.file) errors.push(`Falta imagen para ${SCENE_NAMES[index]}.`);
    });

    if (voiceScript.trim() && voiceBlocks.length !== 6) {
      errors.push(`La voz debe tener 6 bloques separados por ---. Encontré ${voiceBlocks.length}.`);
    }

    return errors;
  }, [normalizedPrompt, images, voiceBlocks.length, voiceScript]);

  function onImageChange(index: number, file: File | null) {
    setImages((current) => {
      const copy = [...current];
      if (copy[index]?.url) URL.revokeObjectURL(copy[index].url);
      copy[index] = {
        file,
        url: file ? URL.createObjectURL(file) : "",
      };
      return copy;
    });
  }

  function fixPrompt() {
    setMasterPrompt(normalizeMasterPrompt(masterPrompt));
    setStatus("Prompt corregido: nombres ajustados, duración 5 segundos e imagenes = [...].");
  }

  async function createJob() {
    if (validationErrors.length > 0) {
      setActiveTab("generar");
      setStatus(`No puedes crear el job todavía:\n\n${validationErrors.map((e) => `• ${e}`).join("\n")}`);
      return;
    }

    const form = new FormData();
    form.append("title", title);
    form.append("category", category);
    form.append("selected_voice", selectedVoice);
    form.append("master_prompt", normalizedPrompt);
    form.append("voice_script", voiceScript);

    images.forEach((image, index) => {
      if (image.file) form.append(`scene_file_${index + 1}`, image.file);
    });

    setLoading(true);
    setStatus("Subiendo imágenes y creando job real en Supabase…");

    try {
      const response = await fetch("/api/maderoom/create-animation-job", {
        method: "POST",
        body: form,
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        const errors = data.errors?.join("\n") || data.error || "No se pudo crear el job.";
        throw new Error(errors);
      }

      setStatus(`✅ Job real creado.\n\nProyecto: ${data.project_id}\nJob: ${data.job_id}\n\nEl siguiente paso es conectar el worker de Veo Lite para procesarlo.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido.";
      setStatus(`❌ ${message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo-circle" />
          <h1>MADEROOM</h1>
          <p>AI Studio Web</p>
        </div>

        <button className="nav-button active">Nuevo proyecto</button>
        <button className="nav-button">Jobs reales</button>
        <button className="nav-button">Videos finales</button>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h2>Nuevo proyecto</h2>
            <p>6 imágenes + 1 prompt maestro + Veo Lite = 6 animaciones verticales de 5 segundos.</p>
          </div>
          <button className="btn btn-dark" onClick={() => setActiveTab("generar")}>Crear job para Veo Lite</button>
        </header>

        <section className="card">
          <h3>Datos del proyecto</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 220px 220px", gap: 12 }}>
            <input type="text" value={title} onChange={(event) => setTitle(event.target.value)} />
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="cocina">Cocina</option>
              <option value="closet">Closet</option>
              <option value="bano">Baño</option>
              <option value="entretenimiento">Centro de entretenimiento</option>
            </select>
            <select value={selectedVoice} onChange={(event) => setSelectedVoice(event.target.value)}>
              <option value="marin">marin</option>
              <option value="echo">echo</option>
              <option value="alloy">alloy</option>
              <option value="coral">coral</option>
              <option value="nova">nova</option>
              <option value="onyx">onyx</option>
              <option value="sage">sage</option>
              <option value="shimmer">shimmer</option>
              <option value="verse">verse</option>
            </select>
          </div>
        </section>

        <nav className="tabs">
          <button className={`tab ${activeTab === "imagenes" ? "active" : ""}`} onClick={() => setActiveTab("imagenes")}>1 · 6 Imágenes</button>
          <button className={`tab ${activeTab === "prompt" ? "active" : ""}`} onClick={() => setActiveTab("prompt")}>2 · Prompt maestro</button>
          <button className={`tab ${activeTab === "voz" ? "active" : ""}`} onClick={() => setActiveTab("voz")}>3 · Voz</button>
          <button className={`tab ${activeTab === "generar" ? "active" : ""}`} onClick={() => setActiveTab("generar")}>4 · Generar</button>
        </nav>

        {activeTab === "imagenes" && (
          <section className="card">
            <h3>Sube las 6 imágenes verticales 9:16</h3>
            <p className="muted">Los nombres ya están fijados para coincidir con el prompt maestro.</p>
            <div className="scene-grid">
              {SCENE_NAMES.map((name, index) => (
                <div className="scene-card" key={name}>
                  <div className="scene-head">
                    <span>Escena {index + 1}</span>
                    <span className="muted">{name}</span>
                  </div>
                  <div className="phone-frame">
                    {images[index].url ? <img src={images[index].url} alt={name} /> : <span>Sin imagen<br />Formato vertical 9:16</span>}
                  </div>
                  <input type="file" accept="image/*" onChange={(event) => onImageChange(index, event.target.files?.[0] || null)} />
                </div>
              ))}
            </div>
          </section>
        )}

        {activeTab === "prompt" && (
          <section className="card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
              <div>
                <h3>Prompt maestro de animación</h3>
                <p className="muted">Debe contener VIDEO_STYLE e imagenes = [...] con las 6 animaciones.</p>
              </div>
              <button className="btn btn-soft" onClick={fixPrompt}>Ajustar nombres + 5s</button>
            </div>
            <textarea value={masterPrompt} onChange={(event) => setMasterPrompt(event.target.value)} />
            <p className="muted">Animaciones detectadas: {animations.length}/6</p>
          </section>
        )}

        {activeTab === "voz" && (
          <section className="card">
            <h3>Voz del video</h3>
            <p className="muted">Un solo bloque separado por tres guiones: ---. Cada bloque será una escena.</p>
            <textarea className="voice-area" value={voiceScript} onChange={(event) => setVoiceScript(event.target.value)} />
            <p className="muted">Bloques de voz detectados: {voiceBlocks.length}/6</p>
          </section>
        )}

        {activeTab === "generar" && (
          <section className="card">
            <h3>Validación y generación</h3>
            {validationErrors.length > 0 ? (
              <>
                <p className="muted">Falta corregir esto antes de enviar a Veo Lite:</p>
                <ul className="validation-list">
                  {validationErrors.map((error) => <li key={error}>{error}</li>)}
                </ul>
              </>
            ) : (
              <p className="muted">Todo está listo para crear el job real en Supabase.</p>
            )}

            <div style={{ height: 16 }} />
            <button className="btn btn-gold" onClick={createJob} disabled={loading}>
              {loading ? "Creando job…" : "Crear job real para Veo Lite"}
            </button>
            <div style={{ height: 16 }} />
            <div className="status-box">{status}</div>
          </section>
        )}
      </main>
    </div>
  );
}
