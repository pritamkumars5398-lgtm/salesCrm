import { NextResponse } from "next/server";

export async function GET(req: Request) {
  return handleSouthPitch(req);
}

export async function POST(req: Request) {
  return handleSouthPitch(req);
}

async function handleSouthPitch(req: Request) {
  const url = new URL(req.url);
  const digits = url.searchParams.get("Digits");
  const rawCompany = url.searchParams.get("company") || "your business";
  const category = url.searchParams.get("category") || "general";
  const company = rawCompany.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  if (digits === "1") {
    const thankYouXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Speak voice="Polly.Aditi" language="en-IN">
        Thank you for your interest! We are sending our live interactive booking demo directly to your WhatsApp number right now. Have a wonderful day!
    </Speak>
    <Hangup/>
</Response>`;
    return new Response(thankYouXml, {
      status: 200,
      headers: { "Content-Type": "application/xml; charset=utf-8" },
    });
  }

  let valueOffer = "We build custom mobile apps and 24/7 automated WhatsApp booking systems that automatically confirm client bookings and handle inquiries without manual staff effort.";

  if (category === "clinic") {
    valueOffer = "We build 24/7 automated WhatsApp appointment booking bots and patient mobile portals for leading clinics that automatically confirm consultations and send automated treatment reminders.";
  } else if (category === "auto_detailing") {
    valueOffer = "We build custom slot-booking mobile apps and automated WhatsApp service reminder bots for premium car detailing studios that bring back repeat ceramic and wash customers.";
  } else if (category === "logistics") {
    valueOffer = "We build instant WhatsApp quotation bots and web booking calculators for packers and movers that provide instant cost estimates in five seconds.";
  }

  const pitchXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Record recordSession="true" redirect="false" fileFormat="mp3"/>
    <Wait length="1"/>
    <Speak voice="Polly.Aditi" language="en-IN">
        Hello! Good afternoon. Am I speaking with the manager or owner of ${company}?
    </Speak>
    <Wait length="1"/>
    <Speak voice="Polly.Aditi" language="en-IN">
        I noticed ${company} in Bangalore has great customer reviews. ${valueOffer}
    </Speak>
    <Wait length="1"/>
    <GetDigits action="https://pleadingly-nonfortifiable-tyron.ngrok-free.dev/api/calls/south-services-pitch?company=${encodeURIComponent(company)}&amp;category=${encodeURIComponent(category)}" method="POST" numDigits="1" timeout="7">
        <Speak voice="Polly.Aditi" language="en-IN">
            If you would like a quick two-minute live demo sent directly to your WhatsApp, please press 1 on your phone keypad now. Or reach us anytime on 9 5 1 9 2 0 2 5 0 9.
        </Speak>
    </GetDigits>
    <Speak voice="Polly.Aditi" language="en-IN">
        Thank you so much for your time. Have a great day ahead!
    </Speak>
    <Hangup/>
</Response>`;

  return new Response(pitchXml, {
    status: 200,
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
