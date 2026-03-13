import { WsManager } from './ws-manager.js'
import { ThoughtsBlock } from './blocks/thoughts.js'
import { ProgressBlock } from './blocks/progress.js'

// ─── Singleton enforcement ───────────────────────────────────────────────────
let _instance = null

// ─── Tracked events ──────────────────────────────────────────────────────────
const EVENT_GENERATION = 'document.generation.event'
const EVENT_THOUGHT = 'document.generation.thought'
const EVENT_PROGRESS = 'document.generation.progress'
const TRACKED_EVENTS = [EVENT_GENERATION, EVENT_THOUGHT, EVENT_PROGRESS]

// ─── Shadow DOM template ─────────────────────────────────────────────────────
// Built once, cloned per instance (there will only ever be one, but this
// is the correct Web Component pattern regardless).
const template = document.createElement('template')
template.innerHTML = `
<style>
  :host {
    display: block;
    font-family: inherit;
    box-sizing: border-box;
  }
 
  :host([hidden]) {
    display: none !important;
  }
 
  .widget {
    padding: 1rem;
  }
 
  /* ── Thoughts ────────────────────────────────────────────────── */
  .thoughts-block {
    margin-bottom: 0.75rem;
  }
 
  .thought-list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0.1em;
  }
 
  /*
   * Default thought-item styles.
   * These target the named parts so the shadow DOM itself sets the
   * baseline appearance using the same selectors the developer uses
   * to override them — no hidden coupling to internal class names.
   *
   * ::part() selectors inside the shadow root use the same syntax
   * as external stylesheets, making the defaults self-documenting.
   */
  ::part(thought-item) {
    line-height: 1.45;
    padding: 0.2em 0;
    transition: opacity 0.4s ease, font-size 0.3s ease;
  }
 
  /* Most recent thought — full prominence */
  ::part(thought-item-0) {
    opacity: 1;
    font-size: 0.9rem;
    font-weight: 500;
  }
 
  /* Second thought — noticeably reduced */
  ::part(thought-item-1) {
    opacity: 0.45;
    font-size: 0.82rem;
    font-weight: 400;
  }
 
  /* Third thought and beyond — faded out */
  ::part(thought-item-2),
  ::part(thought-item-3),
  ::part(thought-item-4),
  ::part(thought-item-5),
  ::part(thought-item-6),
  ::part(thought-item-7),
  ::part(thought-item-8),
  ::part(thought-item-9) {
    opacity: 0.2;
    font-size: 0.78rem;
    font-weight: 400;
  }
 
  /* ── Progress ────────────────────────────────────────────────── */
  .progress-block {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
 
  ::part(progress-track) {
    flex: 1;
    height: 6px;
    background: rgba(0, 0, 0, 0.1);
    border-radius: 999px;
    overflow: hidden;
  }
 
  ::part(progress-fill) {
    height: 100%;
    width: 0%;
    background: currentColor;
    border-radius: 999px;
    transition: width 0.35s ease;
  }
 
  ::part(progress-label) {
    font-size: 0.8rem;
    min-width: 2.8rem;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
</style>
 
<div class="widget" part="widget">
  <div class="thoughts-block" part="thoughts-block">
    <ul class="thought-list" part="thought-list"
        aria-live="polite" aria-label="Generation progress thoughts"></ul>
  </div>
 
  <div class="progress-block" part="progress-block">
    <div class="progress-track" part="progress-track"
         role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
      <div class="progress-fill" part="progress-fill"></div>
    </div>
    <!-- <span class="progress-label" part="progress-label">0%</span> -->
  </div>
</div>
`

// ─── Web Component ────────────────────────────────────────────────────────────
export class GenerationWidget extends HTMLElement {
    static get observedAttributes() {
        return [
            'app-key',        // Pusher app key (required)
            'host',           // WebSocket host  — default "realtime.simplified.travel"
            'port',           // WebSocket port  — default "6001"
            'channel',        // Pusher channel  — default "generation"
            'force-tls',      // "true" | "false"  — default "true"
            'auth-endpoint',  // optional, for future private channels
            'show-thoughts',  // "true" | "false"  — default "true"
            'show-progress',  // "true" | "false"  — default "true"
            'thought-count',  // integer — default "3"
        ]
    }

    constructor() {
        super()
        this._ws = null
        this._thoughts = null
        this._progress = null
        this._handlers = {}   // event name → Set of handler functions
        this._active = false
    }

    // ── Lifecycle ──────────────────────────────────────────────────────────────

    connectedCallback() {
        // Singleton: if another instance already exists, silently bail out
        if (_instance && _instance !== this) {
            console.warn('[generation-widget] Only one instance is allowed per page. This element will not render.')
            return
        }
        _instance = this

        this.attachShadow({ mode: 'open' })
        this.shadowRoot.appendChild(template.content.cloneNode(true))
        this._bindElements()
        this._applyVisibilityConfig()

        // Start hidden — will show when document.generation.event { type: "started" } arrives
        this.setAttribute('hidden', '')

        this._initWs()
    }

    disconnectedCallback() {
        this._ws?.destroy()
        this._ws = null
        if (_instance === this) _instance = null
    }

    attributeChangedCallback(name, oldVal, newVal) {
        if (!this.shadowRoot || oldVal === newVal) return
        if (['show-thoughts', 'show-progress', 'thought-count'].includes(name)) {
            this._applyVisibilityConfig()
        }
        if (['app-key', 'host', 'port', 'channel', 'force-tls', 'auth-endpoint'].includes(name)) {
            this._initWs()
        }
    }

    // ── Public API ─────────────────────────────────────────────────────────────

    /**
     * Subscribe to widget events.
     *
     * Supported events:
     *   'document.generation.event'    — { type: 'started' | 'done' }
     *   'document.generation.thought'  — { content: string }
     *   'document.generation.progress' — { content: number }
     *   'widget:connected'             — no data
     *   'widget:disconnected'          — no data
     *   'widget:error'                 — error object
     *
     * @param {string}   eventName
     * @param {function} handler
     * @returns {this}  chainable
     */
    on(eventName, handler) {
        if (!this._handlers[eventName]) {
            this._handlers[eventName] = new Set()
        }
        this._handlers[eventName].add(handler)
        return this
    }

    /**
     * Unsubscribe a previously registered handler.
     * @param {string}   eventName
     * @param {function} handler
     * @returns {this}
     */
    off(eventName, handler) {
        this._handlers[eventName]?.delete(handler)
        return this
    }

    // ── Internal ───────────────────────────────────────────────────────────────

    _bindElements() {
        const thoughtList = this.shadowRoot.querySelector('.thought-list')
        const barFill = this.shadowRoot.querySelector('.progress-fill')
        const barTrack = this.shadowRoot.querySelector('.progress-track')
        const label = this.shadowRoot.querySelector('.progress-label')

        this._thoughts = new ThoughtsBlock(thoughtList, this._thoughtCount())
        this._progress = new ProgressBlock(barFill, label)
        this._barTrack = barTrack
    }

    _applyVisibilityConfig() {
        const thoughtsBlock = this.shadowRoot?.querySelector('.thoughts-block')
        const progressBlock = this.shadowRoot?.querySelector('.progress-block')

        if (thoughtsBlock) {
            thoughtsBlock.style.display = this._showThoughts() ? '' : 'none'
        }
        if (progressBlock) {
            progressBlock.style.display = this._showProgress() ? '' : 'none'
        }

        // If thought-count changed, re-initialise the ThoughtsBlock
        if (this._thoughts) {
            const thoughtList = this.shadowRoot.querySelector('.thought-list')
            this._thoughts = new ThoughtsBlock(thoughtList, this._thoughtCount())
        }
    }

    _initWs() {
        const appKey = this.getAttribute('app-key')
        const host = this.getAttribute('host') || 'realtime.simplified.travel'
        const port = parseInt(this.getAttribute('port') || '6001', 10)
        const channel = this.getAttribute('channel') || 'generation'

        if (!appKey) {
            console.warn('[generation-widget] Missing required attribute: app-key must be set.')
            return
        }

        this._ws?.destroy()

        this._ws = new WsManager({
            appKey,
            host,
            port,
            channel,
            forceTLS: this._boolAttr('force-tls', true),
            authEndpoint: this.getAttribute('auth-endpoint') ?? undefined,
            events: TRACKED_EVENTS,

            onMessage: (eventName, data) => this._handleMessage(eventName, data),
            onConnect: () => this._emit('widget:connected'),
            onDisconnect: () => this._emit('widget:disconnected'),
            onError: (err) => {
                this._emit('widget:error', err)
                // Stay hidden — don't render a broken widget
                this.setAttribute('hidden', '')
            },
        })
    }

    _handleMessage(eventName, data) {
        // Always emit to external handlers first
        this._emit(eventName, data)

        switch (eventName) {
            case EVENT_GENERATION:
                this._handleGenerationEvent(data)
                break
            case EVENT_THOUGHT:
                if (this._active && this._showThoughts()) {
                    this._thoughts?.push(data?.content ?? '')
                }
                break
            case EVENT_PROGRESS:
                if (this._active && this._showProgress()) {
                    const pct = parseInt(data?.content ?? 0, 10)
                    this._progress?.update(pct)
                    this._barTrack?.setAttribute('aria-valuenow', pct)
                }
                break
        }
    }

    _handleGenerationEvent(data) {
        const type = data?.type

        if (type === 'started') {
            this._active = true
            this._thoughts?.clear()
            this._progress?.reset()
            this.removeAttribute('hidden')
        } else if (type === 'done') {
            this._active = false
            // Small delay before hiding so the user sees 100% / final state
            setTimeout(() => {
                if (!this._active) this.setAttribute('hidden', '')
            }, 1200)
        }
    }

    _emit(eventName, data) {
        this._handlers[eventName]?.forEach(fn => {
            try { fn(data) }
            catch (e) { console.error(`[generation-widget] Error in handler for "${eventName}":`, e) }
        })
    }

    // ── Config helpers ─────────────────────────────────────────────────────────

    _boolAttr(name, defaultValue = false) {
        const val = this.getAttribute(name)
        if (val === null) return defaultValue
        return val !== 'false'
    }

    _showThoughts() { return this._boolAttr('show-thoughts', true) }
    _showProgress() { return this._boolAttr('show-progress', true) }
    _thoughtCount() { return Math.max(1, parseInt(this.getAttribute('thought-count') || '3', 10)) }
}