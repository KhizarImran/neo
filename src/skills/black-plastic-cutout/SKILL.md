---
name: black-plastic-cutout
description: Detects black plastic (phenolic/Bakelite) cut-out fuse carriers in electrical meter installations, distinguishing them from modern white/grey plastic, ceramic, and metal enclosures.
---

# Black Plastic Cut-Out Detection

## What to Look For

### BLACK PLASTIC CUT-OUT = True if:
- A **black or very dark colored plastic** fuse carrier/cut-out is visible
- The material appears to be **phenolic or Bakelite** (older style dark plastic)
- A **rectangular black plastic housing** is present that contrasts with surrounding components
- The cut-out has an **aged dark brown/black appearance** typical of phenolic material

### BLACK PLASTIC CUT-OUT = False if:
- Only **white or grey** plastic cut-out boxes are visible
- Only **cream/beige ceramic** fuse holders are present (older style but not phenolic)
- Only **metal clad enclosures** are visible (grey/silver metal, not black plastic)
- No cut-out is visible in the image at all
- All visible cut-outs are modern light-coloured plastic

## Key Distinctions

| Component | Color | Material | Black Plastic Cut-Out? |
|---|---|---|---|
| Phenolic/Bakelite cut-out | Black / very dark brown | Plastic | YES |
| Modern cut-out | White or grey | Modern plastic | No |
| Ceramic fuse holder | Cream / off-white | Ceramic | No |
| Metal clad enclosure | Grey / silver / black metal | Metal | No |
| Transparent cut-out | Clear / light | Modern plastic | No |

## Output Format

Respond with JSON only:

```json
{
    "is_black_plastic_cut_out": "True or False",
    "cut_out_color": "Black, White, Grey, Cream/Beige, Mixed, or Not Visible",
    "cut_out_material": "Plastic/Phenolic, Ceramic, Metal, Modern Plastic, or Not Visible",
    "fuse_rating": "number + A (e.g. 100A) or Not Visible",
    "manufacturer": "brand name or Not Visible",
    "labels_present": "describe any labels seen",
    "image_description": "detailed description of the installation",
    "area_description": "location context if determinable",
    "confidence_score": 0,
    "reasoning": "State exactly what you see: [describe visible components]. Cut-out color: [Black/White/Grey/etc]. Material type: [Plastic/Ceramic/Metal]. Therefore is_black_plastic_cut_out=[True/False] because [specific reason based on color and material]."
}
```

## Severity Guidelines

- **none**: No black plastic cut-out present — modern white/grey installation
- **low**: Ambiguous dark component visible — unclear if phenolic plastic or metal/ceramic
- **medium**: Probable black plastic cut-out — dark plastic visible but partially obscured
- **high**: Likely phenolic cut-out — dark rectangular plastic housing clearly visible
- **critical**: Confirmed black plastic (phenolic/Bakelite) cut-out fuse carrier present

## Reference Examples

### Example 1 — Black Plastic Cut-Out Present
- Black rectangular plastic component clearly visible on right side
- Dark/black phenolic casing contrasts with lighter cork/particle board backing
- Modern digital meter on left with brown and blue cables
→ `is_black_plastic_cut_out: True`, `cut_out_color: Black`, `cut_out_material: Plastic/Phenolic`

### Example 2 — No Black Plastic Cut-Out
- Modern EDMI smart meter with white casing
- White/grey plastic cut-out boxes on right side
- Modern grey plastic components throughout
- All cut-outs are white or grey, not black phenolic
→ `is_black_plastic_cut_out: False`, `cut_out_color: White/Grey`, `cut_out_material: Modern Plastic`

## Notes

1. **Color is the primary indicator** — black or very dark brown plastic = phenolic; white/grey = modern
2. **Material matters** — phenolic has a distinctive aged, slightly dull dark appearance vs shiny modern plastic
3. Do not confuse **black metal clad enclosures** with black plastic cut-outs — metal has a different sheen and texture
4. Do not confuse **cream/beige ceramic** fuse holders with black plastic cut-outs — ceramics are light coloured
5. Black plastic cut-outs are characteristic of **older installations** and often appear alongside wooden or cork backing boards
