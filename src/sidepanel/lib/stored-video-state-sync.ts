export type StorageChangeListener = (
	changes: Record<string, unknown>,
	areaName: string,
) => void;

interface StoredVideoStateSyncOptions<State> {
	relevantKeys: Set<string>;
	loadState: () => Promise<State | null>;
	updateState: (state: State) => void;
	addStorageListener: (listener: StorageChangeListener) => void;
	removeStorageListener: (listener: StorageChangeListener) => void;
	onError?: (error: unknown) => void;
}

export function subscribeToStoredVideoState<State>({
	relevantKeys,
	loadState,
	updateState,
	addStorageListener,
	removeStorageListener,
	onError,
}: StoredVideoStateSyncOptions<State>): () => void {
	let active = true;

	const syncStoredState = async () => {
		try {
			const cachedState = await loadState();
			if (!active || !cachedState) return;
			updateState(cachedState);
		} catch (error) {
			if (active) onError?.(error);
		}
	};

	const handleStorageChange: StorageChangeListener = (changes, areaName) => {
		if (areaName !== "local") return;
		if (!Object.keys(changes).some((key) => relevantKeys.has(key))) return;
		void syncStoredState();
	};

	addStorageListener(handleStorageChange);
	void syncStoredState();

	return () => {
		active = false;
		removeStorageListener(handleStorageChange);
	};
}
