<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { isAllowedChatGptUrl } from './lib/domainPolicy';

  const CHATGPT_URL = 'https://chatgpt.com/';

  let webview: Electron.WebviewTag | null = null;
  let isLoading = true;
  let errorMessage = '';
  let pageTitle = 'ChatGPT';
  let zoomPercent = 100;
  let isEditingZoom = false;
  let zoomInputValue = '100';
  let zoomInputEl: HTMLInputElement | null = null;
  let switcherInputEl: HTMLInputElement | null = null;
  let isSwitcherOpen = false;
  let switcherQuery = '';
  let switcherLoading = false;
  let activeSwitcherIndex = 0;
  let switcherItems: Array<{ type: 'project' | 'chat'; title: string; url: string }> = [];
  let consentRetryTimer: ReturnType<typeof setTimeout> | null = null;
  let loadProgress = 0;
  let progressTimer: ReturnType<typeof setInterval> | null = null;

  function startProgress(): void {
    stopProgress();
    loadProgress = 0;
    progressTimer = setInterval(() => {
      if (loadProgress < 90) {
        loadProgress += (90 - loadProgress) * 0.08;
      }
    }, 100);
  }

  function finishProgress(): void {
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
    loadProgress = 100;
    setTimeout(() => {
      loadProgress = 0;
    }, 300);
  }

  function stopProgress(): void {
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
  }

  async function autoAcceptCookieConsent(node: Electron.WebviewTag): Promise<void> {
    const clicked = await node.executeJavaScript(
      `
      (() => {
        const selectors = [
          'button',
          '[role="button"]',
          'input[type="button"]',
          'input[type="submit"]',
          'a'
        ];

        const keywords = [
          'accept',
          'agree',
          'allow',
          '동의',
          '수락'
        ];

        const elements = selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
        const target = elements.find((el) => {
          const valueText = 'value' in el ? (el.value || '') : '';
          const text = ((el.textContent || '') + ' ' + (el.getAttribute('aria-label') || '') + ' ' + valueText)
            .toLowerCase()
            .trim();
          if (!text) return false;
          return keywords.some((word) => text.includes(word));
        });

        if (!target) return false;
        if (typeof target.click === 'function') {
          target.click();
        }
        return true;
      })();
      `,
      true
    );

    if (clicked) {
      return;
    }

    if (consentRetryTimer) {
      clearTimeout(consentRetryTimer);
    }

    consentRetryTimer = setTimeout(() => {
      void autoAcceptCookieConsent(node);
    }, 1500);
  }

  function adjustZoom(delta: number): void {
    if (!webview) {
      return;
    }

    const current = webview.getZoomFactor();
    const next = Math.min(3, Math.max(0.5, current + delta));
    webview.setZoomFactor(next);
    zoomPercent = Math.round(next * 100);
    zoomInputValue = String(zoomPercent);
  }

  async function openZoomEditor(): Promise<void> {
    isEditingZoom = true;
    zoomInputValue = String(zoomPercent);
    await tick();
    zoomInputEl?.focus();
    zoomInputEl?.select();
  }

  function applyZoomFromInput(): void {
    if (!webview) {
      isEditingZoom = false;
      return;
    }

    const parsed = Number.parseInt(zoomInputValue, 10);
    const clamped = Number.isFinite(parsed) ? Math.max(50, Math.min(300, parsed)) : zoomPercent;
    const factor = clamped / 100;
    webview.setZoomFactor(factor);
    zoomPercent = clamped;
    zoomInputValue = String(clamped);
    isEditingZoom = false;
  }

  function cancelZoomEdit(): void {
    zoomInputValue = String(zoomPercent);
    isEditingZoom = false;
  }

  function reloadWebview(): void {
    if (webview) {
      errorMessage = '';
      webview.reload();
    }
  }

  function handleReloadRequest(): void {
    reloadWebview();
  }

  async function startNewChat(): Promise<void> {
    if (!webview) {
      return;
    }

    const clicked = await webview
      .executeJavaScript(
        `
        (() => {
          const selectors = [
            'button[data-testid*="new-chat"]',
            'a[data-testid*="new-chat"]',
            'button[aria-label*="new chat" i]',
            'a[aria-label*="new chat" i]',
            'a[href="/"]'
          ];

          for (const selector of selectors) {
            const target = document.querySelector(selector);
            if (target && typeof target.click === 'function') {
              target.click();
              return true;
            }
          }

          return false;
        })();
        `,
        true
      )
      .catch(() => false);

    if (!clicked) {
      void webview.loadURL(CHATGPT_URL);
    }
  }

  async function toggleSidebar(): Promise<void> {
    if (!webview) {
      return;
    }

    const toggled = await webview
      .executeJavaScript(
        `
        (() => {
          const candidates = Array.from(document.querySelectorAll('button, [role="button"]'));
          const byLabel = candidates.find((el) => {
            const label = ((el.getAttribute('aria-label') || '') + ' ' + (el.textContent || '')).toLowerCase();
            return label.includes('sidebar') || label.includes('side bar') || label.includes('사이드바');
          });

          if (byLabel && typeof byLabel.click === 'function') {
            byLabel.click();
            return true;
          }

          const fallback = document.querySelector('[data-testid*="sidebar"], [data-testid*="toggle"]');
          if (fallback && typeof fallback.click === 'function') {
            fallback.click();
            return true;
          }

          return false;
        })();
        `,
        true
      )
      .catch(() => false);

    if (!toggled) {
      // Last-resort fallback to the common ChatGPT sidebar shortcut.
      await webview
        .executeJavaScript(
          `
          (() => {
            const event = new KeyboardEvent('keydown', {
              key: 'b',
              metaKey: true,
              bubbles: true,
              cancelable: true
            });
            document.dispatchEvent(event);
          })();
          `,
          true
        )
        .catch(() => undefined);
    }
  }

  async function fetchSwitcherItems(node: Electron.WebviewTag): Promise<void> {
    const rawItems = await node
      .executeJavaScript(
        `
        (() => {
          const absolute = (href) => {
            try {
              return new URL(href, location.origin).toString();
            } catch {
              return '';
            }
          };

          const results = [];
          const seen = new Set();
          const pushItem = (type, title, url) => {
            if (!url || seen.has(url)) return;
            seen.add(url);
            results.push({ type, title, url });
          };

          // DOM only: collect from sidebars/navigation links.
          const candidates = Array.from(document.querySelectorAll('a[href]'));
          for (const link of candidates) {
            const href = absolute(link.getAttribute('href') || '');
            if (!href) continue;

            const text = (link.textContent || '').replace(/\\s+/g, ' ').trim();
            if (!text) continue;

            const parsed = new URL(href);
            const host = parsed.hostname.toLowerCase();
            if (!(host === 'chatgpt.com' || host.endsWith('.chatgpt.com') || host === 'openai.com' || host.endsWith('.openai.com'))) {
              continue;
            }

            const path = parsed.pathname.toLowerCase();
            let type = '';
            if (path.includes('/project') || path.includes('/projects/')) {
              type = 'project';
            } else if (path.includes('/c/')) {
              type = 'chat';
            }

            if (!type) continue;
            pushItem(type, text, href);
          }

          return results.slice(0, 200);
        })();
        `,
        true
      )
      .catch(() => []);

    if (Array.isArray(rawItems)) {
      switcherItems = rawItems.filter(
        (item): item is { type: 'project' | 'chat'; title: string; url: string } =>
          !!item &&
          (item.type === 'project' || item.type === 'chat') &&
          typeof item.title === 'string' &&
          typeof item.url === 'string'
      );
    } else {
      switcherItems = [];
    }
  }

  function getFilteredSwitcherItems(): Array<{ type: 'project' | 'chat'; title: string; url: string }> {
    const query = switcherQuery.trim().toLowerCase();
    if (!query) {
      return switcherItems;
    }
    return switcherItems.filter((item) => item.title.toLowerCase().includes(query) || item.url.toLowerCase().includes(query));
  }

  async function openSwitcher(): Promise<void> {
    if (!webview) {
      return;
    }

    isSwitcherOpen = true;
    switcherQuery = '';
    activeSwitcherIndex = 0;
    switcherLoading = true;
    await tick();
    switcherInputEl?.focus();

    await fetchSwitcherItems(webview);
    switcherLoading = false;
  }

  function closeSwitcher(): void {
    isSwitcherOpen = false;
    switcherQuery = '';
    activeSwitcherIndex = 0;
  }

  function moveActiveSwitcher(direction: 1 | -1): void {
    const filtered = getFilteredSwitcherItems();
    if (filtered.length === 0) {
      activeSwitcherIndex = 0;
      return;
    }
    const next = activeSwitcherIndex + direction;
    if (next < 0) {
      activeSwitcherIndex = filtered.length - 1;
      return;
    }
    if (next >= filtered.length) {
      activeSwitcherIndex = 0;
      return;
    }
    activeSwitcherIndex = next;
  }

  function selectSwitcherItem(item: { type: 'project' | 'chat'; title: string; url: string }): void {
    if (!webview) {
      return;
    }
    void webview.loadURL(item.url);
    closeSwitcher();
  }

  function bindWebview(node: Electron.WebviewTag) {
    webview = node;

    const onStart = (): void => {
      isLoading = true;
      errorMessage = '';
      pageTitle = 'ChatGPT';
      startProgress();
    };

    const onTitleUpdated = (e: Electron.PageTitleUpdatedEvent): void => {
      pageTitle = (e.title?.trim()) ? e.title.trim() : 'ChatGPT';
    };

    const onStop = (): void => {
      isLoading = false;
      finishProgress();
      void autoAcceptCookieConsent(node);
    };

    const onFail = (event: Event): void => {
      const details = event as Electron.DidFailLoadEvent;
      if (details.errorCode === -3) {
        return;
      }

      isLoading = false;
      errorMessage = `Failed to load ChatGPT (${details.errorCode}: ${details.errorDescription}).`;
      console.error('webview did-fail-load', {
        errorCode: details.errorCode,
        errorDescription: details.errorDescription,
        validatedURL: details.validatedURL
      });
    };

    const onNavigate = (event: Event): void => {
      const details = event as Electron.WillNavigateEvent;

      if (isAllowedChatGptUrl(details.url)) {
        return;
      }

      event.preventDefault();
      void window.app.openExternal(details.url);
    };

    const onNewWindow = (event: Event): void => {
      const details = event as Electron.NewWindowEvent;

      event.preventDefault();
      if (isAllowedChatGptUrl(details.url)) {
        void node.loadURL(details.url);
        return;
      }

      void window.app.openExternal(details.url);
    };

    const onDomReady = (): void => {
      void autoAcceptCookieConsent(node);
      zoomPercent = Math.round(node.getZoomFactor() * 100);
      zoomInputValue = String(zoomPercent);
    };

    node.addEventListener('did-start-loading', onStart);
    node.addEventListener('did-stop-loading', onStop);
    node.addEventListener('did-fail-load', onFail);
    node.addEventListener('will-navigate', onNavigate);
    node.addEventListener('new-window', onNewWindow);
    node.addEventListener('dom-ready', onDomReady);
    node.addEventListener('page-title-updated', onTitleUpdated);

    return {
      destroy() {
        stopProgress();
        if (consentRetryTimer) {
          clearTimeout(consentRetryTimer);
          consentRetryTimer = null;
        }
        node.removeEventListener('did-start-loading', onStart);
        node.removeEventListener('did-stop-loading', onStop);
        node.removeEventListener('did-fail-load', onFail);
        node.removeEventListener('will-navigate', onNavigate);
        node.removeEventListener('new-window', onNewWindow);
        node.removeEventListener('dom-ready', onDomReady);
        node.removeEventListener('page-title-updated', onTitleUpdated);
      }
    };
  }

  onMount(() => {
    window.addEventListener('app:reload-webview', handleReloadRequest);
    window.addEventListener('app:new-chat', startNewChat);
    const onZoomIn = () => adjustZoom(0.1);
    const onZoomOut = () => adjustZoom(-0.1);

    window.addEventListener('app:open-switcher', openSwitcher);
    window.addEventListener('app:toggle-sidebar', toggleSidebar);
    window.addEventListener('app:zoom-in', onZoomIn);
    window.addEventListener('app:zoom-out', onZoomOut);

    return () => {
      window.removeEventListener('app:reload-webview', handleReloadRequest);
      window.removeEventListener('app:new-chat', startNewChat);
      window.removeEventListener('app:open-switcher', openSwitcher);
      window.removeEventListener('app:toggle-sidebar', toggleSidebar);
      window.removeEventListener('app:zoom-in', onZoomIn);
      window.removeEventListener('app:zoom-out', onZoomOut);
    };
  });
</script>

<main class="app-shell">
  <header class="titlebar">
    <div class="titlebar-content">
      {#if !pageTitle || pageTitle === 'ChatGPT'}
        <span class="app-name">ChatGPT-Lite</span>
      {/if}
      {#if pageTitle && pageTitle !== 'ChatGPT'}
        <span class="page-title">{pageTitle}</span>
      {/if}
    </div>
    <div class="titlebar-actions">
      <button class="icon-button" type="button" aria-label="Zoom Out" on:click={() => adjustZoom(-0.1)}>
        −
      </button>
      {#if isEditingZoom}
        <input
          bind:this={zoomInputEl}
          class="zoom-input"
          type="number"
          min="50"
          max="300"
          bind:value={zoomInputValue}
          on:blur={applyZoomFromInput}
          on:keydown={(event) => {
            if (event.key === 'Enter') {
              applyZoomFromInput();
            }
            if (event.key === 'Escape') {
              cancelZoomEdit();
            }
          }}
        />
      {:else}
        <button class="zoom-label" type="button" on:click={openZoomEditor} aria-label="Edit zoom level">
          {zoomPercent}%
        </button>
      {/if}
      <button class="icon-button" type="button" aria-label="Zoom In" on:click={() => adjustZoom(0.1)}>
        +
      </button>
    </div>
  </header>
  {#if loadProgress > 0}
    <div class="progress-bar" style="width: {loadProgress}%; opacity: {loadProgress >= 100 ? 0 : 1}"></div>
  {/if}
  <section class="content">
    <webview
      use:bindWebview
      src={CHATGPT_URL}
      partition="persist:chatgptlite"
      class="chatgpt-webview"
    ></webview>

    {#if isLoading}
      <div class="overlay">
        <div class="spinner" aria-hidden="true"></div>
        <p>Loading ChatGPT...</p>
      </div>
    {/if}

    {#if errorMessage}
      <div class="overlay error">
        <p>{errorMessage}</p>
        <button type="button" class="toolbar-button" on:click={reloadWebview}>
          Retry
        </button>
      </div>
    {/if}

    {#if isSwitcherOpen}
      <div
        class="switcher-backdrop"
        role="button"
        tabindex="0"
        aria-label="Close quick switcher"
        on:mousedown={closeSwitcher}
        on:keydown={(event) => {
          if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            closeSwitcher();
          }
        }}
      >
        <div class="switcher-panel" role="dialog" aria-modal="true" tabindex="-1" on:mousedown|stopPropagation>
          <input
            bind:this={switcherInputEl}
            class="switcher-input"
            placeholder="Search project or chat..."
            bind:value={switcherQuery}
            on:keydown={(event) => {
              if (event.key === 'Escape') {
                closeSwitcher();
              } else if (event.key === 'ArrowDown') {
                event.preventDefault();
                moveActiveSwitcher(1);
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                moveActiveSwitcher(-1);
              } else if (event.key === 'Enter') {
                const filtered = getFilteredSwitcherItems();
                const selected = filtered[activeSwitcherIndex];
                if (selected) {
                  selectSwitcherItem(selected);
                }
              }
            }}
          />

          <div class="switcher-list">
            {#if switcherLoading}
              <div class="switcher-empty">Loading...</div>
            {:else}
              {@const filteredItems = getFilteredSwitcherItems()}
              {#if filteredItems.length === 0}
                <div class="switcher-empty">No project/chat found.</div>
              {:else}
                {#each filteredItems as item, index}
                  <button
                    class="switcher-item {index === activeSwitcherIndex ? 'active' : ''}"
                    type="button"
                    on:mouseenter={() => (activeSwitcherIndex = index)}
                    on:click={() => selectSwitcherItem(item)}
                  >
                    <span class="switcher-item-type">{item.type === 'project' ? 'Project' : 'Chat'}</span>
                    <span class="switcher-item-title">{item.title}</span>
                  </button>
                {/each}
              {/if}
            {/if}
          </div>
        </div>
      </div>
    {/if}
  </section>
</main>
