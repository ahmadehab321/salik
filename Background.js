importScripts('firebase-config.js', 'app-config.js');

function idAppearsAsWholeSegment(url, id) {
    if (!url || !id) return false;
    if (String(id).length < 3) return false;
    if (!/\d/.test(String(id)) && String(id).length < 8) return false;
    const escaped = String(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('(^|[^0-9A-Za-z])' + escaped + '($|[^0-9A-Za-z])');
    return re.test(String(url));
}

const SUBSCRIPTION_CHECK_ALARM = "nazafa-subscription-check";

async function getStoredSession() {
    const res = await chrome.storage.local.get(['nazafaSession']);
    return res.nazafaSession || null;
}

async function getStoredSubscription() {
    const res = await chrome.storage.local.get(['nazafaSubscription']);
    return { isPremium: true, status: "free", checkedAt: Date.now() };
}

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

async function refreshIdTokenIfNeeded(session) {
    const expiresAt = session.tokenExpirationTime ? new Date(session.tokenExpirationTime).getTime() : 0;
    if (expiresAt > Date.now() + 60000) return session.idToken;

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

async function refreshSubscriptionStatus() {
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
                void chrome.runtime.lastError;
            });
        });
    });
}

chrome.alarms.create(SUBSCRIPTION_CHECK_ALARM, { periodInMinutes: 360 });
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === SUBSCRIPTION_CHECK_ALARM) refreshSubscriptionStatus();
});
refreshSubscriptionStatus();

const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${NAZAFA_FIREBASE_CONFIG.projectId}/databases/(default)/documents`;

function decodeIdTokenClaims(idToken) {
    try {
        const payload = idToken.split(".")[1];
        const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
        return JSON.parse(decodeURIComponent(escape(json)));
    } catch (e) { return {}; }
}

async function ensureUserDocRest(uid, idToken, profile) {
    const headers = { "Authorization": `Bearer ${idToken}`, "Content-Type": "application/json" };
    const getRes = await fetch(`${FIRESTORE_BASE}/users/${uid}`, { headers });
    const nowIso = new Date().toISOString();

    if (getRes.status === 404) {
        const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

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
                isPremium: { booleanValue: true },
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

    if (request.type === "NAZAFA_SIGN_IN_GOOGLE") {
        (async () => {
            try {
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

    if (request.type === "SESSION_UPDATED") {
        refreshSubscriptionStatus().then(status => sendResponse({ success: true, status }));
        return true;
    }

    if (request.type === "GET_SUBSCRIPTION_STATUS") {
        getStoredSubscription().then(status => {
            sendResponse({ success: true, ...status });
            const isStale = !status.checkedAt || (Date.now() - status.checkedAt > 10 * 60 * 1000);
            if (isStale) refreshSubscriptionStatus();
        });
        return true;
    }


if (request.type === "FETCH_FILTERS_BACKGROUND") {
    const movieId = String(request.movieId || "").trim();
    const tabId = sender.tab ? sender.tab.id : null;
    if (sender.tab) nazafaRecordPlatformFromTab(sender.tab);

    (async () => {
        try {

            console.log(`🔍 البحث عن محتوى: ${movieId}...`);

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
                if (library[movieId]) {
                    foundItem = { ...library[movieId], _libraryKey: movieId };
                } else {
                    for (const key in library) {
                        const item = library[key];
                        if (!item || !item.platforms) continue;
                        if (item.type === "series") continue;
                        if (item.type === "episode" && /^tt\d+$/i.test(String(movieId))) continue;

                        const matched = Object.values(item.platforms).some(p =>
                            p && (String(p.id) === movieId || (p.url && idAppearsAsWholeSegment(p.url, movieId)))
                        );

                        if (matched) {
                            foundItem = { ...item, _libraryKey: key };
                            break;
                        }
                    }
                }
            }

            if (foundItem) {
                console.log(`✅ تم العثور على المحتوى: ${foundItem.title || movieId}`);
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

    return true;
}

    if (request.type === "FETCH_LIBRARY_DATA") {
        (async () => {
            const result = await fetchAuthenticatedLibrary();
            sendResponse(result);
        })();
        return true;
    }

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


    if (request.type === "NAZAFA_AFFILIATE_CAPTURED" && request.slug) {
        chrome.storage.local.set({ nazafaAffiliate: request.slug });
        return;
    }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'loading') {
        chrome.action.setBadgeText({ text: "", tabId: tabId });
    }
});

chrome.runtime.onInstalled.addListener((details) => {
    nazafaEnsureInstallInfo(details.reason === "install").then(nazafaUpdateUninstallUrl);
});
chrome.runtime.onStartup.addListener(() => { nazafaEnsureInstallInfo(false).then(nazafaUpdateUninstallUrl); nazafaCheckAppStatus(); });

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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!request || request.type !== "NAZAFA_REQUEST_UPDATE") return;
    try {
        chrome.runtime.requestUpdateCheck((status) => {
            sendResponse({ status });
            if (status === "update_available") setTimeout(() => chrome.runtime.reload(), 300);
        });
    } catch (e) { sendResponse({ status: "error" }); }
    return true;
});

const NAZAFA_UNINSTALL_PAGE = "https://nazafa-entertainment.org/uninstall.html";

async function nazafaEnsureInstallInfo(isFreshInstall) {
    const res = await chrome.storage.local.get(["nazafaInstallInfo"]);
    if (res.nazafaInstallInfo && res.nazafaInstallInfo.installId) return res.nazafaInstallInfo;
    const info = {
        installId: (self.crypto && self.crypto.randomUUID) ? self.crypto.randomUUID() : (Date.now().toString(16) + Math.random().toString(16).slice(2)),
        installedAt: Date.now(),
        approx: !isFreshInstall
    };
    await chrome.storage.local.set({ nazafaInstallInfo: info });
    return info;
}

let nazafaUninstallUrlTimer = null;
function nazafaUpdateUninstallUrl() {
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

const NAZAFA_APPLETV_PLAYMETADATA_URL_FILTER = { urls: ["https://tv.apple.com/api/uts/v3/contents/play-metadata/vod*"] };
if (chrome.webRequest && chrome.webRequest.onBeforeRequest) {
    chrome.webRequest.onBeforeRequest.addListener(
        (details) => {
            try {
                if (!details.tabId || details.tabId < 0) return;
                const u = new URL(details.url);
                const externalId = u.searchParams.get("externalId");
                if (!externalId) return;
                chrome.tabs.sendMessage(details.tabId, {
                    type: "NAZAFA_APPLETV_LIVE_EPISODE_ID_FROM_BG",
                    id: externalId
                }, () => {
                    void chrome.runtime.lastError;
                });
            } catch (e) { /* تجاهل */ }
        },
        NAZAFA_APPLETV_PLAYMETADATA_URL_FILTER
    );
}