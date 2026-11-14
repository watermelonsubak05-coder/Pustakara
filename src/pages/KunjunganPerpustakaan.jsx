
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Users,
  CalendarDays,
  Clock,
  ClipboardCheck,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Download,
  ScanLine,
  Camera,
  X,
} from "lucide-react";
import {
  Html5QrcodeScanner,
  Html5QrcodeSupportedFormats,
} from "html5-qrcode";
import JsBarcode from "jsbarcode";
import { supabase } from "../lib/supabase";

const getLocalDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getLocalTime = () => {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
};

const formatDate = (date) => {
  if (!date) return "-";

  return new Date(`${date}T00:00:00`).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};

const formatTime = (time) => {
  if (!time) return "-";
  return String(time).slice(0, 5);
};

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);

export default function KunjunganPerpustakaan({ userRole }) {
  const canManage = [
    "tim_pengembang",
    "pustakawan",
  ].includes(userRole);

  const [members, setMembers] = useState([]);
  const [visits, setVisits] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedMember, setSelectedMember] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [scanning, setScanning] = useState(false);

  const scannerRef = useRef(null);
  const processingScanRef = useRef(false);
  const membersRef = useRef([]);
  const visitedIdsRef = useRef(new Set());

  const today = getLocalDate();

  const loadData = async () => {
    setRefreshing(true);

    try {
      const [membersResult, visitsResult] = await Promise.all([
        supabase
          .from("members")
          .select(
            "id, member_number, full_name, member_type, class_name, status"
          )
          .eq("member_type", "siswa")
          .eq("status", "aktif")
          .order("full_name"),

        supabase
          .from("library_visits")
          .select("id, member_id, visit_date, visit_time, created_at")
          .eq("visit_date", getLocalDate())
          .order("visit_time", { ascending: false }),
      ]);

      if (membersResult.error) throw membersResult.error;
      if (visitsResult.error) throw visitsResult.error;

      setMembers(membersResult.data || []);
      setVisits(visitsResult.data || []);
    } catch (error) {
      console.error("Gagal memuat kunjungan:", error);
      setMessage({
        type: "error",
        text: error.message || "Gagal memuat data kunjungan.",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const visitedMemberIds = useMemo(
    () => new Set(visits.map((visit) => visit.member_id)),
    [visits]
  );

  membersRef.current = members;
  visitedIdsRef.current = visitedMemberIds;

  // Mengaktifkan dan mengelola kamera pemindai barcode
  useEffect(() => {
    if (!scanning || !canManage) return;

    let active = true;

    processingScanRef.current = false;

    const scanner = new Html5QrcodeScanner(
      "barcode-reader",
      {
        fps: 10,
        qrbox: {
          width: 280,
          height: 120,
        },
        aspectRatio: 1.5,
        rememberLastUsedCamera: true,
        showTorchButtonIfSupported: true,
        formatsToSupport: [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.ITF,
        ],
      },
      false
    );

    scannerRef.current = scanner;

    const stopScanner = async () => {
      if (scannerRef.current !== scanner) return;

      scannerRef.current = null;

      try {
        await scanner.clear();
      } catch (error) {
        console.warn("Kamera sudah dihentikan:", error);
      }
    };

    const onScanSuccess = async (decodedText) => {
      if (!active || processingScanRef.current) return;

      processingScanRef.current = true;

      await stopScanner();

      if (!active) return;

      setScanning(false);

      const scannedNumber = String(decodedText).trim();

      const member = membersRef.current.find(
        (item) =>
          String(item.member_number).trim() === scannedNumber
      );

      if (!member) {
        setMessage({
          type: "error",
          text: `Nomor anggota ${scannedNumber} tidak ditemukan. Pastikan barcode berasal dari kartu anggota PUSTAKARA.`,
        });
        return;
      }

      if (visitedIdsRef.current.has(member.id)) {
        setMessage({
          type: "error",
          text: `${member.full_name} sudah melakukan presensi hari ini.`,
        });
        return;
      }

      setSaving(true);
      setMessage(null);

      try {
        const { error } = await supabase
          .from("library_visits")
          .insert({
            member_id: member.id,
            visit_date: getLocalDate(),
            visit_time: getLocalTime(),
          });

        if (error) {
          if (error.code === "23505") {
            throw new Error(
              `${member.full_name} sudah melakukan presensi hari ini.`
            );
          }

          throw error;
        }

        setSelectedMember(null);
        setSearch("");

        setMessage({
          type: "success",
          text: `Presensi berhasil! ${member.full_name} · Kelas ${member.class_name}.`,
        });

        await loadData();
      } catch (error) {
        console.error("Gagal mencatat presensi barcode:", error);

        setMessage({
          type: "error",
          text: error.message || "Gagal mencatat presensi barcode.",
        });
      } finally {
        setSaving(false);
      }
    };

    const onScanFailure = () => {
      // Pemindaian belum berhasil. Kamera tetap aktif.
    };

    try {
      scanner.render(onScanSuccess, onScanFailure);
    } catch (error) {
      console.error("Gagal mengaktifkan scanner:", error);
      setMessage({
        type: "error",
        text: "Kamera tidak dapat diaktifkan. Periksa izin kamera browser.",
      });
      setScanning(false);
    }

    return () => {
      active = false;

      if (scannerRef.current === scanner) {
        scannerRef.current = null;

        scanner.clear().catch((error) => {
          console.warn("Gagal membersihkan scanner:", error);
        });
      }
    };
  }, [scanning, canManage]);

  const filteredMembers = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) return [];

    return members
      .filter((member) => {
        const name = member.full_name?.toLowerCase() || "";
        const number = member.member_number?.toLowerCase() || "";

        return name.includes(keyword) || number.includes(keyword);
      })
      .slice(0, 8);
  }, [members, search]);

  const handleSelectMember = (member) => {
    setSelectedMember(member);
    setSearch(member.full_name);
    setMessage(null);
  };

  // Membuat barcode dan membuka halaman cetak kartu
  const handleDownloadBarcode = (singleMember = null) => {
    const selectedMembers = singleMember ? [singleMember] : members;

    const validMembers = selectedMembers.filter(
      (member) => member.member_number
    );

    if (validMembers.length === 0) {
      alert("Tidak ada nomor anggota yang dapat dibuatkan barcode.");
      return;
    }

    const printWindow = window.open("", "_blank");

    if (!printWindow) {
      alert("Izinkan pop-up pada browser untuk mencetak barcode.");
      return;
    }

    try {
      const cards = validMembers.map((member) => {
        const canvas = document.createElement("canvas");

        JsBarcode(canvas, String(member.member_number), {
          format: "CODE128",
          width: 2,
          height: 65,
          displayValue: true,
          fontSize: 14,
          margin: 5,
          background: "#FFFFFF",
          lineColor: "#183F48",
        });

        return `
          <div class="card">
            <div class="brand">PUSTAKARA</div>
            <div class="subtitle">KARTU ANGGOTA PERPUSTAKAAN</div>
            <div class="student-name">${escapeHtml(member.full_name)}</div>
            <div class="student-info">
              Nomor Anggota: ${escapeHtml(member.member_number)}
            </div>
            <div class="student-info">
              Kelas: ${escapeHtml(member.class_name || "-")}
            </div>
            <img
              class="barcode"
              src="${canvas.toDataURL("image/png")}"
              alt="Barcode ${escapeHtml(member.member_number)}"
            />
            <div class="footer">Kartu Anggota Perpustakaan Sekolah</div>
          </div>
        `;
      }).join("");

      printWindow.document.write(`
        <!DOCTYPE html>
        <html lang="id">
        <head>
          <meta charset="UTF-8" />
          <title>Kartu Barcode PUSTAKARA</title>
          <style>
            @page {
              size: A4;
              margin: 12mm;
            }

            * {
              box-sizing: border-box;
            }

            body {
              margin: 0;
              font-family: Arial, sans-serif;
              color: #245B70;
            }

            .container {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 12px;
            }

            .card {
              border: 1.5px solid #9ABCB8;
              border-radius: 10px;
              padding: 14px;
              text-align: center;
              break-inside: avoid;
              min-height: 190px;
            }

            .brand {
              font-size: 18px;
              font-weight: 800;
              letter-spacing: 2px;
              color: #245B70;
            }

            .subtitle {
              font-size: 9px;
              margin: 4px 0 12px;
              letter-spacing: 1px;
              color: #64847F;
            }

            .student-name {
              font-size: 14px;
              font-weight: bold;
              margin-bottom: 5px;
              color: #245B70;
            }

            .student-info {
              font-size: 10px;
              margin: 3px 0;
              color: #536D6A;
            }

            .barcode {
              display: block;
              max-width: 100%;
              width: 220px;
              height: auto;
              margin: 8px auto 4px;
            }

            .footer {
              font-size: 8px;
              color: #829A94;
              margin-top: 5px;
            }

            @media print {
              body {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
            }
          </style>
        </head>
        <body>
          <div class="container">${cards}</div>
          <script>
            window.onload = function () {
              setTimeout(function () {
                window.print();
              }, 500);
            };
          </script>
        </body>
        </html>
      `);

      printWindow.document.close();
    } catch (error) {
      printWindow.close();
      console.error("Gagal membuat barcode:", error);
      alert("Gagal membuat barcode. Periksa nomor anggota siswa.");
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage(null);

    if (!canManage) {
      setMessage({
        type: "error",
        text: "Akun ini hanya memiliki akses melihat data kunjungan.",
      });
      return;
    }

    if (!selectedMember) {
      setMessage({
        type: "error",
        text: "Silakan pilih anggota terlebih dahulu.",
      });
      return;
    }

    if (visitedMemberIds.has(selectedMember.id)) {
      setMessage({
        type: "error",
        text: `${selectedMember.full_name} sudah melakukan presensi hari ini.`,
      });
      return;
    }

    setSaving(true);

    try {
      const { error } = await supabase
        .from("library_visits")
        .insert({
          member_id: selectedMember.id,
          visit_date: getLocalDate(),
          visit_time: getLocalTime(),
        });

      if (error) {
        if (error.code === "23505") {
          throw new Error(
            `${selectedMember.full_name} sudah melakukan presensi hari ini.`
          );
        }

        throw error;
      }

      setMessage({
        type: "success",
        text: `Presensi ${selectedMember.full_name} berhasil dicatat.`,
      });

      setSelectedMember(null);
      setSearch("");

      await loadData();
    } catch (error) {
      console.error("Gagal mencatat kunjungan:", error);

      setMessage({
        type: "error",
        text: error.message || "Gagal menyimpan presensi.",
      });
    } finally {
      setSaving(false);
    }
  };

  const memberById = useMemo(
    () => new Map(members.map((member) => [member.id, member])),
    [members]
  );

  const todayVisits = visits
    .map((visit) => ({
      ...visit,
      member: memberById.get(visit.member_id),
    }))
    .sort((a, b) =>
      (b.visit_time || "").localeCompare(a.visit_time || "")
    );

  return (
    <section className="content">
      <style>{`
        .visit-search-input {
          color: #245B70 !important;
          background: transparent !important;
          -webkit-text-fill-color: #245B70;
        }

        .visit-search-input::placeholder {
          color: #91A8A2 !important;
          opacity: 1;
          -webkit-text-fill-color: #91A8A2;
        }

        .visit-search-input:focus {
          outline: none !important;
          box-shadow: none !important;
        }

        #barcode-reader {
          width: 100%;
          border: none !important;
        }

        #barcode-reader video {
          border-radius: 10px;
          object-fit: cover;
        }

        #barcode-reader__scan_region {
          min-height: 220px;
        }

        #barcode-reader__dashboard_section_csr button,
        #barcode-reader__dashboard_section_swaplink {
          color: #245B70 !important;
        }

        #barcode-reader__header_message {
          color: #64746D;
        }
      `}</style>

      <div className="welcome">
        <div>
          <p className="greeting">LAYANAN PERPUSTAKAAN</p>
          <h1>Kunjungan Perpustakaan</h1>
          <p>Catat dan pantau kunjungan siswa ke perpustakaan.</p>
        </div>

        <div style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}>
          {canManage && (
            <button
              type="button"
              className="primary-button"
              onClick={() => handleDownloadBarcode()}
              disabled={members.length === 0}
              style={{
                background: "#E8F2EF",
                color: "#245B70",
                border: "1px solid #C9DDD5",
              }}
            >
              <Download size={17} />
              Unduh Semua Barcode
            </button>
          )}

          <button
            type="button"
            className="primary-button"
            onClick={loadData}
            disabled={refreshing}
          >
            <RefreshCw size={17} />
            {refreshing ? "Memuat..." : "Muat Ulang"}
          </button>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-top">
            <span>Kunjungan Hari Ini</span>
            <div className="stat-icon blue">
              <Users size={21} />
            </div>
          </div>
          <h2>{visits.length}</h2>
          <p>Jumlah siswa yang berkunjung</p>
        </div>

        <div className="stat-card">
          <div className="stat-top">
            <span>Anggota Aktif</span>
            <div className="stat-icon purple">
              <ClipboardCheck size={21} />
            </div>
          </div>
          <h2>{members.length}</h2>
          <p>Anggota siswa berstatus aktif</p>
        </div>
      </div>

      {canManage && (
        <section className="panel" style={{ padding: 24, marginBottom: 22 }}>
          <div className="panel-heading">
            <div>
              <h3>Presensi Manual</h3>
              <p>
                Cari nama atau nomor anggota untuk mencatat kunjungan.
              </p>
            </div>
            <ClipboardCheck size={24} color="#245B70" />
          </div>

          {/* Bagian pemindai barcode */}
          <div style={{
            padding: 16,
            borderRadius: 10,
            background: "#F1F7F5",
            border: "1px solid #DCEAE3",
            marginBottom: 22,
          }}>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}>
              <div>
                <h3 style={{
                  margin: "0 0 5px",
                  color: "#245B70",
                  fontSize: 16,
                }}>
                  Presensi dengan Barcode
                </h3>
                <p style={{
                  margin: 0,
                  color: "#64746D",
                  fontSize: 13,
                }}>
                  Arahkan kamera ke barcode kartu anggota siswa.
                </p>
              </div>

              {!scanning ? (
                <button
                  type="button"
                  onClick={() => {
                    setMessage(null);
                    setScanning(true);
                  }}
                  disabled={saving || loading}
                  className="primary-button"
                  style={{
                    background: "#245B70",
                    opacity: saving || loading ? 0.6 : 1,
                  }}
                >
                  <ScanLine size={17} />
                  Mulai Scan
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setScanning(false)}
                  className="primary-button"
                  style={{
                    background: "#FCE8E6",
                    color: "#B42318",
                    border: "1px solid #F3C5C0",
                  }}
                >
                  <X size={17} />
                  Tutup Kamera
                </button>
              )}
            </div>

            {scanning && (
              <div style={{
                marginTop: 16,
                padding: 12,
                background: "#FFFFFF",
                border: "1px solid #DCEAE3",
                borderRadius: 10,
              }}>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 10,
                  color: "#245B70",
                  fontSize: 13,
                  fontWeight: 600,
                }}>
                  <Camera size={17} />
                  Kamera aktif — arahkan barcode ke area pemindaian
                </div>

                <div id="barcode-reader" />

                <p style={{
                  margin: "10px 0 0",
                  color: "#829A94",
                  fontSize: 12,
                }}>
                  Pastikan barcode terlihat jelas dan mendapat pencahayaan
                  yang cukup.
                </p>
              </div>
            )}
          </div>

          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 18,
          }}>
            <div style={{
              height: 1,
              flex: 1,
              background: "#E5ECE8",
            }} />
            <span style={{
              color: "#829A94",
              fontSize: 12,
              fontWeight: 600,
            }}>
              ATAU PRESENSI MANUAL
            </span>
            <div style={{
              height: 1,
              flex: 1,
              background: "#E5ECE8",
            }} />
          </div>

          <form onSubmit={handleSubmit}>
            <label style={{
              display: "block",
              fontWeight: 700,
              marginBottom: 8,
              color: "#344D50",
            }}>
              Cari Anggota
            </label>

            <div style={{ position: "relative" }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                border: "1px solid #C9DDD5",
                borderRadius: 9,
                padding: "0 13px",
                minHeight: 48,
                background: "#F7FBF9",
              }}>
                <Search size={18} color="#648F83" />

                <input
                  className="visit-search-input"
                  type="text"
                  value={search}
                  placeholder="Masukkan nama atau nomor anggota..."
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setSelectedMember(null);
                    setMessage(null);
                  }}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    border: "none",
                    outline: "none",
                    fontSize: 14,
                    color: "#245B70",
                    background: "transparent",
                  }}
                />
              </div>

              {filteredMembers.length > 0 && !selectedMember && (
                <div style={{
                  position: "absolute",
                  top: "calc(100% + 5px)",
                  left: 0,
                  right: 0,
                  zIndex: 5,
                  background: "#FFFFFF",
                  border: "1px solid #C9DDD5",
                  borderRadius: 9,
                  boxShadow: "0 8px 24px rgba(36,91,112,0.10)",
                  maxHeight: 260,
                  overflowY: "auto",
                }}>
                  {filteredMembers.map((member) => {
                    const alreadyVisited = visitedMemberIds.has(member.id);

                    return (
                      <button
                        type="button"
                        key={member.id}
                        disabled={alreadyVisited}
                        onClick={() => handleSelectMember(member)}
                        style={{
                          display: "block",
                          width: "100%",
                          padding: 13,
                          border: "none",
                          borderBottom: "1px solid #EEF4F1",
                          background: alreadyVisited ? "#F3F6F4" : "#FFFFFF",
                          textAlign: "left",
                          cursor: alreadyVisited ? "not-allowed" : "pointer",
                          opacity: alreadyVisited ? 0.6 : 1,
                        }}
                      >
                        <strong style={{
                          display: "block",
                          color: "#245B70",
                        }}>
                          {member.full_name}
                        </strong>
                        <span style={{
                          fontSize: 12,
                          color: "#829A94",
                        }}>
                          {member.member_number} · Kelas {member.class_name}
                          {alreadyVisited ? " · Sudah presensi" : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {search.trim() && !selectedMember && filteredMembers.length === 0 && (
              <p style={{
                color: "#829A94",
                fontSize: 13,
                marginTop: 9,
              }}>
                Anggota tidak ditemukan. Pastikan nama atau nomor anggota benar.
              </p>
            )}

            {selectedMember && (
              <div style={{
                marginTop: 14,
                padding: 15,
                borderRadius: 10,
                background: "#F1F7F5",
                border: "1px solid #DCEAE3",
              }}>
                <strong style={{ color: "#245B70" }}>
                  Anggota terpilih
                </strong>

                <p style={{
                  margin: "7px 0 3px",
                  fontWeight: 700,
                  color: "#245B70",
                }}>
                  {selectedMember.full_name}
                </p>

                <span style={{
                  fontSize: 13,
                  color: "#64746D",
                }}>
                  {selectedMember.member_number} · Kelas {selectedMember.class_name}
                </span>

                <div>
                  <button
                    type="button"
                    onClick={() => handleDownloadBarcode(selectedMember)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 7,
                      marginTop: 12,
                      padding: "8px 12px",
                      borderRadius: 7,
                      border: "1px solid #C9DDD5",
                      background: "#FFFFFF",
                      color: "#245B70",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    <Download size={15} />
                    Unduh Barcode Siswa Ini
                  </button>
                </div>
              </div>
            )}

            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              flexWrap: "wrap",
              marginTop: 16,
              color: "#64746D",
              fontSize: 13,
            }}>
              <span>
                <CalendarDays size={15} style={{ verticalAlign: "middle" }} />{" "}
                {formatDate(today)}
              </span>
              <span>
                <Clock size={15} style={{ verticalAlign: "middle" }} />{" "}
                Jam otomatis saat disimpan
              </span>
            </div>

            {message && (
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginTop: 15,
                padding: 12,
                borderRadius: 8,
                background: message.type === "success" ? "#ECFDF3" : "#FEF2F2",
                color: message.type === "success" ? "#167A45" : "#B42318",
                fontSize: 13,
              }}>
                {message.type === "success" ? (
                  <CheckCircle size={17} />
                ) : (
                  <AlertCircle size={17} />
                )}
                {message.text}
              </div>
            )}

            <button
              type="submit"
              className="primary-button"
              disabled={saving || !selectedMember}
              style={{
                marginTop: 18,
                opacity: saving || !selectedMember ? 0.6 : 1,
                cursor: saving || !selectedMember ? "not-allowed" : "pointer",
              }}
            >
              <ClipboardCheck size={17} />
              {saving ? "Menyimpan..." : "Catat Kunjungan"}
            </button>
          </form>
        </section>
      )}

      {!canManage && (
        <div className="panel" style={{
          padding: 16,
          marginBottom: 22,
        }}>
          <p style={{
            margin: 0,
            color: "#64746D",
            fontSize: 13,
          }}>
            Akun Kepala Sekolah dapat melihat data kunjungan, tetapi tidak dapat
            mencatat presensi.
          </p>
        </div>
      )}

      <section className="panel" style={{ padding: 24 }}>
        <div className="panel-heading">
          <div>
            <h3>Riwayat Kunjungan Hari Ini</h3>
            <p>{formatDate(today)}</p>
          </div>

          <span className="filter-button">
            {visits.length} kunjungan
          </span>
        </div>

        {loading ? (
          <p style={{ color: "#82908B" }}>Memuat data kunjungan...</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>NO.</th>
                  <th>NOMOR ANGGOTA</th>
                  <th>NAMA ANGGOTA</th>
                  <th>KELAS</th>
                  <th>JAM KUNJUNGAN</th>
                </tr>
              </thead>

              <tbody>
                {todayVisits.length > 0 ? (
                  todayVisits.map((visit, index) => (
                    <tr key={visit.id}>
                      <td>{index + 1}</td>
                      <td>{visit.member?.member_number || "-"}</td>
                      <td>
                        <strong>
                          {visit.member?.full_name || "Anggota tidak ditemukan"}
                        </strong>
                      </td>
                      <td>{visit.member?.class_name || "-"}</td>
                      <td>{formatTime(visit.visit_time)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" style={{ textAlign: "center" }}>
                      Belum ada kunjungan yang tercatat hari ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer>
        © 2026 Pustakara. Sistem Informasi Manajemen Perpustakaan Sekolah.
      </footer>
    </section>
  );
}
