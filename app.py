from flask import Flask, request, jsonify
import json
import os
from datetime import datetime, timedelta

app = Flask(__name__, static_folder='public', static_url_path='')

DB_FILE = 'data.json'
ADMIN_PASSWORD = 'admin'

def read_db():
    if not os.path.exists(DB_FILE):
        return {"pools": {}, "matches": {}, "isSetup": False, "finalsMatches": [], "isFinalsSetup": False}
    with open(DB_FILE, 'r') as f:
        data = json.load(f)
        if 'finalsMatches' not in data: data['finalsMatches'] = []
        if 'isFinalsSetup' not in data: data['isFinalsSetup'] = False
        return data

def write_db(data):
    with open(DB_FILE, 'w') as f:
        json.dump(data, f, indent=2)

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
    req_data = request.json
    pools = req_data.get('pools', {})
    start_time_str, match_duration, break_duration = req_data.get('startTime', '09:00'), int(req_data.get('matchDuration', 20)), int(req_data.get('breakDuration', 5))
    
    data = read_db()
    data.update({"pools": pools, "matches": {}, "isSetup": True, "finalsMatches": [], "isFinalsSetup": False})
    
    schedule_template = [[0,1,2], [2,3,4], [0,4,1], [1,2,3], [3,4,0], [0,2,4], [1,3,0], [1,4,2], [2,4,3], [0,3,1]]
    start_time = datetime.strptime(start_time_str, "%H:%M")
    referee_mapping = {'01': '02', '02': '01', '03': '04', '04': '03'}

    for p, teams in pools.items():
        data["matches"][p] = []
        referee_teams = pools.get(referee_mapping.get(p), teams)
        for index, match_def in enumerate(schedule_template):
            m_start = start_time + timedelta(minutes=(match_duration+break_duration) * index)
            m_end = m_start + timedelta(minutes=match_duration)
            data["matches"][p].append({
                "id": f"{p}-{index}",
                "time": f"{m_start.strftime('%Hh%M')} - {m_end.strftime('%Hh%M')}",
                "team1": teams[match_def[0]], "team2": teams[match_def[1]],
                "referee": referee_teams[match_def[2]],
                "score1": None, "score2": None
            })
    write_db(data)
    return jsonify({"success": True})

@app.route('/api/score', methods=['POST'])
def save_score():
    if not is_admin(): return jsonify({"error": "Non autorisé"}), 403
    req_data = request.json
    data = read_db()
    for match in data["matches"].get(req_data.get('poolId'), []):
        if match["id"] == req_data.get('matchId'):
            match["score1"] = int(req_data.get('score1')) if req_data.get('score1') != "" else None
            match["score2"] = int(req_data.get('score2')) if req_data.get('score2') != "" else None
            write_db(data)
            return jsonify({"success": True})
    return jsonify({"error": "Match non trouvé"}), 404

# --- NOUVELLES ROUTES POUR LES PHASES FINALES ---

def add_m(mid, phase, step, t1, t2, nw=None, pw=None, nl=None, pl=None):
    return {"id": mid, "phase": phase, "step": step, "team1": t1, "team2": t2, 
            "score1": None, "score2": None, "tab1": None, "tab2": None, 
            "nextW": nw, "placeW": pw, "nextL": nl, "placeL": pl, "time": ""}

@app.route('/api/setup-finals', methods=['POST'])
def setup_finals():
    if not is_admin(): return jsonify({"error": "Non autorisé"}), 403
    req_data = request.json
    st = req_data.get('standings') # Reçoit le classement final des poules
    start_time_str = req_data.get('startTime', '14:00')
    duration, pause = int(req_data.get('matchDuration', 20)), int(req_data.get('breakDuration', 5))
    
    # Construction des 28 matchs (avec pointeurs vers les prochains matchs)
    m = [
        # CHAMPIONS LEAGUE (Places 1 à 8)
        add_m("CL-QF1", "🥇 Champions League (Places 1 à 8)", "Quart de Finale", st['01'][0], st['02'][1], "CL-SF1:1", "Gagnant QF1", "CL-C1:1", "Perdant QF1"),
        add_m("CL-QF2", "🥇 Champions League (Places 1 à 8)", "Quart de Finale", st['02'][0], st['03'][1], "CL-SF1:2", "Gagnant QF2", "CL-C1:2", "Perdant QF2"),
        add_m("CL-QF3", "🥇 Champions League (Places 1 à 8)", "Quart de Finale", st['03'][0], st['04'][1], "CL-SF2:1", "Gagnant QF3", "CL-C2:1", "Perdant QF3"),
        add_m("CL-QF4", "🥇 Champions League (Places 1 à 8)", "Quart de Finale", st['04'][0], st['01'][1], "CL-SF2:2", "Gagnant QF4", "CL-C2:2", "Perdant QF4"),
        add_m("CL-C1", "🥇 Champions League (Places 1 à 8)", "Match de Classement", "Perdant QF1", "Perdant QF2", "CL-5E:1", "Gagnant Class.1", "CL-7E:1", "Perdant Class.1"),
        add_m("CL-C2", "🥇 Champions League (Places 1 à 8)", "Match de Classement", "Perdant QF3", "Perdant QF4", "CL-5E:2", "Gagnant Class.2", "CL-7E:2", "Perdant Class.2"),
        add_m("CL-SF1", "🥇 Champions League (Places 1 à 8)", "Demi-Finale", "Gagnant QF1", "Gagnant QF2", "CL-F:1", "Gagnant Demi 1", "CL-3E:1", "Perdant Demi 1"),
        add_m("CL-SF2", "🥇 Champions League (Places 1 à 8)", "Demi-Finale", "Gagnant QF3", "Gagnant QF4", "CL-F:2", "Gagnant Demi 2", "CL-3E:2", "Perdant Demi 2"),
        add_m("CL-7E", "🥇 Champions League (Places 1 à 8)", "Places 7 et 8", "Perdant Class.1", "Perdant Class.2"),
        add_m("CL-5E", "🥇 Champions League (Places 1 à 8)", "Places 5 et 6", "Gagnant Class.1", "Gagnant Class.2"),
        add_m("CL-3E", "🥇 Champions League (Places 1 à 8)", "Petite Finale (3e)", "Perdant Demi 1", "Perdant Demi 2"),
        add_m("CL-F", "🥇 Champions League (Places 1 à 8)", "GRANDE FINALE", "Gagnant Demi 1", "Gagnant Demi 2"),
        
        # LEAGUE EUROPE (Places 9 à 16)
        add_m("EL-QF1", "🥈 League Europe (Places 9 à 16)", "Quart de Finale", st['01'][2], st['02'][3], "EL-SF1:1", "Gagnant QF1", "EL-C1:1", "Perdant QF1"),
        add_m("EL-QF2", "🥈 League Europe (Places 9 à 16)", "Quart de Finale", st['02'][2], st['03'][3], "EL-SF1:2", "Gagnant QF2", "EL-C1:2", "Perdant QF2"),
        add_m("EL-QF3", "🥈 League Europe (Places 9 à 16)", "Quart de Finale", st['03'][2], st['04'][3], "EL-SF2:1", "Gagnant QF3", "EL-C2:1", "Perdant QF3"),
        add_m("EL-QF4", "🥈 League Europe (Places 9 à 16)", "Quart de Finale", st['04'][2], st['01'][3], "EL-SF2:2", "Gagnant QF4", "EL-C2:2", "Perdant QF4"),
        add_m("EL-C1", "🥈 League Europe (Places 9 à 16)", "Match de Classement", "Perdant QF1", "Perdant QF2", "EL-13E:1", "Gagnant Class.1", "EL-15E:1", "Perdant Class.1"),
        add_m("EL-C2", "🥈 League Europe (Places 9 à 16)", "Match de Classement", "Perdant QF3", "Perdant QF4", "EL-13E:2", "Gagnant Class.2", "EL-15E:2", "Perdant Class.2"),
        add_m("EL-SF1", "🥈 League Europe (Places 9 à 16)", "Demi-Finale", "Gagnant QF1", "Gagnant QF2", "EL-F:1", "Gagnant Demi 1", "EL-11E:1", "Perdant Demi 1"),
        add_m("EL-SF2", "🥈 League Europe (Places 9 à 16)", "Demi-Finale", "Gagnant QF3", "Gagnant QF4", "EL-F:2", "Gagnant Demi 2", "EL-11E:2", "Perdant Demi 2"),
        add_m("EL-15E", "🥈 League Europe (Places 9 à 16)", "Places 15 et 16", "Perdant Class.1", "Perdant Class.2"),
        add_m("EL-13E", "🥈 League Europe (Places 9 à 16)", "Places 13 et 14", "Gagnant Class.1", "Gagnant Class.2"),
        add_m("EL-11E", "🥈 League Europe (Places 9 à 16)", "Places 11 et 12", "Perdant Demi 1", "Perdant Demi 2"),
        add_m("EL-F", "🥈 League Europe (Places 9 à 16)", "Finale League Europe", "Gagnant Demi 1", "Gagnant Demi 2"),
        
        # COUPE DE LA LIGUE (Places 17 à 20)
        add_m("CDL-SF1", "🥉 Coupe de la Ligue (Places 17 à 20)", "Demi-Finale", st['01'][4], st['03'][4], "CDL-F:1", "Gagnant Demi 1", "CDL-3E:1", "Perdant Demi 1"),
        add_m("CDL-SF2", "🥉 Coupe de la Ligue (Places 17 à 20)", "Demi-Finale", st['02'][4], st['04'][4], "CDL-F:2", "Gagnant Demi 2", "CDL-3E:2", "Perdant Demi 2"),
        add_m("CDL-3E", "🥉 Coupe de la Ligue (Places 17 à 20)", "Places 19 et 20", "Perdant Demi 1", "Perdant Demi 2"),
        add_m("CDL-F", "🥉 Coupe de la Ligue (Places 17 à 20)", "Finale Coupe de la Ligue", "Gagnant Demi 1", "Gagnant Demi 2")
    ]
    
    all_matches = {x['id']: x for x in m}
    # 7 Créneaux horaires de 4 matchs simultanés
    slots = [
        ["CL-QF1", "CL-QF2", "CL-QF3", "CL-QF4"],
        ["EL-QF1", "EL-QF2", "EL-QF3", "EL-QF4"],
        ["CDL-SF1", "CDL-SF2", "CL-C1", "CL-C2"],
        ["CL-SF1", "CL-SF2", "EL-C1", "EL-C2"],
        ["EL-SF1", "EL-SF2", "CDL-3E", "CDL-F"],
        ["CL-7E", "CL-5E", "EL-15E", "EL-13E"],
        ["EL-11E", "EL-F", "CL-3E", "CL-F"]
    ]
    
    start_t = datetime.strptime(start_time_str, "%H:%M")
    finals_list = []
    for i, slot in enumerate(slots):
        m_start = start_t + timedelta(minutes=(duration+pause) * i)
        m_end = m_start + timedelta(minutes=duration)
        time_str = f"{m_start.strftime('%Hh%M')} - {m_end.strftime('%Hh%M')}"
        for mid in slot:
            all_matches[mid]['time'] = time_str
            finals_list.append(all_matches[mid])
            
    data = read_db()
    data['finalsMatches'] = finals_list
    data['isFinalsSetup'] = True
    write_db(data)
    return jsonify({"success": True})

@app.route('/api/score-finals', methods=['POST'])
def save_score_finals():
    if not is_admin(): return jsonify({"error": "Non autorisé"}), 403
    req = request.json
    data = read_db()
    
    for m in data['finalsMatches']:
        if m['id'] == req.get('matchId'):
            # MAJ des scores
            m['score1'] = int(req['score1']) if req.get('score1') != "" else None
            m['score2'] = int(req['score2']) if req.get('score2') != "" else None
            m['tab1'] = int(req['tab1']) if req.get('tab1') != "" else None
            m['tab2'] = int(req['tab2']) if req.get('tab2') != "" else None
            
            # Détermination du vainqueur (avec prise en compte des Tirs au But)
            winner, loser = None, None
            if m['score1'] is not None and m['score2'] is not None:
                if m['score1'] > m['score2']: winner, loser = m['team1'], m['team2']
                elif m['score2'] > m['score1']: winner, loser = m['team2'], m['team1']
                elif m['tab1'] is not None and m['tab2'] is not None:
                    if m['tab1'] > m['tab2']: winner, loser = m['team1'], m['team2']
                    elif m['tab2'] > m['tab1']: winner, loser = m['team2'], m['team1']
            
            # Propagation dans l'arbre
            if m.get('nextW'):
                nid, nidx = m['nextW'].split(':')
                for nm in data['finalsMatches']:
                    if nm['id'] == nid: nm['team' + nidx] = winner if winner else m['placeW']
            if m.get('nextL'):
                nid, nidx = m['nextL'].split(':')
                for nm in data['finalsMatches']:
                    if nm['id'] == nid: nm['team' + nidx] = loser if loser else m['placeL']
            
            write_db(data)
            return jsonify({"success": True})
    return jsonify({"error": "Match non trouvé"}), 404

@app.route('/api/reset', methods=['POST'])
def reset_tournament():
    if not is_admin(): return jsonify({"error": "Non autorisé"}), 403
    with open(DB_FILE, 'w') as f: json.dump({"pools": {}, "matches": {}, "isSetup": False, "finalsMatches": [], "isFinalsSetup": False}, f, indent=2)
    return jsonify({"success": True})

if __name__ == '__main__':
    app.run(debug=True, port=3000, host='0.0.0.0')