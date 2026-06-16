import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Lead } from "@/lib/models/Lead";
import { Agent } from "@/lib/models/Agent";

const DEMO_LEADS = [
  { firstName: "Ramesh",   lastName: "Verma",    jobTitle: "Property Owner",     company: "Verma Constructions",       email: "ramesh.verma@gmail.com",    phone: "+919876543210", source: "Google Maps", channels: ["whatsapp", "call"],         status: "new",         pipelineStage: "new" },
  { firstName: "Suresh",   lastName: "Gupta",    jobTitle: "Site Contractor",    company: "Gupta Interiors Lucknow",   email: "suresh.gupta@gmail.com",    phone: "+919812345678", source: "Google Maps", channels: ["email", "whatsapp"],        status: "in_outreach", pipelineStage: "contacted" },
  { firstName: "Anita",    lastName: "Singh",    jobTitle: "Interior Designer",  company: "Singh Decor Studio",        email: "anita.singh@yahoo.com",     phone: "+919823456789", source: "Google Maps", channels: ["email"],                    status: "replied",     pipelineStage: "replied" },
  { firstName: "Manoj",    lastName: "Tiwari",   jobTitle: "Builder",            company: "Tiwari Real Estate",        email: "manoj.tiwari@gmail.com",    phone: "+919834567890", source: "Google Maps", channels: ["call", "whatsapp"],         status: "new",         pipelineStage: "new" },
  { firstName: "Pooja",    lastName: "Sharma",   jobTitle: "Home Owner",         company: "Sharma Residences",         email: "pooja.sharma@gmail.com",    phone: "+919845678901", source: "Google Maps", channels: ["whatsapp"],                 status: "in_outreach", pipelineStage: "contacted" },
  { firstName: "Vikram",   lastName: "Yadav",    jobTitle: "Civil Contractor",   company: "Yadav Infrastructure",      email: "vikram.yadav@gmail.com",    phone: "+919856789012", source: "Google Maps", channels: ["email", "call"],            status: "meeting_booked", pipelineStage: "qualified" },
  { firstName: "Kavita",   lastName: "Mishra",   jobTitle: "Architect",          company: "Mishra Architects LLP",     email: "kavita.mishra@gmail.com",   phone: "+919867890123", source: "Google Maps", channels: ["email", "whatsapp", "call"], status: "replied",    pipelineStage: "replied" },
  { firstName: "Deepak",   lastName: "Agarwal",  jobTitle: "Hotel Manager",      company: "Agarwal Grand Hotel",       email: "deepak.agarwal@gmail.com",  phone: "+919878901234", source: "Google Maps", channels: ["email"],                    status: "new",         pipelineStage: "new" },
  { firstName: "Sunita",   lastName: "Pandey",   jobTitle: "Shop Owner",         company: "Pandey Furniture Mart",     email: "sunita.pandey@gmail.com",   phone: "+919889012345", source: "Google Maps", channels: ["whatsapp", "sms"],          status: "in_outreach", pipelineStage: "contacted" },
  { firstName: "Rakesh",   lastName: "Srivastava", jobTitle: "Contractor",       company: "Srivastava Builders",       email: "rakesh.srivas@gmail.com",   phone: "+919890123456", source: "Google Maps", channels: ["call"],                     status: "closed",      pipelineStage: "closed" },
];

export async function POST(req: Request) {
  await connectDB();
  const { agentId } = await req.json() as { agentId: string };
  if (!agentId) return NextResponse.json({ error: "agentId required" }, { status: 400 });

  const existing = await Lead.countDocuments({ agentId });
  if (existing > 0) return NextResponse.json({ message: "Already seeded", count: existing });

  const docs = DEMO_LEADS.map((l) => ({
    ...l,
    agentId,
    fullName: `${l.firstName} ${l.lastName}`,
  }));

  await Lead.insertMany(docs);
  await Agent.findByIdAndUpdate(agentId, { $set: { leadCount: docs.length } });

  return NextResponse.json({ seeded: docs.length });
}
