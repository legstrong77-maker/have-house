"""地址標準化（中文門牌 → 統一格式以利 geocode 與 dedupe）。"""
from __future__ import annotations

import re

# 全形阿拉伯數字 → 半形
_FW = str.maketrans("０１２３４５６７８９", "0123456789")

# 中文數字（小範圍）→ 阿拉伯
CN = {"○": 0, "〇": 0, "零": 0, "一": 1, "二": 2, "三": 3,
      "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10}


def _cn_to_arab(s: str) -> str:
    """把連續的中文數字段落（例：一三五）轉成阿拉伯（135）；十的處理採線性。"""
    def repl(m: re.Match) -> str:
        seg = m.group(0)
        if "十" in seg:
            a, _, b = seg.partition("十")
            tens = CN[a] if a else 1
            ones = CN[b] if b else 0
            return str(tens * 10 + ones)
        return "".join(str(CN[c]) for c in seg)
    return re.sub(r"[○〇零一二三四五六七八九十]+", repl, s)


def normalize_address(addr: str | None, county: str | None = None) -> str | None:
    if not addr:
        return None
    s = addr.strip().translate(_FW)
    s = _cn_to_arab(s)
    s = re.sub(r"\s+", "", s)
    # 「123~135號」之類的區段保留低值方便 geocode
    s = re.sub(r"(\d+)~(\d+)號", r"\1號", s)
    s = re.sub(r"(\d+)-(\d+)號", r"\1號", s)   # 同樣處理 dash
    if county and county not in s:
        s = county + s
    return s
