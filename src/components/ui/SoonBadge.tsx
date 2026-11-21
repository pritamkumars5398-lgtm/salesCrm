/** Small purple "Soon" pill for features that aren't live yet. */
export default function SoonBadge({ label = "Soon" }: { label?: string }) {
  return (
    <span
      className="text-[9.5px] font-bold uppercase tracking-wide px-1.5 py-px rounded-full whitespace-nowrap"
      style={{ background: "rgba(139,92,246,0.14)", color: "#8b5cf6" }}
    >
      {label}
    </span>
  );
}
