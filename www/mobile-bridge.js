window.lamsetNativeExport = async (data, filename, mimeType = 'text/csv') => {
  const safeName = String(filename || 'lamset-fan-report.csv').replace(/[^a-zA-Z0-9._-]/g, '-');
  const encoded = btoa(unescape(encodeURIComponent(data)));
  const saved = await Filesystem.writeFile({ path: 'LAMSET-FAN/' + safeName, data: encoded, directory: Directory.Documents, recursive: true });
  await Share.share({ title: 'تقرير لمسة فن', text: 'تقرير التحليلات من LAMSET FAN', url: saved.uri, dialogTitle: 'حفظ أو مشاركة التقرير' });
  return saved;
};
import { App } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';
import { CapacitorUpdater } from '@capgo/capacitor-updater';

const isNative = !!window.Capacitor?.isNativePlatform?.();
window.lamsetCheckForUpdate = async () => {
  if (!isNative) return { supported: false };
  const [latest, current] = await Promise.all([
    CapacitorUpdater.getLatest(),
    CapacitorUpdater.current()
  ]);
  if (latest?.error) throw new Error(latest.error);
  const currentVersion = current?.bundle?.version || 'builtin';
  const available = !!(latest?.url && latest?.version && latest.version !== currentVersion);
  return {
    supported: true,
    available,
    currentVersion,
    latestVersion: latest?.version || currentVersion,
    message: latest?.message || ''
  };
};
window.lamsetInstallUpdate = async () => {
  if (!isNative) throw new Error('التحديث الهوائي متاح داخل تطبيق Android فقط.');
  const latest = await CapacitorUpdater.getLatest();
  if (latest?.error) throw new Error(latest.error);
  if (!latest?.url || !latest?.version) throw new Error('لا يوجد تحديث جاهز للتنزيل حاليًا.');
  const current = await CapacitorUpdater.current();
  if (latest.version === (current?.bundle?.version || 'builtin')) return { available: false };
  const options = { url: latest.url, version: latest.version };
  if (latest.checksum) options.checksum = latest.checksum;
  if (latest.sessionKey) options.sessionKey = latest.sessionKey;
  if (Array.isArray(latest.manifest)) options.manifest = latest.manifest;
  const bundle = await CapacitorUpdater.download(options);
  if (!bundle?.id || bundle.status === 'error') throw new Error('تعذر تنزيل حزمة التحديث.');
  await CapacitorUpdater.set({ id: bundle.id });
  return { available: true, version: latest.version };
};
if (isNative) {
  CapacitorUpdater.addListener('download', ({ percent }) => {
    window.dispatchEvent(new CustomEvent('lamset-ota-progress', { detail: { percent } }));
  }).catch(error => console.warn('OTA progress listener unavailable', error));
  CapacitorUpdater.addListener('downloadFailed', ({ version }) => {
    window.dispatchEvent(new CustomEvent('lamset-ota-failed', { detail: { version } }));
  }).catch(error => console.warn('OTA failure listener unavailable', error));
  CapacitorUpdater.notifyAppReady().catch(error => console.warn('OTA app-ready notification failed', error));
}

const appLockEnabled = (() => { try { const saved = JSON.parse(localStorage.getItem('lamset_fan_business_manager_v1') || '{}'); return saved?.appSettings?.lockApp !== false; } catch { return true; } })();
let authenticated = false;
let authInProgress = false;

window.lamsetNativeBackup = async (json) => {
  if (typeof json !== 'string' || !json.trim()) throw new Error('بيانات النسخة الاحتياطية فارغة.');
  const filename = `lamset-fan-backup-${new Date().toISOString().slice(0, 10)}-${Date.now()}.json`;
  // Use the app-private cache directory: Android scoped storage does not
  // require broad Documents/storage permissions for a temporary share file.
  // The Android share sheet lets the user save a persistent copy to Files/Drive.
  const saved = await Filesystem.writeFile({
    path: 'LAMSET-FAN/' + filename,
    data: json,
    directory: Directory.Cache,
    recursive: true
  });
  if (!saved?.uri) throw new Error('تم إنشاء الملف دون الحصول على مسار صالح لمشاركته.');
  await Share.share({
    title: 'نسخة LAMSET FAN الاحتياطية',
    text: 'اختر «حفظ في الملفات» أو Google Drive للاحتفاظ بالنسخة واستعادتها لاحقًا.',
    url: saved.uri,
    dialogTitle: 'حفظ النسخة الاحتياطية'
  });
  return saved;
};
window.lamsetRequireBiometric = async (reason = 'تأكيد العملية الحساسة') => {
  if (!isNative) return false;
  const availability = await BiometricAuth.checkBiometry();
  if (!availability.isAvailable) throw new Error('لا توجد بصمة مسجلة ومتاحة للتطبيق. سجّل بصمة في إعدادات الهاتف أولاً.');
  await BiometricAuth.authenticate({ reason, cancelTitle: 'إلغاء', allowDeviceCredential: false, iosFallbackTitle: '', androidTitle: 'تأكيد بالبصمة', androidSubtitle: 'يلزم التحقق بالبصمة لمسح البيانات', androidConfirmationRequired: true, androidBiometryStrength: 'weak' });
  return true;
};

let businessNotificationsEnabled = false;
try { businessNotificationsEnabled = localStorage.getItem('lamset-business-notifications') === 'true'; } catch {}
window.lamsetGetBusinessNotifications = async () => { if (!isNative) return { enabled: false, permission: 'unsupported' }; const p = await LocalNotifications.checkPermissions(); return { enabled: businessNotificationsEnabled && p.display === 'granted', permission: p.display }; };
window.lamsetSetBusinessNotifications = async (enabled) => {
  if (!isNative) return false;
  if (!enabled) { businessNotificationsEnabled = false; localStorage.setItem('lamset-business-notifications','false'); await LocalNotifications.cancel({ notifications: [{ id: 7311 }] }); return true; }
  const p = await LocalNotifications.checkPermissions(); const granted = p.display === 'granted' ? p : await LocalNotifications.requestPermissions();
  if (granted.display !== 'granted') return false;
  businessNotificationsEnabled = true; localStorage.setItem('lamset-business-notifications','true'); await scheduleBackupReminder(); return true;
};
window.lamsetBusinessAlert = async (title, body) => {
  if (!isNative || !businessNotificationsEnabled) return;
  const permission = await LocalNotifications.checkPermissions();
  if (permission.display !== 'granted') return;
  await LocalNotifications.schedule({ notifications: [{ id: Math.floor(Date.now() % 2000000000), title: String(title || 'تنبيه لمسة فن'), body: String(body || 'يوجد تحديث جديد داخل التطبيق.'), schedule: { at: new Date(Date.now() + 1000) } }] });
};
function showLockScreen() {
  let panel = document.getElementById('lamset-lock-screen');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'lamset-lock-screen';
    panel.dir = 'rtl';
    panel.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#f7f6fb;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px;text-align:center;font-family:system-ui';
    panel.innerHTML = '<h2 style="color:#49319f">LAMSET FAN</h2><p>التطبيق مقفول. استخدم بصمة الهاتف أو رمز قفل الجهاز للمتابعة.</p><button id="lamset-unlock" style="padding:12px 22px;border:0;border-radius:10px;background:#6d4bd1;color:white">إعادة المحاولة</button>';
    document.body.appendChild(panel);
    panel.querySelector('#lamset-unlock').addEventListener('click', () => { authenticated = false; authenticate(); });
  }
  panel.style.display = 'flex';
}

async function authenticate() {
  if (!isNative || authenticated || authInProgress) return;
  authInProgress = true;
  try {
    const availability = await BiometricAuth.checkBiometry();
    if (!availability.isAvailable && !availability.deviceIsSecure) {
      throw new Error('لا توجد بصمة مسجلة أو وسيلة قفل آمنة على الهاتف. فعّل بصمة أو PIN/نمط/كلمة مرور من إعدادات الهاتف أولاً.');
    }
    // The native prompt uses biometrics when available and the real Android
    // device credential (PIN/pattern/password) when biometrics are unavailable.
    await BiometricAuth.authenticate({
      reason: 'افتح LAMSET FAN BUSINESS MANAGER',
      cancelTitle: 'إلغاء',
      allowDeviceCredential: true,
      iosFallbackTitle: 'استخدام رمز الهاتف',
      androidTitle: 'تأكيد الهوية',
      androidSubtitle: 'استخدم بصمة الهاتف أو رمز قفل الجهاز',
      androidBiometryStrength: 'weak'
    });
    authenticated = true;
    document.documentElement.classList.remove('app-locked');
    const lockPanel = document.getElementById('lamset-lock-screen');
    if (lockPanel) lockPanel.style.display = 'none';
  } catch (e) {
    document.documentElement.classList.add('app-locked');
    showLockScreen();
  } finally {
    authInProgress = false;
  }
}

async function scheduleBackupReminder() {
  if (!isNative) return;
  try {
    const perm = await LocalNotifications.checkPermissions();
    const granted = perm.display === 'granted' ? perm : await LocalNotifications.requestPermissions();
    if (granted.display !== 'granted') return;
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.some(n => n.id === 7311)) return;
    const first = new Date();
    first.setDate(first.getDate() + 7);
    first.setHours(11, 0, 0, 0);
    await LocalNotifications.schedule({ notifications: [{
      id: 7311,
      title: 'نسخة LAMSET FAN الاحتياطية',
      body: 'حان وقت حفظ نسخة احتياطية من بيانات المنتجات والعملاء والطلبات.',
      schedule: { at: first, repeats: true, every: 'week' },
      extra: { action: 'backup-reminder' }
    }] });
  } catch (e) {
    console.warn('Backup reminder could not be scheduled', e);
  }
}

if (isNative && appLockEnabled) {
  document.documentElement.classList.add('app-locked');
  document.addEventListener('DOMContentLoaded', () => { showLockScreen(); authenticate(); }, { once: true });
  App.addListener('appStateChange', ({ isActive }) => {
    // Android may report the app as inactive while the native biometric
    // prompt is visible. Do not relock or restart authentication in that case.
    if (authInProgress) return;

    if (!isActive) {
      if (authenticated) {
        authenticated = false;
        document.documentElement.classList.add('app-locked');
        showLockScreen();
      }
      return;
    }

    // Authenticate only when returning from a real background transition.
    if (!authenticated) authenticate();
  });
}

if (isNative && businessNotificationsEnabled) scheduleBackupReminder();
