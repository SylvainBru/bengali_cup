let adminPassword = localStorage.getItem('adminPwd') || null;
let tournamentData = null;

document.addEventListener('DOMContentLoaded', () => {
    fetchData();
    setInterval(() => {
        if (!adminPassword && tournamentData && tournamentData.isSetup) fetchData();
    }, 15000);
});

function login() {
    if (adminPassword) {
        adminPassword = null;
        localStorage.removeItem('adminPwd');
        fetchData();
    } else {
        const pwd = prompt("Mot de passe Admin :");
        if (pwd) {
            adminPassword = pwd;
            localStorage.setItem('adminPwd', pwd);
            fetchData();
        }
    }
}

function updateHeader() {
    const badge = document.getElementById('admin-status');
    const btnLogin = document.getElementById('btn-login');
    const btnReset = document.getElementById('btn-reset');

    if (adminPassword) {
        badge.textContent = "Mode ADMIN";
        badge.className = "status-badge admin";
        btnLogin.textContent = "Quitter";
        btnReset.style.display = 'block';
    } else {
        badge.textContent = "Spectateur (Live)";
        badge.className = "status-badge spectateur";
        btnLogin.textContent = "Admin";
        btnReset.style.display = 'none';
    }
}

async function apiCall(endpoint, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (adminPassword) headers['x-admin-password'] = adminPassword;

    try {
        const res = await fetch(endpoint, {
            method,
            headers,
            body: body ? JSON.stringify(body) : null
        });

        if (res.status === 403) {
            alert("Mot de passe invalide !");
            adminPassword = null;
            localStorage.removeItem('adminPwd');
            updateHeader();
            return null;
        }
        return await res.json();
    } catch (e) {
        console.error("Erreur réseau", e);
        return null;
    }
}

async function fetchData() {
    updateHeader();
    const data = await apiCall('/api/data');
    if (data) {
        tournamentData = data;
        render();
    }
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

function render() {
    const app = document.getElementById('app-content');
    
    if (!tournamentData.isSetup) {
        if (!adminPassword) {
            app.innerHTML = `
                <div class="card" style="text-align:center; margin-top:20px;">
                    <h2>⏳ En attente du tirage...</h2>
                    <p>Le tournoi n'a pas encore commencé. L'admin doit valider les équipes.</p>
                </div>`;
            return;
        }
        
        // Mode Setup (Admin)
        let setupHtml = `
            <div class="card">
                <h2>⚙️ Configuration des horaires</h2>
                <div style="display: flex; gap: 10px; margin-bottom: 25px; flex-wrap: wrap;">
                    <div style="flex: 1; min-width: 100px;">
                        <label style="font-size: 0.9rem; font-weight: bold; color: var(--primary);">Début Tournoi</label>
                        <input type="time" id="setup-start" value="09:00" style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid var(--border); font-size:1rem; outline: none;">
                    </div>
                    <div style="flex: 1; min-width: 100px;">
                        <label style="font-size: 0.9rem; font-weight: bold; color: var(--primary);">Durée match (min)</label>
                        <input type="number" id="setup-duration" value="20" style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid var(--border); font-size:1rem; outline: none;">
                    </div>
                    <div style="flex: 1; min-width: 100px;">
                        <label style="font-size: 0.9rem; font-weight: bold; color: var(--primary);">Pause (min)</label>
                        <input type="number" id="setup-break" value="5" style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid var(--border); font-size:1rem; outline: none;">
                    </div>
                </div>

                <h2>🎲 Noms des Équipes</h2>
                <p style="margin-bottom:15px; font-size:0.9rem;">Entrez le nom de chaque équipe dans sa case respective.</p>
        `;

        const poolsList = ['01', '02', '03', '04'];
        let teamCounter = 1;

        poolsList.forEach(p => {
            setupHtml += `
                <div class="setup-group" style="background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid var(--border); margin-bottom: 20px;">
                    <label style="display:block; margin-bottom: 12px; color: var(--primary); font-size: 1.1rem;"><b>Poule ${p}</b></label>
            `;
            
            for(let i = 0; i < 5; i++) {
                setupHtml += `
                    <div style="display:flex; align-items:center; margin-bottom: 8px;">
                        <span style="width: 25px; font-weight:bold; color:#64748b;">${i+1}.</span>
                        <input type="text" id="setup-${p}-${i}" value="Équipe ${teamCounter}" 
                               style="flex: 1; padding: 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 1rem; outline: none;">
                    </div>
                `;
                teamCounter++;
            }
            setupHtml += `</div>`; 
        });

        setupHtml += `
                <button class="btn btn-primary" onclick="submitSetup()">Lancer le Tournoi !</button>
            </div>
        `;
        
        app.innerHTML = setupHtml;
        return;
    }

    // Affichage des Poules
    let html = `<div class="pools-grid">`;
    for (let poolId in tournamentData.pools) {
        let standings = calculateStandings(poolId);
        
        html += `
        <div class="card">
            <h2>Poule ${poolId}</h2>
            
            <div class="table-wrapper">
                <table>
                    <tr><th>#</th><th class="team-name">Équipe</th><th>Pts</th><th>J</th><th>V</th><th>N</th><th>D</th><th>BP</th><th>BC</th><th>Diff</th></tr>
                    ${standings.map((s, idx) => `
                        <tr class="${idx < 2 ? 'qualif-row' : ''}">
                            <td><b>${idx + 1}</b></td>
                            <td class="team-name">${s.name}</td>
                            <td><b style="color:var(--primary); font-size:1.1rem;">${s.Pts}</b></td>
                            <td>${s.J}</td><td>${s.V}</td><td>${s.N}</td><td>${s.D}</td>
                            <td>${s.BP}</td><td>${s.BC}</td>
                            <td><b>${s.Diff > 0 ? '+'+s.Diff : s.Diff}</b></td>
                        </tr>
                    `).join('')}
                </table>
            </div>
            
            <div class="matches-list">
                ${tournamentData.matches[poolId].map(m => `
                    <div class="match-card">
                        <div class="match-header">
                            <span>⌚ ${m.time}</span>
                            <span class="match-ref" style="color: #e67e22; font-weight: 600;">Arbitre: ${m.referee}</span>
                        </div>
                        <div class="match-body">
                            <div class="match-team">${m.team1}</div>
                            
                            ${adminPassword ? `
                                <div class="score-inputs">
                                    <input type="number" pattern="[0-9]*" id="s1-${m.id}" value="${m.score1 !== null ? m.score1 : ''}" onblur="saveScore('${poolId}', '${m.id}')">
                                    <span>-</span>
                                    <input type="number" pattern="[0-9]*" id="s2-${m.id}" value="${m.score2 !== null ? m.score2 : ''}" onblur="saveScore('${poolId}', '${m.id}')">
                                </div>
                            ` : `
                                <div class="score-display">
                                    ${m.score1 !== null ? m.score1 : '-'} : ${m.score2 !== null ? m.score2 : '-'}
                                </div>
                            `}
                            
                            <div class="match-team">${m.team2}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>`;
    }
    html += `</div>`;
    app.innerHTML = html;
}

async function submitSetup() {
    let pools = {};
    for (let p of ['01', '02', '03', '04']) {
        let lines = [];
        for (let i = 0; i < 5; i++) {
            let teamName = document.getElementById(`setup-${p}-${i}`).value.trim();
            if (teamName) lines.push(teamName);
        }
        if (lines.length !== 5) return alert(`⚠️ La poule ${p} doit avoir 5 équipes avec un nom valide !`);
        pools[p] = lines;
    }

    // Récupération des nouveaux paramètres de temps
    let startTime = document.getElementById('setup-start').value || "09:00";
    let matchDuration = document.getElementById('setup-duration').value || 20;
    let breakDuration = document.getElementById('setup-break').value || 5;

    await apiCall('/api/setup', 'POST', { 
        pools,
        startTime,
        matchDuration: parseInt(matchDuration),
        breakDuration: parseInt(breakDuration)
    });
    fetchData();
}

async function saveScore(poolId, matchId) {
    let s1 = document.getElementById(`s1-${matchId}`).value;
    let s2 = document.getElementById(`s2-${matchId}`).value;
    
    let match = tournamentData.matches[poolId].find(m => m.id === matchId);
    if ((s1 === "" && match.score1 === null) || (s1 == match.score1 && s2 == match.score2)) return;

    await apiCall('/api/score', 'POST', { poolId, matchId, score1: s1, score2: s2 });
    fetchData();
}

async function resetTournament() {
    if (confirm("🚨 ATTENTION ! Cela va tout effacer (poules et scores). Sûr ?")) {
        await apiCall('/api/reset', 'POST');
        fetchData();
    }
}