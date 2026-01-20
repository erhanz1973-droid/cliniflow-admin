# Android Emülatörden Clinifly'e Erişim Rehberi

## Sorun
Android emülatörden `http://localhost:5050` veya `http://127.0.0.1:5050` adresine erişmeye çalıştığınızda bağlantı kurulamaz çünkü emülatördeki "localhost" emülatörün kendisini işaret eder, host makineyi değil.

## Çözüm

### 1. Android Studio Emülatörü İçin

Android Studio emülatöründe host makineye erişmek için özel IP adresi kullanın:

**Doğru URL:** `http://10.0.2.2:5050`

- Android Studio emülatöründe `10.0.2.2` özel bir IP adresidir ve host makinenin `127.0.0.1` adresine karşılık gelir.
- Emülatörün tarayıcısında veya uygulamanızda şu adresi kullanın:
  ```
  http://10.0.2.2:5050/admin.html
  ```

### 2. Genymotion veya Diğer Emülatörler İçin

Diğer emülatörler için Mac'inizin gerçek IP adresini kullanmanız gerekir:

1. **Mac'inizin IP adresini bulun:**
   ```bash
   ifconfig | grep "inet " | grep -v 127.0.0.1
   ```
   veya
   ```bash
   ipconfig getifaddr en0
   ```
   (Wi-Fi için `en0`, Ethernet için `en1` kullanın)

2. **Bulduğunuz IP adresini kullanın:**
   ```
   http://192.168.x.x:5050/admin.html
   ```
   (x.x yerine gerçek IP adresinizi yazın)

### 3. Fiziksel Android Cihaz İçin

Fiziksel Android cihazınız aynı Wi-Fi ağındaysa:

1. Mac ve Android cihazın aynı Wi-Fi ağında olduğundan emin olun
2. Mac'inizin yerel IP adresini bulun (yukarıdaki komutla)
3. Android cihazda şu adresi kullanın:
   ```
   http://192.168.x.x:5050/admin.html
   ```

### 4. Sunucunun Çalıştığından Emin Olun

Sunucunun çalışıp çalışmadığını kontrol edin:

```bash
# Terminal'de çalıştırın:
node index.cjs
```

Sunucu başladığında şu mesajı görmelisiniz:
```
✅ Server running: http://127.0.0.1:5050
✅ Admin:          http://127.0.0.1:5050/admin.html
```

### 5. Güvenlik Duvarı Kontrolü

Mac'inizin güvenlik duvarı 5050 portunu engelliyor olabilir:

1. **Sistem Tercihleri** > **Güvenlik ve Gizlilik** > **Güvenlik Duvarı**
2. Node.js'in ağ erişimine izin verildiğinden emin olun
3. Gerekirse güvenlik duvarını geçici olarak kapatıp test edin

### 6. Test Etme

Emülatörün tarayıcısında şu adresi açın:
```
http://10.0.2.2:5050/health
```

Başarılı olursa şu yanıtı görmelisiniz:
```json
{"ok":true,"server":"index.cjs","time":1234567890}
```

## Hızlı Başlangıç

1. Sunucuyu başlatın:
   ```bash
   cd /Users/macbookpro/Documents/cliniflow/cliniflow-admin
   node index.cjs
   ```

2. Android Studio emülatöründe tarayıcıyı açın

3. Şu adresi girin:
   ```
   http://10.0.2.2:5050/admin.html
   ```

## Sorun Giderme

### "Connection refused" hatası
- Sunucunun çalıştığından emin olun
- Port 5050'in başka bir uygulama tarafından kullanılmadığından emin olun

### "Network is unreachable" hatası
- Emülatörün internet bağlantısı olduğundan emin olun
- Doğru IP adresini kullandığınızdan emin olun (Android Studio için `10.0.2.2`)

### Sayfa yüklenmiyor
- Sunucu loglarını kontrol edin
- Tarayıcının konsol hatalarını kontrol edin (F12 veya Developer Tools)
