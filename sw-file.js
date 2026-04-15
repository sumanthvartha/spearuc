// sw.js — Save this file in the ROOT of your repo
// Path: sumanthvartha.github.io/sw.js

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  
  const options = {
    body: data.body || 'A meeting is live — tap to join',
    requireInteraction: true,
    vibrate: [400, 100, 400, 100, 400],
    tag: 'cascade-meeting',
    renotify: true,
    actions: [
      { action: 'join', title: '🟢 Join Now' },
      { action: 'dismiss', title: 'Dismiss' }
    ],
    data: { url: data.url || '/' }
  };

  event.waitUntil(
    self.registration.showNotification(
      data.title || '🔴 Meeting is LIVE',
      options
    )
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  event.waitUntil(clients.openWindow(event.notification.data.url || '/'));
});
