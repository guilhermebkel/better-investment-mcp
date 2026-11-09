# better-investment-mcp logo guidelines

## The mark
- **Idea:** a hub with bars of different lengths radiating from it. Many data sources, one place to read them: the server connects prices, filings and macro series behind one read-only SQL tool.
- **Versions:** horizontal (primary), stacked, symbol only, and a small symbol for 16 to 32 px.
- **Files:** `svg/` for screens (light and dark), `mono/` for one colour, `web/` for the favicon, app icon and manifest.
- **Unofficial:** the mark does not use the logo or colours of B3, CVM or any other data vendor, and says nothing of affiliation.

## Clear space
Keep a clear zone of one quarter of the symbol height on every side. The zone scales with the logo; never use a fixed distance.

## Minimum size
| Version | Screen |
| --- | --- |
| Horizontal | 140 px wide |
| Stacked | 90 px wide |
| Symbol | 32 px wide |
| Small symbol (`symbol-small-*.svg`, favicon) | 16 px |

Below 32 px always use the small symbol: it has six heavier bars so the gaps stay clear.

## Colour
| Name | HEX | RGB | Use |
| --- | --- | --- | --- |
| Green (dark backgrounds) | `#1FB36D` | 31, 179, 109 | The mark and "-mcp" on dark |
| Green (light backgrounds) | `#0F8A4F` | 15, 138, 79 | The mark and "-mcp" on light |
| Ink | `#11151A` | 17, 21, 26 | Wordmark on light |
| Text | `#F4F6F8` | 244, 246, 248 | Wordmark on dark |
| Tile | `#151A20` | 21, 26, 32 | The app icon tile |

The page background is `#0F1317`. One colour: `mono/*-black.svg` or `*-white.svg` when colour is not available.

## Type
The wordmark is outlined from Geist Mono Medium (SIL OFL 1.1), so the SVG files need no font. Do not retype it. Geist and Geist Mono are the companion typefaces for surrounding text, as on the landing page.

## Don'ts
- Do not stretch, squash or rotate the logo.
- Do not recolour outside the palette.
- Do not change the bar lengths or the number of bars of the symbol.
- Do not add shadows, outlines, gradients or effects.
- Do not put the light files on dark backgrounds or the dark files on light ones.
