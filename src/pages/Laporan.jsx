
import { useEffect, useMemo, useState } from "react";
import {
  FileSpreadsheet,
  FileDown,
  Search,
  RefreshCw,
  CalendarDays,
  Wallet,
  BookOpen,
  BookCheck,
  AlertTriangle,
  ClipboardList,
} from "lucide-react";

import { supabase } from "../lib/supabase";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const today = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const formatDate = (value) => {
  if (!value) return "-";

  return new Date(`${value}T00:00:00`).toLocaleDateString(
    "id-ID",
    {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }
  );
};

const formatNumber = (value) =>
  new Intl.NumberFormat("id-ID").format(Number(value || 0));

const formatCurrency = (value) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const reportTabs = [
  { id: "semua", label: "Semua Transaksi" },
  { id: "peminjaman", label: "Peminjaman" },
  { id: "pengembalian", label: "Pengembalian" },
  { id: "terlambat", label: "Keterlambatan" },
  { id: "denda", label: "Denda" },
];

function Laporan() {
  const [loans, setLoans] = useState([]);
  const [members, setMembers] = useState([]);
  const [books, setBooks] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [activeTab, setActiveTab] = useState("semua");
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const loadData = async () => {
    setLoading(true);
    setError("");

    try {
      const [loanResult, memberResult, bookResult] =
        await Promise.all([
          supabase.from("loans").select("*"),
          supabase.from("members").select("*"),
          supabase.from("books").select("*"),
        ]);

      if (loanResult.error) throw loanResult.error;
      if (memberResult.error) throw memberResult.error;
      if (bookResult.error) throw bookResult.error;

      setLoans(loanResult.data || []);
      setMembers(memberResult.data || []);
      setBooks(bookResult.data || []);
    } catch (err) {
      console.error("Gagal memuat laporan:", err);
      setError(err.message || "Gagal mengambil data laporan.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Menggabungkan data transaksi dengan data anggota dan buku
  const allTransactions = useMemo(() => {
    return loans.map((loan) => {
      const member = members.find(
        (item) => item.id === loan.member_id
      );

      const book = books.find(
        (item) => item.id === loan.book_id
      );

      const isReturned = loan.status === "dikembalikan";
      const isOverdue =
        !isReturned &&
        loan.due_date &&
        loan.due_date < today();

      let statusLabel = "Dipinjam";
      let statusClass = "dipinjam";

      if (isReturned) {
        statusLabel = "Dikembalikan";
        statusClass = "dikembalikan";
      } else if (isOverdue) {
        statusLabel = "Terlambat";
        statusClass = "terlambat";
      }

      return {
        ...loan,
        memberName: member?.full_name || "Anggota tidak ditemukan",
        memberNumber: member?.member_number || "-",
        className: member?.class_name || "-",
        bookTitle: book?.title || "Buku tidak ditemukan",
        bookCode: book?.book_code || "-",
        statusLabel,
        statusClass,
        isReturned,
        isOverdue: Boolean(isOverdue),
        fine: Number(loan.fine_amount || 0),
      };
    });
  }, [loans, members, books]);

  // Statistik keseluruhan
  const totalBorrowing = loans.length;

  const totalReturning = loans.filter(
    (loan) => loan.status === "dikembalikan"
  ).length;

  const totalOverdue = allTransactions.filter(
    (loan) => loan.isOverdue
  ).length;

  const totalFine = loans.reduce(
    (total, loan) =>
      total + Number(loan.fine_amount || 0),
    0
  );

  // Memilih transaksi berdasarkan tab
  const filteredTransactions = useMemo(() => {
    let result = [...allTransactions];

    if (activeTab === "peminjaman") {
      result = result.filter(
        (item) => !item.isReturned
      );
    } else if (activeTab === "pengembalian") {
      result = result.filter(
        (item) => item.isReturned
      );
    } else if (activeTab === "terlambat") {
      result = result.filter(
        (item) => item.isOverdue
      );
    } else if (activeTab === "denda") {
      result = result.filter(
        (item) => item.fine > 0
      );
    }

    // Filter tanggal
    result = result.filter((item) => {
      const date =
        activeTab === "pengembalian"
          ? item.return_date
          : item.loan_date;

      if (startDate && (!date || date < startDate)) {
        return false;
      }

      if (endDate && (!date || date > endDate)) {
        return false;
      }

      return true;
    });

    // Pencarian
    if (search.trim()) {
      const keyword = search.toLowerCase().trim();

      result = result.filter((item) =>
        [
          item.memberName,
          item.memberNumber,
          item.className,
          item.bookTitle,
          item.bookCode,
          item.loans_code,
        ]
          .filter(Boolean)
          .some((value) =>
            String(value).toLowerCase().includes(keyword)
          )
      );
    }

    return result.sort(
      (a, b) =>
        new Date(b.loan_date || 0) -
        new Date(a.loan_date || 0)
    );
  }, [
    allTransactions,
    activeTab,
    startDate,
    endDate,
    search,
  ]);

  const filteredFine = filteredTransactions.reduce(
    (total, item) => total + item.fine,
    0
  );

  const getReportTitle = () => {
    const selected = reportTabs.find(
      (tab) => tab.id === activeTab
    );

    return selected?.label || "Laporan Perpustakaan";
  };

  const getReportDate = (item) => {
    return activeTab === "pengembalian"
      ? item.return_date
      : item.loan_date;
  };

  // Ekspor Excel
  const exportExcel = () => {
    if (filteredTransactions.length === 0) {
      alert("Tidak ada data untuk diunduh.");
      return;
    }

    const title = getReportTitle();

    const rows = filteredTransactions.map((item, index) => ({
      No: index + 1,
      "Kode Transaksi": item.loans_code || "-",
      "Nomor Anggota": item.memberNumber,
      "Nama Anggota": item.memberName,
      Kelas: item.className,
      "Kode Buku": item.bookCode,
      "Judul Buku": item.bookTitle,
      "Tanggal Pinjam": item.loan_date || "-",
      "Tanggal Jatuh Tempo": item.due_date || "-",
      "Tanggal Kembali": item.return_date || "-",
      Status: item.statusLabel,
      "Denda (Rp)": item.fine,
    }));

    const worksheetData = [
      ["PUSTAKARA - LAPORAN PERPUSTAKAAN"],
      [`Jenis laporan: ${title}`],
      [
        `Periode: ${startDate ? formatDate(startDate) : "Semua tanggal"} - ${
          endDate ? formatDate(endDate) : "Sekarang"
        }`,
      ],
      [`Jumlah transaksi: ${filteredTransactions.length}`],
      [`Total denda: ${filteredFine}`],
      [],
      Object.keys(rows[0]),
      ...rows.map((row) => Object.values(row)),
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(
      worksheetData
    );

    worksheet["!cols"] = [
      { wch: 6 },
      { wch: 20 },
      { wch: 18 },
      { wch: 28 },
      { wch: 12 },
      { wch: 15 },
      { wch: 30 },
      { wch: 16 },
      { wch: 18 },
      { wch: 16 },
      { wch: 18 },
      { wch: 16 },
    ];

    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "Laporan"
    );

    const filename = `Laporan_Pustakara_${activeTab}_${today()}.xlsx`;

    XLSX.writeFile(workbook, filename);
  };

  // Ekspor PDF
  const exportPDF = () => {
    if (filteredTransactions.length === 0) {
      alert("Tidak ada data untuk diunduh.");
      return;
    }

    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });

    doc.setFontSize(18);
    doc.text("PUSTAKARA", 14, 16);

    doc.setFontSize(11);
    doc.text("LAPORAN PERPUSTAKAAN SEKOLAH", 14, 23);

    doc.setFontSize(10);
    doc.text(
      `Jenis laporan: ${getReportTitle()}`,
      14,
      32
    );

    doc.text(
      `Periode: ${
        startDate ? formatDate(startDate) : "Semua tanggal"
      } - ${endDate ? formatDate(endDate) : "Sekarang"}`,
      14,
      39
    );

    doc.text(
      `Jumlah transaksi: ${formatNumber(filteredTransactions.length)}`,
      14,
      46
    );

    doc.text(
      `Total denda: ${formatCurrency(filteredFine)}`,
      14,
      53
    );

    const tableRows = filteredTransactions.map(
      (item, index) => [
        index + 1,
        item.loans_code || "-",
        item.memberName,
        item.className,
        item.bookTitle,
        formatDate(item.loan_date),
        formatDate(item.due_date),
        formatDate(item.return_date),
        item.statusLabel,
        formatCurrency(item.fine),
      ]
    );

    autoTable(doc, {
      startY: 60,
      head: [[
        "No",
        "Kode",
        "Nama Anggota",
        "Kelas",
        "Judul Buku",
        "Tgl Pinjam",
        "Jatuh Tempo",
        "Tgl Kembali",
        "Status",
        "Denda",
      ]],
      body: tableRows,
      theme: "grid",
      styles: {
        fontSize: 7,
        cellPadding: 2,
        overflow: "linebreak",
      },
      headStyles: {
        fillColor: [48, 91, 160],
        textColor: 255,
        halign: "center",
      },
      alternateRowStyles: {
        fillColor: [245, 248, 252],
      },
    });

    doc.save(
      `Laporan_Pustakara_${activeTab}_${today()}.pdf`
    );
  };

  const summaryCards = [
    {
      label: "Total Peminjaman",
      value: totalBorrowing,
      icon: BookOpen,
      color: "#4778e8",
    },
    {
      label: "Total Pengembalian",
      value: totalReturning,
      icon: BookCheck,
      color: "#16a36a",
    },
    {
      label: "Terlambat",
      value: totalOverdue,
      icon: AlertTriangle,
      color: "#e58a27",
    },
    {
      label: "Total Denda",
      value: formatCurrency(totalFine),
      icon: Wallet,
      color: "#d94d4d",
    },
  ];

  return (
    <section className="content laporan-page">
      <style>{`
        .laporan-page .report-heading {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
          margin-bottom: 22px;
        }
        .laporan-page .report-heading h2 {
          margin: 0 0 6px;
          font-size: 21px;
        }
        .laporan-page .report-heading p {
          margin: 0;
          color: #778197;
          font-size: 13px;
        }
        .laporan-page .report-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .laporan-page .export-button {
          border: 1px solid #dfe5ef;
          border-radius: 9px;
          padding: 10px 14px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          font-weight: 600;
          background: white;
          color: #344054;
        }
        .laporan-page .export-button.excel {
          color: #16804a;
          border-color: #b9e4cb;
        }
        .laporan-page .export-button.pdf {
          color: #c43c3c;
          border-color: #f0caca;
        }
        .laporan-page .report-summary {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 16px;
          margin-bottom: 22px;
        }
        .laporan-page .report-card {
          background: white;
          border: 1px solid #e9edf3;
          border-radius: 12px;
          padding: 18px;
          min-width: 0;
        }
        .laporan-page .report-card-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          color: #687386;
          font-size: 13px;
        }
        .laporan-page .report-card-icon {
          width: 38px;
          height: 38px;
          display: grid;
          place-items: center;
          border-radius: 10px;
          background: #f1f5fb;
        }
        .laporan-page .report-card h3 {
          font-size: 22px;
          margin: 13px 0 0;
          overflow-wrap: anywhere;
        }
        .laporan-page .report-panel {
          background: white;
          border: 1px solid #e9edf3;
          border-radius: 12px;
          padding: 20px;
        }
        .laporan-page .report-tabs {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          border-bottom: 1px solid #e9edf3;
          padding-bottom: 15px;
          margin-bottom: 18px;
        }
        .laporan-page .report-tab {
          border: 1px solid #e1e6ef;
          border-radius: 8px;
          padding: 9px 13px;
          background: white;
          color: #596579;
          cursor: pointer;
          font-size: 13px;
        }
        .laporan-page .report-tab.active {
          color: #3568c8;
          border-color: #9bb8ee;
          background: #eff5ff;
          font-weight: 700;
        }
        .laporan-page .report-filters {
          display: flex;
          gap: 12px;
          align-items: end;
          flex-wrap: wrap;
          margin-bottom: 20px;
        }
        .laporan-page .report-field {
          display: flex;
          flex-direction: column;
          gap: 7px;
          min-width: 150px;
        }
        .laporan-page .report-field.search-field {
          flex: 1;
          min-width: 210px;
        }
        .laporan-page .report-field label {
          font-size: 12px;
          color: #687386;
          font-weight: 600;
        }
        .laporan-page .report-field input {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid #dfe5ef;
          border-radius: 8px;
          padding: 10px 11px;
          background: white;
          color: #344054;
          outline: none;
        }
        .laporan-page .report-field input:focus {
          border-color: #7098e5;
        }
        .laporan-page .refresh-button {
          border: 1px solid #dfe5ef;
          background: white;
          border-radius: 8px;
          padding: 10px 13px;
          display: flex;
          align-items: center;
          gap: 7px;
          cursor: pointer;
          color: #475467;
        }
        .laporan-page .report-table-wrap {
          overflow-x: auto;
          width: 100%;
        }
        .laporan-page .report-table {
          width: 100%;
          min-width: 950px;
          border-collapse: collapse;
          font-size: 12px;
        }
        .laporan-page .report-table th {
          background: #f6f8fb;
          color: #667085;
          text-align: left;
          padding: 13px 11px;
          white-space: nowrap;
          font-size: 11px;
        }
        .laporan-page .report-table td {
          padding: 13px 11px;
          border-bottom: 1px solid #edf0f5;
          color: #475467;
        }
        .laporan-page .report-status {
          display: inline-block;
          padding: 5px 9px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 600;
          white-space: nowrap;
        }
        .laporan-page .report-status.dipinjam {
          background: #fff4df;
          color: #a56b12;
        }
        .laporan-page .report-status.dikembalikan {
          background: #e7f7ee;
          color: #16804a;
        }
        .laporan-page .report-status.terlambat {
          background: #fdeaea;
          color: #c43c3c;
        }
        .laporan-page .report-empty {
          text-align: center;
          padding: 35px 12px !important;
          color: #8993a3 !important;
        }
        .laporan-page .report-table-footer {
          display: flex;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 17px;
          color: #687386;
          font-size: 13px;
        }
        @media (max-width: 900px) {
          .laporan-page .report-summary {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (max-width: 520px) {
          .laporan-page .report-summary {
            grid-template-columns: 1fr 1fr;
            gap: 9px;
          }
          .laporan-page .report-card {
            padding: 12px;
          }
          .laporan-page .report-card h3 {
            font-size: 17px;
          }
          .laporan-page .report-panel {
            padding: 13px;
          }
        }
      `}</style>

      <div className="report-heading">
        <div>
          <h2>Laporan Perpustakaan</h2>
          <p>
            Pantau dan unduh rekap aktivitas perpustakaan.
          </p>
        </div>

        <div className="report-actions">
          <button
            className="export-button excel"
            onClick={exportExcel}
            disabled={loading}
          >
            <FileSpreadsheet size={17} />
            Unduh Excel
          </button>

          <button
            className="export-button pdf"
            onClick={exportPDF}
            disabled={loading}
          >
            <FileDown size={17} />
            Unduh PDF
          </button>
        </div>
      </div>

      {error && (
        <div className="report-panel" style={{ marginBottom: 18 }}>
          <p style={{ color: "#c43c3c" }}>
            Gagal memuat laporan: {error}
          </p>
          <button
            className="refresh-button"
            onClick={loadData}
          >
            <RefreshCw size={16} />
            Coba Lagi
          </button>
        </div>
      )}

      <div className="report-summary">
        {summaryCards.map((card) => (
          <div className="report-card" key={card.label}>
            <div className="report-card-top">
              <span>{card.label}</span>
              <div
                className="report-card-icon"
                style={{ color: card.color }}
              >
                <card.icon size={20} />
              </div>
            </div>

            <h3>
              {loading ? "..." : typeof card.value === "number"
                ? formatNumber(card.value)
                : card.value}
            </h3>
          </div>
        ))}
      </div>

      <section className="report-panel">
        <div className="report-tabs">
          {reportTabs.map((tab) => (
            <button
              key={tab.id}
              className={`report-tab ${
                activeTab === tab.id ? "active" : ""
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="report-filters">
          <div className="report-field search-field">
            <label>
              <Search size={13} /> Cari transaksi
            </label>
            <input
              type="text"
              placeholder="Nama anggota, kode, atau judul buku..."
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
            />
          </div>

          <div className="report-field">
            <label>
              <CalendarDays size={13} /> Tanggal awal
            </label>
            <input
              type="date"
              value={startDate}
              max={endDate || undefined}
              onChange={(event) =>
                setStartDate(event.target.value)
              }
            />
          </div>

          <div className="report-field">
            <label>
              <CalendarDays size={13} /> Tanggal akhir
            </label>
            <input
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(event) =>
                setEndDate(event.target.value)
              }
            />
          </div>

          <button
            className="refresh-button"
            onClick={loadData}
            disabled={loading}
          >
            <RefreshCw size={15} />
            Muat Ulang
          </button>
        </div>

        <div className="report-table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                <th>NO.</th>
                <th>KODE TRANSAKSI</th>
                <th>NAMA ANGGOTA</th>
                <th>KELAS</th>
                <th>JUDUL BUKU</th>
                <th>TANGGAL PINJAM</th>
                <th>JATUH TEMPO</th>
                <th>TANGGAL KEMBALI</th>
                <th>STATUS</th>
                <th>DENDA</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="10" className="report-empty">
                    Memuat data laporan...
                  </td>
                </tr>
              ) : filteredTransactions.length > 0 ? (
                filteredTransactions.map((item, index) => (
                  <tr key={item.id}>
                    <td>{index + 1}</td>
                    <td>{item.loans_code || "-"}</td>
                    <td>
                      <strong>{item.memberName}</strong>
                    </td>
                    <td>{item.className}</td>
                    <td>{item.bookTitle}</td>
                    <td>{formatDate(item.loan_date)}</td>
                    <td>{formatDate(item.due_date)}</td>
                    <td>{formatDate(item.return_date)}</td>
                    <td>
                      <span
                        className={`report-status ${item.statusClass}`}
                      >
                        {item.statusLabel}
                      </span>
                    </td>
                    <td>{formatCurrency(item.fine)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="10" className="report-empty">
                    <ClipboardList
                      size={30}
                      style={{ marginBottom: 8 }}
                    />
                    <div>
                      Tidak ada transaksi yang sesuai dengan filter.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="report-table-footer">
          <span>
            Menampilkan {formatNumber(filteredTransactions.length)} transaksi
          </span>

          <strong>
            Total denda: {formatCurrency(filteredFine)}
          </strong>
        </div>
      </section>

      <footer style={{ marginTop: 22 }}>
        © 2026 Pustakara. Sistem Informasi Manajemen Perpustakaan Sekolah.
      </footer>
    </section>
  );
}

export default Laporan;
