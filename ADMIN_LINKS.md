# 🔗 Admin Panel Linkleri

Web sitenize koyabileceğiniz admin panel linkleri.

## 📍 Admin Login Linki

### Render (Şu anki - Production)
```
https://cliniflow-server.onrender.com/admin-login.html
```

### Custom Domain (Yapılandırıldıktan sonra)
```
https://api.clinifly.net/admin-login.html
```
**Not:** Custom domain yapılandırıldıktan sonra bu URL'i kullanın.

### Local Development
```
http://localhost:5050/admin-login.html
```

### Network (Aynı ağdaki cihazlar için)
```
http://[SERVER_IP]:5050/admin-login.html
```

## 🔐 Mevcut Admin Sayfaları

### 1. Admin Login
**URL:** `/admin-login.html`
**Açıklama:** Mevcut klinik hesapları için giriş sayfası
**Kullanım:** Clinic Code + Password ile giriş

**Tam Link:**
- Render (Production): `https://cliniflow-server.onrender.com/admin-login.html`
- Custom Domain: `https://api.clinifly.net/admin-login.html`
- Local: `http://localhost:5050/admin-login.html`

### 2. Yeni Klinik Kaydı
**URL:** `/admin-register.html`
**Açıklama:** Yeni klinik kaydı için kayıt sayfası
**Kullanım:** İlk kez kayıt olan klinikler için

**Tam Link:**
- Render (Production): `https://cliniflow-server.onrender.com/admin-register.html`
- Custom Domain: `https://api.clinifly.net/admin-register.html`
- Local: `http://localhost:5050/admin-register.html`

### 3. Admin Dashboard
**URL:** `/admin.html`
**Açıklama:** Ana admin panel dashboard'u
**Kullanım:** Login sonrası otomatik yönlendirilir (token gerektirir)

**Tam Link:**
- Render (Production): `https://cliniflow-server.onrender.com/admin.html`
- Custom Domain: `https://api.clinifly.net/admin.html`
- Local: `http://localhost:5050/admin.html`

## 🌐 Web Sitenize Ekleme Örnekleri

### HTML Link Örneği

```html
<!-- Basit link -->
<a href="https://admin.clinifly.com/admin-login.html">Admin Girişi</a>

<!-- Buton stili -->
<a href="https://admin.clinifly.com/admin-login.html" 
   class="btn btn-primary">Admin Paneli</a>

<!-- Yeni sekmede aç -->
<a href="https://admin.clinifly.com/admin-login.html" 
   target="_blank" 
   rel="noopener noreferrer">Admin Girişi</a>
```

### WordPress Örneği

```html
<!-- Menüye ekle -->
<a href="https://admin.clinifly.com/admin-login.html">Admin</a>

<!-- Widget'a ekle -->
<div class="admin-login-widget">
  <a href="https://admin.clinifly.com/admin-login.html" 
     class="button">Admin Paneli Girişi</a>
</div>
```

### React/Next.js Örneği

```jsx
import Link from 'next/link';

// Component içinde
<Link href="https://admin.clinifly.com/admin-login.html">
  <a>Admin Girişi</a>
</Link>

// veya
<a href="https://admin.clinifly.com/admin-login.html" 
   target="_blank">
  Admin Paneli
</a>
```

## 📱 Mobil Uyumlu Link

Mobil cihazlarda da çalışan responsive link:

```html
<a href="https://admin.clinifly.com/admin-login.html" 
   class="admin-link"
   style="display: inline-block; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">
  🔐 Admin Paneli Girişi
</a>
```

## 🎨 Önerilen Link Metinleri

- **Türkçe:**
  - "Admin Girişi"
  - "Admin Paneli"
  - "Klinik Yönetim Paneli"
  - "Yönetim Paneli Girişi"

- **İngilizce:**
  - "Admin Login"
  - "Admin Panel"
  - "Clinic Management"
  - "Management Portal"

## 🔄 İki Seçenekli Link (Login + Register)

Eğer hem login hem register linki koymak isterseniz:

```html
<div class="admin-links">
  <a href="https://admin.clinifly.com/admin-login.html" 
     class="btn btn-primary">Giriş Yap</a>
  <a href="https://admin.clinifly.com/admin-register.html" 
     class="btn btn-secondary">Yeni Klinik Kaydı</a>
</div>
```

## ⚠️ Önemli Notlar

1. **HTTPS Kullanın:** Production'da mutlaka HTTPS kullanın (SSL sertifikası gerekli)
2. **Domain Değiştirin:** `admin.clinifly.com` yerine kendi domain'inizi kullanın
3. **Güvenlik:** Admin linklerini public sayfalarda dikkatli kullanın
4. **Token:** Login sonrası token localStorage'da saklanır

## 🔒 Güvenlik Önerileri

- Admin linklerini footer'da veya özel bir bölümde gösterin
- Public sayfalarda çok belirgin yapmayın
- Rate limiting kullanın (backend'de zaten var)
- Strong password policy uygulayın

## 📋 Özet

**Web sitenize koymanız gereken link (Render):**

### Şu anki (Render Default URL):
```
https://cliniflow-server.onrender.com/admin-register.html
```

### Custom Domain (Yapılandırıldıktan sonra):
```
https://api.clinifly.net/admin-register.html
```

**Tüm Admin Sayfaları (Render):**
- Admin Register: `https://cliniflow-server.onrender.com/admin-register.html`
- Admin Login: `https://cliniflow-server.onrender.com/admin-login.html`
- Admin Dashboard: `https://cliniflow-server.onrender.com/admin.html`

**Yerel test için:**
```
http://localhost:5050/admin-login.html
```

---

**Son Güncelleme:** 2025-01-19
