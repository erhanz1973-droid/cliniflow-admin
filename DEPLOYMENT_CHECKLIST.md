# Deployment Checklist - Gerekli Bilgiler

Bu checklist, production deployment için sizden gereken bilgileri içerir. Lütfen her bir maddeyi doldurun.

## 🌐 Domain ve DNS Bilgileri

### 1. Domain Adı
- [ ] **Admin Panel Domain:** `___________________________`
  - Örnek: `admin.clinifly.com` veya `panel.clinifly.com`
  - Not: Eğer henüz domain yoksa, satın alınması gereken domain adını belirtin

### 2. DNS Kayıtları
- [ ] **DNS Tipi:** A kaydı mı yoksa CNAME mi kullanılacak?
  - A kaydı: Server IP adresine direkt bağlanır
  - CNAME: Başka bir domain'e yönlendirir
  
- [ ] **Server IP Adresi:** `___________________________`
  - Production sunucusunun IP adresi
  - Eğer henüz server yoksa, server sağlayıcısından alınacak IP adresi

### 3. Email Domain
- [ ] **Email Domain:** `___________________________`
  - SMTP_FROM için kullanılacak domain
  - Örnek: `noreply@clinifly.com` için domain: `clinifly.com`
  - Not: Email göndermek için domain'in SPF/DKIM kayıtları gerekebilir

## 🔐 Güvenlik ve Kimlik Bilgileri

### 4. SMTP Bilgileri (Email Gönderimi İçin)
- [ ] **SMTP Provider:** `___________________________`
  - Örnek: Brevo, SendGrid, AWS SES, Gmail, vb.
  
- [ ] **SMTP Host:** `___________________________`
  - Örnek: `smtp-relay.brevo.com` veya `smtp.gmail.com`
  
- [ ] **SMTP Port:** `___________________________`
  - Genellikle: `587` (TLS) veya `465` (SSL)
  
- [ ] **SMTP Username:** `___________________________`
  
- [ ] **SMTP Password:** `___________________________`
  - Not: Bu bilgiyi güvenli bir şekilde saklayın, `.env` dosyasına eklenecek

### 5. Google Places API (Opsiyonel)
- [ ] **Google Places API Key:** `___________________________`
  - Eğer lokasyon özellikleri kullanılacaksa gerekli
  - Google Cloud Console'dan alınır

## 🖥️ Server Bilgileri

### 6. Server Detayları
- [ ] **Server Provider:** `___________________________`
  - Örnek: AWS, DigitalOcean, Hetzner, Linode, vb.
  
- [ ] **Server OS:** `___________________________`
  - Örnek: Ubuntu 22.04, Debian 11, CentOS 8, vb.
  
- [ ] **Server IP:** `___________________________`
  - Production sunucusunun public IP adresi
  
- [ ] **SSH Access:** `___________________________`
  - SSH kullanıcı adı ve erişim yöntemi
  - Örnek: `root@123.45.67.89` veya `ubuntu@server.example.com`

### 7. Deployment Yöntemi
- [ ] **Hangi yöntem kullanılacak?**
  - [ ] PM2 (Önerilen - basit ve etkili)
  - [ ] systemd (Linux servis olarak)
  - [ ] Docker (Containerization)
  - [ ] Diğer: `___________________________`

## 📱 Mobil Uygulama Entegrasyonu

### 8. API Base URL (Mobil Uygulama İçin)
- [ ] **Mobil uygulama admin panel ile aynı domain'i mi kullanacak?**
  - [ ] Evet, aynı domain: `https://admin.clinifly.com`
  - [ ] Hayır, farklı domain: `___________________________`
  
- [ ] **API Base URL:** `___________________________`
  - Mobil uygulamada kullanılacak tam API URL
  - Örnek: `https://api.clinifly.com` veya `https://admin.clinifly.com`

## 🔔 Push Notification Ayarları

### 9. VAPID Keys
- [ ] **VAPID Keys oluşturuldu mu?**
  - [ ] Evet, keys hazır
  - [ ] Hayır, otomatik oluşturulsun (ilk çalıştırmada oluşturulur)
  
- [ ] **VAPID Subject Email:** `___________________________`
  - Örnek: `mailto:admin@clinifly.com`
  - Push notification için gerekli

## 📋 Ek Bilgiler

### 10. Özel Gereksinimler
- [ ] **Özel port kullanılacak mı?**
  - [ ] Hayır, varsayılan 5050
  - [ ] Evet, port: `___________________________`
  
- [ ] **Load balancer kullanılacak mı?**
  - [ ] Hayır
  - [ ] Evet, detaylar: `___________________________`
  
- [ ] **CDN kullanılacak mı?**
  - [ ] Hayır
  - [ ] Evet, CDN provider: `___________________________`

### 11. Backup Stratejisi
- [ ] **Backup lokasyonu:** `___________________________`
  - Örnek: `/backups/clinifly-admin` veya S3 bucket
  
- [ ] **Backup sıklığı:** `___________________________`
  - Örnek: Günlük, Haftalık

### 12. Monitoring
- [ ] **Monitoring tool kullanılacak mı?**
  - [ ] Hayır
  - [ ] Evet, tool: `___________________________`
  - Örnek: PM2 Plus, New Relic, Datadog, vb.

## ✅ Kontrol Listesi

Deployment öncesi kontrol:

- [ ] Tüm yukarıdaki bilgiler dolduruldu
- [ ] Domain DNS kayıtları yapıldı
- [ ] SSL sertifikası alındı (Let's Encrypt ile otomatik)
- [ ] SMTP bilgileri test edildi
- [ ] Server'a erişim sağlandı
- [ ] Node.js 18+ yüklendi
- [ ] Firewall kuralları yapılandırıldı
- [ ] Backup stratejisi belirlendi

## 📝 Notlar

Buraya özel notlarınızı ekleyebilirsiniz:

```
_________________________________________________________________
_________________________________________________________________
_________________________________________________________________
```

---

**Sonraki Adım:** Bu checklist'i doldurduktan sonra, `DEPLOYMENT.md` dosyasındaki adımları takip ederek deployment'ı gerçekleştirebilirsiniz.
