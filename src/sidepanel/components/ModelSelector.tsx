/**
 * Reusable selector component for choosing AI models with icon and label.
 */

import { ComboboxOption, EditableCombobox } from "@ui/components/ui/editable-combobox";
import { LucideIcon } from "lucide-react";

interface ModelSelectorProps {
  label: string;
  icon: LucideIcon;
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder: string;
}

export function ModelSelector({
  label,
  icon: Icon,
  value,
  onChange,
  options,
  placeholder,
}: ModelSelectorProps) {
  const renderModelOption = (option: ComboboxOption) => (
    <>
      {option.icon && <span className="mr-2 flex items-center justify-center w-4 h-4">{option.icon}</span>}
      <span>{option.label}</span>
    </>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 group relative">
        <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center">
          <Icon className="w-3 h-3 text-white" />
        </div>
        <span className="text-sm font-bold text-primary uppercase tracking-wide">{label}</span>
      </div>

      <EditableCombobox
        value={value}
        onChange={onChange}
        options={options}
        placeholder={placeholder}
        renderOption={renderModelOption}
        inputClassName="bg-background/40 border-border/60 hover:border-primary/30 focus:border-primary/50 placeholder:text-muted-foreground"
      />
    </div>
  );
}
