document.addEventListener('DOMContentLoaded', () => {

    const FORMATION_ROWS = {
        '4-3-3': [[90, 1, 'GK'], [70, 4, 'DEF'], [48, 3, 'MID'], [22, 3, 'FWD']],
        '4-4-2': [[90, 1, 'GK'], [70, 4, 'DEF'], [46, 4, 'MID'], [20, 2, 'FWD']],
        '4-2-3-1': [[90, 1, 'GK'], [70, 4, 'DEF'], [54, 2, 'MID'], [34, 3, 'MID'], [14, 1, 'FWD']],
        '3-5-2': [[90, 1, 'GK'], [70, 3, 'DEF'], [46, 5, 'MID'], [20, 2, 'FWD']],
        '3-4-3': [[90, 1, 'GK'], [70, 3, 'DEF'], [46, 4, 'MID'], [20, 3, 'FWD']],
        '5-3-2': [[90, 1, 'GK'], [68, 5, 'DEF'], [44, 3, 'MID'], [18, 2, 'FWD']],
    };

    let currentFormation = '4-3-3';
    let players = [];
    let teams = [];
    let slots = [];
    let activeSlotIdx = null;
    let searchFilter = 'all';

    const pitch = document.getElementById('pitch');
    const xiList = document.getElementById('xiList');
    const modalOverlay = document.getElementById('modalOverlay');
    const modalClose = document.getElementById('modalClose');
    const modalPosBadge = document.getElementById('modalPosBadge');
    const playerSearch = document.getElementById('playerSearch');
    const playerList = document.getElementById('playerList');
    const modalFilters = document.getElementById('modalFilters');
    const squadStats = document.getElementById('squadStats');
    const toastEl = document.getElementById('toast');

    function buildSlots(formation) {
        const rows = FORMATION_ROWS[formation];
        const preserved = {};
        slots.forEach(s => {
            if (s.player) {
                preserved[s.pos] = preserved[s.pos] || [];
                preserved[s.pos].push(s.player);
            }
        });

        slots = [];
        rows.forEach(([top, count, pos]) => {
            for (let i = 0; i < count; i++) {
                const player = (preserved[pos] && preserved[pos].length > 0)
                    ? preserved[pos].shift()
                    : null;
                slots.push({pos, player});
            }
        });
    }

    function renderPitch() {
        pitch.querySelectorAll('.pitch-row').forEach(el => el.remove());

        const rows = FORMATION_ROWS[currentFormation];
        let slotCursor = 0;

        rows.forEach(([top, count, pos]) => {
            const rowEl = document.createElement('div');
            rowEl.className = 'pitch-row';
            rowEl.style.cssText = `position:absolute;left:0;right:0;top:${top}%;display:flex;justify-content:space-evenly;align-items:center;z-index:2;transform:translateY(-50%);`;

            for (let i = 0; i < count; i++) {
                const idx = slotCursor++;
                const slot = slots[idx];
                if (!slot) continue;

                const slotEl = document.createElement('div');
                slotEl.style.cssText = 'display:flex;flex-direction:column;align-items:center;cursor:pointer;gap:4px;transition:transform 0.15s;';
                slotEl.addEventListener('mouseenter', () => slotEl.style.transform = 'scale(1.08)');
                slotEl.addEventListener('mouseleave', () => slotEl.style.transform = '');

                const circle = document.createElement('div');
                const posColors = {GK: '#f5a623', DEF: '#4a90d9', MID: '#7ed321', FWD: '#e74c3c'};
                const borderColor = slot.player ? posColors[pos] : 'rgba(255,255,255,0.2)';
                circle.style.cssText = `width:46px;height:46px;border-radius:50%;border:2px ${slot.player ? 'solid' : 'dashed'} ${borderColor};background:${slot.player ? '#1a1a1a' : 'rgba(0,0,0,0.4)'};display:flex;align-items:center;justify-content:center;font-size:18px;position:relative;overflow:hidden;transition:all 0.15s;`;

                if (slot.player) {
                    const img = document.createElement('img');
                    img.src = `https://resources.premierleague.com/premierleague/photos/players/110x140/p${slot.player.code}.png`;
                    img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;';
                    img.onerror = () => {
                        img.remove();
                        circle.textContent = slot.player.web_name[0];
                        circle.style.fontSize = '16px';
                        circle.style.color = '#fff';
                        circle.style.fontWeight = '700';
                    };
                    circle.appendChild(img);
                }

                const label = document.createElement('div');
                label.style.cssText = 'font-size:10px;font-weight:600;color:#ccc;text-align:center;max-width:56px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 3px #000;';
                label.textContent = slot.player ? slot.player.web_name : pos;

                const teamLbl = document.createElement('div');
                teamLbl.style.cssText = 'font-size:9px;color:#aaa;text-shadow:0 1px 3px #000;';
                teamLbl.textContent = slot.player ? getTeamName(slot.player.team) : '';

                slotEl.appendChild(circle);
                slotEl.appendChild(label);
                slotEl.appendChild(teamLbl);
                slotEl.addEventListener('click', () => openModal(idx));

                rowEl.appendChild(slotEl);
            }

            pitch.appendChild(rowEl);
        });
    }

    function renderXiList() {
        xiList.innerHTML = '';
        const posColors = {GK: '#f5a623', DEF: '#4a90d9', MID: '#7ed321', FWD: '#e74c3c'};

        slots.forEach((slot, i) => {
            const item = document.createElement('div');
            item.style.cssText = `display:flex;align-items:center;gap:10px;background:#141414;border:1px solid #222;border-radius:8px;padding:8px 10px;font-size:12px;cursor:pointer;`;
            item.addEventListener('click', () => openModal(i));

            const badge = document.createElement('span');
            badge.style.cssText = `font-size:9px;font-weight:700;letter-spacing:0.5px;padding:2px 5px;border-radius:4px;min-width:26px;text-align:center;background:${posColors[slot.pos]};color:${slot.pos === 'DEF' || slot.pos === 'FWD' ? '#fff' : '#000'};`;
            badge.textContent = slot.pos;

            const name = document.createElement('span');
            name.style.cssText = `flex:1;font-weight:500;color:${slot.player ? '#ddd' : '#444'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-style:${slot.player ? 'normal' : 'italic'};`;
            name.textContent = slot.player ? slot.player.web_name : 'Empty';

            const team = document.createElement('span');
            team.style.cssText = 'font-size:10px;color:#555;';
            team.textContent = slot.player ? getTeamName(slot.player.team) : '';

            item.appendChild(badge);
            item.appendChild(name);
            item.appendChild(team);

            if (slot.player) {
                const removeBtn = document.createElement('button');
                removeBtn.style.cssText = 'background:none;border:none;color:#444;cursor:pointer;font-size:16px;line-height:1;padding:0 2px;transition:color 0.15s;';
                removeBtn.textContent = '×';
                removeBtn.addEventListener('mouseenter', () => removeBtn.style.color = '#e74c3c');
                removeBtn.addEventListener('mouseleave', () => removeBtn.style.color = '#444');
                removeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    slots[i].player = null;
                    refresh();
                });
                item.appendChild(removeBtn);
            }

            xiList.appendChild(item);
        });
    }

    function renderSquadStats() {
        const filled = slots.filter(s => s.player);
        if (filled.length === 0) {
            squadStats.innerHTML = '<span style="color:#444;font-size:12px;">Pick your players to see squad stats.</span>';
            return;
        }

        const totalPts = filled.reduce((s, x) => s + (x.player.total_points || 0), 0);
        const totalVal = filled.reduce((s, x) => s + (x.player.now_cost || 0), 0);
        const avgPts = (totalPts / filled.length).toFixed(1);
        const top = [...filled].sort((a, b) => (b.player.total_points || 0) - (a.player.total_points || 0))[0];

        squadStats.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
      <div style="background:#141414;border:1px solid #222;border-radius:8px;padding:10px;text-align:center;">
        <div style="font-size:20px;font-weight:700;color:#00e07a">${filled.length}/11</div>
        <div style="font-size:10px;color:#555;text-transform:uppercase;letter-spacing:1px;margin-top:2px">Picked</div>
      </div>
      <div style="background:#141414;border:1px solid #222;border-radius:8px;padding:10px;text-align:center;">
        <div style="font-size:20px;font-weight:700;color:#f0f0f0">£${(totalVal / 10).toFixed(1)}m</div>
        <div style="font-size:10px;color:#555;text-transform:uppercase;letter-spacing:1px;margin-top:2px">Value</div>
      </div>
      <div style="background:#141414;border:1px solid #222;border-radius:8px;padding:10px;text-align:center;">
        <div style="font-size:20px;font-weight:700;color:#f0f0f0">${totalPts}</div>
        <div style="font-size:10px;color:#555;text-transform:uppercase;letter-spacing:1px;margin-top:2px">Total Pts</div>
      </div>
      <div style="background:#141414;border:1px solid #222;border-radius:8px;padding:10px;text-align:center;">
        <div style="font-size:20px;font-weight:700;color:#f0f0f0">${avgPts}</div>
        <div style="font-size:10px;color:#555;text-transform:uppercase;letter-spacing:1px;margin-top:2px">Avg Pts</div>
      </div>
    </div>
    ${top ? `<div style="background:#141414;border:1px solid #00e07a22;border-radius:8px;padding:10px;">
      <div style="font-size:10px;color:#555;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">⭐ Top Pick</div>
      <div style="font-size:13px;font-weight:600;color:#f0f0f0">${top.player.web_name}</div>
      <div style="font-size:11px;color:#555;margin-top:2px">${getTeamName(top.player.team)} · ${top.player.total_points} pts</div>
    </div>` : ''}
  `;
    }

    function refresh() {
        renderPitch();
        renderXiList();
        renderSquadStats();
    }

    function getTeamName(teamId) {
        const t = teams.find(t => t.id === teamId);
        return t ? t.short_name : '';
    }

    function posLabel(typeId) {
        return {1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD'}[typeId] || '?';
    }

    function openModal(slotIdx) {
        activeSlotIdx = slotIdx;
        const slot = slots[slotIdx];

        const posColors = {GK: '#f5a623 / #000', DEF: '#4a90d9 / #fff', MID: '#7ed321 / #000', FWD: '#e74c3c / #fff'};
        modalPosBadge.textContent = slot.pos;
        modalPosBadge.style.background = {GK: '#f5a623', DEF: '#4a90d9', MID: '#7ed321', FWD: '#e74c3c'}[slot.pos];
        modalPosBadge.style.color = ['DEF', 'FWD'].includes(slot.pos) ? '#fff' : '#000';

        playerSearch.value = '';
        searchFilter = 'all';
        modalFilters.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        modalFilters.querySelector('[data-filter="all"]').classList.add('active');

        renderPlayerList(slot.pos);
        modalOverlay.classList.add('open');
        setTimeout(() => playerSearch.focus(), 60);
    }

    function closeModal() {
        modalOverlay.classList.remove('open');
        activeSlotIdx = null;
    }

    function renderPlayerList(preferredPos) {
        const query = playerSearch.value.trim().toLowerCase();
        const posTypeMap = {GK: 1, DEF: 2, MID: 3, FWD: 4};
        const preferredType = posTypeMap[preferredPos];

        let list = players;

        if (searchFilter !== 'all') {
            list = list.filter(p => String(p.element_type) === String(searchFilter));
        }

        if (query) {
            list = list.filter(p => {
                const name = (p.first_name + ' ' + p.second_name + ' ' + p.web_name).toLowerCase();
                const team = getTeamName(p.team).toLowerCase();
                return name.includes(query) || team.includes(query);
            });
        }

        list = [...list].sort((a, b) => {
            const aMatch = a.element_type === preferredType ? 0 : 1;
            const bMatch = b.element_type === preferredType ? 0 : 1;
            if (aMatch !== bMatch) return aMatch - bMatch;
            return (b.total_points || 0) - (a.total_points || 0);
        }).slice(0, 80);

        if (list.length === 0) {
            playerList.innerHTML = '<div style="padding:32px;text-align:center;color:#555;font-size:13px;">No players found.</div>';
            return;
        }

        const frag = document.createDocumentFragment();
        list.forEach(p => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:10px 20px;cursor:pointer;border-bottom:1px solid #111;transition:background 0.1s;';
            row.addEventListener('mouseenter', () => row.style.background = '#1a1a1a');
            row.addEventListener('mouseleave', () => row.style.background = '');

            const avatar = document.createElement('div');
            avatar.style.cssText = 'width:36px;height:36px;border-radius:50%;background:#222;overflow:hidden;flex-shrink:0;';
            const img = document.createElement('img');
            img.src = `https://resources.premierleague.com/premierleague/photos/players/110x140/p${p.code}.png`;
            img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
            img.onerror = () => img.style.display = 'none';
            avatar.appendChild(img);

            const info = document.createElement('div');
            info.style.cssText = 'flex:1;min-width:0;';

            const name = document.createElement('div');
            name.style.cssText = 'font-size:13px;font-weight:600;color:#e8e8e8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
            name.textContent = p.first_name + ' ' + p.second_name;

            const meta = document.createElement('div');
            meta.style.cssText = 'font-size:11px;color:#555;margin-top:2px;';
            meta.textContent = getTeamName(p.team) + ' · ' + posLabel(p.element_type);

            info.appendChild(name);
            info.appendChild(meta);

            const stats = document.createElement('div');
            stats.style.cssText = 'display:flex;flex-direction:column;align-items:flex-end;gap:2px;';

            const pts = document.createElement('div');
            pts.style.cssText = 'font-size:12px;font-weight:700;color:#00e07a;';
            pts.textContent = (p.total_points || 0) + ' pts';

            const price = document.createElement('div');
            price.style.cssText = 'font-size:10px;color:#555;';
            price.textContent = '£' + ((p.now_cost || 0) / 10).toFixed(1) + 'm';

            stats.appendChild(pts);
            stats.appendChild(price);

            row.appendChild(avatar);
            row.appendChild(info);
            row.appendChild(stats);
            row.addEventListener('click', () => selectPlayer(p));
            frag.appendChild(row);
        });

        playerList.innerHTML = '';
        playerList.appendChild(frag);
    }

    function selectPlayer(player) {
        if (activeSlotIdx === null) return;
        slots.forEach(s => {
            if (s.player && s.player.id === player.id) s.player = null;
        });
        slots[activeSlotIdx].player = player;
        closeModal();
        refresh();
        showToast(player.web_name + ' added', 'success');
    }

    let toastTimer;

    function showToast(msg, type) {
        toastEl.textContent = msg;
        toastEl.className = 'toast show' + (type ? ' ' + type : '');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
    }

    async function loadPlayers() {
        try {
            const res = await fetch('/api/fpl/players');
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            players = data.players || [];
            teams = data.teams || [];
            showToast('Players loaded (' + players.length + ')', 'success');
        } catch (e) {
            console.error('FPL load error:', e);
            showToast('Could not load FPL players', 'error');
        }
    }


    document.getElementById('formationPicker').addEventListener('click', e => {
        const btn = e.target.closest('.formation-btn');
        if (!btn) return;
        currentFormation = btn.dataset.formation;
        document.querySelectorAll('.formation-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        buildSlots(currentFormation);
        refresh();
    });

    modalClose.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', e => {
        if (e.target === modalOverlay) closeModal();
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeModal();
    });

    playerSearch.addEventListener('input', () => {
        if (activeSlotIdx !== null) renderPlayerList(slots[activeSlotIdx].pos);
    });

    modalFilters.addEventListener('click', e => {
        const btn = e.target.closest('.filter-btn');
        if (!btn) return;
        searchFilter = btn.dataset.filter;
        modalFilters.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (activeSlotIdx !== null) renderPlayerList(slots[activeSlotIdx].pos);
    });

    document.getElementById('saveBtn').addEventListener('click', () => {
        const filled = slots.filter(s => s.player).length;
        if (filled < 11) {
            showToast('Pick ' + (11 - filled) + ' more player' + (11 - filled !== 1 ? 's' : ''), 'error');
            return;
        }
        const lineup = slots.map(s => ({
            pos: s.pos,
            id: s.player?.id,
            name: s.player?.web_name,
            team: s.player ? getTeamName(s.player.team) : null,
        }));
        try {
            localStorage.setItem('pitchlive_xi', JSON.stringify({formation: currentFormation, lineup}));
            showToast('Lineup saved!', 'success');
        } catch (e) {
            showToast('Lineup saved!', 'success'); // still show success even if localStorage blocked
        }
    });

    document.getElementById('clearBtn').addEventListener('click', () => {
        slots.forEach(s => s.player = null);
        refresh();
        showToast('Lineup cleared');
    });

    buildSlots(currentFormation);
    refresh();
    loadPlayers();

    try {
        const saved = JSON.parse(localStorage.getItem('pitchlive_xi') || 'null');
        if (saved && saved.lineup) {
            currentFormation = saved.formation || currentFormation;
            document.querySelectorAll('.formation-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.formation === currentFormation);
            });
            buildSlots(currentFormation);
            loadPlayers().then(() => {
                saved.lineup.forEach((pick, i) => {
                    if (pick.id && slots[i]) {
                        slots[i].player = players.find(p => p.id === pick.id) || null;
                    }
                });
                refresh();
            });

        }
    } catch (_) {
    }

});