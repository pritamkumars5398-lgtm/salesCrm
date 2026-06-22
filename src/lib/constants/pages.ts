import type { Page } from "@/store/types";

export const PAGE_TITLES: Record<string, string> = {
  dashboard: "Dashboard",
  leads:     "Leads",
  sequence:  "Sequence builder",
  crm:       "CRM pipeline",
  calendar:  "Calendar",
  activity:  "Activity log",
  settings:  "Settings",
  crons:     "Schedules",
  profile:   "Profile",
  plans:     "Plans & Usage",
  superadmin: "Superadmin Portal",
};

export const VALID_PAGES: Page[] = [
  "dashboard", "leads", "sequence", "crm", "calendar",
  "activity", "settings", "crons", "profile", "plans", "superadmin",
];
