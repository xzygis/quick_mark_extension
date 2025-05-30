let cachedGroupOrder = null;
let isEditingTitle = false;

function getColumnCount() {
  const containerWidth = document.getElementById('masonry').offsetWidth;
  const groupElement = document.querySelector('.group');
  let groupOuterWidth = 260 + 12; // 默认值
  if (groupElement) {
    const style = window.getComputedStyle(groupElement);
    groupOuterWidth = groupElement.offsetWidth + parseFloat(style.marginRight) + parseFloat(style.marginLeft);
  }
  if (groupOuterWidth <= 0) groupOuterWidth = 272;
  return Math.max(1, Math.floor(containerWidth / groupOuterWidth));
}

function getSortedGroups(groups, bookmarks) {
  // 只在首次渲染或刷新时排序
  if (!cachedGroupOrder) {
    const groupStats = Object.keys(groups).map(group => {
      const items = groups[group];
      const totalClicks = items.reduce((sum, b) => sum + (b.clickCount || 0), 0);
      return { group, totalClicks, count: items.length };
    });
    groupStats.sort((a, b) => {
      if (b.totalClicks !== a.totalClicks) return b.totalClicks - a.totalClicks;
      if (b.count !== a.count) return b.count - a.count;
      return a.group.localeCompare(b.group);
    });
    cachedGroupOrder = groupStats.map(g => g.group);
  }
  // 只返回当前存在的分组
  return cachedGroupOrder.filter(g => groups[g]);
}

function getMasonryLayout(groups, containerWidth, minGroupWidth) {
  // 最大列数
  let maxCols = Math.max(1, Math.floor(containerWidth / minGroupWidth));
  // 列宽固定
  let groupOuterWidth = minGroupWidth;
  // 列间距
  let gap = maxCols > 1 ? (containerWidth - maxCols * groupOuterWidth) / (maxCols - 1) : 0;

  // Masonry分配优化
  let cols = Array.from({ length: maxCols }, () => []);
  let colPageCounts = Array(maxCols).fill(0);
  const sortedGroups = Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length);
  // 先将最大N个分组分别分配到每一列
  for (let i = 0; i < Math.min(maxCols, sortedGroups.length); i++) {
    cols[i].push(sortedGroups[i]);
    colPageCounts[i] += groups[sortedGroups[i]].length;
  }
  // 剩余分组再用贪心法分配
  for (let i = maxCols; i < sortedGroups.length; i++) {
    let minIdx = colPageCounts.indexOf(Math.min(...colPageCounts));
    cols[minIdx].push(sortedGroups[i]);
    colPageCounts[minIdx] += groups[sortedGroups[i]].length;
  }
  return { colsArr: cols, groupOuterWidth, gap };
}

function render() {
  chrome.storage.local.get({ bookmarks: [] }, function(data) {
    let bookmarks = data.bookmarks;
    // 按 group 分组
    const groups = {};
    bookmarks.forEach(b => {
      if (!groups[b.group]) groups[b.group] = [];
      groups[b.group].push(b);
    });

    // Masonry分配：使每列网页总数尽量接近
    const container = document.getElementById('masonry');
    container.innerHTML = '';
    // 动态计算列数和宽度
    let minGroupWidth = 260;
    const containerWidth = container.offsetWidth;
    let maxCols = Math.max(1, Math.floor(containerWidth / minGroupWidth));
    let cols = Array.from({ length: maxCols }, () => []);
    let colPageCounts = Array(maxCols).fill(0);
    const sortedGroups = Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length);
    // 先将最大N个分组分别分配到每一列
    for (let i = 0; i < Math.min(maxCols, sortedGroups.length); i++) {
      cols[i].push(sortedGroups[i]);
      colPageCounts[i] += groups[sortedGroups[i]].length;
    }
    // 剩余分组再用贪心法分配
    for (let i = maxCols; i < sortedGroups.length; i++) {
      let minIdx = colPageCounts.indexOf(Math.min(...colPageCounts));
      cols[minIdx].push(sortedGroups[i]);
      colPageCounts[minIdx] += groups[sortedGroups[i]].length;
    }
    // 渲染每一列
    cols.forEach(colGroups => {
      const colDiv = document.createElement('div');
      colDiv.className = 'masonry-col';
      colGroups.forEach(group => {
        // 分组渲染逻辑
        const groupDiv = document.createElement('div');
        groupDiv.className = 'group';
        groupDiv.dataset.group = group;
        // 分组名可编辑
        const title = document.createElement('div');
        title.className = 'group-title';
        title.innerText = group;
        title.title = '点击编辑分组名';
        title.style.cursor = 'pointer';
        title.onclick = function() {
          const input = document.createElement('input');
          input.type = 'text';
          input.value = title.innerText;
          input.className = 'edit-input';
          input.onblur = input.onkeydown = function(e) {
            if (e.type === 'blur' || e.key === 'Enter') {
              const newGroup = input.value.trim() || group;
              if (newGroup !== group) {
                bookmarks.forEach(b => {
                  if (b.group === group) b.group = newGroup;
                });
                cachedGroupOrder = null;
                chrome.storage.local.set({ bookmarks }, render);
              } else {
                title.innerText = group;
              }
            }
          };
          title.innerText = '';
          title.appendChild(input);
          input.focus();
          input.select();
        };
        groupDiv.appendChild(title);

        const listDiv = document.createElement('div');
        listDiv.className = 'bookmark-list';
        groups[group].forEach((b, idx) => {
          const card = document.createElement('div');
          card.className = 'bookmark-card';
          card.draggable = true;
          card.dataset.id = b.id;
          card.dataset.group = group;
          card.dataset.idx = idx;
          card.innerHTML = `
            <a href="${b.url}" class="bookmark-link" tabindex="-1">
              <img src="${b.favicon}" onerror="this.src='icon16.png'" />
              <span class="bookmark-title" title="点击编辑网页名" style="cursor:pointer;">${b.title}</span>
            </a>
            <div class="bookmark-url" title="${b.url}">${b.url}</div>
            <button data-id="${b.id}" class="delBtn">删除</button>
          `;
          // 编辑网页名
          card.querySelector('.bookmark-title').onclick = function(e) {
            e.stopPropagation();
            e.preventDefault();
            isEditingTitle = true;
            const span = this;
            const input = document.createElement('input');
            input.type = 'text';
            input.value = b.title;
            input.className = 'edit-input';
            input.onblur = input.onkeydown = function(e2) {
              if (e2.type === 'blur' || e2.key === 'Enter') {
                isEditingTitle = false;
                const newTitle = input.value.trim() || b.title;
                if (newTitle !== b.title) {
                  b.title = newTitle;
                  chrome.storage.local.set({ bookmarks }, render);
                } else {
                  span.innerText = b.title;
                }
              }
            };
            span.innerText = '';
            span.appendChild(input);
            input.focus();
            input.select();
          };
          // 统计点击，不跳转
          card.querySelector('.bookmark-link').onclick = function(e) {
            e.preventDefault();
            b.clickCount = (b.clickCount || 0) + 1;
            chrome.storage.local.set({ bookmarks });
          };
          // 整个卡片点击跳转（除网页名span外）
          card.addEventListener('click', function(e) {
            if (isEditingTitle) return;
            // 如果点击的是网页名span、输入框、删除按钮、a标签及其子元素，不跳转
            const notJumpSelectors = ['.bookmark-title', 'input', '.delBtn', '.bookmark-link'];
            for (const sel of notJumpSelectors) {
              if (e.target.closest && e.target.closest(sel)) return;
            }
            window.location.href = b.url;
          }, true);
          // 拖拽事件
          card.ondragstart = function(e) {
            card.classList.add('dragging');
            e.dataTransfer.setData('text/plain', JSON.stringify({
              id: b.id,
              fromGroup: group,
              fromIdx: idx
            }));
          };
          card.ondragend = function() {
            card.classList.remove('dragging');
          };
          card.ondragover = function(e) {
            e.preventDefault();
            card.style.background = '#e6f0ff';
          };
          card.ondragleave = function() {
            card.style.background = '';
          };
          card.ondrop = function(e) {
            e.preventDefault();
            card.style.background = '';
            const data = JSON.parse(e.dataTransfer.getData('text/plain'));
            if (data.id === b.id) return;
            if (data.fromGroup === group) {
              const arr = groups[group];
              const from = arr.findIndex(x => x.id === data.id);
              const to = idx;
              if (from !== -1 && from !== to) {
                const [moved] = arr.splice(from, 1);
                arr.splice(to, 0, moved);
                bookmarks = [];
                Object.values(groups).forEach(g => bookmarks.push(...g));
                chrome.storage.local.set({ bookmarks }, render);
              }
            } else {
              const fromArr = groups[data.fromGroup];
              const toArr = groups[group];
              const fromIdx = fromArr.findIndex(x => x.id === data.id);
              if (fromIdx !== -1) {
                const [moved] = fromArr.splice(fromIdx, 1);
                moved.group = group;
                toArr.splice(idx, 0, moved);
                bookmarks = [];
                Object.values(groups).forEach(g => bookmarks.push(...g));
                chrome.storage.local.set({ bookmarks }, render);
              }
            }
          };
          listDiv.appendChild(card);
        });
        listDiv.ondragover = function(e) {
          e.preventDefault();
          listDiv.style.background = '#e6f0ff';
        };
        listDiv.ondragleave = function() {
          listDiv.style.background = '';
        };
        listDiv.ondrop = function(e) {
          e.preventDefault();
          listDiv.style.background = '';
          const data = JSON.parse(e.dataTransfer.getData('text/plain'));
          if (data.fromGroup !== group) {
            const fromArr = groups[data.fromGroup];
            const toArr = groups[group];
            const fromIdx = fromArr.findIndex(x => x.id === data.id);
            if (fromIdx !== -1) {
              const [moved] = fromArr.splice(fromIdx, 1);
              moved.group = group;
              toArr.push(moved);
              bookmarks = [];
              Object.values(groups).forEach(g => bookmarks.push(...g));
              chrome.storage.local.set({ bookmarks }, render);
            }
          }
        };
        groupDiv.appendChild(listDiv);
        colDiv.appendChild(groupDiv);
      });
      container.appendChild(colDiv);
    });

    document.querySelectorAll('.delBtn').forEach(btn => {
      btn.onclick = function() {
        const id = this.getAttribute('data-id');
        // 只移除该网页，保持分组顺序不变
        bookmarks = bookmarks.filter(b => b.id !== id);
        chrome.storage.local.set({ bookmarks }, render);
      };
    });
  });
}

window.addEventListener('resize', function() {
  cachedGroupOrder = null;
  render();
});

// ======= 导出/导入功能 =======
function exportBookmarks() {
  chrome.storage.local.get({ bookmarks: [] }, function(data) {
    const blob = new Blob([JSON.stringify(data.bookmarks, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'quickmark_bookmarks.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  });
}

// 美观的提示条
function showTip(msg, type = 'success') {
  let tip = document.getElementById('quickmark-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'quickmark-tip';
    document.body.appendChild(tip);
  }
  tip.innerText = msg;
  tip.className = 'quickmark-tip ' + (type === 'error' ? 'quickmark-tip-error' : 'quickmark-tip-success');
  tip.style.display = 'block';
  setTimeout(() => {
    tip.style.opacity = '1';
  }, 10);
  setTimeout(() => {
    tip.style.opacity = '0';
    setTimeout(() => { tip.style.display = 'none'; }, 400);
  }, 1800);
}

function importBookmarks() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(evt) {
      try {
        const imported = JSON.parse(evt.target.result);
        if (!Array.isArray(imported)) throw new Error('格式错误');
        chrome.storage.local.get({ bookmarks: [] }, function(data) {
          // 合并去重，按url唯一
          const urlSet = new Set();
          const merged = [...data.bookmarks, ...imported].filter(b => {
            if (!b.url || urlSet.has(b.url)) return false;
            urlSet.add(b.url);
            return true;
          });
          chrome.storage.local.set({ bookmarks: merged }, function() {
            showTip('导入并合并成功！', 'success');
            cachedGroupOrder = null;
            render();
          });
        });
      } catch (err) {
        showTip('导入失败：文件格式不正确', 'error');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function ensureExportImportBar() {
  // 保证导入/导出按钮始终在header-bar内
  let bar = document.getElementById('exportImportBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'exportImportBar';
    document.querySelector('.header-bar').appendChild(bar);
  }
  if (!bar.hasChildNodes()) {
    // 重新渲染按钮
    const btnStyle = `
      background: linear-gradient(90deg, #4f8cff 60%, #357ae8 100%);
      color: #fff;
      border: none;
      border-radius: 6px;
      padding: 8px 18px;
      font-size: 1em;
      font-weight: bold;
      letter-spacing: 1px;
      box-shadow: 0 2px 8px #0001;
      transition: background 0.2s, box-shadow 0.2s;
      cursor: pointer;
      outline: none;
      margin-left: 12px;
    `;
    const exportBtn = document.createElement('button');
    exportBtn.innerText = '导出收藏';
    exportBtn.onclick = exportBookmarks;
    exportBtn.style.cssText = btnStyle;
    exportBtn.onmouseover = function() { this.style.background = 'linear-gradient(90deg, #357ae8 60%, #4f8cff 100%)'; };
    exportBtn.onmouseout = function() { this.style.background = 'linear-gradient(90deg, #4f8cff 60%, #357ae8 100%)'; };
    const importBtn = document.createElement('button');
    importBtn.innerText = '导入收藏';
    importBtn.onclick = importBookmarks;
    importBtn.style.cssText = btnStyle;
    importBtn.onmouseover = function() { this.style.background = 'linear-gradient(90deg, #357ae8 60%, #4f8cff 100%)'; };
    importBtn.onmouseout = function() { this.style.background = 'linear-gradient(90deg, #4f8cff 60%, #357ae8 100%)'; };
    bar.appendChild(exportBtn);
    bar.appendChild(importBtn);
  }
}

window.addEventListener('DOMContentLoaded', function() {
  cachedGroupOrder = null;
  ensureExportImportBar();
  render();
  setupSearch();
});

function renderSearchResults(results) {
  // 先移除旧的搜索结果容器
  let oldList = document.querySelector('.search-results-list');
  if (oldList) oldList.remove();
  // 主内容区
  const mainContent = document.querySelector('.main-content');
  const masonry = document.getElementById('masonry');
  masonry.innerHTML = '';
  if (results.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'search-results-list';
    empty.style.textAlign = 'center';
    empty.style.color = '#888';
    empty.style.margin = '32px auto 0 auto';
    empty.innerText = '未找到相关网页';
    mainContent.insertBefore(empty, masonry);
    return;
  }
  const list = document.createElement('div');
  list.className = 'search-results-list';
  results.forEach(b => {
    const card = document.createElement('div');
    card.className = 'bookmark-card search-result-card';
    card.style.cursor = 'pointer';
    card.innerHTML = `
      <a href="${b.url}" class="bookmark-link" tabindex="-1">
        <img src="${b.favicon}" onerror="this.src='icon16.png'" />
        <span class="bookmark-title" title="点击编辑网页名" style="cursor:pointer;">${b.title}</span>
      </a>
      <div class="bookmark-url" title="${b.url}">${b.url}</div>
    `;
    // 跳转
    card.onclick = function(e) {
      if (e.target.classList.contains('bookmark-title') || e.target.tagName === 'INPUT') return;
      window.location.href = b.url;
    };
    list.appendChild(card);
  });
  mainContent.insertBefore(list, masonry);
}

function setupSearch() {
  const input = document.getElementById('searchInput');
  if (!input) return;
  input.addEventListener('input', function() {
    const keyword = input.value.trim().toLowerCase();
    // 移除搜索结果列表
    let oldList = document.querySelector('.search-results-list');
    if (!keyword) {
      if (oldList) oldList.remove();
      render();
      return;
    }
    if (oldList) oldList.remove();
    chrome.storage.local.get({ bookmarks: [] }, function(data) {
      const results = data.bookmarks.filter(b =>
        (b.title && b.title.toLowerCase().includes(keyword)) ||
        (b.url && b.url.toLowerCase().includes(keyword))
      );
      renderSearchResults(results);
    });
  });
} 