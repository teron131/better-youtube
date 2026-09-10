/** Owns the video conversation and bottom composer; successful summary edits are committed by the background agent. */

import { ArrowUp, FileText, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import {
  CHAT_ACTION,
  CHAT_CONTEXT_MESSAGES,
  CHAT_PROMPT_LIMIT,
  type ChatMessage,
  type ChatResponse,
} from "@/core/agent/conversation";
import { MESSAGE_ACTIONS, TIMING } from "@/core/constants";
import { createRequestId } from "@/core/requestId";
import { sendChromeMessage } from "@/core/utils/chrome";

import { useModelSelection, useUserPreferences } from "../hooks/use-config";
import { toModelComboboxOption } from "../lib/model-options";
import { Markdown } from "./Markdown";
import { ModelIcon } from "./ModelIcon";
import { Button } from "./ui/button";
import { EditableCombobox } from "./ui/editable-combobox";

interface VideoChatProps {
  videoId: string;
  transcript: string;
  disabled?: boolean;
  videoReady: boolean;
  contextLoading: boolean;
  onBusyChange: (busy: boolean) => void;
  preview?: boolean;
  hasSummary: boolean;
  onSummary: (model: string, language: string) => Promise<void>;
  onCaptions: () => Promise<void>;
  children: ReactNode;
}

function loadMessages(key: string): ChatMessage[] {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || "[]");
    return Array.isArray(value)
      ? value.filter(
          (item) =>
            item &&
            (item.role === "user" || item.role === "assistant") &&
            typeof item.content === "string",
        )
      : [];
  } catch {
    return [];
  }
}

/** Keeps the composer visible while video content and conversation share a single scroll area. */
export function VideoChat({
  videoId,
  transcript,
  disabled,
  videoReady,
  contextLoading,
  onBusyChange,
  preview,
  hasSummary,
  onSummary,
  onCaptions,
  children,
}: VideoChatProps) {
  const storageKey = `video-chat:${videoId}`;
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadMessages(storageKey));
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { preferences, updatePreferences } = useUserPreferences({ loadDynamicModels: false });
  const { summarizerModels } = useModelSelection();
  const modelOptions = summarizerModels.map((model) => ({
    ...toModelComboboxOption(model),
    label: model.label.replace(/^[^/:]+[/:]\s*/, ""),
  }));
  if (!modelOptions.some((option) => option.value === preferences.summaryModel)) {
    const value = preferences.summaryModel;
    modelOptions.unshift({
      value,
      label: value.slice(value.indexOf("/") + 1),
      icon: <ModelIcon provider={value.includes("/") ? value.split("/")[0] : undefined} />,
    });
  }
  const selectedModelIcon = modelOptions.find(
    (option) => option.value === preferences.summaryModel,
  )?.icon;
  const active = useRef(true);
  const busy = useRef(false);
  const requestRef = useRef<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const canChat = Boolean(videoReady && videoId && transcript.trim()) || preview;
  const canSummarize = Boolean(videoReady && videoId) || Boolean(preview && hasSummary);
  const working = Boolean(disabled || pending || actionPending);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      onBusyChange(false);
      if (requestRef.current) {
        void sendChromeMessage({
          action: MESSAGE_ACTIONS.CANCEL_VIDEO_REQUEST,
          kind: "chat",
          videoId,
          requestId: requestRef.current,
        }).catch(() => {});
      }
    };
  }, [onBusyChange, videoId]);
  useEffect(() => {
    if (messages.length || pending) bottom.current?.scrollIntoView({ block: "nearest" });
  }, [messages, pending]);
  useEffect(() => {
    if (!textarea.current) return;
    textarea.current.style.height = "auto";
    textarea.current.style.height = `${Math.min(textarea.current.scrollHeight, 160)}px`;
  }, [draft]);

  async function send(prompt: string) {
    if (!prompt.trim() || disabled || contextLoading || busy.current) return;
    if (!canChat) return;
    if (preview) {
      setError("This is a preview. Open the extension on a YouTube video to chat.");
      return;
    }
    busy.current = true;
    onBusyChange(true);
    requestRef.current = createRequestId("chat");
    setPending(true);
    setError(null);
    setDraft("");
    const previous = messages;
    setMessages([...previous, { role: "user", content: prompt }]);
    try {
      const response = await sendChromeMessage<ChatResponse>(
        {
          action: CHAT_ACTION,
          videoId,
          requestId: requestRef.current,
          transcript,
          model: preferences.summaryModel,
          prompt,
          messages: previous.slice(-CHAT_CONTEXT_MESSAGES),
        },
        TIMING.PROCESSING_TIMEOUT_MS,
      );
      if (!response) throw new Error("The video assistant is unavailable.");
      if (response.success === false) throw new Error(response.error);
      if (!active.current) return;
      setMessages(response.messages);
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(response.messages));
      } catch {
        /* Keep the conversation in memory when browser storage is full. */
      }
    } catch (cause) {
      if (!active.current) return;
      setMessages(previous);
      setDraft(prompt);
      setError(cause instanceof Error ? cause.message : "Could not answer. Please retry.");
    } finally {
      busy.current = false;
      requestRef.current = null;
      if (active.current) {
        setPending(false);
        onBusyChange(false);
      }
    }
  }

  async function openSummary() {
    if (disabled || busy.current || !canSummarize) return;
    busy.current = true;
    setActionPending(true);
    setError(null);
    try {
      await onSummary(preferences.summaryModel, preferences.targetLanguage);
    } catch (cause) {
      if (active.current)
        setError(cause instanceof Error ? cause.message : "Could not open the summary.");
    } finally {
      busy.current = false;
      if (active.current) setActionPending(false);
    }
  }

  return (
    <>
      <main
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        aria-label="Video workspace"
      >
        <div className="sidepanel-container space-y-5 py-3">
          {children}
          <div className="space-y-6" role="log" aria-label="Video conversation" aria-live="polite">
            {messages.map((message, index) => (
              <div
                key={index}
                className={
                  message.role === "user"
                    ? "ml-auto w-fit max-w-[90%] rounded-2xl bg-muted px-4 py-3"
                    : "summary-text min-w-0 py-1"
                }
              >
                <span className="sr-only">
                  {message.role === "user" ? "You" : "Video assistant"}
                </span>
                {message.role === "assistant" ? (
                  <Markdown>{message.content}</Markdown>
                ) : (
                  <div className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
                    {message.content}
                  </div>
                )}
              </div>
            ))}
            {pending && (
              <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Thinking…
              </p>
            )}
            <div ref={bottom} />
          </div>
        </div>
      </main>
      <footer className="shrink-0 bg-background pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
        <div className="sidepanel-container">
          {error && (
            <p role="alert" className="mb-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <form
            className="rounded-2xl border border-border bg-card p-3 shadow-sm focus-within:border-primary/40"
            onSubmit={(event) => {
              event.preventDefault();
              void send(draft);
            }}
          >
            <textarea
              ref={textarea}
              aria-label="Message the video assistant"
              placeholder={
                contextLoading
                  ? "Loading video context…"
                  : canChat
                    ? "Ask about this video…"
                    : videoReady
                      ? "No transcript available for this video"
                      : "Open a YouTube video to start chatting…"
              }
              rows={2}
              maxLength={CHAT_PROMPT_LIMIT}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              disabled={working || contextLoading || !canChat}
              className="block min-h-12 w-full resize-none bg-transparent px-1 py-2 text-[15px] leading-6 outline-none placeholder:text-muted-foreground disabled:opacity-60"
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void send(draft);
                }
              }}
            />
            <div className="mt-1 flex flex-col gap-1">
              <div className="min-w-0 w-full">
                <EditableCombobox
                  value={preferences.summaryModel}
                  onChange={(model) => updatePreferences({ summaryModel: model })}
                  options={modelOptions}
                  renderIcon={() => selectedModelIcon}
                  placeholder="Choose model"
                  inputClassName="h-9 border-0 bg-transparent text-sm shadow-none"
                  contentClassName="max-w-[calc(100vw-2rem)]"
                />
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 gap-1.5 px-2 text-[13px]"
                  disabled={working || !canSummarize}
                  onClick={() => void openSummary()}
                  title={
                    !canSummarize
                      ? contextLoading
                        ? "Loading video context"
                        : "Open a YouTube video to generate a summary"
                      : hasSummary
                        ? "Jump to summary"
                        : "Generate summary"
                  }
                >
                  <FileText className="h-4 w-4" />
                  Summary
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 gap-1.5 px-2 text-[13px]"
                  aria-label="Caption"
                  title="Caption"
                  disabled={working || !videoReady || preview}
                  onClick={() => {
                    if (busy.current) return;
                    busy.current = true;
                    setActionPending(true);
                    void onCaptions()
                      .catch((cause) => {
                        if (active.current)
                          setError(
                            cause instanceof Error
                              ? cause.message
                              : "Could not regenerate captions.",
                          );
                      })
                      .finally(() => {
                        busy.current = false;
                        if (active.current) setActionPending(false);
                      });
                  }}
                >
                  <RefreshCw className="h-4 w-4" />
                  Caption
                </Button>
                <div className="ml-auto flex shrink-0 items-center gap-1">
                  {messages.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      disabled={pending}
                      aria-label="Clear video chat"
                      onClick={() => {
                        try {
                          sessionStorage.removeItem(storageKey);
                        } catch {
                          /* In-memory clearing is still available. */
                        }
                        setMessages([]);
                        setError(null);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    type="submit"
                    size="icon"
                    className="h-9 w-9 rounded-full"
                    aria-label="Send message"
                    disabled={!draft.trim() || working || contextLoading || !canChat}
                  >
                    {working ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowUp className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </form>
          <p className="mt-2 text-balance text-center text-xs text-muted-foreground">
            {preview ? "Example preview" : "Grounded in this video"} · Shift+Enter for a new line
          </p>
        </div>
      </footer>
    </>
  );
}
