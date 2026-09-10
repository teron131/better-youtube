/** Protects lazy model loading and explicit model-selection persistence contracts. */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const USE_CONFIG_PATH = new URL("../src/sidepanel/hooks/use-config.ts", import.meta.url);
const VIDEO_CHAT_PATH = new URL("../src/sidepanel/components/VideoChat.tsx", import.meta.url);
const EDITABLE_COMBOBOX_PATH = new URL(
  "../src/sidepanel/components/ui/editable-combobox.tsx",
  import.meta.url,
);
const SETTINGS_PATH = new URL("../src/sidepanel/pages/Settings.tsx", import.meta.url);

test("the composer preloads models while non-model consumers can skip catalog loading", async () => {
  const [useConfigSource, videoChatSource, editableComboboxSource] = await Promise.all([
    readFile(USE_CONFIG_PATH, "utf8"),
    readFile(VIDEO_CHAT_PATH, "utf8"),
    readFile(EDITABLE_COMBOBOX_PATH, "utf8"),
  ]);

  assert.match(useConfigSource, /interface UseConfigOptions/);
  assert.match(useConfigSource, /loadDynamicModels\?: boolean/);
  assert.match(useConfigSource, /if \(!shouldLoadDynamicModels\)/);
  assert.match(useConfigSource, /setDynamicModels\(FALLBACK_DYNAMIC_MODELS\)/);
  assert.match(useConfigSource, /const isValidLanguage = useCallback/);

  assert.match(videoChatSource, /useModelSelection\(\)/);
  assert.doesNotMatch(videoChatSource, /setLoadModels/);

  assert.match(editableComboboxSource, /onOpen\?: \(\) => void/);
  assert.match(editableComboboxSource, /onOpen\?\.\(\)/);
});

test("model catalogs and cost filters never rewrite explicit selections", async () => {
  const [useConfigSource, videoChatSource, editableComboboxSource, settingsSource] =
    await Promise.all([
      readFile(USE_CONFIG_PATH, "utf8"),
      readFile(VIDEO_CHAT_PATH, "utf8"),
      readFile(EDITABLE_COMBOBOX_PATH, "utf8"),
      readFile(SETTINGS_PATH, "utf8"),
    ]);

  assert.match(useConfigSource, /function modelPreferenceValue/);
  assert.doesNotMatch(useConfigSource, /isValidSummarizerModel/);
  assert.doesNotMatch(useConfigSource, /isValidRefinerModel/);
  assert.doesNotMatch(videoChatSource, /resolveVisibleModelKey/);
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
