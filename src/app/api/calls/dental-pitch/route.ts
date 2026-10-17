import { NextResponse } from "next/server";

export async function GET(req: Request) {
  return handlePitch(req);
}

export async function POST(req: Request) {
  return handlePitch(req);
}

async function handlePitch(req: Request) {
  const url = new URL(req.url);
  const digits = url.searchParams.get("Digits");
  const rawClinic = url.searchParams.get("clinic") || "Dental Clinic";
  const clinic = rawClinic.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  if (digits === "1") {
    const thankYouXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Speak voice="Polly.Aditi" language="en-IN">
        Thank you! We have noted your interest and our team is sending the PureBite Dental live demo and brochure directly to your WhatsApp. Have a great day!
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
        Maine aapka clinic, ${clinic}, Lucknow mein Google Maps par dekha. We specialize in custom clinic automation and online appointment portals for dentists.
    </Speak>
    <Wait length="1"/>
    <Speak voice="Polly.Aditi" language="en-IN">
        Humne doctors ke liye PureBite Dental platform develop kiya hai, jisme patients direct website aur WhatsApp se booking kar sakte hain, automated reminders jate hain, aur complete digital patient records manage hote hain.
    </Speak>
    <Wait length="1"/>
    <GetDigits action="https://pleadingly-nonfortifiable-tyron.ngrok-free.dev/api/calls/dental-pitch?clinic=${encodeURIComponent(clinic)}" method="POST" numDigits="1" timeout="7">
        <Speak voice="Polly.Aditi" language="en-IN">
            Aap hamara live demo dekh sakte hain no 1 dental dot vercel dot app par. Agar aap 2 minute ka free WhatsApp demo chahte hain, toh kripya apne phone par 1 dabayein. Ya aap humein 9 5 1 9 2 0 2 5 0 9 par call ya WhatsApp kar sakte hain.
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
