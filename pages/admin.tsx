import { useState, useEffect, useCallback } from "react";
import Head from "next/head";
import { useRouter } from "next/router";

interface User { id: number; email: string; created_at: string; }

export default function Admin() {
  const router = useRouter();
  const [users, setUsers]           = useState<User[]>([]);
  const [filtered, setFiltered]     = useState<User[]>([]);
  const [search, setSearch]         = useState("");
  const [newEmail, setNewEmail]     = useState("");
  const [newPass, setNewPass]       = useState("");
  const [loading, setLoading]       = useState(true);
  const [adding, setAdding]         = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [editEmail, setEditEmail]   = useState<string | null>(null);
  const [editPass, setEditPass]     = useState("");
  const [savingPass, setSavingPass] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [success, setSuccess]       = useState<string | null>(null);
  const [adminEmail, setAdminEmail] = useState("");
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => {
      if (!d.loggedIn || !d.user?.isAdmin) { router.replace("/login"); return; }
      setAdminEmail(d.user.email); setAuthChecked(true);
    }).catch(() => router.replace("/login"));
  }, [router]);

  const fetchUsers = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/admin/emails");
      if (res.status === 403) { router.replace("/login"); return; }
      const list = (await res.json()).emails || [];
      setUsers(list); setFiltered(list);
    } catch { setError("Failed to load users."); }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => { if (authChecked) fetchUsers(); }, [authChecked, fetchUsers]);

  // Search filter
  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(q ? users.filter((u) => u.email.toLowerCase().includes(q)) : users);
  }, [search, users]);

  function flash(msg: string, isErr = false) {
    if (isErr) { setError(msg); setSuccess(null); } else { setSuccess(msg); setError(null); }
    setTimeout(() => { setError(null); setSuccess(null); }, 3500);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmail.includes("@")) return flash("Valid email required.", true);
    if (newPass.length < 6) return flash("Password ≥ 6 characters.", true);
    setAdding(true);
    try {
      const res  = await fetch("/api/admin/emails", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ email:newEmail.trim(), password:newPass }) });
      const data = await res.json();
      if (!res.ok) return flash(data.error || "Failed.", true);
      setNewEmail(""); setNewPass(""); flash(`✓ ${newEmail.trim()} added.`); fetchUsers();
    } catch { flash("Network error.", true); }
    finally { setAdding(false); }
  }

  async function handleSavePass(email: string) {
    if (editPass.length < 6) return flash("Password ≥ 6 characters.", true);
    setSavingPass(true);
    try {
      const res  = await fetch("/api/admin/emails", { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ email, password:editPass }) });
      const data = await res.json();
      if (!res.ok) return flash(data.error || "Failed.", true);
      setEditEmail(null); setEditPass(""); flash(`✓ Password updated.`);
    } catch { flash("Network error.", true); }
    finally { setSavingPass(false); }
  }

  async function handleRemove(id: number, email: string) {
    if (!confirm(`Remove ${email}?`)) return;
    setRemovingId(id);
    try {
      const res  = await fetch("/api/admin/emails", { method:"DELETE", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ id }) });
      const data = await res.json();
      if (!res.ok) return flash(data.error || "Failed.", true);
      flash(`✓ ${email} removed.`); fetchUsers();
    } catch { flash("Network error.", true); }
    finally { setRemovingId(null); }
  }

  if (!authChecked) return (
    <div style={{ display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"#0a0c0f" }}>
      <div style={{ width:32,height:32,border:"2px solid #2a2d35",borderTopColor:"#00e5a0",borderRadius:"50%",animation:"spin .8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <>
      <Head>
        <title>Admin — LC Tracker</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;600;800&display=swap" rel="stylesheet" />
      </Head>
      <div className="root">
        <div className="scanlines" />

        <header className="header">
          <div className="hl">
            <span className="lb">[</span><span className="lt">LC</span><span className="lb">]</span>
            <span className="title">Admin Panel</span>
            <span className="badge">ADMIN</span>
          </div>
          <div className="hr">
            <span className="admin-email">{adminEmail}</span>
            <button className="nav-btn" onClick={() => router.push("/")}>← TRACKER</button>
            <button className="logout-btn" onClick={async()=>{ await fetch("/api/auth/logout",{method:"POST"}); router.replace("/login"); }}>LOGOUT</button>
          </div>
        </header>

        {/* Global search bar */}
        <div className="search-bar-wrap">
          <div className="search-bar">
            <span className="search-icon">⌕</span>
            <input className="search-input" placeholder="Search users by email…" value={search}
              onChange={(e) => setSearch(e.target.value)} />
            {search && <button className="search-clear" onClick={() => setSearch("")}>✕</button>}
          </div>
        </div>

        <main className="main">
          {error   && <div className="flash flash-err">⚠ {error}</div>}
          {success && <div className="flash flash-ok">{success}</div>}

          {/* Add user */}
          <section className="card">
            <div className="card-hdr">
              <span className="card-title">ADD USER</span>
              <span className="card-sub">// Password stored as bcrypt hash</span>
            </div>
            <form onSubmit={handleAdd} className="add-form">
              <input type="email" className="input" placeholder="user@example.com" value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)} disabled={adding} autoComplete="off" />
              <input type="password" className="input" placeholder="Password (min 6 chars)" value={newPass}
                onChange={(e) => setNewPass(e.target.value)} disabled={adding} autoComplete="new-password" />
              <button type="submit" className="add-btn" disabled={adding}>
                {adding ? <span className="si"><span className="sp" /> ADDING…</span> : "+ ADD USER"}
              </button>
            </form>
          </section>

          {/* User list */}
          <section className="card">
            <div className="card-hdr">
              <span className="card-title">AUTHORISED USERS</span>
              <span className="card-count">{filtered.length}/{users.length}</span>
            </div>
            {loading ? (
              <div className="list-loading"><div className="spinner-sm" /> Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="empty-state"><p>{search ? "No users match your search." : "No users yet."}</p></div>
            ) : (
              <div className="ulist">
                <div className="ulist-hdr"><span>#</span><span>EMAIL</span><span>ADDED</span><span>ACTIONS</span></div>
                {filtered.map((u, i) => (
                  <div key={u.id}>
                    <div className="ulist-row">
                      <span className="rn">{i + 1}</span>
                      <span className="re">{u.email}</span>
                      <span className="rd">{new Date(u.created_at).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})}</span>
                      <span className="ra">
                        <button className="edit-btn" onClick={() => { setEditEmail(editEmail===u.email?null:u.email); setEditPass(""); }}>
                          {editEmail===u.email?"✕ CANCEL":"🔑 PASSWORD"}
                        </button>
                        <button className="rm-btn" onClick={() => handleRemove(u.id,u.email)} disabled={removingId===u.id}>
                          {removingId===u.id?"…":"✕ REMOVE"}
                        </button>
                      </span>
                    </div>
                    {editEmail===u.email && (
                      <div className="pass-row">
                        <input type="password" className="input input-sm" placeholder="New password (min 6)" value={editPass}
                          onChange={(ev)=>setEditPass(ev.target.value)} autoComplete="new-password" />
                        <button className="save-btn" disabled={savingPass} onClick={()=>handleSavePass(u.email)}>
                          {savingPass?"SAVING…":"✓ SAVE"}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="info-box">
            <span className="info-label">HOW IT WORKS</span>
            <p>Each user needs an email and password set by admin. Passwords are bcrypt-hashed. Admin (<span className="accent">{adminEmail}</span>) cannot be removed here.</p>
          </div>
        </main>
      </div>

      <style jsx global>{`
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        :root{--bg:#0a0c0f;--surface:#111318;--surface2:#191c22;--border:#2a2d35;--text:#e2e8f0;--dim:#6b7280;--accent:#00e5a0;--accent2:#00b8d4;--danger:#ef4444;--mono:'Space Mono',monospace;--sans:'Syne',sans-serif;}
        body{background:var(--bg);color:var(--text);font-family:var(--mono);min-height:100vh;}
        @keyframes spin{to{transform:rotate(360deg);}}
      `}</style>
      <style jsx>{`
        .root{position:relative;min-height:100vh;}
        .scanlines{pointer-events:none;position:fixed;inset:0;background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.03) 2px,rgba(0,0,0,.03) 4px);z-index:100;}
        .header{display:flex;align-items:center;justify-content:space-between;padding:1rem 2rem;border-bottom:1px solid var(--border);background:var(--surface);position:sticky;top:0;z-index:50;flex-wrap:wrap;gap:.5rem;}
        .hl{display:flex;align-items:center;gap:.5rem;}
        .lb{color:var(--accent);font-size:1.3rem;font-weight:700;}
        .lt{color:var(--accent);font-size:1rem;font-weight:700;}
        .title{font-family:var(--sans);font-size:1rem;font-weight:800;letter-spacing:.05em;margin-left:.3rem;}
        .badge{font-size:.55rem;background:rgba(0,229,160,.1);border:1px solid rgba(0,229,160,.3);color:var(--accent);padding:.15rem .5rem;letter-spacing:.1em;margin-left:.3rem;}
        .hr{display:flex;align-items:center;gap:.8rem;flex-wrap:wrap;}
        .admin-email{font-size:.65rem;color:var(--dim);}
        .nav-btn,.logout-btn{background:transparent;border:1px solid var(--border);color:var(--dim);font-family:var(--mono);font-size:.65rem;padding:.35rem .8rem;cursor:pointer;letter-spacing:.08em;transition:all .2s;}
        .nav-btn:hover{border-color:var(--accent2);color:var(--accent2);}
        .logout-btn:hover{border-color:var(--danger);color:var(--danger);}
        /* Search bar */
        .search-bar-wrap{background:var(--surface);border-bottom:1px solid var(--border);padding:.75rem 2rem;}
        .search-bar{display:flex;align-items:center;gap:.6rem;background:var(--surface2);border:1px solid var(--border);padding:.5rem .9rem;max-width:500px;transition:border-color .2s;}
        .search-bar:focus-within{border-color:var(--accent);}
        .search-icon{color:var(--dim);font-size:1.1rem;line-height:1;}
        .search-input{flex:1;background:transparent;border:none;outline:none;color:var(--text);font-family:var(--mono);font-size:.82rem;}
        .search-input::placeholder{color:var(--border);}
        .search-clear{background:transparent;border:none;color:var(--dim);cursor:pointer;font-size:.8rem;padding:0 .2rem;}
        .search-clear:hover{color:var(--danger);}
        /* Main */
        .main{max-width:800px;margin:0 auto;padding:2rem 1.5rem;display:flex;flex-direction:column;gap:1.5rem;}
        .flash{padding:.7rem 1rem;font-size:.75rem;}
        .flash-err{background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.3);color:var(--danger);}
        .flash-ok{background:rgba(0,229,160,.08);border:1px solid rgba(0,229,160,.3);color:var(--accent);}
        .card{background:var(--surface);border:1px solid var(--border);overflow:hidden;}
        .card-hdr{display:flex;align-items:baseline;gap:1rem;padding:1rem 1.2rem;border-bottom:1px solid var(--border);background:var(--surface2);flex-wrap:wrap;}
        .card-title{font-size:.7rem;letter-spacing:.12em;color:var(--accent);}
        .card-sub{font-size:.6rem;color:var(--dim);}
        .card-count{font-size:.6rem;color:var(--dim);margin-left:auto;}
        .add-form{display:flex;gap:.8rem;padding:1.2rem;flex-wrap:wrap;}
        .input{flex:1;min-width:180px;background:var(--surface2);border:1px solid var(--border);color:var(--text);font-family:var(--mono);font-size:.85rem;padding:.6rem .9rem;outline:none;transition:border-color .2s;}
        .input:focus{border-color:var(--accent);}
        .input::placeholder{color:var(--border);}
        .input:disabled{opacity:.5;}
        .input-sm{min-width:220px;font-size:.8rem;padding:.5rem .8rem;}
        .add-btn{background:transparent;border:1px solid var(--accent);color:var(--accent);font-family:var(--mono);font-size:.7rem;font-weight:700;letter-spacing:.1em;padding:.6rem 1.2rem;cursor:pointer;white-space:nowrap;transition:all .2s;}
        .add-btn:hover:not(:disabled){background:var(--accent);color:var(--bg);}
        .add-btn:disabled{opacity:.5;cursor:not-allowed;border-color:var(--dim);color:var(--dim);}
        .si{display:flex;align-items:center;gap:.4rem;}
        .sp{display:inline-block;width:10px;height:10px;border:1.5px solid currentColor;border-top-color:transparent;border-radius:50%;animation:spin .7s linear infinite;}
        .list-loading{display:flex;align-items:center;gap:.6rem;padding:1.5rem 1.2rem;font-size:.75rem;color:var(--dim);}
        .spinner-sm{width:16px;height:16px;border:1.5px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite;flex-shrink:0;}
        .empty-state{padding:2.5rem 1.2rem;text-align:center;font-size:.8rem;color:var(--dim);}
        .ulist{display:flex;flex-direction:column;}
        .ulist-hdr{display:grid;grid-template-columns:2rem 1fr 7rem 14rem;gap:1rem;padding:.5rem 1.2rem;font-size:.58rem;letter-spacing:.1em;color:var(--dim);background:var(--surface2);border-bottom:1px solid var(--border);}
        .ulist-row{display:grid;grid-template-columns:2rem 1fr 7rem 14rem;gap:1rem;align-items:center;padding:.7rem 1.2rem;border-bottom:1px solid var(--border);transition:background .15s;font-size:.8rem;}
        .ulist-row:hover{background:var(--surface2);}
        .rn{color:var(--dim);font-size:.65rem;}
        .re{color:var(--text);word-break:break-all;}
        .rd{font-size:.62rem;color:var(--dim);}
        .ra{display:flex;gap:.4rem;flex-wrap:wrap;}
        .edit-btn{background:transparent;border:1px solid rgba(0,184,212,.35);color:var(--accent2);font-family:var(--mono);font-size:.58rem;padding:.28rem .5rem;cursor:pointer;transition:all .2s;white-space:nowrap;}
        .edit-btn:hover{background:rgba(0,184,212,.1);}
        .rm-btn{background:transparent;border:1px solid rgba(239,68,68,.3);color:var(--danger);font-family:var(--mono);font-size:.58rem;padding:.28rem .5rem;cursor:pointer;transition:all .2s;white-space:nowrap;}
        .rm-btn:hover:not(:disabled){background:rgba(239,68,68,.1);border-color:var(--danger);}
        .rm-btn:disabled{opacity:.4;cursor:not-allowed;}
        .pass-row{display:flex;gap:.8rem;align-items:center;padding:.6rem 1.2rem 1rem 4rem;background:rgba(0,184,212,.03);border-bottom:1px solid var(--border);flex-wrap:wrap;}
        .save-btn{background:transparent;border:1px solid var(--accent2);color:var(--accent2);font-family:var(--mono);font-size:.65rem;font-weight:700;letter-spacing:.08em;padding:.5rem 1rem;cursor:pointer;white-space:nowrap;transition:all .2s;}
        .save-btn:hover:not(:disabled){background:var(--accent2);color:var(--bg);}
        .save-btn:disabled{opacity:.5;cursor:not-allowed;}
        .info-box{border:1px solid var(--border);padding:1rem 1.2rem;background:var(--surface);font-size:.68rem;color:var(--dim);line-height:1.7;}
        .info-label{font-size:.58rem;letter-spacing:.12em;color:var(--accent2);display:block;margin-bottom:.4rem;}
        .accent{color:var(--accent);}
        @media(max-width:600px){
          .header,.search-bar-wrap{padding:.8rem 1rem;}
          .main{padding:1rem;}
          .ulist-hdr,.ulist-row{grid-template-columns:1.5rem 1fr 8rem;}
          .ulist-hdr span:nth-child(3),.rd{display:none;}
        }
      `}</style>
    </>
  );
}
