
import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Plus,
  BookOpen,
  Clock,
  CheckCircle,
  Users,
  User,
  CalendarDays,
  X,
  Save,
  Trash2,
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  Check,
} from "lucide-react";

import { supabase } from "../lib/supabase";

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
  selesai: "active",
  dibatalkan: "",
};

export default function Reservasi() {
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

  // Mengambil data dari Supabase
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
            Number(
              bookMap[item.book_id]?.available_copies
            ) || 0,
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

  // Pencarian anggota
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

  // Pencarian buku yang stoknya habis
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

  // Antrean aktif
  const activeReservations = useMemo(() => {
    return reservations.filter((item) =>
      ["menunggu", "tersedia", "disetujui"].includes(item.status)
    );
  }, [reservations]);

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

        return a.id.localeCompare(b.id);
      });

    return (
      sameBook.findIndex(
        (reservation) => reservation.id === item.id
      ) + 1
    );
  };

  const waitingCount = reservations.filter(
    (item) => item.status === "menunggu"
  ).length;

  const availableCount = reservations.filter(
    (item) => item.status === "tersedia"
  ).length;

  const activeQueueCount = activeReservations.length;

  const filteredReservations = reservations.filter((item) =>
    [
      item.kode,
      item.nama,
      item.nis,
      item.buku,
      item.kodeBuku,
    ].some((value) =>
      String(value).toLowerCase().includes(search.toLowerCase())
    )
  );

  // Membuka modal
  const openModal = () => {
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

  // Memilih anggota
  const selectMember = (member) => {
    setForm((previous) => ({
      ...previous,
      memberId: member.id,
    }));

    setMemberSearch("");
    setShowMemberList(false);
  };

  // Memilih buku
  const selectBook = (book) => {
    setForm((previous) => ({
      ...previous,
      bookId: book.id,
    }));

    setBookSearch("");
    setShowBookList(false);
  };

  // Menambahkan reservasi
  const handleSubmit = async (event) => {
    event.preventDefault();

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

  // Membuat kode peminjaman otomatis
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

  // Mengubah status reservasi
  const updateStatus = async (item, newStatus) => {
    if (item.status === newStatus) return;

    if (processingId) return;

    if (
      newStatus === "tersedia" &&
      item.stok <= 0
    ) {
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
      // Persetujuan membuat transaksi peminjaman
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
          String(
            dueDateObject.getMonth() + 1
          ).padStart(2, "0"),
          String(
            dueDateObject.getDate()
          ).padStart(2, "0"),
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

      // Perubahan status selain persetujuan
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

  // Menghapus reservasi
  const deleteReservation = async (item) => {
    if (processingId) return;

    const confirmed = window.confirm(
      `Hapus reservasi ${item.kode} atas nama ${item.nama}?`
    );

    if (!confirmed) return;

    setProcessingId(item.id);

    try {
      const { error } = await supabase
        .from("reservations")
        .delete()
        .eq("id", item.id);

      if (error) throw error;

      await loadData();

      showNotification(
        "success",
        "Reservasi berhasil dihapus."
      );
    } catch (error) {
      console.error("Gagal menghapus reservasi:", error);

      showNotification(
        "warning",
        error.message || "Reservasi gagal dihapus."
      );
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="book-page">
      <div className="book-page-header">
        <div>
          <h1>Reservasi Buku</h1>
          <p>
            Kelola antrean pemesanan buku ketika stok perpustakaan sedang habis.
          </p>
        </div>

        <button
          type="button"
          className="save-button"
          onClick={openModal}
        >
          <Plus size={18} />
          Tambah Reservasi
        </button>
      </div>

      {/* Ringkasan */}
      <div className="member-summary-grid">
        <div className="member-summary-card">
          <div className="member-summary-icon orange">
            <Clock size={21} />
          </div>
          <div>
            <span>Menunggu</span>
            <h2>{waitingCount}</h2>
          </div>
        </div>

        <div className="member-summary-card">
          <div className="member-summary-icon green">
            <CheckCircle size={21} />
          </div>
          <div>
            <span>Buku Tersedia</span>
            <h2>{availableCount}</h2>
          </div>
        </div>

        <div className="member-summary-card">
          <div className="member-summary-icon blue">
            <Users size={21} />
          </div>
          <div>
            <span>Daftar Antrean Aktif</span>
            <h2>{activeQueueCount}</h2>
          </div>
        </div>
      </div>

      {/* Tabel reservasi */}
      <div className="book-table-card">
        <div className="book-table-heading">
          <div>
            <h3>Daftar Antrean Reservasi</h3>
            <p>
              Reservasi disusun berdasarkan waktu pengajuan untuk setiap buku.
            </p>
          </div>

          <div className="book-search">
            <Search size={18} />

            <input
              type="text"
              placeholder="Cari kode, nama, atau judul buku..."
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
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

        <div className="book-table-wrapper">
          <table className="book-table">
            <thead>
              <tr>
                <th>No.</th>
                <th>No. Antrean</th>
                <th>Kode Reservasi</th>
                <th>Anggota</th>
                <th>Judul Buku</th>
                <th>Tanggal Reservasi</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="8" className="book-empty">
                    Memuat data reservasi...
                  </td>
                </tr>
              ) : filteredReservations.length > 0 ? (
                filteredReservations.map((item, index) => (
                  <tr key={item.id}>
                    <td>{index + 1}</td>

                    <td>
                      <strong>
                        {getQueueNumber(item)}
                      </strong>
                    </td>

                    <td>
                      <strong>{item.kode}</strong>
                    </td>

                    <td>
                      <div className="loan-person-cell">
                        <div className="loan-avatar">
                          <User size={16} />
                        </div>
                        <div>
                          <strong>{item.nama}</strong>
                          <small>NIS: {item.nis}</small>
                        </div>
                      </div>
                    </td>

                    <td>
                      <div className="loan-book-cell">
                        <strong>{item.buku}</strong>
                        <small>{item.kodeBuku}</small>
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

                    <td>
                      <div className="reservation-actions">
                        <select
                          className="reservation-status-select"
                          value={item.status}
                          disabled={processingId === item.id}
                          onChange={(event) =>
                            updateStatus(
                              item,
                              event.target.value
                            )
                          }
                        >
                          <option value="menunggu">
                            Menunggu
                          </option>
                          <option value="tersedia">
                            Tersedia
                          </option>
                          <option value="disetujui">
                            Disetujui
                          </option>
                          <option value="ditolak">
                            Ditolak
                          </option>
                          <option value="selesai">
                            Selesai
                          </option>
                          <option value="dibatalkan">
                            Dibatalkan
                          </option>
                        </select>

                        <button
                          type="button"
                          className="delete-action"
                          title="Hapus reservasi"
                          disabled={processingId === item.id}
                          onClick={() =>
                            deleteReservation(item)
                          }
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="8" className="book-empty">
                    Belum ada data reservasi.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="book-table-footer">
          Menampilkan {filteredReservations.length} dari{" "}
          {reservations.length} reservasi
        </div>
      </div>

      {/* Modal tambah reservasi */}
      {showModal && (
        <div className="book-modal-overlay">
          <div className="book-modal">
            <div className="book-modal-heading">
              <div>
                <span className="modal-eyebrow">
                  RESERVASI BUKU
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
              {/* Pencarian anggota */}
              <div className="return-date-field">
                <label>Nama Anggota</label>

                <div className="reservation-search-box">
                  <Search size={18} />

                  <input
                    type="text"
                    placeholder="Cari nama, NIS, atau nomor anggota..."
                    value={
                      selectedMember
                        ? selectedMember.full_name
                        : memberSearch
                    }
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
                      }
                    }}
                  />

                  {selectedMember ? (
                    <button
                      type="button"
                      onClick={() => {
                        setForm((previous) => ({
                          ...previous,
                          memberId: "",
                        }));

                        setMemberSearch("");
                        setShowMemberList(true);
                      }}
                    >
                      <X size={17} />
                    </button>
                  ) : (
                    <ChevronDown size={17} />
                  )}
                </div>

                {showMemberList && !selectedMember && (
                  <div className="reservation-option-list">
                    {filteredMembers.length > 0 ? (
                      filteredMembers.map((member) => (
                        <button
                          type="button"
                          key={member.id}
                          className="reservation-option"
                          onClick={() =>
                            selectMember(member)
                          }
                        >
                          <div className="reservation-option-icon">
                            <User size={18} />
                          </div>

                          <div className="reservation-option-info">
                            <strong>{member.full_name}</strong>
                            <small>
                              {member.member_number || "-"}
                              {member.nis
                                ? ` · NIS ${member.nis}`
                                : ""}
                            </small>
                          </div>

                          <Check size={17} />
                        </button>
                      ))
                    ) : (
                      <div className="reservation-no-result">
                        Anggota tidak ditemukan.
                      </div>
                    )}
                  </div>
                )}

                {selectedMember && (
                  <small className="reservation-selected-note">
                    <CheckCircle size={14} />
                    Anggota berhasil dipilih
                  </small>
                )}
              </div>

              {/* Pencarian buku */}
              <div className="return-date-field">
                <label>Judul Buku</label>

                <div className="reservation-search-box">
                  <Search size={18} />

                  <input
                    type="text"
                    placeholder="Cari judul atau kode buku..."
                    value={
                      selectedBook
                        ? selectedBook.title
                        : bookSearch
                    }
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
                      }
                    }}
                  />

                  {selectedBook ? (
                    <button
                      type="button"
                      onClick={() => {
                        setForm((previous) => ({
                          ...previous,
                          bookId: "",
                        }));

                        setBookSearch("");
                        setShowBookList(true);
                      }}
                    >
                      <X size={17} />
                    </button>
                  ) : (
                    <ChevronDown size={17} />
                  )}
                </div>

                {showBookList && !selectedBook && (
                  <div className="reservation-option-list">
                    {unavailableBooks.length > 0 ? (
                      unavailableBooks.map((book) => (
                        <button
                          type="button"
                          key={book.id}
                          className="reservation-option"
                          onClick={() =>
                            selectBook(book)
                          }
                        >
                          <div className="reservation-option-icon">
                            <BookOpen size={18} />
                          </div>

                          <div className="reservation-option-info">
                            <strong>{book.title}</strong>
                            <small>
                              {book.book_code} · Stok tersedia:{" "}
                              {Number(book.available_copies) || 0}
                            </small>
                          </div>

                          <span className="reservation-out-stock">
                            Habis
                          </span>
                        </button>
                      ))
                    ) : (
                      <div className="reservation-no-result">
                        Tidak ada buku habis yang sesuai pencarian.
                      </div>
                    )}
                  </div>
                )}

                {selectedBook && (
                  <small className="reservation-selected-note">
                    <CheckCircle size={14} />
                    Buku berhasil dipilih · Stok habis
                  </small>
                )}

                <small className="return-date-note">
                  Hanya buku dengan stok tersedia 0 yang dapat direservasi.
                </small>
              </div>

              {/* Tanggal reservasi */}
              <div className="return-date-field">
                <label htmlFor="reservationDate">
                  Tanggal Reservasi
                </label>

                <div className="return-date-input">
                  <CalendarDays size={18} />

                  <input
                    id="reservationDate"
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
                </div>
              </div>

              <div className="return-late-info">
                <AlertTriangle size={18} />
                <span>
                  Anggota akan masuk antrean sesuai urutan waktu reservasi.
                </span>
              </div>

              <div className="book-modal-actions">
                <button
                  type="button"
                  className="cancel-button"
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
                  {saving
                    ? "Menyimpan..."
                    : "Simpan Reservasi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Notifikasi */}
      {notification && (
        <div
          className={`book-notification ${
            notification.type === "success"
              ? "success"
              : "warning"
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
