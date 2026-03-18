let adminPassword = localStorage.getItem('adminPwd') || null;
let tournamentData = null;

document.addEventListener('DOMContentLoaded', () => {
    fetchData();
    setInterval(() => {
        if (!adminPassword && tournamentData && tournamentData.isSetup) fetchData();
    }, 15000);
});

function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById(`tab-${tabId}`).classList.add('active');
    document.getElementById(`content-${tabId}`).classList.add('active');
}

function login() {
    if (adminPassword) {
        adminPassword = null; localStorage.removeItem('adminPwd'); fetchData();
    } else {
        const pwd = prompt("Mot de passe Admin :");
        if (pwd) { adminPassword = pwd; localStorage.setItem('adminPwd', pwd); fetchData(); }
    }
}

function updateHeader() {
    const badge = document.getElementById('admin-status');
    const btnLogin = document.getElementById('btn-login');
    const btnReset = document.getElementById('btn-reset');

    if (adminPassword) {
        badge.textContent = "Mode ADMIN"; badge.className = "status-badge admin";
        btnLogin.textContent = "Quitter"; btnReset.style.display = 'block';
    } else {
        badge.textContent = "Spectateur (Live)"; badge.className = "status-badge spectateur";
        btnLogin.textContent = "Admin"; btnReset.style.display = 'none';
    }
}

async function apiCall(endpoint, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (adminPassword) headers['x-admin-password'] = adminPassword;
    try {
        const res = await fetch(endpoint, { method, headers, body: body ? JSON.stringify(body) : null });
        if (res.status === 403) {
            alert("Mot de passe invalide !"); adminPassword = null; localStorage.removeItem('adminPwd'); updateHeader(); return null;
        }
        return await res.json();
    } catch (e) { console.error("Erreur réseau", e); return null; }
}

async function fetchData() {
    updateHeader();
    const data = await apiCall('/api/data');
    if (data) { tournamentData = data; renderPoules(); renderFinals(); }
}

function calculateStandings(poolId) {
    let teams = tournamentData.pools[poolId];
    let matches = tournamentData.matches[poolId];
    let stats = {};
    teams.forEach(t => stats[t] = { name: t, J: 0, V: 0, N: 0, D: 0, BP: 0, BC: 0, Pts: 0 });

    matches.forEach(m => {
        if (m.score1 !== null && m.score2 !== null) {
            let s1 = m.score1, s2 = m.score2;
            stats[m.team1].J++; stats[m.team2].J++;
            stats[m.team1].BP += s1; stats[m.team2].BP += s2;
            stats[m.team1].BC += s2; stats[m.team2].BC += s1;
            
            if (s1 > s2) { stats[m.team1].V++; stats[m.team1].Pts += 3; stats[m.team2].D++; }
            else if (s1 < s2) { stats[m.team2].V++; stats[m.team2].Pts += 3; stats[m.team1].D++; }
            else { stats[m.team1].N++; stats[m.team1].Pts += 1; stats[m.team2].N++; stats[m.team2].Pts += 1; }
        }
    });

    let standings = Object.values(stats).map(s => ({ ...s, Diff: s.BP - s.BC }));
    standings.sort((a, b) => {
        if (b.Pts !== a.Pts) return b.Pts - a.Pts;
        if (b.Diff !== a.Diff) return b.Diff - a.Diff;
        return b.BP - a.BP;
    });
    return standings;
}

function renderPoules() {
    const app = document.getElementById('content-poules');
    if (!tournamentData.isSetup) {
        if (!adminPassword) {
            app.innerHTML = `<div class="card" style="text-align:center; margin-top:20px;"><h2>⏳ En attente...</h2><p>Le tournoi n'a pas commencé.</p></div>`; return;
        }
        let setupHtml = `<div class="card"><h2>⚙️ Configuration des Poules</h2>
            <div style="display: flex; gap: 10px; margin-bottom: 25px; flex-wrap: wrap;">
                <div style="flex: 1; min-width: 100px;"><label>Début</label><input type="time" id="setup-start" value="09:00" style="width: 100%; padding: 10px;"></div>
                <div style="flex: 1; min-width: 100px;"><label>Match (min)</label><input type="number" id="setup-duration" value="20" style="width: 100%; padding: 10px;"></div>
                <div style="flex: 1; min-width: 100px;"><label>Pause (min)</label><input type="number" id="setup-break" value="5" style="width: 100%; padding: 10px;"></div>
            </div>`;
        const poolsList = ['01', '02', '03', '04'];
        let tc = 1;
        poolsList.forEach(p => {
            setupHtml += `<div class="setup-group" style="background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 20px;"><label><b>Poule ${p}</b></label>`;
            for(let i=0; i<5; i++) {
                setupHtml += `<div style="display:flex; align-items:center; margin-bottom:8px;"><span style="width:25px;">${i+1}.</span><input type="text" id="setup-${p}-${i}" value="Équipe ${tc++}" style="flex:1; padding:10px;"></div>`;
            }
            setupHtml += `</div>`; 
        });
        setupHtml += `<button class="btn btn-primary" onclick="submitSetup()">Lancer les Poules !</button></div>`;
        app.innerHTML = setupHtml; return;
    }

    let html = `<div class="pools-grid">`;
    for (let poolId in tournamentData.pools) {
        let standings = calculateStandings(poolId);
        html += `<div class="card"><h2>Poule ${poolId}</h2><div class="table-wrapper"><table>
            <tr><th>#</th><th class="team-name">Équipe</th><th>Pts</th><th>J</th><th>V</th><th>N</th><th>D</th><th>BP</th><th>BC</th><th>Diff</th></tr>
            ${standings.map((s, idx) => `
                <tr class="${idx < 2 ? 'qualif-cl' : (idx < 4 ? 'qualif-el' : 'qualif-cdl')}">
                    <td><b>${idx + 1}</b></td>
                    <td class="team-name">${s.name}</td>
                    <td><b style="color:var(--primary); font-size:1.1rem;">${s.Pts}</b></td>
                    <td>${s.J}</td><td>${s.V}</td><td>${s.N}</td><td>${s.D}</td>
                    <td>${s.BP}</td><td>${s.BC}</td>
                    <td><b>${s.Diff > 0 ? '+'+s.Diff : s.Diff}</b></td>
                </tr>
            `).join('')}
            </table></div><div class="matches-list">
            ${tournamentData.matches[poolId].map(m => `
                <div class="match-card">
                    <div class="match-header"><span>⌚ ${m.time}</span><span class="match-ref" style="color: #e67e22; font-weight: 600;">Arbitre: ${m.referee}</span></div>
                    <div class="match-body"><div class="match-team">${m.team1}</div>
                        ${adminPassword ? `<div class="score-inputs"><input type="number" pattern="[0-9]*" id="s1-${m.id}" value="${m.score1 !== null ? m.score1 : ''}" onblur="saveScore('${poolId}', '${m.id}')"><span>-</span><input type="number" pattern="[0-9]*" id="s2-${m.id}" value="${m.score2 !== null ? m.score2 : ''}" onblur="saveScore('${poolId}', '${m.id}')"></div>` : `<div class="score-display">${m.score1 !== null ? m.score1 : '-'} : ${m.score2 !== null ? m.score2 : '-'}</div>`}
                        <div class="match-team">${m.team2}</div>
                    </div>
                </div>`).join('')}
            </div></div>`;
    }
    app.innerHTML = html + `</div>`;
}

function renderFinals() {
    const app = document.getElementById('content-finales');
    if (!tournamentData.isSetup) { app.innerHTML = `<p style="text-align:center; padding: 20px;">Jouez d'abord les poules !</p>`; return; }
    if (!tournamentData.isFinalsSetup) {
        if (!adminPassword) { app.innerHTML = `<div class="card" style="text-align:center;"><h2>⏳ En attente...</h2><p>L'admin doit générer les tableaux finaux.</p></div>`; return; }
        let setupHtml = `<div class="card"><h2>⚔️ Générer les Phases Finales</h2><p>Assurez-vous que tous les matchs de poules sont terminés.</p>
            <div style="display: flex; gap: 10px; margin: 25px 0; flex-wrap: wrap;">
                <div style="flex: 1;"><label>Reprise</label><input type="time" id="f-start" value="14:00" style="width: 100%; padding: 10px;"></div>
                <div style="flex: 1;"><label>Match (min)</label><input type="number" id="f-duration" value="20" style="width: 100%; padding: 10px;"></div>
                <div style="flex: 1;"><label>Pause (min)</label><input type="number" id="f-break" value="5" style="width: 100%; padding: 10px;"></div>
            </div>
            <button class="btn btn-primary" onclick="submitFinalsSetup()">Générer le Tableau Final !</button></div>`;
        app.innerHTML = setupHtml; return;
    }

    let html = '';
    const phases = ["🥇 Champions League (Places 1 à 8)", "🥈 League Europe (Places 9 à 16)", "🥉 Coupe de la Ligue (Places 17 à 20)"];
    phases.forEach(phaseName => {
        let matches = tournamentData.finalsMatches.filter(m => m.phase === phaseName);
        if(matches.length === 0) return;
        html += `<h2 class="phase-title">${phaseName}</h2><div class="pools-grid">`;
        matches.forEach(m => {
            let t1Style = m.team1.startsWith('Gagnant') || m.team1.startsWith('Perdant') ? 'color:#94a3b8; font-style:italic;' : '';
            let t2Style = m.team2.startsWith('Gagnant') || m.team2.startsWith('Perdant') ? 'color:#94a3b8; font-style:italic;' : '';
            html += `
            <div class="match-card" style="border-left: 5px solid var(--secondary);">
                <div class="match-header"><span>⌚ ${m.time}</span><span style="font-weight:bold; color:var(--primary)">${m.step}</span></div>
                <div class="match-body" style="margin-top:10px;">
                    <div class="match-team" style="${t1Style}">${m.team1}</div>
                    <div style="text-align:center;">
                        ${adminPassword ? `
                            <div class="score-inputs"><input type="number" pattern="[0-9]*" id="fs1-${m.id}" value="${m.score1 !== null ? m.score1 : ''}" onblur="saveFinalScore('${m.id}')"><span>-</span><input type="number" pattern="[0-9]*" id="fs2-${m.id}" value="${m.score2 !== null ? m.score2 : ''}" onblur="saveFinalScore('${m.id}')"></div>
                            <div class="tab-inputs">TAB: <input type="number" pattern="[0-9]*" id="ft1-${m.id}" value="${m.tab1 !== null ? m.tab1 : ''}" onblur="saveFinalScore('${m.id}')">-<input type="number" pattern="[0-9]*" id="ft2-${m.id}" value="${m.tab2 !== null ? m.tab2 : ''}" onblur="saveFinalScore('${m.id}')"></div>
                        ` : `<div class="score-display">${m.score1 !== null ? m.score1 : '-'} : ${m.score2 !== null ? m.score2 : '-'}</div>${m.tab1 !== null ? `<div class="tab-display">TAB (${m.tab1} - ${m.tab2})</div>` : ''}`}
                    </div>
                    <div class="match-team" style="${t2Style}">${m.team2}</div>
                </div>
            </div>`;
        });
        html += `</div>`;
    });
    app.innerHTML = html;
}

async function submitSetup() {
    let pools = {};
    for (let p of ['01', '02', '03', '04']) {
        let lines = [];
        for (let i = 0; i < 5; i++) { let t = document.getElementById(`setup-${p}-${i}`).value.trim(); if (t) lines.push(t); }
        if (lines.length !== 5) return alert(`⚠️ La poule ${p} doit avoir 5 équipes !`);
        pools[p] = lines;
    }
    await apiCall('/api/setup', 'POST', { pools, startTime: document.getElementById('setup-start').value || "09:00", matchDuration: parseInt(document.getElementById('setup-duration').value || 20), breakDuration: parseInt(document.getElementById('setup-break').value || 5) });
    fetchData();
}

async function saveScore(poolId, matchId) {
    let s1 = document.getElementById(`s1-${matchId}`).value; let s2 = document.getElementById(`s2-${matchId}`).value;
    let m = tournamentData.matches[poolId].find(x => x.id === matchId);
    if ((s1 === "" && m.score1 === null) || (s1 == m.score1 && s2 == m.score2)) return;
    await apiCall('/api/score', 'POST', { poolId, matchId, score1: s1, score2: s2 }); fetchData();
}

async function submitFinalsSetup() {
    let st = {};
    for (let p of ['01', '02', '03', '04']) { st[p] = calculateStandings(p).map(x => x.name); }
    await apiCall('/api/setup-finals', 'POST', { standings: st, startTime: document.getElementById('f-start').value || "14:00", matchDuration: parseInt(document.getElementById('f-duration').value || 20), breakDuration: parseInt(document.getElementById('f-break').value || 5) });
    fetchData();
}

async function saveFinalScore(matchId) {
    let s1 = document.getElementById(`fs1-${matchId}`).value, s2 = document.getElementById(`fs2-${matchId}`).value;
    let t1 = document.getElementById(`ft1-${matchId}`).value, t2 = document.getElementById(`ft2-${matchId}`).value;
    await apiCall('/api/score-finals', 'POST', { matchId, score1: s1, score2: s2, tab1: t1, tab2: t2 }); fetchData();
}

async function resetTournament() {
    if (confirm("🚨 ATTENTION ! Cela va TOUT effacer (Poules et Finales). Sûr ?")) { await apiCall('/api/reset', 'POST'); fetchData(); }
}