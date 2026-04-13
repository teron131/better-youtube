import { Button } from "@ui/components/ui/button";
import { Card, CardContent, CardHeader } from "@ui/components/ui/card";
import { Input } from "@ui/components/ui/input";
import { Switch } from "@ui/components/ui/switch";
import { useToast } from "@ui/hooks/use-toast";
import {
	clearRecommendationFilterHistory,
	extractSubscriptionsFromCurrentTab,
	getRecommendationFilterHistory,
	getRecommendationFilterSettings,
	getRecommendationFilterStats,
	getStoredSubscriptions,
	openSubscriptionsPage,
	setRecommendationFilterSetting,
} from "@ui/services/recommendationFilters";
import {
	Clock3,
	ExternalLink,
	History,
	Languages,
	ListFilter,
	RefreshCw,
	ShieldCheck,
	TrendingDown,
	Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { STORAGE_KEYS } from "@/core/constants";
import type {
	FeedFilterSettings,
	FilteredVideoRecord,
	FilterStats,
	StoredSubscriptions,
} from "@/core/recommendationFilters";
import {
	DEFAULT_FEED_FILTER_SETTINGS,
	DEFAULT_FILTER_STATS,
} from "@/core/recommendationFilters";

const STAT_ITEMS: Array<{
	key: keyof FilterStats;
	label: string;
}> = [
	{ key: "views", label: "Views" },
	{ key: "duration", label: "Duration" },
	{ key: "age", label: "Age" },
	{ key: "keywords", label: "Keywords" },
	{ key: "language", label: "Language" },
	{ key: "total", label: "Total" },
];

type ToggleConfig = {
	key:
		| "viewsFilterEnabled"
		| "durationFilterEnabled"
		| "keywordFilterEnabled"
		| "ageFilterEnabled"
		| "englishOnlyTitles"
		| "preserveSubscribedChannels";
	icon: typeof TrendingDown;
	title: string;
	description: string;
};

const TOGGLE_ITEMS: ToggleConfig[] = [
	{
		key: "viewsFilterEnabled",
		icon: TrendingDown,
		title: "Low views",
		description: "Hide recommendations that miss your minimum view threshold.",
	},
	{
		key: "durationFilterEnabled",
		icon: Clock3,
		title: "Duration range",
		description: "Filter recommendations outside your preferred watch length.",
	},
	{
		key: "keywordFilterEnabled",
		icon: ListFilter,
		title: "Keyword match",
		description: "Suppress recommendations with blocked words in the title.",
	},
	{
		key: "ageFilterEnabled",
		icon: History,
		title: "Older videos",
		description: "Hide recommendations older than your year limit.",
	},
	{
		key: "englishOnlyTitles",
		icon: Languages,
		title: "English titles only",
		description:
			"Remove recommendations whose titles are not detected as English.",
	},
	{
		key: "preserveSubscribedChannels",
		icon: ShieldCheck,
		title: "Keep subscriptions",
		description:
			"Do not hide recommendations from channels you already follow.",
	},
];

type NumericFieldConfig = {
	key: "minViews" | "minDuration" | "maxDuration" | "maxAgeYears";
	label: string;
	hint: string;
};

const NUMERIC_FIELDS: NumericFieldConfig[] = [
	{ key: "minViews", label: "Minimum views", hint: "views" },
	{ key: "minDuration", label: "Minimum duration", hint: "seconds" },
	{ key: "maxDuration", label: "Maximum duration", hint: "seconds" },
	{ key: "maxAgeYears", label: "Maximum age", hint: "years" },
];

export function RecommendationFilterSettings() {
	const { toast } = useToast();
	const [settings, setSettings] = useState<FeedFilterSettings>(
		DEFAULT_FEED_FILTER_SETTINGS,
	);
	const [stats, setStats] = useState<FilterStats>(DEFAULT_FILTER_STATS);
	const [history, setHistory] = useState<FilteredVideoRecord[]>([]);
	const [subscriptions, setSubscriptions] =
		useState<StoredSubscriptions | null>(null);
	const [newKeyword, setNewKeyword] = useState("");
	const [isExtracting, setIsExtracting] = useState(false);
	const recommendationSettingKeys = useMemo(
		() =>
			new Set<string>([
				STORAGE_KEYS.VIEWS_FILTER_ENABLED,
				STORAGE_KEYS.DURATION_FILTER_ENABLED,
				STORAGE_KEYS.KEYWORD_FILTER_ENABLED,
				STORAGE_KEYS.AGE_FILTER_ENABLED,
				STORAGE_KEYS.ENGLISH_ONLY_TITLES,
				STORAGE_KEYS.PRESERVE_SUBSCRIBED_CHANNELS,
				STORAGE_KEYS.MIN_VIEWS,
				STORAGE_KEYS.MIN_DURATION,
				STORAGE_KEYS.MAX_DURATION,
				STORAGE_KEYS.MAX_AGE_YEARS,
				STORAGE_KEYS.FILTER_KEYWORDS,
			]),
		[],
	);

	const refresh = useCallback(async () => {
		const [nextSettings, nextStats, nextHistory, nextSubscriptions] =
			await Promise.all([
				getRecommendationFilterSettings(),
				getRecommendationFilterStats(),
				getRecommendationFilterHistory(),
				getStoredSubscriptions(),
			]);

		setSettings(nextSettings);
		setStats(nextStats);
		setHistory(nextHistory);
		setSubscriptions(nextSubscriptions);
	}, []);

	useEffect(() => {
		void refresh();

		const listener = (
			changes: Record<string, chrome.storage.StorageChange>,
			areaName: string,
		) => {
			if (areaName !== "local") {
				return;
			}

			if (
				Object.keys(changes).some((key) => recommendationSettingKeys.has(key))
			) {
				void getRecommendationFilterSettings().then(setSettings);
			}

			if (changes[STORAGE_KEYS.FILTER_STATS]) {
				void getRecommendationFilterStats().then(setStats);
			}

			if (changes[STORAGE_KEYS.FILTERED_VIDEOS]) {
				void getRecommendationFilterHistory().then(setHistory);
			}

			if (changes[STORAGE_KEYS.YOUTUBE_SUBSCRIPTIONS]) {
				void getStoredSubscriptions().then(setSubscriptions);
			}
		};

		chrome.storage.onChanged.addListener(listener);
		return () => chrome.storage.onChanged.removeListener(listener);
	}, [recommendationSettingKeys, refresh]);

	const handleSettingChange = async <K extends keyof FeedFilterSettings>(
		key: K,
		value: FeedFilterSettings[K],
	) => {
		setSettings((previous) => ({ ...previous, [key]: value }));
		try {
			await setRecommendationFilterSetting(key, value);
		} catch (error) {
			console.error(
				`Failed to save recommendation filter setting ${key}`,
				error,
			);
			toast({
				title: "Couldn't save recommendation setting",
				description:
					error instanceof Error ? error.message : "The setting was not saved.",
				variant: "destructive",
			});
		}
	};

	const addKeyword = async () => {
		const keyword = newKeyword.trim().toLowerCase();
		if (!keyword) {
			return;
		}

		if (settings.keywords.includes(keyword)) {
			setNewKeyword("");
			return;
		}

		await handleSettingChange("keywords", [...settings.keywords, keyword]);
		setNewKeyword("");
	};

	const removeKeyword = async (keyword: string) => {
		await handleSettingChange(
			"keywords",
			settings.keywords.filter((value) => value !== keyword),
		);
	};

	const handleExtractSubscriptions = async () => {
		setIsExtracting(true);
		try {
			const result = await extractSubscriptionsFromCurrentTab();
			await refresh();
			toast({
				title: "Subscriptions imported",
				description: `Saved ${result.count} channels from the active tab.`,
			});
		} catch (error) {
			toast({
				title: "Couldn't import subscriptions",
				description:
					error instanceof Error
						? error.message
						: "Failed to import subscriptions.",
				variant: "destructive",
			});
		} finally {
			setIsExtracting(false);
		}
	};

	const handleClearHistory = async () => {
		await clearRecommendationFilterHistory();
		setHistory([]);
		toast({
			title: "History cleared",
			description: "Recent hidden recommendation history has been reset.",
		});
	};

	return (
		<Card className="rounded-xl hover:border-primary/10 transition-all duration-500">
			<CardHeader className="p-4 pb-1">
				<div className="flex items-center gap-2 text-primary mb-0.5">
					<ListFilter className="h-4 w-4" />
					<span className="text-xs font-bold uppercase tracking-widest">
						Recommendation Filters
					</span>
				</div>
			</CardHeader>
			<CardContent className="p-4 pt-1 space-y-4">
				<div className="grid grid-cols-1 md:grid-cols-2 gap-2">
					{TOGGLE_ITEMS.map((item) => {
						const Icon = item.icon;
						return (
							<div
								key={item.key}
								className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-muted/30 p-3"
							>
								<div className="flex items-start gap-3">
									<div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/20 text-primary">
										<Icon className="h-4 w-4" />
									</div>
									<div className="space-y-0.5">
										<div className="text-sm font-semibold">{item.title}</div>
										<div className="text-xs text-muted-foreground">
											{item.description}
										</div>
									</div>
								</div>
								<Switch
									checked={settings[item.key]}
									onCheckedChange={(checked) =>
										void handleSettingChange(item.key, checked)
									}
									className="data-[state=checked]:bg-primary scale-75"
								/>
							</div>
						);
					})}
				</div>

				<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
					{NUMERIC_FIELDS.map((field) => (
						<div key={field.key} className="space-y-1">
							<label
								htmlFor={`recommendation-filter-${field.key}`}
								className="text-sm font-semibold"
							>
								{field.label}
							</label>
							<div className="flex items-center gap-2">
								<Input
									id={`recommendation-filter-${field.key}`}
									type="number"
									min={0}
									value={settings[field.key]}
									onChange={(event) =>
										void handleSettingChange(
											field.key,
											Math.max(0, Number(event.target.value) || 0),
										)
									}
									className="h-10 rounded-xl"
								/>
								<span className="text-xs text-muted-foreground">
									{field.hint}
								</span>
							</div>
						</div>
					))}
				</div>

				<div className="space-y-2">
					<div className="flex items-center justify-between">
						<div>
							<div className="text-sm font-semibold">Blocked keywords</div>
							<div className="text-xs text-muted-foreground">
								Titles containing one of these words will be hidden.
							</div>
						</div>
					</div>
					<div className="flex gap-2">
						<Input
							value={newKeyword}
							onChange={(event) => setNewKeyword(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									void addKeyword();
								}
							}}
							className="h-10 rounded-xl"
							placeholder="Add keyword"
						/>
						<Button type="button" onClick={() => void addKeyword()}>
							Add
						</Button>
					</div>
					<div className="flex flex-wrap gap-2">
						{settings.keywords.map((keyword) => (
							<button
								key={keyword}
								type="button"
								onClick={() => void removeKeyword(keyword)}
								className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
							>
								{keyword} ×
							</button>
						))}
					</div>
				</div>

				<div className="space-y-2">
					<div className="text-sm font-semibold">Current filter stats</div>
					<div className="grid grid-cols-2 md:grid-cols-6 gap-2">
						{STAT_ITEMS.map((item) => (
							<div
								key={item.key}
								className="rounded-2xl border border-border/60 bg-muted/30 px-3 py-2"
							>
								<div className="text-lg font-semibold leading-none">
									{stats[item.key]}
								</div>
								<div className="mt-1 text-[11px] text-muted-foreground">
									{item.label}
								</div>
							</div>
						))}
					</div>
				</div>

				<div className="space-y-2 rounded-2xl border border-border/60 bg-muted/30 p-3">
					<div className="flex items-start justify-between gap-4">
						<div className="space-y-1">
							<div className="flex items-center gap-2 text-sm font-semibold">
								<Users className="h-4 w-4 text-primary" />
								Subscribed channels
							</div>
							<div className="text-xs text-muted-foreground">
								Import your YouTube subscriptions so recommendation filters can
								leave those channels visible.
							</div>
							<div className="text-xs text-muted-foreground">
								{subscriptions?.count || 0} channels saved
								{subscriptions?.extracted
									? ` • Updated ${new Date(subscriptions.extracted).toLocaleString()}`
									: ""}
							</div>
						</div>
						<div className="flex flex-wrap gap-2">
							<Button
								type="button"
								variant="outline"
								onClick={() => void openSubscriptionsPage()}
								className="rounded-xl"
							>
								<ExternalLink className="mr-2 h-4 w-4" />
								Open page
							</Button>
							<Button
								type="button"
								onClick={() => void handleExtractSubscriptions()}
								disabled={isExtracting}
								className="rounded-xl"
							>
								<RefreshCw
									className={`mr-2 h-4 w-4 ${isExtracting ? "animate-spin" : ""}`}
								/>
								{isExtracting ? "Importing..." : "Import active tab"}
							</Button>
						</div>
					</div>
					{subscriptions?.channels?.length ? (
						<div className="flex flex-wrap gap-2">
							{subscriptions.channels.slice(0, 8).map((channel, index) => (
								<div
									key={
										channel.channelId ||
										channel.channelPath ||
										`${channel.name}-${index}`
									}
									className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground"
								>
									{channel.name || channel.handle || channel.channelPath}
								</div>
							))}
						</div>
					) : null}
				</div>

				<div className="space-y-2">
					<div className="flex items-center justify-between gap-3">
						<div>
							<div className="text-sm font-semibold">
								Recent hidden recommendations
							</div>
							<div className="text-xs text-muted-foreground">
								Latest matches from the current browser session storage.
							</div>
						</div>
						<Button
							type="button"
							variant="ghost"
							onClick={() => void handleClearHistory()}
							className="rounded-xl text-xs"
						>
							Clear
						</Button>
					</div>
					<div className="space-y-2">
						{history.length ? (
							history
								.slice(-6)
								.reverse()
								.map((entry) => (
									<div
										key={`${entry.timestamp}-${entry.title}`}
										className="rounded-2xl border border-border/60 bg-muted/30 px-3 py-2"
									>
										<div className="text-sm font-medium">{entry.title}</div>
										<div className="mt-1 text-xs text-muted-foreground">
											{entry.reason}
										</div>
									</div>
								))
						) : (
							<div className="rounded-2xl border border-dashed border-border/70 px-3 py-4 text-sm text-muted-foreground">
								No recommendation matches recorded yet.
							</div>
						)}
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
