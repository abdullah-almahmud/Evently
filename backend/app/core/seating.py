import string
from typing import Dict, List, Optional, Tuple
from uuid import UUID


def row_label_from_index(index: int) -> str:
    """Convert 0-based row index to alphabetic label (0->A, 25->Z, 26->AA, ...)."""
    result = ""
    n = index
    while True:
        result = string.ascii_uppercase[n % 26] + result
        n = n // 26 - 1
        if n < 0:
            break
    return result


def section_front_priority(name: str, index_fallback: int = 0) -> Tuple[int, int, str]:
    """
    Order venue sections from front (nearest stage) to back.
    Priority 0: VIP / Front / Orchestra / Premium
    Priority 1: Main / Regular / Standard / Floor / Hall
    Priority 2: Balcony / Gallery / Back / Rear / Upper
    """
    lower = name.lower()
    if any(k in lower for k in ("vip", "front", "orchestra", "premium", "stage")):
        prio = 0
    elif any(k in lower for k in ("balcony", "gallery", "back", "rear", "upper")):
        prio = 2
    else:
        prio = 1
    return (prio, index_fallback, lower)


def sort_sections_front_to_back(sections: list) -> list:
    """Sort VenueSection objects from stage-front to rear-balcony."""
    return sorted(
        sections,
        key=lambda s: section_front_priority(
            s.name,
            0,
        ),
    )


def build_generic_sections_for_capacity(total_capacity: int) -> List[Dict]:
    """
    Produce balanced generic auditorium sections whose sum(rows * seats_per_row)
    equals total_capacity cleanly.

    Presets scale naturally for UIU venues:
    - 30 seats  -> Front VIP (1x10 = 10) + Main Seating (2x10 = 20)
    - 50 seats  -> Front VIP (2x10 = 20) + Main Hall (3x10 = 30)
    - 100 seats -> Front VIP (3x10 = 30) + Main Hall (7x10 = 70)
    - 150 seats -> Front VIP (3x10 = 30) + Main Floor (8x10 = 80) + Balcony (4x10 = 40)
    - 200 seats -> Front VIP (4x10 = 40) + Main Floor (10x10 = 100) + Balcony (6x10 = 60)
    """
    cap = max(1, total_capacity)

    # Small custom rooms under 20 seats: single compact block
    if cap < 20:
        cols = min(10, cap)
        rows = cap // cols
        rem = cap % cols
        sections = [{"name": "Main Seating", "rows": rows, "seats_per_row": cols}]
        if rem > 0:
            sections.append({"name": "Front Row Extra", "rows": 1, "seats_per_row": rem})
        return sections

    # Use 10 seats per row up to 200, 12 seats per row for larger halls up to 500
    cols = 12 if cap >= 240 else 10
    total_full_rows = cap // cols
    remainder = cap % cols

    sections: List[Dict] = []
    if total_full_rows >= 12:
        vip_rows = max(2, round(total_full_rows * 0.2))
        balcony_rows = max(2, round(total_full_rows * 0.25))
        main_rows = total_full_rows - vip_rows - balcony_rows
        sections.append({"name": "VIP Front", "rows": vip_rows, "seats_per_row": cols})
        sections.append({"name": "Main Floor", "rows": main_rows, "seats_per_row": cols})
        sections.append({"name": "Balcony", "rows": balcony_rows, "seats_per_row": cols})
    elif total_full_rows >= 3:
        vip_rows = max(1, round(total_full_rows * 0.3))
        main_rows = total_full_rows - vip_rows
        sections.append({"name": "VIP Front", "rows": vip_rows, "seats_per_row": cols})
        sections.append({"name": "Main Hall", "rows": main_rows, "seats_per_row": cols})
    else:
        sections.append({"name": "Main Seating", "rows": total_full_rows, "seats_per_row": cols})

    if remainder > 0:
        sections.append({"name": "Side Gallery", "rows": 1, "seats_per_row": remainder})

    return sections
