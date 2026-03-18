let adminPassword = localStorage.getItem('adminPwd') || null;
let tournamentData = null;

const LEAGUES_CONFIG = {
    'cl': {
        title: "Champions League", theme: "tv-cl", dbPhase: "🥇 Champions League (Places 1 à 8)",
        preview: [
            { step: "Quarts de Finale", matches: [ ["1er Poule 1", "2ème Poule 2"], ["1er Poule 2", "2ème Poule 3"], ["1er Poule 3", "2ème Poule 4"], ["1er Poule 4", "2ème Poule 1"] ] },
            { step: "Demi-Finales", matches: [ ["Gagnant QF1", "Gagnant QF2"], ["Gagnant QF3", "Gagnant QF4"] ] },
            { step: "Petite Finale (3e Place)", matches: [ ["Perdant DF1", "Perdant DF2"] ] },
            { step: "GRANDE FINALE", matches: [ ["Gagnant DF1", "Gagnant DF2"] ] }
        ]
    },
    'el': {
        title: "Europa League", theme: "tv-el", dbPhase: "🥈 League Europe (Places 9 à 16)",
        preview: [
            { step: "Quarts de Finale", matches: [ ["3ème Poule 1", "4ème Poule 2"], ["3ème Poule 2", "4ème Poule 3"], ["3ème Poule 3", "4ème Poule 4"], ["3ème Poule 4", "4ème Poule 1"] ] },
            { step: "Demi-Finales", matches: [ ["Gagnant QF1", "Gagnant QF2"], ["Gagnant QF3", "Gagnant QF4"] ] },
            { step: "FINALE Europa", matches: [ ["Gagnant DF1", "Gagnant DF2"] ] }
        ]
    },
    'cdl': {
        title: "Coupe de la Ligue", theme: "tv-cdl", dbPhase: "🥉 Coupe de la Ligue (Places 17 à 20)",
        preview: [
            { step: "Demi-Finales", matches: [ ["5ème Poule 1", "5ème Poule 3"], ["5ème Poule 2", "5ème Poule 4"] ] },
            { step: "FINALE Coupe de la Ligue", matches: [ ["Gagnant DF1", "Gagnant DF2"] ] }
        ]
    }
};

document.addEventListener('DOMContentLoaded', () => {
    fetchData();
    setInterval(() => { if (!adminPassword && tournamentData && tournamentData.isSetup) fetchData(); }, 15000);
});

function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById(`tab-${tabId}`).classList.add('active');
    document.getElementById(`content-${tabId}`).classList.add('active');
}

function login() {
    if (adminPassword) { adminPassword = null; localStorage.removeItem('adminPwd'); fetchData(); } 
    else { const pwd = prompt("Mot de passe Admin :"); if (pwd) { adminPassword = pwd; localStorage.setItem('adminPwd', pwd); fetchData(); } }
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
        if (res.status === 403) { alert("Mot de passe invalide !"); adminPassword = null; localStorage.removeItem('adminPwd'); updateHeader(); return null; }
        return await res.json();
    } catch (e) { console.error("Erreur réseau", e); return null; }
}

async function fetchData() {
    updateHeader();
    const data = await apiCall('/api/data');
    if (data) {
        tournamentData = data;
        renderPoules();
        renderLeagueTab('cl'); renderLeagueTab('el'); renderLeagueTab('cdl');
    }
}

function calculateStandings(poolId) {
    let teams = tournamentData.pools[poolId]; let matches = tournamentData.matches[poolId];
    let stats = {}; teams.forEach(t => stats[t] = { name: t, J: 0, V: 0, N: 0, D: 0, BP: 0, BC: 0, Pts: 0 });
    matches.forEach(m => {
        if (m.score1 !== null && m.score2 !== null) {
            let s1 = m.score1, s2 = m.score2;
            stats[m.team1].J++; stats[m.team2].J++; stats[m.team1].BP += s1; stats[m.team2].BP += s2; stats[m.team1].BC += s2; stats[m.team2].BC += s1;
            if (s1 > s2) { stats[m.team1].V++; stats[m.team1].Pts += 3; stats[m.team2].D++; }
            else if (s1 < s2) { stats[m.team2].V++; stats[m.team2].Pts += 3; stats[m.team1].D++; }
            else { stats[m.team1].N++; stats[m.team1].Pts += 1; stats[m.team2].N++; stats[m.team2].Pts += 1; }
        }
    });
    let standings = Object.values(stats).map(s => ({ ...s, Diff: s.BP - s.BC }));
    standings.sort((a, b) => { if (b.Pts !== a.Pts) return b.Pts - a.Pts; if (b.Diff !== a.Diff) return b.Diff - a.Diff; return b.BP - a.BP; });
    return standings;
}

// ================= POULES (MATRICE & NEW UI) =================
function renderPoules() {
    const app = document.getElementById('content-poules');
    if (!tournamentData.isSetup) {
        if (!adminPassword) { app.innerHTML = `<div class="card" style="text-align:center;"><h2>⏳ En attente...</h2><p>Le tournoi n'a pas commencé.</p></div>`; return; }
        let setupHtml = `<div class="card"><h2>⚙️ Configuration des Poules</h2>
            <div style="display: flex; gap: 10px; margin-bottom: 25px; flex-wrap: wrap;">
                <div style="flex: 1;"><label>Début</label><input type="time" id="setup-start" value="09:00" style="width: 100%; padding: 8px;"></div>
                <div style="flex: 1;"><label>Match (min)</label><input type="number" id="setup-duration" value="20" style="width: 100%; padding: 8px;"></div>
                <div style="flex: 1;"><label>Pause</label><input type="number" id="setup-break" value="5" style="width: 100%; padding: 8px;"></div>
            </div>`;
        ['01', '02', '03', '04'].forEach((p, idx) => {
            setupHtml += `<div class="setup-group" style="background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 15px;"><label><b>Poule ${p}</b></label>`;
            for(let i=0; i<5; i++) setupHtml += `<div style="display:flex; align-items:center; margin-bottom:8px;"><span style="width:25px;">${i+1}.</span><input type="text" id="setup-${p}-${i}" value="Équipe ${(idx*5)+i+1}" style="flex:1; padding:8px;"></div>`;
            setupHtml += `</div>`; 
        });
        setupHtml += `<button class="btn btn-primary" onclick="submitSetup()">Lancer les Poules !</button></div>`;
        app.innerHTML = setupHtml; return;
    }

    let html = `<div class="pools-grid">`;
    for (let poolId in tournamentData.pools) {
        let standings = calculateStandings(poolId);
        let matches = tournamentData.matches[poolId];
        
        html += `
        <div class="card">
            <h2>Poule ${poolId}</h2>
            
            <div class="table-wrapper">
                <table>
                    <tr>
                        <th>#</th><th class="team-name">Équipe</th>
                        ${standings.map(s => `<th class="matrix-header-name" title="${s.name}">${s.name}</th>`).join('')}
                        <th>Pts</th><th>J</th><th>V</th><th>N</th><th>D</th><th>BP</th><th>BC</th><th>Diff</th>
                    </tr>
                    ${standings.map((s1, idx1) => `
                        <tr class="${idx1 < 2 ? 'qualif-cl' : (idx1 < 4 ? 'qualif-el' : 'qualif-cdl')}">
                            <td><b>${idx1 + 1}</b></td>
                            <td class="team-name">${s1.name}</td>
                            
                            ${standings.map((s2, idx2) => {
                                if (idx1 === idx2) return `<td class="matrix-self"></td>`;
                                
                                let match = matches.find(m => (m.team1 === s1.name && m.team2 === s2.name) || (m.team2 === s1.name && m.team1 === s2.name));
                                if (match && match.score1 !== null && match.score2 !== null) {
                                    let scoreStr = match.team1 === s1.name ? `${match.score1} - ${match.score2}` : `${match.score2} - ${match.score1}`;
                                    return `<td class="matrix-score">${scoreStr}</td>`;
                                }
                                return `<td class="matrix-empty">-</td>`;
                            }).join('')}
                            
                            <td><b style="color:var(--primary); font-size:1.1rem;">${s1.Pts}</b></td>
                            <td>${s1.J}</td><td>${s1.V}</td><td>${s1.N}</td><td>${s1.D}</td><td>${s1.BP}</td><td>${s1.BC}</td>
                            <td><b>${s1.Diff > 0 ? '+'+s1.Diff : s1.Diff}</b></td>
                        </tr>
                    `).join('')}
                </table>
            </div>
            
            <div class="matches-list">
                ${matches.map(m => `
                    <div class="modern-match-card">
                        <div class="modern-match-header">
                            <span>⌚ ${m.time}</span>
                            <span style="color: #d97706;">Arbitre: ${m.referee}</span>
                        </div>
                        <div class="modern-match-body">
                            <div class="team-left">${m.team1}</div>
                            
                            ${adminPassword ? `
                                <div class="modern-score-inputs">
                                    <input type="number" pattern="[0-9]*" id="s1-${m.id}" value="${m.score1 !== null ? m.score1 : ''}" onblur="saveScore('${poolId}', '${m.id}')">
                                    <span class="score-divider">:</span>
                                    <input type="number" pattern="[0-9]*" id="s2-${m.id}" value="${m.score2 !== null ? m.score2 : ''}" onblur="saveScore('${poolId}', '${m.id}')">
                                </div>
                            ` : `
                                <div class="modern-score-display">
                                    <span class="score-box">${m.score1 !== null ? m.score1 : '-'}</span>
                                    <span class="score-divider">:</span>
                                    <span class="score-box">${m.score2 !== null ? m.score2 : '-'}</span>
                                </div>
                            `}
                            
                            <div class="team-right">${m.team2}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>`;
    }
    app.innerHTML = html + `</div>`;
}

// ================= PHASES FINALES (TV UI) =================
function renderLeagueTab(leagueId) {
    const config = LEAGUES_CONFIG[leagueId];
    const app = document.getElementById(`content-${leagueId}`);
    
    let adminPanelHtml = '';
    if (adminPassword && tournamentData.isSetup && !tournamentData.isFinalsSetup) {
        adminPanelHtml = `
            <div class="card" style="margin-bottom: 20px; border-left: 5px solid var(--danger);">
                <h2 style="color:var(--danger);">⚙️ Action Admin : Générer le Bracket</h2>
                <div style="display: flex; gap: 10px; margin-bottom: 15px; flex-wrap: wrap;">
                    <div style="flex: 1;"><label>Reprise</label><input type="time" id="f-start-${leagueId}" value="14:00" style="width: 100%; padding: 8px;"></div>
                    <div style="flex: 1;"><label>Match (min)</label><input type="number" id="f-duration-${leagueId}" value="20" style="width: 100%; padding: 8px;"></div>
                    <div style="flex: 1;"><label>Pause</label><input type="number" id="f-break-${leagueId}" value="5" style="width: 100%; padding: 8px;"></div>
                </div>
                <button class="btn btn-primary" style="background:var(--danger);" onclick="submitFinalsSetup('${leagueId}')">Générer les 3 Leagues !</button>
            </div>`;
    }

    let html = adminPanelHtml + `<div class="tv-container ${config.theme}"><h2 class="tv-title">${config.title}</h2>`;

    if (!tournamentData.isFinalsSetup) {
        config.preview.forEach(group => {
            html += `<h3 class="tv-group-title">${group.step}</h3>`;
            group.matches.forEach(m => {
                html += `
                <div class="tv-match">
                    <div class="tv-match-header"><span>⌚ À définir</span><span>Match</span></div>
                    <div class="tv-match-body">
                        <div class="tv-team placeholder">${m[0]}</div>
                        <div class="tv-vs">VS</div>
                        <div class="tv-team placeholder">${m[1]}</div>
                    </div>
                </div>`;
            });
        });
    } else {
        let matches = tournamentData.finalsMatches.filter(m => m.phase === config.dbPhase);
        let grouped = {}; let order = [];
        matches.forEach(m => { if(!grouped[m.step]) { grouped[m.step] = []; order.push(m.step); } grouped[m.step].push(m); });

        order.forEach(step => {
            html += `<h3 class="tv-group-title">${step}</h3>`;
            grouped[step].forEach(m => {
                let isT1Place = m.team1.startsWith('Gagnant') || m.team1.startsWith('Perdant');
                let isT2Place = m.team2.startsWith('Gagnant') || m.team2.startsWith('Perdant');
                
                html += `
                <div class="tv-match">
                    <div class="tv-match-header"><span>⌚ ${m.time}</span><span>${m.id}</span></div>
                    <div class="tv-match-body">
                        <div class="tv-team ${isT1Place ? 'placeholder' : ''}">${m.team1}</div>
                        <div style="text-align:center;">
                            ${adminPassword ? `
                                <div class="tv-input-group">
                                    <input type="number" pattern="[0-9]*" class="tv-input" id="fs1-${m.id}" value="${m.score1 !== null ? m.score1 : ''}" onblur="saveFinalScore('${m.id}')">
                                    <span style="color:#64748b">-</span>
                                    <input type="number" pattern="[0-9]*" class="tv-input" id="fs2-${m.id}" value="${m.score2 !== null ? m.score2 : ''}" onblur="saveFinalScore('${m.id}')">
                                </div>
                                <div class="tv-tab-container">
                                    TAB : <input type="number" pattern="[0-9]*" class="tv-tab-input" id="ft1-${m.id}" value="${m.tab1 !== null ? m.tab1 : ''}" onblur="saveFinalScore('${m.id}')">
                                    - <input type="number" pattern="[0-9]*" class="tv-tab-input" id="ft2-${m.id}" value="${m.tab2 !== null ? m.tab2 : ''}" onblur="saveFinalScore('${m.id}')">
                                </div>
                            ` : `
                                <div class="tv-scorebox">${m.score1 !== null ? m.score1 : '-'} <span style="color:#475569;">:</span> ${m.score2 !== null ? m.score2 : '-'}</div>
                                ${m.tab1 !== null ? `<div class="tv-tab-display">TAB (${m.tab1} - ${m.tab2})</div>` : ''}
                            `}
                        </div>
                        <div class="tv-team ${isT2Place ? 'placeholder' : ''}">${m.team2}</div>
                    </div>
                </div>`;
            });
        });
    }
    html += `</div>`;
    app.innerHTML = html;
}

// ================= ACTIONS =================
async function submitSetup() {
    let pools = {};
    for (let p of ['01', '02', '03', '04']) {
        let lines = [];
        for (let i = 0; i < 5; i++) { let t = document.getElementById(`setup-${p}-${i}`).value.trim(); if (t) lines.push(t); }
        if (lines.length !== 5) return alert(`⚠️ La poule ${p} doit avoir 5 équipes !`); pools[p] = lines;
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

async function submitFinalsSetup(leagueId) {
    let st = {};
    for (let p of ['01', '02', '03', '04']) { st[p] = calculateStandings(p).map(x => x.name); }
    await apiCall('/api/setup-finals', 'POST', { standings: st, startTime: document.getElementById(`f-start-${leagueId}`).value || "14:00", matchDuration: parseInt(document.getElementById(`f-duration-${leagueId}`).value || 20), breakDuration: parseInt(document.getElementById(`f-break-${leagueId}`).value || 5) });
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