"""正式アイコン (assets/official_icon.jpeg) から PWA / iOS 用アイコンを書き出す。

デザインは描き直さない。元画像の周囲にある黒い余白（角丸の外側）だけを
取り除き、アイコン本体と同じクリーム色で埋める。iOS は角丸マスクを
自動で掛けるため、出力は角まで塗りつぶした正方形にする。

使い方: python3 scripts/make-icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "official_icon.jpeg"
OUT = ROOT / "public" / "icons"

# 元画像 1254x1254 のうち、角丸の本体は左右上下 14px 内側から始まる。
CROP_INSET = 16
# 本体の角丸半径（対角線方向の黒い領域の長さから推定）
CORNER_RADIUS = 272
# 本体の縁に近いクリーム色
CREAM = (253, 247, 235)


def flatten() -> Image.Image:
    src = Image.open(SRC).convert("RGB")
    w, h = src.size
    body = src.crop((CROP_INSET, CROP_INSET, w - CROP_INSET, h - CROP_INSET))
    size = body.size[0]
    # 角丸の内側を残すマスク（縁の暗い境界線が残らないよう少し内側に取り、ぼかして馴染ませる）
    scale = 4
    mask = Image.new("L", (size * scale, size * scale), 0)
    inset = 3 * scale
    ImageDraw.Draw(mask).rounded_rectangle(
        (inset, inset, size * scale - inset, size * scale - inset),
        radius=CORNER_RADIUS * scale,
        fill=255,
    )
    mask = mask.resize((size, size), Image.LANCZOS).filter(ImageFilter.GaussianBlur(2))
    base = Image.new("RGB", (size, size), CREAM)
    base.paste(body, (0, 0), mask)
    return base


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    full = flatten()
    for name, px in {
        "icon-512.png": 512,
        "icon-192.png": 192,
        "apple-touch-icon.png": 180,
        "favicon-48.png": 48,
        "favicon-32.png": 32,
    }.items():
        full.resize((px, px), Image.LANCZOS).save(OUT / name, optimize=True)

    # maskable 用: Android 等で円形などに切り抜かれても文字が欠けないよう、
    # セーフゾーン (中央 80%) に収まるよう縮小してクリーム色の余白を付ける。
    m = 512
    inner = int(m * 0.82)
    maskable = Image.new("RGB", (m, m), CREAM)
    off = (m - inner) // 2
    maskable.paste(full.resize((inner, inner), Image.LANCZOS), (off, off))
    maskable.save(OUT / "icon-maskable-512.png", optimize=True)
    print("icons written to", OUT)


if __name__ == "__main__":
    main()
