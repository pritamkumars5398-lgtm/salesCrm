"use client";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";

interface Props {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  /** Plural noun for the summary line, e.g. "leads". */
  label?: string;
  disabled?: boolean;
}

/**
 * Builds the page buttons with `…` gaps, always keeping the first page, the
 * last page and a window around the current one — e.g. `1 … 4 5 6 … 20`.
 */
function pageItems(page: number, totalPages: number): (number | "gap")[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);

  const items: (number | "gap")[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);

  if (start > 2) items.push("gap");
  for (let p = start; p <= end; p++) items.push(p);
  if (end < totalPages - 1) items.push("gap");
  items.push(totalPages);

  return items;
}

const btnBase: React.CSSProperties = {
  minWidth: 30,
  height: 30,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 8px",
  fontSize: 12.5,
  fontWeight: 600,
  borderRadius: "var(--radius-lg)",
  border: "1px solid var(--color-bg4)",
  background: "var(--color-bg2)",
  color: "var(--color-text2)",
  cursor: "pointer",
  transition: "all var(--transition-fast)",
};

export default function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [25, 50, 100],
  label = "items",
  disabled = false,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const go = (p: number) => {
    if (disabled) return;
    const next = Math.min(totalPages, Math.max(1, p));
    if (next !== page) onPageChange(next);
  };

  return (
    <div
      className="flex flex-wrap items-center gap-3"
      style={{ padding: "12px 16px", borderTop: "1px solid var(--color-bg4)" }}
    >
      <span style={{ fontSize: 12.5, color: "var(--color-text3)" }}>
        Showing <b style={{ color: "var(--color-text2)" }}>{from.toLocaleString()}–{to.toLocaleString()}</b> of{" "}
        <b style={{ color: "var(--color-text2)" }}>{total.toLocaleString()}</b> {label}
      </span>

      {onPageSizeChange && (
        <label className="flex items-center gap-1.5" style={{ fontSize: 12.5, color: "var(--color-text3)" }}>
          Rows
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            disabled={disabled}
            className="form-input"
            style={{ width: "auto", padding: "4px 8px", fontSize: 12.5 }}
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
      )}

      <div className="flex items-center gap-1 ml-auto">
        <button
          onClick={() => go(page - 1)}
          disabled={disabled || page === 1}
          style={{ ...btnBase, opacity: disabled || page === 1 ? 0.45 : 1, cursor: page === 1 ? "not-allowed" : "pointer" }}
          aria-label="Previous page"
        >
          <IconChevronLeft size={15} />
        </button>

        {pageItems(page, totalPages).map((item, i) =>
          item === "gap" ? (
            <span key={`gap-${i}`} style={{ padding: "0 4px", fontSize: 12.5, color: "var(--color-text4)" }}>…</span>
          ) : (
            <button
              key={item}
              onClick={() => go(item)}
              disabled={disabled}
              aria-current={item === page ? "page" : undefined}
              style={{
                ...btnBase,
                background: item === page ? "var(--color-primary-subtle)" : "var(--color-bg2)",
                borderColor: item === page ? "rgba(223,42,42,0.3)" : "var(--color-bg4)",
                color: item === page ? "var(--color-primary-light)" : "var(--color-text2)",
                fontWeight: item === page ? 700 : 600,
              }}
            >
              {item}
            </button>
          )
        )}

        <button
          onClick={() => go(page + 1)}
          disabled={disabled || page === totalPages}
          style={{ ...btnBase, opacity: disabled || page === totalPages ? 0.45 : 1, cursor: page === totalPages ? "not-allowed" : "pointer" }}
          aria-label="Next page"
        >
          <IconChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}
