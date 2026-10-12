# Design reference — design_fidelity_pass

Source: https://claude.ai/code/artifact/d4174953-8df9-4724-ad0d-cf17646c48c2 (design canvas, 2 artboards),
extracted 2026-10-12 because subagents cannot render the artifact.

- `login.dc.html` — Login artboard (1280×800). Markup + inline styles are the visual contract.
- `dashboard.dc.html` — Dashboard artboard (1440×900). `STATUS_TRACK` in its script block is the
  lifecycle-track contract per status.
- `current-login.png` — the login as implemented after feature 3, for before/after comparison.

The `{{accent}}` placeholder is `#e8a33d` (= `signal`). The artboards load Google Fonts and use raw hex:
the implementation must keep self-hosted @fontsource and map every colour to a tailwind.config.js token.
`<sc-if>`/`<sc-for>` are canvas templating, equivalent to Angular `@if`/`@for`.
