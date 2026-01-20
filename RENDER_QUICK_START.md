# 🚀 Render Deployment - Quick Start

Render'a hızlı deployment için adım adım rehber.

## ⚡ Hızlı Adımlar

### 1. GitHub Repository Hazırlayın

```bash
# Git repo oluştur (eğer yoksa)
cd ~/Documents/cliniflow/cliniflow-admin
git init
git add .
git commit -m "Initial commit - Render deployment ready"

# GitHub'a push et
git remote add origin https://github.com/yourusername/cliniflow-admin.git
git push -u origin main
```

### 2. Render'da Service Oluşturun

1. **Render Dashboard'a gidin:** https://dashboard.render.com
2. **New +** butonuna tıklayın
3. **Web Service** seçin
4. **Connect GitHub** ile repo'nuzu bağlayın
5. **Repository** seçin: `cliniflow-admin`

### 3. Service Ayarları

**Name:** `clinifly-admin-api`

**Environment:** `Node`

**Region:** `Oregon` (veya size yakın)

**Branch:** `main`

**Root Directory:** (boş bırakın)

**Build Command:**
```bash
npm install
```

**Start Command:**
```bash
npm start
```

### 4. Environment Variables Ekle

**Settings > Environment** sekmesinde şu değişkenleri ekleyin:

#### Zorunlu Değişkenler

```bash
NODE_ENV=production
PORT=5050
JWT_SECRET=<güçlü-random-string>
```

JWT_SECRET oluştur:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### SMTP (Email için)

```bash
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=<your-smtp-username>
SMTP_PASS=<your-smtp-password>
SMTP_FROM=noreply@clinifly.com
```

#### Supabase (Database için)

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
SUPABASE_DB_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
```

**Supabase bilgilerini almak için:**
1. Supabase Dashboard > Project Settings > API
2. Project URL → `SUPABASE_URL`
3. anon public key → `SUPABASE_ANON_KEY`
4. service_role key → `SUPABASE_SERVICE_ROLE_KEY` (GİZLİ!)
5. Database > Connection String → `SUPABASE_DB_URL`

#### Opsiyonel

```bash
GOOGLE_PLACES_API_KEY=<optional>
VAPID_PUBLIC_KEY=<optional>
VAPID_PRIVATE_KEY=<optional>
VAPID_SUBJECT=mailto:admin@clinifly.com
```

### 5. Deploy

1. **Create Web Service** butonuna tıklayın
2. Render otomatik olarak build ve deploy başlatır
3. **Events** sekmesinden logları takip edin
4. Build başarılı olunca service `Live` olur

### 6. Custom Domain Ekle

1. **Settings > Custom Domains**
2. **Add Custom Domain**
3. Domain: `api.clinifly.net`
4. Render size DNS kayıtlarını verecek

### 7. DNS Yapılandırması

Domain sağlayıcınızda (Namecheap, GoDaddy, vb.):

**CNAME Kaydı:**
```
Type: CNAME
Name: api
Value: [Render-verilen-hostname].onrender.com
TTL: 3600
```

**veya A Kaydı:**
```
Type: A
Name: api
Value: [Render-IP-address]
TTL: 3600
```

### 8. SSL Sertifikası

Render otomatik olarak SSL sağlar. Domain eklendikten sonra birkaç dakika içinde aktif olur.

## ✅ Deployment Sonrası Kontrol

### Service Durumu
- Render Dashboard > Service > **Live** olmalı
- **Events** sekmesinde "Deploy succeeded" görünmeli

### Logları Kontrol
- **Logs** sekmesinden real-time logları görüntüleyin
- Hata varsa burada görünür

### Test
```bash
# Health check
curl https://api.clinifly.net/health

# Admin panel
https://api.clinifly.net/admin-login.html
```

## 🔧 Supabase Setup (İlk Kez)

### 1. Supabase Projesi Oluştur

1. https://supabase.com > New Project
2. Organization seçin
3. Project name: `clinifly-admin`
4. Database password oluşturun (kaydedin!)
5. Region seçin
6. **Create project**

### 2. Database Schema Oluştur

Supabase Dashboard > SQL Editor'de `SUPABASE_MIGRATION.md` dosyasındaki SQL'i çalıştırın.

### 3. Storage Buckets

Supabase Dashboard > Storage:

1. **New bucket:** `chat-uploads`
   - Public: ✅ Yes
   
2. **New bucket:** `patient-documents`
   - Public: ❌ No (private)

## 📊 Monitoring

### Render Dashboard
- **Metrics:** CPU, Memory, Request count
- **Logs:** Real-time application logs
- **Events:** Deployment history

### Supabase Dashboard
- **Database:** Table sizes, query performance
- **Storage:** File usage
- **API:** Request logs

## 🔄 Güncelleme

Kod değişikliği sonrası:

```bash
git add .
git commit -m "Update: description"
git push origin main
```

Render otomatik olarak yeni deployment başlatır.

## 🆘 Sorun Giderme

### Build Fails
- **Logları kontrol:** Events sekmesi
- **Node version:** package.json'da belirtilmeli
- **Dependencies:** npm install başarılı mı?

### Service Won't Start
- **Environment variables:** Eksik var mı?
- **Port:** Render otomatik PORT env var kullanır
- **Logs:** Hata mesajlarını kontrol et

### Database Connection
- **Supabase credentials:** Doğru mu?
- **Network:** Supabase'e erişim var mı?
- **Database URL format:** Doğru mu?

## 📝 Özet

1. ✅ GitHub'a push
2. ✅ Render'da service oluştur
3. ✅ Environment variables ekle
4. ✅ Deploy
5. ✅ Custom domain ekle
6. ✅ DNS yapılandır
7. ✅ Supabase setup yap
8. ✅ Test et

**Detaylı bilgi:** `RENDER_DEPLOYMENT.md`

---

**URL:** `https://api.clinifly.net`
