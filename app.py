from flask import Flask, request, jsonify
import json
import os
from datetime import datetime, timedelta

app = Flask(__name__, static_folder='public', static_url_path='')
DB_FILE = 'data.json'
ADMIN_PASSWORD = 'admin'

def read_db():
    if not os.path.exists(DB_FILE):
        return {"pools": {}, "matches": {}, "isSetup": False, "finalsMatches": []}
    with open(DB_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)

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
    start_time_str = req.get('startTime', '09:00')
    finals_start_str = req.get('finalsStartTime', '14:00')
    duration = int(req.get('matchDuration', 20))
    pause = int(req.get('breakDuration', 5))
    
    data = {"pools": pools, "matches": {}, "finalsMatches": [], "isSetup": True}
    
    # --- 1. MATCHS DE POULES ---
    schedule_template = [[0,1,2], [2,3,4], [0,4,1], [1,2,3], [3,4,0], [0,2,4], [1,3,0], [1,4,2], [2,4,3], [0,3,1]]
    start_t = datetime.strptime(start_time_str, "%H:%M")
    referee_mapping = {'01': '02', '02': '01', '03': '04', '04': '03'}

    for p, teams in pools.items():
        data["matches"][p] = []
        ref_teams = pools.get(referee_mapping.get(p), teams)
        for i, mdef in enumerate(schedule_template):
            ms = start_t + timedelta(minutes=(duration+pause) * i)
            me = ms + timedelta(minutes=duration)
            data["matches"][p].append({
                "id": f"{p}-{i}",
                "time": f"{ms.strftime('%Hh%M')} - {me.strftime('%Hh%M')}",
                "team1": teams[mdef[0]], "team2": teams[mdef[1]], "referee": ref_teams[mdef[2]],
                "score1": None, "score2": None
            })
            
    # --- 2. PHASES FINALES (Algorithme "Règles d'Or") ---
    def add_m(mid, phase, step, t1, t2):
        return {"id": mid, "phase": phase, "step": step, "team1": t1, "team2": t2, "score1": None, "score2": None, "tab1": None, "tab2": None, "time": ""}
    
    fm = [
        # CHAMPIONS LEAGUE (1er vs 2eme croisés pour éviter un rematch avant la finale)
        add_m("CL-QF1", "🥇 Champions League (Places 1 à 8)", "Quart de Finale", "P01-1", "P03-2"),
        add_m("CL-QF2", "🥇 Champions League (Places 1 à 8)", "Quart de Finale", "P04-1", "P02-2"),
        add_m("CL-QF3", "🥇 Champions League (Places 1 à 8)", "Quart de Finale", "P02-1", "P04-2"),
        add_m("CL-QF4", "🥇 Champions League (Places 1 à 8)", "Quart de Finale", "P03-1", "P01-2"),
        add_m("CL-C1", "🥇 Champions League (Places 1 à 8)", "Match de Classement", "L:CL-QF1", "L:CL-QF2"),
        add_m("CL-C2", "🥇 Champions League (Places 1 à 8)", "Match de Classement", "L:CL-QF3", "L:CL-QF4"),
        add_m("CL-SF1", "🥇 Champions League (Places 1 à 8)", "Demi-Finale", "W:CL-QF1", "W:CL-QF2"),
        add_m("CL-SF2", "🥇 Champions League (Places 1 à 8)", "Demi-Finale", "W:CL-QF3", "W:CL-QF4"),
        add_m("CL-7E", "🥇 Champions League (Places 1 à 8)", "Places 7 et 8", "L:CL-C1", "L:CL-C2"),
        add_m("CL-5E", "🥇 Champions League (Places 1 à 8)", "Places 5 et 6", "W:CL-C1", "W:CL-C2"),
        add_m("CL-3E", "🥇 Champions League (Places 1 à 8)", "Petite Finale", "L:CL-SF1", "L:CL-SF2"),
        add_m("CL-F", "🥇 Champions League (Places 1 à 8)", "GRANDE FINALE", "W:CL-SF1", "W:CL-SF2"),

        # EUROPA LEAGUE (3eme vs 4eme croisés)
        add_m("EL-QF1", "🥈 Europa League (Places 9 à 16)", "Quart de Finale", "P01-3", "P03-4"),
        add_m("EL-QF2", "🥈 Europa League (Places 9 à 16)", "Quart de Finale", "P04-3", "P02-4"),
        add_m("EL-QF3", "🥈 Europa League (Places 9 à 16)", "Quart de Finale", "P02-3", "P04-4"),
        add_m("EL-QF4", "🥈 Europa League (Places 9 à 16)", "Quart de Finale", "P03-3", "P01-4"),
        add_m("EL-C1", "🥈 Europa League (Places 9 à 16)", "Match de Classement", "L:EL-QF1", "L:EL-QF2"),
        add_m("EL-C2", "🥈 Europa League (Places 9 à 16)", "Match de Classement", "L:EL-QF3", "L:EL-QF4"),
        add_m("EL-SF1", "🥈 Europa League (Places 9 à 16)", "Demi-Finale", "W:EL-QF1", "W:EL-QF2"),
        add_m("EL-SF2", "🥈 Europa League (Places 9 à 16)", "Demi-Finale", "W:EL-QF3", "W:EL-QF4"),
        add_m("EL-15E", "🥈 Europa League (Places 9 à 16)", "Places 15 et 16", "L:EL-C1", "L:EL-C2"),
        add_m("EL-13E", "🥈 Europa League (Places 9 à 16)", "Places 13 et 14", "W:EL-C1", "W:EL-C2"),
        add_m("EL-11E", "🥈 Europa League (Places 9 à 16)", "Places 11 et 12", "L:EL-SF1", "L:EL-SF2"),
        add_m("EL-F", "🥈 Europa League (Places 9 à 16)", "Finale Europa League", "W:EL-SF1", "W:EL-SF2"),

        # COUPE DE LA LIGUE (5eme)
        add_m("CDL-SF1", "🥉 Coupe de la Ligue (Places 17 à 20)", "Demi-Finale", "P01-5", "P03-5"),
        add_m("CDL-SF2", "🥉 Coupe de la Ligue (Places 17 à 20)", "Demi-Finale", "P02-5", "P04-5"),
        add_m("CDL-3E", "🥉 Coupe de la Ligue (Places 17 à 20)", "Places 19 et 20", "L:CDL-SF1", "L:CDL-SF2"),
        add_m("CDL-F", "🥉 Coupe de la Ligue (Places 17 à 20)", "Finale Coupe de Ligue", "W:CDL-SF1", "W:CDL-SF2"),
    ]

    # 7 Créneaux horaires pour jouer les finales sans conflit
    slots = [
        ["CL-QF1", "CL-QF2", "CL-QF3", "CL-QF4"],
        ["EL-QF1", "EL-QF2", "EL-QF3", "EL-QF4"],
        ["CDL-SF1", "CDL-SF2", "CL-C1", "CL-C2"],
        ["CL-SF1", "CL-SF2", "EL-C1", "EL-C2"],
        ["EL-SF1", "EL-SF2", "CDL-3E", "CDL-F"],
        ["CL-7E", "CL-5E", "EL-15E", "EL-13E"],
        ["EL-11E", "EL-F", "CL-3E", "CL-F"]
    ]

    f_start_t = datetime.strptime(finals_start_str, "%H:%M")
    all_fm = {m['id']: m for m in fm}
    for i, slot in enumerate(slots):
        ms = f_start_t + timedelta(minutes=(duration+pause) * i)
        me = ms + timedelta(minutes=duration)
        for mid in slot:
            all_fm[mid]['time'] = f"{ms.strftime('%Hh%M')} - {me.strftime('%Hh%M')}"
            data["finalsMatches"].append(all_fm[mid])

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
    with open(DB_FILE, 'w', encoding='utf-8') as f: json.dump({"pools": {}, "matches": {}, "isSetup": False, "finalsMatches": []}, f, indent=2)
    return jsonify({"success": True})

if __name__ == '__main__':
    app.run(debug=True, port=3000, host='0.0.0.0')