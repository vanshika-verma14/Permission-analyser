/**
 * PERMISSION ANALYZER - CONTENT SCRIPT (PROFESSIONAL VERSION)
 * Purpose: Bridge between page context and extension background
 * Clean, simple, reliable message forwarding
 */

(function() {
  'use strict';

  // ============================================================
  // INJECT PAGE-CONTEXT SCRIPT
  // ============================================================
  
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected.js');
  script.onload = function() {
    this.remove(); // Clean up after injection
  };
  (document.head || document.documentElement).appendChild(script);

  // ============================================================
  // MESSAGE FORWARDING
  // ============================================================
  
  window.addEventListener('PERMISSION_DETECTED', function(event) {
    const data = event.detail;
    
    // Build comprehensive log entry
    const logData = {
      permissionType: data.permissionType,
      domain: window.location.hostname,
      url: window.location.href,
      timestamp: new Date().toISOString(),
      action: data.action,
      metadata: data.metadata || {},
      pageTitle: document.title,
      isVisible: document.visibilityState === 'visible'
    };
    
    // Forward to background script
    chrome.runtime.sendMessage({
      type: 'PERMISSION_USAGE',
      data: logData
    }).catch(err => {
      // Silently handle errors (extension may be reloading)
      console.debug('[Permission Analyzer] Send failed:', err.message);
    });
  });

  // ============================================================
  // INITIALIZATION
  // ============================================================
  
  console.log('[Permission Analyzer] Content script active on:', window.location.hostname);
  
})();