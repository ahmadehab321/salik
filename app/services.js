// app/services.js
// منطق العمل (Business Logic) الخاص بالـ popup — منقول شبه حرفي من popup.js القديم،
// بس بشكل دوال نقية (pure-ish) بترجع بيانات بدل ما تلمس الـ DOM مباشرة، عشان
// مكونات Preact تقدر تستخدمها براحتها. السلوك والـ regex ومنطق المطابقة لم يتغيّر إطلاقاً.

// 🔒 كانت هنا FIREBASE_LIBRARY_URL بتتقرأ مباشرة بـ fetch عادي — /library.json كانت قابلة
// للقراءة العامة من أي حد بدون تسجيل دخول ولا اشتراك (جوهر المنتج المدفوع، توقيتات الفلاتر).
// اتقفلت أمنياً، وfetchLibrary() تحت بقت بتاخد البيانات عن طريق Background.js
// (FETCH_LIBRARY_DATA) اللي بيستخدم getLibraryData Cloud Function الموثّقة بدلها.

// 🐞 إصلاح: "stremio" كانت ناقصة من القائمة دي بالكامل — وهي اللي بتتحكم في شكل شرائح
// المنصات (chips) الظاهرة في تاب "المنصات"، وكمان بتتحدد على أساسها الفلترة في platformKeys
// (app/popup-app.js). ده جزء من نفس سبب مشكلة "لا يوجد عمل نشط حالياً" اللي كانت بتظهر مع
// أعمال ستريميو رغم إن الفلترة الفعلية في المحتوى كانت شغالة تمام عن طريق Background.js
export const SUPPORTED_PLATFORMS = ["netflix", "amazon", "osnplus", "yango", "disney", "shahid", "appletv", "watchit", "tod", "youtube", "starzplay", "jawwy", "stctv", "dailymotion", "beinconnect", "stremio"];

// كاش المكتبة الموحدة (نفس سلوك allFetchedContent القديم)
let _libraryCache = {};

export function getUrlForPlatform(item, platform) {
    if (item && item.platforms && item.platforms[platform] && item.platforms[platform].url) {
        return item.platforms[platform].url;
    }
    return null;
}

export async function getCurrentTabInfo() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) return { movieId: null, platform: "unknown" };

    const url = tabs[0].url || "";

    // 🐞 إصلاح: على أمازون برايم (ومحتمل منصات تانية لاحقًا)، رابط التاب نفسه لا يكفي لتحديد
    // الحلقة الفعلية (راجع التعليق الطويل عند amazonLiveEpisodeId في isolated.script.js) — محرك
    // الفلترة الشغال فعليًا جوّه الصفحة عنده معرّف أدق (مكتشف من طلبات الشبكة الحقيقية)، فبنسأله
    // هو الأول قبل ما نرجع لتحليل الرابط يدويًا هنا. لو الصفحة مفيهاش content script شغال أصلاً
    // (تاب مش منصة فيديو، أو الملف لسه مبتحمّلش) الرسالة هتفشل بصمت ونكمل بالطريقة القديمة.
    try {
        const liveInfo = await new Promise((resolve) => {
            chrome.tabs.sendMessage(tabs[0].id, { type: "NAZAFA_GET_CURRENT_ITEM" }, (response) => {
                if (chrome.runtime.lastError || !response) { resolve(null); return; }
                resolve(response);
            });
        });
        if (liveInfo && liveInfo.movieId && liveInfo.platform && liveInfo.platform !== "unknown") {
            return { platform: liveInfo.platform, movieId: liveInfo.movieId };
        }
    } catch (e) {}

    // 🐞 إصلاح جذري: الملف ده (app/services.js) هو النسخة الحقيقية اللي شغالة فعلاً في الـ
    // popup (popup.html بيحمّل app/popup-app.js بس، ومش بيحمّل popup.js القديم إطلاقاً رغم إنه
    // لسه موجود في المشروع) — ونسخة popup.js القديمة كانت هي الوحيدة اللي فيها فحص IMDb الخاص
    // بستريميو، فكل تعديل اتعمل هناك كان بيتنفذ على كود ميت مالوش أي تأثير على الـ popup الحقيقي.
    // نفس الفحص المباشر لكود IMDb (زي tt0293564) لازم يتكرر هنا، وقبل أي حاجة تانية، عشان نفس
    // سبب تفادي التصادم مع hashMatch (بيانات infoHash الخاصة بالتورنت 40 حرف hex في رابط تشغيل
    // ستريميو ممكن تتلقط غلط لو الفحص ده اتأخر لحد النهاية).
    const imdbMatch = url.match(/(tt\d{7,8})/i);
    if (imdbMatch && imdbMatch[1] && url.includes("stremio.com")) {
        return { platform: "stremio", movieId: imdbMatch[1] };
    }

    let pathname = "";
    try { pathname = new URL(url).pathname; } catch (e) {}

    const platformConfigs = {
        "shahid": { regex: /(?:movie|series|id)-(\d+)/ },
        "tod": { regex: /-(\d+)\/?$/ },
        // واتش إت: روابط المسلسلات فيها أكتر من رقم .../series/{seriesId}/{x}/{episodeId}/play —
        // آخر رقم قبل النهاية هو معرّف الحلقة الفعلي (اللي بيتسجل في platforms.watchit.id)، مش أول رقم
        // بعد "series/" (رقم المسلسل العام المشترك بين كل الحلقات). (?:\d+\/)* بتاخد أي أرقام وسطى
        // وتسيب آخر رقم للمجموعة الملتقطة — وده برضه بيشتغل صح للأفلام اللي فيها رقم واحد بس
        "watchit": { regex: /\/(?:movies|series)\/(?:\d+\/)*(\d+)/ },
        "netflix": { regex: /\/(?:title|watch)\/(\d+)/ },
        // 🐞 إصلاح: أمازون برايم فيديو بقت بتستخدم "/detail/{id}" لبعض صفحات الأفلام (زي Shrek)
        // مش "/title/{id}" بس زي الأول — ضفنا "detail" كبديل عشان الـ ID يتلقط صح في الحالتين
        "amazon": { regex: /\/(?:title|detail)\/([a-zA-Z0-9_-]{10,40})|gti=([^&]+)/i },
        // 🐞 إصلاح: ديزني+ غيّر بنية الروابط بالكامل — الدومين القديم apps.disneyplus.com بقى
        // باظ خالص، والدومين الجديد www.disneyplus.com بيستخدم .../play/{uuid} وقت التشغيل
        // الفعلي، و.../browse/entity-{uuid} في صفحة التفاصيل (نفس الـ UUID، بادئة مختلفة) —
        // لازم الاتنين متلقوطين هنا عشان رابط صفحة التفاصيل (اللي المستخدم بينسخه غالباً) يشتغل
        // برضه، مش بس رابط التشغيل. سايبين الصيغة القديمة .../movies/{slug}/{id}/watch كـ fallback احتياطي بس.
        "disney": { regex: /\/play\/([a-f0-9-]{36})|entity-([a-f0-9-]{36})|\/movies\/[^\/]+\/([a-z0-9]+)/i },
        "appletv": { regex: /(umc\.cmc\.[a-z0-9]+)/i },
        "osnplus": { regex: /\/(?:movie|series|episode)\/[^\/]+-(\d+)/ },
        "yango": { regex: /\b([a-f0-9]{24,40})\b/i },
        "youtube": { regex: /(?:[?&]v=|youtu\.be\/|\/shorts\/)([a-zA-Z0-9_-]{6,15})/i },
        "dailymotion": { regex: /(?:dailymotion\.com\/video\/|dai\.ly\/|[?&]video=)([a-zA-Z0-9]+)/i }
    };

    // 🐞 إصلاح: قبل كده لو المنصة اتعرفت من اسم الدومين (hostMatches) بس الـ regex المخصص بتاعها
    // فشل يلقط ID (زي ما حصل مع "/detail/" في أمازون قبل ما نضيفها فوق)، الكود كان بيكمل الحلقة
    // من غير "return" ومن غير ما يسجّل حتى إن المنصة اتعرفت — فبيوصل آخر الدالة برجّع platform:
    // "unknown" تمامًا، مع إن الهوست واضح ومعروف! ده بالظبط اللي بيخلي تبويب "المنصات" يختار
    // "الكل" بدل المنصة الصح. الحل: نسجّل المنصة اتعرفت أول ما hostMatches تبقى true (حتى لو الـ
    // ID فشل)، ونوقف حلقة platformConfigs عندها (المنصة مش هتتكرر مرتين مستحيل)، وبعدين نجرب
    // نفس أنماط الاحتياط العامة اللي كانت مقصورة قبل كده على genericHosts بس — على أي منصة معروفة.
    let detectedPlatform = "unknown";
    for (const [platform, config] of Object.entries(platformConfigs)) {
        const hostMatches = url.includes(platform)
            || (platform === "dailymotion" && url.includes("dai.ly"))
            || (platform === "appletv" && url.includes("tv.apple.com"))
            || (platform === "amazon" && url.includes("primevideo"));
        if (hostMatches) {
            const match = url.match(config.regex);
            const capturedId = match && (match[1] || match[2] || match[3]);
            if (capturedId) {
                return { platform: platform, movieId: capturedId };
            }
            detectedPlatform = platform;
            break;
        }
    }

    if (detectedPlatform === "unknown") {
        const genericHosts = { "starzplay": "starzplay", "jawwy": "jawwy", "stctv": "stctv", "bein": "beinconnect" };
        for (const key in genericHosts) {
            if (url.includes(key)) { detectedPlatform = genericHosts[key]; break; }
        }
    }

    if (detectedPlatform !== "unknown") {
        const hashMatch = url.match(/\/([a-f0-9]{24,40})\b/i);
        const titleMatch = pathname.match(/\/title\/([a-zA-Z0-9_-]+)/i);
        const watchMatch = pathname.match(/(?:watch|video|play|series|movie|vod)\/(\d+)/i);
        const dashIdMatch = pathname.match(/(?:movie|series|id)-(\d+)/i);
        const trailingIdMatch = pathname.match(/\/([a-zA-Z0-9_-]{4,40})\/?$/);
        const NON_ID_TRAILING_WORDS = new Set(["watch", "play", "player", "details", "detail", "stream", "streaming", "view", "index", "home"]);
        const safeTrailingIdMatch = (trailingIdMatch && !NON_ID_TRAILING_WORDS.has(trailingIdMatch[1].toLowerCase())) ? trailingIdMatch : null;
        const generic = hashMatch || titleMatch || watchMatch || dashIdMatch || safeTrailingIdMatch;
        if (generic && generic[1]) {
            return { platform: detectedPlatform, movieId: generic[1] };
        }
    }

    // 🐞 إصلاح: حتى لو مقدرناش نطلع ID خالص، لو المنصة نفسها اتعرفت من الهوست (Prime Video مثلاً)
    // لازم نرجّعها بدل "unknown" — عشان تبويب "المنصات" في الـ popup يختارها صح تلقائياً، بدل ما
    // يرجع لـ"الكل" وكأننا مانعرفش إحنا على أي منصة أصلاً
    return { movieId: null, platform: detectedPlatform };
}

export function idAppearsAsWholeSegment(url, id) {
    if (!url || !id) return false;
    // 🐞 معرّف قصير جداً (زي "1" رقم الموسم في رابط شاهد) كان بيتطابق غلط مع أي رابط فيه "-1" — بنتجاهله
    if (String(id).length < 3) return false;
    const escaped = String(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('(^|[^0-9A-Za-z])' + escaped + '($|[^0-9A-Za-z])');
    return re.test(String(url));
}

export function findMovieByPlatformId(library, platform, urlId) {
    if (!library || !urlId) return null;
    if (library[urlId]) return { key: urlId, item: library[urlId] };
    for (let id in library) {
        const item = library[id];
        if (!item) continue;
        if (String(id) === String(urlId)) return { key: id, item };
        // 🐞 إصلاح: كان الفحص هنا بيتأكد بس من item.platforms[platform].url، لكن Background.js
        // (محرك الفلترة الحقيقي) بيتأكد كمان من item.platforms[platform].id بمطابقة مباشرة —
        // وده بالظبط اللي بيحصل مع ستريميو: كود IMDb مخزّن في حقل "id" مباشرة، مش جوه "url".
        // بدون الفحص ده، الـ popup كان بيفشل يلاقي العمل حتى بعد ما getCurrentTabInfo بقى
        // يرجّع platform/movieId صح لستريميو.
        const platformEntry = item.platforms && item.platforms[platform];
        if (platformEntry && (
            String(platformEntry.id) === String(urlId) ||
            (platformEntry.url && idAppearsAsWholeSegment(platformEntry.url, urlId))
        )) {
            return { key: id, item };
        }
    }
    return null;
}

export async function fetchLibrary() {
    if (_libraryCache && Object.keys(_libraryCache).length > 0) {
        return _libraryCache;
    }
    try {
        const result = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: "FETCH_LIBRARY_DATA" }, (res) => {
                resolve(chrome.runtime.lastError ? { success: false, error: chrome.runtime.lastError.message } : res);
            });
        });
        _libraryCache = (result && result.success && result.data) ? result.data : {};
    } catch (e) {
        console.error("Error fetching unified library:", e);
        _libraryCache = {};
    }
    return _libraryCache;
}

export function getDisabledFiltersStore() {
    return new Promise(resolve => {
        chrome.storage.local.get(['disabledFilters'], (res) => {
            resolve(res.disabledFilters || {});
        });
    });
}

export async function getDisabledFiltersMap(itemKey) {
    if (!itemKey) return {};
    const all = await getDisabledFiltersStore();
    return all[itemKey] || {};
}

export async function setFilterEnabled(itemKey, filterId, enabled) {
    if (!itemKey) return;
    const all = await getDisabledFiltersStore();
    if (!all[itemKey]) all[itemKey] = {};

    if (enabled) {
        delete all[itemKey][filterId];
        if (Object.keys(all[itemKey]).length === 0) delete all[itemKey];
    } else {
        all[itemKey][filterId] = true;
    }

    chrome.storage.local.set({ disabledFilters: all });

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
                type: "UPDATE_DISABLED_FILTERS",
                itemKey: itemKey,
                filterId: filterId,
                enabled: enabled
            }, () => {
                void chrome.runtime.lastError;
            });
        }
    });
}

export function getPlatformLabel(p) {
    const labels = { "netflix": "نتفليكس", "amazon": "أمازون", "yango": "يانجو", "osnplus": "OSN+", "disney": "ديزني+", "shahid": "شاهد", "watchit": "واتش ات", "tod": "تود", "youtube": "يوتيوب", "starzplay": "Starzplay", "jawwy": "Jawwy TV", "stctv": "STC tv", "dailymotion": "Dailymotion", "beinconnect": "beIN Connect", "stremio": "Stremio" };
    return labels[p] || p;
}

// يصنّف مصفوفة الفلاتر لأربع فئات (نفس منطق processAndRenderFilters القديم بالظبط)
export function categorizeFilters(filters) {
    const categories = {
        nudity: { label: "مشهد", verb: "حجب", items: [] },
        violence: { label: "مشهد", verb: "حجب", items: [] },
        language: { label: "ألفاظ", verb: "كتم", items: [] },
        substance: { label: "مشهد", verb: "حجب", items: [] }
    };
    (filters || []).forEach((f) => {
        if (!f) return;
        const cat = f.category ? f.category.toLowerCase() : "";
        if (cat.includes("nudity") || cat.includes("sex")) categories.nudity.items.push(f);
        else if (cat.includes("violence") || cat.includes("blood")) categories.violence.items.push(f);
        else if (cat.includes("language") || cat.includes("profanity")) categories.language.items.push(f);
        else categories.substance.items.push(f);
    });
    return categories;
}

// ==========================================
// 🧩 نظام الإعدادات الفرعية (14 تصنيف فرعي) — بُني فوق نفس المنطق العام لـ categorizeFilters
// من غير أي تغيير في شكل بيانات الفلاتر نفسها (id, category, reason, original_description...)
// ولا في مفاتيح Realtime Database — كل حاجة هنا تصنيف وعرض إضافي فوق البيانات الموجودة بالفعل.
// ==========================================

// كل تصنيف فرعي معرّف بكلمات مفتاحية (عربي/إنجليزي) بتُفحص مقابل category + reason +
// original_description بتاعة الفلتر. الفلاتر القديمة اللي معندها وصف كافي عشان تتصنّف فرعياً
// بتقع في دلو "other" الخاص بفئتها (مش ليه توجل مستقل — بيتبع توجل الفئة الأم بس)
// 🔍 القوائم دي اتبنت من تحليل فعلي لملف library.json الحقيقي (293 عمل، آلاف الفلاتر) —
// مش تخمين، ده استخراج مباشر لأكتر الصيغ تكراراً في original_description الفعلية.
// ملحوظة مهمة عن حدود المطابقة بالـ substring: العربي لغة اشتقاقية (نفس الجذر بيدّي صيغ
// مختلفة تماماً في الحروف زي "عاري"/"عراة"/"تعري")، فمينفعش نعتمد على جذر واحد قصير يغطي
// كل الصيغ زي الإنجليزي — لازم نسرّد الصيغ الفعلية الشائعة كل واحدة لوحدها. تفاصيل أكتر
// عن الحالات الحدّية (اللي مش هتتصنّف فرعياً وهتقع في دلو "other" بتاع فئتها) في آخر الرد.
export const SUBCATEGORY_SCHEMA = {
    nudity: {
        label: "المشاهد الحساسة",
        icon: "🔞",
        unitLabel: "مشهد",
        verb: "حجب",
        noneLabel: "لا يوجد مشاهد",
        subcategories: [
            // ملحوظة: شلنا كلمة "قبل" المفردة عمداً — دي كلمة عربية شائعة جداً بمعنى "before"
            // (زي "قبل الزواج")، ومكانتش هتتحصر في مشاهد القبلات فعلياً لو استخدمناها كمطابقة
            // عبر كل الفئات (راجع matchAllSubcategories) — سيبنا بس الصيغ اللي مالهاش لبس
            { key: "kissing", label: "قبلات ومشاهد رومانسية", keywords: ["يقبل", "تقبل", "تقبيل", "قبلة", "القبل", "بوس", "حضن", "تحضن", "عناق", "تعانق", "kiss"] },
            { key: "relations", label: "علاقات جنسية وزنا", keywords: ["زنا", "يزنون", "اباحي", "اباحية", "علاقة حميمية", "حميمية", "فتاة الليل", "يتضاجعان", "affair", "intimate"] },
            // 🏳️ بناء على طلب المستخدم: تصنيف مستقل لمشاهد التشبه بالجنس الآخر والمثلية الجنسية،
            // بدل ما تتوه في دلو "علاقات جنسية وزنا" العام
            // ملحوظة: شلنا "لواط" المفردة — بتتطابق جزئياً مع كلمة "الواطي" الشائعة (بمعنى وضيع/حقير،
            // زي في شتيمة "الكلب الواطي")، وهي كلمة تانية خالص. "لوطي" (بالياء في الآخر) مافيهاش
            // اللبس ده فسبناها
            { key: "lgbtq", label: "LGBTQ", keywords: ["تشبه الرجال بالنساء", "رجل يلبس النقاب", "لبس رجل للنقاب", "رجل يلبس فستان", "متنكر كامرأة", "متنكر كمربية", "يرتدي ملابس نساء", "شاذ", "لوطي", "متحول جنسيا", "ظهور علم المثليين", "علم المثليين", "lgbtq"] },
            { key: "exposure", label: "عري وإيحاءات جنسية", keywords: ["عري", "عاري", "عارية", "عراة", "تعري", "يخلع", "خالع", "ملط", "تغري", "يغري", "اغراء", "إغراء", "ايحاء", "إيحاء", "ايحائي", "ايحائية", "إيحائي", "إيحائية", "اشارة جنسية", "إشارة جنسية", "تعليق جنسي", "تعليق عري", "نكتة اباحية", "تحرش", "متحرش", "مغازلة", "يغازل", "رقص اغرائي", "الراقصة", "وضع مخل", "ديسكو", "نساء يرقصن", "sexy", "naked", "nudity", "boobs"] },
            { key: "attire", label: "ملابس كاشفة وتلميحات", keywords: ["مكشوف", "مكشوفة", "تكشف", "ظاهرة", "ظاهر", "بارزة", "بارز", "بكيني", "ملابس", "مؤخرة", "مؤخرته", "مؤخرتها", "مؤخرتهم", "مؤخرات", "مؤخراتهم", "عورة", "عورته", "عورتها", "عورات", "مفاتن", "لبس مثير", "لبس كاشف", "يبرز", "فستان كاشف", "دمية تلبس حمالة صدر", "ظهور اسفل ظهر", "revealing", "panties"] }
        ]
    },
    violence: {
        label: "لقطات عنيفة أو مقززة",
        icon: "🩸",
        unitLabel: "مشهد",
        verb: "حجب",
        noneLabel: "لا يوجد مشاهد",
        subcategories: [
            { key: "weapons", label: "أسلحة وقتل", keywords: ["سلاح", "سيف", "سكين", "خنجر", "قتل", "مقتول", "مقتولة", "طلقة", "رصاصة", "قطع رأس", "شنق", "مشنوق", "مشنوقة", "ميت", "حرق", "حترق", "احتراق", "انفجار", "غرق", "جثة", "حرب عنيفة", "رقاب اشخاص", "gun", "weapon", "kill", "murder", "uzi"] },
            { key: "abuse", label: "إيذاء جسدي", keywords: ["ضرب", "صفع", "طعن", "تعذيب", "خنق", "ذبح", "جلد", "سحل", "إخصاء", "اجهاض", "كسر ذراع", "دهس", "مضاربة", "abuse", "torture", "beating"] },
            { key: "disturbing", label: "مشاهد مقززة", keywords: ["قيء", "تقيأ", "تكرع", "بصق", "تجشأ", "تغوط", "ضرطة", "ضراط", "يضرط", "غازات", "مقزز", "مقرف", "مقرفة", "فضلات", "مشوه", "مشوهة", "مفقوعة", "تبول", "يخرج من بطن", "نصف بشري", "disturbing", "vomit", "gross", "poop", "pee"] },
            { key: "gore", label: "عنف مفرط ودماء", keywords: ["دماء", "دم يخرج", "الدم", "دامي", "مضرج", "جرح", "أشلاء", "نزيف", "ينزف", "gore", "blood"] }
        ]
    },
    language: {
        label: "الألفاظ الخارجة",
        icon: "🤬",
        unitLabel: "لفظ",
        verb: "كتم",
        noneLabel: "لا يوجد ألفاظ",
        // ترتيب مهم: لازم "شتائم" تتفحص قبل "إهانات بسيطة" — عشان عبارة مركّبة زي "يابن الجزمة"
        // (شتيمة قوية) تتطابق مع "بن الجزمة" هنا الأول، بدل ما توقع في دلو "جزمة" المفردة
        // (إهانة خفيفة) بالغلط بسبب التطابق الجزئي بينهم على نفس الكلمة "جزمة"
        subcategories: [
            { key: "blasphemy", label: "إساءة للمقدسات", keywords: ["مقدس", "الإله", "إله", "الاله", "تهكم عن الله", "تهكم عن الاله", "استهزاء بالدين", "سخرية من الدين", "تلبس النقاب وتسرق", "hell", "goddamn", "jesus", "christ", "lord"] },
            // 🆕 تصنيف مستقل عن "إساءة للمقدسات" — ده مش سخرية/تهكم، ده الحلف بغير الله (يمين
            // بحاجة غير الله زي "وحياة أمك")، مفهوم مختلف. "والنبي" اتنقلت هنا من blasphemy لأنها
            // من نفس نوع اليمين ده مش سخرية فعلية. "وحياة" لوحدها بتغطي كل صيغ "وحياة فلان" تلقائياً
            { key: "impiety", label: "سوء أدب مع الله", keywords: ["والنبي", "وحياة", "وحيات", "وحياه", "والنعمة", "وشرف", "ورحمة", "بالذمة", "بذمتك", "بزمتك", "وديني", "روح امك", "نهار اسود", "الحلف بغير الله", "دعاء لغير الله", "بشرفي", "وشرفي", "ليه يارب مخلقتنيش ولد", "البقية في حياتك", "يا لهوي", "احيه", "شيء الله لا يستطيع فعله"] },
            // ملحوظة: "كلب"/"حيوان" رجعوا تاني كمفردات بطلب المستخدم — كانوا اتشالوا بسبب فرصة
            // تطابق مع وصف حيواني حرفي (زي "كلبين بيتعاركوا")، لكن في البيانات الحقيقية بيظهروا
            // كشتيمة فعلية بكثرة أكتر بكتير من الاستخدام الحرفي، فرجّعناهم مع قبول المخاطرة النادرة دي
            { key: "curses", label: "شتائم", keywords: ["بن الجزمة", "ابن الحرام", "كلب", "كلاب", "بقف", "نطع", "يا نهار اسود", "يانهار اسود", "نهارك اسود", "يا نهار ابوك اسود", "يا نهار ازرق", "يا نهار اسود ومنيل", "يا نهارك اسود ومنيل", "الزفت", "زفت", "يخرب بيتك", "يخربيت امك", "يا روح امك", "يلعن", "شتائم", "screw", "screwing", "screwed", "bastard", "motherfucker", "motherfucher", "bitch", "fu*kinm"] },
            { key: "profanity", label: "ألفاظ بذيئة", keywords: ["بذيء", "fuck", "fucking", "fuckin", "shit", "bullshit", "ass", "asshole", "dick", "prick", "crap", "damn", "bloody", "pissed", "piss", "butt", "bollocks", "arse", "كلمة قبيحة", "نكتة قبيحة", "أفعال قبيحة"] },
            { key: "insults", label: "إهانات بسيطة", keywords: ["غبي", "جزمة", "عبيط", "زبالة", "متخلف", "حيوان", "واطي", "واطية", "العويل", "عويل", "حمار", "الحمير", "وسخ", "الوسخة", "وساخة", "حقير", "قذر", "قذرة", "هبل", "اهبل", "نجس", "جاموسة", "ابن المجنونة", "ابن الصرمة", "ابن الشمامة", "معفن", "معفنة", "المعفن", "يا سافلة", "احمق", "لطخ", "creep", "stupid", "idiot", "idiots", "dumb", "dope", "fool", "fools", "moron", "loser", "jerk", "pathetic", "freak", "lame", "bugger", "dummy", "ugly", "scum", "scumbag", "lowlife", "nitwit", "dummies", "douche", "douchebag", "imbecile"] },
            // 🆕 كلمات مفردة (زي hot/sex أو beer/wine) مش شتيمة ولا إهانة فعلياً، لكنها بتتقفل
            // ضمن فئة "الألفاظ" — تصنيفين مستقلين ليها بدل ما تقع في دلو "أخرى" العام
            { key: "sexual", label: "ألفاظ جنسية", keywords: ["hot", "sex", "sexy", "naked", "horny", "pedo", "penis", "pussy", "cock", "cocksucker", "scrotum", "suck", "sucked", "sucking", "hump", "shag", "whore", "slut", "playboy", "porn", "nude", "hook up", "sleeping with", "sleep with", "prostitution", "المزة", "مزة", "مزز", "فاجرة", "الفاجرة", "فاجره", "الفاجره"] },
            { key: "substanceTalk", label: "ألفاظ تعاطي", keywords: ["beer", "wine"] }
        ]
    },
    substance: {
        label: "لقطات تعاطي ومسكرات",
        icon: "🚬",
        unitLabel: "مشهد",
        verb: "حجب",
        noneLabel: "لا يوجد مشاهد",
        subcategories: [
            { key: "smoking", label: "تدخين", keywords: ["سيجارة", "سجائر", "سجارة", "سيجار", "سيغار", "تدخين", "دخن", "شيشة", "أرجيلة", "الأرجيلة", "الغليون", "cigarette", "smoking", "cigarates"] },
            { key: "alcohol", label: "كحول وخمور", keywords: ["خمر", "خمور", "كحول", "بيرة", "بيره", "جعة", "سكران", "مخمور", "يترنح", "شامبانيا", "غيبسون", "مارغاريت", "مارجاريت", "تكيلا", "wine", "beer", "alcohol", "drunk", "rum", "whiskey", "vodka", "gin", "tequila"] },
            { key: "drugs", label: "مخدرات", keywords: ["مخدرات", "مخدر", "حشيش", "ترامادول", "كوكايين", "هروين", "استروكس", "بانجو", "بودرة", "حبوب", "حبة", "جوينت", "بودرجي", "drugs", "narcotic", "pcp", "weed", "joint", "cocaine", "pot", "crack"] },
            { key: "gambling", label: "قمار ومراهنات", keywords: ["قمار", "مقامرة", "يراهن", "مراهنة", "gambling"] }
        ]
    }
};

export const OTHER_SUBKEY = "other";

// نفس منطق التصنيف العام المستخدم في categorizeFilters/isolated.script.js بالظبط —
// لازم يفضل متطابق بين الملفين عشان توجلز الـ popup تتفعّل صح على نفس الفلاتر اللي بتتنفذ فعلياً
export function normalizeToGroupKey(rawCategory) {
    const cat = (rawCategory || "").toLowerCase();
    if (cat.includes("nudity") || cat.includes("sex")) return "nudity";
    if (cat.includes("violence") || cat.includes("blood")) return "violence";
    if (cat.includes("language") || cat.includes("profanity")) return "language";
    return "substance";
}

// 🆕 تطبيع بسيط للنص العربي قبل المطابقة: بيوحّد صيغ الهمزة (أ/إ/آ/ٱ ← ا) والألف المقصورة (ى ← ي)
// وبيشيل التشكيل والتطويل (ـ) — عشان كلمة مفتاح متسجّلة بصيغة واحدة (زي "ايحائية") تلاقي تطابق
// حتى لو النص الأصلي مكتوب بصيغة إملائية تانية (زي "إيحائية" بالهمزة) بدل ما نضطر نضيف كل صيغة
// إملائية يدوي في القوائم. مش بيلمس اللاتيني (بيفضل يتقارن بـ toLowerCase العادي بعد كده)
function normalizeArabic(str) {
    if (!str) return "";
    return str
        .replace(/[ً-ٰٟ]/g, "") // تشكيل
        .replace(/[إأآٱ]/g, "ا")
        .replace(/ى/g, "ي")
        .replace(/ـ/g, ""); // تطويل
}

function buildHaystack(filterItem) {
    const raw = [filterItem.reason, filterItem.original_description]
        .filter(Boolean).join(" ").toLowerCase();
    return normalizeArabic(raw);
}

function keywordMatches(haystack, keywords) {
    return keywords.some((kw) => haystack.includes(normalizeArabic(kw.toLowerCase())));
}

export function matchSubcategory(groupKey, filterItem) {
    const group = SUBCATEGORY_SCHEMA[groupKey];
    if (!group || !filterItem) return OTHER_SUBKEY;
    // 🐞 إصلاح: category متعمّدين ميدخلش هنا (بعد ما كان بيدخل قبل كده) — لأن الفئة الخام نفسها
    // ممكن تحتوي كلمات إنجليزية عامة زي "abuse" جوه "substance abuse" اللي بتتطابق غلط مع كلمة
    // "abuse" في قائمة violence.abuse بمجرد وجودها في اسم الفئة، مش لأن المحتوى نفسه عنيف —
    // خصوصاً دلوقتي إننا بنفحص عبر كل الفئات مش بس فئة الفلتر الأصلية (matchAllSubcategories)
    const haystack = buildHaystack(filterItem);
    for (const sub of group.subcategories) {
        if (keywordMatches(haystack, sub.keywords)) return sub.key;
    }
    return OTHER_SUBKEY;
}

// 🆕 تصنيف مزدوج/متعدد: فلتر واحد ممكن يوصف حاجتين مختلفتين فعلاً في نفس المشهد (زي "رجل يشرب
// الخمر ويقبل امرأة" — خمر + قبلة)، فبنرجّع كل تصنيف فرعي (في أي فئة) اتطابق معاه، مش أول واحد
// بس. لو مفيش أي تطابق حقيقي في أي فئة خالص، نرجع لنفس سلوك الفئة الخام القديم (تطابق واحد في
// دلو "other") عشان الفلتر يفضل ليه مكان يتحط فيه بدل ما يضيع
export function matchAllSubcategories(filterItem) {
    if (!filterItem) return [];
    const matches = [];
    const haystack = buildHaystack(filterItem);
    for (const groupKey of Object.keys(SUBCATEGORY_SCHEMA)) {
        const group = SUBCATEGORY_SCHEMA[groupKey];
        for (const sub of group.subcategories) {
            if (keywordMatches(haystack, sub.keywords)) {
                matches.push({ groupKey, subKey: sub.key });
            }
        }
    }
    if (matches.length) return matches;
    return [{ groupKey: normalizeToGroupKey(filterItem.category), subKey: OTHER_SUBKEY }];
}

// نسخة أكثر تفصيلاً من categorizeFilters بترجّع كل فلتر مبوّب كمان لتصنيفه الفرعي (بما فيها
// دلو "other" للفلاتر القديمة اللي معندها وصف كافي للمطابقة الفرعية). الفلتر اللي بيطابق أكتر
// من تصنيف فرعي (حتى لو في فئتين مختلفتين) بيظهر في كل واحد فيهم — مرة واحدة بس جوه items بتاعة
// نفس الفئة حتى لو طابق أكتر من تصنيف فرعي فيها (زي goddamn: إساءة للمقدسات + سوء أدب مع الله)
export function categorizeFiltersDetailed(filters) {
    const result = {};
    for (const groupKey of Object.keys(SUBCATEGORY_SCHEMA)) {
        const group = SUBCATEGORY_SCHEMA[groupKey];
        const bySub = {};
        group.subcategories.forEach((s) => { bySub[s.key] = []; });
        result[groupKey] = {
            ...group,
            items: [],
            bySub,
            otherItems: []
        };
    }
    (filters || []).forEach((f) => {
        if (!f) return;
        const matches = matchAllSubcategories(f);
        const touchedGroups = new Set();
        matches.forEach(({ groupKey, subKey }) => {
            const bucket = result[groupKey];
            if (!touchedGroups.has(groupKey)) {
                bucket.items.push(f);
                touchedGroups.add(groupKey);
            }
            if (subKey === OTHER_SUBKEY) bucket.otherItems.push(f);
            else bucket.bySub[subKey].push(f);
        });
    });
    return result;
}

// ==========================================
// 💾 تخزين إعدادات الفئات والتصنيفات الفرعية
// شكل التخزين الجديد (chrome.storage.sync -> nazafaFilterSettings):
//   { [groupKey]: { enabled: boolean, subs: { [subKey]: boolean } } }
// بيتم الترحيل تلقائياً من المفاتيح القديمة المسطّحة (filter_nudity, filter_violence, ...)
// أول مرة، من غير ما نمسحها أو نغيّر سلوكها لو حد لسه بيستخدم نسخة قديمة من الكود بتقرأها.
// ==========================================
const LEGACY_FLAT_KEYS = { nudity: "filter_nudity", violence: "filter_violence", language: "filter_language", substance: "filter_substance" };
const SETTINGS_STORAGE_KEY = "nazafaFilterSettings";

function buildDefaultSettings() {
    const defaults = {};
    for (const groupKey of Object.keys(SUBCATEGORY_SCHEMA)) {
        const subs = {};
        SUBCATEGORY_SCHEMA[groupKey].subcategories.forEach((s) => { subs[s.key] = true; });
        defaults[groupKey] = { enabled: true, subs };
    }
    return defaults;
}

export async function getFilterSettings() {
    const stored = await new Promise((resolve) => {
        chrome.storage.sync.get([SETTINGS_STORAGE_KEY, ...Object.values(LEGACY_FLAT_KEYS)], resolve);
    });
    const defaults = buildDefaultSettings();
    const existing = stored[SETTINGS_STORAGE_KEY];
    if (existing) {
        // دمج مع الافتراضي عشان أي تصنيف فرعي جديد يتضاف مستقبلاً يظهر متفعّل تلقائياً
        for (const groupKey of Object.keys(defaults)) {
            const g = existing[groupKey];
            if (!g) continue;
            defaults[groupKey].enabled = g.enabled !== undefined ? g.enabled : defaults[groupKey].enabled;
            if (g.subs) {
                for (const subKey of Object.keys(defaults[groupKey].subs)) {
                    if (g.subs[subKey] !== undefined) defaults[groupKey].subs[subKey] = g.subs[subKey];
                }
            }
        }
        return defaults;
    }
    // ترحيل من المفاتيح المسطّحة القديمة (لو موجودة) — يحصل مرة واحدة فقط عملياً
    for (const [groupKey, flatKey] of Object.entries(LEGACY_FLAT_KEYS)) {
        if (stored[flatKey] !== undefined) defaults[groupKey].enabled = stored[flatKey];
    }
    return defaults;
}

export async function setGroupEnabled(groupKey, enabled) {
    const settings = await getFilterSettings();
    settings[groupKey].enabled = enabled;
    chrome.storage.sync.set({ [SETTINGS_STORAGE_KEY]: settings, [LEGACY_FLAT_KEYS[groupKey]]: enabled });
    return settings;
}

export async function setSubcategoryEnabled(groupKey, subKey, enabled) {
    const settings = await getFilterSettings();
    settings[groupKey].subs[subKey] = enabled;
    chrome.storage.sync.set({ [SETTINGS_STORAGE_KEY]: settings });
    return settings;
}

// ==========================================
// 🎨 مؤشر شدة المحتوى بالألوان (كثافة زمنية بدل الرقم الخام)
// gray = لا يوجد إطلاقاً، أخضر = خفيف، أصفر = متوسط، أحمر = كثيف — محسوبة كمعدّل تكرار
// بالساعة (occurrences/hour) لو مدة العمل معروفة، أو بعتبات متحفظة كـ fallback لو مش معروفة
// ==========================================
export const SEVERITY_META = {
    none: { color: "#94a3b8", bg: "#f1f5f9", label: "لا يوجد" },
    light: { color: "#10b981", bg: "#ecfdf5", label: "خفيف" },
    moderate: { color: "#f59e0b", bg: "#fffbeb", label: "متوسط" },
    heavy: { color: "#ef4444", bg: "#fef2f2", label: "كثيف" }
};

export function getSeverityLevel(count, durationMinutes) {
    if (!count) return "none";
    if (durationMinutes && durationMinutes > 0) {
        const perHour = count / (durationMinutes / 60);
        if (perHour < 2) return "light";
        if (perHour < 6) return "moderate";
        return "heavy";
    }
    // fallback محافظ لو مدة الفيديو غير معروفة لسه (مثلاً الفيديو لسه مبدأش يتحمّل)
    if (count <= 2) return "light";
    if (count <= 6) return "moderate";
    return "heavy";
}

// ==========================================
// 🔤 توجل "تشفير/تنقية الترجمة النصية" (Smart Subtitle Censor) — ميزة مستقلة عن تصنيف
// المحتوى نفسه (بتستبدل الألفاظ الممنوعة بصرياً في نص الترجمة، مش بتحجب مشهد أو تكتم صوت)،
// فمخزّنة في مفتاح خاص بيها بدل ما تتلخبط مع filterSettings الخاصة بالتصنيفات الفرعية.
// معروضة في الـ popup كصف توجل داخل فئة "الألفاظ الخارجة" بناءً على طلب المستخدم.
// ==========================================
const SUBTITLE_CENSOR_STORAGE_KEY = "nazafaSubtitleCensorEnabled";

export async function getSubtitleCensorEnabled() {
    const res = await new Promise((resolve) => chrome.storage.sync.get([SUBTITLE_CENSOR_STORAGE_KEY], resolve));
    return res[SUBTITLE_CENSOR_STORAGE_KEY] !== undefined ? res[SUBTITLE_CENSOR_STORAGE_KEY] : true;
}

export async function setSubtitleCensorEnabled(enabled) {
    chrome.storage.sync.set({ [SUBTITLE_CENSOR_STORAGE_KEY]: enabled });
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, { type: "UPDATE_SUBTITLE_CENSOR_SETTING", enabled }, () => {
                void chrome.runtime.lastError;
            });
        }
    });
}

// مدة الفيديو الحالي (بالدقايق) بيسجّلها isolated.script.js لحظياً من video.duration
// الحقيقي أثناء التشغيل، عشان مؤشر الشدة يحسب معدل تكرار حقيقي بالساعة مش رقم خام تحكيمي
export async function getStoredVideoDurationMinutes() {
    return new Promise((resolve) => {
        chrome.storage.local.get(["nazafaVideoDurationMinutes"], (res) => {
            resolve(res.nazafaVideoDurationMinutes || null);
        });
    });
}

// لو العنصر حلقة (episode)، بيانات العرض موجودة على المسلسل الأب مش الحلقة نفسها
export function resolveDisplayItem(item, library) {
    if (item && item.type === "episode" && item.parent_series_id && library[item.parent_series_id]) {
        return library[item.parent_series_id];
    }
    return item;
}

// إعادة رسم الصورة على Canvas بجودة عالية بمقاس محدد (نفس compressImageToDataUrl القديمة)
export function compressImageToDataUrl(url, targetWidth, targetHeight) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            try {
                const dpr = Math.min(window.devicePixelRatio || 1, 3);
                const canvas = document.createElement("canvas");
                canvas.width = Math.round(targetWidth * dpr);
                canvas.height = Math.round(targetHeight * dpr);
                const ctx = canvas.getContext("2d");
                // 🐞 تعديل بطلب المستخدم: كانت "high" — بتطبّق تنعيم/بلور قوي عند تصغير البوستر،
                // فكانت بتحسّس إن جودة الصورة سيئة. "medium" بيقلل التنعيم من غير ما يوصل لدرجة
                // التقطيع/التسنين (aliasing) اللي بتحصل لو قفلنا التنعيم خالص
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = "medium";

                const srcRatio = img.naturalWidth / img.naturalHeight;
                const targetRatio = targetWidth / targetHeight;
                let sx = 0, sy = 0, sWidth = img.naturalWidth, sHeight = img.naturalHeight;
                if (srcRatio > targetRatio) {
                    sWidth = img.naturalHeight * targetRatio;
                    sx = (img.naturalWidth - sWidth) / 2;
                } else {
                    sHeight = img.naturalWidth / targetRatio;
                    sy = (img.naturalHeight - sHeight) / 2;
                }
                ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL("image/jpeg", 0.92));
            } catch (e) { reject(e); }
        };
        img.onerror = () => reject(new Error("تعذر تحميل الصورة"));
        img.src = url;
    });
}

export async function getSession() {
    const sessionData = await new Promise(resolve => chrome.storage.local.get(['nazafaSession'], resolve));
    return sessionData.nazafaSession || null;
}

export async function getSubscriptionStatus() {
    return new Promise(resolve => {
        chrome.runtime.sendMessage({ type: "GET_SUBSCRIPTION_STATUS" }, (res) => {
            resolve(chrome.runtime.lastError ? { isPremium: false } : res);
        });
    });
}

// ==========================================
// 🆕 اقتراح عمل غير موجود في المكتبة (من البوب أب مباشرة)
// ==========================================

// بيانات التاب الحالي (العنوان والرابط) — بنستخدمها كاسم مقترح للعمل
export async function getActiveTabMeta() {
    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs && tabs[0]) return { title: tabs[0].title || "", url: tabs[0].url || "" };
    } catch (e) {}
    return { title: "", url: "" };
}

// تنضيف عنوان التاب من اسم المنصة ("Severance | Apple TV+" → "Severance")
export function cleanWorkTitle(raw) {
    let t = String(raw || "").trim();
    const brands = /(netflix|prime video|amazon|disney\+?|disney plus|apple tv\+?|shahid|osn\+?|watch ?it|yango|starzplay|stc ?tv|jawwy|tod|bein|stremio|شاهد|نتفليكس|ديزني)/i;
    t = t.replace(/^(watch|watching|مشاهدة|شاهد)\s+/i, "");
    const parts = t.split(/\s+[|\-–—•]\s+/);
    if (parts.length > 1) {
        const kept = parts.filter((p) => !brands.test(p));
        if (kept.length) t = kept.join(" - ");
    }
    return t.replace(/\s+/g, " ").trim().slice(0, 150);
}

const SUGGESTED_WORKS_KEY = "nazafaSuggestedWorks";

export async function isWorkSuggested(platform, movieId) {
    const data = await new Promise((resolve) => chrome.storage.local.get([SUGGESTED_WORKS_KEY], resolve));
    return !!(data[SUGGESTED_WORKS_KEY] && data[SUGGESTED_WORKS_KEY][`${platform}:${movieId}`]);
}

export async function markWorkSuggested(platform, movieId) {
    const data = await new Promise((resolve) => chrome.storage.local.get([SUGGESTED_WORKS_KEY], resolve));
    const map = data[SUGGESTED_WORKS_KEY] || {};
    map[`${platform}:${movieId}`] = Date.now();
    await new Promise((resolve) => chrome.storage.local.set({ [SUGGESTED_WORKS_KEY]: map }, resolve));
}

// ==========================================
// 📣 مقارنة الإصدارات + مساعدات الشريط الإعلامي (UpdateBanner)
// ==========================================
export function compareVersions(a, b) {
    const pa = String(a || "0").split(".").map((n) => parseInt(n, 10) || 0);
    const pb = String(b || "0").split(".").map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] || 0) - (pb[i] || 0);
        if (d !== 0) return d < 0 ? -1 : 1;
    }
    return 0;
}

export async function getBannerState() {
    const data = await new Promise((resolve) => chrome.storage.local.get(["nazafaAppStatus", "nazafaJustUpdated", "nazafaDismissedBanners"], resolve));
    return {
        current: chrome.runtime.getManifest().version,
        status: data.nazafaAppStatus || null,
        justUpdated: data.nazafaJustUpdated || null,
        dismissed: data.nazafaDismissedBanners || {}
    };
}

export async function dismissBanner(key) {
    const data = await new Promise((resolve) => chrome.storage.local.get(["nazafaDismissedBanners"], resolve));
    const map = data.nazafaDismissedBanners || {};
    map[key] = Date.now();
    await new Promise((resolve) => chrome.storage.local.set({ nazafaDismissedBanners: map }, resolve));
}

export function requestExtensionUpdate() {
    return new Promise((resolve) => {
        try {
            chrome.runtime.sendMessage({ type: "NAZAFA_REQUEST_UPDATE" }, (res) => {
                resolve(chrome.runtime.lastError || !res ? "error" : res.status);
            });
        } catch (e) { resolve("error"); }
    });
}
