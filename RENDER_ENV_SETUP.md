# Render Environment Variables Setup

## Super Admin Authentication ENV Variables

Render dashboard'da aşağıdaki environment variable'ları eklemeniz gerekiyor:

### 🔐 Required Environment Variables

```
SUPER_ADMIN_EMAIL=your-email@example.com
SUPER_ADMIN_PASSWORD=your-strong-password-here
SUPER_ADMIN_JWT_SECRET=super-secret-long-random-key-min-32-chars
```

### 📝 Setup Instructions

1. **Render Dashboard'a gidin:**
   - https://dashboard.render.com
   - Servisinizi seçin

2. **Environment sekmesine gidin:**
   - Sol menüden "Environment" sekmesine tıklayın

3. **Her bir ENV variable'ı ekleyin:**
   - "Add Environment Variable" butonuna tıklayın
   - Key: `SUPER_ADMIN_EMAIL`
   - Value: Super admin email adresiniz
   - "Save Changes" butonuna tıklayın
   - Aynı işlemi diğer variable'lar için tekrarlayın

4. **Deploy'u yeniden başlatın:**
   - "Manual Deploy" → "Deploy latest commit" veya
   - Otomatik deploy varsa commit push edin

### 🔑 JWT Secret Önerileri

`SUPER_ADMIN_JWT_SECRET` için güçlü bir key kullanın:

```bash
# Terminal'de random key oluşturma (macOS/Linux):
openssl rand -base64 32

# veya Node.js ile:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**ÖNEMLİ:** 
- JWT Secret en az 32 karakter olmalı
- Production'da güçlü, random bir key kullanın
- Bu key'i asla public repository'lere commit etmeyin

### ✅ Verification

Deploy sonrası test edin:

```bash
# Login endpoint'ini test edin
curl -X POST https://your-api.render.com/api/super-admin/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your-email@example.com",
    "password": "your-strong-password-here"
  }'
```

Başarılı response:
```json
{
  "ok": true,
  "token": "eyJhbGc...",
  "message": "Login successful"
}
```

### 🔄 Deploy Sonrası

1. Render'da servisi restart edin (gerekirse)
2. Super admin login sayfasını test edin
3. Token'ın cookie ve localStorage'a kaydedildiğini kontrol edin

### 🛡️ Security Notes

- `SUPER_ADMIN_PASSWORD` güçlü bir şifre olmalı (min 12 karakter, büyük/küçük harf, rakam, özel karakter)
- ENV variable'larını asla commit etmeyin
- Render dashboard'da "Reveal Values" butonunu dikkatli kullanın
- Production ve staging için farklı password'ler kullanın

### 📋 Environment Variables List

Tüm ENV variable'ları:

```bash
# Super Admin Auth
SUPER_ADMIN_EMAIL=your-email@example.com
SUPER_ADMIN_PASSWORD=your-strong-password
SUPER_ADMIN_JWT_SECRET=super-secret-long-key

# Super Admin URL (optional, default: https://superadmin.clinifly.net/login)
SUPER_ADMIN_URL=https://your-super-admin-domain.com/login

# Existing Admin Auth (if needed)
JWT_SECRET=your-existing-jwt-secret

# Database, SMTP, etc. (existing variables)
...
```

### 🚨 Troubleshooting

**Problem:** Login çalışmıyor
- ENV variable'ların doğru eklendiğinden emin olun
- Servisi restart edin
- Logs'u kontrol edin: Render Dashboard → Logs

**Problem:** Token geçersiz hatası
- `SUPER_ADMIN_JWT_SECRET` değiştirdiyseniz eski token'lar geçersiz olur
- Yeni token almak için tekrar login yapın

**Problem:** Redirect çalışmıyor
- `SUPER_ADMIN_URL` ENV variable'ını kontrol edin
- Default URL: `https://superadmin.clinifly.net/login`
