# ✅ Post-Deployment Kontrol Listesi

Deployment başarılı! Şimdi uygulamanın düzgün çalıştığını kontrol edin.

## 🔍 Hızlı Kontroller

### 1. Uygulama Durumunu Kontrol Edin

```bash
pm2 status clinifly-admin
```

**Beklenen çıktı:** Status `online` olmalı

### 2. Logları Kontrol Edin

```bash
pm2 logs clinifly-admin --lines 50
```

**Kontrol edin:**
- ✅ "Server running" mesajı
- ✅ Port 5050'de dinliyor
- ✅ Hata mesajı yok

### 3. Uygulamayı Tarayıcıda Test Edin

**Local erişim:**
```
http://localhost:5050/admin.html
```

**Network erişim (aynı ağdaki cihazlar için):**
```bash
# Mac'inizin IP adresini bulun
ifconfig | grep "inet " | grep -v 127.0.0.1
```

Sonra tarayıcıda:
```
http://[IP_ADRESI]:5050/admin.html
```

### 4. API Endpoint'lerini Test Edin

```bash
# Health check (basit test)
curl http://localhost:5050/admin.html

# API endpoint (auth gerektirir)
curl http://localhost:5050/api/admin/clinic
```

## 📊 PM2 Yönetim Komutları

### Durum Kontrolü
```bash
pm2 status                    # Tüm uygulamaların durumu
pm2 info clinifly-admin      # Detaylı bilgi
pm2 monit                    # Canlı monitoring
```

### Log Yönetimi
```bash
pm2 logs clinifly-admin              # Tüm loglar
pm2 logs clinifly-admin --lines 100 # Son 100 satır
pm2 flush                          # Logları temizle
```

### Uygulama Kontrolü
```bash
pm2 restart clinifly-admin    # Yeniden başlat
pm2 stop clinifly-admin      # Durdur
pm2 start clinifly-admin     # Başlat
pm2 delete clinifly-admin    # PM2'den kaldır
```

### Sistem Başlangıcında Otomatik Başlatma
```bash
pm2 startup
pm2 save
```

## 🔧 Yapılandırma Kontrolleri

### 1. .env Dosyası Kontrolü

```bash
# .env dosyasının varlığını kontrol edin
ls -la .env

# Hassas bilgileri kontrol edin (dikkatli!)
cat .env | grep -v "SECRET\|PASS\|KEY"  # Hassas bilgileri gizle
```

**Kontrol edin:**
- ✅ JWT_SECRET ayarlanmış mı?
- ✅ SMTP bilgileri dolu mu? (email için)
- ✅ PORT doğru mu? (5050)

### 2. Data Klasörleri

```bash
ls -la data/
```

**Kontrol edin:**
- ✅ `data/chats/` klasörü var
- ✅ `data/patients/` klasörü var
- ✅ `data/travel/` klasörü var
- ✅ `data/treatments/` klasörü var
- ✅ `data/uploads/chat/` klasörü var

### 3. Port Kullanımı

```bash
# Port 5050'in kullanımda olduğunu kontrol edin
lsof -i :5050
# veya
netstat -an | grep 5050
```

## 🌐 Production Deployment (Sonraki Adımlar)

### 1. Nginx Reverse Proxy Kurulumu

```bash
# Nginx config dosyasını kopyala
sudo cp nginx.conf.example /etc/nginx/sites-available/clinifly-admin

# Domain adını düzenle
sudo nano /etc/nginx/sites-available/clinifly-admin
# "admin.clinifly.com" yerine kendi domain'inizi yazın

# Site'ı aktif et
sudo ln -s /etc/nginx/sites-available/clinifly-admin /etc/nginx/sites-enabled/

# Nginx'i test et
sudo nginx -t

# Nginx'i yeniden yükle
sudo systemctl reload nginx
```

### 2. SSL Sertifikası (Let's Encrypt)

```bash
# Certbot yükle
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx

# SSL sertifikası al
sudo certbot --nginx -d admin.clinifly.com
# Domain adını kendi domain'inizle değiştirin
```

### 3. Firewall Yapılandırması

```bash
# UFW firewall (Ubuntu/Debian)
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable

# Port 5050'i dışarıdan açmayın (sadece Nginx üzerinden erişilebilir olmalı)
```

## 🧪 Test Senaryoları

### 1. Admin Panel Erişimi
- [ ] `http://localhost:5050/admin.html` açılıyor
- [ ] Login sayfası görünüyor
- [ ] Register sayfası çalışıyor

### 2. API Endpoint'leri
- [ ] API endpoint'leri yanıt veriyor
- [ ] Authentication çalışıyor
- [ ] CORS ayarları doğru

### 3. Email Fonksiyonları (SMTP ayarlandıysa)
- [ ] OTP email gönderimi test edildi
- [ ] Email'ler ulaşıyor

### 4. Push Notifications (VAPID keys ayarlandıysa)
- [ ] Push notification subscription çalışıyor
- [ ] Notification gönderimi test edildi

## 📝 Yaygın Sorunlar ve Çözümleri

### Uygulama "errored" durumunda

```bash
# Logları kontrol edin
pm2 logs clinifly-admin --err

# Yaygın sebepler:
# - Port zaten kullanımda
# - .env dosyası eksik/hatalı
# - Node modules eksik
```

### Port 5050 zaten kullanımda

```bash
# Hangi process kullanıyor?
lsof -i :5050

# Process'i durdurun veya .env'de PORT değiştirin
```

### .env dosyası bulunamıyor

```bash
# .env dosyasını oluşturun
cp .env.example .env  # Eğer example varsa
# veya deploy.sh tekrar çalıştırın (otomatik oluşturur)
```

## ✅ Başarı Kriterleri

Deployment başarılı sayılır eğer:

- [x] PM2'de uygulama `online` durumunda
- [ ] `http://localhost:5050/admin.html` erişilebilir
- [ ] Loglarda hata yok
- [ ] API endpoint'leri yanıt veriyor
- [ ] .env dosyası doğru yapılandırılmış
- [ ] Data klasörleri oluşturulmuş

## 🎉 Tebrikler!

Uygulamanız başarıyla deploy edildi! 

**Sonraki adımlar:**
1. Production server'a deploy edin (eğer local'de test ediyorsanız)
2. Domain ve DNS yapılandırması
3. SSL sertifikası kurulumu
4. Nginx reverse proxy kurulumu
5. Monitoring ve backup stratejisi

Detaylı bilgi için `DEPLOYMENT.md` dosyasına bakın.
