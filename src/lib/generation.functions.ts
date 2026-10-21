import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Integration point for n8n Cloud. Not active until the server secret
// N8N_WEBHOOK_URL (and optionally N8N_WEBHOOK_SECRET) is configured.
// Flow: validate id -> check request exists & eligible -> mark processing ->
// POST to n8n -> n8n saves the plan and sets status completed/failed.
// The frontend then polls the request status.

export type GenerateResult =
  | { ok: true; status: "processing" }
  | { ok: false; reason: "not_configured" | "not_found" | "not_eligible" | "upstream_error"; message: string };

export const triggerPlanGeneration = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }): Promise<GenerateResult> => {
    const webhookUrl = process.env["N8N_WEBHOOK_URL"];
    if (!webhookUrl) {
      return {
        ok: false,
        reason: "not_configured",
        message: "Plan generation isn't connected yet. Your request is saved and will be ready to analyze once the n8n workflow is configured.",
      };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: req } = await supabaseAdmin
      .from("project_requests")
      .select("id, title, description, goal, additional_context, status")
      .eq("id", data.id)
      .maybeSingle();
    if (!req) return { ok: false, reason: "not_found", message: "This request no longer exists." };
    if (req.status === "processing")
      return { ok: false, reason: "not_eligible", message: "This request is already being analyzed." };

    await supabaseAdmin.from("project_requests").update({ status: "processing" }).eq("id", req.id);

    try {
      const headers: Record<string, string> = { "content-type": "application/json" };
      const secret = process.env["N8N_WEBHOOK_SECRET"];
      if (secret) headers["x-plancraft-secret"] = secret;
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          request_id: req.id,
          title: req.title,
          description: req.description,
          goal: req.goal,
          additional_context: req.additional_context,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`n8n responded ${res.status}`);
      return { ok: true, status: "processing" };
    } catch (e) {
      console.error("n8n trigger failed", e);
      await supabaseAdmin.from("project_requests").update({ status: "failed" }).eq("id", req.id);
      return { ok: false, reason: "upstream_error", message: "The automation service couldn't be reached. Please try again later." };
    }
  });
