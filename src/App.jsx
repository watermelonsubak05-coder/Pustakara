
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  BookOpen,
  Users,
  ArrowLeftRight,
  ClipboardList,
  ChartNoAxesCombined,
  Settings,
  Search,
  Bell,
  ChevronDown,
  BookMarked,
  BookCheck,
  AlertTriangle,
  Plus,
  ArrowUpRight,
  MoreHorizontal,
  X,
} from "lucide-react";

import "./App.css";
import { supabase } from "./lib/supabase";

import DataBuku from "./pages/DataBuku";
import DataAnggota from "./pages/DataAnggota";
import Peminjaman from "./pages/Peminjaman";
import Pengembalian from "./pages/Pengembalian";
import Reservasi from "./pages/ReservasiBuku";
import Laporan from "./pages/Laporan";
import Pengaturan from "./pages/Pengaturan";

const menu = [
  { title: "MENU UTAMA" },
  { name: "Dashboard", icon: LayoutDashboard },
  { name: "Data Buku", icon: BookOpen },
  { name: "Data Anggota", icon: Users },
  { name: "Peminjaman", icon: ArrowLeftRight },
  { name: "Pengembalian", icon: BookCheck },
  { name: "Reservasi Buku", icon: ClipboardList },
  { title: "LAINNYA" },
  { name: "Laporan", icon: ChartNoAxesCombined },
  { name: "Pengaturan", icon: Settings },
];

const today = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatDate = (dateString) => {
  if (!dateString) return "-";

  return new Date(`${dateString}T00:00:00`).toLocaleDateString(
    "id-ID",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  );
};

const formatNumber = (number) =>
  new Intl.NumberFormat("id-ID").format(number || 0);

const monthNames = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

function App() {
  const [activePage, setActivePage] = useState("Dashboard");
  const [globalSearch, setGlobalSearch] = useState("");
  const [showSearchResults, setShowSearchResults] = useState(false);

  // Mengambil logo Pustakara dari Supabase
  const [logoUrl, setLogoUrl] = useState("");

  const [dashboardData, setDashboardData] = useState({
    books: [],
    members: [],
    loans: [],
  });

  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState("");

  const loadDashboard = async () => {
    setDashboardLoading(true);
    setDashboardError("");

    try {
      const [booksResult, membersResult, loansResult] =
        await Promise.all([
          supabase.from("books").select("*"),
          supabase.from("members").select("*"),
          supabase.from("loans").select("*"),
        ]);

      if (booksResult.error) throw booksResult.error;
      if (membersResult.error) throw membersResult.error;
      if (loansResult.error) throw loansResult.error;

      setDashboardData({
        books: booksResult.data || [],
        members: membersResult.data || [],
        loans: loansResult.data || [],
      });
    } catch (error) {
      console.error("Gagal memuat dashboard:", error);
      setDashboardError(
        error.message || "Gagal mengambil data dari database."
      );
    } finally {
      setDashboardLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  // Memuat logo dari tabel library_settings
  useEffect(() => {
    const loadLogo = async () => {
      const { data, error } = await supabase
        .from("library_settings")
        .select("logo_url")
        .eq("id", 1)
        .maybeSingle();

      if (error) {
        console.error("Gagal memuat logo:", error);
        return;
      }

      if (data?.logo_url) {
        setLogoUrl(data.logo_url);
      }
    };

    loadLogo();
  }, []);

  const availableMenus = menu.filter((item) => item.name);

  const searchResults = globalSearch.trim()
    ? availableMenus.filter((item) =>
        item.name.toLowerCase().includes(globalSearch.trim().toLowerCase())
      )
    : [];

  function selectMenu(menuName) {
    setActivePage(menuName);
    setGlobalSearch("");
    setShowSearchResults(false);
  }

  function handleSearchKeyDown(event) {
    if (event.key === "Enter") {
      event.preventDefault();

      if (searchResults.length > 0) {
        selectMenu(searchResults[0].name);
      } else if (globalSearch.trim()) {
        setShowSearchResults(true);
      }
    }

    if (event.key === "Escape") {
      setGlobalSearch("");
      setShowSearchResults(false);
    }
  }

  const books = dashboardData.books;
  const members = dashboardData.members;
  const loans = dashboardData.loans;

  const totalTitles = books.length;

  const totalCopies = books.reduce(
    (total, book) => total + Number(book.total_copies || 0),
    0
  );

  const availableCopies = books.reduce(
    (total, book) => total + Number(book.available_copies || 0),
    0
  );

  const unavailableCopies = Math.max(
    totalCopies - availableCopies,
    0
  );

  const totalMembers = members.length;

  const activeLoans = loans.filter(
    (loan) => loan.status !== "dikembalikan"
  );

  const overdueLoans = activeLoans.filter(
    (loan) => loan.due_date < today()
  );

  const returnedLoans = loans.filter(
    (loan) => loan.status === "dikembalikan"
  );

  const currentYear = new Date().getFullYear();

  const monthlyData = monthNames.map((month, index) => {
    const borrowing = loans.filter((loan) => {
      if (!loan.loan_date) return false;

      const date = new Date(`${loan.loan_date}T00:00:00`);

      return (
        date.getFullYear() === currentYear &&
        date.getMonth() === index
      );
    }).length;

    const returning = loans.filter((loan) => {
      if (!loan.return_date || loan.status !== "dikembalikan") {
        return false;
      }

      const date = new Date(`${loan.return_date}T00:00:00`);

      return (
        date.getFullYear() === currentYear &&
        date.getMonth() === index
      );
    }).length;

    return {
      month,
      borrowing,
      returning,
    };
  });

  const chartMaximum = Math.max(
    5,
    ...monthlyData.map((item) =>
      Math.max(item.borrowing, item.returning)
    )
  );

  const chartScale = Math.ceil(chartMaximum / 4) * 4;

  const createPoints = (key) =>
    monthlyData
      .map((item, index) => {
        const x = (index / 11) * 700;
        const y = 170 - (item[key] / chartScale) * 155;

        return `${x},${y}`;
      })
      .join(" ");

  const recentLoans = [...loans]
    .sort(
      (a, b) =>
        new Date(b.created_at || b.loan_date) -
        new Date(a.created_at || a.loan_date)
    )
    .slice(0, 5)
    .map((loan) => {
      const member = members.find(
        (item) => item.id === loan.member_id
      );

      const book = books.find(
        (item) => item.id === loan.book_id
      );

      const isOverdue =
        loan.status !== "dikembalikan" &&
        loan.due_date < today();

      return {
        ...loan,
        memberName: member?.full_name || "Anggota tidak ditemukan",
        className: member?.class_name || "-",
        bookTitle: book?.title || "Buku tidak ditemukan",
        displayStatus:
          loan.status === "dikembalikan"
            ? "Dikembalikan"
            : isOverdue
              ? "Terlambat"
              : "Dipinjam",
        statusClass:
          loan.status === "dikembalikan"
            ? "returned"
            : isOverdue
              ? "late"
              : "borrowed",
      };
    });

  const collectionPercentage =
    totalCopies > 0
      ? (availableCopies / totalCopies) * 100
      : 0;

  const currentDate = new Date().toLocaleDateString("id-ID", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Logo Pustakara"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  borderRadius: "8px",
                }}
              />
            ) : (
              <BookOpen size={25} />
            )}
          </div>

          <div>
            <h2>Pustakara</h2>
            <span>LIBRARY MANAGEMENT</span>
          </div>
        </div>

        <div className="school-label">
          PERPUSTAKAAN SEKOLAH
        </div>

        <nav className="navigation">
          {menu.map((item, index) =>
            item.title ? (
              <p className="menu-title" key={index}>
                {item.title}
              </p>
            ) : (
              <button
                className={`nav-item ${
                  activePage === item.name ? "active" : ""
                }`}
                key={item.name}
                onClick={() => selectMenu(item.name)}
              >
                <item.icon size={19} />
                <span>{item.name}</span>
              </button>
            )
          )}
        </nav>

        <div className="sidebar-bottom">
          <div className="help-card">
            <div className="help-icon">?</div>
            <strong>Butuh bantuan?</strong>
            <p>
              Hubungi administrator jika mengalami kendala.
            </p>
            <button>Bantuan</button>
          </div>

          <div className="version">
            PUSTAKARA v1.0.0
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <div className="breadcrumb">
              Halaman / <strong>{activePage}</strong>
            </div>
            <h2>{activePage}</h2>
          </div>

          <div className="top-actions">
            <div className="global-search-container">
              <div className="search-box">
                <Search size={18} />

                <input
                  type="text"
                  placeholder="Cari sesuatu..."
                  value={globalSearch}
                  onChange={(event) => {
                    setGlobalSearch(event.target.value);
                    setShowSearchResults(true);
                  }}
                  onFocus={() => setShowSearchResults(true)}
                  onKeyDown={handleSearchKeyDown}
                />

                {globalSearch ? (
                  <button
                    type="button"
                    className="clear-search"
                    onClick={() => {
                      setGlobalSearch("");
                      setShowSearchResults(false);
                    }}
                    aria-label="Hapus pencarian"
                  >
                    <X size={16} />
                  </button>
                ) : (
                  <span>Enter</span>
                )}
              </div>

              {showSearchResults && globalSearch.trim() && (
                <div className="global-search-results">
                  <div className="search-results-heading">
                    Hasil pencarian menu
                  </div>

                  {searchResults.length > 0 ? (
                    searchResults.map((item) => (
                      <button
                        type="button"
                        className="search-result-item"
                        key={item.name}
                        onClick={() => selectMenu(item.name)}
                      >
                        <item.icon size={18} />
                        <span>{item.name}</span>
                        <ArrowUpRight size={15} />
                      </button>
                    ))
                  ) : (
                    <div className="search-no-result">
                      <Search size={20} />
                      <strong>Menu tidak ditemukan</strong>
                      <span>
                        Coba kata kunci lain, misalnya Data Buku atau Laporan.
                      </span>
                    </div>
                  )}

                  <div className="search-results-footer">
                    Tekan Enter untuk membuka hasil pertama.
                    Tekan Esc untuk menutup.
                  </div>
                </div>
              )}
            </div>

            <button className="notification">
              <Bell size={20} />
              <i />
            </button>

            <div className="profile">
              <div className="avatar">AD</div>
              <div className="profile-info">
                <strong>Administrator</strong>
                <span>Admin Perpustakaan</span>
              </div>
              <ChevronDown size={16} />
            </div>
          </div>
        </header>

        {activePage === "Data Buku" ? (
          <DataBuku />
        ) : activePage === "Data Anggota" ? (
          <DataAnggota />
        ) : activePage === "Peminjaman" ? (
          <Peminjaman />
        ) : activePage === "Pengembalian" ? (
          <Pengembalian />
        ) : activePage === "Reservasi Buku" ? (
          <Reservasi />
        ) : activePage === "Laporan" ? (
          <Laporan />
        ) : activePage === "Pengaturan" ? (
          <Pengaturan />
        ) : activePage === "Dashboard" ? (
          <section className="content">
            <div className="welcome">
              <div>
                <p className="greeting">
                  {currentDate.toUpperCase()}
                </p>
                <h1>
                  Selamat datang, Administrator! 👋
                </h1>
                <p>
                  Berikut ringkasan aktivitas perpustakaan hari ini.
                </p>
              </div>

              <button
                className="primary-button"
                onClick={() => selectMenu("Data Buku")}
              >
                <Plus size={18} />
                Tambah Buku
              </button>
            </div>

            {dashboardError && (
              <div className="panel" style={{ padding: 16 }}>
                <p style={{ color: "#dc2626" }}>
                  Gagal memuat data: {dashboardError}
                </p>
                <button
                  className="primary-button"
                  onClick={loadDashboard}
                >
                  Coba Lagi
                </button>
              </div>
            )}

            {dashboardLoading ? (
              <div className="panel" style={{ padding: 30 }}>
                Memuat data dashboard...
              </div>
            ) : (
              <>
                <div className="stat-grid">
                  <div className="stat-card">
                    <div className="stat-top">
                      <span>Total Judul Buku</span>
                      <div className="stat-icon blue">
                        <BookOpen size={21} />
                      </div>
                    </div>
                    <h2>{formatNumber(totalTitles)}</h2>
                    <p>
                      {formatNumber(totalCopies)} total eksemplar
                    </p>
                  </div>

                  <div className="stat-card">
                    <div className="stat-top">
                      <span>Total Anggota</span>
                      <div className="stat-icon purple">
                        <Users size={21} />
                      </div>
                    </div>
                    <h2>{formatNumber(totalMembers)}</h2>
                    <p>Data anggota perpustakaan</p>
                  </div>

                  <div className="stat-card">
                    <div className="stat-top">
                      <span>Sedang Dipinjam</span>
                      <div className="stat-icon orange">
                        <BookMarked size={21} />
                      </div>
                    </div>
                    <h2>{formatNumber(activeLoans.length)}</h2>
                    <p>Transaksi belum dikembalikan</p>
                  </div>

                  <div className="stat-card">
                    <div className="stat-top">
                      <span>Terlambat</span>
                      <div className="stat-icon red">
                        <AlertTriangle size={21} />
                      </div>
                    </div>
                    <h2>{formatNumber(overdueLoans.length)}</h2>
                    <p>Perlu segera ditindaklanjuti</p>
                  </div>
                </div>

                <div className="dashboard-grid">
                  <section className="panel chart-panel">
                    <div className="panel-heading">
                      <div>
                        <h3>Aktivitas Perpustakaan</h3>
                        <p>
                          Statistik peminjaman dan pengembalian buku
                        </p>
                      </div>

                      <span className="filter-button">
                        Tahun {currentYear}
                      </span>
                    </div>

                    <div className="chart-legend">
                      <span>
                        <i className="dot blue-dot" />
                        Peminjaman
                      </span>
                      <span>
                        <i className="dot green-dot" />
                        Pengembalian
                      </span>
                    </div>

                    <div className="chart">
                      <div className="y-labels">
                        <span>{chartScale}</span>
                        <span>{Math.round(chartScale * 0.75)}</span>
                        <span>{Math.round(chartScale * 0.5)}</span>
                        <span>{Math.round(chartScale * 0.25)}</span>
                        <span>0</span>
                      </div>

                      <div className="chart-area">
                        {[0, 1, 2, 3, 4].map((n) => (
                          <div className="grid-line" key={n} />
                        ))}

                        <svg
                          viewBox="0 0 700 190"
                          preserveAspectRatio="none"
                        >
                          <polyline
                            points={createPoints("borrowing")}
                            className="line-blue"
                          />
                          <polyline
                            points={createPoints("returning")}
                            className="line-green"
                          />
                        </svg>

                        <div className="months">
                          {monthNames.map((month) => (
                            <span key={month}>{month}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="panel summary-panel">
                    <div className="panel-heading">
                      <div>
                        <h3>Ringkasan Koleksi</h3>
                        <p>Kondisi ketersediaan koleksi buku</p>
                      </div>
                      <button
                        className="more-button"
                        onClick={loadDashboard}
                        title="Muat ulang data"
                      >
                        <MoreHorizontal size={20} />
                      </button>
                    </div>

                    <div className="donut-wrap">
                      <div
                        className="donut"
                        style={{
                          background: `conic-gradient(
                            #4778e8 0% ${collectionPercentage}%,
                            #dce3ef ${collectionPercentage}% 100%
                          )`,
                        }}
                      >
                        <div>
                          <strong>{formatNumber(totalCopies)}</strong>
                          <span>Total Buku</span>
                        </div>
                      </div>
                    </div>

                    <div className="collection-list">
                      <div>
                        <span>
                          <i className="dot blue-dot" />
                          Tersedia
                        </span>
                        <strong>
                          {formatNumber(availableCopies)}
                        </strong>
                      </div>
                      <div>
                        <span>
                          <i className="dot green-dot" />
                          Tidak tersedia
                        </span>
                        <strong>
                          {formatNumber(unavailableCopies)}
                        </strong>
                      </div>
                      <div>
                        <span>
                          <i className="dot orange-dot" />
                          Sudah dikembalikan
                        </span>
                        <strong>
                          {formatNumber(returnedLoans.length)}
                        </strong>
                      </div>
                    </div>
                  </section>
                </div>

                <section className="panel activity-panel">
                  <div className="panel-heading">
                    <div>
                      <h3>Aktivitas Terbaru</h3>
                      <p>Transaksi peminjaman dan pengembalian terkini</p>
                    </div>

                    <button
                      className="text-button"
                      onClick={() => selectMenu("Peminjaman")}
                    >
                      Lihat semua <ArrowUpRight size={16} />
                    </button>
                  </div>

                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>NAMA ANGGOTA</th>
                          <th>JUDUL BUKU</th>
                          <th>TANGGAL</th>
                          <th>STATUS</th>
                        </tr>
                      </thead>

                      <tbody>
                        {recentLoans.length > 0 ? (
                          recentLoans.map((loan) => (
                            <tr key={loan.id}>
                              <td>
                                <strong>{loan.memberName}</strong>
                                <small>{loan.className}</small>
                              </td>
                              <td>{loan.bookTitle}</td>
                              <td>{formatDate(loan.loan_date)}</td>
                              <td>
                                <span
                                  className={`status ${loan.statusClass}`}
                                >
                                  {loan.displayStatus}
                                </span>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="4" style={{ textAlign: "center" }}>
                              Belum ada aktivitas transaksi.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            )}

            <footer>
              © 2026 Pustakara. Sistem Informasi Manajemen Perpustakaan Sekolah.
            </footer>
          </section>
        ) : (
          <section className="content">
            <div className="panel" style={{ padding: 24 }}>
              <h3>{activePage}</h3>
              <p>
                Halaman ini akan kita kembangkan pada tahap berikutnya.
              </p>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
