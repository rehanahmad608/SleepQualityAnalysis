
CREATE SCHEMA IF NOT EXISTS health_export_test;
CREATE TABLE IF NOT EXISTS health_export_test.exports (
    export_name text PRIMARY KEY,
    report jsonb NOT NULL,
    imported_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS health_export_test.records (
    metric text NOT NULL,
    record_hash text NOT NULL,
    payload jsonb NOT NULL,
    PRIMARY KEY (metric, record_hash)
);
CREATE TABLE IF NOT EXISTS health_export_test.export_records (
    export_name text NOT NULL REFERENCES health_export_test.exports(export_name),
    metric text NOT NULL,
    record_hash text NOT NULL,
    PRIMARY KEY (export_name, metric, record_hash),
    FOREIGN KEY (metric, record_hash) REFERENCES health_export_test.records(metric, record_hash)
);
CREATE TABLE IF NOT EXISTS health_export_test.csv_records (
    source_file text NOT NULL,
    record_hash text NOT NULL,
    payload jsonb NOT NULL,
    PRIMARY KEY (source_file, record_hash)
);
ALTER TABLE health_export_test.exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_export_test.records ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_export_test.export_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_export_test.csv_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON SCHEMA health_export_test FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA health_export_test FROM PUBLIC;
