/** Owns the video-chat message contract and input limits shared by the sidepanel and background handler. */

import { z } from "zod";

export const CHAT_ACTION = "VIDEO_CHAT";
export const CHAT_PROMPT_LIMIT = 12000;
export const CHAT_CONTEXT_MESSAGES = 40;
export const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(40000),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatRequestSchema = z.object({
  videoId: z.string().regex(/^[\w-]{11}$/),
  requestId: z.string().max(200).optional(),
  prompt: z.string().trim().min(1).max(CHAT_PROMPT_LIMIT),
  transcript: z.string().max(1_000_000).optional(),
  model: z.string().max(200).optional(),
  messages: z.array(ChatMessageSchema).max(60).default([]),
});

export interface AgentResult {
  reply: string;
  summary: string | null;
  summaryChanged: boolean;
  messages: ChatMessage[];
}

export type ChatResponse = ({ success: true } & AgentResult) | { success: false; error: string };
