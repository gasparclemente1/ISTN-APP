"""Turn a source photograph into the web-sized WebP variants the app serves.

The originals in design/assets/Imagens-Profeta-Elias are camera files — up to
4096px and several megabytes each. Serving those to a congregation on mobile
data would be wasteful, so anything used in the interface passes through here
first.

    python3 scripts/optimize_images.py [--larguras 640,1280] <source> <output-name> [more pairs...]

Writes design/assets/photos/<output-name>-<width>.webp for each width.

A source with transparency — a cut-out made with scripts/recortar_sujeito.js —
keeps it, and is first trimmed to the person, so the image is only as wide as
what it shows.
"""

import argparse
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / 'design' / 'assets' / 'photos'
WIDTHS = (640, 1280)
QUALITY = 82


def optimize(source: Path, name: str, widths) -> None:
    with Image.open(source) as image:
        image = ImageOps.exif_transpose(image)
        cutout = image.mode in ('RGBA', 'LA') and image.getchannel('A').getextrema()[0] < 255
        if cutout:
            image = image.convert('RGBA')
            image = image.crop(image.getchannel('A').point(lambda value: 255 if value > 8 else 0).getbbox())
        else:
            image = image.convert('RGB')
        for width in widths:
            if image.width <= width and width != widths[0]:
                continue
            scale = min(1, width / image.width)
            resized = image.resize((round(image.width * scale), round(image.height * scale)), Image.LANCZOS)
            target = OUTPUT_DIR / f'{name}-{width}.webp'
            resized.save(target, 'WEBP', quality=QUALITY, method=6)
            kb = target.stat().st_size / 1024
            print(f'  {target.relative_to(ROOT)}  {resized.width}x{resized.height}  {kb:.0f} KB{"  (sem fundo)" if cutout else ""}')


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--larguras', default=','.join(map(str, WIDTHS)), help='larguras em píxeis, separadas por vírgulas')
    parser.add_argument('pairs', nargs='+', metavar='source output-name')
    args = parser.parse_args()
    if len(args.pairs) % 2:
        parser.error('cada imagem precisa de um nome de saída')
    widths = tuple(int(width) for width in args.larguras.split(','))
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for index in range(0, len(args.pairs), 2):
        source = Path(args.pairs[index])
        if not source.is_absolute():
            source = ROOT / source
        print(f'{source.name} ->')
        optimize(source, args.pairs[index + 1], widths)


if __name__ == '__main__':
    main()
