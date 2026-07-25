import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const USE_CONFIG_PATH = new URL("../src/sidepanel/hooks/use-config.ts", import.meta.url);
const VIDEO_URL_FORM_PATH = new URL(
  "../src/sidepanel/components/VideoUrlForm.tsx",
  import.meta.url,
);
const EDITABLE_COMBOBOX_PATH = new URL(
  "../src/sidepanel/components/ui/editable-combobox.tsx",
  import.meta.url,
);

test("sidepanel home keeps dynamic model loading gated until video context or model interaction", async () => {
  const [useConfigSource, videoUrlFormSource, editableComboboxSource] = await Promise.all([
    readFile(USE_CONFIG_PATH, "utf8"),
    readFile(VIDEO_URL_FORM_PATH, "utf8"),
    readFile(EDITABLE_COMBOBOX_PATH, "utf8"),
  ]);

  assert.match(useConfigSource, /interface UseConfigOptions/);
  assert.match(useConfigSource, /loadDynamicModels\?: boolean/);
  assert.match(useConfigSource, /if \(!shouldLoadDynamicModels\)/);
  assert.match(useConfigSource, /setDynamicModels\(FALLBACK_DYNAMIC_MODELS\)/);
  assert.match(useConfigSource, /const isValidSummarizerModel = useCallback/);
  assert.match(useConfigSource, /const isValidRefinerModel = useCallback/);
  assert.match(useConfigSource, /const isValidLanguage = useCallback/);

  assert.match(videoUrlFormSource, /shouldLoadModelOptions/);
  assert.match(videoUrlFormSource, /loadDynamicModels: shouldLoadModelOptions/);
  assert.match(videoUrlFormSource, /onOpen=\{loadModelOptions\}/);
  assert.match(videoUrlFormSource, /setShouldLoadModelOptions\(true\)/);

  assert.match(editableComboboxSource, /onOpen\?: \(\) => void/);
  assert.match(editableComboboxSource, /onOpen\?\.\(\)/);
});
