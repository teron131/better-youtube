import { ExampleUrls } from "@ui/components/ExampleUrls";
import { Alert, AlertDescription } from "@ui/components/ui/alert";
import { Button } from "@ui/components/ui/button";
import { Card } from "@ui/components/ui/card";
import { EditableCombobox, findMatchingComboboxOption } from "@ui/components/ui/editable-combobox";
import { Input } from "@ui/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui/components/ui/tooltip";
import { useModelSelection, useUserPreferences } from "@ui/hooks/use-config";
import { useToast } from "@ui/hooks/use-toast";
import { AlertCircle, ArrowUp, Brain, Captions, DollarSign, Loader2, Rocket } from "lucide-react";
import {
  type MouseEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { normalizeModelCostLimit } from "@/core/config";
import { DEFAULTS, STORAGE_KEYS } from "@/core/constants";
import { getStorageValue, setStorageValue } from "@/core/storage";
import { isFormValid, prepareProcessingOptions, validateYouTubeUrl } from "@/core/utils/validation";

import { toModelComboboxOption } from "../lib/model-options";
import {
  decorateModelSortLabel,
  defaultModelSortDirection,
  type ModelSortMetric,
  sortModelsByMetric,
} from "../lib/model-sort";

interface VideoUrlFormProps {
  onSubmit: (
    url: string,
    options?: {
      targetLanguage?: string;
      summaryModel?: string;
      qualityModel?: string;
    },
    action?: "caption" | "summary",
  ) => void;
  isLoading: boolean;
  initialUrl?: string;
}

const MODEL_SORT_OPTIONS: Array<{
  metric: ModelSortMetric;
  icon: typeof Brain;
  label: string;
}> = [
  { metric: "intelligence", icon: Brain, label: "Sort by intelligence" },
  { metric: "speed", icon: Rocket, label: "Sort by speed" },
  { metric: "price", icon: DollarSign, label: "Sort by price" },
];

function clampModelCostLimit(
  value: number,
  priceRange: { min: number | null; max: number | null },
): number {
  const minValue = priceRange.min;
  const maxValue = priceRange.max;

  if (minValue != null && value < minValue) {
    return minValue;
  }

  if (maxValue != null && value > maxValue) {
    return maxValue;
  }

  return value;
}

function resolveVisibleModelKey(
  currentKey: string,
  visibleModels: Array<{ key: string }>,
  fallbackKey: string,
): string {
  if (visibleModels.some((model) => model.key === currentKey)) {
    return currentKey;
  }

  if (visibleModels.some((model) => model.key === fallbackKey)) {
    return fallbackKey;
  }

  return visibleModels[0]?.key ?? currentKey;
}

function modelCostLimitBounds(priceRange: { min: number | null; max: number | null }): {
  min: string;
  max?: string;
} {
  return {
    min: priceRange.min != null ? priceRange.min.toFixed(1) : "0.1",
    max: priceRange.max != null ? priceRange.max.toFixed(1) : undefined,
  };
}

export const VideoUrlForm = ({ onSubmit, isLoading, initialUrl }: VideoUrlFormProps) => {
  const [url, setUrl] = useState(initialUrl || "");
  const [validationError, setValidationError] = useState<string>("");
  const [showExamples, setShowExamples] = useState(false);
  const [shouldLoadModelOptions, setShouldLoadModelOptions] = useState(() => !!initialUrl);
  const { toast } = useToast();
  const { preferences, updatePreferences, isLoaded } = useUserPreferences({
    loadDynamicModels: shouldLoadModelOptions,
  });
  const { summarizerModels, summarizerModelPriceRange } = useModelSelection({
    loadDynamicModels: shouldLoadModelOptions,
  });
  const [sortMetric, setSortMetric] = useState<ModelSortMetric>("intelligence");
  const [modelCostLimitInput, setModelCostLimitInput] = useState(
    String(DEFAULTS.SUMMARIZER_MODEL_COST_LIMIT),
  );
  const summarizerCostLimitBounds = modelCostLimitBounds(summarizerModelPriceRange);
  const baseModelOptions = useMemo(
    () =>
      summarizerModels.map((model) =>
        toModelComboboxOption(model, { iconClassName: "h-4 w-4 opacity-80" }),
      ),
    [summarizerModels],
  );
  const visibleModelOptions = useMemo(() => {
    const direction = defaultModelSortDirection(sortMetric);
    return sortModelsByMetric(baseModelOptions, sortMetric, direction).map((option) => ({
      ...option,
      label: decorateModelSortLabel(option, sortMetric),
    }));
  }, [baseModelOptions, sortMetric]);
  const selectedModelOption = useMemo(
    () => findMatchingComboboxOption(visibleModelOptions, preferences.summaryModel),
    [preferences.summaryModel, visibleModelOptions],
  );
  const loadModelOptions = useCallback(() => {
    setShouldLoadModelOptions(true);
  }, []);

  const handleModelSortClick = (event: MouseEvent<HTMLButtonElement>, metric: ModelSortMetric) => {
    event.preventDefault();
    event.stopPropagation();
    loadModelOptions();
    setSortMetric(metric);
  };

  const handleModelSortPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  useEffect(() => {
    if (!initialUrl) return;
    setUrl(initialUrl);
    setShouldLoadModelOptions(true);
  }, [initialUrl]);

  useEffect(() => {
    let isActive = true;

    const syncStoredModelCostLimit = async () => {
      try {
        const storedValue = await getStorageValue<number>(STORAGE_KEYS.SUMMARIZER_MODEL_COST_LIMIT);
        if (!isActive) return;
        const resolvedValue = clampModelCostLimit(
          normalizeModelCostLimit(storedValue),
          summarizerModelPriceRange,
        );
        setModelCostLimitInput(String(resolvedValue));
      } catch (error) {
        console.error("Failed to load summary model cost limit:", error);
      }
    };

    void syncStoredModelCostLimit();

    const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName !== "local" || !changes[STORAGE_KEYS.SUMMARIZER_MODEL_COST_LIMIT]) {
        return;
      }
      void syncStoredModelCostLimit();
    };

    chrome.storage.onChanged.addListener(listener);
    return () => {
      isActive = false;
      chrome.storage.onChanged.removeListener(listener);
    };
  }, [summarizerModelPriceRange]);

  useEffect(() => {
    if (!isLoaded || summarizerModels.length === 0) {
      return;
    }

    const nextModelKey = resolveVisibleModelKey(
      preferences.summaryModel,
      summarizerModels,
      DEFAULTS.MODEL_SUMMARIZER,
    );

    if (nextModelKey !== preferences.summaryModel) {
      updatePreferences({ summaryModel: nextModelKey });
    }
  }, [isLoaded, preferences.summaryModel, summarizerModels, updatePreferences]);

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value;
    setUrl(newUrl);
    if (validationError) setValidationError("");
    setShowExamples(newUrl.trim().length === 0);
  };

  const handleSubmit = async (
    e: React.SyntheticEvent,
    action: "caption" | "summary" = "summary",
  ) => {
    e.preventDefault();
    const trimmedUrl = url.trim();

    const options = prepareProcessingOptions(
      preferences.targetLanguage,
      preferences.summaryModel,
      preferences.qualityModel,
    );

    if (!trimmedUrl) {
      setValidationError("");
      onSubmit("", options, action);
      return;
    }

    const validation = validateYouTubeUrl(trimmedUrl);
    if (!validation.isValid) {
      setValidationError(validation.error || "Invalid URL");
      return;
    }

    setValidationError("");
    onSubmit(trimmedUrl, options, action);
  };

  const handleExampleClick = (exampleUrl: string) => {
    setUrl(exampleUrl);
    setShowExamples(false);
    setValidationError("");
  };

  const commitModelCostLimit = async (rawValue: string) => {
    const nextValue = clampModelCostLimit(
      normalizeModelCostLimit(rawValue),
      summarizerModelPriceRange,
    );

    setModelCostLimitInput(String(nextValue));

    try {
      await setStorageValue(STORAGE_KEYS.SUMMARIZER_MODEL_COST_LIMIT, nextValue);
    } catch (error) {
      console.error("Failed to save summary model cost limit:", error);
      toast({
        title: "Couldn't save model limit",
        description: "The summary model cost cap was not updated.",
        variant: "destructive",
      });
    }
  };

  const handleModelCostLimitInputChange = (rawValue: string) => {
    if (rawValue.trim() === "") {
      setModelCostLimitInput(rawValue);
      return;
    }

    const parsedValue = Number.parseFloat(rawValue);
    if (!Number.isFinite(parsedValue)) {
      setModelCostLimitInput(rawValue);
      return;
    }

    const nextValue = clampModelCostLimit(parsedValue, summarizerModelPriceRange);
    const normalizedValue = Number.parseFloat(nextValue.toFixed(1));
    setModelCostLimitInput(String(normalizedValue));
  };

  const renderModelCostLimitControl = () => (
    <>
      <span className="text-[10px] font-semibold text-muted-foreground">≤</span>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <Input
            type="number"
            min={summarizerCostLimitBounds.min}
            max={summarizerCostLimitBounds.max}
            step="0.1"
            value={modelCostLimitInput}
            onChange={(event) => handleModelCostLimitInputChange(event.target.value)}
            onBlur={() => {
              void commitModelCostLimit(modelCostLimitInput);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.currentTarget.blur();
            }}
            className="h-6 w-14 rounded-sm border-0 bg-transparent px-1 text-right text-xs shadow-none hover:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
            aria-label="Summary model cost limit"
          />
        </TooltipTrigger>
        <TooltipContent>
          <p>Max blended price</p>
        </TooltipContent>
      </Tooltip>
    </>
  );

  return (
    <Card className="w-full rounded-[24px] p-0 border border-border/60 bg-muted/40 hover:border-primary/15 transition-all duration-500">
      <form onSubmit={(event) => handleSubmit(event, "summary")} className="space-y-3 p-4 sm:p-5">
        <div className="space-y-2">
          <div
            className={`rounded-2xl bg-transparent px-4 py-2 shadow-none transition-all duration-300 ${
              validationError ? "ring-1 ring-destructive/60" : ""
            }`}
          >
            <Input
              type="url"
              placeholder="https://youtube.com/watch?v=..."
              value={url}
              onChange={handleUrlChange}
              className="h-8 border-0 bg-transparent px-0 text-sm shadow-none placeholder:text-muted-foreground/80 focus-visible:ring-0 focus-visible:ring-offset-0"
              disabled={isLoading}
            />
          </div>

          {validationError && (
            <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{validationError}</AlertDescription>
            </Alert>
          )}

          {showExamples && <ExampleUrls onSelect={handleExampleClick} />}
        </div>

        <div className="flex flex-col gap-3 pt-1 min-[520px]:flex-row min-[520px]:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="min-w-0 flex-1">
              <EditableCombobox
                value={preferences.summaryModel}
                onChange={(value) => updatePreferences({ summaryModel: value })}
                options={visibleModelOptions}
                placeholder="Select or type model..."
                className="w-full"
                contentClassName="rounded-md"
                renderIcon={() => selectedModelOption?.icon ?? null}
                onOpen={loadModelOptions}
                renderOption={(option) => (
                  <>
                    {option.icon && (
                      <span className="mr-2 mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                        {option.icon}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 whitespace-normal text-left leading-6">
                      {option.label}
                    </span>
                  </>
                )}
                inputClassName="h-9 rounded-md border-border/70 bg-background text-sm shadow-none hover:border-primary/30 focus:border-primary/50 focus:hover:border-primary/50 focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>

            <div className="flex shrink-0 items-center rounded-md border border-border/60 bg-background p-0.5">
              {MODEL_SORT_OPTIONS.map(({ metric, icon: MetricIcon, label }) => (
                <Tooltip key={metric} delayDuration={0}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onPointerDown={handleModelSortPointerDown}
                      onClick={(event) => handleModelSortClick(event, metric)}
                      className={`flex h-8 w-8 items-center justify-center rounded-sm transition-colors ${
                        sortMetric === metric
                          ? "bg-primary text-white"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                      aria-label={label}
                    >
                      <MetricIcon className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{label}</p>
                  </TooltipContent>
                </Tooltip>
              ))}
              <div className="ml-1 flex items-center gap-1 border-l border-border/60 pl-1.5">
                {renderModelCostLimitControl()}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={isLoading || !isFormValid(url)}
                  onClick={(event) => handleSubmit(event, "caption")}
                  className="h-9 w-9 rounded-full border border-transparent bg-transparent text-foreground hover:bg-transparent hover:border-primary/25 transition-all active:border-transparent"
                  aria-label="Generate captions"
                >
                  <Captions className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Caption</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="submit"
                  size="icon"
                  disabled={isLoading || !isFormValid(url)}
                  className="h-9 w-9 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm transition-all disabled:opacity-60"
                  aria-label="Generate summary"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowUp className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Summary</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </form>
    </Card>
  );
};
