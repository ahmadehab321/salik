# Salik • سالك

Free, open-source browser extension that skips, blurs or mutes sensitive scenes and language on streaming platforms.
إضافة مجانية ومفتوحة المصدر لتخطي أو تعتيم أو كتم المشاهد والألفاظ غير المناسبة على منصات المشاهدة.

## Structure
- `library/` — the filters library, **one file per title** (`library/<key>.json`), same tree as the original database. Each file holds the title info and its `filters` (start/end, action, category).
- `library.json` — generated combined file that the extension downloads. **Do not edit by hand**; run `node scripts/build-library.js` after changing anything in `library/`.
- `app-config.js` — repo / library / donation links.
- `subtitle-censor-core.js` + `main.script.js` — subtitle word blacklist (keep both in sync).
- `app/i18n.js` — Arabic (RTL) / English (LTR) UI. Titles may include `title_en`, `description_en`, and filters `description_en` for English.

## Contributing
Open an Issue (missed scene / title suggestion) or send a Pull Request editing `library/<key>.json` and regenerating `library.json`.

## License
MIT
