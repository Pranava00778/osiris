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

- Wheel game: prize draw, code generation and caps run inside the `spin_wheel` database function under an advisory lock; server functions in src/lib/wheel.functions.ts call it with the service-role client. Why: one atomic place enforces uniqueness and stock across stateless workers.
- Prize odds/stock live server-only in src/lib/prizes.server.ts; public labels in src/lib/prizes.ts (same order). Why: odds stay private.
- Retired prizes resolve through a separate legacy lookup, never the active draw configuration. Why: existing codes retain their awards without reintroducing retired wheel segments.
- Staff desk auth is the STAFF_PIN secret with DB-backed lockout (staff_pin_fails). Why: no user accounts in this app.
