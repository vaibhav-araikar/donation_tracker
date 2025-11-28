from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from datetime import datetime
import random
import os

# Initialize Flask app (serve static files from current directory)
app = Flask(__name__, static_folder='.')
CORS(app)  # Enable Cross-Origin Resource Sharing

# In-memory data storage
donations_list = []
total_amount = 0.0
donor_count = 0
categories = {
    'Education': 0.0,
    'Healthcare': 0.0,
    'Environment': 0.0,
    'Community': 0.0
}

# ---------------------------
# Helper: recompute unique donors
# ---------------------------
def recompute_unique_donor_count():
    global donor_count
    names = set()
    for d in donations_list:
        name = (d.get('donor') or '').strip().lower()
        if name:
            names.add(name)
    donor_count = len(names)
    return donor_count

# ---------------------------
# Helper: add donation record
# ---------------------------
def add_donation_record(data):
    """
    data: dict with keys 'donor', 'amount', 'category'
    Returns created donation dict
    """
    global total_amount, donor_count

    donor = (data.get('donor') or '').strip()
    try:
        amount = float(data.get('amount', 0))
    except (ValueError, TypeError):
        amount = 0.0
    category = data.get('category') or 'Unspecified'

    donation = {
        'id': len(donations_list) + 1,
        'donor': donor,
        'amount': amount,
        'category': category,
        # store date/time and ISO timestamp (no timezone) - frontend treats as local
        'date': datetime.now().strftime('%Y-%m-%d'),
        'time': datetime.now().strftime('%H:%M:%S'),
        'timestamp': datetime.now().isoformat()
    }

    # Update globals
    donations_list.insert(0, donation)
    total_amount += donation['amount']

    # Update categories
    if donation['category'] in categories:
        categories[donation['category']] += donation['amount']
    else:
        categories[donation['category']] = donation['amount']

    # recompute unique donor count (so /api/stats returns unique donors)
    recompute_unique_donor_count()

    return donation

# ===========================
# Serve frontend files
# ===========================
@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')

@app.route('/script.js')
def serve_script():
    return send_from_directory('.', 'script.js')

@app.route('/styles.css')
def serve_styles():
    return send_from_directory('.', 'styles.css')

# ===========================
# API Endpoints
# ===========================
@app.route('/api/donations', methods=['GET'])
def get_donations():
    return jsonify({
        'success': True,
        'count': len(donations_list),
        'donations': donations_list
    })

@app.route('/api/stats', methods=['GET'])
def get_stats():
    # donor_count is unique donors computed by recompute_unique_donor_count()
    avg_donation = total_amount / donor_count if donor_count > 0 else 0.0
    return jsonify({
        'success': True,
        'stats': {
            'total_amount': round(total_amount, 2),
            'donor_count': donor_count,
            'average_donation': round(avg_donation, 2),
            'total_donations': len(donations_list)
        }
    })

@app.route('/api/categories', methods=['GET'])
def get_categories():
    return jsonify({
        'success': True,
        'categories': categories
    })

@app.route('/api/donate', methods=['POST'])
def api_add_donation():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'Invalid JSON'}), 400

        # validate required
        if not data.get('donor') or not data.get('amount') or not data.get('category'):
            return jsonify({'success': False, 'error': 'Missing required fields: donor, amount, category'}), 400

        donation = add_donation_record(data)

        return jsonify({
            'success': True,
            'message': 'Donation added successfully',
            'donation': donation,
            'stats': {
                'total_amount': round(total_amount, 2),
                'donor_count': donor_count
            }
        }), 201
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/simulate', methods=['POST'])
def simulate_donation():
    """Simulate a random donation (for testing)"""
    # small pool for realistic names + mostly unique donors generated so unique count grows while testing
    common_names = ['John Smith', 'Alice Brown', 'Tom White', 'Jessica Green', 'Mark Black', 'Sophie Blue']
    category_list = ['Education', 'Healthcare', 'Environment', 'Community']

    # 30% chance use a mostly unique generated name to increase unique donor count during testing
    if random.random() < 0.3:
        fake_name = f"Donor {random.randint(1000, 9999)}"
    else:
        fake_name = random.choice(common_names)

    fake = {
        'donor': fake_name,
        'amount': random.randint(500, 5000),
        'category': random.choice(category_list)
    }

    donation = add_donation_record(fake)

    return jsonify({
        'success': True,
        'message': 'Simulated donation added',
        'donation': donation,
        'stats': {
            'total_amount': round(total_amount, 2),
            'donor_count': donor_count
        }
    }), 201

# ===========================
# Run Server
# ===========================
if __name__ == '__main__':
    print("=" * 50)
    print("🚀 Donation Tracking Server Starting...")
    print("=" * 50)
    print("📍 Server running at: http://localhost:5000")
    print("📋 API Endpoints:")
    print("   GET  /api/donations - View all donations")
    print("   GET  /api/stats     - View statistics")
    print("   GET  /api/categories - View category totals")
    print("   POST /api/donate    - Add new donation")
    print("   POST /api/simulate  - Simulate donation")
    print("=" * 50)

    app.run(debug=True, port=5000, host='0.0.0.0')




# Serve static frontend files (index.html, script.js, styles.css) from project root
from flask import send_from_directory, jsonify

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('.', path)

# Use PORT env var (Render/Heroku style)
if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 5000))
    # do NOT use debug=True in production
    app.run(host="0.0.0.0", port=port, debug=False)
