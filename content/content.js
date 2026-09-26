/**
 * Instagram Focus — content script
 *
 * - Full-screen blocks /p/, /reel/, /reels/, /channels/ with an overlay.
 * - On home ("/"), hides feed posts and reel trays, leaves stories alone.
 * - On /explore/, hides post/reel tiles but keeps nav, headings, filters,
 *   and (per the "Hide search bar" setting) the search UI.
 * - Never touches /direct/*, profile pages, or settings.
 * - Reacts to pushState/replaceState/popstate/hashchange and DOM mutations
 *   so it keeps up with Instagram's client-side routing.
 *
 * Instagram's class names are obfuscated and change often, so selectors
 * rely on semantic structure (<main>, <article>) and href patterns
 * (/reel/, /stories/) instead.
 */
(function () {
  'use strict';

  const STORAGE_DEFAULTS = { extensionEnabled: true, hideSearchBar: false };
  let state = { ...STORAGE_DEFAULTS };

  // Routes that get a full-screen "blocked" overlay with no bypass.
  const FULL_BLOCK_PATTERNS = [
    /^\/p\//,       // individual post pages
    /^\/reel\//,    // individual reel
    /^\/reels\//,   // reels tab / feed
    /^\/channels\// // channels
  ];
  const EXPLORE_PATTERN = /^\/explore\//;

  let overlayEl = null;
  let mutationObserver = null;
  let lastPath = null;
  let rafScheduled = false;

  // ---------- helpers ----------

  function getPath() {
    return window.location.pathname;
  }

  function isHomePath(path) {
    return path === '/' || path === '';
  }

  function matchesFullBlock(path) {
    return FULL_BLOCK_PATTERNS.some((re) => re.test(path));
  }

  function matchesExplore(path) {
    return EXPLORE_PATTERN.test(path);
  }

  function findMain() {
    return document.querySelector('main');
  }

  // ---------- storage ----------

  function loadState(cb) {
    try {
      chrome.storage.sync.get(STORAGE_DEFAULTS, (items) => {
        state = { ...STORAGE_DEFAULTS, ...items };
        cb && cb();
      });
    } catch (e) {
      cb && cb();
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    let changed = false;
    if (changes.extensionEnabled) {
      state.extensionEnabled = changes.extensionEnabled.newValue;
      changed = true;
    }
    if (changes.hideSearchBar) {
      state.hideSearchBar = changes.hideSearchBar.newValue;
      changed = true;
    }
    if (changed) applyAll();
  });

  // ---------- full-screen block overlay ----------

  function ensureOverlay() {
    if (!document.body) return;
    if (overlayEl && document.documentElement.contains(overlayEl)) return;

    overlayEl = document.createElement('div');
    overlayEl.id = 'igf-block-overlay';
    overlayEl.setAttribute('role', 'dialog');
    overlayEl.setAttribute('aria-modal', 'true');
    overlayEl.setAttribute('aria-label', 'Content blocked by Instagram Focus');
    overlayEl.innerHTML = [
      '<div class="igf-block-card">',
      '  <div class="igf-block-icon" aria-hidden="true">&#9686;</div>',
      '  <p class="igf-block-message">This content is blocked by Instagram Focus.</p>',
      '  <div class="igf-block-actions">',
      '    <button type="button" class="igf-btn igf-btn-primary" id="igf-go-inbox">Go to Inbox</button>',
      '    <button type="button" class="igf-btn igf-btn-secondary" id="igf-go-home">Go to Home</button>',
      '  </div>',
      '</div>'
    ].join('');

    document.documentElement.appendChild(overlayEl);
    document.documentElement.classList.add('igf-lock-scroll');

    overlayEl.querySelector('#igf-go-inbox').addEventListener('click', () => {
      window.location.href = 'https://www.instagram.com/direct/inbox/';
    });
    overlayEl.querySelector('#igf-go-home').addEventListener('click', () => {
      window.location.href = 'https://www.instagram.com/';
    });
  }

  function removeOverlay() {
    if (overlayEl && overlayEl.parentNode) {
      overlayEl.parentNode.removeChild(overlayEl);
    }
    overlayEl = null;
    document.documentElement.classList.remove('igf-lock-scroll');
  }

  // ---------- home feed / explore grid hiding ----------

  function processFeedArticles(main) {
    let hidAny = false;
    const articles = main.querySelectorAll('article:not([data-igf-hidden])');
    articles.forEach((article) => {
      article.classList.add('igf-hidden-element');
      article.setAttribute('data-igf-hidden', 'true');
      hidAny = true;
    });
    return hidAny;
  }

  // Suggested-reels trays are often rendered as horizontal rails of
  // /reel/ links rather than <article> elements, so walk up from each
  // link to hide its containing card/tray. Leave /stories/ links alone.
  function processReelTrays(main) {
    const reelLinks = main.querySelectorAll(
      'a[href^="/reel/"]:not([data-igf-checked]), a[href^="/reels/"]:not([data-igf-checked])'
    );
    reelLinks.forEach((link) => {
      link.setAttribute('data-igf-checked', 'true');
      if (link.closest('[data-igf-hidden]')) return;
      if (link.closest('a[href^="/stories/"]')) return;

      let target = link;
      for (let i = 0; i < 4 && target.parentElement && target.parentElement !== main; i++) {
        target = target.parentElement;
        if (target.matches('li, article')) break;
      }
      if (!target.hasAttribute('data-igf-hidden')) {
        target.classList.add('igf-hidden-element');
        target.setAttribute('data-igf-hidden', 'true');
      }
    });
  }

  function restoreHiddenElements(root) {
    (root || document).querySelectorAll('[data-igf-hidden]').forEach((el) => {
      el.classList.remove('igf-hidden-element');
      el.removeAttribute('data-igf-hidden');
    });
    (root || document).querySelectorAll('[data-igf-checked]').forEach((el) => {
      el.removeAttribute('data-igf-checked');
    });
  }

  function ensurePlaceholder(id, message) {
    const main = findMain();
    if (!main) return;
    if (main.querySelector('#' + id)) return;
    const placeholder = document.createElement('div');
    placeholder.id = id;
    placeholder.className = 'igf-feed-placeholder';
    placeholder.innerHTML = '<p>' + message + '</p>';
    main.insertBefore(placeholder, main.firstChild);
  }

  function removePlaceholder(id) {
    document.querySelectorAll('#' + id).forEach((el) => el.remove());
  }

  function applyHomeFeedBlocking() {
    const main = findMain();
    if (!main) return;
    processFeedArticles(main);
    processReelTrays(main);
    ensurePlaceholder('igf-feed-placeholder', 'Your feed is hidden to help you stay focused.');
  }

  // Explore tiles are usually bare <a href="/p/..."> or <a href="/reel/...">
  // links, not <article> elements, and their wrapper shape varies. Hide the
  // smallest tile wrapper around each link instead of the grid container,
  // so nav/search/filter/heading elements stay untouched.
  function processExploreTiles(main) {
    const tileLinks = main.querySelectorAll(
      'a[href^="/p/"]:not([data-igf-checked]), a[href^="/reel/"]:not([data-igf-checked]), a[href^="/reels/"]:not([data-igf-checked])'
    );
    tileLinks.forEach((link) => {
      link.setAttribute('data-igf-checked', 'true');
      if (link.closest('[data-igf-hidden]')) return;

      // Walk up a short distance to the tile's container (li/article, or a
      // div that looks like a grid cell) without escaping past <main>.
      let target = link;
      for (let i = 0; i < 5 && target.parentElement && target.parentElement !== main; i++) {
        target = target.parentElement;
        if (target.matches('li, article')) break;
      }
      if (!target.hasAttribute('data-igf-hidden')) {
        target.classList.add('igf-hidden-element');
        target.setAttribute('data-igf-hidden', 'true');
      }
    });
  }

  function applyExploreBlocking() {
    const main = findMain();
    if (!main) return;
    // Catch <article>-based tiles first, then sweep for any remaining
    // post/reel links regardless of wrapper shape.
    processFeedArticles(main);
    processReelTrays(main);
    processExploreTiles(main);
    ensurePlaceholder('igf-explore-placeholder', 'Explore content is blocked by Instagram Focus.');
  }

  // ---------- search bar ----------

  function applySearchBarVisibility() {
    const shouldHide = state.extensionEnabled && state.hideSearchBar;
    document.documentElement.classList.toggle('igf-hide-search', shouldHide);
  }

  // ---------- master apply ----------

  function clearAllBlocking() {
    removeOverlay();
    removePlaceholder('igf-feed-placeholder');
    removePlaceholder('igf-explore-placeholder');
    restoreHiddenElements(document);
  }

  function applyAll() {
    applySearchBarVisibility();

    if (!state.extensionEnabled) {
      clearAllBlocking();
      return;
    }

    const path = getPath();

    if (matchesFullBlock(path)) {
      removePlaceholder('igf-feed-placeholder');
      removePlaceholder('igf-explore-placeholder');
      restoreHiddenElements(document);
      ensureOverlay();
      return;
    }

    // Not a full-block route past this point.
    removeOverlay();

    if (matchesExplore(path)) {
      removePlaceholder('igf-feed-placeholder');
      applyExploreBlocking();
      return;
    }
    removePlaceholder('igf-explore-placeholder');

    if (isHomePath(path)) {
      applyHomeFeedBlocking();
      return;
    }

    // /direct/*, profile pages, settings, etc. — leave completely alone.
    removePlaceholder('igf-feed-placeholder');
    restoreHiddenElements(document);
  }

  // ---------- SPA navigation detection ----------

  function onPossibleChange() {
    const path = getPath();
    if (path !== lastPath) {
      lastPath = path;
      applyAll();
      return;
    }
    // Same route, but DOM may have re-rendered (infinite scroll) — just
    // re-run the hiding passes, not the whole pipeline.
    if (state.extensionEnabled) {
      if (isHomePath(path)) applyHomeFeedBlocking();
      else if (matchesExplore(path)) applyExploreBlocking();
    }
  }

  function patchHistoryAPI() {
    const fire = () => window.dispatchEvent(new Event('igf:locationchange'));
    const originalPushState = history.pushState;
    history.pushState = function (...args) {
      const result = originalPushState.apply(this, args);
      fire();
      return result;
    };
    const originalReplaceState = history.replaceState;
    history.replaceState = function (...args) {
      const result = originalReplaceState.apply(this, args);
      fire();
      return result;
    };
    window.addEventListener('popstate', fire);
    window.addEventListener('hashchange', fire);
    window.addEventListener('igf:locationchange', onPossibleChange);
  }

  function startMutationObserver() {
    mutationObserver = new MutationObserver(() => {
      if (rafScheduled) return;
      rafScheduled = true;
      window.requestAnimationFrame(() => {
        rafScheduled = false;
        onPossibleChange();
      });
    });
    mutationObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function waitForBody(cb) {
    if (document.body) {
      cb();
      return;
    }
    const obs = new MutationObserver(() => {
      if (document.body) {
        obs.disconnect();
        cb();
      }
    });
    obs.observe(document.documentElement, { childList: true });
  }

  function init() {
    patchHistoryAPI();
    loadState(() => {
      waitForBody(() => {
        lastPath = getPath();
        applyAll();
        startMutationObserver();
      });
    });
  }

  init();
})();
