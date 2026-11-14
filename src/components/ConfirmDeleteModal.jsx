
import { AlertTriangle, Trash2 } from "lucide-react";

function ConfirmDeleteModal({
  title = "Hapus Data?",
  message = "Apakah kamu yakin ingin menghapus data ini? Tindakan ini tidak dapat dibatalkan.",
  highlightedText = "data buku",
  cancelText = "Tidak",
  confirmText = "Ya, Hapus",
  loading = false,
  onCancel,
  onConfirm,
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        zIndex: 9999,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-delete-title"
        style={{
          width: "100%",
          maxWidth: "420px",
          backgroundColor: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "16px",
          padding: "30px",
          textAlign: "center",
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.18)",
          boxSizing: "border-box",
        }}
      >
        {/* Ikon peringatan */}
        <div
          style={{
            width: "64px",
            height: "64px",
            borderRadius: "50%",
            backgroundColor: "#fee2e2",
            color: "#dc2626",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 20px",
          }}
        >
          <AlertTriangle size={30} />
        </div>

        {/* Judul */}
        <h2
          id="confirm-delete-title"
          style={{
            margin: "0 0 12px",
            fontSize: "21px",
            fontWeight: 700,
            color: "#1e293b",
          }}
        >
          {title}
        </h2>

        {/* Pesan konfirmasi */}
        <p
          style={{
            margin: "0 0 26px",
            fontSize: "14px",
            lineHeight: 1.7,
            color: "#64748b",
          }}
        >
          Apakah kamu yakin ingin menghapus{" "}
          <strong
            style={{
              color: "#dc2626",
              fontWeight: 700,
            }}
          >
            {highlightedText}
          </strong>
          ? Tindakan ini tidak dapat dibatalkan.
        </p>

        {/* Tombol */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "12px",
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            style={{
              flex: 1,
              padding: "12px 16px",
              border: "1px solid #cbd5e1",
              borderRadius: "9px",
              backgroundColor: "#ffffff",
              color: "#475569",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {cancelText}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            style={{
              flex: 1,
              padding: "12px 16px",
              border: "none",
              borderRadius: "9px",
              backgroundColor: "#dc2626",
              color: "#ffffff",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "7px",
              opacity: loading ? 0.7 : 1,
            }}
          >
            <Trash2 size={16} />
            {loading ? "Memproses..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDeleteModal;
