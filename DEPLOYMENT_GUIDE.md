# Cliniflow Deployment Guide

Bu dokümanda 3 ayrı uygulamanın Render üzerinde nasıl deploy edileceği açıklanmaktadır.

## Proje Yapısı

```
cliniflow-admin/
├── backend/          # API Server
├── admin/            # Clinic Admin Panel (Next.js)
└── superadmin/       # SuperAdmin Dashboard (Next.js)
```

## Render Deployment

### 1. Backend Deployment

**Service Type:** Web Service  
**Root Directory:** `backend`  
**Build Command:** `npm install`  
**Start Command:** `npm start`  
**Environment:** Node

#### Environment Variables (Backend)
- `NODE_ENV=production`
- `PORT=5050` (Render otomatik atar)
- `JWT_SECRET` (generateValue: true)
- `SUPER_ADMIN_EMAIL`
- `SUPER_ADMIN_PASSWORD`
- `SUPER_ADMIN_JWT_SECRET` (generateValue: true)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- `GOOGLE_PLACES_API_KEY`
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`

**Not:** Backend'in `public/` klasöründeki legacy HTML dosyaları geçici olarak mevcut. Yeni frontend'ler hazır olunca kaldırılabilir.

### 2. Admin Panel Deployment

**Service Type:** Web Service  
**Root Directory:** `admin`  
**Build Command:** `npm install && npm run build`  
**Start Command:** `npm start`  
**Environment:** Node

#### Environment Variables (Admin)
- `NODE_ENV=production`
- `NEXT_PUBLIC_API_URL=https://your-backend-url.onrender.com`

**Not:** `NEXT_PUBLIC_API_URL` backend'in Render URL'si olmalı.

### 3. SuperAdmin Panel Deployment

**Service Type:** Web Service  
**Root Directory:** `superadmin`  
**Build Command:** `npm install && npm run build`  
**Start Command:** `npm start`  
**Environment:** Node

#### Environment Variables (SuperAdmin)
- `NODE_ENV=production`
- `NEXT_PUBLIC_API_URL=https://your-backend-url.onrender.com`

**Not:** `NEXT_PUBLIC_API_URL` backend'in Render URL'si olmalı.

## Deployment Sırası

1. **Backend'i deploy et** (API hazır olmalı)
2. **Backend URL'ini al** (örn: `https://cliniflow-backend.onrender.com`)
3. **Admin panel'i deploy et** (`NEXT_PUBLIC_API_URL` backend URL'sini kullan)
4. **SuperAdmin panel'i deploy et** (`NEXT_PUBLIC_API_URL` backend URL'sini kullan)

## CORS Configuration

Backend CORS ayarları tüm origin'lere açık olmalı (production'da sadece frontend URL'lerini whitelist yapabilirsiniz):

```javascript
app.use(cors()); // Development
// Production: app.use(cors({ origin: ['https://admin-url.com', 'https://superadmin-url.com'] }));
```

## Local Development

### Backend
```bash
cd backend
npm install
npm run dev
# Runs on http://localhost:5050
```

### Admin Panel
```bash
cd admin
npm install
npm run dev
# Runs on http://localhost:3000
# NEXT_PUBLIC_API_URL=http://localhost:5050
```

### SuperAdmin Panel
```bash
cd superadmin
npm install
PORT=3001 npm run dev
# Runs on http://localhost:3001
# NEXT_PUBLIC_API_URL=http://localhost:5050
```

## Migration Notes

- Legacy HTML dosyalar (`backend/public/*.html`) geçici olarak mevcut
- Yeni Next.js frontend'ler tamamlanınca bu dosyalar kaldırılabilir
- Backend API endpoint'leri değişmedi, sadece yapı yeniden organize edildi

## Troubleshooting

### Backend çalışmıyor
- PORT environment variable'ı kontrol edin
- Render otomatik PORT atar, `process.env.PORT` kullanın

### Frontend backend'e bağlanamıyor
- `NEXT_PUBLIC_API_URL` doğru mu kontrol edin
- CORS ayarlarını kontrol edin
- Backend URL'sinin erişilebilir olduğunu kontrol edin

### Build hatası
- Node.js versiyonunu kontrol edin (Render otomatik seçer, gerekirse `package.json`'da belirtin)
- Dependencies'lerin doğru yüklendiğinden emin olun

## Next Steps

1. ✅ Backend deployment hazır
2. ⏳ Admin panel UI development
3. ⏳ SuperAdmin panel UI development
4. ⏳ Legacy HTML dosyalarının kaldırılması
