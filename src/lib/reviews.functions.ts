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
  // Optional second-screen note, only present on the low-rating path.
  followUp: z.string().max(2000).optional().default(""),
  // Honeypot: real visitors never fill this in.
  website: z.string().max(200).optional().default(""),
});

type ReviewInput = z.infer<typeof reviewSchema>;

function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

function mergedComment(data: ReviewInput) {
  return [data.comment.trim(), data.followUp.trim()].filter(Boolean).join("\n\n");
}

async function saveReview(data: ReviewInput) {
  const { error } = await publicClient()
    .from("reviews")
    .insert({
      rating: data.rating,
      use_case: data.useCase.trim() || null,
      would_recommend: data.wouldRecommend,
      comment: mergedComment(data) || null,
    });

  if (error) {
    console.error("Failed to save review", error);
    throw new Error("Could not save your feedback. Please try again.");
  }
}

/**
 * First screen. Happy ratings are stored right away; low ratings wait for the
 * follow-up screen so the whole story lands in a single row and a single email.
 */
export const submitReview = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => reviewSchema.parse(input))
  .handler(async ({ data }) => {
    if (data.website.trim() !== "") return { ok: true as const };
    if (data.rating >= 4) await saveReview(data);
    return { ok: true as const };
  });

/** Low-rating path: stores the single row and emails the owner. */
export const submitFollowUp = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => reviewSchema.parse(input))
  .handler(async ({ data }) => {
    if (data.website.trim() !== "") return { ok: true as const, emailed: false };

    await saveReview(data);

    const resendKey = process.env["RESEND_API_KEY"];
    if (!resendKey) {
      console.error("RESEND_API_KEY is not configured; skipping owner alert email");
      return { ok: true as const, emailed: false };
    }

    const timestamp = new Date().toLocaleString("en-US", {
      timeZone: "America/Nassau",
      dateStyle: "full",
      timeStyle: "short",
    });

    const html = `
      <div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;color:#1c1917">
        <h2 style="margin:0 0 16px">New customer feedback (${data.rating} / 5)</h2>
        <p style="margin:0 0 8px"><strong>Rating:</strong> ${data.rating} out of 5</p>
        <p style="margin:0 0 8px"><strong>Used the paint for:</strong> ${escapeHtml(data.useCase.trim()) || "—"}</p>
        <p style="margin:0 0 8px"><strong>Would recommend:</strong> ${data.wouldRecommend ? "Yes" : "No"}</p>
        <p style="margin:0 0 8px"><strong>What they told us:</strong><br>${escapeHtml(mergedComment(data)) || "—"}</p>
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
        subject: `Sunburst Paints — ${data.rating}-star feedback`,
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
