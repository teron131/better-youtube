/** Owns the current video's chat UI and session history; summary edits are committed by the background agent. */

import { MessageCircle, Send, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  CHAT_ACTION,
  CHAT_CONTEXT_MESSAGES,
  CHAT_PROMPT_LIMIT,
  type ChatMessage,
  type ChatResponse,
} from "@/core/agent/conversation";
import { sendChromeMessage } from "@/core/utils/chrome";

import { Button } from "./ui/button";
import { Card } from "./ui/card";

interface VideoChatProps {
  videoId: string;
  transcript: string;
  model?: string;
  disabled?: boolean;
  preview?: boolean;
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

export function VideoChat({ videoId, transcript, model, disabled, preview }: VideoChatProps) {
  const storageKey = `video-chat:${videoId}`;
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadMessages(storageKey));
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(true);
  const busy = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    if (messages.length || pending) bottom.current?.scrollIntoView({ block: "nearest" });
  }, [messages, pending]);

  async function send(prompt: string) {
    if (!prompt.trim() || disabled || busy.current) return;
    if (preview) {
      setError(
        "This is an example video. Open the extension on a YouTube video to use the assistant.",
      );
      return;
    }
    busy.current = true;
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
          transcript,
          model,
          prompt,
          messages: previous.slice(-CHAT_CONTEXT_MESSAGES),
        },
        190_000,
      );
      if (!response) throw new Error("The video assistant is unavailable.");
      if (response.success === false) throw new Error(response.error);
      if (!active.current) return;
      setMessages(response.messages);
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(response.messages));
      } catch {
        /* The current conversation remains available in memory when browser storage is full. */
      }
    } catch (cause) {
      if (!active.current) return;
      setMessages(previous);
      setDraft(prompt);
      setError(cause instanceof Error ? cause.message : "Could not answer. Please retry.");
    } finally {
      busy.current = false;
      if (active.current) setPending(false);
    }
  }

  return (
    <Card className="overflow-hidden rounded-2xl border-border/60 bg-card/90">
      <div className="flex items-center justify-between border-b border-border/50 px-5 py-4">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Chat with this video</h3>
        </div>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            disabled={pending}
            aria-label="Clear video chat"
            onClick={() => {
              setMessages([]);
              sessionStorage.removeItem(storageKey);
              setError(null);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
      <div
        className="max-h-[28rem] space-y-4 overflow-y-auto px-5 py-4"
        role="log"
        aria-label="Video conversation"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Ask a question, explore a detail, or ask me to edit the summary.
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                "What is the main argument?",
                "Explain the key ideas simply",
                "Make the summary more concise",
              ].map((prompt) => (
                <Button
                  key={prompt}
                  variant="outline"
                  size="sm"
                  className="h-auto whitespace-normal text-left"
                  disabled={disabled || pending}
                  onClick={() => void send(prompt)}
                >
                  {prompt}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={index}
              className={message.role === "user" ? "ml-8 rounded-xl bg-muted/60 px-4 py-3" : "pr-4"}
            >
              <div className="mb-1 text-xs font-medium text-muted-foreground">
                {message.role === "user" ? "You" : "Video assistant"}
              </div>
              <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                {message.content}
              </div>
            </div>
          ))
        )}
        {pending && (
          <p role="status" className="text-sm text-muted-foreground">
            Working with the video context…
          </p>
        )}
        <div ref={bottom} />
      </div>
      <form
        className="space-y-2 border-t border-border/50 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void send(draft);
        }}
      >
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            aria-label="Message the video assistant"
            placeholder="Ask about this video…"
            rows={2}
            maxLength={CHAT_PROMPT_LIMIT}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={pending || disabled}
            className="min-w-0 flex-1 resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void send(draft);
              }
            }}
          />
          <Button
            type="submit"
            size="icon"
            aria-label="Send message"
            disabled={!draft.trim() || pending || disabled}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Answers use this video’s transcript. Shift+Enter adds a new line.
        </p>
      </form>
    </Card>
  );
}
