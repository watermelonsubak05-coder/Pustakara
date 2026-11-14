
import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Plus,
  BookOpen,
  Clock,
  CheckCircle,
  Users,
  User,
  X,
  Save,
  Trash2,
  AlertCircle,
  AlertTriangle,
  ChevronDown,
} from "lucide-react";

import { supabase } from "../lib/supabase";
import ConfirmDeleteModal from "../components/ConfirmDeleteModal";

const getToday = () => {
  const date = new Date();

  return `${date.getFullYear()}-${String(
    date.getMonth() + 1
  ).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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

const statusLabel = {
  menunggu: "Menunggu",
  tersedia: "Tersedia",
  disetujui: "Disetujui",
  ditolak: "Ditolak",
  selesai: "Selesai",
  dibatalkan: "Dibatalkan",
};

const statusClass = {
  menunggu: "late",
  tersedia: "active",
  disetujui: "active",
  ditolak: "late",
  selesai: "returned",
  dibatalkan: "",
};

export default function Reservasi({ userRole }) {
  const canManage =
    userRole === "tim_pengembang" ||
    userRole === "pustakawan";

  const [reservations, setReservations] = useState([]);
  const [members, setMembers] = useState([]);
  const [books, setBooks] = useState([]);

  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [processingId, setProcessingId] = useState(null);

  const [showModal, setShowModal] = useState(false);
  const [notification, setNotification] = useState(null);

  const [memberSearch, setMemberSearch] = useState("");
  const [bookSearch, setBookSearch] = useState("");
  const [showMemberList, setShowMemberList] = useState(false);
  const [showBookList, setShowBookList] = useState(false);

  // STATE MODAL HAPUS
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [form, setForm] = useState({
    memberId: "",
    bookId: "",
    reservationDate: getToday(),
  });

  const showNotification = (type, message) => {
    setNotification({ type, message });

    setTimeout(() => {
      setNotification(null);
    }, 3500);
  };

  // MENGAMBIL DATA DARI SUPABASE
  const loadData = async () => {
    setLoading(true);

    try {
      const [
        reservationResult,
        memberResult,
        bookResult,
      ] = await Promise.all([
        supabase
          .from("reservations")
          .select("*")
          .order("created_at", { ascending: true }),

        supabase
          .from("members")
          .select("*")
          .order("full_name"),

        supabase
          .from("books")
          .select("*")
          .order("title"),
      ]);

      if (reservationResult.error) throw reservationResult.error;
      if (memberResult.error) throw memberResult.error;
      if (bookResult.error) throw bookResult.error;

      const activeMembers = (memberResult.data || []).filter(
        (member) =>
          String(member.status || "").toLowerCase() === "aktif"
      );

      setMembers(activeMembers);
      setBooks(bookResult.data || []);

      const memberMap = Object.fromEntries(
        (memberResult.data || []).map((member) => [
          member.id,
          member,
        ])
      );

      const bookMap = Object.fromEntries(
        (bookResult.data || []).map((book) => [
          book.id,
          book,
        ])
      );

      const formatted = (reservationResult.data || []).map(
        (item) => ({
          id: item.id,
          kode: item.reservation_code || "-",
          memberId: item.member_id,
          bookId: item.book_id,
          nama:
            memberMap[item.member_id]?.full_name ||
            "Anggota tidak ditemukan",
          nis: memberMap[item.member_id]?.nis || "-",
          buku:
            bookMap[item.book_id]?.title ||
            "Buku tidak ditemukan",
          kodeBuku:
            bookMap[item.book_id]?.book_code || "-",
          stok:
            Number(bookMap[item.book_id]?.available_copies) || 0,
          tanggal: item.reservation_date,
          status: item.status,
          dibuat: item.created_at,
        })
      );

      setReservations(formatted);
    } catch (error) {
      console.error("Gagal mengambil data:", error);

      showNotification(
        "warning",
        error.message || "Gagal mengambil data dari database."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // PENCARIAN ANGGOTA
  const filteredMembers = useMemo(() => {
    const keyword = memberSearch.toLowerCase().trim();

    return members.filter((member) =>
      [
        member.full_name,
        member.nis,
        member.member_number,
      ].some((value) =>
        String(value || "").toLowerCase().includes(keyword)
      )
    );
  }, [members, memberSearch]);

  // BUKU YANG STOKNYA HABIS
  const unavailableBooks = useMemo(() => {
    const keyword = bookSearch.toLowerCase().trim();

    return books.filter((book) => {
      const stock = Number(book.available_copies) || 0;

      const matchesSearch = [
        book.title,
        book.book_code,
      ].some((value) =>
        String(value || "").toLowerCase().includes(keyword)
      );

      return stock <= 0 && matchesSearch;
    });
  }, [books, bookSearch]);

  const selectedMember = members.find(
    (member) => member.id === form.memberId
  );

  const selectedBook = books.find(
    (book) => book.id === form.bookId
  );

  // ANTREAN AKTIF
  const activeReservations = useMemo(() => {
    return reservations.filter((item) =>
      ["menunggu", "tersedia", "disetujui"].includes(item.status)
    );
  }, [reservations]);

  // NOMOR ANTREAN PER BUKU
  const getQueueNumber = (item) => {
    if (
      ["selesai", "ditolak", "dibatalkan"].includes(item.status)
    ) {
      return "-";
    }

    const sameBook = activeReservations
      .filter(
        (reservation) => reservation.bookId === item.bookId
      )
      .sort((a, b) => {
        const difference =
          new Date(a.dibuat).getTime() -
          new Date(b.dibuat).getTime();

        if (difference !== 0) return difference;

        return String(a.id).localeCompare(String(b.id));
      });

    return (
      sameBook.findIndex(
        (reservation) => reservation.id === item.id
      ) + 1
    );
  };

  // STATISTIK
  const waitingCount = reservations.filter(
    (item) => item.status === "menunggu"
  ).length;

  const availableCount = reservations.filter(
    (item) => item.status === "tersedia"
  ).length;

  const activeQueueCount = activeReservations.length;

  // PENCARIAN RESERVASI
  const filteredReservations = reservations.filter((item) =>
    [
      item.kode,
      item.nama,
      item.nis,
      item.buku,
      item.kodeBuku,
    ].some((value) =>
      String(value || "").toLowerCase().includes(search.toLowerCase())
    )
  );

  // BUKA MODAL
  const openModal = () => {
    if (!canManage) return;

    setForm({
      memberId: "",
      bookId: "",
      reservationDate: getToday(),
    });

    setMemberSearch("");
    setBookSearch("");
    setShowMemberList(false);
    setShowBookList(false);
    setShowModal(true);
  };

  const closeModal = () => {
    if (saving) return;

    setShowModal(false);
    setShowMemberList(false);
    setShowBookList(false);
  };

  // PILIH ANGGOTA
  const selectMember = (member) => {
    if (!canManage) return;

    setForm((previous) => ({
      ...previous,
      memberId: member.id,
    }));

    setMemberSearch("");
    setShowMemberList(false);
  };

  // PILIH BUKU
  const selectBook = (book) => {
    if (!canManage) return;

    setForm((previous) => ({
      ...previous,
      bookId: book.id,
    }));

    setBookSearch("");
    setShowBookList(false);
  };

  // SIMPAN RESERVASI
  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!canManage) return;

    if (!form.memberId || !form.bookId) {
      showNotification(
        "warning",
        "Pilih anggota dan buku terlebih dahulu."
      );
      return;
    }

    const currentBook = books.find(
      (book) => book.id === form.bookId
    );

    if (
      !currentBook ||
      Number(currentBook.available_copies) > 0
    ) {
      showNotification(
        "warning",
        "Reservasi hanya dapat dilakukan jika stok buku habis."
      );
      return;
    }

    const alreadyReserved = reservations.some(
      (item) =>
        item.memberId === form.memberId &&
        item.bookId === form.bookId &&
        ["menunggu", "tersedia", "disetujui"].includes(
          item.status
        )
    );

    if (alreadyReserved) {
      showNotification(
        "warning",
        "Anggota ini sudah memiliki reservasi aktif untuk buku tersebut."
      );
      return;
    }

    setSaving(true);

    try {
      const reservationCode = `RSV${Date.now()
        .toString()
        .slice(-8)}`;

      const { error } = await supabase
        .from("reservations")
        .insert({
          reservation_code: reservationCode,
          member_id: form.memberId,
          book_id: form.bookId,
          reservation_date: form.reservationDate,
          status: "menunggu",
        });

      if (error) throw error;

      setShowModal(false);

      await loadData();

      showNotification(
        "success",
        "Reservasi buku berhasil ditambahkan."
      );
    } catch (error) {
      console.error("Gagal menambahkan reservasi:", error);

      showNotification(
        "warning",
        error.message || "Reservasi gagal disimpan."
      );
    } finally {
      setSaving(false);
    }
  };

  // MEMBUAT KODE PEMINJAMAN
  const generateLoanCode = async () => {
    const { data, error } = await supabase
      .from("loans")
      .select("loans_code");

    if (error) throw error;

    const highestNumber = (data || []).reduce(
      (highest, loan) => {
        const match = String(
          loan.loans_code || ""
        ).match(/^PJM(\d+)$/);

        const number = match ? Number(match[1]) : 0;

        return Math.max(highest, number);
      },
      0
    );

    return `PJM${String(highestNumber + 1).padStart(3, "0")}`;
  };

  // UBAH STATUS RESERVASI
  const updateStatus = async (item, newStatus) => {
    if (!canManage) return;
    if (item.status === newStatus) return;
    if (processingId) return;

    if (newStatus === "tersedia" && item.stok <= 0) {
      showNotification(
        "warning",
        "Stok buku belum tersedia. Reservasi belum dapat diubah menjadi Tersedia."
      );
      return;
    }

    if (
      newStatus === "disetujui" &&
      item.status !== "tersedia"
    ) {
      showNotification(
        "warning",
        "Reservasi harus berstatus Tersedia sebelum disetujui."
      );
      return;
    }

    if (
      newStatus === "selesai" &&
      item.status !== "disetujui"
    ) {
      showNotification(
        "warning",
        "Setujui reservasi terlebih dahulu sebelum menyelesaikannya."
      );
      return;
    }

    setProcessingId(item.id);

    try {
      if (newStatus === "disetujui") {
        const loanDate = getToday();

        const dueDateObject = new Date(
          `${loanDate}T00:00:00`
        );

        dueDateObject.setDate(
          dueDateObject.getDate() + 14
        );

        const dueDate = [
          dueDateObject.getFullYear(),
          String(dueDateObject.getMonth() + 1).padStart(2, "0"),
          String(dueDateObject.getDate()).padStart(2, "0"),
        ].join("-");

        const loanCode = await generateLoanCode();

        const { error } = await supabase.rpc(
          "approve_reservation_with_loan",
          {
            p_reservation_id: item.id,
            p_loan_date: loanDate,
            p_due_date: dueDate,
            p_loans_code: loanCode,
          }
        );

        if (error) throw error;

        await loadData();

        showNotification(
          "success",
          `Reservasi ${item.kode} disetujui. Transaksi ${loanCode} berhasil dibuat. Batas pengembalian ${formatDate(dueDate)}.`
        );

        return;
      }

      const { error } = await supabase
        .from("reservations")
        .update({ status: newStatus })
        .eq("id", item.id);

      if (error) throw error;

      await loadData();

      showNotification(
        "success",
        `Status reservasi diubah menjadi ${statusLabel[newStatus]}.`
      );
    } catch (error) {
      console.error("Gagal mengubah status:", error);

      showNotification(
        "warning",
        error.message || "Status gagal diperbarui."
      );
    } finally {
      setProcessingId(null);
    }
  };

  // BUKA KONFIRMASI HAPUS
  const deleteReservation = (item) => {
    if (!canManage) return;
    if (processingId || deleting) return;

    setDeleteTarget(item);
  };

  // PROSES HAPUS RESERVASI
  const handleDeleteReservation = async () => {
    if (!canManage || !deleteTarget || deleting) return;

    setDeleting(true);
    setProcessingId(deleteTarget.id);

    try {
      const { error } = await supabase
        .from("reservations")
        .delete()
        .eq("id", deleteTarget.id);

      if (error) throw error;

      const deletedCode = deleteTarget.kode;

      setDeleteTarget(null);

      await loadData();

      showNotification(
        "success",
        `Reservasi ${deletedCode} berhasil dihapus.`
      );
    } catch (error) {
      console.error("Gagal menghapus reservasi:", error);

      showNotification(
        "warning",
        error.message || "Reservasi gagal dihapus."
      );
    } finally {
      setProcessingId(null);
      setDeleting(false);
    }
  };

  return (
    <div className="page-content">
      {/* HEADER HALAMAN */}
      <div className="page-heading">
        <div>
          <span className="page-eyebrow">
            TRANSAKSI PERPUSTAKAAN
          </span>

          <h2>Reservasi Buku</h2>

          <p>
            Kelola antrean pemesanan buku ketika stok perpustakaan sedang habis.
          </p>
        </div>

        {canManage && (
          <button
            type="button"
            className="primary-button"
            onClick={openModal}
          >
            <Plus size={18} />
            Tambah Reservasi
          </button>
        )}
      </div>

      {/* RINGKASAN */}
      <div className="book-summary">
        <div className="member-summary-card">
          <div className="member-summary-icon late">
            <Clock size={22} />
          </div>

          <div className="member-summary-content">
            <span>Menunggu</span>
            <h3>{waitingCount}</h3>
          </div>
        </div>

        <div className="member-summary-card">
          <div className="member-summary-icon active">
            <CheckCircle size={22} />
          </div>

          <div className="member-summary-content">
            <span>Buku Tersedia</span>
            <h3>{availableCount}</h3>
          </div>
        </div>

        <div className="member-summary-card">
          <div className="member-summary-icon">
            <Users size={22} />
          </div>

          <div className="member-summary-content">
            <span>Daftar Antrean Aktif</span>
            <h3>{activeQueueCount}</h3>
          </div>
        </div>
      </div>

      {/* DAFTAR RESERVASI */}
      <section className="panel book-panel">
        <div className="book-toolbar">
          <div>
            <h3>Daftar Antrean Reservasi</h3>

            <p>
              Reservasi disusun berdasarkan waktu pengajuan untuk setiap buku.
            </p>

            <span className="member-total-badge">
              {filteredReservations.length} Reservasi
            </span>
          </div>

          <div className="search-box book-search">
            <Search size={17} />

            <input
              type="text"
              placeholder="Cari kode, nama, atau judul buku..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

            {search && (
              <button
                type="button"
                className="search-clear"
                onClick={() => setSearch("")}
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        <div className="table-scroll">
          <table className="data-table member-table">
            <thead>
              <tr>
                <th>No.</th>
                <th>No. Antrean</th>
                <th>Kode Reservasi</th>
                <th>Anggota</th>
                <th>Judul Buku</th>
                <th>Tanggal Reservasi</th>
                <th>Status</th>
                {canManage && <th>Aksi</th>}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={canManage ? 8 : 7}
                    className="member-empty"
                  >
                    Memuat data reservasi...
                  </td>
                </tr>
              ) : filteredReservations.length > 0 ? (
                filteredReservations.map((item, index) => (
                  <tr key={item.id}>
                    <td>{index + 1}</td>

                    <td>
                      <strong>{getQueueNumber(item)}</strong>
                    </td>

                    <td>
                      <span className="member-number">
                        {item.kode}
                      </span>
                    </td>

                    <td>
                      <div className="loan-person-cell">
                        <strong>{item.nama}</strong>
                        <span>NIS: {item.nis}</span>
                      </div>
                    </td>

                    <td>
                      <div className="loan-book-cell">
                        <strong>{item.buku}</strong>
                        <span>{item.kodeBuku}</span>
                      </div>
                    </td>

                    <td>{formatDate(item.tanggal)}</td>

                    <td>
                      <span
                        className={`member-status ${
                          statusClass[item.status] || ""
                        }`}
                      >
                        {statusLabel[item.status] || item.status}
                      </span>
                    </td>

                    {canManage && (
                      <td>
                        <div className="reservation-actions">
                          <select
                            className="reservation-status-select"
                            value={item.status}
                            disabled={processingId === item.id}
                            onChange={(event) =>
                              updateStatus(item, event.target.value)
                            }
                          >
                            {Object.entries(statusLabel).map(
                              ([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              )
                            )}
                          </select>

                          <button
                            type="button"
                            className="delete-action"
                            title="Hapus reservasi"
                            disabled={
                              processingId === item.id || deleting
                            }
                            onClick={() => deleteReservation(item)}
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
                    className="member-empty"
                  >
                    <BookOpen size={28} />
                    <strong>Belum ada data reservasi.</strong>
                    <span>
                      Belum ditemukan reservasi yang sesuai pencarian.
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* MODAL TAMBAH RESERVASI */}
      {showModal && canManage && (
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

                <h2>Tambah Reservasi</h2>

                <p>
                  Pilih anggota dan buku yang stoknya sedang habis.
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
                {/* PILIH ANGGOTA */}
                <label className="member-full-width search-select-label">
                  <span>
                    <User size={15} />
                    Nama Anggota <b>*</b>
                  </span>

                  <div className="search-select-wrapper">
                    <Search size={17} />

                    <input
                      type="text"
                      placeholder="Cari nama, NIS, atau nomor anggota..."
                      value={
                        selectedMember
                          ? selectedMember.full_name
                          : memberSearch
                      }
                      autoComplete="off"
                      onChange={(event) => {
                        setMemberSearch(event.target.value);
                        setForm((previous) => ({
                          ...previous,
                          memberId: "",
                        }));
                        setShowMemberList(true);
                      }}
                      onFocus={() => {
                        if (!selectedMember) {
                          setShowMemberList(true);
                          setShowBookList(false);
                        }
                      }}
                    />

                    {selectedMember ? (
                      <button
                        type="button"
                        className="search-clear"
                        onClick={() => {
                          setForm((previous) => ({
                            ...previous,
                            memberId: "",
                          }));
                          setMemberSearch("");
                          setShowMemberList(true);
                        }}
                      >
                        <X size={16} />
                      </button>
                    ) : (
                      <ChevronDown size={17} />
                    )}

                    {showMemberList && !selectedMember && (
                      <div className="search-select-dropdown">
                        {filteredMembers.length > 0 ? (
                          filteredMembers.map((member) => (
                            <button
                              type="button"
                              key={member.id}
                              className="search-select-option"
                              onClick={() => selectMember(member)}
                            >
                              <strong>{member.full_name}</strong>
                              <span>
                                {member.member_number || "-"}
                                {member.nis
                                  ? ` · NIS ${member.nis}`
                                  : ""}
                              </span>
                            </button>
                          ))
                        ) : (
                          <div className="search-select-empty">
                            Anggota tidak ditemukan.
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {selectedMember && (
                    <small className="reservation-selected-note">
                      <CheckCircle size={14} />
                      Anggota berhasil dipilih
                    </small>
                  )}
                </label>

                {/* PILIH BUKU */}
                <label className="member-full-width search-select-label">
                  <span>
                    <BookOpen size={15} />
                    Judul Buku <b>*</b>
                  </span>

                  <div className="search-select-wrapper">
                    <Search size={17} />

                    <input
                      type="text"
                      placeholder="Cari judul atau kode buku..."
                      value={
                        selectedBook
                          ? selectedBook.title
                          : bookSearch
                      }
                      autoComplete="off"
                      onChange={(event) => {
                        setBookSearch(event.target.value);
                        setForm((previous) => ({
                          ...previous,
                          bookId: "",
                        }));
                        setShowBookList(true);
                      }}
                      onFocus={() => {
                        if (!selectedBook) {
                          setShowBookList(true);
                          setShowMemberList(false);
                        }
                      }}
                    />

                    {selectedBook ? (
                      <button
                        type="button"
                        className="search-clear"
                        onClick={() => {
                          setForm((previous) => ({
                            ...previous,
                            bookId: "",
                          }));
                          setBookSearch("");
                          setShowBookList(true);
                        }}
                      >
                        <X size={16} />
                      </button>
                    ) : (
                      <ChevronDown size={17} />
                    )}

                    {showBookList && !selectedBook && (
                      <div className="search-select-dropdown">
                        {unavailableBooks.length > 0 ? (
                          unavailableBooks.map((book) => (
                            <button
                              type="button"
                              key={book.id}
                              className="search-select-option"
                              onClick={() => selectBook(book)}
                            >
                              <strong>{book.title}</strong>
                              <span>
                                {book.book_code} · Stok tersedia:{" "}
                                {Number(book.available_copies) || 0}
                              </span>
                            </button>
                          ))
                        ) : (
                          <div className="search-select-empty">
                            Tidak ada buku habis yang sesuai pencarian.
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {selectedBook && (
                    <small className="reservation-selected-note">
                      <CheckCircle size={14} />
                      Buku berhasil dipilih · Stok habis
                    </small>
                  )}

                  <small className="return-date-note">
                    Hanya buku dengan stok tersedia 0 yang dapat direservasi.
                  </small>
                </label>

                {/* TANGGAL RESERVASI */}
                <label>
                  Tanggal Reservasi <span>*</span>

                  <input
                    type="date"
                    value={form.reservationDate}
                    max={getToday()}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        reservationDate: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
              </div>

              <div className="return-late-info">
                <AlertTriangle size={18} />
                <span>
                  Anggota akan masuk antrean sesuai urutan waktu reservasi.
                </span>
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
                  {saving ? "Menyimpan..." : "Simpan Reservasi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL KONFIRMASI HAPUS */}
      {canManage && deleteTarget && (
        <ConfirmDeleteModal
          title="Hapus Reservasi?"
          highlightedText={`reservasi ${deleteTarget.kode}`}
          cancelText="Tidak"
          confirmText="Ya, Hapus"
          loading={deleting}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDeleteReservation}
        />
      )}

      {/* NOTIFIKASI */}
      {notification && (
        <div
          className={`book-notification ${
            notification.type === "success" ? "success" : "warning"
          }`}
        >
          <div className="notification-icon">
            {notification.type === "success" ? (
              <CheckCircle size={21} />
            ) : (
              <AlertCircle size={21} />
            )}
          </div>

          <div className="notification-content">
            <strong>
              {notification.type === "success"
                ? "Berhasil"
                : "Perhatian"}
            </strong>

            <span>{notification.message}</span>
          </div>

          <button
            type="button"
            className="notification-close"
            onClick={() => setNotification(null)}
          >
            <X size={17} />
          </button>
        </div>
      )}
    </div>
  );
}
