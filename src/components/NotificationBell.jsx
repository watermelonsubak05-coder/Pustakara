
import { useEffect, useState } from "react";
import {
  Bell,
  X,
  CheckCheck,
  AlertTriangle,
  Clock,
  BookOpen,
} from "lucide-react";
import { supabase } from "../lib/supabase";

const STORAGE_KEY = "pustakara_read_notifications";

export default function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [readIds, setReadIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch {
      return [];
    }
  });
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchNotifications();
  }, []);

  async function fetchNotifications() {
    setLoading(true);

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const nextThreeDays = new Date(today);
      nextThreeDays.setDate(today.getDate() + 3);

      const [loanResult, reservationResult, memberResult, bookResult] =
        await Promise.all([
          supabase.from("loans").select("*"),
          supabase.from("reservations").select("*"),
          supabase.from("members").select("*"),
          supabase.from("books").select("*"),
        ]);

      if (loanResult.error) throw loanResult.error;
      if (reservationResult.error) throw reservationResult.error;
      if (memberResult.error) throw memberResult.error;
      if (bookResult.error) throw bookResult.error;

      const loans = loanResult.data || [];
      const reservations = reservationResult.data || [];
      const members = memberResult.data || [];
      const books = bookResult.data || [];

      const result = [];

      // =====================================
      // 1. NOTIFIKASI PEMINJAMAN
      // =====================================

      loans.forEach((loan) => {
        const returned =
          loan.return_date ||
          String(loan.status || "").toLowerCase() === "dikembalikan";

        if (returned || !loan.due_date) return;

        const dueDate = new Date(`${loan.due_date}T00:00:00`);

        const member = members.find(
          (item) => item.id === loan.member_id
        );

        const book = books.find(
          (item) => item.id === loan.book_id
        );

        const memberName = member?.full_name || "Anggota";
        const bookTitle = book?.title || "Buku";

        if (dueDate < today) {
          const daysLate = Math.floor(
            (today - dueDate) / (1000 * 60 * 60 * 24)
          );

          result.push({
            id: `overdue-${loan.id}`,
            type: "overdue",
            title: "Peminjaman terlambat",
            message: `${memberName} belum mengembalikan "${bookTitle}" (${daysLate} hari terlambat).`,
            date: loan.due_date,
          });
        } else if (dueDate <= nextThreeDays) {
          result.push({
            id: `due-${loan.id}`,
            type: "due",
            title: "Jatuh tempo mendekat",
            message: `Buku "${bookTitle}" yang dipinjam ${memberName} segera jatuh tempo.`,
            date: loan.due_date,
          });
        }
      });

      // =====================================
      // 2. NOTIFIKASI RESERVASI
      // =====================================

      reservations.forEach((reservation) => {
        if (
          String(reservation.status || "").toLowerCase() !== "menunggu"
        ) {
          return;
        }

        const member = members.find(
          (item) => item.id === reservation.member_id
        );

        const book = books.find(
          (item) => item.id === reservation.book_id
        );

        result.push({
          id: `reservation-${reservation.id}`,
          type: "reservation",
          title: "Reservasi menunggu",
          message: `${member?.full_name || "Anggota"} menunggu persetujuan reservasi "${book?.title || "Buku"}".`,
          date: reservation.reservation_date || reservation.created_at,
        });
      });

      // =====================================
      // 3. NOTIFIKASI STOK BUKU MENIPIS
      // =====================================

      books.forEach((book) => {
        const availableStock = Number(book.available_copies || 0);

        // Notifikasi hanya muncul jika stok tersedia tepat 1
        if (availableStock !== 1) return;

        result.push({
          id: `low-stock-${book.id}`,
          type: "low_stock",
          title: "Stok buku menipis",
          message: `Buku "${book.title}" hanya tersisa 1 eksemplar yang tersedia. Segera periksa kebutuhan penambahan koleksi.`,
          date: book.created_at,
        });
      });

      // =====================================
      // 4. URUTAN NOTIFIKASI
      // =====================================

      const priority = {
        overdue: 1,
        low_stock: 2,
        due: 3,
        reservation: 4,
      };

      result.sort((a, b) => {
        const priorityA = priority[a.type] || 99;
        const priorityB = priority[b.type] || 99;

        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }

        return new Date(b.date || 0) - new Date(a.date || 0);
      });

      setNotifications(result);
    } catch (error) {
      console.error("Gagal memuat notifikasi:", error);
    } finally {
      setLoading(false);
    }
  }

  const unreadCount = notifications.filter(
    (item) => !readIds.includes(item.id)
  ).length;

  function markAsRead(id) {
    const updated = [...new Set([...readIds, id])];

    setReadIds(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }

  function markAllAsRead() {
    const updated = [
      ...new Set([
        ...readIds,
        ...notifications.map((item) => item.id),
      ]),
    ];

    setReadIds(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }

  function getIcon(type) {
    if (type === "overdue") {
      return <AlertTriangle size={18} />;
    }

    if (type === "low_stock") {
      return <BookOpen size={18} />;
    }

    if (type === "due") {
      return <Clock size={18} />;
    }

    return <BookOpen size={18} />;
  }

  function getIconColor(type) {
    if (type === "overdue") return "#C0392B";
    if (type === "low_stock") return "#D97706";
    if (type === "due") return "#A16207";

    return "#245B70";
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        className="notification-button"
        onClick={() => setIsOpen(!isOpen)}
        title="Notifikasi"
      >
        <Bell size={20} />

        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: -5,
              right: -5,
              minWidth: 18,
              height: 18,
              borderRadius: 20,
              background: "#D9534F",
              color: "#FFFFFF",
              fontSize: 10,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 4px",
            }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: 45,
            right: 0,
            width: 360,
            maxWidth: "calc(100vw - 32px)",
            background: "#FFFFFF",
            border: "1px solid #E5E7EB",
            borderRadius: 14,
            boxShadow: "0 12px 35px rgba(0,0,0,0.15)",
            zIndex: 1000,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottom: "1px solid #E5E7EB",
              background: "#FFFFFF",
            }}
          >
            <div>
              <strong style={{ color: "#245B70", fontSize: 15 }}>
                Notifikasi
              </strong>

              <div
                style={{
                  fontSize: 12,
                  color: "#475569",
                  marginTop: 3,
                }}
              >
                {unreadCount} notifikasi belum dibaca
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={markAllAsRead}
                  title="Tandai semua dibaca"
                  style={{
                    border: 0,
                    background: "transparent",
                    color: "#245B70",
                    cursor: "pointer",
                  }}
                >
                  <CheckCheck size={19} />
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                style={{
                  border: 0,
                  background: "transparent",
                  cursor: "pointer",
                  color: "#475569",
                }}
              >
                <X size={19} />
              </button>
            </div>
          </div>

          <div style={{ maxHeight: 380, overflowY: "auto" }}>
            {loading ? (
              <p
                style={{
                  padding: 24,
                  textAlign: "center",
                  color: "#475569",
                }}
              >
                Memuat notifikasi...
              </p>
            ) : notifications.length === 0 ? (
              <p
                style={{
                  padding: 28,
                  textAlign: "center",
                  color: "#475569",
                }}
              >
                Tidak ada notifikasi saat ini.
              </p>
            ) : (
              notifications.map((item) => {
                const isRead = readIds.includes(item.id);

                return (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => markAsRead(item.id)}
                    style={{
                      width: "100%",
                      padding: 15,
                      display: "flex",
                      gap: 12,
                      textAlign: "left",
                      border: 0,
                      borderBottom: "1px solid #E5E7EB",
                      background: isRead ? "#FFFFFF" : "#EAF3F5",
                      cursor: "pointer",
                    }}
                  >
                    <span
                      style={{
                        color: getIconColor(item.type),
                        flexShrink: 0,
                        marginTop: 2,
                      }}
                    >
                      {getIcon(item.type)}
                    </span>

                    <span style={{ flex: 1 }}>
                      <strong
                        style={{
                          display: "block",
                          fontSize: 13,
                          color: "#245B70",
                          fontWeight: 700,
                          lineHeight: 1.5,
                        }}
                      >
                        {item.title}
                      </strong>

                      <span
                        style={{
                          display: "block",
                          fontSize: 12,
                          color: "#334155",
                          marginTop: 5,
                          lineHeight: 1.6,
                          fontWeight: 500,
                        }}
                      >
                        {item.message}
                      </span>

                      {item.date && (
                        <span
                          style={{
                            display: "block",
                            fontSize: 11,
                            color: "#475569",
                            marginTop: 7,
                            fontWeight: 500,
                          }}
                        >
                          {new Date(item.date).toLocaleDateString("id-ID")}
                        </span>
                      )}
                    </span>

                    {!isRead && (
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: "#245B70",
                          flexShrink: 0,
                          marginTop: 6,
                        }}
                      />
                    )}
                  </button>
                );
              })
            )}
          </div>

          <div
            style={{
              padding: 10,
              borderTop: "1px solid #E5E7EB",
              textAlign: "center",
              background: "#FFFFFF",
            }}
          >
            <button
              type="button"
              onClick={fetchNotifications}
              style={{
                border: 0,
                background: "transparent",
                color: "#245B70",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Muat ulang notifikasi
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
