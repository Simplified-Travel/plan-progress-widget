/**
 * ProgressBlock
 * Renders a simple animated progress bar for integer percentage values (0–100).
 */
export class ProgressBlock {
    /**
     * @param {HTMLElement} barFill    - The inner fill element of the progress bar
     * @param {HTMLElement} label      - The percentage label element
     */
    constructor(barFill, label) {
        this._barFill = barFill
        this._label = label
        this._current = 0
    }

    /**
     * Update the displayed progress.
     * @param {number} pct - Integer 0–100
     */
    update(pct) {
        const clamped = Math.min(100, Math.max(0, Math.round(pct)))
        this._current = clamped
        this._barFill.style.width = `${clamped}%`
        if (this._label) this._label.textContent = `${clamped}%`
    }

    reset() {
        this.update(0)
    }
}