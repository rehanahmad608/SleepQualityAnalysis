import json
from import_health_exports import fingerprint, read_exports, read_csv_exports


def test_fingerprint_is_order_independent_and_detects_changes():
    assert fingerprint({'b': 2, 'a': 1}) == fingerprint({'a': 1, 'b': 2})
    assert fingerprint({'a': 1}) != fingerprint({'a': 2})


def test_read_preserves_nested_export_records(tmp_path):
    (tmp_path/'report.json').write_text('{}')
    record = {'dataSource': {'device': 'test'}, 'heartRate': {'bpm': 65}}
    (tmp_path/'heart-rate.json').write_text(json.dumps({'dataPoints': [record]}))
    result = read_exports([tmp_path])
    assert result[0][2]['heart-rate'] == [record]


def test_csv_preserves_original_values_and_quoted_fields(tmp_path):
    (tmp_path/'survey.csv').write_text('Timestamp,Answer\n2026-10-13,"rested, calm"\n', encoding='utf-8')
    files = read_csv_exports(tmp_path)
    assert files == [('survey.csv', [{'Timestamp': '2026-10-13', 'Answer': 'rested, calm'}])]
