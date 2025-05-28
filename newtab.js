let cachedGroupOrder = null;
let isEditingTitle = false;

function getColumnCount() {
  if (window.innerWidth < 700) return 1;
  if (window.innerWidth < 1100) return 2;
  if (window.innerWidth < 1500) return 3;
  return 4;
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

function render() {
  chrome.storage.local.get({ bookmarks: [] }, function(data) {
    let bookmarks = data.bookmarks;
    // 按 group 分组
    const groups = {};
    bookmarks.forEach(b => {
      if (!groups[b.group]) groups[b.group] = [];
      groups[b.group].push(b);
    });

    // Masonry分配
    const colCount = getColumnCount();
    const cols = Array.from({ length: colCount }, () => []);
    const colHeights = Array(colCount).fill(0);
    const sortedGroups = getSortedGroups(groups, bookmarks);
    sortedGroups.forEach(group => {
      // 估算分组高度（网页数+1）
      const h = (groups[group].length + 1) * 60;
      const minIdx = colHeights.indexOf(Math.min(...colHeights));
      cols[minIdx].push(group);
      colHeights[minIdx] += h;
    });

    // 渲染
    const container = document.getElementById('masonry');
    container.innerHTML = '';
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

function addExportImportButtons() {
  const container = document.querySelector('.newtab-container') || document.body;
  let bar = document.getElementById('exportImportBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'exportImportBar';
    bar.style.marginBottom = '16px';
    bar.style.display = 'flex';
    bar.style.gap = '12px';
    bar.style.justifyContent = 'flex-end';
    bar.style.alignItems = 'center';
    // 美化按钮
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
    importBtn.style.cssText = btnStyle + 'margin-left:0;';
    importBtn.onmouseover = function() { this.style.background = 'linear-gradient(90deg, #357ae8 60%, #4f8cff 100%)'; };
    importBtn.onmouseout = function() { this.style.background = 'linear-gradient(90deg, #4f8cff 60%, #357ae8 100%)'; };
    bar.appendChild(exportBtn);
    bar.appendChild(importBtn);
    container.insertBefore(bar, container.firstChild);
  }
}

window.addEventListener('DOMContentLoaded', function() {
  cachedGroupOrder = null;
  addExportImportButtons();
  render();
}); 