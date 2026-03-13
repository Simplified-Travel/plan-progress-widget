// Polyfills for older browsers — feature-detected, only load what's needed
import '@webcomponents/webcomponentsjs/webcomponents-bundle.js'

import { GenerationWidget } from './widget.js'

// Singleton guard: only register once, even if the script is loaded multiple times
if (!customElements.get('generation-widget')) {
    customElements.define('generation-widget', GenerationWidget)
}

// Enforce a single instance on the page — warn and no-op if a second element
// is added to the DOM (handled inside the widget's connectedCallback)
export { GenerationWidget }