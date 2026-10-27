<div align="center">

# Salik • سالك

**Watch movies and series with your family, with peace of mind.**
**شاهد مع عائلتك وانت مطمئن.**

Free & open-source · Chrome · Android · Android TV

[English](#english) · [العربية](#العربية)

</div>

---

## English

Salik is a free, open-source tool that **skips, blurs or mutes** sensitive scenes and language while you watch on official streaming platforms. It is a charitable project. It is free forever, with no subscriptions and no ads.

Salik does not host, download or modify any video content. It only controls playback in the platform's own player, based on a timed filters library.

### Platforms

| Platform | How to install |
|---|---|
| 💻 **Chrome extension** | Install from the [Chrome Web Store](https://chromewebstore.google.com/detail/salik-%E2%80%A2-%D8%B3%D8%A7%D9%84%D9%83/ngehcikconlnhlhhfbgemloihlkmiibb) → **Add to Chrome** |
| 📱 **Android** |Download [Salik-Android.apk](https://github.com/techFek/salik/releases/download/v1.0.0/Salik-Android-1.0.0.apk) → open it → allow installing from unknown sources |
| 📺 **Android TV** | On your TV: install **Downloader** from Google Play → allow it to install unknown apps → open it, enter code **2334683** and press Go → Install. Or [download the APK](https://github.com/techFek/salik/releases/download/v1.0.0/Salik-AndroidTV-1.0.0.apk) and copy it with a USB drive |

### How it works

Every title in the library has a timeline of filters. When playback reaches a filter's start time, Salik applies one of three actions until the end time:

| Skip | Blur | Mute |
|:---:|:---:|:---:|
| <img src="assets/demo-skip.gif" width="260" alt="Skip demo"> | <img src="assets/demo-blur.gif" width="260" alt="Blur demo"> | <img src="assets/demo-mute.gif" width="260" alt="Mute demo"> |
| Jumps over the scene | Covers the picture | Silences the audio |

The amber part of the timeline is the filtered segment.

### Categories

Each category can be turned on or off from the settings:

- 🔞 **Sensitive scenes**: nudity and suggestive content
- 🩸 **Violence & gore**: excessive cruelty or physical harm
- 🤬 **Language**: profanity and swearing
- 🚬 **Substance use**: smoking, alcohol and drugs

### Project structure

```
library/<key>.json        One file per title: title info + its filters (start, end, action, category)
library.json              Generated combined library downloaded by the apps. Do not edit by hand.
scripts/build-library.js  Builds library.json from library/
app-config.js             Repo, library and donation links
subtitle-censor-core.js   Subtitle word blacklist (keep in sync with main.script.js)
main.script.js            Subtitle word blacklist (keep in sync with subtitle-censor-core.js)
app/i18n.js               Arabic (RTL) / English (LTR) UI
```

Titles may include `title_en` and `description_en`, and filters may include `description_en`, for the English UI.

### Contributing

Every contribution is welcome, from a single missed scene to a whole new title.

**Report without code:** open an [Issue](../../issues) with the title, platform, timestamp and what should be filtered.


### Support the project

Salik is and will always be free. Donations are **optional** and are not commercial profit. They go entirely to keeping the project running: server costs, developing new features, and operating expenses, so its benefit can keep growing. Donation links are available inside the apps.

### License

[MIT](LICENSE)

---

<div dir="rtl">
## العربية

**سالك** أداة مجانية ومفتوحة المصدر تتيح **تخطّي المشاهد والألفاظ غير اللائقة أو تمويهها أو كتمها** أثناء المشاهدة على منصات البث الرسمية. تم إطلاق هذا المشروع كـ **مبادرة مجتمعية غير ربحية** بالكامل تهدف لتوفير بيئة مشاهدة آمنة لكل العائلات، وهو مشروع مجاني إلى الأبد، بلا اشتراكات، ولا إعلانات، ولا أهداف تجارية.

لا يستضيف سالك أي محتوى، ولا يُنزّله، ولا يُعدّله؛ وإنما يتحكم في التشغيل داخل مشغّل المنصة نفسها، بناءً على مكتبة فلاتر مضبوطة بالتوقيت.

### المنصات

| المنصة | طريقة التثبيت |
|---|---|
| 💻 **إضافة كروم** | ثبّتها من [Chrome Web Store](https://chromewebstore.google.com/detail/salik-%E2%80%A2-%D8%B3%D8%A7%D9%84%D9%83/ngehcikconlnhlhhfbgemloihlkmiibb) ← **Add to Chrome** |
| 📱 **أندرويد** | [نزّل Salik-Android.apk](https://github.com/techFek/salik/releases/download/v1.0.0/Salik-Android-1.0.0.apk) ← افتح الملف ← اسمح بالتثبيت من مصادر غير معروفة |
| 📺 **أندرويد TV** | على التلفاز: ثبّت تطبيق **Downloader** من Google Play ← اسمح له بتثبيت التطبيقات ← افتحه وأدخل الرمز **2334683** ثم اضغط Go ← Install. أو [نزّل الملف](https://github.com/techFek/salik/releases/download/v1.0.0/Salik-AndroidTV-1.0.0.apk) وانقله إلى التلفاز عبر ذاكرة USB |

### كيف تعمل الأداة؟

لكل فيلم أو مسلسل في المكتبة جدولٌ زمني من الفلاتر. فإذا بلغ الفيديو بداية أي فلتر، طبّق سالك أحد ثلاثة إجراءات حتى نهايته:

| تخطٍّ | تمويه | كتم |
|:---:|:---:|:---:|
| <img src="assets/demo-skip.gif" width="260" alt="تخطٍّ"> | <img src="assets/demo-blur.gif" width="260" alt="تمويه"> | <img src="assets/demo-mute.gif" width="260" alt="كتم"> |
| يتجاوز المشهد | يحجب الصورة | يكتم الصوت |

يمثّل الجزء البرتقالي في شريط التشغيل المقطعَ الذي تجري تصفيته.

### الفئات

يمكنك تفعيل كل فئة أو تعطيلها من الإعدادات:

- 🔞 **المشاهد الحساسة**: العُري والإيحاءات
- 🩸 **العنف والمحتوى المقزز**: القسوة المفرطة والإيذاء الجسدي
- 🤬 **الألفاظ**: الشتائم والألفاظ البذيئة
- 🚬 **التعاطي**: التدخين والمسكرات والمخدرات

### المساهمة

نرحّب بكل مساهمة، بدءًا من مشهدٍ واحد فائت التصفية، وصولًا إلى إضافة فيلم كامل جديد.

**دون برمجة:** افتح [Issue](../../issues) واذكر فيها اسم العمل، والمنصة، والتوقيت، وما يحتاج إلى تصفية.

### دعم المشروع

سالك مجاني وسيظل مجانيًا. والتبرعات **اختيارية لا إلزامية**، ولا يُقصد بها ربحٌ تجاري؛ إذ تُصرف كاملةً على استمرار المشروع: تكاليف الخوادم، وتطوير ميزات جديدة، ونفقات التشغيل، ليبقى أثره ممتدًا. وتجد روابط التبرع داخل التطبيقات.

### الترخيص

[MIT](LICENSE)
</div>
