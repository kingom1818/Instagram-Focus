/**
 * Instagram Focus — background service worker
 *
 * Sets default settings in chrome.storage.sync on install, so the popup
 * and content script always have a defined state to read.
 */
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(['extensionEnabled', 'hideSearchBar'], (items) => {
    const updates = {};
    if (typeof items.extensionEnabled === 'undefined') {
      updates.extensionEnabled = true; // Default: ON
    }
    if (typeof items.hideSearchBar === 'undefined') {
      updates.hideSearchBar = false; // Default: OFF
    }
    if (Object.keys(updates).length > 0) {
      chrome.storage.sync.set(updates);
    }
  });
});
