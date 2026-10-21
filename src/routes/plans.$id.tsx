import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/StatusBadge";
import { getRequest, updateRequest } from "@/lib/plans.functions";
import { triggerPlanGeneration } from "@/lib/generation.functions";
import { canEditRequest, canStartGeneration } from "@/lib/generation-rules";

type EditableRequest = { id: string; title: string; description: string; goal: string | null; additional_context: string | null };

function EditForm({ request, onCancel, onSaved }: { request: EditableRequest; onCancel: () => void; onSaved: () => void }) {
  const save = useServerFn(updateRequest);
  const [form, setForm] = useState({
    title: request.title,
    description: request.description,
    goal: request.goal ?? "",
    additional_context: request.additional_context ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () => save({ data: { id: request.id, ...form } }),
    onSuccess: onSaved,
    onError: (e) => setError((e as Error).message || "Could not save your changes."),
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (m.isPending) return;
        if (!form.title.trim()) return setError("Please enter a project title.");
        if (!form.description.trim()) return setError("Please describe your idea.");
        setError(null);
        m.mutate();
      }}
    >
      <h1 className="text-2xl font-semibold">Edit request</h1>
      <div className="space-y-1.5"><Label htmlFor="e-title">Project Title *</Label>
        <Input id="e-title" value={form.title} onChange={set("title")} maxLength={200} /></div>
      <div className="space-y-1.5"><Label htmlFor="e-desc">Project Description *</Label>
        <Textarea id="e-desc" rows={5} value={form.description} onChange={set("description")} maxLength={5000} /></div>
      <div className="space-y-1.5"><Label htmlFor="e-goal">Main Goal</Label>
        <Input id="e-goal" value={form.goal} onChange={set("goal")} maxLength={500} /></div>
      <div className="space-y-1.5"><Label htmlFor="e-ctx">Additional Context</Label>
        <Textarea id="e-ctx" rows={3} value={form.additional_context} onChange={set("additional_context")} maxLength={5000} /></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={m.isPending}>{m.isPending ? "Saving…" : "Save Changes"}</Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={m.isPending}>Cancel</Button>
      </div>
    </form>
  );
}

export const Route = createFileRoute("/plans/$id")({
  head: () => ({
    meta: [
      { title: "Plan details — PlanCraft AI" },
      { name: "description", content: "Review your project request and its structured plan." },
      { property: "og:title", content: "Plan details — PlanCraft AI" },
      { property: "og:description", content: "Review your project request and its structured plan." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlanPage,
});

type Phase = { title?: unknown; objective?: unknown; description?: unknown; actions?: unknown; priority?: unknown };
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
const toText = (v: unknown): string | null =>
  str(v) ?? (v && typeof v === "object" ? str((v as any).title) ?? str((v as any).action) ?? str((v as any).description) ?? str((v as any).risk) : null);
const textList = (v: unknown) => (Array.isArray(v) ? v.map(toText).filter((x): x is string => !!x) : []);

function PlanPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const fetchReq = useServerFn(getRequest);
  const trigger = useServerFn(triggerPlanGeneration);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const valid = /^[0-9a-f-]{36}$/i.test(id);

  const q = useQuery({
    queryKey: ["request", id],
    queryFn: () => fetchReq({ data: { id } }),
    enabled: valid,
    refetchInterval: (query) => (query.state.data?.request?.status === "processing" ? 5000 : false),
  });

  const gen = useMutation({
    mutationFn: () => trigger({ data: { id } }),
    onSuccess: (r) => {
      setNotice(r.ok ? "Analysis started. This page will update when the plan is ready." : r.message);
      qc.invalidateQueries({ queryKey: ["request", id] });
      qc.invalidateQueries({ queryKey: ["requests"] });
    },
    onError: () => setNotice("Something went wrong. Please try again."),
  });

  const back = (
    <Link to="/" className="text-sm font-semibold text-primary hover:underline">← Back to My Plans</Link>
  );

  if (!valid || (q.data && !q.data.request))
    return <Shell>{back}<p className="mt-8 text-muted-foreground">This request could not be found.</p></Shell>;
  if (q.isLoading) return <Shell>{back}<div className="mt-8 h-48 animate-pulse rounded-2xl bg-muted" /></Shell>;
  if (q.isError)
    return <Shell>{back}<p className="mt-8 text-destructive">Couldn't load this request.</p>
      <Button variant="outline" className="mt-3" onClick={() => q.refetch()}>Try again</Button></Shell>;

  const { request: r, plan } = q.data!;
  if (!r) return null;
  const canGenerate = canStartGeneration(r.status, !!plan, r.updated_at);
  const phases: Phase[] = Array.isArray(plan?.phases) ? (plan!.phases as Phase[]).filter((p) => p && typeof p === "object") : [];
  const actions = textList(plan?.recommended_actions);
  const risks = textList(plan?.risks);

  return (
    <Shell>
      {back}
      <article className="mt-6 rounded-2xl border border-border bg-card p-6">
        {editing && canEditRequest(r.status, !!plan) ? (
          <EditForm
            request={r}
            onCancel={() => setEditing(false)}
            onSaved={() => {
              setEditing(false);
              setNotice("Changes saved. You can now try generating again.");
              qc.invalidateQueries({ queryKey: ["request", id] });
              qc.invalidateQueries({ queryKey: ["requests"] });
            }}
          />
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h1 className="text-3xl font-semibold">{r.title}</h1>
              <StatusBadge status={r.status} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Created {new Date(r.created_at).toLocaleString()}</p>
            <Detail label="Description" value={r.description} />
            <Detail label="Main Goal" value={r.goal} />
            <Detail label="Additional Context" value={r.additional_context} />
            {!plan && (
              <div className="mt-6">
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => { if (!gen.isPending) gen.mutate(); }} disabled={gen.isPending || !canGenerate}>
                    {gen.isPending ? "Sending…" : r.status === "processing" ? "Analyzing…" : r.status === "failed" ? "Try Again" : "Generate My Plan"}
                  </Button>
                  {canEditRequest(r.status, !!plan) && (
                    <Button variant="outline" onClick={() => { setNotice(null); setEditing(true); }} disabled={gen.isPending}>
                      Edit Request
                    </Button>
                  )}
                </div>
                {notice && <p role="status" className="mt-3 rounded-lg bg-secondary p-3 text-sm">{notice}</p>}
              </div>
            )}
          </>
        )}
      </article>

      {!plan ? (
        <p className="mt-8 rounded-2xl border border-dashed border-border p-6 text-center text-muted-foreground">
          {r.status === "processing"
            ? "Your plan is being generated. This page updates automatically."
            : r.status === "failed"
              ? "The last generation attempt failed. You can try again."
              : "Your request is saved. Click Generate My Plan to create it."}
        </p>
      ) : (
        <div className="mt-8 space-y-8">
          <Section title="Summary"><p>{plan.summary}</p></Section>
          {str(plan.project_goal) && <Section title="Project Goal"><p>{plan.project_goal}</p></Section>}
          {str(plan.estimated_duration) && <Section title="Estimated Duration"><p>{plan.estimated_duration}</p></Section>}
          {phases.length > 0 && (
            <Section title="Execution Phases">
              <ol className="space-y-3">
                {phases.map((p, i) => {
                  const acts = textList(p.actions);
                  return (
                    <li key={i} className="rounded-xl border border-border bg-card p-4">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-semibold">{i + 1}. {str(p.title) ?? `Phase ${i + 1}`}</h3>
                        {str(p.priority) && <span className="text-xs uppercase tracking-wide text-muted-foreground">{p.priority as string}</span>}
                      </div>
                      {str(p.objective) && <p className="mt-1 text-sm font-medium">{p.objective as string}</p>}
                      {str(p.description) && <p className="mt-1 text-sm text-muted-foreground">{p.description as string}</p>}
                      {acts.length > 0 && <ul className="mt-2 list-disc pl-5 text-sm">{acts.map((a, j) => <li key={j}>{a}</li>)}</ul>}
                    </li>
                  );
                })}
              </ol>
            </Section>
          )}
          {actions.length > 0 && <Section title="Recommended Actions"><ul className="list-disc space-y-1 pl-5">{actions.map((a, i) => <li key={i}>{a}</li>)}</ul></Section>}
          {risks.length > 0 && <Section title="Risks and Considerations"><ul className="list-disc space-y-1 pl-5">{risks.map((a, i) => <li key={i}>{a}</li>)}</ul></Section>}
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto min-h-screen max-w-3xl px-5 py-10">{children}</main>;
}
function Detail({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return <div className="mt-4"><h2 className="text-sm font-semibold text-muted-foreground">{label}</h2><p className="mt-1 whitespace-pre-wrap">{value}</p></div>;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h2 className="mb-3 text-xl font-semibold">{title}</h2>{children}</section>;
}
