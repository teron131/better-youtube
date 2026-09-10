/** Preview-only extension APIs; settings and model catalogs persist in localStorage across reloads. */

if (typeof chrome === "undefined" || !chrome.runtime) {
  const storageKey = "better-youtube-preview-storage";
  const storageListeners = new Set();
  const readStorage = () => JSON.parse(localStorage.getItem(storageKey) || "{}");
  const selectKeys = (items, keys) => {
    if (keys == null) return { ...items };
    const names =
      typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
    const result = Array.isArray(keys) || typeof keys === "string" ? {} : { ...keys };
    for (const key of names) if (key in items) result[key] = items[key];
    return result;
  };
  const respond = (callback, operation) => {
    let result;
    try {
      result = operation();
    } catch (error) {
      chrome.runtime.lastError = { message: String(error) };
    }
    try {
      callback?.(result);
    } finally {
      chrome.runtime.lastError = null;
    }
  };
  const notify = (changes) => {
    if (Object.keys(changes).length)
      storageListeners.forEach((listener) => listener(changes, "local"));
  };
  window.chrome = {
    runtime: {
      lastError: null,
      sendMessage: (msg, cb) => {
        console.log("Mock sendMessage:", msg);
        if (cb)
          cb({
            success: false,
            error: "Extension environment not detected",
          });
      },
      onMessage: {
        addListener: () => console.log("Mock runtime.onMessage.addListener"),
        removeListener: () => console.log("Mock runtime.onMessage.removeListener"),
      },
    },
    storage: {
      local: {
        get: (keys, cb) => {
          respond(
            (value) => cb(value ?? {}),
            () => selectKeys(readStorage(), keys),
          );
        },
        set: (items, cb) => {
          let changes = {};
          respond(cb, () => {
            const previous = readStorage();
            localStorage.setItem(storageKey, JSON.stringify({ ...previous, ...items }));
            changes = Object.fromEntries(
              Object.entries(items)
                .filter(([key, value]) => JSON.stringify(previous[key]) !== JSON.stringify(value))
                .map(([key, newValue]) => [key, { oldValue: previous[key], newValue }]),
            );
          });
          notify(changes);
        },
        remove: (keys, cb) => {
          let changes = {};
          respond(cb, () => {
            const previous = readStorage();
            const next = { ...previous };
            const names = typeof keys === "string" ? [keys] : keys;
            for (const key of names) delete next[key];
            localStorage.setItem(storageKey, JSON.stringify(next));
            changes = Object.fromEntries(
              names
                .filter((key) => key in previous)
                .map((key) => [key, { oldValue: previous[key] }]),
            );
          });
          notify(changes);
        },
        getBytesInUse: (keys, cb) =>
          respond(
            cb,
            () => new TextEncoder().encode(JSON.stringify(selectKeys(readStorage(), keys))).length,
          ),
      },
      onChanged: {
        addListener: (listener) => storageListeners.add(listener),
        removeListener: (listener) => storageListeners.delete(listener),
      },
    },
    tabs: {
      query: (queryInfo, cb) => {
        console.log("Mock tabs.query:", queryInfo);
        cb([]);
      },
      sendMessage: (tabId, msg, cb) => {
        console.log("Mock tabs.sendMessage:", tabId, msg);
        if (cb) cb();
      },
      onUpdated: {
        addListener: () => console.log("Mock tabs.onUpdated.addListener"),
        removeListener: () => console.log("Mock tabs.onUpdated.removeListener"),
      },
      onActivated: {
        addListener: () => console.log("Mock tabs.onActivated.addListener"),
        removeListener: () => console.log("Mock tabs.onActivated.removeListener"),
      },
    },
  };
}
