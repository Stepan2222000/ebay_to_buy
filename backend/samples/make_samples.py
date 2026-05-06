"""Генератор тестовых xlsx для импорта целей.

Формат — по [[Excel import#columns]] из purchase-logic.yaml.
"""
from pathlib import Path

from openpyxl import Workbook

OUT = Path(__file__).parent

CASES = {
    "targets_ok.xlsx": [
        ("smart_part_id", "target_qty", "is_active"),
        ("smart_10001011", 5, True),
        ("smart_10000045", 3, False),
        ("smart_10000081", 1, None),  # пустой is_active → default true
    ],
    "targets_bad_smart.xlsx": [
        ("smart_part_id", "target_qty", "is_active"),
        ("smart_99999999", 5, True),  # триггер validate_purchase_target_smart_id уронит
    ],
    "targets_bad_qty.xlsx": [
        ("smart_part_id", "target_qty", "is_active"),
        ("smart_10001011", 0, True),  # CHECK target_qty >= 1 уронит
    ],
}


def main() -> None:
    for name, rows in CASES.items():
        wb = Workbook(write_only=True)
        ws = wb.create_sheet("import")
        for r in rows:
            ws.append(list(r))
        path = OUT / name
        wb.save(path)
        print(f"wrote {path}")


if __name__ == "__main__":
    main()
