# Design QA — Agroville homepage

## Comparison target and evidence

- Source: SIMILE homepage capture at `/tmp/riose-agro-capture/simile-hero.png` (desktop) and `/tmp/riose-agro-capture/simile-mobile-viewport.png` (mobile).
- Implementation: `/tmp/riose-agro-capture/agroville-postfix-desktop.png`, `/tmp/riose-agro-capture/agroville-postfix-mobile.png`, and full page `/tmp/riose-agro-capture/agroville-postfix-full.png`.
- Same-viewport comparison inputs: `/tmp/riose-agro-capture/compare-postfix-desktop.png` and `/tmp/riose-agro-capture/compare-postfix-mobile.png` place source and implementation side by side.
- Viewports: desktop 1440 × 1024 CSS px; mobile 390 × 844 CSS px. Source and implementation captures used device scale factor 1; no density normalization or browser chrome was included.
- State: homepage at initial scroll position, light theme, mobile menu closed. Navigation/menu and primary destinations were checked separately.
- Reference page structure was also reviewed in `/tmp/riose-agro-capture/simile-home.png` (1440 × 8909). The Agroville page adapts the hierarchy and visual language to the project's own claims and content rather than copying SIMILE copy or assets.
- Focused-region comparison was not needed: the hero, navigation, CTA, and primary imagery are legible at the matched viewport sizes; there are no dense controls or tables on the homepage.

## Findings

- No actionable P0, P1, or P2 differences remain in the reviewed states.
- Typography: both pages use Archivo-style sans-serif typography and a compact navigation. Agroville keeps its headline to one line on desktop and lets it wrap naturally on mobile.
- Spacing and layout: the top navigation, centered hero, surrounding miniature worlds, single primary action, broad whitespace, and stacked editorial sections follow the source hierarchy. The page collapses to a single column without horizontal overflow at 390 px.
- Colors: warm off-white surfaces and coral primary actions carry through from the reference; the Agroville palette uses restrained greens for project-specific emphasis.
- Images: the hero uses an original generated farm-world illustration with a transparent background. It has no visible masking or compression defects. It intentionally depicts farms rather than SIMILE's city scenes.
- Copy: the page describes an experimental simulator and states that results are not validated for real-world livestock management. It does not reuse SIMILE claims, customer logos, or research copy.
- Accessibility and behavior: semantic landmarks, skip link, visible focus styles, reduced-motion support, decorative-image alt handling, and an accessible mobile menu are present. Chromium confirmed the mobile menu opens and closes; the hero CTA loads `/simulator.html` with its canvas, and the observed-data link loads `/observed-data.html`. No browser console errors or failed requests were recorded. The content width matched the viewport at desktop and mobile.
- Contact: the CTA links to the project's GitHub issue tracker. Access depends on the visitor having permission to the repository.

## Comparison history

1. First rendered comparison found the transparency section used a dark panel unlike the reference's light page, the desktop hero title wrapped, and the mobile art and oversized secondary button competed with the title. Result: blocked pending fixes.
2. Changed the transparency panel to a light surface, shortened the desktop headline, made the secondary action a text link, softened the hero art on mobile, and narrowed the mobile primary CTA.
3. The post-fix desktop and mobile comparison shows the hero hierarchy is clear, text no longer competes with the art, and the main action remains prominent. No P0/P1/P2 items remain.

## Follow-up polish

- Before sharing beyond project collaborators, replace the GitHub issue link with a public contact address or page if the repository is private.
- The farm dioramas are an intentional Agroville-specific adaptation of SIMILE's floating-world composition.

## Implementation checklist

- [x] Rendered desktop and mobile homepage captures at matched viewports
- [x] Side-by-side comparison against SIMILE's homepage
- [x] Checked primary links, mobile menu state, console, and viewport overflow
- [x] Preserved the original simulator at `simulator.html`
- [x] Confirmed REA's final static graph includes the home page and the preserved simulator

**final result: passed**
