import { LitElement } from 'lit';

class UserStore extends EventTarget {
    clientId = localStorage.getItem('clientId') || '';
    userName = localStorage.getItem('userName') || 'Anonymous';

    set(clientId, userName) {
        this.clientId = clientId;
        this.userName = userName;
        localStorage.setItem('clientId', clientId);
        localStorage.setItem('userName', userName);
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
