// Admin Panel i18n System
(function() {
  'use strict';

  // Reentrancy guard to prevent update recursion (stack overflow)
  let isUpdatingI18n = false;

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
            patients: "hasta",
            events: "etkinlik"
          }
        }
      },
      
      // Pricing (pricing.html)
      pricing: {
        title: "Clinifly Fiyatlandırma",
        subtitle: "Aktif hasta sayınıza göre esnek planlar",
        info: "Planlar <span class=\"highlight\">aktif hasta sayısına</span> göre belirlenir. Mevcut hastalarınızla çalışmaya devam edebilirsiniz.",
        free: {
          name: "Free",
          description: "Clinifly'i gerçek hastalarla denemeniz için.",
          cta: "Başla"
        },
        basic: {
          name: "Basic",
          badge: "Popüler",
          description: "Günlük hasta iletişimi olan klinikler için ideal.",
          cta: "Upgrade Et"
        },
        pro: {
          name: "Pro",
          description: "Büyüyen klinikler için limitsiz kullanım.",
          cta: "İletişime Geç"
        },
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
          basic: "Basic",
          pro: "Pro",
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
      
      // Treatment (admin-treatment.html)
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
        confirmDelete: "Bu tedaviyi silmek istediğinizden emin misiniz?"
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
          emailExists: "Bu e-posta adresi zaten kullanılıyor.",
          clinicCodeExists: "Bu klinik kodu zaten kullanılıyor.",
          passwordRequired: "Lütfen şifrenizi giriniz.",
          passwordMinLength: "Şifre en az 6 karakter olmalıdır.",
          passwordMismatch: "Şifreler eşleşmiyor.",
          registerFailed: "Kayıt başarısız. Lütfen tekrar deneyin.",
          genericError: "Kayıt hatası: {error}",
          termsNotAccepted: "Lütfen hizmet sözleşmesini kabul edin."
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
        address: "Clinic Address",
        addressHelp: "Pro plan için hasta ekranında görüntülenir",
        googleMapLink: "Google Maps Link",
        googleMapLinkHelp: "Pro plan için hasta ekranında görüntülenir",
        primaryColor: "Primary Color (Hex)",
        secondaryColor: "Secondary Color (Hex)",
        welcomeMessage: "Welcome Message",
        referralDiscounts: "🎁 Referral İndirimleri",
        referralDiscountsHelp: "Referral sisteminde kullanılacak indirim seviyeleri",
        referralDiscount: "Referral İndirim Oranı",
        referralDiscountHelp: "Başarılı referral sonrası uygulanacak indirim yüzdesi",
        referralLevel1: "Seviye 1 (%)",
        referralLevel1Help: "1. başarılı referral sonrası toplam indirim",
        referralSettings: "🎯 Referral Ayarları",
        referralSettingsHelp: "Davet sistemi için kazanç oranlarını belirleyin. PRO planında esnek ayarlar mevcuttur.",
        referralPerInvite: "Davet başına kazanç (%)",
        referralPerInvitePlaceholder: "10",
        referralPerInviteHelp: "Her başarılı davet için verilecek indirim",
        referralMaxTotal: "Maksimum toplam indirim (%)",
        referralMaxTotalPlaceholder: "10",
        referralMaxTotalHelp: "Davet edenin kazanabileceği maksimum indirim",
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
          PROSTHETIC: "Prosthetic (Protez)",
          RESTORATIVE: "Restorative (Restoratif)",
          ENDODONTIC: "Endodontic (Endodontik)",
          SURGICAL: "Surgical (Cerrahi)",
          IMPLANT: "Implant"
        },
        tableHeaders: {
          treatment: "Treatment",
          price: "Price",
          active: "Active"
        }
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
            patients: "patients",
            events: "events"
          }
        }
      },
      
      // Pricing (pricing.html)
      pricing: {
        title: "Clinifly Pricing",
        subtitle: "Flexible plans based on your active patient count",
        info: "Plans are based on <span class=\"highlight\">active patient count</span>. You can continue working with your existing patients.",
        free: {
          name: "Free",
          description: "Try Clinifly with real patients.",
          cta: "Get Started"
        },
        basic: {
          name: "Basic",
          badge: "Popular",
          description: "Ideal for clinics with daily patient communication.",
          cta: "Upgrade"
        },
        pro: {
          name: "Pro",
          description: "Unlimited usage for growing clinics.",
          cta: "Contact Us"
        },
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
          basic: "Basic",
          pro: "Pro",
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
        patientHelp: "Automatically selected when clicking Treatment from patient list. Automatically loads when changing patient here.",
        noPatientSelected: "No patient selected. Please select a patient.",
        loadingTreatments: "Loading treatments...",
        noTreatments: "No treatment plan found for this patient.",
        addTreatment: "Add Treatment",
        saveTreatment: "Save Treatment",
        treatmentSaved: "✅ Treatment saved successfully!",
        treatmentDeleted: "✅ Treatment deleted successfully!",
        confirmDelete: "Are you sure you want to delete this treatment?"
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
          emailExists: "This email address is already in use.",
          clinicCodeExists: "This clinic code is already in use.",
          passwordRequired: "Please enter password.",
          passwordMinLength: "Password must be at least 6 characters.",
          passwordMismatch: "Passwords do not match.",
          registerFailed: "Registration failed. Please try again.",
          genericError: "Registration error: {error}",
          termsNotAccepted: "Please accept the service agreement."
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
        referralSettings: "🎯 Referral Settings",
        referralSettingsHelp: "Set referral earnings rates. Flexible settings available in PRO plan.",
        referralPerInvite: "Per Invite Earnings (%)",
        referralPerInvitePlaceholder: "10",
        referralPerInviteHelp: "Discount given for each successful referral",
        referralMaxTotal: "Maximum Total Discount (%)",
        referralMaxTotalPlaceholder: "10",
        referralMaxTotalHelp: "Maximum discount the referrer can earn",
        clinicName: "Clinic Name",
        clinicLogoUrl: "Clinic Logo URL",
        clinicLogoUrlHelp: "Logo will be displayed for Pro plan",
        address: "Clinic Address",
        addressHelp: "Will be displayed on patient screen for Pro plan",
        googleMapLink: "Google Maps Link",
        googleMapLinkHelp: "Will be displayed on patient screen for Pro plan",
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
          PROSTHETIC: "Prosthetic (Protez)",
          RESTORATIVE: "Restorative (Restoratif)",
          ENDODONTIC: "Endodontic (Endodontik)",
          SURGICAL: "Surgical (Cerrahi)",
          IMPLANT: "Implant"
        },
        tableHeaders: {
          treatment: "Treatment",
          price: "Price",
          active: "Active"
        }
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
      }
    }
  };

  // i18n helper
  const i18n = {
    currentLang: 'tr',
    
    init() {
      // Load saved language or default to Turkish
      const saved = localStorage.getItem('admin_lang') || 'tr';
      this.setLanguage(saved);
      this.createLangSwitcher();
      // Render static translations once on init
      this.updatePage();
      // Notify page-level hook once, if present
      if (typeof window.onI18nUpdated === 'function') {
        try {
          window.onI18nUpdated(this.currentLang);
        } catch (e) {
          console.error("[i18n] onI18nUpdated hook failed during init:", e);
        }
      }
    },
    
    // State-only: do NOT call updatePage() here.
    setLanguage(lang) {
      if (!translations[lang]) lang = 'tr';
      this.currentLang = lang;
      localStorage.setItem('admin_lang', lang);
      document.documentElement.lang = lang;
    },

    // Backward-compatible alias
    setLang(lang) {
      return this.setLanguage(lang);
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
        background: var(--card, #1f2937);
        border: 1px solid var(--b, #374151);
        border-radius: 12px;
        padding: 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        backdrop-filter: blur(10px);
      `;
      
      const trBtn = document.createElement('button');
      trBtn.textContent = '🇹🇷 TR';
      trBtn.style.cssText = `
        padding: 8px 14px;
        border: none;
        border-radius: 8px;
        background: ${this.currentLang === 'tr' ? 'var(--p, #2563eb)' : 'transparent'};
        color: ${this.currentLang === 'tr' ? '#fff' : 'var(--muted, #a7b2c8)'};
        cursor: pointer;
        font-weight: 600;
        font-size: 13px;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        gap: 4px;
      `;
      trBtn.onclick = () => {
        if (typeof window.onLanguageChange === 'function') window.onLanguageChange('tr');
        else { this.setLanguage('tr'); this.updatePage(); }
      };
      
      const enBtn = document.createElement('button');
      enBtn.textContent = '🇬🇧 EN';
      enBtn.style.cssText = `
        padding: 8px 14px;
        border: none;
        border-radius: 8px;
        background: ${this.currentLang === 'en' ? 'var(--p, #2563eb)' : 'transparent'};
        color: ${this.currentLang === 'en' ? '#fff' : 'var(--muted, #a7b2c8)'};
        cursor: pointer;
        font-weight: 600;
        font-size: 13px;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        gap: 4px;
      `;
      enBtn.onclick = () => {
        if (typeof window.onLanguageChange === 'function') window.onLanguageChange('en');
        else { this.setLanguage('en'); this.updatePage(); }
      };
      
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
      
      // Keep button styles in sync whenever the page is re-rendered
      const originalUpdatePage = this.updatePage.bind(this);
      this.updatePage = () => {
        originalUpdatePage();
        updateButtons();
      };
      updateButtons();
    },
    
    updatePage() {
      if (isUpdatingI18n) return;
      isUpdatingI18n = true;
      try {
        // Update all elements with data-i18n attribute
        document.querySelectorAll('[data-i18n]').forEach(el => {
          const key = el.getAttribute('data-i18n');
          let params = {};
          try {
            params = JSON.parse(el.getAttribute('data-i18n-params') || '{}');
          } catch (e) {
            console.error("[i18n] Failed to parse data-i18n-params:", e, { key });
            params = {};
          }
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
      } finally {
        isUpdatingI18n = false;
      }
    }
  };

  // Make i18n globally available
  window.i18n = i18n;

  // Global language change entrypoint (single direction; no recursion)
  // - Only changes language state and triggers a DOM refresh
  // - Pages can optionally implement window.onI18nUpdated(lang) for dynamic re-renders
  window.onLanguageChange = function(lang) {
    try {
      window.i18n.setLanguage(lang);
      window.i18n.updatePage();
      if (typeof window.onI18nUpdated === 'function') {
        window.onI18nUpdated(lang);
      }
    } catch (e) {
      console.error("[i18n] window.onLanguageChange failed:", e);
    }
  };
  
  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => i18n.init());
  } else {
    i18n.init();
  }
})();
