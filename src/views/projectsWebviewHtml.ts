import type * as vscode from 'vscode';
import type { ProjectsWebviewProject, ProjectsWebviewSnapshot } from './projectsView';
import { projectsWebviewStyles } from './projectsWebviewStyles';

export interface ProjectsWebviewUpdatePayload {
  favoritesHtml: string;
  projectsHtml: string;
  tagsHtml: string;
  tagBarVisible: boolean;
  state: Pick<
  ProjectsWebviewSnapshot,
  | 'filterText'
  | 'tagFilter'
  | 'favoritesOnly'
  | 'filterMinChars'
  | 'filterMatchMode'
  | 'sortDescription'
  | 'pageSize'
  | 'visibleCount'
  | 'dataUpdatedAt'
  >;
}

export function buildProjectsWebviewUpdate(snapshot: ProjectsWebviewSnapshot): ProjectsWebviewUpdatePayload {
  const favorites = snapshot.projects.filter((project) => project.favorite);
  const others = snapshot.projects.filter((project) => !project.favorite);
  const favoritesHtml = favorites.length > 0
    ? favorites.map((project) => renderProjectRow(project)).join('')
    : '<div class="empty" data-empty="favorites">No favorite projects.</div>';
  const projectsHtml = others.length > 0
    ? others.map((project) => renderProjectRow(project)).join('')
    : '<div class="empty" data-empty="projects">No projects found.</div>';
  const tagsHtml = snapshot.tagCounts.length > 0
    ? snapshot.tagCounts.map((tag) => renderTagChip(tag.label, tag.count, tag.active)).join('')
    : '<span class="muted">No tags available.</span>';
  return {
    favoritesHtml,
    projectsHtml,
    tagsHtml,
    tagBarVisible: snapshot.tagCounts.length > 0,
    state: {
      filterText: snapshot.filterText,
      tagFilter: snapshot.tagFilter,
      favoritesOnly: snapshot.favoritesOnly,
      filterMinChars: snapshot.filterMinChars,
      filterMatchMode: snapshot.filterMatchMode,
      sortDescription: snapshot.sortDescription,
      pageSize: snapshot.pageSize,
      visibleCount: snapshot.visibleCount,
      dataUpdatedAt: snapshot.dataUpdatedAt
    }
  };
}

export function renderProjectsWebviewHtml(snapshot: ProjectsWebviewSnapshot, webview: vscode.Webview): string {
  const nonce = randomNonce();
  const update = buildProjectsWebviewUpdate(snapshot);

  const stateJson = safeJson(snapshot);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ForgeFlow Projects</title>
  <style>
${projectsWebviewStyles}
  </style>
</head>
<body>
  <div class="page">
    <header>
      <div class="title">
        <h2>ForgeFlow Projects (Web)</h2>
        <div class="status" id="statusLine">${escapeHtml(snapshot.sortDescription)}</div>
      </div>
      <div class="controls">
        <input class="filter" id="filterInput" placeholder="Filter projects…" value="${escapeHtml(snapshot.filterText)}" />
        <button id="clearFilter">Clear</button>
        <button id="toggleFavorites">${snapshot.favoritesOnly ? 'Favorites only' : 'All projects'}</button>
        <button id="refreshProjects">Refresh</button>
      </div>
    </header>

    <div class="tag-bar" id="tagBar" ${update.tagBarVisible ? '' : 'style="display:none;"'}>${update.tagsHtml}</div>

    <section class="group" data-group="favorites">
      <div class="group-header">
        <span class="group-title">Favorite Projects</span>
        <span class="group-count" data-count>0</span>
      </div>
      <div class="group-body">
        ${update.favoritesHtml}
      </div>
    </section>

    <section class="group" data-group="projects">
      <div class="group-header">
        <span class="group-title">Projects</span>
        <span class="group-count" data-count>0</span>
      </div>
      <div class="group-body">
        ${update.projectsHtml}
      </div>
      <div class="load-more">
        <button id="loadMore" style="display:none;">Load more</button>
      </div>
    </section>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const state = ${stateJson};
    const filterInput = document.getElementById('filterInput');
    const clearFilter = document.getElementById('clearFilter');
    const tagBar = document.getElementById('tagBar');
    const statusLine = document.getElementById('statusLine');
    const loadMore = document.getElementById('loadMore');
    const toggleFavorites = document.getElementById('toggleFavorites');
    const refreshProjects = document.getElementById('refreshProjects');

    let activeTags = new Set((state.tagFilter || []).map((tag) => String(tag).toLowerCase()));
    updateStatusLine();

    function formatAge(updatedAt) {
      if (!updatedAt) return '';
      const delta = Date.now() - Number(updatedAt);
      if (!Number.isFinite(delta) || delta < 0) return '';
      if (delta < 60_000) return 'just now';
      if (delta < 60 * 60_000) return Math.floor(delta / 60_000) + 'm ago';
      if (delta < 24 * 60 * 60_000) return Math.floor(delta / (60 * 60_000)) + 'h ago';
      return Math.floor(delta / (24 * 60 * 60_000)) + 'd ago';
    }

    function updateStatusLine() {
      if (!statusLine) return;
      const age = formatAge(state.dataUpdatedAt);
      statusLine.textContent = age ? state.sortDescription + ' • updated ' + age : state.sortDescription;
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[char]));
    }

    function tokenizeFilter(value) {
      const raw = String(value || '').trim();
      if (!raw) return [];
      const regex = /"([^"]+)"|'([^']+)'|\\S+/g;
      const tokens = [];
      let match;
      while ((match = regex.exec(raw)) !== null) {
        const token = match[1] || match[2] || match[0];
        if (token) tokens.push(token);
      }
      return tokens;
    }

    function parseFilterQuery(value) {
      const tokens = tokenizeFilter(value);
      const includes = [];
      const excludes = [];
      tokens.forEach((token) => {
        const first = token[0];
        if (first === '-' || first === '!') {
          const cleaned = token.slice(1).trim();
          if (cleaned) excludes.push(cleaned);
          return;
        }
        if (first === '+') {
          const cleaned = token.slice(1).trim();
          if (cleaned) includes.push(cleaned);
          return;
        }
        includes.push(token);
      });
      return { includes, excludes };
    }

    function isSubsequence(haystack, needle) {
      if (!needle) return true;
      let i = 0;
      let j = 0;
      while (i < haystack.length && j < needle.length) {
        if (haystack[i] === needle[j]) {
          j += 1;
        }
        i += 1;
      }
      return j === needle.length;
    }

    function matchesFilter(haystack, needle) {
      if (!needle) return true;
      const target = haystack.toLowerCase();
      const query = needle.toLowerCase();
      if (state.filterMatchMode === 'fuzzy') {
        return isSubsequence(target, query);
      }
      return target.includes(query);
    }

    function matchesFilterQuery(haystack, query) {
      const parsed = parseFilterQuery(query);
      if (parsed.includes.length === 0 && parsed.excludes.length === 0) return true;
      for (const token of parsed.includes) {
        if (!matchesFilter(haystack, token)) return false;
      }
      for (const token of parsed.excludes) {
        if (matchesFilter(haystack, token)) return false;
      }
      return true;
    }

    function normalizeFilter(value) {
      const trimmed = String(value || '').trim();
      if (!trimmed) return '';
      if (state.filterMinChars > 0 && trimmed.length < state.filterMinChars) {
        return '';
      }
      return trimmed;
    }

    function rowMatches(row, filterValue) {
      const search = row.dataset.search || '';
      const tags = (row.dataset.tags || '').split('|').filter(Boolean);
      const tagsOk = Array.from(activeTags.values()).every((tag) => tags.includes(tag));
      const filterOk = !filterValue || matchesFilterQuery(search, filterValue);
      return tagsOk && filterOk;
    }

    function applyFilter() {
      const raw = filterInput.value || '';
      const trimmed = String(raw).trim();
      const filterValue = normalizeFilter(trimmed);
      filterInput.classList.toggle('minchars', state.filterMinChars > 0 && trimmed.length > 0 && trimmed.length < state.filterMinChars);

      const favoritesRows = Array.from(document.querySelectorAll('.group[data-group="favorites"] .project-row'));
      const projectRows = Array.from(document.querySelectorAll('.group[data-group="projects"] .project-row'));

      let favoritesVisible = 0;
      favoritesRows.forEach((row) => {
        const match = rowMatches(row, filterValue);
        row.classList.toggle('hidden', !match);
        if (match) favoritesVisible += 1;
      });

      let projectsVisible = 0;
      let projectsTotal = 0;
      const pageSize = Number(state.pageSize || 0);
      const limit = pageSize > 0 ? Number(state.visibleCount || 0) : Number.MAX_SAFE_INTEGER;
      projectRows.forEach((row) => {
        const match = rowMatches(row, filterValue);
        if (!match) {
          row.classList.add('hidden');
          return;
        }
        projectsTotal += 1;
        if (!state.favoritesOnly && projectsVisible < limit) {
          row.classList.remove('hidden');
          projectsVisible += 1;
        } else {
          row.classList.add('hidden');
        }
      });

      document.querySelectorAll('.group[data-group="favorites"] .group-count').forEach((el) => {
        el.textContent = String(favoritesVisible);
      });
      document.querySelectorAll('.group[data-group="projects"] .group-count').forEach((el) => {
        el.textContent = state.favoritesOnly ? '0' : String(projectsVisible);
      });

      const emptyFavorites = document.querySelector('.group[data-group="favorites"] .empty[data-empty="favorites"]');
      if (emptyFavorites) {
        emptyFavorites.style.display = favoritesVisible === 0 ? 'block' : 'none';
      }
      const emptyProjects = document.querySelector('.group[data-group="projects"] .empty[data-empty="projects"]');
      if (emptyProjects) {
        emptyProjects.style.display = (!state.favoritesOnly && projectsVisible === 0) ? 'block' : 'none';
      }

      const shouldShowLoadMore = !state.favoritesOnly && pageSize > 0 && projectsTotal > limit;
      if (loadMore) {
        loadMore.style.display = shouldShowLoadMore ? 'inline-flex' : 'none';
        loadMore.textContent = shouldShowLoadMore ? \`Load more (\${projectsVisible}/\${projectsTotal})\` : 'Load more';
      }
      if (state.favoritesOnly) {
        document.querySelector('.group[data-group="projects"]').style.display = 'none';
      } else {
        document.querySelector('.group[data-group="projects"]').style.display = 'block';
      }
      if (trimmed !== state.filterText) {
        state.filterText = trimmed;
        vscode.postMessage({ type: 'setFilter', filter: trimmed });
      }
    }

    function toggleTag(tag) {
      const key = tag.toLowerCase();
      if (activeTags.has(key)) {
        activeTags.delete(key);
      } else {
        activeTags.add(key);
      }
      Array.from(document.querySelectorAll('.tag-chip')).forEach((chip) => {
        const chipKey = (chip.dataset.tag || '').toLowerCase();
        chip.classList.toggle('active', activeTags.has(chipKey));
      });
      vscode.postMessage({ type: 'setTagFilter', tags: Array.from(activeTags.values()) });
      applyFilter();
    }

    document.addEventListener('click', (event) => {
      const target = event.target.closest('[data-action]');
      if (!target) return;
      const action = target.dataset.action;
      if (action === 'browse-toggle') {
        const key = target.dataset.browseKey;
        const path = target.dataset.browsePath;
        if (!key || !path) return;
        const container = document.querySelector(\`.browse-children[data-browse-parent="\${key}"]\`);
        if (!container) return;
        const isOpen = container.classList.contains('open');
        container.classList.toggle('open', !isOpen);
        if (!isOpen && container.dataset.loaded !== 'true') {
          const row = target.closest('.project-row');
          const projectId = row ? row.dataset.projectId : undefined;
          if (projectId) {
            vscode.postMessage({ type: 'requestBrowse', projectId, path });
          }
        }
        return;
      }
      const row = target.closest('.project-row');
      const projectId = row ? row.dataset.projectId : undefined;
      if (action === 'toggle-details' && row && projectId) {
        const details = row.querySelector('.details');
        if (!details) return;
        const isOpen = details.classList.contains('open');
        details.classList.toggle('open', !isOpen);
        if (!isOpen && details.dataset.loaded !== 'true') {
          vscode.postMessage({ type: 'requestProjectDetails', projectId });
        }
        return;
      }
      if (!projectId) return;
      vscode.postMessage({ type: 'projectAction', action, projectId, extra: target.dataset.extra || '' });
    });

    if (filterInput) {
      filterInput.addEventListener('input', applyFilter);
    }
    if (clearFilter) {
      clearFilter.addEventListener('click', () => {
        filterInput.value = '';
        applyFilter();
      });
    }
    if (tagBar) {
      tagBar.addEventListener('click', (event) => {
        const chip = event.target.closest('.tag-chip');
        if (!chip) return;
        const tag = chip.dataset.tag;
        if (tag) toggleTag(tag);
      });
    }
    if (loadMore) {
      loadMore.addEventListener('click', () => vscode.postMessage({ type: 'loadMore' }));
    }
    if (toggleFavorites) {
      toggleFavorites.addEventListener('click', () => vscode.postMessage({ type: 'toggleFavoritesOnly' }));
    }
    if (refreshProjects) {
      refreshProjects.addEventListener('click', () => vscode.postMessage({ type: 'refreshProjects' }));
    }

    window.addEventListener('message', (event) => {
      const message = event.data || {};
      if (message.type === 'focusFilter' && filterInput) {
        filterInput.focus();
        filterInput.select();
      }
      if (message.type === 'sync' && message.update) {
        const update = message.update;
        if (update.state) {
          Object.assign(state, update.state);
        }
        activeTags = new Set((state.tagFilter || []).map((tag) => String(tag).toLowerCase()));
        if (filterInput && document.activeElement !== filterInput) {
          filterInput.value = state.filterText || '';
        }
        if (toggleFavorites) {
          toggleFavorites.textContent = state.favoritesOnly ? 'Favorites only' : 'All projects';
        }
        if (statusLine) {
          updateStatusLine();
        }
        if (tagBar) {
          tagBar.innerHTML = update.tagsHtml || '';
          tagBar.style.display = update.tagBarVisible ? '' : 'none';
        }
        const favoritesBody = document.querySelector('section[data-group="favorites"] .group-body');
        if (favoritesBody) {
          favoritesBody.innerHTML = update.favoritesHtml || '';
        }
        const projectsBody = document.querySelector('section[data-group="projects"] .group-body');
        if (projectsBody) {
          projectsBody.innerHTML = update.projectsHtml || '';
        }
        applyFilter();
      }
      if (message.type === 'projectDetails') {
        const details = message.details;
        if (!details || !details.projectId) return;
        const row = document.querySelector(\`.project-row[data-project-id="\${details.projectId}"]\`);
        if (!row) return;
        const container = row.querySelector('.details');
        if (!container) return;
        container.innerHTML = renderDetails(details);
        container.dataset.loaded = 'true';
        container.classList.add('open');
      }
      if (message.type === 'browseEntries') {
        const details = message;
        if (!details.projectId || !details.path || !details.entries) return;
        const row = document.querySelector(\`.project-row[data-project-id="\${details.projectId}"]\`);
        if (!row) return;
        const key = encodeURIComponent(details.path);
        const container = row.querySelector(\`.browse-children[data-browse-parent="\${key}"]\`);
        if (!container) return;
        container.innerHTML = renderBrowseList(details.entries);
        container.dataset.loaded = 'true';
        container.classList.add('open');
      }
    });

    function renderDetails(details) {
      const pinned = details.pinnedItems || [];
      const entryPoints = details.entryPoints || [];
      const buildScripts = details.buildScripts || [];
      const presets = details.runPresets || [];
      const runs = details.recentRuns || [];
      const browseRoot = details.browseRoot || [];

      const renderList = (items, type) => {
        if (!items.length) {
          return '<div class="muted">None</div>';
        }
        return items.map((item) => {
          const label = escapeHtml(item.label || item.path || 'item');
          const path = escapeHtml(item.path || '');
          return \`
            <div class="detail-item">
              <span title="\${path}">\${label}</span>
              <span class="detail-actions">
                \${type === 'pinned' ? '<button class="action-button" data-action="open-pinned" data-extra="' + escapeHtml(item.path) + '">Open</button>' : ''}
                \${type === 'pinned' ? '<button class="action-button" data-action="unpin-item" data-extra="' + escapeHtml(item.path) + '">Unpin</button>' : ''}
                \${type === 'entry' ? '<button class="action-button" data-action="open-entry" data-extra="' + escapeHtml(item.key) + '">Open</button>' : ''}
                \${type === 'entry' ? '<button class="action-button" data-action="run-entry" data-extra="' + escapeHtml(item.key) + '">Run</button>' : ''}
                \${type === 'preset' ? '<button class="action-button" data-action="run-preset" data-extra="' + escapeHtml(item.id) + '">Run</button>' : ''}
                \${type === 'history' ? '<button class="action-button" data-action="run-history" data-extra="' + escapeHtml(item.id) + '">Run</button>' : ''}
              </span>
            </div>
          \`;
        }).join('');
      };

      return \`
        <div class="detail-section">
          <div class="detail-title">Pinned Items</div>
          \${renderList(pinned, 'pinned')}
        </div>
        <div class="detail-section">
          <div class="detail-title">Browse</div>
          <div class="browse-list" data-browse-root="\${escapeHtml(details.projectId)}">
            \${renderBrowseList(browseRoot)}
          </div>
        </div>
        <div class="detail-section">
          <div class="detail-title">Entry Points</div>
          \${renderList(entryPoints, 'entry')}
        </div>
        <div class="detail-section">
          <div class="detail-title">Build Scripts</div>
          \${renderList(buildScripts, 'entry')}
        </div>
        <div class="detail-section">
          <div class="detail-title">Run Presets</div>
          \${renderList(presets, 'preset')}
        </div>
        <div class="detail-section">
          <div class="detail-title">Recent Runs</div>
          \${renderList(runs, 'history')}
        </div>
      \`;
    }

    function renderBrowseList(entries) {
      if (!entries.length) {
        return '<div class="muted">Empty folder.</div>';
      }
      return entries.map((entry) => {
        const key = encodeURIComponent(entry.path || '');
        const toggle = entry.isDirectory
          ? \`<button class="browse-toggle" data-action="browse-toggle" data-browse-key="\${key}" data-browse-path="\${escapeHtml(entry.path)}">\${'▸'}</button>\`
          : '<span class="browse-toggle"></span>';
        const action = entry.isDirectory
          ? ''
          : \`<button class="action-button" data-action="open-browse" data-extra="\${escapeHtml(entry.path)}">Open</button>\`;
        const children = entry.isDirectory
          ? \`<div class="browse-children" data-browse-parent="\${key}" data-loaded="false"></div>\`
          : '';
        return \`
          <div class="browse-item" data-browse-key="\${key}">
            \${toggle}
            <span class="name" title="\${escapeHtml(entry.path)}">\${escapeHtml(entry.name)}</span>
            \${action}
          </div>
          \${children}
        \`;
      }).join('');
    }

    applyFilter();
    updateStatusLine();
  </script>
</body>
</html>`;
}

function renderProjectRow(project: ProjectsWebviewProject): string {
  const searchText = buildSearchText(project);
  const tags = (project.tags ?? []).map((tag) => tag.toLowerCase());
  const description = project.description || project.type;
  const favoriteBadge = project.favorite ? `<span class="badge favorite">${iconStar()}</span>` : '';
  const summaryTooltip = project.summaryTooltip ? `title="${escapeHtml(project.summaryTooltip)}"` : '';
  const meta = description ? escapeHtml(description) : '';
  const metaHtml = meta ? `<span class="project-meta" ${summaryTooltip}>• ${meta}</span>` : '';
  return `
    <div class="project-row" data-project-id="${escapeHtml(project.id)}"
      data-search="${escapeHtml(searchText)}"
      data-tags="${escapeHtml(tags.join('|'))}">
      <button class="toggle" data-action="toggle-details">▸</button>
      <div class="project-main">
        <div class="project-title">${favoriteBadge}${escapeHtml(project.name)}</div>
        <div class="project-path" title="${escapeHtml(project.path)}"><span class="path-text">${escapeHtml(project.path)}</span>${metaHtml}</div>
      </div>
      <div class="actions">
        ${iconButton('open-project', 'Open project', iconFolderOpen())}
        ${iconButton('open-new-window', 'Open in new window', iconWindow())}
        ${iconButton('add-workspace', 'Add to workspace', iconAdd())}
        ${iconButton('open-terminal', 'Open in terminal', iconTerminal())}
        ${iconButton('run-project', 'Run project', iconRun())}
        ${iconButton('git-clean', 'Git clean', iconClean())}
        ${iconButton('open-vs', 'Open in Visual Studio', iconVs())}
        ${iconButton('set-tags', 'Set tags', iconTag())}
      </div>
      <div class="details" data-loaded="false"></div>
    </div>
  `;
}

function renderTagChip(label: string, count: number, active: boolean): string {
  return `<button class="tag-chip ${active ? 'active' : ''}" data-tag="${escapeHtml(label)}">${escapeHtml(label)}<span class="count">${count}</span></button>`;
}

function iconButton(action: string, label: string, icon: string): string {
  return `<button class="action-button" data-action="${escapeHtml(action)}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${icon}</button>`;
}

function iconFolderOpen(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1H3V6z"></path><path d="M3 9h18l-2 9H5L3 9z"></path></svg>';
}

function iconWindow(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5zm2 0v2h14V5H5zm0 4v10h14V9H5z"></path></svg>';
}

function iconAdd(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5h2v14h-2z"></path><path d="M5 11h14v2H5z"></path></svg>';
}

function iconTerminal(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm1.5 4.5 3.5 3.5-1.4 1.4-4.9-4.9 4.9-4.9 1.4 1.4-3.5 3.5zm5.5 4h6v2h-6v-2z"></path></svg>';
}

function iconRun(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg>';
}

function iconClean(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18v2H3V6zm2 4h14l-1.5 10h-11L5 10zm5-6h4l1 2H9l1-2z"></path></svg>';
}

function iconVs(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5 7.5 3 19 8v8l-11.5 5L3 17l6-5-6-5zm7.5 1.5 6.5 4-6.5 4v-8z"></path></svg>';
}

function iconTag(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.6 12.7 11.3 3.4A2 2 0 0 0 9.9 2.8H4a2 2 0 0 0-2 2v5.9a2 2 0 0 0 .6 1.4l9.3 9.3a2 2 0 0 0 2.8 0l6-6a2 2 0 0 0 0-2.8zM6.5 7.5A1.5 1.5 0 1 1 8 6a1.5 1.5 0 0 1-1.5 1.5z"></path></svg>';
}

function iconStar(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.4 14.9 9l6.1.9-4.4 4.3 1 6.1L12 17.3 6.4 20.3l1-6.1L3 9.9 9.1 9 12 3.4z"></path></svg>';
}

function buildSearchText(project: ProjectsWebviewProject): string {
  const identity = project.identity;
  return [
    project.name,
    project.path,
    project.type,
    identity?.githubRepo,
    identity?.repositoryPath,
    identity?.repositoryUrl,
    identity?.powershellModule,
    identity?.nugetPackage,
    identity?.vscodeExtensionId,
    project.tags?.join(' ')
  ].filter(Boolean).join(' ').toLowerCase();
}

function escapeHtml(value: string): string {
  return String(value).replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return char;
    }
  });
}

function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function randomNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i += 1) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
