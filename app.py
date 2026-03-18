from flask import Flask, request, jsonify
import json
import os
from datetime import datetime, timedelta

app = Flask(__name__, static_folder='public', static_url_path='')

DB_FILE = 'data.json'
ADMIN_PASSWORD = 'admin'

def reset_db():
    empty_data = {"pools": {}, "matches": {}, "isSetup": False}
    with open(DB_FILE, 'w') as f:
        json.dump(empty_data, f, indent=2)

if not os.path.exists(DB_FILE):
    reset_db()

def read_db():
    with open(DB_FILE, 'r') as f:
        return json.load(f)

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
    if not is_admin():
        return jsonify({"error": "Non autorisé"}), 403

    req_data = request.json
    pools = req_data.get('pools', {})
    
    # Paramètres de temps
    start_time_str = req_data.get('startTime', '09:00')
    match_duration = int(req_data.get('matchDuration', 20))
    break_duration = int(req_data.get('breakDuration', 5))
    slot_duration = match_duration + break_duration

    data = {"pools": pools, "matches": {}, "isSetup": True}

    # Modèle [Equipe 1, Equipe 2, Equipe au repos (qui arbitrera)]
    schedule_template = [
        [0, 1, 2], [2, 3, 4], [0, 4, 1], [1, 2, 3], [3, 4, 0],
        [0, 2, 4], [1, 3, 0], [1, 4, 2], [2, 4, 3], [0, 3, 1]
    ]

    start_time = datetime.strptime(start_time_str, "%H:%M")

    # Binômes de poules pour l'arbitrage
    referee_mapping = {
        '01': '02', '02': '01',
        '03': '04', '04': '03'
    }

    for p, teams in pools.items():
        data["matches"][p] = []
        
        referee_pool_id = referee_mapping.get(p)
        referee_teams = pools.get(referee_pool_id, teams)

        for index, match_def in enumerate(schedule_template):
            # Calcul de l'heure de début et de l'heure de fin
            match_start = start_time + timedelta(minutes=slot_duration * index)
            match_end = match_start + timedelta(minutes=match_duration)
            
            # Formatage "09h00 - 09h20"
            time_string = f"{match_start.strftime('%Hh%M')} - {match_end.strftime('%Hh%M')}"
            
            ref_team = referee_teams[match_def[2]]

            data["matches"][p].append({
                "id": f"{p}-{index}",
                "time": time_string,
                "team1": teams[match_def[0]],
                "team2": teams[match_def[1]],
                "referee": ref_team,
                "score1": None,
                "score2": None
            })

    write_db(data)
    return jsonify({"success": True})

@app.route('/api/score', methods=['POST'])
def save_score():
    if not is_admin():
        return jsonify({"error": "Non autorisé"}), 403

    req_data = request.json
    pool_id = req_data.get('poolId')
    match_id = req_data.get('matchId')
    score1 = req_data.get('score1')
    score2 = req_data.get('score2')

    data = read_db()
    
    for match in data["matches"].get(pool_id, []):
        if match["id"] == match_id:
            match["score1"] = int(score1) if score1 != "" else None
            match["score2"] = int(score2) if score2 != "" else None
            write_db(data)
            return jsonify({"success": True})

    return jsonify({"error": "Match non trouvé"}), 404

@app.route('/api/reset', methods=['POST'])
def reset_tournament():
    if not is_admin():
        return jsonify({"error": "Non autorisé"}), 403
    reset_db()
    return jsonify({"success": True})

if __name__ == '__main__':
    app.run(debug=True, port=3000, host='0.0.0.0')