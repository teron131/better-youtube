import { ModelSelector } from "@ui/components/ModelSelector";
import { RecommendationFilterSettings } from "@ui/components/RecommendationFilterSettings";
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
import {
	ArrowLeft,
	Cpu,
	Globe,
	Key,
	Settings as SettingsIcon,
	Sparkles,
	Trash2,
	Type,
	Zap,
} from "lucide-react";
import type { ReactNode } from "react";
import type { FontSize } from "@/core/constants";
import { STORAGE_KEYS, TARGET_LANGUAGES } from "@/core/constants";
import { resolveLlmRequestModel } from "@/core/llmModelPrefix";
import { SIDEPANEL_ROUTE_HREFS } from "../../lib/routes";
import {
	API_KEY_FIELDS,
	FONT_SIZE_OPTIONS,
	LLM_MODEL_PREFIX_OPTIONS,
	type ModelSelectorConfig,
	SETTINGS_SECTION_CLASSNAME,
	type SettingsChangeHandler,
	type SettingsState,
} from "./settingsTypes";

export function SettingsLoadingView() {
	return (
		<div className="app-shell flex items-center justify-center">
			<div className="animate-pulse flex flex-col items-center gap-4">
				<div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
					<SettingsIcon className="h-6 w-6 text-primary animate-spin-slow" />
				</div>
				<p className="text-muted-foreground font-medium">Loading settings...</p>
			</div>
		</div>
	);
}

export function SettingsTopbar() {
	return (
		<div className="absolute top-[var(--sidepanel-topbar-offset)] left-0 right-0 z-50">
			<div className="sidepanel-container">
				<div className="flex min-h-[var(--sidepanel-topbar-height)] items-center justify-between w-full">
					<div className="fade-in-up">
						<h1 className="text-4xl font-black tracking-tight text-foreground">
							Settings
						</h1>
					</div>
					<Button
						asChild
						variant="ghost"
						size="icon"
						className="text-muted-foreground hover:text-foreground transition-all"
					>
						<a aria-label="Back to main page" href={SIDEPANEL_ROUTE_HREFS.home}>
							<ArrowLeft className="h-6 w-6" />
						</a>
					</Button>
				</div>
			</div>
		</div>
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
		<div className="space-y-1.5 pt-1">
			<Label className="text-sm font-semibold">LLM Model ID Format</Label>
			<div className="grid items-stretch gap-2 min-[520px]:grid-cols-[minmax(0,1fr)_12rem]">
				<div className="grid h-9 gap-px rounded-md border border-border/60 bg-muted/20 px-2.5 py-0.5 text-[11px]">
					{modelPreviews.map((preview) => (
						<div
							key={preview.label}
							className="grid min-h-0 grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-2"
						>
							<span className="font-semibold text-muted-foreground">
								{preview.label}
							</span>
							<code className="truncate text-right text-xs text-foreground">
								{preview.value}
							</code>
						</div>
					))}
				</div>

				<div className="grid h-9 grid-cols-2 rounded-md border border-border/70 bg-background p-0.5">
					{LLM_MODEL_PREFIX_OPTIONS.map((option) => (
						<button
							key={option.value}
							type="button"
							onClick={() => onChange("llmModelPrefixMode", option.value)}
							className={`h-full rounded-sm px-1.5 text-[11px] font-semibold transition-colors ${
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
		<section className={SETTINGS_SECTION_CLASSNAME}>
			<div className="flex items-center gap-2 text-base font-semibold uppercase tracking-[0.04em]">
				<Key className="h-4 w-4 text-primary" />
				<span>API Configuration</span>
			</div>
			<div className="space-y-4">
				{API_KEY_FIELDS.map((field) => (
					<div className="space-y-1.5" key={field.key}>
						<div className="flex items-center justify-between gap-3">
							<Label htmlFor={field.key} className="text-sm font-semibold">
								{field.label}
							</Label>
							{"href" in field && field.href && (
								<a
									href={field.href}
									target="_blank"
									rel="noreferrer"
									className="text-xs text-primary/80 hover:text-primary hover:underline"
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
	renderModelCostLimitControl: (
		selectorConfig: ModelSelectorConfig,
	) => ReactNode;
	onChange: SettingsChangeHandler;
}) {
	return (
		<section className={SETTINGS_SECTION_CLASSNAME}>
			<div className="flex items-center gap-2 text-base font-semibold uppercase tracking-[0.04em]">
				<Cpu className="h-4 w-4 text-primary" />
				<span>Model Configuration</span>
			</div>
			<div className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(100%,24rem),1fr))]">
				{selectorConfigs.map((selectorConfig) => (
					<ModelSelector
						key={selectorConfig.modelKey}
						label={selectorConfig.label}
						icon={selectorConfig.icon}
						value={settings[selectorConfig.modelKey]}
						onChange={(value) => onChange(selectorConfig.modelKey, value)}
						options={selectorConfig.options.map((model) =>
							toModelComboboxOption(model),
						)}
						placeholder="Select or type model..."
						enableSorting
						defaultSortMetric={selectorConfig.defaultSortMetric}
						sortControlsTrailing={renderModelCostLimitControl(selectorConfig)}
					/>
				))}
			</div>
		</section>
	);
}

export function GenerationSettingsSection({
	settings,
	onChange,
}: {
	settings: SettingsState;
	onChange: SettingsChangeHandler;
}) {
	return (
		<section className={SETTINGS_SECTION_CLASSNAME}>
			<div className="flex items-center gap-2 text-base font-semibold uppercase tracking-[0.04em]">
				<Zap className="h-4 w-4 text-primary" />
				<span>Generation</span>
			</div>
			<div className="space-y-5">
				<div className="space-y-2">
					<div className="flex items-center gap-2 text-sm font-semibold">
						<Globe className="h-4 w-4 text-primary" />
						<span>Target Language</span>
					</div>
					<Select
						value={settings.targetLanguage}
						onValueChange={(value) => onChange("targetLanguage", value)}
					>
						<SelectTrigger className="h-10 rounded-md border-border/70 bg-background">
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

				<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
					<div className="space-y-2">
						<div className="flex items-center gap-2 text-sm font-semibold">
							<Cpu className="h-4 w-4 text-primary" />
							<span>Provider</span>
						</div>
						<Select
							value={settings.summarizerProvider}
							onValueChange={(value) => onChange("summarizerProvider", value)}
						>
							<SelectTrigger className="h-10 rounded-md border-border/70 bg-background">
								<SelectValue placeholder="Auto" />
							</SelectTrigger>
							<SelectContent className="rounded-md">
								<SelectItem value="auto">Auto</SelectItem>
								<SelectItem value="gemini">Gemini Native</SelectItem>
								<SelectItem value="llm">LLM</SelectItem>
							</SelectContent>
						</Select>
					</div>

					<div className="space-y-2">
						<div className="flex items-center gap-2 text-sm font-semibold">
							<Sparkles className="h-4 w-4 text-primary" />
							<span>Mode</span>
						</div>
						<Select
							value={settings.summarizerMode}
							onValueChange={(value) => {
								void onChange("summarizerMode", value);
							}}
						>
							<SelectTrigger className="h-10 rounded-md border-border/70 bg-background">
								<SelectValue placeholder="Select mode" />
							</SelectTrigger>
							<SelectContent className="rounded-md">
								<SelectItem value="native">Gemini Native</SelectItem>
								<SelectItem value="validation">Validation Agent</SelectItem>
								<SelectItem value="fast">Fast Agent</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</div>

				<div className="flex items-center justify-between gap-4 pt-1">
					<div className="flex items-center gap-2 text-sm font-semibold">
						<Sparkles className="h-4 w-4 text-primary" />
						<span>Auto-Generate Caption</span>
					</div>
					<Switch
						checked={settings.autoGenerate}
						onCheckedChange={(checked) => onChange("autoGenerate", checked)}
						className="scale-75 data-[state=checked]:bg-primary"
					/>
				</div>
			</div>
		</section>
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
			<div className="flex items-center gap-2 text-base font-semibold uppercase tracking-[0.04em]">
				<Trash2 className="h-4 w-4 text-primary" />
				<span>Storage</span>
			</div>
			<div className="flex items-center justify-between gap-4">
				<div className="min-w-0">
					<p className="text-sm font-semibold text-foreground">Cached data</p>
					<p className="mt-1 text-xs text-muted-foreground">
						Transcripts, summaries, video details, and temporary caches
					</p>
				</div>
				<Button
					type="button"
					variant="default"
					size="icon"
					aria-label="Clear cached storage"
					title="Clear cached storage"
					onClick={onClearStoredData}
					disabled={isClearingStorage}
				>
					<Trash2 className="h-4 w-4" />
				</Button>
			</div>
		</section>
	);
}

function FontSizeSelector({
	value,
	onChange,
}: {
	value: FontSize;
	onChange: (value: FontSize) => void;
}) {
	return (
		<div className="grid grid-cols-3 rounded-md border border-border/70 bg-background p-1">
			{FONT_SIZE_OPTIONS.map((size) => (
				<button
					key={size}
					type="button"
					onClick={() => onChange(size)}
					className={`h-9 rounded-sm text-sm font-semibold transition-colors ${
						value === size
							? "bg-primary text-white"
							: "text-muted-foreground hover:bg-muted hover:text-foreground"
					}`}
				>
					{size}
				</button>
			))}
		</div>
	);
}

export function AppearanceSettingsSection({
	settings,
	onChange,
}: {
	settings: SettingsState;
	onChange: SettingsChangeHandler;
}) {
	return (
		<>
			<RecommendationFilterSettings />

			<section className={SETTINGS_SECTION_CLASSNAME}>
				<div className="flex items-center gap-2 text-base font-semibold uppercase tracking-[0.04em]">
					<Type className="h-4 w-4 text-primary" />
					<span>Font Size</span>
				</div>
				<div className="grid grid-cols-1 gap-5 md:grid-cols-2">
					<div className="space-y-2">
						<Label className="text-sm font-semibold text-foreground">
							Caption Overlay
						</Label>
						<FontSizeSelector
							value={settings.captionFontSize as FontSize}
							onChange={(value) => onChange("captionFontSize", value)}
						/>
					</div>
					<div className="space-y-2">
						<Label className="text-sm font-semibold text-foreground">
							Summary Panel
						</Label>
						<FontSizeSelector
							value={settings.summaryFontSize as FontSize}
							onChange={(value) => onChange("summaryFontSize", value)}
						/>
					</div>
				</div>
			</section>
		</>
	);
}
