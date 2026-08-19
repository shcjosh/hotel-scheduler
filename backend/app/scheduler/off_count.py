"""連休計數（H12）共用邏輯。

連休定義（v1.0.3 起）：
  一段「連續非上班日」＝一般休（OFF）／指定休假（OFF）／特休、事假、病假
  等請假（在班表中皆以 SPECIAL 表示）。
  該段需「長度 >= 2 天」且「段內至少含 1 天一般休或指定休假（OFF）」才算
  1 次連休；整段都只有請假（無 OFF）則不算連休。
"""

NONWORK = {"OFF", "SPECIAL"}


def count_off_blocks(shifts) -> tuple[int, list[int]]:
    """Return (count, run_day_indices) where run_day_indices are 0-based days."""
    count = 0
    run_days: list[int] = []
    n = len(shifts)
    i = 0
    while i < n:
        if shifts[i] in NONWORK:
            j = i
            has_off = False
            while j < n and shifts[j] in NONWORK:
                if shifts[j] == "OFF":
                    has_off = True
                j += 1
            if j - i >= 2 and has_off:
                count += 1
                run_days.extend(range(i, j))
            i = j
        else:
            i += 1
    return count, run_days
