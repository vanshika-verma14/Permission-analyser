/**
 * PERMISSION ANALYZER - PROFESSIONAL GRADE (SMART LOCATION DETECTION)
 * Purpose: Detect ACTIVE permission usage intelligently
 * 
 * Location Detection Logic:
 * - Logs on FIRST access per page ✓
 * - Logs on NEW user-initiated actions (e.g., clicking "My Location") ✓
 * - Does NOT log continuous background updates (spam) ✗
 * - Does NOT log on page cleanup/exit ✗
 */

(function() {
  'use strict';

  // ============================================================
  // DEDUPLICATION SYSTEM
  // ============================================================
  
  const loggedEvents = new Map();
  const DEBOUNCE_TIME = 500; // 500ms - faster response, still prevents spam

  // Smart location tracking
  const locationTracking = {
    lastLogTime: 0,
    activeWatchers: new Set(),
    MIN_LOG_INTERVAL: 5000, // Only log if 5+ seconds since last log (new action)
    isUnloading: false, // Flag to prevent logging during page unload
    lastVisibilityChange: 0 // Track when visibility changes
  };

  /**
   * Log a permission usage event
   */
  function notifyPermissionUsage(permissionType, action) {
    const eventKey = `${permissionType}-${action}`;
    const now = Date.now();
    
    // Check if we recently logged this exact event
    if (loggedEvents.has(eventKey)) {
      const lastLogTime = loggedEvents.get(eventKey);
      if (now - lastLogTime < DEBOUNCE_TIME) {
        return; // Skip duplicate within debounce window
      }
    }
    
    // Update last log time
    loggedEvents.set(eventKey, now);
    
    // Clean old entries (older than 5 seconds)
    for (const [key, timestamp] of loggedEvents.entries()) {
      if (now - timestamp > 5000) {
        loggedEvents.delete(key);
      }
    }
    
    // Dispatch the event
    window.dispatchEvent(new CustomEvent('PERMISSION_DETECTED', {
      detail: {
        permissionType: permissionType,
        action: action || 'accessed'
      }
    }));
  }

  // ============================================================
  // CAMERA & MICROPHONE DETECTION
  // ============================================================
  
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    
    navigator.mediaDevices.getUserMedia = function(constraints) {
      // Call original function first
      return originalGetUserMedia(constraints).then(stream => {
        // Successfully obtained media stream
        if (constraints && constraints.video) {
          notifyPermissionUsage('camera', 'active');
        }
        if (constraints && constraints.audio) {
          notifyPermissionUsage('microphone', 'active');
        }
        
        // Monitor when the stream ends
        stream.getTracks().forEach(track => {
          const originalStop = track.stop.bind(track);
          track.stop = function() {
            const permType = track.kind === 'video' ? 'camera' : 'microphone';
            notifyPermissionUsage(permType, 'stopped');
            return originalStop();
          };
          
          // Also monitor track ended event
          track.addEventListener('ended', function() {
            const permType = track.kind === 'video' ? 'camera' : 'microphone';
            notifyPermissionUsage(permType, 'stopped');
          });
        });
        
        return stream;
      }).catch(err => {
        // Permission denied - don't log
        throw err;
      });
    };
  }

  // Legacy getUserMedia support
  if (navigator.getUserMedia) {
    const legacyGetUserMedia = navigator.getUserMedia.bind(navigator);
    navigator.getUserMedia = function(constraints, successCallback, errorCallback) {
      return legacyGetUserMedia(
        constraints,
        function(stream) {
          if (constraints && constraints.video) notifyPermissionUsage('camera', 'active');
          if (constraints && constraints.audio) notifyPermissionUsage('microphone', 'active');
          if (successCallback) successCallback(stream);
        },
        errorCallback
      );
    };
  }

  // ============================================================
  // GEOLOCATION DETECTION (SMART VERSION)
  // Logs:
  // - First access ✓
  // - User-initiated actions (5+ seconds apart) ✓
  // Does NOT log:
  // - Continuous background updates ✗
  // - Page cleanup ✗
  // ============================================================
  
  if (navigator.geolocation) {
    // Intercept getCurrentPosition (one-time location access)
    const originalGetCurrentPosition = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
    navigator.geolocation.getCurrentPosition = function(successCallback, errorCallback, options) {
      return originalGetCurrentPosition(
        function(position) {
          // CRITICAL: Don't log if page is unloading
          if (locationTracking.isUnloading) {
            if (successCallback) successCallback(position);
            return;
          }
          
          const now = Date.now();
          const timeSinceLastLog = now - locationTracking.lastLogTime;
          const timeSinceVisibilityChange = now - locationTracking.lastVisibilityChange;
          
          // Don't log if this is within 2 seconds of visibility change (Chrome restore)
          if (timeSinceVisibilityChange < 2000 && locationTracking.lastVisibilityChange > 0) {
            if (successCallback) successCallback(position);
            return;
          }
          
          // Log if:
          // 1. First access (lastLogTime = 0), OR
          // 2. It's been 5+ seconds since last log (new user action)
          if (timeSinceLastLog === now || timeSinceLastLog >= locationTracking.MIN_LOG_INTERVAL) {
            notifyPermissionUsage('location', 'accessed');
            locationTracking.lastLogTime = now;
          }
          
          if (successCallback) successCallback(position);
        },
        errorCallback,
        options
      );
    };

    // Intercept watchPosition (continuous tracking)
    const originalWatchPosition = navigator.geolocation.watchPosition.bind(navigator.geolocation);
    navigator.geolocation.watchPosition = function(successCallback, errorCallback, options) {
      let callbackCount = 0;
      
      const watchId = originalWatchPosition(
        function(position) {
          // CRITICAL: Don't log if page is unloading
          if (locationTracking.isUnloading) {
            if (successCallback) successCallback(position);
            return;
          }
          
          callbackCount++;
          const now = Date.now();
          const timeSinceLastLog = now - locationTracking.lastLogTime;
          const timeSinceVisibilityChange = now - locationTracking.lastVisibilityChange;
          
          // Don't log if this is within 2 seconds of visibility change (Chrome restore)
          if (timeSinceVisibilityChange < 2000 && locationTracking.lastVisibilityChange > 0) {
            if (successCallback) successCallback(position);
            return;
          }
          
          // Log if:
          // 1. First callback (callbackCount === 1), OR
          // 2. It's been 5+ seconds since last log
          if (callbackCount === 1 || timeSinceLastLog >= locationTracking.MIN_LOG_INTERVAL) {
            notifyPermissionUsage('location', 'accessed');
            locationTracking.lastLogTime = now;
          }
          // All other callbacks (rapid updates) = silent
          
          if (successCallback) successCallback(position);
        },
        errorCallback,
        options
      );
      
      // Track active watcher
      locationTracking.activeWatchers.add(watchId);
      
      return watchId;
    };

    // Intercept clearWatch - NO LOGGING AT ALL
    // This is called on page cleanup/exit - we must NOT log here
    const originalClearWatch = navigator.geolocation.clearWatch.bind(navigator.geolocation);
    navigator.geolocation.clearWatch = function(watchId) {
      // Remove from active watchers silently
      locationTracking.activeWatchers.delete(watchId);
      
      // CRITICAL: Just call original, absolutely NO logging
      return originalClearWatch(watchId);
    };
    
    // ADDITIONAL FIX: Prevent any location logging during page unload
    window.addEventListener('beforeunload', function() {
      // Set a flag to prevent any location logging during cleanup
      locationTracking.isUnloading = true;
    }, false);
    
    window.addEventListener('pagehide', function() {
      // Also handle pagehide event
      locationTracking.isUnloading = true;
    }, false);
    
    // CHROME RESTORE FIX: Prevent logging when Chrome resumes from taskbar
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'visible') {
        // Tab became visible (e.g., Chrome restored from taskbar)
        locationTracking.lastVisibilityChange = Date.now();
      }
    }, false);
  }

  // ============================================================
  // CLIPBOARD DETECTION (ACCURATE - Only logs successful operations)
  // ============================================================
  
  if (navigator.clipboard) {
    // Intercept readText (only log if actually reads text)
    if (navigator.clipboard.readText) {
      const originalReadText = navigator.clipboard.readText.bind(navigator.clipboard);
      navigator.clipboard.readText = function() {
        return originalReadText().then(text => {
          // Only log if text was actually read successfully
          if (text !== undefined && text !== null) {
            notifyPermissionUsage('clipboard-read', 'accessed');
          }
          return text;
        }).catch(err => {
          // Failed to read - don't log
          throw err;
        });
      };
    }

    // Intercept read (only log if actually reads data)
    if (navigator.clipboard.read) {
      const originalRead = navigator.clipboard.read.bind(navigator.clipboard);
      navigator.clipboard.read = function() {
        return originalRead().then(clipboardItems => {
          // Only log if we actually got clipboard data
          if (clipboardItems && clipboardItems.length > 0) {
            notifyPermissionUsage('clipboard-read', 'accessed');
          }
          return clipboardItems;
        }).catch(err => {
          // Failed to read - don't log
          throw err;
        });
      };
    }

    // Intercept writeText (only log successful writes)
    if (navigator.clipboard.writeText) {
      const originalWriteText = navigator.clipboard.writeText.bind(navigator.clipboard);
      navigator.clipboard.writeText = function(text) {
        return originalWriteText(text).then(() => {
          // Successfully wrote to clipboard
          notifyPermissionUsage('clipboard-write', 'accessed');
        }).catch(err => {
          // Failed to write - don't log
          throw err;
        });
      };
    }

    // Intercept write (only log successful writes)
    if (navigator.clipboard.write) {
      const originalWrite = navigator.clipboard.write.bind(navigator.clipboard);
      navigator.clipboard.write = function(data) {
        return originalWrite(data).then(() => {
          // Successfully wrote to clipboard
          notifyPermissionUsage('clipboard-write', 'accessed');
        }).catch(err => {
          // Failed to write - don't log
          throw err;
        });
      };
    }
  }

  // ============================================================
  // NOTIFICATION DETECTION
  // ============================================================
  
  if (window.Notification) {
    const OriginalNotification = window.Notification;
    
    // Wrap the Notification constructor
    window.Notification = function(title, options) {
      notifyPermissionUsage('notifications', 'shown');
      return new OriginalNotification(title, options);
    };
    
    // Properly inherit from original
    window.Notification.prototype = OriginalNotification.prototype;
    
    // Copy static methods
    if (OriginalNotification.requestPermission) {
      window.Notification.requestPermission = OriginalNotification.requestPermission.bind(OriginalNotification);
    }
    
    // Make permission property read-only
    Object.defineProperty(window.Notification, 'permission', {
      get: function() {
        return OriginalNotification.permission;
      },
      enumerable: true,
      configurable: false
    });
    
    // Copy other static properties
    if (OriginalNotification.maxActions !== undefined) {
      Object.defineProperty(window.Notification, 'maxActions', {
        get: function() {
          return OriginalNotification.maxActions;
        },
        enumerable: true,
        configurable: false
      });
    }
  }

  console.log('[Permission Analyzer] Smart monitoring enabled');
  console.log('[Permission Analyzer] Location: Logs new actions (5s+ apart), ignores background updates');
})();