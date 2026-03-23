from flask import Flask, request, jsonify
import json
import os
from datetime import datetime, timedelta

app = Flask(__name__, static_folder='public', static_url_path='')
DB_FILE = 'data.json'
ADMIN_PASSWORD = 'admin'

def read_db():
    if not os.path.exists(DB_FILE):
        return {"pools": {}, "matches": {}, "isSetup": False, "finalsMatches": [], "teamCount": 20}
    with open(DB_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)
        if "teamCount" not in data: data["teamCount"] = 20
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
    start_time_str = req.get('startTime', '09:00')
    finals_start_str = req.get('finalsStartTime', '14:00')
    duration = int(req.get('matchDuration', 15))
    pause = int(req.get('breakDuration', 5))
    
    data = {"pools": pools, "matches": {}, "finalsMatches": [], "isSetup": True, "teamCount": teamCount}
    
    # 1. MATCHS DE POULES
    if teamCount == 20:
        schedule_template = [[0,1,2], [2,3,4], [0,4,1], [1,2,3], [3,4,0], [0,2,4], [1,3,0], [1,4,2], [2,4,3], [0,3,1]]
    else:
        schedule_template = [[0,1,2], [2,3,4], [4,5,0], [0,2,1], [1,4,3], [3,5,2], [0,3,4], [2,5,1], [1,5,3], [0,4,5], [1,2,0], [3,4,2], [0,5,1], [2,4,3], [1,3,5]]

    start_t = datetime.strptime(start_time_str, "%H:%M")
    referee_mapping = {'A': 'B', 'B': 'A', 'C': 'D', 'D': 'C'}
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
            
    # 2. PHASES FINALES (Avec arbitres automatiques !)
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

    # COUPE DE LA LIGUE (MIXÉE DANS LES SLOTS)
    if teamCount == 20:
        fm += [
            add_m("CDL-SF1", "🥉 Coupe de la Ligue (Places 17 à 20)", "Demi-Finale", "P-A-5", "P-C-5", "P-D-2"),
            add_m("CDL-SF2", "🥉 Coupe de la Ligue (Places 17 à 20)", "Demi-Finale", "P-D-5", "P-B-5", "P-C-2"),
            add_m("CDL-3E", "🥉 Coupe de la Ligue (Places 17 à 20)", "Places 19 et 20", "L:CDL-SF1", "L:CDL-SF2", "P-A-2"),
            add_m("CDL-F", "🥉 Coupe de la Ligue (Places 17 à 20)", "Finale Coupe de Ligue", "W:CDL-SF1", "W:CDL-SF2", "P-B-2"),
        ]
        # Mélange complet des Leagues + FINALE CL SEULE A LA FIN
        slots = [
            ["CL-QF1", "EL-QF1", "CL-QF2", "EL-QF2"],
            ["CL-QF3", "EL-QF3", "CL-QF4", "EL-QF4"],
            ["CDL-SF1", "CL-C1", "EL-C1", "CDL-SF2"],
            ["CL-C2", "EL-C2", "CL-SF1", "EL-SF1"],
            ["CL-SF2", "EL-SF2", "CDL-3E", "CL-7E"],
            ["EL-15E", "CL-5E", "EL-13E", "CDL-F"],
            ["EL-11E", "CL-3E", "EL-F"],
            ["CL-F"] # LA GRANDE FINALE TOUTE SEULE !
        ]
    else:
        fm += [
            add_m("CDL-QF1", "🥉 Coupe de la Ligue (Places 17 à 24)", "Quart de Finale", "P-A-5", "P-C-6", "P-B-2"),
            add_m("CDL-QF2", "🥉 Coupe de la Ligue (Places 17 à 24)", "Quart de Finale", "P-D-5", "P-B-6", "P-A-2"),
            add_m("CDL-QF3", "🥉 Coupe de la Ligue (Places 17 à 24)", "Quart de Finale", "P-B-5", "P-D-6", "P-D-2"),
            add_m("CDL-QF4", "🥉 Coupe de la Ligue (Places 17 à 24)", "Quart de Finale", "P-C-5", "P-A-6", "P-C-2"),
            add_m("CDL-C1", "🥉 Coupe de la Ligue (Places 17 à 24)", "Match de Classement", "L:CDL-QF1", "L:CDL-QF2", "P-B-3"),
            add_m("CDL-C2", "🥉 Coupe de la Ligue (Places 17 à 24)", "Match de Classement", "L:CDL-QF3", "L:CDL-QF4", "P-A-3"),
            add_m("CDL-SF1", "🥉 Coupe de la Ligue (Places 17 à 24)", "Demi-Finale", "W:CDL-QF1", "W:CDL-QF2", "P-D-3"),
            add_m("CDL-SF2", "🥉 Coupe de la Ligue (Places 17 à 24)", "Demi-Finale", "W:CDL-QF3", "W:CDL-QF4", "P-C-3"),
            add_m("CDL-23E", "🥉 Coupe de la Ligue (Places 17 à 24)", "Places 23 et 24", "L:CDL-C1", "L:CDL-C2", "P-A-4"),
            add_m("CDL-21E", "🥉 Coupe de la Ligue (Places 17 à 24)", "Places 21 et 22", "W:CDL-C1", "W:CDL-C2", "P-B-4"),
            add_m("CDL-19E", "🥉 Coupe de la Ligue (Places 17 à 24)", "Places 19 et 20", "L:CDL-SF1", "L:CDL-SF2", "P-C-4"),
            add_m("CDL-F", "🥉 Coupe de la Ligue (Places 17 à 24)", "Finale Coupe de Ligue", "W:CDL-SF1", "W:CDL-SF2", "P-D-4"),
        ]
        slots = [
            ["CL-QF1", "EL-QF1", "CDL-QF1", "CL-QF2"],
            ["EL-QF2", "CDL-QF2", "CL-QF3", "EL-QF3"],
            ["CDL-QF3", "CL-QF4", "EL-QF4", "CDL-QF4"],
            ["CL-C1", "EL-C1", "CDL-C1", "CL-C2"],
            ["EL-C2", "CDL-C2", "CL-SF1", "EL-SF1"],
            ["CDL-SF1", "CL-SF2", "EL-SF2", "CDL-SF2"],
            ["CL-7E", "EL-15E", "CDL-23E", "CL-5E"],
            ["EL-13E", "CDL-21E", "CL-3E", "CDL-19E"],
            ["EL-11E", "CDL-F", "EL-F"],
            ["CL-F"] # LA GRANDE FINALE TOUTE SEULE !
        ]

    f_start_t = datetime.strptime(finals_start_str, "%H:%M")
    terrains = ['Terrain 1', 'Terrain 2', 'Terrain 3', 'Terrain 4']
    all_fm = {m['id']: m for m in fm}
    
    for i, slot in enumerate(slots):
        ms = f_start_t + timedelta(minutes=(duration+pause) * i)
        me = ms + timedelta(minutes=duration)
        for j, mid in enumerate(slot):
            all_fm[mid]['time'] = f"{ms.strftime('%Hh%M')} - {me.strftime('%Hh%M')}"
            all_fm[mid]['terrain'] = terrains[j] # La finale aura toujours le Terrain 1
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
    if teamCount == 20:
        slots = [
            ["CL-QF1", "EL-QF1", "CL-QF2", "EL-QF2"],
            ["CL-QF3", "EL-QF3", "CL-QF4", "EL-QF4"],
            ["CDL-SF1", "CL-C1", "EL-C1", "CDL-SF2"],
            ["CL-C2", "EL-C2", "CL-SF1", "EL-SF1"],
            ["CL-SF2", "EL-SF2", "CDL-3E", "CL-7E"],
            ["EL-15E", "CL-5E", "EL-13E", "CDL-F"],
            ["EL-11E", "CL-3E", "EL-F"],
            ["CL-F"]
        ]
    else:
        slots = [
            ["CL-QF1", "EL-QF1", "CDL-QF1", "CL-QF2"],
            ["EL-QF2", "CDL-QF2", "CL-QF3", "EL-QF3"],
            ["CDL-QF3", "CL-QF4", "EL-QF4", "CDL-QF4"],
            ["CL-C1", "EL-C1", "CDL-C1", "CL-C2"],
            ["EL-C2", "CDL-C2", "CL-SF1", "EL-SF1"],
            ["CDL-SF1", "CL-SF2", "EL-SF2", "CDL-SF2"],
            ["CL-7E", "EL-15E", "CDL-23E", "CL-5E"],
            ["EL-13E", "CDL-21E", "CL-3E", "CDL-19E"],
            ["EL-11E", "CDL-F", "EL-F"],
            ["CL-F"]
        ]

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

@app.route('/api/reset', methods=['POST'])
def reset_tournament():
    if not is_admin(): return jsonify({"error": "Non autorisé"}), 403
    with open(DB_FILE, 'w', encoding='utf-8') as f: json.dump({"pools": {}, "matches": {}, "isSetup": False, "finalsMatches": [], "teamCount": 20}, f, indent=2)
    return jsonify({"success": True})

if __name__ == '__main__':
    app.run(debug=True, port=3000, host='0.0.0.0')