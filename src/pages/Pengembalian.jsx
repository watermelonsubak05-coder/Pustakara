
import { useEffect, useMemo, useState } from "react";
import {
  Search,
  RotateCcw,
  CalendarDays,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  BookOpen,
  User,
  X,
  Clock,
  Wallet,
  Receipt,
} from "lucide-react";

import { supabase } from "../lib/supabase";

const DENDA_PER_HARI = 500;

const getToday = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const formatDate = (value) => {
  if (!value) return "-";

  return new Date(`${value}T00:00:00`).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};

const formatRupiah = (value) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
};

const calculateLateDays = (dueDate, returnDate) => {
  if (!dueDate || !returnDate) return 0;

  const due = new Date(`${dueDate}T00:00:00`);
  const returned = new Date(`${returnDate}T00:00:00`);

  const difference = Math.floor((returned - due) / 86400000);

  return Math.max(0, difference);
};

export default function Pengembalian() {
  const [returns, setReturns] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedReturn, setSelectedReturn] = useState(null);
  const [returnDate, setReturnDate] = useState(getToday());
  const [notification, setNotification] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  // Mengambil data transaksi dari Supabase
  const loadData = async () => {
    setLoading(true);

    try {
      const [loansResult, membersResult, booksResult] =
        await Promise.all([
          supabase
            .from("loans")
            .select("*")
            .order("created_at", { ascending: false }),

          supabase
            .from("members")
            .select("id, member_number, full_name, nis"),

          supabase
            .from("books")
            .select("id, book_code, title"),
        ]);

      if (loansResult.error) throw loansResult.error;
      if (membersResult.error) throw membersResult.error;
      if (booksResult.error) throw booksResult.error;

      const memberMap = Object.fromEntries(
        membersResult.data.map((member) => [member.id, member])
      );

      const bookMap = Object.fromEntries(
        booksResult.data.map((book) => [book.id, book])
      );

      const formattedReturns = loansResult.data.map((loan) => {
        const member = memberMap[loan.member_id];
        const book = bookMap[loan.book_id];

        return {
          id: loan.id,
          kode: loan.loans_code || "-",
          nama: member?.full_name || "Anggota tidak ditemukan",
          nis: member?.nis || "-",
          buku: book?.title || "Buku tidak ditemukan",
          kodeBuku: book?.book_code || "-",
          tanggalPinjam: loan.loan_date,
          tanggalKembali: loan.due_date,
          tanggalAktual: loan.return_date || "",
          status: (loan.status || "dipinjam").toLowerCase(),
          denda: Number(loan.fine_amount) || 0,
        };
      });

      setReturns(formattedReturns);
    } catch (error) {
      console.error("Gagal mengambil data pengembalian:", error);
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

  const showNotification = (type, message) => {
    setNotification({ type, message });

    setTimeout(() => {
      setNotification(null);
    }, 3500);
  };

  // Menghitung status dan denda setiap transaksi
  const processedReturns = useMemo(() => {
    const today = getToday();

    return returns.map((item) => {
      const isReturned = item.status === "dikembalikan";

      const lateDays = calculateLateDays(
        item.tanggalKembali,
        isReturned ? item.tanggalAktual : today
      );

      let displayStatus = item.status;

      if (isReturned) {
        displayStatus = "dikembalikan";
      } else if (lateDays > 0) {
        displayStatus = "terlambat";
      } else {
        displayStatus = "dipinjam";
      }

      // Denda transaksi aktif merupakan perkiraan.
      // Denda final tersimpan setelah buku dikembalikan.
      const fineAmount = isReturned
        ? item.denda
        : lateDays * DENDA_PER_HARI;

      return {
        ...item,
        displayStatus,
        lateDays,
        fineAmount,
      };
    });
  }, [returns]);

  const filteredReturns = useMemo(() => {
    const keyword = search.toLowerCase();

    return processedReturns.filter((item) =>
      [
        item.kode,
        item.nama,
        item.nis,
        item.buku,
        item.kodeBuku,
      ].some((value) =>
        String(value).toLowerCase().includes(keyword)
      )
    );
  }, [processedReturns, search]);

  // Ringkasan transaksi
  const borrowedCount = processedReturns.filter(
    (item) => item.displayStatus === "dipinjam"
  ).length;

  const lateCount = processedReturns.filter(
    (item) => item.displayStatus === "terlambat"
  ).length;

  const returnedCount = processedReturns.filter(
    (item) => item.displayStatus === "dikembalikan"
  ).length;

  // Total denda yang sudah benar-benar tercatat di database
  const totalFine = processedReturns
    .filter((item) => item.displayStatus === "dikembalikan")
    .reduce((total, item) => total + item.denda, 0);

  const finedTransactions = processedReturns.filter(
    (item) =>
      item.displayStatus === "dikembalikan" && item.denda > 0
  ).length;

  const openReturnModal = (item) => {
    setSelectedReturn(item);
    setReturnDate(getToday());
  };

  const closeReturnModal = () => {
    if (processing) return;

    setSelectedReturn(null);
  };

  // Menyimpan pengembalian dan denda ke Supabase
  const processReturn = async () => {
    if (!selectedReturn || !returnDate) {
      showNotification("warning", "Tanggal pengembalian harus diisi.");
      return;
    }

    if (returnDate < selectedReturn.tanggalPinjam) {
      showNotification(
        "warning",
        "Tanggal pengembalian tidak boleh sebelum tanggal peminjaman."
      );
      return;
    }

    if (returnDate > getToday()) {
      showNotification(
        "warning",
        "Tanggal pengembalian tidak boleh melebihi hari ini."
      );
      return;
    }

    setProcessing(true);

    try {
      const { error } = await supabase.rpc("return_loan_with_stock", {
        p_loan_id: selectedReturn.id,
        p_return_date: returnDate,
      });

      if (error) throw error;

      const lateDays = calculateLateDays(
        selectedReturn.tanggalKembali,
        returnDate
      );

      const fine = lateDays * DENDA_PER_HARI;

      setSelectedReturn(null);

      await loadData();

      showNotification(
        "success",
        lateDays > 0
          ? `Buku berhasil dikembalikan. Denda ${formatRupiah(fine)} (${lateDays} hari).`
          : "Buku berhasil dikembalikan tanpa denda."
      );
    } catch (error) {
      console.error("Gagal memproses pengembalian:", error);

      showNotification(
        "warning",
        error.message || "Pengembalian gagal diproses."
      );
    } finally {
      setProcessing(false);
    }
  };

  const previewLateDays = selectedReturn
    ? calculateLateDays(selectedReturn.tanggalKembali, returnDate)
    : 0;

  const previewFine = previewLateDays * DENDA_PER_HARI;

  return (
    <div className="book-page">
      <div className="book-page-header">
        <div>
          <h1>Pengembalian Buku</h1>
          <p>
            Kelola transaksi, riwayat pengembalian, dan rekap denda buku
            perpustakaan.
          </p>
        </div>
      </div>

      {/* Ringkasan transaksi */}
      <div className="member-summary-grid">
        <div className="member-summary-card">
          <div className="member-summary-icon blue">
            <BookOpen size={21} />
          </div>
          <div>
            <span>Sedang Dipinjam</span>
            <h2>{borrowedCount}</h2>
          </div>
        </div>

        <div className="member-summary-card">
          <div className="member-summary-icon orange">
            <AlertTriangle size={21} />
          </div>
          <div>
            <span>Terlambat</span>
            <h2>{lateCount}</h2>
          </div>
        </div>

        <div className="member-summary-card">
          <div className="member-summary-icon green">
            <CheckCircle size={21} />
          </div>
          <div>
            <span>Sudah Dikembalikan</span>
            <h2>{returnedCount}</h2>
          </div>
        </div>

        <div className="member-summary-card">
          <div className="member-summary-icon orange">
            <Wallet size={21} />
          </div>
          <div>
            <span>Total Denda Tercatat</span>
            <h2>{formatRupiah(totalFine)}</h2>
          </div>
        </div>

        <div className="member-summary-card">
          <div className="member-summary-icon blue">
            <Receipt size={21} />
          </div>
          <div>
            <span>Transaksi Kena Denda</span>
            <h2>{finedTransactions}</h2>
          </div>
        </div>
      </div>

      <div className="book-table-card">
        <div className="book-table-heading">
          <div>
            <h3>Daftar Pengembalian</h3>
            <p>
              Tarif denda keterlambatan: Rp500 per hari untuk setiap buku.
            </p>
          </div>

          <div className="book-search">
            <Search size={18} />
            <input
              type="text"
              placeholder="Cari kode, nama, atau judul buku..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="search-clear"
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
                <th>Kode Peminjaman</th>
                <th>Anggota</th>
                <th>Judul Buku</th>
                <th>Tanggal Pinjam</th>
                <th>Batas Kembali</th>
                <th>Status</th>
                <th>Denda</th>
                <th>Aksi</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="9" className="book-empty">
                    Memuat data dari database...
                  </td>
                </tr>
              ) : filteredReturns.length > 0 ? (
                filteredReturns.map((item, index) => (
                  <tr key={item.id}>
                    <td>{index + 1}</td>

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

                    <td>{formatDate(item.tanggalPinjam)}</td>
                    <td>{formatDate(item.tanggalKembali)}</td>

                    <td>
                      <span
                        className={`member-status ${
                          item.displayStatus === "dikembalikan"
                            ? "active"
                            : item.displayStatus === "terlambat"
                            ? "late"
                            : ""
                        }`}
                      >
                        {item.displayStatus === "dikembalikan"
                          ? "Dikembalikan"
                          : item.displayStatus === "terlambat"
                          ? "Terlambat"
                          : "Dipinjam"}
                      </span>

                      {item.displayStatus === "dikembalikan" && (
                        <small className="return-date-note">
                          {formatDate(item.tanggalAktual)}
                        </small>
                      )}

                      {item.displayStatus === "terlambat" && (
                        <small className="return-date-note late-note">
                          {item.lateDays} hari keterlambatan
                        </small>
                      )}
                    </td>

                    <td>
                      <strong
                        style={{
                          color:
                            item.fineAmount > 0 ? "#d97706" : "inherit",
                        }}
                      >
                        {formatRupiah(item.fineAmount)}
                      </strong>

                      {item.displayStatus !== "dikembalikan" &&
                        item.fineAmount > 0 && (
                          <small className="return-date-note">
                            Perkiraan
                          </small>
                        )}
                    </td>

                    <td>
                      {item.displayStatus !== "dikembalikan" ? (
                        <button
                          type="button"
                          className="edit-action"
                          onClick={() => openReturnModal(item)}
                          title="Proses pengembalian"
                        >
                          <RotateCcw size={16} />
                          Kembalikan
                        </button>
                      ) : (
                        <span className="return-completed">
                          <CheckCircle size={16} />
                          Selesai
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="9" className="book-empty">
                    Tidak ada data transaksi yang ditemukan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="book-table-footer">
          Menampilkan {filteredReturns.length} dari {returns.length} transaksi
        </div>
      </div>

      {/* Modal pengembalian */}
      {selectedReturn && (
        <div className="book-modal-overlay">
          <div className="book-modal">
            <div className="book-modal-heading">
              <div>
                <span className="modal-eyebrow">TRANSAKSI BUKU</span>
                <h2>Proses Pengembalian</h2>
                <p>
                  Periksa informasi buku sebelum menyelesaikan transaksi.
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={closeReturnModal}
                disabled={processing}
              >
                <X size={20} />
              </button>
            </div>

            <div className="return-detail-box">
              <div className="return-detail-row">
                <span>Kode Peminjaman</span>
                <strong>{selectedReturn.kode}</strong>
              </div>

              <div className="return-detail-row">
                <span>Nama Anggota</span>
                <strong>{selectedReturn.nama}</strong>
              </div>

              <div className="return-detail-row">
                <span>Judul Buku</span>
                <strong>{selectedReturn.buku}</strong>
              </div>

              <div className="return-detail-row">
                <span>Tanggal Peminjaman</span>
                <strong>{formatDate(selectedReturn.tanggalPinjam)}</strong>
              </div>

              <div className="return-detail-row">
                <span>Batas Pengembalian</span>
                <strong>{formatDate(selectedReturn.tanggalKembali)}</strong>
              </div>
            </div>

            <div className="return-date-field">
              <label htmlFor="tanggalAktual">
                Tanggal Pengembalian Aktual
              </label>

              <div className="return-date-input">
                <CalendarDays size={18} />

                <input
                  id="tanggalAktual"
                  type="date"
                  value={returnDate}
                  min={selectedReturn.tanggalPinjam}
                  max={getToday()}
                  onChange={(event) => setReturnDate(event.target.value)}
                  onClick={(event) =>
                    event.currentTarget.showPicker?.()
                  }
                />
              </div>
            </div>

            {returnDate && (
              <div className="return-late-info">
                {previewLateDays > 0 ? (
                  <>
                    <AlertTriangle size={18} />

                    <span>
                      Terlambat{" "}
                      <strong>{previewLateDays} hari</strong>.
                      <br />
                      Denda: <strong>{formatRupiah(previewFine)}</strong>
                    </span>
                  </>
                ) : (
                  <>
                    <CheckCircle size={18} />
                    <span>
                      Tidak ada keterlambatan. Denda Rp0.
                    </span>
                  </>
                )}
              </div>
            )}

            <div className="book-modal-actions">
              <button
                type="button"
                className="cancel-button"
                onClick={closeReturnModal}
                disabled={processing}
              >
                Batal
              </button>

              <button
                type="button"
                className="save-button"
                onClick={processReturn}
                disabled={processing}
              >
                <CheckCircle size={17} />
                {processing
                  ? "Menyimpan..."
                  : "Selesaikan Pengembalian"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notifikasi */}
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
              {notification.type === "success" ? "Berhasil" : "Perhatian"}
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
