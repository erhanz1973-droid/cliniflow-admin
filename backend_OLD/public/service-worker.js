// Service Worker for Push Notifications
// This file handles push notifications when the app is closed

const CACHE_NAME = 'clinifly-v1';
const urlsToCache = [
  '/',
  '/index.html',
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching app shell');
        return cache.addAll(urlsToCache);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// Push event - handle push notifications when app is closed
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push notification received:', event);
  
  let notificationData = {
    title: 'Klinikten Yeni Mesaj',
    body: 'Yeni bir mesaj aldınız',
    icon: '/icon-192x192.png',
    badge: '/badge-72x72.png',
      tag: 'clinifly-message',
    requireInteraction: false,
    data: {
      url: '/',
      patientId: null,
    }
  };
  
  // Parse push payload
  if (event.data) {
    try {
      const payload = event.data.json();
      notificationData = {
        title: payload.title || notificationData.title,
        body: payload.body || notificationData.body,
        icon: payload.icon || notificationData.icon,
        badge: payload.badge || notificationData.badge,
        tag: payload.tag || notificationData.tag,
        requireInteraction: payload.requireInteraction || false,
        silent: payload.silent !== undefined ? payload.silent : false, // Sadece CLINIC mesajları için ses açık
        data: payload.data || notificationData.data,
      };
    } catch (e) {
      // If payload is text
      notificationData.body = event.data.text();
    }
  }
  
  // Sadece CLINIC'ten gelen mesajlar için ses çal
  // PATIENT'ten gelen mesajlar için ses çalmasın
  if (notificationData.data && notificationData.data.from !== "CLINIC") {
    notificationData.silent = true;
  }
  
  // Check if chat page is open and visible
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      let chatPageOpen = false;
      let chatPageVisible = false;
      
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        const url = client.url || '';
        // Check if chat page is open (check for /chat or chat-related URLs)
        if (url.includes('/chat') || url.includes('chat')) {
          chatPageOpen = true;
          // Check if page is visible and focused
          if (client.visibilityState === 'visible' && client.focused) {
            chatPageVisible = true;
            break;
          }
        }
      }
      
      // If chat page is open and visible, send vibration only (silent notification)
      if (chatPageOpen && chatPageVisible) {
        notificationData.silent = true;
        // Send message to active client to trigger vibration
        return Promise.all(
          clientList.map((client) => {
            if (client.visibilityState === 'visible' && (client.url.includes('/chat') || client.url.includes('chat'))) {
              return client.postMessage({
                type: 'NEW_MESSAGE',
                data: notificationData.data,
                vibrate: true
              });
            }
          })
        ).then(() => {
          // Show silent notification
          return self.registration.showNotification(notificationData.title, {
            body: notificationData.body,
            icon: notificationData.icon,
            badge: notificationData.badge,
            tag: notificationData.tag,
            requireInteraction: false,
            silent: true, // Silent when chat is open
            data: notificationData.data,
            actions: [
              {
                action: 'open',
                title: 'Mesajı Aç',
              },
              {
                action: 'close',
                title: 'Kapat',
              },
            ],
          });
        });
      }
      
      // Chat page is not open or not visible, show normal notification with sound
      return self.registration.showNotification(notificationData.title, {
        body: notificationData.body,
        icon: notificationData.icon,
        badge: notificationData.badge,
        tag: notificationData.tag,
        requireInteraction: notificationData.requireInteraction,
        silent: notificationData.silent !== undefined ? notificationData.silent : false, // Sadece CLINIC mesajları için ses açık
        data: notificationData.data,
        actions: [
          {
            action: 'open',
            title: 'Mesajı Aç',
          },
          {
            action: 'close',
            title: 'Kapat',
          },
        ],
      });
    })
  );
});

// Notification click event - handle when user clicks notification
self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification clicked:', event);
  
  event.notification.close();
  
  if (event.action === 'close') {
    return;
  }
  
  // Default action or 'open' action
  const urlToOpen = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    }).then((clientList) => {
      // Check if there's already a window/tab open with the target URL
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // If no window is open, open a new one
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// Message event - handle messages from main thread
self.addEventListener('message', (event) => {
  console.log('[Service Worker] Message received:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
