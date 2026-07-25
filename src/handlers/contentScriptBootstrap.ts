import { MESSAGE_ACTIONS } from "@/core/constants";

const YOUTUBE_URL_PATTERNS = ["https://*.youtube.com/*"];
const CONTENT_SCRIPT_FILES = ["content.js"];
const CONTENT_STYLE_FILES = ["assets/subtitles.css"];

let bootstrapRegistered = false;

function isYoutubeUrl(url?: string): boolean {
  return typeof url === "string" && /^https:\/\/([^.]+\.)?youtube\.com\//.test(url);
}

function pingContentScript(tabId: number): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { action: MESSAGE_ACTIONS.GET_VIDEO_TITLE }, () => {
      resolve(!chrome.runtime.lastError);
    });
  });
}

async function injectContentScript(tabId: number): Promise<void> {
  await chrome.scripting.insertCSS({
    target: { tabId },
    files: CONTENT_STYLE_FILES,
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    files: CONTENT_SCRIPT_FILES,
  });
}

async function ensureContentScriptForTab(tab: chrome.tabs.Tab): Promise<void> {
  if (!tab.id || !isYoutubeUrl(tab.url)) {
    return;
  }

  if (await pingContentScript(tab.id)) {
    return;
  }

  try {
    await injectContentScript(tab.id);
    console.log("[handlers] injected content script into existing tab", {
      tabId: tab.id,
      url: tab.url,
    });
  } catch (error) {
    console.warn("[handlers] failed to inject content script", {
      tabId: tab.id,
      url: tab.url,
      error,
    });
  }
}

async function ensureContentScriptsForOpenYoutubeTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({ url: YOUTUBE_URL_PATTERNS });
  await Promise.allSettled(tabs.map((tab) => ensureContentScriptForTab(tab)));
}

export function registerContentScriptBootstrap(): void {
  if (bootstrapRegistered) {
    return;
  }
  bootstrapRegistered = true;

  const bootstrapOpenTabs = () => {
    void ensureContentScriptsForOpenYoutubeTabs().catch((error) => {
      console.warn("[handlers] failed to bootstrap YouTube content scripts", error);
    });
  };

  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason !== "install" && details.reason !== "update") {
      return;
    }

    bootstrapOpenTabs();
  });
}
