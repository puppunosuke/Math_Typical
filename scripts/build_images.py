#!/usr/bin/env python3
"""
PDF から画像を生成する前処理スクリプト。

- 新PDF（印刷用、1問1ページ）→ images/questions/q-NNN.jpg（Nは問題番号）
- 旧PDF（PC版、解答編含む）  → images/answers/page-NNN.jpg（Nは旧PDFのページ番号）

problems.json の `question_page` / `answer_page` と対応:
- 新PDFは P(N+1) が問題N → q-NNN.jpg
- 旧PDFは answer_page がそのまま page-NNN.jpg
"""
import subprocess
import shutil
from pathlib import Path

PDF_NEW = "/Users/selaheuwit/Documents/Claude/【印刷用】高校数学の問題集.pdf"
PDF_OLD = "/Users/selaheuwit/Documents/Claude/【PC版】高校数学の問題集.pdf"
ROOT = Path(__file__).parent.parent
IMG_QUESTIONS = ROOT / 'images' / 'questions'
IMG_ANSWERS = ROOT / 'images' / 'answers'
DPI = 150


def build_questions():
    """新PDF から問題画像を生成（P2〜251 を q-001〜q-250 にリネーム）"""
    print('▶ 問題画像を生成中...')
    if IMG_QUESTIONS.exists():
        shutil.rmtree(IMG_QUESTIONS)
    IMG_QUESTIONS.mkdir(parents=True)

    subprocess.run(
        ['pdftoppm', '-jpeg', '-r', str(DPI), '-f', '2', '-l', '251',
         PDF_NEW, str(IMG_QUESTIONS / 'page')],
        check=True
    )

    # page-NNN.jpg → q-(NNN-1).jpg（P2 → 問題1）
    for f in sorted(IMG_QUESTIONS.glob('page-*.jpg')):
        page_num = int(f.stem.split('-')[1])
        q_num = page_num - 1
        f.rename(IMG_QUESTIONS / f'q-{q_num:03d}.jpg')

    count = len(list(IMG_QUESTIONS.glob('q-*.jpg')))
    print(f'  → {count} 枚生成（{IMG_QUESTIONS}）')


def build_answers():
    """旧PDF から解答画像を生成（P37〜491 だけ）"""
    print('▶ 解答画像を生成中...')
    if IMG_ANSWERS.exists():
        shutil.rmtree(IMG_ANSWERS)
    IMG_ANSWERS.mkdir(parents=True)

    subprocess.run(
        ['pdftoppm', '-jpeg', '-r', str(DPI), '-f', '37', '-l', '491',
         PDF_OLD, str(IMG_ANSWERS / 'page')],
        check=True
    )

    count = len(list(IMG_ANSWERS.glob('page-*.jpg')))
    print(f'  → {count} 枚生成（{IMG_ANSWERS}）')


def main():
    build_questions()
    build_answers()

    # 旧 images/ 直下に置きっぱなしの古い画像があれば消す
    legacy = list((ROOT / 'images').glob('page-*.jpg'))
    if legacy:
        for f in legacy:
            f.unlink()
        print(f'▶ 旧画像 {len(legacy)} 枚を削除')

    print('✅ 完了')


if __name__ == '__main__':
    main()
