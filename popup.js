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

function getSecondLevelDomain(hostname) {
  // 简单提取二级域名（如foo.example.com -> example.com）
  const parts = hostname.split('.');
  if (parts.length >= 2) {
    return parts.slice(-2).join('.');
  }
  return hostname;
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
        // 已收藏，直接取消收藏
        bookmarks.splice(idx, 1);
        chrome.storage.local.set({ bookmarks }, function() {
          document.getElementById('status').innerText = '已取消收藏';
          updateButton(false);
        });
      } else {
        // 未收藏，添加
        const favicon = tab.favIconUrl || '';
        const newUrlHostname = (new URL(tab.url)).hostname;
        let targetGroup = newUrlHostname; // 默认使用新网页的域名作为分组

        // 优先查找完整域名分组
        for (const existingB of bookmarks) {
          try {
            const existingHostname = (new URL(existingB.url)).hostname;
            if (existingHostname === newUrlHostname) {
              targetGroup = existingB.group; // 使用已存在的分组名
              break;
            }
          } catch (e) {
            console.warn("Error parsing existing bookmark URL:", existingB.url, e);
          }
        }

        bookmarks.push({
          id: Date.now() + Math.random().toString(36).substr(2, 5),
          url: tab.url,
          title: tab.title,
          favicon,
          group: targetGroup, // 使用找到的或默认的分组名
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