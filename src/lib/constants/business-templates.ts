import type { LeadFieldType } from "@/lib/lead-fields";

/**
 * Starting points for a new workspace. A template only pre-fills things the
 * user can change afterwards: the AI playbook, lead fields, pipeline stage
 * names and a few suggested groups.
 */

export interface TemplateField {
  key: string;
  label: string;
  type: LeadFieldType;
  options?: string[];
  aiFill?: boolean;
  description?: string;
}

export interface TemplateGroup {
  name: string;
  color: string;
  match: "all" | "any";
  rules: { field: string; op: string; value?: string | number }[];
  playbook?: string;
}

export interface BusinessTemplate {
  id: string;
  label: string;
  description: string;
  playbook: Record<string, string>;
  pipelineLabels: Record<"new" | "contacted" | "replied" | "qualified" | "closed", string>;
  fields: TemplateField[];
  groups: TemplateGroup[];
}

const DEFAULT_STAGES = { new: "New", contacted: "Contacted", replied: "Replied", qualified: "Qualified", closed: "Closed" };

const TEMPERATURE: TemplateField = {
  key: "temperature", label: "Lead temperature", type: "select", options: ["Hot", "Warm", "Cold"], aiFill: true,
  description: "Hot = wants to buy soon, Warm = interested but not urgent, Cold = not interested now",
};

const HOT_LEADS: TemplateGroup = {
  name: "Hot leads", color: "#ef4444", match: "all",
  rules: [{ field: "cf.temperature", op: "equals", value: "Hot" }],
  playbook: "These leads are close to buying. Be direct, answer questions fully and push for a booked meeting.",
};

export const BUSINESS_TEMPLATES: BusinessTemplate[] = [
  {
    id: "it_services",
    label: "IT services / agency",
    description: "Websites, apps, software development, digital marketing",
    playbook: {
      offerType: "Services",
      offerSummary: "We build websites, mobile apps and automation that help businesses get more customers.",
      targetCustomer: "Small and mid-sized local businesses and startups",
      callGoal: "Book a free 15-minute consultation call with our team",
    },
    pipelineLabels: { new: "New", contacted: "Contacted", replied: "Discovery", qualified: "Proposal sent", closed: "Won / Lost" },
    fields: [
      TEMPERATURE,
      { key: "service_interest", label: "Service interested in", type: "multiselect", options: ["Website", "Mobile app", "Custom software", "Digital marketing", "Automation"], aiFill: true },
      { key: "budget", label: "Budget (₹)", type: "number", aiFill: true },
      { key: "company_size", label: "Company size", type: "select", options: ["1–10", "11–50", "51–200", "200+"] },
    ],
    groups: [
      HOT_LEADS,
      { name: "No website", color: "#f59e0b", match: "all", rules: [{ field: "website", op: "is_empty" }],
        playbook: "They have no website of their own. Lead with how a simple website and Google presence brings them customers." },
    ],
  },
  {
    id: "saas_product",
    label: "Software product (SaaS)",
    description: "A software product sold to businesses — e.g. a hotel CRM or school ERP",
    playbook: {
      offerType: "Software product",
      offerSummary: "Our software helps businesses like theirs save time and grow — describe the product in one line here.",
      targetCustomer: "Owners and managers of the businesses the product is built for",
      callGoal: "Book a 20-minute product demo",
    },
    pipelineLabels: { new: "New", contacted: "Contacted", replied: "Interested", qualified: "Demo booked", closed: "Customer / Lost" },
    fields: [
      TEMPERATURE,
      { key: "current_tool", label: "Current software", type: "text", aiFill: true, description: "What they use today (Excel, another software, nothing)" },
      { key: "org_size", label: "Size (rooms / students / staff)", type: "number", aiFill: true },
      { key: "decision_maker", label: "Talking to decision maker", type: "boolean", aiFill: true },
      { key: "demo_date", label: "Demo date", type: "date" },
    ],
    groups: [
      HOT_LEADS,
      { name: "Using Excel / no software", color: "#10b981", match: "any",
        rules: [{ field: "cf.current_tool", op: "contains", value: "excel" }, { field: "cf.current_tool", op: "is_empty" }],
        playbook: "They manage things manually. Focus on the time saved and mistakes avoided by switching to software." },
    ],
  },
  {
    id: "staffing",
    label: "Staffing / recruitment",
    description: "Supplying candidates or contract staff to companies",
    playbook: {
      offerType: "Services",
      offerSummary: "We supply pre-vetted candidates and contract staff, fast.",
      targetCustomer: "HR managers and hiring managers at growing companies",
      callGoal: "Get their current hiring requirement and share matching profiles",
    },
    pipelineLabels: { new: "New", contacted: "Contacted", replied: "Requirement received", qualified: "Profiles shared", closed: "Placed / Lost" },
    fields: [
      TEMPERATURE,
      { key: "roles_hiring", label: "Roles hiring for", type: "text", aiFill: true },
      { key: "openings", label: "Number of openings", type: "number", aiFill: true },
      { key: "hiring_timeline", label: "Hiring timeline", type: "select", options: ["Immediate", "This month", "This quarter", "Not hiring"], aiFill: true },
    ],
    groups: [HOT_LEADS],
  },
  {
    id: "real_estate",
    label: "Real estate",
    description: "Selling or renting property",
    playbook: {
      offerType: "Physical product",
      offerSummary: "We help buyers find the right property at the right price.",
      targetCustomer: "People looking to buy or rent property",
      callGoal: "Book a site visit",
    },
    pipelineLabels: { new: "New", contacted: "Contacted", replied: "Interested", qualified: "Site visit booked", closed: "Booked / Lost" },
    fields: [
      TEMPERATURE,
      { key: "property_type", label: "Property type", type: "select", options: ["Apartment", "Villa", "Plot", "Commercial"], aiFill: true },
      { key: "budget", label: "Budget (₹)", type: "number", aiFill: true },
      { key: "preferred_area", label: "Preferred area", type: "text", aiFill: true },
    ],
    groups: [HOT_LEADS],
  },
  {
    id: "education",
    label: "Education / coaching",
    description: "Courses, coaching, admissions",
    playbook: {
      offerType: "Services",
      offerSummary: "Our courses help students reach their goals.",
      targetCustomer: "Students and parents",
      callGoal: "Book a free counselling session",
    },
    pipelineLabels: { new: "New", contacted: "Contacted", replied: "Enquiry", qualified: "Counselling booked", closed: "Enrolled / Lost" },
    fields: [
      TEMPERATURE,
      { key: "course_interest", label: "Course interested in", type: "text", aiFill: true },
      { key: "start_timeline", label: "Wants to start", type: "select", options: ["This month", "Next 3 months", "Later"], aiFill: true },
    ],
    groups: [HOT_LEADS],
  },
  {
    id: "blank",
    label: "Something else",
    description: "Start empty and set everything up yourself",
    playbook: {},
    pipelineLabels: DEFAULT_STAGES,
    fields: [TEMPERATURE],
    groups: [],
  },
];

export const DEFAULT_PIPELINE_LABELS = DEFAULT_STAGES;

export function findTemplate(id: string | undefined | null): BusinessTemplate {
  return BUSINESS_TEMPLATES.find((t) => t.id === id) ?? BUSINESS_TEMPLATES[BUSINESS_TEMPLATES.length - 1];
}
