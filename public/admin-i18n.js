// Admin Panel i18n System
(function() {
  'use strict';

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
        warning: "Uyarı"
      },
      
      // Dashboard (admin.html)
      dashboard: {
        title: "Clinifly Admin – Dashboard",
        nav: {
          dashboard: "Dashboard",
          patients: "Hastalar",
          travel: "Seyahat",
          treatment: "Tedavi",
          chat: "Chat",
          referrals: "Referanslar",
          health: "Sağlık",
          settings: "Klinik Ayarları",
          login: "Login",
          register: "Klinik Kaydı"
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
          weeksLater: "{count} hafta sonra"
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
        success: "Hoş geldiniz {name}! Giriş başarılı."
      },
      
      // Register (admin-register.html)
      register: {
        title: "Yeni Klinik Kaydı",
        subtitle: "Yeni bir klinik hesabı oluşturun",
        clinicCode: "Clinic Code",
        clinicCodeRequired: "*",
        clinicCodePlaceholder: "MOON",
        clinicCodeHelp: "Benzersiz klinik kodunuz (örn: MOON, CLINIC01, İSTANBUL)",
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
          passwordRequired: "Lütfen şifrenizi giriniz.",
          passwordMinLength: "Şifre en az 6 karakter olmalıdır.",
          passwordMismatch: "Şifreler eşleşmiyor.",
          registerFailed: "Kayıt başarısız. Lütfen tekrar deneyin.",
          genericError: "Kayıt hatası: {error}",
          termsNotAccepted: "Lütfen hizmet sözleşmesini kabul edin."
        },
        success: "Klinik kaydı başarılı! Giriş sayfasına yönlendiriliyorsunuz...",
        termsText: "Clinifly Dijital Platform Hizmet Sözleşmesi'ni okudum, anladım ve kabul ediyorum. Free Paket kapsamındaki hizmetlerin ücretsiz olduğunu, Free Paket dışındaki dijital hizmetlerin ücretli olduğunu ve bu hizmetlerin kapsam ile bedelinin ayrıca belirleneceğini kabul ederim."
      },
      
      // Settings (admin-settings.html)
      settings: {
        title: "⚙️ Clinic Settings",
        plan: "Plan",
        branding: "Branding",
        clinicName: "Clinic Name",
        clinicLogoUrl: "Clinic Logo URL",
        address: "Address",
        googleMapLink: "Google Map Link",
        primaryColor: "Primary Color",
        secondaryColor: "Secondary Color",
        welcomeMessage: "Welcome Message",
        referrals: "Referral Discounts",
        inviterDiscount: "Inviter Discount (%)",
        invitedDiscount: "Invited Discount (%)",
        save: "Save Settings",
        saveLoading: "Kaydediliyor...",
        errors: {
          noToken: "Admin token bulunamadı. Lütfen admin olarak giriş yapın.",
          loadFailed: "Ayarlar yüklenemedi: {error}",
          saveFailed: "Ayarlar kaydedilemedi: {error}"
        },
        success: "Ayarlar başarıyla kaydedildi!"
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
        warning: "Warning"
      },
      
      // Dashboard (admin.html)
      dashboard: {
        title: "Clinifly Admin – Dashboard",
        nav: {
          dashboard: "Dashboard",
          patients: "Patients",
          travel: "Travel",
          treatment: "Treatment",
          chat: "Chat",
          referrals: "Referrals",
          health: "Health",
          settings: "Clinic Settings",
          login: "Login",
          register: "Register Clinic"
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
          weeksLater: "{count} weeks later"
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
        success: "Welcome {name}! Login successful."
      },
      
      // Register (admin-register.html)
      register: {
        title: "New Clinic Registration",
        subtitle: "Create a new clinic account",
        clinicCode: "Clinic Code",
        clinicCodeRequired: "*",
        clinicCodePlaceholder: "MOON",
        clinicCodeHelp: "Your unique clinic code (e.g., MOON, CLINIC01, ISTANBUL)",
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
          passwordRequired: "Please enter password.",
          passwordMinLength: "Password must be at least 6 characters.",
          passwordMismatch: "Passwords do not match.",
          registerFailed: "Registration failed. Please try again.",
          genericError: "Registration error: {error}",
          termsNotAccepted: "Please accept the service agreement."
        },
        success: "Clinic registration successful! Redirecting to login page...",
        termsText: "I have read, understood and agree to the Clinifly Digital Platform Service Agreement. I acknowledge that services within the Free Package are free of charge, services outside the Free Package are paid, and the scope and price of these services will be determined separately."
      },
      
      // Settings (admin-settings.html)
      settings: {
        title: "⚙️ Clinic Settings",
        plan: "Plan",
        branding: "Branding",
        clinicName: "Clinic Name",
        clinicLogoUrl: "Clinic Logo URL",
        address: "Address",
        googleMapLink: "Google Map Link",
        primaryColor: "Primary Color",
        secondaryColor: "Secondary Color",
        welcomeMessage: "Welcome Message",
        referrals: "Referral Discounts",
        inviterDiscount: "Inviter Discount (%)",
        invitedDiscount: "Invited Discount (%)",
        save: "Save Settings",
        saveLoading: "Saving...",
        errors: {
          noToken: "Admin token not found. Please login as admin.",
          loadFailed: "Failed to load settings: {error}",
          saveFailed: "Failed to save settings: {error}"
        },
        success: "Settings saved successfully!"
      }
    }
  };

  // i18n helper
  const i18n = {
    currentLang: 'tr',
    
    init() {
      // Load saved language or default to Turkish
      const saved = localStorage.getItem('admin_lang') || 'tr';
      this.setLang(saved);
      
      // Create language switcher
      this.createLangSwitcher();
    },
    
    setLang(lang) {
      if (!translations[lang]) lang = 'tr';
      this.currentLang = lang;
      localStorage.setItem('admin_lang', lang);
      document.documentElement.lang = lang;
      this.updatePage();
    },
    
    getLang() {
      return this.currentLang;
    },
    
    t(key, params = {}) {
      const keys = key.split('.');
      let value = translations[this.currentLang];
      
      for (const k of keys) {
        if (!value || typeof value !== 'object') return key;
        value = value[k];
      }
      
      if (typeof value !== 'string') return key;
      
      // Replace params
      return value.replace(/\{(\w+)\}/g, (match, p1) => {
        return params[p1] !== undefined ? params[p1] : match;
      });
    },
    
    createLangSwitcher() {
      // Check if switcher already exists
      if (document.getElementById('lang-switcher')) return;
      
      const switcher = document.createElement('div');
      switcher.id = 'lang-switcher';
      switcher.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 1000;
        display: flex;
        gap: 8px;
        background: var(--card, #020617);
        border: 1px solid var(--b, #1f2937);
        border-radius: 8px;
        padding: 4px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      `;
      
      const trBtn = document.createElement('button');
      trBtn.textContent = 'TR';
      trBtn.style.cssText = `
        padding: 6px 12px;
        border: none;
        border-radius: 6px;
        background: ${this.currentLang === 'tr' ? 'var(--p, #2563eb)' : 'transparent'};
        color: ${this.currentLang === 'tr' ? '#fff' : 'var(--muted, #a7b2c8)'};
        cursor: pointer;
        font-weight: 600;
        font-size: 13px;
        transition: all 0.2s;
      `;
      trBtn.onclick = () => this.setLang('tr');
      
      const enBtn = document.createElement('button');
      enBtn.textContent = 'EN';
      enBtn.style.cssText = `
        padding: 6px 12px;
        border: none;
        border-radius: 6px;
        background: ${this.currentLang === 'en' ? 'var(--p, #2563eb)' : 'transparent'};
        color: ${this.currentLang === 'en' ? '#fff' : 'var(--muted, #a7b2c8)'};
        cursor: pointer;
        font-weight: 600;
        font-size: 13px;
        transition: all 0.2s;
      `;
      enBtn.onclick = () => this.setLang('en');
      
      switcher.appendChild(trBtn);
      switcher.appendChild(enBtn);
      document.body.appendChild(switcher);
      
      // Update button styles when language changes
      const updateButtons = () => {
        trBtn.style.background = this.currentLang === 'tr' ? 'var(--p, #2563eb)' : 'transparent';
        trBtn.style.color = this.currentLang === 'tr' ? '#fff' : 'var(--muted, #a7b2c8)';
        enBtn.style.background = this.currentLang === 'en' ? 'var(--p, #2563eb)' : 'transparent';
        enBtn.style.color = this.currentLang === 'en' ? '#fff' : 'var(--muted, #a7b2c8)';
      };
      
      // Store original setLang
      const originalSetLang = this.setLang.bind(this);
      this.setLang = (lang) => {
        originalSetLang(lang);
        updateButtons();
      };
    },
    
    updatePage() {
      // This will be called by each page to update its content
      if (typeof window.onLanguageChange === 'function') {
        window.onLanguageChange();
      }
      
      // Update all elements with data-i18n attribute
      document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const params = JSON.parse(el.getAttribute('data-i18n-params') || '{}');
        el.textContent = this.t(key, params);
      });
      
      // Update all inputs with data-i18n-placeholder
      document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        el.placeholder = this.t(key);
      });
      
      // Update all inputs with data-i18n-title
      document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        el.title = this.t(key);
      });
    }
  };

  // Make i18n globally available
  window.i18n = i18n;
  
  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => i18n.init());
  } else {
    i18n.init();
  }
})();
