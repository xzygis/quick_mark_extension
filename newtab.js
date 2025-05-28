let cachedGroupOrder = null;

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
            <a href="${b.url}" class="bookmark-link" target="_blank">
              <img src="${b.favicon}" onerror="this.src='icon16.png'" />
              <span class="bookmark-title" title="点击编辑网页名" style="cursor:pointer;">${b.title}</span>
            </a>
            <div class="bookmark-url" title="${b.url}">${b.url}</div>
            <button data-id="${b.id}" class="delBtn">删除</button>
          `;
          // 编辑网页名
          card.querySelector('.bookmark-title').onclick = function(e) {
            e.preventDefault();
            const span = this;
            const input = document.createElement('input');
            input.type = 'text';
            input.value = b.title;
            input.className = 'edit-input';
            input.onblur = input.onkeydown = function(e) {
              if (e.type === 'blur' || e.key === 'Enter') {
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
          // 统计点击
          card.querySelector('.bookmark-link').onclick = function(e) {
            b.clickCount = (b.clickCount || 0) + 1;
            chrome.storage.local.set({ bookmarks });
          };
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

window.addEventListener('DOMContentLoaded', function() {
  cachedGroupOrder = null;
  render();
}); 