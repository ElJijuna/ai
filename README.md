# @pilmee/ai

A friendly TypeScript library that orchestrates and centralizes calls to **Chrome's built-in AI
APIs** (Prompt API / `LanguageModel`, `Summarizer`, `Writer`, `Rewriter`, `Translator`,
`LanguageDetector`, `Proofreader`) behind one ergonomic API, with:

- **Site-scoped behavior** — agents default to only answering questions related to the site they run on.
- **Availability checks** — know whether a feature is supported/downloadable/ready before you use it.
- **Centralized context** — give the model context about your page/app once, update it anytime, and
  have it flow to every live chat session.
- **Chat orchestration** — `send()` and `stream()` for the Prompt API.
- **Default actions** — one-liners for summarize/write/rewrite/translate/detect-language/proofread.
- **WebMCP-ready tools** — define tools once; they're passed to the model's function calling and,
  when the browser supports it, also exposed on `document.modelContext` (WebMCP).
- **Optional WebGPU fallback** — the Prompt API (`Agent`) keeps working in browsers without Gemini
  Nano (Firefox, Safari, non-Chrome Chromium, or Chrome on unsupported hardware) by running an
  open-weights model on-device via WebGPU — see [WebGPU fallback](#webgpu-fallback).

> These browser APIs are experimental (Chrome, behind flags/origin trials). This library
> feature-detects everything and never assumes an API is present — see
> [Recommendations](#recommendations) below. The core package has zero required dependencies; the
> WebGPU fallback is opt-in (see below).

## Install

```bash
npm install @pilmee/ai
```

## Quick start

```ts
import { AIOrchestrator } from '@pilmee/ai';

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

## React example: gating a chat button on availability

Check `isAvailable()` once and only render the chat entry point when the browser can actually
run it. `supported` tells you whether the API exists at all; `state` tells you whether it's ready
right now or still needs a download.

```tsx
import { useEffect, useState } from 'react';
import { AIOrchestrator, type AvailabilityInfo } from '@pilmee/ai';

const ai = new AIOrchestrator({
  scope: { site: 'shop.example.com', description: 'an online camera shop' },
});

function useAIAvailability() {
  const [availability, setAvailability] = useState<AvailabilityInfo | null>(null);

  useEffect(() => {
    let cancelled = false;

    ai.isAvailable().then((info) => {
      if (!cancelled) {
        setAvailability(info);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return availability;
}

export function ChatButton({ onOpen }: { onOpen: () => void }) {
  const availability = useAIAvailability();

  // Still checking, or this browser doesn't expose the API at all: render nothing.
  if (!availability?.supported) {
    return null;
  }

  const isReady = availability.state === 'available';

  return (
    <button type="button" onClick={onOpen} disabled={!isReady}>
      {isReady ? 'Chat with us' : 'Preparing on-device AI…'}
    </button>
  );
}
```

`onOpen` is where you'd call `ai.createAgent()` and open your chat panel (see [Quick
start](#quick-start) and [`Agent`](#agent) above) — keep that behind the click so the model
download, if one is needed, starts from a real user gesture (see
[Recommendations](#recommendations)).

### Showing model download progress

When `state` is `'downloadable'`, clicking the button starts the model download. Pass
`onDownloadProgress` to `createAgent()` and show it instead of a static label — downloads can be
hundreds of MB to a few GB, so users need to see it's actually moving:

```tsx
import { useState } from 'react';
import { AIOrchestrator, type Agent, type DownloadProgress } from '@pilmee/ai';

const ai = new AIOrchestrator({
  scope: { site: 'shop.example.com', description: 'an online camera shop' },
});

export function ChatButton({ onOpen }: { onOpen: (agent: Agent) => void }) {
  const availability = useAIAvailability();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);

  if (!availability?.supported) {
    return null;
  }

  async function handleClick() {
    if (agent) {
      onOpen(agent);
      return;
    }

    setProgress({ feature: 'languageModel', loaded: 0 });
    const created = await ai.createAgent({ onDownloadProgress: setProgress });
    setProgress(null);
    setAgent(created);
    onOpen(created);
  }

  return (
    <button type="button" onClick={handleClick} disabled={progress !== null}>
      {progress ? `Downloading model… ${Math.round(progress.loaded * 100)}%` : 'Chat with us'}
    </button>
  );
}
```

This reuses the `agent` once it's created instead of re-downloading on every click, and disables
the button mid-download instead of just relabeling it, since a second click while `createAgent()`
is already in flight would start a redundant download.

### Updating context as microfrontends load (SPA routing)

In a microfrontend SPA, each route lazy-loads its own bundle. The `AIOrchestrator` instance lives
in the shell and stays alive across navigations, so every section just needs to layer its own
context in when it mounts — any chat `Agent` that's already open picks up the change on its next
`send()`/`stream()` call, since `updateContext()` broadcasts to every live agent.

```tsx
// ai.ts — one shared instance, created once by the shell
import { AIOrchestrator } from '@pilmee/ai';

export const ai = new AIOrchestrator({
  scope: { site: 'shop.example.com', description: 'an online camera shop' },
});
```

```tsx
// useSectionContext.ts — called by whichever microfrontend is currently mounted
import { useEffect } from 'react';
import type { PageContext } from '@pilmee/ai';
import { ai } from './ai';

export function useSectionContext(context: PageContext) {
  const key = JSON.stringify(context);

  useEffect(() => {
    ai.updateContext(context);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- context is compared via `key`
  }, [key]);
}
```

```tsx
// App.tsx — the shell: routes to lazily-loaded microfrontends
import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { ai } from './ai';

const PricingSection = lazy(() => import('./sections/PricingSection'));
const SupportSection = lazy(() => import('./sections/SupportSection'));

function useResetContextOnNavigate() {
  const { pathname } = useLocation();

  useEffect(() => {
    // Replace, not merge: drop whatever the previous section added before the next
    // one (lazy-loaded, so this can take a moment) layers its own context back in.
    ai.setContext({ url: pathname, title: document.title });
  }, [pathname]);
}

export function App() {
  useResetContextOnNavigate();

  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/pricing" element={<PricingSection />} />
        <Route path="/support" element={<SupportSection />} />
      </Routes>
    </Suspense>
  );
}
```

```tsx
// sections/PricingSection.tsx — its own bundle, fetched only when /pricing is visited
import { useSectionContext } from '../useSectionContext';

export default function PricingSection() {
  useSectionContext({
    section: 'pricing',
    description: 'Pricing plans: Basic, Pro, and Enterprise, with a feature comparison table.',
  });

  return <div>{/* ... */}</div>;
}
```

The reset-on-navigate step matters because `updateContext()` merges rather than replaces: without
it, a key one section adds (e.g. `ticketId` from a support widget) would silently linger in the
context after the user navigates to an unrelated section. Resetting to the shared base on every
route change, then letting the newly-mounted section layer its own keys back in, keeps the context
scoped to whatever is actually on screen.

## Scope: WebLLM, WebMCP, WebContext

- **WebLLM** — `AIOrchestrator` / `Agent` wrap the Prompt API session lifecycle (create, prompt,
  stream, clone, destroy) plus the task-specific APIs (Summarizer, Writer, Rewriter, Translator,
  LanguageDetector, Proofreader) as [default actions](#default-actions).
- **WebMCP** — `defineTool()` + `registerTool()`/`registerTools()` build a central tool registry.
  Tools are passed into the Prompt API's function calling for every agent, and — when the browser
  exposes `document.modelContext` (or `navigator.modelContext` on older Chrome builds, from before
  the spec's 2026-07-21 draft moved it) — the same tools are registered there too, so the browser's
  own page-level AI agent can discover and call them ([`exposeToolsToPage`](#src/tools/webmcp.ts)).
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
  exposeToolsToPage: true, // also register tools on document.modelContext when present
});

await ai.isAvailable('languageModel'); // -> { feature, state, supported }
await ai.isTranslationAvailable({ from: 'en', to: 'es' }); // pair-specific, unlike isAvailable('translator')
await ai.getModelParams(); // -> { defaultTopK, maxTopK, defaultTemperature, maxTemperature } | null

ai.setContext({ title: 'Pricing' }); // replaces; pushed to every live agent
ai.updateContext({ section: 'faq' }); // merges; pushed to every live agent
ai.captureContextFromDocument(); // seeds context from document.title/URL/meta description/selection

ai.registerTool(myTool);
ai.registerTools([toolA, toolB]);
ai.unregisterTool('myTool');

await ai.preload(); // starts downloading/initializing the model without opening a chat session
const agent = await ai.createAgent({ instructions: 'Answer briefly.' });
ai.destroyAgents(); // cleans up every agent this orchestrator created
```

### `Agent`

A single chat session (create via `AIOrchestrator.createAgent`, not directly).

```ts
const agent = await ai.createAgent({
  temperature: 0.7,
  onQuotaOverflow: () => console.warn('Older turns are being dropped to fit the context window'),
});

await agent.send('Hello!'); // -> string

for await (const delta of agent.stream('Tell me more.')) {
  process(delta); // incremental text, normalized (see below)
}

agent.updateContext({ cartTotal: 42 }); // flushed into the session on the next send()/stream()
agent.setContext({ cartTotal: 42 });

await agent.measureInputUsage('a long message…'); // preview cost before sending; undefined if unsupported
const branch = await agent.clone(); // independent branch sharing history so far
agent.usage; // { inputUsage, inputQuota } when the browser reports it
agent.model; // e.g. 'Llama-3.2-3B-Instruct-q4f16_1-MLC' on the WebGPU fallback, undefined on Chrome
agent.destroy();
```

`send`/`stream` accept a plain string, or multimodal content parts (see [Sending a photo or audio
message](#sending-a-photo-or-audio-message) below) for a model created with matching
`expectedInputs`.

`send`/`stream` also accept `{ signal, responseConstraint, raw }`:

- `signal` — an `AbortSignal` to cancel the call.
- `responseConstraint` — a JSON schema the reply must conform to (structured output).
- `raw` (stream only) — receive chunks exactly as Chrome emits them instead of normalized deltas.

### Sending a photo or audio message

A model created with `expectedInputs` can take multimodal content parts instead of plain text: an
array of `{ type: 'text' | 'image' | 'audio', value }`. The `value` for `'image'` is anything
`createImageBitmap()` accepts (a `File`, `Blob`, `ImageBitmap`, `<canvas>`, …); for `'audio'` it's
an `AudioBuffer`, `Blob`, or `ArrayBuffer`.

**A photo, from a file input:**

```ts
const ai = new AIOrchestrator({ scope: { site: 'shop.example.com' } });
const fileInput = document.querySelector<HTMLInputElement>('#photo')!;

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) {
    return;
  }

  const agent = await ai.createAgent({ expectedInputs: [{ type: 'image' }] });
  const image = await createImageBitmap(file);

  const reply = await agent.send([
    { type: 'text', value: 'What is in this photo? Does it match a product we sell?' },
    { type: 'image', value: image },
  ]);

  console.log(reply);
  agent.destroy();
});
```

**A voice note, recorded with `MediaRecorder`:**

```ts
const ai = new AIOrchestrator({ scope: { site: 'shop.example.com' } });

async function transcribeAndSummarize(): Promise<string> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream);
  const chunks: BlobPart[] = [];

  recorder.addEventListener('dataavailable', (event) => chunks.push(event.data));
  recorder.start();

  // Stop after 5s for this example; in a real UI, stop on a button click instead.
  await new Promise((resolve) => setTimeout(resolve, 5000));
  recorder.stop();

  const audioBlob = await new Promise<Blob>((resolve) => {
    recorder.addEventListener('stop', () => resolve(new Blob(chunks, { type: recorder.mimeType })));
  });
  for (const track of stream.getTracks()) {
    track.stop();
  }

  const agent = await ai.createAgent({ expectedInputs: [{ type: 'audio' }] });
  const reply = await agent.send([
    { type: 'text', value: 'Transcribe this, then summarize it in one sentence.' },
    { type: 'audio', value: audioBlob },
  ]);

  agent.destroy();
  return reply;
}
```

Declare `expectedInputs` on `createAgent()` for whichever modalities you intend to send — a session
created without them can't accept that modality later, so you can't add `{ type: 'image' }` to an
already-open text-only agent. See [Recommendations](#recommendations) for quota implications of
sending media.

### Default actions

Available both as standalone functions and as `AIOrchestrator` methods (which auto-fill
`sharedContext` from your scope description):

```ts
import { summarize, write, rewrite, translate, detectLanguage, proofread } from '@pilmee/ai';

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
import { defineTool } from '@pilmee/ai';

const getCartTotal = defineTool({
  name: 'getCartTotal',
  description: "Returns the current shopping cart's total in cents.",
  inputSchema: { type: 'object', properties: {} },
  execute: () => ({ totalCents: cart.total }),
});

ai.registerTool(getCartTotal);
```

#### Web search

Chrome's on-device model has no network access of its own, so it can't answer anything about
current events, prices, or anything past its training data — unless you give it a tool that can.
`defineWebSearchTool` wraps whichever search API/provider you plug in (Google Custom Search, Bing,
Brave, Tavily, your own index, ...) into a ready-to-register tool, so the model can decide on its
own when a question needs a live lookup:

```ts
import { defineWebSearchTool } from '@pilmee/ai';

const webSearch = defineWebSearchTool({
  async search(query) {
    const res = await fetch(`https://api.example.com/search?q=${encodeURIComponent(query)}`);
    const { results } = await res.json();
    return results.map((r) => ({ title: r.title, url: r.url, snippet: r.snippet }));
  },
});

ai.registerTool(webSearch);
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

## WebGPU fallback

Chrome's built-in AI (Gemini Nano) only exists in Chrome, behind flags/origin trials, on
compatible hardware. For everyone else — Firefox, Safari, non-Chrome Chromium builds, or Chrome on
a machine that reports `unavailable` — the Prompt API (`AIOrchestrator.createAgent()` / `Agent`)
can fall back to running a small open-weights model on-device via **WebGPU**, using
[`@mlc-ai/web-llm`](https://github.com/mlc-ai/web-llm), **without changing any of the `Agent`
API** you already use: `send()`, `stream()`, `clone()`, tools, `responseConstraint`, `signal`, etc.
all keep working the same way.

This is entirely opt-in and adds no dependency to the base install:

```bash
npm install @mlc-ai/web-llm
```

The fallback engages automatically, in this order, the first time something needs the Prompt API
(`isAvailable()`, `createAgent()`, `getModelParams()`):

1. Chrome's built-in `LanguageModel` global, if present — unchanged, existing behavior.
2. Otherwise, if the browser supports WebGPU (`navigator.gpu`) **and** `@mlc-ai/web-llm` is
   installed, the WebGPU fallback.
3. Otherwise, `unsupported`/`AIFeatureNotSupportedError` — same as before this feature existed.

`AvailabilityInfo` gained two additive fields so you can tell which backend — and which model —
actually answered, and `Agent` exposes the same model id for a live session via `agent.model`:

```ts
const availability = await ai.isAvailable();
// { feature: 'languageModel', state: 'downloadable', supported: true, backend: 'webgpu', model: 'Llama-3.2-3B-Instruct-q4f16_1-MLC' }

if (availability.backend === 'webgpu') {
  // e.g. adjust copy: "on-device AI (open model)" vs Chrome's own Gemini Nano messaging.
}

const agent = await ai.createAgent();
agent.model; // same model id, resolved for *this* agent (reflects the tools-aware default below);
// undefined when Chrome's built-in AI served it instead -- Gemini Nano has no public model id.
```

`isAvailable()`'s `model` doesn't know about `tools` (it's a generic check, not tied to a specific
agent's config), so it won't reflect the heavier function-calling default described next —
`agent.model` is the one that's always accurate for a given agent, since it's read after
`createAgent()` already made that decision.

### Choosing a model

Defaults to `Llama-3.2-3B-Instruct-q4f16_1-MLC` (~2.3GB VRAM, `low_resource_required`) — **unless
the agent registers `tools`**, in which case it defaults to `Hermes-3-Llama-3.1-8B-q4f16_1-MLC`
(~4.9GB VRAM) instead: web-llm hard-rejects `ChatCompletionRequest.tools` for any model outside its
small function-calling allowlist, so the small default can't be reused as-is once tools are
involved. Override either default per agent or for every agent an orchestrator creates:

```ts
const ai = new AIOrchestrator({
  scope: { site: 'shop.example.com' },
  webgpu: { model: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC' }, // lighter default for this orchestrator
});

const agent = await ai.createAgent({ webgpu: { model: 'Hermes-2-Pro-Mistral-7B-q4f16_1-MLC' } }); // per-agent override
```

Any model id from web-llm's
[prebuilt list](https://github.com/mlc-ai/web-llm/blob/main/src/config.ts) works, but if you pass an
explicit `webgpu.model` override for an agent that also registers `tools`, it must be one of
web-llm's [`functionCallingModelIds`](https://github.com/mlc-ai/web-llm/blob/main/src/config.ts) —
otherwise `createAgent()` rejects with a clear `AIFeatureUnavailableError` naming the models that do
work, checked before anything downloads. `onDownloadProgress` reports the same
`{ feature: 'languageModel', loaded }` shape as the Chrome path. Once a model is loaded, the
underlying engine is cached and shared by every agent using that model id for the rest of the
page's lifetime — creating agents doesn't redownload or reload it, which makes `ai.preload({ webgpu, tools })`
(see [User activation & downloads](#recommendations)) especially worth using here: pass the same
`webgpu`/`tools` you'll eventually create the agent with, so it warms the exact model that call will
need, given these are multi-GB downloads.

### Known limitations (WebGPU backend only; the Chrome path is unaffected)

- **Text only.** Image/audio content parts throw `AIFeatureUnavailableError` — check
  `availability().backend` before offering photo/voice input.
- **Tool calling needs one of a handful of models — enforced, not just recommended.** There's no
  in-browser tool-execution runtime to lean on (unlike Chrome), so this library runs the tool-call
  loop itself, client-side, and web-llm itself refuses `tools` outright for any model outside its
  function-calling allowlist (see [Choosing a model](#choosing-a-model)). Even on a supported model,
  small open models are still less reliable at function calling than Chrome's own tool handling —
  expect more retries/malformed-argument cases. When tools are attached, `stream()` yields the full
  reply as one chunk once it's ready, instead of token-by-token — a tool-call round can't be safely
  streamed live, since its partial text may just be function-call syntax rather than a user-facing
  reply.
- **The site-scope guard/instructions/context arrive as a user/assistant preamble, not a system
  message, once tools are registered.** Every model web-llm currently allows `tools` on hardcodes
  its own tool-definition system prompt and throws if your conversation already has one — so this
  library folds `scope`/`instructions`/`context` into an opening user turn (with a canned assistant
  acknowledgment) instead. The model still receives the same guidance; it just isn't in the
  `system` slot. `responseConstraint` can't be combined with `tools` in the same `send()`/`stream()`
  call either, for the same reason (web-llm sets its own `response_format` for the tool-call
  schema) — that combination throws `AIFeatureUnavailableError` immediately.
- **No quota/usage reporting.** `agent.measureInputUsage()` resolves `undefined` and `agent.usage`
  is empty, same as any browser that doesn't report them.
- **`getModelParams()` returns `null`.** `@mlc-ai/web-llm` has no equivalent to Chrome's
  temperature/topK bounds.
- **Concurrent generations on the same model queue up**, rather than running in parallel — expect
  latency, not errors, if several agents on the same model id are prompted at once.
- **Only the Prompt API (`Agent`) has a fallback.** `summarize`/`write`/`rewrite`/`translate`/
  `detectLanguage`/`proofread` remain Chrome-only for now.

### Bundlers

The dynamic `import('@mlc-ai/web-llm')` is marked with `webpackIgnore`/`@vite-ignore` comments so
webpack and Vite's dev server don't try to resolve it at build time for apps that never install it.
If your production bundler (e.g. Rollup via Vite) still fails to resolve it because it's genuinely
not installed, either install it or mark it external in your bundler config.

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
  depending on version. The optional [WebGPU fallback](#webgpu-fallback) extends the Prompt API
  (`Agent`) to other WebGPU-capable browsers, but coverage still isn't universal (older browsers,
  most mobile devices, WebGPU-less configs). Always have a non-AI fallback path; never gate core
  functionality on either backend.
- The concrete global names, method shapes, and streaming semantics are still evolving. Pin this
  library, read its changelog before upgrading, and don't hardcode assumptions about the raw
  `LanguageModel`/`Summarizer`/etc. globals in app code — go through this library's API instead.

**User activation & downloads**

- Triggering a model download typically requires a user gesture (click/tap) on many
  configurations — don't call `createAgent()`/`preload()`/actions eagerly on unconditional page
  load if the model isn't downloaded yet; trigger it from a button handler or another real
  interaction.
- To start the download as soon as the user shows intent — opening a chat panel, hovering the chat
  button — without waiting for their first actual message, call `ai.preload()` there instead of
  `createAgent()`. It's a lighter call (no system prompt, no session to manage) that just warms the
  model; `createAgent()` right after resolves near-instantly once it's ready. Opening the panel is
  itself the qualifying gesture, so this doesn't get around the requirement above.
- Pass `onDownloadProgress` (to `preload()`, `createAgent()`, or an action) and show a progress
  indicator; downloads can be hundreds of MB to a few GB and take minutes.
- Support cancellation: pass an `AbortSignal` to `preload()`/`createAgent()`/actions so users can
  back out of a long download.

**Performance**

- Reuse an `Agent` across turns of the same conversation instead of creating a new one per message
  — session creation/model load has real latency.
- Prefer `agent.clone()` over creating a brand-new agent when you want to branch a conversation;
  cloning reuses the already-processed shared prefix.
- Always call `agent.destroy()` (and `AIOrchestrator.destroyAgents()`) when you're done — sessions
  hold real memory.
- Watch `agent.usage` (`inputUsage`/`inputQuota`) and keep context concise; large contexts cost
  latency and quota. Prefer a short, curated `PageContext` over dumping full page HTML/text.
- Declare `expectedInputs`/`expectedOutputs` upfront when creating an agent that will send images
  or audio — a session created without them can't accept that modality later. Images/audio consume
  quota much faster than text, so check `measureInputUsage()` before sending large media if you're
  close to the limit, and handle `onQuotaOverflow` instead of assuming every earlier turn survives.

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

## Releasing

Versioning, `CHANGELOG.md`, npm publishing, and GitHub releases are all automated by
[semantic-release](https://semantic-release.gitbook.io/) — see `.releaserc.json` and
`.github/workflows/release.yml`.

Every push to `main` that touches `src/`, `package.json`, or a few other release-relevant paths
runs the release workflow, which:

1. Installs, lints, type-checks, tests, and builds (`prepublishOnly` re-runs `npm run check` as a
   final safety net before anything is published).
2. Inspects the [Conventional Commits](https://www.conventionalcommits.org/) merged since the last
   release to decide whether this is a `patch`/`minor`/`major` bump — a `fix:` commit bumps patch, a
   `feat:` commit bumps minor, and a commit with a `BREAKING CHANGE:` footer bumps major. Commits
   like `chore:`/`docs:`/`test:` don't trigger a release on their own.
3. Publishes the new version to npm, prepends the release notes to `CHANGELOG.md`, tags the commit,
   and opens a GitHub Release — all in one automated run.

**One-time setup**, npm authentication — pick one:

- **[Trusted Publishing](https://docs.npmjs.com/trusted-publishers) (recommended)**: on the
  `@pilmee/ai` package page on npmjs.com, add a trusted publisher pointing at this repo
  (`ElJijuna/ai`) and workflow file (`.github/workflows/release.yml`). No secret to create or
  rotate — npm exchanges the workflow's OIDC token for a short-lived publish token automatically
  (the `id-token: write` permission in the workflow is already set up for this), and provenance
  attestations come for free.
- **Fallback (any other CI, or until Trusted Publishing is set up)**: add an npm
  [automation token](https://docs.npmjs.com/creating-and-viewing-access-tokens) with publish access
  to `@pilmee/ai` as the `NPM_TOKEN` secret in this repo's GitHub Actions settings. The workflow
  tries Trusted Publishing first and only falls back to this token if that isn't configured.

`GITHUB_TOKEN` (used by `@semantic-release/github` to tag releases) is provided automatically by
Actions and needs no setup.

> Don't add `registry-url` to the `actions/setup-node` step in this workflow. It makes setup-node
> write its own `.npmrc` with an auth line, which conflicts with how `@semantic-release/npm` manages
> npm authentication itself and surfaces as `EINVALIDNPMTOKEN` even with a valid `NPM_TOKEN` set —
> the same failure mode we'd previously hit in other packages before tracing it back to this option.

To dry-run locally without publishing anything:

```bash
npx semantic-release --dry-run --no-ci
```

## License

MIT
