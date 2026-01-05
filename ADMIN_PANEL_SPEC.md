# Cliniflow Admin Web — Görünmesi Gerekenler (MVP)

## 1) Hasta Listesi (Ana ekran)
Her satırda:
- PatientId (id)
- Ad Soyad (varsa)
- Telefon / WhatsApp (varsa)
- Status/Role: PENDING / APPROVED
- Kayıt tarihi
- Son aktivite (updatedAt)
- Token sayısı (kaç token var)

Aksiyonlar:
- Approve (PENDING → APPROVED)
- Copy Patient Link / Deep Link (varsa)
- Open Travel
- Open Treatments
- Refresh

## 2) Travel ekranında
- Hotel: name + check-in/out (varsa)
- Flights: gidiş/dönüş ayrı, tarih-saat, uçuş no, nereden-nereye
- Notes
- Save + “Last saved” timestamp

## 3) Treatments ekranında
- FDI diş grid’i (11–18 / 21–28 / 31–38 / 41–48)
- Seçili diş highlight
- Diş başına işlem sayısı badge
- İşlemler listesi (type, status, date)
- Add procedure (dropdown)
- Save (PUT) + “Last saved” timestamp

## 4) Kurallar
- Admin panel sadece admin token ile açılır
- Endpoint’ler değişmeyecek: geriye dönük uyumluluk korunacak
- UI tek dosya/az dosya: mümkünse tek html (admin.html) + tek js
- Her aksiyon sonrası JSON parse hatası olmayacak (hata durumunda ekranda göster)
