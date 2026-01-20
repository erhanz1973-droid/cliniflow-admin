// Push Notification Utility
// This file handles push notification registration and subscription

const API_BASE = window.location.origin || 'http://localhost:5050';

/**
 * Get VAPID public key from server
 */
async function getVAPIDPublicKey() {
  try {
    const response = await fetch(`${API_BASE}/api/push/public-key`);
    const data = await response.json();
    if (data.ok && data.publicKey) {
      return data.publicKey;
    }
    throw new Error('Failed to get VAPID public key');
  } catch (error) {
    console.error('[Push] Error getting VAPID public key:', error);
    throw error;
  }
}

/**
 * Convert VAPID key from base64url to Uint8Array
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');
  
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Register service worker
 */
async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.warn('[Push] Service Worker not supported');
    return null;
  }
  
  try {
    const registration = await navigator.serviceWorker.register('/service-worker.js');
    console.log('[Push] Service Worker registered:', registration);
    return registration;
  } catch (error) {
    console.error('[Push] Service Worker registration failed:', error);
    return null;
  }
}

/**
 * Request notification permission
 */
async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    console.warn('[Push] Notifications not supported');
    return 'denied';
  }
  
  if (Notification.permission === 'granted') {
    return 'granted';
  }
  
  if (Notification.permission === 'denied') {
    console.warn('[Push] Notification permission denied');
    return 'denied';
  }
  
  const permission = await Notification.requestPermission();
  console.log('[Push] Notification permission:', permission);
  return permission;
}

/**
 * Subscribe to push notifications
 */
async function subscribeToPush(patientId, registration) {
  if (!registration) {
    throw new Error('Service Worker not registered');
  }
  
  try {
    // Get VAPID public key
    const vapidPublicKey = await getVAPIDPublicKey();
    if (!vapidPublicKey) {
      throw new Error('VAPID public key not available');
    }
    
    // Convert VAPID key to Uint8Array
    const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
    
    // Subscribe to push service
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey,
    });
    
    console.log('[Push] Push subscription created:', subscription);
    
    // Send subscription to server
    const token = localStorage.getItem('patient_token') || '';
    const response = await fetch(`${API_BASE}/api/patient/${encodeURIComponent(patientId)}/push-subscription`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
      },
      body: JSON.stringify({
        subscription: subscription,
      }),
    });
    
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || 'Failed to register push subscription');
    }
    
    console.log('[Push] Push subscription registered successfully');
    return subscription;
  } catch (error) {
    console.error('[Push] Error subscribing to push:', error);
    throw error;
  }
}

/**
 * Unsubscribe from push notifications
 */
async function unsubscribeFromPush(patientId, registration) {
  if (!registration) {
    return false;
  }
  
  try {
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await subscription.unsubscribe();
      console.log('[Push] Unsubscribed from push notifications');
      return true;
    }
    return false;
  } catch (error) {
    console.error('[Push] Error unsubscribing from push:', error);
    return false;
  }
}

/**
 * Initialize push notifications for a patient
 * This is the main function to call from patient pages
 */
async function initializePushNotifications(patientId) {
  if (!patientId) {
    console.warn('[Push] Patient ID required');
    return false;
  }
  
  try {
    // Check if already subscribed
    const registration = await navigator.serviceWorker.ready;
    const existingSubscription = await registration.pushManager.getSubscription();
    
    if (existingSubscription) {
      console.log('[Push] Already subscribed to push notifications');
      // Optionally update subscription on server
      return true;
    }
    
    // Request permission
    const permission = await requestNotificationPermission();
    if (permission !== 'granted') {
      console.warn('[Push] Notification permission not granted');
      return false;
    }
    
    // Register service worker if not already registered
    let swRegistration = await navigator.serviceWorker.ready;
    if (!swRegistration.active) {
      swRegistration = await registerServiceWorker();
      if (!swRegistration) {
        throw new Error('Service Worker registration failed');
      }
      // Wait for service worker to be ready
      swRegistration = await navigator.serviceWorker.ready;
    }
    
    // Subscribe to push
    await subscribeToPush(patientId, swRegistration);
    
    console.log('[Push] Push notifications initialized successfully');
    return true;
  } catch (error) {
    console.error('[Push] Failed to initialize push notifications:', error);
    return false;
  }
}

/**
 * Check if push notifications are supported
 */
function isPushNotificationSupported() {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * Check if chat page is open and visible
 */
function isChatPageOpen() {
  if (typeof document === 'undefined') return false;
  
  // Check if current page is chat page
  const url = window.location.pathname || '';
  const isChatPage = url.includes('/chat') || url.includes('chat');
  
  if (!isChatPage) return false;
  
  // Check if page is visible
  if (document.visibilityState === 'hidden') return false;
  
  // Check if window is focused
  if (!document.hasFocus()) return false;
  
  return true;
}

/**
 * Vibrate device (if supported)
 */
function vibrateDevice(pattern = [200, 100, 200]) {
  if (!('vibrate' in navigator)) {
    console.log('[Vibration] Vibration not supported');
    return false;
  }
  
  try {
    navigator.vibrate(pattern);
    console.log('[Vibration] Vibration triggered:', pattern);
    return true;
  } catch (e) {
    console.warn('[Vibration] Vibration failed:', e);
    return false;
  }
}

/**
 * Setup message listener for Service Worker messages
 * Call this in chat pages to handle vibration when new message arrives
 */
function setupChatMessageListener() {
  if (!('serviceWorker' in navigator)) return;
  
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'NEW_MESSAGE' && event.data.vibrate) {
      console.log('[Chat] New message received, vibrating...');
      vibrateDevice([200, 100, 200]); // Short vibration pattern
    }
  });
  
  console.log('[Chat] Message listener setup for vibration');
}

// Export functions for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initializePushNotifications,
    subscribeToPush,
    unsubscribeFromPush,
    isPushNotificationSupported,
    requestNotificationPermission,
    registerServiceWorker,
  };
}
