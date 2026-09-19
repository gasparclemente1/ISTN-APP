"""Write design/assets/photos/partilha-istn-sj.jpg, the picture under a shared link.

WhatsApp and Facebook show it in the card of any link to the app that has no
picture of its own: the Profeta Elias, the church's logo and its name. 1200 by
630, the size those services expect, as a JPEG they all read.

    python3 scripts/build_share_image.py

Needs the cut-out in design/assets/photos and a serif font; the ones macOS
ships are used by default.
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'design' / 'assets' / 'photos' / 'partilha-istn-sj.jpg'
FONTS = Path('/System/Library/Fonts/Supplemental')
W, H = 1200, 630
DEEP, TEAL, GOLD, WHITE = (4, 41, 54), (19, 81, 99), (243, 197, 70), (255, 254, 250)


def font(name, size):
    return ImageFont.truetype(str(FONTS / name), size)


def main() -> None:
    image = Image.new('RGB', (W, H), DEEP)
    # A glow behind the Profeta, and the sun's rays of the logo.
    glow = Image.new('L', (W, H), 0)
    ImageDraw.Draw(glow).ellipse((620, -120, 1260, 520), fill=150)
    image = Image.composite(Image.new('RGB', (W, H), TEAL), image, glow.filter(ImageFilter.GaussianBlur(120)))
    rays = Image.new('L', (W, H), 0)
    draw = ImageDraw.Draw(rays)
    for angle in range(0, 360, 12):
        draw.pieslice((560, -260, 1340, 520), angle, angle + 4, fill=46)
    rays = rays.filter(ImageFilter.GaussianBlur(3))
    fade = Image.new('L', (W, H), 0)
    ImageDraw.Draw(fade).ellipse((690, -110, 1210, 370), fill=255)
    rays = Image.composite(rays, Image.new('L', (W, H), 0), fade.filter(ImageFilter.GaussianBlur(70)))
    image = Image.composite(Image.new('RGB', (W, H), GOLD), image, rays)

    prophet = Image.open(ROOT / 'design' / 'assets' / 'photos' / 'profeta-elias-profecia-940.webp').convert('RGBA')
    prophet = prophet.resize((round(prophet.width * 660 / prophet.height), 660), Image.LANCZOS)
    image.paste(prophet, (W - prophet.width + 40, H - prophet.height + 30), prophet)
    # The bottom of the photograph melts into the page.
    shade = Image.linear_gradient('L').resize((W, 200))
    image.paste(Image.new('RGB', (W, 200), DEEP), (0, H - 200), shade)

    logo = Image.open(ROOT / 'design' / 'assets' / 'icons' / 'logo-istn-sj-192.webp').convert('RGBA')
    logo = logo.resize((120, round(logo.height * 120 / logo.width)), Image.LANCZOS)
    image.paste(logo, (72, 74), logo)

    draw = ImageDraw.Draw(image)
    draw.text((72, 232), 'ISTN-SJ', font=font('Georgia Bold.ttf', 112), fill=WHITE)
    draw.text((76, 372), 'Igreja Salvação de Todas as Nações', font=font('Georgia Italic.ttf', 34), fill=GOLD)
    draw.text((76, 416), 'Sol da Justiça', font=font('Georgia Italic.ttf', 34), fill=GOLD)
    draw.text((76, 500), 'Pregações · Reuniões ao vivo · Igrejas pelo mundo', font=font('Georgia.ttf', 25), fill=(201, 219, 219))

    image.save(OUTPUT, 'JPEG', quality=84, optimize=True, progressive=True)
    print(f'{OUTPUT.relative_to(ROOT)}  {W}x{H}  {OUTPUT.stat().st_size // 1024} KB')


if __name__ == '__main__':
    main()
