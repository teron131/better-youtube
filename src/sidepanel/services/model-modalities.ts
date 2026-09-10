/** Normalizes provider modality metadata for live discovery and persisted model catalogs. */

export interface ModelModalities {
  input: string[];
  output: string[];
}

export function modelModalities(architecture?: {
  input_modalities?: unknown;
  output_modalities?: unknown;
  modality?: unknown;
}): ModelModalities {
  const [input, output] =
    typeof architecture?.modality === "string" ? architecture.modality.split("->") : [];
  const normalize = (value: unknown, fallback: string | undefined) =>
    (Array.isArray(value) ? value : (fallback?.split("+") ?? []))
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
  return {
    input: normalize(architecture?.input_modalities, input),
    output: normalize(architecture?.output_modalities, output),
  };
}

/** Multimodal input is allowed; audio/image generation does not belong in a text-response picker. */
export function supportsTextResponse(modalities: ModelModalities): boolean {
  return (
    modalities.input.includes("text") &&
    modalities.output.length > 0 &&
    modalities.output.every((type) => type === "text")
  );
}
