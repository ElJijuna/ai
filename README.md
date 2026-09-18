# ai-lib

A friendly, zero-dependency TypeScript library that orchestrates and centralizes calls to
**Chrome's built-in AI APIs** (Prompt API / `LanguageModel`, `Summarizer`, `Writer`, `Rewriter`,
`Translator`, `LanguageDetector`, `Proofreader`) behind one ergonomic API, with:

- **Site-scoped behavior** — agents default to only answering questions related to the site they run on.
- **Availability checks** — know whether a feature is supported/downloadable/ready before you use it.
- **Centralized context** — give the model context about your page/app once, update it anytime, and
  have it flow to every live chat session.
- **Chat orchestration** — `send()` and `stream()` for the Prompt API.
- **Default actions** — one-liners for summarize/write/rewrite/translate/detect-language/proofread.
- **WebMCP-ready tools** — define tools once; they're passed to the model's function calling and,
  when the browser supports it, also exposed on `navigator.modelContext` (WebMCP).

> These browser APIs are experimental (Chrome, behind flags/origin trials). This library
> feature-detects everything and never assumes an API is present — see
> [Recommendations](#recommendations) below.

## Install

```bash
npm install ai-lib
```

## Quick start

```ts
import { AIOrchestrator } from 'ai-lib';

const ai = new AIOrchestrator({
  scope: {
    site: 'shop.example.com',
    description: 'an online camera shop',
  },
  context: {
    title: document.title,
    url: location.href,
  },
});

const availability = await ai.isAvailable();
if (!availability.supported) {
  // Hide/disable the AI feature in the UI.
} else {
  const agent = await ai.createAgent();
  const reply = await agent.send('What lenses do you carry for wildlife photography?');
  console.log(reply);
  agent.destroy();
}
```

## Scope: WebLLM, WebMCP, WebContext

- **WebLLM** — `AIOrchestrator` / `Agent` wrap the Prompt API session lifecycle (create, prompt,
  stream, clone, destroy) plus the task-specific APIs (Summarizer, Writer, Rewriter, Translator,
  LanguageDetector, Proofreader) as [default actions](#default-actions).
- **WebMCP** — `defineTool()` + `registerTool()`/`registerTools()` build a central tool registry.
  Tools are passed into the Prompt API's function calling for every agent, and — when the browser
  exposes `navigator.modelContext` — the same tools are registered there too, so the browser's own
  page-level AI agent can discover and call them ([`exposeToolsToPage`](#src/tools/webmcp.ts)).
- **WebContext** — `WebContext` (used internally by both `AIOrchestrator` and `Agent`) holds
  structured page/app context, serializes it into the system prompt, and notifies live agents when
  it changes.

## API

### `AIOrchestrator`

The central entry point for a site. Holds shared scope, context, and tools; spawns `Agent`s.

```ts
const ai = new AIOrchestrator({
  scope: { mode: 'guided', site: 'example.com', description: '...' },
  context: { title: 'Home' },
  tools: [myTool],
  exposeToolsToPage: true, // also register tools on navigator.modelContext when present
});

await ai.isAvailable('languageModel'); // -> { feature, state, supported }

ai.setContext({ title: 'Pricing' }); // replaces; pushed to every live agent
ai.updateContext({ section: 'faq' }); // merges; pushed to every live agent
ai.captureContextFromDocument(); // seeds context from document.title/URL/meta description/selection

ai.registerTool(myTool);
ai.registerTools([toolA, toolB]);
ai.unregisterTool('myTool');

const agent = await ai.createAgent({ instructions: 'Answer briefly.' });
ai.destroyAgents(); // cleans up every agent this orchestrator created
```

### `Agent`

A single chat session (create via `AIOrchestrator.createAgent`, not directly).

```ts
const agent = await ai.createAgent();

await agent.send('Hello!'); // -> string

for await (const delta of agent.stream('Tell me more.')) {
  process(delta); // incremental text, normalized (see below)
}

agent.updateContext({ cartTotal: 42 }); // flushed into the session on the next send()/stream()
agent.setContext({ cartTotal: 42 });

const branch = await agent.clone(); // independent branch sharing history so far
agent.usage; // { inputUsage, inputQuota } when the browser reports it
agent.destroy();
```

`send`/`stream` accept `{ signal, responseConstraint, raw }`:

- `signal` — an `AbortSignal` to cancel the call.
- `responseConstraint` — a JSON schema the reply must conform to (structured output).
- `raw` (stream only) — receive chunks exactly as Chrome emits them instead of normalized deltas.

### Default actions

Available both as standalone functions and as `AIOrchestrator` methods (which auto-fill
`sharedContext` from your scope description):

```ts
import { summarize, write, rewrite, translate, detectLanguage, proofread } from 'ai-lib';

await summarize(longText, { type: 'key-points', length: 'short' });
await write('a product announcement for our new lens', { tone: 'formal' });
await rewrite(draft, { tone: 'more-casual' });
await translate('Hello', { from: 'en', to: 'es' });
await detectLanguage('Bonjour');
await proofread(userComment);

// Streaming variants: summarizeStream, writeStream, rewriteStream, translateStream
```

### Tools (WebMCP)

```ts
import { defineTool } from 'ai-lib';

const getCartTotal = defineTool({
  name: 'getCartTotal',
  description: "Returns the current shopping cart's total in cents.",
  inputSchema: { type: 'object', properties: {} },
  execute: () => ({ totalCents: cart.total }),
});

ai.registerTool(getCartTotal);
```

## Site scoping

`scope.mode`:

- `'guided'` (default) — the agent is told it's the assistant for your site and should prefer
  on-topic answers.
- `'strict'` — the agent refuses anything not directly related to your site, even if it knows the
  answer.
- `'off'` — no scope guard is injected; use your own `instructions` instead.

`scope.allowedTopics` / `scope.disallowedTopics` / `scope.refusalMessage` give finer control.

**This is a steering instruction, not a security boundary** — see
[Recommendations](#recommendations).

## Recommendations

Practical guidance for building on top of Chrome's built-in AI, informed by how this library
handles each concern internally:

**Compatibility & availability**

- Always call `isAvailable()` before showing AI-powered UI; treat `unsupported` (no API at all) and
  `unavailable` (API exists, but this device/config can't run it) differently from `downloadable`/`downloading`.
  Chrome's built-in AI needs a compatible OS/GPU/storage; expect `unavailable` on many machines.
  Real device support requires ~22GB free storage, 4GB+ VRAM, and a non-metered network for the
  model download — a large share of laptops and most mobile devices will report `unavailable`.
- These APIs currently only ship in Chrome (desktop), behind `chrome://flags` and/or origin trials
  depending on version. Always have a non-AI fallback path; never gate core functionality on them.
- The concrete global names, method shapes, and streaming semantics are still evolving. Pin this
  library, read its changelog before upgrading, and don't hardcode assumptions about the raw
  `LanguageModel`/`Summarizer`/etc. globals in app code — go through this library's API instead.

**User activation & downloads**

- Triggering a model download typically requires a user gesture (click/tap) on many
  configurations — don't call `createAgent()`/actions eagerly on page load if the model isn't
  downloaded yet; trigger it from a button handler.
- Pass `onDownloadProgress` and show a progress indicator; downloads can be hundreds of MB to a
  few GB and take minutes.
- Support cancellation: pass an `AbortSignal` to `createAgent()`/actions so users can back out of a
  long download.

**Performance**

- Reuse an `Agent` across turns of the same conversation instead of creating a new one per message
  — session creation/model load has real latency.
- Prefer `agent.clone()` over creating a brand-new agent when you want to branch a conversation;
  cloning reuses the already-processed shared prefix.
- Always call `agent.destroy()` (and `AIOrchestrator.destroyAgents()`) when you're done — sessions
  hold real memory.
- Watch `agent.usage` (`inputUsage`/`inputQuota`) and keep context concise; large contexts cost
  latency and quota. Prefer a short, curated `PageContext` over dumping full page HTML/text.

**Privacy & safety**

- Everything you put in `context`/`instructions` is sent to the model (on-device, but still
  processed and potentially logged by your own telemetry if you log prompts). Don't include PII,
  credentials, or anything a user wouldn't expect the "site assistant" to see.
- Site scoping (`scope.mode`) steers the model; it is not a hard boundary. A determined user can
  often get an on-device model to go off-topic. Don't rely on it to prevent anything you'd consider
  a real security or compliance issue.
- Treat tool `execute()` functions as reachable by an adversarial-ish caller: validate arguments,
  avoid destructive side effects without confirmation, and make them idempotent where possible —
  the model may call a tool speculatively or retry after a transient failure.

**Streaming UX**

- Chrome's streaming chunks have carried both "cumulative full text so far" and "incremental delta"
  shapes across API versions. `agent.stream()` normalizes this into deltas automatically; pass
  `{ raw: true }` only if you specifically need the browser's exact chunk boundaries.
- Let users cancel an in-flight stream (pass `signal`) and show a stop control — generation can run
  for several seconds.

**Testing**

- No current JS DOM testing environment (jsdom, happy-dom) implements these APIs. Test your own
  code against mocked globals (see `tests/mocks/chrome-ai.ts` in this repo) rather than trying to
  run real Chrome AI calls in CI.
- Manually verify against real Chrome with the relevant `chrome://flags` enabled before shipping;
  automated mocks won't catch real model-behavior regressions.

**Accessibility**

- If you render streaming text, update an `aria-live="polite"` region sparingly (e.g. on
  sentence/paragraph boundaries, not per-token) to avoid overwhelming screen reader users.

## Development

```bash
npm install
npm run lint        # eslint (via super-configs)
npm run format       # biome check --write
npm run typecheck    # tsc --noEmit
npm test             # vitest
npm run build         # tsc -> dist/
npm run docs          # typedoc -> docs/
npm run check         # everything above, in order
```

Linting, formatting, and TypeDoc are configured via
[`super-configs`](https://www.npmjs.com/package/super-configs) (`eslint.config.js`, `biome.json`,
`typedoc.json`).

## License

MIT
