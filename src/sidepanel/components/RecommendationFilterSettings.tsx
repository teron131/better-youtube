import { Button } from "@ui/components/ui/button";
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
		title: "Low Views",
		description: "",
	},
	{
		key: "durationFilterEnabled",
		icon: Clock3,
		title: "Duration Range",
		description: "",
	},
	{
		key: "keywordFilterEnabled",
		icon: ListFilter,
		title: "Keyword Match",
		description: "Suppress recommendations with blocked words in the title.",
	},
	{
		key: "ageFilterEnabled",
		icon: History,
		title: "Older Videos",
		description: "",
	},
	{
		key: "englishOnlyTitles",
		icon: Languages,
		title: "English Videos Only",
		description: "Remove videos whose titles are not English.",
	},
	{
		key: "preserveSubscribedChannels",
		icon: ShieldCheck,
		title: "Keep Subscriptions",
		description: "Subscriptions are immune to filters.",
	},
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
			if (areaName === "session" && changes[STORAGE_KEYS.FILTERED_VIDEOS]) {
				void getRecommendationFilterHistory().then(setHistory);
			}

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
				description: `Saved ${result.count} channels from your subscriptions page.`,
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

	const renderMergedSettingSentence = (key: ToggleConfig["key"]) => {
		switch (key) {
			case "viewsFilterEnabled":
				return (
					<label
						htmlFor="recommendation-filter-minViews"
						className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm font-medium leading-6 text-foreground/95"
					>
						<span>Hide videos under</span>
						<Input
							id="recommendation-filter-minViews"
							type="number"
							min={0}
							inputMode="numeric"
							value={settings.minViews}
							onChange={(event) =>
								void handleSettingChange(
									"minViews",
									Math.max(0, Number(event.target.value) || 0),
								)
							}
							className="h-9 w-28 rounded-md border-border/70 bg-background px-3 text-sm font-semibold"
						/>
						<span>views.</span>
					</label>
				);
			case "durationFilterEnabled":
				return (
					<div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm font-medium leading-6 text-foreground/95">
						<span>Keep videos between</span>
						<Input
							id="recommendation-filter-minDuration"
							type="number"
							min={0}
							inputMode="numeric"
							value={settings.minDuration}
							onChange={(event) =>
								void handleSettingChange(
									"minDuration",
									Math.max(0, Number(event.target.value) || 0),
								)
							}
							className="input-no-spinner h-9 w-24 rounded-md border-border/70 bg-background px-3 text-sm font-semibold"
						/>
						<span>and</span>
						<Input
							id="recommendation-filter-maxDuration"
							type="number"
							min={0}
							inputMode="numeric"
							value={settings.maxDuration}
							onChange={(event) =>
								void handleSettingChange(
									"maxDuration",
									Math.max(0, Number(event.target.value) || 0),
								)
							}
							className="h-9 w-24 rounded-md border-border/70 bg-background px-3 text-sm font-semibold"
						/>
						<span>seconds.</span>
					</div>
				);
			case "ageFilterEnabled":
				return (
					<label
						htmlFor="recommendation-filter-maxAgeYears"
						className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm font-medium leading-6 text-foreground/95"
					>
						<span>Hide videos older than</span>
						<Input
							id="recommendation-filter-maxAgeYears"
							type="text"
							inputMode="numeric"
							pattern="[0-9]*"
							value={String(settings.maxAgeYears)}
							onChange={(event) =>
								void handleSettingChange(
									"maxAgeYears",
									(() => {
										const digitsOnly = event.target.value.replace(/\D/g, "");
										if (!digitsOnly) {
											return 0;
										}

										return Math.min(999, Number(digitsOnly));
									})(),
								)
							}
							className="h-9 w-24 rounded-md border-border/70 bg-background px-3 text-sm font-semibold"
						/>
						<span>years.</span>
					</label>
				);
			default:
				return null;
		}
	};

	return (
		<section className="space-y-8 border-t border-border/70 pt-5">
			<div className="flex items-center gap-2 text-base font-semibold uppercase tracking-[0.04em]">
				<ListFilter className="h-4 w-4 text-primary" />
				<span>Recommendation Filters</span>
			</div>

			<div className="grid grid-cols-1 gap-x-8 gap-y-3 md:grid-cols-2 md:gap-y-5">
				{TOGGLE_ITEMS.map((item) => {
					const Icon = item.icon;
					return (
						<div
							key={item.key}
							className="flex min-h-[92px] items-start justify-between gap-4 py-2.5"
						>
							<div className="min-w-0 space-y-2">
								<div className="flex items-center gap-2">
									<Icon className="h-4 w-4 shrink-0 text-primary" />
									<div className="text-sm font-semibold leading-none">
										{item.title}
									</div>
								</div>
								<div className="pl-6">
									<div className="text-sm font-medium leading-6 text-foreground/95">
										{renderMergedSettingSentence(item.key)}
									</div>
									{item.description ? (
										<div className="mt-2 text-sm font-medium leading-6 text-foreground/95">
											{item.description}
										</div>
									) : null}
								</div>
							</div>
							<Switch
								checked={settings[item.key]}
								onCheckedChange={(checked) =>
									void handleSettingChange(item.key, checked)
								}
								className="mt-0.5 scale-75 data-[state=checked]:bg-primary"
							/>
						</div>
					);
				})}
			</div>

			<div className="space-y-3 pt-4">
				<div>
					<div className="text-sm font-semibold">Blocked Keywords</div>
					<div className="mt-1 text-[13px] leading-5 text-muted-foreground">
						Titles containing one of these words will be hidden.
					</div>
				</div>
				<div className="flex flex-col gap-2 sm:flex-row">
					<Input
						value={newKeyword}
						onChange={(event) => setNewKeyword(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								event.preventDefault();
								void addKeyword();
							}
						}}
						className="h-11 rounded-md border-border/70 bg-background"
						placeholder="Add keyword"
					/>
					<Button
						type="button"
						onClick={() => void addKeyword()}
						className="h-11 min-w-[7.5rem] rounded-md px-4 text-sm"
					>
						Add
					</Button>
				</div>
				<div className="flex flex-wrap gap-2">
					{settings.keywords.map((keyword) => (
						<button
							key={keyword}
							type="button"
							onClick={() => void removeKeyword(keyword)}
							className="rounded-md border border-border/70 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
						>
							{keyword} ×
						</button>
					))}
				</div>
			</div>

			<div className="space-y-3 pt-4">
				<div className="text-sm font-semibold">Total Videos Skipped</div>
				<div className="grid grid-cols-3 gap-x-4 gap-y-5 md:grid-cols-6">
					{STAT_ITEMS.map((item) => (
						<div key={item.key} className="space-y-1">
							<div className="text-[1.75rem] font-semibold leading-none tracking-tight">
								{stats[item.key]}
							</div>
							<div className="text-xs font-medium text-muted-foreground">
								{item.label}
							</div>
						</div>
					))}
				</div>
			</div>

			<div className="space-y-4 pt-4">
				<div className="flex items-start justify-between gap-4">
					<div className="min-w-0 flex-1 space-y-1.5">
						<div className="flex items-center gap-2 text-sm font-semibold">
							<Users className="h-4 w-4 text-primary" />
							Subscribed Channels
						</div>
						<div className="text-[13px] leading-5 text-muted-foreground">
							Import your YouTube subscriptions to make the videos immune to the
							filters.
						</div>
						<div className="text-xs font-medium text-muted-foreground">
							{subscriptions?.count || 0} channels saved
							{subscriptions?.extracted
								? ` • Updated ${new Date(subscriptions.extracted).toLocaleString()}`
								: ""}
						</div>
					</div>
					<Button
						type="button"
						onClick={() => void handleExtractSubscriptions()}
						disabled={isExtracting}
						className="h-10 min-w-[6.75rem] shrink-0 rounded-md px-4 text-sm"
					>
						{isExtracting ? (
							<RefreshCw className="mr-2 h-4 w-4 animate-spin" />
						) : (
							<ExternalLink className="mr-2 h-4 w-4" />
						)}
						{isExtracting ? "Importing..." : "Import"}
					</Button>
				</div>
				{subscriptions?.channels?.length ? (
					<div className="flex flex-wrap gap-2 border-t border-border/60 pt-4">
						{subscriptions.channels.slice(0, 8).map((channel, index) => (
							<div
								key={
									channel.channelId ||
									channel.channelPath ||
									`${channel.name}-${index}`
								}
								className="rounded-md border border-border/70 px-2.5 py-1 text-xs text-muted-foreground"
							>
								{channel.name || channel.handle || channel.channelPath}
							</div>
						))}
					</div>
				) : null}
			</div>

			<div className="space-y-3 pt-4">
				<div className="flex items-start justify-between gap-3">
					<div>
						<div className="text-sm font-semibold">
							Recent Hidden Recommendations
						</div>
						<div className="mt-1 text-[13px] leading-5 text-muted-foreground">
							Latest matches from this browser session only.
						</div>
					</div>
					<Button
						type="button"
						variant="ghost"
						onClick={() => void handleClearHistory()}
						className="h-8 rounded-md px-2 text-xs"
					>
						Clear
					</Button>
				</div>
				{history.length ? (
					<div className="border-t border-border/60">
						{history
							.slice(-6)
							.reverse()
							.map((entry) => (
								<div
									key={`${entry.timestamp}-${entry.title}`}
									className="border-b border-border/60 py-3"
								>
									<div className="text-sm font-medium leading-6">
										{entry.title}
									</div>
									<div className="text-xs text-muted-foreground">
										{entry.reason}
									</div>
								</div>
							))}
					</div>
				) : (
					<div className="pt-3 text-sm text-muted-foreground">
						No recommendation matches recorded yet.
					</div>
				)}
			</div>
		</section>
	);
}
