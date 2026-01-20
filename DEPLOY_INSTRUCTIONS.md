# 🚀 Deployment Talimatları

## ⚠️ Önemli: Doğru Dizinde Olduğunuzdan Emin Olun

Deployment script'i `cliniflow-admin` dizininde bulunuyor. 

### Doğru Dizine Geçin

```bash
cd /Users/macbookpro/Documents/cliniflow/cliniflow-admin
```

veya kısa yol:

```bash
cd ~/Documents/cliniflow/cliniflow-admin
```

### Deployment'ı Başlatın

```bash
./deploy.sh
```

## 📋 Adım Adım

### 1. Dizini Kontrol Edin

```bash
pwd
# Çıktı şöyle olmalı: /Users/macbookpro/Documents/cliniflow/cliniflow-admin
```

### 2. Dosyanın Varlığını Kontrol Edin

```bash
ls -la deploy.sh
# deploy.sh dosyasını görmelisiniz
```

### 3. Script'i Çalıştırın

```bash
./deploy.sh
```

Eğer "Permission denied" hatası alırsanız:

```bash
chmod +x deploy.sh
./deploy.sh
```

## 🔍 Sorun Giderme

### "no such file or directory" Hatası

**Sebep:** Yanlış dizindesiniz veya dosya yok.

**Çözüm:**
```bash
# Doğru dizine geçin
cd /Users/macbookpro/Documents/cliniflow/cliniflow-admin

# Dosyanın varlığını kontrol edin
ls -la deploy.sh

# Script'i çalıştırın
./deploy.sh
```

### "Permission denied" Hatası

**Sebep:** Script çalıştırma izni yok.

**Çözüm:**
```bash
chmod +x deploy.sh
./deploy.sh
```

### ".env file not found" Uyarısı

**Sebep:** `.env` dosyası yok.

**Çözüm:** Script otomatik olarak `.env` template'i oluşturacak. Sonra düzenleyin:
```bash
nano .env
# veya
code .env
```

## 📝 Alternatif: npm Script Kullanımı

```bash
npm run deploy
```

Bu komut da `deploy.sh` script'ini çalıştırır.

## ✅ Başarılı Deployment Sonrası

Deployment başarılı olduğunda:

1. ✅ Uygulama PM2 ile çalışıyor olmalı
2. ✅ `http://localhost:5050` adresinde erişilebilir olmalı
3. ✅ Logları kontrol edin: `pm2 logs clinifly-admin`

## 🔗 İlgili Dosyalar

- `QUICK_START.md` - Hızlı başlangıç rehberi
- `DEPLOYMENT.md` - Detaylı deployment rehberi
- `DEPLOYMENT_CHECKLIST.md` - Deployment checklist
