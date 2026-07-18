import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Setting } from "@/lib/models/Setting";
import { Lead } from "@/lib/models/Lead";
import { Agent } from "@/lib/models/Agent";
import { currentMonth } from "@/lib/utils/date";

export async function POST(req: Request) {
  await connectDB();
  const { agentId, providerType } = await req.json();

  if (!agentId || !providerType) {
    return NextResponse.json({ error: "agentId and providerType are required" }, { status: 400 });
  }

  try {
    // 1. Fetch settings
    const settings = await Setting.find({ agentId }).lean();
    const m: Record<string, string> = {};
    settings.forEach((r) => { m[r.key] = r.value; });

    const apiKey = m[`${providerType}ApiKey`];
    const model = m[`${providerType}Model`];
    const prompt = m.llmPrompt;

    if (!apiKey) {
      return NextResponse.json({ error: `API Key is missing for ${providerType}. Please set it in LLM Scraper config.` }, { status: 400 });
    }
    if (!model) {
      return NextResponse.json({ error: `Model is missing for ${providerType}.` }, { status: 400 });
    }

    // 2. Prepare system instructions
    const systemPrompt = `You are a lead generation assistant. Your task is to extract or generate leads based on the user's prompt. 
You MUST return ONLY a valid JSON array of objects. Do not include markdown code blocks like \`\`\`json. 
Each object must have exactly these keys: firstName, lastName, company, jobTitle, email, phone, website, location.
If any data is missing, use an empty string "" instead of null.`;

    let resultText = "";

    // 3. Call the appropriate LLM provider
    if (providerType === "openai") {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt }
          ],
          response_format: { type: "json_object" },
        })
      });
      const resJson = await res.json();
      if (resJson.error) throw new Error(`OpenAI Error: ${resJson.error.message}`);
      resultText = resJson.choices[0].message.content;
    } else if (providerType === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: model,
          max_tokens: 4096,
          system: systemPrompt + `\nRespond strictly with: { "leads": [ ... ] }`,
          messages: [
            { role: "user", content: prompt }
          ]
        })
      });
      const resJson = await res.json();
      if (resJson.error) throw new Error(`Anthropic Error: ${resJson.error.message}`);
      resultText = resJson.content[0].text;
    } else if (providerType === "gemini") {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt + `\nRespond strictly with: { "leads": [ ... ] }` }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });
      const resJson = await res.json();
      if (resJson.error) throw new Error(`Gemini Error: ${resJson.error.message}`);
      resultText = resJson.candidates[0].content.parts[0].text;
    } else {
      throw new Error("Unknown provider type");
    }

    // 4. Parse the result
    let parsedLeads: any[] = [];
    try {
      let jsonStr = resultText;
      const match = resultText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) {
        jsonStr = match[1];
      } else {
        const startArr = resultText.indexOf('[');
        const endArr = resultText.lastIndexOf(']');
        if (startArr !== -1 && endArr !== -1 && endArr > startArr) {
          jsonStr = resultText.substring(startArr, endArr + 1);
        } else {
          const startObj = resultText.indexOf('{');
          const endObj = resultText.lastIndexOf('}');
          if (startObj !== -1 && endObj !== -1 && endObj > startObj) {
            jsonStr = resultText.substring(startObj, endObj + 1);
          }
        }
      }

      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) {
        parsedLeads = parsed;
      } else if (parsed.leads && Array.isArray(parsed.leads)) {
        parsedLeads = parsed.leads;
      } else if (typeof parsed === "object" && parsed !== null) {
        parsedLeads = [parsed];
      } else {
        throw new Error("Parsed result is not an array or object.");
      }
    } catch (parseError) {
      throw new Error("Failed to parse the LLM response as JSON. Output was: " + resultText.substring(0, 100));
    }

    if (!parsedLeads.length) {
      return NextResponse.json({ error: "LLM returned no leads." }, { status: 400 });
    }

    // 5. De-duplicate against database
    const existing = await Lead.find({ agentId }, "email phone").lean();
    const existingPhones = new Set(existing.map((l) => l.phone).filter(Boolean));
    const existingEmails = new Set(existing.map((l) => l.email).filter(Boolean));

    let missingContactCount = 0;
    let duplicateCount = 0;

    const toInsert = parsedLeads
      .map((p) => {
        const phone = normalizePhone(p.phone as string);
        const email = ((p.email as string) ?? "").toLowerCase().trim();
        const firstName = String(p.firstName || "").trim() || "Unknown";
        const lastName = String(p.lastName || "").trim() || "Unknown";
        return {
          agentId,
          firstName,
          lastName,
          fullName: `${firstName} ${lastName}`.trim(),
          company: String(p.company || ""),
          jobTitle: String(p.jobTitle || ""),
          email: email.includes("http") ? "" : email,
          phone,
          website: String(p.website || ""),
          location: String(p.location || ""),
          source: "LLM",
          llmProvider: providerType,
          channels: phone ? ["whatsapp", "call"] : ["email"],
          status: "new",
          pipelineStage: "new",
          agentEnabled: true,
        };
      })
      .filter((p) => {
        if (!p.phone && !p.email) {
          missingContactCount++;
          return false;
        }
        if (p.phone && existingPhones.has(p.phone)) {
          duplicateCount++;
          return false;
        }
        if (p.email && existingEmails.has(p.email)) {
          duplicateCount++;
          return false;
        }
        return true;
      });

    if (!toInsert.length) {
      return NextResponse.json({
        imported: 0,
        message: `LLM returned ${parsedLeads.length} leads. ${missingContactCount} skipped (no email/phone). ${duplicateCount} skipped (duplicates).`
      });
    }

    // Validate manually to log errors
    const validationErrors: string[] = [];
    toInsert.forEach((doc, idx) => {
      const err = new Lead(doc).validateSync();
      if (err) {
        console.error(`Validation error for lead ${idx}:`, JSON.stringify(err.errors, null, 2));
        validationErrors.push(`Lead ${idx}: ${err.message}`);
      }
    });

    if (validationErrors.length > 0) {
      return NextResponse.json({
        imported: 0,
        message: `Validation failed for ${validationErrors.length} leads: ${validationErrors[0]}`
      });
    }

    let insertedCount = 0;
    try {
      const inserted = await Lead.insertMany(toInsert, { ordered: false });
      insertedCount = inserted.length;
    } catch (err: any) {
      if (err.insertedDocs) {
        insertedCount = err.insertedDocs.length;
      } else {
        throw err;
      }
    }

    if (insertedCount > 0) {
      await Agent.findByIdAndUpdate(agentId, { $inc: { leadCount: insertedCount } });
    }

    return NextResponse.json({
      imported: insertedCount,
      message: `Imported ${insertedCount} leads. ${missingContactCount} skipped (no contact). ${duplicateCount} skipped (duplicates).`
    });

  } catch (err: any) {
    console.error("LLM Scraper Error:", err);
    return NextResponse.json({ error: err.message || "An unexpected error occurred" }, { status: 500 });
  }
}

function normalizePhone(raw: string | undefined): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return raw.trim();
}
