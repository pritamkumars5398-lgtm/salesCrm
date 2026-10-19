/**
 * "Ideal customer" filter applied to scraped places before they become leads.
 * Shared by the importer (server) and the settings card (client). Everything
 * here works on data every Google Maps result already has, so it costs no
 * extra Apify credits — unlike the actor's own paid filters.
 */

export interface LeadFilter {
  enabled: boolean;
  /** chain / big-brand names (whole-word match on the place name) or website domains (contain a dot) */
  excludeBrands: string[];
  /** the place's main category must contain one of these words; empty = any category */
  includeCategories: string[];
  /** …and must not contain any of these */
  excludeCategories: string[];
  minReviews: number | null;
  maxReviews: number | null;
  minRating: number | null;
  maxRating: number | null;
  /** skip hotels above this star class (5 = keep all) */
  maxHotelStars: number | null;
  website: "any" | "with" | "without";
  skipClosed: boolean;
}

export const LEAD_FILTER_KEY = "leadFilter";

export const DEFAULT_LEAD_FILTER: LeadFilter = {
  enabled: true,
  excludeBrands: [],
  includeCategories: [],
  excludeCategories: [],
  minReviews: null,
  maxReviews: null,
  minRating: null,
  maxRating: null,
  maxHotelStars: null,
  website: "any",
  skipClosed: true,
};

export interface LeadFilterPreset {
  id: string;
  label: string;
  /** one line on who it keeps */
  description: string;
  filter: LeadFilter;
}

export const LEAD_FILTER_PRESETS: LeadFilterPreset[] = [
  {
    id: "hotels",
    label: "Independent hotels",
    description: "Budget to 4★ hotels, guest houses, lodges and resorts — no chains, no 5★, no restaurants named \"hotel\".",
    filter: {
      ...DEFAULT_LEAD_FILTER,
      excludeBrands: [
        "Taj", "Vivanta", "SeleQtions", "Ginger", "IHCL", "Oberoi", "Trident", "ITC", "Welcomhotel", "Fortune", "Storii",
        "Marriott", "Courtyard", "Fairfield", "Renaissance", "Sheraton", "Westin", "Le Meridien", "Four Points", "Aloft", "St. Regis",
        "Hyatt", "Hilton", "Hampton", "DoubleTree", "Conrad", "Radisson", "Park Plaza", "Country Inn", "Novotel", "Ibis", "Pullman",
        "Sofitel", "Mercure", "Lemon Tree", "Red Fox", "Keys Select", "Keys Prima", "Holiday Inn", "Crowne Plaza", "InterContinental",
        "Clarks", "Sarovar", "Hometel", "Royal Orchid", "Regenta", "The Park Hotel", "Leela", "The Lalit", "Mayfair", "Pride Hotel",
        "Best Western", "Wyndham", "Ramada", "Days Inn", "Howard Johnson", "Golden Tulip", "Lebua", "Club Mahindra", "Sterling Holidays",
        "OYO", "Treebo", "FabHotel", "Fab Hotel", "Zostel", "Bloomrooms", "Itsy", "Collection O", "Townhouse", "Capital O",
        "tajhotels.com", "ihcltata.com", "marriott.com", "hyatt.com", "hilton.com", "ihg.com", "radissonhotels.com", "accor.com",
        "lemontreehotels.com", "itchotels.com", "oberoihotels.com", "fortunehotels.in", "sarovarhotels.com", "royalorchidhotels.com",
        "theparkhotels.com", "theleela.com", "thelalit.com", "wyndhamhotels.com", "bestwestern.com", "oyorooms.com", "treebo.com",
        "fabhotels.com", "clubmahindra.com", "sterlingholidays.com", "clarkshotels.com", "lebua.com",
      ],
      includeCategories: [
        "hotel", "guest house", "guesthouse", "lodge", "lodging", "resort", "inn", "homestay", "hostel", "motel",
        "bed & breakfast", "bed and breakfast", "dharamshala", "villa", "serviced apartment", "service apartment", "cottage",
      ],
      excludeCategories: ["restaurant", "dhaba", "banquet", "caterer", "cafe", "bar", "travel agency", "tour"],
      minReviews: 10,
      maxReviews: 2000,
      maxHotelStars: 4,
    },
  },
  {
    id: "schools",
    label: "Private schools",
    description: "Private schools and pre-schools — no government schools or big national chains.",
    filter: {
      ...DEFAULT_LEAD_FILTER,
      excludeBrands: [
        "Government", "Govt", "Rajkiya", "Prathmik Vidyalaya", "Kendriya Vidyalaya", "Navodaya", "Sainik School",
        "Army Public School", "Delhi Public School", "DPS", "Ryan International", "Podar", "DAV", "Amity",
        "City Montessori", "La Martiniere", "Kidzee", "EuroKids", "Kangaroo Kids", "Shemrock",
      ],
      includeCategories: ["school", "academy", "kindergarten", "preschool", "pre school", "play school", "playgroup", "education"],
      excludeCategories: ["university", "coaching", "driving", "dance", "music", "stationery", "book store", "uniform"],
      minReviews: 5,
      maxReviews: 3000,
    },
  },
  {
    id: "clinics",
    label: "Independent clinics",
    description: "Dentists and small clinics — no hospital chains, medical colleges or government hospitals.",
    filter: {
      ...DEFAULT_LEAD_FILTER,
      excludeBrands: [
        "Clove Dental", "Sabka Dentist", "Partha Dental", "FMS Dental", "Dentzz", "Apollo", "Max Healthcare", "Max Super Speciality",
        "Fortis", "Medanta", "Manipal", "Narayana", "AIIMS", "Government", "Govt", "District Hospital", "Medical College",
        "KGMU", "SGPGI", "Lohia", "Balrampur Hospital", "Civil Hospital", "ESIC",
        "clovedental.in", "sabkadentist.com", "apollohospitals.com", "maxhealthcare.in", "fortishealthcare.com", "medanta.org",
      ],
      includeCategories: ["dentist", "dental", "orthodontist", "clinic", "doctor", "physician", "specialist", "medical center"],
      excludeCategories: ["dental supply", "pharmacy", "medical store", "chemist", "laboratory", "diagnostic"],
      minReviews: 3,
      maxReviews: 2000,
    },
  },
  {
    id: "any",
    label: "Any business",
    description: "Only skips closed places. Add your own brands and rules.",
    filter: DEFAULT_LEAD_FILTER,
  },
];

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const words = (v: unknown, max = 300): string[] =>
  (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[\n,]/) : [])
    .map((s) => String(s).trim())
    .filter(Boolean)
    .slice(0, max);

/** Parse a stored / submitted filter; unknown or broken input falls back to defaults. */
export function parseLeadFilter(raw: unknown): LeadFilter {
  let o: Record<string, unknown> = {};
  if (typeof raw === "string" && raw.trim()) {
    try { o = JSON.parse(raw); } catch { o = {}; }
  } else if (raw && typeof raw === "object") {
    o = raw as Record<string, unknown>;
  }
  if (!o || typeof o !== "object" || Array.isArray(o)) o = {};
  const website = o.website === "with" || o.website === "without" ? o.website : "any";
  return {
    enabled: o.enabled !== false,
    excludeBrands: words(o.excludeBrands),
    includeCategories: words(o.includeCategories, 60),
    excludeCategories: words(o.excludeCategories, 60),
    minReviews: num(o.minReviews),
    maxReviews: num(o.maxReviews),
    minRating: num(o.minRating),
    maxRating: num(o.maxRating),
    maxHotelStars: num(o.maxHotelStars),
    website,
    skipClosed: o.skipClosed !== false,
  };
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whole-word (or phrase) match, plural allowed: "inn" matches "Inn" but not "Dinner". */
const hasWord = (text: string, word: string) =>
  new RegExp(`(^|[^a-z0-9])${escapeRegex(word.toLowerCase())}s?([^a-z0-9]|$)`).test(text);

function hostOf(url: unknown): string {
  if (typeof url !== "string" || !url.trim()) return "";
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** "4-star hotel", "3 stars" → 4 / 3 */
export function hotelStarsOf(place: Record<string, unknown>): number | null {
  const m = String(place.hotelStars ?? "").match(/(\d(?:\.\d)?)/);
  return m ? Number(m[1]) : null;
}

export function primaryCategoryOf(place: Record<string, unknown>): string {
  const cats = Array.isArray(place.categories) ? place.categories : [];
  return String(place.categoryName ?? place.category ?? cats[0] ?? "").toLowerCase();
}

/** Brands the place belongs to, by name or website domain. */
function matchedBrand(place: Record<string, unknown>, brands: string[]): string | null {
  const name = String(place.title ?? place.name ?? "").toLowerCase();
  const host = hostOf(place.website);
  for (const brand of brands) {
    const b = brand.toLowerCase();
    if (b.includes(".")) {
      if (host && (host === b || host.endsWith(`.${b}`))) return brand;
    } else if (name && hasWord(name, b)) {
      return brand;
    }
  }
  return null;
}

/**
 * Why a place is NOT an ideal customer, or null when it passes. Checks only
 * use fields the place actually has, so other scrapers (JustDial, custom) are
 * filtered on name/category alone.
 */
export function rejectReason(place: Record<string, unknown>, f: LeadFilter): string | null {
  if (!f.enabled) return null;
  if (f.skipClosed && (place.permanentlyClosed === true || place.temporarilyClosed === true)) return "closed";

  const brand = matchedBrand(place, f.excludeBrands);
  if (brand) return "chain / big brand";

  const category = primaryCategoryOf(place);
  if (category) {
    if (f.includeCategories.length && !f.includeCategories.some((c) => hasWord(category, c))) return "wrong category";
    if (f.excludeCategories.some((c) => hasWord(category, c))) return "wrong category";
  }

  const reviews = num(place.reviewsCount);
  if (reviews !== null) {
    if (f.minReviews !== null && reviews < f.minReviews) return "too few reviews";
    if (f.maxReviews !== null && reviews > f.maxReviews) return "too many reviews (too big)";
  }
  const rating = num(place.totalScore);
  if (rating !== null && rating > 0) {
    if (f.minRating !== null && rating < f.minRating) return "rating too low";
    if (f.maxRating !== null && rating > f.maxRating) return "rating too high";
  }
  const stars = hotelStarsOf(place);
  if (stars !== null && f.maxHotelStars !== null && stars > f.maxHotelStars) return "star class too high";

  if (f.website !== "any" && "website" in place) {
    const has = !!hostOf(place.website);
    if (f.website === "with" && !has) return "no website";
    if (f.website === "without" && has) return "has a website";
  }
  return null;
}

/** One-line summary for the sync preview. */
export function describeLeadFilter(f: LeadFilter): string {
  if (!f.enabled) return "Off — every scraped place becomes a lead.";
  const parts: string[] = [];
  if (f.excludeBrands.length) parts.push(`skips ${f.excludeBrands.length} chain brands`);
  if (f.includeCategories.length) parts.push(`only ${f.includeCategories.slice(0, 3).join(" / ")}${f.includeCategories.length > 3 ? "…" : ""}`);
  if (f.minReviews !== null || f.maxReviews !== null) parts.push(`${f.minReviews ?? 0}–${f.maxReviews ?? "∞"} reviews`);
  if (f.minRating !== null || f.maxRating !== null) parts.push(`rating ${f.minRating ?? 0}–${f.maxRating ?? 5}`);
  if (f.maxHotelStars !== null) parts.push(`up to ${f.maxHotelStars}★`);
  if (f.website !== "any") parts.push(f.website === "with" ? "with a website" : "without a website");
  if (f.skipClosed) parts.push("skips closed places");
  return parts.length ? `${parts.join(", ")}.` : "On, but no rules set.";
}
