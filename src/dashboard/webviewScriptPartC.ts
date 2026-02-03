export const dashboardWebviewScriptPartC = `
      const parsed = parseFilterQuery(query);
      if (parsed.includes.length === 0 && parsed.excludes.length === 0) {
        return true;
      }
      for (let i = 0; i < parsed.includes.length; i += 1) {
        if (!matchesToken(haystack, parsed.includes[i])) {
          return false;
        }
      }
      for (let i = 0; i < parsed.excludes.length; i += 1) {
        if (matchesToken(haystack, parsed.excludes[i])) {
          return false;
        }
      }
      return true;
    }

    function setActiveTags(tags) {
      activeTags = new Map();
      (tags || []).forEach((tag) => {
        const value = String(tag || '').trim();
        if (!value) {
          return;
        }
        const key = value.toLowerCase();
        if (!activeTags.has(key)) {
          activeTags.set(key, value);
        }
      });
      updateTagChips();
    }

    function updateTagChips() {
      document.querySelectorAll('.tag-chip').forEach((button) => {
        const tag = button.getAttribute('data-tag') || '';
        const key = tag.toLowerCase();
        button.classList.toggle('active', activeTags.has(key));
      });
    }

    function postTagFilter() {
      vscode.postMessage({ type: 'setTagFilter', tags: Array.from(activeTags.values()) });
    }

    function rowMatchesFilter(row, filter, activeTagKeys) {
      const haystack = (row.dataset.search || '').toLowerCase();
      const tagsList = String(row.dataset.tagsList || '').toLowerCase().split('|').filter(Boolean);
      const tagSet = new Set(tagsList);
      const tagsMatch = activeTagKeys.length === 0
        ? true
        : activeTagKeys.every((tag) => tagSet.has(tag));
      return matchesFilterQuery(haystack, filter) && tagsMatch;
    }

    function applyFilter() {
      const raw = (filterInput && 'value' in filterInput) ? String(filterInput.value || '') : '';
      const trimmed = raw.trim();
      const filter = normalizeFilter(raw);
      const filterActive = filter.length > 0;
      const activeTagKeys = Array.from(activeTags.keys());
      const rows = Array.from(document.querySelectorAll('tr[data-row="data"]'));
      const parents = rows.filter((row) => row.dataset.kind !== 'child');
      const children = rows.filter((row) => row.dataset.kind === 'child');
      const childMap = new Map();
      children.forEach((row) => {
        row.hidden = true;
        const groupId = row.dataset.groupId || '';
        if (!groupId) {
          return;
        }
        const list = childMap.get(groupId) || [];
        list.push(row);
        childMap.set(groupId, list);
      });
      let visible = 0;
      parents.forEach((row) => {
        const kind = row.dataset.kind || 'single';
        const groupId = row.dataset.groupId || '';
        if (kind === 'group' && groupId) {
          const groupChildren = childMap.get(groupId) || [];
          let childMatchCount = 0;
          groupChildren.forEach((child) => {
            const childMatch = rowMatchesFilter(child, filter, activeTagKeys);
            child.dataset.match = childMatch ? 'true' : 'false';
            if (childMatch) {
              childMatchCount += 1;
            }
          });
          const groupMatch = rowMatchesFilter(row, filter, activeTagKeys);
          const isMatch = groupMatch || childMatchCount > 0;
          row.hidden = !isMatch;
          if (!row.hidden) {
            visible += 1;
          }
          const userExpanded = row.dataset.userExpanded === 'true';
          const autoExpand = filterActive && !groupMatch && childMatchCount > 0;
          const expanded = expandAll || autoExpand || userExpanded;
          row.dataset.expanded = expanded ? 'true' : 'false';
          groupChildren.forEach((child) => {
            const childMatch = child.dataset.match === 'true';
            const showChild = expanded && isMatch && (showAllChildren || childMatch);
            child.hidden = !showChild;
          });
        } else {
          const isMatch = rowMatchesFilter(row, filter, activeTagKeys);
          row.hidden = !isMatch;
          if (isMatch) {
            visible += 1;
          }
        }
      });
      if (emptyRow) {
        emptyRow.hidden = visible !== 0 || parents.length === 0;
      }
      if (filterInput && filterConfig.minChars > 0) {
        filterInput.classList.toggle('minchars', trimmed.length > 0 && trimmed.length < filterConfig.minChars);
      }
      updateCount(visible, parents.length);
      updateSummary(parents, visible);
      if (trimmed !== lastFilter) {
        lastFilter = trimmed;
        vscode.postMessage({ type: 'setFilter', filter: trimmed });
      }
      persistState();
    }

    function pill(icon, label, value, className) {
      const classes = ['pill'];
      if (className) {
        classes.push(className);
      }
      return '<span class="' + classes.join(' ') + '"><span class="icon">' + icon + '</span>' + label + ' ' + value + '</span>';
    }

    function iconList() {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v2H4zM4 11h16v2H4zM4 16h16v2H4z"></path></svg>';
    }

    function iconStar() {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"></path></svg>';
    }

    function iconAlert() {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l9 16H3l9-16zm-1 6v5h2V9h-2zm0 7v2h2v-2h-2z"></path></svg>';
    }

    function iconIssue() {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 .001 20A10 10 0 0 0 12 2zm1 5v6h-2V7h2zm0 8v2h-2v-2h2z"></path></svg>';
    }

    function iconPr() {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3a3 3 0 1 1 0 6v12h2v-8h4a4 4 0 0 0 4-4V5h-2v4a2 2 0 0 1-2 2H8V9a3 3 0 0 1-2-6zm12 8a3 3 0 1 1 0 6v4h-2v-4a3 3 0 0 1 2-6z"></path></svg>';
    }

    function iconSparkles() {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l1.8 4.4L18 8l-4.2 1.6L12 14l-1.8-4.4L6 8l4.2-1.6L12 2zm7 10l.8 2 2 0.8-2 0.8-.8 2-.8-2-2-.8 2-.8.8-2zM4 13l1 2.4L7.4 16 5 16.6 4 19l-1-2.4L1 16l2.4-.6L4 13z"></path></svg>';
    }

    function iconUnlock() {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 8V6a5 5 0 0 0-9.7-2H5.3a7 7 0 0 1 13.4 2v2h1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2h10zm-5 5a2 2 0 0 0-1 3.7V19h2v-2.3A2 2 0 0 0 12 13z"></path></svg>';
    }

    function iconLock() {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V7a5 5 0 0 1 10 0v3h1a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h1zm2 0h6V7a3 3 0 0 0-6 0v3zm3 4a2 2 0 0 0-1 3.7V19h2v-1.3A2 2 0 0 0 12 14z"></path></svg>';
    }

    function iconArchive() {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h18l1 4H2l1-4zm2 6h14v11H5V9zm4 2h6v2H9v-2z"></path></svg>';
    }

    function iconGitHub() {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .8a11.2 11.2 0 0 0-3.5 21.8c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.6-1.4-1.5-1.8-1.5-1.8-1.2-.9.1-.9.1-.9 1.3.1 2 .8 2 .8 1.2 2.1 3.1 1.5 3.8 1.1.1-.9.5-1.5.8-1.8-2.7-.3-5.5-1.4-5.5-6.1 0-1.3.5-2.3 1.2-3.2-.1-.3-.5-1.6.1-3.3 0 0 1-.3 3.3 1.2a11.4 11.4 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.7.2 3 .1 3.3.8.9 1.2 2 1.2 3.2 0 4.7-2.8 5.8-5.5 6.1.5.4.9 1.2.9 2.4v3.5c0 .3.2.7.8.6A11.2 11.2 0 0 0 12 .8z"></path></svg>';
    }

    function iconGitLab() {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22l4.4-13.6H7.6L12 22zm0 0L1.8 8.4h5.8L12 22zm0 0L22.2 8.4h-5.8L12 22zM7.6 8.4L9.6 2h4.8l2 6.4H7.6z"></path></svg>';
    }

    function iconAzure() {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19l4-12 6-3 4 15-7-5-7 5zm9-8.5L8.8 6.2 6.2 15.4 14 10.5z"></path></svg>';
    }

    function iconQuestion() {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 .001 20A10 10 0 0 0 12 2zm1 15h-2v-2h2v2zm1.7-6.5c-.4.6-1.1 1-1.5 1.3-.7.5-.9.7-.9 1.2v.5h-2v-.7c0-1.3.7-2 1.5-2.6.6-.4 1.1-.8 1.3-1.2.3-.6 0-1.4-.8-1.7-.9-.4-2 .1-2.3 1l-1.9-.6c.6-1.8 2.7-2.8 4.8-2.1 1.8.6 2.8 2.5 1.8 4.9z"></path></svg>';
    }

    function startResize(event) {
      const resizer = event.target;
      if (!resizer || !('dataset' in resizer)) {
        return;
      }
      const key = resizer.dataset.col;
      if (!key) {
        return;
      }
      const col = columnMap.get(key);
      if (!col) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const startWidth = col.getBoundingClientRect().width;
      const header = document.querySelector('th[data-col="' + key + '"]');
      if (header) {
        header.classList.add('resizing');
      }
      document.body.style.cursor = 'col-resize';

      const onMove = (moveEvent) => {
        const delta = moveEvent.clientX - startX;
        const nextWidth = Math.max(60, startWidth + delta);
        col.style.width = nextWidth + 'px';
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        if (header) {
          header.classList.remove('resizing');
        }
        const width = col.getBoundingClientRect().width;
        colWidths = { ...colWidths, [key]: width };
        persistState();
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    }

    function hideContextMenu() {
      if (contextMenu) {
        contextMenu.classList.add('hidden');
      }
      contextTarget = null;
    }

    function setMenuItemState(action, enabled) {
      if (!contextMenu) {
        return;
      }
      const item = contextMenu.querySelector('.context-item[data-action="' + action + '"]');
      if (!item) {
        return;
      }
      if (enabled) {
        item.classList.remove('disabled');
      } else {
        item.classList.add('disabled');
      }
    }

    function showContextMenu(row, x, y) {
      if (!contextMenu) {
        return;
      }
      const repoUrl = row.dataset.repoUrl || '';
      const projectPath = row.dataset.projectPath || '';
      const localPath = row.dataset.localPath || row.dataset.local || '';
      contextTarget = {
        repoUrl,
        projectPath,
        localPath,
        relativePath: localPath || projectPath
      };
      setMenuItemState('openRepo', !!repoUrl);
      setMenuItemState('openProject', !!projectPath);
      setMenuItemState('revealInOs', !!projectPath);
      setMenuItemState('copyPath', !!projectPath);
      setMenuItemState('copyRelative', !!(localPath || projectPath));
      contextMenu.style.left = x + 'px';
      contextMenu.style.top = y + 'px';
      contextMenu.classList.remove('hidden');
    }

    headers.forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.dataset.key;
        if (!key) {
          return;
        }
        if (sortKey === key) {
          sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          sortKey = key;
          sortDir = 'desc';
        }
        updateHeaders();
        sortRows();
        applyFilter();
      });
    });

    resizers.forEach((resizer) => {
      resizer.addEventListener('mousedown', startResize);
    });

    if (contextMenu && contextItems.length > 0) {
      contextItems.forEach((item) => {
        item.addEventListener('click', () => {
          const action = item.getAttribute('data-action');
          if (!action || item.classList.contains('disabled') || !contextTarget) {
            return;
          }
          if (action === 'openRepo' && contextTarget.repoUrl) {
            vscode.postMessage({ type: 'openUrl', url: contextTarget.repoUrl });
          }
          if (action === 'openProject' && contextTarget.projectPath) {
            vscode.postMessage({ type: 'openProject', path: contextTarget.projectPath });
          }
          if (action === 'revealInOs' && contextTarget.projectPath) {
            vscode.postMessage({ type: 'revealInOs', path: contextTarget.projectPath });
          }
          if (action === 'copyPath' && contextTarget.projectPath) {
            vscode.postMessage({ type: 'copyPath', path: contextTarget.projectPath });
          }
          if (action === 'copyRelative' && contextTarget.relativePath) {
            vscode.postMessage({ type: 'copyRelativePath', path: contextTarget.relativePath });
          }
          hideContextMenu();
        });
      });
      document.addEventListener('contextmenu', (event) => {
        const target = event.target;
        const row = target && typeof target.closest === 'function' ? target.closest('tr[data-row="data"]') : null;
        if (!row) {
          return;
        }
        event.preventDefault();
        showContextMenu(row, event.clientX, event.clientY);
      });
      document.addEventListener('click', () => hideContextMenu());
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          hideContextMenu();
        }
      });
      window.addEventListener('scroll', () => hideContextMenu(), true);
    }

    const saved = vscode.getState() || {};
    const seeded = (initialState && typeof initialState === 'object') ? initialState : {};
    const seededSortKey = typeof seeded.sortKey === 'string' ? seeded.sortKey : undefined;
    const seededSortDir = seeded.sortDir === 'asc' || seeded.sortDir === 'desc' ? seeded.sortDir : undefined;
    const seededWidths = seeded.colWidths || {};
    const seededExpandAll = seeded.expandAllGroups === true;
    const seededShowAll = seeded.showAllChildren === true;
    const savedTags = Array.isArray(saved.activeTags) ? saved.activeTags : [];
    const seededTags = Array.isArray(seeded.activeTags) ? seeded.activeTags : [];
    if (typeof saved.expandAllGroups === 'boolean') {
      expandAll = saved.expandAllGroups;
    } else if (seededExpandAll) {
      expandAll = true;
    }
    if (typeof saved.showAllChildren === 'boolean') {
      showAllChildren = saved.showAllChildren;
    } else if (seededShowAll) {
      showAllChildren = true;
    }
    if (saved.sortKey || seededSortKey) {
      sortKey = String(saved.sortKey || seededSortKey);
    }
    if (saved.sortDir === 'asc' || saved.sortDir === 'desc') {
      sortDir = saved.sortDir;
    } else if (seededSortDir) {
      sortDir = seededSortDir;
    }
    colWidths = saved.colWidths || seededWidths || {};
    setActiveTags(savedTags.length > 0 ? savedTags : seededTags);
    applyColumnWidths(colWidths);
    updateHeaders();
    sortRows();
    if (filterInput && 'value' in filterInput) {
      const initialFilter = String(filterInput.value || '') || String(saved.filter || '');
      filterInput.value = initialFilter;
    }
    if (clearButton) {
      clearButton.addEventListener('click', () => {
        if (filterInput && 'value' in filterInput) {
          filterInput.value = '';
        }
        applyFilter();
      });
    }
    if (focusButton) {
      focusButton.addEventListener('click', () => {
        if (filterInput && 'focus' in filterInput) {
          filterInput.focus();
          if ('select' in filterInput) {
            filterInput.select();
          }
        }
      });
    }
    if (toggleGroupsButton) {
      toggleGroupsButton.addEventListener('click', () => {
        expandAll = !expandAll;
        updateGroupToggle();
        applyFilter();
      });
    }
    if (toggleChildrenButton) {
      toggleChildrenButton.addEventListener('click', () => {
        showAllChildren = !showAllChildren;
        updateChildrenToggle();
        applyFilter();
      });
    }
    if (cancelButton) {
      cancelButton.addEventListener('click', () => {
        vscode.postMessage({ type: 'cancelRefresh' });
      });
    }
    if (filterInput) {
      filterInput.addEventListener('input', () => {
        applyFilter();
      });
    }
    updateHeaderHeight();
    updateGroupToggle();
    updateChildrenToggle();
    window.addEventListener('resize', () => {
      updateHeaderHeight();
    });
    window.addEventListener('message', (event) => {
      const message = event.data || {};
      if (message.type === 'focusFilter' && filterInput && 'focus' in filterInput) {
        filterInput.focus();
        if ('select' in filterInput) {
          filterInput.select();
        }
      }
      if (message.type === 'applyFilter' && filterInput && 'value' in filterInput) {
        filterInput.value = String(message.filter || '');
        applyFilter();
      }
      if (message.type === 'applyTagFilter') {
        const tags = Array.isArray(message.tags) ? message.tags : [];
        setActiveTags(tags);
        applyFilter();
      }
      if (message.type === 'progress') {
        const current = Number(message.current || 0);
        const total = Number(message.total || 0);
        const label = message.label ? String(message.label) : '';
        updateProgress(current, total, label);
      }
    });
    applyFilter();
  
  

`;
