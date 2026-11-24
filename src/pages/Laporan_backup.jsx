
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
  LibraryBig,
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

  const dateOnly = String(value).slice(0, 10);
  const date = new Date(`${dateOnly}T00:00:00`);

  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
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
  { id: "kunjungan", label: "Kunjungan Perpustakaan" },
];

const getStatus = (loan) => {
  if (loan.status === "dikembalikan" || loan.return_date) {
    return {
      label: "Dikembalikan",
      className: "dikembalikan",
      returned: true,
      overdue: false,
    };
  }

  const overdue = Boolean(loan.due_date && loan.due_date < today());

  return overdue
    ? {
        label: "Terlambat",
        className: "terlambat",
        returned: false,
        overdue: true,
      }
    : {
        label: "Dipinjam",
        className: "dipinjam",
        returned: false,
        overdue: false,
      };
};

const daysBetween = (from, to) => {
  if (!from || !to) return 0;

  const start = new Date(`${String(from).slice(0, 10)}T00:00:00`);
  const end = new Date(`${String(to).slice(0, 10)}T00:00:00`);

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime())
  ) {
    return 0;
  }

  return Math.max(0, Math.floor((end - start) / 86400000));
};

const safeSheetName = (name) => name.slice(0, 31);

function Laporan() {
  const [loans, setLoans] = useState([]);
  const [members, setMembers] = useState([]);
  const [books, setBooks] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [authors, setAuthors] = useState([]);
  const [categories, setCategories] = useState([]);
  const [visits, setVisits] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [activeTab, setActiveTab] = useState("semua");
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // =========================================
  // MEMUAT DATA DARI SUPABASE
  // =========================================

  const loadData = async () => {
    setLoading(true);
    setError("");

    try {
      const [
        loanResult,
        memberResult,
        bookResult,
        reservationResult,
        authorResult,
        categoryResult,
        visitResult,
      ] = await Promise.all([
        supabase.from("loans").select("*"),

        supabase.from("members").select("*"),

        supabase.from("books").select("*"),

        supabase.from("reservations").select("*"),

        supabase.from("authors").select("id, name"),

        supabase.from("categories").select("id, name"),

        supabase
          .from("library_visits")
          .select(
            "id, member_id, visit_date, visit_time, created_at"
          )
          .order("visit_date", { ascending: false })
          .order("visit_time", { ascending: false }),
      ]);

      const results = [
        loanResult,
        memberResult,
        bookResult,
        reservationResult,
        authorResult,
        categoryResult,
        visitResult,
      ];

      const failed = results.find((result) => result.error);

      if (failed) throw failed.error;

      setLoans(loanResult.data || []);
      setMembers(memberResult.data || []);
      setBooks(bookResult.data || []);
      setReservations(reservationResult.data || []);
      setAuthors(authorResult.data || []);
      setCategories(categoryResult.data || []);
      setVisits(visitResult.data || []);
    } catch (err) {
      console.error("Gagal memuat laporan:", err);

      setError(
        err.message || "Gagal mengambil data laporan."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // =========================================
  // PENGOLAHAN DATA TRANSAKSI
  // =========================================

  const allTransactions = useMemo(() => {
    return loans.map((loan) => {
      const member = members.find(
        (item) => item.id === loan.member_id
      );

      const book = books.find(
        (item) => item.id === loan.book_id
      );

      const status = getStatus(loan);

      const overdueDays = loan.return_date
        ? daysBetween(loan.due_date, loan.return_date)
        : status.overdue
          ? daysBetween(loan.due_date, today())
          : 0;

      return {
        ...loan,
        memberName:
          member?.full_name || "Anggota tidak ditemukan",
        memberNumber: member?.member_number || "-",
        nis: member?.nis || "-",
        className: member?.class_name || "-",
        bookTitle: book?.title || "Buku tidak ditemukan",
        bookCode: book?.book_code || "-",
        statusLabel: status.label,
        statusClass: status.className,
        isReturned: status.returned,
        isOverdue: status.overdue,
        overdueDays,
        fine: Number(loan.fine_amount || 0),
      };
    });
  }, [loans, members, books]);

  const activeLoansByBook = useMemo(() => {
    const counts = {};

    loans.forEach((loan) => {
      const isReturned =
        loan.status === "dikembalikan" ||
        Boolean(loan.return_date);

      if (!isReturned && loan.book_id) {
        counts[loan.book_id] =
          (counts[loan.book_id] || 0) + 1;
      }
    });

    return counts;
  }, [loans]);

  // =========================================
  // DATA BUKU
  // =========================================

  const bookRows = useMemo(() => {
    return books.map((book, index) => {
      const author = authors.find(
        (item) => item.id === book.author_id
      );

      const category = categories.find(
        (item) => item.id === book.category_id
      );

      const total = Number(book.total_copies || 0);
      const available = Number(book.available_copies || 0);

      const borrowed =
        activeLoansByBook[book.id] ||
        Math.max(0, total - available);

      return {
        No: index + 1,
        "Kode Buku": book.book_code || "-",
        "Judul Buku": book.title || "-",
        Pengarang: author?.name || "-",
        Kategori: category?.name || "-",
        ISBN: book.isbn || "-",
        Penerbit:
          book.publisher || book.publisher_name || "-",
        "Tahun Terbit":
          book.publication_year ||
          book.published_year ||
          book.year_published ||
          "-",
        "Asal Perolehan":
          book.acquisition_source || "Belum dicatat",
        "Total Eksemplar": total,
        "Sedang Dipinjam": borrowed,
        "Stok Tersedia": available,
        Status:
          book.status ||
          (available > 0 ? "Tersedia" : "Habis"),
      };
    });
  }, [books, authors, categories, activeLoansByBook]);

  // =========================================
  // DATA ANGGOTA
  // =========================================

  const memberRows = useMemo(() => {
    return members.map((member, index) => ({
      No: index + 1,
      "Nomor Anggota": member.member_number || "-",
      "Nama Anggota": member.full_name || "-",
      NIS: member.nis || "-",
      Kelas: member.class_name || "-",
      Alamat: member.address || "-",
      Status: member.status || "-",
      "Jenis Anggota": member.member_type || "siswa",
    }));
  }, [members]);

  // =========================================
  // DATA RESERVASI
  // =========================================

  const reservationRows = useMemo(() => {
    const activeStatuses = ["menunggu", "tersedia"];

    return reservations.map((reservation, index) => {
      const member = members.find(
        (item) => item.id === reservation.member_id
      );

      const book = books.find(
        (item) => item.id === reservation.book_id
      );

      const queue = reservations
        .filter(
          (item) =>
            item.book_id === reservation.book_id &&
            activeStatuses.includes(
              String(item.status || "").toLowerCase()
            ) &&
            new Date(
              item.created_at || item.reservation_date || 0
            ) <=
              new Date(
                reservation.created_at ||
                  reservation.reservation_date ||
                  0
              )
        )
        .sort(
          (a, b) =>
            new Date(
              a.created_at || a.reservation_date || 0
            ) -
            new Date(
              b.created_at || b.reservation_date || 0
            )
        );

      return {
        No: index + 1,
        "Kode Reservasi":
          reservation.reservation_code || "-",
        "Nomor Anggota": member?.member_number || "-",
        "Nama Anggota":
          member?.full_name || "Anggota tidak ditemukan",
        "Kode Buku": book?.book_code || "-",
        "Judul Buku":
          book?.title || "Buku tidak ditemukan",
        "Tanggal Reservasi":
          reservation.reservation_date || "-",
        "Nomor Antrean": activeStatuses.includes(
          String(reservation.status || "").toLowerCase()
        )
          ? Math.max(
              1,
              queue.findIndex(
                (item) => item.id === reservation.id
              ) + 1
            )
          : "-",
        Status: reservation.status || "-",
      };
    });
  }, [reservations, members, books]);

  // =========================================
  // DATA KUNJUNGAN PERPUSTAKAAN
  // =========================================

  const filteredVisits = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return visits
      .map((visit) => {
        const member = members.find(
          (item) => item.id === visit.member_id
        );

        return {
          ...visit,
          memberNumber: member?.member_number || "-",
          memberName:
            member?.full_name || "Anggota tidak ditemukan",
          className: member?.class_name || "-",
        };
      })
      .filter((visit) => {
        if (
          startDate &&
          (!visit.visit_date || visit.visit_date < startDate)
        ) {
          return false;
        }

        if (
          endDate &&
          (!visit.visit_date || visit.visit_date > endDate)
        ) {
          return false;
        }

        if (!keyword) return true;

        return [
          visit.memberNumber,
          visit.memberName,
          visit.className,
        ].some((value) =>
          String(value || "")
            .toLowerCase()
            .includes(keyword)
        );
      })
      .sort((a, b) => {
        const dateCompare = String(
          b.visit_date || ""
        ).localeCompare(String(a.visit_date || ""));

        if (dateCompare !== 0) return dateCompare;

        return String(b.visit_time || "").localeCompare(
          String(a.visit_time || "")
        );
      });
  }, [visits, members, startDate, endDate, search]);

  const visitRows = (items) =>
    items.map((item, index) => ({
      No: index + 1,
      "Nomor Anggota": item.memberNumber,
      "Nama Anggota": item.memberName,
      Kelas: item.className,
      "Tanggal Kunjungan": formatDate(item.visit_date),
      "Waktu Kunjungan": item.visit_time
        ? String(item.visit_time).slice(0, 5)
        : "-",
    }));

  // =========================================
  // RINGKASAN TRANSAKSI
  // =========================================

  const totalBorrowing = loans.length;

  const totalReturning = loans.filter(
    (loan) =>
      loan.status === "dikembalikan" ||
      Boolean(loan.return_date)
  ).length;

  const totalOverdue = allTransactions.filter(
    (loan) => loan.isOverdue
  ).length;

  const totalFine = loans.reduce(
    (total, loan) =>
      total + Number(loan.fine_amount || 0),
    0
  );

  // =========================================
  // FILTER TRANSAKSI
  // =========================================

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

    if (search.trim()) {
      const keyword = search.toLowerCase().trim();

      result = result.filter((item) =>
        [
          item.memberName,
          item.memberNumber,
          item.nis,
          item.className,
          item.bookTitle,
          item.bookCode,
          item.loans_code,
        ].some((value) =>
          String(value || "")
            .toLowerCase()
            .includes(keyword)
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

  const filteredReservations = useMemo(() => {
    return reservations.filter((item) => {
      const date =
        item.reservation_date ||
        item.created_at?.slice(0, 10);

      if (startDate && (!date || date < startDate)) {
        return false;
      }

      if (endDate && (!date || date > endDate)) {
        return false;
      }

      if (!search.trim()) return true;

      const member = members.find(
        (row) => row.id === item.member_id
      );

      const book = books.find(
        (row) => row.id === item.book_id
      );

      const keyword = search.toLowerCase().trim();

      return [
        item.reservation_code,
        item.status,
        member?.full_name,
        member?.member_number,
        book?.title,
        book?.book_code,
      ].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(keyword)
      );
    });
  }, [reservations, members, books, startDate, endDate, search]);

  const filteredFine = filteredTransactions.reduce(
    (total, item) => total + item.fine,
    0
  );

  // =========================================
  // JUDUL LAPORAN
  // =========================================

  const getReportTitle = () => {
    if (activeTab === "kunjungan") {
      return "Kunjungan Perpustakaan";
    }

    return (
      reportTabs.find((tab) => tab.id === activeTab)
        ?.label || "Laporan Perpustakaan"
    );
  };

  // =========================================
  // FORMAT BARIS TRANSAKSI
  // =========================================

  const transactionRows = (items) =>
    items.map((item, index) => ({
      No: index + 1,
      "Kode Transaksi": item.loans_code || "-",
      "Nomor Anggota": item.memberNumber,
      "Nama Anggota": item.memberName,
      NIS: item.nis,
      Kelas: item.className,
      "Kode Buku": item.bookCode,
      "Judul Buku": item.bookTitle,
      "Tanggal Pinjam": item.loan_date || "-",
      "Tanggal Jatuh Tempo": item.due_date || "-",
      "Tanggal Kembali": item.return_date || "-",
      "Hari Terlambat": item.overdueDays,
      Status: item.statusLabel,
      "Denda (Rp)": item.fine,
    }));

  // =========================================
  // SELURUH BAGIAN LAPORAN
  // =========================================

  const getReportSections = () => {
    const returned = filteredTransactions.filter(
      (item) => item.isReturned
    );

    const overdue = filteredTransactions.filter(
      (item) => item.isOverdue
    );

    const fines = filteredTransactions.filter(
      (item) => item.fine > 0
    );

    return [
      {
        name: "Data Buku",
        rows: bookRows,
      },
      {
        name: "Data Anggota",
        rows: memberRows,
      },
      {
        name: "Peminjaman",
        rows: transactionRows(
          filteredTransactions.filter(
            (item) => !item.isReturned
          )
        ),
      },
      {
        name: "Pengembalian",
        rows: transactionRows(returned),
      },
      {
        name: "Keterlambatan",
        rows: transactionRows(overdue),
      },
      {
        name: "Denda",
        rows: transactionRows(fines),
      },
      {
        name: "Reservasi",
        rows: filteredReservations.map((item, index) => {
          const member = members.find(
            (row) => row.id === item.member_id
          );

          const book = books.find(
            (row) => row.id === item.book_id
          );

          return {
            No: index + 1,
            "Kode Reservasi":
              item.reservation_code || "-",
            "Nomor Anggota":
              member?.member_number || "-",
            "Nama Anggota":
              member?.full_name || "Anggota tidak ditemukan",
            "Kode Buku": book?.book_code || "-",
            "Judul Buku":
              book?.title || "Buku tidak ditemukan",
            "Tanggal Reservasi":
              item.reservation_date || "-",
            Status: item.status || "-",
          };
        }),
      },
      {
        name: "Kunjungan Perpustakaan",
        rows: visitRows(filteredVisits),
      },
    ];
  };

  // =========================================
  // EKSPOR EXCEL
  // =========================================

  const exportExcel = (all = false) => {
    const workbook = XLSX.utils.book_new();

    if (all) {
      getReportSections().forEach((section) => {
        const rows = section.rows;

        const worksheet = XLSX.utils.json_to_sheet(
          rows.length
            ? rows
            : [
                {
                  Informasi:
                    "Tidak ada data pada periode/filter ini.",
                },
              ]
        );

        XLSX.utils.book_append_sheet(
          workbook,
          worksheet,
          safeSheetName(section.name)
        );
      });
    } else {
      const title = getReportTitle();

      const rows =
        activeTab === "kunjungan"
          ? visitRows(filteredVisits)
          : transactionRows(filteredTransactions);

      const worksheet = XLSX.utils.aoa_to_sheet([
        ["PUSTAKARA - LAPORAN PERPUSTAKAAN"],
        [`Jenis laporan: ${title}`],
        [
          `Periode: ${
            startDate
              ? formatDate(startDate)
              : "Semua tanggal"
          } - ${
            endDate ? formatDate(endDate) : "Sekarang"
          }`,
        ],
        [`Jumlah data: ${rows.length}`],
        [],
        ...(rows.length
          ? [
              Object.keys(rows[0]),
              ...rows.map((row) => Object.values(row)),
            ]
          : [["Tidak ada data pada filter ini."]]),
      ]);

      XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        "Laporan"
      );
    }

    if (!workbook.SheetNames.length) {
      alert("Tidak ada data untuk diunduh.");
      return;
    }

    XLSX.writeFile(
      workbook,
      `Laporan_Pustakara_${
        all ? "Lengkap" : activeTab
      }_${today()}.xlsx`
    );
  };

  // =========================================
  // EKSPOR PDF
  // =========================================

  const exportPDF = (all = false) => {
    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });

    const addHeader = (title, y = 16) => {
      doc.setFontSize(16);
      doc.text("PUSTAKARA", 14, y);

      doc.setFontSize(10);
      doc.text(title, 14, y + 7);

      doc.setFontSize(8);
      doc.text(
        `Periode: ${
          startDate
            ? formatDate(startDate)
            : "Semua tanggal"
        } - ${
          endDate ? formatDate(endDate) : "Sekarang"
        }`,
        14,
        y + 13
      );
    };

    const addSection = (title, rows, startY = 38) => {
      doc.setFontSize(11);
      doc.text(title, 14, startY);

      if (!rows.length) {
        doc.setFontSize(9);
        doc.text(
          "Tidak ada data pada periode/filter ini.",
          14,
          startY + 8
        );

        return startY + 16;
      }

      const columns = Object.keys(rows[0]);

      const body = rows.map((row) =>
        columns.map((column) => {
          const value = row[column];

          if (
            column.toLowerCase().includes("denda") &&
            typeof value === "number"
          ) {
            return formatCurrency(value);
          }

          return value === null || value === undefined
            ? "-"
            : String(value);
        })
      );

      autoTable(doc, {
        startY: startY + 4,
        head: [columns],
        body,
        theme: "grid",
        styles: {
          fontSize: 6.5,
          cellPadding: 1.8,
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
        margin: {
          left: 14,
          right: 14,
        },
      });

      return (doc.lastAutoTable?.finalY || startY + 16) + 12;
    };

    if (!all) {
      addHeader(
        `LAPORAN ${getReportTitle().toUpperCase()}`
      );

      const rows =
        activeTab === "kunjungan"
          ? visitRows(filteredVisits)
          : transactionRows(filteredTransactions);

      addSection(getReportTitle(), rows, 38);
    } else {
      const sections = getReportSections();

      sections.forEach((section, index) => {
        if (index > 0) doc.addPage();

        addHeader("LAPORAN PERPUSTAKAAN SEKOLAH");

        addSection(section.name, section.rows, 38);
      });
    }

    doc.save(
      `Laporan_Pustakara_${
        all ? "Lengkap" : activeTab
      }_${today()}.pdf`
    );
  };

  // =========================================
  // KARTU RINGKASAN
  // =========================================

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

  // =========================================
  // TAMPILAN HALAMAN
  // =========================================

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
          gap: 8px;
          flex-wrap: wrap;
        }

        .laporan-page .export-button {
          border: 1px solid #dfe5ef;
          border-radius: 9px;
          padding: 10px 12px;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          cursor: pointer;
          font-weight: 600;
          background: white;
          color: #344054;
          font-size: 12px;
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
          -webkit-overflow-scrolling: touch;
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

        .laporan-page button:disabled {
          opacity: .55;
          cursor: not-allowed;
        }

        @media(max-width: 900px) {
          .laporan-page .report-summary {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media(max-width: 520px) {
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

          .laporan-page .report-actions {
            width: 100%;
          }

          .laporan-page .export-button {
            flex: 1;
            justify-content: center;
          }

          .laporan-page .report-field.search-field {
            min-width: 100%;
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
            onClick={() => exportExcel(false)}
            disabled={loading}
          >
            <FileSpreadsheet size={16} />
            Excel Tab Ini
          </button>

          <button
            className="export-button pdf"
            onClick={() => exportPDF(false)}
            disabled={loading}
          >
            <FileDown size={16} />
            PDF Tab Ini
          </button>

          <button
            className="export-button excel"
            onClick={() => exportExcel(true)}
            disabled={loading}
          >
            <LibraryBig size={16} />
            Excel Lengkap
          </button>

          <button
            className="export-button pdf"
            onClick={() => exportPDF(true)}
            disabled={loading}
          >
            <FileDown size={16} />
            PDF Lengkap
          </button>
        </div>
      </div>

      {error && (
        <div
          className="report-panel"
          style={{ marginBottom: 18 }}
        >
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

      {/* KARTU RINGKASAN */}

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
              {loading
                ? "..."
                : typeof card.value === "number"
                  ? formatNumber(card.value)
                  : card.value}
            </h3>
          </div>
        ))}
      </div>

      {/* PANEL LAPORAN */}

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

        {/* FILTER */}

        <div className="report-filters">
          <div className="report-field search-field">
            <label>
              <Search size={13} />
              {activeTab === "kunjungan"
                ? "Cari anggota"
                : "Cari transaksi"}
            </label>

            <input
              type="text"
              placeholder={
                activeTab === "kunjungan"
                  ? "Nama anggota, nomor anggota, atau kelas..."
                  : "Nama anggota, kode, atau judul buku..."
              }
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
            />
          </div>

          <div className="report-field">
            <label>
              <CalendarDays size={13} />
              Tanggal awal
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
              <CalendarDays size={13} />
              Tanggal akhir
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

        {/* TABEL LAPORAN */}

        <div className="report-table-wrap">
          <table className="report-table">
            <thead>
              {activeTab === "kunjungan" ? (
                <tr>
                  <th>NO.</th>
                  <th>NOMOR ANGGOTA</th>
                  <th>NAMA ANGGOTA</th>
                  <th>KELAS</th>
                  <th>TANGGAL KUNJUNGAN</th>
                  <th>WAKTU KUNJUNGAN</th>
                </tr>
              ) : (
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
              )}
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={
                      activeTab === "kunjungan" ? 6 : 10
                    }
                    className="report-empty"
                  >
                    Memuat data laporan...
                  </td>
                </tr>
              ) : activeTab === "kunjungan" ? (
                filteredVisits.length > 0 ? (
                  filteredVisits.map((item, index) => (
                    <tr key={item.id}>
                      <td>{index + 1}</td>
                      <td>{item.memberNumber}</td>
                      <td>
                        <strong>{item.memberName}</strong>
                      </td>
                      <td>{item.className}</td>
                      <td>{formatDate(item.visit_date)}</td>
                      <td>
                        {item.visit_time
                          ? String(item.visit_time).slice(0, 5)
                          : "-"}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" className="report-empty">
                      <ClipboardList
                        size={30}
                        style={{ marginBottom: 8 }}
                      />
                      <div>
                        Tidak ada data kunjungan yang sesuai
                        dengan filter.
                      </div>
                    </td>
                  </tr>
                )
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
                      Tidak ada transaksi yang sesuai dengan
                      filter.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* FOOTER TABEL */}

        <div className="report-table-footer">
          <span>
            Menampilkan{" "}
            {formatNumber(
              activeTab === "kunjungan"
                ? filteredVisits.length
                : filteredTransactions.length
            )}{" "}
            {activeTab === "kunjungan"
              ? "kunjungan"
              : "transaksi"}
          </span>

          {activeTab !== "kunjungan" && (
            <strong>
              Total denda: {formatCurrency(filteredFine)}
            </strong>
          )}
        </div>
      </section>

      <footer style={{ marginTop: 22 }}>
        © 2026 Pustakara. Sistem Informasi Manajemen
        Perpustakaan Sekolah.
      </footer>
    </section>
  );
}

export default Laporan;
