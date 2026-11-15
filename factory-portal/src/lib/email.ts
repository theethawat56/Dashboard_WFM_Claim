export async function sendMail(subject: string, text: string): Promise<{ sent: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY?.trim();
  const to = process.env.FACTORY_PORTAL_NOTIFY_EMAIL?.trim() || "theethawat56@gmail.com";
  const from = process.env.FACTORY_PORTAL_FROM?.trim() || "Factory Claims <onboarding@resend.dev>";
  if (!key) return { sent: false, error: "RESEND_API_KEY is not set" };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });
  if (!response.ok) {
    const detail = await response.text();
    return { sent: false, error: detail.slice(0, 500) };
  }
  return { sent: true };
}
