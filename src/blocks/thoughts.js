/**
 * ThoughtsBlock
 * Maintains a rolling window of the most recent N thoughts.
 * Most recent thought is always at index 0 (top of the list).
 *
 * Styling is intentionally absent here — all visual treatment
 * (opacity, size, colour, transitions) is expressed as CSS in the
 * shadow DOM template and overridable by the developer via ::part().
 *
 * Each <li> receives two part names:
 *   part="thought-item thought-item-{n}"
 *
 * Where {n} is the position index (0 = most recent).
 * This lets the developer target individual positions:
 *   generation-widget::part(thought-item)    — all items
 *   generation-widget::part(thought-item-0)  — most recent
 *   generation-widget::part(thought-item-1)  — second
 *   generation-widget::part(thought-item-2)  — third, etc.
 */
export class ThoughtsBlock {
    /**
     * @param {HTMLElement} container   - The shadow DOM element to render into
     * @param {number}      maxThoughts - How many thoughts to display (configurable)
     */
    constructor(container, maxThoughts = 3) {
        this._container = container
        this._maxThoughts = maxThoughts
        this._thoughts = []   // most recent first
    }

    /**
     * Add a new thought and re-render.
     * @param {string} content
     */
    push(content) {
        this._thoughts.unshift(content)
        if (this._thoughts.length > this._maxThoughts) {
            this._thoughts = this._thoughts.slice(0, this._maxThoughts)
        }
        this._render()
    }

    clear() {
        this._thoughts = []
        this._render()
    }

    _render() {
        this._container.innerHTML = this._thoughts
            .map((thought, i) => {
                return `<li part="thought-item thought-item-${i}">${_escapeHtml(thought)}</li>`
            })
            .join('')
    }
}

function _escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}