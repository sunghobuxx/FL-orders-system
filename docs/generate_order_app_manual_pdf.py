from __future__ import annotations

from pathlib import Path
from textwrap import wrap

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
ASSETS = DOCS / "order_app_manual_assets"
OUT = DOCS / "FruitLife_주문용_앱_사용_매뉴얼.pdf"
FONT_PATH = Path("/System/Library/Fonts/AppleSDGothicNeo.ttc")
LOGO_PATHS = [
    ROOT / "apps/web/public/logo.png",
    ROOT / "apps/mobile/assets/icon.png",
]

A4 = (1240, 1754)
PHONE = (430, 920)

GREEN = "#16a34a"
DARK = "#111827"
MUTED = "#6b7280"
LIGHT = "#f8fafc"
BORDER = "#e5e7eb"
BLUE = "#2563eb"
RED = "#dc2626"
PURPLE = "#9333ea"


def font(size: int, weight: str = "regular") -> ImageFont.FreeTypeFont:
    index = 0
    # AppleSDGothicNeo.ttc contains multiple weights; these indices are stable
    # enough for local rendering, and gracefully fall back to default if needed.
    if weight == "bold":
        index = 6
    elif weight == "semibold":
        index = 5
    try:
        return ImageFont.truetype(str(FONT_PATH), size=size, index=index)
    except Exception:
        return ImageFont.load_default()


F = {
    "cover": font(58, "bold"),
    "h1": font(38, "bold"),
    "h2": font(27, "bold"),
    "h3": font(22, "bold"),
    "body": font(21),
    "body_b": font(21, "bold"),
    "small": font(17),
    "small_b": font(17, "bold"),
    "tiny": font(14),
    "num": font(36, "bold"),
}


def rounded(draw: ImageDraw.ImageDraw, xy, radius=24, fill="white", outline=BORDER, width=2):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def text(draw, xy, s, fnt, fill=DARK, anchor=None, align="left"):
    draw.text(xy, s, font=fnt, fill=fill, anchor=anchor, align=align)


def wrapped(draw, xy, s, fnt, width_chars=36, fill=DARK, line_gap=8, bullet=False):
    x, y = xy
    lines: list[str] = []
    for paragraph in s.split("\n"):
        if not paragraph.strip():
            lines.append("")
            continue
        lines.extend(wrap(paragraph, width=width_chars, break_long_words=False))
    for line in lines:
        prefix = "• " if bullet and line else ""
        draw.text((x, y), prefix + line, font=fnt, fill=fill)
        y += fnt.size + line_gap
    return y


def load_logo(max_w=170, max_h=80):
    for p in LOGO_PATHS:
        if p.exists():
            img = Image.open(p).convert("RGBA")
            img.thumbnail((max_w, max_h))
            return img
    return None


def new_page():
    img = Image.new("RGB", A4, "white")
    return img, ImageDraw.Draw(img)


def pill(draw, xy, label, fill="#dcfce7", color=GREEN, pad_x=18, pad_y=8):
    x, y = xy
    bbox = draw.textbbox((0, 0), label, font=F["small_b"])
    w = bbox[2] - bbox[0] + pad_x * 2
    h = bbox[3] - bbox[1] + pad_y * 2
    draw.rounded_rectangle((x, y, x + w, y + h), radius=h // 2, fill=fill)
    draw.text((x + pad_x, y + pad_y - 2), label, font=F["small_b"], fill=color)
    return x + w


def phone_base(title: str, active: str) -> Image.Image:
    im = Image.new("RGBA", PHONE, "#f8fafc")
    d = ImageDraw.Draw(im)
    rounded(d, (0, 0, PHONE[0] - 1, PHONE[1] - 1), 42, fill="#f8fafc", outline="#d1d5db", width=2)
    d.rounded_rectangle((120, 16, 310, 44), radius=15, fill="#eef2f7")
    d.text((28, 35), "9:41", font=F["small_b"], fill=DARK)
    d.text((360, 35), "▰▰", font=F["small"], fill=DARK)
    d.text((PHONE[0] // 2, 88), title, font=F["h3"], fill=DARK, anchor="mm")
    d.line((0, 128, PHONE[0], 128), fill=BORDER, width=2)
    d.rounded_rectangle((0, PHONE[1] - 88, PHONE[0], PHONE[1]), radius=28, fill="white", outline=BORDER)
    menus = [("홈", "⌂"), ("발주", "▣"), ("정산", "▭"), ("웨이팅", "◷"), ("공지·문의", "○")]
    gap = PHONE[0] // 5
    for i, (name, icon) in enumerate(menus):
        cx = gap * i + gap // 2
        color = GREEN if name == active else "#9ca3af"
        d.text((cx, PHONE[1] - 62), icon, font=F["h3"], fill=color, anchor="mm")
        d.text((cx, PHONE[1] - 30), name, font=F["tiny"], fill=color, anchor="mm")
    return im


def make_login() -> Image.Image:
    im = Image.new("RGBA", PHONE, "#f8fafc")
    d = ImageDraw.Draw(im)
    rounded(d, (0, 0, PHONE[0] - 1, PHONE[1] - 1), 42, fill="#f8fafc", outline="#d1d5db", width=2)
    d.rounded_rectangle((120, 16, 310, 44), radius=15, fill="#eef2f7")
    logo = load_logo(110, 110)
    if logo:
        im.alpha_composite(logo, ((PHONE[0] - logo.width) // 2, 150))
    else:
        d.ellipse((165, 150, 265, 250), fill="#dcfce7")
        d.text((215, 200), "F", font=F["cover"], fill=GREEN, anchor="mm")
    d.text((PHONE[0] // 2, 290), "FruitLife", font=F["h1"], fill=DARK, anchor="mm")
    d.text((PHONE[0] // 2, 328), "주문용 어플리케이션", font=F["body"], fill=MUTED, anchor="mm")
    for y, label in [(410, "이메일"), (492, "비밀번호")]:
        rounded(d, (48, y, PHONE[0] - 48, y + 58), 16, fill="white", outline=BORDER)
        d.text((68, y + 18), label, font=F["small"], fill="#9ca3af")
    d.rounded_rectangle((48, 592, PHONE[0] - 48, 656), radius=18, fill=GREEN)
    d.text((PHONE[0] // 2, 624), "로그인", font=F["body_b"], fill="white", anchor="mm")
    d.text((PHONE[0] // 2, 720), "발주 · 정산 · 웨이팅을 한 번에 관리합니다", font=F["small"], fill=MUTED, anchor="mm")
    return im


def make_home() -> Image.Image:
    im = phone_base("홈", "홈")
    d = ImageDraw.Draw(im)
    y = 158
    rounded(d, (28, y, PHONE[0] - 28, y + 112), 24, fill="white")
    d.text((52, y + 24), "오늘 발주 현황", font=F["small"], fill=MUTED)
    d.text((52, y + 58), "제출 완료", font=F["h2"], fill=GREEN)
    pill(d, (300, y + 42), "6개")
    y += 132
    rounded(d, (28, y, PHONE[0] - 28, y + 100), 24, fill="white")
    d.text((52, y + 24), "현재 미수금", font=F["small"], fill=MUTED)
    d.text((52, y + 55), "1,126,500원", font=F["num"], fill=RED)
    y += 120
    rounded(d, (28, y, PHONE[0] - 28, y + 165), 22, fill="white")
    d.text((52, y + 24), "현재 납품 단가", font=F["small_b"], fill=DARK)
    items = [("꽃상추", "41,000원/box"), ("미나리", "23,000원/box"), ("대파", "2,000원/단")]
    for i, (a, b) in enumerate(items):
        yy = y + 64 + i * 33
        d.text((52, yy), a, font=F["small"], fill=DARK)
        d.text((PHONE[0] - 52, yy), b, font=F["small_b"], fill=DARK, anchor="ra")
    y += 185
    rounded(d, (28, y, PHONE[0] - 28, y + 142), 22, fill="white")
    d.text((52, y + 24), "이번 주 발주 분석", font=F["small_b"], fill=DARK)
    d.line((68, y + 102, 330, y + 56), fill=BLUE, width=4)
    d.line((330, y + 56, 374, y + 44), fill=BLUE, width=4)
    d.text((302, y + 112), "주간 비용 76,700원", font=F["small_b"], fill=GREEN)
    return im


def make_order() -> Image.Image:
    im = phone_base("발주", "발주")
    d = ImageDraw.Draw(im)
    d.text((28, 156), "오늘 필요한 품목 수량을 입력하세요", font=F["small_b"], fill=BLUE)
    y = 200
    rounded(d, (28, y, PHONE[0] - 28, y + 405), 22, fill="white")
    d.text((54, y + 28), "품목", font=F["small_b"], fill=MUTED)
    d.text((220, y + 28), "수량", font=F["small_b"], fill=MUTED, anchor="ma")
    d.text((335, y + 28), "단위", font=F["small_b"], fill=MUTED, anchor="ma")
    rows = [("미나리", "2", "box"), ("양배추", "1", "ea"), ("깐마늘", "1", "kg"), ("대파", "5", "단")]
    for i, (name, qty, unit) in enumerate(rows):
        yy = y + 78 + i * 72
        d.line((54, yy - 16, PHONE[0] - 54, yy - 16), fill="#eef2f7", width=2)
        d.rounded_rectangle((54, yy, 174, yy + 44), radius=12, fill="#f3f4f6")
        d.text((72, yy + 12), name, font=F["small_b"], fill=DARK)
        d.rounded_rectangle((194, yy, 248, yy + 44), radius=12, fill="white", outline="#d1d5db", width=2)
        d.text((221, yy + 22), qty, font=F["small_b"], fill=DARK, anchor="mm")
        d.text((314, yy + 22), unit, font=F["small_b"], fill=MUTED, anchor="mm")
        d.text((PHONE[0] - 62, yy + 22), "삭제", font=F["small_b"], fill=RED, anchor="rm")
    d.rounded_rectangle((56, y + 334, PHONE[0] - 56, y + 382), radius=14, fill=GREEN)
    d.text((PHONE[0] // 2, y + 358), "발주 제출", font=F["body_b"], fill="white", anchor="mm")
    y = 630
    rounded(d, (28, y, PHONE[0] - 28, y + 145), 20, fill="white")
    d.text((52, y + 24), "발주 현황", font=F["small_b"], fill=DARK)
    pill(d, (52, y + 62), "발주접수", "#dbeafe", BLUE)
    pill(d, (155, y + 62), "배송중", "#fef3c7", "#b45309")
    pill(d, (245, y + 62), "배송완료", "#dcfce7", GREEN)
    return im


def make_settlement() -> Image.Image:
    im = phone_base("정산", "정산")
    d = ImageDraw.Draw(im)
    y = 154
    rounded(d, (28, y, PHONE[0] - 28, y + 104), 24, fill="white")
    d.text((52, y + 22), "현재 미수금", font=F["small"], fill=MUTED)
    d.text((52, y + 54), "1,126,500원", font=F["num"], fill=RED)
    pill(d, (310, y + 38), "주정산", "#f3e8ff", PURPLE)
    y += 138
    d.text((28, y), "당일 명세서", font=F["h3"], fill=MUTED)
    d.text((154, y + 4), "최종금액은 13시 전에 업로드됩니다.", font=F["tiny"], fill="#9ca3af")
    y += 44
    rounded(d, (28, y, PHONE[0] - 28, y + 252), 22, fill="white")
    d.text((52, y + 24), "2026-07-20", font=F["h3"], fill=DARK)
    d.text((PHONE[0] - 52, y + 30), "76,700원", font=F["h2"], fill=GREEN, anchor="ra")
    rows = [("미나리", "2box", "46,000원"), ("매화 일자 콩나물", "2box", "8,000원"), ("양배추", "1ea", "3,500원"), ("깐마늘", "1kg", "8,000원")]
    for i, (a, b, c) in enumerate(rows):
        yy = y + 88 + i * 36
        d.text((52, yy), a, font=F["small"], fill=DARK)
        d.text((282, yy), b, font=F["small"], fill=MUTED, anchor="ra")
        d.text((PHONE[0] - 52, yy), c, font=F["small_b"], fill=DARK, anchor="ra")
    y += 280
    d.text((28, y), "정산 내역", font=F["h3"], fill=MUTED)
    for i, (period, amount) in enumerate([("7/20 ~ 7/26", "76,700원"), ("7/13 ~ 7/19", "520,000원")]):
        yy = y + 44 + i * 76
        rounded(d, (28, yy, PHONE[0] - 28, yy + 58), 18, fill="white")
        d.text((54, yy + 18), period, font=F["body_b"], fill=DARK)
        d.text((PHONE[0] - 72, yy + 18), amount, font=F["body_b"], fill=GREEN, anchor="ra")
    return im


def make_waiting() -> Image.Image:
    im = phone_base("웨이팅", "웨이팅")
    d = ImageDraw.Draw(im)
    d.text((28, 156), "매장 대기 고객을 상태별로 관리합니다", font=F["small_b"], fill=DARK)
    y = 200
    for i, (name, info, status, color) in enumerate([
        ("김민수", "2명 · 12분 대기", "자리남", BLUE),
        ("이서연", "4명 · 18분 대기", "입장", GREEN),
        ("박지훈", "3명 · 25분 대기", "노쇼", RED),
    ]):
        yy = y + i * 120
        rounded(d, (28, yy, PHONE[0] - 28, yy + 96), 22, fill="white")
        d.text((54, yy + 22), name, font=F["body_b"], fill=DARK)
        d.text((54, yy + 56), info, font=F["small"], fill=MUTED)
        d.rounded_rectangle((PHONE[0] - 132, yy + 28, PHONE[0] - 48, yy + 66), radius=16, fill=color)
        d.text((PHONE[0] - 90, yy + 47), status, font=F["small_b"], fill="white", anchor="mm")
    y = 590
    rounded(d, (28, y, PHONE[0] - 28, y + 135), 22, fill="#eff6ff", outline="#bfdbfe")
    d.text((52, y + 26), "손님용 웨이팅 URL", font=F["small_b"], fill=BLUE)
    d.text((52, y + 62), "매장 입구 QR로 고객이 직접 등록", font=F["small"], fill=DARK)
    d.rounded_rectangle((300, y + 28, 376, y + 104), radius=10, fill="white")
    d.text((338, y + 66), "QR", font=F["h3"], fill=DARK, anchor="mm")
    return im


def make_notice() -> Image.Image:
    im = phone_base("공지·문의", "공지·문의")
    d = ImageDraw.Draw(im)
    y = 156
    rounded(d, (28, y, PHONE[0] - 28, y + 192), 22, fill="white")
    d.text((52, y + 24), "공지사항", font=F["h3"], fill=DARK)
    notices = ["7월 배송 시간 안내", "단가 변경 공지", "휴무일 발주 안내"]
    for i, n in enumerate(notices):
        yy = y + 70 + i * 36
        d.text((54, yy), n, font=F["small_b"], fill=DARK)
        d.text((PHONE[0] - 54, yy), "›", font=F["body_b"], fill="#9ca3af", anchor="ra")
    y += 226
    rounded(d, (28, y, PHONE[0] - 28, y + 255), 22, fill="white")
    d.text((52, y + 24), "불편 & 문의", font=F["h3"], fill=DARK)
    d.rounded_rectangle((PHONE[0] - 152, y + 22, PHONE[0] - 52, y + 58), radius=16, fill=GREEN)
    d.text((PHONE[0] - 102, y + 40), "문의 작성", font=F["small_b"], fill="white", anchor="mm")
    inquiries = [("배송 누락 문의", "대기중"), ("품목 상태 문의", "답변완료")]
    for i, (title, status) in enumerate(inquiries):
        yy = y + 82 + i * 70
        d.line((52, yy - 10, PHONE[0] - 52, yy - 10), fill="#eef2f7", width=2)
        d.text((54, yy), title, font=F["small_b"], fill=DARK)
        color = GREEN if status == "답변완료" else "#f59e0b"
        pill(d, (PHONE[0] - 140, yy - 5), status, "#f3f4f6", color)
        d.text((54, yy + 30), "사진 첨부 가능 · 관리자 답변 확인", font=F["tiny"], fill=MUTED)
    return im


def place_phone(page: Image.Image, phone: Image.Image, xy):
    shadow = Image.new("RGBA", (phone.width + 24, phone.height + 24), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle((14, 18, phone.width + 10, phone.height + 14), radius=46, fill=(15, 23, 42, 28))
    page.paste(shadow, (xy[0] - 12, xy[1] - 12), shadow)
    page.paste(phone, xy, phone)


def header(draw, title, subtitle=None):
    draw.text((78, 70), title, font=F["h1"], fill=DARK)
    if subtitle:
        draw.text((80, 122), subtitle, font=F["body"], fill=MUTED)


def section(draw, x, y, label, body, color=GREEN, width_chars=38):
    draw.text((x, y), label, font=F["h2"], fill=DARK)
    return wrapped(draw, (x, y + 42), body, F["body"], width_chars=width_chars, fill="#374151", line_gap=10)


def callout(draw, xy, title, body, fill="#ecfdf5", outline="#bbf7d0", color=GREEN):
    x, y, w, h = xy
    rounded(draw, (x, y, x + w, y + h), 24, fill=fill, outline=outline)
    draw.text((x + 28, y + 24), title, font=F["h3"], fill=color)
    wrapped(draw, (x + 28, y + 64), body, F["small"], width_chars=max(20, w // 18), fill="#374151")


def make_pages():
    ASSETS.mkdir(parents=True, exist_ok=True)
    shots = {
        "01_login.png": make_login(),
        "02_home.png": make_home(),
        "03_order.png": make_order(),
        "04_settlement.png": make_settlement(),
        "05_waiting.png": make_waiting(),
        "06_notice.png": make_notice(),
    }
    for name, img in shots.items():
        img.convert("RGB").save(ASSETS / name, quality=95)

    pages: list[Image.Image] = []

    p, d = new_page()
    logo = load_logo(210, 110)
    if logo:
        p.paste(logo, (80, 105), logo)
    d.text((80, 280), "FruitLife", font=F["cover"], fill=GREEN)
    d.text((80, 355), "주문용 어플리케이션\n사용 매뉴얼", font=F["cover"], fill=DARK, spacing=18)
    d.text((82, 520), "거래처/식당 담당자용", font=F["h2"], fill=MUTED)
    callout(d, (80, 650, 500, 190), "이 매뉴얼로 할 수 있는 것", "로그인부터 발주, 정산, 웨이팅, 공지·문의까지 앱 사용 흐름을 빠르게 확인할 수 있습니다.")
    place_phone(p, shots["01_login.png"], (720, 210))
    d.text((80, 1590), "발주 누락을 줄이고, 당일 명세서와 문의 내역을 한 곳에서 확인하세요.", font=F["body"], fill=MUTED)
    pages.append(p)

    p, d = new_page()
    header(d, "1. 시작하기와 하단 메뉴", "앱을 실행한 뒤 로그인하고, 하단 메뉴에서 필요한 기능으로 이동합니다.")
    place_phone(p, shots["02_home.png"], (735, 180))
    y = section(d, 78, 210, "로그인", "이메일과 비밀번호를 입력하고 로그인합니다. 최초 로그인 시 알림 권한을 허용하면 발주 상태와 공지 알림을 받을 수 있습니다.", width_chars=32)
    y = section(d, 78, y + 50, "하단 메뉴", "홈: 오늘 발주 현황과 주요 요약\n발주: 오늘 발주 작성 및 내역 확인\n정산: 당일 명세서와 미수금 확인\n웨이팅: 매장 대기 고객 관리\n공지·문의: 공지 확인 및 문의 접수", width_chars=32)
    callout(d, (78, 930, 560, 160), "추천 사용 순서", "출근 후 홈에서 오늘 상태를 확인하고, 발주 메뉴에서 수량을 입력한 뒤 정산 메뉴에서 당일 명세서를 확인하세요.")
    pages.append(p)

    p, d = new_page()
    header(d, "2. 발주하기", "필요한 품목의 수량만 입력하고 제출하면 오늘 발주가 접수됩니다.")
    place_phone(p, shots["03_order.png"], (735, 180))
    y = section(d, 78, 210, "발주 작성", "1) 하단 메뉴에서 발주를 누릅니다.\n2) 발주 작성 탭에서 품목별 수량을 입력합니다.\n3) 입력이 끝나면 발주 제출 버튼을 누릅니다.", width_chars=32)
    y = section(d, 78, y + 45, "발주 수정", "오늘 발주는 같은 화면에서 다시 수량을 입력하고 제출하면 갱신됩니다. 단, 관리자 처리 이후에는 운영상 수정이 제한될 수 있습니다.", width_chars=32)
    callout(d, (78, 920, 560, 185), "상태 확인", "발주 현황에서 발주접수 → 알림톡발송 → 배송중 → 배송완료 순서로 진행 상황을 확인합니다.", fill="#eff6ff", outline="#bfdbfe", color=BLUE)
    pages.append(p)

    p, d = new_page()
    header(d, "3. 정산 확인", "현재 미수금, 당일 명세서, 주차별 명세서 내역을 확인합니다.")
    place_phone(p, shots["04_settlement.png"], (735, 180))
    y = section(d, 78, 210, "현재 미수금", "현재 남아있는 미수금을 상단 카드에서 바로 확인할 수 있습니다.", width_chars=32)
    y = section(d, 78, y + 45, "당일 명세서", "오늘 납품된 품목, 수량, 금액을 확인합니다. 최종금액은 13시 전에 업로드됩니다.", width_chars=32)
    y = section(d, 78, y + 45, "명세서 내역", "주차별 내역을 눌러 상세 품목과 금액을 확인할 수 있습니다.", width_chars=32)
    callout(d, (78, 1010, 560, 170), "금액이 달라 보일 때", "단가 변경, 수량 수정, 배송 확인 상태에 따라 금액이 달라질 수 있습니다. 최종 확정 후 다시 확인해주세요.", fill="#fef2f2", outline="#fecaca", color=RED)
    pages.append(p)

    p, d = new_page()
    header(d, "4. 웨이팅 관리", "웨이팅 기능을 사용하는 매장은 앱에서 대기 고객을 관리할 수 있습니다.")
    place_phone(p, shots["05_waiting.png"], (735, 180))
    y = section(d, 78, 210, "웨이팅 목록", "고객명, 인원 수, 대기 시간, 현재 상태를 확인합니다.", width_chars=32)
    y = section(d, 78, y + 45, "상태 변경", "자리가 나면 자리남, 고객이 들어오면 입장, 방문하지 않으면 노쇼 또는 취소로 처리합니다.", width_chars=32)
    callout(d, (78, 835, 560, 185), "손님용 QR 활용", "웨이팅 URL을 QR 코드로 만들어 매장 입구에 붙이면 고객이 직접 웨이팅을 등록할 수 있습니다.", fill="#eff6ff", outline="#bfdbfe", color=BLUE)
    pages.append(p)

    p, d = new_page()
    header(d, "5. 공지·문의와 자주 묻는 질문", "공지사항을 확인하고, 문의/불편 사항을 관리자에게 전달합니다.")
    place_phone(p, shots["06_notice.png"], (735, 180))
    y = section(d, 78, 210, "공지사항", "운영 공지, 배송 시간, 단가 변경, 휴무일 안내 등을 확인합니다.", width_chars=32)
    y = section(d, 78, y + 45, "문의/불편 접수", "제목과 내용을 입력하고 필요하면 사진을 첨부합니다. 답변이 등록되면 상세 화면에서 확인할 수 있습니다.", width_chars=32)
    callout(d, (78, 835, 560, 325), "FAQ", "Q. 발주 품목이 보이지 않아요.\nA. 업체에 등록된 품목이 없을 수 있습니다. 관리자에게 품목 등록을 요청해주세요.\n\nQ. 알림이 오지 않아요.\nA. 휴대폰 설정에서 FruitLife 앱 알림 권한을 확인해주세요.\n\nQ. 로그인이 안 돼요.\nA. 이메일/비밀번호를 확인하고, 계속 실패하면 관리자에게 계정 상태 확인을 요청해주세요.", fill="#f8fafc", outline=BORDER, color=DARK)
    pages.append(p)

    return pages


def main():
    pages = make_pages()
    rgb_pages = [p.convert("RGB") for p in pages]
    rgb_pages[0].save(OUT, save_all=True, append_images=rgb_pages[1:], resolution=150.0)
    print(OUT)


if __name__ == "__main__":
    main()
