
import { useEffect, useState } from "react";
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
} from "lucide-react";
import { supabase } from "../lib/supabase";

const emptyForm = {
  nomor: "",
  nama: "",
  nis: "",
  kelas: "",
  alamat: "",
  status: "aktif",
};

export default function DataAnggota() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("semua");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);

  const [deleteId, setDeleteId] = useState(null);
  const [notification, setNotification] = useState(null);

  const showNotification = (type, message) => {
    setNotification({ type, message });

    window.setTimeout(() => {
      setNotification(null);
    }, 3500);
  };

  // Mengambil data anggota dari Supabase
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
        nomor: member.member_number,
        nama: member.full_name,
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

  useEffect(() => {
    loadMembers();
  }, []);

  // Ringkasan anggota
  const activeMembers = members.filter(
    (member) => member.status === "aktif"
  ).length;

  const inactiveMembers = members.filter(
    (member) => member.status === "nonaktif"
  ).length;

  // Pencarian dan filter
  const filteredMembers = members.filter((member) => {
    const keyword = searchTerm.toLowerCase();

    const matchesSearch =
      member.nomor.toLowerCase().includes(keyword) ||
      member.nama.toLowerCase().includes(keyword) ||
      member.nis.toLowerCase().includes(keyword) ||
      member.kelas.toLowerCase().includes(keyword);

    const matchesStatus =
      filterStatus === "semua" ||
      member.status === filterStatus;

    return matchesSearch && matchesStatus;
  });

  // Tambah anggota
  const openAddModal = () => {
    setForm(emptyForm);
    setEditingId(null);
    setIsModalOpen(true);
  };

  // Edit anggota
  const openEditModal = (member) => {
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

  // Tutup modal
  const closeModal = () => {
    if (saving) return;

    setIsModalOpen(false);
    setForm(emptyForm);
    setEditingId(null);
  };

  // Perubahan formulir
  const handleFormChange = (event) => {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  // Simpan data anggota
  const handleSubmit = async (event) => {
    event.preventDefault();

    if (
      !form.nomor.trim() ||
      !form.nama.trim() ||
      !form.nis.trim() ||
      !form.kelas
    ) {
      showNotification(
        "error",
        "Mohon lengkapi data yang wajib diisi."
      );
      return;
    }

    const duplicateNumber = members.some(
      (member) =>
        member.nomor.toLowerCase() ===
          form.nomor.trim().toLowerCase() &&
        member.id !== editingId
    );

    if (duplicateNumber) {
      showNotification(
        "error",
        "Nomor anggota sudah digunakan."
      );
      return;
    }

    const duplicateNis = members.some(
      (member) =>
        member.nis === form.nis.trim() &&
        member.id !== editingId
    );

    if (duplicateNis) {
      showNotification(
        "error",
        "NIS tersebut sudah terdaftar."
      );
      return;
    }

    setSaving(true);

    const memberData = {
      member_number: form.nomor.trim(),
      full_name: form.nama.trim(),
      member_type: "siswa",
      nis: form.nis.trim(),
      class_name: form.kelas,
      class_id: null,
      address: form.alamat.trim() || null,
      status: form.status,
    };

    try {
      let error;

      if (editingId) {
        const result = await supabase
          .from("members")
          .update(memberData)
          .eq("id", editingId);

        error = result.error;
      } else {
        const result = await supabase
          .from("members")
          .insert([memberData]);

        error = result.error;
      }

      if (error) throw error;

      setIsModalOpen(false);
      setForm(emptyForm);
      setEditingId(null);

      await loadMembers();

      showNotification(
        "success",
        editingId
          ? "Data anggota berhasil diperbarui."
          : "Anggota baru berhasil ditambahkan."
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

  // Hapus anggota
  const handleDelete = async () => {
    if (!deleteId) return;

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
    }
  };

  return (
    <div className="content member-page">

      {/* HEADER */}
      <div className="page-heading">
        <div>
          <span className="page-eyebrow">MASTER DATA</span>
          <h2>Data Anggota</h2>
          <p>Kelola data anggota perpustakaan sekolah.</p>
        </div>

        <button
          className="primary-button"
          onClick={openAddModal}
        >
          <Plus size={18} />
          Tambah Anggota
        </button>
      </div>

      {/* RINGKASAN */}
      <div className="member-summary">
        <div className="member-summary-icon">
          <Users size={24} />
        </div>

        <div>
          <span>Total Anggota</span>
          <h3>{members.length}</h3>
        </div>

        <div className="member-summary-divider" />

        <div>
          <span>Anggota Aktif</span>
          <h3>{activeMembers}</h3>
        </div>

        <div className="member-summary-divider" />

        <div>
          <span>Tidak Aktif</span>
          <h3>{inactiveMembers}</h3>
        </div>
      </div>

      {/* DAFTAR ANGGOTA */}
      <div className="data-card">
        <div className="data-card-heading">
          <div>
            <h3>Daftar Anggota</h3>
            <p>Informasi seluruh anggota perpustakaan.</p>
          </div>

          <span className="member-total-badge">
            {members.length} Anggota
          </span>
        </div>

        {/* PENCARIAN */}
        <div className="member-toolbar">
          <div className="book-search">
            <Search size={18} />

            <input
              type="text"
              placeholder="Cari nomor, nama, NIS, atau kelas..."
              value={searchTerm}
              onChange={(event) =>
                setSearchTerm(event.target.value)
              }
            />

            {searchTerm && (
              <button
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

        {/* TABEL */}
        <div className="table-wrapper">
          <table className="data-table member-table">
            <thead>
              <tr>
                <th>No.</th>
                <th>Nomor Anggota</th>
                <th>Nama Anggota</th>
                <th>NIS</th>
                <th>Kelas</th>
                <th>Alamat</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="8" className="member-empty">
                    Memuat data anggota...
                  </td>
                </tr>
              ) : filteredMembers.length > 0 ? (
                filteredMembers.map((member, index) => (
                  <tr key={member.id}>
                    <td>{index + 1}</td>

                    <td>
                      <span className="member-number">
                        {member.nomor}
                      </span>
                    </td>

                    <td>
                      <div className="member-name-cell">
                        <div className="member-avatar">
                          {member.nama.charAt(0).toUpperCase()}
                        </div>
                        <span>{member.nama}</span>
                      </div>
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

                    <td>
                      <div className="book-actions">
                        <button
                          className="edit-action"
                          title="Edit anggota"
                          onClick={() =>
                            openEditModal(member)
                          }
                        >
                          <Pencil size={16} />
                        </button>

                        <button
                          className="delete-action"
                          title="Hapus anggota"
                          onClick={() =>
                            setDeleteId(member.id)
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
                  <td colSpan="8" className="member-empty">
                    <Users size={30} />
                    <p>
                      {searchTerm || filterStatus !== "semua"
                        ? "Data anggota tidak ditemukan."
                        : "Belum ada data anggota."}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL TAMBAH DAN EDIT */}
      {isModalOpen && (
        <div className="book-modal-overlay">
          <div className="book-modal">

            <div className="book-modal-heading">
              <div>
                <span className="modal-eyebrow">
                  DATA ANGGOTA
                </span>

                <h3>
                  {editingId
                    ? "Edit Anggota"
                    : "Tambah Anggota"}
                </h3>

                <p>
                  {editingId
                    ? "Perbarui informasi anggota perpustakaan."
                    : "Masukkan informasi anggota baru."}
                </p>
              </div>

              <button
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
                    placeholder="Contoh: AGT001"
                    value={form.nomor}
                    onChange={handleFormChange}
                    required
                  />
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

                {/* KELAS SD */}
                <label>
                  Kelas <span>*</span>
                  <select
                    name="kelas"
                    value={form.kelas}
                    onChange={handleFormChange}
                    required
                  >
                    <option value="">Pilih Kelas</option>
                    <option value="Kelas 1">Kelas 1</option>
                    <option value="Kelas 2">Kelas 2</option>
                    <option value="Kelas 3">Kelas 3</option>
                    <option value="Kelas 4">Kelas 4</option>
                    <option value="Kelas 5">Kelas 5</option>
                    <option value="Kelas 6">Kelas 6</option>
                  </select>
                </label>

                {/* STATUS */}
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

      {/* KONFIRMASI HAPUS */}
      {deleteId && (
        <div className="book-modal-overlay">
          <div className="book-modal delete-modal">
            <div className="delete-icon">
              <AlertTriangle size={28} />
            </div>

            <h3>Hapus Anggota?</h3>

            <p>
              Apakah kamu yakin ingin menghapus data anggota ini?
              Data yang dihapus tidak dapat dikembalikan.
            </p>

            <div className="book-modal-footer">
              <button
                className="secondary-button"
                onClick={() => setDeleteId(null)}
              >
                Batal
              </button>

              <button
                className="confirm-delete-button"
                onClick={handleDelete}
              >
                <Trash2 size={16} />
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NOTIFIKASI */}
      {notification && (
        <div className={`book-notification ${notification.type}`}>
          <div className="notification-icon">
            {notification.type === "success" ? (
              <CheckCircle size={20} />
            ) : (
              <AlertCircle size={20} />
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
