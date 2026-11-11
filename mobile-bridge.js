import { App } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';

const isNative = !!window.Capacitor?.isNativePlatform?.();
let authenticated = false;
let authInProgress = false;

window.lamsetNativeBackup = async (json) => {
  const filename = `lamset-fan-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const saved = await Filesystem.writeFile({ path: filename, data: json, directory: Directory.Cache, recursive: true });
  await Share.share({ title: 'نسخة LAMSET FAN الاحتياطية', text: 'احتفظ بهذا الملف لاستعادة بيانات التطبيق لاحقًا.', url: saved.uri, dialogTitle: 'حفظ النسخة الاحتياطية' });
};

function showLockScreen() {
  let panel = document.getElementById('lamset-lock-screen');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'lamset-lock-screen';
    panel.dir = 'rtl';
    panel.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#f4f7f4;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px;text-align:center;font-family:system-ui';
    panel.innerHTML = '<h2 style="color:#174b36">LAMSET FAN</h2><p>التطبيق مقفول. استخدم بصمة الهاتف أو رمز قفل الجهاز للمتابعة.</p><button id="lamset-unlock" style="padding:12px 22px;border:0;border-radius:10px;background:#174b36;color:white">إعادة المحاولة</button>';
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

if (isNative) {
  document.documentElement.classList.add('app-locked');
  document.addEventListener('DOMContentLoaded', () => { showLockScreen(); authenticate(); }, { once: true });
  App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) {
      authenticated = false;
      authenticate();
    } else {
      document.documentElement.classList.add('app-locked');
      showLockScreen();
    }
  });
  scheduleBackupReminder();
}
