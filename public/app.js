let adminPassword = localStorage.getItem('adminPwd') || null;
let tournamentData = null;
let openPools = new Set();

const LEAGUES_CONFIG = {
    'cl': {
        title: "Champions League", dbPhase: "🥇 Champions League (Places 1 à 8)",
        bracketMain: { qf: ['CL-QF1', 'CL-QF2', 'CL-QF3', 'CL-QF4'], sf: ['CL-SF1', 'CL-SF2'], f: ['CL-F'], third: 'CL-3E' },
        bracketPlace: { title: "Matchs de Classement (5ème à 8ème place)", sf: ['CL-C1', 'CL-C2'], f: ['CL-5E'], third: 'CL-7E' }
    },
    'el': {
        title: "Europa League", dbPhase: "🥈 Europa League (Places 9 à 16)",
        bracketMain: { qf: ['EL-QF1', 'EL-QF2', 'EL-QF3', 'EL-QF4'], sf: ['EL-SF1', 'EL-SF2'], f: ['EL-F'], third: 'EL-11E' },
        bracketPlace: { title: "Matchs de Classement (13ème à 16ème place)", sf: ['EL-C1', 'EL-C2'], f: ['EL-13E'], third: 'EL-15E' }
    }
};

function getLeagueConfig(leagueId) {
    let teamCount = tournamentData ? tournamentData.teamCount : 20;
    let config = { ...LEAGUES_CONFIG[leagueId] };
    if (leagueId === 'sl') {
        if (teamCount === 24) {
            config.title = "Sunday League"; config.dbPhase = "🥉 Sunday League (Places 17 à 24)";
            config.bracketMain = { qf: ['SL-QF1', 'SL-QF2', 'SL-QF3', 'SL-QF4'], sf: ['SL-SF1', 'SL-SF2'], f: ['SL-F'], third: 'SL-19E' };
            config.bracketPlace = { title: "Matchs de Classement (21ème à 24ème place)", sf: ['SL-C1', 'SL-C2'], f: ['SL-21E'], third: 'SL-23E' };
        } else {
            config.title = "Sunday League"; config.dbPhase = "🥉 Sunday League (Places 17 à 20)";
            config.bracketMain = { sf: ['SL-SF1', 'SL-SF2'], f: ['SL-F'], third: 'SL-3E' };
            config.bracketPlace = null;
        }
    }
    return config;
}

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
    const tabAdmin = document.getElementById('tab-admin');

    if (adminPassword) {
        badge.textContent = "Mode ADMIN"; badge.className = "status-badge admin";
        btnLogin.textContent = "Quitter"; btnReset.style.display = 'block';
        if (tabAdmin) tabAdmin.style.display = 'inline-block';
    } else {
        badge.textContent = "Spectateur (Live)"; badge.className = "status-badge spectateur";
        btnLogin.textContent = "Admin"; btnReset.style.display = 'none';
        if (tabAdmin) { tabAdmin.style.display = 'none'; if (document.getElementById('content-admin').classList.contains('active')) switchTab('poules'); }
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
        renderPoules(); renderMonEquipe();
        renderLeagueTab('cl'); renderLeagueTab('el'); renderLeagueTab('sl');
        renderAdminSchedule(); renderClassement();
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

function resolveTeam(code) {
    if (!code) return "...";
    
    // CAS 1 : C'est une équipe venant d'une poule (ex: P-A-1)
    if (code.startsWith("P-")) {
        let poolId = code.substring(2, 3);
        let rank = parseInt(code.substring(4)) - 1;
        
        let suffixe = rank === 0 ? "er" : "ème";
        let placeholder = `${rank + 1}${suffixe} Poule ${poolId}`;

        // NOUVEAUTÉ : Vérifier si tous les matchs de cette poule sont bien terminés (scores non nuls)
        let poolMatches = tournamentData.matches[poolId];
        let isPoolFinished = poolMatches && poolMatches.every(m => m.score1 !== null && m.score2 !== null);

        // Si la poule n'est pas finie, on affiche le texte générique pour garder le suspense
        if (!isPoolFinished) {
            return placeholder;
        }

        // Si la poule est finie, on calcule le classement final et on affiche le vrai nom
        let st = calculateStandings(poolId);
        if (st[rank]) return st[rank].name;
        
        return placeholder;
    }
    
    // CAS 2 : C'est une équipe venant d'un match de phase finale (ex: W:CL-QF1 ou L:CL-QF1)
    if (code.startsWith("W:") || code.startsWith("L:")) {
        let matchId = code.substring(2);
        let m = tournamentData.finalsMatches.find(x => x.id === matchId);
        if (m && m.score1 !== null && m.score2 !== null) {
            let winnerCode = null; let loserCode = null;
            if (m.score1 > m.score2 || (m.tab1 !== null && m.tab1 > m.tab2)) { winnerCode = m.team1; loserCode = m.team2; } 
            else if (m.score2 > m.score1 || (m.tab2 !== null && m.tab2 > m.tab1)) { winnerCode = m.team2; loserCode = m.team1; }
            
            if (winnerCode && loserCode) return code.startsWith("W:") ? resolveTeam(winnerCode) : resolveTeam(loserCode);
        }
        return code.startsWith("W:") ? `Vainq. ${matchId}` : `Perd. ${matchId}`;
    }
    return code;
}

// ================= POULES =================
function renderSetupForm() {
    let tc = parseInt(document.getElementById('setup-team-count').value);
    let teamsPerPool = tc / 4;
    let setupHtml = '';
    
    // Vos vraies équipes extraites des captures d'écran
    const defaultTeams = {
        'A': ["Bru PM", "Pirates Rugueux", "Inazuma", "D&P", "FC Monjardin", "Les guêpes"],
        'B': ["EKIP", "Les 6K", "Petru 3G", "Patacaisse", "Rocket mouette", "PM de jours comme de nuit"],
        'C': ["Les Chills & Goals", "BFC Bourdon", "I need mémé", "Les Canocheurs", "Dreateam", "203"],
        'D': ["La Vic-Team", "Morgnaule", "FC TANVAL", "Bru 5", "Les menaces imprévisibles", "Régionale royale du brabant wallon"]
    };

    ['A', 'B', 'C', 'D'].forEach((p, idx) => {
        setupHtml += `<div class="setup-group" style="background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 15px;"><label><b>Poule ${p} (Terrain ${idx+1})</b></label>`;
        for(let i=0; i<teamsPerPool; i++) {
            // Si on a un nom par défaut on le met, sinon on retombe sur "Equipe X"
            let defaultName = (defaultTeams[p] && defaultTeams[p][i]) ? defaultTeams[p][i] : `Équipe ${(idx*teamsPerPool)+i+1}`;
            
            setupHtml += `<div style="display:flex; align-items:center; margin-bottom:8px;"><span style="width:25px;">${i+1}.</span><input type="text" id="setup-${p}-${i}" value="${defaultName}" style="flex:1; padding:8px;"></div>`;
        }
        setupHtml += `</div>`; 
    });
    document.getElementById('setup-pools-container').innerHTML = setupHtml;
}

function togglePoolMatches(poolId) {
    if (openPools.has(poolId)) {
        openPools.delete(poolId);
    } else {
        openPools.add(poolId);
    }
    renderPoules(); // On redessine pour mettre à jour l'affichage
}

function renderPoules() {
    const app = document.getElementById('content-poules');
    if (!tournamentData.isSetup) {
        if (!adminPassword) { app.innerHTML = `<div class="card" style="text-align:center;"><h2>⏳ En attente...</h2><p>Le tournoi n'a pas commencé.</p></div>`; return; }
        app.innerHTML = `<div class="card"><h2>⚙️ Configuration Globale du Tournoi</h2>
            <div style="display: flex; gap: 10px; margin-bottom: 15px; flex-wrap: wrap;">
                <div style="flex: 1;"><label>Nombre d'équipes</label><select id="setup-team-count" onchange="renderSetupForm()" style="width: 100%; padding: 8px; font-weight:bold; border-radius:4px;"><option value="20">20 Équipes (5 par Poule)</option><option value="24" selected>24 Équipes (6 par Poule)</option></select></div>
            </div>
            <div style="display: flex; gap: 10px; margin-bottom: 25px; flex-wrap: wrap;">
                <div style="flex: 1;"><label>Début Poules</label><input type="time" id="setup-start" value="09:00" style="width: 100%; padding: 8px;"></div>
                <div style="flex: 1;"><label>Reprise Finales</label><input type="time" id="setup-finals-start" value="14:00" style="width: 100%; padding: 8px;"></div>
                <div style="flex: 1;"><label>Match (min)</label><input type="number" id="setup-duration" value="15" style="width: 100%; padding: 8px;"></div>
                <div style="flex: 1;"><label>Pause (min)</label><input type="number" id="setup-break" value="5" style="width: 100%; padding: 8px;"></div>
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="font-weight: bold;">Nombre de terrains :</label>
                <select id="setup-terrains" style="width: 100%; padding: 8px; border-radius: 5px;">
                    <option value="4">4 Terrains (Classique)</option>
                    <option value="5">5 Terrains (Rapide)</option>
                </select>
            </div>
            
            <div id="setup-pools-container"></div><button class="btn btn-primary" onclick="submitSetup()">Lancer le Tournoi Complet !</button></div>`;
        renderSetupForm(); return;
    }

    let html = `<div class="pools-grid">`;
    for (let poolId in tournamentData.pools) {
        let standings = calculateStandings(poolId);
        let matches = tournamentData.matches[poolId];
        let isOpen = openPools.has(poolId); // Vérifie si cette poule est ouverte
        
        html += `
        <div class="card">
            <div onclick="togglePoolMatches('${poolId}')" style="cursor: pointer;" title="Cliquer pour voir/masquer les matchs">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 3px solid var(--secondary); margin-bottom: 15px; padding-bottom: 8px;">
                    <h2 style="border-bottom:none; margin-bottom:0; padding-bottom:0;">Poule ${poolId}</h2>
                    <span style="font-size: 0.85rem; color: var(--secondary); font-weight: bold; background: #e0e7ff; padding: 4px 10px; border-radius: 20px;">
                        ${isOpen ? '▲ Masquer les matchs' : '▼ Voir les matchs'}
                    </span>
                </div>
                <div class="table-wrapper">
                    <table>
                        <tr>
                            <th>#</th><th class="team-name">Équipe</th>
                            ${standings.map(s => `<th class="matrix-header-name" title="${s.name}">${s.name}</th>`).join('')}
                            <th>Pts</th><th>J</th><th>V</th><th>N</th><th>D</th><th>BP</th><th>BC</th><th>Diff</th>
                        </tr>
                        ${standings.map((s1, idx1) => `
                            <tr class="${idx1 < 2 ? 'qualif-cl' : (idx1 < 4 ? 'qualif-el' : 'qualif-sl')}">
                                <td><b>${idx1 + 1}</b></td>
                                <td class="team-name">${s1.name}</td>
                                ${standings.map((s2, idx2) => {
                                    if (idx1 === idx2) return `<td class="matrix-self"></td>`;
                                    let match = matches.find(m => (m.team1 === s1.name && m.team2 === s2.name) || (m.team2 === s1.name && m.team1 === s2.name));
                                    if (match && match.score1 !== null && match.score2 !== null) {
                                        let scoreStr = match.team1 === s1.name ? `${match.score1}-${match.score2}` : `${match.score2}-${match.score1}`;
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
            </div>

            <div class="matches-list" style="${isOpen ? 'display: block;' : 'display: none;'} margin-top: 15px;">
                <div class="section-title" style="margin-top:0;">Calendrier des matchs</div>
                ${matches.map(m => `
                    <div class="modern-match-card">
                        <div class="modern-match-header"><span>⌚ ${m.time} | 📍 ${m.terrain}</span><span style="color: #d97706;">Arbitre: ${m.referee}</span></div>
                        <div class="modern-match-body">
                            <div class="modern-match-main">
                                <div class="team-left">${m.team1}</div>
                                ${adminPassword ? `
                                    <div class="modern-score-inputs">
                                        <input type="number" pattern="[0-9]*" id="s1-${m.id}" value="${m.score1 !== null ? m.score1 : ''}" onblur="saveScore('${poolId}', '${m.id}', 's1-${m.id}', 's2-${m.id}')">
                                        <span class="score-divider">:</span>
                                        <input type="number" pattern="[0-9]*" id="s2-${m.id}" value="${m.score2 !== null ? m.score2 : ''}" onblur="saveScore('${poolId}', '${m.id}', 's1-${m.id}', 's2-${m.id}')">
                                    </div>
                                ` : `<div class="modern-score-display"><span class="score-box">${m.score1 !== null ? m.score1 : '-'}</span><span class="score-divider">:</span><span class="score-box">${m.score2 !== null ? m.score2 : '-'}</span></div>`}
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

// ================= MON EQUIPE =================
function renderMonEquipe() {
    const app = document.getElementById('content-equipe');
    if (!tournamentData || !tournamentData.isSetup) { app.innerHTML = `<div class="card" style="text-align:center;"><h2>⏳ En attente...</h2><p>Le tournoi n'a pas commencé.</p></div>`; return; }

    if (!document.getElementById('team-select')) {
        app.innerHTML = `<div class="card"><h2>🔎 Mon Programme</h2><select id="team-select" class="team-selector" onchange="renderMonEquipeMatches()"></select><div id="team-schedule-container"></div></div>`;
    }

    const select = document.getElementById('team-select');
    if (select.options.length <= 1) {
        let allTeams = [];
        for (let p in tournamentData.pools) allTeams = allTeams.concat(tournamentData.pools[p]);
        allTeams.sort((a, b) => a.localeCompare(b));
        select.innerHTML = `<option value="">-- Choisissez votre équipe --</option>` + allTeams.map(t => `<option value="${t}">${t}</option>`).join('');
    }
    renderMonEquipeMatches();
}

function renderMonEquipeMatches() {
    const container = document.getElementById('team-schedule-container');
    const select = document.getElementById('team-select');
    if (!container || !select) return;

    let selectedTeam = select.value;
    if (!selectedTeam) { container.innerHTML = `<div class="schedule-empty">Sélectionnez votre équipe.</div>`; return; }

    let myMatches = [];
    for (let p in tournamentData.pools) tournamentData.matches[p].forEach(m => { 
        if (m.team1 === selectedTeam || m.team2 === selectedTeam || m.referee === selectedTeam) 
            myMatches.push({ ...m, context: `Poule ${p}`, type: 'poule', poolId: p }); 
    });
    
    tournamentData.finalsMatches.forEach(m => {
        let r1 = resolveTeam(m.team1); let r2 = resolveTeam(m.team2); let rRef = resolveTeam(m.referee);
        if (r1 === selectedTeam || r2 === selectedTeam || rRef === selectedTeam) 
            myMatches.push({ ...m, resolvedT1: r1, resolvedT2: r2, context: m.step, type: 'final' });
    });

    myMatches.sort((a, b) => a.time.localeCompare(b.time));
    if (myMatches.length === 0) { container.innerHTML = `<div class="schedule-empty">Aucun match trouvé.</div>`; return; }

    let html = `<div style="display: flex; flex-direction: column; gap: 15px; margin-top: 15px;">`;
    myMatches.forEach(m => {
        let t1 = m.type === 'poule' ? m.team1 : m.resolvedT1; 
        let t2 = m.type === 'poule' ? m.team2 : m.resolvedT2;
        let isPlaying = t1 === selectedTeam || t2 === selectedTeam;
        let isRef = (m.type === 'poule' ? m.referee : resolveTeam(m.referee)) === selectedTeam;
        
        let badge = isPlaying ? `<span class="badge-play">Joueur</span>` : `<span class="badge-ref">Arbitre</span>`;
        let borderStyle = isPlaying ? 'border-left: 4px solid var(--primary);' : 'border-left: 4px solid #d97706;';

        let matchTitle = m.type === 'poule' ? `📋 Match de ${m.context}` : 
            (m.id.startsWith("CL") ? `⭐ LDC - ${m.context}` : 
            (m.id.startsWith("EL") ? `🌍 Europa - ${m.context}` : `🏆 Coupe - ${m.context}`));

        html += `
        <div class="modern-match-card" style="${borderStyle}">
            <div class="modern-match-header" style="display:block;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                    <span style="color:var(--primary); font-weight:900; font-size:0.95rem;">${matchTitle}</span>${badge}
                </div>
                <div style="color:#64748b; font-size:0.85rem; font-weight:600;">⌚ ${m.time} &nbsp;|&nbsp; 📍 ${m.terrain}</div>
            </div>
            <div class="modern-match-body">
                <div class="modern-match-main">
                    <div class="team-left" style="${t1 === selectedTeam ? 'text-decoration:underline;' : ''}">${t1}</div>
                    <div class="modern-score-display"><span class="score-box">${m.score1 !== null ? m.score1 : '-'}</span><span class="score-divider">:</span><span class="score-box">${m.score2 !== null ? m.score2 : '-'}</span></div>
                    <div class="team-right" style="${t2 === selectedTeam ? 'text-decoration:underline;' : ''}">${t2}</div>
                </div>
                ${(m.type === 'final' && m.tab1 !== null) ? `<div class="tab-display" style="text-align:center; width:100%; margin-top:5px; font-size:0.8rem;">TAB (${m.tab1} - ${m.tab2})</div>` : ''}
                ${(!isPlaying && isRef) ? `<div style="font-size:0.85rem; color:#d97706; margin-top:8px; text-align:center; font-weight:bold;">Sifflez bien ce match ! </div>` : ''}
            </div>
        </div>`;
    });
    container.innerHTML = html + `</div>`;
}

// ================= PHASES FINALES =================
function buildBracketNode(matchId, isPetiteFinale = false) {
    if(!matchId) return '';
    let m = tournamentData.finalsMatches.find(x => x.id === matchId);
    if(!m) return '';
    
    let t1 = resolveTeam(m.team1); let t2 = resolveTeam(m.team2);
    let s1 = m.score1 !== null ? m.score1 : '-'; let s2 = m.score2 !== null ? m.score2 : '-';
    
    let tab1Html = m.tab1 !== null ? `<span class="b-tab-score">(${m.tab1})</span>` : '';
    let tab2Html = m.tab2 !== null ? `<span class="b-tab-score">(${m.tab2})</span>` : '';

    let w1 = '', w2 = '';
    if (m.score1 !== null && m.score2 !== null) {
        if (m.score1 > m.score2 || (m.tab1 !== null && m.tab1 > m.tab2)) w1 = 'winner';
        if (m.score2 > m.score1 || (m.tab2 !== null && m.tab2 > m.tab1)) w2 = 'winner';
    }

    return `
        <div class="b-match-wrapper ${isPetiteFinale ? 'pf-match' : ''}">
            <div class="b-match">
                <div class="b-label">${m.id}</div>
                <div class="b-team ${w1}">
                    <span class="b-name" title="${t1}">${t1}</span>
                    <div class="b-score-container"><span class="b-score">${s1}</span>${tab1Html}</div>
                </div>
                <div class="b-team ${w2}">
                    <span class="b-name" title="${t2}">${t2}</span>
                    <div class="b-score-container"><span class="b-score">${s2}</span>${tab2Html}</div>
                </div>
            </div>
        </div>
    `;
}

function renderBracket(config) {
    if (!config) return '';
    
    // Un petit bloc invisible pour forcer la largeur des colonnes vides
    let ghostNode = `<div class="b-match-wrapper" style="visibility:hidden; height:0; padding-top:0; padding-bottom:0; margin:0;"><div class="b-match"></div></div>`;
    
    // 1. L'arbre principal (Quarts, Demies, Finale)
    let html = `<div class="bracket-wrapper">
                    <div class="bracket">`;
    if (config.qf) { html += `<div class="b-round">`; config.qf.forEach(id => html += buildBracketNode(id)); html += `</div>`; }
    if (config.sf) { html += `<div class="b-round">`; config.sf.forEach(id => html += buildBracketNode(id)); html += `</div>`; }
    if (config.f) { html += `<div class="b-round">`; config.f.forEach(id => html += buildBracketNode(id)); html += `</div>`; }
    html += `       </div>`;
    
    // 2. La Petite Finale avec ses colonnes fantômes pour l'aligner à droite
    if (config.third) { 
        html += `   <div class="bracket" style="margin-top: 15px;">`;
        if (config.qf) { html += `<div class="b-round">${ghostNode}</div>`; } // Colonne invisible Quarts
        if (config.sf) { html += `<div class="b-round">${ghostNode}</div>`; } // Colonne invisible Demies
        html += `       <div class="b-round">
                            <div class="pf-container">
                                ${buildBracketNode(config.third, true)}
                            </div>
                        </div>
                    </div>`; 
    }
    
    html += `</div>`;
    return html;
}

function renderLeagueTab(leagueId) {
    const config = getLeagueConfig(leagueId);
    const app = document.getElementById(`content-${leagueId}`);
    if (!tournamentData || !tournamentData.isSetup) { app.innerHTML = `<p style="text-align:center; padding: 20px;">Le tournoi n'est pas encore configuré !</p>`; return; }

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
            let t1 = resolveTeam(m.team1); let t2 = resolveTeam(m.team2); let ref = resolveTeam(m.referee);
            
            html += `
            <div class="modern-match-card">
                <div class="modern-match-header"><span>⌚ ${m.time} | 📍 ${m.terrain}</span><span style="color: #d97706;">Arbitre: ${ref}</span></div>
                <div class="modern-match-body">
                    <div class="modern-match-main">
                        <div class="team-left ${t1.startsWith('Vainq') || t1.startsWith('Perd') || t1.includes('er Poule') || t1.includes('ème Poule') ? 'placeholder' : ''}">${t1}</div>
                        ${adminPassword ? `
                            <div class="modern-score-inputs">
                                <input type="number" pattern="[0-9]*" id="fs1-${m.id}" value="${m.score1 !== null ? m.score1 : ''}" onblur="saveFinalScore('${m.id}', 'fs1-${m.id}', 'fs2-${m.id}', 'ft1-${m.id}', 'ft2-${m.id}')">
                                <span class="score-divider">:</span>
                                <input type="number" pattern="[0-9]*" id="fs2-${m.id}" value="${m.score2 !== null ? m.score2 : ''}" onblur="saveFinalScore('${m.id}', 'fs1-${m.id}', 'fs2-${m.id}', 'ft1-${m.id}', 'ft2-${m.id}')">
                            </div>
                        ` : `<div class="modern-score-display"><span class="score-box">${m.score1 !== null ? m.score1 : '-'}</span><span class="score-divider">:</span><span class="score-box">${m.score2 !== null ? m.score2 : '-'}</span></div>`}
                        <div class="team-right ${t2.startsWith('Vainq') || t2.startsWith('Perd') || t2.includes('er Poule') || t2.includes('ème Poule') ? 'placeholder' : ''}">${t2}</div>
                    </div>
                    ${adminPassword ? `
                        <div class="tab-section">
                            TAB : <input type="number" pattern="[0-9]*" id="ft1-${m.id}" value="${m.tab1 !== null ? m.tab1 : ''}" onblur="saveFinalScore('${m.id}', 'fs1-${m.id}', 'fs2-${m.id}', 'ft1-${m.id}', 'ft2-${m.id}')"> - <input type="number" pattern="[0-9]*" id="ft2-${m.id}" value="${m.tab2 !== null ? m.tab2 : ''}" onblur="saveFinalScore('${m.id}', 'fs1-${m.id}', 'fs2-${m.id}', 'ft1-${m.id}', 'ft2-${m.id}')">
                        </div>
                    ` : (m.tab1 !== null ? `<div class="tab-display">Vainqueur aux TAB (${m.tab1} - ${m.tab2})</div>` : '')}
                </div>
            </div>`;
        });
    });
    app.innerHTML = html;
}

// ================= CLASSEMENT GÉNÉRAL =================
function renderClassement() {
    const app = document.getElementById('content-classement');
    if (!tournamentData || !tournamentData.isSetup) { app.innerHTML = `<div class="card" style="text-align:center;"><h2>⏳ Classement Final</h2><p>Le classement apparaîtra ici au fil du tournoi.</p></div>`; return; }

    let html = `<div class="card"><h2>🏆 Classement Général du Tournoi</h2><div class="ranking-container">`;
    let rankMapping = [
        { rank: 1, teamCode: 'W:CL-F', league: 'cl' }, { rank: 2, teamCode: 'L:CL-F', league: 'cl' },
        { rank: 3, teamCode: 'W:CL-3E', league: 'cl' }, { rank: 4, teamCode: 'L:CL-3E', league: 'cl' },
        { rank: 5, teamCode: 'W:CL-5E', league: 'cl' }, { rank: 6, teamCode: 'L:CL-5E', league: 'cl' },
        { rank: 7, teamCode: 'W:CL-7E', league: 'cl' }, { rank: 8, teamCode: 'L:CL-7E', league: 'cl' },
        { rank: 9, teamCode: 'W:EL-F', league: 'el' }, { rank: 10, teamCode: 'L:EL-F', league: 'el' },
        { rank: 11, teamCode: 'W:EL-11E', league: 'el' }, { rank: 12, teamCode: 'L:EL-11E', league: 'el' },
        { rank: 13, teamCode: 'W:EL-13E', league: 'el' }, { rank: 14, teamCode: 'L:EL-13E', league: 'el' },
        { rank: 15, teamCode: 'W:EL-15E', league: 'el' }, { rank: 16, teamCode: 'L:EL-15E', league: 'el' },
        { rank: 17, teamCode: 'W:SL-F', league: 'sl' }, { rank: 18, teamCode: 'L:SL-F', league: 'sl' },
        { rank: 19, teamCode: 'W:SL-3E', league: 'sl' }, { rank: 20, teamCode: 'L:SL-3E', league: 'sl' }
    ];

    if (tournamentData.teamCount === 24) {
        rankMapping[18] = { rank: 19, teamCode: 'W:SL-19E', league: 'sl' };
        rankMapping[19] = { rank: 20, teamCode: 'L:SL-19E', league: 'sl' };
        rankMapping.push({ rank: 21, teamCode: 'W:SL-21E', league: 'sl' });
        rankMapping.push({ rank: 22, teamCode: 'L:SL-21E', league: 'sl' });
        rankMapping.push({ rank: 23, teamCode: 'W:SL-23E', league: 'sl' });
        rankMapping.push({ rank: 24, teamCode: 'L:SL-23E', league: 'sl' });
    }

    rankMapping.forEach(item => {
        let teamName = resolveTeam(item.teamCode);
        let statusClass = (teamName.startsWith("Vainq.") || teamName.startsWith("Perd.") || teamName.includes("er Poule") || teamName.includes("ème Poule")) ? "pending" : "confirmed";
        if (statusClass === "pending") teamName = "En attente de résultat";
        
        let medal = item.rank === 1 ? '🏆' : (item.rank === 2 ? '🥈' : (item.rank === 3 ? '🥉' : ''));
        html += `<div class="ranking-item league-${item.league} ${statusClass}"><div class="rank-number">${item.rank}</div><div class="rank-team">${medal} ${teamName}</div></div>`;
    });

    app.innerHTML = html + `</div></div>`;
}

// ================= PLANNING GLOBAL ADMIN & DECALAGE =================
function renderAdminSchedule() {
    const app = document.getElementById('content-admin');
    if (!adminPassword) return;

    if (!tournamentData || !tournamentData.isSetup) { app.innerHTML = `<div class="card" style="text-align:center;"><h2>⏳ En attente...</h2><p>Le tournoi n'a pas commencé.</p></div>`; return; }

    let allMatches = [];
    for (let p in tournamentData.matches) tournamentData.matches[p].forEach(m => { allMatches.push({ ...m, context: `Poule ${p}`, type: 'poule', poolId: p }); });
    tournamentData.finalsMatches.forEach(m => { allMatches.push({ ...m, context: m.step, type: 'final' }); });
    allMatches.sort((a, b) => a.time.localeCompare(b.time));
    
    let groupedMatches = {};
    allMatches.forEach(m => { if (!groupedMatches[m.time]) groupedMatches[m.time] = []; groupedMatches[m.time].push(m); });

    let html = `
        <div class="card" style="border-left: 5px solid var(--secondary); margin-bottom: 20px;">
            <h2 style="color:var(--secondary);">⏱️ Décaler les Phases Finales</h2>
            <div style="display: flex; gap: 10px; margin-bottom: 15px; flex-wrap: wrap;">
                <div style="flex: 1;"><label>Nouvelle Reprise</label><input type="time" id="reschedule-start" value="14:00" style="width: 100%; padding: 8px;"></div>
                <div style="flex: 1;"><label>Match (min)</label><input type="number" id="reschedule-duration" value="15" style="width: 100%; padding: 8px;"></div>
                <div style="flex: 1;"><label>Pause</label><input type="number" id="reschedule-break" value="5" style="width: 100%; padding: 8px;"></div>
            </div>
            
            <button class="btn btn-primary" onclick="rescheduleFinals()">Recalculer les heures de l'aprem !</button>
        </div>

        <div class="card" style="border-left: 5px solid #10b981; margin-bottom: 20px;">
            <h2 style="color:#10b981;">🚀 Simulation Rapide</h2>
            <p style="font-size: 0.9rem; color: #64748b; margin-bottom: 10px;">
                Terminer instantanément la phase de poules avec des scores aléatoires pour débloquer les tableaux de ligues.
            </p>
            <button class="btn" style="background-color: #10b981; color: white; width: 100%; padding: 12px; font-size: 1.05rem;" onclick="simulatePoules()">
                Terminer tous les matchs de poules
            </button>
        </div>

        <div class="card"><h2 style="color:var(--danger); border-color:var(--danger);">📅 Emploi du temps global</h2>`;
        
    for (let timeSlot in groupedMatches) {
        // Préparer l'affichage du créneau modifiable
        let slotStartStr = timeSlot.split(' - ')[0].replace('h', ':');
        let safeSlotId = timeSlot.replace(/\s+/g, '').replace(/-/g, '_'); // ID sûr pour le HTML

        html += `
        <div style="display:flex; justify-content:space-between; align-items:center; background:var(--primary); color:white; padding:8px 15px; border-radius:6px; margin: 20px 0 10px; flex-wrap:wrap; gap:10px;">
            <h3 style="margin:0; font-size:1.1rem;">🕒 Créneau : ${timeSlot}</h3>
            <div style="display:flex; align-items:center; gap:8px;">
                <label style="font-size:0.85rem; font-weight:normal;">Décaler à :</label>
                <input type="time" id="delay-input-${safeSlotId}" value="${slotStartStr}" style="color:var(--text); padding:4px 8px; border-radius:4px; border:none; outline:none; font-weight:bold;">
                <button class="btn btn-outline" style="padding:4px 10px; font-size:0.85rem; background:white; color:var(--primary); border:none;" onclick="delaySchedule('${timeSlot}', 'delay-input-${safeSlotId}')">Appliquer</button>
            </div>
        </div>
        <div class="pools-grid">`;
        groupedMatches[timeSlot].forEach(m => {
            if (m.type === 'poule') {
                html += `
                <div class="modern-match-card">
                    <div class="modern-match-header"><span>${m.context} | 📍 ${m.terrain}</span><span style="color: #d97706;">Arbitre: ${m.referee}</span></div>
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
                let t1 = resolveTeam(m.team1); let t2 = resolveTeam(m.team2); let ref = resolveTeam(m.referee);
                let t1Style = t1.startsWith('Vainq') || t1.startsWith('Perd') || t1.includes('Poule') ? 'color:#94a3b8; font-style:italic;' : '';
                let t2Style = t2.startsWith('Vainq') || t2.startsWith('Perd') || t2.includes('Poule') ? 'color:#94a3b8; font-style:italic;' : '';
                
                let matchTitle = m.id.startsWith("CL") ? `⭐ LDC - ${m.context}` : (m.id.startsWith("EL") ? `🌍 Europa - ${m.context}` : `🏆 Coupe - ${m.context}`);

                html += `
                <div class="modern-match-card" style="border-left: 4px solid var(--danger);">
                    <div class="modern-match-header"><span>Phase Finale (${m.id}) | 📍 ${m.terrain}</span><span style="color: #d97706;">Arbitre: ${ref}</span></div>
                    <div class="modern-match-body">
                        <div style="font-weight:900; color:var(--primary); margin-bottom:5px; text-align:center;">${matchTitle}</div>
                        <div class="modern-match-main">
                            <div class="team-left" style="${t1Style}">${t1}</div>
                            <div class="modern-score-inputs">
                                <input type="number" pattern="[0-9]*" id="admin-fs1-${m.id}" value="${m.score1 !== null ? m.score1 : ''}" onblur="saveFinalScore('${m.id}', 'admin-fs1-${m.id}', 'admin-fs2-${m.id}', 'admin-ft1-${m.id}', 'admin-ft2-${m.id}')">
                                <span class="score-divider">:</span>
                                <input type="number" pattern="[0-9]*" id="admin-fs2-${m.id}" value="${m.score2 !== null ? m.score2 : ''}" onblur="saveFinalScore('${m.id}', 'admin-fs1-${m.id}', 'admin-fs2-${m.id}', 'admin-ft1-${m.id}', 'admin-ft2-${m.id}')">
                            </div>
                            <div class="team-right" style="${t2Style}">${t2}</div>
                        </div>
                        <div class="tab-section">
                            TAB : <input type="number" pattern="[0-9]*" id="admin-ft1-${m.id}" value="${m.tab1 !== null ? m.tab1 : ''}" onblur="saveFinalScore('${m.id}', 'admin-fs1-${m.id}', 'admin-fs2-${m.id}', 'admin-ft1-${m.id}', 'admin-ft2-${m.id}')">
                            - <input type="number" pattern="[0-9]*" id="admin-ft2-${m.id}" value="${m.tab2 !== null ? m.tab2 : ''}" onblur="saveFinalScore('${m.id}', 'admin-fs1-${m.id}', 'admin-fs2-${m.id}', 'admin-ft1-${m.id}', 'admin-ft2-${m.id}')">
                        </div>
                    </div>
                </div>`;
            }
        });
        html += `</div>`;
    }
    app.innerHTML = html + `</div>`;
}

// ================= APPELS SERVEUR =================
async function submitSetup() {
    let tc = parseInt(document.getElementById('setup-team-count').value);
    let teamsPerPool = tc / 4;
    let pools = {};
    for (let p of ['A', 'B', 'C', 'D']) {
        let lines = [];
        for (let i = 0; i < teamsPerPool; i++) { let t = document.getElementById(`setup-${p}-${i}`).value.trim(); if (t) lines.push(t); }
        if (lines.length !== teamsPerPool) return alert(`⚠️ La poule ${p} doit avoir ${teamsPerPool} équipes !`); pools[p] = lines;
    }
    
    // NOUVEL AJOUT ICI POUR LES TERRAINS !
    let payload = {
        pools: pools, 
        teamCount: tc,
        startTime: document.getElementById('setup-start').value || "09:00",
        finalsStartTime: document.getElementById('setup-finals-start').value || "14:00",
        matchDuration: parseInt(document.getElementById('setup-duration').value || 20),
        breakDuration: parseInt(document.getElementById('setup-break').value || 5),
        terrainCount: parseInt(document.getElementById('setup-terrains').value || 4)
    };
    
    await apiCall('/api/setup', 'POST', payload);
    fetchData();
}

async function rescheduleFinals() {
    let startTime = document.getElementById('reschedule-start').value;
    let duration = document.getElementById('reschedule-duration').value;
    let pause = document.getElementById('reschedule-break').value;
    if(!startTime) return;
    await apiCall('/api/reschedule-finals', 'POST', { finalsStartTime: startTime, matchDuration: parseInt(duration), breakDuration: parseInt(pause) });
    alert("✅ Les heures des phases finales ont été décalées !");
    fetchData();
}

async function saveScore(poolId, matchId, id1 = `s1-${matchId}`, id2 = `s2-${matchId}`) {
    let s1 = document.getElementById(id1).value; let s2 = document.getElementById(id2).value;
    let m = tournamentData.matches[poolId].find(x => x.id === matchId);
    if ((s1 === "" && m.score1 === null) || (s1 == m.score1 && s2 == m.score2)) return;
    await apiCall('/api/score', 'POST', { poolId, matchId, score1: s1, score2: s2 }); fetchData();
}

async function saveFinalScore(matchId, id1 = `fs1-${matchId}`, id2 = `fs2-${matchId}`, idt1 = `ft1-${matchId}`, idt2 = `ft2-${matchId}`) {
    let s1 = document.getElementById(id1).value, s2 = document.getElementById(id2).value;
    let t1 = document.getElementById(idt1).value, t2 = document.getElementById(idt2).value;
    await apiCall('/api/score-finals', 'POST', { matchId, score1: s1, score2: s2, tab1: t1, tab2: t2 }); fetchData();
}
async function delaySchedule(originalSlot, inputId) {
    let newStartTime = document.getElementById(inputId).value;
    if (!newStartTime) return alert("Veuillez entrer une heure valide.");
    
    let confirmMsg = `Voulez-vous vraiment décaler ce créneau à ${newStartTime} ?\nCela décalera automatiquement TOUS les matchs prévus à cette heure ou après.`;
    if (!confirm(confirmMsg)) return;

    await apiCall('/api/delay', 'POST', { originalSlot: originalSlot, newStartTime: newStartTime });
    fetchData(); // Rafraîchit les données pour tout le monde
}
async function resetTournament() {
    if (confirm("🚨 ATTENTION ! Cela va TOUT effacer (Poules et Finales). Sûr ?")) { await apiCall('/api/reset', 'POST'); fetchData(); }
}

async function simulatePoules() {
    // La vérification de sécurité demandée
    const confirmation = confirm("🎯 Voulez-vous simuler tous les scores de poules restants ?\n\nCela va générer des résultats aléatoires pour terminer la phase de poules et permettre l'affichage des vrais noms d'équipes dans les phases finales.");
    
    if (confirmation) {
        await apiCall('/api/simulate-poules', 'POST'); //
        fetchData(); // Rafraîchit l'affichage pour voir les noms apparaître partout
    }
}