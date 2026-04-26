from flask import Flask, request, jsonify
import json
import os
from datetime import datetime, timedelta

app = Flask(__name__, static_folder='public', static_url_path='')
DB_FILE = 'data.json'
ADMIN_PASSWORD = 'PIOVLV'

def read_db():
    if not os.path.exists(DB_FILE):
        return {"pools": {}, "matches": {}, "isSetup": False, "finalsMatches": [], "teamCount": 20, "terrainCount": 4}
    with open(DB_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)
        if "teamCount" not in data: data["teamCount"] = 20
        if "terrainCount" not in data: data["terrainCount"] = 4
        return data

def write_db(data):
    with open(DB_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def is_admin():
    return request.headers.get('x-admin-password') == ADMIN_PASSWORD

@app.route('/')
def index():
    return app.send_static_file('index.html')

@app.route('/api/data', methods=['GET'])
def get_data():
    return jsonify(read_db())

@app.route('/api/setup', methods=['POST'])
def setup_tournament():
    if not is_admin(): return jsonify({"error": "Non autorisé"}), 403
    req = request.json
    pools = req.get('pools', {})
    teamCount = int(req.get('teamCount', 20))
    terrainCount = int(req.get('terrainCount', 4)) # NOUVEAU: Choix du nombre de terrains
    start_time_str = req.get('startTime', '09:00')
    finals_start_str = req.get('finalsStartTime', '14:00')
    duration = int(req.get('matchDuration', 15))
    pause = int(req.get('breakDuration', 5))
    
    data = {"pools": pools, "matches": {}, "finalsMatches": [], "isSetup": True, "teamCount": teamCount, "terrainCount": terrainCount}
    start_t = datetime.strptime(start_time_str, "%H:%M")
    referee_mapping = {'A': 'B', 'B': 'A', 'C': 'D', 'D': 'C'}
    
    # ==========================================
    # 1. MATCHS DE POULES
    # ==========================================
    if terrainCount == 4:
        # LOGIQUE ORIGINALE (4 TERRAINS)
        if teamCount == 20:
            # 5 équipes : Chaque équipe joue 4 matchs et arbitre 2 fois.
            # Espacement parfait garanti, aucun enchaînement.
            schedule_template = [
                [0,1,2], [2,3,4], [0,4,3], [1,2,4], [3,4,1], 
                [0,2,3], [1,4,2], [0,3,1], [2,4,0], [1,3,0]
            ]
        else:
            # 6 équipes : Chaque équipe joue 5 matchs et arbitre 2 ou 3 fois.
            # L'espacement moyen est de 2 matchs de repos entre chaque apparition sur le terrain.
            schedule_template = [
                [0,1,2], [2,3,4], [4,5,0], [0,2,1], [1,4,3], 
                [3,5,2], [2,4,5], [0,3,4], [1,5,0], [0,4,3], 
                [2,5,1], [1,3,5], [0,5,4], [3,4,1], [1,2,0]
            ]
        terrain_mapping = {'A': 'Terrain 1', 'B': 'Terrain 2', 'C': 'Terrain 3', 'D': 'Terrain 4'}

        for p, teams in pools.items():
            data["matches"][p] = []
            ref_teams = pools.get(referee_mapping.get(p), teams)
            for i, mdef in enumerate(schedule_template):
                ms = start_t + timedelta(minutes=(duration+pause) * i)
                me = ms + timedelta(minutes=duration)
                data["matches"][p].append({
                    "id": f"{p}-{i+1}",
                    "time": f"{ms.strftime('%Hh%M')} - {me.strftime('%Hh%M')}",
                    "terrain": terrain_mapping[p],
                    "team1": teams[mdef[0]], "team2": teams[mdef[1]], "referee": ref_teams[mdef[2]],
                    "score1": None, "score2": None
                })
    
    elif terrainCount == 5:
        # NOUVELLE LOGIQUE DYNAMIQUE (5 TERRAINS)
        if teamCount == 20:
            match_pairings = [
                [0,1], [2,3], [0,4], [1,2], [3,4], 
                [0,2], [1,4], [0,3], [2,4], [1,3]
            ]
        else:
            match_pairings = [
                [0,1], [2,3], [4,5], [0,2], [1,4], 
                [3,5], [2,4], [0,3], [1,5], [0,4], 
                [2,5], [1,3], [0,5], [3,4], [1,2]
            ]
               
        queues = {p: [] for p in pools.keys()}
        for p in pools.keys():
            data["matches"][p] = []
            for i, mdef in enumerate(match_pairings):
                queues[p].append({
                    "id": f"{p}-{i+1}", "t1": pools[p][mdef[0]], "t2": pools[p][mdef[1]], "pool": p
                })
                
        t5_cycle = ['A', 'B', 'C', 'D']
        t5_idx = 0
        current_time = start_t
        
        while any(len(q) > 0 for q in queues.values()):
            busy_teams = set()
            matches_this_round = []
            
            round_terrains = [
                ('Terrain 1', 'A'), ('Terrain 2', 'B'), 
                ('Terrain 3', 'C'), ('Terrain 4', 'D'), 
                ('Terrain 5', t5_cycle[t5_idx])
            ]
            t5_idx = (t5_idx + 1) % 4
            
            # ETAPE A: Assigner les matchs aux terrains
            for terrain_name, target_pool in round_terrains:
                pools_to_try = [target_pool] + ([p for p in ['A', 'B', 'C', 'D'] if p != target_pool] if terrain_name == 'Terrain 5' else [])
                
                for p in pools_to_try:
                    match_found = False
                    for i, m in enumerate(queues[p]):
                        if m['t1'] not in busy_teams and m['t2'] not in busy_teams:
                            busy_teams.add(m['t1'])
                            busy_teams.add(m['t2'])
                            matches_this_round.append({'queue_idx': i, 'pool': p, 'terrain': terrain_name, 'match_data': m})
                            match_found = True
                            break
                    if match_found: break
                        
            # ETAPE B: Assigner les arbitres dynamiquement
            for item in matches_this_round:
                p = item['pool']
                m = item['match_data']
                ref_pool = referee_mapping[p]
                
                ref_team = next((cand for cand in pools[ref_pool] if cand not in busy_teams), pools[ref_pool][0])
                busy_teams.add(ref_team)
                
                ms = current_time
                me = current_time + timedelta(minutes=duration)
                data["matches"][p].append({
                    "id": m['id'],
                    "time": f"{ms.strftime('%Hh%M')} - {me.strftime('%Hh%M')}",
                    "terrain": item['terrain'],
                    "team1": m['t1'], "team2": m['t2'], "referee": ref_team,
                    "score1": None, "score2": None
                })
            
            matches_this_round.sort(key=lambda x: x['queue_idx'], reverse=True)
            for item in matches_this_round:
                queues[item['pool']].pop(item['queue_idx'])
                
            current_time += timedelta(minutes=(duration+pause))
            
    # ==========================================
    # 2. PHASES FINALES
    # ==========================================
    def add_m(mid, phase, step, t1, t2, ref):
        return {"id": mid, "phase": phase, "step": step, "team1": t1, "team2": t2, "referee": ref, "score1": None, "score2": None, "tab1": None, "tab2": None, "time": "", "terrain": ""}
    
    fm = [
        # CHAMPIONS LEAGUE
        add_m("CL-QF1", "🥇 Champions League (Places 1 à 8)", "Quart de Finale", "P-A-1", "P-C-2", "P-D-4"),
        add_m("CL-QF2", "🥇 Champions League (Places 1 à 8)", "Quart de Finale", "P-D-1", "P-B-2", "P-C-4"),
        add_m("CL-QF3", "🥇 Champions League (Places 1 à 8)", "Quart de Finale", "P-B-1", "P-D-2", "P-A-4"),
        add_m("CL-QF4", "🥇 Champions League (Places 1 à 8)", "Quart de Finale", "P-C-1", "P-A-2", "P-B-4"),
        add_m("CL-C1", "🥇 Champions League (Places 1 à 8)", "Match de Classement", "L:CL-QF1", "L:CL-QF2", "P-C-5"),
        add_m("CL-C2", "🥇 Champions League (Places 1 à 8)", "Match de Classement", "L:CL-QF3", "L:CL-QF4", "P-D-5"),
        add_m("CL-SF1", "🥇 Champions League (Places 1 à 8)", "Demi-Finale", "W:CL-QF1", "W:CL-QF2", "P-A-5"),
        add_m("CL-SF2", "🥇 Champions League (Places 1 à 8)", "Demi-Finale", "W:CL-QF3", "W:CL-QF4", "P-B-5"),
        add_m("CL-7E", "🥇 Champions League (Places 1 à 8)", "Places 7 et 8", "L:CL-C1", "L:CL-C2", "P-C-3"),
        add_m("CL-5E", "🥇 Champions League (Places 1 à 8)", "Places 5 et 6", "W:CL-C1", "W:CL-C2", "P-D-3"),
        add_m("CL-3E", "🥇 Champions League (Places 1 à 8)", "Petite Finale", "L:CL-SF1", "L:CL-SF2", "P-B-3"),
        add_m("CL-F", "🥇 Champions League (Places 1 à 8)", "GRANDE FINALE", "W:CL-SF1", "W:CL-SF2", "P-A-3"),

        # EUROPA LEAGUE
        add_m("EL-QF1", "🥈 Europa League (Places 9 à 16)", "Quart de Finale", "P-A-3", "P-C-4", "P-B-1"),
        add_m("EL-QF2", "🥈 Europa League (Places 9 à 16)", "Quart de Finale", "P-D-3", "P-B-4", "P-A-1"),
        add_m("EL-QF3", "🥈 Europa League (Places 9 à 16)", "Quart de Finale", "P-B-3", "P-D-4", "P-C-1"),
        add_m("EL-QF4", "🥈 Europa League (Places 9 à 16)", "Quart de Finale", "P-C-3", "P-A-4", "P-D-1"),
        add_m("EL-C1", "🥈 Europa League (Places 9 à 16)", "Match de Classement", "L:EL-QF1", "L:EL-QF2", "P-A-2"),
        add_m("EL-C2", "🥈 Europa League (Places 9 à 16)", "Match de Classement", "L:EL-QF3", "L:EL-QF4", "P-B-2"),
        add_m("EL-SF1", "🥈 Europa League (Places 9 à 16)", "Demi-Finale", "W:EL-QF1", "W:EL-QF2", "P-C-2"),
        add_m("EL-SF2", "🥈 Europa League (Places 9 à 16)", "Demi-Finale", "W:EL-QF3", "W:EL-QF4", "P-D-2"),
        add_m("EL-15E", "🥈 Europa League (Places 9 à 16)", "Places 15 et 16", "L:EL-C1", "L:EL-C2", "P-A-4"),
        add_m("EL-13E", "🥈 Europa League (Places 9 à 16)", "Places 13 et 14", "W:EL-C1", "W:EL-C2", "P-B-4"),
        add_m("EL-11E", "🥈 Europa League (Places 9 à 16)", "Places 11 et 12", "L:EL-SF1", "L:EL-SF2", "P-C-4"),
        add_m("EL-F", "🥈 Europa League (Places 9 à 16)", "Finale Europa League", "W:EL-SF1", "W:EL-SF2", "P-D-4"),
    ]

    # COMPRESSION DES SLOTS FINALES SELON LE NOMBRE DE TERRAINS
    if teamCount == 20:
        fm += [
            add_m("SL-SF1", "🥉 Sunday League (Places 17 à 20)", "Demi-Finale", "P-A-5", "P-C-5", "P-D-2"),
            add_m("SL-SF2", "🥉 Sunday League (Places 17 à 20)", "Demi-Finale", "P-D-5", "P-B-5", "P-C-2"),
            add_m("SL-3E", "🥉 Sunday League (Places 17 à 20)", "Places 19 et 20", "L:SL-SF1", "L:SL-SF2", "P-A-2"),
            add_m("SL-F", "🥉 Sunday League (Places 17 à 20)", "Finale Coupe de Ligue", "W:SL-SF1", "W:SL-SF2", "P-B-2"),
        ]
        if terrainCount == 4:
            slots = [
                ["CL-QF1", "EL-QF1", "CL-QF2", "EL-QF2"],
                ["CL-QF3", "EL-QF3", "CL-QF4", "EL-QF4"],
                ["SL-SF1", "CL-C1", "EL-C1", "SL-SF2"],
                ["CL-C2", "EL-C2", "CL-SF1", "EL-SF1"],
                ["CL-SF2", "EL-SF2", "SL-3E", "CL-7E"],
                ["EL-15E", "CL-5E", "EL-13E", "SL-F"],
                ["EL-11E", "CL-3E", "EL-F"],
                ["CL-F"] 
            ]
        else: # 5 Terrains -> Plus rapide !
            slots = [
                ["CL-QF1", "CL-QF2", "CL-QF3", "CL-QF4", "EL-QF1"],
                ["EL-QF2", "EL-QF3", "EL-QF4", "SL-SF1", "SL-SF2"],
                ["CL-C1", "CL-C2", "EL-C1", "EL-C2", "CL-SF1"],
                ["CL-SF2", "EL-SF1", "EL-SF2", "SL-3E", "CL-7E"],
                ["EL-15E", "CL-5E", "EL-13E", "SL-F", "EL-11E"],
                ["CL-3E", "EL-F", "CL-F"]
            ]
    else:
        fm += [
            add_m("SL-QF1", "🥉 Sunday League (Places 17 à 24)", "Quart de Finale", "P-A-5", "P-C-6", "P-B-2"),
            add_m("SL-QF2", "🥉 Sunday League (Places 17 à 24)", "Quart de Finale", "P-D-5", "P-B-6", "P-A-2"),
            add_m("SL-QF3", "🥉 Sunday League (Places 17 à 24)", "Quart de Finale", "P-B-5", "P-D-6", "P-D-2"),
            add_m("SL-QF4", "🥉 Sunday League (Places 17 à 24)", "Quart de Finale", "P-C-5", "P-A-6", "P-C-2"),
            add_m("SL-C1", "🥉 Sunday League (Places 17 à 24)", "Match de Classement", "L:SL-QF1", "L:SL-QF2", "P-B-3"),
            add_m("SL-C2", "🥉 Sunday League (Places 17 à 24)", "Match de Classement", "L:SL-QF3", "L:SL-QF4", "P-A-3"),
            add_m("SL-SF1", "🥉 Sunday League (Places 17 à 24)", "Demi-Finale", "W:SL-QF1", "W:SL-QF2", "P-D-3"),
            add_m("SL-SF2", "🥉 Sunday League (Places 17 à 24)", "Demi-Finale", "W:SL-QF3", "W:SL-QF4", "P-C-3"),
            add_m("SL-23E", "🥉 Sunday League (Places 17 à 24)", "Places 23 et 24", "L:SL-C1", "L:SL-C2", "P-A-4"),
            add_m("SL-21E", "🥉 Sunday League (Places 17 à 24)", "Places 21 et 22", "W:SL-C1", "W:SL-C2", "P-B-4"),
            add_m("SL-19E", "🥉 Sunday League (Places 17 à 24)", "Places 19 et 20", "L:SL-SF1", "L:SL-SF2", "P-C-4"),
            add_m("SL-F", "🥉 Sunday League (Places 17 à 24)", "Finale Coupe de Ligue", "W:SL-SF1", "W:SL-SF2", "P-D-4"),
        ]
        if terrainCount == 4:
            slots = [
                ["CL-QF1", "EL-QF1", "SL-QF1", "CL-QF2"],
                ["EL-QF2", "SL-QF2", "CL-QF3", "EL-QF3"],
                ["SL-QF3", "CL-QF4", "EL-QF4", "SL-QF4"],
                ["CL-C1", "EL-C1", "SL-C1", "CL-C2"],
                ["EL-C2", "SL-C2", "CL-SF1", "EL-SF1"],
                ["SL-SF1", "CL-SF2", "EL-SF2", "SL-SF2"],
                ["CL-7E", "EL-15E", "SL-23E", "CL-5E"],
                ["EL-13E", "SL-21E", "CL-3E", "SL-19E"],
                ["EL-11E", "SL-F", "EL-F"],
                ["CL-F"]
            ]
        else: # 5 Terrains
            slots = [
                ["CL-QF1", "CL-QF2", "CL-QF3", "CL-QF4", "EL-QF1"],
                ["EL-QF2", "EL-QF3", "EL-QF4", "SL-QF1", "SL-QF2"],
                ["SL-QF3", "SL-QF4", "CL-C1", "CL-C2", "EL-C1"],
                ["EL-C2", "SL-C1", "SL-C2", "CL-SF1", "CL-SF2"],
                ["EL-SF1", "EL-SF2", "SL-SF1", "SL-SF2", "CL-7E"],
                ["EL-15E", "SL-23E", "CL-5E", "EL-13E", "SL-21E"],
                ["CL-3E", "SL-19E", "EL-11E", "SL-F", "EL-F"],
                ["CL-F"]
            ]

    f_start_t = datetime.strptime(finals_start_str, "%H:%M")
    terrains_list = ['Terrain 1', 'Terrain 2', 'Terrain 3', 'Terrain 4']
    if terrainCount == 5: terrains_list.append('Terrain 5')
        
    all_fm = {m['id']: m for m in fm}
    
    for i, slot in enumerate(slots):
        ms = f_start_t + timedelta(minutes=(duration+pause) * i)
        me = ms + timedelta(minutes=duration)
        for j, mid in enumerate(slot):
            all_fm[mid]['time'] = f"{ms.strftime('%Hh%M')} - {me.strftime('%Hh%M')}"
            all_fm[mid]['terrain'] = terrains_list[j]
            data["finalsMatches"].append(all_fm[mid])

    write_db(data)
    return jsonify({"success": True})

@app.route('/api/reschedule-finals', methods=['POST'])
def reschedule_finals():
    if not is_admin(): return jsonify({"error": "Non autorisé"}), 403
    req = request.json
    finals_start_str = req.get('finalsStartTime', '14:00')
    duration = int(req.get('matchDuration', 15))
    pause = int(req.get('breakDuration', 5))
    
    data = read_db()
    if not data.get("isSetup"): return jsonify({"error": "Non configuré"}), 400
    
    teamCount = data.get("teamCount", 20)
    terrainCount = data.get("terrainCount", 4)
    
    # On récupère les mêmes slots que dans setup_tournament
    if teamCount == 20:
        if terrainCount == 4:
            slots = [["CL-QF1", "EL-QF1", "CL-QF2", "EL-QF2"], ["CL-QF3", "EL-QF3", "CL-QF4", "EL-QF4"], ["SL-SF1", "CL-C1", "EL-C1", "SL-SF2"], ["CL-C2", "EL-C2", "CL-SF1", "EL-SF1"], ["CL-SF2", "EL-SF2", "SL-3E", "CL-7E"], ["EL-15E", "CL-5E", "EL-13E", "SL-F"], ["EL-11E", "CL-3E", "EL-F"], ["CL-F"]]
        else:
            slots = [["CL-QF1", "CL-QF2", "CL-QF3", "CL-QF4", "EL-QF1"], ["EL-QF2", "EL-QF3", "EL-QF4", "SL-SF1", "SL-SF2"], ["CL-C1", "CL-C2", "EL-C1", "EL-C2", "CL-SF1"], ["CL-SF2", "EL-SF1", "EL-SF2", "SL-3E", "CL-7E"], ["EL-15E", "CL-5E", "EL-13E", "SL-F", "EL-11E"], ["CL-3E", "EL-F", "CL-F"]]
    else:
        if terrainCount == 4:
            slots = [["CL-QF1", "EL-QF1", "SL-QF1", "CL-QF2"], ["EL-QF2", "SL-QF2", "CL-QF3", "EL-QF3"], ["SL-QF3", "CL-QF4", "EL-QF4", "SL-QF4"], ["CL-C1", "EL-C1", "SL-C1", "CL-C2"], ["EL-C2", "SL-C2", "CL-SF1", "EL-SF1"], ["SL-SF1", "CL-SF2", "EL-SF2", "SL-SF2"], ["CL-7E", "EL-15E", "SL-23E", "CL-5E"], ["EL-13E", "SL-21E", "CL-3E", "SL-19E"], ["EL-11E", "SL-F", "EL-F"], ["CL-F"]]
        else:
            slots = [["CL-QF1", "CL-QF2", "CL-QF3", "CL-QF4", "EL-QF1"], ["EL-QF2", "EL-QF3", "EL-QF4", "SL-QF1", "SL-QF2"], ["SL-QF3", "SL-QF4", "CL-C1", "CL-C2", "EL-C1"], ["EL-C2", "SL-C1", "SL-C2", "CL-SF1", "CL-SF2"], ["EL-SF1", "EL-SF2", "SL-SF1", "SL-SF2", "CL-7E"], ["EL-15E", "SL-23E", "CL-5E", "EL-13E", "SL-21E"], ["CL-3E", "SL-19E", "EL-11E", "SL-F", "EL-F"], ["CL-F"]]

    f_start_t = datetime.strptime(finals_start_str, "%H:%M")
    for i, slot in enumerate(slots):
        ms = f_start_t + timedelta(minutes=(duration+pause) * i)
        me = ms + timedelta(minutes=duration)
        time_str = f"{ms.strftime('%Hh%M')} - {me.strftime('%Hh%M')}"
        for m in data["finalsMatches"]:
            if m["id"] in slot:
                m["time"] = time_str
                
    write_db(data)
    return jsonify({"success": True})

@app.route('/api/delay', methods=['POST'])
def delay_schedule():
    if not is_admin(): return jsonify({"error": "Non autorisé"}), 403
    req = request.json
    original_slot = req.get('originalSlot') # ex: "09h00 - 09h15"
    new_start_time_str = req.get('newStartTime') # ex: "09:15"

    if not original_slot or not new_start_time_str:
        return jsonify({"error": "Paramètres manquants"}), 400

    data = read_db()
    if not data.get("isSetup"): return jsonify({"error": "Non configuré"}), 400

    try:
        # Extraire l'heure de début du créneau d'origine ("09h00")
        orig_start_str = original_slot.split(' - ')[0]
        orig_start_dt = datetime.strptime(orig_start_str, "%Hh%M")

        # Analyser la nouvelle heure demandée par l'admin ("09:15")
        new_start_dt = datetime.strptime(new_start_time_str, "%H:%M")

        # Calculer le décalage (delta)
        delta = new_start_dt - orig_start_dt

        # Appliquer ce décalage à tous les matchs de poules concernés
        for p in data["matches"]:
            for m in data["matches"][p]:
                m_start_str = m["time"].split(' - ')[0]
                m_start_dt = datetime.strptime(m_start_str, "%Hh%M")
                
                # Si le match est prévu à cette heure-là ou plus tard, on le décale
                if m_start_dt >= orig_start_dt:
                    m_end_str = m["time"].split(' - ')[1]
                    m_end_dt = datetime.strptime(m_end_str, "%Hh%M")
                    
                    new_m_start = m_start_dt + delta
                    new_m_end = m_end_dt + delta
                    m["time"] = f"{new_m_start.strftime('%Hh%M')} - {new_m_end.strftime('%Hh%M')}"

        # Appliquer le même décalage aux matchs des phases finales
        for m in data["finalsMatches"]:
            m_start_str = m["time"].split(' - ')[0]
            m_start_dt = datetime.strptime(m_start_str, "%Hh%M")
            
            if m_start_dt >= orig_start_dt:
                m_end_str = m["time"].split(' - ')[1]
                m_end_dt = datetime.strptime(m_end_str, "%Hh%M")
                
                new_m_start = m_start_dt + delta
                new_m_end = m_end_dt + delta
                m["time"] = f"{new_m_start.strftime('%Hh%M')} - {new_m_end.strftime('%Hh%M')}"

        write_db(data)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/score', methods=['POST'])
def save_score():
    if not is_admin(): return jsonify({"error": "Non autorisé"}), 403
    req = request.json
    data = read_db()
    for match in data["matches"].get(req.get('poolId'), []):
        if match["id"] == req.get('matchId'):
            match["score1"] = int(req.get('score1')) if req.get('score1') != "" else None
            match["score2"] = int(req.get('score2')) if req.get('score2') != "" else None
            write_db(data)
            return jsonify({"success": True})
    return jsonify({"error": "Match non trouvé"}), 404

@app.route('/api/score-finals', methods=['POST'])
def save_score_finals():
    if not is_admin(): return jsonify({"error": "Non autorisé"}), 403
    req = request.json
    data = read_db()
    for m in data['finalsMatches']:
        if m['id'] == req.get('matchId'):
            m['score1'] = int(req['score1']) if req.get('score1') != "" else None
            m['score2'] = int(req['score2']) if req.get('score2') != "" else None
            m['tab1'] = int(req['tab1']) if req.get('tab1') != "" else None
            m['tab2'] = int(req['tab2']) if req.get('tab2') != "" else None
            write_db(data)
            return jsonify({"success": True})
    return jsonify({"error": "Match non trouvé"}), 404

@app.route('/api/simulate-poules', methods=['POST'])
def simulate_poules():
    if not is_admin(): return jsonify({"error": "Non autorisé"}), 403 #
    data = read_db() #
    import random
    
    # Parcours de toutes les poules et tous les matchs
    for p in data["matches"]:
        for m in data["matches"][p]:
            # On ne remplit que si le score est vide pour ne pas écraser vos vrais résultats
            if m["score1"] is None: m["score1"] = random.randint(0, 4)
            if m["score2"] is None: m["score2"] = random.randint(0, 4)
            
    write_db(data) #
    return jsonify({"success": True})

# Ajoutez ceci avec vos autres routes API (par exemple sous toggle-ranking ou simulate-poules)
@app.route('/api/rename-team', methods=['POST'])
def rename_team():
    if not is_admin(): return jsonify({"error": "Non autorisé"}), 403
    req = request.json
    old_name = req.get('oldName')
    new_name = req.get('newName')
    
    if not old_name or not new_name:
        return jsonify({"error": "Paramètres manquants"}), 400
        
    data = read_db()
    if not data.get("isSetup"): return jsonify({"error": "Non configuré"}), 400
    
    # 1. Remplacer dans la liste des poules
    for p in data["pools"]:
        for i in range(len(data["pools"][p])):
            if data["pools"][p][i] == old_name:
                data["pools"][p][i] = new_name
                
    # 2. Remplacer dans l'historique de tous les matchs (joueurs et arbitres)
    for p in data["matches"]:
        for m in data["matches"][p]:
            if m["team1"] == old_name: m["team1"] = new_name
            if m["team2"] == old_name: m["team2"] = new_name
            if m["referee"] == old_name: m["referee"] = new_name
            
    write_db(data)
    return jsonify({"success": True})

@app.route('/api/reset', methods=['POST'])
def reset_tournament():
    if not is_admin(): return jsonify({"error": "Non autorisé"}), 403
    with open(DB_FILE, 'w', encoding='utf-8') as f: json.dump({"pools": {}, "matches": {}, "isSetup": False, "finalsMatches": [], "teamCount": 20, "terrainCount": 4}, f, indent=2)
    return jsonify({"success": True})

@app.route('/api/verify-pwd', methods=['POST'])
def verify_pwd():
    if not is_admin(): 
        return jsonify({"error": "Mot de passe invalide"}), 403
    return jsonify({"success": True})

if __name__ == '__main__':
    app.run(debug=True, port=3000, host='0.0.0.0')