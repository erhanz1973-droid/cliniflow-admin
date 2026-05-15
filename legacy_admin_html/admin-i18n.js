// Admin Panel i18n — use window.AdminI18n.* only for admin_lang. Dev: ?adminI18nDev=1 blocks rogue localStorage writes; ?adminI18nValidate=1 logs EN vs TR/RU/KA section parity.
(function() {
  'use strict';

  if (window.__cliniflowI18nModuleRan) {
    console.warn('⚠️ i18n already initialized, skipping duplicate load');
    return;
  }
  window.__cliniflowI18nModuleRan = true;
  console.log('I18N INIT RUN', Date.now());
  console.log('I18N FILE VERSION:', 'v27');

  // Reentrancy guard to prevent update recursion (stack overflow)
  let isUpdatingI18n = false;

  var ADMIN_LANG_ALLOWED = new Set(['tr', 'en', 'ru', 'ka']);
  var ADMIN_LANG_STORAGE_KEY = 'admin_lang';

  /** Normalize tags like en-US, EN, ru_RU → tr|en|ru|ka (never browser navigator — admin UI is explicit). */
  function normalizeAdminLang(raw) {
    var s = String(raw == null ? '' : raw).trim().toLowerCase().replace(/_/g, '-');
    if (!s) return 'en';
    var base = s.split('-')[0];
    return ADMIN_LANG_ALLOWED.has(base) ? base : 'en';
  }

  /** Single read path for persisted admin UI language (normalized). */
  function readAdminLangStorage() {
    try {
      return normalizeAdminLang(localStorage.getItem(ADMIN_LANG_STORAGE_KEY) || 'en');
    } catch (e) {
      return 'en';
    }
  }

  /** Only writeAdminLangStorage may set localStorage admin_lang (dev guard enforces this on localhost). */
  var _allowAdminLangWrite = false;

  /** Single write path for localStorage — use only from i18n.setLanguage / init canonicalization. */
  function writeAdminLangStorage(raw) {
    var norm = normalizeAdminLang(raw);
    try {
      _allowAdminLangWrite = true;
      localStorage.setItem(ADMIN_LANG_STORAGE_KEY, norm);
    } catch (e) {
      /* quota / private mode */
    } finally {
      _allowAdminLangWrite = false;
    }
    return norm;
  }

  /** localhost / ?adminI18nDev=1 — warn and ignore rogue writes to admin_lang */
  function installAdminLangStorageGuard() {
    try {
      var h = typeof location !== 'undefined' ? String(location.hostname || '') : '';
      var dev =
        h === 'localhost' ||
        h === '127.0.0.1' ||
        h === '::1' ||
        (typeof location !== 'undefined' && /[?&]adminI18nDev=1(?:&|$)/.test(location.search || ''));
      if (!dev || typeof localStorage === 'undefined') return;
      var orig = localStorage.setItem.bind(localStorage);
      localStorage.setItem = function (key, val) {
        if (key === ADMIN_LANG_STORAGE_KEY && !_allowAdminLangWrite) {
          console.warn(
            '[AdminI18n] Ignored direct localStorage.setItem("' +
              ADMIN_LANG_STORAGE_KEY +
              '"). Use AdminI18n.setLanguage() or window.i18n.setLanguage().',
          );
          return;
        }
        return orig(key, val);
      };
    } catch (e) {
      /* ignore */
    }
  }

  installAdminLangStorageGuard();

  const DASHBOARD_SIDEBAR_I18N = {
    mainMenu: { en: 'Main Menu', tr: 'Ana Menü', ru: 'Главное меню', ka: 'მთავარი მენიუ' },
    management: { en: 'Management', tr: 'Yönetim', ru: 'Управление', ka: 'მართვა' },
    logout: { en: 'Logout', tr: 'Çıkış', ru: 'Выход', ka: 'გასვლა' },
    clinic: { en: 'Clinic', tr: 'Klinik', ru: 'Клиника', ka: 'კლინიკა' }
  };

  function validateTranslations(dict) {
    if (!dict || typeof dict !== 'object') return;
    Object.keys(dict).forEach((key) => {
      const entry = dict[key];
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        ['en', 'tr', 'ru', 'ka'].forEach((lang) => {
          if (entry[lang] == null || String(entry[lang]).trim() === '') {
            console.warn('Missing translation:', key, lang);
          }
        });
      }
    });
  }

  try {
    validateTranslations(DASHBOARD_SIDEBAR_I18N);
  } catch (e) {
    /* ignore */
  }

  function clearStaleNavTextNodes() {
    if (typeof document === 'undefined' || !document.querySelectorAll) return;
    try {
      document.querySelectorAll('*').forEach(function (el) {
        if (el.childNodes.length === 1 && el.childNodes[0].nodeType === 3) {
          const txt = el.textContent.trim();
          if (txt === 'Main Menu' || txt === 'Takvim') {
            el.textContent = '';
          }
        }
      });
    } catch (e) { /* no-op */ }
  }

  const translations = {
    tr: {
      // Common
      common: {
        loading: "Yükleniyor...",
        save: "Kaydet",
        cancel: "İptal",
        delete: "Sil",
        edit: "Düzenle",
        search: "Ara",
        filter: "Filtrele",
        close: "Kapat",
        back: "Geri",
        next: "İleri",
        previous: "Önceki",
        submit: "Gönder",
        yes: "Evet",
        no: "Hayır",
        ok: "Tamam",
        error: "Hata",
        success: "Başarılı",
        warning: "Uyarı",
        doctor: "Doktor"
      },

      adminPages: {
        travelH1: "✈️ Clinifly Admin – Travel",
        travelGlobalWarning: "⚠️ UYARI: Hasta tarafından doldurulacak alan(lar) var. Aşağıdaki uyarıları kontrol edin.",
        travelWordHotel: "Otel",
        travelWordFlights: "Uçuş",
        travelListSeparator: " ve ",
        travelDynamicWarning: "⚠️ UYARI: {list} bilgilerini hasta dolduracak. Bu alanları değiştiremezsiniz. Hasta mobil uygulamadan bu bilgileri girecek.",
        healthH1: "🩺 Clinifly Admin – Health",
        doctorApplicationsH1: "Doktor Başvuruları",
        doctorAppsStatPending: "Beklemede",
        doctorAppsStatApproved: "Onaylı",
        doctorAppsStatRejected: "Reddedildi",
        doctorAppsStatTotal: "Toplam",
        doctorAppsLoading: "Doktorlar yükleniyor...",
        doctorAppsEmptyTitle: "Henüz doktor bulunmuyor",
        doctorAppsEmptyDesc: "Doktor başvurusu henüz yapılmadı.",
        activePatientsH1: "👨‍⚕️ Aktif Hastalar",
        activePatientsStatActive: "Aktif Hasta",
        activePatientsStatPending: "Bekleyen Hasta",
        activePatientsStatTotal: "Toplam Hasta",
        activePatientsStatClinic: "Klinik Sayısı",
        activePatientsSearchPlaceholder: "Hasta adı, email veya telefon ile ara...",
        activePatientsAllClinics: "Tüm Klinikler",
        activePatientsRefresh: "🔄 Yenile",
        activePatientsLoading: "🔄 Yükleniyor...",
        activePatientsEmpty: "Henüz aktif hasta bulunmuyor",
        treatmentCreateH1: "🏥 Treatment Oluştur",
        treatmentCreateSubtitle: "Yeni tedavi grubu oluşturun ve doktor atayın",
        patientDetailH1: "Hasta Detay",
        patientDetailBack: "Geri",
        legacyNavClinics: "Klinikler"
      },
      
      // Suspended Clinic Messages
      clinicSuspended: {
        title: "Hesabınız Geçici Olarak Askıya Alındı",
        description: "Klinik hesabınız şu anda aktif değildir. Bu süre boyunca dashboard ve hasta işlemlerine erişim kısıtlanmıştır.",
        reasonTitle: "Askıya Alma Nedeni",
        reasonGeneric: "Hesabınız sistem ve güvenlik kontrolleri kapsamında incelenmektedir.",
        whatToDoTitle: "Nasıl Tekrar Aktif Olur?",
        steps: [
          "Destek ekibimiz hesabınızı inceliyor",
          "Gerekli olması halinde sizinle iletişime geçilecektir",
          "Sorularınız için bizimle iletişime geçebilirsiniz"
        ],
        contactSupport: "Destek ile İletişime Geç",
        learnMore: "Daha Fazla Bilgi",
        statusBadge: "Durum: Askıda"
      },
      
      // Dashboard (admin.html)
      dashboard: {
        title: "Clinifly Admin – Dashboard",
        sidebar: {
          mainMenu: "Ana Menü",
          management: "Yönetim",
          logout: "Çıkış",
          clinic: "Klinik"
        },
        nav: {
          dashboard: "Dashboard",
          patients: "Hastalar",
          travel: "Seyahat",
          treatment: "Tedaviler",
          schedule: "Takvim",
          doctors: "Doktorlar",
          chat: "Mesajlar",
          leads: "Potansiyel / Atanmamış",
          files: "Dosyalar",
          referrals: "Referanslar",
          health: "Sağlık",
          settings: "Ayarlar",
          login: "Login",
          register: "Klinik Kaydı"
        },
        charts: {
          metricTitleMonthlyPatients: "Aylık Kaydolan Hasta Sayısı",
          metricTitleMonthlyProcedures: "Aylık İşlem Sayısı",
          chartLabelMonthlyRegistered: "Aylık kayıt",
          activePatients: "Aktif Hastalar",
          procedures: "Prosedürler",
          noData: "Veri yok",
          trendNote: "Daha fazla veri toplandıkça trend iyileşecek",
          vsPreviousMonth: "önceki aya göre",
          noPreviousData: "Önceki veri yok",
          summaryActivePatients: "{count} aktif hasta • {month}",
          summaryMonthlyRegistered: "{count} kayıt • {month}",
          summaryProcedures: "{count} prosedür • {month}"
        },
        clinicBadge: {
          noToken: "⚠️ Admin token yok. <a href=\"/admin-register.html\" style=\"color:var(--link);\">Klinik Kaydı</a> ile giriş yapın.",
          switchClinic: "Klinik değiştir",
          clinicInfo: "Klinik: <strong>{name}</strong> ({code}) • Durum: {status}",
          clinicNotFound: "Clinic bilgisi alınamadı. Lütfen admin token'ı kontrol edin."
        },
        upcoming: {
          title: "📅 Clinic Timeline",
          subtitle: "Tüm event'ler (geçmiş ve gelecek)",
          empty: "Event yok.",
          overdue: "⚠️ Gecikmiş Eventler ({count})",
          overdueDesc: "Tarihi geçmiş ama tamamlanmamış {count} event var. Lütfen kontrol edin.",
          status: {
            planned: "Planlandı",
            done: "Tamamlandı",
            completed: "Tamamlandı"
          },
          today: "Bugün",
          tomorrow: "Yarın",
          dayAfterTomorrow: "Öbür gün",
          daysLater: "{count} gün sonra",
          weeksLater: "{count} hafta sonra",
          eventTypes: {
            TRAVEL_EVENT: "Seyahat Etkinliği",
            FLIGHT: "Uçuş",
            HOTEL: "Otel",
            AIRPORT_PICKUP: "Havalimanı Karşılama",
            TREATMENT: "Tedavi",
            CONSULT: "Muayene",
            FOLLOWUP: "Kontrol",
            LAB: "Laboratuvar / Tarama",
            HEALTH: "Sağlık Formu",
            APPOINTMENT: "Randevu",
            PAYMENT: "Ödeme",
            SURGERY: "Cerrahi",
            CHECKUP: "Kontrol"
          },
          summary: {
            overdue: "Gecikmiş:",
            today: "Bugün:",
            tomorrow: "Yarın:",
            patients: "hasta",
            events: "etkinlik"
          }
        },
        planUsage: "Plan ve kullanım",
        activeTreatments: "Aktif tedaviler",
        monthlyUploads: "Aylık yüklemeler",
        referralInvites: "Referans davetleri",
        upgrade: "Yükselt",
        unlimited: "Sınırsız",
        planAlertCrit: "Limite ulaşıldı. Devam etmek için yükseltin.",
        planAlertWarn: "Limitinize yaklaştınız",
        planTierTitle: "Mevcut abonelik seviyesi",
        confirmOpenPricing: "Fiyatlandırma sayfası açılsın mı?\n\n{url}",
        metricsErrorHint: "Ayrıntılar için tarayıcı konsoluna (F12) bakın"
      },
      
      calendar: {
        documentTitle: "Takvim - Clinifly Admin",
        pageTitle: "Randevu Takvimi",
        title: "Randevu Takvimi",
        weekRangeTitle: "Hafta aralığı",
        today: "Bugün",
        week: "Hafta",
        month: "Ay",
        prev: "← Önceki",
        previous: "← Önceki",
        next: "Sonraki →",
        timeColumn: "Saat",
        doctor: "Doktor",
        chair: "Koltuk",
        allDoctors: "Tüm Doktorlar",
        allChairs: "Tüm Koltuklar",
        noEvents: "Etkinlik yok",
        noAppointmentsForWeek: "Seçili hafta için randevu bulunamadı.",
        noAppointmentsForRange: "Seçili dönem için randevu bulunamadı.",
        summaryLine: "{count} randevu • {doctorCount} doktor • {chairCount} koltuk",
        loading: "Yükleniyor...",
        tokenMissing: "Admin token bulunamadı. Tekrar giriş yapın.",
        sessionExpired: "Oturum süresi doldu. Giriş sayfasına yönlendiriliyorsunuz...",
        fetchFailed: "Randevular alınamadı: {message}",
        doctorNotFound: "Doktor bulunamadı",
        chairWithNumber: "Koltuk {n}"
      },
      
      // Pricing (pricing.html)
      pricing: {
        title: "Clinifly Fiyatlandırma",
        subtitle: "Aktif hasta sayınıza göre esnek planlar",
        info: "Sadece aktif hasta sayınıza göre ödeme yapın.",
        free: {
          name: "Free",
          patients: "5 Hasta",
          description: "Clinifly'i gerçek hastalarla denemeniz için.",
          cta: "Başla"
        },
        basic: {
          name: "Pro",
          badge: "Popüler",
          patients: "15 Hasta",
          description: "Büyüyen klinikler için güçlü paket.",
          cta: "Upgrade Et"
        },
        pro: {
          name: "Premium",
          patients: "Sınırsız hasta",
          description: "Kurumsal klinikler için premium destek.",
          cta: "Upgrade Et",
          contactCta: "İletişime Geç"
        },
        periodMonthly: "/ay",
        features: {
          allCore: "Tüm core özellikler",
          patientCommunication: "Hasta iletişimi",
          fileSharing: "Dosya paylaşımı",
          referral: "Referral sistemi",
          branding: "Clinifly branding",
          customBranding: "Özel branding",
          analytics: "Temel analizler",
          support: "E-posta desteği",
          unlimitedPatients: "Sınırsız hasta",
          advancedReferral: "Gelişmiş referral (level, kampanya)",
          prioritySupport: "Öncelikli destek",
          onboarding: "Özel onboarding"
        },
        comparison: {
          feature: "Özellik",
          free: "Free",
          basic: "Pro",
          pro: "Premium",
          patients: "Aktif Hasta Sayısı",
          unlimited: "Sınırsız",
          coreFeatures: "Core Özellikler",
          branding: "Clinifly Branding",
          customBranding: "Özel Branding",
          referral: "Referral Sistemi",
          advancedReferral: "Gelişmiş Referral",
          analytics: "Analizler",
          support: "Destek",
          community: "Topluluk",
          email: "E-posta",
          priority: "Öncelikli"
        },
        faq: {
          title: "Sıkça Sorulan Sorular",
          q1: {
            question: "Aktif hasta sayısı nasıl hesaplanır?",
            answer: "Sadece APPROVED (onaylı) durumundaki hastalar sayılır. Pending, rejected veya cancelled durumundaki hastalar limite dahil edilmez."
          },
          q2: {
            question: "Limit dolduğunda ne olur?",
            answer: "Mevcut hastalarınızla çalışmaya devam edebilirsiniz. Sadece yeni hasta onayı engellenir. Upgrade yaptığınızda işlemlerinize devam edebilirsiniz."
          },
          q3: {
            question: "Plan değiştirebilir miyim?",
            answer: "Evet, istediğiniz zaman planınızı yükseltebilir veya düşürebilirsiniz. Değişiklikler anında geçerli olur."
          },
          q4: {
            question: "Ödeme yöntemleri nelerdir?",
            answer: "Kredi kartı, banka transferi ve yerel ödeme yöntemlerini kabul ediyoruz. Ödemeler SSL güvenliği ile korunur."
          }
        },
        contact: {
          title: "Özel ihtiyaçlarınız mı var?",
          description: "Büyük klinikler ve kurumsal çözümler için özel planlar sunuyoruz.",
          button: "İletişime Geç"
        }
      },
      
      // Treatment (admin-treatment.html) — tek `treatment` objesi (duplicate key yok)
      treatment: {
        patientName: "Hasta Adı (Seç)",
        selectPatient: "— Hasta seç —",
        patientHelp: "Hasta listesinden Treatment'a basınca otomatik seçilir. Buradan hasta değiştirince otomatik yüklenir.",
        noPatientSelected: "Hasta seçilmedi. Lütfen hasta seçin.",
        loadingTreatments: "Tedaviler yükleniyor...",
        noTreatments: "Bu hasta için tedavi planı bulunamadı.",
        addTreatment: "Tedavi Ekle",
        saveTreatment: "Tedaviyi Kaydet",
        treatmentSaved: "✅ Tedavi başarıyla kaydedildi!",
        treatmentDeleted: "✅ Tedavi başarıyla silindi!",
        confirmDelete: "Bu tedaviyi silmek istediğinizden emin misiniz?",
        pageTitle: "Tedaviler - Clinifly Admin",
        upperJaw: "Üst Çene",
        lowerJaw: "Alt Çene",
        fdiUpper: "FDI 11–18 / 21–28",
        fdiLower: "FDI 31–38 / 41–48",
        selectedTooth: "Seçili Diş:",
        selToothHint: "Dişe tıkla, işlem ekle.",
        clearSelection: "Seçimi Temizle",
        procedureType: "İşlem Türü",
        loadingProcedures: "Yükleniyor...",
        statusLabel: "Durum",
        dateLabel: "Tarih",
        timeLabel: "Saat",
        datePolicy: "Tarih Politikası",
        datePolicyManual: "MANUAL (alarm oluştur)",
        datePolicyAuto: "AUTO (otomatik tarih ata)",
        priceOptional: "Fiyat (ops.)",
        currencyLabel: "Para Birimi",
        quantityLabel: "Adet",
        chairNo: "Chair No",
        doctorLabel: "Doktor",
        doctorSelectOptional: "-- Doktor Seç (ops.) --",
        addProcedure: "+ Prosedur Ekle",
        diagnosesOnTooth: "Bu dişteki tanılar",
        addDiagnosisBtn: "+ Tanı Ekle",
        newDiagnosisTitle: "Yeni Tanı Ekle",
        icdCodeLabel: "ICD-10 Kodu",
        descriptionLabel: "Açıklama",
        toothNoLabel: "Diş No",
        toothPlaceholderAuto: "otomatik",
        notesOptionalLabel: "Not (ops.)",
        notesPlaceholder: "Opsiyonel not...",
        proceduresOnTooth: "Bu dişteki işlemler",
        treatmentEventsTitle: "🦷 Treatment Events (Takvim)",
        treatmentEventsHelp: "Not: Event'ler treatment_events tablosunda saklanır.",
        eventTitlePlaceholder: "Implant Day 1",
        eventDescPlaceholder: "CT scan + implant placement",
        teTypeTreatment: "Treatment",
        teTypeConsult: "Consultation",
        teTypeFollowup: "Follow-up",
        teTypeLab: "Lab / Scan",
        addEvent: "➕ Event Ekle",
        eventListTitle: "Event listesi",
        thDateTime: "Tarih/Saat",
        thType: "Tip",
        thTitle: "Başlık",
        patientToothDiagnoses: "Hastanın Diş Tanıları",
        badgeToothDoctor: "Diş No + Doktor Tanısı",
        noDiagnosisSummary: "Tanı kaydı bulunamadı.",
        emptyStateTitle: "Henüz treatment kaydı yok",
        emptyStateSub: "Treatment'lar yüklendiğinde burada görünecek.",
        selectPatientAbove: "Yukarıdan bir hasta seçin.",
        loadingTreatmentsMsg: "Treatments yükleniyor...",
        loadFailed: "Yüklenemedi: {error}",
        noRecordsYet: "Henüz treatment kaydı yok. Diş seçip işlem ekleyebilirsiniz.",
        loadedSummary: "{teethCount} dişte toplam {procCount} işlem yüklendi.",
        loadError: "Yükleme hatası: {error}",
        selectToothFirst: "⚠️ Önce diş seçin",
        toothLocked: "Bu diş çekilmiş (locked). Yeni işlem eklenemez.",
        selectProcedureType: "İşlem türü seç.",
        invalidDateTime: "Tarih/saat formatı geçersiz.",
        diagCodeOrDesc: "ICD-10 kodu veya açıklama giriniz.",
        saveFailedWithMsg: "Kaydedilemedi: {error}",
        deleteFailedWithMsg: "Silinemedi: {error}",
        errorWithMsg: "Hata: {error}",
        saveAllSuccess: "Tüm procedure'lar kaydedildi ✅",
        saveAllError: "Kaydetme hatası: {error}",
        deleteBtn: "Sil",
        eventsEmpty: "Event yok.",
        procLineTooth: "Diş {tooth} • ",
        selToothHintLocked: "⛔ Bu diş çekilmiş (locked). Yeni işlem eklenemez. Sadece geçmiş görülebilir.",
        pickToothFromChart: "Diş seçmek için yukarıdaki diş haritasından bir dişe tıklayın.",
        noProcOnTooth: "Bu dişte henüz işlem yok.",
        noDiagOnTooth: "Bu dişte tanı kaydı yok.",
        noDescription: "Açıklama yok",
        diagGroupTooth: "🦷 Diş {tooth}",
        diagGroupGeneral: "🦷 Genel Tanılar",
        diagNotAdded: "Tanı eklenmemiş",
        toothDiagCountTitle: "Bu dişte {count} tanı kaydı var",
        datePrefix: "Tarih:",
        chairLabel: "Chair",
        editInlineTitle: "Satır içinde düzenle",
        statusSelectTitle: "Status seç",
        statusCycleTitle: "Status'ü değiştirmek için tıklayın (PLANNED → ACTIVE → COMPLETED → CANCELLED → PLANNED)",
        inlineProcTypePh: "İşlem tipi",
        inlineUnitPricePh: "Birim fiyat",
        inlineQtyPh: "Adet",
        inlineChairPh: "Chair No",
        inlineDoctorPick: "-- Doktor Seç --",
        deleteTitle: "Sil",
        selToothHintActive: "Diş seçin",
        status: {
          PLANNED: "Planlandı",
          ACTIVE: "Devam Ediyor",
          COMPLETED: "Tamamlandı",
          CANCELLED: "İptal"
        }
      },
      
      // Login (admin-login.html)
      login: {
        title: "Klinik Girişi",
        subtitle: "Mevcut klinik hesabınızla giriş yapın",
        clinicCode: "Clinic Code",
        clinicCodeRequired: "*",
        clinicCodePlaceholder: "SAAT",
        clinicCodeHelp: "Klinik kodunuzu giriniz (örn: SAAT, MOON, CLINIC01)",
        password: "Password",
        passwordRequired: "*",
        passwordHelp: "Klinik şifrenizi giriniz",
        submit: "Login",
        submitLoading: "Giriş yapılıyor...",
        registerLink: "Yeni Klinik Kaydı",
        dashboardLink: "Dashboard'a Git",
        errors: {
          clinicCodeRequired: "Lütfen klinik kodunu giriniz.",
          passwordRequired: "Lütfen şifrenizi giriniz.",
          invalidCredentials: "Klinik kodu veya şifre hatalı. Lütfen tekrar deneyin.",
          loginFailed: "Giriş başarısız. Lütfen tekrar deneyin.",
          genericError: "Giriş hatası: {error}"
        },
        success: "Hoş geldiniz {name}! Giriş başarılı.",
        sessionExpired: "⏰ Oturum süreniz doldu veya token geçersiz. Lütfen tekrar giriş yapın."
      },

      auth: {
        email: "E-posta",
        password: "Şifre",
        confirm_password: "Şifreyi doğrula",
        name: "Ad soyad",
      },
      
      // Register (admin-register.html)
      register: {
        title: "Create Your Clinic",
        subtitle: "Get started in minutes — it's free.",
        clinicCode: "Clinic Code",
        clinicCodeRequired: "*",
        clinicCodePlaceholder: "e.g. MOON, CLINIC01, ISTANBUL",
        clinicCodeHelp: "Bu kod, hastalarınızın gelecekte kliniğinize bağlanmak için kullanacağı koddur.",
        name: "Clinic Name",
        nameRequired: "*",
        namePlaceholder: "Moon Clinic",
        nameHelp: "Klinik adınız",
        email: "Email",
        emailRequired: "*",
        emailPlaceholder: "clinic@example.com",
        emailHelp: "Klinik e-posta adresiniz",
        password: "Password",
        passwordRequired: "*",
        passwordHelp: "Minimum 6 characters",
        confirmPassword: "Confirm Password",
        confirmPasswordRequired: "*",
        confirmPasswordHelp: "Must match the password",
        phone: "Phone",
        phonePlaceholder: "+90 555 123 4567",
        address: "Address",
        addressPlaceholder: "İstanbul, Türkiye",
        submit: "Register Clinic",
        submitLoading: "Kaydediliyor...",
        loginLink: "Zaten hesabınız var mı? Login",
        dashboardLink: "Dashboard'a Git",
        errors: {
          clinicCodeRequired: "Lütfen klinik kodunu giriniz.",
          nameRequired: "Lütfen klinik adını giriniz.",
          emailRequired: "Lütfen e-posta adresini giriniz.",
          emailInvalid: "Geçerli bir e-posta adresi giriniz.",
          emailExists: "Bu e-posta adresi zaten kullanılıyor.",
          clinicCodeExists: "Bu klinik kodu zaten kullanılıyor.",
          passwordRequired: "Lütfen şifrenizi giriniz.",
          passwordMinLength: "Şifre en az 6 karakter olmalıdır.",
          passwordMismatch: "Şifreler eşleşmiyor.",
          registerFailed: "Kayıt başarısız. Lütfen tekrar deneyin.",
          genericError: "Kayıt hatası: {error}",
          termsNotAccepted: "Lütfen hizmet sözleşmesini kabul edin.",
          timeout: "İstek zaman aşımı (60 sn). API adresi ve internet bağlantısını kontrol edin."
        },
        success: "Klinik kaydı başarılı! Giriş sayfasına yönlendiriliyorsunuz...",
        successTitle: "Kayıt Başarılı!",
        successMessage: "Klinik başarıyla kaydedildi. Admin token tarayıcınıza kaydedildi.",
        clinicInformation: "Klinik Bilgileri",
        adminToken: "Admin Token",
        copyToken: "📋 Token'ı Kopyala",
        goToPatients: "Hasta Listesine Git",
        goToDashboard: "Dashboard'a Git",
        termsText: "Clinifly Dijital Platform Hizmet Sözleşmesi'ni okudum, anladım ve kabul ediyorum. Free Paket kapsamındaki hizmetlerin ücretsiz olduğunu, Free Paket dışındaki dijital hizmetlerin ücretli olduğunu ve bu hizmetlerin kapsam ile bedelinin ayrıca belirleneceğini kabul ederim."
      },
      
      // Settings (admin-settings.html)
      settings: {
        title: "⚙️ Clinic Settings",
        pageTitle: "⚙️ Clinifly Admin – Settings",
        clinicInformation: "Clinic Information",
        brandingNotice: "Branding ayarları yalnızca PRO plan için kullanılabilir.",
        subscriptionPlan: "Abonelik Paketi",
        subscriptionPlanHelp: "FREE / BASIC / PRO paketini buradan değiştirebilirsiniz.",
        plan: "Plan",
        branding: "Branding",
        clinicName: "Clinic Name",
        clinicLogoUrl: "Clinic Logo URL",
        clinicLogoUrlHelp: "Pro plan için logo görüntülenir",
        chairCountLabel: "Koltuk sayısı",
        chairCountHelp: "Randevu ekranında gösterilecek koltuk sayısı (örn: 1, 2, 3).",
        address: "Clinic Address",
        addressHelp: "Zorunlu (tüm planlar). Yakındaki klinik araması ve konum; adres Google ile geocode edilir.",
        googleMapLink: "Google Maps Link",
        googleMapLinkHelp: "İsteğe bağlı (tüm planlar). Varsa bağlantıdan koordinat alınır; yoksa yalnızca adres kullanılır.",
        welcomeMessage: "Welcome Message",
        primaryColor: "Primary Color (Hex)",
        secondaryColor: "Secondary Color (Hex)",
        referralDiscounts: "🎁 Referral Discounts",
        referralDiscountsHelp: "Configure discount percentages for successful referrals. Both the referrer and the referred patient receive these discounts.",
        referralDiscount: "Referral Discount (%)",
        referralDiscountHelp: "Discount applied to both referrer and referred patient",
        referralLevel1: "Seviye 1 (%)",
        referralLevel1Help: "1. başarılı referral sonrası toplam indirim",
        referralSettings: "🎯 Referral Ayarları",
        referralSettingsHelp: "Davet sistemi için kazanç oranlarını belirleyin. PRO planında esnek ayarlar mevcuttur.",
        referralPerInvite: "Davet başına kazanç (%)",
        referralPerInvitePlaceholder: "10",
        referralPerInviteHelp: "Her başarılı davet için verilecek indirim",
        referralMaxTotal: "Maksimum toplam indirim (%)",
        referralMaxTotalPlaceholder: "10",
        referralMaxTotalHelp: "Davet edenin kazanabileceği maksimum indirim. Eğer davet eden 1'den fazla kişi davet ederse ve davet edilenlerin harcaması davet edenden fazla olursa, maksimum indirim limitine kadar indirim uygulanabilir.",
        referralLevel2: "Seviye 2 (%)",
        referralLevel2Help: "2. başarılı referral sonrası toplam indirim",
        referralLevel3: "Seviye 3 (%)",
        referralLevel3Help: "3+ referral için maksimum indirim",
        temporaryPatientLimit: "🔧 Geçici Hasta Limiti",
        temporaryPatientLimitHelp: "Satış ve onboarding süreçleri için geçici hasta limiti ekleyin. Bu, normal plan limitinin üzerine eklenir.",
        temporaryLimit: "Geçici Limit",
        temporaryLimitPlaceholder: "Ek hasta sayısı (örn: 5)",
        saveTemporaryLimit: "Geçici Limiti Kaydet",
        removeTemporaryLimit: "Geçici Limiti Kaldır",
        temporaryLimitActive: "Mevcut geçici limit: +{count} hasta",
        referralPreviewLabel: "💡 Önizleme:",
        referralPreviewNone: "❌ İndirim uygulanmayacak",
        referralPreviewLow: "✅ <strong>{discount}% indirim</strong> hem davet eden hem de davet edilen hastaya uygulanacak.<br><span style=\"color:#10b981\">💡 Yeni hasta çekmek için harika bir başlangıç!</span>",
        referralPreviewMid: "🎉 <strong>{discount}% indirim</strong> her iki tarafa da uygulanacak.<br><span style=\"color:#f59e0b\">⚠️ Daha yüksek indirim ama daha çekici referanslar!</span>",
        referralPreviewHigh: "🚀 <strong>{discount}% indirim</strong> - Maksimum seviye!<br><span style=\"color:#ef4444\">⚠️ Çok cömert - kârlılığı kontrol edin!</span>",
        save: "💾 Ayarları Kaydet",
        saveLoading: "Kaydediliyor...",
        treatmentPriceList: "💰 Tedavi Fiyat Listesi",
        treatmentPriceListHelp: "Kliniğinizin tedavi fiyatlarını belirleyin. Bu fiyatlar hasta tedavi planları oluşturulurken kullanılacaktır.",
        currency: "Para Birimi",
        loadingPrices: "Fiyatlar yükleniyor...",
        saveAllPrices: "💾 Tüm Fiyatları Kaydet",
        savingPrices: "💾 Kaydediliyor...",
        pricesSaved: "✅ Tüm fiyatlar başarıyla kaydedildi!",
        errors: {
          noToken: "Admin token bulunamadı. Lütfen admin olarak giriş yapın.",
          loadFailed: "Ayarlar yüklenemedi: {error}",
          saveFailed: "Ayarlar kaydedilemedi: {error}",
          pricesLoadFailed: "Fiyatlar yüklenemedi: {error}",
          pricesSaveFailed: "Fiyatlar kaydedilemedi: {error}"
        },
        success: "✅ Ayarlar başarıyla kaydedildi!",
        categoryLabels: {
          EVENTS: "Muayene / Görüntüleme",
          PROSTHETIC: "Prosthetic (Protez)",
          RESTORATIVE: "Restorative (Restoratif)",
          ENDODONTIC: "Endodontic (Endodontik)",
          SURGICAL: "Surgical (Cerrahi)",
          IMPLANT: "Implant"
        },
        tableHeaders: {
          treatment: "İşlem",
          price: "Fiyat",
          recommended: "Önerilen",
          duration: "Süre (dk)",
          breakMin: "Mola (dk)",
          active: "Aktif"
        },
        recommendedDuration: "~{minutes} dk",
        minutes: "dk"
      },

      // Patients (admin-patients.html)
      patients: {
        title: "Clinifly Admin – Patients",
        registeredPatients: "Kayıtlı Hastalar",
        searchPlaceholder: "Ara: isim / telefon / patientId / clinicCode",
        filterAll: "Tümü",
        clearFilters: "Temizle",
        refresh: "Yenile",
        loading: "Yükleniyor...",
        noResults: "Sonuç yok",
        selectedPatient: "Seçili Hasta: {name}",
        patientId: "Patient ID: {id}",
        copyId: "Copy ID",
        copyIdSuccess: "✅ Patient ID kopyalandı",
        clear: "Clear",
        travel: "Seyahat",
        treatment: "Tedavi",
        health: "Sağlık",
        chat: "Chat",
        files: "📁 Dosyalar",
        approve: "Onayla",
        approveConfirm: "Hastayı onaylamak istediğinize emin misiniz? ({patientId})",
        approveSuccess: "✅ Hasta onaylandı",
        before: "Önce",
        after: "Sonra",
        phone: "Telefon",
        status: {
          PENDING: "Beklemede",
          APPROVED: "Onaylandı"
        },
        errors: {
          noToken: "⚠️ Admin token bulunamadı. Lütfen önce giriş yapın.",
          unauthorized: "❌ Yetkilendirme hatası. Lütfen tekrar giriş yapın.",
          loadFailed: "❌ Hasta listesi yüklenemedi: {error}",
          approveFailed: "❌ Onaylama hatası: {error}",
          patientLimitReached: "⚠️ Aktif hasta limitinize ulaştınız. Yeni hasta eklemek için planınızı yükseltebilirsiniz.",
          patientLimitReachedTitle: "Hasta Limiti Doldu"
        },
        limits: {
          title: "Aktif Hasta Limiti",
          message: "Mevcut planınızda {current}/{limit} aktif hasta bulunuyor.",
          upgradeMessage: "Yeni hasta eklemek için planınızı yükseltebilirsiniz.",
          upgradeButton: "Planı Yükselt",
          continueButton: "Mevcut Hastalarla Devam Et"
        }
      },
      
      // Referrals (admin-referrals.html)
      referrals: {
        title: "🎁 Clinifly Admin – Referrals",
        referrals: "Referrals",
        filterAll: "Tümü",
        refresh: "Yenile",
        loading: "Yükleniyor...",
        noReferrals: "Referral bulunamadı.",
        inviter: "Inviter",
        invited: "Invited",
        createdAt: "Oluşturulma",
        inviterDiscount: "Inviter İndirim",
        invitedDiscount: "Invited İndirim",
        discount: "İndirim",
        approve: "Onayla",
        reject: "Reddet",
        approveConfirm: "Bu referral'ı onaylamak istediğinize emin misiniz?",
        rejectConfirm: "Bu referral'ı reddetmek istediğinize emin misiniz?",
        approved: "Referral onaylandı ✅",
        rejected: "Referral reddedildi ✅",
        found: "{count} referral bulundu.",
        defaultDiscounts: "Varsayılan indirimler: Davet Eden %{inviter}%, Davet Edilen %{invited}%",
        defaultDiscountsRequired: "⚠️ Varsayılan indirim yüzdeleri Clinic Settings sayfasında girilmelidir.",
        status: {
          PENDING: "Beklemede",
          APPROVED: "Onaylandı",
          REJECTED: "Reddedildi"
        },
        errors: {
          noToken: "⚠️ Admin token bulunamadı. Lütfen admin olarak giriş yapın.",
          invalidToken: "❌ Admin token geçersiz veya süresi dolmuş. Lütfen admin token girin.",
          loadFailed: "Referrals yüklenemedi.",
          approveFailed: "Onaylama hatası: {error}",
          rejectFailed: "Reddetme hatası: {error}"
        }
      },
      timeline: {
        tooth: "Diş",
        procedure: "İşlem",
        status: "Durum"
      },
      date: {
        monthsShort: ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"],
        weekdays: ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"]
      },
      files: {
        pageTitle: "Admin – Hasta Dosyaları",
        title: "📁 Hasta Dosyaları",
        selectPatient: "Hasta:",
        selectPlaceholder: "Hasta seçin...",
        filterAll: "Tümü",
        filterPhoto: "📸 Fotoğraf",
        filterXray: "🦷 Röntgen",
        filterPdf: "📄 PDF",
        filterChat: "💬 Chat",
        upload: "Yükle",
        empty: "Dosya bulunamadı.",
        selectToView: "Dosyaları görmek için hasta seçin.",
        badgeImage: "Fotoğraf",
        badgeXray: "Röntgen",
        badgePdf: "PDF",
        badgeFile: "Dosya",
        badgeChat: "Chat",
        download: "İndir"
      },
      doctorListV2: {
        pageTitle: "👨‍⚕️ Doktorlar",
        documentTitle: "Doktorlar - Clinifly Admin",
        statPending: "Bekleyen",
        statApproved: "Onaylı",
        statRejected: "Reddedilen",
        statTotal: "Toplam",
        searchPlaceholder: "Ad, email veya telefon ara...",
        filterAll: "Tüm Durumlar",
        filterOptionPending: "Bekleyen",
        filterOptionApproved: "Onaylanan",
        filterOptionActive: "Aktif",
        filterOptionRejected: "Reddedilen",
        refresh: "↺ Yenile",
        loading: "Yükleniyor...",
        empty: "Henüz doktor kaydı bulunmuyor.",
        errorHttp: "HTTP {status}",
        errorLoad: "Yüklenemedi",
        sectionProfessional: "Mesleki",
        labelExperience: "Deneyim",
        labelUniversity: "Üniversite",
        labelGraduation: "Mezuniyet",
        labelProfile: "Profil",
        labelBio: "Bio",
        profilePublic: "🌐 Açık",
        profilePrivate: "🔒 Gizli",
        sectionSpecialty: "Uzmanlık",
        sectionLanguages: "Diller",
        sectionProcedures: "Prosedürler",
        notSpecified: "Belirtilmedi",
        yearsCount: "{years} yıl",
        dash: "—",
        status: {
          PENDING: "Bekleyen",
          APPROVED: "Onaylı",
          ACTIVE: "Aktif",
          REJECTED: "Reddedildi"
        },
        btnApprove: "✅ Onayla",
        btnReject: "❌ Reddet",
        confirmApprove: "Bu doktoru onaylamak istediğinizden emin misiniz?",
        confirmReject: "Bu başvuruyu reddetmek istediğinizden emin misiniz?",
        approvedAlert: "✅ Doktor onaylandı!",
        rejectedAlert: "Başvuru reddedildi.",
        errorGeneric: "Hata"
      },
      chat: {
        documentTitle: "Sohbet - Clinifly Admin",
        pageHeading: "💬 Clinifly Admin – Sohbet",
        title: "Mesajlar",
        patientsHeading: "Hastalar",
        loading: "Yükleniyor...",
        selectPatient: "Bir hasta seçin",
        noPatients: "Henüz hasta yok",
        unnamed: "İsimsiz",
        placeholder: "Mesaj yazın...",
        send: "Gönder",
        sending: "Gönderiliyor...",
        noMessages: "Henüz mesaj yok",
        newMessage: "Yeni mesaj",
        youJoined: "Sohbete katıldınız",
        photo: "Fotoğraf",
        file: "Dosya",
        photoFile: "📷 Foto",
        fileAttach: "📎 Dosya",
        download: "İndir",
        uploadHelp: "Desteklenen formatlar: JPG, PNG, HEIC (max 10MB) • PDF/DOC/DOCX/TXT/XLS/XLSX (max 20MB) • ZIP (max 50MB)",
        sentOk: "✓ Gönderildi",
        uploadError: "✗ Hata",
        errNoToken: "❌ Admin token bulunamadı. Lütfen önce giriş yapın.",
        errTokenList: "Admin token gerekli",
        errAuth: "❌ Yetkilendirme hatası. Lütfen tekrar giriş yapın.",
        errAuthShort: "❌ Yetkilendirme hatası",
        errUnknown: "Bilinmeyen hata",
        errLoadList: "❌ Hasta listesi yüklenemedi: {message}",
        errLoadMessages: "Mesajlar yüklenemedi",
        errLoadMessagesFull: "❌ Mesajlar yüklenemedi: {message}",
        errSelectFirst: "❌ Lütfen önce hasta seçin",
        errNoTokenSend: "❌ Admin token bulunamadı",
        errSend: "Mesaj gönderilemedi",
        errSendFull: "❌ Mesaj gönderilemedi: {message}",
        errFileUpload: "❌ Dosya gönderilemedi: {message}",
        errSession: "❌ Oturum süreniz dolmuş. Lütfen sayfayı yenileyip tekrar giriş yapın.",
        errForbidden: "❌ Bu dosya tipi desteklenmiyor: {ext}. RAR ve çalıştırılabilir dosyalar yasaktır.",
        errMime: "❌ Dosya tipi belirlenemedi. Lütfen farklı bir dosya deneyin.",
        errImageFmt: "❌ Desteklenen formatlar: JPG, PNG, HEIC – Max 10MB",
        errDocFmt: "❌ Desteklenen formatlar: PDF, DOC/DOCX, TXT, XLS/XLSX, ZIP",
        errPhotoSize: "❌ Fotoğraf boyutu 10MB'dan küçük olmalıdır.",
        errZipSize: "❌ ZIP dosyası 50MB'dan küçük olmalıdır.",
        errDocSize: "❌ Doküman 20MB'dan küçük olmalıdır.",
        errSelectPatient: "❌ Lütfen önce bir hasta seçin",
        before: "Önce",
        after: "Sonra",
        doctorReview: "👨‍⚕️ Doktor incelemesi",
        defaultClinic: "Klinik",
        defaultPhoto: "Fotoğraf",
        defaultFile: "Dosya",
        navClinicSettings: "Klinik Ayarları",
        patientAssignedBanner: "Bu hasta Dr. {doctorName}'e atandı",
      },
      leads: {
        documentTitle: "Mesajlar / Potansiyel / Atanmamış — Clinifly Admin",
        pageTitle: "Mesajlar / Potansiyel / Atanmamış talepler",
        subtitle: "Her talebi tam olarak bir doktora atayın. Sadece o doktor sohbeti doktor uygulamasında görür.",
        backDashboard: "← Panel",
        refreshList: "Listeyi yenile",
        statusLoading: "Yükleniyor…",
        statusUnassigned: "{count} atanmamış",
        thPatient: "Hasta",
        thContact: "İletişim",
        thPreview: "Önizleme",
        thAssign: "Doktor ata",
        empty: "Atanmamış talep mesajı yok.",
        selectDoctor: "Doktor seçin…",
        assign: "Ata",
        errChooseDoctor: "Önce bir doktor seçin.",
        successAssigned: "Başarıyla atandı.",
        errLoad: "Yükleme hatası",
        showAssignedToggle: "Atanmışları da göster",
        assignedBadgePrefix: "Dr.",
        assignedOk: "Atandı:",
        assignDisabledHint: "Önce bu atamayı kaldırmak için destek veya doktor uygulamasını kullanın.",
      }
    },

    en: {
      // Common
      common: {
        loading: "Loading...",
        save: "Save",
        cancel: "Cancel",
        delete: "Delete",
        edit: "Edit",
        search: "Search",
        filter: "Filter",
        close: "Close",
        back: "Back",
        next: "Next",
        previous: "Previous",
        submit: "Submit",
        yes: "Yes",
        no: "No",
        ok: "OK",
        error: "Error",
        success: "Success",
        warning: "Warning",
        doctor: "Doctor"
      },

      adminPages: {
        travelH1: "✈️ Clinifly Admin – Travel",
        travelGlobalWarning: "⚠️ WARNING: Some fields are reserved for the patient. Review the notes below.",
        travelWordHotel: "Hotel",
        travelWordFlights: "Flights",
        travelListSeparator: " and ",
        travelDynamicWarning: "⚠️ WARNING: The patient will enter {list} details. You cannot edit these fields. The patient will complete them in the mobile app.",
        healthH1: "🩺 Clinifly Admin – Health",
        doctorApplicationsH1: "Doctor applications",
        doctorAppsStatPending: "Pending",
        doctorAppsStatApproved: "Approved",
        doctorAppsStatRejected: "Rejected",
        doctorAppsStatTotal: "Total",
        doctorAppsLoading: "Loading doctors...",
        doctorAppsEmptyTitle: "No doctors yet",
        doctorAppsEmptyDesc: "No doctor application has been submitted yet.",
        activePatientsH1: "👨‍⚕️ Active patients",
        activePatientsStatActive: "Active patients",
        activePatientsStatPending: "Pending patients",
        activePatientsStatTotal: "Total patients",
        activePatientsStatClinic: "Clinics",
        activePatientsSearchPlaceholder: "Search by name, email or phone...",
        activePatientsAllClinics: "All clinics",
        activePatientsRefresh: "🔄 Refresh",
        activePatientsLoading: "🔄 Loading...",
        activePatientsEmpty: "No active patients yet",
        treatmentCreateH1: "🏥 Create treatment",
        treatmentCreateSubtitle: "Create a new treatment group and assign doctors",
        patientDetailH1: "Patient detail",
        patientDetailBack: "Back",
        legacyNavClinics: "Clinics"
      },
      
      // Suspended Clinic Messages
      clinicSuspended: {
        title: "Your Account Has Been Temporarily Suspended",
        description: "Your clinic account is currently inactive. Access to the dashboard and patient features is restricted.",
        reasonTitle: "Suspension Reason",
        reasonGeneric: "Your account is under review for system and security checks.",
        whatToDoTitle: "How to Reactivate?",
        steps: [
          "Our support team is reviewing your account",
          "We will contact you if necessary",
          "You can contact us with any questions"
        ],
        contactSupport: "Contact Support",
        learnMore: "Learn More",
        statusBadge: "Status: Suspended"
      },
      
      // Dashboard (admin.html)
      dashboard: {
        title: "Clinifly Admin – Dashboard",
        sidebar: {
          mainMenu: "Main Menu",
          management: "Management",
          logout: "Logout",
          clinic: "Clinic"
        },
        nav: {
          dashboard: "Dashboard",
          patients: "Patients",
          travel: "Travel",
          treatment: "Treatments",
          schedule: "Schedule",
          doctors: "Doctors",
          chat: "Chat",
          leads: "Leads",
          files: "Files",
          referrals: "Referrals",
          health: "Health",
          settings: "Settings",
          login: "Login",
          register: "Register Clinic"
        },
        charts: {
          metricTitleMonthlyPatients: "Monthly registered patients",
          metricTitleMonthlyProcedures: "Monthly procedure count",
          chartLabelMonthlyRegistered: "Monthly registrations",
          activePatients: "Active Patients",
          procedures: "Procedures",
          noData: "No data",
          trendNote: "Trend will improve as more data is collected",
          vsPreviousMonth: "vs previous month",
          noPreviousData: "No previous data",
          summaryActivePatients: "{count} active patients • {month}",
          summaryMonthlyRegistered: "{count} registered • {month}",
          summaryProcedures: "{count} procedures • {month}"
        },
        clinicBadge: {
          noToken: "⚠️ No admin token. <a href=\"/admin-register.html\" style=\"color:var(--link);\">Register Clinic</a> to login.",
          switchClinic: "Switch clinic",
          clinicInfo: "Clinic: <strong>{name}</strong> ({code}) • Status: {status}",
          clinicNotFound: "Clinic information could not be retrieved. Please check admin token."
        },
        upcoming: {
          title: "📅 Clinic Timeline",
          subtitle: "All events (past and future)",
          empty: "No events.",
          overdue: "⚠️ Overdue Events ({count})",
          overdueDesc: "There are {count} overdue but incomplete events. Please check.",
          status: {
            planned: "Planned",
            done: "Done",
            completed: "Completed"
          },
          today: "Today",
          tomorrow: "Tomorrow",
          dayAfterTomorrow: "Day after tomorrow",
          daysLater: "{count} days later",
          weeksLater: "{count} weeks later",
          eventTypes: {
            TRAVEL_EVENT: "Travel Event",
            FLIGHT: "Flight",
            HOTEL: "Hotel",
            AIRPORT_PICKUP: "Airport Pickup",
            TREATMENT: "Treatment",
            CONSULT: "Consultation",
            FOLLOWUP: "Follow-up",
            LAB: "Lab / Scan",
            HEALTH: "Health Form",
            APPOINTMENT: "Appointment",
            PAYMENT: "Payment",
            SURGERY: "Surgery",
            CHECKUP: "Checkup"
          },
          summary: {
            overdue: "Overdue:",
            today: "Today:",
            tomorrow: "Tomorrow:",
            patients: "patients",
            events: "events"
          }
        },
        planUsage: "Plan & usage",
        activeTreatments: "Active treatments",
        monthlyUploads: "Monthly uploads",
        referralInvites: "Referral invites",
        upgrade: "Upgrade",
        unlimited: "Unlimited",
        planAlertCrit: "Limit reached. Upgrade to continue.",
        planAlertWarn: "You are close to your limit",
        planTierTitle: "Current subscription tier",
        confirmOpenPricing: "Open pricing page?\n\n{url}",
        metricsErrorHint: "Check browser console (F12) for details"
      },
      
      calendar: {
        documentTitle: "Calendar - Clinifly Admin",
        pageTitle: "Appointments",
        title: "Appointments",
        weekRangeTitle: "Week range",
        today: "Today",
        week: "Week",
        month: "Month",
        prev: "← Previous",
        previous: "← Previous",
        next: "Next →",
        timeColumn: "Time",
        doctor: "Doctor",
        chair: "Chair",
        allDoctors: "All doctors",
        allChairs: "All chairs",
        noEvents: "No events",
        noAppointmentsForWeek: "No appointments for the selected week.",
        noAppointmentsForRange: "No appointments in the selected range.",
        summaryLine: "{count} appts • {doctorCount} doctors • {chairCount} chairs",
        loading: "Loading...",
        tokenMissing: "Admin token not found. Please sign in again.",
        sessionExpired: "Session expired. Redirecting to sign-in...",
        fetchFailed: "Could not load appointments: {message}",
        doctorNotFound: "No doctor found",
        chairWithNumber: "Chair {n}"
      },
      
      // Pricing (pricing.html)
      pricing: {
        title: "Clinifly Pricing",
        subtitle: "Flexible plans based on your active patient count",
        info: "Pay only based on your active patient count.",
        free: {
          name: "Free",
          patients: "5 patients",
          description: "Try Clinifly with real patients.",
          cta: "Get Started"
        },
        basic: {
          name: "Pro",
          badge: "Popular",
          patients: "15 patients",
          description: "Powerful package for growing clinics.",
          cta: "Upgrade"
        },
        pro: {
          name: "Premium",
          patients: "Unlimited patients",
          description: "Premium support for enterprise clinics.",
          cta: "Upgrade",
          contactCta: "Contact Us"
        },
        periodMonthly: "/month",
        features: {
          allCore: "All core features",
          patientCommunication: "Patient communication",
          fileSharing: "File sharing",
          referral: "Referral system",
          branding: "Clinifly branding",
          customBranding: "Custom branding",
          analytics: "Basic analytics",
          support: "Email support",
          unlimitedPatients: "Unlimited patients",
          advancedReferral: "Advanced referral (levels, campaigns)",
          prioritySupport: "Priority support",
          onboarding: "Custom onboarding"
        },
        comparison: {
          feature: "Feature",
          free: "Free",
          basic: "Pro",
          pro: "Premium",
          patients: "Active Patients",
          unlimited: "Unlimited",
          coreFeatures: "Core Features",
          branding: "Clinifly Branding",
          customBranding: "Custom Branding",
          referral: "Referral System",
          advancedReferral: "Advanced Referral",
          analytics: "Analytics",
          support: "Support",
          community: "Community",
          email: "Email",
          priority: "Priority"
        },
        faq: {
          title: "Frequently Asked Questions",
          q1: {
            question: "How is active patient count calculated?",
            answer: "Only APPROVED (active) patients are counted. Pending, rejected, or cancelled patients are not included in the limit."
          },
          q2: {
            question: "What happens when I reach the limit?",
            answer: "You can continue working with your existing patients. Only new patient approvals are blocked. You can upgrade to continue operations."
          },
          q3: {
            question: "Can I change plans?",
            answer: "Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately."
          },
          q4: {
            question: "What payment methods do you accept?",
            answer: "We accept credit cards, bank transfers, and local payment methods. All payments are secured with SSL."
          }
        },
        contact: {
          title: "Have special requirements?",
          description: "We offer custom plans for large clinics and enterprise solutions.",
          button: "Contact Us"
        }
      },
      
      // Treatment (admin-treatment.html)
      treatment: {
        patientName: "Patient Name (Select)",
        selectPatient: "— Select patient —",
        patientHelp: "Automatically selected when opening Treatment from the patient list. Changing the patient here reloads data.",
        noPatientSelected: "No patient selected. Please select a patient.",
        loadingTreatments: "Loading treatments...",
        noTreatments: "No treatment plan found for this patient.",
        addTreatment: "Add Treatment",
        saveTreatment: "Save Treatment",
        treatmentSaved: "✅ Treatment saved successfully!",
        treatmentDeleted: "✅ Treatment deleted successfully!",
        confirmDelete: "Are you sure you want to delete this treatment?",
        pageTitle: "Treatments - Clinifly Admin",
        upperJaw: "Upper jaw",
        lowerJaw: "Lower jaw",
        fdiUpper: "FDI 11–18 / 21–28",
        fdiLower: "FDI 31–38 / 41–48",
        selectedTooth: "Selected tooth:",
        selToothHint: "Tap a tooth to add a procedure.",
        clearSelection: "Clear selection",
        procedureType: "Procedure type",
        loadingProcedures: "Loading...",
        statusLabel: "Status",
        dateLabel: "Date",
        timeLabel: "Time",
        datePolicy: "Date policy",
        datePolicyManual: "MANUAL (create reminder)",
        datePolicyAuto: "AUTO (assign date automatically)",
        priceOptional: "Price (optional)",
        currencyLabel: "Currency",
        quantityLabel: "Quantity",
        chairNo: "Chair No",
        doctorLabel: "Doctor",
        doctorSelectOptional: "-- Select doctor (optional) --",
        addProcedure: "+ Add procedure",
        diagnosesOnTooth: "Diagnoses on this tooth",
        addDiagnosisBtn: "+ Add diagnosis",
        newDiagnosisTitle: "New diagnosis",
        icdCodeLabel: "ICD-10 code",
        descriptionLabel: "Description",
        toothNoLabel: "Tooth No",
        toothPlaceholderAuto: "auto",
        notesOptionalLabel: "Notes (optional)",
        notesPlaceholder: "Optional note...",
        proceduresOnTooth: "Procedures on this tooth",
        treatmentEventsTitle: "🦷 Treatment events (calendar)",
        treatmentEventsHelp: "Note: events are stored in the treatment_events table.",
        eventTitlePlaceholder: "Implant Day 1",
        eventDescPlaceholder: "CT scan + implant placement",
        teTypeTreatment: "Treatment",
        teTypeConsult: "Consultation",
        teTypeFollowup: "Follow-up",
        teTypeLab: "Lab / Scan",
        addEvent: "➕ Add event",
        eventListTitle: "Event list",
        thDateTime: "Date/Time",
        thType: "Type",
        thTitle: "Title",
        patientToothDiagnoses: "Patient tooth diagnoses",
        badgeToothDoctor: "Tooth No + doctor diagnosis",
        noDiagnosisSummary: "No diagnosis records.",
        emptyStateTitle: "No treatment records yet",
        emptyStateSub: "Treatments will appear here when loaded.",
        selectPatientAbove: "Select a patient above.",
        loadingTreatmentsMsg: "Loading treatments...",
        loadFailed: "Failed to load: {error}",
        noRecordsYet: "No treatment records yet. Select a tooth and add a procedure.",
        loadedSummary: "{teethCount} teeth, {procCount} procedures loaded.",
        loadError: "Load error: {error}",
        selectToothFirst: "⚠️ Select a tooth first",
        toothLocked: "This tooth is extracted (locked). New procedures cannot be added.",
        selectProcedureType: "Select a procedure type.",
        invalidDateTime: "Invalid date/time format.",
        diagCodeOrDesc: "Enter ICD-10 code or description.",
        saveFailedWithMsg: "Could not save: {error}",
        deleteFailedWithMsg: "Could not delete: {error}",
        errorWithMsg: "Error: {error}",
        saveAllSuccess: "All procedures saved ✅",
        saveAllError: "Save error: {error}",
        deleteBtn: "Delete",
        eventsEmpty: "No events.",
        procLineTooth: "Tooth {tooth} • ",
        selToothHintLocked: "⛔ This tooth is extracted (locked). New procedures cannot be added. History only.",
        pickToothFromChart: "Click a tooth on the chart above to select it.",
        noProcOnTooth: "No procedures on this tooth yet.",
        noDiagOnTooth: "No diagnosis records for this tooth.",
        noDescription: "No description",
        diagGroupTooth: "🦷 Tooth {tooth}",
        diagGroupGeneral: "🦷 General diagnoses",
        diagNotAdded: "No diagnoses added",
        toothDiagCountTitle: "{count} diagnosis record(s) on this tooth",
        datePrefix: "Date:",
        chairLabel: "Chair",
        editInlineTitle: "Edit inline",
        statusSelectTitle: "Select status",
        statusCycleTitle: "Click to cycle status (PLANNED → ACTIVE → COMPLETED → CANCELLED → PLANNED)",
        inlineProcTypePh: "Procedure type",
        inlineUnitPricePh: "Unit price",
        inlineQtyPh: "Qty",
        inlineChairPh: "Chair No",
        inlineDoctorPick: "-- Select doctor --",
        deleteTitle: "Delete",
        selToothHintActive: "Select a tooth",
        status: {
          PLANNED: "Planned",
          ACTIVE: "In progress",
          COMPLETED: "Completed",
          CANCELLED: "Cancelled"
        }
      },
      
      // Login (admin-login.html)
      login: {
        title: "Clinic Login",
        subtitle: "Login with your existing clinic account",
        clinicCode: "Clinic Code",
        clinicCodeRequired: "*",
        clinicCodePlaceholder: "SAAT",
        clinicCodeHelp: "Enter your clinic code (e.g., SAAT, MOON, CLINIC01)",
        password: "Password",
        passwordRequired: "*",
        passwordHelp: "Enter your clinic password",
        submit: "Login",
        submitLoading: "Logging in...",
        registerLink: "Register New Clinic",
        dashboardLink: "Go to Dashboard",
        errors: {
          clinicCodeRequired: "Please enter clinic code.",
          passwordRequired: "Please enter password.",
          invalidCredentials: "Invalid clinic code or password. Please try again.",
          loginFailed: "Login failed. Please try again.",
          genericError: "Login error: {error}"
        },
        success: "Welcome {name}! Login successful.",
        sessionExpired: "⏰ Your session has expired or the token is invalid. Please log in again."
      },

      auth: {
        email: "Email",
        password: "Password",
        confirm_password: "Confirm password",
        name: "Full name",
      },
      
      // Register (admin-register.html)
      register: {
        title: "Create Your Clinic",
        subtitle: "Get started in minutes — it's free.",
        clinicCode: "Clinic Code",
        clinicCodeRequired: "*",
        clinicCodePlaceholder: "e.g. MOON, CLINIC01, ISTANBUL",
        clinicCodeHelp: "This code is what your patients will use to connect to your clinic in the future.",
        name: "Clinic Name",
        nameRequired: "*",
        namePlaceholder: "Moon Clinic",
        nameHelp: "Your clinic name",
        email: "Email",
        emailRequired: "*",
        emailPlaceholder: "clinic@example.com",
        emailHelp: "Your clinic email address",
        password: "Password",
        passwordRequired: "*",
        passwordHelp: "Minimum 6 characters",
        confirmPassword: "Confirm Password",
        confirmPasswordRequired: "*",
        confirmPasswordHelp: "Must match the password",
        phone: "Phone",
        phonePlaceholder: "+90 555 123 4567",
        address: "Address",
        addressPlaceholder: "Istanbul, Turkey",
        submit: "Register Clinic",
        submitLoading: "Registering...",
        loginLink: "Already have an account? Login",
        dashboardLink: "Go to Dashboard",
        errors: {
          clinicCodeRequired: "Please enter clinic code.",
          nameRequired: "Please enter clinic name.",
          emailRequired: "Please enter email address.",
          emailInvalid: "Please enter a valid email address.",
          emailExists: "This email address is already in use.",
          clinicCodeExists: "This clinic code is already in use.",
          passwordRequired: "Please enter password.",
          passwordMinLength: "Password must be at least 6 characters.",
          passwordMismatch: "Passwords do not match.",
          registerFailed: "Registration failed. Please try again.",
          genericError: "Registration error: {error}",
          termsNotAccepted: "Please accept the service agreement.",
          timeout: "Request timed out (60s). Check API URL and your network connection."
        },
        success: "Clinic registration successful! Redirecting to login page...",
        successTitle: "Registration Successful!",
        successMessage: "Your clinic has been registered successfully. The admin token has been saved in your browser.",
        clinicInformation: "Clinic Information",
        adminToken: "Admin Token",
        copyToken: "📋 Copy Token",
        goToPatients: "Go to Patients List",
        goToDashboard: "Go to Dashboard",
        termsText: "I have read, understood and agree to the Clinifly Digital Platform Service Agreement. I acknowledge that services within the Free Package are free of charge, services outside the Free Package are paid, and the scope and price of these services will be determined separately."
      },
      
      // Settings (admin-settings.html)
      settings: {
        title: "⚙️ Clinic Settings",
        pageTitle: "⚙️ Clinifly Admin – Settings",
        clinicInformation: "Clinic Information",
        brandingNotice: "Branding settings are only available for PRO plan.",
        subscriptionPlan: "Subscription Plan",
        subscriptionPlanHelp: "You can change FREE / BASIC / PRO package here.",
        plan: "Plan",
        branding: "Branding",
        referralDiscounts: "🎁 Referral Discounts",
        referralDiscountsHelp: "Configure discount percentages for successful referrals. Both the referrer and the referred patient receive these discounts.",
        referralDiscount: "Referral Discount (%)",
        referralDiscountHelp: "Discount applied to both referrer and referred patient",
        referralSettings: "🎯 Referral Settings",
        referralSettingsHelp: "Set referral earnings rates. Flexible settings available in PRO plan.",
        referralPerInvite: "Per Invite Earnings (%)",
        referralPerInvitePlaceholder: "10",
        referralPerInviteHelp: "Discount given for each successful referral",
        referralMaxTotal: "Maximum Total Discount (%)",
        referralMaxTotalPlaceholder: "10",
        referralMaxTotalHelp: "Maximum discount the referrer can earn. If the referrer invites more than one person and the invited people's spending exceeds the referrer's spending, discount can be applied up to the maximum limit.",
        clinicName: "Clinic Name",
        clinicLogoUrl: "Clinic Logo URL",
        clinicLogoUrlHelp: "Logo will be displayed for Pro plan",
        chairCountLabel: "Chair count",
        chairCountHelp: "Number of chairs to show on the appointment calendar (e.g. 1, 2, 3).",
        address: "Clinic Address",
        addressHelp: "Required (all plans). Used for nearby search and pinning; address is geocoded via Google.",
        googleMapLink: "Google Maps Link",
        googleMapLinkHelp: "Optional (all plans). If set, coordinates are parsed from the link; otherwise the address above is used.",
        primaryColor: "Primary Color (Hex)",
        secondaryColor: "Secondary Color (Hex)",
        welcomeMessage: "Welcome Message",
        referralDiscounts: "🎁 Referral Discounts",
        referralDiscountsHelp: "Discount levels used in the referral system",
        referralDiscount: "Referral Discount (%)",
        referralDiscountHelp: "Discount applied to both referrer and referred patient",
        referralLevel1: "Level 1 (%)",
        referralLevel1Help: "Total discount after 1 successful referral",
        referralLevel2: "Level 2 (%)",
        referralLevel2Help: "Total discount after 2 successful referrals",
        referralLevel3: "Level 3 (%)",
        referralLevel3Help: "Maximum discount for 3+ referrals",
        temporaryPatientLimit: "🔧 Temporary Patient Limit",
        temporaryPatientLimitHelp: "Add temporary patient limit for sales and onboarding processes. This is added on top of the normal plan limit.",
        temporaryLimit: "Temporary Limit",
        temporaryLimitPlaceholder: "Additional patients (e.g., 5)",
        saveTemporaryLimit: "Save Temporary Limit",
        removeTemporaryLimit: "Remove Temporary Limit",
        temporaryLimitActive: "Current temporary limit: +{count} patients",
        referralPreviewLabel: "💡 Preview:",
        referralPreviewNone: "❌ No discount will be applied",
        referralPreviewLow: "✅ <strong>{discount}% discount</strong> will be applied to both referrer and referred patient.<br><span style=\"color:#10b981\">💡 Great starting point for attracting new patients!</span>",
        referralPreviewMid: "🎉 <strong>{discount}% discount</strong> for both parties.<br><span style=\"color:#f59e0b\">⚠️ Higher discount but more attractive referrals!</span>",
        referralPreviewHigh: "🚀 <strong>{discount}% discount</strong> - Maximum level!<br><span style=\"color:#ef4444\">⚠️ Very generous - ensure profitability!</span>",
        save: "💾 Save Settings",
        saveLoading: "Saving...",
        treatmentPriceList: "💰 Treatment Price List",
        treatmentPriceListHelp: "Define your clinic's treatment prices. These prices will be used when creating patient treatment plans.",
        currency: "Currency",
        loadingPrices: "Loading prices...",
        saveAllPrices: "💾 Save All Prices",
        savingPrices: "💾 Saving...",
        pricesSaved: "✅ All prices saved successfully!",
        errors: {
          noToken: "Admin token not found. Please login as admin.",
          loadFailed: "Failed to load settings: {error}",
          saveFailed: "Failed to save settings: {error}",
          pricesLoadFailed: "Failed to load prices: {error}",
          pricesSaveFailed: "Failed to save prices: {error}"
        },
        success: "✅ Settings saved successfully!",
        categoryLabels: {
          EVENTS: "Events / Imaging",
          PROSTHETIC: "Prosthetic (Protez)",
          RESTORATIVE: "Restorative (Restoratif)",
          ENDODONTIC: "Endodontic (Endodontik)",
          SURGICAL: "Surgical (Cerrahi)",
          IMPLANT: "Implant"
        },
        tableHeaders: {
          treatment: "Treatment",
          price: "Price",
          recommended: "Recommended",
          duration: "Duration (min)",
          breakMin: "Break (min)",
          active: "Active"
        },
        recommendedDuration: "~{minutes} min",
        minutes: "min"
      },

      // Patients (admin-patients.html)
      patients: {
        title: "Clinifly Admin – Patients",
        registeredPatients: "Registered Patients",
        searchPlaceholder: "Search: name / phone / patientId / clinicCode",
        filterAll: "All",
        clearFilters: "Clear",
        refresh: "Refresh",
        loading: "Loading...",
        noResults: "No results",
        selectedPatient: "Selected Patient: {name}",
        patientId: "Patient ID: {id}",
        copyId: "Copy ID",
        copyIdSuccess: "✅ Patient ID copied",
        clear: "Clear",
        travel: "Travel",
        treatment: "Treatment",
        health: "Health",
        chat: "Chat",
        files: "📁 Files",
        approve: "Approve",
        approveConfirm: "Are you sure you want to approve this patient? ({patientId})",
        approveSuccess: "✅ Patient approved",
        before: "Before",
        after: "After",
        phone: "Phone",
        status: {
          PENDING: "Pending",
          APPROVED: "Approved"
        },
        errors: {
          noToken: "⚠️ Admin token not found. Please login first.",
          unauthorized: "❌ Authorization error. Please login again.",
          loadFailed: "❌ Failed to load patient list: {error}",
          approveFailed: "❌ Approval error: {error}",
          patientLimitReached: "⚠️ You've reached your active patient limit. Upgrade your plan to add new patients.",
          patientLimitReachedTitle: "Patient Limit Reached"
        },
        limits: {
          title: "Active Patient Limit",
          message: "Your current plan has {current}/{limit} active patients.",
          upgradeMessage: "Upgrade your plan to add new patients.",
          upgradeButton: "Upgrade Plan",
          continueButton: "Continue with Existing Patients"
        }
      },
      
      // Referrals (admin-referrals.html)
      referrals: {
        title: "🎁 Clinifly Admin – Referrals",
        referrals: "Referrals",
        filterAll: "All",
        refresh: "Refresh",
        loading: "Loading...",
        noReferrals: "No referrals found.",
        inviter: "Inviter",
        invited: "Invited",
        createdAt: "Created",
        inviterDiscount: "Inviter Discount",
        invitedDiscount: "Invited Discount",
        discount: "Discount",
        approve: "Approve",
        reject: "Reject",
        approveConfirm: "Are you sure you want to approve this referral?",
        rejectConfirm: "Are you sure you want to reject this referral?",
        approved: "Referral approved ✅",
        rejected: "Referral rejected ✅",
        found: "{count} referrals found.",
        defaultDiscounts: "Default discounts: Inviter %{inviter}%, Invited %{invited}%",
        defaultDiscountsRequired: "⚠️ Default discount percentages must be entered in Clinic Settings page.",
        status: {
          PENDING: "Pending",
          APPROVED: "Approved",
          REJECTED: "Rejected"
        },
        errors: {
          noToken: "⚠️ Admin token not found. Please login as admin.",
          invalidToken: "❌ Admin token invalid or expired. Please enter admin token.",
          loadFailed: "Failed to load referrals.",
          approveFailed: "Approval error: {error}",
          rejectFailed: "Rejection error: {error}"
        }
      },
      timeline: {
        tooth: "Tooth",
        procedure: "Procedure",
        status: "Status"
      },
      date: {
        monthsShort: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
        weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
      },
      files: {
        pageTitle: "Admin – Patient Files",
        title: "📁 Patient Files",
        selectPatient: "Patient:",
        selectPlaceholder: "Select patient...",
        filterAll: "All",
        filterPhoto: "📸 Photos",
        filterXray: "🦷 X-Rays",
        filterPdf: "📄 PDF",
        filterChat: "💬 Chat",
        upload: "Upload",
        empty: "No files found.",
        selectToView: "Select a patient to view their files.",
        badgeImage: "Photo",
        badgeXray: "X-Ray",
        badgePdf: "PDF",
        badgeFile: "File",
        badgeChat: "Chat",
        download: "Download"
      },
      doctorListV2: {
        pageTitle: "👨‍⚕️ Doctors",
        documentTitle: "Doctors - Clinifly Admin",
        statPending: "Pending",
        statApproved: "Approved",
        statRejected: "Rejected",
        statTotal: "Total",
        searchPlaceholder: "Search by name, email or phone...",
        filterAll: "All statuses",
        filterOptionPending: "Pending",
        filterOptionApproved: "Approved",
        filterOptionActive: "Active",
        filterOptionRejected: "Rejected",
        refresh: "↺ Refresh",
        loading: "Loading...",
        empty: "No doctor records yet.",
        errorHttp: "HTTP {status}",
        errorLoad: "Failed to load",
        sectionProfessional: "Professional",
        labelExperience: "Experience",
        labelUniversity: "University",
        labelGraduation: "Graduation",
        labelProfile: "Profile",
        labelBio: "Bio",
        profilePublic: "🌐 Public",
        profilePrivate: "🔒 Private",
        sectionSpecialty: "Specialty",
        sectionLanguages: "Languages",
        sectionProcedures: "Procedures",
        notSpecified: "Not specified",
        yearsCount: "{years} yrs",
        dash: "—",
        status: {
          PENDING: "Pending",
          APPROVED: "Approved",
          ACTIVE: "Active",
          REJECTED: "Rejected"
        },
        btnApprove: "✅ Approve",
        btnReject: "❌ Reject",
        confirmApprove: "Are you sure you want to approve this doctor?",
        confirmReject: "Are you sure you want to reject this application?",
        approvedAlert: "✅ Doctor approved!",
        rejectedAlert: "Application rejected.",
        errorGeneric: "Error"
      },
      chat: {
        documentTitle: "Chat - Clinifly Admin",
        pageHeading: "💬 Clinifly Admin – Chat",
        title: "Messages",
        patientsHeading: "Patients",
        loading: "Loading...",
        selectPatient: "Select a patient",
        noPatients: "No patients yet",
        unnamed: "Unnamed",
        placeholder: "Type a message...",
        send: "Send",
        sending: "Sending...",
        noMessages: "No messages yet",
        newMessage: "New message",
        youJoined: "You joined the chat",
        photo: "Photo",
        file: "File",
        photoFile: "📷 Photo",
        fileAttach: "📎 File",
        download: "Download",
        uploadHelp: "Supported: JPG, PNG, HEIC (max 10MB) • PDF/DOC/DOCX/TXT/XLS/XLSX (max 20MB) • ZIP (max 50MB)",
        sentOk: "✓ Sent",
        uploadError: "✗ Error",
        errNoToken: "❌ No admin token. Please sign in first.",
        errTokenList: "Admin token required",
        errAuth: "❌ Authorization error. Please sign in again.",
        errAuthShort: "❌ Authorization error",
        errUnknown: "Unknown error",
        errLoadList: "❌ Could not load patients: {message}",
        errLoadMessages: "Could not load messages",
        errLoadMessagesFull: "❌ Could not load messages: {message}",
        errSelectFirst: "❌ Please select a patient first",
        errNoTokenSend: "❌ No admin token",
        errSend: "Could not send message",
        errSendFull: "❌ Could not send message: {message}",
        errFileUpload: "❌ Could not upload file: {message}",
        errSession: "❌ Your session has expired. Refresh and sign in again.",
        errForbidden: "❌ File type not allowed: {ext}. RAR and executables are blocked.",
        errMime: "❌ Could not detect file type. Try another file.",
        errImageFmt: "❌ Allowed: JPG, PNG, HEIC – Max 10MB",
        errDocFmt: "❌ Allowed: PDF, DOC/DOCX, TXT, XLS/XLSX, ZIP",
        errPhotoSize: "❌ Photo must be under 10MB",
        errZipSize: "❌ ZIP must be under 50MB",
        errDocSize: "❌ Document must be under 20MB",
        errSelectPatient: "❌ Please select a patient first",
        before: "Before",
        after: "After",
        doctorReview: "👨‍⚕️ Doctor review",
        defaultClinic: "Clinic",
        defaultPhoto: "Photo",
        defaultFile: "File",
        navClinicSettings: "Clinic settings",
        patientAssignedBanner: "This patient is assigned to Dr. {doctorName}.",
      },
      leads: {
        documentTitle: "Messages / Leads / Unassigned — Clinifly Admin",
        pageTitle: "Messages / Leads / Unassigned requests",
        subtitle: "Assign each lead to exactly one doctor. Only that doctor will see the conversation in the doctor app.",
        backDashboard: "← Dashboard",
        refreshList: "Refresh list",
        statusLoading: "Loading…",
        statusUnassigned: "{count} unassigned",
        thPatient: "Patient",
        thContact: "Contact",
        thPreview: "Preview",
        thAssign: "Assign doctor",
        empty: "No unassigned lead messages.",
        selectDoctor: "Select doctor…",
        assign: "Assign",
        errChooseDoctor: "Choose a doctor first.",
        successAssigned: "Assigned successfully.",
        errLoad: "Load error",
        showAssignedToggle: "Show assigned threads",
        assignedBadgePrefix: "Dr.",
        assignedOk: "Assigned:",
        assignDisabledHint: "This lead is already assigned to a doctor.",
      },
    },

    ru: {
      common: {
        loading: "Загрузка...", save: "Сохранить", cancel: "Отмена", delete: "Удалить",
        edit: "Редактировать", search: "Поиск", filter: "Фильтр", close: "Закрыть",
        back: "Назад", next: "Далее", previous: "Предыдущий", submit: "Отправить",
        yes: "Да", no: "Нет", ok: "ОК", error: "Ошибка", success: "Успешно", warning: "Предупреждение",
        doctor: "Врач"
      },
      adminPages: {
        travelH1: "✈️ Clinifly Admin — Поездки",
        travelGlobalWarning: "⚠️ ВНИМАНИЕ: часть полей заполняет пациент. Проверьте подсказки ниже.",
        travelWordHotel: "Отель",
        travelWordFlights: "Рейсы",
        travelListSeparator: " и ",
        travelDynamicWarning: "⚠️ ВНИМАНИЕ: пациент заполнит данные: {list}. Эти поля нельзя менять. Пациент внесёт их в мобильном приложении.",
        healthH1: "🩺 Clinifly Admin — Здоровье",
        doctorApplicationsH1: "Заявки врачей",
        doctorAppsStatPending: "Ожидают",
        doctorAppsStatApproved: "Одобрено",
        doctorAppsStatRejected: "Отклонено",
        doctorAppsStatTotal: "Всего",
        doctorAppsLoading: "Загрузка врачей...",
        doctorAppsEmptyTitle: "Врачей пока нет",
        doctorAppsEmptyDesc: "Заявок ещё не было.",
        activePatientsH1: "👨‍⚕️ Активные пациенты",
        activePatientsStatActive: "Активные",
        activePatientsStatPending: "В ожидании",
        activePatientsStatTotal: "Всего пациентов",
        activePatientsStatClinic: "Клиник",
        activePatientsSearchPlaceholder: "Поиск по имени, email или телефону...",
        activePatientsAllClinics: "Все клиники",
        activePatientsRefresh: "🔄 Обновить",
        activePatientsLoading: "🔄 Загрузка...",
        activePatientsEmpty: "Активных пациентов пока нет",
        treatmentCreateH1: "🏥 Создать лечение",
        treatmentCreateSubtitle: "Создайте группу лечения и назначьте врачей",
        patientDetailH1: "Карта пациента",
        patientDetailBack: "Назад",
        legacyNavClinics: "Клиники"
      },
      dashboard: {
        title: "Clinifly Admin – Панель управления",
        sidebar: {
          mainMenu: "Главное меню",
          management: "Управление",
          logout: "Выход",
          clinic: "Клиника"
        },
        nav: { dashboard: "Панель", patients: "Пациенты", travel: "Поездки", treatment: "Лечение", schedule: "Расписание", doctors: "Врачи", chat: "Чат", leads: "Лиды", files: "Файлы", referrals: "Рефералы", health: "Здоровье", settings: "Настройки" },
        charts: {
          metricTitleMonthlyPatients: "Количество зарегистрированных пациентов по месяцам",
          metricTitleMonthlyProcedures: "Количество процедур по месяцам",
          chartLabelMonthlyRegistered: "Регистрации по месяцам",
          activePatients: "Активные пациенты",
          procedures: "Процедуры",
          noData: "Нет данных",
          trendNote: "Тренд улучшится по мере накопления данных",
          vsPreviousMonth: "по сравнению с прошлым месяцем",
          noPreviousData: "Нет данных за предыдущий период",
          summaryActivePatients: "{count} активных пациентов • {month}",
          summaryMonthlyRegistered: "{count} регистраций • {month}",
          summaryProcedures: "{count} процедур • {month}"
        },
        upcoming: {
          title: "📅 Расписание клиники",
          subtitle: "Все события (прошлые и будущие)",
          empty: "Нет предстоящих событий",
          today: "Сегодня",
          tomorrow: "Завтра",
          dayAfterTomorrow: "Послезавтра",
          daysLater: "Через {count} дн.",
          weeksLater: "Через {count} нед.",
          overdue: "⚠️ Просрочено: {count}",
          overdueDesc: "У вас {count} просроченных событий, требующих внимания.",
          status: { planned: "Запланировано", done: "Выполнено" },
          summary: { overdue: "Просрочено:", today: "Сегодня:", tomorrow: "Завтра:", patients: "пациентов", events: "событий" },
          eventTypes: {
            TRAVEL_EVENT: "Туристическое мероприятие",
            FLIGHT: "Рейс",
            HOTEL: "Отель",
            AIRPORT_PICKUP: "Трансфер из аэропорта",
            TREATMENT: "Лечение",
            CONSULT: "Консультация",
            FOLLOWUP: "Контрольный осмотр",
            LAB: "Лаборатория / Сканирование",
            HEALTH: "Форма здоровья",
            APPOINTMENT: "Запись",
            PAYMENT: "Оплата",
            SURGERY: "Хирургия",
            CHECKUP: "Осмотр"
          }
        },
        planUsage: "План и использование",
        activeTreatments: "Активные процедуры",
        monthlyUploads: "Ежемесячные загрузки",
        referralInvites: "Реферальные приглашения",
        upgrade: "Повысить тариф",
        unlimited: "Безлимит",
        planAlertCrit: "Достигнут лимит. Повысьте тариф, чтобы продолжить.",
        planAlertWarn: "Вы близки к лимиту",
        planTierTitle: "Текущий тариф",
        confirmOpenPricing: "Открыть страницу с ценами?\n\n{url}",
        metricsErrorHint: "См. консоль браузера (F12)"
      },
      calendar: {
        documentTitle: "Календарь - Clinifly Admin",
        pageTitle: "Календарь записей",
        title: "Календарь записей",
        weekRangeTitle: "Диапазон недель",
        today: "Сегодня",
        week: "Неделя",
        month: "Месяц",
        prev: "← Назад",
        previous: "← Назад",
        next: "Вперёд →",
        timeColumn: "Время",
        doctor: "Врач",
        chair: "Кресло",
        allDoctors: "Все врачи",
        allChairs: "Все кресла",
        noEvents: "Нет событий",
        noAppointmentsForWeek: "Нет записей на выбранную неделю.",
        noAppointmentsForRange: "Нет записей в выбранном периоде.",
        summaryLine: "{count} приёмов • {doctorCount} врачей • {chairCount} кресел",
        loading: "Загрузка...",
        tokenMissing: "Нет токена админа. Войдите снова.",
        sessionExpired: "Сессия истекла. Переход к входу...",
        fetchFailed: "Не удалось загрузить записи: {message}",
        doctorNotFound: "Врач не найден",
        chairWithNumber: "Кресло {n}"
      },
      pricing: {
        title: "Тарифы Clinifly",
        subtitle: "Гибкие планы по числу активных пациентов",
        info: "Платите только за количество активных пациентов.",
        periodMonthly: "/месяц",
        free: {
          name: "Free",
          patients: "5 пациентов",
          description: "Попробуйте Clinifly с реальными пациентами.",
          cta: "Начать"
        },
        basic: {
          name: "Pro",
          badge: "Популярно",
          patients: "15 пациентов",
          description: "Сильный пакет для растущих клиник.",
          cta: "Обновить"
        },
        pro: {
          name: "Premium",
          patients: "Безлимит пациентов",
          description: "Премиум-поддержка для крупных клиник.",
          cta: "Обновить",
          contactCta: "Связаться"
        },
        features: {
          allCore: "Все базовые функции",
          patientCommunication: "Коммуникация с пациентами",
          fileSharing: "Обмен файлами",
          referral: "Реферальная система",
          branding: "Брендинг Clinifly",
          customBranding: "Кастомный брендинг",
          analytics: "Аналитика",
          support: "Поддержка по email",
          unlimitedPatients: "Безлимит пациентов",
          advancedReferral: "Расширенные рефералы (уровни, кампании)",
          prioritySupport: "Приоритетная поддержка",
          onboarding: "Онбординг-поддержка"
        },
        comparison: {
          feature: "Функция",
          free: "Free",
          basic: "Pro",
          pro: "Premium",
          patients: "Активные пациенты",
          unlimited: "Безлимит",
          coreFeatures: "Базовые функции",
          branding: "Брендинг Clinifly",
          customBranding: "Кастомный брендинг",
          referral: "Реферальная система",
          advancedReferral: "Расширенные рефералы",
          analytics: "Аналитика",
          support: "Поддержка",
          community: "Сообщество",
          email: "Email",
          priority: "Приоритетная"
        },
        faq: {
          title: "Частые вопросы",
          q1: {
            question: "Как считается число активных пациентов?",
            answer: "Учитываются только APPROVED (активные) пациенты. Pending, rejected и cancelled не входят в лимит."
          },
          q2: {
            question: "Что будет при достижении лимита?",
            answer: "С текущими пациентами можно продолжать работу. Ограничивается только одобрение новых пациентов."
          },
          q3: {
            question: "Можно ли сменить план?",
            answer: "Да, вы можете повысить или понизить план в любое время."
          },
          q4: {
            question: "Какие способы оплаты принимаются?",
            answer: "Мы принимаем банковские карты, банковские переводы и локальные способы оплаты."
          }
        },
        contact: {
          title: "Нужны особые условия?",
          description: "Для крупных клиник доступны индивидуальные планы.",
          button: "Связаться"
        }
      },
      login: { title: "Вход в Clinifly Admin", clinicCode: "Код клиники", password: "Пароль", login: "Войти", loading: "Загрузка...", error: "Ошибка входа", invalidCredentials: "Неверный код клиники или пароль.", sessionExpired: "⏰ Срок сессии истёк или токен недействителен. Пожалуйста, войдите снова." },
      auth: { email: "Эл. почта", password: "Пароль", confirm_password: "Подтвердите пароль", name: "Имя и фамилия" },
      patients: {
        title: "Пациенты", search: "Поиск пациентов...", filter: "Фильтр",
        filterAll: "Все", approve: "Одобрить", treatment: "Лечение", chat: "Чат", travel: "Поездки", health: "Здоровье", files: "📁 Файлы",
        approveConfirm: "Вы хотите одобрить пациента? ({patientId})", approveSuccess: "✅ Пациент одобрен",
        before: "До", after: "После", phone: "Телефон",
        status: { PENDING: "Ожидание", APPROVED: "Одобрено" },
        errors: { noToken: "⚠️ Токен не найден.", loadFailed: "❌ Ошибка загрузки: {error}", approveFailed: "❌ Ошибка одобрения: {error}" }
      },
      referrals: {
        title: "🎁 Рефералы", referrals: "Рефералы", filterAll: "Все", refresh: "Обновить",
        loading: "Загрузка...", noReferrals: "Рефералы не найдены.",
        inviter: "Пригласивший", invited: "Приглашённый", createdAt: "Создано",
        inviterDiscount: "Скидка пригласившего", invitedDiscount: "Скидка приглашённого", discount: "Скидка",
        approve: "Одобрить", reject: "Отклонить",
        approveConfirm: "Вы уверены, что хотите одобрить?", rejectConfirm: "Вы уверены, что хотите отклонить?",
        approved: "Реферал одобрен ✅", rejected: "Реферал отклонён ✅",
        status: { PENDING: "Ожидание", APPROVED: "Одобрено", REJECTED: "Отклонено" },
        errors: { noToken: "⚠️ Токен не найден.", loadFailed: "Ошибка загрузки.", approveFailed: "Ошибка: {error}", rejectFailed: "Ошибка: {error}" }
      },
      settings: {
        title: "⚙️ Настройки клиники",
        pageTitle: "⚙️ Clinifly Admin – Настройки",
        clinicInformation: "Информация о клинике",
        brandingNotice: "Настройки брендинга доступны только для плана PRO.",
        subscriptionPlan: "Тарифный план",
        subscriptionPlanHelp: "Здесь вы можете изменить план FREE / BASIC / PRO.",
        plan: "План",
        branding: "Брендинг",
        clinicName: "Название клиники",
        clinicLogoUrl: "URL логотипа клиники",
        clinicLogoUrlHelp: "Логотип отображается для плана Pro",
        chairCountLabel: "Количество кресел",
        chairCountHelp: "Сколько кресел показывать в календаре записей (напр.: 1, 2, 3).",
        address: "Адрес клиники",
        addressHelp: "Отображается на экране пациента для плана Pro",
        googleMapLink: "Ссылка Google Maps",
        googleMapLinkHelp: "Отображается на экране пациента для плана Pro",
        primaryColor: "Основной цвет (Hex)",
        secondaryColor: "Дополнительный цвет (Hex)",
        welcomeMessage: "Приветственное сообщение",
        referralDiscounts: "🎁 Реферальные скидки",
        referralDiscountsHelp: "Настройте процентные скидки для успешных рефералов.",
        referralDiscount: "Реферальная скидка (%)",
        referralDiscountHelp: "Скидка для пригласившего и приглашённого",
        referralLevel1: "Уровень 1 (%)",
        referralLevel1Help: "Общая скидка после 1 успешного реферала",
        referralLevel2: "Уровень 2 (%)",
        referralLevel2Help: "Общая скидка после 2 успешных рефералов",
        referralLevel3: "Уровень 3 (%)",
        referralLevel3Help: "Максимальная скидка для 3+ рефералов",
        referralSettings: "🎯 Настройки рефералов",
        referralSettingsHelp: "Установите ставки заработка для реферальной системы.",
        referralPerInvite: "Заработок за приглашение (%)",
        referralPerInvitePlaceholder: "10",
        referralPerInviteHelp: "Скидка за каждый успешный реферал",
        referralMaxTotal: "Максимальная общая скидка (%)",
        referralMaxTotalPlaceholder: "10",
        referralMaxTotalHelp: "Максимальная скидка, которую может получить пригласивший.",
        temporaryPatientLimit: "🔧 Временный лимит пациентов",
        temporaryPatientLimitHelp: "Добавьте временный лимит для процессов продаж. Добавляется поверх обычного лимита плана.",
        temporaryLimit: "Временный лимит",
        temporaryLimitPlaceholder: "Доп. кол-во пациентов (напр.: 5)",
        saveTemporaryLimit: "Сохранить временный лимит",
        removeTemporaryLimit: "Удалить временный лимит",
        temporaryLimitActive: "Текущий временный лимит: +{count} пациентов",
        referralPreviewLabel: "💡 Предпросмотр:",
        referralPreviewNone: "❌ Скидка применяться не будет",
        referralPreviewLow: "✅ <strong>Скидка {discount}%</strong> будет применена как пригласившему, так и приглашённому.<br><span style=\"color:#10b981\">💡 Отличная отправная точка для привлечения новых пациентов!</span>",
        referralPreviewMid: "🎉 <strong>Скидка {discount}%</strong> для обеих сторон.<br><span style=\"color:#f59e0b\">⚠️ Больше скидка — привлекательнее рефералы!</span>",
        referralPreviewHigh: "🚀 <strong>Скидка {discount}%</strong> — Максимальный уровень!<br><span style=\"color:#ef4444\">⚠️ Очень щедро — проверьте прибыльность!</span>",
        save: "💾 Сохранить настройки",
        saveLoading: "Сохранение...",
        treatmentPriceList: "💰 Список цен на лечение",
        treatmentPriceListHelp: "Установите цены на лечение вашей клиники.",
        currency: "Валюта",
        loadingPrices: "Загрузка цен...",
        saveAllPrices: "💾 Сохранить все цены",
        tableHeaders: {
          treatment: "Процедура",
          price: "Цена",
          recommended: "Рекомендуется",
          duration: "Длительность (мин)",
          breakMin: "Перерыв (мин)",
          active: "Активно"
        },
        categoryLabels: {
          EVENTS: "События",
          PROSTHETIC: "Ортопедия",
          RESTORATIVE: "Терапия",
          ENDODONTIC: "Эндодонтия",
          SURGICAL: "Хирургия",
          IMPLANT: "Имплантация"
        },
        recommendedDuration: "~{minutes} мин",
        minutes: "мин"
      },
      treatment: {
        patientName: "Имя пациента (выбор)",
        selectPatient: "— Выберите пациента —",
        patientHelp: "Автоматически подставляется при открытии из списка пациентов. Смена пациента перезагружает данные.",
        noPatientSelected: "Пациент не выбран.",
        loadingTreatments: "Загрузка планов лечения...",
        noTreatments: "План лечения для этого пациента не найден.",
        addTreatment: "Добавить лечение",
        saveTreatment: "Сохранить лечение",
        treatmentSaved: "✅ Лечение сохранено!",
        treatmentDeleted: "✅ Лечение удалено!",
        confirmDelete: "Удалить это лечение?",
        pageTitle: "Лечение - Clinifly Admin",
        upperJaw: "Верхняя челюсть",
        lowerJaw: "Нижняя челюсть",
        fdiUpper: "FDI 11–18 / 21–28",
        fdiLower: "FDI 31–38 / 41–48",
        selectedTooth: "Выбранный зуб:",
        selToothHint: "Нажмите на зуб, чтобы добавить процедуру.",
        clearSelection: "Сбросить выбор",
        procedureType: "Тип процедуры",
        loadingProcedures: "Загрузка...",
        statusLabel: "Статус",
        dateLabel: "Дата",
        timeLabel: "Время",
        datePolicy: "Политика даты",
        datePolicyManual: "MANUAL (создать напоминание)",
        datePolicyAuto: "AUTO (дата автоматически)",
        priceOptional: "Цена (опц.)",
        currencyLabel: "Валюта",
        quantityLabel: "Кол-во",
        chairNo: "Кресло №",
        doctorLabel: "Врач",
        doctorSelectOptional: "-- Врач (опц.) --",
        addProcedure: "+ Добавить процедуру",
        diagnosesOnTooth: "Диагнозы по этому зубу",
        addDiagnosisBtn: "+ Добавить диагноз",
        newDiagnosisTitle: "Новый диагноз",
        icdCodeLabel: "Код МКБ-10",
        descriptionLabel: "Описание",
        toothNoLabel: "Зуб №",
        toothPlaceholderAuto: "авто",
        notesOptionalLabel: "Заметка (опц.)",
        notesPlaceholder: "Необязательная заметка...",
        proceduresOnTooth: "Процедуры на этом зубе",
        treatmentEventsTitle: "🦷 События лечения (календарь)",
        treatmentEventsHelp: "События хранятся в таблице treatment_events.",
        eventTitlePlaceholder: "Имплант, день 1",
        eventDescPlaceholder: "КТ + установка импланта",
        teTypeTreatment: "Лечение",
        teTypeConsult: "Консультация",
        teTypeFollowup: "Контроль",
        teTypeLab: "Лаборатория / снимок",
        addEvent: "➕ Добавить событие",
        eventListTitle: "Список событий",
        thDateTime: "Дата/время",
        thType: "Тип",
        thTitle: "Заголовок",
        patientToothDiagnoses: "Диагнозы по зубам пациента",
        badgeToothDoctor: "Зуб № + диагноз врача",
        noDiagnosisSummary: "Записей диагнозов нет.",
        emptyStateTitle: "Записей лечения пока нет",
        emptyStateSub: "Данные появятся после загрузки.",
        selectPatientAbove: "Выберите пациента выше.",
        loadingTreatmentsMsg: "Загрузка лечения...",
        loadFailed: "Не удалось загрузить: {error}",
        noRecordsYet: "Записей нет. Выберите зуб и добавьте процедуру.",
        loadedSummary: "{teethCount} зубов, процедур: {procCount}.",
        loadError: "Ошибка загрузки: {error}",
        selectToothFirst: "⚠️ Сначала выберите зуб",
        toothLocked: "Зуб удалён (заблокирован). Новые процедуры недоступны.",
        selectProcedureType: "Выберите тип процедуры.",
        invalidDateTime: "Неверный формат даты/времени.",
        diagCodeOrDesc: "Введите код или описание МКБ-10.",
        saveFailedWithMsg: "Не сохранено: {error}",
        deleteFailedWithMsg: "Не удалено: {error}",
        errorWithMsg: "Ошибка: {error}",
        saveAllSuccess: "Все процедуры сохранены ✅",
        saveAllError: "Ошибка сохранения: {error}",
        deleteBtn: "Удалить",
        eventsEmpty: "Нет событий.",
        procLineTooth: "Зуб {tooth} • ",
        selToothHintLocked: "⛔ Зуб удалён (locked). Новые процедуры недоступны. Только история.",
        pickToothFromChart: "Нажмите на зуб на схеме выше, чтобы выбрать его.",
        noProcOnTooth: "На этом зубе пока нет процедур.",
        noDiagOnTooth: "Нет записей диагноза по этому зубу.",
        noDescription: "Нет описания",
        diagGroupTooth: "🦷 Зуб {tooth}",
        diagGroupGeneral: "🦷 Общие диагнозы",
        diagNotAdded: "Диагнозы не добавлены",
        toothDiagCountTitle: "На этом зубе {count} записей диагноза",
        datePrefix: "Дата:",
        chairLabel: "Кресло",
        editInlineTitle: "Редактировать в строке",
        statusSelectTitle: "Выберите статус",
        statusCycleTitle: "Нажмите для смены статуса (PLANNED → ACTIVE → COMPLETED → CANCELLED → PLANNED)",
        inlineProcTypePh: "Тип процедуры",
        inlineUnitPricePh: "Цена за ед.",
        inlineQtyPh: "Кол-во",
        inlineChairPh: "Кресло №",
        inlineDoctorPick: "-- Выберите врача --",
        deleteTitle: "Удалить",
        selToothHintActive: "Нажмите на зуб, чтобы добавить процедуру.",
        status: {
          PLANNED: "Запланировано",
          ACTIVE: "В процессе",
          COMPLETED: "Завершено",
          CANCELLED: "Отменено"
        }
      },
      timeline: {
        tooth: "Зуб",
        procedure: "Процедура",
        status: "Статус"
      },
      date: {
        monthsShort: ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"],
        weekdays: ["вс", "пн", "вт", "ср", "чт", "пт", "сб"]
      },
      files: {
        pageTitle: "Admin – Файлы пациента",
        title: "📁 Файлы пациента",
        selectPatient: "Пациент:",
        selectPlaceholder: "Выберите пациента...",
        filterAll: "Все",
        filterPhoto: "📸 Фото",
        filterXray: "🦷 Рентген",
        filterPdf: "📄 PDF",
        filterChat: "💬 Чат",
        upload: "Загрузить",
        empty: "Файлы не найдены.",
        selectToView: "Выберите пациента для просмотра файлов.",
        badgeImage: "Фото",
        badgeXray: "Рентген",
        badgePdf: "PDF",
        badgeFile: "Файл",
        badgeChat: "Чат",
        download: "Скачать"
      },
      doctorListV2: {
        pageTitle: "👨‍⚕️ Врачи",
        documentTitle: "Врачи - Clinifly Admin",
        statPending: "Ожидают",
        statApproved: "Одобрено",
        statRejected: "Отклонено",
        statTotal: "Всего",
        searchPlaceholder: "Поиск по имени, email или телефону...",
        filterAll: "Все статусы",
        filterOptionPending: "Ожидают",
        filterOptionApproved: "Одобрено",
        filterOptionActive: "Активен",
        filterOptionRejected: "Отклонено",
        refresh: "↺ Обновить",
        loading: "Загрузка...",
        empty: "Записей врачей пока нет.",
        errorHttp: "HTTP {status}",
        errorLoad: "Не удалось загрузить",
        sectionProfessional: "Профессия",
        labelExperience: "Опыт",
        labelUniversity: "Университет",
        labelGraduation: "Окончание",
        labelProfile: "Профиль",
        labelBio: "О себе",
        profilePublic: "🌐 Открыт",
        profilePrivate: "🔒 Скрыт",
        sectionSpecialty: "Специализация",
        sectionLanguages: "Языки",
        sectionProcedures: "Процедуры",
        notSpecified: "Не указано",
        yearsCount: "{years} лет",
        dash: "—",
        status: {
          PENDING: "Ожидает",
          APPROVED: "Одобрено",
          ACTIVE: "Активен",
          REJECTED: "Отклонён"
        },
        btnApprove: "✅ Одобрить",
        btnReject: "❌ Отклонить",
        confirmApprove: "Одобрить этого врача?",
        confirmReject: "Отклонить эту заявку?",
        approvedAlert: "✅ Врач одобрен!",
        rejectedAlert: "Заявка отклонена.",
        errorGeneric: "Ошибка"
      },
      chat: {
        documentTitle: "Чат - Clinifly Admin",
        pageHeading: "💬 Clinifly Admin – Чат",
        title: "Сообщения",
        patientsHeading: "Пациенты",
        loading: "Загрузка...",
        selectPatient: "Выберите пациента",
        noPatients: "Пациентов пока нет",
        unnamed: "Без имени",
        placeholder: "Введите сообщение...",
        send: "Отправить",
        sending: "Отправка...",
        noMessages: "Сообщений пока нет",
        newMessage: "Новое сообщение",
        youJoined: "Вы вошли в чат",
        photo: "Фото",
        file: "Файл",
        photoFile: "📷 Фото",
        fileAttach: "📎 Файл",
        download: "Скачать",
        uploadHelp: "Допустимо: JPG, PNG, HEIC (до 10 МБ) • PDF/DOC/DOCX/TXT/XLS/XLSX (до 20 МБ) • ZIP (до 50 МБ)",
        sentOk: "✓ Отправлено",
        uploadError: "✗ Ошибка",
        errNoToken: "❌ Нет токена администратора. Войдите.",
        errTokenList: "Нужен токен администратора",
        errAuth: "❌ Ошибка авторизации. Войдите снова.",
        errAuthShort: "❌ Ошибка авторизации",
        errUnknown: "Неизвестная ошибка",
        errLoadList: "❌ Не удалось загрузить пациентов: {message}",
        errLoadMessages: "Сообщения не загружены",
        errLoadMessagesFull: "❌ Сообщения не загружены: {message}",
        errSelectFirst: "❌ Сначала выберите пациента",
        errNoTokenSend: "❌ Нет токена администратора",
        errSend: "Не удалось отправить сообщение",
        errSendFull: "❌ Не удалось отправить: {message}",
        errFileUpload: "❌ Не удалось загрузить файл: {message}",
        errSession: "❌ Сессия истекла. Обновите и войдите снова.",
        errForbidden: "❌ Тип файла не разрешён: {ext}. RAR и исполняемые файлы запрещены.",
        errMime: "❌ Тип файла не определён. Попробуйте другой.",
        errImageFmt: "❌ Разрешено: JPG, PNG, HEIC – до 10 МБ",
        errDocFmt: "❌ Разрешено: PDF, DOC/DOCX, TXT, XLS/XLSX, ZIP",
        errPhotoSize: "❌ Фото меньше 10 МБ",
        errZipSize: "❌ ZIP меньше 50 МБ",
        errDocSize: "❌ Документ меньше 20 МБ",
        errSelectPatient: "❌ Сначала выберите пациента",
        before: "До",
        after: "После",
        doctorReview: "👨‍⚕️ Проверка врача",
        defaultClinic: "Клиника",
        defaultPhoto: "Фото",
        defaultFile: "Файл",
        navClinicSettings: "Настройки клиники"
      },
      leads: {
        documentTitle: "Сообщения / Лиды / Без врача — Clinifly Admin",
        pageTitle: "Сообщения / Лиды / Неназначенные обращения",
        subtitle: "Назначьте каждое обращение ровно одному врачу. Только этот врач увидит переписку в приложении.",
        backDashboard: "← Панель",
        refreshList: "Обновить список",
        statusLoading: "Загрузка…",
        statusUnassigned: "{count} без назначения",
        thPatient: "Пациент",
        thContact: "Контакт",
        thPreview: "Превью",
        thAssign: "Назначить врача",
        empty: "Нет неназначенных обращений.",
        selectDoctor: "Выберите врача…",
        assign: "Назначить",
        errChooseDoctor: "Сначала выберите врача.",
        successAssigned: "Назначено.",
        errLoad: "Ошибка загрузки"
      }
    },

    ka: {
      common: {
        loading: "იტვირთება...", save: "შენახვა", cancel: "გაუქმება", delete: "წაშლა",
        edit: "რედაქტირება", search: "ძებნა", filter: "ფილტრი", close: "დახურვა",
        back: "უკან", next: "შემდეგ", previous: "წინა", submit: "გაგზავნა",
        yes: "დიახ", no: "არა", ok: "OK", error: "შეცდომა", success: "წარმატება", warning: "გაფრთხილება",
        doctor: "ექიმი"
      },
      adminPages: {
        travelH1: "✈️ Clinifly Admin — მოგზაურობა",
        travelGlobalWarning: "⚠️ ყურადღება: ნაწილი ველების შეავსებს პაციენტი. შეამოწმეთ მინიშნებები ქვემოთ.",
        travelWordHotel: "სასტუმრო",
        travelWordFlights: "ფრენა",
        travelListSeparator: " და ",
        travelDynamicWarning: "⚠️ ყურადღება: {list} შეავსებს პაციენტი. ამ ველების რედაქტირება არ შეგიძლიათ. პაციენტი შეიყვანს მობილურ აპში.",
        healthH1: "🩺 Clinifly Admin — ჯანმრთელობა",
        doctorApplicationsH1: "ექიმის განაცხადები",
        doctorAppsStatPending: "მოლოდინში",
        doctorAppsStatApproved: "დამოწმებული",
        doctorAppsStatRejected: "უარყოფილი",
        doctorAppsStatTotal: "სულ",
        doctorAppsLoading: "ექიმების ჩატვირთვა...",
        doctorAppsEmptyTitle: "ექიმები ჯერ არ არის",
        doctorAppsEmptyDesc: "განაცხადი ჯერ არ შექმნილა.",
        activePatientsH1: "👨‍⚕️ აქტიური პაციენტები",
        activePatientsStatActive: "აქტიური",
        activePatientsStatPending: "მოლოდინში",
        activePatientsStatTotal: "პაციენტები სულ",
        activePatientsStatClinic: "კლინიკები",
        activePatientsSearchPlaceholder: "ძებნა სახელით, ელფოსტით ან ტელეფონით...",
        activePatientsAllClinics: "ყველა კლინიკა",
        activePatientsRefresh: "🔄 განახლება",
        activePatientsLoading: "🔄 იტვირთება...",
        activePatientsEmpty: "აქტიური პაციენტი ჯერ არ არის",
        treatmentCreateH1: "🏥 მკურნალობის შექმნა",
        treatmentCreateSubtitle: "შექმენით ახალი ჯგუფი და მიანიჭეთ ექიმები",
        patientDetailH1: "პაციენტის დეტალები",
        patientDetailBack: "უკან",
        legacyNavClinics: "კლინიკები"
      },
      dashboard: {
        title: "Clinifly Admin – მართვის პანელი",
        sidebar: {
          mainMenu: "მთავარი მენიუ",
          management: "მართვა",
          logout: "გასვლა",
          clinic: "კლინიკა"
        },
        nav: { dashboard: "პანელი", patients: "პაციენტები", travel: "მოგზაურობა", treatment: "მკურნალება", schedule: "განრიგი", doctors: "ექიმები", chat: "ჩათი", leads: "ლიდები", files: "ფაილები", referrals: "მოწვევები", health: "ჯანმრთელობა", settings: "პარამეტრები" },
        charts: {
          metricTitleMonthlyPatients: "ყოველთვიული რეგისტრაციის რაოდენობა",
          metricTitleMonthlyProcedures: "ყოველთვიული პროცედურების რაოდენობა",
          chartLabelMonthlyRegistered: "ყოველთვიული რეგისტრაცია",
          activePatients: "აქტიური პაციენტები",
          procedures: "პროცედურები",
          noData: "მონაცემი არ არის",
          trendNote: "ტრენდი გაუმჯობესდება მეტი მონაცემის დაგროვებისას",
          vsPreviousMonth: "წინა თვესთან შედარებით",
          noPreviousData: "წინა მონაცემი არ არის",
          summaryActivePatients: "{count} აქტიური პაციენტი • {month}",
          summaryMonthlyRegistered: "{count} რეგისტრაცია • {month}",
          summaryProcedures: "{count} პროცედურა • {month}"
        },
        upcoming: {
          title: "📅 კლინიკის განრიგი",
          subtitle: "ყველა მოვლენა (წარსული და მომავალი)",
          empty: "მომავალი მოვლენები არ არის",
          today: "დღეს",
          tomorrow: "ხვალ",
          dayAfterTomorrow: "ზეგ",
          daysLater: "{count} დღეში",
          weeksLater: "{count} კვირაში",
          overdue: "⚠️ ვადაგადაცილებული: {count}",
          overdueDesc: "გაქვთ {count} ვადაგადაცილებული მოვლენა.",
          status: { planned: "დაგეგმილია", done: "შესრულებულია" },
          summary: { overdue: "ვადაგადაცილებული:", today: "დღეს:", tomorrow: "ხვალ:", patients: "პაციენტი", events: "მოვლენა" },
          eventTypes: {
            TRAVEL_EVENT: "მოგზაურობის მოვლენა",
            FLIGHT: "რეისი",
            HOTEL: "სასტუმრო",
            AIRPORT_PICKUP: "აეროპორტის ტრანსფერი",
            TREATMENT: "მკურნალება",
            CONSULT: "კონსულტაცია",
            FOLLOWUP: "კონტროლი",
            LAB: "ლაბორატორია / სკანირება",
            HEALTH: "ჯანმრთელობის ფორმა",
            APPOINTMENT: "ჩაწერა",
            PAYMENT: "გადახდა",
            SURGERY: "ქირურგია",
            CHECKUP: "გასინჯვა"
          }
        },
        planUsage: "პლანი და გამოყენება",
        activeTreatments: "აქტიური მკურნალობები",
        monthlyUploads: "თვიური ატვირთვები",
        referralInvites: "რეფერალური მოწვევები",
        upgrade: "გაუმჯობესება",
        unlimited: "შეუზღვავი",
        planAlertCrit: "ლიმიტი ამოიწურა. გასაგრძელებლად აირჩიეთ უფრო მაღალი ტარიფი.",
        planAlertWarn: "ლიმიტს უახლოვდებით",
        planTierTitle: "მიმდინარე სააბონემენტო დონე",
        confirmOpenPricing: "გავხსნათ ფასების გვერდი?\n\n{url}",
        metricsErrorHint: "დეტალებისთვის ნახეთ ბრაუზერის კონსოლი (F12)"
      },
      calendar: {
        documentTitle: "კალენდარი - Clinifly Admin",
        pageTitle: "ჩაწერის კალენდარი",
        title: "ჩაწერის კალენდარი",
        weekRangeTitle: "კვირის დიაპაზონი",
        today: "დღეს",
        week: "კვირა",
        month: "თვე",
        prev: "← წინ",
        previous: "← წინ",
        next: "შემდეგ →",
        timeColumn: "საათი",
        doctor: "ექიმი",
        chair: "სკამი",
        allDoctors: "ყველა ექიმი",
        allChairs: "ყველა სკამი",
        noEvents: "მოვლენები არ არის",
        noAppointmentsForWeek: "არჩეული კვირისთვის ჩაწერა ვერ მოიძებნა.",
        noAppointmentsForRange: "არჩეული პერიოდისთვის ჩაწერა ვერ მოიძებნა.",
        summaryLine: "{count} ჩაწერა • {doctorCount} ექიმი • {chairCount} სკამი",
        loading: "იტვირთება...",
        tokenMissing: "ადმინის ტოკენი ვერ მოიძებნა. ხელახლა შედით.",
        sessionExpired: "სესია ამოიწურა. გადამისამართება...",
        fetchFailed: "ჩაწერის ჩატვირთვა ვერ მოხერხდა: {message}",
        doctorNotFound: "ექიმი ვერ მოიძებნა",
        chairWithNumber: "სკამი {n}"
      },
      pricing: {
        title: "Clinifly ტარიფები",
        subtitle: "მოქნილი გეგმები აქტიური პაციენტების რაოდენობაზე",
        info: "გადაიხადეთ მხოლოდ აქტიური პაციენტების რაოდენობის მიხედვით.",
        periodMonthly: "/თვე",
        free: {
          name: "Free",
          patients: "5 პაციენტი",
          description: "სცადეთ Clinifly რეალურ პაციენტებთან.",
          cta: "დაწყება"
        },
        basic: {
          name: "Pro",
          badge: "პოპულარული",
          patients: "15 პაციენტი",
          description: "ძლიერი პაკეტი მზარდი კლინიკებისთვის.",
          cta: "გეგმის გაუმჯობესება"
        },
        pro: {
          name: "Premium",
          patients: "ულიმიტო პაციენტი",
          description: "პრემიუმ მხარდაჭერა მსხვილი კლინიკებისთვის.",
          cta: "გეგმის გაუმჯობესება",
          contactCta: "დაგვიკავშირდით"
        },
        features: {
          allCore: "ყველა ძირითადი ფუნქცია",
          patientCommunication: "პაციენტთან კომუნიკაცია",
          fileSharing: "ფაილების გაზიარება",
          referral: "რეფერალის სისტემა",
          branding: "Clinifly ბრენდინგი",
          customBranding: "მორგებული ბრენდინგი",
          analytics: "ანალიტიკა",
          support: "ელფოსტის მხარდაჭერა",
          unlimitedPatients: "ულიმიტო პაციენტები",
          advancedReferral: "გაფართოებული რეფერალი (დონეები, კამპანიები)",
          prioritySupport: "პრიორიტეტული მხარდაჭერა",
          onboarding: "ონბორდინგ მხარდაჭერა"
        },
        comparison: {
          feature: "ფუნქცია",
          free: "Free",
          basic: "Pro",
          pro: "Premium",
          patients: "აქტიური პაციენტები",
          unlimited: "ულიმიტო",
          coreFeatures: "ძირითადი ფუნქციები",
          branding: "Clinifly ბრენდინგი",
          customBranding: "მორგებული ბრენდინგი",
          referral: "რეფერალის სისტემა",
          advancedReferral: "გაფართოებული რეფერალი",
          analytics: "ანალიტიკა",
          support: "მხარდაჭერა",
          community: "საზოგადოება",
          email: "ელფოსტა",
          priority: "პრიორიტეტული"
        },
        faq: {
          title: "ხშირად დასმული კითხვები",
          q1: {
            question: "როგორ ითვლება აქტიური პაციენტების რაოდენობა?",
            answer: "ითვლება მხოლოდ APPROVED (აქტიური) პაციენტები. Pending, rejected ან cancelled არ შედის ლიმიტში."
          },
          q2: {
            question: "რა ხდება ლიმიტის ამოწურვისას?",
            answer: "არსებულ პაციენტებთან მუშაობას გააგრძელებთ. იზღუდება მხოლოდ ახალი პაციენტების დამტკიცება."
          },
          q3: {
            question: "შემიძლია გეგმის შეცვლა?",
            answer: "დიახ, შეგიძლიათ ნებისმიერ დროს განაახლოთ ან შეცვალოთ გეგმა."
          },
          q4: {
            question: "გადახდის რა მეთოდებია ხელმისაწვდომი?",
            answer: "ვიღებთ საბანკო ბარათებს, საბანკო გადარიცხვებს და ლოკალურ გადახდის მეთოდებს."
          }
        },
        contact: {
          title: "გაქვთ განსაკუთრებული საჭიროებები?",
          description: "მსხვილი კლინიკებისთვის ხელმისაწვდომია ინდივიდუალური გეგმები.",
          button: "დაგვიკავშირდით"
        }
      },
      login: { title: "Clinifly Admin-ში შესვლა", clinicCode: "კლინიკის კოდი", password: "პაროლი", login: "შესვლა", loading: "იტვირთება...", error: "შესვლის შეცდომა", invalidCredentials: "კლინიკის კოდი ან პაროლი არასწორია.", sessionExpired: "⏰ სეანსი ამოიწურა ან ტოკენი არასწორია. გთხოვთ, ხელახლა შეხვიდეთ." },
      auth: { email: "ელ-ფოსტა", password: "პაროლი", confirm_password: "დაადასტურეთ პაროლი", name: "სახელი და გვარი" },
      patients: {
        title: "პაციენტები", search: "პაციენტის ძებნა...", filter: "ფილტრი",
        filterAll: "ყველა", approve: "დადასტურება", treatment: "მკურნალება", chat: "ჩათი", travel: "მოგზაურობა", health: "ჯანმრთელობა", files: "📁 ფაილები",
        approveConfirm: "გსურთ პაციენტის დადასტურება? ({patientId})", approveSuccess: "✅ პაციენტი დადასტურებულია",
        before: "წინ", after: "შემდეგ", phone: "ტელეფონი",
        status: { PENDING: "მოლოდინში", APPROVED: "დადასტურებულია" },
        errors: { noToken: "⚠️ ტოკენი ვერ მოიძებნა.", loadFailed: "❌ ჩატვირთვის შეცდომა: {error}", approveFailed: "❌ დადასტურების შეცდომა: {error}" }
      },
      referrals: {
        title: "🎁 მოწვევები", referrals: "მოწვევები", filterAll: "ყველა", refresh: "განახლება",
        loading: "იტვირთება...", noReferrals: "მოწვევები ვერ მოიძებნა.",
        inviter: "მოწვეული", invited: "მოპატიჟებული", createdAt: "შეიქმნა",
        inviterDiscount: "მოწვეულის ფასდაკლება", invitedDiscount: "მოპატიჟებულის ფასდაკლება", discount: "ფასდაკლება",
        approve: "დადასტურება", reject: "უარყოფა",
        approveConfirm: "დარწმუნებული ხართ?", rejectConfirm: "დარწმუნებული ხართ?",
        approved: "მოწვევა დადასტურებულია ✅", rejected: "მოწვევა უარყოფილია ✅",
        status: { PENDING: "მოლოდინში", APPROVED: "დადასტურებულია", REJECTED: "უარყოფილია" },
        errors: { noToken: "⚠️ ტოკენი ვერ მოიძებნა.", loadFailed: "ჩატვირთვის შეცდომა.", approveFailed: "შეცდომა: {error}", rejectFailed: "შეცდომა: {error}" }
      },
      settings: {
        title: "⚙️ კლინიკის პარამეტრები",
        pageTitle: "⚙️ Clinifly Admin – პარამეტრები",
        clinicInformation: "კლინიკის ინფორმაცია",
        brandingNotice: "ბრენდინგის პარამეტრები ხელმისაწვდომია მხოლოდ PRO გეგმისთვის.",
        subscriptionPlan: "სააბონემენტო გეგმა",
        subscriptionPlanHelp: "შეგიძლიათ შეცვალოთ FREE / BASIC / PRO პაკეტი.",
        plan: "გეგმა",
        branding: "ბრენდინგი",
        clinicName: "კლინიკის სახელი",
        clinicLogoUrl: "კლინიკის ლოგოს URL",
        clinicLogoUrlHelp: "ლოგო ნაჩვენებია Pro გეგმისთვის",
        chairCountLabel: "სკამების რაოდენობა",
        chairCountHelp: "კალენდარში საჩვენებელი სკამების რაოდენობა (მაგ.: 1, 2, 3).",
        address: "კლინიკის მისამართი",
        addressHelp: "ნაჩვენებია პაციენტის ეკრანზე Pro გეგმისთვის",
        googleMapLink: "Google Maps ბმული",
        googleMapLinkHelp: "ნაჩვენებია პაციენტის ეკრანზე Pro გეგმისთვის",
        primaryColor: "ძირითადი ფერი (Hex)",
        secondaryColor: "მეორადი ფერი (Hex)",
        welcomeMessage: "მისასალმებელი შეტყობინება",
        referralDiscounts: "🎁 მოწვევის ფასდაკლებები",
        referralDiscountsHelp: "დააყენეთ ფასდაკლების პროცენტები წარმატებული მოწვევებისთვის.",
        referralDiscount: "მოწვევის ფასდაკლება (%)",
        referralDiscountHelp: "ფასდაკლება მიეწოდება ორივეს: მოწვეულსა და მოპატიჟებულს",
        referralLevel1: "დონე 1 (%)",
        referralLevel1Help: "საერთო ფასდაკლება 1 წარმატებული მოწვევის შემდეგ",
        referralLevel2: "დონე 2 (%)",
        referralLevel2Help: "საერთო ფასდაკლება 2 წარმატებული მოწვევის შემდეგ",
        referralLevel3: "დონე 3 (%)",
        referralLevel3Help: "მაქსიმალური ფასდაკლება 3+ მოწვევისთვის",
        referralSettings: "🎯 მოწვევის პარამეტრები",
        referralSettingsHelp: "დააყენეთ მოწვევის სისტემის საპროცენტო განაკვეთები.",
        referralPerInvite: "მოწვევაზე შემოსავალი (%)",
        referralPerInvitePlaceholder: "10",
        referralPerInviteHelp: "ფასდაკლება თითოეული წარმატებული მოწვევისთვის",
        referralMaxTotal: "მაქსიმალური საერთო ფასდაკლება (%)",
        referralMaxTotalPlaceholder: "10",
        referralMaxTotalHelp: "მოწვეულის მიერ მიღებული მაქსიმალური ფასდაკლება.",
        temporaryPatientLimit: "🔧 დროებითი პაციენტის ლიმიტი",
        temporaryPatientLimitHelp: "დაამატეთ დროებითი ლიმიტი გაყიდვების პროცესისთვის.",
        temporaryLimit: "დროებითი ლიმიტი",
        temporaryLimitPlaceholder: "დამატებითი პაციენტები (მაგ.: 5)",
        saveTemporaryLimit: "დროებითი ლიმიტის შენახვა",
        removeTemporaryLimit: "დროებითი ლიმიტის წაშლა",
        temporaryLimitActive: "მიმდინარე დროებითი ლიმიტი: +{count} პაციენტი",
        referralPreviewLabel: "💡 გადახედვა:",
        referralPreviewNone: "❌ ფასდაკლება არ გამოიყენება",
        referralPreviewLow: "✅ <strong>{discount}% ფასდაკლება</strong> გამოიყენება როგორც მოწვეულისთვის, ასევე მოპატიჟებულისთვის.<br><span style=\"color:#10b981\">💡 შესანიშნავი დასაწყისი ახალი პაციენტების მოსაზიდად!</span>",
        referralPreviewMid: "🎉 <strong>{discount}% ფასდაკლება</strong> ორივე მხარისთვის.<br><span style=\"color:#f59e0b\">⚠️ მეტი ფასდაკლება — უფრო მიმზიდველი მოწვევები!</span>",
        referralPreviewHigh: "🚀 <strong>{discount}% ფასდაკლება</strong> — მაქსიმალური დონე!<br><span style=\"color:#ef4444\">⚠️ ძალიან სულგრძელი — შეამოწმეთ მომგებიანობა!</span>",
        save: "💾 პარამეტრების შენახვა",
        saveLoading: "შენახვა...",
        treatmentPriceList: "💰 მკურნალობის ფასების სია",
        treatmentPriceListHelp: "დააყენეთ თქვენი კლინიკის მკურნალობის ფასები.",
        currency: "ვალუტა",
        loadingPrices: "ფასების ჩატვირთვა...",
        saveAllPrices: "💾 ყველა ფასის შენახვა",
        tableHeaders: {
          treatment: "პროცედურა",
          price: "ფასი",
          recommended: "რეკომენდებული",
          duration: "ხანგრძლივობა (წთ)",
          breakMin: "შესვენება (წთ)",
          active: "აქტიური"
        },
        categoryLabels: {
          EVENTS: "შეხვედრები / დიაგნოსტიკა",
          PROSTHETIC: "პროთეტიკა",
          RESTORATIVE: "რესტავრაცია",
          ENDODONTIC: "ენდოდონტია",
          SURGICAL: "ქირურგია",
          IMPLANT: "იმპლანტაცია"
        },
        recommendedDuration: "~{minutes} წთ",
        minutes: "წთ"
      },
      treatment: {
        patientName: "პაციენტის სახელი (არჩევა)",
        selectPatient: "— აირჩიეთ პაციენტი —",
        patientHelp: "ავტომატურად ივსება პაციენტების სიიდან. პაციენტის შეცვლა ხელახლა ტვირთავს მონაცემებს.",
        noPatientSelected: "პაციენტი არ არის არჩეული.",
        loadingTreatments: "მკურნალობის გეგმის ჩატვირთვა...",
        noTreatments: "ამ პაციენტისთვის გეგმა ვერ მოიძებნა.",
        addTreatment: "მკურნალობის დამატება",
        saveTreatment: "შენახვა",
        treatmentSaved: "✅ შენახულია!",
        treatmentDeleted: "✅ წაშლილია!",
        confirmDelete: "წავშალოთ ეს ჩანაწერი?",
        pageTitle: "მკურნალობა - Clinifly Admin",
        upperJaw: "ზედა ყბა",
        lowerJaw: "ქვედა ყბა",
        fdiUpper: "FDI 11–18 / 21–28",
        fdiLower: "FDI 31–38 / 41–48",
        selectedTooth: "არჩეული კბილი:",
        selToothHint: "დააჭირეთ კბილს პროცედურის დასამატებლად.",
        clearSelection: "არჩევის გასუფთავება",
        procedureType: "პროცედურის ტიპი",
        loadingProcedures: "იტვირთება...",
        statusLabel: "სტატუსი",
        dateLabel: "თარიღი",
        timeLabel: "დრო",
        datePolicy: "თარიღის პოლიტიკა",
        datePolicyManual: "MANUAL (შეხსენება)",
        datePolicyAuto: "AUTO (ავტომატური თარიღი)",
        priceOptional: "ფასი (არასავალდებულო)",
        currencyLabel: "ვალუტა",
        quantityLabel: "რაოდენობა",
        chairNo: "სავარძლის №",
        doctorLabel: "ექიმი",
        doctorSelectOptional: "-- ექიმი (არასავალდებულო) --",
        addProcedure: "+ პროცედურის დამატება",
        diagnosesOnTooth: "დიაგნოზები ამ კბილზე",
        addDiagnosisBtn: "+ დიაგნოზები",
        newDiagnosisTitle: "ახალი დიაგნოზი",
        icdCodeLabel: "ICD-10 კოდი",
        descriptionLabel: "აღწერა",
        toothNoLabel: "კბილი №",
        toothPlaceholderAuto: "ავტო",
        notesOptionalLabel: "შენიშვნა (არასავალდებულო)",
        notesPlaceholder: "არასავალდებულო შენიშვნა...",
        proceduresOnTooth: "პროცედურები ამ კბილზე",
        treatmentEventsTitle: "🦷 მოვლენები (კალენდარი)",
        treatmentEventsHelp: "მოვლენები ინახება treatment_events ცხრილში.",
        eventTitlePlaceholder: "იმპლანტი, დღე 1",
        eventDescPlaceholder: "კტ + იმპლანტი",
        teTypeTreatment: "მკურნალობა",
        teTypeConsult: "კონსულტაცია",
        teTypeFollowup: "კონტროლი",
        teTypeLab: "ლაბორატორია / სკანი",
        addEvent: "➕ მოვლენის დამატება",
        eventListTitle: "მოვლენების სია",
        thDateTime: "თარიღი/დრო",
        thType: "ტიპი",
        thTitle: "სათაური",
        patientToothDiagnoses: "პაციენტის კბილის დიაგნოზები",
        badgeToothDoctor: "კბილი № + ექიმის დიაგნოზი",
        noDiagnosisSummary: "დიაგნოზის ჩანაწერი არ არის.",
        emptyStateTitle: "ჩანაწერი ჯერ არ არის",
        emptyStateSub: "მონაცემები გამოჩნდება ჩატვირთვის შემდეგ.",
        selectPatientAbove: "ზემოთ აირჩიეთ პაციენტი.",
        loadingTreatmentsMsg: "იტვირთება...",
        loadFailed: "ჩატვირთვა ვერ მოხერხდა: {error}",
        noRecordsYet: "ჩანაწერი არ არის. აირჩიეთ კბილი და დაამატეთ პროცედურა.",
        loadedSummary: "{teethCount} კბილი, პროცედურა: {procCount}.",
        loadError: "შეცდომა: {error}",
        selectToothFirst: "⚠️ ჯერ აირჩიეთ კბილი",
        toothLocked: "კბილი ჩათვლილია (დაბლოკილი). ახალი პროცედურა შეუძლებელია.",
        selectProcedureType: "აირჩიეთ პროცედურის ტიპი.",
        invalidDateTime: "არასწორი თარიღი/დრო.",
        diagCodeOrDesc: "შეიყვანეთ ICD-10 კოდი ან აღწერა.",
        saveFailedWithMsg: "შენახვა ვერ მოხერხდა: {error}",
        deleteFailedWithMsg: "წაშლა ვერ მოხერხდა: {error}",
        errorWithMsg: "შეცდომა: {error}",
        saveAllSuccess: "ყველა პროცედურა შენახულია ✅",
        saveAllError: "შენახვის შეცდომა: {error}",
        deleteBtn: "წაშლა",
        eventsEmpty: "მოვლენები არ არის.",
        procLineTooth: "კბილი {tooth} • ",
        selToothHintLocked: "⛔ ეს კბილი ამოღებულია (locked). ახალი პროცედურები არ ემატება. მხოლოდ ისტორია.",
        pickToothFromChart: "აირჩიეთ კბილი ზემოთ არსებული სქემიდან.",
        noProcOnTooth: "ამ კბილზე ჯერ პროცედურები არ არის.",
        noDiagOnTooth: "ამ კბილზე დიაგნოზის ჩანაწერი არ არის.",
        noDescription: "აღწერა არ არის",
        diagGroupTooth: "🦷 კბილი {tooth}",
        diagGroupGeneral: "🦷 ზოგადი დიაგნოზები",
        diagNotAdded: "დიაგნოზები არ არის დამატებული",
        toothDiagCountTitle: "ამ კბილზე {count} დიაგნოზის ჩანაწერია",
        datePrefix: "თარიღი:",
        chairLabel: "სავარძელი",
        editInlineTitle: "რედაქტირება ხაზში",
        statusSelectTitle: "აირჩიეთ სტატუსი",
        statusCycleTitle: "დააჭირეთ სტატუსის შესაცვლელად (PLANNED → ACTIVE → COMPLETED → CANCELLED → PLANNED)",
        inlineProcTypePh: "პროცედურის ტიპი",
        inlineUnitPricePh: "ერთეულის ფასი",
        inlineQtyPh: "რაოდ.",
        inlineChairPh: "სავარძელი №",
        inlineDoctorPick: "-- აირჩიეთ ექიმი --",
        deleteTitle: "წაშლა",
        selToothHintActive: "დააჭირეთ კბილს პროცედურის დასამატებლად.",
        status: {
          PLANNED: "დაგეგმილია",
          ACTIVE: "მიმდინარე",
          COMPLETED: "დასრულებულია",
          CANCELLED: "გაუქმებულია"
        }
      },
      timeline: {
        tooth: "კბილი",
        procedure: "პროცედურა",
        status: "სტატუსი"
      },
      date: {
        monthsShort: ["იან", "თებ", "მარ", "აპრ", "მაი", "ივნ", "ივლ", "აგვ", "სექ", "ოქტ", "ნოე", "დეკ"],
        weekdays: ["კვ", "ორ", "სამ", "ოთხ", "ხუთ", "პარ", "შაბ"]
      },
      files: {
        pageTitle: "Admin – პაციენტის ფაილები",
        title: "📁 პაციენტის ფაილები",
        selectPatient: "პაციენტი:",
        selectPlaceholder: "პაციენტი აირჩიეთ...",
        filterAll: "ყველა",
        filterPhoto: "📸 ფოტო",
        filterXray: "🦷 რენტგენი",
        filterPdf: "📄 PDF",
        filterChat: "💬 ჩათი",
        upload: "ატვირთვა",
        empty: "ფაილები ვერ მოიძებნა.",
        selectToView: "ფაილების სანახავად პაციენტი აირჩიეთ.",
        badgeImage: "ფოტო",
        badgeXray: "რენტგენი",
        badgePdf: "PDF",
        badgeFile: "ფაილი",
        badgeChat: "ჩათი",
        download: "ჩამოტვირთვა"
      },
      doctorListV2: {
        pageTitle: "👨‍⚕️ ექიმები",
        documentTitle: "ექიმები - Clinifly Admin",
        statPending: "ლოდინი",
        statApproved: "დამოწმებული",
        statRejected: "უარყოფილი",
        statTotal: "სულ",
        searchPlaceholder: "ძიება სახელით, email-ით ან ტელეფონით...",
        filterAll: "ყველა სტატუსი",
        filterOptionPending: "ლოდინში",
        filterOptionApproved: "დამოწმებული",
        filterOptionActive: "აქტიური",
        filterOptionRejected: "უარყოფილი",
        refresh: "↺ განახლება",
        loading: "იტვირთება...",
        empty: "ექიმის ჩანაწერები ჯერ არ არის.",
        errorHttp: "HTTP {status}",
        errorLoad: "ჩატვირთვა ვერ მოხერხდა",
        sectionProfessional: "პროფესია",
        labelExperience: "გამოცდილება",
        labelUniversity: "უნივერსიტეტი",
        labelGraduation: "დამთავრება",
        labelProfile: "პროფილი",
        labelBio: "ბიო",
        profilePublic: "🌐 საჯარო",
        profilePrivate: "🔒 დამალული",
        sectionSpecialty: "სპეციალიზაცია",
        sectionLanguages: "ენები",
        sectionProcedures: "პროცედურები",
        notSpecified: "არ არის მითითებული",
        yearsCount: "{years} წ",
        dash: "—",
        status: {
          PENDING: "ლოდინში",
          APPROVED: "დამოწმებული",
          ACTIVE: "აქტიური",
          REJECTED: "უარყოფილი"
        },
        btnApprove: "✅ დადასტურება",
        btnReject: "❌ უარყოფა",
        confirmApprove: "დარწმუნებული ხართ, რომ გინდათ ამ ექიმის დამოწმება?",
        confirmReject: "დარწმუნებული ხართ, რომ გინდათ განაცხადის უარყოფა?",
        approvedAlert: "✅ ექიმი დამოწმებულია!",
        rejectedAlert: "განაცხადი უარყოფილია.",
        errorGeneric: "შეცდომა"
      },
      chat: {
        documentTitle: "ჩატი - Clinifly Admin",
        pageHeading: "💬 Clinifly Admin – ჩატი",
        title: "შეტყობინებები",
        patientsHeading: "პაციენტები",
        loading: "იტვირთება...",
        selectPatient: "აირჩიეთ პაციენტი",
        noPatients: "პაციენტები ჯერ არ არის",
        unnamed: "უსახელო",
        placeholder: "შეიყვანეთ შეტყობინება...",
        send: "გაგზავნა",
        sending: "იგზავნება...",
        noMessages: "ჯერ შეტყობინებები არ არის",
        newMessage: "ახალი შეტყობინება",
        youJoined: "შეუერთეთ ჩატს",
        photo: "ფოტო",
        file: "ფაილი",
        photoFile: "📷 ფოტო",
        fileAttach: "📎 ფაილი",
        download: "ჩამოტვირთვა",
        uploadHelp: "მხარდაჭერილი: JPG, PNG, HEIC (მაქს 10 მბ) • PDF/DOC/DOCX/TXT/XLS/XLSX (მაქს 20 მბ) • ZIP (მაქს 50 მბ)",
        sentOk: "✓ გაიგზავნა",
        uploadError: "✗ შეცდომა",
        errNoToken: "❌ ადმინ ტოკენი არ არის. ჯერ შედით.",
        errTokenList: "საჭიროა ადმინ ტოკენი",
        errAuth: "❌ ავტორიზაცია ვერ მოხერხდა. ხელახლა შედით.",
        errAuthShort: "❌ ავტორიზაცია ვერ მოხერხდა",
        errUnknown: "უცნობი შეცდომა",
        errLoadList: "❌ პაციენტების ჩატვირთვა ვერ მოხერხდა: {message}",
        errLoadMessages: "შეტყობინებების ჩატვირთვა ვერ მოხერხდა",
        errLoadMessagesFull: "❌ შეტყობინებების ჩატვირთვა ვერ მოხერხდა: {message}",
        errSelectFirst: "❌ ჯერ აირჩიეთ პაციენტი",
        errNoTokenSend: "❌ ადმინ ტოკენი არ არის",
        errSend: "შეტყობინების გაგზავნა ვერ მოხერხდა",
        errSendFull: "❌ გაგზავნა ვერ მოხერხდა: {message}",
        errFileUpload: "❌ ფაილის ატვირთვა ვერ მოხერხდა: {message}",
        errSession: "❌ სესია ამოიწურა. ხელახლა შედით.",
        errForbidden: "❌ ფაილის ტიპი აკრძალულია: {ext}.",
        errMime: "❌ ფაილის ტიპი ვერ განისაზღვრა. სცადეთ სხვა ფაილი.",
        errImageFmt: "❌ JPG, PNG, HEIC – მაქს 10 მბ",
        errDocFmt: "❌ PDF, DOC/DOCX, TXT, XLS/XLSX, ZIP",
        errPhotoSize: "❌ ფოტო 10 მბ-ზე ნაკლები",
        errZipSize: "❌ ZIP 50 მბ-ზე ნაკლები",
        errDocSize: "❌ დოკუმენტი 20 მბ-ზე ნაკლები",
        errSelectPatient: "❌ ჯერ აირჩიეთ პაციენტი",
        before: "უწინ",
        after: "შემდეგ",
        doctorReview: "👨‍⚕️ ექიმის მიმოხილვა",
        defaultClinic: "კლინიკა",
        defaultPhoto: "ფოტო",
        defaultFile: "ფაილი",
        navClinicSettings: "კლინიკის პარამეტრები"
      },
      leads: {
        documentTitle: "შეტყობინებები / ლიდები / დაუმისამართებელი — Clinifly Admin",
        pageTitle: "შეტყობინებები / ლიდები / დაუმისამართებელი მოთხოვნები",
        subtitle: "თითო მოთხოვნა ზუსტად ერთ ექიმზე მიანიჭეთ. მხოლოდ ამ ექიმს ენახება საუბარი ექიმის აპში.",
        backDashboard: "← პანელი",
        refreshList: "სიის განახლება",
        statusLoading: "იტვირთება…",
        statusUnassigned: "{count} დაუმისამართებელი",
        thPatient: "პაციენტი",
        thContact: "კონტაქტი",
        thPreview: "შინაარსი",
        thAssign: "ექიმის მიბმა",
        empty: "დაუმისამართებელი მოთხოვნები არ არის.",
        selectDoctor: "აირჩიეთ ექიმი…",
        assign: "მიბმა",
        errChooseDoctor: "ჯერ აირჩიეთ ექიმი.",
        successAssigned: "დაინიშნა.",
        errLoad: "ჩატვირთვის შეცდომა"
      }
    }
  };

  /** localhost or ?adminI18nValidate=1 — compare top-level section keys across tr/en/ru/ka */
  function runOptionalTranslationParityCheck() {
    try {
      var h = typeof location !== 'undefined' ? String(location.hostname || '') : '';
      var validate =
        h === 'localhost' ||
        h === '127.0.0.1' ||
        h === '::1' ||
        (typeof location !== 'undefined' && /[?&]adminI18nValidate=1(?:&|$)/.test(location.search || ''));
      if (!validate || !translations || !translations.en || typeof translations.en !== 'object') return;
      var enKeys = Object.keys(translations.en).sort().join(',');
      ['tr', 'ru', 'ka'].forEach(function (L) {
        var o = translations[L];
        if (!o || typeof o !== 'object') {
          console.warn('[AdminI18n parity] missing language root:', L);
          return;
        }
        var keys = Object.keys(o).sort().join(',');
        if (keys !== enKeys) {
          var enList = Object.keys(translations.en);
          var missing = enList.filter(function (k) {
            return !Object.prototype.hasOwnProperty.call(o, k);
          });
          var extra = Object.keys(o).filter(function (k) {
            return !Object.prototype.hasOwnProperty.call(translations.en, k);
          });
          if (missing.length) {
            console.warn('[AdminI18n parity] ' + L + ' missing top-level sections vs en (' + missing.length + '):', missing.slice(0, 40));
          }
          if (extra.length) {
            console.warn('[AdminI18n parity] ' + L + ' extra top-level sections vs en (' + extra.length + '):', extra.slice(0, 40));
          }
        }
      });
    } catch (e) {
      /* ignore */
    }
  }

  runOptionalTranslationParityCheck();

  function emitI18nReady() {
    if (typeof document !== 'undefined' && document.dispatchEvent) {
      document.dispatchEvent(new Event("i18n:ready"));
    }
  }

  function emitAdminLanguageChanged(lang, meta) {
    if (typeof document === 'undefined' || !document.dispatchEvent) return;
    try {
      var detail = Object.assign({ lang: lang }, meta && typeof meta === 'object' ? meta : {});
      document.dispatchEvent(new CustomEvent('admin-language-changed', { detail: detail }));
    } catch (e) {
      /* ignore */
    }
  }

  function rerenderAll() {
    if (typeof window.renderDashboard === 'function') {
      try { window.renderDashboard(); } catch (e) { console.warn('renderDashboard', e); }
    }
    if (typeof window.applyScheduleStaticI18n === 'function' && window.i18n && typeof window.i18n.getLang === 'function') {
      try { window.applyScheduleStaticI18n(window.i18n.getLang()); } catch (e) { console.warn('applyScheduleStaticI18n', e); }
    }
    if (typeof window.renderGrid === 'function' && document.getElementById('calendarGrid')) {
      const container = document.getElementById('calendarGrid');
      if (container) container.innerHTML = '';
      const ap = (typeof window.allAppointments !== 'undefined' && window.allAppointments) ? window.allAppointments : [];
      const items = Array.isArray(ap) ? ap : [];
      const L = (window.i18n && typeof window.i18n.getLang === 'function') ? window.i18n.getLang() : 'en';
      try { window.renderGrid(items, L); } catch (e) { console.warn('renderGrid', e); }
    }
    if (typeof window.renderDoctors === 'function') {
      try { window.renderDoctors(); } catch (e) { console.warn('renderDoctors', e); }
    }
    if (typeof window.renderChat === 'function') {
      try { window.renderChat(); } catch (e) { console.warn('renderChat', e); }
    }
    const asyncAfter = [];
    if (typeof window.rerenderTreatment === 'function') {
      try {
        const p = window.rerenderTreatment();
        if (p && typeof p.then === 'function') asyncAfter.push(p);
      } catch (e) { console.warn('rerenderTreatment', e); }
    }
    if (typeof window.rerenderPatientsI18n === 'function') {
      try { window.rerenderPatientsI18n(); } catch (e) { console.warn('rerenderPatientsI18n', e); }
    }
    if (typeof window.rerenderLeads === 'function') {
      try { window.rerenderLeads(); } catch (e) { console.warn('rerenderLeads', e); }
    }
    if (typeof window.rerenderSettings === 'function') {
      try {
        const p = window.rerenderSettings();
        if (p && typeof p.then === 'function') asyncAfter.push(p);
      } catch (e) { console.warn('rerenderSettings', e); }
    }
    if (typeof window.rerenderLoginPage === 'function') {
      try { window.rerenderLoginPage(); } catch (e) { console.warn('rerenderLoginPage', e); }
    }
    if (typeof window.rerenderRegisterPage === 'function') {
      try { window.rerenderRegisterPage(); } catch (e) { console.warn('rerenderRegisterPage', e); }
    }
    if (typeof window.rerenderDoctorLoginPage === 'function') {
      try { window.rerenderDoctorLoginPage(); } catch (e) { console.warn('rerenderDoctorLoginPage', e); }
    }
    function applyDomI18n() {
      if (window.i18n && typeof window.i18n.updatePage === 'function') {
        try { window.i18n.updatePage(); } catch (e) { console.warn('updatePage', e); }
      }
    }
    if (asyncAfter.length) {
      Promise.all(asyncAfter).then(applyDomI18n, applyDomI18n);
    } else {
      applyDomI18n();
    }
  }
  window.rerenderAll = rerenderAll;

  function bindAdminLangButtons() {
    const allowed = new Set(['tr', 'en', 'ru', 'ka']);
    document.querySelectorAll('#alLang .lang-btn, #lang-switcher .lang-btn').forEach(function (btn) {
      if (btn.getAttribute('data-i18n-listener') === '1') return;
      btn.setAttribute('data-i18n-listener', '1');
      function run(e) {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        const lang = normalizeAdminLang(
          (e && e.currentTarget && e.currentTarget.getAttribute('data-lang')) || btn.getAttribute('data-lang') || ''
        );
        if (!allowed.has(lang)) return;
        console.log('LANG CLICKED:', lang);
        if (window.AdminI18n && typeof window.AdminI18n.setLanguage === 'function') {
          window.AdminI18n.setLanguage(lang);
        } else if (window.i18n && typeof window.i18n.setLang === 'function') {
          window.i18n.setLang(lang);
        } else if (typeof window.onLanguageChange === 'function') {
          window.onLanguageChange(lang);
        }
        if (window.i18n && typeof window.i18n.getLang === 'function') {
          const cur = window.i18n.getLang();
          console.log('CURRENT LANG:', cur);
          if (cur !== lang) {
            console.warn('Language did not update!');
          }
        }
      }
      btn.addEventListener('click', run);
      btn.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          run(e);
        }
      });
    });
  }
  window.rebindAdminLangButtons = bindAdminLangButtons;

  // i18n helper
  const i18n = {
    currentLang: 'en',
    
    init() {
      if (this._i18nInitOnce) {
        return;
      }
      this._i18nInitOnce = true;
      const saved = readAdminLangStorage();
      const lang0 = translations[saved] ? saved : 'en';
      this.currentLang = lang0;
      writeAdminLangStorage(lang0);
      if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.lang = lang0;
      }
      emitAdminLanguageChanged(lang0, { phase: 'init' });
      this.createLangSwitcher();
      setTimeout(function () {
        clearStaleNavTextNodes();
        emitI18nReady();
        bindAdminLangButtons();
        setTimeout(function () {
          rerenderAll();
        }, 0);
      }, 0);
    },
    
    setLanguage(lang) {
      lang = normalizeAdminLang(lang);
      if (!translations[lang]) lang = 'en';
      this.currentLang = lang;
      writeAdminLangStorage(lang);
      if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.lang = lang;
      }
      clearStaleNavTextNodes();
      emitAdminLanguageChanged(lang, { phase: 'user' });
      emitI18nReady();
      setTimeout(function () {
        rerenderAll();
        if (window.i18n && typeof window.i18n.getLang === 'function') {
          console.log('FINAL LANG:', window.i18n.getLang());
        }
      }, 0);
      return this;
    },

    setLang(lang) {
      return this.setLanguage(lang);
    },
    
    getLang() {
      return this.currentLang;
    },
    
    t(key, params = {}) {
      const applyParams = (s) => String(s).replace(/\{(\w+)\}/g, (match, p1) => (params[p1] !== undefined ? params[p1] : match));
      const sb = String(key).match(/^dashboard\.sidebar\.(mainMenu|management|logout|clinic)$/);
      if (sb) {
        const node = DASHBOARD_SIDEBAR_I18N[sb[1]];
        if (node && typeof node === 'object') {
          const L = this.currentLang;
          const raw = node[L] != null && node[L] !== '' ? node[L] : (node.en != null && node.en !== '' ? node.en : String(key));
          return applyParams(raw);
        }
      }
      const keys = key.split('.');
      const resolve = (lang) => {
        let value = translations[lang];
        for (const k of keys) {
          if (!value || typeof value !== 'object') return null;
          value = value[k];
        }
        return typeof value === 'string' ? value : null;
      };
      let value = resolve(this.currentLang);
      if (value == null || value === '') value = resolve('en');
      if (value == null || value === '') value = key;
      return applyParams(value);
    },
    
    createLangSwitcher() {
      // Defer to DOMContentLoaded so admin-layout.js has a chance to inject alLang first
      const tryCreate = () => {
        if (document.getElementById('alLang') || document.getElementById('lang-switcher')) return;
        this._doCreateLangSwitcher();
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tryCreate);
      } else {
        // Already loaded — wait a tick for admin-layout.js to inject
        setTimeout(tryCreate, 0);
      }
    },
    _doCreateLangSwitcher() {
      if (document.getElementById('alLang') || document.getElementById('lang-switcher')) return;

      const LANGS = [
        { code: 'tr', label: '🇹🇷 TR' },
        { code: 'en', label: '🇬🇧 EN' },
        { code: 'ru', label: '🇷🇺 RU' },
        { code: 'ka', label: '🇬🇪 KA' },
      ];

      const switcher = document.createElement('div');
      switcher.id = 'lang-switcher';
      switcher.className = 'lang-switcher';
      switcher.setAttribute('role', 'group');
      switcher.setAttribute('aria-label', 'Language');
      switcher.style.cssText = `
        position: fixed; top: 20px; right: 20px; z-index: 100000;
        display: flex; gap: 6px;
        background: var(--card, #1f2937); border: 1px solid var(--b, #374151);
        border-radius: 12px; padding: 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15); backdrop-filter: blur(10px);
        pointer-events: auto; touch-action: manipulation;
      `;

      const btnStyle = (active) => `
        padding: 6px 12px; border: none; border-radius: 7px;
        background: ${active ? 'var(--p, #2563eb)' : 'transparent'};
        color: ${active ? '#fff' : 'var(--muted, #a7b2c8)'};
        cursor: pointer; font-weight: 600; font-size: 12px; transition: all 0.2s ease;
      `;

      const buttons = {};
      LANGS.forEach(({ code, label }) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'lang-btn';
        btn.setAttribute('data-lang', code);
        btn.setAttribute('id', 'lang-sel-' + code);
        btn.textContent = label;
        btn.style.cssText = btnStyle(this.currentLang === code);
        buttons[code] = btn;
        switcher.appendChild(btn);
      });

      document.body.appendChild(switcher);

      const updateButtons = () => {
        LANGS.forEach(({ code }) => {
          buttons[code].style.cssText = btnStyle(this.currentLang === code);
        });
      };

      const originalUpdatePage = this.updatePage.bind(this);
      this.updatePage = () => { originalUpdatePage(); updateButtons(); };
      updateButtons();
      bindAdminLangButtons();
    },
    
    updatePage() {
      if (isUpdatingI18n) return;
      isUpdatingI18n = true;
      try {
        // Update all elements with data-i18n attribute
        document.querySelectorAll('[data-i18n]').forEach((el) => {
          const key = el.getAttribute('data-i18n');
          let params = {};
          try {
            params = JSON.parse(el.getAttribute('data-i18n-params') || '{}');
          } catch (e) {
            console.error("[i18n] Failed to parse data-i18n-params:", e, { key });
            params = {};
          }
          el.textContent = this.t(key, params);
          const text = (el.textContent || '').trim();
          if (text === 'Dashboard' || text === 'Kaydet') {
            console.warn('Hardcoded string detected');
          }
        });
        
        // Update all inputs with data-i18n-placeholder (skip labelled fields — rely on labels only)
        document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
          if (typeof el.closest === "function" && el.closest(".field")) {
            el.removeAttribute("data-i18n-placeholder");
            el.placeholder = "";
            return;
          }
          const key = el.getAttribute("data-i18n-placeholder");
          el.placeholder = this.t(key);
        });
        
        // Update all inputs with data-i18n-title
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
          const key = el.getAttribute('data-i18n-title');
          el.title = this.t(key);
        });
        if (this.currentLang === 'ru' && document.body) {
          const bodyText = document.body.innerText || '';
          if (bodyText.match(/[A-Za-z]/)) {
            console.warn('⚠️ Mixed language detected');
          }
        }
      } finally {
        isUpdatingI18n = false;
      }
    }
  };

  try {
    Object.defineProperty(window, 'i18n', {
      value: i18n,
      configurable: false,
      writable: false,
      enumerable: true
    });
  } catch (e) {
    if (!window.i18n) {
      window.i18n = i18n;
    }
  }
  // Object.freeze(window.i18n) would break setLanguage (mutates currentLang)

  window.applyI18n = function () {
    if (window.i18n && typeof window.i18n.updatePage === 'function') {
      window.i18n.updatePage();
    }
  };

  window.onLanguageChange = function (lang) {
    try {
      if (window.AdminI18n && typeof window.AdminI18n.setLanguage === 'function') {
        window.AdminI18n.setLanguage(lang);
      } else if (window.i18n && typeof window.i18n.setLanguage === 'function') {
        window.i18n.setLanguage(lang);
      }
    } catch (e) {
      console.error("[i18n] window.onLanguageChange failed:", e);
    }
  };

  /**
   * Canonical admin UI language API — all persistence goes through i18n.setLanguage / writeAdminLangStorage.
   * Do not call localStorage.setItem('admin_lang', ...) elsewhere.
   */
  var adminI18nApi = Object.freeze({
    STORAGE_KEY: ADMIN_LANG_STORAGE_KEY,
    /** Dispatched on document after language changes: detail = { lang, phase: 'init'|'user' } */
    LANGUAGE_CHANGED_EVENT: 'admin-language-changed',
    normalizeLanguage: normalizeAdminLang,
    readStored: readAdminLangStorage,
    getLanguage: function () {
      return i18n.getLang();
    },
    setLanguage: function (lang) {
      return i18n.setLanguage(lang);
    },
    /** Before redirect (login → dashboard): align storage + runtime + document.lang. */
    persistFromUi: function () {
      try {
        var norm = normalizeAdminLang(
          (typeof i18n.getLang === 'function' ? i18n.getLang() : '') || readAdminLangStorage() || 'en'
        );
        i18n.setLanguage(norm);
      } catch (e) {
        /* ignore */
      }
    },
    /** After layout inject: apply stored language or refresh data-i18n. */
    syncFromStorage: function () {
      try {
        var stored = readAdminLangStorage();
        if (typeof i18n.getLang === 'function' && i18n.getLang() !== stored) {
          i18n.setLanguage(stored);
        } else if (typeof i18n.updatePage === 'function') {
          i18n.updatePage();
        }
      } catch (e) {
        /* ignore */
      }
    },
  });
  try {
    Object.defineProperty(window, 'AdminI18n', {
      value: adminI18nApi,
      configurable: false,
      writable: false,
      enumerable: true,
    });
  } catch (e) {
    window.AdminI18n = adminI18nApi;
  }

  /** @deprecated Use AdminI18n.persistFromUi */
  window.persistAdminUiLanguage = function () {
    if (window.AdminI18n && typeof window.AdminI18n.persistFromUi === 'function') {
      window.AdminI18n.persistFromUi();
    }
  };

  /** @deprecated Use AdminI18n.syncFromStorage */
  window.syncAdminLanguageFromStorage = function () {
    if (window.AdminI18n && typeof window.AdminI18n.syncFromStorage === 'function') {
      window.AdminI18n.syncFromStorage();
    }
  };

  function assertProcedureNameNotMixed(procedure) {
    if (procedure && typeof procedure.name === "string" && procedure.name.includes("(")) {
      console.warn("Mixed language UI:", procedure.name);
    }
  }
  window.assertProcedureNameNotMixed = assertProcedureNameNotMixed;
  
  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => i18n.init());
  } else {
    i18n.init();
  }
})();
