/** Settings sections share compact controls and responsive groups while persistence stays with the page. */

import { ModelSelector } from "@ui/components/ModelSelector";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Label } from "@ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/components/ui/select";
import { Switch } from "@ui/components/ui/switch";
import { toModelComboboxOption } from "@ui/lib/model-options";
import { ArrowLeft, Cpu, Key, Loader2, Minus, Plus, RotateCcw, Trash2, Type } from "lucide-react";
import type { ReactNode } from "react";

import { resolveLlmRequestModel } from "@/core/clients/config";
import { FONT_SCALE, STORAGE_KEYS, TARGET_LANGUAGES } from "@/core/constants";
import { normalizeFontScale } from "@/core/fontSize";

import { SIDEPANEL_ROUTE_HREFS } from "../../lib/routes";
import {
  API_KEY_FIELDS,
  LLM_MODEL_PREFIX_OPTIONS,
  type ModelSelectorConfig,
  SETTINGS_SECTION_CLASSNAME,
  type SettingsChangeHandler,
  type SettingsState,
} from "./settingsTypes";

export function SettingsLoadingView() {
  return (
    <p
      role="status"
      className="flex min-h-dvh items-center justify-center gap-2 text-sm text-muted-foreground"
    >
      <Loader2 className="h-4 w-4 animate-spin" />
      Loading settings…
    </p>
  );
}

export function SettingsTopbar() {
  return (
    <header className="sticky top-0 z-20 border-b border-border/70 bg-background">
      <div className="sidepanel-container">
        <div className="flex h-14 w-full items-center gap-1">
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="-ml-2 h-9 w-9 text-muted-foreground hover:text-foreground"
          >
            <a aria-label="Back to main page" title="Back" href={SIDEPANEL_ROUTE_HREFS.home}>
              <ArrowLeft />
            </a>
          </Button>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Settings</h1>
        </div>
      </div>
    </header>
  );
}

function LlmModelPrefixControls({
  settings,
  onChange,
}: {
  settings: SettingsState;
  onChange: SettingsChangeHandler;
}) {
  const modelPreviews = [
    { label: "Summary", model: settings.summarizerModel },
    { label: "Refiner", model: settings.refinerModel },
  ].map(({ label, model }) => ({
    label,
    value: resolveLlmRequestModel(model, settings.llmModelPrefixMode),
  }));

  return (
    <div className="settings-field-detail space-y-2 pt-1">
      <Label className="text-sm font-semibold">LLM model ID format</Label>
      <div className="grid items-stretch gap-2">
        <div className="grid gap-1 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs">
          {modelPreviews.map((preview) => (
            <div
              key={preview.label}
              className="grid min-h-0 grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-2"
            >
              <span className="font-semibold text-muted-foreground">{preview.label}</span>
              <code className="min-w-0 text-xs leading-5 text-foreground [overflow-wrap:anywhere]">
                {preview.value}
              </code>
            </div>
          ))}
        </div>

        <div className="grid min-h-10 grid-cols-2 rounded-md border border-border/70 bg-background p-0.5">
          {LLM_MODEL_PREFIX_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange("llmModelPrefixMode", option.value)}
              aria-pressed={settings.llmModelPrefixMode === option.value}
              className={`h-full whitespace-nowrap rounded-sm px-1.5 text-xs font-medium transition-colors ${
                settings.llmModelPrefixMode === option.value
                  ? "bg-primary text-white"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ApiConfigurationSection({
  settings,
  onChange,
  onLlmBaseUrlBlur,
}: {
  settings: SettingsState;
  onChange: SettingsChangeHandler;
  onLlmBaseUrlBlur: (baseUrl: string) => void;
}) {
  return (
    <section className="space-y-4">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <Key className="h-4 w-4 text-muted-foreground" />
        <span>Connection</span>
      </h2>
      <div className="space-y-4">
        <div className="settings-field">
          <div className="contents">
            <Label htmlFor="summary-provider" className="text-sm font-semibold">
              Provider
            </Label>
            <Select
              value={settings.summarizerProvider}
              onValueChange={(value) => onChange("summarizerProvider", value)}
            >
              <SelectTrigger
                id="summary-provider"
                className="h-10 rounded-md border-border/70 bg-background"
              >
                <SelectValue placeholder="Auto" />
              </SelectTrigger>
              <SelectContent className="rounded-md">
                <SelectItem value="auto">Auto</SelectItem>
                <SelectItem value="gemini">Gemini Native</SelectItem>
                <SelectItem value="llm">LLM</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {API_KEY_FIELDS.map((field) => (
          <div className="settings-field" key={field.key}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor={field.key} className="text-sm font-semibold">
                {field.label}
              </Label>
              {"href" in field && field.href && (
                <a
                  href={field.href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  Get key ↗
                </a>
              )}
            </div>
            <Input
              id={field.key}
              type={field.type ?? "password"}
              value={settings[field.key]}
              onChange={(event) => onChange(field.key, event.target.value)}
              onBlur={(event) => {
                if (field.key !== STORAGE_KEYS.LLM_BASE_URL) return;
                onLlmBaseUrlBlur(event.target.value);
              }}
              className="h-10 rounded-md border-border/70 bg-background"
              placeholder={field.placeholder}
            />
            {field.key === STORAGE_KEYS.LLM_BASE_URL && (
              <LlmModelPrefixControls settings={settings} onChange={onChange} />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export function ModelConfigurationSection({
  settings,
  selectorConfigs,
  renderModelCostLimitControl,
  onChange,
}: {
  settings: SettingsState;
  selectorConfigs: ModelSelectorConfig[];
  renderModelCostLimitControl: (selectorConfig: ModelSelectorConfig) => ReactNode;
  onChange: SettingsChangeHandler;
}) {
  return (
    <section className={SETTINGS_SECTION_CLASSNAME}>
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <Cpu className="h-4 w-4 text-muted-foreground" />
        <span>Models &amp; generation</span>
      </h2>
      <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,24rem),1fr))]">
        {selectorConfigs.map((selectorConfig) => (
          <ModelSelector
            key={selectorConfig.modelKey}
            label={selectorConfig.label}
            value={settings[selectorConfig.modelKey]}
            onChange={(value) => onChange(selectorConfig.modelKey, value)}
            options={selectorConfig.options.map((model) => toModelComboboxOption(model))}
            placeholder="Select or type model..."
            enableSorting
            defaultSortMetric={selectorConfig.defaultSortMetric}
            sortControlsTrailing={renderModelCostLimitControl(selectorConfig)}
          />
        ))}
      </div>
      <GenerationControls settings={settings} onChange={onChange} />
    </section>
  );
}

function GenerationControls({
  settings,
  onChange,
}: {
  settings: SettingsState;
  onChange: SettingsChangeHandler;
}) {
  return (
    <div className="space-y-4">
      <div className="settings-field">
        <Label htmlFor="target-language" className="text-sm font-semibold">
          Target language
        </Label>
        <Select
          value={settings.targetLanguage}
          onValueChange={(value) => onChange("targetLanguage", value)}
        >
          <SelectTrigger
            id="target-language"
            className="h-10 rounded-md border-border/70 bg-background"
          >
            <SelectValue placeholder="Language" />
          </SelectTrigger>
          <SelectContent className="rounded-md">
            {TARGET_LANGUAGES.map((language) => (
              <SelectItem key={language.value} value={language.value}>
                {language.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between gap-4 pt-1">
        <div className="text-sm font-semibold">Auto-generate captions</div>
        <Switch
          checked={settings.autoGenerate}
          onCheckedChange={(checked) => onChange("autoGenerate", checked)}
          aria-label="Auto-generate captions"
          className="shrink-0 data-[state=checked]:bg-primary"
        />
      </div>
    </div>
  );
}

export function StorageSettingsSection({
  isClearingStorage,
  onClearStoredData,
}: {
  isClearingStorage: boolean;
  onClearStoredData: () => void;
}) {
  return (
    <section className={SETTINGS_SECTION_CLASSNAME}>
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <Trash2 className="h-4 w-4 text-muted-foreground" />
        <span>Storage</span>
      </h2>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Cached data</p>
          <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
            Transcripts, summaries, video details, and temporary caches
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 hover:border-destructive/50 hover:bg-destructive/10 hover:text-foreground"
          aria-label="Clear cached storage"
          onClick={onClearStoredData}
          disabled={isClearingStorage}
        >
          {isClearingStorage ? <Loader2 className="animate-spin" /> : <Trash2 />}
          Clear
        </Button>
      </div>
    </section>
  );
}

/** Repeated actions adjust the reading scale; the current percentage doubles as the default reset. */
function FontSizeControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex shrink-0 items-center rounded-md border border-border/70 bg-background p-0.5"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9"
        aria-label={`Decrease ${label.toLowerCase()}`}
        title="Decrease size"
        disabled={value <= FONT_SCALE.MIN}
        onClick={() => onChange(normalizeFontScale(value - FONT_SCALE.STEP))}
      >
        <Minus aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="h-9 w-20 gap-1.5 px-1 tabular-nums"
        aria-label={`Reset ${label.toLowerCase()} to default (${FONT_SCALE.DEFAULT}%); current ${value}%`}
        title={`Reset to default (${FONT_SCALE.DEFAULT}%)`}
        onClick={() => onChange(FONT_SCALE.DEFAULT)}
      >
        <span>{value}%</span>
        <RotateCcw aria-hidden="true" className="!size-3" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9"
        aria-label={`Increase ${label.toLowerCase()}`}
        title="Increase size"
        disabled={value >= FONT_SCALE.MAX}
        onClick={() => onChange(normalizeFontScale(value + FONT_SCALE.STEP))}
      >
        <Plus aria-hidden="true" />
      </Button>
    </div>
  );
}

export function ReadingSettingsSection({
  settings,
  onChange,
}: {
  settings: SettingsState;
  onChange: SettingsChangeHandler;
}) {
  return (
    <section className={SETTINGS_SECTION_CLASSNAME}>
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <Type className="h-4 w-4 text-muted-foreground" />
        <span>Reading</span>
      </h2>
      <div className="space-y-3">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <Label className="text-sm font-medium text-foreground">Captions</Label>
          <FontSizeControl
            label="Caption font size"
            value={settings.captionFontSize}
            onChange={(value) => onChange("captionFontSize", value)}
          />
        </div>
        <div className="flex min-w-0 items-center justify-between gap-3">
          <Label className="text-sm font-medium text-foreground">Summary and chat</Label>
          <FontSizeControl
            label="Summary and chat font size"
            value={settings.summaryFontSize}
            onChange={(value) => onChange("summaryFontSize", value)}
          />
        </div>
      </div>
    </section>
  );
}
