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
  // Honeypot: real users never fill this in.
  website: z.string().max(200).optional().default(""),
});

export const submitReview = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => reviewSchema.parse(input))
  .handler(async ({ data }) => {
    // Spam trap: silently accept and discard.
    if (data.website.trim() !== "") {
      return { ok: true as const };
    }

    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const supabase = createClient<Database>(process.env["SUPABASE_URL"]!, key, {
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

    const comment = data.comment.trim();
    const useCase = data.useCase.trim();

    const { error } = await supabase.from("reviews").insert({
      rating: data.rating,
      use_case: useCase || null,
      would_recommend: data.wouldRecommend,
      comment: comment || null,
    });

    if (error) {
      console.error("Failed to save review", error);
      throw new Error("Could not save your feedback. Please try again.");
    }

    let emailed = false;

    if (data.rating <= 3) {
      const resendKey = process.env["RESEND_API_KEY"];
      if (!resendKey) {
        console.error("RESEND_API_KEY is not configured; skipping owner alert email");
      } else {
        const timestamp = new Date().toLocaleString("en-US", {
          timeZone: "America/Nassau",
          dateStyle: "full",
          timeStyle: "short",
        });

        const html = `
          <div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;color:#1c1917">
            <h2 style="margin:0 0 16px">New customer feedback (${data.rating} / 5)</h2>
            <p style="margin:0 0 8px"><strong>Rating:</strong> ${data.rating} out of 5</p>
            <p style="margin:0 0 8px"><strong>Used the paint for:</strong> ${escapeHtml(useCase) || "—"}</p>
            <p style="margin:0 0 8px"><strong>Would recommend:</strong> ${data.wouldRecommend ? "Yes" : "No"}</p>
            <p style="margin:0 0 8px"><strong>How we can improve:</strong><br>${escapeHtml(comment) || "—"}</p>
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
        } else {
          emailed = true;
        }
      }
    }

    return { ok: true as const, emailed };
  });

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br>");
}
