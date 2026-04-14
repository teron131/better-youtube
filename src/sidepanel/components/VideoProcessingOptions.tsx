/**
 * Component for configuring summary model, quality model, and target language options.
 */

import { ModelIcon } from "@ui/components/ModelIcon";
import { ModelSelector } from "@ui/components/ModelSelector";
import type { ComboboxOption } from "@ui/components/ui/editable-combobox";
import {
	useLanguageSelection,
	useModelSelection,
	useUserPreferences,
} from "@ui/hooks/use-config";
import { Bot, Languages, Sparkles } from "lucide-react";

export function VideoProcessingOptions() {
	const { languages } = useLanguageSelection();
	const { summarizerModels, refinerModels } = useModelSelection();
	const { preferences, updatePreferences } = useUserPreferences();

	const toOption = (m: {
		key: string;
		label: string;
		provider?: string;
		flag?: string;
		logo?: string;
		fallbackLogo?: string;
		intelligenceScore?: number | null;
		speedScore?: number | null;
		price?: number | null;
	}): ComboboxOption => {
		const hasIcon = m.logo || m.provider;
		return {
			value: m.key,
			label: m.label,
			icon: hasIcon ? (
				<ModelIcon
					provider={m.provider}
					logo={m.logo}
					fallbackLogo={m.fallbackLogo}
					alt={m.provider || m.label}
					className="w-full h-full object-contain"
				/>
			) : m.flag ? (
				<span className="text-sm">{m.flag}</span>
			) : undefined,
			intelligenceScore: m.intelligenceScore,
			speedScore: m.speedScore,
			price: m.price,
		};
	};

	return (
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 rounded-2xl border border-border/60 bg-muted/20 p-4 md:p-6">
			<ModelSelector
				label="Summarizer"
				icon={Bot}
				value={preferences.summaryModel}
				onChange={(value) => updatePreferences({ summaryModel: value })}
				options={summarizerModels.map(toOption)}
				placeholder="Select summarizer..."
				enableSorting
				defaultSortMetric="intelligence"
			/>

			<ModelSelector
				label="Refiner"
				icon={Sparkles}
				value={preferences.qualityModel}
				onChange={(value) => updatePreferences({ qualityModel: value })}
				options={refinerModels.map(toOption)}
				placeholder="Select refiner..."
				enableSorting
				defaultSortMetric="speed"
			/>

			<ModelSelector
				label="Language"
				icon={Languages}
				value={preferences.targetLanguage}
				onChange={(value) => updatePreferences({ targetLanguage: value })}
				options={languages.map(toOption)}
				placeholder="Select language..."
			/>
		</div>
	);
}
