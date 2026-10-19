# 🚀 **FiveM Ekip Yönetim Botu Aktif!**

Ekip içi düzeni sağlamak, aktifliği takip etmek ve yönetim süreçlerini çok daha hızlı yürütmek amacıyla geliştirdiğimiz **Ekip Yönetim Botu** kurulumu tamamlanarak aktif edilmiştir! 

Bot üzerinde kullanabileceğiniz tüm komutların ve yönetim kanallarının detayları aşağıda yer almaktadır. Tüm komutlar **Slash (`/`)** yapısını desteklemektedir.

---

### ⚙️ **YÖNETİM & İŞLEM KANALLARI**
*Botun yönetimsel süreçlerinin yürütüldüğü ve başvuruların düştüğü özel kanallar:*

*   **Yönetim Paneli:** Bot üzerindeki tüm detaylı ayarların yönetildiği web arayüzüdür.
*   **Ticket & Başvuru Alanı:** Ekip başvuruları ve destek talepleri belirlenen kategoride üyeye özel kanallar olarak açılır.
*   **Farm İstek Kanalı:** Üyelerin farm teslimat ve istek taleplerini ilettiği kanaldır.
*   **Farm Yönetim Kanalı:** Yetkililerin gelen farm taleplerini onaylayıp/reddettiği yönetim merkezidir.
*   **Ban Affı Yönetim Kanalı:** Ban affı başvurularının yetkililerce incelendiği kanaldır.
*   **YouTube Yönetim Kanalı:** Ekip üyelerinin YouTube içerik durumlarının ve başvurularının yönetildiği kanaldır.

---

### 🛡️ **YÖNETİM & MODERASYON KOMUTLARI**
*   `**/ban <üye> <sebep>**` ➔ Belirtilen üyeyi sunucudan yasaklar.
*   `**/unban <kullanıcı_id> <sebep>**` ➔ Yasaklanan bir kullanıcının banını kaldırır.
*   `**/forceban <discordid> <sebep>**` ➔ Sunucuda olmayan bir kullanıcıyı ID'si ile kalıcı olarak yasaklar.
*   `**/uyari <uye> <sebep>**` ➔ Üyeyi uyarır. *(3. uyarıya ulaşan üye otomatik olarak yasaklanır!)*
*   `**/sil <miktar>**` ➔ Belirtilen kanaldaki mesajları temizler.
*   `**/kanal <islem: kilitle/aç> <hedef-kanal>**` ➔ Belirtilen kanalı kilitler veya kilidini açar.
*   `**/perm <kisi/rol> <yetki>**` ➔ Belirtilen üye veya role yetki tanımlaması yapar.
*   `**/topluperm-çek <kriter>**` ➔ Kriterlere uygun olan kullanıcılardan toplu yetki/perm geri çekme işlemi yapar.
*   `**/oto-rol <rol>**` ➔ Sunucuya yeni katılan üyelere otomatik verilecek rolü belirler.

---

### 📊 **EKİP & AKTİFLİK YÖNETİMİ KOMUTLARI**
*   `**/ekipsistem**` ➔ Ekip yönetim sistemi kurulum ve güncelleme kontrol panelini açar.
*   `**/ekipyonetim-panel**` ➔ Yönetim paneline giriş yapabilmek için tek kullanımlık ve süreli bir giriş bağlantısı oluşturur.
*   `**/aktiflik <rol>**` ➔ Belirtilen rol için aktiflik kontrolü başlatır.
*   `**/ekipickontrol**` ➔ Ekip içi aktiflik kontrol ayarlarını ve sürelerini düzenler.
*   `**/inaktif <tür>**` / `**/inaktif-göster**` ➔ Son 1 hafta içerisinde ses, mesaj veya etkinlikte aktif olmamış üyeleri detaylı listeler.
*   `**/ses-top**` ➔ Ses kanallarındaki aktiflik sıralamasını **görsel grafik** olarak gösterir.
*   `**/kullanıcıbilgi <uye>**` ➔ Üyenin sunucu genelindeki ses/aktiflik istatistiklerini ve detaylı bilgilerini gösterir.
*   `**/bio-guild**` ➔ Ekip üyelerinin Discord durumlarında (bio) veya oynuyor bilgisinde (guild) ekip etiketi taşıyıp taşımadığını kontrol eder.

---

### 🚜 **FARM SİSTEMİ KOMUTLARI**
*   `**/farm-panel**` ➔ Farm teslimatlarını kolayca bildirebilmeniz için butonlu teslim paneli oluşturur.
*   `**/farm <uye>**` ➔ Bir üyenin toplamda ne kadar farm teslim ettiğini gösterir.
*   `**/farm-top**` ➔ Top 10 farm yapan üyeleri canvas tasarımı ile sıralı olarak gösterir.
*   `**/farmekle <uye> <miktar>**` ➔ Belirtilen üyeye farm teslimatı ekler.
*   `**/farmcikar <uye> <miktar>**` ➔ Belirtilen üyenin farm miktarını düşürür.

---

### 🎫 **DESTEK & BAŞVURU (TICKET) KOMUTLARI**
*   `**/ticket-panel**` ➔ Destek/Başvuru açma butonlarının yer aldığı paneli kanala gönderir.
*   `**/ticket-ekle <kullanici>**` ➔ Açık olan bir ticket kanalına yeni bir kullanıcı dahil eder.
*   `**/ticket-çıkar <kullanici>**` ➔ Ticket kanalından belirtilen kullanıcıyı çıkartır.
*   `**/basvuru-durum**` ➔ Ekip başvuru sisteminin durumunu açar veya geçici olarak kapatır.
*   `**/butunticketlerikapat**` ➔ Sunucudaki açık olan tüm destek ve başvuru kanallarını toplu olarak kapatıp arşivler.

---

### 🎤 **SES KANALI YÖNETİMİ KOMUTLARI**
*   `**/ses-yönet topla <hedef>**` ➔ Sunucudaki veya son etkinlikteki üyeleri kendi bulunduğunuz ses kanalına topluca çeker.
*   `**/ses-yönet taşı <kaynak> <hedef>**` ➔ Belirli bir kanaldaki tüm üyeleri başka bir ses kanalına topluca aktarır.
*   `**/ses-yönet mute [kanal] [muaf]**` ➔ Bulunduğunuz (veya seçilen) ses kanalındaki herkesi susturur veya susturmasını kaldırır *(Yetkili ve muaf olanlar hariç).*
*   `**/botses gir <kanal>**` ➔ Botu belirlediğiniz ses kanalına sokar ve sürekli aktif/korumalı kalmasını sağlar.
*   `**/botses çık**` ➔ Botun bulunduğu ses kanalından ayrılmasını sağlar.
*   `**/botses durum**` ➔ Botun ses kanalı bağlantısını ve otomatik koruma durumunu raporlar.

---

### 🎉 **ETKİNLİK & ÇEKİLİŞ KOMUTLARI**
*   `**/etkinlik <detaylar>**` ➔ Yeni bir etkinlik duyurusu yayınlar.
*   `**/etkinlik-top**` ➔ En çok etkinliğe katılan üyeleri **görsel grafik sıralamasıyla** listeler.
*   `**/çekiliş-başlat**` ➔ Yeni bir çekiliş başlatır.
*   `**/çekiliş-bitir <mesaj_id>**` ➔ Devam eden çekilişi erken sonlandırır.
*   `**/çekiliş-yenidençek <mesaj_id>**` ➔ Tamamlanmış bir çekiliş için yeniden talihli belirler.

---

### ⚙️ **DİĞER SİSTEM KOMUTLARI**
*   `**/youtube-sistem**` ➔ YouTube kanalı takip sistemi panelini oluşturur.
*   `**/banaf-panel**` / `**/panelsizbanaf-sistemi**` ➔ Ban affı talebi oluşturma sistemini yönetir.
*   `**/kill**` ➔ Yeni bir kill pov paylaşım/kayıt kanalı oluşturur.
*   `**/dosya <no/id>**` ➔ Dosya numarası veya Discord ID'sine göre veri analizi gösterir.
*   `**/data-sıfırla**` ➔ Bot üzerindeki belirli veya tüm verileri temizler.

---

🔗 **Yönetici Arayüzü & Web Panel:** Panel adresiniz (Örn: `http://localhost:3000`)
> 💡 **Not:** Komutların kullanımı sırasında yardıma ihtiyacınız olursa yönetim ekibimizle iletişime geçebilirsiniz. Herkese keyifli kullanımlar dileriz!
