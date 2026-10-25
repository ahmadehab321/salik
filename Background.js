// background.js - النسخة الموحدة والنظيفة
importScripts('firebase-config.js', 'app-config.js');

// يتحقق إن الـ id ظاهر في الرابط كوحدة مستقلة (محاط بحدود مش أرقام/حروف)، مش مجرد جزء من رقم أطول.
// بدون ده، id قصير زي "126" كان ممكن يتطابق غلط مع "1260014815" (رقم ديزني+ لفيلم Aladdin مثلاً)
// لمجرد إنه ظاهر كبداية الرقم الأطول، ويجيب فيلم غلط تماماً بدل العمل الصحيح.
function idAppearsAsWholeSegment(url, id) {
    if (!url || !id) return false;
    // 🐞 معرّف قصير جداً (زي "1" رقم الموسم في رابط شاهد) كان بيتطابق غلط مع أي رابط فيه "-1" — بنتجاهله
    if (String(id).length < 3) return false;
    const escaped = String(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('(^|[^0-9A-Za-z])' + escaped + '($|[^0-9A-Za-z])');
    return re.test(String(url));
}

// ==========================================
// 🔐 نظام التحقق من حالة الاشتراك (isPremium)
// مصدر الحقيقة هو Firestore (عبر Cloud Function checkSubscriptionStatus)،
// ويُخزَّن آخر نتيجة معروفة محلياً في chrome.storage.local تحت مفتاح nazafaSubscription
// حتى يعمل الفحص السريع (GET_SUBSCRIPTION_STATUS) بدون انتظار شبكة في كل مرة.
// ==========================================
const SUBSCRIPTION_CHECK_ALARM = "nazafa-subscription-check";

async function getStoredSession() {
    const res = await chrome.storage.local.get(['nazafaSession']);
    return res.nazafaSession || null;
}

async function getStoredSubscription() {
    const res = await chrome.storage.local.get(['nazafaSubscription']);
    // الإضافة مجانية ومفتوحة المصدر: الجميع "premium" دائماً (للتوافق مع أي كود قديم)
    return { isPremium: true, status: "free", checkedAt: Date.now() };
}

// 🔒 المصدر الوحيد المسموح بيه لجلب /library بعد إغلاق قراءتها المباشرة من Realtime Database
// (كانت /library.json قابلة للقراءة من أي حد بدون تسجيل دخول ولا اشتراك — أي حد يعرف الرابط
// كان يقدر ياخد كل توقيتات الفلاتر مجاناً). دلوقتي بتتجاب فقط عن طريق getLibraryData Cloud
// Function (موثّقة بـ Bearer ID token وبتتحقق من isPremium فعلياً من Firestore على السيرفر،
// مش بس بتثق في الفلاج المحلي). مستخدمة من FETCH_FILTERS_BACKGROUND (محرك الفلترة) وFETCH_LIBRARY_DATA
// (اللي بيستخدمه الـ popup لتبويب المنصات وعرض الفلاتر الحالية) — نفس المصدر لكل الاثنين.
// ✅ المكتبة الآن ملف JSON عام على GitHub (library.json) — بدون تسجيل دخول.
// نخزّنها محلياً (كاش) ونستخدم آخر نسخة عند فشل الشبكة.
let __salikLibMem = null;
async function fetchAuthenticatedLibrary() {
    const maxAge = (SALIK_CONFIG.LIBRARY_CACHE_MINUTES || 360) * 60 * 1000;
    if (__salikLibMem && Date.now() - __salikLibMem.at < maxAge) {
        return { success: true, data: __salikLibMem.data };
    }
    const stored = (await chrome.storage.local.get(["salikLibraryCache"])).salikLibraryCache;
    if (stored && stored.data && Date.now() - stored.at < maxAge) {
        __salikLibMem = stored;
        return { success: true, data: stored.data };
    }
    try {
        const response = await fetch(SALIK_CONFIG.LIBRARY_URL, { cache: "no-cache" });
        if (!response.ok) throw new Error("HTTP " + response.status);
        const data = await response.json();
        const entry = { at: Date.now(), data };
        __salikLibMem = entry;
        chrome.storage.local.set({ salikLibraryCache: entry }).catch(() => {});
        return { success: true, data };
    } catch (e) {
        if (stored && stored.data) return { success: true, data: stored.data, stale: true };
        return { success: false, error: e.message };
    }
}

// يجدد الـ idToken المنتهي باستخدام refreshToken المخزّن (بدون تحميل Firebase SDK كاملة داخل الـ service worker)
async function refreshIdTokenIfNeeded(session) {
    const expiresAt = session.tokenExpirationTime ? new Date(session.tokenExpirationTime).getTime() : 0;
    if (expiresAt > Date.now() + 60000) return session.idToken; // لسه صالح لأكتر من دقيقة

    const resp = await fetch(`https://securetoken.googleapis.com/v1/token?key=${NAZAFA_FIREBASE_CONFIG.apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `grant_type=refresh_token&refresh_token=${session.refreshToken}`
    });
    const data = await resp.json();
    if (!data.id_token) throw new Error("تعذر تجديد الجلسة");

    const updatedSession = {
        ...session,
        idToken: data.id_token,
        refreshToken: data.refresh_token,
        tokenExpirationTime: new Date(Date.now() + Number(data.expires_in) * 1000).toISOString()
    };
    await chrome.storage.local.set({ nazafaSession: updatedSession });
    return data.id_token;
}

// يفحص حالة الاشتراك الفعلية من الخادم ويحدّث الكاش المحلي، ثم يبلّغ كل التابات المفتوحة
async function refreshSubscriptionStatus() {
    // مجاني: لا يوجد فحص اشتراك
    if (true) return await getStoredSubscription();
    const session = await getStoredSession();
    if (!session) {
        const offlineStatus = { isPremium: false, status: "signed_out", checkedAt: Date.now() };
        await chrome.storage.local.set({ nazafaSubscription: offlineStatus });
        return offlineStatus;
    }

    try {
        const idToken = await refreshIdTokenIfNeeded(session);
        const res = await fetch(`${NAZAFA_FUNCTIONS_BASE_URL}/checkSubscriptionStatus`, {
            headers: { "Authorization": `Bearer ${idToken}` }
        });
        const data = await res.json();
        const previous = await getStoredSubscription();

        const newStatus = {
            isPremium: !!data.isPremium,
            status: data.status || "expired",
            endsAt: data.endsAt || null,
            checkedAt: Date.now()
        };
        await chrome.storage.local.set({ nazafaSubscription: newStatus });

        if (previous.isPremium !== newStatus.isPremium) {
            broadcastSubscriptionChange(newStatus);
        }
        return newStatus;
    } catch (error) {
        console.warn("⚠️ تعذر التحقق من حالة الاشتراك (سيتم الاعتماد على آخر حالة معروفة):", error.message);
        return await getStoredSubscription();
    }
}

function broadcastSubscriptionChange(status) {
    chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { type: "SUBSCRIPTION_STATUS_CHANGED", status }, () => {
                void chrome.runtime.lastError; // تجاهل التابات بدون content script
            });
        });
    });
}

chrome.alarms.create(SUBSCRIPTION_CHECK_ALARM, { periodInMinutes: 360 });
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === SUBSCRIPTION_CHECK_ALARM) refreshSubscriptionStatus();
});
refreshSubscriptionStatus(); // فحص فوري عند بدء تشغيل الـ service worker

// ==========================================
// 🔐 تسجيل الدخول (Google / Apple / Facebook) من داخل الـ Background
// السبب: لو خلّينا عملية تسجيل الدخول تحصل جوّه popup.html، أي نافذة تسجيل دخول
// (جوجل/فيسبوك/آبل) بتاخد الـ focus، والـ popup بيتقفل تلقائياً في Chrome لما يفقد الـ
// focus — فتتقطع العملية في النص. هنا في Background.js (service worker دايم الاشتغال
// ومبيتقفلش بفقدان الـ focus)، العملية بتكمل وتخلص بأمان مهما حصل للـ popup.
// بنستخدم REST مباشرة (Identity Toolkit + Firestore) بدل تحميل Firebase SDK كاملة،
// لنفس السبب الموجود في refreshIdTokenIfNeeded أعلاه (غير عملي جوه service worker).
// ==========================================
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${NAZAFA_FIREBASE_CONFIG.projectId}/databases/(default)/documents`;

function decodeIdTokenClaims(idToken) {
    try {
        const payload = idToken.split(".")[1];
        const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
        return JSON.parse(decodeURIComponent(escape(json)));
    } catch (e) { return {}; }
}

// ينشئ وثيقة المستخدم (users/{uid}) لو أول مرة (فترة تجريبية 7 أيام تلقائية)، أو يحدّث
// بيانات البروفايل فقط لو موجودة بالفعل — نفس منطق nazafaEnsureUserDoc في auth-common.js
// لكن عبر Firestore REST API مباشرة (بنفس idToken كـ Bearer auth، بيحترم نفس Security Rules)
async function ensureUserDocRest(uid, idToken, profile) {
    const headers = { "Authorization": `Bearer ${idToken}`, "Content-Type": "application/json" };
    const getRes = await fetch(`${FIRESTORE_BASE}/users/${uid}`, { headers });
    const nowIso = new Date().toISOString();

    if (getRes.status === 404) {
        const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        // 🔗 كود المسوّق (لو موجود) اللي التقطه content-affiliate.js من صفحة الموقع التسويقي
        // وحفظه Background.js مؤقتاً في chrome.storage.local (nazafaAffiliate) — بيتقرأ هنا مرة
        // واحدة بس، لحظة إنشاء وثيقة المستخدم لأول مرة عبر مسار تسجيل الدخول من الـ popup
        // (نفس منطق nazafaEnsureUserDoc في auth-common.js، اللي كان شغال بس على مسار login.html
        // ومش شغال على المسار ده — ده كان سبب غياب referredBy من مستندات مستخدمين اتسجلوا من الـ popup)
        const storedAffiliate = await chrome.storage.local.get(['nazafaAffiliate']);
        const referredBy = storedAffiliate.nazafaAffiliate || null;

        const body = {
            fields: {
                email: { stringValue: profile.email || "" },
                displayName: { stringValue: profile.displayName || "" },
                photoURL: profile.photoURL ? { stringValue: profile.photoURL } : { nullValue: null },
                provider: { stringValue: profile.provider || "unknown" },
                lastLoginAt: { timestampValue: nowIso },
                createdAt: { timestampValue: nowIso },
                termsAccepted: { booleanValue: true },
                termsAcceptedAt: { timestampValue: nowIso },
                termsVersion: { stringValue: "2026-07-16" },
                isPremium: { booleanValue: true }, // الفترة التجريبية مفعّلة تلقائياً
                subscriptionPlan: { stringValue: "trial" },
                subscriptionStatus: { stringValue: "trialing" },
                trialStartedAt: { timestampValue: nowIso },
                trialEndsAt: { timestampValue: trialEndsAt },
                subscriptionStartedAt: { nullValue: null },
                subscriptionEndsAt: { nullValue: null },
                paymentMethod: { nullValue: null },
                isAdmin: { booleanValue: false },
                referredBy: referredBy ? { stringValue: referredBy } : { nullValue: null }
            }
        };
        const createRes = await fetch(`${FIRESTORE_BASE}/users?documentId=${uid}`, {
            method: "POST", headers, body: JSON.stringify(body)
        });
        if (!createRes.ok) throw new Error("تعذر إنشاء بيانات المستخدم في قاعدة البيانات");

        // نفس سلوك auth-common.js: نمسح القيمة المؤقتة بعد استخدامها عشان محدش يتنسبله
        // إحالة بالغلط لو سجّل دخول تاني على نفس الجهاز من غير ما يعدي على رابط مسوّق جديد
        if (referredBy) {
            await chrome.storage.local.remove(['nazafaAffiliate']);
        }
    } else if (getRes.ok) {
        const fields = {
            email: { stringValue: profile.email || "" },
            displayName: { stringValue: profile.displayName || "" },
            photoURL: profile.photoURL ? { stringValue: profile.photoURL } : { nullValue: null },
            provider: { stringValue: profile.provider || "unknown" },
            lastLoginAt: { timestampValue: nowIso }
        };
        const maskParams = Object.keys(fields).map(k => `updateMask.fieldPaths=${k}`).join("&");
        const updateRes = await fetch(`${FIRESTORE_BASE}/users/${uid}?${maskParams}`, {
            method: "PATCH", headers, body: JSON.stringify({ fields })
        });
        if (!updateRes.ok) throw new Error("تعذر تحديث بيانات المستخدم");
    } else {
        throw new Error("فشل الاتصال بقاعدة البيانات (Firestore)");
    }
}

// يستبدل توكن المزوّد (Google access_token / Facebook access_token / Apple id_token)
// بجلسة Firebase حقيقية عبر Identity Toolkit REST، ويحفظها في chrome.storage.local
// بنفس شكل الجلسة اللي يقرأها Background.js وباقي الملفات (nazafaSession)
async function completeIdpSignIn(providerId, postBodyParams) {
    const postBody = `${postBodyParams}&providerId=${providerId}`;
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${NAZAFA_FIREBASE_CONFIG.apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postBody, requestUri: "http://localhost", returnSecureToken: true })
    });
    const data = await res.json();
    if (!res.ok || !data.idToken) {
        throw new Error((data.error && data.error.message) || "فشل تسجيل الدخول");
    }

    const claims = decodeIdTokenClaims(data.idToken);
    const session = {
        uid: data.localId,
        email: data.email || null,
        displayName: data.displayName || null,
        photoURL: data.photoUrl || null,
        provider: providerId,
        idToken: data.idToken,
        tokenExpirationTime: new Date(Date.now() + Number(data.expiresIn) * 1000).toISOString(),
        refreshToken: data.refreshToken,
        isAdmin: !!claims.admin,
        savedAt: Date.now()
    };

    await ensureUserDocRest(session.uid, session.idToken, {
        email: session.email, displayName: session.displayName, photoURL: session.photoURL, provider: providerId
    });

    await chrome.storage.local.set({ nazafaSession: session });

    // شبكة أمان: امنح صلاحية admin فوراً لو كان هذا هو حساب المسؤول الرئيسي (نفس منطق login.js سابقاً)
    try {
        await fetch(`${NAZAFA_FUNCTIONS_BASE_URL}/ensurePrimaryAdminClaim`, {
            headers: { "Authorization": `Bearer ${session.idToken}` }
        });
    } catch (e) { /* تجاهل، مش حرج */ }

    await refreshSubscriptionStatus();
    return session;
}

function launchProviderAuthFlow(authUrl) {
    return new Promise((resolve, reject) => {
        chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, (responseUrl) => {
            if (chrome.runtime.lastError || !responseUrl) {
                reject(chrome.runtime.lastError || new Error("تم إلغاء تسجيل الدخول"));
            } else {
                resolve(responseUrl);
            }
        });
    });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    // 🔐 تسجيل الدخول عبر Google — تُستدعى من popup.js. تعمل هنا في الـ Background عشان
    // تكمل حتى لو الـ popup اتقفل بسبب فقدان الـ focus وقت ما نافذة جوجل تفتح
    if (request.type === "NAZAFA_SIGN_IN_GOOGLE") {
        (async () => {
            try {
                // ⚠️ كنا بنستخدم chrome.identity.getAuthToken، لكن Brave عنده مشكلة توافق معروفة
                // (بيضيف custom URI scheme في الطلب، وجوجل بترفضه بـ invalid_request) بتخلي getAuthToken
                // يفشل تحديداً على Brave رغم إنه شغال عادي على Chrome. الحل الموحّد: نستخدم launchWebAuthFlow
                // بدل getAuthToken (نفس أسلوب Facebook/Apple بالظبط)، وده شغال بنفس الطريقة على أي متصفح
                // مبني على Chromium (Chrome, Brave, Edge...) من غير ما نحتاج نفرّق بين المتصفحات.
                const redirectUri = chrome.identity.getRedirectURL();
                const authUrl = `https://accounts.google.com/o/oauth2/v2/auth` +
                    `?client_id=${NAZAFA_GOOGLE_WEB_CLIENT_ID}` +
                    `&response_type=token` +
                    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
                    `&scope=${encodeURIComponent("openid email profile")}`;
                const responseUrl = await launchProviderAuthFlow(authUrl);
                const fragment = new URLSearchParams(responseUrl.split("#")[1]);
                const accessToken = fragment.get("access_token");
                if (!accessToken) throw new Error("لم يتم استلام access_token من Google");
                const session = await completeIdpSignIn("google.com", `access_token=${accessToken}`);
                sendResponse({ success: true, session });
            } catch (err) {
                sendResponse({ success: false, error: err.message || String(err) });
            }
        })();
        return true;
    }

    if (request.type === "NAZAFA_SIGN_IN_FACEBOOK") {
        (async () => {
            try {
                const redirectUri = chrome.identity.getRedirectURL();
                const authUrl = `https://www.facebook.com/v19.0/dialog/oauth` +
                    `?client_id=${NAZAFA_FACEBOOK_APP_ID}` +
                    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
                    `&response_type=token&scope=email,public_profile`;
                const responseUrl = await launchProviderAuthFlow(authUrl);
                const fragment = new URLSearchParams(responseUrl.split("#")[1]);
                const accessToken = fragment.get("access_token");
                if (!accessToken) throw new Error("لم يتم استلام access_token من Facebook");
                const session = await completeIdpSignIn("facebook.com", `access_token=${accessToken}`);
                sendResponse({ success: true, session });
            } catch (err) {
                sendResponse({ success: false, error: err.message || String(err) });
            }
        })();
        return true;
    }

    if (request.type === "NAZAFA_SIGN_IN_APPLE") {
        (async () => {
            try {
                const redirectUri = chrome.identity.getRedirectURL();
                const bridgeCallback = `${NAZAFA_FUNCTIONS_BASE_URL}/appleAuthBridge?extensionRedirect=${encodeURIComponent(redirectUri)}`;
                const authUrl = `https://appleid.apple.com/auth/authorize` +
                    `?client_id=${NAZAFA_APPLE_SERVICE_ID}` +
                    `&redirect_uri=${encodeURIComponent(bridgeCallback)}` +
                    `&response_type=code%20id_token&scope=email%20name&response_mode=form_post`;
                const responseUrl = await launchProviderAuthFlow(authUrl);
                const fragment = new URLSearchParams(responseUrl.split("#")[1]);
                const idToken = fragment.get("id_token");
                if (!idToken) throw new Error("لم يتم استلام id_token من Apple");
                const session = await completeIdpSignIn("apple.com", `id_token=${idToken}`);
                sendResponse({ success: true, session });
            } catch (err) {
                sendResponse({ success: false, error: err.message || String(err) });
            }
        })();
        return true;
    }

    // تُستدعى فوراً من login.html/subscription.html بعد تسجيل الدخول أو الدفع لتحديث الحالة دون انتظار الفحص الدوري
    if (request.type === "SESSION_UPDATED") {
        refreshSubscriptionStatus().then(status => sendResponse({ success: true, status }));
        return true;
    }

    // يستخدمه isolated.script.js وpopup.js لمعرفة إن كان يجب تفعيل الفلترة أو توجيه المستخدم لصفحة الاشتراك
    if (request.type === "GET_SUBSCRIPTION_STATUS") {
        getStoredSubscription().then(status => {
            sendResponse({ success: true, ...status });
            // فحص خفيف في الخلفية لتحديث الكاش دون تأخير الرد الحالي
            const isStale = !status.checkedAt || (Date.now() - status.checkedAt > 10 * 60 * 1000);
            if (isStale) refreshSubscriptionStatus();
        });
        return true;
    }


   // في ملف Background.js - هيكل المكتبة الموحدة (library.json)
if (request.type === "FETCH_FILTERS_BACKGROUND") {
    // الـ ID اللي بيوصل من isolated.script.js هو رقم/كود المنصة نفسها
    // (مثال: 2464982527 من شاهد) وليس بالضرورة مفتاح العنصر في المكتبة
    const movieId = String(request.movieId || "").trim();
    const tabId = sender.tab ? sender.tab.id : null;
    if (sender.tab) nazafaRecordPlatformFromTab(sender.tab);

    (async () => {
        try {
            // 🔒 بوابة الاشتراك: لا تعمل الفلترة إطلاقاً إلا إذا كان isPremium = true في Firestore
            // (فترة تجريبية فعّالة تُحتسب أيضاً isPremium = true، راجع computeStatus في Cloud Functions)

            console.log(`🔍 البحث عن محتوى: ${movieId}...`);

            // 🐞 إصلاح أمني: كانت هنا fetch مباشر وبدون أي توثيق لـ /library.json (كانت قابلة
            // للقراءة العامة من أي حد بدون اشتراك). بقت بتتجاب فقط عن طريق getLibraryData
            // Cloud Function الموثّقة (راجع fetchAuthenticatedLibrary فوق)
            const libResult = await fetchAuthenticatedLibrary();
            if (!libResult.success) {
                console.warn("🔒 Nazafa: تعذر جلب المكتبة الموثّقة:", libResult.error);
                if (tabId !== null) chrome.action.setBadgeText({ text: "", tabId: tabId });
                sendResponse({ success: false, error: libResult.error });
                return;
            }
            const library = libResult.data;

            let foundItem = null;

            if (library && typeof library === "object" && !library.error) {
                // 1. تطابق مباشر: الـ ID هو مفتاح العنصر نفسه في المكتبة
                if (library[movieId]) {
                    foundItem = { ...library[movieId], _libraryKey: movieId };
                } else {
                    // 2. البحث داخل كل عنصر عبر كل منصاته (id الخاص بالمنصة أو داخل رابطها)
                    for (const key in library) {
                        const item = library[key];
                        if (!item || !item.platforms) continue;
                        // 🐞 إصلاح حرج: عنصر المسلسل الأب (type: "series") دايماً filters: []
                        // (ده سجل بيانات العرض/الكتالوج بس، مش حلقة فعلية) لكن platforms.appletv.url
                        // بتاعه هو نفس رابط صفحة المسلسل الثابت اللي بتتكرر في كل حلقاته (راجع
                        // severance مقابل severance_s1e1 في المكتبة) — فلو الـ movieId المكتشف لسه
                        // هو الـ id الثابت من الرابط (umc.cmc...) مش externalId الحلقة الحيّ (لسه
                        // معرفتوش لأن المستخدم ما شغّلش الحلقة فعلياً)، كان بيتطابق مع المسلسل الأب
                        // الأول (ترتيب المفاتيح) ويرجع فلاتر فاضية، فيظهر "لقيت المحتوى" بس من غير
                        // أي فلاتر خالص. الحل: نستبعد سجلات المسلسل الأب من هذا البحث بالكامل —
                        // هي مالهاش فلاتر أصلاً، فمينفعش نطابقها غير بالمفتاح المباشر فوق (حالة 1)
                        if (item.type === "series") continue;
                        // id ستريميو من غير موسم/حلقة (tt1234567 بس) ميتطابقش مع حلقة — رابط الحلقة فيه
                        // نفس الـ tt كجزء مستقل، فكان هيرجّع أول حلقة في المسلسل بالغلط
                        if (item.type === "episode" && /^tt\d+$/i.test(String(movieId))) continue;

                        // ⚠️ لازم نتأكد إن الـ ID ده ظاهر كجزء مستقل من الرابط، مش مجرد جزء من رقم أطول.
                        // مثال حقيقي حصل: movieId="126" كان بيتطابق غلط مع رابط ديزني+ "aladdin/1260014815"
                        // لأن "126" موجودة كبداية الرقم الأطول، فكانت بتجيب فيلم غلط تماماً.
                        // هنا بنتحقق إن الـ ID محاط بحدود مش أرقام/حروف (أو بداية/نهاية النص) قبل ما نعتبره تطابق فعلي
                        const matched = Object.values(item.platforms).some(p =>
                            p && (String(p.id) === movieId || (p.url && idAppearsAsWholeSegment(p.url, movieId)))
                        );

                        if (matched) {
                            // _libraryKey: مفتاح العمل نفسه في المكتبة الموحدة (يُستخدم لاحقاً
                            // كمساحة اسم موحّدة لحفظ حالة تشغيل/إيقاف كل جملة فلتر بمفردها،
                            // بحيث تتطابق مع نفس المفتاح المستخدم في popup.js)
                            foundItem = { ...item, _libraryKey: key };
                            break;
                        }
                    }
                }
            }

            if (foundItem) {
                console.log(`✅ تم العثور على المحتوى: ${foundItem.title || movieId}`);
                // 🟢 الشارة تتفعّل هنا فقط، أي فعلياً لحظة نجاح جلب الفلاتر — مش تخمين من شكل الرابط
                if (tabId !== null) {
                    chrome.action.setBadgeText({ text: "ON", tabId: tabId });
                    chrome.action.setBadgeBackgroundColor({ color: "#10b981", tabId: tabId });
                }
                sendResponse({ success: true, data: foundItem });
            } else {
                console.warn("❌ لم يتم العثور على المحتوى في المكتبة الموحدة.");
                if (tabId !== null) chrome.action.setBadgeText({ text: "", tabId: tabId });
                sendResponse({ success: false, error: "Not Found" });
            }

        } catch (error) {
            console.error("🔥 خطأ في البحث:", error);
            if (tabId !== null) chrome.action.setBadgeText({ text: "", tabId: tabId });
            sendResponse({ success: false, error: error.message });
        }
    })();

    return true; // ضروري جداً للـ async
}

    // 1.5. جلب /library كامل للـ popup (تبويب المنصات + الفلاتر الحالية) — نفس المصدر الموثّق
    // (getLibraryData) اللي بيستخدمه FETCH_FILTERS_BACKGROUND فوق، مش قراءة مباشرة تانية
    if (request.type === "FETCH_LIBRARY_DATA") {
        (async () => {
            const result = await fetchAuthenticatedLibrary();
            sendResponse(result);
        })();
        return true;
    }

    // 2. تحديث شارة الـ Badge
    if (request.type === "UPDATE_BADGE_STATUS") {
        const tabId = sender.tab ? sender.tab.id : null;
        if (request.count > 0) {
            chrome.action.setBadgeText({ text: "ON", tabId: tabId });
            chrome.action.setBadgeBackgroundColor({ color: "#10b981", tabId: tabId });
        } else {
            chrome.action.setBadgeText({ text: "", tabId: tabId });
        }
        sendResponse({ success: true });
        return;
    }

    // 3. (محذوفة) كان هنا "fetchFromFirebase" — كود قديم بيعمل fetch مباشر وبدون توثيق لأي
    // مسار في Realtime Database. اتأكدنا (grep على المشروع كله) إنه مالوش أي مستدعي حالياً،
    // فاتشال نهائياً بدل ما نسيبه مرجع تاني لقراءة مباشرة غير موثّقة لقاعدة البيانات

    // 4. التقاط كود المسوّق (Affiliate) اللي بعته content-affiliate.js من صفحة الموقع
    // التسويقي، وحفظه محلياً عشان يُستخدم لاحقاً وقت إنشاء حساب جديد لأول مرة فقط
    // (راجع nazafaEnsureUserDoc في auth-common.js)
    if (request.type === "NAZAFA_AFFILIATE_CAPTURED" && request.slug) {
        chrome.storage.local.set({ nazafaAffiliate: request.slug });
        return;
    }
});

// ==========================================
// إعادة ضبط الشارة عند كل تنقل جديد للصفحة
// (الشارة "ON" الفعلية بتتفعّل فقط من داخل FETCH_FILTERS_BACKGROUND أعلاه،
// أي لحظة نجاح جلب الفلاتر فعلياً — مش تخمين من شكل الرابط)
// ==========================================
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'loading') {
        chrome.action.setBadgeText({ text: "", tabId: tabId });
    }
});

// ==========================================
// 🔗 فتح الموقع التسويقي أول ما الإضافة تتثبّت لأول مرة
// لو المستخدم دخل برابط مسوّق (nazafa-entertainment.org/<slug>) قبل ما يثبّت الإضافة،
// content-affiliate.js لسه معملوش حاجة (الإضافة معندهاش وصول للصفحة قبل التثبيت أصلاً).
// فتح تاب على الموقع فوراً بعد التثبيت بيخلي content-affiliate.js يشتغل على نفس الصفحة
// (اللي فيها الكوكي محفوظة بالفعل من زيارة المستخدم السابقة) ويلتقط القيمة فوراً.
// details.reason === "install" بس (مش "update") عشان ميتفتحش تاب جديد مع كل تحديث للإضافة.
// ==========================================
chrome.runtime.onInstalled.addListener((details) => {
    nazafaEnsureInstallInfo(details.reason === "install").then(nazafaUpdateUninstallUrl);
});
chrome.runtime.onStartup.addListener(() => { nazafaEnsureInstallInfo(false).then(nazafaUpdateUninstallUrl); nazafaCheckAppStatus(); });

// ==========================================
// 📣 إشعارات التحديث والحالة (شريط صغير في البوب أب — راجع UpdateBanner في popup-app.js)
// 1) بعد التحديث: بنسجّل "اتحدّثت من X لـ Y" عشان البوب أب يقول للمستخدم يعمل refresh لصفحة المنصة
// 2) حالة عن بُعد: بنجيب {latest, minVersion, notice} من Cloud Function getAppStatus كل 6 ساعات
// (Cloud Function بدل ملف على الموقع: من غير ما نحتاج host_permissions جديدة — إضافة صلاحية موقع
// ممكن تعطّل الإضافة عند المستخدمين لحد ما يوافقوا من جديد)
// ==========================================
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === "update") {
        chrome.storage.local.set({ nazafaJustUpdated: { from: details.previousVersion || "", to: chrome.runtime.getManifest().version, at: Date.now() } });
    }
    try { chrome.alarms.create("nazafa-app-status", { periodInMinutes: 360, delayInMinutes: 1 }); } catch (e) {}
});
chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === "nazafa-app-status") nazafaCheckAppStatus(); });

async function nazafaCheckAppStatus() {
    try {
        const res = await fetch(`${NAZAFA_FUNCTIONS_BASE_URL}/getAppStatus`, { method: "GET" });
        if (!res.ok) return;
        const data = await res.json();
        await chrome.storage.local.set({ nazafaAppStatus: { latest: data.latest || null, minVersion: data.minVersion || null, notice: data.notice || null, checkedAt: Date.now() } });
    } catch (e) { /* تجاهل: مفيش إنترنت أو السيرفر مش متاح، هنعيد المحاولة بعد 6 ساعات */ }
}
nazafaCheckAppStatus();

// زرار "حدّث الآن" في البوب أب: بنطلب من كروم يفحص التحديثات، ولو فيه تحديث جاهز بنعيد تحميل الإضافة
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!request || request.type !== "NAZAFA_REQUEST_UPDATE") return;
    try {
        chrome.runtime.requestUpdateCheck((status) => {
            sendResponse({ status });
            if (status === "update_available") setTimeout(() => chrome.runtime.reload(), 300);
        });
    } catch (e) { sendResponse({ status: "error" }); }
    return true; // رد غير متزامن
});

// ==========================================
// 👋 رابط ما بعد الحذف (setUninstallURL) — تسجيل صامت بدون أي مجهود من المستخدم
// كروم بيفتح الرابط ده في تاب جديد بعد حذف الإضافة، ومبيشغّلش أي كود وقت الحذف نفسه — فلازم
// نحدّث الرابط دورياً بآخر بيانات (إصدار، أيام الاستخدام، حالة الاشتراك، آخر منصة، فتح البوب أب).
// الصفحة (uninstall.html على الموقع) بتبعت الباراميترات دي للسيرفر أول ما تتحمّل حتى لو المستخدم
// قفلها فوراً. مفيش أي بيانات شخصية: معرّف تثبيت عشوائي بس، من غير بريد ولا اسم ولا حساب.
// ==========================================
const NAZAFA_UNINSTALL_PAGE = "https://nazafa-entertainment.org/uninstall.html";

async function nazafaEnsureInstallInfo(isFreshInstall) {
    const res = await chrome.storage.local.get(["nazafaInstallInfo"]);
    if (res.nazafaInstallInfo && res.nazafaInstallInfo.installId) return res.nazafaInstallInfo;
    const info = {
        installId: (self.crypto && self.crypto.randomUUID) ? self.crypto.randomUUID() : (Date.now().toString(16) + Math.random().toString(16).slice(2)),
        installedAt: Date.now(),
        approx: !isFreshInstall // لو الإضافة كانت متثبّتة قبل ما الميزة دي تنزل، تاريخ التثبيت الحقيقي مجهول
    };
    await chrome.storage.local.set({ nazafaInstallInfo: info });
    return info;
}

let nazafaUninstallUrlTimer = null;
function nazafaUpdateUninstallUrl() {
    // المشروع أصبح مجانياً ومفتوح المصدر والموقع أُغلق: لا صفحة حذف ولا تتبّع
    try { chrome.runtime.setUninstallURL(""); } catch (e) {}
    if (true) return;
    clearTimeout(nazafaUninstallUrlTimer);
    nazafaUninstallUrlTimer = setTimeout(async () => {
        try {
            const res = await chrome.storage.local.get(["nazafaInstallInfo", "nazafaSubscription", "nazafaLastPlatform", "nazafaPopupOpens"]);
            const info = res.nazafaInstallInfo;
            if (!info) return;
            const days = Math.max(0, Math.floor((Date.now() - info.installedAt) / 86400000));
            const sub = res.nazafaSubscription || {};
            const params = new URLSearchParams({
                i: info.installId,
                v: chrome.runtime.getManifest().version,
                d: String(days) + (info.approx ? "+" : ""),
                s: String(sub.status || "signed_out").slice(0, 20),
                p: String(res.nazafaLastPlatform || "none").slice(0, 30),
                o: String(Math.min(res.nazafaPopupOpens || 0, 999))
            });
            chrome.runtime.setUninstallURL(`${NAZAFA_UNINSTALL_PAGE}?${params.toString()}`);
        } catch (e) { /* تجاهل */ }
    }, 1500);
}
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.nazafaSubscription || changes.nazafaLastPlatform || changes.nazafaPopupOpens || changes.nazafaInstallInfo) {
        nazafaUpdateUninstallUrl();
    }
});
nazafaEnsureInstallInfo(false).then(nazafaUpdateUninstallUrl);

// ==========================================
// 🔁 تشغيل تلقائي على التابات المفتوحة مسبقاً بعد التثبيت/التحديث
// (بدونه كان لازم المستخدم يعمل refresh للصفحة عشان تشتغل الإضافة)
// ==========================================
chrome.runtime.onInstalled.addListener(async () => {
    try {
        const cs = chrome.runtime.getManifest().content_scripts || [];
        for (const entry of cs) {
            const tabs = await chrome.tabs.query({ url: entry.matches });
            for (const tab of tabs) {
                if (!tab.id || /^(chrome|edge|about|chrome-extension):/.test(tab.url || "")) continue;
                const world = entry.world === "MAIN" ? "MAIN" : "ISOLATED";
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id, allFrames: !!entry.all_frames },
                        files: entry.js, world
                    });
                } catch (e) { /* تاب غير مسموح/لم يعد موجوداً */ }
            }
        }
    } catch (e) { console.warn("inject existing tabs failed", e); }
});

// بيحدد اسم المنصة من رابط التاب (للإحصاء الصامت بس) ويحفظه لو اتغيّر
const NAZAFA_PLATFORM_HOSTS = ["netflix", "primevideo", "amazon", "disneyplus", "shahid", "osnplus", "yango", "apple", "watchit", "tod.tv", "starzplay", "jawwy", "stctv", "bein", "stremio", "youtube", "dailymotion"];
let nazafaLastPlatformCached = null;
function nazafaRecordPlatformFromTab(tab) {
    try {
        const host = new URL(tab.url).hostname.toLowerCase();
        const hit = NAZAFA_PLATFORM_HOSTS.find((h) => host.includes(h));
        if (hit && hit !== nazafaLastPlatformCached) {
            nazafaLastPlatformCached = hit;
            chrome.storage.local.set({ nazafaLastPlatform: hit });
        }
    } catch (e) { /* تجاهل */ }
}

// ==========================================
// 🐞 إصلاح حرج: آبل تي في+ (نفس مشكلة برايم فيديو — رابط الصفحة ثابت بين كل الحلقات، راجع
// nazafaExtractAppleTVLiveEpisodeId في main.script.js للسياق الكامل). حاولنا الأول نعترض طلب
// play-metadata/vod (اللي بيحمل externalId المميّز للحلقة) بنفس طريقة برايم فيديو (اعتراض
// window.fetch/XHR جوه الـ MAIN world content script) — اتأكد عملياً (بتجربة مباشرة من
// المستخدم بسكريبت console منفصل كمان، مش بس الإضافة) إنها مش بتمسك الطلب ده خالص، حتى بعد
// التأكد من كل الفريمات المتاحة في DevTools. السبب الأرجح: آبل بتستخدم Service Worker خاص بيها
// (أو فريم معزول/opaque-origin زي "fetch-proxy.html" اللي ظهر في اللوج) بيعمل الطلب ده بمعزل
// تام عن أي JS context تقدر الإضافة توصله بـ content script عادي — window.fetch بتاعنا مبيتنفذش
// أصلاً في السياق ده. الحل البديل: بدل الاعتراض على مستوى الـ JS، بنراقب الطلب على مستوى الشبكة
// نفسها من الـ background (chrome.webRequest)، وده بيشتغل بغض النظر تماماً عن مين اللي عمل الطلب
// فعلياً (صفحة عادية، iframe معزول، أو Service Worker) — لأنه بيراقب حركة الشبكة الفعلية اللي
// بتوصل للمتصفح، مش استدعاءات الـ JS نفسها.
// ==========================================
const NAZAFA_APPLETV_PLAYMETADATA_URL_FILTER = { urls: ["https://tv.apple.com/api/uts/v3/contents/play-metadata/vod*"] };
if (chrome.webRequest && chrome.webRequest.onBeforeRequest) {
    chrome.webRequest.onBeforeRequest.addListener(
        (details) => {
            try {
                if (!details.tabId || details.tabId < 0) return; // طلب مش تابع لأي تاب مفتوح (تجاهله)
                const u = new URL(details.url);
                const externalId = u.searchParams.get("externalId");
                if (!externalId) return;
                chrome.tabs.sendMessage(details.tabId, {
                    type: "NAZAFA_APPLETV_LIVE_EPISODE_ID_FROM_BG",
                    id: externalId
                }, () => {
                    // بنتجاهل chrome.runtime.lastError عمداً — لو التاب لسه مبيقاش عنده content
                    // script شغّال (تحميل مبكر جداً)، مفيش داعي نعمل حاجة، الفحص الدوري في
                    // isolated.script.js هيمسك القيمة صح في المرة الجاية على أي حال
                    void chrome.runtime.lastError;
                });
            } catch (e) { /* تجاهل */ }
        },
        NAZAFA_APPLETV_PLAYMETADATA_URL_FILTER
    );
}