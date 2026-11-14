
import { useState } from "react";
import {
  LockKeyhole,
  BookOpen,
  Eye,
  EyeOff,
  UserRound,
} from "lucide-react";
import { supabase } from "../lib/supabase";

const accounts = {
  "tim pengembang": "pengembang@pustakara.local",
  pustakawan: "pustakawan@pustakara.local",
  "kepala sekolah": "kepalasekolah@pustakara.local",
};

export default function Login({ onLogin, logoUrl = "" }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [logoError, setLogoError] = useState(false);

  const handleLogin = async (event) => {
    event.preventDefault();
    setError("");

    const email = accounts[username.trim().toLowerCase()];

    if (!email) {
      setError("Nama akun tidak ditemukan.");
      return;
    }

    if (!password) {
      setError("Silakan masukkan kata sandi.");
      return;
    }

    setLoading(true);

    try {
      const { data, error: loginError } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        });

      if (loginError) throw loginError;

      const { data: profile, error: profileError } =
        await supabase
          .from("user_profiles")
          .select("username, role")
          .eq("id", data.user.id)
          .single();

      if (profileError) throw profileError;

      onLogin(profile);
    } catch (err) {
      await supabase.auth.signOut();

      setError(
        err.message === "Invalid login credentials"
          ? "Nama akun atau kata sandi salah."
          : err.message || "Gagal masuk. Silakan coba lagi."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>

        {/* LOGO PUSTAKARA DARI SUPABASE */}
        <div style={styles.logo}>
          {logoUrl && !logoError ? (
            <img
              src={logoUrl}
              alt="Logo PUSTAKARA"
              style={styles.logoImage}
              onError={() => setLogoError(true)}
            />
          ) : (
            <BookOpen
              size={34}
              strokeWidth={2}
            />
          )}
        </div>

        <h1 style={styles.title}>PUSTAKARA</h1>
        <p style={styles.subtitle}>
          LIBRARY MANAGEMENT SYSTEM
        </p>

        <h2 style={styles.heading}>Selamat Datang!</h2>
        <p style={styles.description}>
          Silakan masuk ke akun Anda untuk melanjutkan.
        </p>

        <form onSubmit={handleLogin}>
          <label style={styles.label}>Nama Akun</label>

          <div style={styles.inputWrap}>
            <UserRound
              size={18}
              style={styles.inputIcon}
            />

            <input
              style={styles.input}
              type="text"
              placeholder="Masukkan nama akun"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>

          <label style={styles.label}>Kata Sandi</label>

          <div style={styles.inputWrap}>
            <LockKeyhole
              size={18}
              style={styles.inputIcon}
            />

            <input
              style={styles.input}
              type={showPassword ? "text" : "password"}
              placeholder="Masukkan kata sandi"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />

            <button
              type="button"
              style={styles.eyeButton}
              onClick={() => setShowPassword(!showPassword)}
              aria-label="Tampilkan atau sembunyikan kata sandi"
            >
              {showPassword ? (
                <EyeOff size={19} />
              ) : (
                <Eye size={19} />
              )}
            </button>
          </div>

          {error && (
            <p style={styles.error}>{error}</p>
          )}

          <button
            type="submit"
            style={{
              ...styles.button,
              opacity: loading ? 0.7 : 1,
              cursor: loading ? "not-allowed" : "pointer",
            }}
            disabled={loading}
          >
            <LockKeyhole size={18} />

            {loading
              ? "Memeriksa akun..."
              : "Masuk"}
          </button>
        </form>

        <p style={styles.footer}>
          Sistem Informasi Manajemen Perpustakaan Sekolah
        </p>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#F5F6F0",
    padding: "24px",
    fontFamily: "Manrope, sans-serif",
    boxSizing: "border-box",
  },

  card: {
    width: "100%",
    maxWidth: "420px",
    background: "#FFFFFF",
    padding: "38px",
    borderRadius: "20px",
    boxShadow: "0 12px 40px rgba(36,91,112,0.10)",
    boxSizing: "border-box",
  },

  logo: {
    width: "70px",
    height: "70px",
    borderRadius: "16px",
    background: "#FFFFFF",
    border: "1px solid #E4EBE7",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 auto 12px",
    padding: "6px",
    boxSizing: "border-box",
    overflow: "hidden",
    color: "#245B70",
    boxShadow: "0 4px 12px rgba(36,91,112,0.08)",
  },

  logoImage: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    display: "block",
  },

  title: {
    textAlign: "center",
    color: "#245B70",
    margin: 0,
    fontSize: "30px",
    fontWeight: 800,
    letterSpacing: "0.5px",
  },

  subtitle: {
    textAlign: "center",
    color: "#82958B",
    fontSize: "10px",
    letterSpacing: "2px",
    marginTop: "4px",
  },

  heading: {
    textAlign: "center",
    color: "#263D43",
    marginTop: "30px",
    marginBottom: "6px",
  },

  description: {
    textAlign: "center",
    color: "#82908B",
    fontSize: "13px",
    marginBottom: "28px",
  },

  label: {
    display: "block",
    fontSize: "13px",
    fontWeight: 700,
    color: "#344D50",
    marginBottom: "8px",
    marginTop: "18px",
  },

  inputWrap: {
    display: "flex",
    alignItems: "center",
    border: "1px solid #DCE5DF",
    borderRadius: "9px",
    paddingLeft: "12px",
    background: "#FFFFFF",
    minHeight: "46px",
    boxSizing: "border-box",
  },

  inputIcon: {
    color: "#82908B",
    flexShrink: 0,
  },

  input: {
    flex: 1,
    width: "100%",
    minWidth: 0,
    padding: "13px 10px",
    border: "none",
    outline: "none",
    background: "transparent",
    color: "#263D43",
    fontSize: "14px",
    boxSizing: "border-box",
  },

  eyeButton: {
    border: "none",
    background: "transparent",
    color: "#82908B",
    padding: "10px",
    cursor: "pointer",
    flexShrink: 0,
  },

  error: {
    color: "#DC2626",
    fontSize: "12px",
    marginTop: "12px",
  },

  button: {
    width: "100%",
    marginTop: "25px",
    padding: "14px",
    border: "none",
    borderRadius: "9px",
    background: "#245B70",
    color: "#FFFFFF",
    fontWeight: 700,
    fontSize: "14px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "9px",
  },

  footer: {
    textAlign: "center",
    fontSize: "10px",
    color: "#98A49E",
    marginTop: "28px",
  },
};
