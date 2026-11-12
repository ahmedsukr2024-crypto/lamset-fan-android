window.lamsetNativeExport = async (data, filename, mimeType = 'text/csv') => {
  if (typeof data !== 'string' || !data.length) throw new Error('محتوى التقرير فارغ.');
  const safeName = String(filename || 'lamset-fan-report.csv').replace(/[^a-zA-Z0-9._-]/g, '-');
  const saved = await Filesystem.writeFile({
    path: 'LAMSET-FAN/' + safeName,
    data,
    directory: Directory.Documents,
    encoding: Encoding.UTF8,
    recursive: true
  });
  if (!saved?.uri) throw new Error('تعذر حفظ التقرير على الهاتف.');
  // Android FileProvider exposes the cache directory by default. Keep the
  // permanent copy in Documents and share a cache copy as a real attachment.
  const shareCopy = await Filesystem.writeFile({
    path: 'LAMSET-FAN/Shared/' + safeName,
    data,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
    recursive: true
  });
  if (!shareCopy?.uri) throw new Error('تم حفظ التقرير، لكن تعذر تجهيز نسخة المشاركة.');
  const isDocument = mimeType === 'text/html' || /\\.html?$/i.test(safeName);
  await Share.share({
    title: isDocument ? 'مستند لمسة فن' : 'تقرير لمسة فن',
    text: isDocument ? 'مستند جاهز للطباعة من LAMSET FAN' : 'تقرير من LAMSET FAN',
    files: [shareCopy.uri],
    dialogTitle: isDocument ? 'حفظ أو طباعة المستند' : 'حفظ أو مشاركة التقرير'
  });
  return { ...saved, shareUri: shareCopy.uri, mimeType };
};
import { App } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';
import { CapacitorUpdater } from '@capgo/capacitor-updater';

const isNative = !!window.Capacitor?.isNativePlatform?.();
window.lamsetGetAppInfo = async () => {
  if (!isNative) return { name: 'LAMSET FAN', version: '1.0.0', build: 'web' };
  const info = await App.getInfo();
  return {
    name: info?.name || 'LAMSET FAN',
    version: info?.version || '1.0.0',
    build: info?.build || ''
  };
};
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

const LAMSET_BACKUP_DIR = 'LAMSET-FAN/Backups';
const LAMSET_BACKUP_PREFIX = 'lamset-fan-backup-';
const LAMSET_BACKUP_RETENTION = 10;

async function pruneLamsetLocalBackups() {
  try {
    const listing = await Filesystem.readdir({ path: LAMSET_BACKUP_DIR, directory: Directory.Documents });
    const files = (listing.files || [])
      .filter(item => item.type === 'file' && item.name.startsWith(LAMSET_BACKUP_PREFIX) && item.name.endsWith('.json'))
      .sort((a, b) => a.name.localeCompare(b.name));
    const expired = files.slice(0, Math.max(0, files.length - LAMSET_BACKUP_RETENTION));
    for (const file of expired) {
      await Filesystem.deleteFile({ path: LAMSET_BACKUP_DIR + '/' + file.name, directory: Directory.Documents });
    }
    return { kept: Math.min(files.length, LAMSET_BACKUP_RETENTION), removed: expired.length };
  } catch (error) {
    console.warn('LAMSET backup retention cleanup skipped', error);
    return { kept: null, removed: 0 };
  }
}

window.lamsetGetLocalBackups = async () => {
  if (!isNative) return { supported: false, files: [] };
  try {
    const listing = await Filesystem.readdir({ path: LAMSET_BACKUP_DIR, directory: Directory.Documents });
    const files = (listing.files || [])
      .filter(item => item.type === 'file' && item.name.startsWith(LAMSET_BACKUP_PREFIX) && item.name.endsWith('.json'))
      .sort((a, b) => b.name.localeCompare(a.name));
    return { supported: true, files: files.map(item => ({ name: item.name, size: item.size || 0 })) };
  } catch (error) {
    return { supported: true, files: [], error: String(error?.message || error) };
  }
};

window.lamsetExportTransferBackup = async (json) => {
  if (!isNative) throw new Error('نقل البيانات المباشر متاح داخل تطبيق Android فقط.');
  if (typeof json !== 'string' || !json.trim()) throw new Error('بيانات النقل فارغة.');
  const filename = 'lamset-fan-transfer-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
  const saved = await Filesystem.writeFile({ path: 'LAMSET-FAN/Exports/' + filename, data: json, directory: Directory.Documents, encoding: Encoding.UTF8, recursive: true });
  if (!saved?.uri) throw new Error('تعذر حفظ ملف النقل على الهاتف.');
  const shareCopy = await Filesystem.writeFile({ path: 'LAMSET-FAN/Shared/' + filename, data: json, directory: Directory.Cache, encoding: Encoding.UTF8, recursive: true });
  if (!shareCopy?.uri) throw new Error('تم حفظ الملف، لكن تعذر تجهيز مرفق الإرسال.');
  await Share.share({ title: 'نقل بيانات لمسة فن إلى هاتف جديد', text: 'نسخة كاملة من بيانات لمسة فن تشمل المنتجات والعملاء والطلبات والمخزون والإعدادات والصور. على الهاتف الجديد ثبّت التطبيق واختر استعادة نسخة على هذا الهاتف.', files: [shareCopy.uri], dialogTitle: 'إرسال نسخة لمسة فن إلى الهاتف الجديد' });
  return { ...saved, filename, shareUri: shareCopy.uri };
};
window.lamsetNativeBackup = async (json, options = {}) => {
  if (typeof json !== 'string' || !json.trim()) throw new Error('بيانات النسخة الاحتياطية فارغة.');
  const filename = LAMSET_BACKUP_PREFIX + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
  const saved = await Filesystem.writeFile({
    path: LAMSET_BACKUP_DIR + '/' + filename,
    data: json,
    directory: Directory.Documents,
    encoding: Encoding.UTF8,
    recursive: true
  });
  if (!saved?.uri) throw new Error('تم إنشاء الملف دون الحصول على مسار صالح لحفظه.');
  const retention = await pruneLamsetLocalBackups();
  let shareError = '';
  if (options?.share === false) return { ...saved, filename, retention, shareError };
  try {
    // Keep the durable backup in Documents, but share a cache copy so
    // Android FileProvider can grant receiving apps access to the attachment.
    const shareCopy = await Filesystem.writeFile({
      path: 'LAMSET-FAN/Shared/' + filename,
      data: json,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
      recursive: true
    });
    if (!shareCopy?.uri) throw new Error('تعذر تجهيز ملف النسخة للمشاركة.');
    await Share.share({
      title: 'نسخة LAMSET FAN الاحتياطية',
      text: 'نسخة احتياطية من بيانات لمسة فن.',
      files: [shareCopy.uri],
      dialogTitle: 'مشاركة النسخة الاحتياطية'
    });
  } catch (error) {
    shareError = String(error?.message || error);
    console.warn('LAMSET backup share sheet was not completed', error);
  }
  return { ...saved, filename, retention, shareError };
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
  if (!enabled) { businessNotificationsEnabled = false; localStorage.setItem('lamset-business-notifications','false'); return true; }
  const p = await LocalNotifications.checkPermissions(); const granted = p.display === 'granted' ? p : await LocalNotifications.requestPermissions();
  if (granted.display !== 'granted') return false;
  businessNotificationsEnabled = true; localStorage.setItem('lamset-business-notifications','true'); return true;
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

// Automatic backups run silently when the app is active and a backup is due.


/* LAMSET SETTINGS: About & OTA update controls */
function mountLamsetAboutAndUpdates() {
  const settings = document.getElementById('settings');
  if (!settings || document.getElementById('lamsetAboutUpdates')) return;

  const card = document.createElement('section');
  card.id = 'lamsetAboutUpdates';
  card.className = 'card';
  card.setAttribute('aria-labelledby', 'lamsetAboutTitle');
  card.innerHTML = `
    <div class="sectionhead">
      <h3 id="lamsetAboutTitle">حول التطبيق والتحديثات</h3>
      <span class="pill">LAMSET FAN</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:10px 0">
      <div style="padding:12px;border:1px solid var(--line);border-radius:13px;background:var(--lavender-2)">
        <small class="muted">الإصدار الأساسي</small>
        <strong id="lamsetAppVersion" style="display:block;margin-top:5px">جارٍ قراءة الإصدار...</strong>
      </div>
      <div style="padding:12px;border:1px solid var(--line);border-radius:13px;background:var(--lavender-2)">
        <small class="muted">بياناتك</small>
        <strong style="display:block;margin-top:5px">محفوظة على الجهاز</strong>
      </div>
    </div>
    <p class="muted">تحقق من توفر تحديثات التطبيق. التحديث الهوائي متاح في نسخة Android عند نشر حزمة تحديث معتمدة. لا تحذف التطبيق لإجراء التحديث.</p>
    <div class="actions">
      <button type="button" id="lamsetCheckUpdate">التحقق من وجود تحديث</button>
      <button type="button" class="ghost" id="lamsetInstallUpdate" hidden>تنزيل وتثبيت التحديث</button>
    </div>
    <p id="lamsetUpdateStatus" class="muted" role="status" aria-live="polite">لم يتم التحقق بعد.</p>
    <small class="muted">احتفظ بنسخة احتياطية خارج الهاتف قبل أي تحديث كبير. التحديث لا يُفترض أن يمسح بياناتك، لكن النسخة الاحتياطية تظل ضرورية.</small>
  `;
  settings.appendChild(card);
  const versionLabel = card.querySelector('#lamsetAppVersion');
  if (versionLabel && typeof window.lamsetGetAppInfo === 'function') {
    window.lamsetGetAppInfo().then(info => {
      versionLabel.textContent = String(info?.version || '1.0.0') + (info?.build ? ' · ' + String(info.build) : '');
    }).catch(() => { versionLabel.textContent = '1.0.0'; });
  }

  const checkButton = card.querySelector('#lamsetCheckUpdate');
  const installButton = card.querySelector('#lamsetInstallUpdate');
  const status = card.querySelector('#lamsetUpdateStatus');
  let updateAvailable = false;

  const setStatus = message => { status.textContent = String(message || ''); };
  checkButton.addEventListener('click', async () => {
    checkButton.disabled = true;
    installButton.hidden = true;
    setStatus('جارٍ التحقق من التحديثات...');
    try {
      const result = await window.lamsetCheckForUpdate();
      if (!result?.supported) {
        setStatus('التحقق من التحديثات الهوائية متاح داخل نسخة Android فقط.');
        return;
      }
      if (result.available) {
        updateAvailable = true;
        setStatus('يتوفر تحديث جديد: ' + result.latestVersion + (result.message ? ' — ' + result.message : ''));
        installButton.hidden = false;
      } else {
        updateAvailable = false;
        setStatus('أنت تستخدم أحدث حزمة متاحة (' + (result.currentVersion || 'الحالية') + ').');
      }
    } catch (error) {
      updateAvailable = false;
      setStatus('تعذر التحقق من التحديثات: ' + String(error?.message || error));
    } finally {
      checkButton.disabled = false;
    }
  });

  installButton.addEventListener('click', async () => {
    if (!updateAvailable) return;
    installButton.disabled = true;
    checkButton.disabled = true;
    setStatus('جارٍ تنزيل التحديث...');
    try {
      const result = await window.lamsetInstallUpdate();
      if (result?.available) {
        setStatus('تم تنزيل التحديث وتجهيزه. قد يعيد التطبيق تشغيل نفسه لتطبيق الحزمة الجديدة.');
      } else {
        setStatus('لا يوجد تحديث جديد للتثبيت.');
        installButton.hidden = true;
      }
    } catch (error) {
      setStatus('تعذر تثبيت التحديث: ' + String(error?.message || error));
    } finally {
      installButton.disabled = false;
      checkButton.disabled = false;
    }
  });

  window.addEventListener('lamset-ota-progress', event => {
    const percent = Math.max(0, Math.min(100, Number(event.detail?.percent) || 0));
    setStatus('جارٍ تنزيل التحديث... ' + Math.round(percent) + '%');
  });
  window.addEventListener('lamset-ota-failed', () => {
    setStatus('فشل تنزيل التحديث. لم يتم استبدال الحزمة الحالية؛ حاول مرة أخرى لاحقًا.');
    installButton.disabled = false;
    checkButton.disabled = false;
  });
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountLamsetAboutAndUpdates, { once: true });
} else {
  mountLamsetAboutAndUpdates();
}

App.addListener('appStateChange', ({ isActive }) => {
  if (isActive) window.dispatchEvent(new Event('lamset-app-resumed'));
}).catch(error => console.warn('LAMSET resume listener unavailable', error));
window.dispatchEvent(new Event('lamset-native-bridge-ready'));
