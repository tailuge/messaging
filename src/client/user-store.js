import { LitElement } from 'lit';
import { genId } from './utils.js';

class UserStore extends EventTarget {
    constructor() {
        super();
        const storedId = (localStorage.getItem('userId') || '').trim();
        this.clientId = storedId.length >= 2 ? storedId : genId();
        if (this.clientId !== storedId) localStorage.setItem('userId', this.clientId);
        
        this.userName = localStorage.getItem('userName') || 'Anonymous';
        this.lod = localStorage.getItem('lod') || '1';
    }

    set(clientId, userName) {
        this.clientId = clientId.trim().length >= 2 ? clientId.trim() : genId();
        this.userName = userName;
        localStorage.setItem('userId', this.clientId);
        localStorage.setItem('userName', userName);
        this.dispatchEvent(new Event('change'));
    }

    setLod(val) {
        this.lod = val;
        localStorage.setItem('lod', val);
        this.dispatchEvent(new Event('change'));
    }
}

export const userStore = new UserStore();

export class StoreElement extends LitElement {
    connectedCallback() {
        super.connectedCallback();
        this._storeListener = () => this.requestUpdate();
        userStore.addEventListener('change', this._storeListener);
    }
    disconnectedCallback() {
        super.disconnectedCallback();
        userStore.removeEventListener('change', this._storeListener);
    }
}
