import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Lead } from "@/lib/models/Lead";
import { Agent } from "@/lib/models/Agent";
import { authorizeWorkspace } from "@/server/auth/access";

const DEMO_LEADS = [
  { firstName: "Ramesh",   lastName: "Verma",    jobTitle: "Property Owner",     company: "Verma Constructions",       email: "ramesh.verma@example.com",  phone: "", source: "Google Maps", channels: ["whatsapp", "call"],         status: "new",         pipelineStage: "new" },
  { firstName: "Suresh",   lastName: "Gupta",    jobTitle: "Site Contractor",    company: "Gupta Interiors Lucknow",   email: "suresh.gupta@example.com",  phone: "", source: "Google Maps", channels: ["email", "whatsapp"],        status: "in_outreach", pipelineStage: "contacted" },
  { firstName: "Anita",    lastName: "Singh",    jobTitle: "Interior Designer",  company: "Singh Decor Studio",        email: "anita.singh@example.com",  phone: "", source: "Google Maps", channels: ["email"],                    status: "replied",     pipelineStage: "replied" },
  { firstName: "Manoj",    lastName: "Tiwari",   jobTitle: "Builder",            company: "Tiwari Real Estate",        email: "manoj.tiwari@example.com",  phone: "", source: "Google Maps", channels: ["call", "whatsapp"],         status: "new",         pipelineStage: "new" },
  { firstName: "Pooja",    lastName: "Sharma",   jobTitle: "Home Owner",         company: "Sharma Residences",         email: "pooja.sharma@example.com",  phone: "", source: "Google Maps", channels: ["whatsapp"],                 status: "in_outreach", pipelineStage: "contacted" },
  { firstName: "Vikram",   lastName: "Yadav",    jobTitle: "Civil Contractor",   company: "Yadav Infrastructure",      email: "vikram.yadav@example.com",  phone: "", source: "Google Maps", channels: ["email", "call"],            status: "meeting_booked", pipelineStage: "qualified" },
  { firstName: "Kavita",   lastName: "Mishra",   jobTitle: "Architect",          company: "Mishra Architects LLP",     email: "kavita.mishra@example.com",  phone: "", source: "Google Maps", channels: ["email", "whatsapp", "call"], status: "replied",    pipelineStage: "replied" },
  { firstName: "Deepak",   lastName: "Agarwal",  jobTitle: "Hotel Manager",      company: "Agarwal Grand Hotel",       email: "deepak.agarwal@example.com",  phone: "", source: "Google Maps", channels: ["email"],                    status: "new",         pipelineStage: "new" },
  { firstName: "Sunita",   lastName: "Pandey",   jobTitle: "Shop Owner",         company: "Pandey Furniture Mart",     email: "sunita.pandey@example.com",  phone: "", source: "Google Maps", channels: ["whatsapp", "sms"],          status: "in_outreach", pipelineStage: "contacted" },
  { firstName: "Rakesh",   lastName: "Srivastava", jobTitle: "Contractor",       company: "Srivastava Builders",       email: "rakesh.srivas@example.com",  phone: "", source: "Google Maps", channels: ["call"],                     status: "closed",      pipelineStage: "closed" },
];

/**
 * Demo leads use example.com addresses and no phone numbers, and have AI
 * outreach switched off, so publishing a demo workspace can never contact a real person.
 */
export async function POST(req: Request) {
  await connectDB();
  const body = await req.json().catch(() => ({}));
  const access = await authorizeWorkspace(req, body.agentId, { minRole: "admin" });
  if (!access.ok) return access.response;
  const agentId = access.agentId;

  const existing = await Lead.countDocuments({ agentId });
  if (existing > 0) return NextResponse.json({ message: "Already seeded", count: existing });

  const docs = DEMO_LEADS.map((l) => ({
    ...l,
    agentId,
    fullName: `${l.firstName} ${l.lastName}`,
    agentEnabled: false,
    tags: ["demo"],
  }));

  await Lead.insertMany(docs);
  await Agent.findByIdAndUpdate(agentId, { $set: { leadCount: docs.length } });

  return NextResponse.json({ seeded: docs.length });
}
