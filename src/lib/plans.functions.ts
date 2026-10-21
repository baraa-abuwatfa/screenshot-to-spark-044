import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// All database access goes through these server functions using the server-only key.
// The tables have RLS enabled with no public policies, so browsers cannot touch them directly.

const createSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().min(1, "Description is required").max(5000),
  goal: z.string().trim().max(500).optional().nullable(),
  additional_context: z.string().trim().max(5000).optional().nullable(),
});

export const createRequest = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => createSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("project_requests")
      .insert({
        title: data.title,
        description: data.description,
        goal: data.goal || null,
        additional_context: data.additional_context || null,
      })
      .select("id")
      .single();
    if (error) throw new Error("Could not save your request. Please try again.");
    return { id: row.id as string };
  });

export const listRequests = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("project_requests")
    .select("id, title, description, status, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error("Could not load your plans.");
  return data ?? [];
});

export const getRequest = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: request, error } = await supabaseAdmin
      .from("project_requests")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error("Could not load this request.");
    if (!request) return { request: null, plan: null };
    const { data: plan } = await supabaseAdmin
      .from("project_plans")
      .select("*")
      .eq("request_id", data.id)
      .maybeSingle();
    return { request, plan: plan ?? null };
  });
