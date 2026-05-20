// Read overrides from query params: ?a=Alice&b=Bob&c=Carol
const p = new URLSearchParams(location.search);
const users = [
    { id: p.get('aid') || 'alice', name: p.get('a') || 'Alice' },
    { id: p.get('bid') || 'bob',   name: p.get('b') || 'Bob'   },
    { id: p.get('cid') || 'carol', name: p.get('c') || 'Carol' },
];

users.forEach(u => {
    const pane = document.createElement('div');
    pane.className = 'pane';

    const label = document.createElement('div');
    label.className = 'pane-label';
    label.textContent = `${u.name} (${u.id})`;

    const iframe = document.createElement('iframe');
    iframe.src = `lobby.html?userId=${encodeURIComponent(u.id)}&userName=${encodeURIComponent(u.name)}`;

    pane.appendChild(label);
    pane.appendChild(iframe);
    document.body.appendChild(pane);
});

// Hide third pane on portrait/mobile
const check = () => {
    const panes = document.querySelectorAll('.pane');
    if (window.innerHeight > window.innerWidth && panes.length > 2) panes[2].remove();
};
window.addEventListener('resize', check);
check();
