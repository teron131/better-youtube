import { ModelIcon } from "@ui/components/ModelIcon";
import type { ComboboxOption } from "@ui/components/ui/editable-combobox";
import type { AvailableModel } from "@ui/services/config";

const DEFAULT_MODEL_ICON_CLASS_NAME = "w-full h-full object-contain";

type ModelOptionSource = Pick<
  AvailableModel,
  | "key"
  | "label"
  | "provider"
  | "logo"
  | "fallbackLogo"
  | "intelligenceScore"
  | "speedMetric"
  | "price"
> & {
  flag?: string;
};

interface ModelOptionConfig {
  iconClassName?: string;
}

export function toModelComboboxOption(
  model: ModelOptionSource,
  config: ModelOptionConfig = {},
): ComboboxOption {
  const hasIcon = model.logo || model.provider;
  const iconClassName = config.iconClassName ?? DEFAULT_MODEL_ICON_CLASS_NAME;

  return {
    value: model.key,
    label: model.label,
    icon: hasIcon ? (
      <ModelIcon
        provider={model.provider}
        logo={model.logo}
        fallbackLogo={model.fallbackLogo}
        alt={model.provider || model.label}
        className={iconClassName}
      />
    ) : model.flag ? (
      <span className="text-sm">{model.flag}</span>
    ) : undefined,
    intelligenceScore: model.intelligenceScore,
    speedMetric: model.speedMetric,
    price: model.price,
  };
}
