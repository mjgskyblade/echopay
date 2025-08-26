// EchoPay Fraud Reporting Service Worker
// Handles push notifications and offline functionality

const CACHE_NAME = 'echopay-fraud-v1';
const urlsToCache = [
  '/',
  '/fraud-report.html',
  '/fraud-case-tracker.html',
  '/js/fraud-report.js',
  '/js/fraud-case-tracker.js',
  'https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached version or fetch from network
        return response || fetch(event.request);
      }
    )
  );
});

// Push event - handle push notifications
self.addEventListener('push', (event) => {
  console.log('Push event received:', event);
  
  let notificationData = {};
  
  if (event.data) {
    try {
      notificationData = event.data.json();
    } catch (e) {
      notificationData = {
        title: 'EchoPay Fraud Alert',
        body: event.data.text() || 'You have a new fraud case update',
        icon: '/favicon.ico',
        badge: '/badge.png'
      };
    }
  }

  const options = {
    body: notificationData.body || 'You have a new fraud case update',
    icon: notificationData.icon || '/favicon.ico',
    badge: notificationData.badge || '/badge.png',
    tag: notificationData.tag || 'fraud-update',
    data: notificationData.data || {},
    requireInteraction: true,
    actions: [
      {
        action: 'view',
        title: 'View Case',
        icon: '/icons/view.png'
      },
      {
        action: 'dismiss',
        title: 'Dismiss',
        icon: '/icons/dismiss.png'
      }
    ],
    vibrate: [200, 100, 200], // Vibration pattern for mobile devices
    silent: false
  };

  event.waitUntil(
    self.registration.showNotification(
      notificationData.title || 'EchoPay Fraud Update',
      options
    )
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event);
  
  event.notification.close();

  if (event.action === 'view') {
    // Open the fraud case tracker
    const caseData = event.notification.data;
    let url = '/fraud-case-tracker.html';
    
    if (caseData.caseNumber) {
      url += `?case=${caseData.caseNumber}`;
    } else if (caseData.caseId) {
      url += `?case=${caseData.caseId}`;
    }
    
    event.waitUntil(
      clients.openWindow(url)
    );
  } else if (event.action === 'dismiss') {
    // Just close the notification (already done above)
    console.log('Notification dismissed');
  } else {
    // Default action - open the app
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// Background sync for offline form submissions
self.addEventListener('sync', (event) => {
  if (event.tag === 'fraud-report-sync') {
    event.waitUntil(syncFraudReports());
  }
});

async function syncFraudReports() {
  try {
    // Get pending fraud reports from IndexedDB
    const pendingReports = await getPendingReports();
    
    for (const report of pendingReports) {
      try {
        // Attempt to submit the report
        const response = await fetch('/api/fraud/report', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${report.authToken}`
          },
          body: JSON.stringify(report.data)
        });

        if (response.ok) {
          // Remove from pending reports
          await removePendingReport(report.id);
          
          // Show success notification
          self.registration.showNotification('Fraud Report Submitted', {
            body: 'Your fraud report has been successfully submitted',
            icon: '/favicon.ico',
            tag: 'sync-success'
          });
        }
      } catch (error) {
        console.error('Failed to sync fraud report:', error);
      }
    }
  } catch (error) {
    console.error('Background sync failed:', error);
  }
}

// IndexedDB helpers for offline storage
async function getPendingReports() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('EchoPayFraud', 1);
    
    request.onerror = () => reject(request.error);
    
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(['pendingReports'], 'readonly');
      const store = transaction.objectStore('pendingReports');
      const getAllRequest = store.getAll();
      
      getAllRequest.onsuccess = () => resolve(getAllRequest.result);
      getAllRequest.onerror = () => reject(getAllRequest.error);
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('pendingReports')) {
        db.createObjectStore('pendingReports', { keyPath: 'id' });
      }
    };
  });
}

async function removePendingReport(id) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('EchoPayFraud', 1);
    
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(['pendingReports'], 'readwrite');
      const store = transaction.objectStore('pendingReports');
      const deleteRequest = store.delete(id);
      
      deleteRequest.onsuccess = () => resolve();
      deleteRequest.onerror = () => reject(deleteRequest.error);
    };
  });
}

// Message event for communication with main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});