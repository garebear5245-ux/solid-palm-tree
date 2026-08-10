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
    const AC_ITEM = {
        name: 'Additional Content', isAC: true, category: 'Extra', type: 'Add-ons',
        cardText: 'Skins and extra add-ons for your games.',
        artGlyph: '✦',
    };
    const ITEMS = [STORE_ITEM, AC_ITEM, ...(NEBULAR_CONFIG.items || [])];

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
        card.className = 'card' + (item.isStore ? ' store-card' : '') + (item.isAC ? ' ac-card' : '');
        card.tabIndex = 0;

        const catClass = item.isStore ? 'store' : (item.isAC ? 'extra' : item.category.toLowerCase());
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
        } else if (item.isAC) {
            setArtGlyph(art, item.artGlyph || '✦');
            card.addEventListener('click', openAdditional);
            card.addEventListener('keydown', (e) => { if (e.key === 'Enter') openAdditional(); });
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
    function setArtGlyph(art, glyph) {
        art.querySelector('.art-skeleton')?.remove();
        const f = document.createElement('div');
        f.className = 'art-fallback art-glyph';
        f.textContent = glyph;
        art.appendChild(f);
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

        if (item.isAC) return activeFilter === 'all';

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
        if (storeOverlay.style.display === 'block') return;   // already in the Store → do nothing
        if (!navigator.onLine) { offlineModal.style.display = 'flex'; playError(); return; }
        storeFrame.src = NEBULAR_CONFIG.storeUrl;
        storeOverlay.style.display = 'block';
    }
    function closeStore() { storeOverlay.style.display = 'none'; storeFrame.src = ''; }
    document.getElementById('store-back').addEventListener('click', closeStore);
    document.getElementById('offline-ok').addEventListener('click', () => { offlineModal.style.display = 'none'; });

    /* ── Additional Content (skins & add-ons) ───────────────────────────────── */
    const acOverlay = document.getElementById('ac-overlay');
    const acBody    = document.getElementById('ac-body');
    const acTitle   = document.getElementById('ac-title');
    const acLead    = document.getElementById('ac-lead');
    const acBackBtn = document.getElementById('ac-back');
    let acView = 'sections';   // 'sections' | 'skins'

    function openAdditional() {
        if (acOverlay.style.display === 'block') return;   // already open → do nothing
        acView = 'sections';
        renderAC();
        acOverlay.style.display = 'block';
    }
    function closeAdditional() { acOverlay.style.display = 'none'; }

    function renderAC() {
        if (acView === 'skins') {
            acTitle.textContent = 'Eaglercraft / MC Skins';
            acLead.textContent  = 'Click a skin to preview it and download it.';
            renderSkinGrid();
        } else {
            acTitle.textContent = 'Additional Content';
            acLead.textContent  = 'Extra add-ons for your games.';
            renderSectionGrid();
        }
    }

    function renderSectionGrid() {
        acBody.className = 'ac-body ac-sections';
        acBody.innerHTML = '';
        const sec = document.createElement('div');
        sec.className = 'card ac-section-card';
        sec.tabIndex = 0;
        sec.innerHTML = `
            <div class="card-art">
                <span class="cat-tag extra">Skins</span>
                <div class="art-fallback art-glyph">🧍</div>
            </div>
            <div class="card-body">
                <div class="card-name">Eaglercraft / MC Skins</div>
                <div class="card-text">Browse and download player skins for Eaglercraft / Minecraft.</div>
            </div>`;
        const go = () => { acView = 'skins'; renderAC(); };
        sec.addEventListener('click', go);
        sec.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
        acBody.appendChild(sec);
    }

    function prettySkinName(fname) {
        return fname.replace(/\.png$/i, '')
                    .replace(/[_-]+/g, ' ')
                    .replace(/([a-z])([A-Z])/g, '$1 $2')
                    .replace(/\b\w/g, c => c.toUpperCase())
                    .trim();
    }

    function renderSkinGrid() {
        acBody.className = 'ac-body ac-skins-grid';
        acBody.innerHTML = '';
        const skins = NEBULAR_CONFIG.skins || [];
        const base  = NEBULAR_CONFIG.skinsPath || '';
        if (!skins.length) {
            acBody.innerHTML = '<p class="empty-msg">No skins available yet.</p>';
            return;
        }
        skins.forEach(fname => {
            const url = base + fname;
            const name = prettySkinName(fname);
            const card = document.createElement('div');
            card.className = 'card skin-card-tile';
            card.tabIndex = 0;
            card.innerHTML = `
                <div class="card-art skin-tile-art">
                    <div class="skin-tile-stage"><canvas></canvas></div>
                </div>
                <div class="card-body">
                    <div class="card-name">${escapeHtml(name)}</div>
                    <div class="card-badges"><span class="mini-badge skin-model-badge">…</span></div>
                </div>`;
            const canvas = card.querySelector('canvas');
            const badge  = card.querySelector('.skin-model-badge');
            loadSkinImage(url).then(({ img, model }) => {
                drawSkin(canvas, img, 'front', model);
                badge.textContent = model === 'slim' ? 'Slim'
                                  : model === 'legacy' ? 'Classic' : 'Wide';
            }).catch(() => { badge.textContent = 'Skin'; });
            const open = () => openSkin(url, name);
            card.addEventListener('click', open);
            card.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
            acBody.appendChild(card);
        });
    }

    acBackBtn.addEventListener('click', () => {
        if (acView === 'skins') { acView = 'sections'; renderAC(); }
        else closeAdditional();
    });

    /* ── Minecraft skin loading, model detection & 2D rendering ─────────────── */
    const skinCache = new Map();   // url -> { img, model }

    function loadSkinImage(url) {
        if (skinCache.has(url)) return Promise.resolve(skinCache.get(url));
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const model = detectSkinModel(img);
                const entry = { img, model };
                skinCache.set(url, entry);
                resolve(entry);
            };
            img.onerror = reject;
            img.src = url;
        });
    }

    /* Slim (Alex) skins leave the right-most columns of each arm block empty.
       If those "wide-only" pixels are all transparent → the skin is slim. */
    function detectSkinModel(img) {
        if (img.naturalHeight <= 32) return 'legacy';   // old 64x32 → always wide
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const cx = c.getContext('2d');
        cx.drawImage(img, 0, 0);
        let opaque = 0;
        const scan = (x0, x1, y0, y1) => {
            const data = cx.getImageData(x0, y0, x1 - x0 + 1, y1 - y0 + 1).data;
            for (let i = 3; i < data.length; i += 4) if (data[i] > 16) opaque++;
        };
        try {
            scan(54, 55, 20, 31);   // right-arm wide-only columns
            scan(46, 47, 52, 63);   // left-arm  wide-only columns
        } catch (e) { return 'wide'; }
        return opaque === 0 ? 'slim' : 'wide';
    }

    function buildFaces(view, armW, legacy) {
        const front = view === 'front';
        const parts = [
            // Right arm
            { dx: 0,       dy: 8,  w: armW, h: 12,
              bx: front ? 44 : 48 + armW, by: 20, ox: front ? 44 : 48 + armW, oy: 36 },
            // Head
            { dx: armW,    dy: 0,  w: 8,    h: 8,
              bx: front ? 8 : 24, by: 8, ox: front ? 40 : 56, oy: 8 },
            // Body
            { dx: armW,    dy: 8,  w: 8,    h: 12,
              bx: front ? 20 : 32, by: 20, ox: front ? 20 : 32, oy: 36 },
            // Left arm
            { dx: armW + 8, dy: 8, w: armW, h: 12,
              bx: legacy ? (front ? 44 : 48 + armW) : (front ? 36 : 40 + armW),
              by: legacy ? 20 : 52, ox: front ? 52 : 56 + armW, oy: 52 },
            // Right leg
            { dx: armW,    dy: 20, w: 4,    h: 12,
              bx: front ? 4 : 12, by: 20, ox: front ? 4 : 12, oy: 36 },
            // Left leg
            { dx: armW + 4, dy: 20, w: 4,   h: 12,
              bx: legacy ? (front ? 4 : 12) : (front ? 20 : 28),
              by: legacy ? 20 : 52, ox: front ? 4 : 12, oy: 52 },
        ];
        if (legacy) parts.forEach(p => { p.ox = null; });
        return parts;
    }

    function drawSkin(canvas, img, view, model) {
        const legacy = model === 'legacy';
        const armW   = model === 'slim' ? 3 : 4;
        const charW  = armW * 2 + 8;
        const charH  = 32;
        const scale  = 12;
        canvas.width  = charW * scale;
        canvas.height = charH * scale;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const parts = buildFaces(view, armW, legacy);
        ctx.save();
        if (view === 'back') { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
        const put = (sx, sy, w, h, dx, dy) =>
            ctx.drawImage(img, sx, sy, w, h, dx * scale, dy * scale, w * scale, h * scale);
        parts.forEach(p => {
            put(p.bx, p.by, p.w, p.h, p.dx, p.dy);                  // base layer
            if (p.ox != null && !legacy) put(p.ox, p.oy, p.w, p.h, p.dx, p.dy); // overlay
        });
        ctx.restore();
    }

    /* ── Skin detail modal ──────────────────────────────────────────────────── */
    const skinModal   = document.getElementById('skin-modal');
    const skinNameEl  = document.getElementById('skin-name');
    const skinModelEl = document.getElementById('skin-model');
    const skinHintEl  = document.getElementById('skin-model-hint');
    const skinDlEl    = document.getElementById('skin-download');
    const skinFront   = document.getElementById('skin-front');
    const skinBack    = document.getElementById('skin-back');

    function openSkin(url, name) {
        skinNameEl.textContent = name;
        skinDlEl.href = url;
        skinDlEl.setAttribute('download', name.replace(/\s+/g, '') + '.png');
        loadSkinImage(url).then(({ img, model }) => {
            const label = model === 'slim' ? 'Slim (Alex)'
                        : model === 'legacy' ? 'Classic (wide)' : 'Wide (Steve)';
            skinModelEl.textContent = model === 'slim' ? 'Slim' : 'Wide';
            skinHintEl.textContent  = model === 'slim' ? 'Slim (Alex)' : 'Classic (wide)';
            drawSkin(skinFront, img, 'front', model);
            drawSkin(skinBack,  img, 'back',  model);
        }).catch(() => { skinModelEl.textContent = '—'; });
        skinModal.style.display = 'flex';
    }
    function closeSkin() { skinModal.style.display = 'none'; }
    document.getElementById('skin-close').addEventListener('click', closeSkin);
    skinModal.addEventListener('click', (e) => { if (e.target === skinModal) closeSkin(); });

    /* ── Escape closes whatever is open ─────────────────────────────────── */
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (storeOverlay.style.display === 'block') return closeStore();
        if (skinModal.style.display === 'flex')     return closeSkin();
        if (acOverlay.style.display === 'block') {
            if (acView === 'skins') { acView = 'sections'; renderAC(); return; }
            return closeAdditional();
        }
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
