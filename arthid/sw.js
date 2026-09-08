// Arthid notification service worker
// Hosts the OS-level notifications fired when the app is backgrounded,
// and bridges the "Reply" / click actions back to the page so it can
// open the in-app reply popup with the cursor in the input.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('notificationclick', event => {
    event.notification.close();
    const action = event.action || 'open';
    const data = event.notification.data || {};

    event.waitUntil((async () => {
        const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        let client = all.find(c => 'focus' in c);
        if (client) {
            await client.focus();
        } else {
            const targetUrl = data.url || self.registration.scope;
            client = await self.clients.openWindow(targetUrl);
        }
        if (client) {
            client.postMessage({
                type: 'arthid-notification-action',
                action,
                chatName: data.chatName || null,
                body: data.body || ''
            });
        }
    })());
});
