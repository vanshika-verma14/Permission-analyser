/**
 * PERMISSION ANALYZER - BACKGROUND SERVICE WORKER
 * Handles all logging, notifications, badge updates, and data persistence
 */

// Track new logs count for badge
let newLogsCount = 0;

// Listen for permission usage messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PERMISSION_USAGE') {
    handlePermissionUsage(message.data);
  } else if (message.type === 'GET_LOGS') {
    getLogs().then(logs => sendResponse({ logs }));
    return true; // Keep message channel open for async response
  } else if (message.type === 'CLEAR_LOGS') {
    clearLogs().then(() => sendResponse({ success: true }));
    return true;
  } else if (message.type === 'GET_SETTINGS') {
    getSettings().then(settings => sendResponse(settings));
    return true;
  } else if (message.type === 'UPDATE_SETTINGS') {
    updateSettings(message.settings).then(() => sendResponse({ success: true }));
    return true;
  } else if (message.type === 'RESET_BADGE') {
    resetBadge();
    sendResponse({ success: true });
  }
});

/**
 * Handle permission usage event
 */
async function handlePermissionUsage(data) {
  try {
    // Create comprehensive log entry
    const logEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: data.timestamp,
      dateFormatted: formatDate(data.timestamp),
      domain: data.domain,
      url: data.url,
      permissionType: data.permissionType,
      action: data.action,
      metadata: data.metadata || {},
      pageTitle: data.pageTitle || '',
      isVisible: data.isVisible !== undefined ? data.isVisible : true
    };

    // Save to storage
    await saveLog(logEntry);

    // Increment badge counter
    newLogsCount++;
    updateBadge();

    // Show notification if enabled
    const settings = await getSettings();
    if (settings.notificationsEnabled !== false) {
      showNotification(logEntry);
    }

    console.log('[Permission Analyzer] Logged:', logEntry);
  } catch (error) {
    console.error('[Permission Analyzer] Error handling permission usage:', error);
  }
}

/**
 * Update extension badge with new logs count
 */
function updateBadge() {
  if (newLogsCount > 0) {
    const badgeText = newLogsCount > 99 ? '99+' : newLogsCount.toString();
    chrome.action.setBadgeText({ text: badgeText });
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444' }); // Red color
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

/**
 * Reset badge counter (called when user opens popup)
 */
function resetBadge() {
  newLogsCount = 0;
  chrome.action.setBadgeText({ text: '' });
}

/**
 * Save log entry to chrome.storage.local
 */
async function saveLog(logEntry) {
  try {
    const result = await chrome.storage.local.get(['logs']);
    const logs = result.logs || [];
    
    // Add new log at the beginning (most recent first)
    logs.unshift(logEntry);
    
    // Keep only last 1000 logs to prevent storage overflow
    if (logs.length > 1000) {
      logs.length = 1000;
    }
    
    await chrome.storage.local.set({ logs });
  } catch (error) {
    console.error('[Permission Analyzer] Error saving log:', error);
  }
}

/**
 * Get all logs from storage
 */
async function getLogs() {
  try {
    const result = await chrome.storage.local.get(['logs']);
    return result.logs || [];
  } catch (error) {
    console.error('[Permission Analyzer] Error getting logs:', error);
    return [];
  }
}

/**
 * Clear all logs
 */
async function clearLogs() {
  try {
    await chrome.storage.local.set({ logs: [] });
    newLogsCount = 0;
    updateBadge();
    console.log('[Permission Analyzer] Logs cleared');
  } catch (error) {
    console.error('[Permission Analyzer] Error clearing logs:', error);
  }
}

/**
 * Get user settings
 */
async function getSettings() {
  try {
    const result = await chrome.storage.local.get(['settings']);
    return result.settings || { notificationsEnabled: true };
  } catch (error) {
    console.error('[Permission Analyzer] Error getting settings:', error);
    return { notificationsEnabled: true };
  }
}

/**
 * Update user settings
 */
async function updateSettings(newSettings) {
  try {
    await chrome.storage.local.set({ settings: newSettings });
    console.log('[Permission Analyzer] Settings updated:', newSettings);
  } catch (error) {
    console.error('[Permission Analyzer] Error updating settings:', error);
  }
}

/**
 * Show desktop notification (with spam protection)
 */
const notificationTracker = new Map();
const NOTIFICATION_COOLDOWN = 3000; // 3 seconds between same notifications

function showNotification(logEntry) {
  const permissionIcons = {
    'camera': '📷',
    'microphone': '🎤',
    'location': '📍',
    'clipboard-read': '📋',
    'clipboard-write': '📋',
    'notifications': '🔔'
  };

  const icon = permissionIcons[logEntry.permissionType] || '🔒';
  const permissionName = logEntry.permissionType.replace('-', ' ').toUpperCase();
  
  // Create unique key for this notification type + domain
  const notificationKey = `${logEntry.permissionType}-${logEntry.domain}`;
  const now = Date.now();
  
  // Check if we recently showed this exact notification
  if (notificationTracker.has(notificationKey)) {
    const lastShown = notificationTracker.get(notificationKey);
    if (now - lastShown < NOTIFICATION_COOLDOWN) {
      return; // Skip notification (too soon)
    }
  }
  
  // Update tracker
  notificationTracker.set(notificationKey, now);
  
  // Clean old entries from tracker
  for (const [key, timestamp] of notificationTracker.entries()) {
    if (now - timestamp > 10000) { // Remove entries older than 10s
      notificationTracker.delete(key);
    }
  }
  
  // Show notification
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: `${icon} Permission Used`,
    message: `${permissionName} accessed by ${logEntry.domain}`,
    priority: 1,
    requireInteraction: false, // Auto-dismiss
    silent: false
  });
}

/**
 * Format date to human-readable format
 */
function formatDate(isoString) {
  const date = new Date(isoString);
  
  const options = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  };
  
  return date.toLocaleString('en-US', options);
}

/**
 * Extension installation handler
 */
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Permission Analyzer] Extension installed');
  
  // Initialize storage if first install
  chrome.storage.local.get(['logs', 'settings'], (result) => {
    if (!result.logs) {
      chrome.storage.local.set({ logs: [] });
    }
    if (!result.settings) {
      chrome.storage.local.set({ 
        settings: { 
          notificationsEnabled: true 
        } 
      });
    }
  });
  
  // Initialize badge
  chrome.action.setBadgeText({ text: '' });
});

console.log('[Permission Analyzer] Background service worker initialized');