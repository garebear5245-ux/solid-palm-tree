/* ============================================================================
   NEBULAR LAUNCHER — GAME DOWNLOADER  ·  app.js
   Reads games.js, pulls each icon.png straight out of the game's zip, renders
   cards, handles search / filters, downloads, the post-download tutorial, and
   the embedded Store.
   ============================================================================ */
(function () {
    'use strict';

    /* ── Sounds ─────────────────────────────────────────────────────────── */
    const S = {
        click:    new Audio('Assets/Sounds/Click.mp3'),
        complete: new Audio('Assets/Sounds/Complete.mp3'),
        error:    new Audio('Assets/Sounds/Error.mp3'),
    };
    let clickCd = false;
    function playClick() {
        if (clickCd) return;
        clickCd = true;
        S.click.currentTime = 0; S.click.play().catch(() => {});
        setTimeout(() => { clickCd = false; }, 150);   // 0.15s cooldown
    }
    function playComplete() { S.complete.currentTime = 0; S.complete.play().catch(() => {}); }
    function playError()    { S.error.currentTime = 0;    S.error.play().catch(() => {}); }

    // Any button / chip / card click gives feedback (throttled by the cooldown).
    document.addEventListener('click', (e) => {
        if (e.target.closest('button, .chip, .card')) playClick();
    }, true);

    /* ── Tag metadata (shared by card badges + detail checklist) ────────── */
    const TAG_META = {
        achievements: { label: 'Has achievements', icon: '★' },
        offline:      { label: 'Works offline',    icon: '✈' },
        multiplayer:  { label: 'Multiplayer',      icon: '⇄' },
        controller:   { label: 'Controller support', icon: '🎮' },
    };

    /* ── Elements ───────────────────────────────────────────────────────── */
    const grid       = document.getElementById('grid');
    const emptyMsg   = document.getElementById('empty-msg');
    const searchIn   = document.getElementById('search-input');
    const filtersEl  = document.getElementById('filters');
    const netStatus  = document.getElementById('net-status');

    let activeFilter = 'all';
    let query = '';

    /* One entry per catalogue item; keeps the fetched zip blob so a download
       never re-downloads what we already pulled for the icon. */
    const cache = new Map();   // item.name -> { blob, fname, iconUrl }

    /* ── Network indicator ──────────────────────────────────────────────── */
    function refreshNet() {
        const online = navigator.onLine;
        netStatus.classList.toggle('offline', !online);
        netStatus.querySelector('.net-label').textContent = online ? 'Online' : 'Offline';
    }
    window.addEventListener('online', refreshNet);
    window.addEventListener('offline', refreshNet);
    refreshNet();

    /* ── Build the item list (Store card always first) ──────────────────── */
    const STORE_ITEM = {
        name: 'Store', isStore: true, category: 'Store', type: 'Embedded',
        cardText: 'Browse the full online store.',
        icon: NEBULAR_CONFIG.storeIcon,
    };
    const ITEMS = [STORE_ITEM, ...(NEBULAR_CONFIG.items || [])];

    /* ── Card creation ──────────────────────────────────────────────────── */
    function miniBadges(item) {
        if (item.isStore) return '';
        const t = item.tags || {};
        let html = '';
        if (t.achievements) html += `<span class="mini-badge">★ Achievements</span>`;
        if (t.offline)      html += `<span class="mini-badge">✈ Offline</span>`;
        if (t.multiplayer)  html += `<span class="mini-badge">⇄ Multi</span>`;
        if (t.broken)       html += `<span class="mini-badge warn">⚠ May be broken</span>`;
        return html;
    }

    function makeCard(item) {
        const card = document.createElement('div');
        card.className = 'card' + (item.isStore ? ' store-card' : '');
        card.tabIndex = 0;

        const catClass = item.isStore ? 'store' : item.category.toLowerCase();
        card.innerHTML = `
            <div class="card-art">
                <span class="cat-tag ${catClass}">${item.category}</span>
                <div class="art-skeleton"></div>
            </div>
            <div class="card-body">
                <div class="card-name">${escapeHtml(item.name)}</div>
                <div class="card-text">${escapeHtml(item.cardText || '')}</div>
                <div class="card-badges">${miniBadges(item)}</div>
            </div>`;

        const art = card.querySelector('.card-art');

        if (item.isStore) {
            setArtImage(art, item.icon);
            card.addEventListener('click', openStore);
            card.addEventListener('keydown', (e) => { if (e.key === 'Enter') openStore(); });
        } else {
            // Pull the icon out of the zip (also caches the blob for download).
            loadItemZip(item)
                .then(({ iconUrl }) => setArtImage(art, iconUrl))
                .catch(() => setArtFallback(art));
            card.addEventListener('click', () => openDetail(item));
            card.addEventListener('keydown', (e) => { if (e.key === 'Enter') openDetail(item); });
        }
        return card;
    }

    function setArtImage(art, url) {
        const img = new Image();
        img.alt = '';
        img.onload = () => { art.querySelector('.art-skeleton')?.remove(); art.appendChild(img); };
        img.onerror = () => setArtFallback(art);
        img.src = url;
    }
    function setArtFallback(art) {
        art.querySelector('.art-skeleton')?.remove();
        if (!art.querySelector('.art-fallback')) {
            const f = document.createElement('div');
            f.className = 'art-fallback';
            f.textContent = '◆';
            art.appendChild(f);
        }
    }

    /* Fetch the zip once, decode icon.png, keep everything cached. */
    async function loadItemZip(item) {
        if (cache.has(item.name)) return cache.get(item.name);
        const fname = atob(item.file);                          // decode the name
        const url   = NEBULAR_CONFIG.gamesPath + fname;
        const resp  = await fetch(url);
        if (!resp.ok) throw new Error('Could not fetch ' + fname);
        const blob  = await resp.blob();
        const zip   = await JSZip.loadAsync(blob);
        const iconEntry = zip.file('icon.png') || zip.file(/(^|\/)icon\.png$/i)[0];
        let iconUrl = null;
        if (iconEntry) iconUrl = URL.createObjectURL(await iconEntry.async('blob'));
        const entry = { blob, fname, iconUrl };
        cache.set(item.name, entry);
        return entry;
    }

    /* ── Render (with search + filter) ──────────────────────────────────── */
    function matches(item) {
        // Store always shows unless a game/app/tag-only filter excludes it.
        const q = query.trim().toLowerCase();
        if (q && !(item.name.toLowerCase().includes(q) ||
                   (item.cardText || '').toLowerCase().includes(q) ||
                   (item.type || '').toLowerCase().includes(q))) return false;

        switch (activeFilter) {
            case 'all':          return true;
            case 'game':         return item.isStore || item.category === 'Game';
            case 'app':          return item.isStore || item.category === 'App';
            case 'achievements': return item.tags && item.tags.achievements;
            case 'offline':      return item.tags && item.tags.offline;
            default:             return true;
        }
    }

    const cardEls = new Map();   // item -> element (built once, reused)
    function render() {
        grid.innerHTML = '';
        let shown = 0;
        ITEMS.forEach(item => {
            if (!matches(item)) return;
            let el = cardEls.get(item);
            if (!el) { el = makeCard(item); cardEls.set(item, el); }
            grid.appendChild(el);
            shown++;
        });
        emptyMsg.style.display = shown ? 'none' : 'block';
    }

    /* ── Filters + search wiring ────────────────────────────────────────── */
    filtersEl.addEventListener('click', (e) => {
        const chip = e.target.closest('.chip');
        if (!chip) return;
        filtersEl.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c === chip));
        activeFilter = chip.dataset.filter;
        render();
    });
    searchIn.addEventListener('input', () => { query = searchIn.value; render(); });

    /* ── Detail modal ───────────────────────────────────────────────────── */
    const detailModal = document.getElementById('detail-modal');
    const dEls = {
        icon: document.getElementById('detail-icon'),
        name: document.getElementById('detail-name'),
        cat:  document.getElementById('detail-category'),
        type: document.getElementById('detail-type'),
        desc: document.getElementById('detail-desc'),
        list: document.getElementById('detail-checklist'),
        dl:   document.getElementById('detail-download'),
        dlLabel: document.getElementById('detail-download-label'),
        prog: document.getElementById('dl-progress'),
        bar:  document.getElementById('dl-bar'),
    };
    let currentItem = null;

    function buildChecklist(item) {
        const t = item.tags || {};
        let html = '';
        Object.keys(TAG_META).forEach(key => {
            const on = !!t[key];
            html += `<li class="${on ? 'on' : 'off'}">
                        <span class="ck">${on ? '✓' : '·'}</span>${TAG_META[key].label}
                     </li>`;
        });
        if (t.broken) {
            html += `<li class="warn"><span class="ck">!</span>May be broken</li>`;
        }
        return html;
    }

    function openDetail(item) {
        currentItem = item;
        dEls.name.textContent = item.name;
        dEls.cat.textContent  = item.category;
        dEls.cat.className     = 'badge';
        dEls.type.textContent = item.type || '';
        dEls.type.style.display = item.type ? '' : 'none';
        dEls.desc.textContent = item.description || item.cardText || '';
        dEls.list.innerHTML   = buildChecklist(item);
        dEls.dlLabel.textContent = '⤓ Download';
        dEls.dl.disabled = false;
        dEls.prog.style.display = 'none';
        dEls.bar.style.width = '0';

        // Icon: reuse the cached one, else load it.
        dEls.icon.removeAttribute('src');
        loadItemZip(item).then(({ iconUrl }) => { if (iconUrl) dEls.icon.src = iconUrl; }).catch(() => {});

        detailModal.style.display = 'flex';
    }
    function closeDetail() { detailModal.style.display = 'none'; }
    document.getElementById('detail-close').addEventListener('click', closeDetail);
    detailModal.addEventListener('click', (e) => { if (e.target === detailModal) closeDetail(); });

    /* ── Download ───────────────────────────────────────────────────────── */
    dEls.dl.addEventListener('click', async () => {
        if (!currentItem) return;
        const item = currentItem;
        dEls.dl.disabled = true;
        dEls.dlLabel.textContent = 'Preparing…';
        dEls.prog.style.display = 'block';
        dEls.bar.style.width = '15%';
        try {
            const { blob, fname } = await loadItemZip(item);   // cached → instant
            dEls.bar.style.width = '80%';
            saveBlob(blob, fname);
            dEls.bar.style.width = '100%';
            dEls.dlLabel.textContent = '✓ Downloaded';
            playComplete();
            setTimeout(() => { closeDetail(); openTutorial(item, fname); }, 450);
        } catch (err) {
            playError();
            dEls.dl.disabled = false;
            dEls.dlLabel.textContent = '⤓ Retry download';
            dEls.prog.style.display = 'none';
            alert('Something went wrong while downloading. Check your connection and try again.');
        }
    });

    function saveBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
    }

    /* ── Tutorial modal (after a successful download) ───────────────────── */
    const tutModal = document.getElementById('tutorial-modal');
    function openTutorial(item, fname) {
        const folder = fname.replace(/\.zip$/i, '');
        document.getElementById('tut-game-name').textContent = item.name;
        document.getElementById('tut-folder').textContent = folder;
        tutModal.style.display = 'flex';
    }
    function closeTutorial() { tutModal.style.display = 'none'; }
    document.getElementById('tutorial-close').addEventListener('click', closeTutorial);
    document.getElementById('tutorial-done').addEventListener('click', closeTutorial);
    tutModal.addEventListener('click', (e) => { if (e.target === tutModal) closeTutorial(); });

    /* ── Store (embedded) ───────────────────────────────────────────────── */
    const storeOverlay = document.getElementById('store-overlay');
    const storeFrame   = document.getElementById('store-frame');
    const offlineModal = document.getElementById('offline-modal');

    function openStore() {
        if (!navigator.onLine) { offlineModal.style.display = 'flex'; playError(); return; }
        storeFrame.src = NEBULAR_CONFIG.storeUrl;
        storeOverlay.style.display = 'block';
    }
    function closeStore() { storeOverlay.style.display = 'none'; storeFrame.src = ''; }
    document.getElementById('store-back').addEventListener('click', closeStore);
    document.getElementById('offline-ok').addEventListener('click', () => { offlineModal.style.display = 'none'; });

    /* ── Escape closes whatever is open ─────────────────────────────────── */
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (storeOverlay.style.display === 'block') return closeStore();
        if (tutModal.style.display === 'flex')      return closeTutorial();
        if (detailModal.style.display === 'flex')   return closeDetail();
        if (offlineModal.style.display === 'flex')  offlineModal.style.display = 'none';
    });

    /* ── Helpers ────────────────────────────────────────────────────────── */
    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, c => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
        ));
    }

    /* ── Go ─────────────────────────────────────────────────────────────── */
    render();
})();
