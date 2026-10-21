import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { canStartGeneration, STALE_PROCESSING_MS } from "./generation-rules";

// Integration point for n8n Cloud (N8N_WEBHOOK_URL, optional N8N_WEBHOOK_SECRET).
// Flow: validate id -> check eligibility -> atomically claim (status -> processing)
// -> POST to n8n -> n8n saves the plan and sets status completed/failed.
// The frontend then polls the request status.

export type GenerateResult =
  | { ok: true; status: "processing" }
  | { ok: false; reason: "not_configured" | "not_found" | "not_eligible" | "upstream_error"; message: string };

export const triggerPlanGeneration = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }): Promise<GenerateResult> => {
    const webhookUrl = process.env["N8N_WEBHOOK_URL"]?.trim();
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
      .select("id, title, description, goal, additional_context, status, updated_at")
      .eq("id", data.id)
      .maybeSingle();
    if (!req) return { ok: false, reason: "not_found", message: "This request no longer exists." };

    const { count } = await supabaseAdmin
      .from("project_plans")
      .select("id", { count: "exact", head: true })
      .eq("request_id", req.id);
    const hasPlan = (count ?? 0) > 0;
    if (!canStartGeneration(req.status, hasPlan, req.updated_at)) {
      return {
        ok: false,
        reason: "not_eligible",
        message: hasPlan || req.status === "completed"
          ? "This request already has a plan."
          : "This request is already being analyzed.",
      };
    }

    // Atomic claim: only one caller can move the row into "processing".
    // A second click / concurrent call matches zero rows and is rejected.
    const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS).toISOString();
    const { data: claimed } = await supabaseAdmin
      .from("project_requests")
      .update({ status: "processing" })
      .eq("id", req.id)
      .or(`status.in.(pending,failed),and(status.eq.processing,updated_at.lt.${staleBefore})`)
      .select("id");
    if (!claimed || claimed.length === 0) {
      return { ok: false, reason: "not_eligible", message: "This request is already being analyzed." };
    }

    try {
      const headers: Record<string, string> = { "content-type": "application/json" };
      const secret = process.env["N8N_WEBHOOK_SECRET"];
      if (secret) headers["x-plancraft-secret"] = secret;
      const res = await fetch(new URL(webhookUrl).toString(), {
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
      if (!res.ok) {
        const body = (await res.text()).slice(0, 500);
        console.error(`n8n workflow failed [${res.status}]: ${body}`);
        await supabaseAdmin.from("project_requests").update({ status: "failed" }).eq("id", req.id);
        return {
          ok: false,
          reason: "upstream_error",
          message: `The plan generator (n8n) received the request but its workflow failed (error ${res.status}). Please check the n8n workflow, then try again.`,
        };
      }
      return { ok: true, status: "processing" };
    } catch (e) {
      // A timeout means n8n accepted the request but is still running; keep "processing"
      // and let polling pick up the result instead of overwriting it with "failed".
      if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
        console.warn("n8n did not respond within 15s; leaving request in processing");
        return { ok: true, status: "processing" };
      }
      console.error("n8n trigger failed", e);
      await supabaseAdmin.from("project_requests").update({ status: "failed" }).eq("id", req.id);
      return { ok: false, reason: "upstream_error", message: "The automation service couldn't be reached. Please try again later." };
    }
  });
