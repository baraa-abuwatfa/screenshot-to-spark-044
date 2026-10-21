import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/StatusBadge";
import { createRequest, listRequests } from "@/lib/plans.functions";

export const requestsQuery = queryOptions({ queryKey: ["requests"], queryFn: () => listRequests() });

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PlanCraft AI — Turn your ideas into actionable plans" },
      { name: "description", content: "Describe your idea, generate a structured plan, and review practical next steps." },
      { property: "og:title", content: "PlanCraft AI" },
      { property: "og:description", content: "Turn your ideas into actionable plans." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="mx-auto max-w-5xl px-5 py-10">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">PlanCraft AI</p>
          <h1 className="mt-2 text-4xl font-semibold md:text-5xl">Turn your ideas into actionable plans.</h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Transform your ideas into structured plans and practical next steps.
          </p>
          <ol className="mt-6 flex flex-wrap gap-2 text-sm">
            {["Describe your idea", "Generate a plan", "Review the result"].map((s, i) => (
              <li key={s} className="rounded-full bg-secondary px-3 py-1">
                <span className="font-semibold text-primary">{i + 1}.</span> {s}
              </li>
            ))}
          </ol>
        </div>
      </header>
      <main className="mx-auto grid max-w-5xl gap-10 px-5 py-10 lg:grid-cols-[1.1fr_1fr]">
        <CreateForm />
        <MyPlans />
      </main>
    </div>
  );
}

function CreateForm() {
  const qc = useQueryClient();
  const create = useServerFn(createRequest);
  const [form, setForm] = useState({ title: "", description: "", goal: "", additional_context: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [savedId, setSavedId] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: () => create({ data: form }),
    onSuccess: (r) => {
      setSavedId(r.id);
      setForm({ title: "", description: "", goal: "", additional_context: "" });
      qc.invalidateQueries({ queryKey: ["requests"] });
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (m.isPending) return;
    const errs: Record<string, string> = {};
    if (!form.title.trim()) errs.title = "Please enter a project title.";
    if (!form.description.trim()) errs.description = "Please describe your idea.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSavedId(null);
    m.mutate();
  }

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <section aria-labelledby="create-heading" className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h2 id="create-heading" className="text-2xl font-semibold">Create a plan</h2>
      <form onSubmit={onSubmit} className="mt-5 space-y-4" noValidate>
        <Field id="title" label="Project Title" required error={errors.title}>
          <Input id="title" value={form.title} onChange={set("title")} maxLength={200} aria-invalid={!!errors.title} />
        </Field>
        <Field id="description" label="Project Description" required error={errors.description}>
          <Textarea id="description" rows={5} value={form.description} onChange={set("description")} maxLength={5000}
            placeholder="Explain your idea and what you want to achieve." aria-invalid={!!errors.description} />
        </Field>
        <Field id="goal" label="Main Goal">
          <Input id="goal" value={form.goal} onChange={set("goal")} maxLength={500} />
        </Field>
        <Field id="ctx" label="Additional Context">
          <Textarea id="ctx" rows={3} value={form.additional_context} onChange={set("additional_context")} maxLength={5000}
            placeholder="Constraints, budget, audience, or other useful details." />
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={m.isPending}>
          {m.isPending ? "Saving…" : "Generate My Plan"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Your request is saved first. AI generation becomes available once the automation integration is configured.
        </p>
        {m.isError && <p role="alert" className="text-sm text-destructive">{(m.error as Error).message}</p>}
        {savedId && (
          <div role="status" className="rounded-lg bg-secondary p-3 text-sm">
            Request saved.{" "}
            <Link to="/plans/$id" params={{ id: savedId }} className="font-semibold text-primary underline">
              Open it
            </Link>
          </div>
        )}
      </form>
    </section>
  );
}

function Field({ id, label, required, error, children }: { id: string; label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label} {required ? <span className="text-destructive">*</span> : <span className="text-muted-foreground font-normal">(optional)</span>}
      </Label>
      {children}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function MyPlans() {
  const q = useQuery(requestsQuery);
  return (
    <section aria-labelledby="plans-heading">
      <h2 id="plans-heading" className="text-2xl font-semibold">My Plans</h2>
      <div className="mt-5 space-y-3">
        {q.isLoading && [0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />)}
        {q.isError && (
          <div className="rounded-xl border border-border p-4 text-sm">
            <p className="text-destructive">Couldn't load your plans.</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => q.refetch()}>Try again</Button>
          </div>
        )}
        {q.data?.length === 0 && (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No requests yet. Describe your first idea to get started.
          </p>
        )}
        {q.data?.map((r) => (
          <Link key={r.id} to="/plans/$id" params={{ id: r.id }}
            className="block rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold">{r.title}</h3>
              <StatusBadge status={r.status} />
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{r.description}</p>
            <p className="mt-2 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
