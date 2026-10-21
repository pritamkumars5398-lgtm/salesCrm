import { NextResponse } from "next/server";

export async function GET(req: Request) {
  return handleServicesPitch(req);
}

export async function POST(req: Request) {
  return handleServicesPitch(req);
}

async function handleServicesPitch(req: Request) {
  const url = new URL(req.url);
  const digits = url.searchParams.get("Digits");
  const rawCompany = url.searchParams.get("company") || "Business";
  const company = rawCompany.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  if (digits === "1") {
    const thankYouXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Speak voice="Polly.Aditi" language="en-IN">
        Thank you! We have noted your interest. Our senior engineering team from DIFMO Private Limited is sending our full service portfolio, Play Store showcase, and corporate brochure directly to your WhatsApp. Have a great day!
    </Speak>
    <Hangup/>
</Response>`;
    return new Response(thankYouXml, {
      status: 200,
      headers: { "Content-Type": "application/xml; charset=utf-8" },
    });
  }

  const pitchXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Wait length="1"/>
    <Speak voice="Polly.Aditi" language="en-IN">
        Namaste! Main Priya baat kar rahi hoon DIFMO Private Limited se.
    </Speak>
    <Wait length="1"/>
    <Speak voice="Polly.Aditi" language="en-IN">
        Maine aapki company, ${company}, Google par dekhi. DIFMO ek leading software engineering company hai. Hum custom Mobile Apps, Modern Websites, aur AI Automation solutions build karte hain.
    </Speak>
    <Wait length="1"/>
    <Speak voice="Polly.Aditi" language="en-IN">
        Hamare 25 se zyada mobile applications Google Play Store par live hain. Hum companies ke operations automate karne aur digital sales badhane mein madad karte hain.
    </Speak>
    <Wait length="1"/>
    <GetDigits action="https://pleadingly-nonfortifiable-tyron.ngrok-free.dev/api/calls/difmo-services-pitch?company=${encodeURIComponent(company)}" method="POST" numDigits="1" timeout="7">
        <Speak voice="Polly.Aditi" language="en-IN">
            Agar aap apne business ke liye custom mobile app, website ya AI automation chahte hain, toh kripya apne phone par 1 dabayein. Hum 2 minute mein full brochure aur live apps link aapke WhatsApp par bhej denge. Ya aap humein 9 5 1 9 2 0 2 5 0 9 par call kar sakte hain.
        </Speak>
    </GetDigits>
    <Speak voice="Polly.Aditi" language="en-IN">
        Thank you so much for your time. Have a wonderful day ahead!
    </Speak>
    <Hangup/>
</Response>`;

  return new Response(pitchXml, {
    status: 200,
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
