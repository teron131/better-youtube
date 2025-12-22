// Mock chrome extension APIs for browser preview
if (typeof chrome === "undefined" || !chrome.runtime) {
  window.chrome = {
    runtime: {
      lastError: null,
      sendMessage: (msg, cb) => {
        console.log("Mock sendMessage:", msg);
        if (cb) cb({ success: false, error: "Extension environment not detected" });
      },
      onMessage: {
        addListener: () => console.log("Mock runtime.onMessage.addListener"),
        removeListener: () => console.log("Mock runtime.onMessage.removeListener"),
      },
    },
    storage: {
      local: {
        get: (keys, cb) => {
          console.log("Mock storage.get:", keys);
          cb({});
        },
        set: (items, cb) => {
          console.log("Mock storage.set:", items);
          if (cb) cb();
        },
        remove: (keys, cb) => {
          console.log("Mock storage.remove:", keys);
          if (cb) cb();
        },
        getBytesInUse: (keys, cb) => cb(0),
      },
      onChanged: {
        addListener: () => console.log("Mock storage.onChanged.addListener"),
        removeListener: () => console.log("Mock storage.onChanged.removeListener"),
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
