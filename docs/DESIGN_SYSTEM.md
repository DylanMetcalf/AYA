# Design system (provisional)

Tokens: `src/app/globals.css` (`@theme`). Primitives: `src/components/ui/`.

- **Palette**: ivory background, surface white-ivory, stone neutrals, forest (primary/nav), olive, sand, brass (decorative only, 2.8:1), charcoal ink. Contrast was measured: text tokens meet WCAG AA on ivory/surface; `ink-faint` must not be used on `stone-100`.
- **Type**: Fraunces (display headings, key figures) + Inter (UI, tables). Self-hosted via Fontsource (SIL OFL). Tabular numerals for money (`.tabular`).
- **Layout**: fixed forest sidebar (drawer < 1024px), sticky search header, content max 1360px. Pages: `PageHeader` → content; secondary context in a 340px right column on xl.
- **Components**: Button/ButtonLink, Field/TextField/SelectField/TextAreaField (labels, hints, `aria-invalid`, described-by errors), Badge tones, Alert (role=status/alert), Table (scroll container, `scope=col`), EmptyState, Panel/Section, ConfirmButton (native `<dialog>`).
- **Brand colours** come from `brands` rows, never hardcoded in components.
- **Rules**: no gradients/glass; hierarchy via type and spacing; unbuilt modules appear as disabled nav items labelled with their phase (never dead links); forms submit in a transition so validation errors keep input; unsaved-change warning on long forms.
- Dark mode not implemented (internal desktop-first tool); revisit with official brand guidelines.
