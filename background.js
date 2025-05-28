chrome.runtime.onInstalled.addListener(() => {
  // 初始化存储
  chrome.storage.local.get({ bookmarks: [] }, () => {});
}); 