
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FileSpreadsheet,
  FileDown,
  Search,
  RefreshCw,
  Wallet,
  BookOpen,
  BookCheck,
  AlertTriangle,
  ClipboardList,
  Users,
} from "lucide-react";

import { supabase } from "../lib/supabase";
import ExcelJS from "exceljs";
import Chart from "chart.js/auto";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
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

const reportOptions = [
  { id: "buku", label: "Data Buku" },
  { id: "anggota", label: "Data Anggota" },
  { id: "peminjaman", label: "Peminjaman" },
  { id: "pengembalian", label: "Pengembalian" },
  { id: "reservasi", label: "Reservasi Buku" },
  { id: "kunjungan", label: "Kunjungan Kelas" },
];

const periodOptions = [
  { id: "all", label: "Satuan (Semua Data)" },
  { id: "monthly", label: "Bulanan" },
  { id: "yearly", label: "Tahunan" },
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

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }

  return Math.max(0, Math.floor((end - start) / 86400000));
};

const getPeriodDate = (mode, month, year) => {
  if (mode === "monthly") {
    return `${year}-${month}`;
  }

  if (mode === "yearly") {
    return String(year);
  }

  return "";
};

const isWithinPeriod = (date, mode, month, year) => {
  if (mode === "all") return true;
  if (!date) return false;

  const value = String(date).slice(0, 10);

  if (mode === "monthly") {
    return value.slice(0, 7) === getPeriodDate(mode, month, year);
  }

  if (mode === "yearly") {
    return value.slice(0, 4) === String(year);
  }

  return true;
};

const groupVisits = (visits, mode) => {
  const grouped = {};

  visits.forEach((visit) => {
    const date = String(
      visit.visit_date || visit["Tanggal Kunjungan"] || ""
    ).slice(0, 10);

    let key = date;

    if (mode === "monthly") key = date.slice(0, 7);
    if (mode === "yearly") key = date.slice(0, 4);

    if (key) grouped[key] = (grouped[key] || 0) + 1;
  });

  return Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, total]) => ({ label, total }));
};

const groupVisitsByClass = (visits) => {
  const grouped = {};

  visits.forEach((visit) => {
    const className = visit.Kelas || "Tidak diketahui";
    grouped[className] = (grouped[className] || 0) + 1;
  });

  return Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([kelas, total]) => ({
      Kelas: kelas,
      "Jumlah Kunjungan": total,
    }));
};

const getMonthName = (month) => {
  const names = [
    "Januari", "Februari", "Maret", "April",
    "Mei", "Juni", "Juli", "Agustus",
    "September", "Oktober", "November", "Desember",
  ];

  return names[Number(month) - 1] || month;
};

function Laporan() {
  const currentDate = new Date();

  const [loans, setLoans] = useState([]);
  const [members, setMembers] = useState([]);
  const [books, setBooks] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [authors, setAuthors] = useState([]);
  const [categories, setCategories] = useState([]);
  const [visits, setVisits] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [reportType, setReportType] = useState("buku");
  const [periodMode, setPeriodMode] = useState("all");
  const [selectedMonth, setSelectedMonth] = useState(
    String(currentDate.getMonth() + 1).padStart(2, "0")
  );
  const [selectedYear, setSelectedYear] = useState(
    String(currentDate.getFullYear())
  );

  const [search, setSearch] = useState("");
  const [visitChartMode, setVisitChartMode] = useState("monthly");

  const chartCanvasRef = useRef(null);
  const chartInstanceRef = useRef(null);

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
          .select("id, member_id, visit_date, visit_time, created_at")
          .order("visit_date", { ascending: false }),
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
      setError(err.message || "Gagal mengambil data laporan.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const allTransactions = useMemo(() => {
    return loans.map((loan) => {
      const member = members.find((item) => item.id === loan.member_id);
      const book = books.find((item) => item.id === loan.book_id);
      const status = getStatus(loan);

      const overdueDays = loan.return_date
        ? daysBetween(loan.due_date, loan.return_date)
        : status.overdue
          ? daysBetween(loan.due_date, today())
          : 0;

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
        fine: Number(loan.fine_amount || 0),
      };
    });
  }, [loans, members, books]);

  const activeLoansByBook = useMemo(() => {
    const counts = {};

    loans.forEach((loan) => {
      const returned =
        loan.status === "dikembalikan" || Boolean(loan.return_date);

      if (!returned && loan.book_id) {
        counts[loan.book_id] = (counts[loan.book_id] || 0) + 1;
      }
    });

    return counts;
  }, [loans]);

  const bookRows = useMemo(() => {
    return books.map((book, index) => {
      const author = authors.find((item) => item.id === book.author_id);
      const category = categories.find(
        (item) => item.id === book.category_id
      );

      const total = Number(book.total_copies || 0);
      const available = Number(book.available_copies || 0);
      const borrowed =
        activeLoansByBook[book.id] || Math.max(0, total - available);

      return {
        No: index + 1,
        "Kode Buku": book.book_code || "-",
        "Judul Buku": book.title || "-",
        Pengarang: author?.name || "-",
        Kategori: category?.name || "-",
        ISBN: book.isbn || "-",
        Penerbit: book.publisher || book.publisher_name || "-",
        "Tahun Terbit":
          book.publication_year ||
          book.published_year ||
          book.year_published ||
          "-",
        "Asal Perolehan": book.acquisition_source || "Belum dicatat",
        "Total Eksemplar": total,
        "Sedang Dipinjam": borrowed,
        "Stok Tersedia": available,
        Status: book.status || (available > 0 ? "Tersedia" : "Habis"),
      };
    });
  }, [books, authors, categories, activeLoansByBook]);

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

  const reservationRows = useMemo(() => {
    const activeStatuses = ["menunggu", "tersedia"];

    return reservations.map((reservation, index) => {
      const member = members.find(
        (item) => item.id === reservation.member_id
      );
      const book = books.find((item) => item.id === reservation.book_id);

      const queue = reservations
        .filter(
          (item) =>
            item.book_id === reservation.book_id &&
            activeStatuses.includes(
              String(item.status || "").toLowerCase()
            ) &&
            new Date(item.created_at || item.reservation_date || 0) <=
              new Date(
                reservation.created_at ||
                  reservation.reservation_date ||
                  0
              )
        )
        .sort(
          (a, b) =>
            new Date(a.created_at || a.reservation_date || 0) -
            new Date(b.created_at || b.reservation_date || 0)
        );

      return {
        No: index + 1,
        "Kode Reservasi": reservation.reservation_code || "-",
        "Nomor Anggota": member?.member_number || "-",
        "Nama Anggota": member?.full_name || "Anggota tidak ditemukan",
        "Kode Buku": book?.book_code || "-",
        "Judul Buku": book?.title || "Buku tidak ditemukan",
        "Tanggal Reservasi":
          reservation.reservation_date ||
          reservation.created_at?.slice(0, 10) ||
          "-",
        "Nomor Antrean": activeStatuses.includes(
          String(reservation.status || "").toLowerCase()
        )
          ? Math.max(
              1,
              queue.findIndex((item) => item.id === reservation.id) + 1
            )
          : "-",
        Status: reservation.status || "-",
      };
    });
  }, [reservations, members, books]);

  const visitRows = useMemo(() => {
    return visits
      .map((visit, index) => {
        const member = members.find(
          (item) => item.id === visit.member_id
        );

        return {
          id: visit.id,
          No: index + 1,
          "Nomor Anggota": member?.member_number || "-",
          "Nama Siswa": member?.full_name || "Anggota tidak ditemukan",
          Kelas: member?.class_name || "-",
          "Tanggal Kunjungan": visit.visit_date || "-",
          "Waktu Kunjungan": visit.visit_time || "-",
        };
      })
      .sort((a, b) => {
        const dateCompare = b["Tanggal Kunjungan"].localeCompare(
          a["Tanggal Kunjungan"]
        );

        if (dateCompare !== 0) return dateCompare;

        return b["Waktu Kunjungan"].localeCompare(
          a["Waktu Kunjungan"]
        );
      });
  }, [visits, members]);

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

  const filteredData = useMemo(() => {
    let rows = [];
    let sourceDates = [];

    if (reportType === "buku") {
      rows = bookRows;
      sourceDates = books.map((item) => ({
        id: item.id,
        date: item.created_at || item.updated_at,
      }));
    } else if (reportType === "anggota") {
      rows = memberRows;
      sourceDates = members.map((item) => ({
        id: item.id,
        date: item.created_at || item.updated_at,
      }));
    } else if (reportType === "peminjaman") {
      const data = allTransactions.filter((item) => !item.isReturned);
      rows = transactionRows(
        data.filter((item) =>
          isWithinPeriod(
            item.loan_date,
            periodMode,
            selectedMonth,
            selectedYear
          )
        )
      );
    } else if (reportType === "pengembalian") {
      const data = allTransactions.filter((item) => item.isReturned);
      rows = transactionRows(
        data.filter((item) =>
          isWithinPeriod(
            item.return_date || item.loan_date,
            periodMode,
            selectedMonth,
            selectedYear
          )
        )
      );
    } else if (reportType === "reservasi") {
      const data = reservations.filter((item) =>
        isWithinPeriod(
          item.reservation_date ||
            item.created_at?.slice(0, 10),
          periodMode,
          selectedMonth,
          selectedYear
        )
      );

      const ids = new Set(data.map((item) => item.reservation_code));
      rows = reservationRows.filter((item) =>
        ids.has(item["Kode Reservasi"])
      );
    } else if (reportType === "kunjungan") {
      rows = visitRows
        .filter((item) =>
          isWithinPeriod(
            item["Tanggal Kunjungan"],
            periodMode,
            selectedMonth,
            selectedYear
          )
        )
        .map(({ id, ...row }) => row);
    }

    if (reportType === "buku" || reportType === "anggota") {
      if (periodMode !== "all") {
        const validIds = new Set(
          sourceDates
            .filter((item) => {
              if (!item.date) return false;

              return isWithinPeriod(
                String(item.date).slice(0, 10),
                periodMode,
                selectedMonth,
                selectedYear
              );
            })
            .map((item) => item.id)
        );

        if (sourceDates.some((item) => item.date)) {
          rows =
            reportType === "buku"
              ? bookRows.filter((_, index) =>
                  validIds.has(books[index]?.id)
                )
              : memberRows.filter((_, index) =>
                  validIds.has(members[index]?.id)
                );
        }
      }
    }

    if (search.trim()) {
      const keyword = search.toLowerCase().trim();

      rows = rows.filter((row) =>
        Object.values(row).some((value) =>
          String(value ?? "").toLowerCase().includes(keyword)
        )
      );
    }

    return rows;
  }, [
    reportType,
    periodMode,
    selectedMonth,
    selectedYear,
    search,
    bookRows,
    memberRows,
    reservationRows,
    visitRows,
    books,
    members,
    reservations,
    allTransactions,
  ]);

  const filteredVisitDetails = useMemo(() => {
    return visitRows.filter((item) => {
      if (
        !isWithinPeriod(
          item["Tanggal Kunjungan"],
          periodMode,
          selectedMonth,
          selectedYear
        )
      ) {
        return false;
      }

      if (!search.trim()) return true;

      const keyword = search.toLowerCase().trim();

      return Object.values(item).some((value) =>
        String(value ?? "").toLowerCase().includes(keyword)
      );
    });
  }, [visitRows, periodMode, selectedMonth, selectedYear, search]);

  const visitChartData = useMemo(
    () => groupVisits(filteredVisitDetails, visitChartMode),
    [filteredVisitDetails, visitChartMode]
  );

  const classRecap = useMemo(
    () => groupVisitsByClass(filteredVisitDetails),
    [filteredVisitDetails]
  );

  const uniqueVisitStudents = useMemo(
    () =>
      new Set(
        filteredVisitDetails.map((item) => item["Nomor Anggota"])
      ).size,
    [filteredVisitDetails]
  );

  const dailyVisitRows = useMemo(
    () => groupVisits(filteredVisitDetails, "daily"),
    [filteredVisitDetails]
  );

  const monthlyVisitRows = useMemo(
    () => groupVisits(filteredVisitDetails, "monthly"),
    [filteredVisitDetails]
  );

  const yearlyVisitRows = useMemo(
    () => groupVisits(filteredVisitDetails, "yearly"),
    [filteredVisitDetails]
  );

  const recapRows =
    visitChartMode === "daily"
      ? dailyVisitRows
      : visitChartMode === "yearly"
        ? yearlyVisitRows
        : monthlyVisitRows;

  const reportTitle =
    reportOptions.find((item) => item.id === reportType)?.label ||
    "Laporan Perpustakaan";

  const totalBorrowing = loans.length;

  const totalReturning = loans.filter(
    (loan) =>
      loan.status === "dikembalikan" || Boolean(loan.return_date)
  ).length;

  const totalOverdue = allTransactions.filter(
    (loan) => loan.isOverdue
  ).length;

  const totalFine = loans.reduce(
    (total, loan) => total + Number(loan.fine_amount || 0),
    0
  );

  const getPeriodLabel = () => {
    if (periodMode === "monthly") {
      return `${getMonthName(selectedMonth)} ${selectedYear}`;
    }

    if (periodMode === "yearly") {
      return selectedYear;
    }

    return "Semua Data";
  };

  const getFileName = (extension) => {
    const safeTitle = reportTitle.replace(/\s+/g, "_");
    const safePeriod = getPeriodLabel().replace(/\s+/g, "_");

    return `Laporan_${safeTitle}_${safePeriod}_${today()}.${extension}`;
  };

  const createVisitChartImage = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 550;

    const chart = new Chart(canvas, {
      type: "bar",
      data: {
        labels: visitChartData.map((item) => item.label),
        datasets: [
          {
            label: "Jumlah Kunjungan",
            data: visitChartData.map((item) => item.total),
            backgroundColor: "#245B70",
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: false,
        animation: false,
        plugins: {
          title: {
            display: true,
            text: `Grafik Kunjungan ${visitChartMode}`,
            font: { size: 22 },
          },
        },
      },
    });

    const image = canvas.toDataURL("image/png");
    chart.destroy();

    return image;
  };

  const styleWorksheet = (worksheet) => {
    worksheet.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        cell.alignment = {
          vertical: "middle",
          wrapText: true,
        };

        if (rowNumber === 1) {
          cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF245B70" },
          };
        }
      });
    });

    worksheet.views = [{ state: "frozen", ySplit: 1 }];
    worksheet.autoFilter = {
      from: "A1",
      to: {
        row: Math.max(1, worksheet.rowCount),
        column: Math.max(1, worksheet.columnCount),
      },
    };

    worksheet.columns.forEach((column) => {
      let maxLength = 12;

      column.eachCell?.({ includeEmpty: false }, (cell) => {
        maxLength = Math.max(
          maxLength,
          String(cell.value ?? "").length
        );
      });

      column.width = Math.min(maxLength + 3, 35);
    });
  };

  const exportExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();

      workbook.creator = "PUSTAKARA";
      workbook.created = new Date();

      const worksheet = workbook.addWorksheet("Laporan");

      worksheet.addRow(["PUSTAKARA - LAPORAN PERPUSTAKAAN"]);
      worksheet.addRow([`Jenis Laporan: ${reportTitle}`]);
      worksheet.addRow([`Periode: ${getPeriodLabel()}`]);
      worksheet.addRow([`Jumlah Data: ${filteredData.length}`]);
      worksheet.addRow([]);

      if (filteredData.length) {
        const headers = Object.keys(filteredData[0]);

        worksheet.addRow(headers);
        filteredData.forEach((row) => {
          worksheet.addRow(headers.map((key) => row[key] ?? "-"));
        });

        const headerRow = worksheet.getRow(6);
        headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
        headerRow.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF245B70" },
        };

        headerRow.eachCell((cell) => {
          cell.alignment = {
            horizontal: "center",
            vertical: "middle",
          };
        });
      } else {
        worksheet.addRow(["Tidak ada data pada periode ini."]);
      }

      if (reportType === "kunjungan") {
        worksheet.addRow([]);
        worksheet.addRow(["REKAP KUNJUNGAN BERDASARKAN KELAS"]);
        worksheet.addRow(["Kelas", "Jumlah Kunjungan"]);

        classRecap.forEach((item) => {
          worksheet.addRow([
            item.Kelas,
            item["Jumlah Kunjungan"],
          ]);
        });

        worksheet.addRow([]);
        worksheet.addRow(["REKAP KUNJUNGAN HARIAN"]);
        worksheet.addRow(["Tanggal", "Jumlah Kunjungan"]);

        dailyVisitRows.forEach((item) => {
          worksheet.addRow([item.label, item.total]);
        });

        worksheet.addRow([]);
        worksheet.addRow(["REKAP KUNJUNGAN BULANAN"]);
        worksheet.addRow(["Bulan", "Jumlah Kunjungan"]);

        monthlyVisitRows.forEach((item) => {
          worksheet.addRow([item.label, item.total]);
        });

        worksheet.addRow([]);
        worksheet.addRow(["REKAP KUNJUNGAN TAHUNAN"]);
        worksheet.addRow(["Tahun", "Jumlah Kunjungan"]);

        yearlyVisitRows.forEach((item) => {
          worksheet.addRow([item.label, item.total]);
        });

        // Memindahkan grafik ke sheet tersendiri agar tidak menutupi tabel.
        const chartWorksheet = workbook.addWorksheet("Grafik Kunjungan");

        chartWorksheet.addRow(["PUSTAKARA - GRAFIK KUNJUNGAN KELAS"]);
        chartWorksheet.addRow([`Periode: ${getPeriodLabel()}`]);
        chartWorksheet.addRow([
          `Total Kunjungan: ${filteredVisitDetails.length}`,
        ]);
        chartWorksheet.addRow([
          `Jumlah Siswa Unik: ${uniqueVisitStudents}`,
        ]);
        chartWorksheet.addRow([
          `Tampilan Grafik: ${visitChartMode}`,
        ]);

        chartWorksheet.mergeCells("A1:H1");
        chartWorksheet.getCell("A1").font = {
          bold: true,
          size: 16,
          color: { argb: "FFFFFFFF" },
        };
        chartWorksheet.getCell("A1").fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF245B70" },
        };
        chartWorksheet.getCell("A1").alignment = {
          horizontal: "center",
          vertical: "middle",
        };
        chartWorksheet.getRow(1).height = 30;

        chartWorksheet.columns = [
          { width: 18 },
          { width: 18 },
          { width: 18 },
          { width: 18 },
          { width: 18 },
          { width: 18 },
          { width: 18 },
          { width: 18 },
        ];

        const imageId = workbook.addImage({
          base64: createVisitChartImage().split(",")[1],
          extension: "png",
        });

        // Gambar dimulai dari baris 7, terpisah dari informasi di atas.
        chartWorksheet.addImage(imageId, {
          tl: { col: 0, row: 6 },
          ext: { width: 900, height: 420 },
        });
      }

      styleWorksheet(worksheet);

      const buffer = await workbook.xlsx.writeBuffer();

      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = getFileName("xlsx");
      link.click();

      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Gagal mengekspor Excel:", err);
      alert("Gagal membuat file Excel: " + err.message);
    }
  };

  const exportPDF = () => {
    try {
      const doc = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
      });

      doc.setFontSize(16);
      doc.text("PUSTAKARA", 14, 15);

      doc.setFontSize(11);
      doc.text(`LAPORAN ${reportTitle.toUpperCase()}`, 14, 23);

      doc.setFontSize(9);
      doc.text(`Periode: ${getPeriodLabel()}`, 14, 30);
      doc.text(`Jumlah data: ${filteredData.length}`, 14, 36);

      const columns = filteredData.length
        ? Object.keys(filteredData[0])
        : [];

      const body = filteredData.map((row) =>
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
        head: [columns.length ? columns : ["Keterangan"]],
        body: body.length ? body : [["Tidak ada data pada periode ini."]],
        theme: "grid",
        styles: {
          fontSize: 7,
          cellPadding: 2,
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
        margin: { left: 14, right: 14 },
      });

      if (reportType === "kunjungan") {
        doc.addPage();

        doc.setFontSize(14);
        doc.text("GRAFIK KUNJUNGAN KELAS", 14, 15);

        doc.setFontSize(9);
        doc.text(
          `Total kunjungan: ${formatNumber(filteredVisitDetails.length)}`,
          14,
          23
        );
        doc.text(
          `Jumlah siswa unik: ${formatNumber(uniqueVisitStudents)}`,
          110,
          23
        );

        const chartImage = createVisitChartImage();

        doc.addImage(chartImage, "PNG", 14, 30, 260, 90);

        let currentY = 130;

        const addRecap = (title, rows, headers) => {
          if (currentY > 175) {
            doc.addPage();
            currentY = 18;
          }

          doc.setFontSize(11);
          doc.text(title, 14, currentY);

          autoTable(doc, {
            startY: currentY + 4,
            head: [headers],
            body: rows.length
              ? rows.map((item) => Object.values(item))
              : [["Tidak ada data", "-"]],
            theme: "grid",
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: {
              fillColor: [36, 91, 112],
              textColor: 255,
            },
            margin: { left: 14, right: 14 },
          });

          currentY = doc.lastAutoTable.finalY + 12;
        };

        addRecap(
          "Rekap Kunjungan Berdasarkan Kelas",
          classRecap,
          ["Kelas", "Jumlah Kunjungan"]
        );

        addRecap(
          "Rekap Kunjungan Harian",
          dailyVisitRows.map((item) => ({
            Tanggal: item.label,
            "Jumlah Kunjungan": item.total,
          })),
          ["Tanggal", "Jumlah Kunjungan"]
        );

        addRecap(
          "Rekap Kunjungan Bulanan",
          monthlyVisitRows.map((item) => ({
            Bulan: item.label,
            "Jumlah Kunjungan": item.total,
          })),
          ["Bulan", "Jumlah Kunjungan"]
        );

        addRecap(
          "Rekap Kunjungan Tahunan",
          yearlyVisitRows.map((item) => ({
            Tahun: item.label,
            "Jumlah Kunjungan": item.total,
          })),
          ["Tahun", "Jumlah Kunjungan"]
        );
      }

      doc.save(getFileName("pdf"));
    } catch (err) {
      console.error("Gagal mengekspor PDF:", err);
      alert("Gagal membuat file PDF: " + err.message);
    }
  };

  useEffect(() => {
    if (
      reportType !== "kunjungan" ||
      !chartCanvasRef.current ||
      !visitChartData.length
    ) {
      chartInstanceRef.current?.destroy();
      chartInstanceRef.current = null;
      return;
    }

    chartInstanceRef.current?.destroy();

    chartInstanceRef.current = new Chart(chartCanvasRef.current, {
      type: "bar",
      data: {
        labels: visitChartData.map((item) => item.label),
        datasets: [
          {
            label: "Jumlah Kunjungan",
            data: visitChartData.map((item) => item.total),
            backgroundColor: "#245B70",
            borderRadius: 6,
            maxBarThickness: 48,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) =>
                `${formatNumber(context.raw)} kunjungan`,
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { precision: 0 },
          },
        },
      },
    });

    return () => {
      chartInstanceRef.current?.destroy();
      chartInstanceRef.current = null;
    };
  }, [reportType, visitChartData]);

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

  const years = Array.from(
    { length: 10 },
    (_, index) => currentDate.getFullYear() - 5 + index
  );

  return (
    <section className="content laporan-page">
      <style>{`
        .laporan-page .report-heading{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:22px}
        .laporan-page .report-heading h2{margin:0 0 6px;font-size:21px}
        .laporan-page .report-heading p{margin:0;color:#778197;font-size:13px}
        .laporan-page .report-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:end}
        .laporan-page .export-button{border:1px solid #dfe5ef;border-radius:9px;padding:10px 13px;display:inline-flex;align-items:center;gap:7px;cursor:pointer;font-weight:600;background:white;color:#344054;font-size:12px;min-height:39px;white-space:nowrap}
        .laporan-page .export-button.excel{color:#16804a;border-color:#b9e4cb}
        .laporan-page .export-button.pdf{color:#c43c3c;border-color:#f0caca}
        .laporan-page .report-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin-bottom:22px}
        .laporan-page .report-card{background:white;border:1px solid #e9edf3;border-radius:12px;padding:18px;min-width:0}
        .laporan-page .report-card-top{display:flex;align-items:center;justify-content:space-between;gap:8px;color:#687386;font-size:13px}
        .laporan-page .report-card-icon{width:38px;height:38px;display:grid;place-items:center;border-radius:10px;background:#f1f5fb}
        .laporan-page .report-card h3{font-size:22px;margin:13px 0 0;overflow-wrap:anywhere}
        .laporan-page .report-panel{background:white;border:1px solid #e9edf3;border-radius:12px;padding:20px}
        .laporan-page .report-filters{display:flex;gap:12px;align-items:end;flex-wrap:wrap;margin-bottom:20px}
        .laporan-page .report-field{display:flex;flex-direction:column;gap:7px;min-width:150px}
        .laporan-page .report-field.search-field{flex:1;min-width:210px}
        .laporan-page .report-field label{font-size:12px;color:#687386;font-weight:600}
        .laporan-page .report-field input,.laporan-page .report-field select{width:100%;box-sizing:border-box;border:1px solid #dfe5ef;border-radius:8px;padding:10px 11px;background:white;color:#344054;outline:none;min-height:39px}
        .laporan-page .report-field input:focus,.laporan-page .report-field select:focus{border-color:#7098e5}
        .laporan-page .refresh-button{border:1px solid #dfe5ef;background:white;border-radius:8px;padding:10px 13px;display:flex;align-items:center;gap:7px;cursor:pointer;color:#475467;min-height:39px;white-space:nowrap}
        .laporan-page .report-table-wrap{overflow-x:auto;width:100%}
        .laporan-page .report-table{width:100%;min-width:750px;border-collapse:collapse;font-size:12px}
        .laporan-page .report-table th{background:#f6f8fb;color:#667085;text-align:left;padding:13px 11px;white-space:nowrap;font-size:11px}
        .laporan-page .report-table td{padding:13px 11px;border-bottom:1px solid #edf0f5;color:#475467}
        .laporan-page .report-empty{text-align:center;padding:35px 12px!important;color:#8993a3!important}
        .laporan-page .report-table-footer{display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-top:17px;color:#687386;font-size:13px}
        .laporan-page .visit-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-bottom:20px}
        .laporan-page .visit-summary-card{padding:17px;border:1px solid #e7edf1;border-radius:11px;background:#f9fbfc}
        .laporan-page .visit-summary-card span{font-size:13px;color:#687386}
        .laporan-page .visit-summary-card strong{display:block;font-size:24px;margin-top:8px;color:#245B70}
        .laporan-page .visit-chart-box{height:320px;position:relative;margin-top:15px}
        .laporan-page .visit-chart-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:15px 0}
        .laporan-page .visit-chart-tabs button{border:1px solid #dfe5ef;border-radius:8px;padding:8px 14px;background:white;color:#596579;cursor:pointer}
        .laporan-page .visit-chart-tabs button.active{background:#245B70;color:white;border-color:#245B70}
        .laporan-page .visit-recap{margin-top:22px}
        .laporan-page .visit-recap h4{margin:0 0 12px}
        .laporan-page .report-status{display:inline-block;padding:5px 9px;border-radius:20px;font-size:11px;font-weight:600;white-space:nowrap}
        .laporan-page .report-status.dipinjam{background:#fff4df;color:#a56b12}
        .laporan-page .report-status.dikembalikan{background:#e7f7ee;color:#16804a}
        .laporan-page .report-status.terlambat{background:#fdeaea;color:#c43c3c}
        .laporan-page button:disabled{opacity:.55;cursor:not-allowed}
        @media(max-width:1100px){
          .laporan-page .report-filters{align-items:stretch}
          .laporan-page .report-field{flex:1}
          .laporan-page .report-actions{flex:1;align-items:end}
        }
        @media(max-width:900px){
          .laporan-page .report-summary{grid-template-columns:repeat(2,minmax(0,1fr))}
        }
        @media(max-width:600px){
          .laporan-page .report-summary{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
          .laporan-page .report-card{padding:12px}
          .laporan-page .report-card h3{font-size:17px}
          .laporan-page .report-panel{padding:13px}
          .laporan-page .report-filters{align-items:stretch}
          .laporan-page .report-field{min-width:100%;flex:1}
          .laporan-page .report-actions{width:100%;flex:1}
          .laporan-page .report-actions .export-button{flex:1;justify-content:center}
          .laporan-page .visit-chart-box{height:260px}
          .laporan-page .visit-summary{grid-template-columns:1fr 1fr}
        }
      `}</style>

      <div className="report-heading">
        <div>
          <h2>Laporan Perpustakaan</h2>
          <p>Pilih jenis laporan dan periode untuk melihat atau mengunduh data.</p>
        </div>
      </div>

      {error && (
        <div className="report-panel" style={{ marginBottom: 18 }}>
          <p style={{ color: "#c43c3c" }}>
            Gagal memuat laporan: {error}
          </p>
          <button className="refresh-button" onClick={loadData}>
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
              {loading
                ? "..."
                : typeof card.value === "number"
                  ? formatNumber(card.value)
                  : card.value}
            </h3>
          </div>
        ))}
      </div>

      <section className="report-panel">
        <div className="report-filters">
          <div className="report-field">
            <label>Jenis Laporan</label>
            <select
              value={reportType}
              onChange={(event) => {
                setReportType(event.target.value);
                setSearch("");
              }}
            >
              {reportOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div className="report-field">
            <label>Periode Laporan</label>
            <select
              value={periodMode}
              onChange={(event) => setPeriodMode(event.target.value)}
            >
              {periodOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div className="report-actions">
            <button
              className="export-button excel"
              onClick={exportExcel}
              disabled={loading}
            >
              <FileSpreadsheet size={16} />
              Unduh Excel
            </button>

            <button
              className="export-button pdf"
              onClick={exportPDF}
              disabled={loading}
            >
              <FileDown size={16} />
              Unduh PDF
            </button>
          </div>

          {periodMode === "monthly" && (
            <div className="report-field">
              <label>Bulan</label>
              <select
                value={selectedMonth}
                onChange={(event) => setSelectedMonth(event.target.value)}
              >
                {Array.from({ length: 12 }, (_, index) => {
                  const month = String(index + 1).padStart(2, "0");

                  return (
                    <option key={month} value={month}>
                      {getMonthName(month)}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {periodMode !== "all" && (
            <div className="report-field">
              <label>Tahun</label>
              <select
                value={selectedYear}
                onChange={(event) => setSelectedYear(event.target.value)}
              >
                {years.map((year) => (
                  <option key={year} value={String(year)}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="report-field search-field">
            <label>
              <Search size={13} /> Cari Data
            </label>
            <input
              type="text"
              placeholder="Masukkan kata kunci..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
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

        <div className="report-table-footer" style={{ marginBottom: 16 }}>
          <span>
            <strong>{reportTitle}</strong> · Periode: {getPeriodLabel()}
          </span>
          <strong>{formatNumber(filteredData.length)} data</strong>
        </div>

        {reportType === "kunjungan" ? (
          <>
            <div className="visit-summary">
              <div className="visit-summary-card">
                <span>Total Kunjungan</span>
                <strong>
                  {loading
                    ? "..."
                    : formatNumber(filteredVisitDetails.length)}
                </strong>
              </div>

              <div className="visit-summary-card">
                <span>Siswa Unik</span>
                <strong>
                  {loading ? "..." : formatNumber(uniqueVisitStudents)}
                </strong>
              </div>

              <div className="visit-summary-card">
                <span>Jumlah Kelas</span>
                <strong>
                  {loading ? "..." : formatNumber(classRecap.length)}
                </strong>
              </div>
            </div>

            <div>
              <h3 style={{ margin: "0 0 5px" }}>
                Grafik Kunjungan Kelas
              </h3>
              <p style={{ margin: 0, color: "#778197", fontSize: 13 }}>
                Grafik dapat ditampilkan berdasarkan periode harian,
                bulanan, atau tahunan.
              </p>

              <div className="visit-chart-tabs">
                {[
                  { id: "daily", label: "Harian" },
                  { id: "monthly", label: "Bulanan" },
                  { id: "yearly", label: "Tahunan" },
                ].map((item) => (
                  <button
                    key={item.id}
                    className={
                      visitChartMode === item.id ? "active" : ""
                    }
                    onClick={() => setVisitChartMode(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="visit-chart-box">
                {loading ? (
                  <div className="report-empty">Memuat grafik...</div>
                ) : visitChartData.length ? (
                  <canvas ref={chartCanvasRef} />
                ) : (
                  <div className="report-empty">
                    Belum ada data kunjungan pada periode ini.
                  </div>
                )}
              </div>
            </div>

            <div className="visit-recap">
              <h4>
                Rekap Kunjungan{" "}
                {visitChartMode === "daily"
                  ? "Harian"
                  : visitChartMode === "yearly"
                    ? "Tahunan"
                    : "Bulanan"}
              </h4>

              <div className="report-table-wrap">
                <table className="report-table" style={{ minWidth: 400 }}>
                  <thead>
                    <tr>
                      <th>PERIODE</th>
                      <th>JUMLAH KUNJUNGAN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recapRows.length ? (
                      recapRows.map((item) => (
                        <tr key={item.label}>
                          <td>{item.label}</td>
                          <td>{formatNumber(item.total)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="2" className="report-empty">
                          Belum ada data rekap.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="visit-recap">
              <h4>Rekap Kunjungan Berdasarkan Kelas</h4>

              <div className="report-table-wrap">
                <table className="report-table" style={{ minWidth: 400 }}>
                  <thead>
                    <tr>
                      <th>KELAS</th>
                      <th>JUMLAH KUNJUNGAN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classRecap.length ? (
                      classRecap.map((item) => (
                        <tr key={item.Kelas}>
                          <td>{item.Kelas}</td>
                          <td>
                            {formatNumber(item["Jumlah Kunjungan"])}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="2" className="report-empty">
                          Belum ada data kunjungan.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="visit-recap">
              <h4>Detail Kunjungan Siswa</h4>

              <div className="report-table-wrap">
                <table className="report-table" style={{ minWidth: 750 }}>
                  <thead>
                    <tr>
                      <th>NO.</th>
                      <th>NOMOR ANGGOTA</th>
                      <th>NAMA SISWA</th>
                      <th>KELAS</th>
                      <th>TANGGAL KUNJUNGAN</th>
                      <th>WAKTU KUNJUNGAN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan="6" className="report-empty">
                          Memuat data kunjungan...
                        </td>
                      </tr>
                    ) : filteredVisitDetails.length ? (
                      filteredVisitDetails.map((item, index) => (
                        <tr key={item.id}>
                          <td>{index + 1}</td>
                          <td>{item["Nomor Anggota"]}</td>
                          <td>
                            <strong>{item["Nama Siswa"]}</strong>
                          </td>
                          <td>{item.Kelas}</td>
                          <td>
                            {formatDate(item["Tanggal Kunjungan"])}
                          </td>
                          <td>{item["Waktu Kunjungan"] || "-"}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="6" className="report-empty">
                          <Users
                            size={30}
                            style={{ marginBottom: 8 }}
                          />
                          <div>
                            Tidak ada kunjungan yang sesuai dengan periode.
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="report-table-footer">
                <span>
                  Menampilkan {formatNumber(filteredVisitDetails.length)}{" "}
                  kunjungan
                </span>
                <strong>
                  {formatNumber(uniqueVisitStudents)} siswa unik
                </strong>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="report-table-wrap">
              <table className="report-table">
                <thead>
                  <tr>
                    {filteredData.length ? (
                      Object.keys(filteredData[0]).map((key) => (
                        <th key={key}>{key.toUpperCase()}</th>
                      ))
                    ) : (
                      <th>KETERANGAN</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td
                        colSpan={
                          filteredData[0]
                            ? Object.keys(filteredData[0]).length
                            : 1
                        }
                        className="report-empty"
                      >
                        Memuat data laporan...
                      </td>
                    </tr>
                  ) : filteredData.length ? (
                    filteredData.map((row, index) => (
                      <tr key={index}>
                        {Object.entries(row).map(([key, value]) => (
                          <td key={key}>{String(value ?? "-")}</td>
                        ))}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="1" className="report-empty">
                        <ClipboardList
                          size={30}
                          style={{ marginBottom: 8 }}
                        />
                        <div>
                          Tidak ada data yang sesuai dengan pilihan laporan.
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="report-table-footer">
          <span>
            Jenis laporan: {reportTitle}
          </span>
          <strong>
            Total data: {formatNumber(filteredData.length)}
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
