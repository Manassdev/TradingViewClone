# React UI Evaluation Preparation

This guide describes the current TradingView Clone code and the checks run on 28 October 2026. Use it to understand the implementation well enough to explain it and make small changes yourself.

## Audit checklist

| Rubric area | Finding | Work completed / current status |
| --- | --- | --- |
| Component design and rendering | The app already separates route pages, shared UI, context, services, and chart utilities. Lists generally use stable keys and pages have loading, error, and empty states. The crypto market table rendered an empty sparkline despite having no sparkline data. | Reused existing components; replaced that misleading blank graphic with an explicit unavailable marker. The 404 page is now a small route-level component rather than a silent redirect. |
| UI styling and responsiveness | The project already has responsive breakpoints for market overviews, auth pages, navigation, and the chart workspace. The mobile navigation could remain open after changing routes. | It now closes after route changes. CSS breakpoint rules were reviewed, but separate live tablet/mobile viewport screenshots were not verified in this run. |
| Hooks and state management | Market refreshes could finish after the page was left, and Community News could display an old category after a quick filter change while an earlier request was pending. | Market quote requests now use `AbortController` and are cancelled on refresh/unmount. News requests cancel the previous category request and are aborted on effect cleanup. Existing chart effects already clean up the chart, observer, socket, and subscriptions. |
| Routing and forms | Unknown URLs redirected silently to the home page. The sign-up form accepted a 6-character password even though the backend requires at least 8. | Added an informative 404 route and matched the sign-up browser constraints to the backend (8–72 characters). Existing auth continues to call the real backend; it was not replaced with a mock login. |
| Individual understanding and demonstration | The code has meaningful examples for props, state, effects, routing, controlled inputs, and API loading states, but those concepts needed a walkthrough tied to actual files. | This guide includes an architecture map, walkthrough, demonstration order, and viva questions. |

## Project architecture

### Main folders

- `frontend/src/pages/`: route-level screens such as the homepage, market overviews, chart workspace, authentication, paper trading, and idea details.
- `frontend/src/components/`: shared navigation, footer, loading/error states, market-overview pieces, and community ideas/news.
- `frontend/src/context/`: shared authentication state through `AuthContext`.
- `frontend/src/services/`: the frontend API client. It attaches the saved bearer token and turns non-success HTTP responses into JavaScript errors.
- `frontend/src/utils/`: chart data transforms and paper-order preview/validation helpers.
- `frontend/src/styles.css`: shared theme, page styling, component states, and responsive breakpoints.
- `backend/routes/`, `controllers/`, `services/`, and `models/`: Express endpoints, request handling, provider/data logic, and MongoDB schemas.

### Important routes

`frontend/src/App.jsx` defines the routes. Main examples are `/` (home), `/markets/crypto`, `/markets/forex`, `/markets/india`, `/chart/:symbol`, `/forex/:symbol`, `/india/:exchange/:symbol`, `/ideas/:id`, `/signin`, `/signup`, and `/paper-trading`. Paper trading is wrapped in `ProtectedRoute`. Unknown paths show the new 404 page with links back to the app.

### Data flow

1. A page or component owns the state needed for its screen, such as selected market, filter text, loading state, or returned rows.
2. An event handler or `useEffect` calls a named method from `frontend/src/services/api.js`.
3. The API helper sends a `fetch` request to `/api/...`; the Vite dev server proxies that path to the backend on port 5000.
4. The Express route calls a controller, which uses a service/provider or MongoDB model.
5. JSON data returns to the component, which updates state and renders the success, loading, error, or empty state.

When a user is signed in, the API client adds `Authorization: Bearer <token>` from local storage. `AuthContext` verifies the stored session with `/users/me` on startup. Do not put provider API keys in React code or browser storage.

## React concepts in this project

- **Component:** a reusable function that returns a piece of UI. `Navbar`, `CommunityNews`, and `MarketOverviewChart` are examples.
- **Props:** inputs passed from a parent to a child. `MarketOverviewChart` receives data and a label; `IdeaCard` receives one idea object.
- **JSX:** JavaScript syntax for describing UI, such as `<Link to="/markets/crypto">Crypto</Link>`.
- **Conditional rendering:** showing one UI state based on a condition. Community News chooses loading, error, empty, or article-list UI based on `status` and `articles`.
- **`useState`:** component state that triggers a render when updated. In `Markets.jsx`, `selectedSymbol` controls which asset’s history chart is requested.
- **`useEffect`:** work connected to a render or state change. The chart page loads data when the selected symbol changes; cleanup aborts an obsolete request.
- **Event handling:** functions connected to user actions. The market search input updates `filter` from its `onChange` event; a market row link opens the matching chart.
- **React Router:** route matching and navigation without a full-page reload. `Link` handles internal navigation; `useParams` reads route segments such as a symbol.
- **Controlled component:** a form control whose displayed value comes from React state. The signup email input uses `value={email}` and updates it in `onChange`.
- **Form validation:** browser constraints (`required`, `type="email"`, `minLength`) stop obviously invalid input; the backend validates again and its error is displayed. Client validation improves feedback but is not a security boundary.

## Code walkthrough

| File | Purpose and key details | Likely evaluator question |
| --- | --- | --- |
| `frontend/src/App.jsx` | Lazy-loads route pages, wraps them in `AuthProvider` and `BrowserRouter`, shows a loading fallback, protects paper trading, and handles unknown routes. | “What does a protected route do?” |
| `frontend/src/components/Shared.jsx` | Shared `Navbar`, `Footer`, `ProtectedRoute`, `LoadingState`, `ErrorState`, `EmptyState`, and market ticker. The navbar also owns its menus and global search state. | “Why put a component in a shared folder?” |
| `frontend/src/context/AuthContext.jsx` | Owns `user` and session `loading`, verifies a saved token on mount, and exposes login/register/logout actions to screens using `useAuth`. | “How do multiple pages access the logged-in user?” |
| `frontend/src/services/api.js` | Central `request()` helper, token header, JSON parsing, and API methods for auth, markets, watchlists, alerts, comments, and paper trading. | “Where is the API base URL set, and how are errors reported?” |
| `frontend/src/pages/AuthPages.jsx` | Sign-in and signup screens. Inputs are controlled, browser-validated, and submit through the real auth context. Busy and error states prevent duplicate submission and explain failures. | “What happens when signup fails on the server?” |
| `frontend/src/pages/Home.jsx` | Homepage and animated hero, market summary, Community Ideas, and Community News. The market summary demonstrates an effect with interval cleanup. | “How does the hero coexist with normal React components?” |
| `frontend/src/components/Community.jsx` | Idea/news cards, category controls, empty/error states, and refresh behavior. Community News now cancels a previous category request to prevent stale results. | “Why cancel a request when a filter changes?” |
| `frontend/src/pages/Markets.jsx` | Crypto market summary, filtering, selected-symbol history, table, and refresh action. Quote refreshes use cancellation; selected history is aborted when the symbol changes. | “How does selecting a row update the chart?” |
| `frontend/src/pages/ChartWorkspace.jsx` | Chart workspace and tabs for watchlist, trade, portfolio, alerts, details, and profile. `lightweight-charts` is managed with refs; resize, crosshair, socket, and chart subscriptions are cleaned up. | “Why use a ref for the chart instance?” |
| `frontend/src/styles.css` | Shared visual styles and media queries for responsive layouts. Inspect the rules near the chart workspace and auth page styles. | “How does the layout change on a phone?” |

## Live demonstration script (about 4 minutes)

1. **Introduce (20 seconds):** “This is a React TradingView-inspired market dashboard. It has market overviews, charts, community content, account flows, and protected paper trading.”
2. **Show the component structure (35 seconds):** open `App.jsx`, `Shared.jsx`, and `AuthContext.jsx`. Explain that pages compose shared UI and use context for the signed-in user.
3. **Navigate (35 seconds):** use the Markets menu to open Crypto, then choose a market/chart link. Mention that routes come from `App.jsx` and links use React Router.
4. **Show state (45 seconds):** on the chart workspace, change symbol/timeframe or switch chart type and an indicator. Explain which state controls the selected option and how it updates the chart.
5. **Show a form (35 seconds):** open `/signup`. Try submitting empty fields to show native required-field feedback. Use a password under eight characters to show the browser constraint; do not create an account during the demo unless the evaluator has provided a test account/database.
6. **Explain an effect (40 seconds):** in `Markets.jsx`, show the selected-symbol history effect. It clears old data, requests new data, handles errors, and aborts the request if the selection changes or the page unmounts.
7. **Show responsive behavior (30 seconds):** use browser responsive mode at about 768 px and 390 px. Point out the mobile navigation and chart/sidebar stacking. Check horizontal overflow before claiming the test passed.
8. **Explain a fix (25 seconds):** “The signup UI originally allowed a shorter password than the backend. I changed the client constraint to match the server’s eight-character minimum. I also fixed stale news results by cancelling the previous request when its category changes.”

## Viva questions and short answers

1. **What is a React component?** A function that returns UI for React to render; it can receive props and manage its own state.
2. **What are props?** Read-only inputs a parent passes to a child, such as one `idea` passed to `IdeaCard`.
3. **What is JSX?** Syntax that lets JavaScript describe the elements and components in the UI.
4. **What is conditional rendering?** Rendering different elements based on state or data, for example loading versus error versus results.
5. **Why use `useState`?** To preserve a value between renders and rerender when the value changes.
6. **What does `setState` do?** It schedules a state update; React renders again with the new value. Functional updates are useful when the next value depends on the previous one.
7. **What is `useEffect` for?** Synchronizing a component with something outside rendering, such as fetching data, a timer, or a chart subscription.
8. **Why does an effect need dependencies?** They tell React which values the effect uses and when it needs to run again.
9. **What is effect cleanup?** A function returned by an effect that releases work, such as aborting a request, clearing an interval, or unsubscribing.
10. **Why cancel a fetch?** It avoids stale results replacing newer selections and avoids updating a screen after it has been left.
11. **What is event handling?** Responding to UI events with functions such as `onClick`, `onChange`, or `onSubmit`.
12. **What is a controlled input?** An input whose value is stored in React state and updated by an event handler.
13. **How does signup validation work here?** The browser checks required fields, email format, and password length; the backend repeats validation before creating an account.
14. **Why validate on both frontend and backend?** Frontend checks give quick feedback; backend checks are authoritative because client code can be bypassed.
15. **What is React Router doing?** It maps the current URL to a page and supports client-side links and route parameters.
16. **How does `useParams` help?** It reads dynamic URL parts, such as `symbol` from `/chart/:symbol`.
17. **What is a protected route?** A route that checks authentication before showing its content and redirects signed-out users to sign in.
18. **How does auth state get shared?** `AuthProvider` exposes `user` and actions through React context; components read them with `useAuth`.
19. **How is API data loaded?** A page calls a method in `api.js`, handles its promise, updates state, and renders the matching status.
20. **Why add `key` to a list?** It gives React a stable identity for each row while items are added, removed, or reordered.
21. **How is the chart resized?** `ChartWorkspace.jsx` observes its container with `ResizeObserver` and updates the chart dimensions.
22. **What is responsive CSS?** CSS rules that adapt the layout at different viewport widths; this project uses media queries for navigation, markets, auth, and chart layout.
23. **What bug did you fix?** The signup page accepted a six-character password while the server required eight; the browser constraint now matches the backend.
24. **What is the News request cancellation fix?** A category change aborts the old request so its response cannot overwrite the newly selected category.
25. **What does the 404 page do?** It explains that the current route is unknown and gives working navigation back into the app.

## Individual contribution: learn it, don’t memorize it

For each interactive control, trace one full path yourself: **input/event → handler → state update or API call → response/error → rendered state**. Practice explaining one example from the market search and one from signup. Then make a tiny local change, such as changing a loading label, and describe which file owns that UI. Avoid claiming market data is live when a provider is rate-limited or not configured, and avoid describing a visual test you did not run.

## Test results and blockers

- `backend`: `npm test` passed **58 tests, 0 failures**.
- `frontend`: `npm run build` passed with Vite 6.4.5.
- `frontend`: `npm run` exposes `dev`, `build`, and `preview`; there is no frontend lint or frontend-specific test script configured.
- Browser: the existing app at `http://localhost:5173` displayed the new 404 page for an unknown URL. The market page also showed a Twelve Data rate-limit message, so provider-backed prices/history were not treated as verified.
- Backend development server: startup attempted via the existing `npm run dev` script, but MongoDB reported it could not connect to the configured local instance. Authenticated flows and MongoDB-backed watchlists could not be tested end-to-end. Start the local MongoDB service and verify `backend/.env` before the evaluation.
- Vite: port 5173 was already occupied, so the additional dev process selected port 5174. The local sandbox blocked a direct HTTP check against that second port. Browser automation then stopped before further interactions, so signup submission, console logs, and separate tablet/mobile viewport checks remain unverified.
- No lint script is configured; no lint result is claimed. Provider rate limits and absent MongoDB are environment blockers, not proof that those integrations work.

## Five files to study tonight

1. `frontend/src/App.jsx` — routes and protected page boundary.
2. `frontend/src/components/Shared.jsx` — reusable layout, navigation, and feedback components.
3. `frontend/src/context/AuthContext.jsx` — auth state and app-wide actions.
4. `frontend/src/services/api.js` — request/response path between UI and backend.
5. `frontend/src/pages/Markets.jsx` — practical example of state, effects, cancellation, filtering, and conditional rendering.

## Start commands for evaluation day

In separate terminals, from the project root:

```powershell
cd backend
npm run dev
```

```powershell
cd frontend
npm run dev
```

Open the Vite URL printed in the frontend terminal. If port 5173 is occupied, Vite may choose a later port. MongoDB and required backend environment settings must be ready before testing login, saved watchlists, or other database-backed flows.
