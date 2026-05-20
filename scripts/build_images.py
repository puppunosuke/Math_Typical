#!/usr/bin/env python3
"""
PDF から画像を生成する前処理スクリプト。

- 新PDF（印刷用、1問1ページ）→ images/questions/q-NNN.jpg（Nは問題番号、個別トリミング）
- 旧PDF（PC版、解答編含む）  → images/answers/page-NNN.jpg（Nは旧PDFのページ番号、フッター除去のみ）

individual トリミング:
  問題画像は、フッター除去 + 「本文末尾から下の余白」を自動検出して切る。
  問題ごとに本文の長さが違うので、固定値ではなく個別判定。
"""
import subprocess
import shutil
from pathlib import Path
from PIL import Image, ImageChops

PDF_NEW = "/Users/selaheuwit/Documents/Claude/【印刷用】高校数学の問題集.pdf"
PDF_OLD = "/Users/selaheuwit/Documents/Claude/【PC版】高校数学の問題集.pdf"
ROOT = Path(__file__).parent.parent
IMG_QUESTIONS = ROOT / 'images' / 'questions'
IMG_ANSWERS = ROOT / 'images' / 'answers'
DPI = 150

# トリミング設定
FOOTER_H = 80      # 下端からこのpx分を切る（ページ番号と複製禁止テキスト）
GAP_THRESHOLD = 80 # 白い行がこの行数続いたらコンテンツの下端と判定
PADDING = 20       # コンテンツの周囲に残す余白


def trim_problem_image(img: Image.Image) -> Image.Image:
    """問題画像用の積極的トリミング。
    1. フッター除去（下端 FOOTER_H px）
    2. 下からスキャンして本文末尾を検出、その下をカット
    3. 四方の余白を bbox で削る（PADDING を残す）
    """
    W, H = img.size

    # 1. フッター除去
    cropped = img.crop((0, 0, W, H - FOOTER_H))

    # 2. 下から本文末尾を探す（白い行が GAP_THRESHOLD 行続いたら終わり）
    gray = cropped.convert('L')
    pixels = gray.load()
    cropped_h = cropped.size[1]
    last_content_y = None
    blank_count = 0
    for y in range(cropped_h - 1, -1, -1):
        # 行内のコンテンツ判定（4pxスキップで高速化）
        has_content = any(pixels[x, y] < 220 for x in range(0, W, 4))
        if has_content:
            if last_content_y is None:
                last_content_y = y
            blank_count = 0
        else:
            if last_content_y is not None:
                blank_count += 1
                if blank_count >= GAP_THRESHOLD:
                    break
    bottom = min(cropped_h, (last_content_y if last_content_y is not None else cropped_h) + PADDING)
    cropped2 = cropped.crop((0, 0, W, bottom))

    # 3. 四方の bbox で更に余白を削る
    gray2 = cropped2.convert('L')
    mask = gray2.point(lambda p: 0 if p < 220 else 255)
    bbox = ImageChops.invert(mask).getbbox()
    if not bbox:
        return cropped2
    left, top, right, bot = bbox
    left = max(0, left - PADDING)
    top = max(0, top - PADDING)
    right = min(cropped2.size[0], right + PADDING)
    bot = min(cropped2.size[1], bot + PADDING)
    return cropped2.crop((left, top, right, bot))


def trim_answer_image(img: Image.Image) -> Image.Image:
    """解答画像用のトリミング。
    解答は複数ページに連続するため、本文末尾の検出はしない（ページ末まで内容がある可能性）。
    フッター（ページ番号 + 複製禁止）と左右余白だけ削る。
    """
    W, H = img.size
    cropped = img.crop((0, 0, W, H - FOOTER_H))
    # 左右の bbox だけ取る（上下は維持してページ間の連続性を保つ）
    gray = cropped.convert('L')
    mask = gray.point(lambda p: 0 if p < 220 else 255)
    bbox = ImageChops.invert(mask).getbbox()
    if not bbox:
        return cropped
    left = max(0, bbox[0] - PADDING)
    right = min(cropped.size[0], bbox[2] + PADDING)
    return cropped.crop((left, 0, right, cropped.size[1]))


def build_questions():
    print('▶ 問題画像を生成中（個別トリミング）...')
    if IMG_QUESTIONS.exists():
        shutil.rmtree(IMG_QUESTIONS)
    IMG_QUESTIONS.mkdir(parents=True)

    subprocess.run(
        ['pdftoppm', '-jpeg', '-r', str(DPI), '-f', '2', '-l', '251',
         PDF_NEW, str(IMG_QUESTIONS / 'page')],
        check=True
    )

    total_h = 0
    count = 0
    for f in sorted(IMG_QUESTIONS.glob('page-*.jpg')):
        page_num = int(f.stem.split('-')[1])
        q_num = page_num - 1  # P2 → 問題1
        img = Image.open(f)
        trimmed = trim_problem_image(img)
        new_path = IMG_QUESTIONS / f'q-{q_num:03d}.jpg'
        trimmed.save(new_path, 'JPEG', quality=85, optimize=True)
        f.unlink()
        total_h += trimmed.size[1]
        count += 1
    avg_h = total_h / count if count else 0
    print(f'  → {count} 枚生成、平均高さ {avg_h:.0f}px（{IMG_QUESTIONS}）')


def build_answers():
    print('▶ 解答画像を生成中（フッターのみ除去）...')
    if IMG_ANSWERS.exists():
        shutil.rmtree(IMG_ANSWERS)
    IMG_ANSWERS.mkdir(parents=True)

    subprocess.run(
        ['pdftoppm', '-jpeg', '-r', str(DPI), '-f', '37', '-l', '491',
         PDF_OLD, str(IMG_ANSWERS / 'page')],
        check=True
    )

    count = 0
    for f in sorted(IMG_ANSWERS.glob('page-*.jpg')):
        img = Image.open(f)
        trimmed = trim_answer_image(img)
        trimmed.save(f, 'JPEG', quality=85, optimize=True)
        count += 1
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
