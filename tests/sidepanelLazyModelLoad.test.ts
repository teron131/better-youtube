/** Protects lazy model loading and explicit model-selection persistence contracts. */

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
const SETTINGS_PATH = new URL("../src/sidepanel/pages/Settings.tsx", import.meta.url);

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
  assert.match(useConfigSource, /const isValidLanguage = useCallback/);

  assert.match(videoUrlFormSource, /shouldLoadModelOptions/);
  assert.match(videoUrlFormSource, /loadDynamicModels: shouldLoadModelOptions/);
  assert.match(videoUrlFormSource, /onOpen=\{loadModelOptions\}/);
  assert.match(videoUrlFormSource, /setShouldLoadModelOptions\(true\)/);

  assert.match(editableComboboxSource, /onOpen\?: \(\) => void/);
  assert.match(editableComboboxSource, /onOpen\?\.\(\)/);
});

test("model catalogs and cost filters never rewrite explicit selections", async () => {
  const [useConfigSource, videoUrlFormSource, editableComboboxSource, settingsSource] =
    await Promise.all([
      readFile(USE_CONFIG_PATH, "utf8"),
      readFile(VIDEO_URL_FORM_PATH, "utf8"),
      readFile(EDITABLE_COMBOBOX_PATH, "utf8"),
      readFile(SETTINGS_PATH, "utf8"),
    ]);

  assert.match(useConfigSource, /function modelPreferenceValue/);
  assert.doesNotMatch(useConfigSource, /isValidSummarizerModel/);
  assert.doesNotMatch(useConfigSource, /isValidRefinerModel/);
  assert.doesNotMatch(videoUrlFormSource, /resolveVisibleModelKey/);
  assert.doesNotMatch(settingsSource, /resolveVisibleModelKey/);
  assert.match(editableComboboxSource, /findExactComboboxOption/);
  assert.doesNotMatch(editableComboboxSource, /optionMatchScore/);
});

test("batch model variants are removed from live and cached catalogs", async () => {
  const useConfigSource = await readFile(USE_CONFIG_PATH, "utf8");

  assert.match(useConfigSource, /!isBatchModelVariant\(model\.id\)/);
  assert.match(useConfigSource, /!isBatchModelVariant\(model\.key\)/);
  assert.match(useConfigSource, /normalizeModelSelection\(value\) \|\| fallback/);
});
