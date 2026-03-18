let adminPassword = localStorage.getItem('adminPwd') || null;
let tournamentData = null;

// ==========================================
// CONFIGURATION DES ARBRES DE TOURNOIS
// ==========================================
const LEAGUES_CONFIG = {
    'cl': {
        title: "Champions League", dbPhase: "🥇 Champions League (Places 1 à 8)",
        bracketMain: { qf: ['CL-QF1', 'CL-QF2', 'CL-QF3', 'CL-QF4'], sf: ['CL-SF1', 'CL-SF2'], f: ['CL-F'], third: 'CL-3E' },
        bracketPlace: { title: "Matchs de Classement (5ème à 8ème place)", sf: ['CL-C1', 'CL-C2'], f: ['CL-5E'], third: 'CL-7E' }
    },
    'el': {
        title: "Europa League", dbPhase: "🥈 League Europe (Places 9 à 16)",
        bracketMain: { qf: ['EL-QF1', 'EL-QF2', 'EL-QF3', 'EL-QF4'], sf: ['EL-SF1', 'EL-SF2'], f: ['EL-F'], third: 'EL-11E' },
        bracketPlace: { title: "Matchs de Classement (13ème à 16ème place)", sf: ['EL-C1', 'EL-C2'], f: ['EL-13E'], third: 'EL-15E' }
    },
    'cdl': {
        title: "Coupe de la Ligue", dbPhase: "🥉 Coupe de la Ligue (Places 17 à 20)",
        bracketMain: { sf: ['CDL-SF1', 'CDL-SF2'], f: ['CDL-F'], third: 'CDL-3E' }
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
    const tabAdmin = document.getElementById('tab-admin'); // Le nouvel onglet Admin

    if (adminPassword) {
        badge.textContent = "Mode ADMIN"; badge.className = "status-badge admin";
        btnLogin.textContent = "Quitter"; btnReset.style.display = 'block';
        if (tabAdmin) tabAdmin.style.display = 'inline-block';
    } else {
        badge.textContent = "Spectateur (Live)"; badge.className = "status-badge spectateur";
        btnLogin.textContent = "Admin"; btnReset.style.display = 'none';
        if (tabAdmin) {
            tabAdmin.style.display = 'none';
            // Si on se déconnecte alors qu'on était sur l'onglet Admin, on retourne aux poules
            if (document.getElementById('content-admin').classList.contains('active')) switchTab('poules');
        }
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
        renderAdminSchedule(); // On génère le planning global
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

// ================= POULES =================
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
                        <div class="modern-match-header"><span>⌚ ${m.time}</span><span style="color: #d97706;">Arbitre: ${m.referee}</span></div>
                        <div class="modern-match-body">
                            <div class="modern-match-main">
                                <div class="team-left">${m.team1}</div>
                                ${adminPassword ? `
                                    <div class="modern-score-inputs">
                                        <input type="number" pattern="[0-9]*" id="s1-${m.id}" value="${m.score1 !== null ? m.score1 : ''}" onblur="saveScore('${poolId}', '${m.id}')">
                                        <span class="score-divider">:</span>
                                        <input type="number" pattern="[0-9]*" id="s2-${m.id}" value="${m.score2 !== null ? m.score2 : ''}" onblur="saveScore('${poolId}', '${m.id}')">
                                    </div>
                                ` : `
                                    <div class="modern-score-display"><span class="score-box">${m.score1 !== null ? m.score1 : '-'}</span><span class="score-divider">:</span><span class="score-box">${m.score2 !== null ? m.score2 : '-'}</span></div>
                                `}
                                <div class="team-right">${m.team2}</div>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>`;
    }
    app.innerHTML = html + `</div>`;
}

// ================= FONCTIONS POUR DESSINER L'ARBRE =================
function buildBracketNode(matchId, isPetiteFinale = false) {
    if(!matchId) return '';
    let m = tournamentData.finalsMatches.find(x => x.id === matchId);
    if(!m) return `<div class="b-match-wrapper"><div class="b-match"><div class="b-label">À définir</div><div class="b-team"><span class="b-name">...</span></div><div class="b-team"><span class="b-name">...</span></div></div></div>`;
    
    let t1 = m.team1, t2 = m.team2;
    let s1 = m.score1 !== null ? m.score1 : '-';
    let s2 = m.score2 !== null ? m.score2 : '-';
    
    if(m.tab1 !== null && m.tab2 !== null) {
        s1 += ` <span style="font-size:0.7rem; color:#ef4444;">(${m.tab1})</span>`;
        s2 += ` <span style="font-size:0.7rem; color:#ef4444;">(${m.tab2})</span>`;
    }

    let w1 = '', w2 = '';
    if (m.score1 !== null && m.score2 !== null) {
        if (m.score1 > m.score2 || (m.tab1 !== null && m.tab1 > m.tab2)) w1 = 'winner';
        if (m.score2 > m.score1 || (m.tab2 !== null && m.tab2 > m.tab1)) w2 = 'winner';
    }

    return `
        <div class="b-match-wrapper ${isPetiteFinale ? 'pf-match' : ''}">
            <div class="b-match">
                <div class="b-label">${m.id}</div>
                <div class="b-team ${w1}"><span class="b-name" title="${t1}">${t1}</span><span class="b-score">${s1}</span></div>
                <div class="b-team ${w2}"><span class="b-name" title="${t2}">${t2}</span><span class="b-score">${s2}</span></div>
            </div>
        </div>
    `;
}

function renderBracket(config) {
    if (!config) return '';
    let html = `<div class="bracket-wrapper"><div class="bracket">`;
    if (config.qf) { html += `<div class="b-round">`; config.qf.forEach(id => html += buildBracketNode(id)); html += `</div>`; }
    if (config.sf) { html += `<div class="b-round">`; config.sf.forEach(id => html += buildBracketNode(id)); html += `</div>`; }
    if (config.f) { html += `<div class="b-round">`; config.f.forEach(id => html += buildBracketNode(id)); html += `</div>`; }
    html += `</div>`;
    
    if (config.third) {
        html += `
        <div class="petite-finale-wrapper">
            <div class="pf-line"></div>
            <div class="pf-title">🥉 Petite Finale</div>
            <div class="pf-container">${buildBracketNode(config.third, true)}</div>
        </div>`;
    }
    return html + `</div>`;
}

// ================= PHASES FINALES =================
function renderLeagueTab(leagueId) {
    const config = LEAGUES_CONFIG[leagueId];
    const app = document.getElementById(`content-${leagueId}`);
    
    if (!tournamentData.isSetup) { app.innerHTML = `<p style="text-align:center; padding: 20px;">Jouez d'abord les poules !</p>`; return; }

    if (!tournamentData.isFinalsSetup) {
        if (!adminPassword) { app.innerHTML = `<div class="card" style="text-align:center;"><h2>⏳ En attente...</h2><p>L'admin doit générer le tableau.</p></div>`; return; }
        app.innerHTML = `
            <div class="card" style="border-left: 5px solid var(--secondary);">
                <h2 style="color:var(--secondary);">⚙️ Action Admin : Générer l'Arbre</h2>
                <div style="display: flex; gap: 10px; margin-bottom: 15px; flex-wrap: wrap;">
                    <div style="flex: 1;"><label>Reprise</label><input type="time" id="f-start-${leagueId}" value="14:00" style="width: 100%; padding: 8px;"></div>
                    <div style="flex: 1;"><label>Match (min)</label><input type="number" id="f-duration-${leagueId}" value="20" style="width: 100%; padding: 8px;"></div>
                    <div style="flex: 1;"><label>Pause</label><input type="number" id="f-break-${leagueId}" value="5" style="width: 100%; padding: 8px;"></div>
                </div>
                <button class="btn btn-primary" onclick="submitFinalsSetup('${leagueId}')">Générer les tableaux finaux !</button>
            </div>`;
        return;
    }

    let html = `<div class="card"><h2>${config.title}</h2>`;
    html += `<div class="section-title">Arbre Principal</div>` + renderBracket(config.bracketMain);
    if (config.bracketPlace) { html += `<div class="section-title">${config.bracketPlace.title}</div>` + renderBracket(config.bracketPlace); }
    html += `</div>`;

    html += `<div class="section-title" style="margin-top: 30px;">Saisie des Scores</div>`;
    let matches = tournamentData.finalsMatches.filter(m => m.phase === config.dbPhase);
    let grouped = {}; let order = [];
    matches.forEach(m => { if(!grouped[m.step]) { grouped[m.step] = []; order.push(m.step); } grouped[m.step].push(m); });

    order.forEach(step => {
        html += `<h3 style="color:#64748b; font-size:1rem; margin: 15px 0 10px;">${step}</h3>`;
        grouped[step].forEach(m => {
            html += `
            <div class="modern-match-card">
                <div class="modern-match-header"><span>⌚ ${m.time}</span><span>${m.id}</span></div>
                <div class="modern-match-body">
                    <div class="modern-match-main">
                        <div class="team-left">${m.team1}</div>
                        ${adminPassword ? `
                            <div class="modern-score-inputs">
                                <input type="number" pattern="[0-9]*" id="fs1-${m.id}" value="${m.score1 !== null ? m.score1 : ''}" onblur="saveFinalScore('${m.id}')">
                                <span class="score-divider">:</span>
                                <input type="number" pattern="[0-9]*" id="fs2-${m.id}" value="${m.score2 !== null ? m.score2 : ''}" onblur="saveFinalScore('${m.id}')">
                            </div>
                        ` : `
                            <div class="modern-score-display"><span class="score-box">${m.score1 !== null ? m.score1 : '-'}</span><span class="score-divider">:</span><span class="score-box">${m.score2 !== null ? m.score2 : '-'}</span></div>
                        `}
                        <div class="team-right">${m.team2}</div>
                    </div>
                    ${adminPassword ? `
                        <div class="tab-section">
                            Tirs au But : 
                            <input type="number" pattern="[0-9]*" id="ft1-${m.id}" value="${m.tab1 !== null ? m.tab1 : ''}" onblur="saveFinalScore('${m.id}')"> - 
                            <input type="number" pattern="[0-9]*" id="ft2-${m.id}" value="${m.tab2 !== null ? m.tab2 : ''}" onblur="saveFinalScore('${m.id}')">
                        </div>
                    ` : (m.tab1 !== null ? `<div class="tab-display">Vainqueur aux TAB (${m.tab1} - ${m.tab2})</div>` : '')}
                </div>
            </div>`;
        });
    });
    app.innerHTML = html;
}

// ================= NOUVEAU : PLANNING GLOBAL ADMIN =================
function renderAdminSchedule() {
    const app = document.getElementById('content-admin');
    if (!adminPassword) return; // Ne s'affiche que si on a le mot de passe

    if (!tournamentData || !tournamentData.isSetup) {
        app.innerHTML = `<div class="card" style="text-align:center;"><h2>⏳ En attente...</h2><p>Le tournoi n'a pas commencé.</p></div>`;
        return;
    }

    let allMatches = [];

    // 1. On récupère tous les matchs des Poules
    for (let p in tournamentData.matches) {
        tournamentData.matches[p].forEach(m => {
            allMatches.push({ ...m, context: `Poule ${p}`, type: 'poule', poolId: p });
        });
    }

    // 2. On récupère tous les matchs des Finales (Si elles sont générées)
    if (tournamentData.isFinalsSetup) {
        tournamentData.finalsMatches.forEach(m => {
            allMatches.push({ ...m, context: m.step, type: 'final' });
        });
    }

    // 3. On trie le tout par Heure ("09h00" passe avant "09h20")
    allMatches.sort((a, b) => a.time.localeCompare(b.time));

    // 4. On groupe les matchs qui se jouent en même temps
    let groupedMatches = {};
    allMatches.forEach(m => {
        if (!groupedMatches[m.time]) groupedMatches[m.time] = [];
        groupedMatches[m.time].push(m);
    });

    let html = `<div class="card"><h2 style="color:var(--danger); border-color:var(--danger);">📅 Emploi du temps global</h2>`;
    html += `<p style="font-size:0.85rem; margin-bottom: 20px;">Cet écran vous permet de gérer tous les scores d'un seul coup d'œil, heure par heure.</p>`;

    for (let timeSlot in groupedMatches) {
        html += `<h3 style="background:var(--primary); color:white; padding:8px 15px; border-radius:6px; margin: 20px 0 10px;">🕒 Créneau : ${timeSlot}</h3>`;
        html += `<div class="pools-grid">`;

        groupedMatches[timeSlot].forEach(m => {
            if (m.type === 'poule') {
                html += `
                <div class="modern-match-card">
                    <div class="modern-match-header"><span>${m.context}</span><span style="color: #d97706;">Arbitre: ${m.referee}</span></div>
                    <div class="modern-match-body">
                        <div class="modern-match-main">
                            <div class="team-left">${m.team1}</div>
                            <div class="modern-score-inputs">
                                <input type="number" pattern="[0-9]*" id="admin-s1-${m.id}" value="${m.score1 !== null ? m.score1 : ''}" onblur="saveScore('${m.poolId}', '${m.id}', 'admin-s1-${m.id}', 'admin-s2-${m.id}')">
                                <span class="score-divider">:</span>
                                <input type="number" pattern="[0-9]*" id="admin-s2-${m.id}" value="${m.score2 !== null ? m.score2 : ''}" onblur="saveScore('${m.poolId}', '${m.id}', 'admin-s1-${m.id}', 'admin-s2-${m.id}')">
                            </div>
                            <div class="team-right">${m.team2}</div>
                        </div>
                    </div>
                </div>`;
            } else {
                let t1Style = m.team1.startsWith('Gagnant') || m.team1.startsWith('Perdant') ? 'color:#94a3b8; font-style:italic;' : '';
                let t2Style = m.team2.startsWith('Gagnant') || m.team2.startsWith('Perdant') ? 'color:#94a3b8; font-style:italic;' : '';
                html += `
                <div class="modern-match-card" style="border-left: 4px solid var(--danger);">
                    <div class="modern-match-header"><span>Phase Finale (${m.id})</span><span>${m.context}</span></div>
                    <div class="modern-match-body">
                        <div class="modern-match-main">
                            <div class="team-left" style="${t1Style}">${m.team1}</div>
                            <div class="modern-score-inputs">
                                <input type="number" pattern="[0-9]*" id="admin-fs1-${m.id}" value="${m.score1 !== null ? m.score1 : ''}" onblur="saveFinalScore('${m.id}', 'admin-fs1-${m.id}', 'admin-fs2-${m.id}', 'admin-ft1-${m.id}', 'admin-ft2-${m.id}')">
                                <span class="score-divider">:</span>
                                <input type="number" pattern="[0-9]*" id="admin-fs2-${m.id}" value="${m.score2 !== null ? m.score2 : ''}" onblur="saveFinalScore('${m.id}', 'admin-fs1-${m.id}', 'admin-fs2-${m.id}', 'admin-ft1-${m.id}', 'admin-ft2-${m.id}')">
                            </div>
                            <div class="team-right" style="${t2Style}">${m.team2}</div>
                        </div>
                        <div class="tab-section">
                            TAB : 
                            <input type="number" pattern="[0-9]*" id="admin-ft1-${m.id}" value="${m.tab1 !== null ? m.tab1 : ''}" onblur="saveFinalScore('${m.id}', 'admin-fs1-${m.id}', 'admin-fs2-${m.id}', 'admin-ft1-${m.id}', 'admin-ft2-${m.id}')">
                            -
                            <input type="number" pattern="[0-9]*" id="admin-ft2-${m.id}" value="${m.tab2 !== null ? m.tab2 : ''}" onblur="saveFinalScore('${m.id}', 'admin-fs1-${m.id}', 'admin-fs2-${m.id}', 'admin-ft1-${m.id}', 'admin-ft2-${m.id}')">
                        </div>
                    </div>
                </div>`;
            }
        });
        html += `</div>`;
    }
    html += `</div>`;
    app.innerHTML = html;
}

// ================= ACTIONS SERVEUR (AVEC SUPPORT ID MULTIPLES) =================
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

async function saveScore(poolId, matchId, id1 = `s1-${matchId}`, id2 = `s2-${matchId}`) {
    let s1 = document.getElementById(id1).value; let s2 = document.getElementById(id2).value;
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

async function saveFinalScore(matchId, id1 = `fs1-${matchId}`, id2 = `fs2-${matchId}`, idt1 = `ft1-${matchId}`, idt2 = `ft2-${matchId}`) {
    let s1 = document.getElementById(id1).value, s2 = document.getElementById(id2).value;
    let t1 = document.getElementById(idt1).value, t2 = document.getElementById(idt2).value;
    await apiCall('/api/score-finals', 'POST', { matchId, score1: s1, score2: s2, tab1: t1, tab2: t2 }); fetchData();
}

async function resetTournament() {
    if (confirm("🚨 ATTENTION ! Cela va TOUT effacer (Poules et Finales). Sûr ?")) { await apiCall('/api/reset', 'POST'); fetchData(); }
}