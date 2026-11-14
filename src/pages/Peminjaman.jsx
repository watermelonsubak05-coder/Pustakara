
import { useEffect, useState } from "react";
import {
  Search,
  Plus,
  ArrowLeftRight,
  Pencil,
  Trash2,
  X,
  Save,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  BookOpen,
  User,
  ChevronDown,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import ConfirmDeleteModal from "../components/ConfirmDeleteModal";

const getToday = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getLoanStatus = (loan, referenceDate = getToday()) => {
  const status = String(loan.status || "dipinjam").toLowerCase();

  if (status === "dikembalikan" || loan.return_date) {
    return "dikembalikan";
  }

  if (loan.due_date && loan.due_date < referenceDate) {
    return "terlambat";
  }

  return "dipinjam";
};

const formatStatus = (status) => {
  if (status === "dipinjam") return "Dipinjam";
  if (status === "terlambat") return "Terlambat";
  if (status === "dikembalikan") return "Dikembalikan";
  return status;
};

const emptyForm = {
  memberId: "",
  nama: "",
  nis: "",
  nomorAnggota: "",
  bookId: "",
  buku: "",
  kodeBuku: "",
  tanggalPinjam: getToday(),
  tanggalKembali: "",
};

export default function Peminjaman({ userRole }) {
  const [loans, setLoans] = useState([]);
  const [members, setMembers] = useState([]);
  const [books, setBooks] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const canManage =
    userRole === "tim_pengembang" ||
    userRole === "pustakawan";

  const [search, setSearch] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [bookSearch, setBookSearch] = useState("");

  const [memberDropdownOpen, setMemberDropdownOpen] = useState(false);
  const [bookDropdownOpen, setBookDropdownOpen] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const [deleteId, setDeleteId] = useState(null);
  const [notification, setNotification] = useState(null);

  const loadData = async () => {
    setLoading(true);

    try {
      const [memberResult, bookResult, loanResult] =
        await Promise.all([
          supabase
            .from("members")
            .select(
              "id, member_number, full_name, nis, member_type, status"
            )
            .order("full_name", { ascending: true }),

          supabase
            .from("books")
            .select(
              "id, book_code, title, total_copies, available_copies, status"
            )
            .order("title", { ascending: true }),

          supabase
            .from("loans")
            .select("*")
            .order("loan_date", { ascending: false })
            .order("created_at", { ascending: false }),
        ]);

      if (memberResult.error) throw memberResult.error;
      if (bookResult.error) throw bookResult.error;
      if (loanResult.error) throw loanResult.error;

      const memberData = memberResult.data || [];
      const bookData = bookResult.data || [];
      const loanData = loanResult.data || [];

      setMembers(memberData);
      setBooks(bookData);

      const referenceDate = getToday();

      const formattedLoans = loanData.map((loan) => {
        const member = memberData.find(
          (item) => item.id === loan.member_id
        );

        const book = bookData.find(
          (item) => item.id === loan.book_id
        );

        return {
          id: loan.id,
          kode: loan.loans_code || "-",
          memberId: loan.member_id,
          nama: member?.full_name || "Anggota tidak ditemukan",
          nis: member?.nis || "-",
          nomorAnggota: member?.member_number || "-",
          bookId: loan.book_id,
          buku: book?.title || "Buku tidak ditemukan",
          kodeBuku: book?.book_code || "-",
          tanggalPinjam: loan.loan_date,
          tanggalKembali: loan.due_date,
          tanggalDikembalikan: loan.return_date,
          status: getLoanStatus(loan, referenceDate),
        };
      });

      setLoans(formattedLoans);
    } catch (error) {
      console.error("Gagal mengambil data peminjaman:", error);

      setNotification({
        type: "error",
        message:
          error.message || "Gagal mengambil data dari database.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const activeMembers = members.filter(
    (member) =>
      member.member_type === "siswa" &&
      member.status?.toLowerCase() === "aktif"
  );

  const filteredMemberOptions = activeMembers.filter((member) =>
    `${member.full_name} ${member.nis || ""} ${member.member_number}`
      .toLowerCase()
      .includes(memberSearch.toLowerCase())
  );

  const filteredBookOptions = books.filter((book) => {
    const keyword = bookSearch.toLowerCase();

    const matchesSearch = `${book.title} ${book.book_code}`
      .toLowerCase()
      .includes(keyword);

    const hasStock = Number(book.available_copies) > 0;
    const isCurrentBook = book.id === form.bookId;

    return matchesSearch && (hasStock || isCurrentBook);
  });

  const filteredLoans = loans.filter((loan) =>
    [
      loan.kode,
      loan.nama,
      loan.nis,
      loan.nomorAnggota,
      loan.buku,
      loan.kodeBuku,
      formatStatus(loan.status),
    ].some((value) =>
      String(value || "").toLowerCase().includes(search.toLowerCase())
    )
  );

  function openAddModal() {
    if (!canManage) return;

    setEditingId(null);
    setForm({
      ...emptyForm,
      tanggalPinjam: getToday(),
    });

    setMemberSearch("");
    setBookSearch("");
    setMemberDropdownOpen(false);
    setBookDropdownOpen(false);
    setModalOpen(true);
  }

  function openEditModal(loan) {
    if (!canManage) return;

    if (loan.status === "dikembalikan") {
      setNotification({
        type: "error",
        message:
          "Transaksi yang sudah dikembalikan tidak dapat diedit melalui halaman Peminjaman.",
      });
      return;
    }

    setEditingId(loan.id);

    setForm({
      memberId: loan.memberId,
      nama: loan.nama,
      nis: loan.nis,
      nomorAnggota: loan.nomorAnggota,
      bookId: loan.bookId,
      buku: loan.buku,
      kodeBuku: loan.kodeBuku,
      tanggalPinjam: loan.tanggalPinjam,
      tanggalKembali: loan.tanggalKembali,
    });

    setMemberSearch(loan.nama);
    setBookSearch(`${loan.buku} — ${loan.kodeBuku}`);

    setMemberDropdownOpen(false);
    setBookDropdownOpen(false);
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;

    setModalOpen(false);
    setMemberDropdownOpen(false);
    setBookDropdownOpen(false);
  }

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((previous) => {
      if (name === "tanggalPinjam") {
        return {
          ...previous,
          tanggalPinjam: value,
          tanggalKembali:
            previous.tanggalKembali &&
            previous.tanggalKembali < value
              ? ""
              : previous.tanggalKembali,
        };
      }

      return {
        ...previous,
        [name]: value,
      };
    });
  }

  function selectMember(member) {
    if (!canManage) return;

    setForm((previous) => ({
      ...previous,
      memberId: member.id,
      nama: member.full_name,
      nis: member.nis || "",
      nomorAnggota: member.member_number,
    }));

    setMemberSearch(member.full_name);
    setMemberDropdownOpen(false);
  }

  function selectBook(book) {
    if (!canManage) return;

    setForm((previous) => ({
      ...previous,
      bookId: book.id,
      buku: book.title,
      kodeBuku: book.book_code,
    }));

    setBookSearch(`${book.title} — ${book.book_code}`);
    setBookDropdownOpen(false);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!canManage || saving) return;

    if (
      !form.memberId ||
      !form.bookId ||
      !form.tanggalPinjam ||
      !form.tanggalKembali
    ) {
      setNotification({
        type: "error",
        message: "Mohon pilih anggota, buku, dan lengkapi tanggal.",
      });
      return;
    }

    if (form.tanggalKembali < form.tanggalPinjam) {
      setNotification({
        type: "error",
        message:
          "Batas pengembalian tidak boleh sebelum tanggal pinjam.",
      });
      return;
    }

    const today = getToday();

    const automaticStatus =
      form.tanggalKembali < today ? "terlambat" : "dipinjam";

    setSaving(true);

    try {
      const { data: settings, error: settingsError } = await supabase
        .from("library_settings")
        .select("max_books_per_member")
        .eq("id", 1)
        .maybeSingle();

      if (settingsError) throw settingsError;

      const maxBooks = Number(
        settings?.max_books_per_member ?? 2
      );

      const { data: memberLoans, error: memberLoansError } =
        await supabase
          .from("loans")
          .select("id, status, return_date, due_date")
          .eq("member_id", form.memberId);

      if (memberLoansError) throw memberLoansError;

      const activeLoanCount = (memberLoans || []).filter(
        (loan) =>
          loan.id !== editingId &&
          getLoanStatus(loan, today) !== "dikembalikan"
      ).length;

      if (activeLoanCount >= maxBooks) {
        setNotification({
          type: "error",
          message: `Anggota ini sudah mencapai batas maksimal ${maxBooks} buku. Silakan kembalikan buku terlebih dahulu.`,
        });

        return;
      }

      const { error } = await supabase.rpc(
        "save_loan_with_stock",
        {
          p_loan_id: editingId || null,
          p_member_id: form.memberId,
          p_book_id: form.bookId,
          p_loan_date: form.tanggalPinjam,
          p_due_date: form.tanggalKembali,
          p_status: automaticStatus,
          p_loans_code: null,
        }
      );

      if (error) throw error;

      const wasEditing = Boolean(editingId);

      setModalOpen(false);
      setForm(emptyForm);
      setEditingId(null);
      setMemberSearch("");
      setBookSearch("");
      setMemberDropdownOpen(false);
      setBookDropdownOpen(false);

      await loadData();

      setNotification({
        type: "success",
        message: wasEditing
          ? "Data peminjaman berhasil diperbarui dan stok disesuaikan."
          : "Peminjaman berhasil disimpan. Kode transaksi dibuat otomatis dan stok buku berkurang.",
      });
    } catch (error) {
      console.error("Gagal menyimpan peminjaman:", error);

      setNotification({
        type: "error",
        message: error.message || "Gagal menyimpan transaksi.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!canManage || !deleteId || deleting) return;

    setDeleting(true);

    try {
      const { error } = await supabase.rpc(
        "delete_loan_with_stock",
        {
          p_loan_id: deleteId,
        }
      );

      if (error) throw error;

      setDeleteId(null);
      await loadData();

      setNotification({
        type: "success",
        message:
          "Transaksi berhasil dihapus. Stok buku telah disesuaikan.",
      });
    } catch (error) {
      console.error("Gagal menghapus transaksi:", error);

      setNotification({
        type: "error",
        message: error.message || "Gagal menghapus transaksi.",
      });
    } finally {
      setDeleting(false);
    }
  }

  const totalDipinjam = loans.filter(
    (loan) => loan.status === "dipinjam"
  ).length;

  const totalTerlambat = loans.filter(
    (loan) => loan.status === "terlambat"
  ).length;

  const totalSelesai = loans.filter(
    (loan) => loan.status === "dikembalikan"
  ).length;

  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <span className="page-breadcrumb">
            Menu Utama / Peminjaman
          </span>
          <h1>Peminjaman Buku</h1>
          <p>
            Kelola transaksi peminjaman buku anggota perpustakaan.
          </p>
        </div>

        {canManage && (
          <button
            className="primary-button"
            onClick={openAddModal}
          >
            <Plus size={18} />
            Tambah Peminjaman
          </button>
        )}
      </div>

      <div className="book-summary">
        <div>
          <ArrowLeftRight size={22} />
          <span>Total Transaksi</span>
          <strong>{loans.length}</strong>
        </div>

        <div>
          <BookOpen size={22} />
          <span>Sedang Dipinjam</span>
          <strong>{totalDipinjam}</strong>
        </div>

        <div>
          <AlertTriangle size={22} />
          <span>Terlambat</span>
          <strong>{totalTerlambat}</strong>
        </div>

        <div>
          <CheckCircle size={22} />
          <span>Dikembalikan</span>
          <strong>{totalSelesai}</strong>
        </div>
      </div>

      <section className="panel book-panel">
        <div className="book-toolbar">
          <div>
            <h3>Daftar Peminjaman</h3>
            <p>Informasi seluruh transaksi peminjaman buku.</p>

            <span className="member-total-badge">
              {filteredLoans.length} Transaksi
            </span>
          </div>

          <div className="search-box book-search">
            <Search size={17} />

            <input
              type="text"
              placeholder="Cari kode, nama anggota, atau judul buku..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

            {search && (
              <button
                type="button"
                className="search-clear"
                onClick={() => setSearch("")}
                aria-label="Hapus pencarian"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>NO.</th>
                <th>KODE TRANSAKSI</th>
                <th>ANGGOTA</th>
                <th>BUKU</th>
                <th>TANGGAL PINJAM</th>
                <th>BATAS KEMBALI</th>
                <th>STATUS</th>
                {canManage && <th>AKSI</th>}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={canManage ? 8 : 7}
                    className="empty-data"
                  >
                    Memuat data peminjaman...
                  </td>
                </tr>
              ) : filteredLoans.length > 0 ? (
                filteredLoans.map((loan, index) => (
                  <tr key={loan.id}>
                    <td>{index + 1}</td>

                    <td>
                      <strong>{loan.kode}</strong>
                    </td>

                    <td>
                      <strong>{loan.nama}</strong>
                      <br />
                      <span>NIS: {loan.nis}</span>
                    </td>

                    <td>
                      <strong>{loan.buku}</strong>
                      <br />
                      <span>{loan.kodeBuku}</span>
                    </td>

                    <td>{loan.tanggalPinjam || "-"}</td>
                    <td>{loan.tanggalKembali || "-"}</td>

                    <td>
                      <span
                        className={`member-status ${
                          loan.status === "dipinjam"
                            ? "active"
                            : loan.status === "terlambat"
                              ? "late"
                              : "returned"
                        }`}
                      >
                        {formatStatus(loan.status)}
                      </span>
                    </td>

                    {canManage && (
                      <td>
                        <div className="book-actions">
                          {loan.status !== "dikembalikan" && (
                            <button
                              type="button"
                              className="edit-action"
                              title="Edit peminjaman"
                              onClick={() => openEditModal(loan)}
                            >
                              <Pencil size={16} />
                            </button>
                          )}

                          <button
                            type="button"
                            className="delete-action"
                            title="Hapus peminjaman"
                            onClick={() => setDeleteId(loan.id)}
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
                    colSpan={canManage ? 8 : 7}
                    className="empty-data"
                  >
                    {search
                      ? "Transaksi tidak ditemukan."
                      : "Belum ada transaksi peminjaman."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {canManage && modalOpen && (
        <div
          className="book-modal-overlay"
          onClick={closeModal}
        >
          <div
            className="book-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="book-modal-heading">
              <div>
                <span className="modal-eyebrow">
                  TRANSAKSI PERPUSTAKAAN
                </span>

                <h2>
                  {editingId ? "Edit Peminjaman" : "Tambah Peminjaman"}
                </h2>

                <p>
                  Lengkapi informasi transaksi peminjaman buku.
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={closeModal}
                disabled={saving}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="member-form-grid">
                <label className="member-full-width search-select-label">
                  <span>
                    <User size={15} />
                    Pilih Anggota <b>*</b>
                  </span>

                  <div className="search-select-wrapper">
                    <Search size={17} />

                    <input
                      type="text"
                      placeholder="Cari nama siswa, NIS, atau nomor anggota..."
                      value={memberSearch}
                      autoComplete="off"
                      onFocus={() => {
                        setMemberDropdownOpen(true);
                        setBookDropdownOpen(false);
                      }}
                      onChange={(event) => {
                        setMemberSearch(event.target.value);
                        setMemberDropdownOpen(true);

                        setForm((previous) => ({
                          ...previous,
                          memberId: "",
                          nama: "",
                          nis: "",
                          nomorAnggota: "",
                        }));
                      }}
                    />

                    <ChevronDown size={17} />

                    {memberDropdownOpen && (
                      <div className="search-select-dropdown">
                        {filteredMemberOptions.length > 0 ? (
                          filteredMemberOptions.map((member) => (
                            <button
                              type="button"
                              key={member.id}
                              className="search-select-option"
                              onClick={() => selectMember(member)}
                            >
                              <strong>{member.full_name}</strong>
                              <span>
                                {member.member_number} · NIS: {member.nis || "-"}
                              </span>
                            </button>
                          ))
                        ) : (
                          <div className="search-select-empty">
                            {activeMembers.length === 0
                              ? "Belum ada anggota siswa yang aktif."
                              : "Siswa tidak ditemukan."}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </label>

                <label className="member-full-width search-select-label">
                  <span>
                    <BookOpen size={15} />
                    Pilih Buku <b>*</b>
                  </span>

                  <div className="search-select-wrapper">
                    <Search size={17} />

                    <input
                      type="text"
                      placeholder="Cari judul buku atau kode buku..."
                      value={bookSearch}
                      autoComplete="off"
                      onFocus={() => {
                        setBookDropdownOpen(true);
                        setMemberDropdownOpen(false);
                      }}
                      onChange={(event) => {
                        setBookSearch(event.target.value);
                        setBookDropdownOpen(true);

                        setForm((previous) => ({
                          ...previous,
                          bookId: "",
                          buku: "",
                          kodeBuku: "",
                        }));
                      }}
                    />

                    <ChevronDown size={17} />

                    {bookDropdownOpen && (
                      <div className="search-select-dropdown">
                        {filteredBookOptions.length > 0 ? (
                          filteredBookOptions.map((book) => (
                            <button
                              type="button"
                              key={book.id}
                              className="search-select-option"
                              onClick={() => selectBook(book)}
                            >
                              <strong>{book.title}</strong>
                              <span>
                                Kode: {book.book_code} · Stok tersedia: {book.available_copies}
                              </span>
                            </button>
                          ))
                        ) : (
                          <div className="search-select-empty">
                            Tidak ada buku dengan stok tersedia.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </label>

                <label>
                  Tanggal Peminjaman <span>*</span>

                  <input
                    type="date"
                    name="tanggalPinjam"
                    value={form.tanggalPinjam}
                    onChange={handleChange}
                    onClick={(event) =>
                      event.currentTarget.showPicker?.()
                    }
                    required
                  />
                </label>

                <label>
                  Batas Pengembalian <span>*</span>

                  <input
                    type="date"
                    name="tanggalKembali"
                    value={form.tanggalKembali}
                    min={form.tanggalPinjam || undefined}
                    onChange={handleChange}
                    onClick={(event) =>
                      event.currentTarget.showPicker?.()
                    }
                    required
                  />
                </label>
              </div>

              <div className="book-modal-footer">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={closeModal}
                  disabled={saving}
                >
                  Batal
                </button>

                <button
                  type="submit"
                  className="save-button"
                  disabled={saving}
                >
                  <Save size={17} />
                  {saving ? "Menyimpan..." : "Simpan Data"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {canManage && deleteId && (
        <ConfirmDeleteModal
          title="Hapus Transaksi Peminjaman?"
          highlightedText="transaksi peminjaman"
          cancelText="Tidak"
          confirmText="Ya, Hapus"
          loading={deleting}
          onCancel={() => setDeleteId(null)}
          onConfirm={handleDelete}
        />
      )}

      {notification && (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            position: "fixed",
            top: "24px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 99999,
            width: "min(520px, calc(100vw - 32px))",
            boxSizing: "border-box",
            display: "flex",
            alignItems: "center",
            gap: "13px",
            padding: "16px 18px",
            background:
              notification.type === "success" ? "#F0FDF4" : "#FFF1F2",
            border:
              notification.type === "success"
                ? "1px solid #86EFAC"
                : "1px solid #FCA5A5",
            borderLeft:
              notification.type === "success"
                ? "5px solid #16A34A"
                : "5px solid #DC2626",
            borderRadius: "12px",
            boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
            color:
              notification.type === "success" ? "#166534" : "#991B1B",
          }}
        >
          <div
            style={{
              width: "38px",
              height: "38px",
              minWidth: "38px",
              borderRadius: "50%",
              background:
                notification.type === "success" ? "#DCFCE7" : "#FEE2E2",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color:
                notification.type === "success" ? "#16A34A" : "#DC2626",
            }}
          >
            {notification.type === "success" ? (
              <CheckCircle size={22} />
            ) : (
              <AlertCircle size={22} />
            )}
          </div>

          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: "5px",
              minWidth: 0,
            }}
          >
            <strong style={{ fontSize: "15px", fontWeight: 700 }}>
              {notification.type === "success"
                ? "Berhasil"
                : "Peringatan!"}
            </strong>

            <span
              style={{
                fontSize: "13px",
                lineHeight: 1.6,
                overflowWrap: "anywhere",
              }}
            >
              {notification.message}
            </span>
          </div>

          <button
            type="button"
            aria-label="Tutup notifikasi"
            title="Tutup notifikasi"
            onClick={() => setNotification(null)}
            style={{
              width: "30px",
              height: "30px",
              minWidth: "30px",
              border: "none",
              borderRadius: "7px",
              background:
                notification.type === "success" ? "#DCFCE7" : "#FEE2E2",
              color:
                notification.type === "success" ? "#166534" : "#B91C1C",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <X size={19} />
          </button>
        </div>
      )}
    </div>
  );
}
