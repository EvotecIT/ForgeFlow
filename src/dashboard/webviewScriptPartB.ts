export const dashboardWebviewScriptPartB = `

;

    document.getElementById('refresh')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'refresh' });
    });

    document.querySelectorAll('.repo-link, .repo-open').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        const url = link.getAttribute('data-url');
        if (url) {
          vscode.postMessage({ type: 'openUrl', url });
        }
      });
    });
    document.querySelectorAll('.open-local').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        const path = link.getAttribute('data-path');
        if (path) {
          vscode.postMessage({ type: 'openProject', path });
        }
      });
    });
    document.querySelectorAll('.reveal-local').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        const path = link.getAttribute('data-path');
        if (path) {
          vscode.postMessage({ type: 'revealInOs', path });
        }
      });
    });
    document.querySelectorAll('.copy-local').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        const path = link.getAttribute('data-path');
        if (path) {
          vscode.postMessage({ type: 'copyPath', path });
        }
      });
    });
    document.querySelectorAll('.copy-relative').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        const rel = link.getAttribute('data-relative');
        if (rel) {
          vscode.postMessage({ type: 'copyRelativePath', path: rel });
        }
      });
    });
    document.querySelectorAll('.open-terminal').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        const path = link.getAttribute('data-path');
        if (path) {
          vscode.postMessage({ type: 'openTerminal', path });
        }
      });
    });
    document.querySelectorAll('.run-project').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        const path = link.getAttribute('data-path');
        if (path) {
          vscode.postMessage({ type: 'runProject', path });
        }
      });
    });
    document.querySelectorAll('.git-clean').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        const path = link.getAttribute('data-path');
        if (path) {
          vscode.postMessage({ type: 'gitCleanProject', path });
        }
      });
    });
    document.querySelectorAll('.open-vs').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        const path = link.getAttribute('data-path');
        if (path) {
          vscode.postMessage({ type: 'openVisualStudio', path });
        }
      });
    });
    function parsePaths(raw) {
      if (!raw) {
        return [];
      }
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.filter((item) => typeof item === 'string');
        }
      } catch {
        // ignore parse errors
      }
      return [];
    }
    document.querySelectorAll('.group-open-all').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        const raw = link.getAttribute('data-paths');
        const paths = parsePaths(raw);
        if (paths.length > 0) {
          vscode.postMessage({ type: 'openProjects', paths });
        }
      });
    });
    document.querySelectorAll('.group-copy-paths').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        const raw = link.getAttribute('data-paths');
        const paths = parsePaths(raw);
        if (paths.length > 0) {
          vscode.postMessage({ type: 'copyPaths', paths });
        }
      });
    });
    document.querySelectorAll('.group-toggle').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const row = button.closest('tr[data-kind="group"]');
        if (!row) {
          return;
        }
        if (expandAll && toggleGroupsButton) {
          expandAll = false;
          toggleGroupsButton.textContent = 'Expand groups';
        }
        const current = row.dataset.userExpanded === 'true';
        const next = current ? 'false' : 'true';
        row.dataset.userExpanded = next;
        row.dataset.expanded = next;
        applyFilter();
      });
    });

    const headers = document.querySelectorAll('th[data-key]');
    const tbody = document.querySelector('tbody');
    const filterInput = document.getElementById('filter');
    const clearButton = document.getElementById('clear');
    const focusButton = document.getElementById('focus');
    const cancelButton = document.getElementById('cancel');
    const toggleGroupsButton = document.getElementById('toggle-groups');
    const toggleChildrenButton = document.getElementById('toggle-children');
    const countLabel = document.getElementById('count');
    const emptyRow = document.getElementById('filter-empty');
    const summaryEl = document.getElementById('summary');
    const refreshStatus = document.getElementById('status-refresh');
    const progressBar = document.getElementById('progress');
    const progressFill = document.getElementById('progress-fill');
    const resizers = document.querySelectorAll('.col-resizer');
    const columns = Array.from(document.querySelectorAll('col[data-col]'));
    const columnMap = new Map(columns.map((col) => [col.dataset.col, col]));
    const contextMenu = document.getElementById('context-menu');
    const contextItems = contextMenu ? Array.from(contextMenu.querySelectorAll('.context-item')) : [];
    let sortKey = 'activityTs';
    let sortDir = 'desc';
    const filterConfig = {
      minChars: Number(initialState.filterMinChars || 0),
      matchMode: initialState.filterMatchMode === 'fuzzy' ? 'fuzzy' : 'substring'
    };
    let activeTags = new Map();
    let lastFilter = '';
    let headerHeight = 48;
    let colWidths = {};
    let contextTarget = null;
    let expandAll = initialState.expandAllGroups === true;
    let showAllChildren = initialState.showAllChildren === true;

    document.querySelectorAll('.tag-chip').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const tag = button.getAttribute('data-tag');
        if (!tag) {
          return;
        }
        const key = tag.toLowerCase();
        if (activeTags.has(key)) {
          activeTags.delete(key);
        } else {
          activeTags.set(key, tag);
        }
        updateTagChips();
        postTagFilter();
        applyFilter();
      });
    });

    function updateHeaderHeight() {
      const header = document.querySelector('header');
      if (!header) {
        return;
      }
      headerHeight = header.getBoundingClientRect().height;
      document.documentElement.style.setProperty('--ff-header-height', headerHeight + 'px');
    }

    function updateProgress(current, total, label) {
      const safeTotal = Number(total || 0);
      const safeCurrent = Number(current || 0);
      if (progressBar && progressFill) {
        if (safeTotal > 0) {
          progressBar.classList.remove('hidden');
          const percent = Math.min(100, Math.max(0, (safeCurrent / safeTotal) * 100));
          progressFill.style.width = percent.toFixed(1) + '%';
        } else {
          progressFill.style.width = '0%';
        }
      }
      if (refreshStatus) {
        refreshStatus.textContent = safeTotal > 0
          ? 'Refreshing… (' + String(safeCurrent) + '/' + String(safeTotal) + ')' + (label ? ' • ' + label : '')
          : 'Refreshing…' + (label ? ' • ' + label : '');
      }
    }

    function updateHeaders() {
      headers.forEach((th) => {
        th.classList.remove('sort-asc', 'sort-desc');
        if (th.dataset.key === sortKey) {
          th.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
        }
      });
    }

    function compareValues(a, b, type) {
      if (type === 'number') {
        return (Number(a) || 0) - (Number(b) || 0);
      }
      return String(a).localeCompare(String(b));
    }

    function sortRows() {
      if (!tbody) {
        return;
      }
      const rows = Array.from(tbody.querySelectorAll('tr[data-row="data"]'));
      const parents = rows.filter((row) => row.dataset.kind !== 'child');
      const children = rows.filter((row) => row.dataset.kind === 'child');
      const childMap = new Map();
      children.forEach((row) => {
        const groupId = row.dataset.groupId || '';
        if (!groupId) {
          return;
        }
        const list = childMap.get(groupId) || [];
        list.push(row);
        childMap.set(groupId, list);
      });
      parents.sort((rowA, rowB) => {
        const a = rowA.dataset[sortKey] || '';
        const b = rowB.dataset[sortKey] || '';
        const type = document.querySelector('th[data-key="' + sortKey + '"]')?.dataset.type || 'string';
        const result = compareValues(a, b, type);
        return sortDir === 'asc' ? result : -result;
      });
      parents.forEach((row) => {
        tbody.appendChild(row);
        const groupId = row.dataset.groupId || '';
        const groupChildren = groupId ? childMap.get(groupId) : undefined;
        if (groupChildren) {
          groupChildren.forEach((child) => tbody.appendChild(child));
        }
      });
      if (emptyRow) {
        tbody.appendChild(emptyRow);
      }
    }

    function updateCount(visible, total) {
      if (countLabel) {
        countLabel.textContent = total > 0 ? String(visible) + '/' + String(total) : '';
      }
    }

    function updateGroupToggle() {
      if (!toggleGroupsButton) {
        return;
      }
      toggleGroupsButton.textContent = expandAll ? 'Collapse groups' : 'Expand groups';
    }

    function updateChildrenToggle() {
      if (!toggleChildrenButton) {
        return;
      }
      toggleChildrenButton.textContent = showAllChildren ? 'Hide non-matching children' : 'Show all children';
    }

    function updateSummary(rows, visible) {
      if (!summaryEl) {
        return;
      }
      let favorites = 0;
      let isPublic = 0;
      let isPrivate = 0;
      let unknownVisibility = 0;
      let archived = 0;
      let alerts = 0;
      let issueSum = 0;
      let prSum = 0;
      let starSum = 0;
      const hosts = { github: 0, gitlab: 0, azure: 0, unknown: 0 };
      rows.forEach((row) => {
        if (row.hidden) {
          return;
        }
        if (row.dataset.favorite === 'true') {
          favorites += 1;
        }
        if (row.dataset.archived === 'true') {
          archived += 1;
        }
        if (row.dataset.highlight === 'true') {
          alerts += 1;
        }
        const issues = Number(row.dataset.issues ?? -1);
        if (Number.isFinite(issues) && issues >= 0) {
          issueSum += issues;
        }
        const prs = Number(row.dataset.prs ?? -1);
        if (Number.isFinite(prs) && prs >= 0) {
          prSum += prs;
        }
        const stars = Number(row.dataset.stars ?? -1);
        if (Number.isFinite(stars) && stars >= 0) {
          starSum += stars;
        }
        const visibility = (row.dataset.visibility || '').toLowerCase();
        if (visibility === 'public') {
          isPublic += 1;
        } else if (visibility === 'private') {
          isPrivate += 1;
        } else {
          unknownVisibility += 1;
        }
        const provider = (row.dataset.provider || '').toLowerCase();
        if (provider.includes('github')) {
          hosts.github += 1;
        } else if (provider.includes('gitlab')) {
          hosts.gitlab += 1;
        } else if (provider.includes('azure')) {
          hosts.azure += 1;
        } else {
          hosts.unknown += 1;
        }
      });
      const pills = [
        pill(iconList(), 'Visible', String(visible) + '/' + String(rows.length), 'emphasis'),
        pill(iconStar(), 'Favorites', String(favorites)),
        pill(iconAlert(), 'Alerts', String(alerts)),
        pill(iconIssue(), 'Issues', String(issueSum)),
        pill(iconPr(), 'PR', String(prSum)),
        pill(iconSparkles(), 'Stars', String(starSum)),
        pill(iconUnlock(), 'Public', String(isPublic)),
        pill(iconLock(), 'Private', String(isPrivate)),
        pill(iconArchive(), 'Archived', String(archived)),
        pill(iconGitHub(), 'GH', String(hosts.github)),
        pill(iconGitLab(), 'GL', String(hosts.gitlab)),
        pill(iconAzure(), 'AZ', String(hosts.azure))
      ];
      if (unknownVisibility > 0 || hosts.unknown > 0) {
        pills.push(pill(iconQuestion(), 'Unknown', String(unknownVisibility + hosts.unknown)));
      }
      summaryEl.innerHTML = pills.join('');
    }

    function applyColumnWidths(widths) {
      Object.keys(widths || {}).forEach((key) => {
        const col = columnMap.get(key);
        const value = Number(widths[key]);
        if (col && Number.isFinite(value) && value > 40) {
          col.style.width = value + 'px';
        }
      });
    }

    function persistState() {
      const current = vscode.getState() || {};
      vscode.setState({
        ...current,
        filter: lastFilter,
        sortKey,
        sortDir,
        colWidths,
        activeTags: Array.from(activeTags.values()),
        expandAllGroups: expandAll,
        showAllChildren
      });
      vscode.postMessage({ type: 'setViewState', sortKey, sortDir, colWidths, expandAllGroups: expandAll, showAllChildren });
    }

    function normalizeFilter(value) {
      const trimmed = String(value || '').trim();
      if (!trimmed || trimmed.length < filterConfig.minChars) {
        return '';
      }
      return trimmed;
    }

    function matchesToken(haystack, needle) {
      if (!needle) {
        return true;
      }
      if (filterConfig.matchMode === 'fuzzy') {
        let needleIndex = 0;
        for (let i = 0; i < haystack.length; i += 1) {
          if (haystack[i] === needle[needleIndex]) {
            needleIndex += 1;
            if (needleIndex >= needle.length) {
              return true;
            }
          }
        }
        return false;
      }
      return haystack.includes(needle);
    }

    function tokenizeFilter(value) {
      const raw = String(value || '').trim();
      if (!raw) {
        return [];
      }
      const tokens = [];
      const regex = /"([^"]+)"|'([^']+)'|\\S+/g;
      let match = null;
      while ((match = regex.exec(raw)) !== null) {
        const token = match[1] || match[2] || match[0];
        if (token) {
          tokens.push(token);
        }
      }
      return tokens;
    }

    function parseFilterQuery(value) {
      const tokens = tokenizeFilter(value);
      const includes = [];
      const excludes = [];
      tokens.forEach((token) => {
        if (!token) {
          return;
        }
        const first = token[0];
        if (first === '-' || first === '!') {
          const cleaned = token.slice(1).trim().toLowerCase();
          if (cleaned) {
            excludes.push(cleaned);
          }
          return;
        }
        if (first === '+') {
          const cleaned = token.slice(1).trim().toLowerCase();
          if (cleaned) {
            includes.push(cleaned);
          }
          return;
        }
        includes.push(token.toLowerCase());
      });
      return { includes, excludes };
    }

    function matchesFilterQuery(haystack, query) {
`;
