

// DOM Elements
const totalLogsEl = document.getElementById('total-logs');
const cameraCountEl = document.getElementById('camera-count');
const micCountEl = document.getElementById('mic-count');
const locationCountEl = document.getElementById('location-count');
const clipboardCountEl = document.getElementById('clipboard-count');
const notificationCountEl = document.getElementById('notification-count');
const recentLogsEl = document.getElementById('recent-logs');
const viewDashboardBtn = document.getElementById('view-dashboard');
const clearLogsBtn = document.getElementById('clear-logs');
const notificationsToggle = document.getElementById('notifications-toggle');

// Initialize popup
document.addEventListener('DOMContentLoaded', () => {
  // Reset badge counter when popup is opened
  chrome.runtime.sendMessage({ type: 'RESET_BADGE' });
  
  loadLogs();
  loadSettings();
  setupEventListeners();
});

/**
 * Load and display logs
 */
async function loadLogs() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_LOGS' });
    const logs = response.logs || [];
    
    // Update total count
    totalLogsEl.textContent = `${logs.length} log${logs.length !== 1 ? 's' : ''}`;
    
    // Calculate permission counts
    const counts = {
      camera: 0,
      microphone: 0,
      location: 0,
      clipboard: 0,
      notifications: 0
    };
    
    logs.forEach(log => {
      if (log.permissionType === 'camera') counts.camera++;
      else if (log.permissionType === 'microphone') counts.microphone++;
      else if (log.permissionType === 'location') counts.location++;
      else if (log.permissionType.includes('clipboard')) counts.clipboard++;
      else if (log.permissionType === 'notifications') counts.notifications++;
    });
    
    // Update count displays
    cameraCountEl.textContent = counts.camera;
    micCountEl.textContent = counts.microphone;
    locationCountEl.textContent = counts.location;
    clipboardCountEl.textContent = counts.clipboard;
    notificationCountEl.textContent = counts.notifications;
    
    // Display recent logs (last 10)
    displayRecentLogs(logs.slice(0, 10));
  } catch (error) {
    console.error('Error loading logs:', error);
    recentLogsEl.innerHTML = '<div class="no-logs">Error loading logs</div>';
  }
}

/**
 * Display recent logs in the popup
 */
function displayRecentLogs(logs) {
  if (logs.length === 0) {
    recentLogsEl.innerHTML = '<div class="no-logs">No permission activity detected yet</div>';
    return;
  }
  
  recentLogsEl.innerHTML = '';
  
  logs.forEach(log => {
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${log.permissionType}`;
    
    const permissionIcon = getPermissionIcon(log.permissionType);
    const permissionName = formatPermissionName(log.permissionType);
    
    logEntry.innerHTML = `
      <div class="log-header">
        <div class="log-permission">
          <span>${permissionIcon}</span>
          <span>${permissionName}</span>
        </div>
        <div class="log-time">${getTimeAgo(log.timestamp)}</div>
      </div>
      <div class="log-domain">${log.domain}</div>
      <div class="log-action">${log.action}</div>
    `;
    
    recentLogsEl.appendChild(logEntry);
  });
}

/**
 * Get icon for permission type
 */
function getPermissionIcon(permissionType) {
  const icons = {
    'camera': '📷',
    'microphone': '🎤',
    'location': '📍',
    'clipboard-read': '📋',
    'clipboard-write': '📋',
    'notifications': '🔔'
  };
  return icons[permissionType] || '🔒';
}

/**
 * Format permission name for display
 */
function formatPermissionName(permissionType) {
  const names = {
    'camera': 'Camera',
    'microphone': 'Microphone',
    'location': 'Location',
    'clipboard-read': 'Clipboard Read',
    'clipboard-write': 'Clipboard Write',
    'notifications': 'Notifications'
  };
  return names[permissionType] || permissionType;
}

/**
 * Get relative time (e.g., "2 min ago")
 */
function getTimeAgo(isoString) {
  const now = new Date();
  const then = new Date(isoString);
  const diffMs = now - then;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffSeconds < 60) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  if (diffHours < 24) return `${diffHours} hr ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  
  return then.toLocaleDateString();
}

/**
 * Load settings
 */
async function loadSettings() {
  try {
    const settings = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    notificationsToggle.checked = settings.notificationsEnabled !== false;
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // View Dashboard button
  viewDashboardBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
  });
  
  // Clear Logs button
  clearLogsBtn.addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear all logs? This cannot be undone.')) {
      try {
        await chrome.runtime.sendMessage({ type: 'CLEAR_LOGS' });
        loadLogs(); // Reload to show empty state
      } catch (error) {
        console.error('Error clearing logs:', error);
        alert('Failed to clear logs. Please try again.');
      }
    }
  });
  
  // Notifications toggle
  notificationsToggle.addEventListener('change', async () => {
    try {
      const settings = {
        notificationsEnabled: notificationsToggle.checked
      };
      await chrome.runtime.sendMessage({ 
        type: 'UPDATE_SETTINGS', 
        settings 
      });
    } catch (error) {
      console.error('Error updating settings:', error);
    }
  });
}