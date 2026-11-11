# LAMSET FAN BUSINESS MANAGER – Android Edition

هذا مشروع تحويل نسخة V2 إلى تطبيق Android باستخدام Capacitor.

## ما تم تجهيزه
- واجهة V2 الأصلية داخل تطبيق WebView مستقل.
- تخزين بيانات V2 عبر localStorage داخل مساحة التطبيق الخاصة (لا يعتمد على بيانات متصفح خارجي).
- قفل دخول بالبصمة، مع طلب PIN/النمط/كلمة مرور الهاتف الحقيقي كبديل عبر `@aparajita/capacitor-biometric-auth` (لا يستخدم نافذة تأكيد شكلية).
- تذكير محلي أسبوعي بعمل نسخة احتياطية عبر Local Notifications.
- تصدير JSON على أندرويد عبر نافذة المشاركة/الحفظ، مع بقاء استعادة JSON من منتقي الملفات.

## بناء APK
يتطلب جهاز تطوير عليه Node.js وAndroid Studio وAndroid SDK وJDK متوافق.

```bash
npm install
npx cap add android
npm run sync:android
npm run open:android
```

من Android Studio اختر Build > Build Bundle(s) / APK(s) > Build APK(s).

## تنبيهات مهمة
- بيانات `localStorage` محفوظة في مساحة WebView الخاصة بالتطبيق على الهاتف، وتبقى بعد إغلاق التطبيق وإعادة تشغيل الهاتف. حذف التطبيق أو مسح بياناته أو إعادة ضبط الهاتف قد يحذفها.
- التذكير الأسبوعي إشعار يطلب منك إنشاء نسخة JSON؛ ليس رفعًا سحابيًا ولا نسخًا خفيًا تلقائيًا.
- عند عدم توفر بصمة مسجلة، يستخدم التطبيق اعتماد قفل الجهاز الحقيقي إذا كان PIN أو النمط أو كلمة المرور مفعّلًا. إذا لم توجد وسيلة قفل آمنة، يمنع الدخول ويطلب تفعيلها من إعدادات الهاتف.
- لم يتم تضمين مجلد Android المولّد أو APK في هذه الحزمة؛ يلزم تنفيذ `npx cap add android` ثم البناء على جهاز به Android SDK.

## حالة هذه الحزمة

هذه حزمة مصدر محدثة وليست APK. تم فحص ملفات HTML وJavaScript وملفات الإعداد، لكن لم يتم بناء APK أو اختباره على هاتف فعلي في بيئة الإنشاء الحالية لعدم توفر Android SDK وGradle.

## سكريبت بناء سريع
- على Windows: شغّل `build_android_windows.bat` بعد تثبيت Node.js وAndroid Studio وAndroid SDK وJDK.
- على macOS/Linux: شغّل `./build_android_mac_linux.sh` بعد تثبيت المتطلبات نفسها.
- ملف APK التجريبي الناتج سيكون داخل `android/app/build/outputs/apk/debug/app-debug.apk`.
