---
name: asbestos
description: Detects asbestos materials in electrical meter installations, including asbestos flash guards between ceramic fuse holders in metal clad enclosures and asbestos backing boards behind installations.
---

# Asbestos Detection

## What to Look For

### ASBESTOS = True if ANY of these are present:

**Location 1 — Flash Guard (Between Fuses):**
- **Grey/dark brown FIBROUS material** visible BETWEEN ceramic fuse holders inside an open metal clad enclosure
- Acts as an arc protection barrier between fuses
- Weathered, textured appearance — NOT smooth like plastic or metal
- Distinctively aged and fibrous, often with a grey/brown discoloured surface

**Location 2 — Backing Board (Behind Installation):**
- **Large grey/white fibrous board** mounted behind the entire electrical installation
- Fibrous cement-like texture with a weathered, aged grey surface
- Covers a significant area of wall behind the equipment
- Distinct from cork/particle board — asbestos is greyer, more uniform, and fibrous not grainy

**Other Indicators:**
- Labels explicitly mentioning "Asbestos" or "Contains Asbestos"
- Any other clearly fibrous, grey/brown material in proximity to fuse equipment

### ASBESTOS = False if ALL of these apply:
- NO grey/brown fibrous material visible between ceramic fuse holders
- NO grey/white fibrous backing board visible behind the installation
- Only modern materials present: cork board, particle board, plastic, wood, metal, ceramic

## Key Distinctions — Do NOT Confuse These

| Material | Color | Texture | Asbestos? |
|---|---|---|---|
| Asbestos flash guard | Grey / dark brown | Fibrous, weathered | YES |
| Asbestos backing board | Grey / white | Fibrous, cement-like | YES |
| Cork backing board | Orange / brown | Grainy, organic | No |
| Particle board / chipboard | Brown / beige | Smooth, woody grain | No |
| Modern plastic board | White / light grey | Smooth, uniform | No |
| Wooden board | Brown | Wood grain visible | No |
| Ceramic fuse holder | Cream / off-white | Smooth, hard | No |
| Metal clad enclosure | Grey / black / green | Metallic, rigid | No |

## Metal Clad Detection

- Metal box/enclosure around fuse carriers — may be open or closed, green, black, or grey
- Metal clad enclosures **may or may not** contain asbestos — always check inside if open
- A closed metal clad enclosure alone does NOT confirm asbestos — look for visible fibrous material

## Detection Logic

**asbestos = True if:**
- Grey/brown FIBROUS material visible BETWEEN ceramic fuse holders (flash guard), OR
- Grey/white FIBROUS board visible behind the installation (backing board), OR
- Any label explicitly states asbestos is present

**asbestos = False if:**
- No grey/brown fibrous material between fuses, AND
- No grey/white fibrous backing board visible, AND
- All visible materials are cork, wood, particle board, plastic, ceramic, or metal only

**CRITICAL:** Cork board and particle board backing are NOT asbestos. Cork is brown and grainy with an organic texture. Asbestos is grey/white/brown and fibrous with a weathered, cement-like appearance.

## Output Format

Respond with JSON only:

```json
{
    "asbestos": "True or False",
    "metal_clad": "True or False",
    "asbestos_type": "Flash guard, Backing board, Both, or None",
    "material_description": "describe the material type, location, color, and texture",
    "fuse_rating": "number + A (e.g. 60A) or Not Visible",
    "manufacturer": "brand name or Not Visible",
    "labels_present": "describe any labels seen",
    "image_description": "detailed description of the installation",
    "area_description": "location context if determinable",
    "confidence_score": 0,
    "reasoning": "State exactly what you see: [describe visible materials between fuses and backing materials]. Location of fibrous material: [between fuses / backing board / none]. Material characteristics: [grey/brown/fibrous/weathered]. Metal clad present: [Yes/No]. Therefore asbestos=[True/False] because [specific reason - focus on grey/brown FIBROUS material between fuses or as backing board]."
}
```

## Severity Guidelines

- **none**: No asbestos materials present — only modern materials (cork, plastic, ceramic, metal)
- **low**: Ambiguous material visible — unclear if fibrous grey material or just weathered backing
- **medium**: Probable asbestos — fibrous grey/brown material present but partially obscured or uncertain
- **high**: Likely asbestos — fibrous material clearly visible in a characteristic location (between fuses or as backing board)
- **critical**: Confirmed asbestos — grey/brown fibrous material unambiguously present as flash guard or backing board

## Reference Examples

### Example 1 — Asbestos Present (Flash Guard)
- Open green metal clad enclosure with two white ceramic fuse holders visible
- Grey/dark brown FIBROUS material visible BETWEEN the two fuse holders
- This is an asbestos flash guard acting as arc protection barrier between fuses
- Fibrous material has a distinctive grey/brown weathered appearance
- Cork/particle board backing also visible behind installation (but this is NOT asbestos)
→ `asbestos: True`, `metal_clad: True`, `asbestos_type: Flash guard`

### Example 2 — No Asbestos
- Open black metal clad enclosure with two white ceramic fuse holders visible
- NO grey/brown fibrous material between the fuse holders
- Clean ceramic fuse carriers with only metal/plastic separators — no fibrous material
- Orange/brown cork backing board visible — this is NOT asbestos
- No asbestos flash guard or backing board present
→ `asbestos: False`, `metal_clad: True`, `asbestos_type: None`

## Notes

1. **Primary check:** Look BETWEEN ceramic fuse holders for grey/brown fibrous material (flash guard)
2. **Secondary check:** Look at the board/wall BEHIND the installation for grey/white fibrous backing board
3. **Cork board is NOT asbestos** — brown, grainy, organic texture; commonly seen in older installations
4. **Weathered appearance is key** — asbestos looks aged and fibrous, not smooth or uniformly coloured
5. **Metal clad presence alone** does not indicate asbestos — always examine interior for fibrous material
6. **Older installations (pre-1980s)** are significantly more likely to contain asbestos materials
7. When in doubt about a grey/brown fibrous material, score conservatively with a **medium** severity and note uncertainty in reasoning
