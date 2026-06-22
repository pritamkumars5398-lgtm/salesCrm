# Code Rules — SalesAgent

Rules every contributor must follow. These are non-negotiable.

---

## 1. Naming

- **Files:** PascalCase for components (`LeadDetailPanel.tsx`), kebab-case for routes and utilities (`use-app-store.ts`)
- **Variables / functions:** camelCase (`fetchLeads`, `activeAgent`)
- **Constants:** SCREAMING_SNAKE for module-level config (`PLAN_LIMITS`, `STATUS_TABS`)
- **Types / Interfaces:** PascalCase, no `I` prefix (`Lead`, `AgentSettings`)
- Names must say what the thing *is* or *does* — no `data`, `info`, `temp`, `val`

---

## 2. Components

- One component per file. No barrel `index.ts` re-exports unless explicitly needed.
- Props interface goes directly above the component that uses it.
- Never derive state from props in `useState` — use the prop directly or `useMemo`.
- Keep JSX trees shallow. If a block needs a name to be understood, extract it.
- No inline arrow functions that create new objects/arrays in JSX — extract them above the `return`.

```tsx
// bad
<List items={leads.filter(l => l.status === "new")} />

// good
const newLeads = leads.filter((l) => l.status === "new");
<List items={newLeads} />
```

---

## 3. State Management

- **Zustand store** is for global state shared across pages (agents, leads, drawer, toast).
- **`useState`** for local UI state (loading, modal open, form values).
- **Never** put derived data in the store — compute it from existing state.
- Reset slices of store on logout (`agents: [], leads: [], activeAgent: null`).

---

## 4. API Routes

- Every `route.ts` must export only `GET`, `POST`, `PUT`, `PATCH`, `DELETE` — no helper functions exported.
- Always return `NextResponse.json(...)` — never a raw `Response`.
- Validate `agentId` / required fields at the top, return `400` immediately if missing.
- Wrap DB calls in `try/catch`, return `500` with a message — never let errors reach the client silently.

```ts
// every handler starts with this pattern
const { agentId } = await req.json();
if (!agentId) return NextResponse.json({ error: "agentId required" }, { status: 400 });
```

---

## 5. Database / Mongoose

- Always call `dbConnect()` at the top of every route handler.
- Use `lean()` on read queries — never return full Mongoose documents to the client.
- Index fields you filter on (`agentId`, `month`, `status`).
- Schema fields that have a default must declare it — never rely on `undefined` downstream.

---

## 6. TypeScript

- **No `any`** — use `unknown` and narrow, or define a proper type.
- Every API response must have a typed interface in `src/store/types.ts` or co-located.
- Avoid type assertions (`as X`) unless you're 100% sure and add a comment why.
- `React.ElementType` for icon/component props, not `React.FC`.

---

## 7. Styling

- Use Tailwind for layout, spacing, and responsive utilities.
- Use inline `style={{}}` for dynamic values (colors, widths from data).
- CSS variables (`var(--color-bg)`, `var(--color-text)`) for all theme tokens — never hardcode `#fff` or `#000` for theme colors.
- No magic pixel numbers — use the spacing scale. If you must hardcode, leave a comment.

---

## 8. Error Handling

- Validate at system boundaries only: API route inputs, `localStorage` reads, external API calls.
- Wrap `JSON.parse` of any external/stored data in `try/catch`.
- Show user-facing errors via `showToast(msg, "error")` — never `alert()` or `console.error` alone.
- Don't swallow errors with empty `catch {}` — at minimum log them.

---

## 9. Comments

- Write **zero** comments for obvious code.
- Only comment the **why**, not the what:
  - A non-obvious constraint
  - A workaround for a third-party bug
  - A subtle invariant that would surprise a reader
- No JSDoc on internal functions — the types already document the signature.

---

## 10. File Size & Scope

- If a component file exceeds ~300 lines, split it.
- If a utility is used in only one place, keep it in that file.
- If it's used in 3+ places, move it to `src/lib/`.
- No cross-cutting imports: `components` must not import from `app/`, `store` must not import from `components`.

---

## 11. Git Discipline

- One logical change per commit — no "fix stuff" commits.
- Commit message: `type(scope): short description` — e.g. `fix(auth): check password on login`
- Never commit `.env`, `node_modules`, or build artifacts.
- No `console.log` left in committed code.

---

## 12. Security

- Never expose API keys to the client — all secrets in `.env`, accessed server-side only.
- Sanitize any user input rendered in HTML to prevent XSS.
- No `dangerouslySetInnerHTML` unless content is your own trusted data.
- `agentId` in API routes must be validated against the authenticated user's agents before use.
