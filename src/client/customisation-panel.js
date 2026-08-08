import { html, css } from 'lit';
import { userStore, StoreElement } from './user-store.js';
import { SHARED_STYLES, CHALLENGE_MODAL_STYLES } from './styles.js';

class CustomisationPanel extends StoreElement {
    static properties = {};

    static CUSTOMISATIONS = [
        { key: 'cue', label: 'Cue', type: 'toggle' }
    ];

    static styles = [SHARED_STYLES, CHALLENGE_MODAL_STYLES, css`
        .modal { padding: 0.7rem 1rem; gap: 0.3rem; }
        h3 { margin: 0 0 0.1rem; font-size: 0.9rem; }
        .row { display: flex; align-items: center; gap: 0.5rem; font-size: 0.82rem; color: var(--text); line-height: 1.3; }
        .section-title { font-size: 0.7rem; font-weight: bold; color: var(--text-muted); text-transform: uppercase; margin-top: 0.3rem; margin-bottom: 0.1rem; border-bottom: 1px solid var(--border-light); padding-bottom: 1px; }
        label { cursor: pointer; display: flex; align-items: center; gap: 0.3rem; }

        /* Toggle Switch CSS */
        .switch {
            position: relative;
            display: inline-block !important;
            width: 30px;
            height: 16px;
            margin-left: auto;
        }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider {
            position: absolute;
            cursor: pointer;
            inset: 0;
            background-color: var(--btn-border);
            transition: 0.2s;
            border-radius: 16px;
        }
        .slider:before {
            position: absolute;
            content: "";
            height: 10px;
            width: 10px;
            left: 3px;
            bottom: 3px;
            background-color: var(--surface);
            transition: 0.2s;
            border-radius: 50%;
        }
        input:checked + .slider { background-color: #0d6efd; }
        input:checked + .slider:before { transform: translateX(14px); }
    `];

    constructor() {
        super();
        this._onKeydown = this._onKeydown.bind(this);
    }

    connectedCallback() {
        super.connectedCallback();
        window.addEventListener('keydown', this._onKeydown);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        window.removeEventListener('keydown', this._onKeydown);
    }

    _onKeydown(e) {
        if (e.key === 'Escape') {
            e.stopPropagation();
            this._close();
        }
    }

    _close() {
        this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
    }

    render() {
        const custom = userStore.getCustom();
        return html`
            <div class="backdrop" @click=${e => e.target === e.currentTarget && this._close()}>
                <div class="modal" role="dialog" aria-modal="true" aria-label="Customisation">
                    <h3>Customisation</h3>
                    <div class="section-title">Settings</div>

                    ${CustomisationPanel.CUSTOMISATIONS.map(item => {
                        if (item.type === 'toggle') {
                            const val = custom[item.key] ?? '0';
                            return html`
                                <div class="row">
                                    <span>${item.label}</span>
                                    <label class="switch">
                                        <input type="checkbox" .checked=${val === '1'} @change=${e => userStore.setCustom(item.key, e.target.checked ? '1' : '0')}>
                                        <span class="slider"></span>
                                    </label>
                                </div>
                            `;
                        }
                        return '';
                    })}

                    <button class="cancel" @click=${this._close} style="margin-top: 0.4rem;">Close</button>
                </div>
            </div>
        `;
    }
}

customElements.define('customisation-panel', CustomisationPanel);
