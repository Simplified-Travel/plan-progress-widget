# Plan Progress Widget

A drop-in Web Component that gives users real-time feedback while the Simplified Travel API generates a plan. When you call the API to generate a plan, this widget connects over WebSockets and displays live progress updates — thoughts the system is working through and a progress bar — so your users aren't left staring at a blank screen.

## Installation

Install directly from GitHub:

```bash
npm install github:Simplified-Travel/plan-progress-widget
```

Or pin to a specific tag, branch, or commit:

```bash
npm install github:Simplified-Travel/plan-progress-widget#v1.0.0
```

This adds the package to your `package.json` as `@simplified-travel/plan-progress-widget`, which is the name you'll use when importing it in code.

## Quick start

Import the widget module (this registers the `<generation-widget>` custom element automatically), then drop the element into your HTML:

```html
<script type="module">
  import '@simplified-travel/plan-progress-widget'
</script>

<generation-widget
  app-key="YOUR_PUSHER_APP_KEY"
  channel="plans.YOUR_PLAN_ID"
></generation-widget>
```

That's it. The widget stays hidden until plan generation starts, shows progress as it runs, and hides again when it finishes.

### Using the widget in a Vue.js application

Because the widget is a standard Web Component, you can use it directly in a Vue template — Vue treats unknown elements as native HTML, so no wrapper is needed. Import the package once (typically in your `main.js`) so the custom element is registered globally:

```js
// main.js
import { createApp } from 'vue'
import App from './App.vue'
import '@simplified-travel/plan-progress-widget'

createApp(App).mount('#app')
```

If you're using Vue 3 with a build step, tell the compiler to treat `generation-widget` as a custom element so it doesn't warn about an unknown component. In `vite.config.js`:

```js
import vue from '@vitejs/plugin-vue'

export default {
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag === 'generation-widget',
        },
      },
    }),
  ],
}
```

Then use it in any component, binding the `channel` attribute to your current plan ID and listening to events via a template ref:

```vue
<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  planId: { type: String, required: true },
})

const widgetRef = ref(null)

const onStarted = (data) => console.log('Generation', data.type)
const onThought = (data) => console.log('Thought:', data.content)
const onProgress = (data) => console.log('Progress:', data.content, '%')

onMounted(() => {
  widgetRef.value
    .on('document.generation.event', onStarted)
    .on('document.generation.thought', onThought)
    .on('document.generation.progress', onProgress)
})

onBeforeUnmount(() => {
  widgetRef.value
    ?.off('document.generation.event', onStarted)
    ?.off('document.generation.thought', onThought)
    ?.off('document.generation.progress', onProgress)
})
</script>

<template>
  <generation-widget
    ref="widgetRef"
    app-key="YOUR_PUSHER_APP_KEY"
    :channel="`plans.${planId}`"
  />
</template>
```

Note that `:channel` uses Vue's attribute binding syntax so the channel updates reactively whenever `planId` changes — the widget will tear down its existing WebSocket connection and reconnect to the new channel automatically.

### Using the widget in a Nuxt.js application

Nuxt builds on Vue, so the integration is similar — but because Nuxt renders pages on the server by default, you need to make sure the widget only loads in the browser (Web Components, WebSockets, and `customElements.define` all require a DOM).

**1. Tell the Vue compiler to treat `generation-widget` as a custom element.** In `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  vue: {
    compilerOptions: {
      isCustomElement: (tag) => tag === 'generation-widget',
    },
  },
})
```

**2. Register the custom element on the client only.** Create a client-side plugin at `plugins/plan-progress-widget.client.ts` (the `.client` suffix tells Nuxt to skip it during SSR):

```ts
export default defineNuxtPlugin(async () => {
  await import('@simplified-travel/plan-progress-widget')
})
```

**3. Use the widget inside `<ClientOnly>`** so Nuxt doesn't try to render it on the server. In any page or component:

```vue
<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps<{ planId: string }>()
const widgetRef = ref<any>(null)

const onStarted  = (data: any) => console.log('Generation', data.type)
const onThought  = (data: any) => console.log('Thought:', data.content)
const onProgress = (data: any) => console.log('Progress:', data.content, '%')

onMounted(() => {
  widgetRef.value
    ?.on('document.generation.event',    onStarted)
    ?.on('document.generation.thought',  onThought)
    ?.on('document.generation.progress', onProgress)
})

onBeforeUnmount(() => {
  widgetRef.value
    ?.off('document.generation.event',    onStarted)
    ?.off('document.generation.thought',  onThought)
    ?.off('document.generation.progress', onProgress)
})
</script>

<template>
  <ClientOnly>
    <generation-widget
      ref="widgetRef"
      app-key="YOUR_PUSHER_APP_KEY"
      :channel="`plans.${planId}`"
    />
  </ClientOnly>
</template>
```

The `<ClientOnly>` wrapper ensures the element is only mounted in the browser, which avoids SSR errors like `customElements is not defined`.

## Attributes

### Required

| Attribute | Description |
|-----------|-------------|
| `app-key` | Your Pusher app key, provided by Simplified Travel. |
| `channel` | The channel to subscribe to for real-time events. This is a string in the format `plans.{planId}` where `{planId}` is the ID of the plan being generated (e.g. `plans.01kk7wygs5v74z9hexcy76vy0c`). Each plan has its own channel, so the widget only receives events for the specific plan your user is waiting on. |

### Optional

| Attribute | Default | Description |
|-----------|---------|-------------|
| `host` | `realtime.simplified.travel` | WebSocket server hostname. |
| `port` | `6001` | WebSocket server port. |
| `force-tls` | `true` | Use `wss://` (secure WebSocket). Set to `"false"` for local development. |
| `auth-endpoint` | — | Auth endpoint URL (reserved for future private channel support). |
| `show-thoughts` | `true` | Show the thoughts/status messages section. |
| `show-progress` | `true` | Show the progress bar. |
| `thought-count` | `3` | Number of recent thoughts to display (older thoughts scroll off). |

## Styling with CSS `::part()`

The widget uses Shadow DOM for encapsulation, but exposes all of its internal elements as CSS parts. This means you can fully customise the appearance from your own stylesheet using the `::part()` selector — no need to modify the widget source.

### Available parts

| Part name | Element |
|-----------|---------|
| `widget` | Outer container `<div>` |
| `thoughts-block` | Wrapper around the thoughts list |
| `thought-list` | The `<ul>` containing thought items |
| `thought-item` | Every thought `<li>` (targets all items) |
| `thought-item-0` | Most recent thought |
| `thought-item-1` | Second most recent thought |
| `thought-item-2` | Third most recent thought (and so on, up to `thought-item-9`) |
| `progress-block` | Wrapper around the progress bar |
| `progress-track` | The progress bar track (background) |
| `progress-fill` | The progress bar fill (foreground) |
| `progress-label` | The percentage label |

### Example: customising thought appearance

Each thought item gets a positional part name (`thought-item-0` for the newest, `thought-item-1` for the next, etc.), so you can create a fade-out effect where older thoughts are visually de-emphasised:

```css
/* All thoughts share a base style */
generation-widget::part(thought-item) {
  font-family: 'Georgia', serif;
  line-height: 1.5;
}

/* Most recent thought — full prominence */
generation-widget::part(thought-item-0) {
  opacity: 1;
  font-size: 1rem;
}

/* Second thought — fading */
generation-widget::part(thought-item-1) {
  opacity: 0.6;
  font-size: 1rem;
}

/* Third thought — nearly gone */
generation-widget::part(thought-item-2) {
  opacity: 0.3;
  font-size: 1rem;
}
```

### Example: customising the progress bar

```css
generation-widget::part(progress-track) {
  height: 8px;
  background: #e0e0e0;
  border-radius: 4px;
}

generation-widget::part(progress-fill) {
  background: linear-gradient(90deg, #4caf50, #81c784);
  border-radius: 4px;
}
```

## JavaScript API

You can subscribe to widget events using the `.on()` and `.off()` methods:

```js
const widget = document.querySelector('generation-widget')

widget
  .on('document.generation.event', (data) => {
    // data.type is "started" or "done"
    console.log('Generation', data.type)
  })
  .on('document.generation.thought', (data) => {
    console.log('Thought:', data.content)
  })
  .on('document.generation.progress', (data) => {
    console.log('Progress:', data.content, '%')
  })
  .on('widget:connected', () => console.log('WebSocket connected'))
  .on('widget:disconnected', () => console.log('WebSocket disconnected'))
  .on('widget:error', (err) => console.error('Widget error:', err))
```

### Events

| Event | Data | Description |
|-------|------|-------------|
| `document.generation.event` | `{ type: "started" \| "done" }` | Plan generation lifecycle. The widget shows itself on `started` and hides on `done`. |
| `document.generation.thought` | `{ content: string }` | A status message from the plan generation process. |
| `document.generation.progress` | `{ content: number }` | Progress percentage (0–100). |
| `widget:connected` | — | WebSocket connection established. |
| `widget:disconnected` | — | WebSocket connection lost. |
| `widget:error` | Error object | Connection or subscription error. |

## Notes

- Only one `<generation-widget>` instance is allowed per page. A second element will log a warning and not render.
- The widget inherits `font-family` from its parent, so it matches your site's typography by default.
- The widget starts hidden and only appears when a `document.generation.event` with `type: "started"` is received. It hides again shortly after `type: "done"`.
