
import { useEffect, useRef, useState } from "react";
import {
  Search,
  Plus,
  Users,
  Pencil,
  Trash2,
  X,
  Save,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Filter,
  FileSpreadsheet,
  Upload,
  Download,
  LoaderCircle,
} from "lucide-react";
import * as XLSX from "xlsx";

import { supabase } from "../lib/supabase";
import ConfirmDeleteModal from "../components/ConfirmDeleteModal";

const emptyForm = {
  nomor: "",
  nama: "",
  nis: "",
  kelas: "",
  alamat: "",
  status: "aktif",
};

const classOptions = [
  "Kelas 1",
  "Kelas 2",
  "Kelas 3",
  "Kelas 4",
  "Kelas 5",
  "Kelas 6",
];

function normalizeHeader(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeClass(value) {
  const text = String(value || "").trim();

  if (!text) return "";

  const match = text.match(/^(?:kelas\s*)?([1-6])$/i);

  if (!match) return "";

  return `Kelas ${match[1]}`;
}

function normalizeStatus(value) {
  const text = String(value || "")
    .trim()
    .toLowerCase();

  if (
    ["nonaktif", "tidak aktif", "inactive", "non-active"].includes(
      text
    )
  ) {
    return "nonaktif";
  }

  return "aktif";
}

function getCell(row, possibleHeaders) {
  const rowKeys = Object.keys(row);

  for (const header of possibleHeaders) {
    const normalizedHeader = normalizeHeader(header);

    const matchingKey = rowKeys.find(
      (key) => normalizeHeader(key) === normalizedHeader
    );

    if (matchingKey !== undefined) {
      return row[matchingKey];
    }
  }

  return "";
}

export default function DataAnggota({ userRole: propUserRole }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userRole, setUserRole] = useState(propUserRole || null);

  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("semua");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);

  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [notification, setNotification] = useState(null);

  // State impor Excel
  const fileInputRef = useRef(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [importRows, setImportRows] = useState([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  const canManage =
    userRole === "tim_pengembang" ||
    userRole === "pustakawan";

  useEffect(() => {
    if (propUserRole) {
      setUserRole(propUserRole);
    }
  }, [propUserRole]);

  useEffect(() => {
    if (!propUserRole) {
      loadUserRole();
    }

    loadMembers();
  }, []);

  useEffect(() => {
    if (!notification) return;

    const timer = window.setTimeout(() => {
      setNotification(null);
    }, 3500);

    return () => window.clearTimeout(timer);
  }, [notification]);

  const showNotification = (type, message) => {
    setNotification({ type, message });
  };

  const loadUserRole = async () => {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      setUserRole(null);
      return;
    }

    const { data, error } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (error) {
      console.error("Gagal memeriksa role:", error);
      setUserRole(null);
      return;
    }

    setUserRole(data.role);
  };

  const loadMembers = async () => {
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("members")
        .select(
          "id, member_number, full_name, member_type, nis, class_name, address, status"
        )
        .order("created_at", { ascending: false });

      if (error) throw error;

      const formattedMembers = (data || []).map((member) => ({
        id: member.id,
        nomor: member.member_number || "",
        nama: member.full_name || "",
        nis: member.nis || "",
        kelas: member.class_name || "",
        alamat: member.address || "",
        status: (member.status || "aktif").toLowerCase(),
      }));

      setMembers(formattedMembers);
    } catch (error) {
      console.error("Gagal mengambil data anggota:", error);

      showNotification(
        "error",
        error.message || "Gagal mengambil data anggota."
      );
    } finally {
      setLoading(false);
    }
  };

  const activeMembers = members.filter(
    (member) => member.status === "aktif"
  ).length;

  const inactiveMembers = members.filter(
    (member) => member.status === "nonaktif"
  ).length;

  const filteredMembers = members.filter((member) => {
    const keyword = searchTerm.trim().toLowerCase();

    const matchesSearch =
      `${member.nomor} ${member.nama} ${member.nis} ${member.kelas} ${member.alamat}`
        .toLowerCase()
        .includes(keyword);

    const matchesStatus =
      filterStatus === "semua" ||
      member.status === filterStatus;

    return matchesSearch && matchesStatus;
  });

  // =========================
  // TAMBAH DAN EDIT ANGGOTA
  // =========================

  const openAddModal = () => {
    if (!canManage) return;

    setForm({ ...emptyForm });
    setEditingId(null);
    setIsModalOpen(true);
  };

  const openEditModal = (member) => {
    if (!canManage) return;

    setForm({
      nomor: member.nomor,
      nama: member.nama,
      nis: member.nis,
      kelas: member.kelas,
      alamat: member.alamat,
      status: member.status,
    });

    setEditingId(member.id);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;

    setIsModalOpen(false);
    setForm({ ...emptyForm });
    setEditingId(null);
  };

  const handleFormChange = (event) => {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!canManage || saving) return;

    const memberNumber = form.nomor.trim();
    const nis = form.nis.trim();

    if (
      !memberNumber ||
      !form.nama.trim() ||
      !nis ||
      !form.kelas
    ) {
      showNotification(
        "error",
        "Nomor anggota, NIS, nama lengkap, dan kelas wajib diisi."
      );
      return;
    }

    if (!classOptions.includes(form.kelas)) {
      showNotification("error", "Pilihan kelas tidak valid.");
      return;
    }

    setSaving(true);

    try {
      // Periksa nomor anggota agar tidak duplikat.
      const { data: existingNumber, error: numberError } =
        await supabase
          .from("members")
          .select("id")
          .eq("member_number", memberNumber)
          .neq(
            "id",
            editingId || "00000000-0000-0000-0000-000000000000"
          )
          .limit(1);

      if (numberError) throw numberError;

      if (existingNumber && existingNumber.length > 0) {
        showNotification(
          "error",
          "Nomor anggota tersebut sudah digunakan."
        );
        return;
      }

      // Periksa NIS agar tidak duplikat.
      const { data: existingNis, error: nisError } =
        await supabase
          .from("members")
          .select("id")
          .eq("nis", nis)
          .neq(
            "id",
            editingId || "00000000-0000-0000-0000-000000000000"
          )
          .limit(1);

      if (nisError) throw nisError;

      if (existingNis && existingNis.length > 0) {
        showNotification(
          "error",
          "NIS tersebut sudah terdaftar."
        );
        return;
      }

      const memberData = {
        member_number: memberNumber,
        full_name: form.nama.trim(),
        member_type: "siswa",
        nis,
        class_name: form.kelas,
        class_id: null,
        address: form.alamat.trim() || null,
        status: form.status,
      };

      if (editingId) {
        const { error } = await supabase
          .from("members")
          .update(memberData)
          .eq("id", editingId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("members")
          .insert([memberData]);

        if (error) throw error;
      }

      const wasEditing = Boolean(editingId);

      setIsModalOpen(false);
      setForm({ ...emptyForm });
      setEditingId(null);

      await loadMembers();

      showNotification(
        "success",
        wasEditing
          ? "Data anggota berhasil diperbarui."
          : "Anggota berhasil ditambahkan."
      );
    } catch (error) {
      console.error("Gagal menyimpan anggota:", error);

      showNotification(
        "error",
        error.message || "Gagal menyimpan data anggota."
      );
    } finally {
      setSaving(false);
    }
  };

  // =========================
  // TEMPLATE EXCEL
  // =========================

  const downloadExcelTemplate = () => {
    const templateData = [
      {
        "Nomor Anggota": "LS-0001",
        "NIS": "10201",
        "Nama Lengkap": "Andi Saputra",
        "Kelas": "Kelas 1",
        "Alamat": "Malang",
        "Status": "aktif",
      },
      {
        "Nomor Anggota": "LS-0002",
        "NIS": "10202",
        "Nama Lengkap": "Siti Aminah",
        "Kelas": "Kelas 2",
        "Alamat": "Malang",
        "Status": "aktif",
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);

    worksheet["!cols"] = [
      { wch: 20 },
      { wch: 18 },
      { wch: 28 },
      { wch: 16 },
      { wch: 28 },
      { wch: 15 },
    ];

    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "Data Anggota"
    );

    XLSX.writeFile(
      workbook,
      "Template_Data_Anggota_LibraSchool.xlsx"
    );
  };

  // =========================
  // IMPOR EXCEL
  // =========================

  const openImportModal = () => {
    if (!canManage) return;

    setImportRows([]);
    setImportFileName("");
    setIsImportModalOpen(true);
  };

  const closeImportModal = () => {
    if (importing || importLoading) return;

    setIsImportModalOpen(false);
    setImportRows([]);
    setImportFileName("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleExcelFile = async (event) => {
    const file = event.target.files?.[0];

    if (!file) return;

    const extension = file.name.split(".").pop().toLowerCase();

    if (!["xlsx", "xls", "csv"].includes(extension)) {
      showNotification(
        "error",
        "Format file harus Excel (.xlsx, .xls) atau CSV."
      );
      event.target.value = "";
      return;
    }

    setImportLoading(true);
    setImportFileName(file.name);
    setImportRows([]);

    try {
      const buffer = await file.arrayBuffer();

      const workbook = XLSX.read(buffer, {
        type: "array",
        raw: false,
      });

      const firstSheet =
        workbook.Sheets[workbook.SheetNames[0]];

      const rawRows = XLSX.utils.sheet_to_json(firstSheet, {
        defval: "",
        raw: false,
      });

      if (rawRows.length === 0) {
        throw new Error(
          "File Excel tidak memiliki data anggota."
        );
      }

      const { data: existingMembers, error } = await supabase
        .from("members")
        .select("member_number, nis");

      if (error) throw error;

      const existingNumbers = new Set(
        (existingMembers || []).map((item) =>
          String(item.member_number || "").trim().toLowerCase()
        )
      );

      const existingNis = new Set(
        (existingMembers || []).map((item) =>
          String(item.nis || "").trim()
        )
      );

      const seenNumbers = new Set();
      const seenNis = new Set();

      const preparedRows = rawRows.map((row, index) => {
        const nomor = String(
          getCell(row, [
            "Nomor Anggota",
            "Nomor",
            "No Anggota",
            "Member Number",
            "Member ID",
          ])
        ).trim();

        const nis = String(
          getCell(row, ["NIS", "Nomor Induk Siswa"])
        ).trim();

        const nama = String(
          getCell(row, [
            "Nama Lengkap",
            "Nama Anggota",
            "Nama",
          ])
        ).trim();

        const kelas = normalizeClass(
          getCell(row, ["Kelas", "Class"])
        );

        const alamat = String(
          getCell(row, ["Alamat", "Address"])
        ).trim();

        const status = normalizeStatus(
          getCell(row, ["Status", "Status Anggota"])
        );

        let errorMessage = "";

        const normalizedNumber = nomor.toLowerCase();

        if (!nomor || !nis || !nama || !kelas) {
          errorMessage =
            "Nomor anggota, NIS, nama lengkap, dan kelas wajib diisi.";
        } else if (!classOptions.includes(kelas)) {
          errorMessage =
            "Kelas harus antara kelas 1 sampai 6.";
        } else if (existingNumbers.has(normalizedNumber)) {
          errorMessage =
            "Nomor anggota sudah terdaftar di database.";
        } else if (seenNumbers.has(normalizedNumber)) {
          errorMessage =
            "Nomor anggota duplikat di dalam file Excel.";
        } else if (existingNis.has(nis)) {
          errorMessage =
            "NIS sudah terdaftar di database.";
        } else if (seenNis.has(nis)) {
          errorMessage =
            "NIS duplikat di dalam file Excel.";
        }

        if (nomor) {
          seenNumbers.add(normalizedNumber);
        }

        if (nis) {
          seenNis.add(nis);
        }

        return {
          rowNumber: index + 2,
          nomor,
          nis,
          nama,
          kelas,
          alamat,
          status,
          valid: !errorMessage,
          errorMessage,
        };
      });

      setImportRows(preparedRows);

      if (preparedRows.length === 0) {
        showNotification(
          "error",
          "Tidak ditemukan data anggota di file tersebut."
        );
      }
    } catch (error) {
      console.error("Gagal membaca file Excel:", error);

      showNotification(
        "error",
        error.message || "Gagal membaca file Excel."
      );

      setImportRows([]);
    } finally {
      setImportLoading(false);
    }
  };

  const validImportCount = importRows.filter(
    (row) => row.valid
  ).length;

  const invalidImportCount = importRows.filter(
    (row) => !row.valid
  ).length;

  const handleImportSubmit = async () => {
    if (!canManage || importing || validImportCount === 0) {
      return;
    }

    setImporting(true);

    try {
      // Periksa ulang data terbaru dari database.
      const { data: latestMembers, error: latestError } =
        await supabase
          .from("members")
          .select("member_number, nis");

      if (latestError) throw latestError;

      const existingNumbers = new Set(
        (latestMembers || []).map((item) =>
          String(item.member_number || "").trim().toLowerCase()
        )
      );

      const existingNis = new Set(
        (latestMembers || []).map((item) =>
          String(item.nis || "").trim()
        )
      );

      const checkedNumbers = new Set();
      const checkedNis = new Set();

      const rowsToImport = [];
      const updatedRows = [...importRows];

      // Validasi ulang untuk mencegah data duplikat
      // yang mungkin masuk setelah file pertama kali dibaca.
      updatedRows.forEach((row, index) => {
        if (!row.valid) return;

        const normalizedNumber = row.nomor.toLowerCase();

        if (existingNumbers.has(normalizedNumber)) {
          updatedRows[index] = {
            ...row,
            valid: false,
            errorMessage:
              "Nomor anggota sudah terdaftar di database.",
          };
          return;
        }

        if (checkedNumbers.has(normalizedNumber)) {
          updatedRows[index] = {
            ...row,
            valid: false,
            errorMessage:
              "Nomor anggota duplikat di dalam file Excel.",
          };
          return;
        }

        if (existingNis.has(row.nis)) {
          updatedRows[index] = {
            ...row,
            valid: false,
            errorMessage: "NIS sudah terdaftar di database.",
          };
          return;
        }

        if (checkedNis.has(row.nis)) {
          updatedRows[index] = {
            ...row,
            valid: false,
            errorMessage: "NIS duplikat di dalam file Excel.",
          };
          return;
        }

        checkedNumbers.add(normalizedNumber);
        checkedNis.add(row.nis);
        rowsToImport.push(row);
      });

      setImportRows(updatedRows);

      if (rowsToImport.length === 0) {
        showNotification(
          "error",
          "Tidak ada data valid untuk diimpor. Periksa kembali nomor anggota dan NIS."
        );
        return;
      }

      let successCount = 0;
      let failedCount = 0;

      // Impor bertahap maksimal 50 anggota per proses.
      for (let i = 0; i < rowsToImport.length; i += 50) {
        const batch = rowsToImport.slice(i, i + 50);

        const memberData = batch.map((row) => ({
          member_number: row.nomor,
          full_name: row.nama,
          member_type: "siswa",
          nis: row.nis,
          class_name: row.kelas,
          class_id: null,
          address: row.alamat || null,
          status: row.status,
        }));

        const { error } = await supabase
          .from("members")
          .insert(memberData);

        if (error) {
          console.error(
            "Gagal mengimpor kelompok data:",
            error
          );
          failedCount += batch.length;
        } else {
          successCount += batch.length;
        }
      }

      setIsImportModalOpen(false);
      setImportRows([]);
      setImportFileName("");

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      await loadMembers();

      if (failedCount === 0) {
        showNotification(
          "success",
          `${successCount} anggota berhasil diimpor. Nomor anggota mengikuti data dari Excel.`
        );
      } else {
        showNotification(
          "warning",
          `${successCount} anggota berhasil diimpor dan ${failedCount} gagal. Periksa kembali data yang gagal.`
        );
      }
    } catch (error) {
      console.error("Gagal mengimpor anggota:", error);

      showNotification(
        "error",
        error.message || "Gagal mengimpor data anggota."
      );
    } finally {
      setImporting(false);
    }
  };

  // =========================
  // HAPUS ANGGOTA
  // =========================

  const handleDelete = async () => {
    if (!canManage || !deleteId || deleting) return;

    setDeleting(true);

    try {
      const { error } = await supabase
        .from("members")
        .delete()
        .eq("id", deleteId);

      if (error) throw error;

      setDeleteId(null);
      await loadMembers();

      showNotification(
        "success",
        "Data anggota berhasil dihapus."
      );
    } catch (error) {
      console.error("Gagal menghapus anggota:", error);

      showNotification(
        "error",
        error.message || "Gagal menghapus data anggota."
      );
    } finally {
      setDeleting(false);
    }
  };

  // =========================
  // TAMPILAN
  // =========================

  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <span className="page-breadcrumb">
            Menu Utama / Data Anggota
          </span>
          <h1>Data Anggota</h1>
          <p>Kelola data anggota perpustakaan sekolah.</p>
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
              className="primary-button"
              onClick={openImportModal}
              style={{
                backgroundColor: "#16a34a",
              }}
            >
              <Upload size={18} />
              Impor Excel
            </button>

            <button
              type="button"
              className="primary-button"
              onClick={openAddModal}
            >
              <Plus size={18} />
              Tambah Anggota
            </button>
          </div>
        )}
      </div>

      <div className="book-summary">
        <div>
          <Users size={22} />
          <span>Total Anggota</span>
          <strong>{members.length}</strong>
        </div>

        <div>
          <Users size={22} />
          <span>Anggota Aktif</span>
          <strong>{activeMembers}</strong>
        </div>

        <div>
          <Users size={22} />
          <span>Tidak Aktif</span>
          <strong>{inactiveMembers}</strong>
        </div>
      </div>

      <section className="panel book-panel">
        <div className="book-toolbar">
          <div>
            <h3>Daftar Anggota</h3>
            <p>Informasi seluruh anggota perpustakaan.</p>

            <span className="member-total-badge">
              {filteredMembers.length} Anggota
            </span>
          </div>

          <div className="member-toolbar">
            <div className="search-box book-search">
              <Search size={17} />

              <input
                type="text"
                placeholder="Cari nomor, nama, NIS, kelas..."
                value={searchTerm}
                onChange={(event) =>
                  setSearchTerm(event.target.value)
                }
              />

              {searchTerm && (
                <button
                  type="button"
                  className="search-clear"
                  onClick={() => setSearchTerm("")}
                  aria-label="Hapus pencarian"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            <label className="member-filter-label">
              <Filter size={16} />

              <select
                value={filterStatus}
                onChange={(event) =>
                  setFilterStatus(event.target.value)
                }
              >
                <option value="semua">Semua Status</option>
                <option value="aktif">Aktif</option>
                <option value="nonaktif">Tidak Aktif</option>
              </select>
            </label>
          </div>
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>NO.</th>
                <th>NOMOR ANGGOTA</th>
                <th>NAMA ANGGOTA</th>
                <th>NIS</th>
                <th>KELAS</th>
                <th>ALAMAT</th>
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
                    Memuat data anggota...
                  </td>
                </tr>
              ) : filteredMembers.length > 0 ? (
                filteredMembers.map((member, index) => (
                  <tr key={member.id}>
                    <td>{index + 1}</td>
                    <td>{member.nomor}</td>

                    <td>
                      <strong>{member.nama}</strong>
                    </td>

                    <td>{member.nis || "-"}</td>
                    <td>{member.kelas || "-"}</td>
                    <td>{member.alamat || "-"}</td>

                    <td>
                      <span
                        className={`member-status ${
                          member.status === "aktif"
                            ? "active"
                            : "inactive"
                        }`}
                      >
                        {member.status === "aktif"
                          ? "Aktif"
                          : "Tidak Aktif"}
                      </span>
                    </td>

                    {canManage && (
                      <td>
                        <div className="book-actions">
                          <button
                            type="button"
                            className="edit-action"
                            title="Edit anggota"
                            onClick={() => openEditModal(member)}
                          >
                            <Pencil size={16} />
                          </button>

                          <button
                            type="button"
                            className="delete-action"
                            title="Hapus anggota"
                            onClick={() => setDeleteId(member.id)}
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
                    {searchTerm || filterStatus !== "semua"
                      ? "Data anggota tidak ditemukan."
                      : "Belum ada data anggota."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* MODAL TAMBAH / EDIT ANGGOTA */}
      {canManage && isModalOpen && (
        <div className="book-modal-overlay">
          <div className="book-modal">
            <div className="book-modal-heading">
              <div>
                <span className="modal-eyebrow">
                  DATA ANGGOTA
                </span>

                <h2>
                  {editingId ? "Edit Anggota" : "Tambah Anggota"}
                </h2>

                <p>
                  {editingId
                    ? "Perbarui informasi anggota perpustakaan."
                    : "Masukkan informasi anggota baru."}
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
                <label>
                  Nomor Anggota <span>*</span>
                  <input
                    type="text"
                    name="nomor"
                    placeholder="Contoh: LS-0001"
                    value={form.nomor}
                    onChange={handleFormChange}
                    required
                  />
                  <small
                    style={{
                      color: "#64748b",
                      fontWeight: 400,
                    }}
                  >
                    Isi nomor anggota secara manual.
                  </small>
                </label>

                <label>
                  NIS <span>*</span>
                  <input
                    type="text"
                    name="nis"
                    placeholder="Masukkan NIS"
                    value={form.nis}
                    onChange={handleFormChange}
                    required
                  />
                </label>

                <label className="member-full-width">
                  Nama Lengkap <span>*</span>
                  <input
                    type="text"
                    name="nama"
                    placeholder="Masukkan nama lengkap"
                    value={form.nama}
                    onChange={handleFormChange}
                    required
                  />
                </label>

                <label>
                  Kelas <span>*</span>
                  <select
                    name="kelas"
                    value={form.kelas}
                    onChange={handleFormChange}
                    required
                  >
                    <option value="">Pilih Kelas</option>
                    {classOptions.map((kelas) => (
                      <option key={kelas} value={kelas}>
                        {kelas}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Status Anggota
                  <select
                    name="status"
                    value={form.status}
                    onChange={handleFormChange}
                  >
                    <option value="aktif">Aktif</option>
                    <option value="nonaktif">Tidak Aktif</option>
                  </select>
                </label>

                <label className="member-full-width">
                  Alamat
                  <textarea
                    name="alamat"
                    placeholder="Masukkan alamat anggota"
                    value={form.alamat}
                    onChange={handleFormChange}
                    rows="3"
                  />
                </label>
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
                  className="primary-button"
                  disabled={saving}
                >
                  <Save size={17} />
                  {saving
                    ? "Menyimpan..."
                    : editingId
                      ? "Simpan Perubahan"
                      : "Simpan Anggota"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL IMPOR EXCEL */}
      {canManage && isImportModalOpen && (
        <div className="book-modal-overlay">
          <div
            className="book-modal"
            style={{
              width: "min(900px, 95vw)",
              maxWidth: "900px",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            <div className="book-modal-heading">
              <div>
                <span className="modal-eyebrow">
                  IMPOR DATA
                </span>
                <h2>Impor Anggota dari Excel</h2>
                <p>
                  Tambahkan banyak anggota sekaligus menggunakan
                  file Excel.
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={closeImportModal}
                disabled={importing || importLoading}
              >
                <X size={20} />
              </button>
            </div>

            <div
              style={{
                backgroundColor: "#eff6ff",
                border: "1px solid #bfdbfe",
                borderRadius: "12px",
                padding: "16px",
                marginBottom: "20px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  marginBottom: "8px",
                  color: "#1d4ed8",
                  fontWeight: 700,
                }}
              >
                <FileSpreadsheet size={20} />
                Petunjuk Impor Excel
              </div>

              <p
                style={{
                  fontSize: "13px",
                  lineHeight: 1.7,
                  color: "#475569",
                  margin: 0,
                }}
              >
                Unduh template Excel terlebih dahulu. Isi
                Nomor Anggota, NIS, Nama Lengkap, dan Kelas.
                Nomor anggota wajib diisi secara manual dan
                tidak dibuat otomatis oleh sistem. Pastikan
                nomor anggota dan NIS tidak duplikat.
              </p>

              <button
                type="button"
                onClick={downloadExcelTemplate}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "7px",
                  marginTop: "13px",
                  padding: "9px 13px",
                  border: "1px solid #2563eb",
                  borderRadius: "8px",
                  backgroundColor: "#fff",
                  color: "#2563eb",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <Download size={16} />
                Unduh Template Excel
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleExcelFile}
              style={{ display: "none" }}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={importLoading || importing}
              style={{
                width: "100%",
                minHeight: "115px",
                padding: "20px",
                border: "2px dashed #94a3b8",
                borderRadius: "12px",
                backgroundColor: "#f8fafc",
                color: "#334155",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                cursor: "pointer",
              }}
            >
              {importLoading ? (
                <LoaderCircle size={28} />
              ) : (
                <Upload size={28} color="#2563eb" />
              )}

              <strong>
                {importLoading
                  ? "Membaca file Excel..."
                  : "Pilih File Excel"}
              </strong>

              <span
                style={{
                  fontSize: "12px",
                  color: "#64748b",
                }}
              >
                {importFileName ||
                  "Format yang didukung: .xlsx, .xls, .csv"}
              </span>
            </button>

            {importRows.length > 0 && (
              <>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(3, minmax(0, 1fr))",
                    gap: "10px",
                    margin: "20px 0",
                  }}
                >
                  <div
                    style={{
                      padding: "13px",
                      backgroundColor: "#f1f5f9",
                      borderRadius: "10px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "12px",
                        color: "#64748b",
                      }}
                    >
                      Total Data
                    </span>
                    <strong
                      style={{
                        display: "block",
                        fontSize: "22px",
                        color: "#1e293b",
                      }}
                    >
                      {importRows.length}
                    </strong>
                  </div>

                  <div
                    style={{
                      padding: "13px",
                      backgroundColor: "#f0fdf4",
                      borderRadius: "10px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "12px",
                        color: "#15803d",
                      }}
                    >
                      Data Valid
                    </span>
                    <strong
                      style={{
                        display: "block",
                        fontSize: "22px",
                        color: "#15803d",
                      }}
                    >
                      {validImportCount}
                    </strong>
                  </div>

                  <div
                    style={{
                      padding: "13px",
                      backgroundColor: "#fef2f2",
                      borderRadius: "10px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "12px",
                        color: "#dc2626",
                      }}
                    >
                      Data Bermasalah
                    </span>
                    <strong
                      style={{
                        display: "block",
                        fontSize: "22px",
                        color: "#dc2626",
                      }}
                    >
                      {invalidImportCount}
                    </strong>
                  </div>
                </div>

                <h3
                  style={{
                    fontSize: "15px",
                    marginBottom: "10px",
                  }}
                >
                  Pratinjau Data Anggota
                </h3>

                <div
                  style={{
                    maxHeight: "300px",
                    overflow: "auto",
                    border: "1px solid #e2e8f0",
                    borderRadius: "10px",
                  }}
                >
                  <table style={{ width: "100%" }}>
                    <thead>
                      <tr>
                        <th>BARIS</th>
                        <th>NOMOR ANGGOTA</th>
                        <th>NIS</th>
                        <th>NAMA</th>
                        <th>KELAS</th>
                        <th>STATUS VALIDASI</th>
                      </tr>
                    </thead>

                    <tbody>
                      {importRows.map((row, index) => (
                        <tr key={`${row.rowNumber}-${index}`}>
                          <td>{row.rowNumber}</td>
                          <td>{row.nomor || "-"}</td>
                          <td>{row.nis || "-"}</td>
                          <td>{row.nama || "-"}</td>
                          <td>{row.kelas || "-"}</td>
                          <td>
                            {row.valid ? (
                              <span
                                style={{
                                  color: "#15803d",
                                  fontWeight: 600,
                                  fontSize: "12px",
                                }}
                              >
                                <CheckCircle
                                  size={14}
                                  style={{
                                    display: "inline",
                                    verticalAlign: "middle",
                                    marginRight: "4px",
                                  }}
                                />
                                Valid
                              </span>
                            ) : (
                              <span
                                title={row.errorMessage}
                                style={{
                                  color: "#dc2626",
                                  fontSize: "12px",
                                  fontWeight: 600,
                                }}
                              >
                                <AlertCircle
                                  size={14}
                                  style={{
                                    display: "inline",
                                    verticalAlign: "middle",
                                    marginRight: "4px",
                                  }}
                                />
                                {row.errorMessage}
                              </span>
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
                  Hanya data yang valid yang akan disimpan.
                  Nomor anggota dan NIS harus berbeda untuk
                  setiap anggota. Data yang bermasalah perlu
                  diperbaiki di file Excel, kemudian unggah
                  kembali.
                </p>
              </>
            )}

            <div className="book-modal-actions">
              <button
                type="button"
                className="cancel-button"
                onClick={closeImportModal}
                disabled={importing || importLoading}
              >
                Batal
              </button>

              <button
                type="button"
                className="primary-button"
                onClick={handleImportSubmit}
                disabled={
                  importing ||
                  importLoading ||
                  validImportCount === 0
                }
                style={{
                  opacity:
                    importing ||
                    importLoading ||
                    validImportCount === 0
                      ? 0.6
                      : 1,
                }}
              >
                {importing ? (
                  <LoaderCircle size={17} />
                ) : (
                  <Upload size={17} />
                )}

                {importing
                  ? "Mengimpor..."
                  : `Impor ${validImportCount} Anggota`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL KONFIRMASI HAPUS */}
      {canManage && deleteId && (
        <ConfirmDeleteModal
          title="Hapus Data Anggota?"
          highlightedText="data anggota"
          cancelText="Tidak"
          confirmText="Ya, Hapus"
          loading={deleting}
          onCancel={() => setDeleteId(null)}
          onConfirm={handleDelete}
        />
      )}

      {/* NOTIFIKASI */}
      {notification && (
        <div className={`book-notification ${notification.type}`}>
          <div className="notification-icon">
            {notification.type === "success" ? (
              <CheckCircle size={20} />
            ) : notification.type === "error" ? (
              <AlertCircle size={20} />
            ) : (
              <AlertTriangle size={20} />
            )}
          </div>

          <div className="notification-content">
            <strong>
              {notification.type === "success"
                ? "Berhasil"
                : "Perhatian"}
            </strong>
            <p>{notification.message}</p>
          </div>

          <button
            type="button"
            className="notification-close"
            onClick={() => setNotification(null)}
            aria-label="Tutup pemberitahuan"
          >
            <X size={17} />
          </button>
        </div>
      )}
    </div>
  );
}
