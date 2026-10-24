// main.script_2.js - Nazafa Passive Executor
console.log("💪 Nazafa Engine: Main Executor Ready.");

let isSystemMute = false; // متغير جديد لمنع تضارب الكتم

// 🔤 توجل تشفير/تنقية الترجمة النصية (Smart Subtitle Censor) — هذا الملف MAIN world (مفيهوش
// وصول مباشر لـ chrome.storage)، فبيستقبل القيمة عن طريق postMessage من isolated.script.js
// (راجع broadcastSubtitleCensorSetting هناك). افتراضياً true لحد ما يوصل تحديث فعلي.
let nazafaSubtitleCensorEnabled = true;
// 🆕 حالة توجل "إهانات بسيطة" (filterSettings.language.subs.insults، مدموجة مع توجل مجموعة
// language الكبرى) — بتوصل برضه عن طريق نفس رسالة NAZAFA_SUBTITLE_CENSOR_SETTING من
// isolated.script.js (راجع broadcastSubtitleCensorSetting هناك). افتراضياً true لحد ما يوصل تحديث فعلي.
let nazafaInsultsEnabled = true;
window.addEventListener("message", (event) => {
    if (!event.data || event.data.type !== "NAZAFA_SUBTITLE_CENSOR_SETTING") return;
    nazafaSubtitleCensorEnabled = !!event.data.enabled;
    if (event.data.insultsEnabled !== undefined) nazafaInsultsEnabled = !!event.data.insultsEnabled;
});

// 🐞 إصلاح: بلاغ حقيقي من أبل تي في+ إن الصوت بيفضل مكتوم تماماً لحد ما المستخدم يفتحه يدوي،
// حتى بعد ما الفلتر يخلص ويوصل أمر "unmute". السبب المرجّح: بعض المنصات (زي أبل تي في+، خصوصاً
// حوالين شاشة الإيقاف المؤقت/"Continue Watching") بتغيّر video.muted من عندها هي كجزء من واجهتها
// الداخلية (مش المستخدم فعلياً اللي بيدوس)، وده بيطلق حدث volumechange زي أي حدث حقيقي تماماً —
// فمستمع volumechange بتاعنا (تحت) بيغلط ويسجّله كـ"كتم يدوي من المستخدم" (dataset.userMuted =
// "true")، وبعدين لما "unmute" الحقيقي بتاع الفلتر يوصل، بيتوقف عمداً احتراماً لـ"رغبة المستخدم"
// المزعومة دي — رغم إنها مش حقيقية أصلاً. الحل: بدل ما نعتمد بس على dataset.userMuted (مش موثوق
// 100%)، بنتتبّع بأنفسنا هل *إحنا* اللي كتمنا الصوت أصلاً (nazafaMuteOwner) — لو إحنا الملاك،
// أي أمر unmute بتاعنا بيفتح الصوت فوراً بلا شرط (مفيش داعي نحترم علم ممكن يكون غلط)، ولو مش
// إحنا (يعني مستخدم كتم من عنده من غير ما فلتر يشتغل)، نفضل نحترم dataset.userMuted زي الأول.
let nazafaMuteOwner = false;

// ==========================================
// 🎬 ديزني+: تحديد موضع التشغيل الحقيقي (playhead) بعد استئناف الفيديو
// المصدر: رد الـ playback API (disney.playback.edge.bamgrid.com/v7/playback/ctr-regular) فيه
// playhead.position بالثواني — موضع الاستئناف الحقيقي. بيتصدّق مرة واحدة بس لكل تحميل صفحة
// (أي رد تاني لنفس الـ endpoint بيرجّع نفس القيمة القديمة كـ echo ثابت، مش قيمة حية). بعد كده
// isolated.script.js بيكمّل الحساب بالاستقراء من فرق video.currentTime.
// ==========================================
const nazafaIsDisney = window.location.hostname.includes("disneyplus.com");

const NAZAFA_DISNEY_API_HOST_RE = /(^|\.)(bamgrid\.com|dssott\.com|disneyplus\.com|disney-plus\.net|bam-sdk\.com|bamtech\.co)$/i;
function nazafaIsDisneySessionCandidateUrl(urlStr) {
    if (!urlStr) return false;
    if (/\.vtt|\.m3u8|\/dust\b/i.test(urlStr)) return false;
    let u;
    try {
        u = new URL(urlStr, location.href);
    } catch (e) {
        return false;
    }
    if (!NAZAFA_DISNEY_API_HOST_RE.test(u.hostname)) return false;
    return /\/(session|scenarios?|playback)(\/|$)/i.test(u.pathname);
}

let nazafaDisneyPlayheadCapturedOnce = false;
function nazafaExtractDisneyPlaybackApiPlayhead(urlStr, bodyText) {
    if (!nazafaIsDisney) return;
    if (nazafaDisneyPlayheadCapturedOnce) return;
    if (!/\/playback\//i.test(urlStr) && !/scenario/i.test(urlStr)) return;
    try {
        const parsed = JSON.parse(bodyText);
        const pos = parsed && parsed.playhead && parsed.playhead.position;
        if (typeof pos === "number" && pos >= 0) {
            nazafaDisneyPlayheadCapturedOnce = true;
            window.postMessage({ type: "NAZAFA_DISNEY_PLAYHEAD", seconds: pos }, "*");
        }
    } catch (e) {}
}

function nazafaLogDisneySessionResponse(urlStr, bodyText) {
    if (!nazafaIsDisney) return;
    if (!bodyText) return;
    if (!nazafaIsDisneySessionCandidateUrl(urlStr)) return;
    nazafaExtractDisneyPlaybackApiPlayhead(urlStr, bodyText);
}

// ==========================================
// 🎯 ديزني+: مصدر أدق وحيّ 100% للموضع الحقيقي (اكتشفناه بفحص العنصر المخصص
// <disney-web-player>، اللي بيكشف property اسمها stateStore — نظام إدارة حالة شبيه بـ Redux
// شايل حالة المشغل بالكامل). المسار player.core.timeline.timeline.playheadPositionMs بيدّي
// الموضع الحقيقي بالملي ثانية، وبيتحدّث حيّ عن طريق subscribe() على أي تغيير — بما فيه الـ seek
// اليدوي من شريط تقدّم ديزني نفسه (اتأكد عملياً: القيمة بتتغيّر فورًا لحظة السحب، بعكس كل
// الطرق التانية اللي جُرّبت قبل كده — راجع DISNEY_PLUS_SEEK_TRACKING_PROBLEM.md للسياق الكامل).
// ده بيلغي الحاجة لكل الاستقراء المعقّد من فرق video.currentTime اللي كان مستخدم قبل كده.
// ==========================================
let nazafaDisneyStoreSubscribed = false;
function nazafaTryAttachDisneyStore() {
    if (!nazafaIsDisney) return;
    if (nazafaDisneyStoreSubscribed) return;
    const player = document.querySelector("disney-web-player");
    if (!player || !player.stateStore || typeof player.stateStore.subscribe !== "function") return;
    nazafaDisneyStoreSubscribed = true;
    let lastMs = null;
    try {
        player.stateStore.subscribe(() => {
            try {
                const state = player.stateStore.getState();
                const ms = state && state.player && state.player.core && state.player.core.timeline &&
                    state.player.core.timeline.timeline && state.player.core.timeline.timeline.playheadPositionMs;
                if (typeof ms === "number" && isFinite(ms) && ms !== lastMs) {
                    lastMs = ms;
                    window.postMessage({ type: "NAZAFA_DISNEY_LIVE_POSITION", seconds: ms / 1000 }, "*");
                }
            } catch (e) {}
        });
    } catch (e) {
        nazafaDisneyStoreSubscribed = false;
    }
}
if (nazafaIsDisney) {
    const nazafaDisneyStoreAttachInterval = setInterval(() => {
        nazafaTryAttachDisneyStore();
        if (nazafaDisneyStoreSubscribed) clearInterval(nazafaDisneyStoreAttachInterval);
    }, 500);
}

// ==========================================
// 🎯 برايم فيديو: نفس مشكلة ديزني+ بالظبط لكن من زاوية تانية — رابط صفحة المسلسل (/detail/{id}
// أو /title/{id}) ثابت تمامًا بين كل حلقات نفس الموسم (اتأكد عملياً: نفس الـ URL بالحرف لحلقة 1
// وحلقة 2)، فمحرك الفلترة (isolated.script.js عبر getMovieId()) كان عمره ما يقدر يميّز إنه
// بصدد حلقة مختلفة، ويفضل شغال بفلاتر الحلقة الأولى (أو من غير فلاتر خالص) مهما بدّلت الحلقة.
// 🎯 الحل (اتأكد بتحليل حقيقي لملف HAR اتصوّر وقت التنقل بين حلقتين): أمازون بيبعت طلب
// GetVodPlaybackResources (على atv-ps*.primevideo.com) مرة واحدة بالظبط في بداية كل جلسة
// تشغيل، ومعاه query parameter اسمه titleId بقيمة GTI مميزة فعليًا لكل حلقة على حدة (مختلفة
// تمامًا عن الـ GTI الظاهر في رابط صفحة التفاصيل نفسها) — نفس نمط "مصدر حقيقي واحد بيتصدّق
// مرة واحدة لكل جلسة" اللي استخدمناه مع ديزني+، بس هنا القيمة موجودة في الـ URL مباشرة (query
// param)، مفيش داعي حتى نقرا جسم الرد.
// ==========================================
const nazafaIsAmazon = /(^|\.)(primevideo\.com|amazon\.[a-z.]+)$/i.test(window.location.hostname);
const NAZAFA_AMAZON_PLAYBACK_RESOURCES_RE = /\/playback\/prs\/GetVodPlaybackResources/i;
function nazafaExtractAmazonLiveEpisodeId(urlStr) {
    if (!nazafaIsAmazon) return;
    if (!NAZAFA_AMAZON_PLAYBACK_RESOURCES_RE.test(urlStr)) return;
    try {
        const u = new URL(urlStr, location.href);
        const titleId = u.searchParams.get("titleId");
        if (titleId) {
            window.postMessage({ type: "NAZAFA_AMAZON_LIVE_EPISODE_ID", id: titleId }, "*");
        }
    } catch (e) {}
}

// ==========================================
// 🎯 آبل تي في+: نفس مشكلة برايم فيديو بالظبط — رابط الصفحة فيه معرّف المسلسل نفسه بس
// (umc.cmc.xxxxx بتاع العرض)، وده ثابت مهما بدّلنا حلقة (اتأكد بمقارنة روابط حلقة 1 وحلقة 2
// فعلياً: نفس الرابط بالظبط). اتلقط المعرّف الحقيقي للحلقة الشغالة عن طريق تحليل HAR لجلستين
// فعليتين (حلقة 1 وحلقة 2) ومقارنتهم: طلب GET بيتبعت لكل حلقة على حدة لـ
// /api/uts/v3/contents/play-metadata/vod?...&externalId=VSEVR0560101&... (حلقة 1) مقابل
// &externalId=VSEVR0560102&... (حلقة 2) — externalId ده رقم حلقة صريح وواضح ومختلف فعلياً لكل
// حلقة، ده غير umc.cmc الظاهر في نفس الرابط كمان (umc.cmc.s80mx1ic96pu6ewupz8pfasf لحلقة 1 مقابل
// umc.cmc.23qox5n6larygqgg6u74fvyj لحلقة 2 — معرّف محتوى تاني خاص بالحلقة نفسها، مختلف عن
// umc.cmc بتاع المسلسل العام الظاهر في رابط الصفحة). بنستخدم externalId لأنه أبسط وأوضح.
// ==========================================
const nazafaIsAppleTV = /(^|\.)tv\.apple\.com$/i.test(window.location.hostname);
const NAZAFA_APPLETV_PLAYMETADATA_RE = /\/api\/uts\/v3\/contents\/play-metadata\/vod/i;
function nazafaExtractAppleTVLiveEpisodeId(urlStr) {
    if (!nazafaIsAppleTV) return;
    if (!NAZAFA_APPLETV_PLAYMETADATA_RE.test(urlStr)) return;
    try {
        const u = new URL(urlStr, location.href);
        const externalId = u.searchParams.get("externalId");
        if (externalId) {
            window.postMessage({ type: "NAZAFA_APPLETV_LIVE_EPISODE_ID", id: externalId }, "*");
        }
    } catch (e) {}
}

// ==========================================
// 🐞 إصلاح حرج: كان محرك الرقابة (القائمة السوداء + الريجكس) موجود في ملف منفصل
// (subtitle-censor-core.js) بيتحمّل هنا في الـ MAIN world قبل main.script.js، عشان ميتكررش
// مع نسخة الـ ISOLATED world. لكن ثبت عملياً (بلاغ حقيقي: "window.NazafaCensor مش موجود" في
// كل محاولة اعتراض على ديزني+) إن الاعتماد على ترتيب تحميل ملفين منفصلين في الـ MAIN world —
// خصوصاً مع "all_frames: true" ووجود إطارات (iframes) بتتحمّل بتوقيتات مختلفة — مش موثوق
// 100%: main.script.js بيشتغل صح، بس window.NazafaCensor مش لاقيه جاهز وقت أول طلب ترجمة.
// الحل: المحرك بقى جوّه main.script.js نفسه (نسخة محلية، من غير أي اعتماد على ملف تاني)،
// فمفيش أي احتمال توقيت خالص — أول ما main.script.js يشتغل، المحرك يبقى جاهز فوراً معاه في
// نفس السطر. ده بيكرر القائمة السوداء مع subtitle-censor-core.js (لسه مستخدَم في الـ ISOLATED
// world بس مع subtitles.script.js)، فأي كلمة جديدة لازم تتضاف في المكانين مع بعض.
// ==========================================
const NazafaCensorCore = (function () {
    "use strict";

    const DIACRITICS_RE = /[ً-ٰٕۖ-ۭـ]/;

    function normalizeText(text) {
        let normalized = "";
        const map = [];
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (DIACRITICS_RE.test(ch)) continue;
            let nch = ch;
            if (ch === "أ" || ch === "إ" || ch === "آ" || ch === "ٱ") nch = "ا";
            else if (ch === "ى") nch = "ي";
            else if (ch === "ة") nch = "ه";
            else nch = ch.toLowerCase();
            normalized += nch;
            map.push(i);
        }
        return { normalized, map };
    }

    const NAZAFA_SUBTITLE_BLACKLIST = {
        explicit: [
            // 🆕 مزامنة من subtitle-censor-core.js (كلمات كانت موجودة هناك بس)
            "الاستمناء", "استمنى", "لاعق القضبان", "زير النساء", "خصية", "تعري", "ضاجعت", "داعر", "الداعر", "نهود", "شاذ", "الشاذ",
            // 🆕 اغتصاب (بطلب المستخدم: في التصنيفين explicit + profanity)
            "اغتصب", "اغتصبت", "اغتصبوا", "اغتصبو", "يغتصب", "تغتصب", "نغتصب", "اغتصاب", "مغتصب", "مغتصبة", "مغتصبين", "مغتصبون", "rape", "raped", "raping", "rapist", "rapists",
            "نيك", "ينيك", "متناك", "منيوك", "كس", "طيز", "زب", "عارية",
            "عاهره", "قحبه", "شرموطه", "لحس", "جماع", "مؤخرات", "مؤخرة", "مثيرة","سافلة","زير نساء","تنام مع","السفلة","عاشر","يعاشر","تعاشر","مثيرات","جذّابة","فاتنة","عشيقة",
            "العلاقة الجنسية", "العلاقات الجنسية", "المشاهد الجنسية", "الأفعال الجنسية", "الممارسة الجنسية", "الأمور الجنسية", "الاعتداء الجنسي", "التحرش الجنسي", "ممارسة الجنس", "لممارسة الجنس", "يمارس الجنس", "يمارسون الجنس", "يمارسان الجنس", "تمارس الجنس", "تمارسون الجنس", "مارس الجنس", "مارسوا الجنس", "مارست الجنس", "مارسا الجنس", "نمارس الجنس", "أمارس الجنس", "المداعبة", "يضاجع", "اضاجع", "ضاجع", "المؤخرة", "مؤخرتك", "مؤخرتي", "جنسية", "العلاقة الحميمة","الخلاعية", "الخصيتان", "العاهرة","عاهرة",            "fuck", "fucking", "fucked", "fucker", "motherfucker", "pussy", "dick", "cock",
            "cunt", "blowjob", "handjob", "porn", "horny", "nude", "naked", "boobs", "orgasm",
            "خرا", "خره", "قحاب", "شراميط", "زق", "جنسي", "عاري", "سكس", "فاجرة",
            "fucks", "fuckin", "fuckin'", "fuckers", "fuckup", "fuckups", "motherfuckers",
            "fuckface", "fuckwit", "fuckhead", "fuckery", "fucktard",
            "dicks", "dickhead", "dickheads", "cocks", "cocksucker", "pussies",
            "whore", "whores", "whorish", "slut", "sluts", "slutty",
            "sex", "sexy", "sexual", "nudity", "breasts", "condoms", "penis", "vagina",
            "butt", "butts", "hot",
            "قضيب", "ثدي", "واقي ذكري",
            "sleeping with", "sleep with",
            "كسمك", "كسمين", "زبر", "زانية", "زاني", "دعارة","غبي", "كس اخت","بدين","الساقطة",
            "اباحي", "افلام اباحية", "فحش", "فاحشة", "شبق", "مخنث", "المخنثين",
            "cockhead", "cockblock", "pecker", "whorehouse", "hooker", "hookers", "skank",
            "vaginal", "pornography", "cum", "jizz", "dildo", "vibrator", "semen", "testicle",
            "testicles", "scrotum", "rimjob", "gangbang", "threesome", "foursome", "orgy",
            "masturbate", "jackoff", "jerkoff", "fellatio", "cunnilingus", "muff", "مزز", "مزة"
        ],
        profanity: [
            // 🆕 شتائم/دعاء مأخوذة من قائمة "شتائم" في فلاتر المشاهد
            "بن الجزمة", "ابن الجزمة", "يخربيت امك", "يا نهار اسود", "يانهار اسود", "نهارك اسود", "يا نهارك اسود", "يا نهار ازرق", "motherfucher",
            // 🆕 مزامنة من subtitle-censor-core.js (كلمات كانت موجودة هناك بس)
            "الخراء", "خراء", "وغدا", "متعاليا",
            // 🆕 اغتصاب (بطلب المستخدم: في التصنيفين explicit + profanity)
            "اغتصب", "اغتصبت", "اغتصبوا", "اغتصبو", "يغتصب", "تغتصب", "نغتصب", "اغتصاب", "مغتصب", "مغتصبة", "مغتصبين", "مغتصبون", "rape", "raped", "raping", "rapist", "rapists",
            "ابن الكلب", "يا كلب", "حقير", "وسخ", "خول",
            "ابن الحرام", "يلعن", "لعنه الله", "جعة", "مضاجعة", "الجعة", "لعينة","يلعن","ينعل","الوساخة",
            "اللعينة", "اللعنة", "اللعين", "لعين","غبي","ابن الرب","حثالة","قبّلني","السافل","متعجرف","ابول","آلهة","تبول",
            "تفو عليك", "يا حيوان", "روح انقلع", "يشخو", "يا غبي", "الحقير", "يسوع", "المسيح", "الوغد", "وغد", "فحل" , "الفحل","الخرقى","باست","هانومان",
            "bitch", "asshole", "bastard", "shit", "bullshit",
            "damn", "goddamn", "jerk", "scumbag", "dumbass", "prick", "douche", "loser",
            "حيوان", "جبان","الجبناء",
            "معفن", "معفنة", "نذل", "تافه", "زبالة", "خنزير", "كلب", "كلاب","جحيم",
            "لعنة", "ملعون", "ملاعين",
            "effing", "effin", "effin'", "freaking", "freakin", "freakin'", "frigging", "friggin", "friggin'",
            "shits", "shitty", "shitting", "shittin'", "shithead", "shitheads", "bullshitting",
            "horseshit", "shitfaced", "shite",
            "ass", "asses", "assholes", "jackass", "jackasses", "dumbasses", "badass", "hardass",
            "asswipe", "arse", "arsehole",
            "bitches", "bitchy", "bitching", "bitchin'",
            "bastards",
            "damned", "damnit", "dammit", "damning", "goddammit", "goddamnit", "hell", "helluva",
            "godawful", "jesus", "christ", "lord",
            "pisses", "pissed", "pissing", "pissy", "pissin'", "piss",
            "crap", "craps", "crappy",
            "pricks", "twat", "twats", "wank", "wanker", "wankers", "wanking", "wankin'",
            "douchebag", "douchebags",
            "bloody", "bugger", "buggered", "bollocks", "tosser", "git", "minger", "plonker",
            "wtf", "stfu", "gtfo", "omfg", "af",
            "jerks", "losers",
            "freak", "freaks", "pathetic", "lame", "lowlife", "creep",
            "حثالة", "فاشل", "منحرف", "هراء",
            "عرص", "عرصة", "قواد", "ديوث", "ابن الزانية", "بنت الزانية","فساء","براز","غائط",
            "يلعن أبوك", "العن أبوك", "الله يخرب بيتك", "يخرب بيتك", "تيس", "زفت", "طظ",
            "قرف", "مقرف", "مقرفة", "خرابيط", "معتوه", "معتوهة",
            "سمج", "سمجة", "فاجر", "وسخة","بهيمة", "وقح", "وقحة","غباء", "التبويل",
            "قليل الأدب", "عديم الأدب",
            "والنبي", "بجاه النبي", "بحق النبي",
            "وحياتك", "وحياتي", "وحياته", "وحياتها", "وحياتنا", "وحياتكم",
            "وحياة أمي", "وحياة ابويا", "وحياة ماما", "وحياة بابا",
            "وشرفي", "وشرفك", "وشرفه", "وأمانة",
            "بحق السماء", "بحق الجحيم",
            "shitface", "shitcan", "shitfit", "asshat", "assclown", "assmonkey", "assmunch", "fugly",
            "حولة", "ندل", "سافل", "جبان", "جبانة",
            "أوسخ", "وساخة", "الوساخة",
            "ياللهوي", "والنعمة", "بالذمة", "بذمتك", "بزمتك",
            "يا نهار اسود", "يا يوم اسود", "نهارك اسود", "نهار ابوك اسود", "يا لهوي",
            "وحياة امك", "وحياة ابوك", "وحياة ابني", "ورحمة ابويا",
            "يارب ياخدك", "ربنا ياخدك", "روح امك", "بتاع النسوان",
            "يا دون", "ابن الدون", "ابن دون", "ولاد الجزمة",
            "سفلة", "يخربيتك", "يحرقك",
            "shithole", "shitholes", "shitload", "shitloads", "shitstorm", "shitshow", "shitshows",
            "shitless", "batshit", "dogshit", "chickenshit", "apeshit", "shitbag", "shitbags",
            "shitlist", "shitton", "holyshit", "shitpost", "shitposting", "shitstain",
            "قبيح", "قبيحة","تبول","التبول","بائس","بلطجي",
            "كريشنا", "فيشنو", "شيفا", "براهما", "غانيش", "هانومان", "كالي", "لاكشمي", "دورغا", "إندرا", "راما", "سرسواتي",
            "رع", "إيزيس", "أوزوريس", "أنوبيس", "حورس", "باستت", "باست", "آمون", "تحوت",
            "زيوس", "بوسيدون", "أثينا", "أبولو", "أرتميس", "آريس", "أفروديت", "هيرمس", "ديونيسوس", "هاديس", "هيرا",
            "جوبيتر", "جونو", "نبتون", "ميركوري", "مينرفا", "فينوس",
            "أودين", "لوكي", "فريا", "بالدر",
            "اللات", "العزى", "مناة", "هبل"
        ],
        // 🆕 بكت "الإهانات البسيطة" منفصل عن profanity — نفس التعديل بالظبط في subtitle-censor-core.js
        // (راجع التعليق هناك). لازم يتحدّث هنا كمان كل ما يتحدّث هناك، لأن main.script.js عنده
        // نسخته الخاصة من القائمة (MAIN world معزول تماماً عن الملف المشترك).
        insults: [
            // 🆕 إهانات مأخوذة من قائمة "إهانات بسيطة" في فلاتر المشاهد
            "ابن المجنونة", "ابن الصرمة", "ابن الشمامة", "واطي", "واطية", "نجس", "scum",
            "idiot", "stupid", "moron", "idiots", "idiotic", "stupidity", "morons", "moronic",
            "dumb", "dumber", "dumbest", "dummy", "dummies", "retard", "retarded", "imbecile",
            "imbeciles", "fool", "fools", "foolish", "dope", "dopes", "nitwit", "nitwits",
            "twit", "twits",
            "غبي", "غبية", "اغبياء", "احمق", "حمقاء", "حمار", "حمير", "عبيط", "عبيطة", "عبطاء",
            "حمقى", "هبلة", "اهبل", "أهبل", "بله", "ابله", "بلهاء", "أخرق", "متخلف", "متخلفة",
            "غبيا", "ساذج", "ساذجة"
        ],
        substance: [
            // 🆕 مزامنة من subtitle-censor-core.js (كلمات كانت موجودة هناك بس)
            "سجائر",
            "مخدرات", "المخدرات", "حشيش", "الحشيش", "كوكايين", "هيروين", "حبوب مخدره","الخمور","المنشطات","شامبانيا",
            "مسكرات", "خمر", "كحول", "بيره", "سكران", "ثمل", "نخب", "مخدر", "نشوة", "جرعة زايده",
            "cocaine", "heroin", "marijuana", "weed", "meth", "drugs", "overdose",
            "alcohol", "whiskey", "vodka", "drunk", "cannabis", "narcotics", "cocaine high",
            "beer",
            "بانجو", "استروكس", "ترامادول", "فودكا", "نبيذ", "ويسكي", "حشاش",
            "wine", "whisky", "rum", "tequila", "gin", "hashish", "opium", "ecstasy", "lsd",
            "cigarette", "cigarettes", "cigs", "narcotic", "stoned", "junkie", "addict", "addicts",
            "خمور", "طرشة", "مسطول", "مسطولة", "مبرشم", "مبرشمة",
            "شمبانيا", "براندي", "كونياك", "موهيتو", "مارتيني", "بوربون", "ليكيور", "سيدر", "مشروب روحي",
            // -- أسماء مخدرات إضافية بالعربي (بطلب المستخدم) --
            "مارجوانا", "ماريغوانا", "افيون", "اكستاسي", "امفيتامين", "ميثامفيتامين",
            "كريستال ميث", "شبو", "قنب"
        ]
    };

    function escapeRegex(s) {
        return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    const WORD_BOUNDARY_BEFORE = "(?<![\\p{L}\\p{N}])";
    const WORD_BOUNDARY_AFTER = "(?![\\p{L}\\p{N}])";

    // 🐞 إصلاح: "مخنّثًا" (تنوين فتح) مكانتش بتتمسك — شوف نفس التعليق في subtitle-censor-core.js.
    // لازم يتحدّث في المكانين مع بعض.
    const ARABIC_ATTACHED_SUFFIXES =
        "(?:كما|هما|كم|كن|هم|هن|ني|ها|نا|تها|تهم|تكم|تنا|تي|تك|ية|ات|ون|ين|ان|ة|ك|ه|ي|ا)?";
    const ARABIC_ATTACHED_PREFIX_FULL = "(?:[وفبلك])?(?:ال)?";
    const ARABIC_ATTACHED_PREFIX_NO_AL = "(?:[وفبلك])?";

    function normalizeArabicTerm(t) {
        let out = "";
        for (let i = 0; i < t.length; i++) {
            const ch = t[i];
            if (DIACRITICS_RE.test(ch)) continue;
            if (ch === "أ" || ch === "إ" || ch === "آ" || ch === "ٱ") out += "ا";
            else if (ch === "ى") out += "ي";
            else if (ch === "ة") out += "ه";
            else out += ch.toLowerCase();
        }
        return out;
    }

    const ARABIC_ATTACHED_SUFFIXES_MANDATORY = ARABIC_ATTACHED_SUFFIXES.replace(/\?$/, "");

    const NO_SUFFIX_TERMS = new Set(["جماع", "نخب", "تيس"].map(normalizeArabicTerm)) // "تيس": من غير لواحق، عشان اسم "تيسا" (Tessa) ميتشفّرش;
    const NOT_BEFORE_LAM_TERMS = new Set(["مثيرة"].map(normalizeArabicTerm));
    const NOT_BEFORE_LAM_LOOKAHEAD = "(?!\\s*ل[\\p{L}])";
    const NOT_AFTER_AL_TERMS = new Set(["عاشر"].map(normalizeArabicTerm));
    // 🆕 "جنسي/جنسية": نفس كلمة "الجنسية" بمعنى الهوية (nationality) — "الجنسية المصرية"، "جنسيتي"،
    // "ما جنسيتك" — لازم تتساب. فبنمنع المطابقة لو جاية بـ "ال" التعريف (الاستخدام الشائع للهوية)،
    // ومنسمحش بلواحق الضمير (تي/تك/ته... اللي بتعمل "جنسيتي") وبنسيب اللواحق النحوية بس. المعنى
    // الجنسي مع "ال" بيتغطى بعبارات صريحة في القائمة (العلاقة الجنسية، المشاهد الجنسية...).
    const NOT_AFTER_AL_STRICT_TERMS = new Set(["جنسي", "جنسية"].map(normalizeArabicTerm));
    const NOT_AFTER_AL_STRICT_SUFFIXES = "(?:ات|ين|ون|ان|ا|ه|ة)?";
    const REQUIRE_YA_TERMS = new Set(["أثينا", "نبتون", "حيوان", "كلب", "كلاب"].map(normalizeArabicTerm)) // 🆕 حيوان/كلب/كلاب: شتيمة بس لو جاية بعد "يا" — "حيوان الغابة"/"كلب جيد" بتتساب;
    const REQUIRE_YA_LOOKBEHIND = "(?<=يا\\s)";
    // 🐞 إصلاح: "أريس"/"آريس" بيتصادم مع "باريس" (عاصمة فرنسا) لأن "ب" حرف ملتصق مسموح —
    // شوف نفس التعليق في subtitle-censor-core.js. لازم يتحدّث في المكانين مع بعض.
    const NO_PREFIX_TERMS = new Set(["اريس"].map(normalizeArabicTerm));

    // 🐞 إصلاح: "بيره" بتتصادم مع حرف "ك" الملتصق ("ك"+"بيره"="كبيره"= شكل "كبيرة" بعد
    // التطبيع، كلمة شائعة جداً) — شوف نفس التعليق في subtitle-censor-core.js. لازم يتحدّث
    // في المكانين مع بعض.
    const ARABIC_ATTACHED_PREFIX_NO_KAF = "(?:[وفبل])?(?:ال)?";
    const NOT_WITH_KAF_TERMS = new Set(["بيره"].map(normalizeArabicTerm));

    const CATEGORY_REGEX = {};
    Object.keys(NAZAFA_SUBTITLE_BLACKLIST).forEach((cat) => {
        const rawTerms = NAZAFA_SUBTITLE_BLACKLIST[cat].map((t) => normalizeArabicTerm(t));
        const originalTerms = new Set(rawTerms);
        const tExpandedTerms = new Set();
        rawTerms.forEach((t) => {
            if (t.length > 2 && t.endsWith("ه") && !NO_SUFFIX_TERMS.has(t) && !NOT_AFTER_AL_STRICT_TERMS.has(t)) tExpandedTerms.add(t.slice(0, -1) + "ت");
        });
        const sortDesc = (arr) => Array.from(arr).sort((a, b) => b.length - a.length);
        const notBeforeLamList = sortDesc(new Set(Array.from(originalTerms).filter((t) => NOT_BEFORE_LAM_TERMS.has(t))));
        const notAfterAlList = sortDesc(new Set(Array.from(originalTerms).filter((t) => NOT_AFTER_AL_TERMS.has(t))));
        const requireYaList = sortDesc(new Set(Array.from(originalTerms).filter((t) => REQUIRE_YA_TERMS.has(t))));
        const noPrefixList = sortDesc(new Set(Array.from(originalTerms).filter((t) => NO_PREFIX_TERMS.has(t))));
        const notWithKafList = sortDesc(new Set(Array.from(originalTerms).filter((t) => NOT_WITH_KAF_TERMS.has(t))));
        const strictNoAlList = sortDesc(new Set(Array.from(originalTerms).filter((t) => NOT_AFTER_AL_STRICT_TERMS.has(t))));
        const originalList = sortDesc(new Set(Array.from(originalTerms).filter((t) => !NOT_AFTER_AL_STRICT_TERMS.has(t) && !NO_SUFFIX_TERMS.has(t) && !NOT_BEFORE_LAM_TERMS.has(t) && !NOT_AFTER_AL_TERMS.has(t) && !REQUIRE_YA_TERMS.has(t) && !NO_PREFIX_TERMS.has(t) && !NOT_WITH_KAF_TERMS.has(t))));
        const noSuffixList = sortDesc(new Set(Array.from(originalTerms).filter((t) => NO_SUFFIX_TERMS.has(t))));
        const expandedList = sortDesc(tExpandedTerms);
        if (!originalList.length && !strictNoAlList.length && !noSuffixList.length && !expandedList.length && !notBeforeLamList.length && !notAfterAlList.length && !requireYaList.length && !noPrefixList.length && !notWithKafList.length) { CATEGORY_REGEX[cat] = null; return; }

        const branches = [];
        if (originalList.length) {
            branches.push(`${ARABIC_ATTACHED_PREFIX_FULL}(?:${originalList.map(escapeRegex).join("|")})${ARABIC_ATTACHED_SUFFIXES}`);
        }
        if (strictNoAlList.length) {
            branches.push(`${ARABIC_ATTACHED_PREFIX_NO_AL}(?:${strictNoAlList.map(escapeRegex).join("|")})${NOT_AFTER_AL_STRICT_SUFFIXES}`);
        }
        if (noSuffixList.length) {
            branches.push(`${ARABIC_ATTACHED_PREFIX_FULL}(?:${noSuffixList.map(escapeRegex).join("|")})`);
        }
        if (notBeforeLamList.length) {
            branches.push(`${ARABIC_ATTACHED_PREFIX_FULL}(?:${notBeforeLamList.map(escapeRegex).join("|")})${ARABIC_ATTACHED_SUFFIXES}${NOT_BEFORE_LAM_LOOKAHEAD}`);
        }
        if (notAfterAlList.length) {
            branches.push(`${ARABIC_ATTACHED_PREFIX_NO_AL}(?:${notAfterAlList.map(escapeRegex).join("|")})${ARABIC_ATTACHED_SUFFIXES}`);
        }
        if (requireYaList.length) {
            branches.push(`${REQUIRE_YA_LOOKBEHIND}(?:${requireYaList.map(escapeRegex).join("|")})`);
        }
        if (noPrefixList.length) {
            branches.push(`(?:${noPrefixList.map(escapeRegex).join("|")})${ARABIC_ATTACHED_SUFFIXES}`);
        }
        if (notWithKafList.length) {
            branches.push(`${ARABIC_ATTACHED_PREFIX_NO_KAF}(?:${notWithKafList.map(escapeRegex).join("|")})${ARABIC_ATTACHED_SUFFIXES}`);
        }
        if (expandedList.length) {
            branches.push(`${ARABIC_ATTACHED_PREFIX_FULL}(?:${expandedList.map(escapeRegex).join("|")})${ARABIC_ATTACHED_SUFFIXES_MANDATORY}`);
        }
        CATEGORY_REGEX[cat] = new RegExp(
            `${WORD_BOUNDARY_BEFORE}(?:${branches.join("|")})${WORD_BOUNDARY_AFTER}`,
            "gu"
        );
    });

    function isCategoryEnabled(category) {
        // 🎯 main.script.js (MAIN world) معندوش وصول لـ userSettings بتاعة isolated.script.js
        // (world تاني تماماً)، فبنرجع true دايماً هنا — يعني تنقية VTT شغالة دايماً بغض النظر
        // عن تبديلات المستخدم، على عكس النسخة التانية في subtitle-censor-core.js. ده تصرف
        // مقصود ومقبول هنا (أفضل نكتم زيادة من نسيب لفظ يعدي)، مش باگ.
        // 🆕 استثناء واحد بس: "إهانات بسيطة" (insults) — ده التصنيف الوحيد اللي عنده توجل
        // مخصص في الإعدادات ومطلوب يتقفل فعلاً لما المستخدم يقفله، فبنقرا nazafaInsultsEnabled
        // (بتوصل من isolated.script.js عن طريق postMessage، راجع أعلى الملف).
        if (category === "insults") return nazafaInsultsEnabled !== false;
        return true;
    }

    // 🆕 استثناءات: عبارات بتحتوي كلمة ممنوعة لكن معناها وصف عادي مش شتيمة (زي "كلب جيد"/"كلب صالح"
    // = كلب عادي موصوف بصفة حسنة). لو تطابق ممنوع وقع جوه نطاق عبارة مستثناة، بنتجاهله. الصفات
    // تتوسّع بسهولة: ضيف صفة جديدة لـ EXCEPTION_DOG_ADJECTIVES وتتغطى بكل صيغ "كلب/كلاب" تلقائياً.
    const EXCEPTION_DOG_ADJECTIVES = ["جيد", "صالح", "وفي", "لطيف", "اليف", "مطيع"].map(normalizeArabicTerm);
    const EXCEPTION_REGEX = new RegExp(
        `(?<![\\p{L}\\p{N}])(?:[وفبلك])?(?:ال)?(?:كلب|كلاب)(?:ه|ها|ي|ك|نا|هم)?\\s+(?:ال)?(?:${EXCEPTION_DOG_ADJECTIVES.join("|")})(?:ه|ة|ان|ين|ون|ات)?(?![\\p{L}\\p{N}])`,
        "gu"
    );
    // 🆕 استثناء "مغتصب" بمعنى مسلوب/محتل (الأراضي المغتصبة، الحقوق المغتصبة) — مش اغتصاب جنسي
    const EXCEPTION_USURPED_NOUNS = ["اراضي", "ارض", "حقوق", "حق", "اموال", "ممتلكات", "املاك", "اوطان", "وطن", "بلاد", "ديار", "بيوت", "فلسطين", "قدس"].map(normalizeArabicTerm);
    const EXCEPTION_USURPED_REGEX = new RegExp(
        `(?<![\\p{L}\\p{N}])(?:[وفبلك])?(?:ال)?(?:${EXCEPTION_USURPED_NOUNS.join("|")})(?:ه|ها|هم|نا|ي)?\\s+(?:ال)?مغتصب(?:ه|ين|ون|ات)?(?![\\p{L}\\p{N}])`,
        "gu"
    );
    // 🆕 يوتيوب فقط: عبارات دينية (أحاديث/آيات) بتحتوي كلمات ممنوعة بس هي اقتباس مش لفظ خارج —
    // زي "كاسيات عاريات" (حديث). لو تطابق ممنوع وقع جوه العبارة دي على يوتيوب بنتجاهله. ضيف أي
    // عبارة جديدة في القائمة (الكلمات بتتطبّع تلقائي: همزات/تاء مربوطة/تشكيل).
    const NAZAFA_IS_YOUTUBE_HOST = /(^|\.)youtube\.com$/i.test((typeof location !== "undefined" && location.hostname) || "");
    const EXCEPTION_RELIGIOUS_PHRASES = [
        "كاسيات عاريات", "كاسيات عاريات مميلات مائلات",
        "لعن الله", "لعن الله الخمر",
        "الخمر والميسر",
        "لا تقربوا الزنا", "ولا تقربوا الزنا"
    ].sort((x, y) => y.length - x.length) // الأطول الأول عشان العبارة الكاملة تتمسك قبل جزئها
      .map((p) => normalizeArabicTerm(p).split(/\s+/).map(escapeRegex).join("\\s+"));
    const EXCEPTION_RELIGIOUS_REGEX = new RegExp(
        `(?<![\\p{L}\\p{N}])(?:[وفبلك])?(?:${EXCEPTION_RELIGIOUS_PHRASES.join("|")})(?![\\p{L}\\p{N}])`,
        "gu"
    );
    // 🆕 استثناء "قضيب" بمعنى قضيب معدني/خشبي (قضيب معدني، قضيب من حديد، قضيب ستارة، قضيب السكة...) —
    // مش العضو. القضيب وحدها (أو بأي سياق تاني) لسه بتتشفّر. ضيف كلمة جديدة لـ EXCEPTION_ROD_WORDS.
    const EXCEPTION_ROD_WORDS = ["معدني", "معدنية", "معدن", "حديد", "حديدي", "حديدية", "فولاذ", "فولاذي", "خشبي", "خشب", "نحاسي", "نحاس", "المنيوم", "ستارة", "ستائر", "الستارة", "الستائر", "السكة", "سكة", "القطار", "مقوى", "مقوي", "رفيع", "طويل", "اسمنت", "خرسانة", "وقود", "الوقود", "تحكم", "التحكم", "نووي", "النووي"].map(normalizeArabicTerm);
    const EXCEPTION_ROD_REGEX = new RegExp(
        `(?<![\\p{L}\\p{N}])(?:[وفبلك])?(?:ال)?قضيب(?:ه)?\\s+(?:من\\s+)?(?:ال)?(?:${EXCEPTION_ROD_WORDS.join("|")})(?![\\p{L}\\p{N}])`,
        "gu"
    );
    function getExceptionRanges(normalized) {
        const out = [];
        const EXCEPTION_FARJ_REGEX = /(?<![\p{L}\p{N}])[وفبل]?فرجك(?![\p{L}\p{N}])/gu;
        const exceptionRegexes = NAZAFA_IS_YOUTUBE_HOST ? [EXCEPTION_REGEX, EXCEPTION_USURPED_REGEX, EXCEPTION_ROD_REGEX, EXCEPTION_FARJ_REGEX, EXCEPTION_RELIGIOUS_REGEX] : [EXCEPTION_REGEX, EXCEPTION_USURPED_REGEX, EXCEPTION_ROD_REGEX, EXCEPTION_FARJ_REGEX];
        exceptionRegexes.forEach((re) => {
            re.lastIndex = 0;
            let m;
            while ((m = re.exec(normalized)) !== null) {
                if (m[0].length === 0) { re.lastIndex++; continue; }
                out.push([m.index, m.index + m[0].length]);
            }
        });
        return out;
    }
    function insideException(exRanges, s, e) {
        return exRanges.some(([a, b]) => s >= a && e <= b);
    }

    function censorText(original) {
        if (!original || typeof original !== "string" || !original.trim()) return original;

        const { normalized, map } = normalizeText(original);
        if (!normalized) return original;

        const ranges = [];
        const exRanges = getExceptionRanges(normalized);
        Object.keys(CATEGORY_REGEX).forEach((cat) => {
            const re = CATEGORY_REGEX[cat];
            if (!re || !isCategoryEnabled(cat)) return;
            re.lastIndex = 0;
            let match;
            while ((match = re.exec(normalized)) !== null) {
                if (match[0].length === 0) { re.lastIndex++; continue; }
                const normStart = match.index;
                const normEnd = normStart + match[0].length;
                if (exRanges.length && insideException(exRanges, normStart, normEnd)) continue; // عبارة مستثناة (زي "كلب جيد")
                const origStart = map[normStart];
                const origEnd = normEnd < map.length ? map[normEnd] : (map[map.length - 1] + 1);
                ranges.push([origStart, origEnd]);
            }
        });

        if (!ranges.length) return original;

        ranges.sort((a, b) => a[0] - b[0]);
        const merged = [];
        for (const r of ranges) {
            const last = merged[merged.length - 1];
            if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
            else merged.push(r.slice());
        }

        let out = "";
        let cursor = 0;
        for (const [s, e] of merged) {
            out += original.slice(cursor, s);
            out += "*&^%#";
            cursor = e;
        }
        out += original.slice(cursor);

        return out;
    }

    return { censorText, normalizeText, normalizeArabicTerm };
})();

// ==========================================
// 🔇 رقابة ملفات الترجمة الشبكية (WebVTT) — شغّالة على كل المنصات
// 🎯 اتأكد بالتشخيص المباشر (ديزني+ وأبل تي في+ كمان) إن الترجمة مش بترندر كنص DOM عادي
// (اللي MutationObserver في subtitles.script.js بيراقبه)، ولا هي native <track> جوه UA shadow
// root — هي ملف .vtt عادي بيتجاب بطلب XHR/fetch منفصل (زي .../SUBTITLE_1_WEBVTT/.../pts_XXXX.vtt)
// ومحتواه نص WebVTT خام واضح بالكامل. يبقى الحل الصحيح: اعتراض الرد هنا (MAIN world، نفس مكان
// اعتراض تليمتري ديزني)، وإعادة كتابة سطور الحوار جوّاه (مش سطور التوقيت/الهيدر) باستخدام نفس
// محرك الرقابة المحلي (NazafaCensorCore، معرّف فوق مباشرة في نفس الملف) قبل ما نرجّع الرد
// للمشغّل — فالمشغّل بيقرأ وبيعرض النسخة المتفلترة من الأساس، مهما كانت طريقة رندره الداخلية.
// ==========================================
// 🐞 إصلاح حرج (اكتشفناه أثناء تشخيص اختفاء الترجمة بالكامل على برايم فيديو): كنا بنفحص
// الكلمات العامة (subtitle/caption/...) على الـ URL الكامل بما فيه الـ query string. طلب
// برايم فيديو الحقيقي لموارد المشغّل (playerChromeResources) بيحتوي على باراميتر زي
// "desiredResources=regulatoryOverlayV2,subtitlePresets,reaction,..." — ده مش ملف ترجمة
// خالص (JSON فيه إعدادات تنسيق الترجمة، مش نص WebVTT)، لكن الكلمة "subtitlePresets" جوه
// الـ query كانت بتخلي الفحص العام يمسكه غلط ويعتبره ملف .vtt، فـ censorVttPayload() كانت
// بتشوّه الـ JSON ده (بتتعامل معاه كأنه أسطر WebVTT). النتيجة: برايم فيديو بيستقبل رد تالف
// لموارد أساسية لازمة لتهيئة عرض الترجمة، فبيفشل يعرضها خالص من غير أي خطأ ظاهر. الحل: الفحص
// العام (الكلمات بس، مش الامتداد) بقى بيتفحص على الـ pathname بس (من غير الـ query string)،
// لأن ملفات الترجمة الحقيقية بتدّي اسمها في المسار نفسه، مش في باراميتر جوه طلب API تاني.
const looksLikeSubtitleUrl = (url) => {
    if (/\.(vtt|ttml|dfxp|srt|xml)(\?|$)/i.test(url)) return true;
    let pathOnly = url;
    try {
        pathOnly = new URL(url, location.href).pathname;
    } catch (e) {
        pathOnly = String(url).split(/[?#]/)[0]; // احتياطي لو الـ URL مش صالح لسبب ما
    }
    return /subtitle|caption|sidecar|webvtt|timedtext/i.test(pathOnly);
};

// بيفحص سطر واحد من ملف VTT ويقرر هل هو سطر حوار فعلي (يتفحص/يتفلتر) ولا سطر بنية
// (هيدر/توقيت/معرّف جملة/CSS جوه STYLE) لازم يفضل زي ما هو من غير أي لمس.
function censorVttPayload(vttText, sourceLabel) {
    if (!vttText || typeof vttText !== "string") return vttText;
    if (!nazafaSubtitleCensorEnabled) return vttText; // المستخدم قافل الميزة دي من الـ popup
    try {
        const lines = vttText.split(/\r\n|\n|\r/);
        let inNonTextBlock = false; // جوه بلوك STYLE/REGION/NOTE (مش سطور حوار خالص)
        let changedCount = 0;
        let dialogueLineCount = 0;
        const out = lines.map((line) => {
            const trimmed = line.trim();
            if (trimmed === "") { inNonTextBlock = false; return line; }
            if (/^WEBVTT/i.test(trimmed)) return line;
            if (/^(STYLE|REGION|NOTE)\b/i.test(trimmed)) { inNonTextBlock = true; return line; }
            if (inNonTextBlock) return line;
            if (trimmed.includes("-->")) return line; // سطر توقيت الجملة
            if (/^\d+$/.test(trimmed)) return line;   // معرّف رقمي للجملة
            if (/^[0-9a-fA-F-]{8,}$/.test(trimmed)) return line; // معرّف نصي/uuid للجملة (بعض المنصات)

            dialogueLineCount++;
            const censored = NazafaCensorCore.censorText(line);
            if (censored !== line) changedCount++;
            return censored;
        });
        return out.join("\n");
    } catch (e) {
        console.warn(`⚠️ Nazafa: خطأ أثناء تنقية ملف VTT [${sourceLabel || "?"}]:`, e);
        return vttText;
    }
}

const originalFetch = window.fetch;
if (typeof originalFetch === "function") {
    window.fetch = function (...args) {
        try {
            const url = typeof args[0] === "string" ? args[0] : (args[0] && args[0].url) || "";
            if (nazafaIsDisneySessionCandidateUrl(url)) {
                return originalFetch.apply(this, args).then((response) => {
                    try {
                        response.clone().text().then((text) => {
                            nazafaLogDisneySessionResponse(url, text);
                        }).catch(() => {});
                    } catch (e) {}
                    return response;
                });
            }
            nazafaExtractAmazonLiveEpisodeId(url);
            nazafaExtractAppleTVLiveEpisodeId(url);
            if (looksLikeSubtitleUrl(url)) {
                return originalFetch.apply(this, args).then((response) => {
                    try {
                        return response.clone().text().then((text) => {
                            try { if (typeof window.__nazafaYtCapture === "function") window.__nazafaYtCapture(url, text); } catch (e) {}
                            const censoredText = censorVttPayload(text, "fetch:" + url);
                            return new Response(censoredText, {
                                status: response.status,
                                statusText: response.statusText,
                                headers: response.headers
                            });
                        });
                    } catch (e) {
                        console.warn("⚠️ Nazafa: فشل اعتراض رد fetch لملف ترجمة:", e);
                        return response;
                    }
                });
            }
        } catch (e) {}
        return originalFetch.apply(this, args);
    };
}

// ⚠️ responseText/response على XMLHttpRequest أصلاً getters على الـ prototype (مش خصائص
// عادية)، فمينفعش نكتب فوقهم بعد الطلب. بنستبدل الـ getter نفسه مرة واحدة على مستوى الـ
// prototype (مش لكل instance) عشان يشتغل مهما كان المشغّل بيسجّل مستمعيه (event listeners)
// قبل أو بعد نداء .send() بتاعنا — ده بيضمن إن أي قراءة لاحقة لـ responseText/response
// (من أي كود، في أي وقت) بترجع النسخة المتفلترة، من غير ما نعتمد على ترتيب الأحداث.
const OriginalXHR = window.XMLHttpRequest;
const originalOpen = OriginalXHR.prototype.open;
const originalSend = OriginalXHR.prototype.send;
OriginalXHR.prototype.open = function (method, url, ...rest) {
    try {
        const urlStr = typeof url === "string" ? url : "";
        this.__nazafaIsSubtitle = looksLikeSubtitleUrl(urlStr);
        this.__nazafaIsSession = nazafaIsDisneySessionCandidateUrl(urlStr);
        this.__nazafaUrl = urlStr;
        nazafaExtractAmazonLiveEpisodeId(urlStr);
        nazafaExtractAppleTVLiveEpisodeId(urlStr);
        if (this.__nazafaIsSession) {
            this.addEventListener("load", () => {
                try {
                    nazafaLogDisneySessionResponse(urlStr, this.responseText);
                } catch (e) {}
            });
        }
    } catch (e) {}
    return originalOpen.call(this, method, url, ...rest);
};
OriginalXHR.prototype.send = function (body) {
    return originalSend.call(this, body);
};

if (!window.__nazafaXhrResponsePatched) {
    window.__nazafaXhrResponsePatched = true;
    const nativeResponseTextDesc = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, "responseText");
    const nativeResponseDesc = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, "response");

    const getCensoredFor = function (xhr, rawValue) {
        if (!xhr.__nazafaIsSubtitle) return rawValue;

        if (typeof rawValue === "string") {
            if (xhr.__nazafaCensoredSource !== rawValue) {
                xhr.__nazafaCensoredSource = rawValue;
                try { if (typeof window.__nazafaYtCapture === "function") window.__nazafaYtCapture(xhr.__nazafaUrl, rawValue); } catch (e) {}
                xhr.__nazafaCensoredCache = censorVttPayload(rawValue, "xhr:" + xhr.__nazafaUrl);
            }
            return xhr.__nazafaCensoredCache;
        }

        // 🐞 إصلاح: بلاغ حقيقي من أبل تي في+ — بيجيب ملف الترجمة كـ ArrayBuffer (responseType
        // = "arraybuffer") مش نص مباشر (المشغّل بيفك ترميزه بنفسه بعدين)، فكان بيتصنّف "مش نص"
        // ويتسيب من غير تنقية خالص. الحل: نفكه لنص بـ TextDecoder، ننقّيه بنفس المنطق العادي،
        // ونرجّعه ArrayBuffer تاني (بـ TextEncoder) بنفس النوع اللي المشغّل متوقعه، عشان القراءة
        // اللاحقة (فك الترميز الفعلي) تشتغل عادي على النسخة المنقّاة.
        if (rawValue instanceof ArrayBuffer) {
            if (xhr.__nazafaCensoredSource !== rawValue) {
                xhr.__nazafaCensoredSource = rawValue;
                try {
                    const decoded = new TextDecoder("utf-8").decode(rawValue);
                    const censoredText = censorVttPayload(decoded, "xhr-arraybuffer:" + xhr.__nazafaUrl);
                    xhr.__nazafaCensoredCache = censoredText === decoded
                        ? rawValue
                        : new TextEncoder().encode(censoredText).buffer;
                } catch (e) {
                    console.warn(`⚠️ Nazafa VTT: فشل فك/تنقية ملف ترجمة ArrayBuffer [${xhr.__nazafaUrl}]:`, e);
                    xhr.__nazafaCensoredCache = rawValue;
                }
            }
            return xhr.__nazafaCensoredCache;
        }

        // 🔍 تشخيص: لو النوع لسه مش نص ولا ArrayBuffer (زي Blob مثلاً)، مقدرش أعالجه هنا لأن
        // قراءته async (وده getter لازم يكون متزامن) — بنسجّل النوع بالظبط عشان لو ده هو السبب
        // الفعلي نعرف نتعامل معاه لاحقاً بطريقة مختلفة.
        if (!xhr.__nazafaLoggedNonString) {
            xhr.__nazafaLoggedNonString = true;
            const typeLabel = rawValue && rawValue.constructor ? rawValue.constructor.name : typeof rawValue;
            console.warn(`⚠️ Nazafa VTT: ملف ترجمة [${xhr.__nazafaUrl}] نوعه ${typeLabel} — منقدرش ننقّيه لسه.`);
        }
        return rawValue;
    };

    if (nativeResponseTextDesc && nativeResponseTextDesc.get) {
        Object.defineProperty(XMLHttpRequest.prototype, "responseText", {
            configurable: true,
            enumerable: nativeResponseTextDesc.enumerable,
            get: function () {
                const real = nativeResponseTextDesc.get.call(this);
                try { return getCensoredFor(this, real); } catch (e) { return real; }
            }
        });
    }
    if (nativeResponseDesc && nativeResponseDesc.get) {
        Object.defineProperty(XMLHttpRequest.prototype, "response", {
            configurable: true,
            enumerable: nativeResponseDesc.enumerable,
            get: function () {
                const real = nativeResponseDesc.get.call(this);
                try { return getCensoredFor(this, real); } catch (e) { return real; }
            }
        });
    }
}

// ==========================================
// 🌫️ طبقة نص توضيحي فوق الفيديو المغبّش (Blur Overlay)
// تظهر فوق الفيديو مباشرة وتوضح للمشاهد سبب التغبيش (original_description من الفلتر)
// ==========================================
// 🐞 إصلاح حرج: لما المشغّل يبقى Fullscreen (عن طريق Fullscreen API)، المتصفح بيعرض بس العنصر
// اللي طلب الـ fullscreen (document.fullscreenElement) وكل العناصر اللي جواه — أي عنصر تاني
// (زي الـ overlay بتاعنا اللي كان دايماً بيتحط جوه document.body) بيختفي تماماً من العرض لو
// مش جوّه شجرة العنصر ده، حتى لو position:fixed، لأنه خارج "الـ top layer" بتاع الـ fullscreen
// خالص. بلاغ حقيقي: التغبيش الجزئي كان بيختفي تماماً في وضع ملء الشاشة. الحل: بدل ما نحط
// الـ overlay في document.body دايماً، بنحطه جوه document.fullscreenElement لو موجود (وده هو
// نفسه حاوية المشغّل اللي بتتطلب لها fullscreen عادةً، مش الـ <video> نفسه — المنصات الكبيرة
// بتعمل fullscreen لحاوية فيها الفيديو + الكنترولز + الترجمة، مش للفيديو الخام). بنتأكد من
// مكان الـ overlay (ونعيد نقله لو اتغيّر) في كل فريم عشان نتعامل مع الدخول/الخروج من ملء
// الشاشة في أي وقت من غير ما نحتاج نسجّل مستمع "fullscreenchange" منفصل.
function nazafaGetOverlayMountPoint(video) {
    const fsEl = document.fullscreenElement;
    // لو الـ fullscreenElement هو الـ <video> نفسه (نادر، بعض المشغلات البسيطة)، مفيش طريقة
    // موثوقة نحط overlay جواه (عناصر <video> مبترندرش أي DOM children عادية غير track/source)
    // فبنرجع لـ document.body كحل احتياطي (هيختفي وقت الـ fullscreen، بس أهو أفضل من كراش)
    if (fsEl && fsEl !== video) return fsEl;
    return document.body;
}

let blurOverlayEl = null;
let blurOverlayRepositionId = null;

function ensureBlurOverlay(mountPoint) {
    if (blurOverlayEl && blurOverlayEl.parentElement === mountPoint) return blurOverlayEl;
    if (blurOverlayEl) blurOverlayEl.remove(); // كان متحط في مكان قديم (قبل/بعد تبديل fullscreen)، نشيله ونعيد إنشاءه
    blurOverlayEl = document.createElement("div");
    blurOverlayEl.id = "nazafa-blur-overlay";
    blurOverlayEl.style.cssText = `
        position: fixed;
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 16px;
        background: rgba(15, 23, 42, 0.55);
        color: #fff;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        font-size: 15px;
        font-weight: 600;
        line-height: 1.6;
        z-index: 2147483647;
        pointer-events: none;
        direction: rtl;
        box-sizing: border-box;
    `;
    mountPoint.appendChild(blurOverlayEl);
    return blurOverlayEl;
}

function positionBlurOverlay(video) {
    if (!blurOverlayEl) return;
    const rect = video.getBoundingClientRect();
    blurOverlayEl.style.top = `${rect.top}px`;
    blurOverlayEl.style.left = `${rect.left}px`;
    blurOverlayEl.style.width = `${rect.width}px`;
    blurOverlayEl.style.height = `${rect.height}px`;
}

function showBlurOverlay(video, description) {
    const overlay = ensureBlurOverlay(nazafaGetOverlayMountPoint(video));
    overlay.textContent = description || "محتوى غير مناسب";
    positionBlurOverlay(video);

    // إعادة حساب الموضع باستمرار (تعامل مع تغيير حجم النافذة/تبديل ملء الشاشة)، وكمان بنتأكد
    // من مكان الـ overlay نفسه كل فريم عشان نلحق أي دخول/خروج من fullscreen فوراً
    if (blurOverlayRepositionId) cancelAnimationFrame(blurOverlayRepositionId);
    const loop = () => {
        if (!blurOverlayEl) return;
        const desc = blurOverlayEl.textContent;
        ensureBlurOverlay(nazafaGetOverlayMountPoint(video));
        blurOverlayEl.textContent = desc;
        positionBlurOverlay(video);
        blurOverlayRepositionId = requestAnimationFrame(loop);
    };
    blurOverlayRepositionId = requestAnimationFrame(loop);
}

function hideBlurOverlay() {
    if (blurOverlayRepositionId) {
        cancelAnimationFrame(blurOverlayRepositionId);
        blurOverlayRepositionId = null;
    }
    if (blurOverlayEl) {
        blurOverlayEl.remove();
        blurOverlayEl = null;
    }
}

// ==========================================
// 🆕 🌫️ تغبيش جزئي (Partial Blur) — بيغبش صندوق صغير بس من الفيديو (زي سيجارة في إيد حد) بدل
// ما يغبش الشاشة كلها. الحيلة: video.style.filter="blur()" بيأثر على العنصر كله، فمينفعش
// نستخدمه لجزء بس. الحل: div شفاف موضوع بالظبط فوق مكان الصندوق بـ backdrop-filter: blur() —
// ده بيغبش أي حاجة *ورا* الـ div (يعني جزء الفيديو تحته بالظبط) من غير ما يلمس باقي الفيديو.
// الإحداثيات (region.x/y/width/height) نسبية من 0 لـ 1 بالنسبة لأبعاد عنصر الفيديو المعروض
// فعلياً (getBoundingClientRect())، مش دقة الفيديو الأصلية — فتفضل صح مهما اتغيّر حجم النافذة.
// ==========================================
let partialBlurEl = null;
let partialBlurRepositionId = null;
let partialBlurRegion = null;

// 🐞 إصلاح حرج #1 (اختفاء كامل في fullscreen): نفس مشكلة nazafaGetOverlayMountPoint فوق
// بالظبط — كان بيتحط جوه document.body دايماً، فبيختفي تماماً وقت ملء الشاشة لأنه بره شجرة
// document.fullscreenElement. الحل: نحطه جوه fullscreenElement لو موجود، ونتأكد من مكانه كل
// فريم زي ما بنعمل مع overlay التغبيش الكامل بالظبط.
//
// 🐞 إصلاح حرج #2 (بيغطي الترجمة أحياناً): z-index كان 2147483646 (قريب من أقصى قيمة ممكنة)،
// يعني كان بيترسم فوق أي حاجة تانية في الصفحة تقريباً، بما فيها طبقة الترجمة النصية الأصلية
// بتاعة المنصة نفسها (اللي بتستخدم عادةً z-index أقل بكتير، في حدود عشرات لحد مئات). لو
// إحداثيات صندوق التغبيش الجزئي حصل تطابق بصري مع مكان الترجمة على الشاشة (حتى لو مش مقصود،
// زي سطر ترجمة بطولين بدل سطر واحد)، كان بيغطّيها تماماً. الحل: نزّلنا الـ z-index لقيمة
// معتدلة (50) — لسه فوق الفيديو الخام (z-index: auto) وفوق خلفية المشغّل، بس تحت أي طبقة
// ترجمة حقيقية بتستخدم z-index واضح زي العادة، فالترجمة هتفضل ظاهرة فوق التغبيش الجزئي حتى
// لو حصل تداخل بصري في المكان.
function ensurePartialBlurOverlay(mountPoint) {
    if (partialBlurEl && partialBlurEl.parentElement === mountPoint) return partialBlurEl;
    if (partialBlurEl) partialBlurEl.remove();
    partialBlurEl = document.createElement("div");
    partialBlurEl.id = "nazafa-partial-blur-overlay";
    partialBlurEl.style.cssText = `
        position: fixed;
        backdrop-filter: blur(22px);
        -webkit-backdrop-filter: blur(22px);
        background: rgba(255, 255, 255, 0.02);
        z-index: 50;
        pointer-events: none;
        box-sizing: border-box;
        border-radius: 6px;
    `;
    mountPoint.appendChild(partialBlurEl);
    return partialBlurEl;
}

// 🐞 إصلاح حرج #2 (تكملة): رفع/تخفيض z-index وحده ثبت إنه مش كافي عملياً — طبقة الترجمة بتاعة
// بعض المنصات (نتفليكس مثلاً) بتتكون جوه سياق تكديس (stacking context) خاص بيها منفصل عن
// العنصر بتاعنا، فمقارنة z-index العام مبتضمنش ترتيب الرسم الفعلي بينهم بالضرورة. الحل الأضمن:
// بدل ما نحاول نكسب "حرب" الـ z-index، بنلاقي حاوية الترجمة الفعلية على الشاشة (بنفس قائمة
// السيليكتورز المستخدمة أصلاً في subtitles.script.js) ونقتص (clip) حافة صندوق التغبيش الجزئي
// السفلية تلقائياً لو هتتداخل بصرياً مع مكانها — فمهما كانت إحداثيات الصندوق، صندوق التغبيش
// مبيوصلش فعلياً لمكان الترجمة على الشاشة أصلاً، بدل ما نعتمد على ترتيب رسم غير مضمون.
const NAZAFA_SUBTITLE_CONTAINER_SELECTORS = [
    ".player-timedtext", ".ytp-caption-window-container", ".atvwebplayersdk-captions-text",
    ".shaka-text-container", ".vjs-text-track-display", ".bmpui-subtitle-label",
    ".jw-captions", ".plyr__captions", ".vp-captions",
    // 🎯 ديزني+: اتلقطت بفحص مباشر (مش تخمين) — مشغّل disney-web-player (HiVE-DMP) بيرندر
    // الترجمة جوه Shadow DOM مفتوح، فمحتاجين نفحص جواه كمان (راجع nazafaQueryAllDeep تحت).
    // ⚠️ استخدمنا ".hive-subtitle-renderer-cue" (حجم النص الفعلي المعروض بالظبط) مش
    // ".hive-subtitle-renderer-cue-positioning-box" (الحاوية الاحتياطية بعرض الفيديو كله تقريباً
    // حتى لو النص نفسه أضيق بكتير) — استخدام الصندوق الواسع كان بيخلي أي تغبيش جزئي في الثلث
    // السفلي من الفيديو يتقص/يختفي كل ما في سطر ترجمة، حتى لو مفيش تداخل بصري حقيقي مع النص.
    ".hive-subtitle-renderer-cue",
    "[class*='timedtext']", "[class*='caption']", "[class*='subtitle']"
].join(", ");

// 🐞 إصلاح حرج (تكملة #2): document.querySelectorAll() العادي مابيدخلش جوه أي Shadow DOM خالص،
// حتى لو مفتوح (open) — وده بالظبط سبب فشل findActiveSubtitleRect() مع ديزني+: عنصر الترجمة
// بتاعه (.hive-subtitle-renderer-cue-positioning-box) موجود جوه shadow root مفتوح تابع لعنصر
// disney-web-player المخصّص، فمستحيل نلقطه بفحص عادي للصفحة. الحل: دالة بحث بتنزل جوه أي
// shadowRoot مفتوح بشكل متكرر (نفس الأسلوب اللي اتأكد إنه بيشتغل فعلياً وقت التشخيص المباشر).
function nazafaQueryAllDeep(selector, root) {
    const results = [];
    function walk(node) {
        if (!node || !node.querySelectorAll) return;
        results.push(...node.querySelectorAll(selector));
        node.querySelectorAll("*").forEach((el) => {
            if (el.shadowRoot) walk(el.shadowRoot);
        });
    }
    walk(root || document);
    return results;
}

function findActiveSubtitleRect() {
    try {
        const candidates = nazafaQueryAllDeep(NAZAFA_SUBTITLE_CONTAINER_SELECTORS);
        // 🐞 إصلاح حرج (تكملة #3): السلكتورات العامة زي [class*='subtitle'] بتطابق أي
        // container كبير اسم كلاسه فيه "subtitle" (زي hive-subtitle-renderer-cue-positioning-box)
        // حتى بعد ما شلنا اسمه بالتحديد — لأن الـ wildcard لسه بيمسكه، وبما إن textContent
        // بيتوارث من العناصر الداخلية، الـ container الواسع ده كان بيعدي فلتر "فيه نص" وبيرجع
        // كأول نتيجة (بعرض الفيديو كله تقريباً)، فالـ clipping كان بيشيل التغبيش بالكامل.
        // الحل: نجمع كل المرشحين الصالحين ونختار أضيق واحد (أصغر مساحة) لأن عنصر النص الحقيقي
        // دايماً أصغر بكتير من أي حاوية/صندوق تحيط بيه.
        let best = null;
        let bestArea = Infinity;
        for (const el of candidates) {
            if (el.id === "nazafa-partial-blur-overlay" || el.id === "nazafa-blur-overlay") continue;
            const rect = el.getBoundingClientRect();
            // تجاهل أي عنصر فاضي بصرياً (مخفي/بلا حجم) أو من غير نص فعلاً ظاهر دلوقتي
            if (rect.width <= 0 || rect.height <= 0) continue;
            if (!el.textContent || !el.textContent.trim()) continue;
            const area = rect.width * rect.height;
            if (area < bestArea) {
                bestArea = area;
                best = rect;
            }
        }
        return best;
    } catch (e) { /* تجاهل */ }
    return null;
}

function positionPartialBlur(video, region) {
    if (!partialBlurEl || !region) return;
    const rect = video.getBoundingClientRect();
    let top = rect.top + region.y * rect.height;
    let left = rect.left + region.x * rect.width;
    let width = region.width * rect.width;
    let height = region.height * rect.height;

    const subRect = findActiveSubtitleRect();
    if (subRect) {
        const SAFETY_MARGIN_PX = 4; // هامش أمان بسيط عشان منلزقش في حافة الترجمة بالظبط
        const overlapsHorizontally = left < subRect.right && (left + width) > subRect.left;
        const subtitleTop = subRect.top - SAFETY_MARGIN_PX;
        const wouldClip = overlapsHorizontally && (top + height) > subtitleTop && top < subRect.bottom;
        if (wouldClip) {
            // نقتص الصندوق عشان يقف قبل حافة الترجمة العلوية بس، من غير ما نلمس باقي الصندوق
            height = Math.max(0, subtitleTop - top);
        }
    }

    if (height <= 0) {
        partialBlurEl.style.display = "none";
        return;
    }
    partialBlurEl.style.display = "";
    partialBlurEl.style.top = `${top}px`;
    partialBlurEl.style.left = `${left}px`;
    partialBlurEl.style.width = `${width}px`;
    partialBlurEl.style.height = `${height}px`;
}

function showPartialBlur(video, region) {
    if (!region) return;
    partialBlurRegion = region;
    ensurePartialBlurOverlay(nazafaGetOverlayMountPoint(video));
    positionPartialBlur(video, region);

    if (partialBlurRepositionId) cancelAnimationFrame(partialBlurRepositionId);
    const loop = () => {
        if (!partialBlurEl) return;
        ensurePartialBlurOverlay(nazafaGetOverlayMountPoint(video)); // يلحق دخول/خروج fullscreen فوراً
        positionPartialBlur(video, partialBlurRegion);
        partialBlurRepositionId = requestAnimationFrame(loop);
    };
    partialBlurRepositionId = requestAnimationFrame(loop);
}

function hidePartialBlur() {
    if (partialBlurRepositionId) {
        cancelAnimationFrame(partialBlurRepositionId);
        partialBlurRepositionId = null;
    }
    if (partialBlurEl) {
        partialBlurEl.remove();
        partialBlurEl = null;
    }
    partialBlurRegion = null;
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
    // لو كل الفيديوهات الظاهرة مدتها قصيرة ومعروفة، الأرجح إنه إعلان — نرجع null بدل ما نمسك الإعلان بالغلط.
    return realVideos.length > 0 ? realVideos.sort((a, b) => b.currentTime - a.currentTime)[0] : null;
}

// ==========================================
// 🔊 نتفليكس بالذات عندها مشكلة معروفة: مشغّلها الداخلي (Cadmium) بيراقب ويعيد ضبط حالة
// الصوت (volume/muted) بتاعت الـ <video> بنفسه باستمرار حسب حالة واجهته الخاصة، فلو غيّرنا
// video.muted مباشرة من برّه، نتفليكس ممكن "يرجّعها" تاني خلال أجزاء من الثانية من غير ما
// نلاحظ — وده بالظبط سبب إن "Match Found" يظهر في الكونسول لكن الصوت فعلياً مايتكتمش. الحل:
// نستخدم نفس الـ API الداخلي بتاع نتفليكس المستخدم أصلاً في أمر "skip" (تخطي المشهد) عشان
// نتحكم في الصوت (volume) من جوه نظام نتفليكس نفسه، مش بس من برّه، فمفيش حاجة ترجعه.
// ==========================================
function getNetflixActivePlayer() {
    try {
        const playerAPI = netflix.appContext.state.playerApp.getAPI().videoPlayer;
        const playerSessionIds = playerAPI.getAllPlayerSessionIds ? playerAPI.getAllPlayerSessionIds() : [];
        if (!playerSessionIds.length) return null;
        const activePlayerId = playerSessionIds.find(id => id.includes("watch")) || playerSessionIds[0];
        return playerAPI.getVideoPlayerBySessionId(activePlayerId);
    } catch (err) { return null; }
}

let nazafaNetflixPrevVolume = null;

function setNetflixMuted(muted) {
    try {
        const targetPlayer = getNetflixActivePlayer();
        if (!targetPlayer) return false;
        if (muted) {
            if (typeof targetPlayer.getVolume === "function") {
                const currentVolume = targetPlayer.getVolume();
                if (currentVolume > 0) nazafaNetflixPrevVolume = currentVolume;
            }
            if (typeof targetPlayer.setMuted === "function") targetPlayer.setMuted(true);
            if (typeof targetPlayer.setVolume === "function") targetPlayer.setVolume(0);
        } else {
            if (typeof targetPlayer.setMuted === "function") targetPlayer.setMuted(false);
            if (typeof targetPlayer.setVolume === "function") {
                targetPlayer.setVolume(nazafaNetflixPrevVolume > 0 ? nazafaNetflixPrevVolume : 100);
            }
        }
        return true;
    } catch (err) { console.warn("⚠️ Netflix Volume API failed."); return false; }
}

// 🐞 إصلاح: بلاغ حقيقي وموثّق من أبل تي في+ — بعد ما بنفتح الصوت (video.muted = false)، الفحص
// المباشر بتاع video.muted/video.volume بيرجع "false"/"1" (يعني بالنسبة لعنصر الفيديو نفسه
// الصوت مش مكتوم ومستواه كامل)، لكن المستخدم فعلياً مش سامع صوت لحد ما يدوس هو بنفسه على زرار
// الكتم بتاع أبل تي في. ده معناه إن مسار الصوت الفعلي عند أبل تي في+ منفصل تماماً عن خاصية
// video.muted/video.volume الأصلية (على الأغلب Web Audio API AudioContext بيتحكم في الصوت
// الحقيقي، ومتطلبات المتصفح الأمنية إن الـ AudioContext ميتفكش (resume) إلا بلمسة/ضغطة مستخدم
// حقيقية (trusted user gesture) — تغيير خاصية عنصر الفيديو من كود الإضافة (JS) مش بيعتبر لمسة
// مستخدم حقيقية خالص، فمينفعش يفك تعليق الـ AudioContext حتى لو الخاصية اتغيّرت صح). كمحاولة
// بديلة (تجربة، مش حل مضمون 100% لو السبب فعلاً AudioContext)، بنستخدم video.volume بدل
// video.muted تحديداً لأبل تي في+ — احتمال إن تغيير الـ muted property بالذات هو اللي بيدخل
// المشغّل في وضع داخلي يحتاج لمسة حقيقية، بينما تغيير volume بس ممكن يتفادى المشكلة دي.
function nazafaIsSilenced(video, platform) {
    return platform === "appletv" ? video.volume === 0 : video.muted;
}
function nazafaSilence(video, platform) {
    if (platform === "appletv") {
        if (video.dataset.nazafaPrevVolume === undefined) {
            video.dataset.nazafaPrevVolume = String(video.volume);
        }
        video.volume = 0;
    } else {
        video.muted = true;
    }
}
function nazafaUnsilence(video, platform) {
    if (platform === "appletv") {
        const prev = parseFloat(video.dataset.nazafaPrevVolume);
        video.volume = (isFinite(prev) && prev > 0) ? prev : 1;
        delete video.dataset.nazafaPrevVolume;
    } else {
        video.muted = false;
    }
}

window.addEventListener("message", (event) => {
    if (!event.data || event.data.type !== "NAZAFA_EXECUTE_ACTION") return;

    const { action, targetTime, disneyDelta, platform, description } = event.data;
    const video = getActiveVideoElement();
    if (!video) return;

    if (action === "skip") {
        let seekSuccessful = false;
        // 🐞 ديزني+: video.currentTime عداد نسبي (relative) بيتصفّر مع أي seek/استئناف على مشغّل
        // HiVE DMP، مش موضع مطلق زي باقي المنصات — فبنضيف الدلتا (disneyDelta) المحسوبة في
        // isolated.script.js على القيمة الحالية بدل ما نستبدلها بـ targetTime المطلق (راجع
        // التعليق الطويل هناك للسياق الكامل)
        if (platform === "disney" && typeof disneyDelta === "number" && isFinite(disneyDelta) && disneyDelta > 0) {
            const beforeCt = video.currentTime;
            const target = beforeCt + disneyDelta;
            seekSuccessful = true;
            // قفزة video.currentTime الواحدة بتترفض جزئيًا لو المسافة أكبر من حد أقصى صارم
            // (حوالي 12 ثانية، على الأرجح قيد DRM/seekRange)، فبنمشي بخطوات قريبة من الحد ده
            // (11 ثانية) عشان نقلل عدد الخطوات المطلوبة لأي مسافة، ونستخدم فاصل قصير بين
            // المحاولات (150ms) وعدد محاولات كبير (25) عشان نضمن وصول كامل حتى لو بعض الخطوات
            // احتاجت أكتر من محاولة — الهدف نخلّص أسرع ما يمكن (أجزاء من الثانية غالبًا، مش
            // ثواني). الفيديو بيفضل واقف طول فترة الخطوات القصيرة دي عشان ميبانش مقطّع بصريًا،
            // وبيرجع يشتغل بس لما نوصل فعليًا للمستهدف الكامل
            const runStepped = () => {
            const wasPlaying = !video.paused;
            video.pause();
            // 🐞 الفيديو كان بيعرض لقطات من المشاهد اللي بين البداية والنهاية على فترات (كل خطوة
            // seek وسيطة بترسم فريم قبل ما الخطوة اللي بعدها تتنفذ). الحل: نخفي عنصر الفيديو بصرياً
            // (opacity 0 → خلفية المشغّل السودا بتظهر) طول الخطوات الوسيطة، ونرجّعه بس لما نوصل
            // للهدف النهائي (أو بعد حد أقصى أمان) — فالمستخدم يشوف قطع مباشر من غير لقطات في النص.
            const prevOpacity = video.style.getPropertyValue("opacity");
            const prevOpacityPriority = video.style.getPropertyPriority("opacity");
            let revealed = false;
            let revealVideo = () => {
                if (revealed) return;
                revealed = true;
                // نستنى لحظة صغيرة عشان أول فريم عند الهدف يترسم قبل ما نظهر الفيديو
                setTimeout(() => {
                    if (prevOpacity) video.style.setProperty("opacity", prevOpacity, prevOpacityPriority);
                    else video.style.removeProperty("opacity");
                }, 80);
            };
            video.style.setProperty("opacity", "0", "important");
            // 🔇 كتم الصوت طول التخطي (الفيديو واقف بس بعض المشغّلات بتطلّع صوت أثناء الخطوات)، ونفتحه
            // مع إظهار الفيديو — بس لو المستخدم نفسه مكانش كاتمه قبل كده
            const disneyWasSilenced = nazafaIsSilenced(video, platform);
            if (!disneyWasSilenced) {
                isSystemMute = true;
                nazafaMuteOwner = true;
                nazafaSilence(video, platform);
                setTimeout(() => { isSystemMute = false; }, 300);
            }
            const origRevealVideo = revealVideo;
            revealVideo = () => {
                origRevealVideo();
                if (!disneyWasSilenced) {
                    setTimeout(() => {
                        isSystemMute = true;
                        nazafaUnsilence(getActiveVideoElement() || video, platform);
                        nazafaMuteOwner = false;
                        setTimeout(() => { isSystemMute = false; }, 50);
                    }, 150);
                }
            };
            setTimeout(() => revealVideo(), 9000); // أمان: مهما حصل منسيبش الفيديو مخفي
            const MAX_SAFE_SEEK_STEP = 11;
            const attemptSeek = (attemptNum, maxAttempts) => {
                const currentCt = video.currentTime;
                const remaining = target - currentCt;
                if (remaining <= 1) {
                    if (wasPlaying) video.play().catch(() => {});
                    revealVideo();
                    return;
                }
                const step = Math.min(remaining, MAX_SAFE_SEEK_STEP);
                video.currentTime = currentCt + step;
                if (attemptNum < maxAttempts) {
                    setTimeout(() => attemptSeek(attemptNum + 1, maxAttempts), 60);
                } else {
                    if (wasPlaying) video.play().catch(() => {});
                    revealVideo();
                }
            };
            attemptSeek(1, 60);
            }; // نهاية runStepped (الطريقة الاحتياطية البطيئة)

            // ⚡ الطريقة الأساسية (لحظية): مشغّل ديزني نفسه بيكشف mediaPlayer.seek (اتأكد بالتشخيص
            // الفعلي) — بننقل للموضع المطلق مباشرة بخطوة واحدة (زي سحب شريط التقدم يدوياً)، من غير
            // الخطوات الصغيرة 11 ثانية. الموضع المطلق بنقراه من stateStore (playheadPositionMs).
            // بنتحقق إن الوصول حصل فعلاً، ولو لأ (الوحدة/الشكل مختلف عن المتوقع) بنرجّع المستخدم لمكانه
            // لو حصلت قفزة غريبة، وبنكمّل بالطريقة القديمة.
            const dPlayer = document.querySelector("disney-web-player");
            const getDisneyPosMs = () => {
                try {
                    const ms = dPlayer.stateStore.getState().player.core.timeline.timeline.playheadPositionMs;
                    return (typeof ms === "number" && isFinite(ms)) ? ms : null;
                } catch (e) { return null; }
            };
            const startMs = getDisneyPosMs();
            if (dPlayer && dPlayer.mediaPlayer && typeof dPlayer.mediaPlayer.seek === "function" && startMs !== null) {
                const targetMs = startMs + disneyDelta * 1000;
                let seekCalled = true;
                try { dPlayer.mediaPlayer.seek(targetMs); } catch (e) { seekCalled = false; }
                if (!seekCalled) {
                    runStepped();
                } else {
                    let tries = 0;
                    const poll = setInterval(() => {
                        tries++;
                        const pos = getDisneyPosMs();
                        if (pos !== null && Math.abs(pos - targetMs) < 4000) { clearInterval(poll); return; }
                        if (tries >= 15) {
                            clearInterval(poll);
                            const p = getDisneyPosMs();
                            if (p !== null && Math.abs(p - startMs) > 20000 && Math.abs(p - targetMs) >= 4000) {
                                try { dPlayer.mediaPlayer.seek(startMs); } catch (e) {} // رجّع المستخدم لمكانه بعد قفزة غريبة
                            }
                            console.warn("⚠️ Nazafa Disney: seek اللحظي مانفعش، رجوع للخطوات القديمة");
                            runStepped();
                        }
                    }, 100);
                }
            } else {
                runStepped();
            }
        }
        if (!seekSuccessful && platform === "netflix") {
            try {
                const targetTimeMs = targetTime * 1000;
                const playerAPI = netflix.appContext.state.playerApp.getAPI().videoPlayer;
                const playerSessionIds = playerAPI.getAllPlayerSessionIds ? playerAPI.getAllPlayerSessionIds() : [];
                if (playerSessionIds.length > 0) {
                    const activePlayerId = playerSessionIds.find(id => id.includes("watch")) || playerSessionIds[0];
                    const targetPlayer = playerAPI.getVideoPlayerBySessionId(activePlayerId);
                    if (targetPlayer && typeof targetPlayer.seek === "function") {
                        targetPlayer.seek(targetTimeMs);
                        seekSuccessful = true;
                    }
                }
            } catch (err) { console.warn("⚠️ Netflix API failed."); }
        }

        if (!seekSuccessful) {
            video.currentTime = targetTime;
            seekSuccessful = true;
        }

        if (seekSuccessful && !nazafaIsSilenced(video, platform)) {
            isSystemMute = true; // نبلغ النظام أننا نحن من نكتم
            nazafaMuteOwner = true;
            nazafaSilence(video, platform);
            if (platform === "netflix") setNetflixMuted(true);

            // 🐞 إصلاح: بلاغ من أبل تي في+ إن الصوت بيفضل مكتوم تماماً بعد التخطي لحد ما
            // المستخدم يفتحه يدوي بنفسه (مش بيرجع تلقائي بعد الـ600ms المتوقعة). احتمالين:
            // (أ) بعض المشغلات بتستبدل/تعيد إنشاء عنصر <video> بعد الـ seek، فالمرجع "video"
            // اللي اتقفل عليه هنا (closure) يبقى قديم/منفصل عن الشاشة الفعلية وقت الـ unmute،
            // فبنعيد الاستعلام عن العنصر النشط الحالي وقت التنفيذ الفعلي بدل الاعتماد على
            // المرجع القديم. (ب) بعض المشغلات (زي نتفليكس Cadmium الموثّق فوق) بتراقب حالة
            // الصوت وترجّعها لوضعها الداخلي الخاص لو حسّت إن الكتم اتعمل من كود خارجي — فبنتأكد
            // كمان بعد فترة قصيرة إضافية إن الصوت فعلاً رجع، ولو المشغّل رجّعه كتم تاني نجبره
            // يترجع مرة كمان (محاولة تحصين إضافية، مش حل جذري لأي API داخلي غير معروف لينا).
            const attemptUnmute = (label) => {
                isSystemMute = false; // نعيد السماح للمستخدم بالتحكم
                const currentVideo = getActiveVideoElement() || video;
                // 🎯 إحنا اللي كتمنا الصوت هنا (nazafaMuteOwner)، فمن حقنا نفتحه تاني بلا شرط —
                // من غير ما نتأثر بـ dataset.userMuted، اللي ممكن يكون اتسجّل غلط لو المشغّل
                // نفسه غيّر حالة الصوت من عنده (شوف تعليق nazafaMuteOwner في أول الملف)
                if (nazafaIsSilenced(currentVideo, platform) && nazafaMuteOwner) {
                    isSystemMute = true;
                    nazafaUnsilence(currentVideo, platform);
                    if (platform === "netflix") setNetflixMuted(false);
                    setTimeout(() => { isSystemMute = false; }, 50);
                    return currentVideo;
                }
                return null;
            };

            setTimeout(() => {
                attemptUnmute("محاولة أولى (600ms)");
                // تحقّق إضافي بعد شوية عشان نلحق أي رجوع للكتم من المشغّل نفسه بعد أول محاولة
                setTimeout(() => {
                    const v = getActiveVideoElement() || video;
                    if (nazafaIsSilenced(v, platform) && nazafaMuteOwner) {
                        console.warn(`⚠️ Nazafa: الصوت لسه مكتوم بعد التخطي رغم محاولة إعادة الفتح [platform=${platform}] — المشغّل بيرجّعه كتم بنفسه على الأغلب.`);
                        isSystemMute = true;
                        nazafaUnsilence(v, platform);
                        setTimeout(() => { isSystemMute = false; nazafaMuteOwner = false; }, 50);
                    } else {
                        nazafaMuteOwner = false;
                    }
                }, 500);
            }, 600);
        }
    }
    else if (action === "mute") {
        isSystemMute = true;
        nazafaMuteOwner = true; // إحنا اللي كتمنا — أي unmute بتاعنا بعد كده مينفعش يتحجب غلط
        nazafaSilence(video, platform);
        if (platform === "netflix" || (!platform && typeof netflix !== "undefined")) setNetflixMuted(true);
        setTimeout(() => { isSystemMute = false; }, 300);
    }
    else if (action === "unmute") {
        // 🎯 لو إحنا اللي كتمنا أصلاً (nazafaMuteOwner)، نفتح الصوت بلا شرط — من غير ما نعتمد
        // على dataset.userMuted اللي ممكن يكون اتسجّل غلط بسبب سلوك المشغّل الداخلي (شوف تعليق
        // nazafaMuteOwner في أول الملف). لو إحنا مش اللي كتمنا (يعني مفيش فلتر شغال أصلاً)،
        // نفضل نحترم dataset.userMuted زي الأول (مايكونش فيه داعي نلمس كتم حقيقي من المستخدم).
        if (nazafaMuteOwner || video.dataset.userMuted !== "true") {
            isSystemMute = true;
            nazafaUnsilence(video, platform);
            if (platform === "netflix" || (!platform && typeof netflix !== "undefined")) setNetflixMuted(false);
            nazafaMuteOwner = false;
            setTimeout(() => { isSystemMute = false; }, 50);
        }
    }
    else if (action === "blur") {
        video.style.filter = "blur(40px)";
        showBlurOverlay(video, description);
    }
    else if (action === "partial_blur") {
        showPartialBlur(video, event.data.region);
    }
    else if (action === "unblur") {
        video.style.filter = "";
        hideBlurOverlay();
        hidePartialBlur(); // نقفل أي تغبيش جزئي شغال كمان — نفس أمر الإلغاء العام المستخدم للتغبيش الكامل
    }
});

// تتبع تدخل المستخدم (تم تعديله ليحترم الـ isSystemMute)
document.addEventListener('volumechange', (e) => {
    if (e.target.tagName === 'VIDEO') {
        if (isSystemMute) return; // تجاهل التغيير إذا كان من الإضافة
        e.target.dataset.userMuted = e.target.muted ? "true" : "false";
    }
}, true);

// ==========================================================================
// 🎬 يوتيوب فقط: كتم تلقائي من ملف الترجمة نفسه (timedtext) — بيشتغل حتى لو زرار CC مقفول
// بنجيب ملف الترجمة (يفضّل التلقائية asr لأنها بتطابق الكلام المنطوق) بـ originalFetch (النسخة
// الأصلية، عشان اعتراضنا الشبكي فوق ما يشوّه الرد)، ونحسب نوافذ كتم بتوقيت كل كلمة
// (tStartMs + tOffsetMs)، وبنكتم الفيديو لما currentTime يدخل أي نافذة. الأنماط:
//  1) علامة يوتيوب نفسه "[ __ ]" / "[_]"   2) القائمة السوداء (NazafaCensorCore)
//  3) شتائم "الوسخه" (يوتيوب بس)
// لو الجلب فشل أو رجع فاضي (يوتيوب أحياناً بيطلب توكن pot) → بنبلّغ إن الوضع ده مش شغال،
// وبيفضل المسار القديم (مراقبة الترجمة المعروضة في subtitles.script.js) هو اللي بيكتم.
// ⚠️ مش بيحترم توجل "اللغة" (MAIN world معندوش userSettings) — بيحترم بس توجل تشفير الترجمة.
// ==========================================================================
(function () {
    if (!/(^|\.)youtube\.com$/i.test(location.hostname)) return;

    const BLEEP_RE = /\[\s*_+\s*\]/;
    const EXTRA_RE = /(^|\s)((ابن|بن|ولاد|اولاد|ولد|بنت|بنات|ابو)\s+)?الوسخه(\s|$)|(^|\s)(ابن|بن|ولاد|اولاد|ولد|بنت|بنات|ابو)\s+الوسخ(\s|$)/;
    // 🆕 "فشخ" وصيغها (فشخت/يفشخ/فشخه/فشخها...) — يوتيوب بس (نفس بكت youtubeExtra في subtitle-censor-core.js)
    const EXTRA_FASHKH_RE = /(^|\s)(?:[وفبلك])?(?:ي|ت|ن|ا)?فشخ(?:ت|ه|ها|هم|ني|ك|نا|وا|ون)?(?=\s|$)/;
    const PAD_BEFORE_MS = 80, PAD_AFTER_MS = 30, MIN_WINDOW_MS = 200, MAX_WORD_MS = 700;

    let windows = [];          // [{s,e}] بالمللي ثانية
    let loadedVideoId = null;
    let loadToken = 0;
    let weMuted = false;
    let preMuted = false;

    function post(active) {
        try { window.postMessage({ type: "NAZAFA_YT_TIMED_ACTIVE", active: !!active }, "*"); } catch (e) {}
    }

    function currentVideoId() {
        try {
            const u = new URL(location.href);
            return u.searchParams.get("v") || (u.pathname.match(/\/shorts\/([\w-]+)/) || [])[1] || null;
        } catch (e) { return null; }
    }

    function textMatches(text) {
        if (!text) return false;
        if (BLEEP_RE.test(text)) return true;
        try {
            if (NazafaCensorCore.censorText(text) !== text) return true;
            const n = NazafaCensorCore.normalizeText(text).normalized;
            return EXTRA_RE.test(n) || EXTRA_FASHKH_RE.test(n);
        } catch (e) { return false; }
    }

    function buildWindows(json) {
        const out = [];
        (json.events || []).forEach((ev) => {
            if (!ev.segs || !ev.segs.length) return;
            const base = ev.tStartMs || 0;
            const evEnd = base + (ev.dDurationMs || 0);
            const items = ev.segs.map((sg, i) => {
                const s = base + (sg.tOffsetMs || 0);
                const next = ev.segs[i + 1];
                const e = next ? base + (next.tOffsetMs || 0) : evEnd;
                // 🐞 آخر كلمة في الحدث كان نهايتها = نهاية الحدث كله (ممكن 3+ ثواني بعد ما الكلمة تتقال)،
                // فالكتم كان بيكمل. الكلمة الواحدة بتتقال في أقل من ~0.9 ثانية، فنقصّ النافذة عند كده.
                // نهاية الكلمة التقديرية = ~90ms للحرف (حد أدنى 300، أقصى MAX_WORD_MS)، ومش أكتر من بداية الكلمة اللي بعدها
                const txt = String(sg.utf8 || "");
                const estEnd = s + Math.min(MAX_WORD_MS, Math.max(200, txt.trim().length * 80));
                return { s, e: Math.min(e > s ? e : estEnd, estEnd), t: txt };
            });
            items.forEach((it, i) => {
                let hit = textMatches(it.t.trim());
                let from = it.s;
                if (!hit && i > 0 && textMatches((items[i - 1].t + " " + it.t).trim())) { hit = true; from = items[i - 1].s; }
                if (hit) out.push({ s: from - PAD_BEFORE_MS, e: it.e + PAD_AFTER_MS });
            });
        });
        out.sort((a, b) => a.s - b.s);
        const merged = [];
        out.forEach((w) => {
            if (w.e - w.s < MIN_WINDOW_MS) w.e = w.s + MIN_WINDOW_MS;
            const last = merged[merged.length - 1];
            if (last && w.s <= last.e) last.e = Math.max(last.e, w.e); else merged.push(w);
        });
        return merged;
    }

    function pickTrack(tracks) {
        if (!tracks || !tracks.length) return null;
        return tracks.find((t) => t.kind === "asr") || tracks[0];
    }

    // التقاط رد timedtext الخام (من hook الشبكة فوق) — بيشتغل لما المستخدم يفعّل CC بنفسه، أو
    // لما إحنا نجبر المشغّل يطلبه (forcePlayerFetch) لأن الطلب بتاعه بيحمل توكن pot صالح.
    window.__nazafaYtCapture = function (url, text) {
        try {
            if (!/timedtext/i.test(url) || !text || text.charCodeAt(0) !== 123 /* { */) return;
            const vid = currentVideoId();
            if (vid && url.indexOf("v=" + vid) === -1) return;
            const json = JSON.parse(text);
            if (!json.events) return;
            const w = buildWindows(json);
            // لو ملف تاني اتجاب (لغة/مسار مختلف) ندمجه مع اللي عندنا بدل ما نمسحه
            windows = windows.concat(w).sort((a, b) => a.s - b.s);
            post(true);
            captured = true;
            console.log(`🎬 Nazafa YT: التقطنا ترجمة المشغّل — ${windows.length} نافذة كتم`);
        } catch (e) {}
    };
    let captured = false;

    // لما CC مقفول المشغّل مبيطلبش الترجمة أصلاً: نشغّلها برمجياً، نخفيها بصرياً، نلتقط الرد، ونرجّع
    // الحالة زي ما كانت. ⚠️ ممكن تغيّر لغة الترجمة المفضّلة المحفوظة عند يوتيوب.
    function forcePlayerFetch(player, track, vid, token) {
        try {
            if (!player || !player.loadModule || !player.setOption) return;
            const wasOn = typeof player.isSubtitlesOn === "function" ? player.isSubtitlesOn() : false;
            if (wasOn) return; // CC شغال أصلاً — الـ hook هيلتقط الرد بنفسه
            captured = false;
            const style = document.createElement("style");
            style.textContent = ".ytp-caption-window-container{visibility:hidden!important}";
            document.head.appendChild(style);
            player.loadModule("captions");
            player.setOption("captions", "track", { languageCode: track.languageCode });
            const startedAt = Date.now();
            const waiter = setInterval(() => {
                const done = captured || Date.now() - startedAt > 7000 || token !== loadToken;
                if (!done) return;
                clearInterval(waiter);
                try { player.unloadModule("captions"); } catch (e) {}
                setTimeout(() => style.remove(), 400);
                if (!captured) console.warn("Nazafa YT: ملقيناش رد الترجمة بعد ما شغّلناها برمجياً — الكتم هيعتمد على الترجمة المعروضة بس");
            }, 150);
        } catch (e) {
            console.warn("Nazafa YT: فشل تشغيل الترجمة برمجياً", e);
        }
    }

    async function loadForCurrentVideo() {
        const vid = currentVideoId();
        if (!vid || vid === loadedVideoId) return;
        loadedVideoId = vid;
        windows = [];
        post(false);
        const token = ++loadToken;
        try {
            const player = document.getElementById("movie_player");
            const resp = player && player.getPlayerResponse ? player.getPlayerResponse() : window.ytInitialPlayerResponse;
            // لو الـ player response لسه لحلقة/فيديو قديم، نستنى النداء الجاي
            if (resp && resp.videoDetails && resp.videoDetails.videoId && resp.videoDetails.videoId !== vid) { loadedVideoId = null; return; }
            const tracks = resp && resp.captions && resp.captions.playerCaptionsTracklistRenderer && resp.captions.playerCaptionsTracklistRenderer.captionTracks;
            const track = pickTrack(tracks);
            if (!track || !track.baseUrl) { console.warn("Nazafa YT: مفيش ترجمة متاحة للفيديو ده"); return; }
            const url = track.baseUrl + (track.baseUrl.includes("?") ? "&" : "?") + "fmt=json3";
            const r = await (typeof originalFetch === "function" ? originalFetch : fetch).call(window, url, { credentials: "include" });
            const body = await r.text();
            if (token !== loadToken) return;
            if (!body || !body.trim().startsWith("{")) {
                console.warn("Nazafa YT: الجلب المباشر رجع فاضي (توكن pot) — هنخلي المشغّل نفسه يجيب الترجمة (مخفية) ونلتقطها");
                forcePlayerFetch(player, track, vid, token);
                return;
            }
            windows = buildWindows(JSON.parse(body));
            post(true);
            console.log(`🎬 Nazafa YT: ${windows.length} نافذة كتم من ترجمة (${track.kind || "manual"}/${track.languageCode})`);
        } catch (e) {
            console.warn("Nazafa YT: فشل تحميل الترجمة", e);
        }
    }

    function tick() {
        try {
            const video = document.querySelector("video.html5-main-video") || document.querySelector("video");
            if (!video) return;
            const t = video.currentTime * 1000;
            const inside = nazafaSubtitleCensorEnabled && windows.length && windows.some((w) => t >= w.s && t <= w.e);
            if (inside && !weMuted) {
                preMuted = video.muted;
                if (!preMuted) {
                    isSystemMute = true; nazafaMuteOwner = true;
                    video.muted = true;
                    setTimeout(() => { isSystemMute = false; }, 300);
                    weMuted = true;
                }
            } else if (!inside && weMuted) {
                isSystemMute = true;
                video.muted = false;
                nazafaMuteOwner = false;
                setTimeout(() => { isSystemMute = false; }, 50);
                weMuted = false;
            }
        } catch (e) {}
    }

    setInterval(tick, 30); // فحص كل 30ms عشان الفتح/الكتم يبقى لحظي (80ms كانت بتزوّد تأخير الفتح)
    setInterval(loadForCurrentVideo, 1500);
    window.addEventListener("yt-navigate-finish", () => { loadedVideoId = null; setTimeout(loadForCurrentVideo, 300); });
})();
