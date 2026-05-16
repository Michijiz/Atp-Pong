// Service Worker minimale — no cache, solo push
// Riattiveremo il caching quando tutto funziona

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());

self.addEventListener('push', event => {
  if (!event.data) return;
  let data;
  try { data = event.data.json(); } 
  catch(e) { data = { title: 'PongATP', body: event.data.text() }; }
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'PongATP', {
      body:    data.body || '',
      icon:    '/assets/icons/icon-192.png',
      tag:     data.tag || 'pongatp',
      vibrate: [200, 100, 200]
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});