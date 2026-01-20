# 📁 Dosya Konumları ve Deployment

## 🔍 Şu Anki Durum

### Local Development (Mac'inizde)
**Konum:** `/Users/macbookpro/Documents/cliniflow/cliniflow-admin`

**Durum:** 
- ✅ Local'de çalışıyor
- ✅ PM2 ile `localhost:5050` portunda
- ❌ Henüz internette değil (sadece local network'te erişilebilir)

**Erişim:**
- Local: `http://localhost:5050`
- Network: `http://[MAC_IP]:5050` (aynı Wi-Fi ağındaki cihazlar)

## 🌐 Production Deployment (İnternete Yükleme)

Dosyaları internete yüklemek için bir **production server** gerekiyor.

### Seçenek 1: Cloud Server (Önerilen)

#### A. DigitalOcean / Linode / Vultr
**Server Konumu:** `/home/username/cliniflow-admin` veya `/var/www/cliniflow-admin`

**Adımlar:**
1. Cloud provider'dan VPS (Virtual Private Server) satın alın
2. SSH ile server'a bağlanın
3. Dosyaları server'a yükleyin (git, scp, rsync)
4. Deployment script'ini çalıştırın

**Örnek:**
```bash
# Server'a bağlan
ssh user@your-server-ip

# Proje klasörüne git
cd /var/www/cliniflow-admin

# Dosyaları yükle (git ile)
git clone [repository-url] .
# veya
# Dosyaları scp ile yükle
scp -r * user@server:/var/www/cliniflow-admin/
```

#### B. AWS EC2 / Google Cloud / Azure
**Server Konumu:** `/home/ec2-user/cliniflow-admin` veya benzeri

**Adımlar:** Yukarıdakiyle aynı

### Seçenek 2: Shared Hosting (Sınırlı)

**Not:** Çoğu shared hosting Node.js uygulamalarını desteklemez. VPS/Cloud server önerilir.

### Seçenek 3: Platform as a Service (PaaS)

#### Heroku
```bash
# Heroku CLI ile
heroku create clinifly-admin
git push heroku main
```

#### Railway / Render / Fly.io
- GitHub repo'yu bağlayın
- Otomatik deploy

## 📂 Production Server'da Dosya Yapısı

```
/home/username/cliniflow-admin/
├── index.cjs              # Ana server dosyası
├── package.json
├── .env                   # Environment variables (GİZLİ!)
├── public/                # Static HTML dosyaları
│   ├── admin.html
│   ├── admin-login.html
│   └── ...
├── data/                  # Veri dosyaları (JSON)
│   ├── chats/
│   ├── patients/
│   └── ...
├── node_modules/          # Dependencies
├── deploy.sh              # Deployment script
└── ecosystem.config.js    # PM2 config
```

## 🚀 Production'a Yükleme Adımları

### Yöntem 1: Git ile (Önerilen)

```bash
# 1. Local'de git repo oluştur (eğer yoksa)
cd ~/Documents/cliniflow/cliniflow-admin
git init
git add .
git commit -m "Initial commit"

# 2. GitHub/GitLab'a push et
git remote add origin [repository-url]
git push -u origin main

# 3. Server'da clone et
ssh user@server
cd /var/www
git clone [repository-url] cliniflow-admin
cd cliniflow-admin

# 4. .env dosyasını oluştur
nano .env
# (SMTP, JWT_SECRET, vb. bilgileri ekle)

# 5. Deployment script'ini çalıştır
./deploy.sh
```

### Yöntem 2: SCP ile (Manuel)

```bash
# Local'den server'a tüm dosyaları yükle
scp -r ~/Documents/cliniflow/cliniflow-admin/* user@server:/var/www/cliniflow-admin/

# Server'a bağlan
ssh user@server
cd /var/www/cliniflow-admin

# .env dosyasını oluştur
nano .env

# Deployment
./deploy.sh
```

### Yöntem 3: Rsync ile (Senkronizasyon)

```bash
# Local'den server'a senkronize et
rsync -avz --exclude 'node_modules' \
  ~/Documents/cliniflow/cliniflow-admin/ \
  user@server:/var/www/cliniflow-admin/
```

## 🌍 Domain ve DNS Yapılandırması

### 1. Domain Satın Alın
- Namecheap, GoDaddy, Cloudflare, vb.

### 2. DNS Kayıtları
**A Kaydı:**
```
Type: A
Name: admin (veya @)
Value: [SERVER_IP_ADDRESS]
TTL: 3600
```

**Sonuç:** `admin.yourdomain.com` → Server IP'ye yönlendirilir

### 3. Nginx Yapılandırması
```bash
# Server'da
sudo cp nginx.conf.example /etc/nginx/sites-available/clinifly-admin
sudo nano /etc/nginx/sites-available/clinifly-admin
# Domain adını değiştir: admin.yourdomain.com

sudo ln -s /etc/nginx/sites-available/clinifly-admin /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 4. SSL Sertifikası
```bash
sudo certbot --nginx -d admin.yourdomain.com
```

## 📍 Erişim URL'leri

### Production (Domain ile)
```
https://admin.yourdomain.com/admin-login.html
https://admin.yourdomain.com/admin.html
```

### Local (Şu anki durum)
```
http://localhost:5050/admin-login.html
```

## 🔐 Önemli Dosyalar ve Konumları

### 1. .env Dosyası
**Konum:** Server'da `/var/www/cliniflow-admin/.env`
**İçerik:** SMTP, JWT_SECRET, VAPID keys (GİZLİ!)
**Not:** Bu dosya asla git'e commit edilmemeli

### 2. Data Klasörü
**Konum:** Server'da `/var/www/cliniflow-admin/data/`
**İçerik:** Tüm uygulama verileri (JSON dosyaları)
**Backup:** Düzenli olarak yedeklenmeli

### 3. Log Dosyaları
**Konum:** 
- PM2: `~/.pm2/logs/`
- Nginx: `/var/log/nginx/`

## 📊 Server Gereksinimleri

### Minimum
- **RAM:** 1GB
- **CPU:** 1 core
- **Disk:** 10GB
- **OS:** Ubuntu 20.04+ / Debian 11+

### Önerilen
- **RAM:** 2GB+
- **CPU:** 2 cores+
- **Disk:** 20GB+ SSD
- **Bandwidth:** Unlimited

## ✅ Deployment Checklist

- [ ] Server satın alındı / hazır
- [ ] SSH erişimi sağlandı
- [ ] Node.js 18+ yüklendi
- [ ] Dosyalar server'a yüklendi
- [ ] .env dosyası oluşturuldu ve dolduruldu
- [ ] Dependencies yüklendi (`npm install`)
- [ ] PM2 ile uygulama başlatıldı
- [ ] Nginx yapılandırıldı
- [ ] Domain DNS kayıtları yapıldı
- [ ] SSL sertifikası kuruldu
- [ ] Firewall yapılandırıldı
- [ ] Backup stratejisi ayarlandı

## 🔍 Dosyaların Nerede Olduğunu Kontrol Etme

### Local'de
```bash
pwd
# Çıktı: /Users/macbookpro/Documents/cliniflow/cliniflow-admin
```

### Production Server'da
```bash
ssh user@server
pwd
# Çıktı: /var/www/cliniflow-admin (veya belirlediğiniz konum)
```

## 📞 Yardım

Eğer production server'ınız yoksa:
1. **DigitalOcean** - Başlangıç için $6/ay
2. **Linode** - Başlangıç için $5/ay
3. **Vultr** - Başlangıç için $6/ay
4. **AWS EC2** - Free tier mevcut (1 yıl)
5. **Heroku** - Free tier (sınırlı)

---

**Özet:** Şu anda dosyalar sadece local'de (Mac'inizde). İnternete yüklemek için bir production server gerekiyor.
