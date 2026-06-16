"use client";
import { useAppStore } from "@/store/useAppStore";
import { IconCheck, IconX } from "@tabler/icons-react";

export default function ToastContainer() {
  const { toasts, dismissToast } = useAppStore();

  return (
    <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-[999] pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="flex items-center gap-2 px-4 py-2.5 rounded-[10px] text-white text-[13px] font-medium shadow-lg pointer-events-auto"
          style={{ background: t.type === "error" ? "#ff6b6b" : "#22c97a" }}
        >
          {t.type === "error" ? <IconX size={15} /> : <IconCheck size={15} />}
          {t.message}
          <button
            onClick={() => dismissToast(t.id)}
            className="ml-2 opacity-70 hover:opacity-100"
          >
            <IconX size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
