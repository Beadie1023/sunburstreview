import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const OWNER_EMAIL = "sunburstpaints242@gmail.com";

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  useCase: z.string().max(300).optional().default(""),
  wouldRecommend: z.boolean(),
  comment: z.string().max(2000).optional().default(""),
  // Honeypot: real visitors never fill this in.
  website: z.string().max(200).optional().default(""),
});

/**
 * Saves the single-screen review. 4-5 stars: the client redirects straight to
 * Google — nothing else to do here. 1-3 stars: we email the owner immediately
 * with everything already collected, so the customer never has to fill out a
 * second form.
 */
export const submitReview = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => reviewSchema.parse(input))
  .handler(async ({ data }) => {
    if (data.website.trim() !== "") {
      return { ok: true as const };
    }

    const comment = data.comment.trim();
    const useCase = data.useCase.trim();

    // Runs server-side only, so it's safe to use the admin client here.
    // The anon key can INSERT but has no SELECT policy, so it can't read
    // the row back after inserting — the admin client bypasses that.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row, error } = await supabaseAdmin
      .from("reviews")
      .insert({
        rating: data.rating,
        use_case: useCase || null,
        would_recommend: data.wouldRecommend,
        comment: comment || null,
      })
      .select("id, created_at")
      .single();

    if (error || !row) {
      console.error("Failed to save review", error);
      throw new Error("Could not save your feedback. Please try again.");
    }

    if (data.rating <= 3) {
      await alertOwner({
        rating: data.rating,
        useCase,
        wouldRecommend: data.wouldRecommend,
        comment,
        createdAt: row.created_at,
      });
    }

    return { ok: true as const };
  });

async function alertOwner(input: {
  rating: number;
  useCase: string;
  wouldRecommend: boolean;
  comment: string;
  createdAt: string;
}) {
  const resendKey = process.env["RESEND_API_KEY"];
  if (!resendKey) {
    console.error("RESEND_API_KEY is not configured; skipping owner alert email");
    return;
  }

  const timestamp = new Date(input.createdAt).toLocaleString("en-US", {
    timeZone: "America/Nassau",
    dateStyle: "full",
    timeStyle: "short",
  });

  const html = `
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;color:#1c1917">
      <h2 style="margin:0 0 16px">New customer feedback (${input.rating} / 5)</h2>
      <p style="margin:0 0 8px"><strong>Rating:</strong> ${input.rating} out of 5</p>
      <p style="margin:0 0 8px"><strong>Used the paint for:</strong> ${escapeHtml(input.useCase) || "—"}</p>
      <p style="margin:0 0 8px"><strong>Would recommend:</strong> ${input.wouldRecommend ? "Yes" : "No"}</p>
      <p style="margin:0 0 8px"><strong>How we can improve:</strong><br>${escapeHtml(input.comment) || "—"}</p>
      <p style="margin:16px 0 0;color:#78716c"><strong>Submitted:</strong> ${timestamp} (Nassau)</p>
    </div>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendKey}`,
    },
    body: JSON.stringify({
      from: "Sunburst Feedback <onboarding@resend.dev>",
      to: [OWNER_EMAIL],
      subject: `Sunburst Paints — ${input.rating}-star feedback`,
      html,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`Resend request failed [${response.status}]: ${body}`);
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br>");
}
