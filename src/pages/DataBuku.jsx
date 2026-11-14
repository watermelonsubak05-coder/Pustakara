
import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import {
  Search,
  Plus,
  BookOpen,
  Pencil,
  Trash2,
  Filter,
  X,
  Save,
  CheckCircle,
  AlertCircle,
  Download,
  Upload,
  FileSpreadsheet,
  AlertTriangle,
} from "lucide-react";

import { supabase } from "../lib/supabase";
import ConfirmDeleteModal from "../components/ConfirmDeleteModal";

const categoryOptions = [
  "Buku Paket",
  "Fiksi",
  "Nonfiksi",
  "Referensi",
];

const acquisitionOptions = [
  "Dana BOS",
  "Hibah",
  "Bantuan Pemerintah",
  "Tukar-Menukar",
];

const emptyForm = {
  title: "",
  author: "",
  category: "Buku Paket",
  acquisitionSource: "Dana BOS",
  stock: "",
  ddcNumberManual: "",
};

function normalizeDdcNumber(value) {
  let number = String(value ?? "").trim();

  if (!number) return "";

  number = number.replace(",", ".");

  // Mengembalikan nol di depan untuk nomor DDC tiga digit.
  if (/^\d{1,3}$/.test(number)) {
    number = number.padStart(3, "0");
  }

  return number;
}

function getAuthorInitial(author) {
  const firstWord =
    String(author || "").trim().split(/\s+/)[0] || "";

  const letters = firstWord.replace(/[^a-zA-Z]/g, "");

  return letters.slice(0, 3).toUpperCase();
}

function getTitleInitial(title) {
  const firstLetter = String(title || "").match(/[a-zA-Z]/);

  return firstLetter ? firstLetter[0].toLowerCase() : "";
}

function generateBookCode(ddcNumber, author, title) {
  const ddc = normalizeDdcNumber(ddcNumber);
  const authorInitial = getAuthorInitial(author);
  const titleInitial = getTitleInitial(title);

  if (!ddc || !authorInitial || !titleInitial) return "";

  return `${ddc}-${authorInitial}-${titleInitial}`;
}

function BookCodeDisplay({ code, emptyText = "-" }) {
  if (!code) {
    return <span>{emptyText}</span>;
  }

  const parts = String(code).split("-");

  if (parts.length !== 3) {
    return <span>{code}</span>;
  }

  return (
    <div
      className="book-code-display"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        lineHeight: 1.4,
        fontWeight: 700,
        letterSpacing: "0.5px",
      }}
    >
      <span>{parts[0]}</span>
      <span>{parts[1]}</span>
      <span>{parts[2]}</span>
    </div>
  );
}

function DataBuku({ userRole }) {
  const [books, setBooks] = useState([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const [notification, setNotification] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // State impor Excel
  const [showImport, setShowImport] = useState(false);
  const [importPreview, setImportPreview] = useState([]);
  const [importFileName, setImportFileName] = useState("");
  const [readingFile, setReadingFile] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const canManage =
    userRole === "tim_pengembang" ||
    userRole === "pustakawan";

  useEffect(() => {
    loadBooks();
  }, []);

  useEffect(() => {
    if (!notification) return;

    const timer = setTimeout(() => {
      setNotification(null);
    }, 3500);

    return () => clearTimeout(timer);
  }, [notification]);

  function notify(type, title, message) {
    setNotification({ type, title, message });
  }

  async function loadBooks() {
    setLoading(true);

    try {
      const [
        bookResult,
        authorResult,
        categoryResult,
      ] = await Promise.all([
        supabase
          .from("books")
          .select("*")
          .order("created_at", { ascending: false }),

        supabase.from("authors").select("id, name"),

        supabase.from("categories").select("id, name"),
      ]);

      if (bookResult.error) throw bookResult.error;
      if (authorResult.error) throw authorResult.error;
      if (categoryResult.error) throw categoryResult.error;

      const authors = authorResult.data || [];
      const categories = categoryResult.data || [];

      const formattedBooks = (bookResult.data || []).map((book) => {
        const author = authors.find(
          (item) => item.id === book.author_id
        );

        const category = categories.find(
          (item) => item.id === book.category_id
        );

        return {
          id: book.id,
          code: book.book_code || "",
          title: book.title,
          author: author?.name || "-",
          category: category?.name || "-",
          stock: Number(book.total_copies) || 0,
          available: Number(book.available_copies) || 0,
          status: book.status,
          acquisitionSource:
            book.acquisition_source || "Belum dicatat",
          ddcNumber: book.ddc_number || "",
        };
      });

      setBooks(formattedBooks);
    } catch (error) {
      console.error("Gagal mengambil data buku:", error);

      notify(
        "warning",
        "Gagal memuat data",
        error.message || "Tidak dapat mengambil data dari Supabase."
      );
    } finally {
      setLoading(false);
    }
  }

  async function getOrCreateAuthor(name) {
    const cleanName = name.trim();

    const { data: existing, error: searchError } = await supabase
      .from("authors")
      .select("id")
      .ilike("name", cleanName)
      .limit(1)
      .maybeSingle();

    if (searchError) throw searchError;

    if (existing) return existing.id;

    const { data, error } = await supabase
      .from("authors")
      .insert({ name: cleanName })
      .select("id")
      .single();

    if (error) throw error;

    return data.id;
  }

  async function getOrCreateCategory(name) {
    const cleanName = name.trim();

    const { data: existing, error: searchError } = await supabase
      .from("categories")
      .select("id")
      .ilike("name", cleanName)
      .limit(1)
      .maybeSingle();

    if (searchError) throw searchError;

    if (existing) return existing.id;

    const { data, error } = await supabase
      .from("categories")
      .insert({
        name: cleanName,
        description: `Kategori ${cleanName}`,
      })
      .select("id")
      .single();

    if (error) throw error;

    return data.id;
  }

  const filteredBooks = books.filter((book) =>
    [
      book.code,
      book.title,
      book.author,
      book.category,
      book.acquisitionSource,
      book.ddcNumber,
    ]
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  function openAddForm() {
    if (!canManage) return;

    setEditingId(null);
    setForm({ ...emptyForm });
    setShowForm(true);
  }

  function openEditForm(book) {
    if (!canManage) return;

    setEditingId(book.id);

    setForm({
      title: book.title,
      author: book.author === "-" ? "" : book.author,
      category: categoryOptions.includes(book.category)
        ? book.category
        : "Buku Paket",
      acquisitionSource: acquisitionOptions.includes(
        book.acquisitionSource
      )
        ? book.acquisitionSource
        : "Dana BOS",
      stock: String(book.stock),
      ddcNumberManual: book.ddcNumber || "",
    });

    setShowForm(true);
  }

  function closeForm() {
    if (saving) return;

    setShowForm(false);
    setEditingId(null);
    setForm({ ...emptyForm });
  }

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  const authorInitial = getAuthorInitial(form.author);
  const titleInitial = getTitleInitial(form.title);

  const generatedCode = generateBookCode(
    form.ddcNumberManual,
    form.author,
    form.title
  );

  async function handleSubmit(event) {
    event.preventDefault();

    if (!canManage || saving) return;

    const ddcNumber = normalizeDdcNumber(form.ddcNumberManual);

    if (
      !form.title.trim() ||
      !form.author.trim() ||
      !ddcNumber ||
      !form.acquisitionSource ||
      form.stock === "" ||
      !Number.isSafeInteger(Number(form.stock)) ||
      Number(form.stock) < 0
    ) {
      notify(
        "warning",
        "Data belum lengkap",
        "Lengkapi nomor DDC, judul, pengarang, asal perolehan, dan stok buku."
      );
      return;
    }

    if (!/^\d{3}(\.\d+)?$/.test(ddcNumber)) {
      notify(
        "warning",
        "Nomor DDC tidak valid",
        "Masukkan nomor DDC berupa angka, misalnya 332.41 atau 398.2."
      );
      return;
    }

    if (!generatedCode) {
      notify(
        "warning",
        "Kode buku belum terbentuk",
        "Periksa kembali nomor DDC, nama pengarang, dan judul buku."
      );
      return;
    }

    const duplicate = books.some(
      (book) =>
        book.code.toLowerCase() === generatedCode.toLowerCase() &&
        book.id !== editingId
    );

    if (duplicate) {
      notify(
        "warning",
        "Kode buku sudah digunakan",
        "Kode yang terbentuk sama dengan kode buku lain. Periksa nomor DDC, pengarang, dan judul."
      );
      return;
    }

    const stock = Number(form.stock);

    const oldBook =
      editingId !== null
        ? books.find((book) => book.id === editingId)
        : null;

    if (editingId !== null && !oldBook) {
      notify(
        "warning",
        "Data buku tidak ditemukan",
        "Muat ulang halaman sebelum mencoba mengedit buku."
      );
      return;
    }

    const borrowed =
      oldBook !== null
        ? Math.max(0, oldBook.stock - oldBook.available)
        : 0;

    if (editingId !== null && stock < borrowed) {
      notify(
        "warning",
        "Stok tidak dapat dikurangi",
        `Ada ${borrowed} buku yang sedang dipinjam. Total stok minimal harus ${borrowed} eksemplar.`
      );
      return;
    }

    setSaving(true);

    try {
      const authorId = await getOrCreateAuthor(form.author);
      const categoryId = await getOrCreateCategory(form.category);

      const available =
        editingId !== null
          ? stock - borrowed
          : stock;

      const bookData = {
        book_code: generatedCode,
        title: form.title.trim(),
        author_id: authorId,
        category_id: categoryId,
        total_copies: stock,
        available_copies: available,
        status: available > 0 ? "Tersedia" : "Habis",
        acquisition_source: form.acquisitionSource,
        ddc_id: null,
        ddc_number: ddcNumber,
      };

      if (editingId !== null) {
        const { error } = await supabase
          .from("books")
          .update(bookData)
          .eq("id", editingId);

        if (error) throw error;

        closeForm();
        await loadBooks();

        notify(
          "success",
          "Perubahan berhasil disimpan",
          `Data buku "${form.title}" berhasil diperbarui.`
        );
      } else {
        const { error } = await supabase
          .from("books")
          .insert(bookData);

        if (error) throw error;

        closeForm();
        await loadBooks();

        notify(
          "success",
          "Buku berhasil ditambahkan",
          `Buku "${form.title}" berhasil disimpan ke database.`
        );
      }
    } catch (error) {
      console.error("Gagal menyimpan buku:", error);

      notify(
        "warning",
        "Gagal menyimpan buku",
        error.message || "Terjadi kesalahan saat menyimpan data."
      );
    } finally {
      setSaving(false);
    }
  }

  // =====================================================
  // TEMPLATE EXCEL
  // =====================================================

  function downloadTemplate() {
    const rows = [
      [
        "Nomor DDC",
        "Judul Buku",
        "Pengarang",
        "Kategori",
        "Asal Perolehan",
        "Stok",
      ],
      [
        "332.41",
        "Ekonomi untuk Anak",
        "Saputra",
        "Nonfiksi",
        "Dana BOS",
        10,
      ],
      [
        "398.2",
        "Dongeng Nusantara",
        "Andini",
        "Fiksi",
        "Hibah",
        5,
      ],
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(rows);

    worksheet["!cols"] = [
      { wch: 16 },
      { wch: 30 },
      { wch: 24 },
      { wch: 18 },
      { wch: 24 },
      { wch: 10 },
    ];

    // Memastikan nomor DDC diperlakukan sebagai teks.
    ["A2", "A3"].forEach((cell) => {
      if (worksheet[cell]) worksheet[cell].t = "s";
    });

    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "Template Data Buku"
    );

    XLSX.writeFile(workbook, "Template_Impor_Data_Buku.xlsx");
  }

  // =====================================================
  // MEMBACA DAN MEMVALIDASI EXCEL
  // =====================================================

  function getCellValue(row, possibleNames) {
    const keys = Object.keys(row);

    for (const name of possibleNames) {
      const matchedKey = keys.find(
        (key) =>
          key.trim().toLowerCase() === name.toLowerCase()
      );

      if (matchedKey !== undefined) {
        return row[matchedKey];
      }
    }

    return "";
  }

  function normalizeCategory(value) {
    const cleanValue = String(value || "").trim();

    return categoryOptions.find(
      (item) => item.toLowerCase() === cleanValue.toLowerCase()
    ) || "";
  }

  function normalizeAcquisition(value) {
    const cleanValue = String(value || "").trim();

    return acquisitionOptions.find(
      (item) => item.toLowerCase() === cleanValue.toLowerCase()
    ) || "";
  }

  function validateImportRows(rawRows) {
    const seenCodes = new Set(
      books
        .map((book) => book.code.toLowerCase())
        .filter(Boolean)
    );

    return rawRows.map((row, index) => {
      const ddcNumber = normalizeDdcNumber(
        getCellValue(row, [
          "Nomor DDC",
          "DDC",
          "Nomor Klasifikasi",
        ])
      );

      const title = String(
        getCellValue(row, [
          "Judul Buku",
          "Judul",
          "Nama Buku",
        ]) || ""
      ).trim();

      const author = String(
        getCellValue(row, [
          "Pengarang",
          "Penulis",
          "Nama Pengarang",
        ]) || ""
      ).trim();

      const rawCategory = getCellValue(row, [
        "Kategori",
        "Jenis Buku",
      ]);

      const category = normalizeCategory(rawCategory);

      const rawAcquisition = getCellValue(row, [
        "Asal Perolehan",
        "Asal Perolehan Buku",
        "Sumber Perolehan",
      ]);

      const acquisitionSource =
        normalizeAcquisition(rawAcquisition);

      const rawStock = getCellValue(row, [
        "Stok",
        "Jumlah Stok",
        "Jumlah",
      ]);

      const stock =
        rawStock === "" || rawStock === null
          ? NaN
          : Number(rawStock);

      const errors = [];

      if (!ddcNumber) {
        errors.push("Nomor DDC belum diisi");
      } else if (!/^\d{3}(\.\d+)?$/.test(ddcNumber)) {
        errors.push("Format nomor DDC tidak valid");
      }

      if (!title) errors.push("Judul buku belum diisi");
      if (!author) errors.push("Pengarang belum diisi");

      if (!category) {
        errors.push(
          `Kategori tidak sesuai. Pilihan: ${categoryOptions.join(", ")}`
        );
      }

      if (!acquisitionSource) {
        errors.push(
          `Asal perolehan tidak sesuai. Pilihan: ${acquisitionOptions.join(", ")}`
        );
      }

      if (
        !Number.isSafeInteger(stock) ||
        stock < 0
      ) {
        errors.push("Stok harus berupa bilangan bulat minimal 0");
      }

      const code = generateBookCode(
        ddcNumber,
        author,
        title
      );

      if (code) {
        const normalizedCode = code.toLowerCase();

        if (seenCodes.has(normalizedCode)) {
          errors.push(`Kode buku ${code} sudah digunakan`);
        } else {
          seenCodes.add(normalizedCode);
        }
      }

      return {
        rowNumber: index + 2,
        ddcNumber,
        title,
        author,
        category,
        acquisitionSource,
        stock,
        code,
        errors,
        valid: errors.length === 0,
      };
    });
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    const extension = file.name.split(".").pop().toLowerCase();

    if (!["xlsx", "xls", "csv"].includes(extension)) {
      notify(
        "warning",
        "Format file tidak didukung",
        "Gunakan file Excel .xlsx, .xls, atau .csv."
      );

      event.target.value = "";
      return;
    }

    setReadingFile(true);
    setImportPreview([]);
    setImportResult(null);
    setImportFileName(file.name);

    try {
      const arrayBuffer = await file.arrayBuffer();

      const workbook = XLSX.read(arrayBuffer, {
        type: "array",
        raw: false,
      });

      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

      const rawRows = XLSX.utils.sheet_to_json(firstSheet, {
        defval: "",
        raw: false,
      });

      if (!rawRows.length) {
        throw new Error("File Excel tidak memiliki data.");
      }

      const preview = validateImportRows(rawRows);

      setImportPreview(preview);

      notify(
        "success",
        "File berhasil dibaca",
        `${preview.length} baris data ditemukan. Periksa hasil validasi sebelum menyimpan.`
      );
    } catch (error) {
      console.error("Gagal membaca file Excel:", error);

      notify(
        "warning",
        "Gagal membaca file",
        error.message || "Periksa kembali format dan isi file."
      );

      setImportPreview([]);
    } finally {
      setReadingFile(false);
      event.target.value = "";
    }
  }

  function closeImport() {
    if (importing || readingFile) return;

    setShowImport(false);
    setImportPreview([]);
    setImportFileName("");
    setImportResult(null);
  }

  // =====================================================
  // MENYIMPAN DATA IMPOR
  // =====================================================

  async function handleImport() {
    if (!canManage || importing) return;

    const validRows = importPreview.filter((item) => item.valid);

    if (!validRows.length) {
      notify(
        "warning",
        "Tidak ada data valid",
        "Perbaiki data Excel sebelum melakukan impor."
      );
      return;
    }

    setImporting(true);

    let successCount = 0;
    let failedCount = 0;
    const failedDetails = [];

    try {
      for (const item of validRows) {
        try {
          const authorId = await getOrCreateAuthor(item.author);
          const categoryId = await getOrCreateCategory(item.category);

          const bookData = {
            book_code: item.code,
            title: item.title,
            author_id: authorId,
            category_id: categoryId,
            total_copies: item.stock,
            available_copies: item.stock,
            status: item.stock > 0 ? "Tersedia" : "Habis",
            acquisition_source: item.acquisitionSource,
            ddc_id: null,
            ddc_number: item.ddcNumber,
          };

          const { error } = await supabase
            .from("books")
            .insert(bookData);

          if (error) throw error;

          successCount++;
        } catch (error) {
          failedCount++;

          failedDetails.push({
            title: item.title,
            message: error.message || "Gagal menyimpan data",
          });
        }
      }

      await loadBooks();

      setImportResult({
        successCount,
        failedCount,
        failedDetails,
        invalidCount: importPreview.filter(
          (item) => !item.valid
        ).length,
      });

      if (successCount > 0) {
        notify(
          "success",
          "Impor selesai",
          `${successCount} buku berhasil disimpan ke database.`
        );
      } else {
        notify(
          "warning",
          "Impor belum berhasil",
          "Tidak ada buku yang berhasil disimpan. Periksa pesan kesalahan."
        );
      }
    } catch (error) {
      console.error("Gagal melakukan impor:", error);

      notify(
        "warning",
        "Impor gagal",
        error.message || "Terjadi kesalahan saat menyimpan data."
      );
    } finally {
      setImporting(false);
    }
  }

  async function confirmDelete() {
    if (!canManage || !deleteTarget || deleting) return;

    setDeleting(true);

    const deletedTitle = deleteTarget.title;
    const deletedId = deleteTarget.id;

    try {
      const { count: loanCount, error: loanError } = await supabase
        .from("loans")
        .select("id", { count: "exact", head: true })
        .eq("book_id", deletedId);

      if (loanError) throw loanError;

      const {
        count: reservationCount,
        error: reservationError,
      } = await supabase
        .from("reservations")
        .select("id", { count: "exact", head: true })
        .eq("book_id", deletedId);

      if (reservationError) throw reservationError;

      if ((loanCount || 0) > 0 || (reservationCount || 0) > 0) {
        setDeleteTarget(null);

        notify(
          "warning",
          "Buku tidak dapat dihapus",
          `Buku "${deletedTitle}" memiliki riwayat peminjaman atau reservasi. Data dipertahankan agar riwayat transaksi tidak rusak.`
        );

        return;
      }

      const { error } = await supabase
        .from("books")
        .delete()
        .eq("id", deletedId);

      if (error) throw error;

      setDeleteTarget(null);
      await loadBooks();

      notify(
        "success",
        "Buku berhasil dihapus",
        `Data buku "${deletedTitle}" sudah dihapus dari database.`
      );
    } catch (error) {
      console.error("Gagal menghapus buku:", error);

      setDeleteTarget(null);

      notify(
        "warning",
        "Gagal menghapus buku",
        error.message ||
          "Buku tidak dapat dihapus. Periksa hubungan data transaksi."
      );
    } finally {
      setDeleting(false);
    }
  }

  const totalStock = books.reduce(
    (total, book) => total + book.stock,
    0
  );

  const totalAvailable = books.reduce(
    (total, book) => total + book.available,
    0
  );

  const validImportCount = importPreview.filter(
    (item) => item.valid
  ).length;

  const invalidImportCount = importPreview.filter(
    (item) => !item.valid
  ).length;

  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <span className="page-breadcrumb">
            Menu Utama / Data Buku
          </span>
          <h1>Data Buku</h1>
          <p>Kelola seluruh koleksi buku perpustakaan sekolah.</p>
        </div>

        {canManage && (
          <div
            style={{
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setShowImport(true);
                setImportPreview([]);
                setImportResult(null);
              }}
            >
              <Upload size={18} />
              Impor Excel
            </button>

            <button
              className="primary-button"
              onClick={openAddForm}
            >
              <Plus size={18} />
              Tambah Buku
            </button>
          </div>
        )}
      </div>

      <div className="book-summary">
        <div>
          <BookOpen size={22} />
          <span>Total Judul Buku</span>
          <strong>{books.length}</strong>
        </div>

        <div>
          <Filter size={22} />
          <span>Total Stok Buku</span>
          <strong>{totalStock}</strong>
        </div>

        <div>
          <BookOpen size={22} />
          <span>Stok Tersedia</span>
          <strong>{totalAvailable}</strong>
        </div>
      </div>

      <section className="panel book-panel">
        <style>{`
          .book-panel .table-scroll .book-data-table {
            width: 100%;
            background: #ffffff !important;
            color: #334155 !important;
            border-collapse: collapse;
          }

          .book-panel .table-scroll .book-data-table thead th {
            background: #f1f5f9 !important;
            color: #475569 !important;
            padding: 15px 14px;
            white-space: nowrap;
            border-bottom: 1px solid #e2e8f0;
          }

          .book-panel .table-scroll .book-data-table tbody td {
            background: #ffffff !important;
            color: #334155 !important;
            padding: 15px 14px;
            border-bottom: 1px solid #e2e8f0;
          }

          .book-panel .table-scroll .book-data-table tbody tr:nth-child(even) td {
            background: #f8fafc !important;
          }

          .book-panel .table-scroll .book-data-table tbody tr:hover td {
            background: #eff6ff !important;
          }

          .book-panel .table-scroll .book-data-table .empty-data {
            text-align: center;
            padding: 30px;
            color: #64748b !important;
          }

          .import-modal-overlay {
            position: fixed;
            inset: 0;
            z-index: 9998;
            background: rgba(15, 23, 42, .55);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
          }

          .import-modal {
            width: 100%;
            max-width: 1050px;
            max-height: 90vh;
            overflow-y: auto;
            background: white;
            border-radius: 16px;
            padding: 26px;
            box-sizing: border-box;
            box-shadow: 0 20px 50px rgba(0,0,0,.18);
          }

          .import-table-wrap {
            width: 100%;
            overflow-x: auto;
            margin-top: 18px;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
          }

          .import-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
            min-width: 850px;
          }

          .import-table th {
            background: #f1f5f9;
            color: #475569;
            text-align: left;
            padding: 12px;
            white-space: nowrap;
          }

          .import-table td {
            padding: 12px;
            border-top: 1px solid #e2e8f0;
            color: #334155;
            vertical-align: top;
          }

          .import-status {
            display: inline-block;
            padding: 5px 9px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 700;
            white-space: nowrap;
          }

          .import-status.valid {
            background: #dcfce7;
            color: #166534;
          }

          .import-status.invalid {
            background: #fee2e2;
            color: #991b1b;
          }

          .import-stat {
            flex: 1;
            min-width: 120px;
            padding: 14px;
            border-radius: 10px;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
          }

          .import-stat strong {
            display: block;
            font-size: 22px;
            margin-top: 5px;
          }
        `}</style>

        <div className="book-toolbar">
          <div>
            <h3>Daftar Koleksi Buku</h3>
            <p>Informasi koleksi buku perpustakaan.</p>
          </div>

          <div className="search-box book-search">
            <Search size={17} />
            <input
              type="text"
              placeholder="Cari judul, penulis, kode..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>

        <div className="table-scroll">
          <table className="book-data-table">
            <thead>
              <tr>
                <th>KODE BUKU</th>
                <th>JUDUL BUKU</th>
                <th>PENGARANG</th>
                <th>KATEGORI</th>
                <th>ASAL PEROLEHAN</th>
                <th>STOK</th>
                {canManage && <th>AKSI</th>}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={canManage ? 7 : 6}
                    className="empty-data"
                  >
                    Memuat data dari database...
                  </td>
                </tr>
              ) : filteredBooks.length > 0 ? (
                filteredBooks.map((book) => (
                  <tr key={book.id}>
                    <td>
                      <BookCodeDisplay code={book.code} />
                    </td>

                    <td>
                      <strong>{book.title}</strong>
                    </td>

                    <td>{book.author}</td>

                    <td>
                      <span className="book-category">
                        {book.category}
                      </span>
                    </td>

                    <td>{book.acquisitionSource}</td>

                    <td>
                      <strong>{book.stock}</strong>
                      {" / "}
                      {book.available}
                    </td>

                    {canManage && (
                      <td>
                        <div className="book-actions">
                          <button
                            type="button"
                            className="edit-action"
                            title="Edit buku"
                            aria-label={`Edit ${book.title}`}
                            onClick={() => openEditForm(book)}
                          >
                            <Pencil size={16} />
                          </button>

                          <button
                            type="button"
                            className="delete-action"
                            title="Hapus buku"
                            aria-label={`Hapus ${book.title}`}
                            onClick={() => setDeleteTarget(book)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={canManage ? 7 : 6}
                    className="empty-data"
                  >
                    {search
                      ? "Buku tidak ditemukan."
                      : "Belum ada data buku."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* FORM TAMBAH DAN EDIT BUKU */}
      {canManage && showForm && (
        <div className="book-modal-overlay">
          <div className="book-modal">
            <div className="book-modal-heading">
              <div>
                <span className="modal-eyebrow">
                  {editingId !== null
                    ? "UBAH KOLEKSI"
                    : "KOLEKSI BARU"}
                </span>

                <h2>
                  {editingId !== null
                    ? "Edit Data Buku"
                    : "Tambah Buku Baru"}
                </h2>

                <p>
                  {editingId !== null
                    ? "Perbarui informasi buku melalui formulir berikut."
                    : "Isi informasi buku yang akan ditambahkan."}
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={closeForm}
                aria-label="Tutup formulir"
                disabled={saving}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <label>Judul Buku</label>
              <input
                name="title"
                value={form.title}
                onChange={handleChange}
                placeholder="Masukkan judul buku"
                required
              />

              <label>Pengarang</label>
              <input
                name="author"
                value={form.author}
                onChange={handleChange}
                placeholder="Masukkan nama pengarang"
                required
              />

              <label>Kategori</label>
              <select
                name="category"
                value={form.category}
                onChange={handleChange}
              >
                {categoryOptions.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>

              <label>Asal Perolehan Buku</label>
              <select
                name="acquisitionSource"
                value={form.acquisitionSource}
                onChange={handleChange}
                required
              >
                {acquisitionOptions.map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </select>

              <div className="ddc-form-section">
                <h3>Nomor Klasifikasi DDC</h3>

                <p>
                  Masukkan nomor DDC secara manual berdasarkan
                  penelusuran klasifikasi buku. Contoh: 332.41.
                </p>

                <div className="ddc-select-group">
                  <label>Nomor DDC</label>

                  <input
                    type="text"
                    name="ddcNumberManual"
                    value={form.ddcNumberManual}
                    onChange={handleChange}
                    placeholder="Contoh: 332.41"
                    required
                  />

                  <p className="form-helper">
                    Nomor DDC digunakan sebagai bagian pertama kode
                    buku.
                  </p>
                </div>

                <div className="ddc-select-group">
                  <label>3 Huruf Nama Pengarang Awal</label>

                  <input
                    type="text"
                    value={authorInitial}
                    placeholder="Otomatis dari nama pengarang"
                    readOnly
                  />
                </div>

                <div className="ddc-select-group">
                  <label>1 Huruf Judul Awal</label>

                  <input
                    type="text"
                    value={titleInitial}
                    placeholder="Otomatis dari judul buku"
                    readOnly
                  />
                </div>

                <div className="ddc-preview">
                  <span>Hasil Kode Buku</span>

                  {generatedCode ? (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "2px",
                        padding: "12px 0",
                        fontSize: "20px",
                        fontWeight: 700,
                        lineHeight: 1.35,
                      }}
                    >
                      <span>
                        {normalizeDdcNumber(form.ddcNumberManual)}
                      </span>
                      <span>{authorInitial}</span>
                      <span>{titleInitial}</span>
                    </div>
                  ) : (
                    <strong>
                      Lengkapi nomor DDC, pengarang, dan judul
                    </strong>
                  )}
                </div>
              </div>

              <label>Stok Buku</label>

              <input
                type="number"
                name="stock"
                min="0"
                step="1"
                value={form.stock}
                onChange={handleChange}
                placeholder="Masukkan jumlah stok"
                required
              />

              {editingId !== null && (
                <p className="form-helper">
                  Stok yang sedang dipinjam tidak dapat dikurangi.
                </p>
              )}

              <div className="book-modal-actions">
                <button
                  type="button"
                  className="cancel-button"
                  onClick={closeForm}
                  disabled={saving}
                >
                  Batal
                </button>

                <button
                  type="submit"
                  className="primary-button"
                  disabled={saving}
                >
                  <Save size={17} />

                  {saving
                    ? "Menyimpan..."
                    : editingId !== null
                      ? "Simpan Perubahan"
                      : "Simpan Buku"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL IMPOR EXCEL */}
      {canManage && showImport && (
        <div className="import-modal-overlay">
          <div className="import-modal">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "15px",
                marginBottom: "22px",
              }}
            >
              <div>
                <span className="modal-eyebrow">
                  IMPOR KOLEKSI
                </span>

                <h2 style={{ margin: "6px 0" }}>
                  Impor Data Buku
                </h2>

                <p style={{ color: "#64748b", margin: 0 }}>
                  Tambahkan banyak data buku melalui file Excel.
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={closeImport}
                disabled={importing || readingFile}
              >
                <X size={20} />
              </button>
            </div>

            {/* Unduh template */}
            <div
              style={{
                padding: "18px",
                border: "1px solid #dbeafe",
                background: "#eff6ff",
                borderRadius: "12px",
                marginBottom: "20px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  marginBottom: "12px",
                }}
              >
                <FileSpreadsheet
                  size={30}
                  color="#15803d"
                />

                <div>
                  <strong>Template Impor Data Buku</strong>
                  <p
                    style={{
                      margin: "4px 0 0",
                      fontSize: "13px",
                      color: "#64748b",
                    }}
                  >
                    Unduh dan isi template sebelum mengimpor.
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="primary-button"
                onClick={downloadTemplate}
              >
                <Download size={17} />
                Unduh Template Excel
              </button>
            </div>

            {/* Informasi kolom */}
            <div
              style={{
                padding: "15px",
                background: "#f8fafc",
                borderRadius: "10px",
                marginBottom: "20px",
                fontSize: "13px",
                color: "#475569",
                lineHeight: 1.7,
              }}
            >
              <strong>Petunjuk pengisian:</strong>
              <ul style={{ paddingLeft: "20px", marginBottom: 0 }}>
                <li>Nomor DDC diisi secara manual.</li>
                <li>Judul dan pengarang wajib diisi.</li>
                <li>
                  Kategori: {categoryOptions.join(", ")}.
                </li>
                <li>
                  Asal perolehan: {acquisitionOptions.join(", ")}.
                </li>
                <li>Stok harus berupa bilangan bulat minimal 0.</li>
                <li>
                  Kode buku akan dibuat otomatis oleh sistem.
                </li>
              </ul>
            </div>

            {/* Pilih file */}
            <div
              style={{
                border: "2px dashed #cbd5e1",
                borderRadius: "12px",
                padding: "22px",
                textAlign: "center",
                marginBottom: "20px",
              }}
            >
              <Upload
                size={32}
                color="#64748b"
                style={{ marginBottom: "10px" }}
              />

              <h3 style={{ margin: "0 0 6px" }}>
                Pilih File Excel
              </h3>

              <p
                style={{
                  fontSize: "13px",
                  color: "#64748b",
                  marginBottom: "15px",
                }}
              >
                Format yang didukung: .xlsx, .xls, dan .csv
              </p>

              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                disabled={readingFile || importing}
              />

              {importFileName && (
                <p
                  style={{
                    fontSize: "13px",
                    color: "#2563eb",
                    marginTop: "12px",
                    overflowWrap: "anywhere",
                  }}
                >
                  File: {importFileName}
                </p>
              )}

              {readingFile && (
                <p style={{ color: "#2563eb" }}>
                  Sedang membaca file...
                </p>
              )}
            </div>

            {/* Ringkasan validasi */}
            {importPreview.length > 0 && (
              <>
                <h3>Pratinjau Data Impor</h3>

                <div
                  style={{
                    display: "flex",
                    gap: "12px",
                    flexWrap: "wrap",
                    marginTop: "12px",
                  }}
                >
                  <div className="import-stat">
                    <span style={{ color: "#64748b", fontSize: "12px" }}>
                      Total Data
                    </span>
                    <strong>{importPreview.length}</strong>
                  </div>

                  <div className="import-stat">
                    <span style={{ color: "#15803d", fontSize: "12px" }}>
                      Data Valid
                    </span>
                    <strong style={{ color: "#15803d" }}>
                      {validImportCount}
                    </strong>
                  </div>

                  <div className="import-stat">
                    <span style={{ color: "#dc2626", fontSize: "12px" }}>
                      Data Bermasalah
                    </span>
                    <strong style={{ color: "#dc2626" }}>
                      {invalidImportCount}
                    </strong>
                  </div>
                </div>

                <div className="import-table-wrap">
                  <table className="import-table">
                    <thead>
                      <tr>
                        <th>Baris</th>
                        <th>Nomor DDC</th>
                        <th>Judul Buku</th>
                        <th>Pengarang</th>
                        <th>Kategori</th>
                        <th>Asal Perolehan</th>
                        <th>Stok</th>
                        <th>Kode Buku</th>
                        <th>Status</th>
                      </tr>
                    </thead>

                    <tbody>
                      {importPreview.map((item, index) => (
                        <tr key={`${item.rowNumber}-${index}`}>
                          <td>{item.rowNumber}</td>
                          <td>{item.ddcNumber || "-"}</td>
                          <td>{item.title || "-"}</td>
                          <td>{item.author || "-"}</td>
                          <td>{item.category || "-"}</td>
                          <td>{item.acquisitionSource || "-"}</td>
                          <td>
                            {Number.isNaN(item.stock)
                              ? "-"
                              : item.stock}
                          </td>
                          <td>
                            <BookCodeDisplay code={item.code} />
                          </td>
                          <td>
                            {item.valid ? (
                              <span className="import-status valid">
                                Valid
                              </span>
                            ) : (
                              <span className="import-status invalid">
                                Bermasalah
                              </span>
                            )}

                            {!item.valid && (
                              <ul
                                style={{
                                  paddingLeft: "16px",
                                  margin: "8px 0 0",
                                  color: "#dc2626",
                                  minWidth: "180px",
                                }}
                              >
                                {item.errors.map((error, errorIndex) => (
                                  <li key={errorIndex}>{error}</li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <p
                  style={{
                    fontSize: "12px",
                    color: "#64748b",
                    marginTop: "10px",
                  }}
                >
                  Hanya data berstatus Valid yang akan disimpan.
                  Data bermasalah harus diperbaiki di file Excel,
                  kemudian impor ulang.
                </p>
              </>
            )}

            {/* Hasil impor */}
            {importResult && (
              <div
                style={{
                  marginTop: "20px",
                  padding: "18px",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: "12px",
                }}
              >
                <h3 style={{ marginTop: 0 }}>
                  Hasil Impor
                </h3>

                <p>
                  <strong style={{ color: "#15803d" }}>
                    {importResult.successCount}
                  </strong>{" "}
                  buku berhasil disimpan.
                </p>

                <p>
                  <strong style={{ color: "#dc2626" }}>
                    {importResult.failedCount}
                  </strong>{" "}
                  buku gagal disimpan.
                </p>

                <p>
                  <strong>{importResult.invalidCount}</strong>{" "}
                  baris tidak valid dan dilewati.
                </p>

                {importResult.failedDetails.length > 0 && (
                  <div style={{ marginTop: "12px" }}>
                    <strong>Detail kegagalan:</strong>

                    {importResult.failedDetails.map((item, index) => (
                      <p
                        key={index}
                        style={{
                          fontSize: "13px",
                          color: "#dc2626",
                        }}
                      >
                        {item.title}: {item.message}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tombol modal */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
                marginTop: "24px",
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                className="cancel-button"
                onClick={closeImport}
                disabled={importing || readingFile}
              >
                {importResult ? "Tutup" : "Batal"}
              </button>

              {!importResult && (
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleImport}
                  disabled={
                    importing ||
                    readingFile ||
                    validImportCount === 0
                  }
                >
                  <Upload size={17} />

                  {importing
                    ? "Menyimpan..."
                    : `Simpan ${validImportCount} Data Valid`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL KONFIRMASI PENGHAPUSAN */}
      {canManage && deleteTarget && (
        <ConfirmDeleteModal
          title="Hapus Data Buku?"
          highlightedText="data buku"
          cancelText="Tidak"
          confirmText="Ya, Hapus"
          loading={deleting}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}

      {/* NOTIFIKASI */}
      {notification && (
        <div className={`book-notification ${notification.type}`}>
          <div className="notification-icon">
            {notification.type === "success" ? (
              <CheckCircle size={22} />
            ) : (
              <AlertCircle size={22} />
            )}
          </div>

          <div className="notification-content">
            <strong>{notification.title}</strong>
            <p>{notification.message}</p>
          </div>

          <button
            type="button"
            className="notification-close"
            onClick={() => setNotification(null)}
            aria-label="Tutup pemberitahuan"
          >
            <X size={18} />
          </button>
        </div>
      )}
    </div>
  );
}

export default DataBuku;
