// subtitles.script.js — Nazafa Smart Subtitles Censor (Dual-Language: Arabic + English)
// ==========================================================================
// يراقب عناصر الترجمة النصية الحية (Netflix, YouTube, وغيرها) عن طريق MutationObserver
// ويستبدل الألفاظ الممنوعة بـ "*&^%#" فور ظهورها على الشاشة، بالعربي والإنجليزي مع بعض،
// مع تطبيع للنص قبل المطابقة (توحيد الألف، تجاهل التشكيل، توحيد ه/ة، تجاهل حالة الأحرف
// الإنجليزية الكبيرة/الصغيرة) لضمان دقة الرصد حتى مع اختلاف طريقة كتابة الكلمة.
// ⚠️ الملف ده بقى بيعمل الاستبدال البصري بس — الكتم الصوتي التلقائي اتوقف عمداً بطلب المستخدم،
// لأن كتم الكلمة نفسها بقى مسؤولية فلترة تانية خارجية عنده (لتجنب أي كتم مزدوج/متعارض).
//
// ⚠️ ملاحظة مهمة: القوائم أدناه (NAZAFA_SUBTITLE_BLACKLIST) عيّنة تمثيلية للبدء بها فوراً،
// وليست شاملة لكل اللهجات (مصري/خليجي/شامي/مغربي) أو كل اللغة الإنجليزية العامية —
// يُنصح بمراجعتها وتوسيعها حسب التجربة الفعلية. القوائم مبنية بشكل منفصل عن منطق المطابقة
// عمداً، بحيث يسهل لاحقاً نقلها لتُجلب من Firebase (بنفس أسلوب library.json الحالي) بدل ما
// تفضل ثابتة جوه الكود، من غير ما يتغيّر باقي المنطق.
// ==========================================================================

(function () {
    "use strict";

    // ستريميو بيوصلها الترجمة عن طريق ملفات شبكة (.vtt/.m3u8) بتتعترض وتتنقّى بالكامل
    // في main.script.js (MAIN world) قبل ما توصل للمتصفح أصلاً — بغض النظر عن اللغة
    // المختارة. فمراقب المسار الإنجليزي "المخفي" تحت (قسم 6) غير محتاج على ستريميو،
    // وأسوأ من كده: بيسبب مشكلة حقيقية فيها — لما المستخدم يختار الترجمة العربية،
    // ستريميو بيحط مسار الإنجليزي على mode="disabled" داخلياً، لكن المراقب ده كل 2
    // ثانية كان بيرجّعه "hidden" (نشط تقنياً بس مش ظاهر)، وده كان بيلخبط منطق ستريميو
    // الداخلي لاختيار الترجمة فيخلّيه يرجع تلقائياً للإنجليزي. الحل: نوقف المراقب ده
    // تماماً على ستريميو تحديداً، بما إنه مش محتاجه أصلاً.
    const nazafaIsStremio = window.location.hostname.includes("stremio");

    // 🐞 إصلاح (اتحل نهائياً — راجع قسم 7 تحت): بلاغ حقيقي إن الترجمة على برايم فيديو كانت
    // بتختفي تمامًا بمجرد ما توجل "تشفير الترجمة النصية" يتفعّل. اتأكد السبب بالظبط بفحص رسالة
    // الخطأ الحقيقية اللي ظهرت في كونسول برايم نفسه وقت التجربة:
    //   NotFoundError: Failed to execute 'removeChild' on 'Node': The node to be removed is
    //   not a child of this node.   (جوه n.onCaptionsSamples ... React's commit phase)
    // السبب: مشغّل برايم React-based، وكنا بنستخدم `element.textContent = censoredText` —
    // العملية دي بتدمّر عقدة النص (Text Node) الأصلية بالكامل وتستبدلها بعقدة جديدة. React
    // كان محتفظ بمرجع لنفس العقدة القديمة بالذات (مش بس لنصها)، فلما جه بعد كده يحدّث/يشيل نفس
    // العقدة في الـ commit phase بتاعته، لقاها مش موجودة فعلياً كـ child (لأننا استبدلناها)،
    // فرمى الخطأ ده وانهار الـ Component بالكامل لبقية الجلسة (فشل صامت، بلا أي خطأ ظاهر
    // للمستخدم العادي، وده سبب إحساسنا إنها "بتقف من غير أي أثر"). الحل المؤكَّد بالاختبار
    // المباشر (أكتر من 10 سطور متتالية اتعدّلت واشتغلت من غير أي مشكلة): نعدّل `.nodeValue` على
    // نفس عقدة النص الموجودة فعلاً (بدل `.textContent =` اللي بيستبدلها بعقدة جديدة) — React
    // مش بيحس بفرق في هوية العقدة وقتها. راجع قسم 7 تحت للتطبيق الفعلي، على السيليكتور المؤكَّد
    // `.atvwebplayersdk-captions-text` (اتلقط بفحص مباشر للعنصر الحقيقي عبر DevTools، مش تخمين).
    const nazafaIsAmazon = window.location.hostname.includes("primevideo") || window.location.hostname.includes("amazon");

    // ==========================================
    // 🔀 محرك التطبيع/القائمة السوداء/الاستبدال بقى مشترك جوه ملف منفصل
    // (subtitle-censor-core.js) عشان يتغطى بيه اعتراض ملفات .vtt الشبكي المعتريضة من
    // main.script.js (MAIN world) كمان، بدون ما تتكرر القائمة في مكانين ويحصل افتراق
    // بينهم مع الوقت. الملف ده لازم يتحمّل قبل هذا الملف في manifest.json (نفس الـ
    // ISOLATED world) عشان window.NazafaCensor يكون جاهز. شوف القوائم/الريجكس الكاملة
    // في subtitle-censor-core.js.
    // ==========================================
    const nazafaCoreCensorText = window.NazafaCensor.censorText;
    const nazafaCoreContainsBlacklistMatch = window.NazafaCensor.containsBlacklistMatch;


    // ==========================================
    // 3. الكتم التلقائي بتوقيت تقديري للكلمة نفسها (مش للجملة كلها)
    // معظم منصات الترجمة (نتفليكس، شاهد، ...) بتديلنا سطر الترجمة كامل كنص واحد بس، من
    // غير أي توقيت داخلي لكل كلمة على حدة. فعشان نكتم الصوت وقت الكلمة الممنوعة بالظبط
    // (مش من أول الجملة لحد آخرها)، بنقدّر توقيت الكلمة تقريبياً حسب موقعها الحرفي (character
    // offset) جوه السطر، على افتراض إن الحوار بيتقال بمعدل قراءة/كلام شبه ثابت (حرف/ثانية).
    // ده تقدير مش توقيت حقيقي 100%، فبنضيف هامش أمان صغير (padding) قبل وبعد الكلمة عشان
    // الصوت مايتقطعش لو التقدير مش مظبوط تماماً. لو فيه أكتر من كلمة في نفس السطر، كل وحدة
    // بتاخد نافذة كتم منفصلة بدل ما الجملة كلها تتكتم لحد آخر كلمة فيها.
    // ==========================================
    const CHARS_PER_SECOND = 15;           // متوسط سرعة الحوار التقريبية (حرف/ثانية) لتقدير طول عرض السطر
    const MIN_LINE_DURATION_MS = 700;      // أقل مدة افتراضية لعرض سطر قصير جداً
    const MAX_LINE_DURATION_MS = 6000;     // أقصى مدة افتراضية (سطور طويلة جداً نادراً ما تفضل أكتر من كدا)
    const MUTE_PADDING_MS = 220;           // هامش أمان قبل/بعد الكلمة عشان الكلام مايتقطعش

    let scheduledUnmuteAt = 0; // آخر وقت مفروض يتعمل عنده unmute (Date.now() + duration)، بيتمدد لو فيه نافذة كتم جديدة أبعد
    let unmuteTimer = null;

    function startMuteWindow(durationMs) {
        try {
            if (typeof broadcastToAllFrames !== "function") return;
            broadcastToAllFrames({ type: "NAZAFA_EXECUTE_ACTION", action: "mute" });
            const endsAt = Date.now() + durationMs;
            if (endsAt > scheduledUnmuteAt) {
                scheduledUnmuteAt = endsAt;
                if (unmuteTimer) clearTimeout(unmuteTimer);
                unmuteTimer = setTimeout(() => {
                    broadcastToAllFrames({ type: "NAZAFA_EXECUTE_ACTION", action: "unmute" });
                    unmuteTimer = null;
                    scheduledUnmuteAt = 0;
                }, durationMs);
            }
        } catch (e) { /* تجاهل */ }
    }

    // بيجدول نافذة كتم واحدة (تأخير قبل البدء + مدة الكتم) لكلمة واحدة متطابقة
    function scheduleWordMute(delayMs, durationMs) {
        if (delayMs <= 0) startMuteWindow(durationMs);
        else setTimeout(() => startMuteWindow(durationMs), delayMs);
    }

    // بدل ما نوزّع وقت السطر بالتساوي على عدد الحروف (لينيير بحت)، بنقسمه على "عدد الكلمات"
    // نفسها، وكل كلمة بتاخد نصيبها من الوقت حسب طولها هي (مش حسب موقعها بس)، مع ضمان إن
    // أي كلمة — حتى لو قصيرة جداً زي "و" أو "لا" — تاخد حد أدنى معقول من الوقت عشان مايتقدرش
    // إنها بتتقال في جزء من الثانية اللي مش حقيقي. WORD_GAP_UNITS بتمثل فاصل/وقفة بسيطة
    // طبيعية بين كل كلمة والتانية في الكلام.
    const MIN_WORD_CHAR_UNITS = 3; // أقل "وزن" افتراضي للكلمة الواحدة حتى لو كانت أقصر من كدا فعلياً
    const WORD_GAP_UNITS = 1;      // وحدة إضافية ثابتة لكل كلمة تمثل وقفة صغيرة بين الكلمات

    function tokenizeWordsWithOffsets(text) {
        const words = [];
        const re = /\S+/g; // أي تتابع أحرف غير مسافات = كلمة واحدة
        let m;
        while ((m = re.exec(text)) !== null) {
            words.push({ start: m.index, end: m.index + m[0].length });
        }
        return words;
    }

    // بيبني جدول زمني تقديري: كل كلمة في السطر بتاخد شريحة وقت (startMs/endMs) من إجمالي
    // مدة عرض السطر، بنسبة وزنها (طولها + الحد الأدنى + وحدة الفاصل) لمجموع أوزان كل الكلمات
    function buildWordTimeline(text, estimatedLineDurationMs) {
        const words = tokenizeWordsWithOffsets(text);
        if (!words.length) return [];
        const weights = words.map(w => Math.max(MIN_WORD_CHAR_UNITS, (w.end - w.start)) + WORD_GAP_UNITS);
        const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
        let cursorMs = 0;
        return words.map((w, i) => {
            const durationMs = (weights[i] / totalWeight) * estimatedLineDurationMs;
            const entry = { start: w.start, end: w.end, startMs: cursorMs, endMs: cursorMs + durationMs };
            cursorMs += durationMs;
            return entry;
        });
    }

    // بيحسب ويجدول نافذة كتم تقديرية لكل كلمة (أو عبارة من كذا كلمة) متطابقة، حسب جدول
    // التوقيت المبني على تقسيم الكلمات نفسها (مش على طول السطر الحرفي بالتساوي)
    function scheduleAutoMuteForMatches(original, mergedRanges) {
        const lineLength = original.length;
        if (!mergedRanges.length || !lineLength) return;
        const estimatedLineDurationMs = Math.min(
            MAX_LINE_DURATION_MS,
            Math.max(MIN_LINE_DURATION_MS, (lineLength / CHARS_PER_SECOND) * 1000)
        );
        const timeline = buildWordTimeline(original, estimatedLineDurationMs);
        if (!timeline.length) return;

        mergedRanges.forEach(([s, e]) => {
            // نلاقي كل الكلمات اللي بتتقاطع مع مدى التطابق ده (ممكن يكون أكتر من كلمة، زي "ابن الكلب")
            const overlapping = timeline.filter(w => w.end > s && w.start < e);
            if (!overlapping.length) return;
            const startMs = Math.min(...overlapping.map(w => w.startMs));
            const endMs = Math.max(...overlapping.map(w => w.endMs));
            const delay = Math.max(0, startMs - MUTE_PADDING_MS);
            const duration = Math.max(300, (endMs - startMs) + MUTE_PADDING_MS * 2);
            scheduleWordMute(delay, duration);
        });
    }

    // ==========================================
    // 5. المراقبة الفورية بأداء عالٍ (MutationObserver محدود النطاق)
    // بدل ما نراقب الصفحة كلها باستمرار (تكلفة عالية على المعالج)، بنراقب فقط حاويات
    // الترجمة بعد ما نلاقيها، وبنعمل فحص خفيف دوري (كل 1.5 ثانية) لاكتشاف أي حاوية جديدة
    // (زي تغيير الفيلم/الحلقة). التغييرات بتتعالج فوراً (synchronously) جوه callback الـ
    // MutationObserver نفسه (microtask قبل الرسم) عشان النص الأصلي مايتلمحش ولا جزء من الثانية.
    // ==========================================
    const SUBTITLE_SELECTORS = [
        ".player-timedtext",               // Netflix
        ".ytp-caption-window-container",   // YouTube
        ".captions-display",               // Prime Video (تقريبي)
        ".shaka-text-container",           // Shaka Player (يستخدمه بعض المنصات العربية زي شاهد)
        ".vjs-text-track-display",         // Video.js
        ".bmpui-subtitle-label",           // Bitmovin
        ".jw-captions",                    // JW Player
        ".plyr__captions",                 // Plyr
        ".vp-captions",                    // Vimeo
        "[class*='timedtext']",
        "[class*='caption']",
        "[class*='subtitle']",
        "[class*='cue']",
        "[class*='track-display']",
        "[aria-live]"
    ].join(", ");

    const observedContainers = new WeakSet();

    // ==========================================
    // 5أ. حل احتياطي عام لأي منصة (زي شاهد) بتستخدم أسماء كلاسات خاصة بيها مش معروفة عندنا:
    // بندور على حاوية اللاعب نفسه (الأب اللي فيه الفيديو) ونراقبها هي كمان، بدل ما نعتمد
    // بس على أسماء كلاسات معروفة مسبقاً. النطاق محدود بحاوية اللاعب فقط (مش الصفحة كلها) عشان
    // الأداء يفضل عالي، وده كافي لأي نص ترجمة بيتحط جوه أو حوالين عنصر الفيديو.
    // ==========================================
    function getPlayerRootContainers() {
        const roots = [];
        try {
            const videos = Array.from(document.querySelectorAll("video"));
            videos.forEach((video) => {
                let node = video;
                for (let i = 0; i < 4 && node.parentElement; i++) {
                    node = node.parentElement;
                }
                if (node && node.nodeType === Node.ELEMENT_NODE) roots.push(node);
            });
        } catch (e) { /* تجاهل */ }
        return roots;
    }

    // ⚠️ مشكلة كانت بتمنع الرصد الصحيح للعربي بالذات: بعض منصات الترجمة (خصوصاً مع النصوص
    // العربية RTL) بتوزّع سطر الترجمة الواحد على أكتر من text node/span منفصل (كل كلمة أو حتى
    // كل حرف في span لوحده لأسباب التنسيق/اتجاه الكتابة). المعالجة القديمة كانت بتفحص كل
    // node لوحده بشكل منفصل تماماً، فلو كلمة زي "مثيرة" أو "يضاجعني" اتقسّمت على أكتر من node،
    // الريجكس مايشوفهاش كاملة أبداً فتفوت من غير ما تتمسك. الحل: كل ما يحصل أي تغيير جوه
    // الحاوية، بنجمع نص كل الـ text nodes اللي جواها في نص واحد متصل ونفحصه ككل، فمفيش فرق
    // بقى إذا كانت الكلمة موزّعة على كام node — بتتمسك دايماً كاملة.
    function collectTextNodes(root) {
        const nodes = [];
        try {
            if (root.nodeType === Node.TEXT_NODE) { nodes.push(root); return nodes; }
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
            let n;
            while ((n = walker.nextNode())) nodes.push(n);
        } catch (e) { /* تجاهل */ }
        return nodes;
    }

    // 🐞 إصلاح: الترجمة اللي بتتكون من سطرين (line wrap) كانت بتظهر ملتصقة من غير مسافة بين
    // آخر كلمة في السطر الأول وأول كلمة في السطر التاني (زي "اللعينةالتي" بدل "اللعينة التي").
    // السبب: collectTextNodes بيجمع كل نصوص الحاوية (السطرين مع بعض) ويوصلهم ببعض بـ "" من غير
    // ما يعرف إن فيه قفلة سطر بينهم أصلاً — سواء كانت الحاوية عندها <br> أو حتى لو كل سطر جوه
    // عنصر/div منفصل تماماً عن التاني. بدل ما نحاول نفهم شكل الـ DOM لكل منصة على حدة (بيختلف
    // من نتفليكس لشاهد لغيره)، بنعتمد على الموضع البصري الفعلي على الشاشة: أي جزء نص element
    // بتاعه له نفس "top" تقريباً بيبقوا في نفس السطر، وأي فرق واضح في الـ top معناه سطر جديد
    // فعلاً. كده التجميع/الاستبدال (اللي ممكن يلزق كل حاجة في أول node) بيفضل محصور جوه نفس
    // السطر البصري دايماً، ومستحيل يلزق بين سطرين مختلفين تماماً زي ما كان بيحصل.
    function collectLineGroups(container) {
        const textNodes = collectTextNodes(container);
        if (!textNodes.length) return [];
        const groups = [];
        let current = [];
        let lastTop = null;
        for (const node of textNodes) {
            let top = null;
            try {
                const el = node.parentElement;
                const rect = el ? el.getBoundingClientRect() : null;
                if (rect && rect.height > 0) top = rect.top;
            } catch (e) { /* تجاهل */ }
            if (top === null) top = lastTop; // مفيش قياس متاح، افترض نفس السطر بدل ما نكسر التجميع
            if (lastTop !== null && top !== null && Math.abs(top - lastTop) > 4 && current.length) {
                groups.push(current);
                current = [];
            }
            lastTop = top;
            current.push(node);
        }
        if (current.length) groups.push(current);
        return groups;
    }

    // 🎬 يوتيوب بس: أول ما سطر الترجمة يتشفّر نكتم الصوت فوراً (من غير تقدير توقيت الكلمة)،
    // ونفتحه أول ما السطر يتغيّر لسطر نضيف أو يختفي، أو بعد مدة تقديرية للسطر كأمان.
    const nazafaIsYoutube = /(^|\.)youtube\.com$/i.test(window.location.hostname);
    const NAZAFA_YT_BLEEP_RE = /\[\s*_+\s*\]/;
    let nazafaYtCaptionMuted = false;
    // لما main.script.js (MAIN world) ينجح يجيب ملف الترجمة ويجدول الكتم بتوقيت كل كلمة، بيبعت
    // NAZAFA_YT_TIMED_ACTIVE=true — ساعتها نوقف الكتم المبني على الترجمة المعروضة عشان ميتعارضوش
    let nazafaYtTimedActive = false;
    window.addEventListener("message", (event) => {
        if (event.source !== window || !event.data || event.data.type !== "NAZAFA_YT_TIMED_ACTIVE") return;
        nazafaYtTimedActive = !!event.data.active;
    });
    function nazafaYtMuteNow(lineLength) {
        if (!nazafaIsYoutube || nazafaYtTimedActive) return;
        const durationMs = Math.min(MAX_LINE_DURATION_MS, Math.max(MIN_LINE_DURATION_MS, (lineLength / CHARS_PER_SECOND) * 1000));
        nazafaYtCaptionMuted = true;
        startMuteWindow(durationMs);
    }
    function nazafaYtUnmuteNow() {
        if (!nazafaIsYoutube || !nazafaYtCaptionMuted || nazafaYtTimedActive) return;
        nazafaYtCaptionMuted = false;
        try {
            if (unmuteTimer) clearTimeout(unmuteTimer);
            unmuteTimer = null;
            scheduledUnmuteAt = 0;
            broadcastToAllFrames({ type: "NAZAFA_EXECUTE_ACTION", action: "unmute" });
        } catch (e) { /* تجاهل */ }
    }

    function processTextNodeGroup(textNodes) {
        if (!textNodes.length) return;
        const combined = textNodes.map((n) => n.nodeValue).join("");
        if (!combined || !combined.trim() || combined.length > 500) return;
        const censored = nazafaCoreCensorText(combined);
        if (censored === combined) {
            // 🎬 يوتيوب بيستبدل الشتيمة بنفسه أحياناً بـ "[ __ ]" / "[__]" / "[_]" — نكتم عليها برضه
            // (من غير ما نغيّر النص). بتتكرر على نفس السطر عادي: كل مرة بتمدّد نافذة الكتم بس.
            if (nazafaIsYoutube && NAZAFA_YT_BLEEP_RE.test(combined)) {
                nazafaYtMuteNow(combined.length);
                return;
            }
            // السطر اللي اتشفّر قبل كده بيرجع هنا تاني (تعديلنا نفسه بيطلّق الـ observer) — فلو فيه
            // علامة "*&^" يبقى لسه نفس السطر الممنوع، منفتحش الصوت. غير كده سطر نضيف: نفتحه.
            // 🐞 كمان: main.script.js بيشفّر ملف الترجمة نفسه على الشبكة قبل ما يوصل للصفحة، فالـ DOM
            // بيجيله النص متشفّر أصلاً (فيه "*&^%#") من غير ما نكون إحنا اللي شفّرناه — لازم نكتم هنا كمان.
            if (combined.indexOf("*&^") !== -1) { nazafaYtMuteNow(combined.length); return; }
            nazafaYtUnmuteNow();
            return; // مفيش تطابق، منلمسش الـ DOM خالص (أداء + استقرار)
        }
        nazafaYtMuteNow(combined.length);

        // 🐞 إصلاح: منصات كتير (خصوصاً الترجمة العربية) بتوزّع سطر الترجمة على span منفصل
        // لكل كلمة (أحياناً بعرض/تنسيق محسوب لكل span لوحده لأسباب اتجاه الكتابة). كان الكود
        // القديم بيحط النص المعدَّل الكامل في أول node ويصفّر الباقي دايماً — ده بيولّع كل
        // العرض المحسوب مسبقاً لكل span، فبيبان السطر "بيروح" بعيد (يمين كتير مثلاً) لأن أول
        // span بقى فيه الجملة كلها والباقي فاضي. الحل: لو كل كلمة ممنوعة واقعة بالكامل جوه
        // node واحد (الحالة الشائعة جداً)، نكتم كل node لوحده من غير ما نلمس التوزيع الأصلي
        // خالص — يحافظ على التنسيق/العرض المحسوب لكل span زي ما هو. بس لو كلمة اتقسّمت فعلياً
        // على أكتر من node (نادر)، هنا بس بنرجع للطريقة القديمة (تجميع في أول node) كحل احتياطي.
        const perNodeCensored = textNodes.map((n) => nazafaCoreCensorText(n.nodeValue));
        if (perNodeCensored.join("") === censored) {
            textNodes.forEach((n, i) => { n.nodeValue = perNodeCensored[i]; });
        } else {
            textNodes[0].nodeValue = censored;
            for (let i = 1; i < textNodes.length; i++) textNodes[i].nodeValue = "";
        }
    }

    function processContainer(container) {
        try {
            // 🔤 توجل تشفير/تنقية الترجمة النصية من الـ popup — نفس المتغيّر اللي isolated.script.js
            // بيحدّثه (الملفين بيشتغلوا في نفس الـ isolated world فبيشاركوا نفس الـ scope العام،
            // زي ما هو الحال بالفعل مع broadcastToAllFrames المستخدمة فوق في نفس الملف)
            if (typeof nazafaSubtitleCensorEnabled !== "undefined" && !nazafaSubtitleCensorEnabled) return;
            const groups = collectLineGroups(container);
            if (!groups.length) nazafaYtUnmuteNow(); // الترجمة اختفت
            for (const group of groups) processTextNodeGroup(group);
        } catch (e) { /* تجاهل أي خطأ فردي عشان ميوقفش باقي المراقبة */ }
    }

    // 🐞 إصلاح حرج: السيليكتورز العامة زي [class*='caption']/[class*='subtitle']/[class*='cue']/
    // [class*='track-display']/[aria-live] (وكمان .captions-display لبرايم فيديو، اللي أصلاً
    // معلَّم عليها "تقريبي" في التعليق) بتمسك أحياناً عنصر UI مركّب كبير مش حاوية ترجمة حقيقية —
    // زي شريط معلومات الفيديو اللي بيجمع العنوان + الجودة + "Audio & Subtitles" + المدة + "More
    // Like This" في منطقة aria-live واحدة (لقطة حقيقية اتبعتها المستخدم: النص ده كله ظهر مدموج
    // فوق الشاشة، فيه علامات الاستبدال "*&^%#" بتاعتنا مخلوطة جواه). المشكلة: processContainer()
    // بتجمع كل الـ text nodes في نص واحد وتحط الناتج في أول node وتصفّر الباقي — تدمير كامل لأي
    // حاوية فيها أكتر من عنصر UI منفصل (مش سطر ترجمة واحد بسيط). الحل: نستبعد أي حاوية فيها
    // عناصر تفاعلية (زرار/لينك/قائمة) قبل ما نراقبها أصلاً — حاوية الترجمة الحقيقية مفيهاش زراير
    // ولا قوائم أبداً، هي نص بس.
    function isPlausibleSubtitleContainer(container) {
        try {
            if (container.querySelector('button, a[href], input, select, [role="button"], [role="menu"], [role="menuitem"], [role="tablist"]')) {
                return false;
            }
        } catch (e) { /* تجاهل */ }
        return true;
    }

    function attachObserverTo(container) {
        if (observedContainers.has(container)) return;
        if (!isPlausibleSubtitleContainer(container)) return;
        observedContainers.add(container);

        processContainer(container); // فحص فوري للمحتوى الموجود بالفعل وقت الالتصاق

        const observer = new MutationObserver(() => {
            // أي تغيير جوه الحاوية (كبير أو صغير) بيخلينا نعيد فحص النص الكلي للحاوية مرة
            // واحدة، بدل ما نحاول نفحص كل node لوحده — وده اللي بيضمن إن الكلمة تتمسك صح
            // حتى لو كانت موزّعة على أكتر من text node/span (بيحصل غالباً مع الترجمة العربية)
            // ⚠️ فحص إضافي هنا كمان (مش بس وقت الالتصاق الأول): لو الحاوية اتغيّرت لاحقاً
            // وبقى فيها عناصر تفاعلية (زي قائمة اتفتحت جواها)، نوقف المعالجة فوراً
            if (!isPlausibleSubtitleContainer(container)) return;
            processContainer(container);
        });
        observer.observe(container, { childList: true, subtree: true, characterData: true });
    }

    function scanForSubtitleContainers() {
        try {
            document.querySelectorAll(SUBTITLE_SELECTORS).forEach(attachObserverTo);
            // احتياطي عام: راقب حاوية اللاعب نفسها كمان (يغطي منصات زي شاهد اللي بتستخدم
            // أسماء كلاسات خاصة بيها للترجمة مش موجودة في القائمة أعلاه)
            getPlayerRootContainers().forEach(attachObserverTo);
        } catch (e) { /* تجاهل */ }
    }

    // (مُعطّل على برايم فيديو عمداً — شوف تعليق nazafaIsAmazon فوق لسبب مفصّل)
    if (!nazafaIsAmazon) {
        scanForSubtitleContainers();
        setInterval(scanForSubtitleContainers, 1500); // فحص خفيف دوري لاكتشاف حاويات جديدة فقط، مش مراقبة مستمرة للصفحة كلها
    }

    // ==========================================
    // 6. مراقبة مسار الترجمة الإنجليزية "المخفي" حتى لو المعروض على الشاشة عربي
    // بعض المنصات بتوفر أكتر من مسار ترجمة (Text Track) حقيقي جوه الفيديو نفسه (زي WebVTT)،
    // حتى لو المستخدم مفعّل بس الترجمة العربية على الشاشة. المسار الإنجليزي غير المعروض ده
    // ممكن يكون فيه كلمات ممنوعة اتترجمت بشكل مخفف أو اتحذفت في النسخة العربية. فبنلاقي مسار
    // الترجمة الإنجليزية ونخليه "hidden" (يفضل يشتغل ويبعت أحداث بدون ما يظهر بصرياً للمشاهد)،
    // ونراقب الجمل النشطة فيه لحظياً، ولو لاقينا كلمة ممنوعة، نكتم الصوت فوراً لمدة الجملة
    // الفعلية (باستخدام توقيت الجملة الحقيقي cue.startTime/endTime، أدق من التقدير التقريبي
    // المستخدم مع الترجمة المعروضة). ده بيشتغل بس لو المنصة أصلاً بتوفر track حقيقي (WebVTT/TTML)
    // جوه الفيديو — بعض المنصات (زي شاهد) بترندر الترجمة كلها بجافاسكريبت بدون أي track حقيقي،
    // وفي الحالة دي مفيش حاجة نقدر نقرأها غير المعروض بالفعل على الشاشة.
    // ==========================================
    const watchedTextTracks = new WeakSet();

    // فحص وجود تطابق بس (من غير حاجة لحساب مواضع الاستبدال) — مستخدمة هنا لأن النص مش هيتعرض
    function findEnglishTextTrack(video) {
        try {
            if (!video || !video.textTracks) return null;
            for (let i = 0; i < video.textTracks.length; i++) {
                const track = video.textTracks[i];
                if (track.kind !== "subtitles" && track.kind !== "captions") continue;
                const lang = (track.language || "").toLowerCase();
                const label = (track.label || "").toLowerCase();
                if (lang.startsWith("en") || label.includes("english") || label.includes("انجلي") || label.includes("إنجلي")) {
                    return track;
                }
            }
        } catch (e) { /* تجاهل */ }
        return null;
    }

    function handleHiddenTrackCueChange(track, video) {
        try {
            const activeCues = track.activeCues;
            if (!activeCues || !activeCues.length) return;
            for (let i = 0; i < activeCues.length; i++) {
                const cue = activeCues[i];
                // نص الـ cue بيجيله أحياناً وسوم WebVTT بسيطة (<b>, <i>, <c.color>) — بنشيلها
                const rawText = String(cue.text || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
                if (!rawText || !nazafaCoreContainsBlacklistMatch(rawText)) continue;
                // ⚠️ الكتم اتوقف عمداً بطلب المستخدم (نفس السبب المذكور في censorText أعلاه) —
                // فحص مسار الترجمة الإنجليزية المخفي لسه شغال (ممكن يُستخدم مستقبلاً لأغراض تانية
                // غير الكتم)، بس من غير ما يكتم الصوت هو نفسه دلوقتي
                // const remainingMs = Math.max(300, (cue.endTime - video.currentTime) * 1000);
                // startMuteWindow(remainingMs);
            }
        } catch (e) { /* تجاهل */ }
    }

    function ensureHiddenEnglishTrackWatcher() {
        try {
            const video = (typeof getActiveVideoElement === "function" ? getActiveVideoElement() : null) || document.querySelector("video");
            if (!video || !video.textTracks) return;
            const track = findEnglishTextTrack(video);
            if (!track) return;
            // "hidden" مش "disabled": تفضل الـ cues نشطة وتبعت أحداث، بس من غير ما تتعرض بصرياً
            if (track.mode === "disabled") track.mode = "hidden";
            if (!watchedTextTracks.has(track)) {
                watchedTextTracks.add(track);
                track.addEventListener("cuechange", () => handleHiddenTrackCueChange(track, video));
            }
        } catch (e) { /* تجاهل */ }
    }

    // (مُعطّل على ستريميو وبرايم فيديو عمداً)
    // على برايم فيديو تحديداً: احتمال قوي إن إجبارنا لأي track (حتى لو مش المعروض فعلياً) إنه
    // يتغيّر من "disabled" لـ"hidden" بيطلق حدث "change" على video.textTracks — ومشغّل برايم
    // (React) شكله بيراقب الحدث ده عشان "يعيد تقييم" مسار الترجمة النشط، فلما التغيير ده جاي من
    // مصدر خارجي (احنا) مش من اختيار المستخدم جوه الـ UI بتاعه، بيتلخبط ويلغي عرض الترجمة كلها
    // كإجراء أمان داخلي. ده أرجح تفسير لاختفاء الترجمة بالكامل حتى بعد إصلاح قسم 7 بالكامل ومن
    // غير أي تعارض مع إضافات تانية. برايم أصلاً مبيقدملناش track حقيقي نقدر نستفيد منه هنا (الترجمة
    // بتترندر بجافاسكريبت من الـ React، زي ما اتأكد في التحقيق السابق)، فمفيش خسارة حقيقية بتعطيل
    // القسم ده عليه.
    if (!nazafaIsStremio && !nazafaIsAmazon) {
        ensureHiddenEnglishTrackWatcher();
        // فحص دوري بسيط: بيلاقي أي track إنجليزي جديد (تغيير حلقة/فيلم)، وكمان بيرجّع الـ mode
        // لـ"hidden" لو المنصة نفسها رجّعته "disabled" بمنطقها الداخلي الخاص بتبديل لغات الترجمة
        setInterval(ensureHiddenEnglishTrackWatcher, 2000);
    }

    // ==========================================
    // 7. برايم فيديو: تشفير آمن مؤكَّد (راجع تعليق nazafaIsAmazon فوق للتفاصيل الكاملة)
    // بدل المسار العام (قسم 5، معطّل على أمازون عمداً)، هنا بنستهدف السيليكتور المؤكَّد
    // (.atvwebplayersdk-captions-text) بس، ونعدّل .nodeValue على عقد النص الموجودة فعلاً —
    // مش .textContent، ومش إضافة/حذف عناصر — عشان مانكسرش مرجع React للعقدة زي ما حصل قبل كده.
    // ==========================================
    if (nazafaIsAmazon) {
        console.log("🎬 Nazafa Amazon: قسم 7 بدأ التشغيل، NazafaCensor متاح؟", typeof nazafaCoreCensorText === "function");
        const AMAZON_CAPTIONS_SELECTOR = ".atvwebplayersdk-captions-text";
        // ملحوظة: ما بنستخدمش WeakSet لتعليم العقد كـ"خلصت" لأن برايم فيديو بيعيد استخدام
        // نفس عقدة النص (Text Node) لأكتر من سطر ترجمة أحياناً (بيغيّر nodeValue بس من غير
        // ما يستبدل العقدة) — لو علّمناها "خلصت" من أول مرة، السطور الجايّة بعدها على نفس
        // العقدة هتتفوت تماماً. بدل كده بنقارن بآخر نص اتعالج فعلياً على مستوى العقدة نفسها.
        const lastProcessedValue = new WeakMap();

        function censorAmazonCaptionElement(el) {
            try {
                if (typeof nazafaSubtitleCensorEnabled !== "undefined" && !nazafaSubtitleCensorEnabled) return;
                if (typeof nazafaCoreCensorText !== "function") {
                    console.warn("⚠️ Nazafa Amazon: nazafaCoreCensorText مش موجودة، مش هينفّذ تشفير.");
                    return;
                }
                Array.from(el.childNodes).forEach((node) => {
                    if (node.nodeType !== Node.TEXT_NODE) return;
                    const original = node.nodeValue || "";
                    if (!original.trim()) return;
                    if (lastProcessedValue.get(node) === original) return; // نفس القيمة اللي عالجناها قبل كده بالظبط
                    const censored = nazafaCoreCensorText(original);
                    if (censored !== original) {
                        node.nodeValue = censored; // 🎯 nodeValue على العقدة الموجودة، مش استبدالها
                        lastProcessedValue.set(node, censored);
                        console.log("🔒 Nazafa Amazon: اتشفّر سطر ترجمة:", original, "→", censored);
                    } else {
                        lastProcessedValue.set(node, original);
                    }
                });
            } catch (e) {
                console.error("❌ Nazafa Amazon: خطأ أثناء محاولة تشفير الترجمة:", e);
            }
        }

        const amazonCaptionsObserver = new MutationObserver((mutations) => {
            try {
                mutations.forEach((m) => {
                    m.addedNodes && m.addedNodes.forEach((n) => {
                        if (n.nodeType === Node.ELEMENT_NODE) {
                            if (n.matches && n.matches(AMAZON_CAPTIONS_SELECTOR)) censorAmazonCaptionElement(n);
                            n.querySelectorAll && n.querySelectorAll(AMAZON_CAPTIONS_SELECTOR).forEach(censorAmazonCaptionElement);
                        } else if (n.nodeType === Node.TEXT_NODE && n.parentElement) {
                            // بعض التحديثات بتستبدل عقدة النص كلها بعقدة جديدة بدل ما تعدّل nodeValue —
                            // لازم نمسك الحالة دي كمان، مش بس التعديل المباشر على nodeValue
                            const el = n.parentElement.closest(AMAZON_CAPTIONS_SELECTOR);
                            if (el) censorAmazonCaptionElement(el);
                        }
                    });
                    // تغيّر نص داخل عنصر ترجمة موجود بالفعل (السطر اتغيّر لنفس الـ span أحياناً)
                    if (m.type === "characterData" && m.target && m.target.parentElement) {
                        const el = m.target.parentElement.closest(AMAZON_CAPTIONS_SELECTOR);
                        if (el) censorAmazonCaptionElement(el);
                    }
                });
            } catch (e) {
                console.error("❌ Nazafa Amazon: خطأ جوه الـ MutationObserver:", e);
            }
        });
        amazonCaptionsObserver.observe(document.body, { childList: true, subtree: true, characterData: true });

        // فحص فوري لأي عنصر موجود بالفعل وقت التحميل (نادر، بس للاحتياط)
        document.querySelectorAll(AMAZON_CAPTIONS_SELECTOR).forEach(censorAmazonCaptionElement);
    }
})();
