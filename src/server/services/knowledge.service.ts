import { KnowledgeItem } from "@/lib/models/KnowledgeItem";

export const MAX_KNOWLEDGE_ITEMS = 100;
export const MAX_KNOWLEDGE_CHARS = 20000;

interface Chunk {
  title: string;
  text: string;
  terms: string[];
}

const STOPWORDS = new Set(
  "a an and are as at be but by can do does for from has have how i if in is it its me my of on or our so that the their them they this to us was we what when where which who why will with you your hai hain ka ki ke ko se me kya aur bhi".split(" "),
);

function terms(text: string): string[] {
  return text.toLowerCase().normalize("NFKD").split(/[^a-z0-9ऀ-ॿ]+/).filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** Split long documents on blank lines / headings into ~600-char pieces. */
function chunk(title: string, content: string): Chunk[] {
  const paragraphs = content.split(/\n\s*\n|\n(?=#+\s)/).map((p) => p.trim()).filter(Boolean);
  const out: Chunk[] = [];
  let buf = "";
  for (const p of paragraphs) {
    if (buf && buf.length + p.length > 600) {
      out.push({ title, text: buf, terms: terms(`${title} ${buf}`) });
      buf = "";
    }
    buf = buf ? `${buf}\n${p}` : p;
    while (buf.length > 900) {
      out.push({ title, text: buf.slice(0, 900), terms: terms(`${title} ${buf.slice(0, 900)}`) });
      buf = buf.slice(900);
    }
  }
  if (buf) out.push({ title, text: buf, terms: terms(`${title} ${buf}`) });
  return out;
}

/**
 * The knowledge-base passages most relevant to `query`, within `maxChars`.
 * Keyword scoring (TF × IDF) — no embeddings service needed. With an empty
 * query (start of a call) the first passages of each document are returned.
 */
export async function findKnowledge(agentId: string, query: string, maxChars = 2500): Promise<string> {
  const items = await KnowledgeItem.find({ agentId }).sort({ updatedAt: -1 }).limit(MAX_KNOWLEDGE_ITEMS).lean();
  if (items.length === 0) return "";

  const chunks = items.flatMap((i) => chunk(i.title, i.content));
  const queryTerms = [...new Set(terms(query))];

  let ranked: Chunk[];
  if (queryTerms.length === 0) {
    const seen = new Set<string>();
    ranked = chunks.filter((c) => (seen.has(c.title) ? false : (seen.add(c.title), true)));
  } else {
    const df = new Map<string, number>();
    for (const c of chunks) for (const t of new Set(c.terms)) df.set(t, (df.get(t) ?? 0) + 1);
    const scored = chunks.map((c) => {
      let score = 0;
      for (const q of queryTerms) {
        const tf = c.terms.filter((t) => t === q || (q.length > 4 && t.startsWith(q.slice(0, -1)))).length;
        if (tf) score += (1 + Math.log(tf)) * Math.log(1 + chunks.length / (df.get(q) ?? 1));
      }
      return { c, score };
    });
    ranked = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).map((s) => s.c);
  }

  const picked: string[] = [];
  let used = 0;
  for (const c of ranked) {
    const block = `[${c.title}]\n${c.text}`;
    if (used + block.length > maxChars) {
      if (picked.length === 0) picked.push(block.slice(0, maxChars));
      break;
    }
    picked.push(block);
    used += block.length + 2;
  }
  return picked.join("\n\n");
}
