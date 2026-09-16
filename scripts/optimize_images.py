"""Turn a source photograph into the web-sized WebP variants the app serves.

The originals in design/assets/Imagens-Profeta-Elias are camera files — up to
4096px and several megabytes each. Serving those to a congregation on mobile
data would be wasteful, so anything used in the interface passes through here
first.

    python3 scripts/optimize_images.py <source.jpg> <output-name> [more pairs...]

Writes design/assets/photos/<output-name>-640.webp and -1280.webp.
"""

import sys
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / 'design' / 'assets' / 'photos'
WIDTHS = (640, 1280)
QUALITY = 82


def optimize(source: Path, name: str) -> None:
    with Image.open(source) as image:
        image = ImageOps.exif_transpose(image).convert('RGB')
        for width in WIDTHS:
            if image.width <= width and width != WIDTHS[0]:
                continue
            scale = width / image.width
            resized = image.resize((width, round(image.height * scale)), Image.LANCZOS)
            target = OUTPUT_DIR / f'{name}-{width}.webp'
            resized.save(target, 'WEBP', quality=QUALITY, method=6)
            kb = target.stat().st_size / 1024
            print(f'  {target.relative_to(ROOT)}  {resized.width}x{resized.height}  {kb:.0f} KB')


def main() -> None:
    pairs = sys.argv[1:]
    if not pairs or len(pairs) % 2:
        print(__doc__)
        raise SystemExit(1)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for index in range(0, len(pairs), 2):
        source = Path(pairs[index])
        if not source.is_absolute():
            source = ROOT / source
        print(f'{source.name} ->')
        optimize(source, pairs[index + 1])


if __name__ == '__main__':
    main()
