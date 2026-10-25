export const GUIDE = [
  {
    id: "basics",
    title: ["البداية", "Getting started"],
    points: [
      ["لا يحتاج سالك إلى حساب. سجّل الدخول مرة واحدة في كل منصة من «الإعدادات ← المنصات»، وسيبقى الدخول محفوظًا.", "Salik needs no account. Sign in once to each platform from Settings → Platforms; you stay signed in."],
      ["تعمل الفلترة تلقائيًا عند تشغيل أي عمل موجود في المكتبة: كتم وتخطٍّ وتمويه حسب إعداداتك.", "Filtering runs by itself for every title in the library: mute, skip and blur as you set them."],
      ["يمكنك تغيير الفلترة لعمل واحد من صفحته، أو لكل الأعمال من «الفلاتر العامة».", "Change filtering for one title from its page, or for everything from General filters."],
      ["أثناء المشاهدة على التلفزيون: زر القائمة في الريموت يفتح خيارات سالك (العودة، إرسال السجل، إيقاف المحرك).", "While watching on TV, the remote's Menu button opens Salik's options (back, send log, engine off)."]
    ]
  },
  {
    id: "google",
    title: ["تسجيل الدخول بحساب Google", "Signing in with Google"],
    tag: ["مشكلة معروفة", "Known issue"],
    points: [
      ["تمنع Google تسجيل الدخول بحسابها داخل أي متصفح مدمج في تطبيق، لذا تظهر رسالة «قد يكون هذا المتصفح غير آمن». هذا قرار من Google وليس خطأ في سالك.", "Google blocks signing in with a Google account inside any in-app browser (“This browser may not be secure”). That is Google's rule, not a Salik bug."],
      ["في المنصات الأخرى (شاهد وغيرها) سجّل الدخول بالبريد الإلكتروني وكلمة المرور بدلًا من زر Google.", "On other platforms (Shahid and others) sign in with email and password instead of the Google button."],
      ["في يوتيوب يحوّلك سالك تلقائيًا إلى «يوتيوب للتلفزيون» فيظهر رمز تُدخله في yt.be/activate من هاتفك.", "On YouTube, Salik switches to YouTube for TV automatically and shows a code to enter at yt.be/activate on your phone."]
    ]
  },
  {
    id: "drm",
    title: ["نتفليكس وديزني+ وبرايم وOSN+ وشاهد", "Netflix, Disney+, Prime, OSN+ and Shahid"],
    points: [
      ["تعمل عبر الحماية الرقمية للفيديو، وقد تكون جودة الصورة أقل من تطبيق المنصة الرسمي لأن المتصفح المدمج لا يحصل على أعلى مستوى حماية.", "They play through video DRM; picture quality may be lower than in the platform's own app because the in-app browser doesn't get the highest DRM level."],
      ["ديزني+: يعمل التخطي حتى بعد تقديم الفيلم بسحب الشريط، ويستمر التشغيل بعده تلقائيًا.", "Disney+: skipping works even after you drag the progress bar, and playback carries on by itself."],
      ["التمويه الجزئي (مربع فوق جزء من الصورة) يعمل على ديزني+، ويُضبط مكانه تلقائيًا مع اختلاف مقاس الشاشة.", "Partial blur (a box over part of the picture) works on Disney+ and follows the picture on any screen shape."],
      ["حجب الظهور النسائي والرجالي لا يعمل على هذه المنصات، لأن الحماية تمنع قراءة صورة الفيديو.", "Hide women / hide men can't work on these platforms: DRM blocks reading the video picture."]
    ]
  },
  {
    id: "youtube",
    title: ["يوتيوب", "YouTube"],
    points: [
      ["كتم الألفاظ التلقائي يعتمد على ترجمة الفيديو، فلا يعمل إن لم تكن للفيديو ترجمة.", "Auto-mute of bad language uses the video's captions, so it can't work on videos without captions."],
      ["بعد تسجيل الدخول برمز التلفزيون يفتح يوتيوب بواجهة التلفزيون، ويمكنك العودة للواجهة العادية من «الإعدادات ← التطبيق».", "After signing in with the TV code YouTube opens in its TV interface; switch back in Settings → App."],
      ["واجهة التلفزيون مصمّمة للريموت، فاللمس فيها على الهاتف أقل راحة.", "The TV interface is made for a remote; touch on a phone is less comfortable."]
    ]
  },
  {
    id: "stremio",
    title: ["Stremio", "Stremio"],
    tag: ["يحتاج إعدادًا", "Needs setup"],
    points: [
      ["يحتاج Stremio إلى «سيرفر بث» يعمل طوال المشاهدة. موقع Stremio داخل سالك لا يشغّل شيئًا بدونه.", "Stremio needs a streaming server running the whole time you watch. Stremio's website inside Salik plays nothing without it."],
      ["تطبيق Stremio على الهاتف أو التلفزيون يحتوي على السيرفر، لكن أندرويد يجمّده بعد ثوانٍ من الخروج منه، فلا يصلح لهذا الغرض.", "The Stremio app on a phone or TV contains that server, but Android freezes it seconds after you leave it, so it can't be used for this."],
      ["الحل: شغّل السيرفر على حاسوب في المنزل يبقى مفتوحًا أثناء المشاهدة، وعلى نفس شبكة الواي فاي.", "The fix: run the server on a computer at home that stays on while you watch, on the same Wi-Fi."],
      ["الطريقة 1 (Docker على ويندوز أو لينكس): ثبّت Docker Desktop، ثم شغّل ملف docker-compose.yml الخاص بسالك بالأمر: docker compose up -d ، ثم اكتب عنوان الحاسوب في «الإعدادات ← سيرفر Stremio» مثل 192.168.1.10:8080", "Option 1 (Docker on Windows or Linux): install Docker Desktop, run Salik's docker-compose.yml with: docker compose up -d , then enter the computer's address in Settings → Stremio server, e.g. 192.168.1.10:8080"],
      ["الطريقة 2 (الأسهل، تطبيق Stremio للحاسوب): افتح Stremio على الحاسوب واتركه يعمل، ثم اكتب عنوان الحاسوب فقط في «الإعدادات ← سيرفر Stremio» مثل 192.168.1.23 ، وسيضبط سالك موقع Stremio ليبثّ عبره تلقائيًا.", "Option 2 (easiest, Stremio desktop app): keep Stremio open on the computer, then enter just the computer's address in Settings → Stremio server, e.g. 192.168.1.23 . Salik points Stremio's website at it by itself."],
      ["على ويندوز اجعل نوع شبكة الواي فاي «خاصة» (Private)، وافتح منفذ Stremio مرة واحدة من PowerShell كمسؤول: New-NetFirewallRule -DisplayName \"Stremio server (Salik)\" -Direction Inbound -Protocol TCP -LocalPort 11470,12470 -Action Allow -Profile Private", "On Windows set the Wi-Fi network type to Private, and open Stremio's port once from an admin PowerShell: New-NetFirewallRule -DisplayName \"Stremio server (Salik)\" -Direction Inbound -Protocol TCP -LocalPort 11470,12470 -Action Allow -Profile Private"],
      ["لمعرفة عنوان الحاسوب على ويندوز: اكتب ipconfig في موجّه الأوامر وخذ قيمة IPv4 Address. وإن سألك ويندوز عن الجدار الناري فاسمح بالشبكات الخاصة.", "To find the computer's address on Windows: run ipconfig and take the IPv4 Address. If Windows asks about the firewall, allow private networks."],
      ["الفلترة تعمل على Stremio للأعمال الموجودة في المكتبة. أما حجب الظهور النسائي والرجالي فيعمل فقط مع الروابط التي تسمح بقراءة صورة الفيديو.", "Filtering works on Stremio for titles in the library. Hide women / hide men only works with links whose video picture can be read."]
    ]
  },
  {
    id: "gender",
    title: ["حجب الظهور النسائي والرجالي", "Hide women / hide men"],
    tag: ["تجريبي", "Experimental"],
    points: [
      ["يعمل على يوتيوب وDailymotion وStremio فقط، لأنها لا تستخدم حماية تمنع قراءة الصورة.", "Works on YouTube, Dailymotion and Stremio only, because they don't use protection that blocks reading the picture."],
      ["يحلّل الهاتف أو التلفزيون نفسه صورة صغيرة من الفيديو كل جزء من الثانية، ولا يُرسل شيء إلى الإنترنت.", "Your phone or TV analyses a small frame every fraction of a second itself; nothing is sent to the internet."],
      ["قد يتأخر لحظة عند ظهور الوجه، وقد يفوته الوجه الصغير جدًا أو الجانبي، ويزيد استهلاك البطارية.", "It can lag a moment when a face appears, may miss very small or side faces, and uses more battery."]
    ]
  },
  {
    id: "help",
    title: ["إن لم يعمل شيء", "If something doesn't work"],
    points: [
      ["أعد فتح العمل من سالك، وتأكد أنك سجّلت الدخول في المنصة.", "Reopen the title from Salik and make sure you're signed in to the platform."],
      ["أرسل «سجل التشخيص» من «الإعدادات ← التطبيق»، أو استخدم «مراجعة مشهد لم تتم معالجته» إن فات مشهد.", "Send the diagnostic log from Settings → App, or use “Report an unfiltered scene” if a scene slipped through."]
    ]
  }
];
