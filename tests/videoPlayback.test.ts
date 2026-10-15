/** Verifies real event subscription, source-checked seeking, and teardown across tab/video changes. */
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { setupVideoPlayback } from "../src/content/videoPlayback.ts";
import { VIDEO_HISTORY_CHANGE_EVENT, type VideoPlaybackState } from "../src/core/videoPlayback.ts";
import {
  connectVideoPlayback,
  type VideoPlaybackConnection,
} from "../src/sidepanel/lib/video-playback.ts";

const videoId = "abcdefghijk";
const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;

class Listeners {
  callbacks = new Set<(...args: any[]) => void>();
  addListener = (callback: (...args: any[]) => void) => this.callbacks.add(callback);
  removeListener = (callback: (...args: any[]) => void) => this.callbacks.delete(callback);
  emit(...args: any[]) {
    for (const callback of this.callbacks) callback(...args);
  }
}

class TrackedTarget extends EventTarget {
  listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ) {
    const callbacks = this.listeners.get(type) ?? new Set();
    callbacks.add(callback);
    this.listeners.set(type, callbacks);
    super.addEventListener(type, callback, options);
  }
  removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ) {
    this.listeners.get(type)?.delete(callback);
    super.removeEventListener(type, callback, options);
  }
  get listenerCount() {
    return [...this.listeners.values()].reduce((total, callbacks) => total + callbacks.size, 0);
  }
}

class TestVideo extends TrackedTarget {
  currentTime = 5;
  duration = 120;
  paused = true;
  playCalls = 0;
  play() {
    this.playCalls += 1;
  }
}

function portPair(name: string) {
  const panel = {
    name,
    onMessage: new Listeners(),
    onDisconnect: new Listeners(),
    sent: [] as any[],
    closed: false,
    postMessage: (() => {}) as (message: unknown) => void,
    disconnect: () => {},
  };
  const content = {
    ...panel,
    onMessage: new Listeners(),
    onDisconnect: new Listeners(),
    sent: [] as any[],
  };
  const disconnect = () => {
    if (panel.closed) return;
    panel.closed = content.closed = true;
    panel.onDisconnect.emit();
    content.onDisconnect.emit();
  };
  panel.disconnect = content.disconnect = disconnect;
  panel.postMessage = (message) => {
    if (panel.closed) throw new Error("Disconnected");
    panel.sent.push(message);
    content.onMessage.emit(message);
  };
  content.postMessage = (message) => {
    if (content.closed) throw new Error("Disconnected");
    content.sent.push(message);
    panel.onMessage.emit(message);
  };
  return { panel, content };
}

let activeTab: { id: number; url: string } | null;
let video: TestVideo | null;
let page: TrackedTarget & { querySelector: () => TestVideo | null };
let view: TrackedTarget & { location: { href: string } };
let pairs: ReturnType<typeof portPair>[];
let connections: VideoPlaybackConnection[];
let runtime: any;
let tabs: any;
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

beforeEach(() => {
  activeTab = { id: 7, url: watchUrl };
  video = new TestVideo();
  page = Object.assign(new TrackedTarget(), { querySelector: () => video });
  view = Object.assign(new TrackedTarget(), { location: { href: watchUrl } });
  pairs = [];
  connections = [];
  runtime = { onConnect: new Listeners() };
  tabs = {
    onActivated: new Listeners(),
    onUpdated: new Listeners(),
    onRemoved: new Listeners(),
    query: (_query: unknown, callback: (tabs: unknown[]) => void) =>
      callback(activeTab ? [activeTab] : []),
    connect: (_tabId: number, { name }: { name: string }) => {
      const pair = portPair(name);
      pairs.push(pair);
      runtime.onConnect.emit(pair.content);
      return pair.panel;
    },
  };
  Object.assign(globalThis, { chrome: { runtime, tabs }, document: page, window: view });
  setupVideoPlayback();
});

afterEach(() => {
  for (const connection of connections) connection.disconnect();
});

function open(states: VideoPlaybackState[] = []) {
  const connection = connectVideoPlayback(videoId, (state) => states.push(state));
  connections.push(connection);
  return connection;
}

test("connected panels receive native timing events and seeking keeps a paused video paused", async () => {
  const states: VideoPlaybackState[] = [];
  const connection = open(states);
  await tick();
  assert.deepEqual(states.at(-1), { currentTimeMs: 5000, isAvailable: true });
  video!.currentTime = 12;
  video!.dispatchEvent(new Event("timeupdate"));
  assert.equal(states.at(-1)?.currentTimeMs, 12000);
  await connection.seekTo(23500);
  assert.equal(video!.currentTime, 23.5);
  assert.equal(video!.paused, true);
  assert.equal(video!.playCalls, 0);
  connection.disconnect();
  assert.equal(video!.listenerCount, 0);
  assert.equal(page.listenerCount, 0);
  assert.equal(view.listenerCount, 0);
  assert.equal(
    tabs.onActivated.callbacks.size + tabs.onUpdated.callbacks.size + tabs.onRemoved.callbacks.size,
    0,
  );
  assert.deepEqual(states.at(-1), { currentTimeMs: null, isAvailable: false });
});

test("canonical video identity allows same-video URL churn without reconnecting", async () => {
  const states: VideoPlaybackState[] = [];
  const connection = open(states);
  await tick();
  activeTab!.url = `${watchUrl}&list=playlist&index=2&t=15`;
  view.location.href = activeTab!.url;
  tabs.onUpdated.emit(7, { url: activeTab!.url }, activeTab);
  view.dispatchEvent(new Event(VIDEO_HISTORY_CHANGE_EVENT));
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].panel.closed, false);
  await connection.seekTo(15000);
  assert.equal(video!.currentTime, 15);
});

test("unrelated or lookalike active tabs cannot create playback connections", async () => {
  for (const url of [
    "https://example.com",
    "https://www.youtube.com.evil.test/watch?v=abcdefghijk",
    "https://www.youtube.com/watch?v=otherVideo1",
    "https://www.youtube.com/",
  ]) {
    activeTab = { id: 7, url };
    const connection = open();
    await tick();
    await assert.rejects(connection.seekTo(1000), /unavailable/);
    connection.disconnect();
  }
  assert.equal(pairs.length, 0);
});

test("seek rechecks the active tab even before an activation event arrives", async () => {
  const connection = open();
  await tick();
  activeTab = { id: 8, url: watchUrl };
  await assert.rejects(connection.seekTo(1000), /active video changed/);
  assert.equal(video!.currentTime, 5);
  assert.equal(pairs[0].panel.sent.filter((message) => message.type === "seek").length, 0);
  assert.equal(pairs[0].panel.closed, true);
});

test("content rechecks the watch ID at seek time and removes stale video listeners", async () => {
  const states: VideoPlaybackState[] = [];
  const connection = open(states);
  await tick();
  view.location.href = "https://www.youtube.com/watch?v=otherVideo1";
  await assert.rejects(connection.seekTo(1000), /closed|changed/);
  assert.equal(video!.currentTime, 5);
  assert.equal(video!.listenerCount, 0);
  assert.equal(pairs[0].panel.closed, true);
  assert.equal(states.at(-1)?.isAvailable, false);
});

test("video replacement transfers listeners and panel teardown stops every timing update", async () => {
  const states: VideoPlaybackState[] = [];
  const connection = open(states);
  await tick();
  const previous = video!;
  video = new TestVideo();
  video.currentTime = 35;
  page.dispatchEvent(new Event("loadedmetadata"));
  assert.equal(previous.listenerCount, 0);
  assert.equal(states.at(-1)?.currentTimeMs, 35000);
  connection.disconnect();
  const count = states.length;
  video.dispatchEvent(new Event("timeupdate"));
  assert.equal(states.length, count);
  assert.equal(video.listenerCount, 0);
});

test("switching to another tab with the same video reconnects to that active tab", async () => {
  open();
  await tick();
  activeTab = { id: 8, url: `${watchUrl}&t=2` };
  tabs.onActivated.emit({ tabId: 8 });
  await tick();
  assert.equal(pairs.length, 2);
  assert.equal(pairs[0].panel.closed, true);
  assert.equal(pairs[1].panel.closed, false);
  activeTab = { id: 9, url: "https://example.com" };
  tabs.onActivated.emit({ tabId: 9 });
  await tick();
  assert.equal(pairs[1].panel.closed, true);
  assert.equal(video!.listenerCount, 0);
});

test("closing a panel before active-tab lookup finishes prevents a late connection", async () => {
  let reply!: (tabs: unknown[]) => void;
  tabs.query = (_query: unknown, callback: (tabs: unknown[]) => void) => {
    reply = callback;
  };
  const connection = open();
  connection.disconnect();
  reply([activeTab]);
  await tick();
  assert.equal(pairs.length, 0);
});
