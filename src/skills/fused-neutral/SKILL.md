---
name: fused-neutral
description: Detects fused neutral installations in electrical meter setups, including metal clad enclosures, separate neutral fuse carriers, and associated labels.
---

# Fused Neutral Detection

## What to Look For

### FUSED NEUTRAL = True if ANY of these are present:
- A **separate fuse carrier or switch-fuse unit** labeled "Neutral", "N", "Fused Neutral", or "Neutral Fuse"
- A **closed metal clad enclosure** (grey/black metal cabinet with access door) — if closed with no clear indicators, **assume fused_neutral=True**
- **Multiple fuse carriers** (two or more fuse carriers mounted together, e.g. on a wooden board)
- **Three fuses** visible instead of the standard single phase fuse
- Manufacturer labels indicating fused neutral units: **Lucy**, **MEM**, or similar
- Warning labels mentioning "Neutral Fuse" or "Fused Neutral"
- Older style ceramic fuse holders with a second carrier directly below the first

### FUSED NEUTRAL = False if ALL of these apply:
- Standard open cut-out with a **single fuse only**
- **No metal clad enclosure** present
- **No labels** or indicators of fused neutral
- Modern installation (smart meter, PME earth block, RCD consumer unit)
- Clear unobstructed view confirming standard installation

## Metal Clad Detection

- Closed metal box/enclosure covering the equipment
- Grey or black metal cabinet with an access door
- Look for manufacturer labels on closed boxes (Lucy, MEM = likely fused neutral)
- If the box is **closed with no clear indicators**, assume fused_neutral=True and state this in reasoning

## Key Distinctions

| Feature | Fused Neutral? |
|---|---|
| Two separate fuse carriers on wooden board | Yes |
| Single open cut-out, one fuse only | No |
| Closed metal clad enclosure (no labels) | Yes (assume) |
| Closed metal clad with Lucy/MEM label | Yes (confirmed) |
| Modern PME earth block visible | No |
| Three fuses visible | Yes |
| Smart meter + standard consumer unit | No |

## Output Format

Respond with JSON only:

```json
{
    "fused_neutral": "True or False",
    "metal_clad": "True or False",
    "neutral_fuse_visible": "True, False, or Not Visible (closed enclosure)",
    "fuse_rating": "number + A (e.g. 100A) or Not Visible",
    "manufacturer": "brand name or Not Visible",
    "labels_present": "describe any labels seen",
    "image_description": "detailed description of the installation",
    "area_description": "location context if determinable",
    "confidence_score": 0,
    "reasoning": "State exactly what you see: [describe visible components]. Metal clad present: [Yes/No]. Neutral fuse visible: [Yes/No]. Therefore fused_neutral=[True/False] because [specific reason]. If assumption made due to closed box, state this clearly."
}
```

## Severity Guidelines

- **none**: Clearly standard installation — no fused neutral indicators present
- **low**: Ambiguous installation — possible fused neutral but insufficient evidence
- **medium**: Probable fused neutral — metal clad present or partial indicators visible
- **high**: Likely fused neutral — multiple indicators present (e.g. metal clad + labels)
- **critical**: Confirmed fused neutral — separate neutral fuse carrier clearly visible, or explicit label

## Reference Examples

### Example 1 — Fused Neutral Present
- Two separate fuse carriers mounted on a wooden board
- Top carrier: white/cream ceramic fuse holders with visible fuses
- Second fuse carrier directly below the first
- Black metal clad enclosure on the right side
- Weathered wooden backing board
→ `fused_neutral: True`, `metal_clad: True`, `neutral_fuse_visible: True`

### Example 2 — No Fused Neutral
- Modern EDMI smart meter at top
- PME EARTH block clearly labeled in center
- Standard consumer unit / RCD on right
- SMS data hub label visible
- No old-style fuse carriers, no metal clad enclosure
→ `fused_neutral: False`, `metal_clad: False`, `neutral_fuse_visible: False`

## Notes

1. Always check for **labels first** — explicit "Fused Neutral" or "Neutral Fuse" labels are definitive
2. For **closed metal clad boxes**, assume fused_neutral=True unless evidence contradicts it
3. The presence of a **PME earth block** strongly suggests a modern installation (no fused neutral)
4. **Wooden backing boards** are associated with older installations that are more likely to have fused neutrals
5. Do not confuse a standard single cut-out with a fused neutral installation
