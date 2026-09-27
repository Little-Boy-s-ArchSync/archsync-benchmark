"""Build blank, separate first-pass worksheets from the pinned response proposal."""
import csv
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PROPOSAL = ROOT / 'response-v0.2.0' / 'scope-proposal.json'
EXPECTED_SHA256 = '85ddc693a8ff82064e58788ff491b90b8cf50eb03732e675ea17d0ea276d09f3'
OUT = ROOT / 'first-pass-blank'


def main():
    source = PROPOSAL.read_bytes()
    if hashlib.sha256(source).hexdigest() != EXPECTED_SHA256:
        raise SystemExit('Scope proposal hash changed; refusing to build worksheets')
    proposal = json.loads(source)
    if proposal['status'] != 'proposed-not-accepted' or proposal['human_acceptances']:
        raise SystemExit('Unexpected received-proposal state')
    selected = [row for row in proposal['case_rows'] if row['proposed_role'] == 'primary-candidate']
    if len(selected) != 56 or len({row['case_id'] for row in selected}) != 56:
        raise SystemExit('Expected exactly 56 unique primary case IDs')
    paths = {}
    for row in proposal['changed_path_rows']:
        paths.setdefault(row['case_id'], []).append(row['path'])
    OUT.mkdir(exist_ok=True)
    fields = [
        'case_id', 'repository', 'base', 'head', 'changed_paths_to_review',
        'reviewer', 'label', 'unknown_reason', 'confidence', 'source_evidence',
        'architecture_rule_id', 'rationale', 'reviewed_paths', 'reviewed_at_utc',
        'prediction_exposure', 'ai_assistance',
    ]
    for reviewer, filename in [('Hieu', 'A-Hieu.csv'), ('Hoang', 'B-Hoang.csv')]:
        with (OUT / filename).open('w', newline='', encoding='utf-8') as stream:
            writer = csv.DictWriter(stream, fieldnames=fields, lineterminator='\n')
            writer.writeheader()
            for case in selected:
                writer.writerow({
                    'case_id': case['case_id'], 'repository': case['repository'],
                    'base': case['base'], 'head': case['head'],
                    'changed_paths_to_review': json.dumps(paths[case['case_id']], ensure_ascii=False),
                    'reviewer': reviewer,
                })
    print('Prepared two separate blank 56-case worksheets; no labels or predictions')


if __name__ == '__main__':
    main()
