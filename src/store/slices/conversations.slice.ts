import type { StateCreator } from "zustand";
import type { Conversation, Channel } from "../types";
import type { AppState } from "../useAppStore";

export interface ConversationsSlice {
  conversations: Record<string, Conversation[]>; // keyed by leadId
  setConversations: (leadId: string, convos: Conversation[]) => void;
  appendMessage: (leadId: string, channel: Channel, message: Conversation["messages"][0]) => void;
}

export const createConversationsSlice: StateCreator<AppState, [], [], ConversationsSlice> = (set) => ({
  conversations: {},
  setConversations: (leadId, convos) =>
    set((s) => ({ conversations: { ...s.conversations, [leadId]: convos } })),
  appendMessage: (leadId, channel, message) =>
    set((s) => {
      const existing = s.conversations[leadId] ?? [];
      const idx = existing.findIndex((c) => c.channel === channel);
      if (idx === -1) return s;
      const updated = [...existing];
      updated[idx] = { ...updated[idx], messages: [...updated[idx].messages, message] };
      return { conversations: { ...s.conversations, [leadId]: updated } };
    }),
});
