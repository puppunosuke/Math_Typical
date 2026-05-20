#!/usr/bin/env python3
"""
PDF からメタデータを抽出して problems.json を生成する前処理スクリプト。
1回だけ実行する想定。

抽出するもの（1問あたり）:
    n              問題番号（1〜250）
    chapter_id     単元ID（"1.1" 〜 "1.12"）
    chapter_name   単元名
    subject        対象科目（"数I" / "数A" / "数II" / "数B" / "数III"）
    audience       "文理共通" / "理系のみ"
    difficulty     難易度 1〜3（★の数）
    t_number       T番号（出典通し番号）
    question_page  問題が載っているページ番号
    answer_page    解答が載っているページ番号
"""
import re
import json
import subprocess
import sys
from pathlib import Path

PDF_PATH = "/Users/selaheuwit/Documents/Claude/【PC版】高校数学の問題集.pdf"
PROBLEM_PAGES_END = 36  # 問題編の最終ページ（P2-36）。P37 以降は解答編

# 単元の構成（ID、名前、問題数）。目次の記載どおり。
# 問題は通し番号で連番なので、累積で各単元の番号範囲を計算できる。
# （ページ単位で判定すると、複数ページに跨る単元の境界で誤判定する）
CHAPTERS = [
    ('1.1',  '数と式',                              24),
    ('1.2',  '方程式・不等式',                      24),
    ('1.3',  '2次関数・3次関数・いろいろな関数',    17),
    ('1.4',  '平面図形・空間図形',                  21),
    ('1.5',  '座標・ベクトル・複素数平面',          31),
    ('1.6',  '整数',                                21),
    ('1.7',  '場合の数・確率',                      21),
    ('1.8',  '数列・漸化式',                        15),
    ('1.9',  '三角関数・指数・対数',                20),
    ('1.10', '極限・微分',                          23),
    ('1.11', '積分',                                24),
    ('1.12', 'データの分析・その他',                 9),
]

# (cid, name, lo, hi) のリスト。lo〜hi が単元の問題番号範囲（両端含む）
def _build_chapter_ranges():
    ranges = []
    start = 1
    for cid, name, count in CHAPTERS:
        ranges.append((cid, name, start, start + count - 1))
        start += count
    return ranges

CHAPTER_RANGES = _build_chapter_ranges()

def get_chapter(n: int):
    """問題番号から該当する単元タプル (cid, name) を返す"""
    for cid, name, lo, hi in CHAPTER_RANGES:
        if lo <= n <= hi:
            return (cid, name)
    return ('?', '不明')

# 問題のヘッダ行を捕まえる正規表現
# 例: 「問題 1 （数 I，文理共通，難易度★☆☆，T5）」
PROBLEM_PATTERN = re.compile(
    r'問題\s*(\d+)\s*[（(]\s*数\s*(III|II|I|A|B|C)\s*[，,]\s*(文理共通|理系のみ)\s*[，,]\s*難易度\s*(★+☆*)\s*[，,]\s*T\s*(\d+)\s*[)）]'
)

def main():
    # PDF を1回だけ pdftotext で全ページ抽出。出力は \f（改ページ）で区切られる
    print('pdftotext で抽出中...', file=sys.stderr)
    result = subprocess.run(
        ['pdftotext', '-layout', PDF_PATH, '-'],
        capture_output=True, text=True, check=True
    )
    pages = result.stdout.split('\f')
    print(f'  → {len(pages)} ページ分のテキストを取得', file=sys.stderr)

    problems = {}  # n -> dict

    # 問題編から問題リストとメタデータを抽出
    for page_num in range(2, PROBLEM_PAGES_END + 1):
        idx = page_num - 1
        if idx >= len(pages):
            break
        # 改行や複数スペースを1つに正規化（ヘッダ行が改行で分割される対策）
        text = re.sub(r'\s+', ' ', pages[idx])
        for m in PROBLEM_PATTERN.finditer(text):
            n = int(m.group(1))
            if n in problems:
                continue  # 同じ問題ヘッダが複数行に分かれて重複した場合に備える
            cid, cname = get_chapter(n)  # 問題番号から単元を判定
            problems[n] = {
                'n': n,
                'chapter_id': cid,
                'chapter_name': cname,
                'subject': '数' + m.group(2),
                'audience': m.group(3),
                'difficulty': len(m.group(4).replace('☆', '')),  # ★の数
                't_number': int(m.group(5)),
                'question_page': page_num,
                'answer_page': None,
            }

    # 解答編から各問題の解答ページを抽出（最初に見つかったページ＝解答開始ページ）
    for page_num in range(PROBLEM_PAGES_END + 1, len(pages) + 1):
        idx = page_num - 1
        if idx >= len(pages):
            break
        text = re.sub(r'\s+', ' ', pages[idx])
        for m in PROBLEM_PATTERN.finditer(text):
            n = int(m.group(1))
            if n in problems and problems[n]['answer_page'] is None:
                problems[n]['answer_page'] = page_num

    output = sorted(problems.values(), key=lambda p: p['n'])

    # 検証: 抽出した問題数と未紐付け（解答ページ無し）の確認
    print(f'  → 抽出した問題数: {len(output)}', file=sys.stderr)
    unmatched = [p for p in output if p['answer_page'] is None]
    if unmatched:
        print(f'  ⚠ 解答ページ未紐付け: {len(unmatched)} 問 (例: 問題{unmatched[0]["n"]})', file=sys.stderr)

    # 出力
    out_path = Path(__file__).parent.parent / 'data' / 'problems.json'
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open('w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f'✅ 保存先: {out_path}', file=sys.stderr)

if __name__ == '__main__':
    main()
