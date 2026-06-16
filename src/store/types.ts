export type Page = "dashboard" | "leads" | "sequence" | "crm" | "calendar" | "activity" | "settings" | "crons" | "profile" | "plans";
export type Channel = "email" | "whatsapp" | "sms" | "call";
export type LeadStatus = "new" | "in_outreach" | "replied" | "meeting_booked" | "closed";

export interface Agent {
  _id: string;
  name: string;
  status: "active" | "inactive";
  leadCount: number;
}

export interface Lead {
  _id: string;
  agentId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  jobTitle: string;
  company: string;
  email: string;
  phone: string;
  source: string;
  channels: Channel[];
  status: LeadStatus;
  pipelineStage: string;
  agentEnabled: boolean;
  createdAt: string;
}

export interface Message {
  role: "agent" | "lead";
  content: string;
  timestamp: string;
  meta?: Record<string, unknown>;
}

export interface Conversation {
  _id: string;
  leadId: string;
  channel: Channel;
  messages: Message[];
}

export interface CronJob {
  _id: string;
  agentId: string;
  name: string;
  cronExpression: string;
  action: string;
  enabled: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  runCount: number;
  createdAt: string;
}

export interface Activity {
  _id: string;
  agentId: string;
  leadId: string;
  leadName: string;
  channel: string;
  event: string;
  detail?: string;
  createdAt: string;
}

export interface Meeting {
  _id: string;
  agentId: string;
  leadId: string;
  leadName: string;
  company: string;
  title: string;
  scheduledAt: string;
  durationMinutes: number;
  platform: string;
  status: "confirmed" | "pending" | "cancelled";
}

export interface DrawerState {
  open: boolean;
  lead: Lead | null;
  channel: Channel;
}

export interface DashboardStats {
  totalLeads: number;
  inOutreach: number;
  replied: number;
  meetingsThisWeek: number;
}
