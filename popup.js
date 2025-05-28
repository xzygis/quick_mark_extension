function updateButton(isBookmarked) {
  const btn = document.getElementById('saveBtn');
  if (isBookmarked) {
    btn.innerText = '取消收藏';
    btn.classList.add('cancel');
  } else {
    btn.innerText = '一键收藏';
    btn.classList.remove('cancel');
  }
}

function checkAndSetButton(url) {
  chrome.storage.local.get({ bookmarks: [] }, function(data) {
    const bookmarks = data.bookmarks;
    updateButton(bookmarks.some(b => b.url === url));
  });
}

chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
  const tab = tabs[0];
  if (!tab) return;
  checkAndSetButton(tab.url);

  document.getElementById('saveBtn').onclick = function() {
    chrome.storage.local.get({ bookmarks: [] }, function(data) {
      const bookmarks = data.bookmarks;
      const idx = bookmarks.findIndex(b => b.url === tab.url);
      if (idx !== -1) {
        // 已收藏，取消收藏
        bookmarks.splice(idx, 1);
        chrome.storage.local.set({ bookmarks }, function() {
          document.getElementById('status').innerText = '已取消收藏';
          updateButton(false);
        });
      } else {
        // 未收藏，添加
        const favicon = tab.favIconUrl || '';
        const group = (new URL(tab.url)).hostname;
        bookmarks.push({
          id: Date.now() + Math.random().toString(36).substr(2, 5),
          url: tab.url,
          title: tab.title,
          favicon,
          group,
          createdAt: Date.now()
        });
        chrome.storage.local.set({ bookmarks }, function() {
          document.getElementById('status').innerText = '收藏成功！';
          updateButton(true);
        });
      }
    });
  };
}); 