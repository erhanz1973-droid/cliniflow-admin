# 🚀 Quick Start - Deployment

Hızlı deployment için bu adımları takip edin.

## 1. Hızlı Başlangıç (Local/Development)

```bash
# Dependencies yükle
npm install

# .env dosyası oluştur (otomatik oluşturulur)
# Gerekli bilgileri doldurun

# Uygulamayı başlat
npm start
```

Uygulama `http://localhost:5050` adresinde çalışacak.

## 2. Production Deployment (Otomatik)

```bash
# Deployment script'ini çalıştır
./deploy.sh
```

Bu script:
- ✅ Node.js versiyonunu kontrol eder
- ✅ Dependencies yükler
- ✅ PM2'yi yükler (yoksa)
- ✅ Data klasörlerini oluşturur
- ✅ Uygulamayı PM2 ile başlatır

## 3. Production Deployment (Manuel)

### Adım 1: Environment Variables

`.env` dosyasını oluşturun ve doldurun:

```bash
cp .env.example .env
# .env dosyasını düzenleyin
```

### Adım 2: Dependencies

```bash
npm install
```

### Adım 3: PM2 ile Başlat

```bash
# PM2 yükle (global)
npm install -g pm2

# Uygulamayı başlat
pm2 start index.cjs --name clinifly-admin

# PM2'yi kaydet (restart sonrası otomatik başlasın)
pm2 save
pm2 startup
```

### Adım 4: Nginx Yapılandırması

```bash
# Nginx config dosyasını kopyala
sudo cp nginx.conf.example /etc/nginx/sites-available/clinifly-admin

# Domain adını değiştir
sudo nano /etc/nginx/sites-available/clinifly-admin

# Site'ı aktif et
sudo ln -s /etc/nginx/sites-available/clinifly-admin /etc/nginx/sites-enabled/

# Nginx'i test et
sudo nginx -t

# Nginx'i yeniden yükle
sudo systemctl reload nginx
```

### Adım 5: SSL Sertifikası

```bash
# Certbot yükle
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx

# SSL sertifikası al
sudo certbot --nginx -d admin.clinifly.com
```

## 4. Kontrol Komutları

```bash
# PM2 durumu
pm2 status

# Logları görüntüle
pm2 logs clinifly-admin

# Uygulamayı yeniden başlat
pm2 restart clinifly-admin

# Uygulamayı durdur
pm2 stop clinifly-admin

# Nginx durumu
sudo systemctl status nginx

# Nginx logları
sudo tail -f /var/log/nginx/error.log
```

## 5. Sorun Giderme

### Uygulama başlamıyor

```bash
# Port kontrolü
netstat -tulpn | grep 5050

# Logları kontrol et
pm2 logs clinifly-admin --lines 50
```

### Nginx 502 hatası

```bash
# Uygulamanın çalıştığını kontrol et
pm2 status

# Nginx error log
sudo tail -f /var/log/nginx/error.log
```

### SSL sorunu

```bash
# Sertifika durumu
sudo certbot certificates

# Sertifikayı yenile
sudo certbot renew
```

## 6. Sonraki Adımlar

1. ✅ Domain DNS kayıtlarını yapın
2. ✅ SSL sertifikasını kurun
3. ✅ Firewall kurallarını yapılandırın
4. ✅ Backup script'ini ayarlayın
5. ✅ Monitoring kurun

Detaylı bilgi için `DEPLOYMENT.md` dosyasına bakın.
