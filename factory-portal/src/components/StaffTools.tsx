"use client";

import { useState } from "react";

export function StaffTools({ token, openingSent }: { token: string; openingSent: boolean }) {
  const [message, setMessage] = useState<string | null>(openingSent ? "ส่งสรุปวันเปิดใช้ไปแล้ว" : null);
  const [sending, setSending] = useState(false);

  async function sendOpening() {
    setSending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/staff/opening", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = (await response.json()) as { message?: string; error?: string };
      setMessage(body.message ?? body.error ?? "ส่งเมลไม่สำเร็จ");
    } catch {
      setMessage("ส่งเมลไม่สำเร็จ");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-6">
      <button
        type="button"
        disabled={sending || openingSent}
        onClick={() => void sendOpening()}
        className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {sending ? "กำลังส่ง…" : "ส่งสรุปเคสปีนี้ทางอีเมล"}
      </button>
      {message && <p className="mt-3 text-sm text-slate-700">{message}</p>}
    </div>
  );
}
