# 🚀 Render Deployment Guide - Clinifly Admin API

Bu rehber, Clinifly admin panelini Render'a deploy etmek ve Supabase entegrasyonu için adımları içerir.

## 📋 Ön Hazırlık

### 1. Render Hesabı Oluşturun
1. [Render.com](https://render.com) adresine gidin
2. GitHub hesabınızla giriş yapın
3. Ücretsiz plan ile başlayabilirsiniz

### 2. Supabase Projesi Oluşturun
1. [Supabase.com](https://supabase.com) adresine gidin
2. Yeni proje oluşturun
3. Project Settings > API'den şu bilgileri alın:
   - Project URL
   - anon/public key
   - service_role key (gizli tutun!)
   - Database URL (Connection String)

## 🔧 Render'da Service Oluşturma

### Yöntem 1: render.yaml ile (Önerilen)

1. **GitHub Repository'yi Bağlayın**
   - Render Dashboard > New > Blueprint
   - GitHub repo'nuzu seçin
   - `render.yaml` dosyasını otomatik algılar

2. **Environment Variables Ayarlayın**
   - Render Dashboard > Environment sekmesi
   - Aşağıdaki değişkenleri ekleyin (detaylar aşağıda)

### Yöntem 2: Manuel Oluşturma

1. **New Web Service**
   - Render Dashboard > New > Web Service
   - GitHub repo'nuzu bağlayın

2. **Build & Deploy Ayarları**
   ```
   Build Command: npm install
   Start Command: npm start
   ```

3. **Environment Variables** (aşağıdaki listeye bakın)

## 🔐 Environment Variables

Render Dashboard > Environment sekmesinde şu değişkenleri ekleyin:

### Temel Ayarlar
```bash
NODE_ENV=production
PORT=5050
```

### JWT Secret
```bash
JWT_SECRET=<güçlü-random-string>
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### SMTP Ayarları (Email için)
```bash
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=<your-smtp-username>
SMTP_PASS=<your-smtp-password>
SMTP_FROM=noreply@clinifly.com
```

### Google Places API (Opsiyonel)
```bash
GOOGLE_PLACES_API_KEY=<your-google-places-key>
```

### Push Notifications (VAPID Keys)
```bash
VAPID_PUBLIC_KEY=<your-vapid-public-key>
VAPID_PRIVATE_KEY=<your-vapid-private-key>
VAPID_SUBJECT=mailto:admin@clinifly.com
```

### Supabase Configuration
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
SUPABASE_DB_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
```

## 🌐 Custom Domain Yapılandırması

### 1. Render'da Domain Ekleme

1. **Service Settings > Custom Domains**
2. **Add Custom Domain** butonuna tıklayın
3. Domain adını girin: `api.clinifly.net`
4. Render size DNS kayıtlarını verecek

### 2. DNS Yapılandırması

Domain sağlayıcınızda (Namecheap, GoDaddy, vb.) şu kayıtları ekleyin:

**CNAME Kaydı:**
```
Type: CNAME
Name: api
Value: [Render-verilen-hostname].onrender.com
TTL: 3600
```

**veya A Kaydı (Render'ın verdiği IP için):**
```
Type: A
Name: api
Value: [Render-IP-address]
TTL: 3600
```

### 3. SSL Sertifikası

Render otomatik olarak SSL sertifikası sağlar (Let's Encrypt). Domain eklendikten sonra otomatik olarak aktif olur.

## 📦 Supabase Entegrasyonu

### Mevcut Durum

Şu anda uygulama JSON dosyaları kullanıyor (`data/` klasörü). Supabase'e geçiş için:

### 1. Supabase Client Kurulumu

```bash
npm install @supabase/supabase-js
```

### 2. Supabase Client Oluşturma

`lib/supabase.js` dosyası oluşturun (örnek kod aşağıda)

### 3. Database Schema Oluşturma

Supabase Dashboard > SQL Editor'de şu tabloları oluşturun (örnek schema aşağıda)

### 4. Storage Buckets

Supabase Dashboard > Storage'da şu bucket'ları oluşturun:
- `chat-uploads` (public)
- `patient-documents` (private)

## 🔄 Migration Stratejisi

### Aşama 1: Hybrid Approach (Önerilen)
- Yeni veriler Supabase'e yazılır
- Eski JSON veriler okunmaya devam eder
- Zamanla tüm veriler Supabase'e migrate edilir

### Aşama 2: Full Migration
- Tüm JSON veriler Supabase'e import edilir
- JSON dosya sistemi kaldırılır
- Sadece Supabase kullanılır

## 📝 Supabase Schema Örneği

```sql
-- Clinics table
CREATE TABLE clinics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_code TEXT UNIQUE NOT NULL,
  clinic_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  status TEXT DEFAULT 'ACTIVE',
  plan TEXT DEFAULT 'FREE',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Patients table
CREATE TABLE patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id TEXT UNIQUE NOT NULL,
  clinic_id UUID REFERENCES clinics(id),
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  status TEXT DEFAULT 'PENDING',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Travel data table
CREATE TABLE travel_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id TEXT NOT NULL,
  hotel JSONB,
  flights JSONB,
  airport_pickup JSONB,
  notes TEXT,
  edit_policy JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (patient_id)
);

-- Messages table
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id TEXT NOT NULL,
  from_type TEXT NOT NULL, -- 'CLINIC' or 'PATIENT'
  message TEXT NOT NULL,
  attachments JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_patients_clinic_id ON patients(clinic_id);
CREATE INDEX idx_patients_patient_id ON patients(patient_id);
CREATE INDEX idx_messages_patient_id ON messages(patient_id);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
```

## 🛠️ Gerekli Kod Değişiklikleri

### 1. Supabase Client

`lib/supabase.js` oluşturun:
```javascript
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('[SUPABASE] Supabase credentials not configured');
}

const supabase = supabaseUrl && supabaseKey 
  ? createClient(supabaseUrl, supabaseKey)
  : null;

module.exports = { supabase };
```

### 2. Data Layer Abstraction

Mevcut `readJson`/`writeJson` fonksiyonlarını Supabase ile değiştirin veya hybrid approach kullanın.

## 📊 Render Monitoring

### Logs
- Render Dashboard > Logs sekmesi
- Real-time log görüntüleme
- Log retention: 7 gün (free plan)

### Metrics
- CPU, Memory kullanımı
- Request count
- Response times

### Alerts
- Service down alerts
- High error rate alerts
- Resource usage alerts

## 🔒 Güvenlik

### Environment Variables
- ✅ Render'da güvenli şekilde saklanır
- ✅ Loglarda görünmez
- ✅ Service restart sonrası korunur

### Database Security
- ✅ Supabase Row Level Security (RLS) kullanın
- ✅ Service role key sadece backend'de
- ✅ Anon key frontend için

## 💰 Fiyatlandırma

### Render Free Tier
- ✅ 750 saat/ay (yaklaşık 24/7)
- ✅ 512MB RAM
- ✅ Sleep after 15 min inactivity (free tier)
- ✅ Custom domain desteği
- ✅ SSL sertifikası

### Render Paid Plans
- Starter: $7/ay - Always on, 512MB RAM
- Standard: $25/ay - 2GB RAM, better performance

### Supabase Free Tier
- ✅ 500MB database
- ✅ 1GB file storage
- ✅ 2GB bandwidth
- ✅ 50,000 monthly active users

## ✅ Deployment Checklist

- [ ] Render hesabı oluşturuldu
- [ ] GitHub repo bağlandı
- [ ] Supabase projesi oluşturuldu
- [ ] Environment variables ayarlandı
- [ ] Database schema oluşturuldu
- [ ] Storage buckets oluşturuldu
- [ ] Custom domain eklendi
- [ ] DNS kayıtları yapıldı
- [ ] SSL sertifikası aktif
- [ ] Test deployment yapıldı
- [ ] Monitoring ayarlandı

## 🚀 Deployment Adımları

### 1. GitHub'a Push
```bash
git add .
git commit -m "Prepare for Render deployment"
git push origin main
```

### 2. Render'da Service Oluştur
- Dashboard > New > Web Service
- GitHub repo'yu seç
- Ayarları yapılandır

### 3. Environment Variables Ekle
- Tüm gerekli değişkenleri ekle (yukarıdaki listeye bak)

### 4. Deploy
- Render otomatik olarak deploy eder
- Build loglarını takip et

### 5. Domain Yapılandır
- Custom domain ekle
- DNS kayıtlarını yap
- SSL'in aktif olmasını bekle (birkaç dakika)

## 🔍 Troubleshooting

### Build Fails
- Logları kontrol et
- `package.json` doğru mu?
- Node.js versiyonu uyumlu mu?

### Service Won't Start
- Environment variables eksik mi?
- Port doğru mu? (Render otomatik PORT env var kullanır)
- Logları kontrol et

### Database Connection Issues
- Supabase credentials doğru mu?
- Network erişimi var mı?
- Database URL formatı doğru mu?

## 📞 Destek

- Render Docs: https://render.com/docs
- Supabase Docs: https://supabase.com/docs
- Render Support: support@render.com

---

**Not:** Supabase entegrasyonu için mevcut kodda değişiklikler gerekiyor. Detaylar için `SUPABASE_MIGRATION.md` dosyasına bakın.
