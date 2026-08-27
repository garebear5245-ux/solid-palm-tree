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

    /* Always-open sections. Each item lands in exactly one; order here is the
       order the sections appear on the page. */
    const SECTIONS = [
        { id: 'featured', title: 'Featured', match: it => it.isStore || it.isAC },
        { id: 'games',    title: 'Games',    match: it => !it.isStore && !it.isAC && it.category === 'Game' },
        { id: 'apps',     title: 'Apps',     match: it => !it.isStore && !it.isAC && it.category === 'App'  },
    ];
    const sectionEls = new Map();   // id -> { section, gridEl, countEl }

    function ensureSections() {
        if (sectionEls.size) return;
        SECTIONS.forEach(s => {
            const section = document.createElement('section');
            section.className = 'cat-section cat-' + s.id;
            section.innerHTML =
                `<div class="cat-header">
                    <h2 class="cat-title">${escapeHtml(s.title)}</h2>
                    <span class="cat-count"></span>
                 </div>
                 <div class="cat-grid"></div>`;
            grid.appendChild(section);
            sectionEls.set(s.id, {
                section,
                gridEl:  section.querySelector('.cat-grid'),
                countEl: section.querySelector('.cat-count'),
            });
        });
    }

    function sectionFor(item) {
        const s = SECTIONS.find(sec => sec.match(item));
        return s ? s.id : 'games';   // anything uncategorised falls into Games
    }

    function render() {
        ensureSections();
        const counts = {};
        SECTIONS.forEach(s => { counts[s.id] = 0; });

        ITEMS.forEach(item => {
            let el = cardEls.get(item);
            if (!el) { el = makeCard(item); cardEls.set(item, el); }
            const target = sectionEls.get(sectionFor(item)).gridEl;
            if (el.parentNode !== target) target.appendChild(el);   // mount once, keep put
            const show = matches(item);
            el.style.display = show ? '' : 'none';
            if (show) counts[sectionFor(item)]++;
        });

        let total = 0;
        SECTIONS.forEach(s => {
            const { section, countEl } = sectionEls.get(s.id);
            const n = counts[s.id];
            countEl.textContent = n;
            section.style.display = n ? '' : 'none';   // hide a section with nothing to show
            total += n;
        });
        emptyMsg.style.display = total ? 'none' : 'block';
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
        if (item.versions && item.versions.length) { openVersionPicker(item); return; }
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

    // True when this page is itself being shown inside the Store iframe.
    const IS_EMBEDDED = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();

    function openStore() {
        if (IS_EMBEDDED) return;                              // this page IS the store → tile does nothing
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
    let acView = 'sections';   // 'sections' | 'eaglercraft' | 'skins' | 'packs'

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
        } else if (acView === 'packs') {
            acTitle.textContent = 'Eaglercraft Resource Packs';
            acLead.textContent  = 'Click a pack to see what it does and download it.';
            renderPackGrid();
        } else if (acView === 'eaglercraft') {
            acTitle.textContent = 'Eaglercraft';
            acLead.textContent  = 'Skins and resource packs for Eaglercraft.';
            renderEaglercraftGrid();
        } else {
            acTitle.textContent = 'Additional Content';
            acLead.textContent  = 'Extra add-ons for your games.';
            renderSectionGrid();
        }
    }

    /* One reusable section-style tile. */
    function makeSectionCard({ tag, name, text, img, glyph, onGo }) {
        const sec = document.createElement('div');
        sec.className = 'card ac-section-card';
        sec.tabIndex = 0;
        sec.innerHTML = `
            <div class="card-art">
                <span class="cat-tag extra">${escapeHtml(tag)}</span>
                <img src="${img}" alt="${escapeHtml(name)}"
                     onerror="this.remove();this.parentNode.querySelector('.art-fallback').style.display='';">
                <div class="art-fallback art-glyph" style="display:none">${glyph}</div>
            </div>
            <div class="card-body">
                <div class="card-name">${escapeHtml(name)}</div>
                <div class="card-text">${escapeHtml(text)}</div>
            </div>`;
        sec.addEventListener('click', onGo);
        sec.addEventListener('keydown', (e) => { if (e.key === 'Enter') onGo(); });
        return sec;
    }

    function renderSectionGrid() {
        acBody.className = 'ac-body ac-sections';
        acBody.innerHTML = '';
        acBody.appendChild(makeSectionCard({
            tag:   'Eaglercraft',
            name:  'Eaglercraft',
            text:  'Skins and resource packs for Eaglercraft.',
            img:   NEBULAR_CONFIG.eaglercraftIcon || 'Assets/Images/Eaglercraft.png',
            glyph: '⛏',
            onGo:  () => { acView = 'eaglercraft'; renderAC(); },
        }));
    }

    function renderEaglercraftGrid() {
        acBody.className = 'ac-body ac-sections';
        acBody.innerHTML = '';
        acBody.appendChild(makeSectionCard({
            tag:   'Skins',
            name:  'Skins',
            text:  'Browse and download player skins for Eaglercraft / Minecraft.',
            img:   'Assets/Images/Hanger.png',
            glyph: '🧍',
            onGo:  () => { acView = 'skins'; renderAC(); },
        }));
        acBody.appendChild(makeSectionCard({
            tag:   'Resource Packs',
            name:  'Resource Packs',
            text:  'Retexture and tweak the look of Eaglercraft.',
            img:   NEBULAR_CONFIG.resourcepacksIcon || 'Assets/Images/EaglercraftResourcepacks.png',
            glyph: '🎨',
            onGo:  () => { acView = 'packs'; renderAC(); },
        }));
    }

    /* ── Resource pack grid (preview = pack.png inside each zip) + search ────── */
    const packCache = new Map();   // file -> { blob, previewUrl }
    let packQuery = '';

    function sortedPacks() {
        const packs = (NEBULAR_CONFIG.resourcePacks || []).slice();
        // ModernTextures (top:true) always first, rest keep their order.
        return packs.sort((a, b) => (b.top ? 1 : 0) - (a.top ? 1 : 0));
    }

    async function loadPackZip(pack) {
        if (packCache.has(pack.file)) return packCache.get(pack.file);
        const url  = (NEBULAR_CONFIG.resourcepacksPath || '') + pack.file;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('Could not fetch ' + pack.file);
        const blob = await resp.blob();
        const zip  = await JSZip.loadAsync(blob);
        const entry = zip.file('pack.png') || (zip.file(/(^|\/)pack\.png$/i)[0]);
        let previewUrl = null;
        if (entry) previewUrl = URL.createObjectURL(await entry.async('blob'));
        const out = { blob, previewUrl };
        packCache.set(pack.file, out);
        return out;
    }

    function renderPackGrid() {
        acBody.className = 'ac-body ac-packs';
        acBody.innerHTML = `
            <div class="pack-search">
                <span class="search-ico">⌕</span>
                <input type="text" id="pack-search-input" placeholder="Search resource packs…" autocomplete="off">
            </div>
            <div class="ac-packs-grid" id="ac-packs-grid"></div>
            <p class="empty-msg" id="pack-empty" style="display:none;">No packs match your search.</p>`;

        const gridEl  = acBody.querySelector('#ac-packs-grid');
        const emptyEl = acBody.querySelector('#pack-empty');
        const input   = acBody.querySelector('#pack-search-input');
        input.value = packQuery;

        const draw = () => {
            gridEl.innerHTML = '';
            const q = packQuery.trim().toLowerCase();
            let shown = 0;
            sortedPacks().forEach(pack => {
                if (q && !(pack.name.toLowerCase().includes(q) ||
                           (pack.description || '').toLowerCase().includes(q))) return;
                shown++;
                const card = document.createElement('div');
                card.className = 'card pack-card-tile';
                card.tabIndex = 0;
                card.innerHTML = `
                    <div class="card-art pack-tile-art">
                        <div class="art-skeleton"></div>
                    </div>
                    <div class="card-body">
                        <div class="card-name">${escapeHtml(pack.name)}</div>
                        <div class="card-text">${escapeHtml(pack.description || '')}</div>
                    </div>`;
                const art = card.querySelector('.pack-tile-art');
                loadPackZip(pack)
                    .then(({ previewUrl }) => previewUrl ? setArtImage(art, previewUrl) : setArtFallback(art))
                    .catch(() => setArtFallback(art));
                const open = () => openPack(pack);
                card.addEventListener('click', open);
                card.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
                gridEl.appendChild(card);
            });
            emptyEl.style.display = shown ? 'none' : 'block';
        };

        input.addEventListener('input', () => { packQuery = input.value; draw(); });
        draw();
    }

    function prettySkinName(fname) {
        return fname.replace(/\.png$/i, '')
                    .replace(/[_-]+/g, ' ')
                    .replace(/([a-z])([A-Z])/g, '$1 $2')
                    .replace(/\b\w/g, c => c.toUpperCase())
                    .trim();
    }

    let skinQuery = '';

    function renderSkinGrid() {
        acBody.className = 'ac-body ac-skins';
        const skins = NEBULAR_CONFIG.skins || [];
        const base  = NEBULAR_CONFIG.skinsPath || '';
        if (!skins.length) {
            acBody.innerHTML = '<p class="empty-msg">No skins available yet.</p>';
            return;
        }
        acBody.innerHTML = `
            <div class="pack-search">
                <span class="search-ico">⌕</span>
                <input type="text" id="skin-search-input" placeholder="Search skins…" autocomplete="off">
            </div>
            <div class="ac-skins-grid" id="ac-skins-grid"></div>
            <p class="empty-msg" id="skin-empty" style="display:none;">No skins match your search.</p>`;

        const gridEl  = acBody.querySelector('#ac-skins-grid');
        const emptyEl = acBody.querySelector('#skin-empty');
        const input   = acBody.querySelector('#skin-search-input');
        input.value = skinQuery;

        const draw = () => {
            gridEl.innerHTML = '';
            const q = skinQuery.trim().toLowerCase();
            let shown = 0;
            skins.forEach(fname => {
                const name = prettySkinName(fname);
                if (q && !name.toLowerCase().includes(q)) return;
                shown++;
                const url = base + fname;
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
                gridEl.appendChild(card);
            });
            emptyEl.style.display = shown ? 'none' : 'block';
        };

        input.addEventListener('input', () => { skinQuery = input.value; draw(); });
        draw();
    }

    function acBack() {
        if (acView === 'skins' || acView === 'packs') { acView = 'eaglercraft'; renderAC(); }
        else if (acView === 'eaglercraft') { acView = 'sections'; renderAC(); }
        else closeAdditional();
    }
    acBackBtn.addEventListener('click', acBack);

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

    let currentSkin = null;   // { url, fname }

    function openSkin(url, name) {
        skinNameEl.textContent = name;
        currentSkin = { url, fname: name.replace(/\s+/g, '') + '.png' };
        skinDlEl.disabled = false;
        skinDlEl.textContent = '⤓ Download Skin';
        loadSkinImage(url).then(({ img, model }) => {
            skinModelEl.textContent = model === 'slim' ? 'Slim' : 'Wide';
            skinHintEl.textContent  = model === 'slim'
                ? 'This avatar uses Slim so select the Alex skin on the right.'
                : 'This avatar uses Wide so select the Steve skin on the left.';
            drawSkin(skinFront, img, 'front', model);
            drawSkin(skinBack,  img, 'back',  model);
        }).catch(() => { skinModelEl.textContent = '—'; });
        skinModal.style.display = 'flex';
    }
    function closeSkin() { skinModal.style.display = 'none'; }
    document.getElementById('skin-close').addEventListener('click', closeSkin);
    skinModal.addEventListener('click', (e) => { if (e.target === skinModal) closeSkin(); });

    skinDlEl.addEventListener('click', async () => {
        if (!currentSkin) return;
        const { url, fname } = currentSkin;
        skinDlEl.disabled = true;
        skinDlEl.textContent = 'Downloading…';
        try {
            const resp = await fetch(url);
            if (!resp.ok) throw new Error('fetch failed');
            saveBlob(await resp.blob(), fname);            // reliable blob download
            skinDlEl.textContent = '✓ Downloaded';
            playComplete();
        } catch (err) {
            // Fallback (e.g. opened via file://): plain anchor download.
            const a = document.createElement('a');
            a.href = url; a.download = fname;
            document.body.appendChild(a); a.click(); a.remove();
            skinDlEl.textContent = '⤓ Download Skin';
        }
        setTimeout(() => { skinDlEl.disabled = false; skinDlEl.textContent = '⤓ Download Skin'; }, 1400);
    });

    /* ── Resource pack detail modal ─────────────────────────────────────────── */
    const packModal    = document.getElementById('pack-modal');
    const packPreview  = document.getElementById('pack-preview');
    const packNameEl   = document.getElementById('pack-name');
    const packDescEl   = document.getElementById('pack-desc');
    const packCreditEl = document.getElementById('pack-credits-link');
    const packDlEl     = document.getElementById('pack-download');
    let currentPack = null;

    function openPack(pack) {
        currentPack = pack;
        packNameEl.textContent  = pack.name;
        packDescEl.textContent  = pack.description || '';
        packCreditEl.textContent = pack.credits || '';
        packCreditEl.href        = pack.credits || '#';
        packDlEl.disabled = false;
        packDlEl.textContent = '⤓ Download Pack';
        packPreview.innerHTML = '';
        loadPackZip(pack).then(({ previewUrl }) => {
            if (previewUrl) {
                const img = new Image();
                img.alt = ''; img.src = previewUrl;
                packPreview.appendChild(img);
            } else {
                packPreview.innerHTML = '<div class="art-fallback art-glyph">🎨</div>';
            }
        }).catch(() => { packPreview.innerHTML = '<div class="art-fallback art-glyph">🎨</div>'; });
        packModal.style.display = 'flex';
    }
    function closePack() { packModal.style.display = 'none'; }
    document.getElementById('pack-close').addEventListener('click', closePack);
    packModal.addEventListener('click', (e) => { if (e.target === packModal) closePack(); });

    packDlEl.addEventListener('click', async () => {
        if (!currentPack) return;
        const pack = currentPack;
        packDlEl.disabled = true;
        packDlEl.textContent = 'Downloading…';
        try {
            const { blob } = await loadPackZip(pack);      // cached → instant
            saveBlob(blob, pack.file);
            packDlEl.textContent = '✓ Downloaded';
            playComplete();
        } catch (err) {
            playError();
            packDlEl.textContent = '⤓ Retry download';
        }
        setTimeout(() => { packDlEl.disabled = false; packDlEl.textContent = '⤓ Download Pack'; }, 1400);
    });

    /* ── Version picker modal (Eaglercraft) ─────────────────────────────────── */
    const versionModal = document.getElementById('version-modal');
    const versionList  = document.getElementById('version-list');
    const versionTitle = document.getElementById('version-title');

    function openVersionPicker(item) {
        versionTitle.textContent = 'Choose your ' + item.name + ' version';
        versionList.innerHTML = '';
        (item.versions || []).forEach(v => {
            const row = document.createElement('button');
            row.className = 'version-option';
            row.innerHTML = `
                <span class="version-label">${escapeHtml(v.label)}</span>
                <span class="version-blurb">${escapeHtml(v.blurb || '')}</span>
                <span class="version-go">⤓ Download</span>`;
            row.addEventListener('click', () => {
                closeVersion();
                downloadItemFile(item, v.file);
            });
            versionList.appendChild(row);
        });
        versionModal.style.display = 'flex';
    }
    function closeVersion() { versionModal.style.display = 'none'; }
    document.getElementById('version-close').addEventListener('click', closeVersion);
    versionModal.addEventListener('click', (e) => { if (e.target === versionModal) closeVersion(); });

    /* Download a specific zip (by Base64 file field), then run the tutorial. */
    async function downloadItemFile(item, fileB64) {
        const fname = atob(fileB64);
        const url   = NEBULAR_CONFIG.gamesPath + fname;
        dEls.dl.disabled = true;
        dEls.dlLabel.textContent = 'Preparing…';
        dEls.prog.style.display = 'block';
        dEls.bar.style.width = '15%';
        try {
            const resp = await fetch(url);
            if (!resp.ok) throw new Error('fetch failed');
            const blob = await resp.blob();
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
    }

    /* ── Escape closes whatever is open ─────────────────────────────────── */
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (storeOverlay.style.display === 'block') return closeStore();
        if (skinModal.style.display === 'flex')     return closeSkin();
        if (packModal.style.display === 'flex')     return closePack();
        if (versionModal.style.display === 'flex')  return closeVersion();
        if (acOverlay.style.display === 'block')    return acBack();
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
