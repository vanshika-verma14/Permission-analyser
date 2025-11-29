/**
 * PERMISSION ANALYZER - PROFESSIONAL GRADE INJECTED SCRIPT
 * Purpose: Detect ACTIVE permission usage - especially silent abuse of prior grants
 * Focus: Websites using camera/mic/location WITHOUT showing permission prompt
 * This catches the scenario: "I allowed camera 2 months ago, now they use it secretly"
 */

(function() {
  'use strict';

  // ============================================================
  // DEDUPLICATION SYSTEM (Prevents spam while maintaining accuracy)
  // ============================================================
  
  const activePermissions = new Map(); // Track currently active permissions
  const recentLogs = new Map(); // Prevent duplicate logs
  const DEBOUNCE_WINDOW = 2000; // 2 seconds - reasonable window

  /**
   * Log a permission usage event
   * @param {string} permissionType - Type of permission (camera, microphone, etc.)
   * @param {string} action - What's happening (active-use, accessed, shown)
   * @param {object} metadata - Additional context
   */
  function logPermissionUsage(permissionType, action, metadata = {}) {
    const eventKey = `${permissionType}:${action}`;
    const now = Date.now();
    
    // Check if we recently logged this exact event
    if (recentLogs.has(eventKey)) {
      const lastLog = recentLogs.get(eventKey);
      if (now - lastLog < DEBOUNCE_WINDOW) {
        return; // Skip duplicate
      }
    }
    
    // Update log timestamp
    recentLogs.set(eventKey, now);
    
    // Clean old entries (older than 10 seconds)
    for (const [key, timestamp] of recentLogs.entries()) {
      if (now - timestamp > 10000) {
        recentLogs.delete(key);
      }
    }
    
    // Dispatch event to content script
    window.dispatchEvent(new CustomEvent('PERMISSION_DETECTED', {
      detail: {
        permissionType,
        action,
        metadata: {
          ...metadata,
          detectionMethod: 'api-interception',
          timestamp: now
        }
      }
    }));
    
    console.log(`[Permission Analyzer] 🔒 ${permissionType.toUpperCase()} - ${action}`, metadata);
  }

  // ============================================================
  // CAMERA & MICROPHONE MONITORING
  // KEY FEATURE: Detects usage of previously-granted permissions
  // ============================================================
  
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    
    navigator.mediaDevices.getUserMedia = function(constraints) {
      const requestId = `media-${Date.now()}`;
      let requestingVideo = false;
      let requestingAudio = false;
      
      if (constraints) {
        requestingVideo = !!constraints.video;
        requestingAudio = !!constraints.audio;
      }
      
      // Call original API
      return originalGetUserMedia(constraints).then(stream => {
        // SUCCESS: Permission was already granted OR user just granted it
        // Either way, the permission is NOW ACTIVELY BEING USED
        
        if (requestingVideo) {
          logPermissionUsage('camera', 'active-use', {
            duration: 'started',
            requestId: requestId,
            constraints: typeof constraints.video === 'object' ? 'advanced' : 'basic'
          });
          activePermissions.set('camera', { stream, requestId });
        }
        
        if (requestingAudio) {
          logPermissionUsage('microphone', 'active-use', {
            duration: 'started',
            requestId: requestId,
            constraints: typeof constraints.audio === 'object' ? 'advanced' : 'basic'
          });
          activePermissions.set('microphone', { stream, requestId });
        }
        
        // Monitor stream tracks for ending
        stream.getTracks().forEach(track => {
          const permType = track.kind === 'video' ? 'camera' : 'microphone';
          
          // Track when stopped manually
          const originalStop = track.stop.bind(track);
          track.stop = function() {
            logPermissionUsage(permType, 'stopped', {
              duration: 'ended',
              requestId: requestId,
              reason: 'manual-stop'
            });
            activePermissions.delete(permType);
            return originalStop();
          };
          
          // Track when ended (connection closed)
          track.addEventListener('ended', function() {
            logPermissionUsage(permType, 'stopped', {
              duration: 'ended',
              requestId: requestId,
              reason: 'connection-ended'
            });
            activePermissions.delete(permType);
          });
        });
        
        return stream;
      }).catch(err => {
        // User denied permission - don't log (not actual usage)
        throw err;
      });
    };
  }

  // Legacy getUserMedia (older websites)
  if (navigator.getUserMedia) {
    const legacyGetUserMedia = navigator.getUserMedia.bind(navigator);
    navigator.getUserMedia = function(constraints, successCallback, errorCallback) {
      return legacyGetUserMedia(
        constraints,
        function(stream) {
          if (constraints && constraints.video) {
            logPermissionUsage('camera', 'active-use', { api: 'legacy' });
          }
          if (constraints && constraints.audio) {
            logPermissionUsage('microphone', 'active-use', { api: 'legacy' });
          }
          if (successCallback) successCallback(stream);
        },
        errorCallback
      );
    };
  }

  // ============================================================
  // GEOLOCATION MONITORING
  // KEY FEATURE: Detects when websites access your location
  // ============================================================
  
  if (navigator.geolocation) {
    // Monitor getCurrentPosition (one-time location access)
    const originalGetCurrentPosition = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
    navigator.geolocation.getCurrentPosition = function(successCallback, errorCallback, options) {
      const requestId = `geo-${Date.now()}`;
      
      return originalGetCurrentPosition(
        function(position) {
          // SUCCESS: Website got your location
          logPermissionUsage('location', 'accessed', {
            requestId: requestId,
            accuracy: position.coords.accuracy,
            method: 'getCurrentPosition'
          });
          
          if (successCallback) successCallback(position);
        },
        errorCallback,
        options
      );
    };

    // Monitor watchPosition (continuous location tracking)
    const originalWatchPosition = navigator.geolocation.watchPosition.bind(navigator.geolocation);
    const activeWatchers = new Map();
    
    navigator.geolocation.watchPosition = function(successCallback, errorCallback, options) {
      const watchId = originalWatchPosition(
        function(position) {
          const requestId = `watch-${watchId}`;
          
          // Log FIRST access, then less frequently
          if (!activeWatchers.has(watchId)) {
            logPermissionUsage('location', 'tracking-started', {
              requestId: requestId,
              method: 'watchPosition',
              watchId: watchId
            });
            activeWatchers.set(watchId, { startTime: Date.now(), updateCount: 0 });
          } else {
            // Increment update count
            const watcher = activeWatchers.get(watchId);
            watcher.updateCount++;
            
            // Log every 10th update to show tracking is ongoing
            if (watcher.updateCount % 10 === 0) {
              logPermissionUsage('location', 'tracking-active', {
                requestId: requestId,
                updateCount: watcher.updateCount,
                durationMs: Date.now() - watcher.startTime
              });
            }
          }
          
          if (successCallback) successCallback(position);
        },
        errorCallback,
        options
      );
      
      return watchId;
    };

    // Monitor clearWatch (when tracking stops)
    const originalClearWatch = navigator.geolocation.clearWatch.bind(navigator.geolocation);
    navigator.geolocation.clearWatch = function(watchId) {
      if (activeWatchers.has(watchId)) {
        const watcher = activeWatchers.get(watchId);
        logPermissionUsage('location', 'tracking-stopped', {
          watchId: watchId,
          totalUpdates: watcher.updateCount,
          totalDuration: Date.now() - watcher.startTime
        });
        activeWatchers.delete(watchId);
      }
      return originalClearWatch(watchId);
    };
  }

  // ============================================================
  // CLIPBOARD MONITORING
  // KEY FEATURE: Detects when websites read/write clipboard
  // ============================================================
  
  if (navigator.clipboard) {
    // Monitor clipboard READ (website reading what you copied)
    if (navigator.clipboard.readText) {
      const originalReadText = navigator.clipboard.readText.bind(navigator.clipboard);
      navigator.clipboard.readText = function() {
        return originalReadText().then(text => {
          logPermissionUsage('clipboard-read', 'accessed', {
            dataType: 'text',
            dataLength: text ? text.length : 0
          });
          return text;
        }).catch(err => {
          throw err;
        });
      };
    }

    if (navigator.clipboard.read) {
      const originalRead = navigator.clipboard.read.bind(navigator.clipboard);
      navigator.clipboard.read = function() {
        return originalRead().then(clipboardItems => {
          const types = [];
          if (clipboardItems && clipboardItems.length > 0) {
            clipboardItems.forEach(item => {
              types.push(...item.types);
            });
          }
          
          logPermissionUsage('clipboard-read', 'accessed', {
            dataType: 'mixed',
            contentTypes: types
          });
          return clipboardItems;
        }).catch(err => {
          throw err;
        });
      };
    }

    // Monitor clipboard WRITE (website writing to your clipboard)
    if (navigator.clipboard.writeText) {
      const originalWriteText = navigator.clipboard.writeText.bind(navigator.clipboard);
      navigator.clipboard.writeText = function(text) {
        return originalWriteText(text).then(() => {
          logPermissionUsage('clipboard-write', 'accessed', {
            dataType: 'text',
            dataLength: text ? text.length : 0
          });
        }).catch(err => {
          throw err;
        });
      };
    }

    if (navigator.clipboard.write) {
      const originalWrite = navigator.clipboard.write.bind(navigator.clipboard);
      navigator.clipboard.write = function(data) {
        return originalWrite(data).then(() => {
          logPermissionUsage('clipboard-write', 'accessed', {
            dataType: 'mixed'
          });
        }).catch(err => {
          throw err;
        });
      };
    }
  }

  // ============================================================
  // NOTIFICATION MONITORING
  // KEY FEATURE: Detects when websites show notifications
  // ============================================================
  
  if (window.Notification) {
    const OriginalNotification = window.Notification;
    
    // Wrap Notification constructor
    window.Notification = function(title, options) {
      logPermissionUsage('notifications', 'shown', {
        hasTitle: !!title,
        hasIcon: !!(options && options.icon),
        hasBody: !!(options && options.body)
      });
      
      return new OriginalNotification(title, options);
    };
    
    // Maintain prototype chain
    window.Notification.prototype = OriginalNotification.prototype;
    
    // Copy static properties with proper descriptors
    Object.defineProperty(window.Notification, 'permission', {
      get: function() { return OriginalNotification.permission; },
      enumerable: true,
      configurable: false
    });
    
    if (OriginalNotification.maxActions !== undefined) {
      Object.defineProperty(window.Notification, 'maxActions', {
        get: function() { return OriginalNotification.maxActions; },
        enumerable: true,
        configurable: false
      });
    }
    
    // Copy requestPermission method
    if (OriginalNotification.requestPermission) {
      window.Notification.requestPermission = OriginalNotification.requestPermission.bind(OriginalNotification);
    }
  }

  // ============================================================
  // INITIALIZATION COMPLETE
  // ============================================================
  
  console.log('%c[Permission Analyzer] Professional monitoring active', 'color: #10b981; font-weight: bold;');
  console.log('[Permission Analyzer] Tracking: Camera, Microphone, Location, Clipboard, Notifications');
  console.log('[Permission Analyzer] Focus: Detecting silent usage of pre-granted permissions');
  
})();