<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- All database access goes through server functions in src/lib/*.functions.ts using the server-only admin client; tables have RLS on with no public policies. Why: no auth yet, so browsers must never read/write tables directly.
- Plan generation is triggered only via src/lib/generation.functions.ts, which POSTs to the N8N_WEBHOOK_URL secret; n8n writes project_plans and request status itself. Why: keeps credentials server-side and supports async polling.
