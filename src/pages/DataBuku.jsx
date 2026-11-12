
import { useEffect, useState } from "react";
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
  AlertTriangle,
} from "lucide-react";

import { supabase } from "../lib/supabase";

const categoryOptions = [
  "Buku Paket",
  "Fiksi",
  "Nonfiksi",
  "Referensi",
];

const emptyForm = {
  code: "",
  title: "",
  author: "",
  category: "Buku Paket",
  stock: "",
};

function DataBuku() {
  const [books, setBooks] = useState([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [notification, setNotification] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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

  // Mengambil data dari Supabase
  async function loadBooks() {
    setLoading(true);

    try {
      const [bookResult, authorResult, categoryResult] =
        await Promise.all([
          supabase.from("books").select("*").order("created_at", {
            ascending: false,
          }),
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
          code: book.book_code,
          title: book.title,
          author: author?.name || "-",
          authorId: book.author_id,
          category: category?.name || "-",
          categoryId: book.category_id,
          stock: book.total_copies,
          available: book.available_copies,
          status: book.status,
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

  // Mencari atau membuat pengarang
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

  // Mencari atau membuat kategori
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
    `${book.code} ${book.title} ${book.author} ${book.category}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  function openAddForm() {
    setEditingId(null);
    setForm({ ...emptyForm });
    setShowForm(true);
  }

  function openEditForm(book) {
    setEditingId(book.id);

    setForm({
      code: book.code,
      title: book.title,
      author: book.author === "-" ? "" : book.author,
      category: categoryOptions.includes(book.category)
        ? book.category
        : "Buku Paket",
      stock: String(book.stock),
    });

    setShowForm(true);
  }

  function closeForm() {
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

  // Menyimpan buku ke Supabase
  async function handleSubmit(event) {
    event.preventDefault();

    if (
      !form.code.trim() ||
      !form.title.trim() ||
      !form.author.trim() ||
      form.stock === "" ||
      !Number.isInteger(Number(form.stock)) ||
      Number(form.stock) < 0
    ) {
      notify(
        "warning",
        "Data belum lengkap",
        "Periksa kembali formulir. Stok harus bilangan bulat dan tidak negatif."
      );
      return;
    }

    const duplicate = books.some(
      (book) =>
        book.code.toLowerCase() === form.code.trim().toLowerCase() &&
        book.id !== editingId
    );

    if (duplicate) {
      notify(
        "warning",
        "Kode buku sudah digunakan",
        "Silakan gunakan kode buku yang berbeda."
      );
      return;
    }

    setSaving(true);

    try {
      const authorId = await getOrCreateAuthor(form.author);
      const categoryId = await getOrCreateCategory(form.category);

      const stock = Number(form.stock);

      const bookData = {
        book_code: form.code.trim(),
        title: form.title.trim(),
        author_id: authorId,
        category_id: categoryId,
        total_copies: stock,
        status: stock > 0 ? "Tersedia" : "Habis",
      };

      if (editingId !== null) {
        const oldBook = books.find((book) => book.id === editingId);

        const borrowed = Math.max(
          0,
          oldBook.stock - oldBook.available
        );

        bookData.available_copies = Math.max(0, stock - borrowed);

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
          `Data buku "${form.title}" berhasil diperbarui di database.`
        );
      } else {
        bookData.available_copies = stock;

        const { error } = await supabase
          .from("books")
          .insert(bookData);

        if (error) throw error;

        closeForm();
        await loadBooks();

        notify(
          "success",
          "Buku berhasil ditambahkan",
          `Buku "${form.title}" berhasil disimpan ke Supabase.`
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

  // Menghapus buku
  async function confirmDelete() {
    if (!deleteTarget) return;

    const deletedTitle = deleteTarget.title;

    try {
      const { error } = await supabase
        .from("books")
        .delete()
        .eq("id", deleteTarget.id);

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
        error.message || "Terjadi kesalahan saat menghapus buku."
      );
    }
  }

  const totalStock = books.reduce(
    (total, book) => total + (Number(book.stock) || 0),
    0
  );

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

        <button className="primary-button" onClick={openAddForm}>
          <Plus size={18} />
          Tambah Buku
        </button>
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
      </div>

      <section className="panel book-panel">
        <div className="book-toolbar">
          <div>
            <h3>Daftar Koleksi Buku</h3>
            <p>Informasi koleksi buku perpustakaan.</p>
          </div>

          <div className="search-box book-search">
            <Search size={17} />
            <input
              type="text"
              placeholder="Cari judul, penulis, atau kode..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>KODE BUKU</th>
                <th>JUDUL BUKU</th>
                <th>PENGARANG</th>
                <th>KATEGORI</th>
                <th>STOK</th>
                <th>AKSI</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" className="empty-data">
                    Memuat data dari database...
                  </td>
                </tr>
              ) : filteredBooks.length > 0 ? (
                filteredBooks.map((book) => (
                  <tr key={book.id}>
                    <td>{book.code}</td>
                    <td><strong>{book.title}</strong></td>
                    <td>{book.author}</td>
                    <td>
                      <span className="book-category">
                        {book.category}
                      </span>
                    </td>
                    <td>{book.available}</td>
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
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="empty-data">
                    {search
                      ? "Buku tidak ditemukan."
                      : "Belum ada data buku. Silakan tambahkan buku baru."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {showForm && (
        <div className="book-modal-overlay">
          <div className="book-modal">
            <div className="book-modal-heading">
              <div>
                <span className="modal-eyebrow">
                  {editingId !== null ? "UBAH KOLEKSI" : "KOLEKSI BARU"}
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
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <label>Kode Buku</label>
              <input
                name="code"
                value={form.code}
                onChange={handleChange}
                placeholder="Contoh: BK006"
                required
              />

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

      {deleteTarget && (
        <div className="book-modal-overlay">
          <div className="delete-modal">
            <div className="delete-icon">
              <AlertTriangle size={28} />
            </div>

            <h2>Hapus Data Buku?</h2>
            <p>
              Kamu akan menghapus buku{" "}
              <strong>{deleteTarget.title}</strong>.
              Tindakan ini tidak dapat dibatalkan.
            </p>

            <div className="book-modal-actions">
              <button
                className="cancel-button"
                onClick={() => setDeleteTarget(null)}
              >
                Batal
              </button>

              <button
                className="confirm-delete-button"
                onClick={confirmDelete}
              >
                <Trash2 size={17} />
                Ya, Hapus Buku
              </button>
            </div>
          </div>
        </div>
      )}

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
