import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

const OWNER_EMAIL = "sunburstpaints242@gmail.com";

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  useCase: z.string().max(300).optional().default(""),
  wouldRecommend: z.boolean(),
  comment: z.string().max(2000).optional().default(""),
  // Honeypot: real visitors never fill this in.
  website: z.string().max(200).optional().default(""),
});

const followUpSchema = z.object({
  reviewId: z.string().uuid(),
  comment: z.string().max(2000).optional().default(""),
  website: z.string().max(200).optional().default(""),
});


/** Saves the first screen. No email yet: low ratings get one after the follow-up note. */
export const submitReview = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => reviewSchema.parse(input))
  .handler(async ({ data }) => {
    if (data.website.trim() !== "") {
      return { ok: true as const, reviewId: null };
    }

    const comment = data.comment.trim();
    const useCase = data.useCase.trim();

    // Insert server-side: the public role may insert but not read back the new id.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row, error } = await supabaseAdmin
      .from("reviews")
      .insert({
        rating: data.rating,
        use_case: useCase || null,
        would_recommend: data.wouldRecommend,
        comment: comment || null,
      })
      .select("id")
      .single();

    if (error || !row) {
      console.error("Failed to save review", error);
      throw new Error("Could not save your feedback. Please try again.");
    }

    return { ok: true as const, reviewId: row.id };
  });

/** Adds the "what can we change" note to an existing low rating and alerts the owner. */
export const submitFollowUp = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => followUpSchema.parse(input))
  .handler(async ({ data }) => {
    if (data.website.trim() !== "") {
      return { ok: true as const, emailed: false };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing, error: readError } = await supabaseAdmin
      .from("reviews")
      .select("id, rating, use_case, would_recommend, comment, created_at")
      .eq("id", data.reviewId)
      .single();

    if (readError || !existing) {
      console.error("Follow-up for unknown review", readError);
      throw new Error("Could not save your message. Please try again.");
    }

    const followUp = data.comment.trim();
    const merged = [existing.comment, followUp].filter(Boolean).join("\n\n");

    if (followUp) {
      const { error: updateError } = await supabaseAdmin
        .from("reviews")
        .update({ comment: merged })
        .eq("id", existing.id);

      if (updateError) {
        console.error("Failed to update review", updateError);
        throw new Error("Could not save your message. Please try again.");
      }
    }

    const resendKey = process.env["RESEND_API_KEY"];
    if (!resendKey) {
      console.error("RESEND_API_KEY is not configured; skipping owner alert email");
      return { ok: true as const, emailed: false };
    }

    const timestamp = new Date(existing.created_at).toLocaleString("en-US", {
      timeZone: "America/Nassau",
      dateStyle: "full",
      timeStyle: "short",
    });

    const html = `
      <div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;color:#1c1917">
        <h2 style="margin:0 0 16px">New customer feedback (${existing.rating} / 5)</h2>
        <p style="margin:0 0 8px"><strong>Rating:</strong> ${existing.rating} out of 5</p>
        <p style="margin:0 0 8px"><strong>Used the paint for:</strong> ${escapeHtml(existing.use_case ?? "") || "—"}</p>
        <p style="margin:0 0 8px"><strong>Would recommend:</strong> ${existing.would_recommend ? "Yes" : "No"}</p>
        <p style="margin:0 0 8px"><strong>What they told us:</strong><br>${escapeHtml(merged) || "—"}</p>
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
        subject: `Sunburst Paints — ${existing.rating}-star feedback`,
        html,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`Resend request failed [${response.status}]: ${body}`);
      return { ok: true as const, emailed: false };
    }

    return { ok: true as const, emailed: true };
  });

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br>");
}
