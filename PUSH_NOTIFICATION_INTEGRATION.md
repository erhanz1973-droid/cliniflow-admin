# Push Notification Entegrasyonu

Hasta tarafında push notification'ları aktif etmek için aşağıdaki adımları izleyin:

## 1. Dosyaları Yükleyin

Aşağıdaki dosyalar `public/` klasörüne eklenmiştir:
- `service-worker.js` - Service Worker dosyası (push notification'ları handle eder)
- `push-notification.js` - Push notification utility fonksiyonları
- `push-notification-example.html` - Test sayfası (isteğe bağlı)

## 2. Hasta Tarafı Sayfalarına Entegrasyon

Hasta tarafı uygulamasının ana sayfasına veya chat sayfasına aşağıdaki kodu ekleyin:

### HTML'de script tag'leri ekleyin:

```html
<!-- Push notification script -->
<script src="/push-notification.js"></script>

<script>
  // Hasta login olduktan sonra veya sayfa yüklendiğinde
  document.addEventListener('DOMContentLoaded', async () => {
    // Patient ID'yi token'dan veya localStorage'dan alın
    const patientId = localStorage.getItem('patientId') || 
                      getPatientIdFromToken() || 
                      getPatientIdFromUrl();
    
    if (patientId) {
      // Push notification'ı başlat
      try {
        await initializePushNotifications(patientId);
        console.log('Push notifications activated');
      } catch (error) {
        console.error('Failed to activate push notifications:', error);
      }
    }
  });
</script>
```

### Örnek: Chat sayfasına entegrasyon

```html
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hasta Chat</title>
</head>
<body>
  <!-- Chat UI buraya -->
  
  <!-- Push notification script -->
  <script src="/push-notification.js"></script>
  <script>
    // Patient ID'yi localStorage veya token'dan al
    const patientId = localStorage.getItem('patientId');
    
    // Sayfa yüklendiğinde push notification'ı başlat
    window.addEventListener('load', async () => {
      if (patientId && isPushNotificationSupported()) {
        try {
          await initializePushNotifications(patientId);
          console.log('✅ Push notifications activated for patient:', patientId);
        } catch (error) {
          console.warn('⚠️ Push notifications not activated:', error.message);
        }
      }
    });
  </script>
</body>
</html>
```

## 3. Service Worker Dosyasının Erişilebilir Olduğundan Emin Olun

Service Worker dosyası (`service-worker.js`) `public/` klasöründe olmalı ve root'tan erişilebilir olmalı.

## 4. İkon Dosyaları (Opsiyonel)

Push notification'lar için icon ve badge ekleyebilirsiniz:
- `/icon-192x192.png` - Notification icon (192x192)
- `/badge-72x72.png` - Notification badge (72x72)

Bu dosyalar yoksa, varsayılan olarak boş görünecektir.

## 5. Test Etme

1. `push-notification-example.html` sayfasını açın
2. Patient ID girin
3. "Push Notification'ı Aktif Et" butonuna tıklayın
4. Tarayıcıdan bildirim izni isteyecektir - "İzin Ver" seçin
5. Admin panelinden bu hasta'ya mesaj gönderin
6. Push notification almalısınız

## 6. API Endpoint'leri

Backend'de aşağıdaki endpoint'ler mevcut:

- `GET /api/push/public-key` - VAPID public key alır
- `POST /api/patient/:patientId/push-subscription` - Push subscription kaydeder
- `POST /api/patient/:patientId/messages/admin` - Mesaj gönderir (otomatik olarak push notification gönderir)

## 7. Önemli Notlar

1. **HTTPS Gerekli**: Push notifications çalışması için HTTPS gereklidir (localhost hariç)
2. **Service Worker**: Service Worker dosyası root'tan (`/service-worker.js`) erişilebilir olmalı
3. **İzin**: Kullanıcıdan notification izni istenecektir
4. **Token**: Hasta login olmuş olmalı ve token'a sahip olmalı

## 8. Sorun Giderme

- **Service Worker kayıt olamıyor**: Dosyanın `/service-worker.js` path'inden erişilebilir olduğundan emin olun
- **Push notification gelmiyor**: 
  - Tarayıcı konsolunu kontrol edin
  - Notification izninin verildiğinden emin olun
  - Patient ID'nin doğru olduğundan emin olun
- **VAPID key hatası**: Backend'de `npm install web-push` yapıldığından emin olun

## 9. Fonksiyonlar

### `initializePushNotifications(patientId)`
Push notification'ı başlatır. Service worker'ı register eder, izin ister ve subscription'ı kaydeder.

### `isPushNotificationSupported()`
Tarayıcının push notification desteği olup olmadığını kontrol eder.

### `requestNotificationPermission()`
Kullanıcıdan notification izni ister.

### `subscribeToPush(patientId, registration)`
Push subscription oluşturur ve sunucuya kaydeder.

### `unsubscribeFromPush(patientId, registration)`
Push subscription'ı iptal eder.
