"""Store reproducible synthetic variation for P001_DEMO, 16–19 October only.

Source measurements are preserved. FastAPI applies the settings on read.
"""
from datetime import date
import json
import random
from sqlalchemy import text
from app.config import settings
from app.db.session import build_engine

SEED=20261103


def profiles():
    rng=random.Random(SEED)
    return [(date(2026,10,day),{
        'heart_rate_factor':round(rng.uniform(.94,1.06),4),
        'heart_rate_jitter':4,
        'steps_factor':round(rng.uniform(.82,1.18),4),
        'steps_jitter':.12,
        'hrv_factor':round(rng.uniform(.85,1.15),4),
        'hrv_jitter':.08,
        'resting_factor':round(rng.uniform(.94,1.06),4),
        'sleep_factor':round(rng.uniform(.92,1.08),4),
    }) for day in range(16,20)]


def main():
    with build_engine(settings.MIGRATION_DATABASE_URL or settings.DATABASE_URL).begin() as c:
        if not c.scalar(text("SELECT 1 FROM health_analysis_test.demo_datasets WHERE participant_code='P001_DEMO'")):
            raise ValueError('Expected labelled demo dataset is missing.')
        c.execute(text('''CREATE TABLE IF NOT EXISTS health_analysis_test.demo_variation (
            participant_code text NOT NULL REFERENCES health_analysis_test.demo_datasets,
            study_date date NOT NULL,seed integer NOT NULL,parameters jsonb NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY(participant_code,study_date))'''))
        c.execute(text('ALTER TABLE health_analysis_test.demo_variation ENABLE ROW LEVEL SECURITY'))
        c.execute(text('REVOKE ALL ON health_analysis_test.demo_variation FROM PUBLIC'))
        for day,parameters in profiles():
            c.execute(text('''INSERT INTO health_analysis_test.demo_variation
                (participant_code,study_date,seed,parameters) VALUES ('P001_DEMO',:day,:seed,CAST(:parameters AS jsonb))
                ON CONFLICT(participant_code,study_date) DO UPDATE SET seed=EXCLUDED.seed,parameters=EXCLUDED.parameters'''),
                {'day':day,'seed':SEED,'parameters':json.dumps(parameters)})
            print('Stored reproducible demo variation:',day)
    print('Only four demo settings rows written; source measurements unchanged.')


if __name__=='__main__':main()
