/**
 * PERMISSION ANALYZER - DASHBOARD SCRIPT
 * Handles dashboard display, filtering, and data export
 */

// DOM Elements
const totalLogsEl = document.getElementById('total-logs');
const cameraLogsEl = document.getElementById('camera-logs');
const micLogsEl = document.getElementById('mic-logs');
const locationLogsEl = document.getElementById('location-logs');
const clipboardLogsEl = document.getElementById('clipboard-logs');
const notificationLogsEl = document.getElementById('notification-logs');
const logsTbody = document.getElementById('logs-tbody');
const filterPermission = document.getElementById('filter-permission');
const searchDomain = document.getElementById('search-domain');
const resetFiltersBtn = document.getElementById('reset-filters');
const exportCsvBtn = document.getElementById('export-csv');
const exportMdBtn = document.getElementById('export-md');
const clearAllBtn = document.getElementById('clear-all');

// Global variables
let allLogs = [];
let filteredLogs = [];

// Initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
  loadLogs();
  setupEventListeners();
});

/**
 * Load logs from storage
 */
async function loadLogs() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_LOGS' });
    allLogs = response.logs || [];
    filteredLogs = [...allLogs];
    
    updateStats();
    displayLogs();
  } catch (error) {
    console.error('Error loading logs:', error);
    logsTbody.innerHTML = '<tr><td colspan="5" class="no-data">Error loading logs</td></tr>';
  }
}

/**
 * Update statistics cards
 */
function updateStats() {
  const counts = {
    total: allLogs.length,
    camera: 0,
    microphone: 0,
    location: 0,
    clipboard: 0,
    notifications: 0
  };
  
  allLogs.forEach(log => {
    switch (log.permissionType) {
      case 'camera':
        counts.camera++;
        break;
      case 'microphone':
        counts.microphone++;
        break;
      case 'location':
        counts.location++;
        break;
      case 'clipboard-read':
      case 'clipboard-write':
        counts.clipboard++;
        break;
      case 'notifications':
        counts.notifications++;
        break;
    }
  });
  
  totalLogsEl.textContent = counts.total;
  cameraLogsEl.textContent = counts.camera;
  micLogsEl.textContent = counts.microphone;
  locationLogsEl.textContent = counts.location;
  clipboardLogsEl.textContent = counts.clipboard;
  notificationLogsEl.textContent = counts.notifications;
}

/**
 * Display logs in table
 */
function displayLogs() {
  if (filteredLogs.length === 0) {
    logsTbody.innerHTML = '<tr><td colspan="5" class="no-data">No logs match your filters</td></tr>';
    return;
  }
  
  logsTbody.innerHTML = '';
  
  filteredLogs.forEach(log => {
    const row = document.createElement('tr');
    
    const permissionIcon = getPermissionIcon(log.permissionType);
    const permissionName = formatPermissionName(log.permissionType);
    
    row.innerHTML = `
      <td>
        <span class="permission-badge ${log.permissionType}">
          ${permissionIcon} ${permissionName}
        </span>
      </td>
      <td class="domain-cell">${escapeHtml(log.domain)}</td>
      <td class="action-cell">${escapeHtml(log.action)}</td>
      <td class="timestamp-cell">${log.dateFormatted}</td>
      <td class="url-cell" title="${escapeHtml(log.url)}">${escapeHtml(log.url)}</td>
    `;
    
    logsTbody.appendChild(row);
  });
}

/**
 * Apply filters
 */
function applyFilters() {
  const permissionFilter = filterPermission.value;
  const domainSearch = searchDomain.value.toLowerCase().trim();
  
  filteredLogs = allLogs.filter(log => {
    // Permission type filter
    if (permissionFilter !== 'all' && log.permissionType !== permissionFilter) {
      return false;
    }
    
    // Domain search filter
    if (domainSearch && !log.domain.toLowerCase().includes(domainSearch)) {
      return false;
    }
    
    return true;
  });
  
  displayLogs();
}

/**
 * Reset filters
 */
function resetFilters() {
  filterPermission.value = 'all';
  searchDomain.value = '';
  filteredLogs = [...allLogs];
  displayLogs();
}

/**
 * Export logs as CSV
 */
function exportAsCSV() {
  if (allLogs.length === 0) {
    alert('No logs to export');
    return;
  }
  
  // CSV Header
  let csv = 'Timestamp,Domain,URL,Permission Type,Action\n';
  
  // CSV Rows
  allLogs.forEach(log => {
    const row = [
      `"${log.dateFormatted}"`,
      `"${log.domain}"`,
      `"${log.url}"`,
      `"${log.permissionType}"`,
      `"${log.action}"`
    ].join(',');
    
    csv += row + '\n';
  });
  
  // Download CSV
  downloadFile(csv, 'permission-analyzer-logs.csv', 'text/csv');
}

/**
 * Export logs as Markdown
 */
function exportAsMarkdown() {
  if (allLogs.length === 0) {
    alert('No logs to export');
    return;
  }
  
  const now = new Date();
  const exportDate = now.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  let markdown = `# Permission Analyzer - Activity Log\n\n`;
  markdown += `**Exported:** ${exportDate}\n`;
  markdown += `**Total Entries:** ${allLogs.length}\n\n`;
  markdown += `---\n\n`;
  
  // Statistics Section
  markdown += `## Summary Statistics\n\n`;
  const counts = {
    camera: 0,
    microphone: 0,
    location: 0,
    clipboard: 0,
    notifications: 0
  };
  
  allLogs.forEach(log => {
    if (log.permissionType === 'camera') counts.camera++;
    else if (log.permissionType === 'microphone') counts.microphone++;
    else if (log.permissionType === 'location') counts.location++;
    else if (log.permissionType.includes('clipboard')) counts.clipboard++;
    else if (log.permissionType === 'notifications') counts.notifications++;
  });
  
  markdown += `- 📷 Camera Access: ${counts.camera}\n`;
  markdown += `- 🎤 Microphone Access: ${counts.microphone}\n`;
  markdown += `- 📍 Location Access: ${counts.location}\n`;
  markdown += `- 📋 Clipboard Access: ${counts.clipboard}\n`;
  markdown += `- 🔔 Notifications: ${counts.notifications}\n\n`;
  markdown += `---\n\n`;
  
  // Logs Table
  markdown += `## Detailed Logs\n\n`;
  markdown += `| Timestamp | Domain | Permission | Action | URL |\n`;
  markdown += `|-----------|--------|------------|--------|-----|\n`;
  
  allLogs.forEach(log => {
    markdown += `| ${log.dateFormatted} | ${log.domain} | ${formatPermissionName(log.permissionType)} | ${log.action} | ${log.url} |\n`;
  });
  
  markdown += `\n---\n\n`;
  markdown += `*Generated by Permission Analyzer v1.0.0*\n`;
  
  // Download Markdown
  downloadFile(markdown, 'permission-analyzer-logs.md', 'text/markdown');
}

/**
 * Download file helper
 */
function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Clear all logs
 */
async function clearAllLogs() {
  if (!confirm('Are you sure you want to clear ALL logs? This action cannot be undone.')) {
    return;
  }
  
  try {
    await chrome.runtime.sendMessage({ type: 'CLEAR_LOGS' });
    allLogs = [];
    filteredLogs = [];
    updateStats();
    displayLogs();
    alert('All logs have been cleared successfully.');
  } catch (error) {
    console.error('Error clearing logs:', error);
    alert('Failed to clear logs. Please try again.');
  }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  filterPermission.addEventListener('change', applyFilters);
  searchDomain.addEventListener('input', applyFilters);
  resetFiltersBtn.addEventListener('click', resetFilters);
  exportCsvBtn.addEventListener('click', exportAsCSV);
  exportMdBtn.addEventListener('click', exportAsMarkdown);
  clearAllBtn.addEventListener('click', clearAllLogs);
}

/**
 * Helper functions
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

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}