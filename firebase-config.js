// firebase-config.js
// إعدادات Firebase العامة (Public Web Config) — هذه القيم ليست سرية بطبيعتها
// (مفتاح apiKey الخاص بتطبيقات الويب مصمم ليكون مرئياً في الكود الأمامي؛
// الحماية الحقيقية تأتي من Firestore Security Rules + Cloud Functions،
// وليس من إخفاء هذا الملف).
//
// ⚠️ لا تضع هنا أبداً: مفتاح Paymob السري (Secret Key)، أو أي مفتاح خدمة (Service Account)،
// فهذه يجب أن تبقى فقط داخل بيئة Cloud Functions (راجع دليل التكامل المرفق).

const NAZAFA_FIREBASE_CONFIG = {
  apiKey: "AIzaSyChiMeb3wjqb-JEloMKMHGDqK9MRAMP2VY",
  authDomain: "nazafa-app.firebaseapp.com",
  projectId: "nazafa-app",
  storageBucket: "nazafa-app.firebasestorage.app",
  messagingSenderId: "369352580666",
  appId: "1:369352580666:web:8bd703ab5203b3c3b15f03",
  measurementId: "G-BSSG5Y7NKF",
  databaseURL: "https://nazafa-app-default-rtdb.firebaseio.com"
};

// عنوان قاعدة Cloud Functions (بعد النشر عبر: firebase deploy --only functions)
const NAZAFA_FUNCTIONS_BASE_URL = "https://us-central1-nazafa-app.cloudfunctions.net";

// Client ID الخاص بتطبيق Google OAuth لاستخدامه مع chrome.identity.getAuthToken
// (يُنشأ من Google Cloud Console > Credentials > OAuth Client ID > نوع "Chrome Extension")
// ⚠️ القيمة الفعلية المستخدمة فعلياً موجودة في manifest.json (oauth2.client_id) — هذا المتغيّر
// هنا للتوثيق فقط ولا يُقرأ منه أي كود حالياً، لازم يتحدّث يدوياً لو الـ client_id اتغيّر
const NAZAFA_GOOGLE_OAUTH_CLIENT_ID = "369352580666-89on6f6d3t8ipa9ecpbqlcn82ei7d2ik.apps.googleusercontent.com";

// معرّفات تطبيقات فيسبوك وآبل (لسه لازم تتحدّث بالقيم الحقيقية من Facebook Developers /
// Apple Developer > Services ID قبل ما زرار الدخول عبر فيسبوك/آبل يشتغل فعلياً)
const NAZAFA_FACEBOOK_APP_ID = "REPLACE_WITH_FACEBOOK_APP_ID";
const NAZAFA_APPLE_SERVICE_ID = "REPLACE_WITH_APPLE_SERVICES_ID";

// Client ID من نوع "Web application" (مش Chrome Extension) يُستخدم مع chrome.identity.launchWebAuthFlow
// لتسجيل الدخول بجوجل — لازم يكون فيه Authorized redirect URI مضاف بالظبط:
// https://nkfbehicpfpaefgdoelaopfdjpkahknd.chromiumapp.org/
// (السبب: متصفح Brave عنده مشكلة توافق مع chrome.identity.getAuthToken تخليه يفشل بـ invalid_request،
// فاستخدمنا launchWebAuthFlow بدل منه، وده محتاج client من نوع Web application له Redirect URI صريح)
const NAZAFA_GOOGLE_WEB_CLIENT_ID = "369352580666-dfc54b9l83ig7k0tudj85n3b6citcnqr.apps.googleusercontent.com";

// روابط الشروط والأحكام
const NAZAFA_TERMS_URL = "https://nazafa-entertainment.org/terms";

// بيانات الدفع اليدوي
const NAZAFA_MANUAL_PAYMENT = {
  instapay: "a7mdfekry@instapay",
  vodafoneCash: "01025801913",
  whatsapp: "+201554499185"
};
