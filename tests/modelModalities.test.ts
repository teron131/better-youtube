/** Protects capability-based model filtering for live and cached catalogs without name-specific exclusions. */

import assert from "node:assert/strict";
import test from "node:test";

import {
  modelModalities,
  supportsTextResponse,
} from "../src/sidepanel/services/model-modalities.ts";

test("allows text output with either text-only or multimodal input", () => {
  for (const input of [["text"], ["text", "image", "video"], ["text", "audio"]]) {
    assert.equal(
      supportsTextResponse(
        modelModalities({ input_modalities: input, output_modalities: ["text"] }),
      ),
      true,
    );
  }
});

test("excludes audio and image output, missing text input, and unknown modalities", () => {
  for (const architecture of [
    { input_modalities: ["text"], output_modalities: ["text", "audio"] },
    { input_modalities: ["text"], output_modalities: ["image"] },
    { input_modalities: ["audio"], output_modalities: ["text"] },
    {},
  ])
    assert.equal(supportsTextResponse(modelModalities(architecture)), false);
});

test("reads compact modality metadata when explicit modality arrays are absent", () => {
  assert.equal(supportsTextResponse(modelModalities({ modality: "text+image+video->text" })), true);
  assert.equal(
    supportsTextResponse(modelModalities({ modality: "text+audio->text+audio" })),
    false,
  );
  assert.equal(
    supportsTextResponse(modelModalities({ modality: "text->text", output_modalities: [] })),
    false,
  );
});
