
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
  ClipboardList,
  LibraryBig,
  Users,
  BookMarked,
  Clock,
  ChevronDown,
  Download,
} from "lucide-react";

import { supabase } from "../lib/supabase";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const DENDA_PER_HARI = 500;

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(
    date.getMonth() + 1
  ).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const currentMonth = () => today().slice(0, 7);

const getMonthKey = (value) => {
  if (!value) return "";
  return String(value).slice(0, 7);
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

const formatMonth = (value) => {
  if (!value) return "-";

  const date = new Date(`${value}-01T00:00:00`);

  return date.toLocaleDateString("id-ID", {
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

const safeSheetName = (name) => name.slice(0, 31);

const getStatus = (loan) => {
  if (loan.status === "dikembalikan" || loan.return_date) {
    return {
      label: "Dikembalikan",
      className: "dikembalikan",
      returned: true,
      overdue: false,
    };
  }

  const overdue = Boolean(
    loan.due_date && loan.due_date < today()
  );

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

  return Math.max(
    0,
    Math.floor((end - start) / 86400000)
  );
};

const getReservationStatus = (status) => {
  const value = String(status || "").toLowerCase();

  const labels = {
    menunggu: "Menunggu",
    tersedia: "Tersedia",
    disetujui: "Disetujui",
    ditolak: "Ditolak",
    selesai: "Selesai",
    dibatalkan: "Dibatalkan",
  };

  return labels[value] || status || "-";
};

const reportOptions = [
  { id: "buku", label: "Data Buku", icon: BookOpen },
  { id: "anggota", label: "Data Anggota", icon: Users },
  { id: "peminjaman", label: "Peminjaman", icon: BookMarked },
  { id: "pengembalian", label: "Pengembalian", icon: BookCheck },
  { id: "reservasi", label: "Reservasi Buku", icon: ClipboardList },
];

function Laporan() {
  const [loans, setLoans] = useState([]);
  const [members, setMembers] = useState([]);
  const [books, setBooks] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [authors, setAuthors] = useState([]);
  const [categories, setCategories] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [monthlyMonth, setMonthlyMonth] = useState(currentMonth());
  const [singleReport, setSingleReport] = useState("buku");
  const [singleMonth, setSingleMonth] = useState("all");
  const [search, setSearch] = useState("");

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
      ] = await Promise.all([
        supabase.from("loans").select("*"),
        supabase.from("members").select("*"),
        supabase.from("books").select("*"),
        supabase.from("reservations").select("*"),
        supabase.from("authors").select("id, name"),
        supabase.from("categories").select("id, name"),
      ]);

      const results = [
        loanResult,
        memberResult,
        bookResult,
        reservationResult,
        authorResult,
        categoryResult,
      ];

      const failed = results.find((result) => result.error);

      if (failed) throw failed.error;

      setLoans(loanResult.data || []);
      setMembers(memberResult.data || []);
      setBooks(bookResult.data || []);
      setReservations(reservationResult.data || []);
      setAuthors(authorResult.data || []);
      setCategories(categoryResult.data || []);
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

  // Menggabungkan transaksi dengan data anggota dan buku.
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

      const fine = status.returned
        ? Number(loan.fine_amount || 0)
        : overdueDays * DENDA_PER_HARI;

      return {
        ...loan,
        memberName: member?.full_name || "Anggota tidak ditemukan",
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
        fine,
      };
    });
  }, [loans, members, books]);

  // Menghitung jumlah buku yang sedang dipinjam.
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

  // Laporan Data Buku.
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
        activeLoansByBook[book.id] ??
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

  // Laporan Data Anggota.
  const memberRows = useMemo(() => {
    return members.map((member, index) => ({
      No: index + 1,
      "Nomor Anggota": member.member_number || "-",
      "Nama Anggota": member.full_name || "-",
      NIS: member.nis || "-",
      Kelas: member.class_name || "-",
      Alamat: member.address || "-",
      "Jenis Anggota": member.member_type || "siswa",
      Status: member.status || "-",
    }));
  }, [members]);

  // Laporan Reservasi Buku.
  const reservationRows = useMemo(() => {
    return reservations.map((reservation, index) => {
      const member = members.find(
        (item) => item.id === reservation.member_id
      );

      const book = books.find(
        (item) => item.id === reservation.book_id
      );

      const activeStatuses = ["menunggu", "tersedia"];

      const queue = reservations
        .filter(
          (item) =>
            item.book_id === reservation.book_id &&
            activeStatuses.includes(
              String(item.status || "").toLowerCase()
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

      const queueNumber = queue.findIndex(
        (item) => item.id === reservation.id
      );

      return {
        No: index + 1,
        "Kode Reservasi":
          reservation.reservation_code || "-",
        "Nomor Anggota": member?.member_number || "-",
        "Nama Anggota":
          member?.full_name || "Anggota tidak ditemukan",
        "Kode Buku": book?.book_code || "-",
        "Judul Buku": book?.title || "Buku tidak ditemukan",
        "Tanggal Reservasi":
          reservation.reservation_date || "-",
        "Nomor Antrean": activeStatuses.includes(
          String(reservation.status || "").toLowerCase()
        )
          ? Math.max(1, queueNumber + 1)
          : "-",
        Status: getReservationStatus(reservation.status),
      };
    });
  }, [reservations, members, books]);

  // Format data transaksi.
  const transactionRows = useMemo(() => {
    return allTransactions.map((item, index) => ({
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
  }, [allTransactions]);

  // Membuat laporan peminjaman berdasarkan tanggal pinjam.
  const borrowingRows = useMemo(() => {
    return allTransactions.map((item, index) => ({
      No: index + 1,
      "Kode Transaksi": item.loans_code || "-",
      "Nomor Anggota": item.memberNumber,
      "Nama Anggota": item.memberName,
      Kelas: item.className,
      "Kode Buku": item.bookCode,
      "Judul Buku": item.bookTitle,
      "Tanggal Pinjam": item.loan_date || "-",
      "Tanggal Jatuh Tempo": item.due_date || "-",
      Status: item.statusLabel,
    }));
  }, [allTransactions]);

  // Laporan pengembalian.
  const returningRows = useMemo(() => {
    return allTransactions
      .filter((item) => item.isReturned)
      .map((item, index) => ({
        No: index + 1,
        "Kode Transaksi": item.loans_code || "-",
        "Nomor Anggota": item.memberNumber,
        "Nama Anggota": item.memberName,
        Kelas: item.className,
        "Kode Buku": item.bookCode,
        "Judul Buku": item.bookTitle,
        "Tanggal Pinjam": item.loan_date || "-",
        "Tanggal Kembali": item.return_date || "-",
        "Hari Terlambat": item.overdueDays,
        "Denda (Rp)": item.fine,
        Status: "Dikembalikan",
      }));
  }, [allTransactions]);

  // Mengumpulkan bulan yang tersedia dalam database.
  const monthOptions = useMemo(() => {
    const months = new Set([currentMonth()]);

    loans.forEach((item) => {
      if (item.loan_date) {
        months.add(getMonthKey(item.loan_date));
      }

      if (item.return_date) {
        months.add(getMonthKey(item.return_date));
      }
    });

    reservations.forEach((item) => {
      if (item.reservation_date) {
        months.add(getMonthKey(item.reservation_date));
      }
    });

    books.forEach((item) => {
      if (item.created_at) {
        months.add(getMonthKey(item.created_at));
      }
    });

    members.forEach((item) => {
      if (item.created_at) {
        months.add(getMonthKey(item.created_at));
      }
    });

    return [...months]
      .filter(Boolean)
      .sort((a, b) => b.localeCompare(a))
      .map((value) => ({
        value,
        label: formatMonth(value),
      }));
  }, [loans, reservations, books, members]);

  // Mengambil laporan satuan sesuai pilihan dropdown.
  const singleReportConfig = useMemo(() => {
    switch (singleReport) {
      case "buku":
        return {
          title: "Data Buku",
          dateField: null,
          rows: bookRows,
          columns: [
            "No",
            "Kode Buku",
            "Judul Buku",
            "Pengarang",
            "Kategori",
            "ISBN",
            "Penerbit",
            "Tahun Terbit",
            "Asal Perolehan",
            "Total Eksemplar",
            "Sedang Dipinjam",
            "Stok Tersedia",
            "Status",
          ],
        };

      case "anggota":
        return {
          title: "Data Anggota",
          dateField: null,
          rows: memberRows,
          columns: [
            "No",
            "Nomor Anggota",
            "Nama Anggota",
            "NIS",
            "Kelas",
            "Alamat",
            "Jenis Anggota",
            "Status",
          ],
        };

      case "peminjaman":
        return {
          title: "Peminjaman",
          dateField: "Tanggal Pinjam",
          rows: borrowingRows,
          columns: [
            "No",
            "Kode Transaksi",
            "Nomor Anggota",
            "Nama Anggota",
            "Kelas",
            "Kode Buku",
            "Judul Buku",
            "Tanggal Pinjam",
            "Tanggal Jatuh Tempo",
            "Status",
          ],
        };

      case "pengembalian":
        return {
          title: "Pengembalian",
          dateField: "Tanggal Kembali",
          rows: returningRows,
          columns: [
            "No",
            "Kode Transaksi",
            "Nomor Anggota",
            "Nama Anggota",
            "Kelas",
            "Kode Buku",
            "Judul Buku",
            "Tanggal Pinjam",
            "Tanggal Kembali",
            "Hari Terlambat",
            "Denda (Rp)",
            "Status",
          ],
        };

      case "reservasi":
        return {
          title: "Reservasi Buku",
          dateField: "Tanggal Reservasi",
          rows: reservationRows,
          columns: [
            "No",
            "Kode Reservasi",
            "Nomor Anggota",
            "Nama Anggota",
            "Kode Buku",
            "Judul Buku",
            "Tanggal Reservasi",
            "Nomor Antrean",
            "Status",
          ],
        };

      default:
        return {
          title: "Laporan",
          dateField: null,
          rows: [],
          columns: [],
        };
    }
  }, [
    singleReport,
    bookRows,
    memberRows,
    borrowingRows,
    returningRows,
    reservationRows,
  ]);

  // Filter laporan satuan berdasarkan bulan.
  const monthFilteredRows = useMemo(() => {
    let rows = [...singleReportConfig.rows];

    if (
      singleReportConfig.dateField &&
      singleMonth !== "all"
    ) {
      rows = rows.filter((row) => {
        const date = row[singleReportConfig.dateField];
        return getMonthKey(date) === singleMonth;
      });
    }

    if (search.trim()) {
      const keyword = search.toLowerCase().trim();

      rows = rows.filter((row) =>
        Object.values(row).some((value) =>
          String(value ?? "")
            .toLowerCase()
            .includes(keyword)
        )
      );
    }

    return rows;
  }, [
    singleReportConfig,
    singleMonth,
    search,
  ]);

  // Membuat bagian-bagian laporan bulanan lengkap.
  const getMonthlySections = (month) => {
    const monthlyLoans = allTransactions
      .filter(
        (item) => getMonthKey(item.loan_date) === month
      )
      .map((item, index) => ({
        No: index + 1,
        "Kode Transaksi": item.loans_code || "-",
        "Nomor Anggota": item.memberNumber,
        "Nama Anggota": item.memberName,
        Kelas: item.className,
        "Kode Buku": item.bookCode,
        "Judul Buku": item.bookTitle,
        "Tanggal Pinjam": item.loan_date || "-",
        "Tanggal Jatuh Tempo": item.due_date || "-",
        Status: item.statusLabel,
      }));

    const monthlyReturns = allTransactions
      .filter(
        (item) =>
          item.isReturned &&
          getMonthKey(item.return_date) === month
      )
      .map((item, index) => ({
        No: index + 1,
        "Kode Transaksi": item.loans_code || "-",
        "Nomor Anggota": item.memberNumber,
        "Nama Anggota": item.memberName,
        Kelas: item.className,
        "Kode Buku": item.bookCode,
        "Judul Buku": item.bookTitle,
        "Tanggal Pinjam": item.loan_date || "-",
        "Tanggal Kembali": item.return_date || "-",
        "Hari Terlambat": item.overdueDays,
        "Denda (Rp)": item.fine,
        Status: "Dikembalikan",
      }));

    const monthlyReservations = reservationRows
      .filter(
        (item) =>
          getMonthKey(item["Tanggal Reservasi"]) === month
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
        rows: monthlyLoans,
      },
      {
        name: "Pengembalian",
        rows: monthlyReturns,
      },
      {
        name: "Reservasi Buku",
        rows: monthlyReservations,
      },
    ];
  };

  // Menghitung ringkasan dashboard.
  const totalBorrowing = loans.length;

  const totalReturning = allTransactions.filter(
    (item) => item.isReturned
  ).length;

  const totalOverdue = allTransactions.filter(
    (item) => item.isOverdue
  ).length;

  const totalFine = allTransactions.reduce(
    (total, item) => total + item.fine,
    0
  );

  const totalCopies = books.reduce(
    (total, book) =>
      total + Number(book.total_copies || 0),
    0
  );

  const availableCopies = books.reduce(
    (total, book) =>
      total + Number(book.available_copies || 0),
    0
  );

  const activeReservations = reservations.filter((item) =>
    ["menunggu", "tersedia", "disetujui"].includes(
      String(item.status || "").toLowerCase()
    )
  ).length;

  const summaryCards = [
    {
      label: "Total Judul Buku",
      value: books.length,
      icon: BookOpen,
      color: "#4778e8",
    },
    {
      label: "Total Eksemplar",
      value: totalCopies,
      icon: LibraryBig,
      color: "#16a36a",
    },
    {
      label: "Total Anggota",
      value: members.length,
      icon: Users,
      color: "#8b65d8",
    },
    {
      label: "Stok Tersedia",
      value: availableCopies,
      icon: BookCheck,
      color: "#16a36a",
    },
    {
      label: "Total Peminjaman",
      value: totalBorrowing,
      icon: BookMarked,
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
      icon: Clock,
      color: "#e58a27",
    },
    {
      label: "Reservasi Aktif",
      value: activeReservations,
      icon: ClipboardList,
      color: "#8b65d8",
    },
    {
      label: "Total Denda",
      value: formatCurrency(totalFine),
      icon: Wallet,
      color: "#d94d4d",
    },
  ];

  // Mengunduh laporan bulanan lengkap dalam Excel.
  const exportMonthlyExcel = () => {
    const workbook = XLSX.utils.book_new();
    const sections = getMonthlySections(monthlyMonth);

    const summary = [
      ["PUSTAKARA - LAPORAN BULANAN PERPUSTAKAAN"],
      [`Periode: ${formatMonth(monthlyMonth)}`],
      [`Tanggal unduh: ${formatDate(today())}`],
      [],
      ["Kategori Laporan", "Jumlah Data"],
      ...sections.map((section) => [
        section.name,
        section.rows.length,
      ]),
    ];

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet(summary),
      "Ringkasan"
    );

    sections.forEach((section) => {
      const worksheet = XLSX.utils.json_to_sheet(
        section.rows.length
          ? section.rows
          : [{ Informasi: "Tidak ada data pada periode ini." }]
      );

      XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        safeSheetName(section.name)
      );
    });

    XLSX.writeFile(
      workbook,
      `Laporan_Pustakara_Lengkap_${monthlyMonth}.xlsx`
    );
  };

  // Mengunduh laporan bulanan lengkap dalam PDF.
  const exportMonthlyPDF = () => {
    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });

    const sections = getMonthlySections(monthlyMonth);

    sections.forEach((section, index) => {
      if (index > 0) doc.addPage();

      doc.setFontSize(16);
      doc.text("PUSTAKARA", 14, 16);

      doc.setFontSize(10);
      doc.text("LAPORAN PERPUSTAKAAN SEKOLAH", 14, 23);

      doc.setFontSize(9);
      doc.text(
        `Periode: ${formatMonth(monthlyMonth)}`,
        14,
        29
      );

      doc.setFontSize(11);
      doc.text(section.name, 14, 38);

      if (!section.rows.length) {
        doc.setFontSize(9);
        doc.text(
          "Tidak ada data pada periode ini.",
          14,
          48
        );
        return;
      }

      const columns = Object.keys(section.rows[0]);

      const body = section.rows.map((row) =>
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
        startY: 42,
        head: [columns],
        body,
        theme: "grid",
        styles: {
          fontSize: 6.5,
          cellPadding: 1.8,
          overflow: "linebreak",
        },
        headStyles: {
          fillColor: [36, 91, 112],
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
    });

    doc.save(
      `Laporan_Pustakara_Lengkap_${monthlyMonth}.pdf`
    );
  };

  // Mengunduh laporan satuan dalam Excel.
  const exportSingleExcel = () => {
    const workbook = XLSX.utils.book_new();

    const period =
      singleReportConfig.dateField
        ? singleMonth === "all"
          ? "Semua Bulan"
          : formatMonth(singleMonth)
        : "Seluruh Data";

    const rows = monthFilteredRows;

    const worksheet = XLSX.utils.aoa_to_sheet([
      ["PUSTAKARA - LAPORAN PERPUSTAKAAN"],
      [`Jenis laporan: ${singleReportConfig.title}`],
      [`Periode: ${period}`],
      [`Jumlah data: ${rows.length}`],
      [],
      ...(rows.length
        ? [
            singleReportConfig.columns,
            ...rows.map((row) =>
              singleReportConfig.columns.map(
                (column) => row[column] ?? "-"
              )
            ),
          ]
        : [["Tidak ada data."]]),
    ]);

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "Laporan"
    );

    XLSX.writeFile(
      workbook,
      `Laporan_Pustakara_${singleReport}_${singleMonth === "all" ? "Semua" : singleMonth}.xlsx`
    );
  };

  // Mengunduh laporan satuan dalam PDF.
  const exportSinglePDF = () => {
    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });

    const rows = monthFilteredRows;

    const period =
      singleReportConfig.dateField
        ? singleMonth === "all"
          ? "Semua Bulan"
          : formatMonth(singleMonth)
        : "Seluruh Data";

    doc.setFontSize(16);
    doc.text("PUSTAKARA", 14, 16);

    doc.setFontSize(10);
    doc.text(
      `LAPORAN ${singleReportConfig.title.toUpperCase()}`,
      14,
      23
    );

    doc.setFontSize(9);
    doc.text(`Periode: ${period}`, 14, 29);
    doc.text(
      `Jumlah data: ${rows.length}`,
      14,
      34
    );

    if (!rows.length) {
      doc.setFontSize(10);
      doc.text("Tidak ada data pada laporan ini.", 14, 45);
    } else {
      const columns = singleReportConfig.columns;

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
        startY: 40,
        head: [columns],
        body,
        theme: "grid",
        styles: {
          fontSize: 6.5,
          cellPadding: 1.8,
          overflow: "linebreak",
        },
        headStyles: {
          fillColor: [36, 91, 112],
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
    }

    doc.save(
      `Laporan_Pustakara_${singleReport}_${singleMonth === "all" ? "Semua" : singleMonth}.pdf`
    );
  };

  const getDateLabel = () => {
    if (
      singleReport === "buku" ||
      singleReport === "anggota"
    ) {
      return "Menampilkan seluruh data yang tersimpan.";
    }

    return singleMonth === "all"
      ? "Menampilkan transaksi dari seluruh periode."
      : `Menampilkan transaksi bulan ${formatMonth(singleMonth)}.`;
  };

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

        .laporan-page .report-summary {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
          margin-bottom: 22px;
        }

        .laporan-page .report-card {
          background: white;
          border: 1px solid #e9edf3;
          border-radius: 12px;
          padding: 16px;
          min-width: 0;
        }

        .laporan-page .report-card-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          color: #687386;
          font-size: 12px;
        }

        .laporan-page .report-card-icon {
          width: 36px;
          height: 36px;
          display: grid;
          place-items: center;
          border-radius: 10px;
          background: #f1f5fb;
          flex-shrink: 0;
        }

        .laporan-page .report-card h3 {
          font-size: 21px;
          margin: 12px 0 0;
          overflow-wrap: anywhere;
          color: #263445;
        }

        .laporan-page .report-panel {
          background: white;
          border: 1px solid #e9edf3;
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 18px;
        }

        .laporan-page .report-section-heading {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 16px;
        }

        .laporan-page .report-section-icon {
          width: 39px;
          height: 39px;
          border-radius: 10px;
          display: grid;
          place-items: center;
          background: #edf5f7;
          color: #245b70;
          flex-shrink: 0;
        }

        .laporan-page .report-section-heading h3 {
          margin: 0 0 4px;
          font-size: 15px;
          color: #344054;
        }

        .laporan-page .report-section-heading p {
          margin: 0;
          font-size: 12px;
          color: #8993a3;
        }

        .laporan-page .report-controls {
          display: flex;
          align-items: end;
          gap: 12px;
          flex-wrap: wrap;
        }

        .laporan-page .report-field {
          display: flex;
          flex-direction: column;
          gap: 7px;
          min-width: 190px;
          flex: 1;
        }

        .laporan-page .report-field label {
          font-size: 12px;
          color: #687386;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 5px;
        }

        .laporan-page .report-field select,
        .laporan-page .report-field input {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid #dfe5ef;
          border-radius: 8px;
          padding: 11px 12px;
          background: white;
          color: #344054;
          outline: none;
          font-size: 12px;
        }

        .laporan-page .report-field select:focus,
        .laporan-page .report-field input:focus {
          border-color: #7098e5;
        }

        .laporan-page .report-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .laporan-page .export-button {
          border: 1px solid #dfe5ef;
          border-radius: 9px;
          padding: 10px 13px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          cursor: pointer;
          font-weight: 600;
          background: white;
          color: #344054;
          font-size: 12px;
          white-space: nowrap;
        }

        .laporan-page .export-button.excel {
          color: #16804a;
          border-color: #b9e4cb;
        }

        .laporan-page .export-button.pdf {
          color: #c43c3c;
          border-color: #f0caca;
        }

        .laporan-page .report-table-wrap {
          overflow-x: auto;
          width: 100%;
        }

        .laporan-page .report-table {
          width: 100%;
          min-width: 850px;
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
          white-space: nowrap;
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
          white-space: normal !important;
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

        .laporan-page .report-note {
          background: #f6f8fb;
          color: #687386;
          border-radius: 8px;
          padding: 11px 13px;
          font-size: 12px;
          margin-top: 13px;
        }

        .laporan-page button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        @media (max-width: 1000px) {
          .laporan-page .report-summary {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }

        @media (max-width: 700px) {
          .laporan-page .report-summary {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .laporan-page .report-controls {
            align-items: stretch;
          }

          .laporan-page .report-field {
            min-width: 100%;
          }
        }

        @media (max-width: 520px) {
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
          }
        }
      `}</style>

      {/* JUDUL HALAMAN */}
      <div className="report-heading">
        <div>
          <h2>Laporan Perpustakaan</h2>
          <p>
            Kelola, lihat, dan unduh laporan administrasi
            perpustakaan PUSTAKARA.
          </p>
        </div>
      </div>

      {/* PESAN ERROR */}
      {error && (
        <div className="report-panel">
          <p style={{ color: "#c43c3c" }}>
            Gagal memuat laporan: {error}
          </p>

          <button
            className="export-button"
            onClick={loadData}
            disabled={loading}
          >
            <RefreshCw size={15} />
            Coba Lagi
          </button>
        </div>
      )}

      {/* RINGKASAN */}
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

      {/* LAPORAN BULANAN LENGKAP */}
      <section className="report-panel">
        <div className="report-section-heading">
          <div className="report-section-icon">
            <CalendarDays size={20} />
          </div>

          <div>
            <h3>Laporan Bulanan Lengkap</h3>
            <p>
              Unduh laporan lengkap perpustakaan berdasarkan
              bulan dan tahun.
            </p>
          </div>
        </div>

        <div className="report-controls">
          <div className="report-field">
            <label>
              <CalendarDays size={13} />
              Pilih bulan laporan
            </label>

            <select
              value={monthlyMonth}
              onChange={(event) =>
                setMonthlyMonth(event.target.value)
              }
              disabled={loading}
            >
              {monthOptions.map((month) => (
                <option
                  key={month.value}
                  value={month.value}
                >
                  {month.label}
                </option>
              ))}
            </select>
          </div>

          <div className="report-actions">
            <button
              className="export-button excel"
              onClick={exportMonthlyExcel}
              disabled={loading}
            >
              <FileSpreadsheet size={16} />
              Unduh Excel
            </button>

            <button
              className="export-button pdf"
              onClick={exportMonthlyPDF}
              disabled={loading}
            >
              <FileDown size={16} />
              Unduh PDF
            </button>
          </div>
        </div>

        <div className="report-note">
          Laporan {formatMonth(monthlyMonth)} berisi seluruh data
          buku dan anggota yang tersedia saat ini, serta transaksi
          peminjaman, pengembalian, dan reservasi sesuai bulan
          yang dipilih.
        </div>
      </section>

      {/* LAPORAN SATUAN */}
      <section className="report-panel">
        <div className="report-section-heading">
          <div className="report-section-icon">
            <Download size={20} />
          </div>

          <div>
            <h3>Laporan Satuan</h3>
            <p>
              Pilih satu jenis laporan untuk melihat dan
              mengunduh data secara terpisah.
            </p>
          </div>
        </div>

        <div className="report-controls">
          <div className="report-field">
            <label>
              <ClipboardList size={13} />
              Jenis laporan
            </label>

            <select
              value={singleReport}
              onChange={(event) => {
                setSingleReport(event.target.value);
                setSearch("");
                setSingleMonth("all");
              }}
              disabled={loading}
            >
              {reportOptions.map((option) => (
                <option
                  key={option.id}
                  value={option.id}
                >
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {singleReport !== "buku" &&
            singleReport !== "anggota" && (
              <div className="report-field">
                <label>
                  <CalendarDays size={13} />
                  Periode laporan
                </label>

                <select
                  value={singleMonth}
                  onChange={(event) =>
                    setSingleMonth(event.target.value)
                  }
                  disabled={loading}
                >
                  <option value="all">Semua Bulan</option>

                  {monthOptions.map((month) => (
                    <option
                      key={month.value}
                      value={month.value}
                    >
                      {month.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
        </div>

        <div className="report-controls" style={{ marginTop: 14 }}>
          <div className="report-field">
            <label>
              <Search size={13} />
              Cari data
            </label>

            <input
              type="text"
              placeholder="Cari nama, kode, kelas, atau judul..."
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              disabled={loading}
            />
          </div>

          <div className="report-actions">
            <button
              className="export-button excel"
              onClick={exportSingleExcel}
              disabled={loading}
            >
              <FileSpreadsheet size={16} />
              Unduh Excel
            </button>

            <button
              className="export-button pdf"
              onClick={exportSinglePDF}
              disabled={loading}
            >
              <FileDown size={16} />
              Unduh PDF
            </button>

            <button
              className="export-button"
              onClick={loadData}
              disabled={loading}
            >
              <RefreshCw size={15} />
              Muat Ulang
            </button>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            marginTop: 22,
            marginBottom: 13,
          }}
        >
          <div>
            <strong
              style={{
                color: "#344054",
                fontSize: 14,
              }}
            >
              {singleReportConfig.title}
            </strong>

            <p
              style={{
                color: "#8993a3",
                fontSize: 12,
                margin: "5px 0 0",
              }}
            >
              {getDateLabel()}
            </p>
          </div>

          <span
            style={{
              fontSize: 12,
              color: "#245b70",
              fontWeight: 600,
            }}
          >
            {formatNumber(monthFilteredRows.length)} data
          </span>
        </div>

        <div className="report-table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                {singleReportConfig.columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={
                      singleReportConfig.columns.length || 1
                    }
                    className="report-empty"
                  >
                    Memuat data laporan...
                  </td>
                </tr>
              ) : monthFilteredRows.length > 0 ? (
                monthFilteredRows.map((row, index) => (
                  <tr key={`${singleReport}-${index}`}>
                    {singleReportConfig.columns.map((column) => {
                      const value = row[column];

                      const isStatus = column === "Status";

                      const lowerColumn =
                        column.toLowerCase();

                      const isDate =
                        lowerColumn.includes("tanggal") ||
                        lowerColumn.includes("tempo") ||
                        lowerColumn.includes("pinjam") ||
                        lowerColumn.includes("kembali") ||
                        lowerColumn.includes("jatuh");

                      const isCurrency =
                        lowerColumn.includes("denda");

                      return (
                        <td key={column}>
                          {isStatus ? (
                            <span
                              className={`report-status ${
                                String(value).toLowerCase() ===
                                "dipinjam"
                                  ? "dipinjam"
                                  : String(value).toLowerCase() ===
                                      "terlambat"
                                    ? "terlambat"
                                    : String(value).toLowerCase() ===
                                        "dikembalikan"
                                      ? "dikembalikan"
                                      : ""
                              }`}
                            >
                              {value ?? "-"}
                            </span>
                          ) : isCurrency ? (
                            formatCurrency(value)
                          ) : isDate ? (
                            formatDate(value)
                          ) : (
                            value ?? "-"
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={
                      singleReportConfig.columns.length || 1
                    }
                    className="report-empty"
                  >
                    <ClipboardList
                      size={30}
                      style={{ marginBottom: 8 }}
                    />

                    <div>
                      Tidak ada data{" "}
                      {singleReportConfig.title.toLowerCase()}{" "}
                      yang sesuai dengan pilihan.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="report-table-footer">
          <span>
            Menampilkan {formatNumber(monthFilteredRows.length)} data
          </span>

          {singleReport === "pengembalian" && (
            <strong>
              Total denda:{" "}
              {formatCurrency(
                monthFilteredRows.reduce(
                  (total, row) =>
                    total + Number(row["Denda (Rp)"] || 0),
                  0
                )
              )}
            </strong>
          )}
        </div>
      </section>

      <footer style={{ marginTop: 22 }}>
        © 2026 Pustakara. Sistem Informasi Manajemen Perpustakaan Sekolah.
      </footer>
    </section>
  );
}

export default Laporan;
