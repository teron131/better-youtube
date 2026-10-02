/** Adapts model metadata to the shared picker, including provider icons and sortable scores. */

import { ModelIcon } from "@ui/components/ModelIcon";
import type { ComboboxOption } from "@ui/components/ui/editable-combobox";
import type { AvailableModel } from "@ui/services/config";

export function toModelComboboxOption(model: AvailableModel): ComboboxOption {
  const hasIcon = model.logo || model.provider;

  return {
    value: model.key,
    label: model.label,
    icon: hasIcon ? (
      <ModelIcon
        provider={model.provider}
        logo={model.logo}
        fallbackLogo={model.fallbackLogo}
        alt={model.provider || model.label}
        className="w-full h-full object-contain"
      />
    ) : undefined,
    intelligenceScore: model.intelligenceScore,
    speedMetric: model.speedMetric,
    price: model.price,
  };
}
