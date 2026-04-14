/**
 * Component for configuring summary model, quality model, and target language options.
 */

import { ModelSelector } from "@ui/components/ModelSelector";
import {
	useLanguageSelection,
	useModelSelection,
	useUserPreferences,
} from "@ui/hooks/use-config";
import { Bot, Languages, Sparkles } from "lucide-react";
import { toModelComboboxOption } from "../lib/model-options";

export function VideoProcessingOptions() {
	const { languages } = useLanguageSelection();
	const { summarizerModels, refinerModels } = useModelSelection();
	const { preferences, updatePreferences } = useUserPreferences();

	return (
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 rounded-2xl border border-border/60 bg-muted/20 p-4 md:p-6">
			<ModelSelector
				label="Summarizer"
				icon={Bot}
				value={preferences.summaryModel}
				onChange={(value) => updatePreferences({ summaryModel: value })}
				options={summarizerModels.map((model) => toModelComboboxOption(model))}
				placeholder="Select summarizer..."
				enableSorting
				defaultSortMetric="intelligence"
			/>

			<ModelSelector
				label="Refiner"
				icon={Sparkles}
				value={preferences.qualityModel}
				onChange={(value) => updatePreferences({ qualityModel: value })}
				options={refinerModels.map((model) => toModelComboboxOption(model))}
				placeholder="Select refiner..."
				enableSorting
				defaultSortMetric="speed"
			/>

			<ModelSelector
				label="Language"
				icon={Languages}
				value={preferences.targetLanguage}
				onChange={(value) => updatePreferences({ targetLanguage: value })}
				options={languages.map((language) => toModelComboboxOption(language))}
				placeholder="Select language..."
			/>
		</div>
	);
}
