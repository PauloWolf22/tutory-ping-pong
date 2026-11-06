// Tutory Ping Pong Championship - HTTP server (C# 5, compiled by Windows PowerShell's Add-Type).
// Responsibilities: static files, admin auth (server-side only), tournament document, avatar updates and SSE push.
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

public static class TutoryServer
{
    const int MaxBody = 12 * 1024 * 1024;
    const int TokenHours = 16;
    static string appDir, dataDir, statePath, authPath;
    static readonly object stateLock = new object();
    static readonly object authLock = new object();
    static readonly object sseLock = new object();
    static long rev = 0;
    static string stateJson = "null";
    static Dictionary<string, object> auth;
    static readonly Dictionary<string, DateTime> tokens = new Dictionary<string, DateTime>();
    static readonly Dictionary<string, int[]> attempts = new Dictionary<string, int[]>();
    static readonly List<Stream> sseClients = new List<Stream>();
    static readonly UTF8Encoding Utf8 = new UTF8Encoding(false);

    static JavaScriptSerializer Json()
    {
        var j = new JavaScriptSerializer();
        j.MaxJsonLength = int.MaxValue;
        j.RecursionLimit = 200;
        return j;
    }

    public static void Run(string baseDir, int port)
    {
        appDir = Path.GetFullPath(Path.Combine(baseDir, "app"));
        dataDir = Path.Combine(baseDir, "data");
        Directory.CreateDirectory(dataDir);
        statePath = Path.Combine(dataDir, "tournament.json");
        authPath = Path.Combine(dataDir, "auth.json");
        LoadState();
        LoadAuth();

        // IPv6 + IPv4: no Windows, "localhost" tenta ::1 primeiro e so depois cai para 127.0.0.1, o que atrasa cada conexao.
        TcpListener listener;
        try
        {
            listener = new TcpListener(IPAddress.IPv6Any, port);
            listener.Server.DualMode = true;
            listener.Start(128);
        }
        catch (SocketException e)
        {
            if (e.SocketErrorCode == SocketError.AddressAlreadyInUse)
            {
                Console.WriteLine();
                Console.WriteLine("  A porta " + port + " ja esta em uso: o servidor provavelmente ja esta aberto em outra janela.");
                Console.WriteLine("  Acesse http://localhost:" + port + " ou feche a outra janela e tente de novo.");
                return;
            }
            listener = new TcpListener(IPAddress.Any, port);
            listener.Start(128);
        }
        Console.WriteLine();
        Console.WriteLine("  TUTORY PING PONG CHAMPIONSHIP");
        Console.WriteLine("  ------------------------------------------");
        Console.WriteLine("  Neste computador : http://localhost:" + port);
        foreach (var ip in LanAddresses()) Console.WriteLine("  Na rede local    : http://" + ip + ":" + port);
        Console.WriteLine("  Telao            : http://localhost:" + port + "/#/telao");
        Console.WriteLine("  Dados            : " + dataDir);
        Console.WriteLine("  Ctrl+C encerra o servidor.");
        Console.WriteLine();

        var heartbeat = new Timer(delegate { Broadcast(": ping\n\n"); }, null, 20000, 20000);
        GC.KeepAlive(heartbeat);
        while (true)
        {
            var client = listener.AcceptTcpClient();
            ThreadPool.QueueUserWorkItem(delegate { Handle(client); });
        }
    }

    static List<string> LanAddresses()
    {
        var r = new List<string>();
        try
        {
            foreach (var a in Dns.GetHostAddresses(Dns.GetHostName()))
                if (a.AddressFamily == AddressFamily.InterNetwork && !IPAddress.IsLoopback(a)) r.Add(a.ToString());
        }
        catch { }
        return r;
    }

    // ---------------------------------------------------------------- persistence
    static void LoadState()
    {
        if (!File.Exists(statePath)) return;
        var d = (Dictionary<string, object>)Json().DeserializeObject(File.ReadAllText(statePath, Utf8));
        rev = Convert.ToInt64(d["rev"]);
        stateJson = Json().Serialize(d["state"]);
    }

    static void SaveStateLocked()
    {
        var tmp = statePath + ".tmp";
        File.WriteAllText(tmp, "{\"rev\":" + rev + ",\"state\":" + stateJson + "}", Utf8);
        if (File.Exists(statePath)) File.Replace(tmp, statePath, statePath + ".bak");
        else File.Move(tmp, statePath);
    }

    static void LoadAuth()
    {
        auth = File.Exists(authPath)
            ? (Dictionary<string, object>)Json().DeserializeObject(File.ReadAllText(authPath, Utf8))
            : new Dictionary<string, object>();
        if (!auth.ContainsKey("secret"))
        {
            auth["secret"] = Convert.ToBase64String(RandomBytes(32));
            SaveAuth();
        }
    }

    static void SaveAuth() { File.WriteAllText(authPath, Json().Serialize(auth), Utf8); }

    static byte[] RandomBytes(int n)
    {
        var b = new byte[n];
        using (var r = RandomNumberGenerator.Create()) r.GetBytes(b);
        return b;
    }

    // ---------------------------------------------------------------- auth
    static byte[] Derive(string password, byte[] salt, int iter)
    {
        using (var k = new Rfc2898DeriveBytes(password, salt, iter)) return k.GetBytes(32);
    }

    static void SetPassword(string password)
    {
        var salt = RandomBytes(16);
        const int iter = 120000;
        auth["salt"] = Convert.ToBase64String(salt);
        auth["iter"] = iter;
        auth["hash"] = Convert.ToBase64String(Derive(password, salt, iter));
        SaveAuth();
    }

    static bool HasPassword() { return auth.ContainsKey("hash"); }

    static bool CheckPassword(string password)
    {
        if (!HasPassword() || password == null) return false;
        var actual = Derive(password, Convert.FromBase64String((string)auth["salt"]), Convert.ToInt32(auth["iter"]));
        return FixedEquals(actual, Convert.FromBase64String((string)auth["hash"]));
    }

    static bool FixedEquals(byte[] a, byte[] b)
    {
        if (a.Length != b.Length) return false;
        int d = 0;
        for (int i = 0; i < a.Length; i++) d |= a[i] ^ b[i];
        return d == 0;
    }

    static string NewToken()
    {
        var t = Convert.ToBase64String(RandomBytes(32));
        lock (authLock) tokens[t] = DateTime.UtcNow.AddHours(TokenHours);
        return t;
    }

    static bool IsAdmin(Request q)
    {
        string h;
        if (!q.Headers.TryGetValue("authorization", out h) || !h.StartsWith("Bearer ")) return false;
        var t = h.Substring(7).Trim();
        lock (authLock)
        {
            DateTime exp;
            if (!tokens.TryGetValue(t, out exp)) return false;
            if (exp < DateTime.UtcNow) { tokens.Remove(t); return false; }
            return true;
        }
    }

    // Blocks an address for 30s after 5 failed attempts.
    static bool LoginBlocked(string ip)
    {
        lock (authLock)
        {
            int[] a;
            if (!attempts.TryGetValue(ip, out a)) return false;
            return a[0] >= 5 && Environment.TickCount - a[1] < 30000;
        }
    }

    static void LoginResult(string ip, bool ok)
    {
        lock (authLock)
        {
            if (ok) { attempts.Remove(ip); return; }
            int[] a;
            if (!attempts.TryGetValue(ip, out a) || Environment.TickCount - a[1] >= 30000) a = new[] { 0, 0 };
            a[0]++;
            a[1] = Environment.TickCount;
            attempts[ip] = a;
        }
    }

    static string PlayerCode(string playerId)
    {
        const string alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
        using (var h = new HMACSHA256(Convert.FromBase64String((string)auth["secret"])))
        {
            var d = h.ComputeHash(Utf8.GetBytes(playerId));
            var sb = new StringBuilder();
            for (int i = 0; i < 6; i++) sb.Append(alphabet[d[i] % alphabet.Length]);
            return sb.ToString();
        }
    }

    // ---------------------------------------------------------------- http
    class Request
    {
        public string Method, Path, Query, Ip;
        public Dictionary<string, string> Headers = new Dictionary<string, string>();
        public byte[] Body = new byte[0];
        public string Text { get { return Utf8.GetString(Body); } }
        public string QueryValue(string key)
        {
            foreach (var kv in (Query ?? "").Split('&'))
            {
                var p = kv.Split(new[] { '=' }, 2);
                if (p.Length == 2 && p[0] == key) return Uri.UnescapeDataString(p[1]);
            }
            return null;
        }
    }

    static Request ReadRequest(Stream s)
    {
        var head = new MemoryStream();
        int state = 0;
        while (state < 4)
        {
            int b = s.ReadByte();
            if (b < 0) return null;
            head.WriteByte((byte)b);
            if (head.Length > 65536) return null;
            state = (b == '\r' && (state == 0 || state == 2)) ? state + 1 : (b == '\n' && (state == 1 || state == 3)) ? state + 1 : 0;
        }
        var lines = Encoding.ASCII.GetString(head.ToArray()).Split(new[] { "\r\n" }, StringSplitOptions.None);
        var first = lines[0].Split(' ');
        if (first.Length < 2) return null;
        var q = new Request { Method = first[0].ToUpperInvariant() };
        var target = first[1];
        int qm = target.IndexOf('?');
        q.Path = Uri.UnescapeDataString(qm >= 0 ? target.Substring(0, qm) : target);
        q.Query = qm >= 0 ? target.Substring(qm + 1) : "";
        for (int i = 1; i < lines.Length; i++)
        {
            int c = lines[i].IndexOf(':');
            if (c > 0) q.Headers[lines[i].Substring(0, c).Trim().ToLowerInvariant()] = lines[i].Substring(c + 1).Trim();
        }
        string cl;
        if (q.Headers.TryGetValue("content-length", out cl))
        {
            int len = int.Parse(cl);
            if (len > MaxBody) throw new InvalidDataException("too large");
            var body = new byte[len];
            int got = 0;
            while (got < len)
            {
                int n = s.Read(body, got, len - got);
                if (n <= 0) return null;
                got += n;
            }
            q.Body = body;
        }
        return q;
    }

    static void Send(Stream s, int code, string status, string type, byte[] body, string extra = "", bool headOnly = false)
    {
        var h = "HTTP/1.1 " + code + " " + status + "\r\nContent-Type: " + type +
                "\r\nContent-Length: " + body.Length +
                "\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n" + extra + "\r\n";
        var hb = Encoding.ASCII.GetBytes(h);
        s.Write(hb, 0, hb.Length);
        if (!headOnly) s.Write(body, 0, body.Length);
        s.Flush();
    }

    static void SendJson(Stream s, int code, string json)
    {
        Send(s, code, code == 200 ? "OK" : "Error", "application/json; charset=utf-8", Utf8.GetBytes(json), "Cache-Control: no-store\r\n");
    }

    static void Error(Stream s, int code, string message)
    {
        SendJson(s, code, Json().Serialize(new Dictionary<string, object> { { "error", message } }));
    }

    static void Handle(TcpClient client)
    {
        bool keepOpen = false;
        Stream s = null;
        try
        {
            client.NoDelay = true;
            client.ReceiveTimeout = 15000;
            client.SendTimeout = 30000;
            s = client.GetStream();
            var q = ReadRequest(s);
            if (q == null) return;
            q.Ip = ((IPEndPoint)client.Client.RemoteEndPoint).Address.ToString();
            if (q.Path == "/api/events" && q.Method == "GET") { keepOpen = true; OpenEvents(s); return; }
            if (q.Path.StartsWith("/api/")) Api(q, s);
            else Static(q, s);
        }
        catch (InvalidDataException)
        {
            try { Error(s, 413, "Conteudo grande demais."); } catch { }
        }
        catch (Exception e)
        {
            if (!(e is IOException) && !(e is SocketException) && !(e is ObjectDisposedException))
            {
                Console.WriteLine("Erro: " + e.Message);
                try { Error(s, 500, "Erro interno do servidor."); } catch { }
            }
        }
        finally
        {
            if (!keepOpen) { try { client.Close(); } catch { } }
        }
    }

    // ---------------------------------------------------------------- api
    static Dictionary<string, object> BodyObject(Request q)
    {
        try { return Json().DeserializeObject(q.Text) as Dictionary<string, object> ?? new Dictionary<string, object>(); }
        catch { return new Dictionary<string, object>(); }
    }

    static string Str(Dictionary<string, object> d, string key)
    {
        object v;
        return d.TryGetValue(key, out v) ? v as string : null;
    }

    static void Api(Request q, Stream s)
    {
        var route = q.Method + " " + q.Path;
        switch (route)
        {
            case "GET /api/health":
                SendJson(s, 200, Json().Serialize(new Dictionary<string, object> {
                    { "ok", true }, { "hasPassword", HasPassword() }, { "lan", LanAddresses() } }));
                return;
            case "GET /api/state":
                lock (stateLock) SendJson(s, 200, "{\"rev\":" + rev + ",\"state\":" + stateJson + "}");
                return;
            case "POST /api/setup":
                {
                    var b = BodyObject(q);
                    var p = Str(b, "password");
                    lock (authLock)
                    {
                        if (HasPassword()) { Error(s, 409, "A senha de administrador ja foi definida."); return; }
                        if (p == null || p.Length < 6) { Error(s, 400, "Use uma senha com pelo menos 6 caracteres."); return; }
                        SetPassword(p);
                    }
                    SendJson(s, 200, "{\"token\":\"" + NewToken() + "\"}");
                    return;
                }
            case "POST /api/login":
                {
                    if (LoginBlocked(q.Ip)) { Error(s, 429, "Muitas tentativas. Aguarde 30 segundos."); return; }
                    var ok = CheckPassword(Str(BodyObject(q), "password"));
                    LoginResult(q.Ip, ok);
                    if (!ok) { Error(s, 401, "Senha incorreta."); return; }
                    SendJson(s, 200, "{\"token\":\"" + NewToken() + "\"}");
                    return;
                }
            case "GET /api/session":
                SendJson(s, 200, IsAdmin(q) ? "{\"admin\":true}" : "{\"admin\":false}");
                return;
            case "POST /api/logout":
                {
                    string h;
                    if (q.Headers.TryGetValue("authorization", out h) && h.StartsWith("Bearer "))
                        lock (authLock) tokens.Remove(h.Substring(7).Trim());
                    SendJson(s, 200, "{\"ok\":true}");
                    return;
                }
            case "POST /api/password":
                {
                    if (!IsAdmin(q)) { Error(s, 401, "Entre como administrador."); return; }
                    var b = BodyObject(q);
                    var p = Str(b, "password");
                    if (!CheckPassword(Str(b, "current"))) { Error(s, 401, "A senha atual nao confere."); return; }
                    if (p == null || p.Length < 6) { Error(s, 400, "Use uma senha com pelo menos 6 caracteres."); return; }
                    lock (authLock) SetPassword(p);
                    SendJson(s, 200, "{\"ok\":true}");
                    return;
                }
            case "PUT /api/state":
                {
                    if (!IsAdmin(q)) { Error(s, 401, "Sessao de administrador expirada. Entre novamente."); return; }
                    object parsed;
                    try { parsed = Json().DeserializeObject(q.Text); }
                    catch { Error(s, 400, "Documento invalido."); return; }
                    if (!(parsed is Dictionary<string, object>)) { Error(s, 400, "Documento invalido."); return; }
                    long expected;
                    long.TryParse(q.QueryValue("rev"), out expected);
                    long newRev;
                    lock (stateLock)
                    {
                        if (expected != rev)
                        {
                            SendJson(s, 409, "{\"error\":\"conflict\",\"rev\":" + rev + ",\"state\":" + stateJson + "}");
                            return;
                        }
                        stateJson = q.Text;
                        newRev = ++rev;
                        SaveStateLocked();
                    }
                    SendJson(s, 200, "{\"rev\":" + newRev + "}");
                    Notify(newRev);
                    return;
                }
            case "GET /api/player-code":
                {
                    if (!IsAdmin(q)) { Error(s, 401, "Entre como administrador."); return; }
                    var id = q.QueryValue("id");
                    if (string.IsNullOrEmpty(id)) { Error(s, 400, "Informe o jogador."); return; }
                    SendJson(s, 200, "{\"code\":\"" + PlayerCode(id) + "\"}");
                    return;
                }
            case "POST /api/avatar":
                SaveAvatar(q, s);
                return;
        }
        Error(s, 404, "Rota nao encontrada.");
    }

    // A participant changes only the avatar of their own player, authorised by a per-player code.
    static void SaveAvatar(Request q, Stream s)
    {
        var b = BodyObject(q);
        var id = Str(b, "id");
        var code = Str(b, "code");
        object avatar;
        if (string.IsNullOrEmpty(id) || !b.TryGetValue("avatar", out avatar) || !(avatar is Dictionary<string, object>))
        { Error(s, 400, "Dados do avatar invalidos."); return; }
        if (LoginBlocked(q.Ip)) { Error(s, 429, "Muitas tentativas. Aguarde 30 segundos."); return; }
        bool allowed = IsAdmin(q) || FixedEquals(Utf8.GetBytes((code ?? "").Trim().ToUpperInvariant()), Utf8.GetBytes(PlayerCode(id)));
        LoginResult(q.Ip, allowed);
        if (!allowed) { Error(s, 403, "Codigo do jogador incorreto."); return; }
        long newRev;
        lock (stateLock)
        {
            var doc = Json().DeserializeObject(stateJson) as Dictionary<string, object>;
            object playersObj = null;
            if (doc == null || !doc.TryGetValue("players", out playersObj)) { Error(s, 404, "Campeonato nao encontrado."); return; }
            Dictionary<string, object> player = null;
            foreach (var o in (IEnumerable)playersObj)
            {
                var d = o as Dictionary<string, object>;
                if (d != null && Str(d, "id") == id) player = d;
            }
            if (player == null) { Error(s, 404, "Jogador nao encontrado."); return; }
            player["avatar"] = avatar;
            stateJson = Json().Serialize(doc);
            newRev = ++rev;
            SaveStateLocked();
        }
        SendJson(s, 200, "{\"rev\":" + newRev + "}");
        Notify(newRev);
    }

    // ---------------------------------------------------------------- sse
    static void OpenEvents(Stream s)
    {
        var h = "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-store\r\nConnection: keep-alive\r\nX-Accel-Buffering: no\r\n\r\n";
        var hb = Encoding.ASCII.GetBytes(h);
        long current;
        lock (stateLock) current = rev;
        var hello = Utf8.GetBytes("data: {\"rev\":" + current + "}\n\n");
        lock (sseLock)
        {
            s.Write(hb, 0, hb.Length);
            s.Write(hello, 0, hello.Length);
            s.Flush();
            sseClients.Add(s);
        }
    }

    static void Notify(long newRev) { Broadcast("data: {\"rev\":" + newRev + "}\n\n"); }

    static void Broadcast(string message)
    {
        var data = Utf8.GetBytes(message);
        lock (sseLock)
        {
            for (int i = sseClients.Count - 1; i >= 0; i--)
            {
                try { sseClients[i].Write(data, 0, data.Length); sseClients[i].Flush(); }
                catch
                {
                    try { sseClients[i].Close(); } catch { }
                    sseClients.RemoveAt(i);
                }
            }
        }
    }

    // ---------------------------------------------------------------- static files
    static readonly Dictionary<string, string> Mime = new Dictionary<string, string> {
        {".html","text/html; charset=utf-8"},{".js","text/javascript; charset=utf-8"},{".mjs","text/javascript; charset=utf-8"},
        {".css","text/css; charset=utf-8"},{".json","application/json; charset=utf-8"},{".glb","model/gltf-binary"},
        {".png","image/png"},{".jpg","image/jpeg"},{".jpeg","image/jpeg"},{".webp","image/webp"},{".svg","image/svg+xml"},
        {".otf","font/otf"},{".ttf","font/ttf"},{".woff2","font/woff2"},{".mp3","audio/mpeg"},{".ico","image/x-icon"},{".txt","text/plain; charset=utf-8"}
    };

    static void Static(Request q, Stream s)
    {
        if (q.Method != "GET" && q.Method != "HEAD") { Error(s, 405, "Metodo nao permitido."); return; }
        var rel = q.Path.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
        if (rel.Length == 0) rel = "index.html";
        string full;
        try { full = Path.GetFullPath(Path.Combine(appDir, rel)); }
        catch { Error(s, 400, "Caminho invalido."); return; }
        if (!full.StartsWith(appDir + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) { Error(s, 403, "Acesso negado."); return; }
        if (!File.Exists(full)) { Error(s, 404, "Arquivo nao encontrado."); return; }
        var info = new FileInfo(full);
        var etag = "\"" + info.Length.ToString("x") + "-" + info.LastWriteTimeUtc.Ticks.ToString("x") + "\"";
        string inm;
        if (q.Headers.TryGetValue("if-none-match", out inm) && inm == etag)
        {
            var nm = Encoding.ASCII.GetBytes("HTTP/1.1 304 Not Modified\r\nETag: " + etag + "\r\nConnection: close\r\n\r\n");
            s.Write(nm, 0, nm.Length);
            s.Flush();
            return;
        }
        string type;
        if (!Mime.TryGetValue(info.Extension.ToLowerInvariant(), out type)) type = "application/octet-stream";
        var extra = "ETag: " + etag + "\r\nCache-Control: no-cache\r\n";
        Send(s, 200, "OK", type, File.ReadAllBytes(full), extra, q.Method == "HEAD");
    }
}
