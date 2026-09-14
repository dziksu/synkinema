# Interface language and localization

English is the default language of the entire Studio interface. This includes navigation, dialogs, empty states, accessible labels, editing controls, notifications and client error messages. New projects created through either REST, MCP or the Studio use the stable track IDs `video`, `titles`, `voice`, `music` with English names `Video`, `Captions`, `Voiceover`, `Music`.

Project names, track names already saved in a project, captions, scripts, review notes, asset names, tags and source attribution are **user content**. Never translate or migrate these fields when changing the interface language. Agents may continue creating Polish videos and Polish captions. Changing a label must not change operation names, IDs, enum values or REST/MCP payloads.

## Implementation

- `apps/studio/src/i18n.ts` configures a shared i18next instance with react-i18next. Both the initial language and fallback language are explicitly `en`; the browser's preferred language is not detected. There is no language picker while English is the only shipped catalog.
- `apps/studio/src/locales/en.json` contains English messages. Complete English phrases are used as keys, with `keySeparator: false` and `nsSeparator: false`, so punctuation remains literal.
- Components call `useLocale()` to subscribe to language changes and `tr("Message")` to render translations. The same `tr` function is available to non-React editing helpers. Do not evaluate translations in module-level constants: translate status, track type and operation labels when rendering.
- Dynamic messages use named interpolation, for example `tr("Clip {{name}}", { name: clip.name })`. Pass user content as a value, never as a translation key. React escapes interpolated text; do not insert translations via `dangerouslySetInnerHTML`.
- Counts use i18next plural keys, such as `clipCount_one` and `clipCount_other`, called with `tr("clipCount", { count })`. Translate whole phrases rather than concatenating translated fragments.
- History and export dates use the active resolved locale. Timeline timecodes and numeric editing inputs use stable editing notation. The document's `lang` and `dir` attributes follow the resolved language; the initial HTML is `lang="en"`.
- Server validation messages are English. `api.ts` translates known errors into friendly UI messages; unmapped server diagnostics remain English. Native browser controls and operating system file pickers follow the browser/OS language.

## Adding a language

1. Copy `locales/en.json` to a new locale file, preserve keys and interpolation names, and translate values. Supply the plural forms required by that language (`_one`, `_few`, `_many`, `_other`, etc.).
2. Import and register the catalog alongside English in `resources`, for example `de: { translation: de }`. Keep English as `fallbackLng` and as the first-run default.
3. Add a user language preference control that calls `i18n.changeLanguage("de")`. If persisting that preference, validate it against the shipped locales and keep English when no preference exists. Do not infer language from project text or the browser.
4. Test long labels, dialogs, source range controls and narrow screens. For right-to-left languages, also review the layout and timeline direction: changing `dir` alone does not establish the intended editing behavior.
5. Extend the known error mappings if the new language should also localize more server diagnostics.

## Regression checks

`npm --prefix apps/studio test` checks that translation keys exist in the English catalog, visible JSX prose goes through i18n, and Polish UI literals do not reappear outside locale files. It also tests plural counts, interpolation, mounted control updates with a partial test catalog, English fallback and preservation of Polish user content.

`pytest tests/test_locale_defaults.py` checks new project defaults and that loading existing Polish projects preserves their content. Existing source selection, drag and drop, trim and export inspection tests use English accessible labels.

## Verified migration (2026-09-12)

- English catalog: 351 entries. Frontend: 43 tests passed. Backend: 5 targeted tests passed (English defaults, content preservation, track operations and transition behavior). TypeScript/Vite build, Biome/Ruff checks and `git diff --check` passed.
- Browser QA at 1280 × 720: created `QA • English interface` (`d1d8514de0854302a3a40d3a2b129cf8`), verified all four default track names, inserted video/audio from source seconds 1–3, created `Source audio` and added `New caption` with `Your story.`. Script, mixer, history, source controls, export dialog, library empty search and integrations use English labels.
- Preview job `5894455618c64a36820b0d858df58fc0` completed for revision 3. Its contact sheet dialog displayed the exact 0–3 s export range with English heading, description, alternative text and download action.
- At 390 × 844, the contact sheet dialog and source monitor fit without horizontal page overflow. At 720 px height, the recent-project list now scrolls so the longer settings label remains visible and clickable (button bottom at 700 px).
- Existing Polish project, track and media names were visibly preserved in the older source-monitor QA project. No content migration was performed.
