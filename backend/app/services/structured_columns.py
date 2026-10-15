"""Column naming rules for the structured JSON/CSV tables.

Shared by the offline builder (``build_structured_test_db.py``) and the request
path (``services/participant_data.py``) so the API never has to import the
builder script.
"""
import hashlib
import re

MANUAL = {
    'Timestamp': 'submitted_at_original',
    'Rate your current energy level': 'energy_level',
    'Rate your sleep quality last night': 'sleep_quality',
    'What time did you go to bed yesterday?': 'bedtime',
    'What time do you think you actually fell asleep yesterday?': 'fell_asleep_time',
    'How many hours were you productive today, including studying, working, hobbies, or other meaningful activities?': 'productive_hours_original',
    'What time did you consume your last meal today?': 'last_meal_time',
}


def column_name(path):
    if path in MANUAL:
        return MANUAL[path]
    name = re.sub(r'([a-z0-9])([A-Z])', r'\1_\2', path).lower().replace('.', '_')
    name = re.sub(r'[^a-z0-9_]', '_', name)
    if len(name) > 57:
        name = name[:46] + '_' + hashlib.sha256(path.encode()).hexdigest()[:10]
    return name
