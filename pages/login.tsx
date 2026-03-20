import { useState, useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";

export default function Login() {
  const router = useRouter();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => {
      if (d.loggedIn) router.replace(d.user.isAdmin ? "/admin" : "/");
      else setChecking(false);
    }).catch(() => setChecking(false));
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setLoading(true);
    try {
      const res  = await fetch("/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Login failed");
      else router.replace(data.isAdmin ? "/admin" : "/");
    } catch { setError("Network error. Please try again."); }
    finally { setLoading(false); }
  }

  const S = { display:"flex", alignItems:"center", justifyContent:"center", minHeight:"100vh", background:"#0a0c0f" } as const;
  if (checking) return (
    <div style={S}>
      <div style={{ width:32,height:32,border:"2px solid #2a2d35",borderTopColor:"#00e5a0",borderRadius:"50%",animation:"spin .8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <>
      <Head>
        <title>Login — LC Tracker</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;600;800&display=swap" rel="stylesheet" />
      </Head>
      <div className="root">
        <div className="scanlines" />
        <div className="center">
          <div className="card">
            <div className="logo-row">
              <span className="lb">[</span><span className="lt">LC</span><span className="lb">]</span>
              <span className="logo-title">Progress Tracker</span>
            </div>
            <p className="subtitle">// authorised access only</p>
            <form onSubmit={handleSubmit} className="form">
              <div className="field">
                <label className="label">EMAIL_ID</label>
                <input type="email" className="input" value={email} onChange={(e)=>setEmail(e.target.value)}
                  placeholder="you@example.com" required autoComplete="email" autoFocus />
              </div>
              <div className="field">
                <label className="label">PASSWORD</label>
                <input type="password" className="input" value={password} onChange={(e)=>setPassword(e.target.value)}
                  placeholder="••••••••" required autoComplete="current-password" />
              </div>
              {error && <div className="error-box"><span>⚠</span> {error}</div>}
              <button type="submit" className="btn" disabled={loading}>
                {loading ? <span className="btn-inner"><span className="btn-spinner" /> AUTHENTICATING...</span> : "→ SIGN IN"}
              </button>
            </form>
            <p className="footer-note">Access restricted. Contact your admin to request access.</p>
          </div>
        </div>
      </div>
      <style jsx global>{`
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        :root{--bg:#0a0c0f;--surface:#111318;--surface2:#191c22;--border:#2a2d35;--text:#e2e8f0;--dim:#6b7280;--accent:#00e5a0;--accent2:#00b8d4;--danger:#ef4444;--mono:'Space Mono',monospace;--sans:'Syne',sans-serif;}
        body{background:var(--bg);color:var(--text);font-family:var(--mono);min-height:100vh;}
        @keyframes spin{to{transform:rotate(360deg);}}
      `}</style>
      <style jsx>{`
        .root{position:relative;min-height:100vh;display:flex;flex-direction:column;}
        .scanlines{pointer-events:none;position:fixed;inset:0;background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.03) 2px,rgba(0,0,0,.03) 4px);z-index:100;}
        .center{flex:1;display:flex;align-items:center;justify-content:center;padding:2rem 1rem;}
        .card{width:100%;max-width:420px;background:var(--surface);border:1px solid var(--border);padding:2.5rem 2rem;position:relative;}
        .card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,var(--accent2),var(--accent));}
        .logo-row{display:flex;align-items:center;gap:.4rem;margin-bottom:.5rem;}
        .lb{color:var(--accent);font-size:1.3rem;font-weight:700;}
        .lt{color:var(--accent);font-size:1rem;font-weight:700;}
        .logo-title{font-family:var(--sans);font-weight:800;font-size:1rem;letter-spacing:.04em;margin-left:.3rem;}
        .subtitle{font-size:.65rem;color:var(--dim);letter-spacing:.08em;margin-bottom:2rem;}
        .form{display:flex;flex-direction:column;gap:1.2rem;}
        .field{display:flex;flex-direction:column;gap:.4rem;}
        .label{font-size:.6rem;letter-spacing:.14em;color:var(--accent2);}
        .input{background:var(--surface2);border:1px solid var(--border);color:var(--text);font-family:var(--mono);font-size:.85rem;padding:.65rem .9rem;outline:none;transition:border-color .2s;width:100%;}
        .input:focus{border-color:var(--accent);}
        .input::placeholder{color:var(--border);}
        .error-box{background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.3);color:var(--danger);padding:.6rem .8rem;font-size:.75rem;display:flex;gap:.4rem;align-items:center;}
        .btn{background:transparent;border:1px solid var(--accent);color:var(--accent);font-family:var(--mono);font-size:.75rem;font-weight:700;letter-spacing:.12em;padding:.75rem;cursor:pointer;transition:all .2s;margin-top:.4rem;width:100%;}
        .btn:hover:not(:disabled){background:var(--accent);color:var(--bg);}
        .btn:disabled{opacity:.6;cursor:not-allowed;border-color:var(--dim);color:var(--dim);}
        .btn-inner{display:flex;align-items:center;justify-content:center;gap:.5rem;}
        .btn-spinner{display:inline-block;width:12px;height:12px;border:1.5px solid currentColor;border-top-color:transparent;border-radius:50%;animation:spin .7s linear infinite;}
        .footer-note{margin-top:1.5rem;font-size:.6rem;color:var(--border);text-align:center;letter-spacing:.05em;}
      `}</style>
    </>
  );
}
