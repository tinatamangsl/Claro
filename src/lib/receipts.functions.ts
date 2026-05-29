import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SYSTEM_PROMPT = `You are a receipt parser. The user will send a photo of a paper receipt.
Extract the following fields and respond with ONLY valid JSON (no markdown, no commentary):

{
  "merchant": string | null,        // store name on the receipt
  "total": number | null,           // grand total (after tax), as a plain number
  "currency": "USD"|"EUR"|"GBP"|"CAD"|"AUD"|"JPY"|"INR"|"BRL"|"MXN"|"CHF"|"SEK"|"NOK"|"DKK"|"PLN"|"ZAR"|"OTHER",
  "date": string | null,            // ISO date YYYY-MM-DD, or null if unreadable
  "category": "groceries"|"household"|"pharmacy"|"bills"|"repairs"|"subscriptions"|"restaurant"|"transport"|"other",
  "items": [ { "name": string, "price": number | null } ]  // up to 20 line items, optional
}

If you cannot read the image, return all nulls and an empty items array. Never invent values.`;

const ResultSchema = z.object({
  merchant: z.string().nullable(),
  total: z.number().nullable(),
  currency: z.string().default("USD"),
  date: z.string().nullable(),
  category: z.string().default("other"),
  items: z
    .array(z.object({ name: z.string(), price: z.number().nullable().optional() }))
    .default([]),
});

export type ParsedReceipt = z.infer<typeof ResultSchema>;

export const parseReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { imageBase64: string; mimeType?: string }) =>
    z
      .object({
        imageBase64: z.string().min(20).max(15_000_000),
        mimeType: z.string().max(64).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<ParsedReceipt> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

    const mime = data.mimeType || "image/jpeg";
    const dataUrl = data.imageBase64.startsWith("data:")
      ? data.imageBase64
      : `data:${mime};base64,${data.imageBase64}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "Parse this receipt and return JSON only." },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 429) throw new Error("Receipt scanning is busy — try again in a moment.");
      if (res.status === 402) throw new Error("AI credits exhausted — add funds in Workspace settings.");
      throw new Error(`Receipt parse failed (${res.status}): ${body.slice(0, 200)}`);
    }

    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = json?.choices?.[0]?.message?.content ?? "{}";
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error("Receipt response was not valid JSON");
    }
    return ResultSchema.parse(parsed);
  });
