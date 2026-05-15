// Chat Vibration Utility
// Add this script to chat pages to enable vibration when chat is open

(function() {
  'use strict';
  
  // Check if vibration is supported
  if (!('vibrate' in navigator)) {
    console.log('[Chat Vibration] Vibration not supported on this device');
    return;
  }
  
  // Check if Service Worker is supported
  if (!('serviceWorker' in navigator)) {
    console.log('[Chat Vibration] Service Worker not supported');
    return;
  }
  
  // Vibration pattern: short vibration for new messages
  const VIBRATION_PATTERN = [200, 100, 200]; // 200ms on, 100ms off, 200ms on
  
  /**
   * Check if current page is chat page
   */
  function isChatPage() {
    const url = window.location.pathname || '';
    return url.includes('/chat') || url.includes('chat') || document.querySelector('.chat-messages, .chat-area, #chatMessages');
  }
  
  /**
   * Check if page is visible and focused
   */
  function isPageActive() {
    return document.visibilityState === 'visible' && document.hasFocus();
  }
  
  /**
   * Vibrate device
   */
  function vibrate(pattern = VIBRATION_PATTERN) {
    try {
      navigator.vibrate(pattern);
      console.log('[Chat Vibration] Vibration triggered');
      return true;
    } catch (e) {
      console.warn('[Chat Vibration] Vibration failed:', e);
      return false;
    }
  }
  
  /**
   * Handle new message (called when message arrives)
   * Only vibrate if chat page is open and active
   */
  function handleNewMessage(messageData) {
    if (!isChatPage()) {
      console.log('[Chat Vibration] Not a chat page, skipping vibration');
      return;
    }
    
    if (!isPageActive()) {
      console.log('[Chat Vibration] Page not active, skipping vibration');
      return;
    }
    
    // Only vibrate for CLINIC messages
    if (messageData && messageData.from === 'CLINIC') {
      vibrate();
    } else if (!messageData || messageData.from !== 'PATIENT') {
      // Default: vibrate if no from specified (assume CLINIC)
      vibrate();
    }
  }
  
  /**
   * Setup Service Worker message listener
   */
  function setupServiceWorkerListener() {
    navigator.serviceWorker.ready.then((registration) => {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'NEW_MESSAGE' && event.data.vibrate) {
          handleNewMessage(event.data.data);
        }
      });
      
      console.log('[Chat Vibration] Service Worker message listener setup');
    });
  }
  
  /**
   * Initialize chat vibration
   */
  function init() {
    if (!isChatPage()) {
      console.log('[Chat Vibration] Not a chat page, vibration not initialized');
      return;
    }
    
    // Setup Service Worker listener
    if ('serviceWorker' in navigator) {
      setupServiceWorkerListener();
    }
    
    // Export function for manual use
    window.chatVibrate = vibrate;
    window.handleChatMessage = handleNewMessage;
    
    console.log('[Chat Vibration] Chat vibration initialized');
  }
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
