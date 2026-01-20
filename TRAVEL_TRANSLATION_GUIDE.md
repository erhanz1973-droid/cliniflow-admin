# Travel App Ekranı - Dil Seçimi ve Çeviri Rehberi

## Genel Bakış

Travel API response'unda bazı field name'ler ve değerler İngilizce olarak döndürülüyor. App ekranında bu değerlerin kullanıcının dil seçimine göre (Türkçe/İngilizce) çevrilmesi gerekmektedir.

**ÖNEMLİ**: Arrival ve Departure butonları ve tüm uçuş tipi etiketleri mutlaka i18n çeviri sistemi kullanılarak gösterilmelidir. Hard-coded metinler kullanılmamalıdır.

## API Response Yapısı

### GET /api/patient/:patientId/travel

**Response:**
```json
{
  "schemaVersion": 1,
  "updatedAt": 1768054886769,
  "patientId": "p2",
  "hotel": {
    "name": "Test Hotel",
    "address": "Test Address",
    "checkIn": "2026-01-08",
    "checkOut": "2026-01-30",
    "googleMapsUrl": "..."
  },
  "flights": [
    {
      "type": "OUTBOUND",
      "airline": "thy",
      "flightNo": "thy678",
      "from": "lon",
      "to": "ant",
      "date": "2026-01-05",
      "time": "11:00",
      "pnr": "",
      "note": ""
    },
    {
      "type": "RETURN",
      ...
    }
  ],
  "airportPickup": {
    "name": "...",
    "phone": "...",
    "vehicle": "...",
    "plate": "...",
    "meetingPoint": "...",
    "note": "..."
  },
  "notes": "...",
  "editPolicy": {
    "hotel": "ADMIN",
    "flights": "ADMIN",
    "airportPickup": "ADMIN",
    "notes": "ADMIN"
  }
}
```

## Türkçe Çeviri Tablosu

### Flight Type (Uçuş Tipi)

| İngilizce | Türkçe |
|-----------|--------|
| `OUTBOUND` | Gidiş |
| `RETURN` | Dönüş |
| `DEPARTURE` | Dönüş |
| `ARRIVAL` | Geliş |
| `INBOUND` | Geliş |

### Hotel Fields (Otel Alanları)

| İngilizce | Türkçe |
|-----------|--------|
| `checkIn` | Giriş |
| `checkOut` | Çıkış |
| `name` | İsim |
| `address` | Adres |

### Flight Fields (Uçuş Alanları)

| İngilizce | Türkçe |
|-----------|--------|
| `airline` | Havayolu |
| `flightNo` | Uçuş No |
| `pnr` | PNR |
| `from` | Kalkış |
| `to` | Varış |
| `date` | Tarih |
| `time` | Saat |
| `note` | Not |

### Airport Pickup Fields (Havalimanı Karşılama Alanları)

| İngilizce | Türkçe |
|-----------|--------|
| `name` | İsim |
| `phone` | Telefon |
| `vehicle` | Araç |
| `vehicleInfo` | Araç Bilgisi |
| `plate` | Plaka |
| `meetingPoint` | Buluşma Noktası |
| `note` | Not |
| `notes` | Notlar |

## App Ekranında Gösterim Örnekleri

### React Native Örneği (i18n ile)

```jsx
import { useTranslation } from 'react-i18next';

// Flight type çevirisi - i18n kullanarak
function useFlightTypeLabel() {
  const { t } = useTranslation();
  
  return (type) => {
    switch(type) {
      case 'OUTBOUND':
        return t('travel.outbound', { defaultValue: 'Gidiş' });
      case 'RETURN':
        return t('travel.return', { defaultValue: 'Dönüş' });
      case 'DEPARTURE':
        return t('travel.departure', { defaultValue: 'Kalkış' });
      case 'ARRIVAL':
        return t('travel.arrival', { defaultValue: 'Varış' });
      case 'INBOUND':
        return t('travel.inbound', { defaultValue: 'Geliş' });
      default:
        return type;
    }
  };
}

// Eski yöntem (hard-coded - kullanmayın):
// const getFlightTypeLabel = (type) => {
//   const labels = {
//     'OUTBOUND': 'Gidiş',
//     'RETURN': 'Dönüş',
//     'DEPARTURE': 'Dönüş',
//     'ARRIVAL': 'Geliş',
//     'INBOUND': 'Geliş',
//   };
//   return labels[type] || type;
// };

// Hotel check-in/check-out çevirisi
const getHotelCheckLabel = (type) => {
  const labels = {
    'checkIn': 'Giriş',
    'checkOut': 'Çıkış',
  };
  return labels[type] || type;
};

// Flight detay gösterimi - i18n ile
function FlightDetails({ flight }) {
  const { t } = useTranslation();
  const getFlightTypeLabel = useFlightTypeLabel();
  
  return (
    <View>
      <Text>{getFlightTypeLabel(flight.type)} {t('travel.flight', { defaultValue: 'Uçuşu' })}</Text>
      <Text>{t('travel.airline', { defaultValue: 'Havayolu' })}: {flight.airline}</Text>
      <Text>{t('travel.flightNo', { defaultValue: 'Uçuş No' })}: {flight.flightNo}</Text>
      {flight.pnr && <Text>{t('travel.pnr', { defaultValue: 'PNR' })}: {flight.pnr}</Text>}
      <Text>{t('travel.departure', { defaultValue: 'Kalkış' })}: {flight.from?.toUpperCase()}</Text>
      <Text>{t('travel.arrival', { defaultValue: 'Varış' })}: {flight.to?.toUpperCase()}</Text>
      <Text>{t('travel.date', { defaultValue: 'Tarih' })}: {flight.date}</Text>
      {flight.time && <Text>{t('travel.time', { defaultValue: 'Saat' })}: {flight.time}</Text>}
      {flight.note && <Text>{t('travel.note', { defaultValue: 'Not' })}: {flight.note}</Text>}
    </View>
  );
}

// Hotel detay gösterimi
function renderHotelDetails(hotel) {
  return (
    <View>
      <Text>Otel: {hotel.name}</Text>
      {hotel.address && <Text>Adres: {hotel.address}</Text>}
      {hotel.checkIn && <Text>Giriş: {hotel.checkIn}</Text>}
      {hotel.checkOut && <Text>Çıkış: {hotel.checkOut}</Text>}
    </View>
  );
}

// Airport pickup detay gösterimi
function renderAirportPickup(pickup) {
  return (
    <View>
      <Text>🚗 Havalimanı Karşılama</Text>
      {pickup.name && <Text>İsim: {pickup.name}</Text>}
      {pickup.phone && <Text>Telefon: {pickup.phone}</Text>}
      {(pickup.vehicle || pickup.vehicleInfo) && (
        <Text>
          Araç: {pickup.vehicle || pickup.vehicleInfo}
          {pickup.plate && `, Plaka: ${pickup.plate}`}
        </Text>
      )}
      {pickup.meetingPoint && <Text>Buluşma: {pickup.meetingPoint}</Text>}
      {(pickup.note || pickup.notes) && (
        <Text>Not: {pickup.note || pickup.notes}</Text>
      )}
    </View>
  );
}
```

### Flutter Örneği (i18n ile)

```dart
import 'package:flutter_gen/gen_l10n/app_localizations.dart';

// Flight type çevirisi - i18n kullanarak
String getFlightTypeLabel(String? type, AppLocalizations l10n) {
  switch(type) {
    case 'OUTBOUND':
      return l10n.travelOutbound ?? 'Gidiş';
    case 'RETURN':
      return l10n.travelReturn ?? 'Dönüş';
    case 'DEPARTURE':
      return l10n.travelDeparture ?? 'Kalkış';
    case 'ARRIVAL':
      return l10n.travelArrival ?? 'Varış';
    case 'INBOUND':
      return l10n.travelInbound ?? 'Geliş';
    default:
      return type ?? '';
  }
}

// Eski yöntem (hard-coded - kullanmayın):
// String getFlightTypeLabel(String? type) {
//   const labels = {
//     'OUTBOUND': 'Gidiş',
//     'RETURN': 'Dönüş',
//     'DEPARTURE': 'Dönüş',
//     'ARRIVAL': 'Geliş',
//     'INBOUND': 'Geliş',
//   };
//   return labels[type] ?? type ?? '';
// }

// Hotel check-in/check-out çevirisi
String getHotelCheckLabel(String type) {
  const labels = {
    'checkIn': 'Giriş',
    'checkOut': 'Çıkış',
  };
  return labels[type] ?? type;
}

// Flight detay widget - i18n ile
Widget buildFlightDetails(Map<String, dynamic> flight, BuildContext context) {
  final l10n = AppLocalizations.of(context)!;
  
  return Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text('${getFlightTypeLabel(flight['type'], l10n)} ${l10n.travelFlight ?? 'Uçuşu'}'),
      if (flight['airline'] != null) 
        Text('${l10n.travelAirline ?? 'Havayolu'}: ${flight['airline']}'),
      if (flight['flightNo'] != null) 
        Text('${l10n.travelFlightNo ?? 'Uçuş No'}: ${flight['flightNo']}'),
      if (flight['pnr'] != null && flight['pnr'].toString().isNotEmpty)
        Text('${l10n.travelPnr ?? 'PNR'}: ${flight['pnr']}'),
      Text('${l10n.travelDeparture ?? 'Kalkış'}: ${(flight['from'] ?? '').toString().toUpperCase()}'),
      Text('${l10n.travelArrival ?? 'Varış'}: ${(flight['to'] ?? '').toString().toUpperCase()}'),
      Text('${l10n.travelDate ?? 'Tarih'}: ${flight['date'] ?? ''}'),
      if (flight['time'] != null && flight['time'].toString().isNotEmpty)
        Text('${l10n.travelTime ?? 'Saat'}: ${flight['time']}'),
      if (flight['note'] != null && flight['note'].toString().isNotEmpty)
        Text('${l10n.travelNote ?? 'Not'}: ${flight['note']}'),
    ],
  );
}

// Hotel detay widget
Widget buildHotelDetails(Map<String, dynamic>? hotel) {
  if (hotel == null) return SizedBox.shrink();
  
  return Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text('Otel: ${hotel['name'] ?? ''}'),
      if (hotel['address'] != null && hotel['address'].toString().isNotEmpty)
        Text('Adres: ${hotel['address']}'),
      if (hotel['checkIn'] != null) Text('Giriş: ${hotel['checkIn']}'),
      if (hotel['checkOut'] != null) Text('Çıkış: ${hotel['checkOut']}'),
    ],
  );
}

// Airport pickup detay widget
Widget buildAirportPickup(Map<String, dynamic>? pickup) {
  if (pickup == null) return SizedBox.shrink();
  
  return Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text('🚗 Havalimanı Karşılama'),
      if (pickup['name'] != null) Text('İsim: ${pickup['name']}'),
      if (pickup['phone'] != null) Text('Telefon: ${pickup['phone']}'),
      if ((pickup['vehicle'] ?? pickup['vehicleInfo']) != null) ...[
        Text(
          'Araç: ${pickup['vehicle'] ?? pickup['vehicleInfo']}'
          '${pickup['plate'] != null ? ", Plaka: ${pickup['plate']}" : ""}'
        ),
      ],
      if (pickup['meetingPoint'] != null) 
        Text('Buluşma: ${pickup['meetingPoint']}'),
      if ((pickup['note'] ?? pickup['notes']) != null)
        Text('Not: ${pickup['note'] ?? pickup['notes']}'),
    ],
  );
}
```

## Dil Seçimi ve i18n Kullanımı

### Arrival ve Departure Butonları

Uçuş ekranında **Arrival** (Geliş) ve **Departure** (Kalkış) butonları mutlaka i18n çeviri sistemi kullanılarak gösterilmelidir. Kullanıcının dil seçimine göre:
- **Türkçe seçen**: "Varış" ve "Kalkış" görür
- **İngilizce seçen**: "Arrival" ve "Departure" görür

### i18n Çeviri Anahtarları

Mobil uygulamada kullanılması gereken çeviri anahtarları:

| Çeviri Anahtarı | Türkçe | İngilizce |
|----------------|--------|-----------|
| `travel.arrival` | Varış | Arrival |
| `travel.departure` | Kalkış | Departure |
| `travel.addArrival` | + Varış | + Arrival |
| `travel.addDeparture` | + Kalkış | + Departure |

### React Native Örneği (i18n ile)

```jsx
import { useTranslation } from 'react-i18next';

function TravelScreen() {
  const { t } = useTranslation();
  
  return (
    <View>
      <View style={styles.flightButtons}>
        <TouchableOpacity 
          style={styles.addButton}
          onPress={() => addFlight('ARRIVAL')}
        >
          <Text style={styles.buttonText}>
            {t('travel.addArrival')}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.addButton}
          onPress={() => addFlight('DEPARTURE')}
        >
          <Text style={styles.buttonText}>
            {t('travel.addDeparture')}
          </Text>
        </TouchableOpacity>
      </View>
      
      {/* Flight list gösterimi */}
      {flights.map((flight) => (
        <View key={flight.id}>
          <Text style={styles.flightType}>
            {flight.type === 'ARRIVAL' 
              ? t('travel.arrival') 
              : t('travel.departure')}
          </Text>
          {/* Diğer uçuş detayları */}
        </View>
      ))}
    </View>
  );
}
```

### Flutter Örneği (i18n ile)

```dart
import 'package:flutter/material.dart';
import 'package:flutter_gen/gen_l10n/app_localizations.dart';

class TravelScreen extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    
    return Column(
      children: [
        Row(
          children: [
            ElevatedButton(
              onPressed: () => addFlight('ARRIVAL'),
              child: Text(l10n.travelAddArrival),
            ),
            SizedBox(width: 12),
            ElevatedButton(
              onPressed: () => addFlight('DEPARTURE'),
              child: Text(l10n.travelAddDeparture),
            ),
          ],
        ),
        
        // Flight list gösterimi
        ...flights.map((flight) => 
          Card(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  flight.type == 'ARRIVAL' 
                    ? l10n.travelArrival 
                    : l10n.travelDeparture,
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
                // Diğer uçuş detayları
              ],
            ),
          ),
        ),
      ],
    );
  }
}
```

## Önemli Notlar

1. **Field Name'ler**: API response'undaki field name'ler (örn: `checkIn`, `flightNo`) İngilizce olarak kalmalıdır. Sadece app ekranında gösterilen label'lar ve değerler dil seçimine göre çevrilmelidir.

2. **Flight Type**: `OUTBOUND`, `RETURN`, `ARRIVAL`, `DEPARTURE` değerleri için mutlaka i18n çeviri sistemi kullanılmalıdır. Hard-coded metinler kullanılmamalıdır.

3. **Arrival/Departure Butonları**: Uçuş ekranındaki "Arrival" ve "Departure" butonları mutlaka `travel.addArrival` ve `travel.addDeparture` çeviri anahtarları kullanılarak gösterilmelidir.

4. **Hotel Check-in/Check-out**: `checkIn` ve `checkOut` field name'leri İngilizce kalır, ama ekranda dil seçimine göre çevrilmelidir.

5. **Büyük/Küçük Harf**: Flight type değerleri (`OUTBOUND`, `RETURN`, vb.) genellikle büyük harfle gelir, ama app'da gösterirken i18n çeviri sistemi kullanılmalıdır.

6. **Boş Değerler**: Boş string veya null olan değerler gösterilmemelidir.

7. **IATA Kodları**: `from` ve `to` field'ları IATA havaalanı kodları içerir (örn: "IST", "TBS"). Bunlar büyük harfle gösterilebilir ama çevrilmezler.

8. **Dil Değişikliği**: Kullanıcı dil değiştirdiğinde, tüm arrival ve departure etiketleri otomatik olarak yeni dile çevrilmelidir.

## Örnek Tam Ekran Gösterimi

```
✈️ Uçuş Bilgileri
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Gidiş Uçuşu
  Kalkış: LON → Varış: ANT
  Havayolu: Turkish Airlines
  Uçuş No: TK 567
  Tarih: 2026-01-08
  Saat: 14:30
  PNR: ABC123
  Not: Ek bagaj: 23kg

Dönüş Uçuşu
  Kalkış: ANT → Varış: LON
  Havayolu: Turkish Airlines
  Uçuş No: TK 843
  Tarih: 2026-01-26
  Saat: 18:00

🏨 Otel Bilgileri
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Otel: Radisson Hotel
Adres: Güzeloba, Havaalanı Cd. No:104 A
Giriş: 2026-01-08
Çıkış: 2026-01-30

🚗 Havalimanı Karşılama
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
İsim: Ali Naci
Telefon: +905437676764
Araç: White Toyota Prius, Plaka: 07 KL 937
Buluşma: Gate B
Not: Our staff will be waiting for you with a sign displaying your name.
```
