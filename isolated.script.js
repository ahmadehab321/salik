// Nazafa Central Brain
console.log("🧠 Nazafa Engine: Isolated Brain Active.");

// ==========================================
// 📡 بث أوامر التحكم (skip/mute/blur/unmute/unblur) لكل الـ frames
// بعض المنصات (زي Dailymotion) بتشغّل الفيديو الفعلي جوه iframe مدمج (geo.dailymotion.com مثلاً)
// وليس في نفس مستند الصفحة الرئيسية. window.postMessage بيوصل بس لنفس الـ frame اللي اتبعت منه،
// فلو استخدمناها هنا في الصفحة الرئيسية، main.script.js اللي جوه الـ iframe مش هيستقبلها خالص،
// وبالتالي مش هيقدر يتحكم في الفيديو حتى لو الفلاتر اتجابت صح. الحل: نبعت الرسالة لنفس الـ frame
// (زي الأول) وكمان لكل iframe موجود مباشرة جوه المستند الحالي عن طريق iframe.contentWindow
// ==========================================
function broadcastToAllFrames(message) {
    window.postMessage(message, "*");
    document.querySelectorAll('iframe').forEach(f => {
        try { f.contentWindow.postMessage(message, "*"); } catch (e) {}
    });
}

// ==========================================
// 🔄 مزامنة الفلاتر مع الـ iframes الجوانية
// المشكلة الجذرية اللي كانت بتمنع أي فلترة تنفّذ على ديلي موشن (حتى بعد إصلاح broadcastToAllFrames):
// كل frame (الصفحة الرئيسية + كل iframe) بيشغّل نسخته الخاصة من هذا الملف، وبيحاول يكتشف الـ movie ID
// من رابط الـ frame بتاعه هو تحديداً. الصفحة الرئيسية بتعرف تكتشف الـ ID صح وتجيب الفلاتر، لكن الفيديو
// الفعلي <video> مش موجود عندها في نفس المستند، فـ processActiveFilters() هناك دايماً بيوقف فوراً
// (مفيش فيديو). وفي المقابل، الـ iframe بتاع مشغّل ديلي موشن هو اللي فيه الفيديو الحقيقي فعلاً،
// لكن رابطه الداخلي (geo.dailymotion.com/player/xxxx.html) غالباً مش فيه نفس معرّف الفيلم، فمعندوش
// فرصة يجيب الفلاتر بنفسه. النتيجة: مفيش frame واحد عنده الفيديو + الفلاتر مع بعض في نفس الوقت.
// الحل: أي frame ينجح يجيب الفلاتر، يبعتها كمان لكل الـ iframes الجوانية، عشان أي frame فيه الفيديو
// الحقيقي (حتى لو معرفش يكتشف الـ ID بنفسه) يقدر يقارن التوقيتات وينفّذ التخطي/الكتم/التغبيش مباشرة.
// ==========================================
window.addEventListener("message", (event) => {
    if (!event.data || event.data.type !== "NAZAFA_SYNC_FILTERS") return;
    window.activeFilters = event.data.filters || [];
    currentLibraryKey = event.data.libraryKey || currentLibraryKey;
    disabledFilterIds = event.data.disabledFilterIds || disabledFilterIds;
    currentItemPlatforms = event.data.platforms || currentItemPlatforms;
});

// 🕵️ استقبال التوقيت الحقيقي بتاع ديزني+ (مبعوت من main.script.js بعد اعتراض طلبات dust) —
// راجع main.script.js للسياق الكامل. بيتحدّث كل ما جيه طلب QoE جديد (فوراً عند أي seek/استئناف،
// وبعدين كل ~30 ثانية دوري أثناء التشغيل العادي)
let disneyPlayheadSeconds = null;
let disneyPlayheadReceivedAt = null;
// 🎯 بنسجّل كمان قيمة video.currentTime اللحظة اللي وصلت فيها قراءة playhead جديدة. بين
// القراءات الدورية (كل ~30 ثانية)، بدل ما نعتمد بس على الوقت الحقيقي اللي عدى (Date.now())
// لتقدير التقدم (اللي ممكن يجيب فرق كام ثانية لو حصل تقطيع/buffering مؤقت)، بنستخدم فرق
// video.currentTime نفسه من وقت آخر قراءة — لأنه بيعكس التقدم الفعلي المعروض على الشاشة بدقة
// أكبر (طالما معملناش seek من ساعتها، وده بنكتشفه لو الفرق سالب أو كبير جداً بشكل غير منطقي)
let disneyPlayheadVideoTimeAtReceipt = null;
// 🐞 تشخيص: بلاغ إن نظام التخطي/الكتم مش شغال خالص على ديزني+ (شغال تمام على نتفليكس)، بينما
// تشفير الترجمة النصية شغال (شوفنا "Match Found" مبيظهرش خالص في الكونسول). مفيش أي لوج هنا
// أصلاً يوضح هل السبب إن قراءة التوقيت من تليمتري ديزني (dust) مش بتوصل، أو إن الفلاتر نفسها
// مش محمّلة، فمينفعش نميّز بين الحالتين. بنضيف لوج مرة واحدة لكل حالة عشان يبان بوضوح في
// الكونسول في المرة الجاية اللي المستخدم يجرب فيها، بدل ما نفضل عمّيين تماماً زي دلوقتي.
let nazafaLoggedFirstDisneyPlayhead = false;
let nazafaLoggedNoActiveFilters = false;
let nazafaLoggedNoDisneyPlayheadYet = false;
const nazafaScriptStartedAt = Date.now();
window.addEventListener("message", (event) => {
    if (!event.data || event.data.type !== "NAZAFA_DISNEY_PLAYHEAD") return;
    disneyPlayheadSeconds = event.data.seconds;
    disneyPlayheadReceivedAt = Date.now();
    nazafaLoggedFirstDisneyPlayhead = true;
    try {
        const v = getActiveVideoElement();
        disneyPlayheadVideoTimeAtReceipt = v ? v.currentTime : null;
    } catch (e) {
        disneyPlayheadVideoTimeAtReceipt = null;
    }
});

// 🎯 المصدر الحيّ الجديد والأدق: قراءة مباشرة من stateStore بتاع مشغّل ديزني+ (مبعوتة من
// main.script.js — راجع nazafaTryAttachDisneyStore هناك). بتتحدّث فورًا مع أي تغيير حقيقي في
// الموضع، بما فيه الـ seek اليدوي من شريط تقدّم ديزني — عكس disneyPlayheadSeconds فوق اللي
// بتتصدّق مرة واحدة بس لكل تحميل صفحة ومحتاجة استقراء. لما القيمة دي تكون متاحة، بتبقى هي
// المصدر المفضّل ونتجاهل كل منطق الاستقراء القديم بالكامل.
let disneyLivePositionSeconds = null;
let disneyLivePositionReceivedAt = null;
window.addEventListener("message", (event) => {
    if (!event.data || event.data.type !== "NAZAFA_DISNEY_LIVE_POSITION") return;
    disneyLivePositionSeconds = event.data.seconds;
    disneyLivePositionReceivedAt = Date.now();
});

// 🎯 برايم فيديو: معرّف الحلقة الحقيقي الحيّ (مبعوت من main.script.js — راجع
// nazafaExtractAmazonLiveEpisodeId هناك للسياق الكامل). رابط صفحة المسلسل نفسه ثابت بين كل
// الحلقات (اتأكد عملياً)، فـ getMovieId() تحت (اللي بيعتمد على الرابط) مبيقدرش يميّز الحلقات
// خالص على أمازون. القيمة دي (titleId من طلب GetVodPlaybackResources) هي الـ GTI الحقيقي
// المميّز لكل حلقة، وبتتصدّق مرة واحدة لكل جلسة تشغيل جديدة — زي نمط ديزني+ disneyPlayheadSeconds
// فوق بالظبط. لما تكون متاحة، بنستخدمها بدل الـ ID المستخرج من الرابط لمنصة أمازون فقط.
let amazonLiveEpisodeId = null;
window.addEventListener("message", (event) => {
    if (!event.data || event.data.type !== "NAZAFA_AMAZON_LIVE_EPISODE_ID") return;
    if (event.data.id && event.data.id !== amazonLiveEpisodeId) {
        amazonLiveEpisodeId = event.data.id;
        // نصفّر المعرّف اللي متسجّل حالياً عشان نجبر brainLoop() تحت يعتبر أي تغيير هنا "حلقة
        // جديدة" ويطلب الفلاتر المناسبة فورًا، حتى لو الرابط نفسه (اللي مش بيتغيّر على أمازون) فضل زي ما هو
        currentMovieId = null;
    }
});

// 🎯 آبل تي في+: نفس فكرة amazonLiveEpisodeId فوق بالظبط — رابط الصفحة فيه معرّف المسلسل
// نفسه بس (umc.cmc.xxxxx)، ثابت بين كل الحلقات (اتأكد عملياً بمقارنة روابط حلقة 1 وحلقة 2).
// القيمة دي (externalId من طلب play-metadata/vod، راجع nazafaExtractAppleTVLiveEpisodeId في
// main.script.js) رقم حلقة صريح ومختلف فعلياً لكل حلقة.
let appleTVLiveEpisodeId = null;
window.addEventListener("message", (event) => {
    if (!event.data || event.data.type !== "NAZAFA_APPLETV_LIVE_EPISODE_ID") return;
    if (event.data.id && event.data.id !== appleTVLiveEpisodeId) {
        appleTVLiveEpisodeId = event.data.id;
        currentMovieId = null; // نجبر brainLoop() تحت يعتبر التغيير ده "حلقة جديدة"
        console.log("🍎 Nazafa AppleTV: اتلقط externalId حي للحلقة (من main.script.js):", event.data.id);
    }
});

// 🐞 إصلاح حرج: اتأكد عملياً (بتجربة مباشرة، بما فيها سكريبت console منفصل تماماً عن الإضافة)
// إن طلب play-metadata/vod مبيتمسكش خالص من جوه أي JS context تقدر الإضافة توصله بـ content
// script عادي (window.fetch/XHR) — آبل غالباً بتنفّذه من جوه Service Worker خاص بيها أو فريم
// معزول (opaque origin). فبدل الاعتماد على الرسالة اللي فوق بس، بقى عندنا مصدر تاني بديل/احتياطي:
// الـ background (Background.js) بيراقب الطلب ده على مستوى الشبكة نفسها (chrome.webRequest، شغّال
// بغض النظر عن مين اللي عمل الطلب فعلياً) ويبعتلنا رسالة مباشرة هنا.
chrome.runtime.onMessage.addListener((request) => {
    if (request.type !== "NAZAFA_APPLETV_LIVE_EPISODE_ID_FROM_BG") return;
    if (request.id && request.id !== appleTVLiveEpisodeId) {
        appleTVLiveEpisodeId = request.id;
        currentMovieId = null;
        console.log("🍎 Nazafa AppleTV: اتلقط externalId حي للحلقة (من الـ background):", request.id);
    }
});

let currentMovieId = null; // (تصريح واحد بس — الاستخدام فوق جوه الـ listener بيشتغل بعد ما السطر ده ينفّذ، لأنه async)
let currentLibraryKey = null; // مفتاح العمل في المكتبة الموحدة (مطابق للمفتاح المستخدم في popup.js)
// 🎯 offset زمني اختياري لكل منصة (بالثواني) — لبعض الأعمال، منصة معينة بتشيل مقدمة ثابتة
// (زي مقدمة الشركة المنتجة) موجودة في باقي المنصات، فتوقيتات نفس المشهد بتختلف بينهم بفارق ثابت.
// بيتقرأ من platforms.<platform>.offset_seconds في المكتبة الموحدة (library.json) — لو مش موجود، الافتراضي 0
// (يعني نفس السلوك القديم تماماً بدون أي تأثير على أي عمل حالي)
let currentItemPlatforms = {};
let currentEpisodeNumber = 1;
let activeFilters = [];
let disabledFilterIds = {}; // { "<filterId>": true } — الفلاتر اللي المستخدم قفلها يدوياً لهذا العمل تحديداً
let isExecutingAction = false;
let lastCheckTime = 0;

// --- [🔒 بوابة الاشتراك] ---
// الفلترة بالكامل (اكتشاف الأعمال + تنفيذ Skip/Mute/Blur) لا تعمل إلا إذا كانت isPremium = true
// القيمة تُقرأ من Background.js (الذي بدوره يقرأها من Firestore عبر Cloud Functions)
// ✅ مجاني ومفتوح المصدر: الفلترة دائماً مفعّلة (كان الفلاج false افتراضياً فتتأخر الفلترة
// لحد 5 دقائق أو لحد فتح الـ popup — وده كان سبب مشكلة "لازم أفتح الإضافة وأعمل refresh")
let isPremium = true;
let lastSubscriptionCheckTime = 0;
const SUBSCRIPTION_RECHECK_INTERVAL_MS = 5 * 60 * 1000; // إعادة فحص كل 5 دقائق احتياطياً

function refreshLocalSubscriptionFlag() {
    chrome.runtime.sendMessage({ type: "GET_SUBSCRIPTION_STATUS" }, (response) => {
        if (chrome.runtime.lastError) return;
        const wasPremium = isPremium;
        isPremium = true;
        if (wasPremium && !isPremium) {
            // الاشتراك انتهى أثناء المشاهدة: أوقف أي تأثير فلترة نشط فوراً
            window.activeFilters = [];
            broadcastToAllFrames({ type: "NAZAFA_EXECUTE_ACTION", action: "unmute" });
            broadcastToAllFrames({ type: "NAZAFA_EXECUTE_ACTION", action: "unblur" });
            console.warn("🔒 Nazafa: انتهت صلاحية الاشتراك، تم إيقاف الفلترة.");
        }
    });
}
// (لا حاجة لفحص الاشتراك)

// يستمع لتغييرات فورية في حالة الاشتراك (بعد دفع ناجح أو انتهاء صلاحية) دون انتظار الفحص الدوري
chrome.runtime.onMessage.addListener((request) => {
    if (request.type === "SUBSCRIPTION_STATUS_CHANGED") {
        isPremium = true;
        if (!isPremium) {
            window.activeFilters = [];
            broadcastToAllFrames({ type: "NAZAFA_EXECUTE_ACTION", action: "unmute" });
            broadcastToAllFrames({ type: "NAZAFA_EXECUTE_ACTION", action: "unblur" });
        }
    }
});

// --- [إضافة منطق الإعدادات - لا تؤثر على الكشف] ---
// 🧩 نظام التصنيفات الفرعية (14 تصنيف): نفس تعريف SUBCATEGORY_SCHEMA الموجود في app/services.js
// (مكرّر هنا لأن هذا الملف classic script بدون import) — لازم يفضل متطابق بين الملفين تماماً
// عشان الفلتر اللي بيتنفّذ هنا يطابق نفس التصنيف الظاهر توجله في الـ popup
// 🔍 نفس القوائم بالحرف الواحد الموجودة في app/services.js (SUBCATEGORY_SCHEMA) — لازم تفضل
// متطابقة تماماً بين الملفين، وإلا الفلتر اللي بيتنفّذ فعلياً هنا هيختلف عن اللي الـ popup
// بيعرض توجله. راجع التعليق المقابل هناك لتفاصيل مصدر الكلمات ومنطق الترتيب.
const NAZAFA_SUBCATEGORY_SCHEMA = {
    nudity: { subcategories: [
        { key: "kissing", keywords: ["يقبل", "تقبل", "تقبيل", "قبلة", "القبل", "بوس", "حضن", "تحضن", "عناق", "تعانق", "kiss"] },
        { key: "relations", keywords: ["زنا", "يزنون", "اباحي", "اباحية", "علاقة حميمية", "حميمية", "فتاة الليل", "يتضاجعان", "affair", "intimate"] },
        { key: "lgbtq", keywords: ["تشبه الرجال بالنساء", "رجل يلبس النقاب", "لبس رجل للنقاب", "رجل يلبس فستان", "متنكر كامرأة", "متنكر كمربية", "يرتدي ملابس نساء", "شاذ", "لوطي", "متحول جنسيا", "ظهور علم المثليين", "علم المثليين", "lgbtq"] },
        { key: "exposure", keywords: ["عري", "عاري", "عارية", "عراة", "تعري", "يخلع", "خالع", "ملط", "تغري", "يغري", "اغراء", "إغراء", "ايحاء", "إيحاء", "ايحائي", "ايحائية", "إيحائي", "إيحائية", "اشارة جنسية", "إشارة جنسية", "تعليق جنسي", "تعليق عري", "نكتة اباحية", "تحرش", "متحرش", "مغازلة", "يغازل", "رقص اغرائي", "الراقصة", "وضع مخل", "ديسكو", "نساء يرقصن", "sexy", "naked", "nudity", "boobs"] },
        { key: "attire", keywords: ["مكشوف", "مكشوفة", "تكشف", "ظاهرة", "ظاهر", "بارزة", "بارز", "بكيني", "ملابس", "مؤخرة", "مؤخرته", "مؤخرتها", "مؤخرتهم", "مؤخرات", "مؤخراتهم", "عورة", "عورته", "عورتها", "عورات", "مفاتن", "لبس مثير", "لبس كاشف", "يبرز", "فستان كاشف", "دمية تلبس حمالة صدر", "ظهور اسفل ظهر", "revealing", "panties"] }
    ] },
    violence: { subcategories: [
        { key: "weapons", keywords: ["سلاح", "سيف", "سكين", "خنجر", "قتل", "مقتول", "مقتولة", "طلقة", "رصاصة", "قطع رأس", "شنق", "مشنوق", "مشنوقة", "ميت", "حرق", "حترق", "احتراق", "انفجار", "غرق", "جثة", "حرب عنيفة", "رقاب اشخاص", "gun", "weapon", "kill", "murder", "uzi"] },
        { key: "abuse", keywords: ["ضرب", "صفع", "طعن", "تعذيب", "خنق", "ذبح", "جلد", "سحل", "إخصاء", "اجهاض", "كسر ذراع", "دهس", "مضاربة", "abuse", "torture", "beating"] },
        { key: "disturbing", keywords: ["قيء", "تقيأ", "تكرع", "بصق", "تجشأ", "تغوط", "ضرطة", "ضراط", "يضرط", "غازات", "مقزز", "مقرف", "مقرفة", "فضلات", "مشوه", "مشوهة", "مفقوعة", "تبول", "يخرج من بطن", "نصف بشري", "disturbing", "vomit", "gross", "poop", "pee"] },
        { key: "gore", keywords: ["دماء", "دم يخرج", "الدم", "دامي", "مضرج", "جرح", "أشلاء", "نزيف", "ينزف", "gore", "blood"] }
    ] },
    language: { subcategories: [
        { key: "blasphemy", keywords: ["مقدس", "الإله", "إله", "الاله", "تهكم عن الله", "تهكم عن الاله", "استهزاء بالدين", "سخرية من الدين", "تلبس النقاب وتسرق", "hell", "goddamn", "jesus", "christ", "lord"] },
        { key: "impiety", keywords: ["والنبي", "وحياة", "وحيات", "وحياه", "والنعمة", "وشرف", "ورحمة", "بالذمة", "بذمتك", "بزمتك", "وديني", "روح امك", "نهار اسود", "الحلف بغير الله", "دعاء لغير الله", "بشرفي", "وشرفي", "ليه يارب مخلقتنيش ولد", "البقية في حياتك", "يا لهوي", "احيه", "شيء الله لا يستطيع فعله"] },
        { key: "curses", keywords: ["بن الجزمة", "ابن الحرام", "كلب", "كلاب", "بقف", "نطع", "يا نهار اسود", "يانهار اسود", "نهارك اسود", "يا نهار ابوك اسود", "يا نهار ازرق", "يا نهار اسود ومنيل", "يا نهارك اسود ومنيل", "الزفت", "زفت", "يخرب بيتك", "يخربيت امك", "يا روح امك", "يلعن", "شتائم", "screw", "screwing", "screwed", "bastard", "motherfucker", "motherfucher", "bitch", "fu*kinm"] },
        { key: "profanity", keywords: ["بذيء", "fuck", "fucking", "fuckin", "shit", "bullshit", "ass", "asshole", "dick", "prick", "crap", "damn", "bloody", "pissed", "piss", "butt", "bollocks", "arse", "كلمة قبيحة", "نكتة قبيحة", "أفعال قبيحة"] },
        { key: "insults", keywords: ["غبي", "جزمة", "عبيط", "زبالة", "متخلف", "حيوان", "واطي", "واطية", "العويل", "عويل", "حمار", "الحمير", "وسخ", "الوسخة", "وساخة", "حقير", "قذر", "قذرة", "هبل", "اهبل", "نجس", "جاموسة", "ابن المجنونة", "ابن الصرمة", "ابن الشمامة", "معفن", "معفنة", "المعفن", "يا سافلة", "احمق", "لطخ", "creep", "stupid", "idiot", "idiots", "dumb", "dope", "fool", "fools", "moron", "loser", "jerk", "pathetic", "freak", "lame", "bugger", "dummy", "ugly", "scum", "scumbag", "lowlife", "nitwit", "dummies", "douche", "douchebag", "imbecile"] },
        { key: "sexual", keywords: ["hot", "sex", "sexy", "naked", "horny", "pedo", "penis", "pussy", "cock", "cocksucker", "scrotum", "suck", "sucked", "sucking", "hump", "shag", "whore", "slut", "playboy", "porn", "nude", "hook up", "sleeping with", "sleep with", "prostitution", "المزة", "مزة", "مزز", "فاجرة", "الفاجرة", "فاجره", "الفاجره"] },
        { key: "substanceTalk", keywords: ["beer", "wine"] }
    ] },
    substance: { subcategories: [
        { key: "smoking", keywords: ["سيجارة", "سجائر", "سجارة", "سيجار", "سيغار", "تدخين", "دخن", "شيشة", "أرجيلة", "الأرجيلة", "الغليون", "cigarette", "smoking", "cigarates"] },
        { key: "alcohol", keywords: ["خمر", "خمور", "كحول", "بيرة", "بيره", "جعة", "سكران", "مخمور", "يترنح", "شامبانيا", "غيبسون", "مارغاريت", "مارجاريت", "تكيلا", "wine", "beer", "alcohol", "drunk", "rum", "whiskey", "vodka", "gin", "tequila"] },
        { key: "drugs", keywords: ["مخدرات", "مخدر", "حشيش", "ترامادول", "كوكايين", "هروين", "استروكس", "بانجو", "بودرة", "حبوب", "حبة", "جوينت", "بودرجي", "drugs", "narcotic", "pcp", "weed", "joint", "cocaine", "pot", "crack"] },
        { key: "gambling", keywords: ["قمار", "مقامرة", "يراهن", "مراهنة", "gambling"] }
    ] }
};

function nazafaNormalizeToGroupKey(rawCategory) {
    const cat = (rawCategory || "").toLowerCase();
    if (cat.includes("nudity") || cat.includes("sex")) return "nudity";
    if (cat.includes("violence") || cat.includes("blood")) return "violence";
    if (cat.includes("language") || cat.includes("profanity")) return "language";
    return "substance";
}

// 🆕 تطبيع بسيط للنص العربي قبل المطابقة (مطابق للي في app/services.js:normalizeArabic) — بيوحّد
// صيغ الهمزة والألف المقصورة وبيشيل التشكيل، عشان اختلافات إملائية بسيطة (زي "إيحائية" بالهمزة
// مقابل "ايحائية") متخليش الفلتر يقع في دلو "other" غلط
function nazafaNormalizeArabic(str) {
    if (!str) return "";
    return str
        .replace(/[ً-ٰٟ]/g, "")
        .replace(/[إأآٱ]/g, "ا")
        .replace(/ى/g, "ي")
        .replace(/ـ/g, "");
}

function nazafaBuildHaystack(filterItem) {
    const raw = [filterItem.reason, filterItem.original_description]
        .filter(Boolean).join(" ").toLowerCase();
    return nazafaNormalizeArabic(raw);
}

function nazafaKeywordMatches(haystack, keywords) {
    return keywords.some((kw) => haystack.includes(nazafaNormalizeArabic(kw.toLowerCase())));
}

function nazafaMatchSubcategory(groupKey, filterItem) {
    const group = NAZAFA_SUBCATEGORY_SCHEMA[groupKey];
    if (!group || !filterItem) return "other";
    // category متعمّدين مش داخل هنا — راجع نفس التعليق في app/services.js:matchSubcategory
    const haystack = nazafaBuildHaystack(filterItem);
    for (const sub of group.subcategories) {
        if (nazafaKeywordMatches(haystack, sub.keywords)) return sub.key;
    }
    return "other";
}

// 🆕 تصنيف مزدوج/متعدد (مطابق للي في app/services.js:matchAllSubcategories): فلتر واحد ممكن
// يوصف حاجتين مختلفتين فعلاً (زي "رجل يشرب الخمر ويقبل امرأة")، فبنرجّع كل تصنيف فرعي اتطابق
// معاه في أي فئة، مش أول واحد بس. لو مفيش أي تطابق خالص، نرجع لسلوك الفئة الخام (دلو "other")
function nazafaMatchAllSubcategories(filterItem) {
    if (!filterItem) return [];
    const matches = [];
    const haystack = nazafaBuildHaystack(filterItem);
    for (const groupKey of Object.keys(NAZAFA_SUBCATEGORY_SCHEMA)) {
        const group = NAZAFA_SUBCATEGORY_SCHEMA[groupKey];
        for (const sub of group.subcategories) {
            if (nazafaKeywordMatches(haystack, sub.keywords)) {
                matches.push({ groupKey, subKey: sub.key });
            }
        }
    }
    if (matches.length) return matches;
    return [{ groupKey: nazafaNormalizeToGroupKey(filterItem.category), subKey: "other" }];
}

// 🆕 قرار الحجب بقى بيعتمد على "أو" منطقي عبر كل التصنيفات اللي الفلتر مطابقها — لو الفلتر مطابق
// تصنيفين مختلفين (زي خمر + قبلة)، وواحد بس فيهم لسه مفعّل عند المستخدم، الفلتر لازم يتفلتر برضه
// (منطقي: المستخدم عايز يحجب القبلات حتى لو مش عايز يحجب الخمر، والمشهد نفسه فيه الاتنين مع بعض)
function nazafaShouldFilterItem(filterItem) {
    const matches = nazafaMatchAllSubcategories(filterItem);
    for (const { groupKey, subKey } of matches) {
        const groupSettings = filterSettings[groupKey];
        if (!groupSettings) continue;
        if (groupSettings.enabled === false) continue;
        if (subKey !== "other" && groupSettings.subs[subKey] === false) continue;
        return true;
    }
    return false;
}

function nazafaBuildDefaultFilterSettings() {
    const defaults = {};
    for (const groupKey of Object.keys(NAZAFA_SUBCATEGORY_SCHEMA)) {
        const subs = {};
        NAZAFA_SUBCATEGORY_SCHEMA[groupKey].subcategories.forEach((s) => { subs[s.key] = true; });
        defaults[groupKey] = { enabled: true, subs };
    }
    return defaults;
}

let filterSettings = nazafaBuildDefaultFilterSettings();
// إعدادات المستخدم (توافقاً مع الاسم القديم userSettings المستخدم في باقي الملف تحت)
let userSettings = { nudity: true, violence: true, language: true, substance: true };

// 🔤 توجل تشفير/تنقية الترجمة النصية (Smart Subtitle Censor) — راجع services.js. الملف ده
// (isolated world) عنده وصول مباشر لـ chrome.storage، لكن main.script.js (MAIN world) لأ،
// فلازم نبعتله القيمة عن طريق broadcastToAllFrames (postMessage) كل ما تتغيّر أو الصفحة تفتح
let nazafaSubtitleCensorEnabled = true;

function broadcastSubtitleCensorSetting() {
    // 🆕 بنبعت كمان حالة توجل "إهانات بسيطة" (filterSettings.language.subs.insults) مع كل بث —
    // main.script.js (MAIN world) معندوش وصول مباشر لـ chrome.storage، فده الطريقة الوحيدة
    // إنه يعرف يقفل/يفتح تشفير كلمات الإهانات البسيطة في الترجمة بنفس حالة التوجل في الإعدادات.
    const insultsEnabled = !!(filterSettings.language && filterSettings.language.enabled !== false && filterSettings.language.subs && filterSettings.language.subs.insults !== false);
    broadcastToAllFrames({ type: "NAZAFA_SUBTITLE_CENSOR_SETTING", enabled: nazafaSubtitleCensorEnabled, insultsEnabled });
}

chrome.storage.sync.get(['nazafaSubtitleCensorEnabled'], (res) => {
    if (res.nazafaSubtitleCensorEnabled !== undefined) nazafaSubtitleCensorEnabled = res.nazafaSubtitleCensorEnabled;
    broadcastSubtitleCensorSetting();
});

chrome.storage.sync.get(['nazafaFilterSettings', 'filter_nudity', 'filter_violence', 'filter_language', 'filter_substance'], (res) => {
    if (res.nazafaFilterSettings) {
        for (const groupKey of Object.keys(filterSettings)) {
            const g = res.nazafaFilterSettings[groupKey];
            if (!g) continue;
            if (g.enabled !== undefined) filterSettings[groupKey].enabled = g.enabled;
            if (g.subs) Object.assign(filterSettings[groupKey].subs, g.subs);
        }
    } else {
        // ترحيل من المفاتيح المسطّحة القديمة لو مفيش الشكل الجديد لسه
        if (res.filter_nudity !== undefined) filterSettings.nudity.enabled = res.filter_nudity;
        if (res.filter_violence !== undefined) filterSettings.violence.enabled = res.filter_violence;
        if (res.filter_language !== undefined) filterSettings.language.enabled = res.filter_language;
        if (res.filter_substance !== undefined) filterSettings.substance.enabled = res.filter_substance;
    }
    for (const groupKey of Object.keys(filterSettings)) userSettings[groupKey] = filterSettings[groupKey].enabled;
    // 🆕 نفس الفكرة بتاعة userSettings.language لكن للتصنيف الفرعي "إهانات بسيطة" تحديداً —
    // subtitle-censor-core.js (الملف المشترك) بيقرا userSettings.insults عشان يقرر يشفّر
    // كلمات الإهانات البسيطة في الترجمة ولا لأ، بنفس حالة توجل insults في إعدادات المستخدم.
    userSettings.insults = !!(filterSettings.language && filterSettings.language.subs && filterSettings.language.subs.insults !== false);
    broadcastSubtitleCensorSetting();
});

// 🎥 يسجّل مدة الفيديو الحالي (بالدقايق) في التخزين المحلي كل ما نلاقي فيديو حقيقي شغال —
// الـ popup بيستخدمها لحساب معدل تكرار الفلاتر بالساعة (مؤشر الشدة الملوّن) بدل رقم خام تحكيمي
let lastReportedDurationMinutes = null;
function reportVideoDurationIfChanged(video) {
    try {
        if (!video || !isFinite(video.duration) || video.duration <= 0) return;
        const minutes = Math.round((video.duration / 60) * 10) / 10;
        if (minutes === lastReportedDurationMinutes) return;
        lastReportedDurationMinutes = minutes;
        chrome.storage.local.set({ nazafaVideoDurationMinutes: minutes });
    } catch (e) {}
}

// يحمّل قائمة الفلاتر الموقوفة يدوياً للعمل الحالي من التخزين المحلي
function loadDisabledFiltersForCurrentItem() {
    if (!currentLibraryKey) { disabledFilterIds = {}; return; }
    chrome.storage.local.get(['disabledFilters'], (res) => {
        const all = res.disabledFilters || {};
        disabledFilterIds = all[currentLibraryKey] || {};
    });
}

chrome.runtime.onMessage.addListener((request) => {
    if (request.type === "UPDATE_FILTER_SETTINGS") {
        userSettings[request.category] = request.enabled;
        if (filterSettings[request.category]) filterSettings[request.category].enabled = request.enabled;
        // 🆕 لو المجموعة اللي اتبدّلت هي "language"، لازم نبث الحالة المجمّعة الجديدة
        // (مجموعة + تصنيف insults الفرعي) لـ main.script.js فوراً — نفس سبب البث في معالج
        // UPDATE_SUBCATEGORY_SETTINGS فوق.
        if (request.category === "language") broadcastSubtitleCensorSetting();
    }
    // تحديث فوري لتوجل تصنيف فرعي واحد من الـ popup، بدون الحاجة لعمل Refresh
    if (request.type === "UPDATE_SUBCATEGORY_SETTINGS" && filterSettings[request.category]) {
        filterSettings[request.category].subs[request.subKey] = request.enabled;
        // 🆕 لو التصنيف الفرعي اللي اتغيّر هو "إهانات بسيطة" (جوه مجموعة language)، لازم نحدّث
        // userSettings.insults ونبث القيمة الجديدة فوراً لـ main.script.js (MAIN world) —
        // وإلا تشفير الترجمة هيفضل شغال بالحالة القديمة لحد ما المستخدم يعمل Refresh للصفحة.
        if (request.category === "language" && request.subKey === "insults") {
            userSettings.insults = !!request.enabled;
            broadcastSubtitleCensorSetting();
        }
    }
    // تحديث فوري لتوجل تشفير/تنقية الترجمة النصية — لازم يترحّل لـ main.script.js (MAIN world)
    // عن طريق postMessage لأنه مش عنده وصول مباشر لـ chrome.storage
    if (request.type === "UPDATE_SUBTITLE_CENSOR_SETTING") {
        nazafaSubtitleCensorEnabled = !!request.enabled;
        broadcastSubtitleCensorSetting();
    }
    // تحديث فوري لحالة فلتر فردي عند تغييره من الـ popup، بدون الحاجة لعمل Refresh
    if (request.type === "UPDATE_DISABLED_FILTERS" && request.itemKey === currentLibraryKey) {
        if (request.enabled) {
            delete disabledFilterIds[request.filterId];
        } else {
            disabledFilterIds[request.filterId] = true;
        }
    }
});

// 🐞 إصلاح: تبويب "التحكم" في الـ popup كان بيجيب المسلسل العام بس (مش الحلقة المحدّدة) على
// أمازون برايم — السبب إن services.js (بتاع الـ popup) بيحدّد المعرّف بقراءة رابط التاب مباشرة
// (getCurrentTabInfo)، وده نفس رابط صفحة المسلسل الثابت بين كل الحلقات (راجع التعليق الطويل
// عند amazonLiveEpisodeId فوق) — مفيش وصول للـ popup لطلبات الشبكة اللي بنعترضها هنا في محرك
// الفلترة الفعلي. الحل: نعرض المعرّف الحقيقي المكتشف هنا (currentMovieId، اللي بقى يعتمد على
// amazonLiveEpisodeId على أمازون تحديدًا) كـ رد على رسالة يطلبها الـ popup، بدل ما يعتمد على
// تحليل الرابط بنفسه من غير أي معلومة عن الحلقة الفعلية
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type !== "NAZAFA_GET_CURRENT_ITEM") return;
    sendResponse({ movieId: currentMovieId, platform: detectPlatform() });
});
// ------------------------------------------------

// ==========================================
// 1. أدوات كشف المسار والمنصة (بدون تغيير)[cite: 6]
// ==========================================
function detectPlatform() {
    const host = window.location.hostname.toLowerCase();
    if (host.includes("netflix")) return "netflix";
    if (host.includes("osnplus") || host.includes("osn")) return "osnplus";
    if (host.includes("yango")) return "yango";
    if (host.includes("disneyplus") || host.includes("disney")) return "disney";
    if (host.includes("primevideo") || host.includes("amazon")) return "amazon";
    if (host.includes("shahid")) return "shahid";
    if (host.includes("watchit")) return "watchit";
    if (host.includes("youtube")) return "youtube";
    if (host.includes("starzplay")) return "starzplay";
    if (host.includes("jawwy")) return "jawwy";
    if (host.includes("stctv")) return "stctv";
    if (host.includes("dailymotion") || host.includes("dai.ly")) return "dailymotion";
    if (host.includes("tod.tv")) return "tod";
    if (host.includes("beinconnect") || host.includes("bein")) return "beinconnect";
    if (host.includes("tv.apple.com")) return "appletv";
    if (host.includes("stremio")) return "stremio"; 
    return "general";
}

// 🎯 ستريميو: يرجّع "tt1234567:S:E" للحلقة (من رابط detail أو player)، أو "tt1234567" للفيلم.
// %3A بتتحوّل لـ ":" الأول عشان الحلقات متتطابقش كلها مع أول حلقة في المسلسل
function extractStremioId(rawUrl) {
    const u = String(rawUrl || "").replace(/%3A/gi, ":");
    const m = u.match(/\/(?:movie|series)\/(tt\d{7,9})(?:\/(tt\d{7,9}(?::\d+:\d+)?))?/i);
    if (m) return m[2] || m[1];
    const ep = u.match(/(tt\d{7,9}:\d+:\d+)/i);
    if (ep) return ep[1];
    const t = u.match(/(tt\d{7,9})/i);
    return t ? t[1] : null;
}

function getMovieId() {
    // كودك الأصلي كما هو[cite: 6]
    const url = window.location.href;
    // بعض المنصات (زي Watch It: /#/details/movies/126/play) بتستخدم توجيه قائم على الـ hash
    // بدل المسار العادي، وlocation.pathname مبيشوفش أي حاجة بعد الـ # خالص (بيفضل يرجع "/").
    // فلو فيه # في الرابط، نستخرج الجزء اللي بعده ونستخدمه كمسار فعلي بدل location.pathname
    const hashIndex = url.indexOf('#');
    const pathname = hashIndex !== -1 ? url.slice(hashIndex + 1).split('?')[0] : window.location.pathname;
    let detectedId = null;
    // ستريميو قبل أي فحص تاني: رابط التشغيل فيه infoHash (40 hex) كان بيتلقط في hashMatch بالغلط
    if (window.location.hostname.toLowerCase().includes("stremio")) {
        const sid = extractStremioId(url);
        if (sid) return sid;
    }
    try {
        // 🎯 واتش إت تحديداً: روابط المسلسلات بصيغة .../series/{seriesId}/{x}/{episodeId}/play
        // فيها أكتر من رقم، وآخر رقم قبل النهاية هو معرّف الحلقة الفعلي (اللي بيتسجل في
        // platforms.watchit.id)، مش أول رقم بعد "series/" (رقم المسلسل العام المشترك بين كل
        // الحلقات) — القاعدة القديمة (?:movies|series)\/(\d+) كانت بترجع رقم المسلسل بالغلط
        // فبيحصل تطابق مع عنصر المسلسل الأب بدل الحلقة المحدّدة. الفحص ده معزول تماماً على
        // واتش إت بس (detectPlatform() === "watchit") عشان مايأثرش على أي منصة تانية خالص.
        if (detectPlatform() === "watchit") {
            const watchitEpisodeMatch = pathname.match(/\/(?:movies|series)\/(?:\d+\/)*(\d+)/i);
            if (watchitEpisodeMatch && watchitEpisodeMatch[1]) return watchitEpisodeMatch[1];
        }

        // 🎯 يوتيوب: الـ ID مش في المسار زي باقي المنصات، ده موجود في ?v= أو youtu.be/ أو /shorts/
        const youtubeMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{6,15})/i)
            || url.match(/youtu\.be\/([a-zA-Z0-9_-]{6,15})/i)
            || pathname.match(/\/shorts\/([a-zA-Z0-9_-]{6,15})/i);
        if (youtubeMatch && youtubeMatch[1]) return youtubeMatch[1];

        // 🎯 ديلي موشن: صفحة الفيديو الرئيسية .../video/x7tgcev ، الرابط المختصر dai.ly/x7tgcev ،
        // أو رابط الـ iframe المدمج (geo.dailymotion.com/player/XXXX.html?video=x7tgcev) اللي بيستخدم
        // query param مش مسار عادي — ده مهم جداً لأن مشغّل ديلي موشن الفعلي (الـ <video>) بيعيش
        // جوه الـ iframe ده، فلازم كل frame يعرف يستخرج نفس الـ ID من شكل رابطه الخاص بيه
        const dailymotionMatch = url.match(/dailymotion\.com\/video\/([a-zA-Z0-9]+)/i)
            || url.match(/dai\.ly\/([a-zA-Z0-9]+)/i)
            || url.match(/[?&]video=([a-zA-Z0-9]+)/i);
        if (dailymotionMatch && dailymotionMatch[1]) return dailymotionMatch[1];

        // 🐞 إصلاح خطير: لازم أنماط ديزني+ الجديدة (UUID) تتلقط هنا الأول، قبل watchMatch تحت.
        // السبب: watchMatch بتدور على "play/" أو "watch/" متبوعة بأرقام (\d+) بس، وعلى رابط زي
        // .../play/9b5b36b5-d285-4ab1-9c9d-03a1d6609433 كانت بتتطابق مع "play/" وتاخد أول رقم
        // بس قبل أول حرف مش رقمي (يعني ترجع "9" غلط تماماً بدل الـ UUID كامل) وتوقف الدالة فوراً
        // (return) قبل ما توصل خالص لفحص ديزني+ الصريح اللي كان تحت في الأصل. نفس المشكلة كانت
        // ممكن تحصل مع hashMatch لو الـ UUID كان من غير شرطات، فالأنماط دي لازم تتحقق قبل الاتنين.
        const disneyPlayMatch = pathname.match(/\/play\/([a-f0-9-]{36})/i);
        if (disneyPlayMatch && disneyPlayMatch[1]) return disneyPlayMatch[1];
        const disneyEntityMatch = pathname.match(/entity-([a-f0-9-]{36})/i);
        if (disneyEntityMatch && disneyEntityMatch[1]) return disneyEntityMatch[1];

        const hashMatch = url.match(/\/([a-f0-9]{24,40})\b/i);
        if (hashMatch && hashMatch[1]) return hashMatch[1].trim();
        const titleMatch = pathname.match(/\/title\/([a-zA-Z0-9_-]+)/i);
        if (titleMatch && titleMatch[1]) return titleMatch[1].trim();
        const watchMatch = pathname.match(/(?:watch|video|play|series|movie)\/(\d+)/i);
        if (watchMatch && watchMatch[1]) return watchMatch[1];
        // 🎯 صيغة واتش إت: .../movies/126/play أو .../series/126 (جمع "movies/series" متبوعة برقم)
        const pluralIdMatch = pathname.match(/\/(?:movies|series)\/(\d+)/i);
        if (pluralIdMatch && pluralIdMatch[1]) return pluralIdMatch[1];
        // 🎯 صيغة OSN+: .../movie/amelie-63456/watch أو .../episode/average-rules-69006/watch
        // ("movie"/"series"/"episode" + سلاج-رقم، ومتبوعة كمان بجزء زي "/watch" في الآخر —
        // نفس الـ regex المستخدم في popup.js لضمان تطابق النتيجتين). "episode" ضرورية للحلقات
        // (مسلسلات) على عكس الأفلام اللي بتستخدم "movie"، وكانت ناقصة فبتفشل في التعرف على أي حلقة
        // 🐞 (\d{4,}) بدل (\d+): رابط شاهد /series/<اسم-المسلسل-الموسم-1>/season-... كان بيلقط "1" (رقم الموسم في الاسم) كمعرّف فيجيب مسلسل غلط
        const osnMatch = pathname.match(/\/(?:movie|series|episode)\/[^\/]+-(\d{4,})/i);
        if (osnMatch && osnMatch[1]) return osnMatch[1];
        // 🎯 صيغة شاهد: .../movie-405012 أو .../id-2464982527 (كلمة متبوعة بـ - ثم أرقام، بدون / بينهم)
        const dashIdMatch = pathname.match(/(?:movie|series|id)-(\d+)/i);
        if (dashIdMatch && dashIdMatch[1]) return dashIdMatch[1];
        // 🎯 صيغة Tod TV: .../movies/english/the-godfather-302156 (اسم العمل نفسه متبوع بـ - ثم رقم في آخر المسار)
        // أعم من dashIdMatch لأنها مش محتاجة كلمة "movie/series/id" قبل الشرطة مباشرة
        const trailingDashIdMatch = pathname.match(/-(\d+)\/?$/);
        if (trailingDashIdMatch && trailingDashIdMatch[1]) return trailingDashIdMatch[1];
        // 🐞 إصلاح: أمازون برايم فيديو بقت بتستخدم "/detail/{id}" لبعض صفحات الأفلام (زي Shrek)
        // مش "/title/{id}" بس زي الأول — ضفنا "detail" كبديل عشان الـ ID يتلقط صح في الحالتين
        // (نفس التعديل اتعمل في services.js عشان تبويب المنصات في الـ popup يتصرف بنفس المنطق)
        const amazonIdMatch = pathname.match(/\/(?:title|detail)\/([a-zA-Z0-9_-]{10,40})/i) || url.match(/gti=([^&]+)/);
        if (amazonIdMatch && amazonIdMatch[1]) return amazonIdMatch[1].trim();
        // 🎯 آبل تي في: المعرّف بتاعها ليه صيغة مميزة "umc.cmc.xxxxx" بتظهر في أي مكان بالرابط
        const appleMatch = url.match(/(umc\.cmc\.[a-z0-9]+)/i);
        if (appleMatch && appleMatch[1]) return appleMatch[1];
        // (فحص ديزني+ الجديد اتنقل فوق قبل hashMatch/watchMatch — راجع التعليق هناك)
        // 🎯 صيغة ديزني+ القديمة: .../movies/toy-story/1660010197/watch (سايبينها كـ fallback
        // احتياطي بس — نفس الـ regex المستخدم في services.js لضمان تطابق النتيجتين)
        const disneyMatch = pathname.match(/\/movies\/[^\/]+\/([a-z0-9]+)/i);
        if (disneyMatch && disneyMatch[1]) return disneyMatch[1];
        
        // 🎯 ستريميو: الـ ID (زي tt0293564) بيكون جوه الـ hash أو الرابط الطويل
        const stremioId = extractStremioId(url);
        if (stremioId) return stremioId;


        const trailingIdMatch = pathname.match(/\/(\d+)\/?$/);
        if (trailingIdMatch && trailingIdMatch[1]) return trailingIdMatch[1];
        // 🎯 شبكة أمان عامة: أي رقم من 6 خانات فأكتر ظاهر كجزء مستقل من المسار (محاط بـ /) في أي مكان،
        // مش بس آخر المسار — بيغطي حالات زي "/movies/{slug}/{id}/watch" لمنصات تانية مستقبلاً
        // من غير ما نحتاج نضيف pattern جديد لكل منصة على حدة كل مرة
        const genericNumericSegmentMatch = pathname.match(/\/(\d{6,})(?:\/|$)/);
        if (genericNumericSegmentMatch && genericNumericSegmentMatch[1]) return genericNumericSegmentMatch[1];
        // 🎯 آخر شبكة أمان: أي جزء أخير من المسار (مش لازم أرقام بس) لمنصات لسه غير مؤكد شكل رابطها
        // بالظبط (زي Starzplay/Jawwy/STC tv) — نفس المنطق المستخدم في genericHosts بـ popup.js
        // عشان الاتنين (الـ popup ومحرك الفلترة الفعلي) يوصلوا لنفس الـ ID دايماً
        // ⚠️ لازم نستبعد كلمات الإجراء الشائعة (watch/play/details...) اللي بتيجي آخر الرابط
        // كجزء تابت من تصميم الموقع مش كجزء من الـ ID نفسه (زي ".../amelie-63456/watch" في OSN+)،
        // وإلا هنرجع "watch" كـ ID غلط بدل ما نرجع null ونسيب الفرصة لباقي المحاولات
        const NON_ID_TRAILING_WORDS = new Set(["watch", "play", "player", "details", "detail", "stream", "streaming", "view", "index", "home"]);
        const genericTrailingSlugMatch = pathname.match(/\/([a-zA-Z0-9_-]{4,40})\/?$/);
        if (genericTrailingSlugMatch && genericTrailingSlugMatch[1] && !NON_ID_TRAILING_WORDS.has(genericTrailingSlugMatch[1].toLowerCase())) {
            return genericTrailingSlugMatch[1];
        }
    } catch (e) { console.error("❌ Nazafa Brain: Error parsing URL for ID", e); }
    return detectedId;
}

function extractEpisodeNumberFromDOM() {
    try {
        const selectors = ['.f1v67gbe', '.skip-text', '[data-automation-id="player-title"]', '.playback-title'];
        for (let selector of selectors) {
            const element = document.querySelector(selector);
            if (element && element.textContent) {
                const text = element.textContent.toLowerCase();
                const match = text.match(/(?:episode|ep|الحلقة|حلقة)\s*(\d+)/i) || text.match(/\be(\d+)\b/i);
                if (match && match[1]) return parseInt(match[1], 10);
            }
        }
    } catch (e) {}
    return currentEpisodeNumber;
}

function getActiveVideoElement() {
    const videos = Array.from(document.querySelectorAll('video'));
    if (videos.length === 0) return null;
    const realVideos = videos.filter(video => {
        try {
            if (video.offsetWidth === 0 || video.offsetHeight === 0) return false;
            if (video.duration && video.duration < 300) return false;
            return true;
        } catch (e) { return false; }
    });
    // لو مفيش أي فيديو "حقيقي" (كل الفيديوهات الظاهرة مدتها معروفة وقصيرة)، الأرجح إن إعلان بيشتغل دلوقتي.
    // من قبل كان بيرجع آخر فيديو موجود (ممكن يكون الإعلان نفسه) فتتنفذ عليه أوامر خاطئة أو متجاهَلة.
    // دلوقتي بنرجع null عشان processActiveFilters() توقف تماماً لحد ما الفيديو الحقيقي (الطويل) يرجع يظهر.
    if (realVideos.length === 0) return null;
    if (realVideos.length === 1) return realVideos[0];
    // 🐞 إصلاح: لو فيه أكتر من فيديو "حقيقي" ظاهر في نفس الوقت (حصل فعلاً على ديزني+ الجديد —
    // على الأغلب فيديو خلفية/معاينة صغير فاضل شغال من صفحة سابقة في الـ SPA بعد التنقل لصفحة
    // التشغيل)، الاختيار بالـ currentTime الأعلى كان بيرجع الفيديو الغلط لأن الفيديو التاني ده
    // كان ماشي بشكل طبيعي هو كمان وله توقيت معقول. المشغّل الفعلي بيبقى غالباً أكبر عنصر فيديو
    // ظاهر على الشاشة (شبه ملء الشاشة)، فبنختار الأكبر مساحة بدل الأحدث توقيتاً
    return realVideos.sort((a, b) => (b.offsetWidth * b.offsetHeight) - (a.offsetWidth * a.offsetHeight))[0];
}

function fetchFiltersFromBackground(movieId, episodeNumber) {
    chrome.runtime.sendMessage({ type: "FETCH_FILTERS_BACKGROUND", movieId: movieId, episode: episodeNumber }, (response) => {
        if (response && response.success) {
            window.activeFilters = response.data.filters || [];
            currentLibraryKey = response.data._libraryKey || movieId;
            currentItemPlatforms = response.data.platforms || {};
            loadDisabledFiltersForCurrentItem();
            // نبعت نفس الفلاتر لأي iframe جواني (زي مشغّل ديلي موشن) معندوش فرصة يكتشف
            // نفس معرّف الفيلم من رابطه الخاص، عشان يقدر يفلتر الفيديو الحقيقي اللي عنده هو
            broadcastToAllFrames({
                type: "NAZAFA_SYNC_FILTERS",
                filters: window.activeFilters,
                libraryKey: currentLibraryKey,
                disabledFilterIds: disabledFilterIds,
                platforms: currentItemPlatforms
            });
            // نبعت كمان حالة توجل تشفير الترجمة لأي iframe جديد (زي مشغّل ديلي موشن) ظهر
            // بعد أول تحميل للصفحة ومعندوش القيمة لسه
            broadcastSubtitleCensorSetting();
        } else if (response && response.error === "SUBSCRIPTION_REQUIRED") {
            // الخلفية رفضت الطلب لأن الاشتراك غير فعّال — نزامن الحالة المحلية فوراً
            window.activeFilters = [];
        } else {
            // 🐞 إصلاح: أي حالة فشل تانية (زي "Not Found" لما العمل مش موجود لسه في المكتبة،
            // أو أي خطأ غير متوقع، أو حتى response غير موجود أصلاً) لازم كمان تصفّر الفلاتر
            // القديمة — وإلا فلاتر عمل سابق (كانت لسه محمّلة في window.activeFilters) هتفضل
            // مطبّقة غلط على الفيديو الحالي اللي معندوش أي فلاتر حقيقية خالص (باغ الفلاتر العالقة)
            window.activeFilters = [];
            currentLibraryKey = null;
            currentItemPlatforms = {};
            disabledFilterIds = {};
            broadcastToAllFrames({
                type: "NAZAFA_SYNC_FILTERS",
                filters: [],
                libraryKey: null,
                disabledFilterIds: {},
                platforms: {}
            });
        }
    });
}

function brainLoop(timestamp) {
    if (timestamp - lastCheckTime > 300) {
        lastCheckTime = timestamp;

        // 🔒 لا يعمل أي جزء من محرك الفلترة إلا إذا كان الاشتراك فعّالاً
        if (!isPremium) {
            if (timestamp - lastSubscriptionCheckTime > SUBSCRIPTION_RECHECK_INTERVAL_MS) {
                lastSubscriptionCheckTime = timestamp;
                refreshLocalSubscriptionFlag();
            }
            requestAnimationFrame(brainLoop);
            return;
        }

        // 🎯 على أمازون وآبل تي في+، المعرّف الحيّ (راجع amazonLiveEpisodeId و
        // appleTVLiveEpisodeId فوق) أدق بكثير من أي حاجة نقدر نستخرجها من الرابط (اللي بيفضل
        // ثابت بين كل حلقات نفس المسلسل على المنصتين) — فلو متاح، بنستخدمه بدل getMovieId()،
        // وأي منصة تانية تفضل زي ما هي
        const nazafaDetectedPlatformNow = detectPlatform();
        const detectedId = (nazafaDetectedPlatformNow === "amazon" && amazonLiveEpisodeId) ? amazonLiveEpisodeId
            : (nazafaDetectedPlatformNow === "appletv" && appleTVLiveEpisodeId) ? appleTVLiveEpisodeId
            : getMovieId();
        const detectedEpisode = extractEpisodeNumberFromDOM();
        if (detectedId && (detectedId !== currentMovieId || detectedEpisode !== currentEpisodeNumber)) {
            currentMovieId = detectedId;
            currentEpisodeNumber = detectedEpisode;
            fetchFiltersFromBackground(currentMovieId, currentEpisodeNumber);
        }
        processActiveFilters();
    }
    requestAnimationFrame(brainLoop);
}

// ==========================================
// 4. معالج الفلاتر (تم دمج منطق الـ Toggles هنا)
// ==========================================

function processActiveFilters() {
    // التغيير هنا: البحث في window.activeFilters بدلاً من activeFilters
    // 🐞 تشخيص: لو الفلاتر مفيش أصلاً (المكتبة مجابتش حاجة للعمل ده)، كان بيرجع من هنا بصمت
    // تام من غير أي أثر في الكونسول — فمستحيل نفرّق بين "مفيش فلاتر" و"فيه فلاتر بس التوقيت غلط"
    if (!window.activeFilters || window.activeFilters.length === 0) {
        return;
    }
    if (isExecutingAction) return;

    const video = getActiveVideoElement();
    if (!video) return;
    reportVideoDurationIfChanged(video);

    const platform = detectPlatform();
    // 🎯 offset اختياري (بالثواني) لو المنصة دي شايلة جزء ثابت (زي مقدمة شركة إنتاج) موجود
    // في المنصة المرجعية اللي اتسجّلت عليها توقيتات الفلاتر أصلاً — راجع تعريف currentItemPlatforms فوق
    const platformOffset = Number(currentItemPlatforms && currentItemPlatforms[platform] && currentItemPlatforms[platform].offset_seconds) || 0;

    // 🐞 إصلاح جوهري: مشغّل ديزني+ الجديد (HiVE DMP) بيصفّر video.currentTime مع أي seek/استئناف
    // (بيتصرف زي بث حي بـ buffer متحرك بيتغيّر كل شوية)، فمش صالح كمرجع مطلق لموضع التشغيل
    // (اتأكد الكلام ده عملياً — راجع main.script.js للسياق الكامل). جرّبنا تليمتري ديزني (dust)
    // الأول (فشل، مفيهوش أي حقل توقيت)، وبعدين قراءة aria-valuenow من شريط التقدّم في الـ DOM
    // (فشل برضو، العنصر عمليًا مش موجود في الصفحة أغلب الوقت حتى مع تحريك ماوس حقيقي مستمر).
    // 🎯 المصدر الحالي (الناجح): رد الـ API الحقيقي اللي ديزني بيطلبه وقت بدء التشغيل
    // (https://disney.playback.edge.bamgrid.com/v7/playback/ctr-regular) بيحتوي فعليًا على
    // playhead.position بالثواني — قيمة موضع الاستئناف الحقيقي (اتأكدت بمقارنتها بشريط ديزني
    // نفسه). ديزني بيعيد طلب الـ API ده مع أي seek أو تغيير جودة، فالقيمة بتتجدد لوحدها تلقائيًا
    // في الحالات دي. لكن أثناء تشغيل مستمر من غير seek، ممكن ميتبعتش تاني لفترة طويلة، فمينفعش
    // نعتبرها "قديمة" بسرعة زي التليمتري القديمة — فترة السماح هنا كبيرة جدًا (تغطي فيلم كامل)
    const DISNEY_PLAYHEAD_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 ساعات — قيمة الـ API مش هتتجدد كل شوية زي التليمتري، فمحتاجة فترة سماح طويلة جدًا
    const hasFreshDisneyPlayhead = platform === "disney"
        && disneyPlayheadSeconds !== null
        && disneyPlayheadReceivedAt !== null
        && (Date.now() - disneyPlayheadReceivedAt) < DISNEY_PLAYHEAD_MAX_AGE_MS;

    // 🎯 المصدر الحيّ الجديد (stateStore بتاع مشغّل ديزني+) — أدق من كل حاجة تانية، وبيتحدّث
    // فورًا مع أي seek يدوي. نفس منطق فترة السماح الطويلة (بيفضل يتحدّث طول التشغيل، ومفيش داعي
    // نعتبره "قديم" بسرعة أثناء وقفة طبيعية)
    const DISNEY_LIVE_POSITION_MAX_AGE_MS = 6 * 60 * 60 * 1000;
    const hasLiveDisneyPosition = platform === "disney"
        && disneyLivePositionSeconds !== null
        && disneyLivePositionReceivedAt !== null
        && (Date.now() - disneyLivePositionReceivedAt) < DISNEY_LIVE_POSITION_MAX_AGE_MS;

    // ⚠️ تحذير فعلي (مش تشخيص مؤقت): لو مفيش لا المصدر الحيّ ولا القديم وصل بعد فترة سماح
    // معقولة، يبقى فعلاً في مشكلة (ديزني غيّر شكل الـ stateStore أو الـ API)، وبنرجع
    // لـ video.currentTime بس كـ fallback غير دقيق — يستاهل تنبيه واحد فقط
    if (platform === "disney" && !hasLiveDisneyPosition && !hasFreshDisneyPlayhead
        && !nazafaLoggedNoDisneyPlayheadYet && (Date.now() - nazafaScriptStartedAt) > 45000) {
        nazafaLoggedNoDisneyPlayheadYet = true;
        console.warn("⚠️ Nazafa Disney: لسه مفيش أي قيمة موضع حقيقية وصلت (لا من stateStore ولا من الـ playback API) — شغالين بـ video.currentTime بس كـ fallback، وده ممكن يبقى غير دقيق.");
    }

    let time;
    if (hasLiveDisneyPosition) {
        // 🎯 المصدر المفضّل: قيمة حيّة مباشرة من stateStore بتاع المشغّل نفسه — مفيش استقراء
        // ولا حساب فرق مطلوب، القيمة دي بتتحدّث فورًا مع أي تقدّم أو seek حقيقي (تأكد عملياً
        // بمقارنتها لحظة seek يدوي وعكست القيمة الجديدة على طول)
        time = disneyLivePositionSeconds + platformOffset;
    } else if (hasFreshDisneyPlayhead) {
        // 🎯 نفضّل نحسب التقدم من فرق video.currentTime نفسه (أدق، بيعكس أي تقطيع/buffering
        // فعلي) بدل الاعتماد بس على الوقت الحقيقي اللي عدى — بس لازم نتأكد إن معملناش seek من
        // وقت آخر قراءة (لو الفرق سالب أو أكبر من حد معقول، يبقى الـ buffer اتصفّر وده مش تقدم
        // حقيقي، فبنرجع لطريقة الوقت الحقيقي كـ fallback مؤقت لحد ما توصل قراءة جديدة)
        // 🐞 إصلاح جوهري: الحد الأقصى القديم (20 ثانية) كان منطقي لما المصدر كان بيتجدد كل شوية
        // (تليمتري/سلايدر) — أي فرق أكبر كان فعلاً علامة seek. لكن دلوقتي بنلقط playhead.position
        // *مرة واحدة بس* لكل جلسة (راجع main.script.js)، فالفرق هيكبر عن 20 ثانية بشكل طبيعي جدًا
        // في أول نص دقيقة من أي تشغيل عادي من غير أي seek خالص! لو فضلنا نرجع لحساب الوقت الحقيقي
        // المنقضي (elapsedRealSeconds) في الحالة دي، أي وقفة/buffering حقيقية هتخلي rate=0 ويتجمد
        // الحساب على القيمة القديمة (اتأكد ده فعليًا في اللوج: computed time رجعت بالظبط لقيمة
        // الاستئناف الأصلية من غير أي زيادة، وده سبب ظهور Match Found بدري). الحل: منعتبرش الفرق
        // "غير منطقي" إلا لو كان *سالب* فعلاً (علامة أكيدة على seek/reset حقيقي لـ currentTime)،
        // فـ videoTimeDelta يفضل المصدر الأساسي طول ما التشغيل مستمر لقدام مهما طالت المدة
        const videoTimeDelta = (disneyPlayheadVideoTimeAtReceipt !== null)
            ? (video.currentTime - disneyPlayheadVideoTimeAtReceipt)
            : null;
        const canUseVideoDelta = videoTimeDelta !== null && videoTimeDelta >= -1.5;

        if (canUseVideoDelta) {
            time = disneyPlayheadSeconds + Math.max(0, videoTimeDelta) + platformOffset;
        } else {
            const elapsedRealSeconds = (Date.now() - disneyPlayheadReceivedAt) / 1000;
            const rate = video.paused ? 0 : (video.playbackRate || 1);
            time = disneyPlayheadSeconds + (elapsedRealSeconds * rate) + platformOffset;
        }

        // 🎯 هامش تعويضي: كان ده أصلاً عشان يعوّض تأخير شبكة/معالجة طبيعي في تليمتري ديزني القديمة
        // (dust) قبل ما توصلنا القيمة. المصدر الحالي (شريط التقدّم في الواجهة نفسها) قراءة حية
        // مباشرة من DOM بلا أي وسيط شبكة، فمفيش تأخير مماثل نعوّضه — القيمة بقت صفر. لو التخطي
        // بان متأخر أو مبكر شوية بعد التجربة، ده المكان اللي نعدّل فيه.
        const DISNEY_TELEMETRY_LAG_COMPENSATION_SECONDS = 0;
        time += DISNEY_TELEMETRY_LAG_COMPENSATION_SECONDS;
    } else {
        time = video.currentTime + platformOffset;
    }


    // التغيير هنا أيضاً: البحث في window.activeFilters
    const currentFilter = window.activeFilters.find(f => {
        // تجاهل أي فلتر أوقفه المستخدم يدوياً من الـ popup لهذا العمل تحديداً
        if (f && disabledFilterIds[f.id]) return false;

        const start = parseFloat(f.start_time ?? f.start);
        const end = parseFloat(f.end_time ?? f.end ?? (start + 1.5));
        return time >= start && time <= end;
    });

    if (currentFilter) {
        console.log("✅ Nazafa Brain: Match Found!");

        const action = (currentFilter.action_type || currentFilter.action || "").toLowerCase().trim();

        // 🐞 إصلاح: كان الفحص القديم بيقارن category الخام (زي "explicit content") مباشرة بمفاتيح
        // userSettings (nudity/violence/language/substance) وهي مش نفس الصيغة أبداً، فكان عملياً
        // نادراً ما يطابق إلا لو category كانت بالحرف "language" مثلاً. دلوقتي بنطبّع category لنفس
        // التصنيف العام المستخدم في توجلز الـ popup (services.js:normalizeToGroupKey) أولاً، وبعدين
        // نتحقق كمان من توجل التصنيف الفرعي المحدد لو موجود.
        // 🆕 وبقى الفحص بياخد في الاعتبار كل التصنيفات اللي الفلتر مطابقها (لو المشهد فيه أكتر من
        // حاجة، زي خمر + قبلة مع بعض) — يتحجب لو أي واحد منهم لسه مفعّل (راجع nazafaShouldFilterItem)
        if (!nazafaShouldFilterItem(currentFilter)) return;

        const targetEnd = parseFloat(currentFilter.end_time ?? currentFilter.end);

        if (action === "skip") {
            isExecutingAction = true;
            // نرجع نطرح الـ offset هنا عشان نحوّل توقيت النهاية (المسجّل بتوقيت المنصة المرجعية)
            // لتوقيت الفيديو الفعلي المعروض دلوقتي على المنصة الحالية
            //
            // 🐞 إصلاح خاص بديزني+: video.currentTime مش موضع مطلق على المشغّل ده (راجع التعليق
            // الطويل فوق عند حساب disneyPlayheadSeconds) — فمينفعش نبعت targetTime كقيمة مطلقة
            // ونحطها مباشرة في video.currentTime زي باقي المنصات. بدل كده، بنحسب "دلتا" (فرق)
            // بين الوقت المستهدف (targetEnd) والوقت الحالي المقدّر (time، اللي محسوب أصلاً من
            // disneyPlayheadSeconds فوق) — والفرق ده صحيح بغض النظر عن الـ offset لأنه بيتلغي من
            // الطرفين. main.script.js هيضيف الدلتا دي على video.currentTime الحالي بدل استبداله.
            const disneyDelta = targetEnd - time;
            broadcastToAllFrames({ type: "NAZAFA_EXECUTE_ACTION", action: "skip", targetTime: targetEnd - platformOffset, disneyDelta: disneyDelta, platform: platform });

            // 🐞 إصلاح خطير: بعد ما نبعت أمر الـ skip، الموديل الداخلي بتاعنا (disneyPlayheadSeconds
            // + الفرق من آخر قراءة) كان لسه فاكر إننا في الوضع القديم (قبل التخطي) لحد ما توصل
            // قراءة dust جديدة (اللي ممكن تاخد لحظات لحد ~30 ثانية) — فكان بيحسب time بالغلط
            // وكأن التخطي ماحصلش، وده كان بيخلي نفس الفلتر يتطابق تاني ويعمل تخطي مكرر من غير أي
            // داعي. الحل: نحدّث مرجعنا الداخلي فوراً (بدون انتظار قراءة جديدة من ديزني) عشان
            // يعكس إننا دلوقتي بعد نهاية الفلتر مباشرة (+ هامش أمان بسيط 0.75 ثانية)
            if (platform === "disney") {
                disneyPlayheadSeconds = (targetEnd - platformOffset) + 0.75;
                disneyPlayheadReceivedAt = Date.now();
                disneyPlayheadVideoTimeAtReceipt = video.currentTime + disneyDelta;
                // 🎯 نحدّث المصدر الحيّ الجديد كمان بنفس المنطق — طبيعي إن الـ stateStore
                // هيبعت قيمة محدّثة فعلية خلال أجزاء من الثانية بعد ما الـ seek يخلص، لكن
                // بنحدّثها فورًا هنا كمان عشان مفيش فجوة تخلي نفس الفلتر يتطابق تاني قبل ما
                // التحديث الحقيقي يوصل
                disneyLivePositionSeconds = (targetEnd - platformOffset) + 0.75;
                disneyLivePositionReceivedAt = Date.now();
            }

            setTimeout(() => { isExecutingAction = false; }, 1000);
        } else if (action === "mute") {
            broadcastToAllFrames({ type: "NAZAFA_EXECUTE_ACTION", action: "mute" });
        } else if (action === "blur") {
            // نمرر original_description مع أمر التغبيش عشان يظهر كنص توضيحي فوق الفيديو
            // يشرح للمشاهد سبب التغبيش بدل ما يفاجأ بمشهد مغبّش من غير تفسير
            broadcastToAllFrames({
                type: "NAZAFA_EXECUTE_ACTION",
                action: "blur",
                description: currentFilter.original_description || "تم تغبيش هذا المشهد"
            });
        } else if (action === "partial_blur") {
            // 🆕 تغبيش جزئي: بيغبش صندوق صغير محدد الإحداثيات بس (زي سيجارة في إيد شخص) بدل
            // ما يغبش الشاشة كلها. blur_region لازم يتحط يدوياً وقت تأليف الفلتر (نفس فكرة
            // start/end بالظبط) — إحداثيات نسبية (0 لـ 1) بالنسبة لأبعاد عنصر الفيديو المعروض،
            // مش بكسل مطلق ولا دقة الفيديو الأصلية، عشان تفضل صح مهما كان حجم الشاشة/ملء الشاشة.
            // لو الفلتر اتسجّل partial_blur من غير ما حد يحط blur_region فعلياً، نرجع تلقائياً
            // للتغبيش الكامل (fallback) بدل ما يفوت المشهد من غير أي حجب خالص.
            const region = currentFilter.blur_region;
            const validRegion = region && typeof region.x === "number" && typeof region.y === "number"
                && typeof region.width === "number" && typeof region.height === "number";
            if (validRegion) {
                broadcastToAllFrames({
                    type: "NAZAFA_EXECUTE_ACTION",
                    action: "partial_blur",
                    region: region,
                    description: currentFilter.original_description || "تم تغبيش جزء من هذا المشهد"
                });
            } else {
                console.warn("⚠️ Nazafa: فلتر partial_blur من غير blur_region صالح — رجعنا للتغبيش الكامل كاحتياط:", currentFilter);
                broadcastToAllFrames({
                    type: "NAZAFA_EXECUTE_ACTION",
                    action: "blur",
                    description: currentFilter.original_description || "تم تغبيش هذا المشهد"
                });
            }
        }
    } else {
        // لا يوجد فلتر نشط حالياً: تأكد من إلغاء أي تأثير سابق (كتم أو تغبيش) كان مفعّلاً
        broadcastToAllFrames({ type: "NAZAFA_EXECUTE_ACTION", action: "unmute" });
        broadcastToAllFrames({ type: "NAZAFA_EXECUTE_ACTION", action: "unblur" });
    }
}
requestAnimationFrame(brainLoop);