# Cliniflow Backend & Server

**Tek ve gerçek backend + server.** Bu klasör tüm API, Auth, DB, dosya upload ve Admin & SuperAdmin endpoint'lerini içerir.

## 📁 Proje Yapısı

```
cliniflow-admin/
├── index.cjs          # Ana server dosyası
├── package.json       # Dependencies ve scripts
├── package-lock.json  # Dependency versiyonları (Render için)
├── render.yaml        # Render deployment config
├── ecosystem.config.js # PM2 config (opsiyonel)
├── lib/               # Yardımcı kütüphaneler
├── shared/            # Paylaşılan modüller
├── scripts/           # Utility scriptler
├── public/            # Static HTML dosyaları (Admin & SuperAdmin)
└── data/              # Tüm veri dosyaları (JSON)
```

**Not:** `node_modules/` klasörü repoda yok, Render build sırasında `npm install` ile kurulur.

## 🚀 Render Deployment

### Render Ayarları

- **Root Directory:** `cliniflow-admin`
- **Build Command:** `npm install`
- **Start Command:** `npm start`
- **Environment Variables:**
  - `PORT` (Render otomatik set eder)
  - `JWT_SECRET`
  - `SUPER_ADMIN_EMAIL`
  - `SUPER_ADMIN_PASSWORD`
  - `SUPER_ADMIN_JWT_SECRET`
  - `GOOGLE_PLACES_API_KEY` (opsiyonel)

### Local Development

```bash
cd cliniflow-admin
npm install
npm start
# Server http://localhost:3000 adresinde çalışır
```

## 📦 Scripts

- `npm start` - Production server başlatır
- `npm run dev` - Development server başlatır

## 🔧 Teknik Detaylar

- **Port:** `process.env.PORT || 3000` (Render uyumlu)
- **Data Directory:** `cliniflow-admin/data` (tek kaynak)
- **API Base:** Tüm endpoint'ler `/api/` altında

## ⚠️ Önemli Notlar

- **Tek Backend:** Bu klasör dışında backend kodu yok
- **Tek Data:** Tüm veriler `data/` klasöründe
- **Arşivlenmiş Klasörler:** 
  - Root: `server_OLD/`, `data_OLD/`
  - Bu klasör: `admin_OLD/`, `superadmin_OLD/`, `backend_OLD/`, `legacy_admin_html/`
  - Bunlar kullanılmıyor, sadece arşiv amaçlı

## 📚 API Endpoints

- `/api/patient/*` - Patient endpoints
- `/api/admin/*` - Admin endpoints
- `/api/super-admin/*` - SuperAdmin endpoints
- `/health` - Health check

## 🔗 Admin & SuperAdmin Links

Render'da deploy edildikten sonra:

### Klinik Admin (Clinic Login/Sign In)

- **Login:** `https://[your-render-url].onrender.com/admin-login.html`
- **Kayıt (Sign Up):** `https://[your-render-url].onrender.com/admin-register.html`
- **Dashboard:** `https://[your-render-url].onrender.com/admin.html`

### Super Admin

- **Login:** `https://[your-render-url].onrender.com/super-admin-login.html`
- **Dashboard:** `https://[your-render-url].onrender.com/super-admin.html`

### Diğer Admin Sayfaları

- **Patients:** `/admin-patients.html`
- **Travel:** `/admin-travel.html`
- **Treatment:** `/admin-treatment.html`
- **Chat:** `/admin-chat.html`
- **Referrals:** `/admin-referrals.html`
- **Health:** `/admin-health.html`
- **Settings:** `/admin-settings.html`

## 🔐 Authentication

- **Patient:** JWT token (30 gün geçerli)
- **Admin:** JWT token (clinic-based)
- **SuperAdmin:** JWT token (super admin credentials)
