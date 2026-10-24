# Salik • سالك

Free, open-source browser extension that skips, blurs or mutes sensitive scenes and language on streaming platforms.
إضافة مجانية ومفتوحة المصدر لتخطي أو تعتيم أو كتم المشاهد والألفاظ غير المناسبة على منصات المشاهدة.

## Structure
- `library.json` — the filters library (keyed by title id). Contributions via Pull Request.
- `app-config.js` — repo / library / donation links (edit `OWNER` placeholders).
- `subtitle-censor-core.js` + `main.script.js` — subtitle word blacklist (keep both in sync).
- `app/i18n.js` — Arabic (RTL) / English (LTR) UI; library items may include `title_en`, `description_en`, and filters `description_en`.

## Contributing
Open an Issue (scene report / title suggestion) or send a Pull Request editing `library.json`.

## Before publishing
Do **not** commit `functions/node_modules`, service-account keys, or private API secrets.
