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
		<div className="rounded-2xl border border-border/60 bg-muted/20 p-4 md:p-6">
			<div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,24rem),1fr))]">
				<ModelSelector
					label="Summarizer"
					icon={Bot}
					value={preferences.summaryModel}
					onChange={(value) => updatePreferences({ summaryModel: value })}
					options={summarizerModels.map((model) =>
						toModelComboboxOption(model),
					)}
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
			</div>

			<div className="mt-4">
				<ModelSelector
					label="Language"
					icon={Languages}
					value={preferences.targetLanguage}
					onChange={(value) => updatePreferences({ targetLanguage: value })}
					options={languages.map((language) => toModelComboboxOption(language))}
					placeholder="Select language..."
				/>
			</div>
		</div>
	);
}
