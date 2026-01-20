# 🔗 Render Deployment - Admin Panel Linkleri

Render'a deploy edildikten sonra admin panel linkleri.

## 🌐 Render Service URL'leri

### Render Default URL (Service oluşturulduktan sonra)
```
https://cliniflow-server.onrender.com
```
**Not:** Service adınıza göre değişir. Render Dashboard'da görebilirsiniz.

### Custom Domain (api.clinifly.net yapılandırıldıktan sonra)
```
https://api.clinifly.net
```

## 📍 Admin Panel Sayfaları

### 1. Admin Kayıt Sayfası (Yeni Klinik Kaydı)

**Local:**
```
http://127.0.0.1:5050/admin-register.html
```

**Render (Default URL):**
```
https://cliniflow-server.onrender.com/admin-register.html
```

**Render (Custom Domain):**
```
https://api.clinifly.net/admin-register.html
```

### 2. Admin Login Sayfası (Mevcut Klinik Girişi)

**Local:**
```
http://127.0.0.1:5050/admin-login.html
```

**Render (Default URL):**
```
https://cliniflow-server.onrender.com/admin-login.html
```

**Render (Custom Domain):**
```
https://api.clinifly.net/admin-login.html
```

### 3. Admin Dashboard

**Local:**
```
http://127.0.0.1:5050/admin.html
```

**Render (Default URL):**
```
https://cliniflow-server.onrender.com/admin.html
```

**Render (Custom Domain):**
```
https://api.clinifly.net/admin.html
```

## 🎯 Web Sitenize Koyacağınız Link

### Önerilen Link (Custom Domain ile)

**Admin Girişi için:**
```
https://api.clinifly.net/admin-login.html
```

**Yeni Klinik Kaydı için:**
```
https://api.clinifly.net/admin-register.html
```

### Render Default URL ile (Geçici)

Eğer henüz custom domain yapılandırmadıysanız:

**Admin Girişi:**
```
https://cliniflow-server.onrender.com/admin-login.html
```

**Yeni Klinik Kaydı:**
```
https://cliniflow-server.onrender.com/admin-register.html
```

**Not:** Service adınıza göre URL değişir. Render Dashboard'da tam URL'i görebilirsiniz.

## 📋 Tüm Admin Sayfaları

| Sayfa | Local URL | Render URL (Custom Domain) |
|-------|-----------|---------------------------|
| Admin Register | `http://127.0.0.1:5050/admin-register.html` | `https://api.clinifly.net/admin-register.html` |
| Admin Login | `http://127.0.0.1:5050/admin-login.html` | `https://api.clinifly.net/admin-login.html` |
| Admin Dashboard | `http://127.0.0.1:5050/admin.html` | `https://api.clinifly.net/admin.html` |
| Admin Patients | `http://127.0.0.1:5050/admin-patients.html` | `https://api.clinifly.net/admin-patients.html` |
| Admin Travel | `http://127.0.0.1:5050/admin-travel.html` | `https://api.clinifly.net/admin-travel.html` |
| Admin Treatment | `http://127.0.0.1:5050/admin-treatment.html` | `https://api.clinifly.net/admin-treatment.html` |
| Admin Chat | `http://127.0.0.1:5050/admin-chat.html` | `https://api.clinifly.net/admin-chat.html` |
| Admin Settings | `http://127.0.0.1:5050/admin-settings.html` | `https://api.clinifly.net/admin-settings.html` |

## 🔍 Render URL'ini Bulma

### Render Dashboard'dan

1. Render Dashboard'a gidin
2. Service'inize tıklayın
3. **Settings** sekmesinde **URL** bölümünde görebilirsiniz

### Örnek Format

```
https://[service-name].onrender.com
```

Service adı: `clinifly-admin-api` ise:
```
https://clinifly-admin-api.onrender.com
```

## 🌐 Custom Domain Yapılandırması

### 1. Render'da Domain Ekle

1. Service > **Settings** > **Custom Domains**
2. **Add Custom Domain**
3. Domain: `api.clinifly.net`
4. Render size DNS kayıtlarını verecek

### 2. DNS Yapılandırması

Domain sağlayıcınızda:

**CNAME Kaydı:**
```
Type: CNAME
Name: api
Value: [service-name].onrender.com
TTL: 3600
```

### 3. SSL Sertifikası

Render otomatik olarak SSL sağlar. Domain eklendikten sonra birkaç dakika içinde aktif olur.

## 📝 HTML Link Örnekleri

### Web Sitenize Ekleyeceğiniz Link

```html
<!-- Admin Girişi -->
<a href="https://api.clinifly.net/admin-login.html">Admin Girişi</a>

<!-- Yeni Klinik Kaydı -->
<a href="https://api.clinifly.net/admin-register.html">Yeni Klinik Kaydı</a>

<!-- Buton Stili -->
<a href="https://api.clinifly.net/admin-register.html" 
   class="btn btn-primary">
  🔐 Admin Paneli
</a>
```

## ⚠️ Önemli Notlar

1. **HTTPS Zorunlu:** Render'da tüm linkler HTTPS ile çalışır
2. **Custom Domain:** `api.clinifly.net` yapılandırıldıktan sonra bu URL'i kullanın
3. **Service Adı:** Render'da service adınıza göre default URL değişir
4. **SSL:** Render otomatik SSL sağlar (Let's Encrypt)

## ✅ Kontrol

Deployment sonrası linkleri test edin:

```bash
# Health check
curl https://api.clinifly.net/health

# Admin register sayfası
curl -I https://api.clinifly.net/admin-register.html
# 200 OK dönmeli
```

---

**Özet:** Web sitenize koyacağınız link:

**Render URL (Şu anki):**
```
https://cliniflow-server.onrender.com/admin-register.html
```

**Custom Domain (Yapılandırıldıktan sonra):**
```
https://api.clinifly.net/admin-register.html
```
