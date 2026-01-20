# App Home Ekranı - Klinik Branding Bilgileri

## Genel Bakış

Pro pakette, hasta uygulamasının home ekranının tepesinde detaylı klinik bilgileri gösterilmelidir. Bu bilgiler `/api/patient/me` endpoint'inden alınır ve yalnızca `clinicPlan === "PRO"` olduğunda `branding` objesi döndürülür.

## API Endpoint

### GET /api/patient/me

**Headers:**
```
Authorization: Bearer <patient_token>
```

**Response (PRO plan için):**
```json
{
  "ok": true,
  "patientId": "p_123",
  "clinicPlan": "PRO",
  "branding": {
    "clinicName": "Moon Smile Clinic",
    "clinicLogoUrl": "https://moonsmileclinic.com/assets/img/logos/logo-dark.png",
    "address": "Güzeloba, Havaalanı Cd. No:104 A, 07230 Muratpaşa/Antalya",
    "googleMapLink": "https://maps.app.goo.gl/kRmy4ZNCMkuMscxJ6",
    "primaryColor": "#2563EB",
    "secondaryColor": "#10B981",
    "welcomeMessage": "Hoş geldiniz...",
    "showPoweredBy": true,
    "phone": "+995514661161"
  }
}
```

**Response (FREE/BASIC plan için):**
```json
{
  "ok": true,
  "patientId": "p_123",
  "clinicPlan": "FREE",
  "branding": null
}
```

## App Home Ekranı Görünümü

### Pro Paket İçin

Home ekranının tepesinde şu bilgiler gösterilmelidir:

1. **Klinik Logosu** (`branding.clinicLogoUrl`)
   - Logo varsa gösterilmeli
   - Logo yoksa gösterilmemeli (boş bırakılabilir)

2. **Klinik İsmi** (`branding.clinicName`)
   - Büyük ve belirgin şekilde gösterilmeli

3. **Klinik Adresi** (`branding.address`)
   - Klinik isminin altında gösterilmeli

4. **Google Maps Linki** (`branding.googleMapLink`)
   - Adresin yanında veya altında bir buton/ikon olarak gösterilmeli
   - Tıklandığında Google Maps'te açılmalı
   - Link varsa gösterilmeli, yoksa gösterilmemeli

### Örnek Layout

```
┌─────────────────────────────────┐
│  [Klinik Logosu]                 │
│                                  │
│  Moon Smile Clinic               │
│  Güzeloba, Havaalanı Cd...      │
│  [📍 Haritada Aç]                │
└─────────────────────────────────┘
┌─────────────────────────────────┐
│  ⚠️ Seyahat bilgileriniz         │
│     tamamlanmadı                 │
│  [Seyahat Bilgilerini Tamamla]  │
└─────────────────────────────────┘
┌─────────────────────────────────┐
│  [Ana İçerik]                    │
│  ...                             │
└─────────────────────────────────┘
```

### Örnek React Native Kodu

```jsx
import React, { useEffect, useState } from 'react';
import { View, Text, Image, TouchableOpacity, Linking } from 'react-native';

function HomeScreen() {
  const [branding, setBranding] = useState(null);
  const [clinicPlan, setClinicPlan] = useState('FREE');

  useEffect(() => {
    loadBranding();
  }, []);

  async function loadBranding() {
    try {
      const token = await getPatientToken(); // Token'ı storage'dan al
      const response = await fetch(`${API_BASE}/api/patient/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });
      const data = await response.json();
      
      if (data.ok && data.clinicPlan === 'PRO' && data.branding) {
        setBranding(data.branding);
        setClinicPlan(data.clinicPlan);
      }
    } catch (error) {
      console.error('Load branding error:', error);
    }
  }

  async function openGoogleMaps() {
    if (branding?.googleMapLink) {
      const canOpen = await Linking.canOpenURL(branding.googleMapLink);
      if (canOpen) {
        await Linking.openURL(branding.googleMapLink);
      }
    }
  }

  if (clinicPlan !== 'PRO' || !branding) {
    // FREE/BASIC plan için normal home ekranı
    return <NormalHomeScreen />;
  }

  return (
    <View style={styles.container}>
      {/* Klinik Bilgileri Header */}
      <View style={styles.clinicHeader}>
        {branding.clinicLogoUrl && (
          <Image 
            source={{ uri: branding.clinicLogoUrl }} 
            style={styles.logo}
            resizeMode="contain"
          />
        )}
        <Text style={styles.clinicName}>{branding.clinicName}</Text>
        {branding.address && (
          <Text style={styles.address}>{branding.address}</Text>
        )}
        {branding.googleMapLink && (
          <TouchableOpacity 
            style={styles.mapButton}
            onPress={openGoogleMaps}
          >
            <Text style={styles.mapButtonText}>📍 Haritada Aç</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Seyahat Bilgisi Uyarısı - Branding header'dan sonra, ana içerikten önce */}
      {isTravelInfoIncomplete && (
        <View style={styles.travelWarning}>
          <Text style={styles.travelWarningText}>
            ⚠️ {t('home.travelIncompleteWarning')}
          </Text>
          <Text style={styles.travelWarningMessage}>
            {t('home.travelIncompleteMessage')}
          </Text>
          <TouchableOpacity 
            style={styles.travelWarningButton}
            onPress={() => navigation.navigate('Travel')}
          >
            <Text style={styles.travelWarningButtonText}>
              {t('home.actionCompleteTravel')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Diğer home ekranı içeriği */}
      {/* ... */}
    </View>
  );
}

const styles = {
  clinicHeader: {
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    alignItems: 'center',
  },
  logo: {
    width: 120,
    height: 60,
    marginBottom: 12,
  },
  clinicName: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  address: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 12,
  },
  mapButton: {
    padding: 8,
    backgroundColor: '#2563EB',
    borderRadius: 8,
  },
  mapButtonText: {
    color: '#fff',
    fontSize: 14,
  },
  travelWarning: {
    margin: 16,
    padding: 16,
    backgroundColor: '#FEF3C7',
    borderWidth: 2,
    borderColor: '#F59E0B',
    borderRadius: 12,
  },
  travelWarningText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#92400E',
    marginBottom: 8,
  },
  travelWarningMessage: {
    fontSize: 14,
    color: '#92400E',
    marginBottom: 12,
  },
  travelWarningButton: {
    padding: 12,
    backgroundColor: '#F59E0B',
    borderRadius: 8,
    alignItems: 'center',
  },
  travelWarningButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
};
```

### Örnek Flutter Kodu

```dart
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

class HomeScreen extends StatefulWidget {
  @override
  _HomeScreenState createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  Map<String, dynamic>? branding;
  String clinicPlan = 'FREE';

  @override
  void initState() {
    super.initState();
    loadBranding();
  }

  Future<void> loadBranding() async {
    try {
      final token = await getPatientToken(); // Token'ı storage'dan al
      final response = await http.get(
        Uri.parse('$API_BASE/api/patient/me'),
        headers: {
          'Authorization': 'Bearer $token',
          'Accept': 'application/json',
        },
      );
      
      final data = jsonDecode(response.body);
      if (data['ok'] == true && 
          data['clinicPlan'] == 'PRO' && 
          data['branding'] != null) {
        setState(() {
          branding = data['branding'];
          clinicPlan = data['clinicPlan'];
        });
      }
    } catch (e) {
      print('Load branding error: $e');
    }
  }

  Future<void> openGoogleMaps() async {
    final link = branding?['googleMapLink'];
    if (link != null && link.isNotEmpty) {
      final uri = Uri.parse(link);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (clinicPlan != 'PRO' || branding == null) {
      return NormalHomeScreen();
    }

    return Scaffold(
      body: Column(
        children: [
          // Klinik Bilgileri Header
          Container(
            padding: EdgeInsets.all(16),
            color: Colors.white,
            child: Column(
              children: [
                if (branding!['clinicLogoUrl'] != null && 
                    branding!['clinicLogoUrl'].toString().isNotEmpty)
                  Image.network(
                    branding!['clinicLogoUrl'],
                    width: 120,
                    height: 60,
                    fit: BoxFit.contain,
                  ),
                SizedBox(height: 12),
                Text(
                  branding!['clinicName'] ?? '',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                  textAlign: TextAlign.center,
                ),
                if (branding!['address'] != null && 
                    branding!['address'].toString().isNotEmpty) ...[
                  SizedBox(height: 8),
                  Text(
                    branding!['address'],
                    style: TextStyle(
                      fontSize: 14,
                      color: Colors.grey[600],
                    ),
                    textAlign: TextAlign.center,
                  ),
                ],
                if (branding!['googleMapLink'] != null && 
                    branding!['googleMapLink'].toString().isNotEmpty) ...[
                  SizedBox(height: 12),
                  ElevatedButton.icon(
                    onPressed: openGoogleMaps,
                    icon: Icon(Icons.map),
                    label: Text('Haritada Aç'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Color(0xFF2563EB),
                    ),
                  ),
                ],
              ],
            ),
          ),
          // Seyahat Bilgisi Uyarısı - Branding header'dan sonra, ana içerikten önce
          if (isTravelInfoIncomplete)
            Container(
              margin: EdgeInsets.all(16),
              padding: EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Color(0xFFFEF3C7),
                border: Border.all(color: Color(0xFFF59E0B), width: 2),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '⚠️ ${AppLocalizations.of(context)!.homeTravelIncompleteWarning}',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF92400E),
                    ),
                  ),
                  SizedBox(height: 8),
                  Text(
                    AppLocalizations.of(context)!.homeTravelIncompleteMessage,
                    style: TextStyle(
                      fontSize: 14,
                      color: Color(0xFF92400E),
                    ),
                  ),
                  SizedBox(height: 12),
                  ElevatedButton(
                    onPressed: () {
                      Navigator.pushNamed(context, '/travel');
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Color(0xFFF59E0B),
                    ),
                    child: Text(
                      AppLocalizations.of(context)!.homeActionCompleteTravel,
                      style: TextStyle(color: Colors.white),
                    ),
                  ),
                ],
              ),
            ),
          // Diğer home ekranı içeriği
          Expanded(
            child: NormalHomeContent(),
          ),
        ],
      ),
    );
  }
}
```

## Notlar

1. **Pro Paket Kontrolü**: Branding bilgileri yalnızca `clinicPlan === "PRO"` olduğunda gösterilmelidir.

2. **Opsiyonel Alanlar**: 
   - Logo yoksa gösterilmemeli
   - Adres yoksa gösterilmemeli
   - Google Maps linki yoksa buton gösterilmemeli

3. **Renkler**: `primaryColor` ve `secondaryColor` branding objesinde mevcuttur ancak home header için zorunlu değildir. İsteğe bağlı olarak kullanılabilir.

4. **Logo Yükleme**: Logo URL'i geçerli bir HTTP/HTTPS URL olmalıdır. Hata durumunda fallback gösterilmeli veya logo alanı gizlenmelidir.

5. **Google Maps Link**: Link tıklandığında cihazın varsayılan tarayıcısında veya Google Maps uygulamasında açılmalıdır.

## Seyahat Bilgisi Uyarısı

Home ekranında, seyahat bilgileri eksik olduğunda kullanıcıya bir uyarı gösterilmelidir.

### Gösterim Yeri

**Seyahat bilgisi uyarısı şu sırayla gösterilmelidir:**

1. **Klinik Branding Header** (PRO plan için)
2. **Seyahat Bilgisi Uyarısı** ← Burada gösterilmeli
3. **Ana İçerik** (diğer home ekranı içeriği)

### Uyarı Özellikleri

- **Konum**: Branding header'dan hemen sonra, ana içerikten önce
- **Görünüm**: Sarı/turuncu renkli bir banner/alert kartı
- **İçerik**: 
  - Uyarı ikonu (⚠️)
  - Uyarı metni: "⚠️ Seyahat bilgileriniz tamamlanmadı"
  - Açıklama metni: "Lütfen seyahat bilgilerinizi tamamlayın"
  - Buton: "Seyahat Bilgilerini Tamamla" (tıklandığında Travel ekranına yönlendirir)
- **Görünürlük**: Yalnızca seyahat bilgileri eksik olduğunda gösterilmeli
- **Renkler**: 
  - Arka plan: `#FEF3C7` (açık sarı)
  - Border: `#F59E0B` (turuncu)
  - Metin: `#92400E` (koyu turuncu/kahverengi)
  - Buton: `#F59E0B` (turuncu)

### Kontrol Mantığı

Seyahat bilgilerinin eksik olup olmadığı kontrol edilirken:
- Hasta tarafından doldurulması gereken alanlar kontrol edilmelidir
- `/api/patient/travel` endpoint'inden gelen veriler kontrol edilmelidir
- `editPolicy` ayarlarına göre hangi alanların hasta tarafından doldurulması gerektiği belirlenmelidir

### Çeviri Anahtarları

Uyarı metinleri için i18n çeviri anahtarları:
- `home.travelIncompleteWarning`: "⚠️ Seyahat bilgileriniz tamamlanmadı"
- `home.travelIncompleteMessage`: "Lütfen seyahat bilgilerinizi tamamlayın"
- `home.actionCompleteTravel`: "Seyahat Bilgilerini Tamamla"

## Havalimanı Karşılama Badge ve Bildirim

Admin havalimanı karşılama bilgisini girdiğinde, mobil uygulamanın home ekranında bir badge ve push notification gösterilmelidir.

### Badge Gösterimi

Home ekranında, havalimanı karşılama bilgisi varsa bir badge gösterilmelidir:

**Konum**: Home ekranının üst kısmında, branding header'dan sonra veya travel warning'den sonra

**Görünüm**:
- 🚗 ikonu ile birlikte
- "Havalimanı Karşılama Bilgisi" veya "Airport Pickup Info" metni
- Tıklandığında Travel ekranına yönlendirir
- Badge, havalimanı karşılama bilgisi olduğu sürece görünür

### React Native Örneği

```jsx
import { useTranslation } from 'react-i18next';
import { View, Text, TouchableOpacity } from 'react-native';

function HomeScreen() {
  const { t } = useTranslation();
  const [travelData, setTravelData] = useState(null);
  
  useEffect(() => {
    loadTravelData();
  }, []);
  
  async function loadTravelData() {
    try {
      const token = await getPatientToken();
      const response = await fetch(`${API_BASE}/api/patient/me/travel`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });
      const data = await response.json();
      if (data.ok && data.travel) {
        setTravelData(data.travel);
      }
    } catch (error) {
      console.error('Load travel error:', error);
    }
  }
  
  const hasAirportPickup = travelData?.airportPickup && 
    (travelData.airportPickup.name || travelData.airportPickup.phone);
  
  return (
    <View style={styles.container}>
      {/* Branding Header */}
      {/* ... */}
      
      {/* Travel Warning */}
      {/* ... */}
      
      {/* Airport Pickup Badge */}
      {hasAirportPickup && (
        <TouchableOpacity 
          style={styles.airportPickupBadge}
          onPress={() => navigation.navigate('Travel')}
        >
          <Text style={styles.badgeIcon}>🚗</Text>
          <View style={styles.badgeContent}>
            <Text style={styles.badgeTitle}>
              {t('home.airportPickupBadge', { defaultValue: 'Havalimanı Karşılama Bilgisi' })}
            </Text>
            <Text style={styles.badgeSubtitle}>
              {travelData.airportPickup.name || t('home.viewDetails', { defaultValue: 'Detayları görüntüle' })}
            </Text>
          </View>
        </TouchableOpacity>
      )}
      
      {/* Main Content */}
      {/* ... */}
    </View>
  );
}

const styles = {
  airportPickupBadge: {
    margin: 16,
    padding: 16,
    backgroundColor: '#10B981',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  badgeIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  badgeContent: {
    flex: 1,
  },
  badgeTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  badgeSubtitle: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
  },
};
```

### Flutter Örneği

```dart
import 'package:flutter/material.dart';
import 'package:flutter_gen/gen_l10n/app_localizations.dart';

class HomeScreen extends StatefulWidget {
  @override
  _HomeScreenState createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  Map<String, dynamic>? travelData;
  
  @override
  void initState() {
    super.initState();
    loadTravelData();
  }
  
  Future<void> loadTravelData() async {
    try {
      final token = await getPatientToken();
      final response = await http.get(
        Uri.parse('$API_BASE/api/patient/me/travel'),
        headers: {
          'Authorization': 'Bearer $token',
          'Accept': 'application/json',
        },
      );
      final data = jsonDecode(response.body);
      if (data['ok'] == true && data['travel'] != null) {
        setState(() {
          travelData = data['travel'];
        });
      }
    } catch (e) {
      print('Load travel error: $e');
    }
  }
  
  bool get hasAirportPickup {
    if (travelData == null) return false;
    final pickup = travelData!['airportPickup'];
    return pickup != null && 
      (pickup['name'] != null || pickup['phone'] != null);
  }
  
  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    
    return Scaffold(
      body: Column(
        children: [
          // Branding Header
          // ... 
          
          // Travel Warning
          // ...
          
          // Airport Pickup Badge
          if (hasAirportPickup)
            Container(
              margin: EdgeInsets.all(16),
              padding: EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Color(0xFF10B981),
                borderRadius: BorderRadius.circular(12),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.1),
                    blurRadius: 4,
                    offset: Offset(0, 2),
                  ),
                ],
              ),
              child: InkWell(
                onTap: () {
                  Navigator.pushNamed(context, '/travel');
                },
                child: Row(
                  children: [
                    Text(
                      '🚗',
                      style: TextStyle(fontSize: 32),
                    ),
                    SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            l10n.homeAirportPickupBadge ?? 'Havalimanı Karşılama Bilgisi',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                              color: Colors.white,
                            ),
                          ),
                          SizedBox(height: 4),
                          Text(
                            travelData!['airportPickup']?['name'] ?? 
                            (l10n.homeViewDetails ?? 'Detayları görüntüle'),
                            style: TextStyle(
                              fontSize: 14,
                              color: Colors.white.withOpacity(0.9),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          
          // Main Content
          Expanded(
            child: NormalHomeContent(),
          ),
        ],
      ),
    );
  }
}
```

### Push Notification

Admin havalimanı karşılama bilgisini girdiğinde, backend otomatik olarak push notification gönderir:

**Notification İçeriği**:
- **Başlık**: "🚗 Havalimanı Karşılama Bilgisi"
- **Mesaj**: "Havalimanı karşılama bilgileriniz güncellendi. [İsim] ([Telefon]) sizi karşılayacak."
- **URL**: `/travel` (tıklandığında Travel ekranına yönlendirir)
- **Type**: `AIRPORT_PICKUP`

**Notification Gönderim Koşulları**:
- Airport pickup bilgisi yeni eklendiğinde (daha önce yoktu, şimdi var)
- Airport pickup bilgisi güncellendiğinde (daha önce vardı, şimdi değişti)

**API Endpoint**: `POST /api/patient/:patientId/travel`

Backend, airport pickup bilgisi eklendiğinde veya güncellendiğinde otomatik olarak push notification gönderir. Mobil uygulama tarafında ek bir işlem yapılmasına gerek yoktur.

### i18n Çeviri Anahtarları

Mobil uygulamada kullanılması gereken çeviri anahtarları:

| Çeviri Anahtarı | Türkçe | İngilizce |
|----------------|--------|-----------|
| `home.airportPickupBadge` | Havalimanı Karşılama Bilgisi | Airport Pickup Info |
| `home.viewDetails` | Detayları görüntüle | View details |

### Önemli Notlar

1. **Badge Görünürlüğü**: Badge yalnızca havalimanı karşılama bilgisi varsa gösterilmelidir (`airportPickup.name` veya `airportPickup.phone` varsa).

2. **Push Notification**: Backend otomatik olarak push notification gönderir. Mobil uygulama tarafında ek bir işlem yapılmasına gerek yoktur.

3. **Badge Tıklama**: Badge tıklandığında Travel ekranına yönlendirilmelidir.

4. **Renkler**: Badge için yeşil renk (`#10B981`) kullanılmalıdır (karşılama bilgisi için uygun renk).

5. **Güncelleme**: Travel verileri her home ekranı açıldığında veya periyodik olarak güncellenmelidir.
