/**
 * Component for configuring analysis model, quality model, and target language options.
 */

import { ModelSelector } from "@ui/components/ModelSelector";
import { ComboboxOption } from "@ui/components/ui/editable-combobox";
import { Switch } from "@ui/components/ui/switch";
import { useLanguageSelection, useModelSelection, useUserPreferences } from "@ui/hooks/use-config";
import { getProviderLogo } from "@ui/lib/provider-logos";
import { Bot, Languages, Sparkles, Zap } from "lucide-react";

export function VideoProcessingOptions() {
  const { languages } = useLanguageSelection();
  const { summarizerModels, refinerModels } = useModelSelection();
  const { preferences, updatePreferences } = useUserPreferences();

  const toOption = (m: { key: string; label: string; provider?: string; flag?: string }): ComboboxOption => {
    const logo = m.provider ? getProviderLogo(m.provider) : null;
    return {
      value: m.key,
      label: m.label,
      icon: logo ? (
        <img src={logo} alt={m.provider} className="w-full h-full object-contain" />
      ) : m.flag ? (
        <span className="text-sm">{m.flag}</span>
      ) : undefined,
    };
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 rounded-2xl border border-border/50 bg-muted/30 p-4 md:p-6">
      <ModelSelector
        label="Summarizer"
        icon={Bot}
        value={preferences.analysisModel}
        onChange={(value) => updatePreferences({ analysisModel: value })}
        options={summarizerModels.map(toOption)}
        placeholder="Select summarizer..."
      />

      <ModelSelector
        label="Refiner"
        icon={Sparkles}
        value={preferences.qualityModel}
        onChange={(value) => updatePreferences({ qualityModel: value })}
        options={refinerModels.map(toOption)}
        placeholder="Select refiner..."
      />

      <ModelSelector
        label="Language"
        icon={Languages}
        value={preferences.targetLanguage}
        onChange={(value) => updatePreferences({ targetLanguage: value })}
        options={languages.map(toOption)}
        placeholder="Select language..."
      />

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center">
            <Zap className="w-3 h-3 text-white" />
          </div>
          <span className="text-sm font-bold text-primary uppercase tracking-wide">QUALITY CHECK</span>
        </div>
        <div className="flex h-10 w-full items-center rounded-md border border-red-500/30 bg-red-800 px-3 hover:bg-red-800">
          <Switch
            checked={!preferences.fastMode}
            onCheckedChange={(checked) => updatePreferences({ fastMode: !checked })}
            className="data-[state=checked]:bg-white data-[state=unchecked]:bg-red-950/50 [&>span]:data-[state=checked]:bg-red-600"
          />
        </div>
      </div>
    </div>
  );
}
