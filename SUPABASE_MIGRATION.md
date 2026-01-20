# 🔄 Supabase Migration Guide

Mevcut JSON dosya sisteminden Supabase'e geçiş rehberi.

## 📊 Mevcut Veri Yapısı

Şu anda uygulama `data/` klasöründe JSON dosyaları kullanıyor:
- `data/clinics.json` - Klinik bilgileri
- `data/patients.json` - Hasta bilgileri
- `data/travel/*.json` - Seyahat bilgileri
- `data/chats/*.json` - Chat mesajları
- `data/treatments/*.json` - Tedavi bilgileri

## 🎯 Migration Stratejisi

### Phase 1: Hybrid Approach (Önerilen)

**Avantajlar:**
- ✅ Risk düşük (eski sistem çalışmaya devam eder)
- ✅ Aşamalı geçiş
- ✅ Rollback kolay

**Yaklaşım:**
1. Supabase client ekle
2. Yeni veriler hem JSON hem Supabase'e yaz
3. Okuma: Önce Supabase'den dene, yoksa JSON'dan oku
4. Zamanla tüm veriler Supabase'e migrate et

### Phase 2: Full Migration

Tüm veriler Supabase'e taşındıktan sonra JSON sistemi kaldırılır.

## 📦 Gerekli Paketler

```bash
npm install @supabase/supabase-js
```

## 🗄️ Database Schema

### 1. Supabase Dashboard'da SQL Editor'ü Açın

### 2. Aşağıdaki SQL'i Çalıştırın

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Clinics Table
CREATE TABLE IF NOT EXISTS clinics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_code TEXT UNIQUE NOT NULL,
  clinic_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  status TEXT DEFAULT 'ACTIVE',
  plan TEXT DEFAULT 'FREE',
  default_inviter_discount_percent INTEGER DEFAULT 10,
  default_invited_discount_percent INTEGER DEFAULT 10,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Patients Table
CREATE TABLE IF NOT EXISTS patients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id TEXT UNIQUE NOT NULL,
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  status TEXT DEFAULT 'PENDING',
  referral_credit DECIMAL(10,2) DEFAULT 0,
  referral_credit_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Travel Data Table
CREATE TABLE IF NOT EXISTS travel_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id TEXT UNIQUE NOT NULL,
  schema_version INTEGER DEFAULT 1,
  hotel JSONB,
  flights JSONB,
  airport_pickup JSONB,
  notes TEXT,
  edit_policy JSONB,
  form_completed BOOLEAN DEFAULT FALSE,
  form_completed_at TIMESTAMPTZ,
  events JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (patient_id)
);

-- Messages Table
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id TEXT NOT NULL,
  from_type TEXT NOT NULL CHECK (from_type IN ('CLINIC', 'PATIENT')),
  message TEXT NOT NULL,
  attachments JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Treatments Table
CREATE TABLE IF NOT EXISTS treatments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id TEXT UNIQUE NOT NULL,
  teeth JSONB,
  form_completed BOOLEAN DEFAULT FALSE,
  form_completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (patient_id)
);

-- Health Forms Table
CREATE TABLE IF NOT EXISTS health_forms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id TEXT UNIQUE NOT NULL,
  form_data JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (patient_id)
);

-- Referrals Table
CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inviter_patient_id TEXT NOT NULL,
  invited_patient_id TEXT NOT NULL,
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  inviter_discount_percent INTEGER,
  invited_discount_percent INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(inviter_patient_id, invited_patient_id)
);

-- Referral Events Table
CREATE TABLE IF NOT EXISTS referral_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inviter_patient_id TEXT NOT NULL,
  invitee_patient_id TEXT NOT NULL,
  invitee_payment_id TEXT,
  invitee_paid_amount DECIMAL(10,2),
  currency TEXT DEFAULT 'USD',
  inviter_rate DECIMAL(5,4),
  invitee_rate DECIMAL(5,4),
  earned_discount_amount DECIMAL(10,2),
  status TEXT DEFAULT 'EARNED',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Push Subscriptions Table
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id TEXT NOT NULL,
  subscription JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_patients_clinic_id ON patients(clinic_id);
CREATE INDEX IF NOT EXISTS idx_patients_patient_id ON patients(patient_id);
CREATE INDEX IF NOT EXISTS idx_patients_status ON patients(status);
CREATE INDEX IF NOT EXISTS idx_messages_patient_id ON messages(patient_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_travel_data_patient_id ON travel_data(patient_id);
CREATE INDEX IF NOT EXISTS idx_referrals_inviter ON referrals(inviter_patient_id);
CREATE INDEX IF NOT EXISTS idx_referrals_invited ON referrals(invited_patient_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_patient_id ON push_subscriptions(patient_id);

-- Row Level Security (RLS) - Backend service role kullanıyor, RLS gerekmez
-- Ama güvenlik için eklenebilir
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE travel_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatments ENABLE ROW LEVEL SECURITY;

-- Policies (Service role tüm tablolara erişebilir)
-- Frontend için anon key kullanılırsa policy'ler gerekir
```

## 🔧 Kod Değişiklikleri

### 1. Supabase Client Oluştur

`lib/supabase.js`:
```javascript
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('[SUPABASE] Supabase credentials not configured. Using file system.');
}

const supabase = supabaseUrl && supabaseKey 
  ? createClient(supabaseUrl, supabaseKey)
  : null;

module.exports = { supabase };
```

### 2. Data Access Layer

`lib/data-access.js` oluşturun (hybrid approach için):

```javascript
const { supabase } = require('./supabase');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');

// Hybrid: Önce Supabase'den dene, yoksa JSON'dan oku
async function getClinic(clinicCode) {
  if (supabase) {
    const { data, error } = await supabase
      .from('clinics')
      .select('*')
      .eq('clinic_code', clinicCode)
      .single();
    
    if (!error && data) return data;
  }
  
  // Fallback to JSON
  const clinics = readJson(path.join(DATA_DIR, 'clinics.json'), {});
  return clinics[clinicCode] || null;
}

// Similar functions for other data...
```

### 3. Migration Script

`scripts/migrate-to-supabase.js` oluşturun:

```javascript
// Mevcut JSON verilerini Supabase'e import eder
const { supabase } = require('../lib/supabase');
const fs = require('fs');
const path = require('path');

async function migrateClinics() {
  const clinics = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../data/clinics.json'), 'utf8')
  );
  
  for (const [id, clinic] of Object.entries(clinics)) {
    const { error } = await supabase
      .from('clinics')
      .upsert({
        id: clinic.id || id,
        clinic_code: clinic.clinicCode || clinic.clinic_code,
        clinic_name: clinic.name || clinic.clinicName,
        password_hash: clinic.passwordHash || clinic.password_hash,
        // ... diğer alanlar
      });
    
    if (error) console.error('Error migrating clinic:', id, error);
  }
}

// Similar functions for patients, travel data, etc.
```

## 📤 Storage Migration

### Supabase Storage Buckets

1. **Supabase Dashboard > Storage**
2. **New Bucket** oluştur:
   - `chat-uploads` (public)
   - `patient-documents` (private)

### File Upload Değişiklikleri

Mevcut `multer` upload'ları Supabase Storage'a yönlendirin:

```javascript
const { supabase } = require('./lib/supabase');

// Upload to Supabase Storage
const { data, error } = await supabase.storage
  .from('chat-uploads')
  .upload(`${patientId}/${filename}`, fileBuffer, {
    contentType: file.mimetype,
    upsert: true
  });

// Get public URL
const { data: urlData } = supabase.storage
  .from('chat-uploads')
  .getPublicUrl(`${patientId}/${filename}`);
```

## 🔄 Migration Adımları

### 1. Supabase Setup
- [ ] Supabase projesi oluşturuldu
- [ ] Database schema oluşturuldu
- [ ] Storage buckets oluşturuldu
- [ ] Environment variables ayarlandı

### 2. Code Changes
- [ ] Supabase client eklendi
- [ ] Data access layer oluşturuldu
- [ ] Hybrid approach implement edildi
- [ ] File upload Supabase Storage'a yönlendirildi

### 3. Migration
- [ ] Migration script yazıldı
- [ ] Test verileri migrate edildi
- [ ] Production verileri migrate edildi
- [ ] Verification yapıldı

### 4. Cleanup
- [ ] JSON fallback kaldırıldı
- [ ] Sadece Supabase kullanılıyor
- [ ] Eski JSON dosyaları yedeklendi

## ⚠️ Önemli Notlar

1. **Backup:** Migration öncesi tüm JSON dosyalarını yedekleyin
2. **Testing:** Önce test ortamında deneyin
3. **Rollback Plan:** Geri dönüş planı hazırlayın
4. **Data Integrity:** Migration sonrası veri bütünlüğünü kontrol edin

## 📊 Migration Checklist

- [ ] Supabase projesi hazır
- [ ] Database schema oluşturuldu
- [ ] Storage buckets oluşturuldu
- [ ] Supabase client eklendi
- [ ] Hybrid data access layer yazıldı
- [ ] Migration script hazır
- [ ] Test migration yapıldı
- [ ] Production migration yapıldı
- [ ] Verification tamamlandı
- [ ] JSON fallback kaldırıldı

---

**Not:** Bu migration büyük bir değişiklik. Aşamalı olarak yapılması önerilir.
