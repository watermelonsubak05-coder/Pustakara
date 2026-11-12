
import { useEffect, useState } from "react";
import {
  Settings,
  Library,
  UserRound,
  BookOpen,
  Wallet,
  Save,
  RotateCcw,
  LoaderCircle,
  CheckCircle2,
  AlertCircle,
  Upload,
  Image as ImageIcon,
  X,
} from "lucide-react";
import { supabase } from "../lib/supabase";

const STORAGE_BUCKET = "pustakara-assets";
const MAX_LOGO_SIZE = 10 * 1024 * 1024;

const defaultSettings = {
  library_name: "Perpustakaan Sekolah",
  school_name: "",
  address: "",
  logo_url: "",
  admin_name: "Administrator",
  admin_email: "",
  max_loan_days: 7,
  max_books_per_member: 2,
  max_renewals: 1,
  fine_per_day: 1000,
};

function Pengaturan() {
  const [settings, setSettings] = useState(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState("");

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    if (!logoFile) {
      setLogoPreview("");
      return;
    }

    const previewUrl = URL.createObjectURL(logoFile);
    setLogoPreview(previewUrl);

    return () => URL.revokeObjectURL(previewUrl);
  }, [logoFile]);

  const loadSettings = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("library_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      console.error("Gagal mengambil pengaturan:", error);
      setMessage("Gagal mengambil pengaturan: " + error.message);
      setMessageType("error");
    } else if (data) {
      setSettings({
        ...defaultSettings,
        ...data,
      });
    }

    setLoading(false);
  };

  const handleChange = (event) => {
    const { name, value } = event.target;

    setSettings((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const handleLogoChange = (event) => {
    const file = event.target.files?.[0];

    if (!file) return;

    const allowedTypes = [
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/svg+xml",
    ];

    if (!allowedTypes.includes(file.type)) {
      setMessage("Format logo harus PNG, JPG, WEBP, atau SVG.");
      setMessageType("error");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_LOGO_SIZE) {
      setMessage("Ukuran logo maksimal 10 MB.");
      setMessageType("error");
      event.target.value = "";
      return;
    }

    setLogoFile(file);
    setMessage("");
    setMessageType("");
  };

  const handleRemoveLogo = () => {
    setLogoFile(null);
    setSettings((previous) => ({
      ...previous,
      logo_url: "",
    }));
  };

  const uploadLogo = async () => {
    if (!logoFile) return settings.logo_url;

    const safeName = logoFile.name
      .toLowerCase()
      .replace(/[^a-z0-9.-]/g, "-");

    const filePath = `logos/logo-${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, logoFile, {
        cacheControl: "3600",
        upsert: false,
        contentType: logoFile.type,
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(filePath);

    return data.publicUrl;
  };

  const handleSave = async (event) => {
    event.preventDefault();

    setSaving(true);
    setMessage("");

    try {
      const uploadedLogoUrl = await uploadLogo();

      const payload = {
        library_name: settings.library_name,
        school_name: settings.school_name,
        address: settings.address,
        logo_url: uploadedLogoUrl || "",
        admin_name: settings.admin_name,
        admin_email: settings.admin_email,
        max_loan_days: Number(settings.max_loan_days),
        max_books_per_member: Number(settings.max_books_per_member),
        max_renewals: Number(settings.max_renewals),
        fine_per_day: Number(settings.fine_per_day),
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("library_settings")
        .upsert(
          {
            id: 1,
            ...payload,
          },
          { onConflict: "id" }
        );

      if (error) throw error;

      setSettings((previous) => ({
        ...previous,
        logo_url: uploadedLogoUrl || "",
      }));

      setLogoFile(null);
      setMessage("Pengaturan dan logo berhasil disimpan!");
      setMessageType("success");
    } catch (error) {
      console.error("Gagal menyimpan pengaturan:", error);
      setMessage("Gagal menyimpan: " + error.message);
      setMessageType("error");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setSettings(defaultSettings);
    setLogoFile(null);
    setMessage(
      "Pengaturan dikembalikan ke nilai awal. Klik Simpan untuk menerapkan."
    );
    setMessageType("success");
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(Number(value) || 0);
  };

  if (loading) {
    return (
      <div className="settings-loading">
        <LoaderCircle className="spin" size={28} />
        <p>Memuat pengaturan perpustakaan...</p>
      </div>
    );
  }

  const displayedLogo = logoPreview || settings.logo_url;

  return (
    <div className="settings-page">
      <div className="settings-intro">
        <div>
          <h2>Pengaturan Perpustakaan</h2>
          <p>
            Kelola identitas perpustakaan dan ketentuan layanan
            peminjaman buku.
          </p>
        </div>
        <div className="settings-intro-icon">
          <Settings size={25} />
        </div>
      </div>

      {message && (
        <div className={`settings-message ${messageType}`}>
          {messageType === "success" ? (
            <CheckCircle2 size={19} />
          ) : (
            <AlertCircle size={19} />
          )}
          <span>{message}</span>
        </div>
      )}

      <form onSubmit={handleSave}>
        <section className="settings-card">
          <div className="settings-card-heading">
            <div className="settings-section-icon blue">
              <Library size={21} />
            </div>
            <div>
              <h3>Identitas Perpustakaan</h3>
              <p>Informasi umum perpustakaan dan sekolah.</p>
            </div>
          </div>

          <div className="settings-fields">
            <div className="settings-field">
              <label>Nama Perpustakaan</label>
              <input
                name="library_name"
                value={settings.library_name || ""}
                onChange={handleChange}
                placeholder="Contoh: Pustakara"
                required
              />
            </div>

            <div className="settings-field">
              <label>Nama Sekolah</label>
              <input
                name="school_name"
                value={settings.school_name || ""}
                onChange={handleChange}
                placeholder="Masukkan nama sekolah"
              />
            </div>

            <div className="settings-field full">
              <label>Alamat Perpustakaan</label>
              <textarea
                name="address"
                value={settings.address || ""}
                onChange={handleChange}
                placeholder="Masukkan alamat lengkap perpustakaan"
                rows={3}
              />
            </div>

            <div className="settings-field full">
              <label>Logo Perpustakaan</label>

              <div className="logo-upload-area">
                <div className="logo-upload-preview">
                  {displayedLogo ? (
                    <img
                      src={displayedLogo}
                      alt="Pratinjau logo Pustakara"
                    />
                  ) : (
                    <div className="logo-empty">
                      <ImageIcon size={32} />
                      <span>Belum ada logo</span>
                    </div>
                  )}
                </div>

                <div className="logo-upload-info">
                  <strong>Unggah Logo Pustakara</strong>
                  <p>
                    Pilih gambar logo dari komputer untuk digunakan
                    sebagai identitas perpustakaan.
                  </p>

                  <label className="logo-upload-button">
                    <Upload size={17} />
                    {logoFile ? "Ganti File Logo" : "Pilih File Logo"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      onChange={handleLogoChange}
                      hidden
                    />
                  </label>

                  <small>
                    Format PNG, JPG, WEBP, atau SVG. Maksimal 10 MB.
                  </small>

                  {logoFile && (
                    <div className="logo-selected-file">
                      <span>
                        {logoFile.name} (
                        {(logoFile.size / (1024 * 1024)).toFixed(2)} MB)
                      </span>
                      <button
                        type="button"
                        onClick={handleRemoveLogo}
                        aria-label="Hapus pilihan logo"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  )}

                  {!logoFile && settings.logo_url && (
                    <small className="logo-current-status">
                      Logo tersimpan saat ini.
                    </small>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="settings-card">
          <div className="settings-card-heading">
            <div className="settings-section-icon purple">
              <UserRound size={21} />
            </div>
            <div>
              <h3>Profil Administrator</h3>
              <p>Informasi pengelola perpustakaan.</p>
            </div>
          </div>

          <div className="settings-fields">
            <div className="settings-field">
              <label>Nama Administrator</label>
              <input
                name="admin_name"
                value={settings.admin_name || ""}
                onChange={handleChange}
                placeholder="Nama administrator"
                required
              />
            </div>

            <div className="settings-field">
              <label>Email Administrator</label>
              <input
                type="email"
                name="admin_email"
                value={settings.admin_email || ""}
                onChange={handleChange}
                placeholder="admin@email.com"
              />
            </div>
          </div>
        </section>

        <section className="settings-card">
          <div className="settings-card-heading">
            <div className="settings-section-icon green">
              <BookOpen size={21} />
            </div>
            <div>
              <h3>Ketentuan Peminjaman</h3>
              <p>Atur batas peminjaman buku untuk setiap anggota.</p>
            </div>
          </div>

          <div className="settings-fields">
            <div className="settings-field">
              <label>Lama Peminjaman (Hari)</label>
              <input
                type="number"
                min="1"
                name="max_loan_days"
                value={settings.max_loan_days}
                onChange={handleChange}
                required
              />
              <small>Jumlah hari maksimal peminjaman buku.</small>
            </div>

            <div className="settings-field">
              <label>Maksimal Buku Dipinjam</label>
              <input
                type="number"
                min="1"
                name="max_books_per_member"
                value={settings.max_books_per_member}
                onChange={handleChange}
                required
              />
              <small>Batas jumlah buku untuk setiap anggota.</small>
            </div>

            <div className="settings-field">
              <label>Maksimal Perpanjangan</label>
              <input
                type="number"
                min="0"
                name="max_renewals"
                value={settings.max_renewals}
                onChange={handleChange}
                required
              />
              <small>
                Berapa kali anggota boleh memperpanjang pinjaman.
              </small>
            </div>
          </div>
        </section>

        <section className="settings-card">
          <div className="settings-card-heading">
            <div className="settings-section-icon orange">
              <Wallet size={21} />
            </div>
            <div>
              <h3>Pengaturan Denda</h3>
              <p>Atur biaya keterlambatan pengembalian buku.</p>
            </div>
          </div>

          <div className="settings-fields">
            <div className="settings-field">
              <label>Denda per Hari (Rupiah)</label>
              <input
                type="number"
                min="0"
                name="fine_per_day"
                value={settings.fine_per_day}
                onChange={handleChange}
                required
              />
              <small>
                Contoh: 1000 berarti Rp1.000 untuk setiap hari terlambat.
              </small>
            </div>

            <div className="fine-preview">
              <span>Pratinjau denda per hari</span>
              <strong>
                {formatCurrency(settings.fine_per_day)}
              </strong>
            </div>
          </div>
        </section>

        <div className="settings-actions">
          <button
            type="button"
            className="settings-reset-button"
            onClick={handleReset}
          >
            <RotateCcw size={17} />
            Kembalikan Nilai Awal
          </button>

          <button
            type="submit"
            className="settings-save-button"
            disabled={saving}
          >
            {saving ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <Save size={18} />
            )}
            {saving ? "Menyimpan..." : "Simpan Pengaturan"}
          </button>
        </div>
      </form>

      <style>{`
        .settings-page {
          padding: 26px 30px;
          max-width: 1100px;
          margin: 0 auto;
          color: #25334a;
        }

        .settings-intro {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }

        .settings-intro h2 {
          margin: 0 0 7px;
          font-size: 21px;
        }

        .settings-intro p,
        .settings-card-heading p {
          margin: 0;
          color: #8390a5;
          font-size: 13px;
        }

        .settings-intro-icon {
          background: #eaf0ff;
          color: #4778e8;
          padding: 13px;
          border-radius: 13px;
        }

        .settings-card {
          background: white;
          border: 1px solid #e9edf4;
          border-radius: 13px;
          padding: 23px;
          margin-bottom: 18px;
        }

        .settings-card-heading {
          display: flex;
          align-items: center;
          gap: 13px;
          margin-bottom: 24px;
        }

        .settings-card-heading h3 {
          margin: 0 0 5px;
          font-size: 16px;
        }

        .settings-section-icon {
          width: 43px;
          height: 43px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 11px;
        }

        .settings-section-icon.blue {
          background: #eaf0ff;
          color: #4778e8;
        }

        .settings-section-icon.purple {
          background: #f1eaff;
          color: #9062d9;
        }

        .settings-section-icon.green {
          background: #e5f7ef;
          color: #239a6a;
        }

        .settings-section-icon.orange {
          background: #fff1df;
          color: #d78b32;
        }

        .settings-fields {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 20px;
        }

        .settings-field {
          display: flex;
          flex-direction: column;
          gap: 8px;
          min-width: 0;
        }

        .settings-field.full {
          grid-column: 1 / -1;
        }

        .settings-field label {
          font-size: 13px;
          font-weight: 600;
          color: #35445a;
        }

        .settings-field input,
        .settings-field textarea {
          width: 100%;
          box-sizing: border-box;
          padding: 11px 13px;
          border: 1px solid #dfe5ee;
          border-radius: 8px;
          font-family: inherit;
          font-size: 13px;
          color: #344258;
          outline: none;
          background: white;
        }

        .settings-field input:focus,
        .settings-field textarea:focus {
          border-color: #4778e8;
          box-shadow: 0 0 0 3px rgba(71,120,232,.1);
        }

        .settings-field textarea {
          resize: vertical;
        }

        .settings-field small {
          color: #929caf;
          font-size: 11px;
        }

        .logo-upload-area {
          display: flex;
          align-items: center;
          gap: 22px;
          padding: 20px;
          border: 1px dashed #cbd8d9;
          border-radius: 12px;
          background: #f8fbfa;
        }

        .logo-upload-preview {
          width: 112px;
          height: 112px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: white;
          border: 1px solid #e3eae8;
          border-radius: 12px;
          padding: 10px;
        }

        .logo-upload-preview img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        .logo-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          color: #9aa9a6;
          font-size: 11px;
          text-align: center;
        }

        .logo-upload-info {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 9px;
          min-width: 0;
        }

        .logo-upload-info strong {
          color: #35445a;
          font-size: 14px;
        }

        .logo-upload-info p {
          margin: 0;
          color: #8390a5;
          font-size: 12px;
          line-height: 1.6;
        }

        .logo-upload-button {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 15px;
          background: #245B70;
          color: white !important;
          border-radius: 8px;
          font-size: 12px !important;
          font-weight: 600;
          cursor: pointer;
          transition: background .2s;
        }

        .logo-upload-button:hover {
          background: #19485A;
        }

        .logo-selected-file {
          display: flex;
          align-items: center;
          gap: 10px;
          max-width: 100%;
          padding: 7px 10px;
          background: #edf5f1;
          border-radius: 7px;
          color: #477568;
          font-size: 11px;
        }

        .logo-selected-file span {
          overflow-wrap: anywhere;
        }

        .logo-selected-file button {
          display: flex;
          border: none;
          background: transparent;
          color: #b54b4b;
          cursor: pointer;
        }

        .logo-current-status {
          color: #32805e !important;
        }

        .fine-preview {
          background: #fff8ed;
          border: 1px solid #f5e5ca;
          border-radius: 10px;
          padding: 15px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 8px;
        }

        .fine-preview span {
          font-size: 12px;
          color: #987342;
        }

        .fine-preview strong {
          font-size: 21px;
          color: #b97920;
        }

        .settings-actions {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          margin: 24px 0;
        }

        .settings-reset-button,
        .settings-save-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
          padding: 12px 18px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }

        .settings-reset-button {
          background: white;
          border: 1px solid #dfe5ee;
          color: #66748a;
        }

        .settings-save-button {
          background: #245B70;
          color: white;
          border: none;
        }

        .settings-save-button:disabled {
          opacity: .6;
          cursor: not-allowed;
        }

        .settings-message {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 13px 15px;
          border-radius: 9px;
          margin-bottom: 18px;
          font-size: 13px;
        }

        .settings-message.success {
          background: #e9f8ef;
          color: #218653;
        }

        .settings-message.error {
          background: #fff0f0;
          color: #d34242;
        }

        .settings-loading {
          min-height: 300px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          gap: 12px;
          color: #718096;
        }

        .spin {
          animation: settings-spin 1s linear infinite;
        }

        @keyframes settings-spin {
          to { transform: rotate(360deg); }
        }

        @media (max-width: 650px) {
          .settings-page {
            padding: 18px 14px;
          }

          .settings-fields {
            grid-template-columns: 1fr;
          }

          .settings-field.full {
            grid-column: auto;
          }

          .settings-actions {
            flex-direction: column-reverse;
          }

          .settings-reset-button,
          .settings-save-button {
            width: 100%;
          }

          .logo-upload-area {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      `}</style>
    </div>
  );
}

export default Pengaturan;
