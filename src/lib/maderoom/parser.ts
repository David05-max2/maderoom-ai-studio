import { SCENE_NAMES } from "./defaults";

export type ParsedAnimation = {
  name: string;
  animation: string;
};

export function normalizeMasterPrompt(input: string): string {
  return input
    .replace(/\banimaciones\s*=\s*\[/g, "imagenes = [")
    .replace(/"04_almacenamiento"/g, '"04_almacenamiento_inteligente"')
    .replace(/"05_materiales"/g, '"05_materiales_herrajes"')
    .replace(/Duration 4 seconds\./g, "Duration 5 seconds.")
    .replace(/Duración:\s*4 segundos\./g, "Duración:\n5 segundos.")
    .replace(/Duración:\s*4 segundos/g, "Duración:\n5 segundos")
    .replace(/Duration:\s*4 seconds\./g, "Duration:\n5 seconds.")
    .replace(/Duration:\s*4 seconds/g, "Duration:\n5 seconds");
}

export function parseVideoStyle(input: string): string {
  const match = input.match(/VIDEO_STYLE\s*=\s*"""([\s\S]*?)"""/);
  return match?.[1]?.trim() ?? "";
}

export function parseAnimations(input: string): ParsedAnimation[] {
  const normalized = normalizeMasterPrompt(input);
  const regex = /\{\s*"name"\s*:\s*"([^"]+)"\s*,\s*"animation"\s*:\s*"""([\s\S]*?)"""\s*\}/g;
  const output: ParsedAnimation[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(normalized))) {
    output.push({ name: match[1].trim(), animation: match[2].trim() });
  }

  return output;
}

export function splitVoiceScript(input: string): string[] {
  return input
    .split("---")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function buildFinalVeoPrompt(videoStyle: string, animation: string): string {
  return `Use the provided image as the exact first frame.

${videoStyle}

Specific camera animation:
${animation}

Strict rules:
- Animate only the camera.
- Keep all furniture completely static.
- Keep texts, icons, arrows and educational elements stable.
- Do not redesign the kitchen.
- Do not add people.
- Do not add new objects.
- No morphing.
- No flickering.
- Vertical 9:16 premium social video.`.trim();
}

export function validateMasterPrompt(input: string): string[] {
  const errors: string[] = [];
  const normalized = normalizeMasterPrompt(input);
  const videoStyle = parseVideoStyle(normalized);
  const animations = parseAnimations(normalized);

  if (!videoStyle) errors.push("Falta VIDEO_STYLE.");
  if (animations.length !== 6) errors.push(`El prompt debe tener 6 animaciones. Encontré ${animations.length}.`);

  for (const name of SCENE_NAMES) {
    if (!animations.some((item) => item.name === name)) {
      errors.push(`Falta animación para ${name}.`);
    }
  }

  return errors;
}
