import type { Channel } from "@/store/types";

export interface SequenceStep {
  order: number;
  channel: Channel;
  dayOffset: number;
  sendTime: string;
}

export interface SequenceTemplate {
  name: string;
  desc: string;
  meta: string;
  steps: SequenceStep[];
}

export const SEQUENCE_TEMPLATES: SequenceTemplate[] = [
  {
    name: "Cold outreach",
    desc: "Email → WA → SMS → Call",
    meta: "4 steps · 4 days",
    steps: [
      { order: 1, channel: "email",    dayOffset: 1, sendTime: "10:00" },
      { order: 2, channel: "whatsapp", dayOffset: 2, sendTime: "11:00" },
      { order: 3, channel: "sms",      dayOffset: 3, sendTime: "15:00" },
      { order: 4, channel: "call",     dayOffset: 4, sendTime: "10:00" },
    ],
  },
  {
    name: "Email drip",
    desc: "3 follow-up emails",
    meta: "3 steps · 7 days",
    steps: [
      { order: 1, channel: "email", dayOffset: 1, sendTime: "09:00" },
      { order: 2, channel: "email", dayOffset: 3, sendTime: "10:00" },
      { order: 3, channel: "email", dayOffset: 7, sendTime: "09:00" },
    ],
  },
  {
    name: "WA + Call",
    desc: "Message then voice call",
    meta: "2 steps · 2 days",
    steps: [
      { order: 1, channel: "whatsapp", dayOffset: 1, sendTime: "10:00" },
      { order: 2, channel: "call",     dayOffset: 2, sendTime: "11:00" },
    ],
  },
];

export const DEFAULT_SEQUENCE_STEPS: SequenceStep[] = [
  { order: 1, channel: "email",    dayOffset: 1, sendTime: "10:00" },
  { order: 2, channel: "whatsapp", dayOffset: 2, sendTime: "11:00" },
  { order: 3, channel: "sms",      dayOffset: 3, sendTime: "15:00" },
  { order: 4, channel: "call",     dayOffset: 4, sendTime: "10:00" },
];
