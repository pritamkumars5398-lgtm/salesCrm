interface Props {
  name: string;
  colorClass?: string;
  size?: number;
}

const AVATAR_COLORS = [
  "bg-[rgba(108,99,255,0.12)] text-[var(--color-accent2)]",
  "bg-[rgba(34,201,122,0.1)] text-[#22c97a]",
  "bg-[rgba(77,171,247,0.1)] text-[#4dabf7]",
  "bg-[rgba(245,166,35,0.1)] text-[#f5a623]",
  "bg-[rgba(204,153,255,0.1)] text-[#cc99ff]",
  "bg-[rgba(255,107,107,0.1)] text-[#ff6b6b]",
];

function colorFor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

export default function Avatar({ name, colorClass, size = 32 }: Props) {
  const cls = colorClass ?? colorFor(name);
  return (
    <div
      className={`rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0 ${cls}`}
      style={{ width: size, height: size }}
    >
      {initials(name)}
    </div>
  );
}
