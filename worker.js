const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

function distanceMeters(a, b) {
  const rad = (n) => n * Math.PI / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const value = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

async function equalSecret(a, b) {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i++) mismatch |= left[i] ^ right[i];
  return mismatch === 0;
}

async function isAdmin(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  return Boolean(token) && equalSecret(token, env.ADMIN_PASSWORD);
}

async function readSettings(db) {
  return db.prepare("SELECT class_name, latitude, longitude, radius_meters, is_active FROM class_settings WHERE id = 1").first();
}

async function handleApi(request, env) {
  const { pathname } = new URL(request.url);
  if (!env.DB) return json({ error: "签到数据库尚未配置。" }, 503);

  if (pathname === "/api/public" && request.method === "GET") {
    const [row, countRow] = await Promise.all([
      readSettings(env.DB),
      env.DB.prepare("SELECT COUNT(*) AS count FROM attendance").first(),
    ]);
    return json({
      settings: row ? {
        configured: true,
        className: row.class_name,
        radius: row.radius_meters,
        active: Boolean(row.is_active),
        attendanceCount: countRow?.count || 0,
      } : { configured: false, className: "", radius: 200, active: false, attendanceCount: 0 },
    });
  }

  if (pathname === "/api/checkin" && request.method === "POST") {
    const body = await request.json().catch(() => null);
    if (!body || typeof body.name !== "string" || typeof body.studentId !== "string") return json({ error: "签到信息格式不正确。" }, 400);
    const name = body.name.trim();
    const studentId = body.studentId.trim();
    const lat = Number(body.lat);
    const lon = Number(body.lon);
    if (!name || name.length > 60 || !studentId || studentId.length > 60) return json({ error: "请填写有效的姓名和学号。" }, 400);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) return json({ error: "没有收到有效定位，请允许浏览器获取位置后重试。" }, 400);
    const row = await readSettings(env.DB);
    if (!row) return json({ error: "老师还没有设置课堂位置。" }, 409);
    if (!row.is_active) return json({ error: "本节课堂暂未开放签到。" }, 409);
    const meters = distanceMeters({ lat: row.latitude, lon: row.longitude }, { lat, lon });
    if (meters > row.radius_meters) return json({ error: `当前位置距课堂约 ${Math.round(meters)} 米，超出 ${row.radius_meters} 米签到范围。`, distanceMeters: meters }, 403);
    const checkedInAt = new Date().toISOString();
    try {
      await env.DB.prepare("INSERT INTO attendance (name, student_id, checked_in_at, distance_meters) VALUES (?, ?, ?, ?)")
        .bind(name, studentId, checkedInAt, Math.round(meters)).run();
    } catch (error) {
      if (String(error).includes("UNIQUE constraint failed")) return json({ error: "这个学号已经签到过了。" }, 409);
      throw error;
    }
    return json({ success: true, checkedInAt, distanceMeters: Math.round(meters) }, 201);
  }

  if (pathname.startsWith("/api/admin/")) {
    if (!await isAdmin(request, env)) return json({ error: env.ADMIN_PASSWORD ? "管理密码不正确。" : "教师管理密码尚未配置。" }, env.ADMIN_PASSWORD ? 401 : 503);

    if (pathname === "/api/admin/settings" && request.method === "GET") {
      const row = await readSettings(env.DB);
      return json({ settings: row ? {
        configured: true,
        className: row.class_name,
        point: { lat: row.latitude, lon: row.longitude },
        radius: row.radius_meters,
        active: Boolean(row.is_active),
      } : null });
    }

    if (pathname === "/api/admin/settings" && request.method === "PUT") {
      const body = await request.json().catch(() => null);
      const className = typeof body?.className === "string" ? body.className.trim() : "";
      const lat = Number(body?.point?.lat);
      const lon = Number(body?.point?.lon);
      const radius = Number(body?.radius);
      if (!className || className.length > 80) return json({ error: "课堂名称需为 1 至 80 个字符。" }, 400);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) return json({ error: "请先获取有效的课堂定位点。" }, 400);
      if (![50, 100, 200, 300, 500].includes(radius)) return json({ error: "请选择有效的签到范围。" }, 400);
      await env.DB.prepare(`INSERT INTO class_settings (id, class_name, latitude, longitude, radius_meters, is_active, updated_at)
        VALUES (1, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET class_name = excluded.class_name, latitude = excluded.latitude,
        longitude = excluded.longitude, radius_meters = excluded.radius_meters, is_active = excluded.is_active, updated_at = excluded.updated_at`)
        .bind(className, lat, lon, radius, body.active ? 1 : 0, new Date().toISOString()).run();
      return json({ settings: { configured: true, className, point: { lat, lon }, radius, active: Boolean(body.active) } });
    }

    if (pathname === "/api/admin/attendance" && request.method === "GET") {
      const { results } = await env.DB.prepare("SELECT name, student_id AS studentId, checked_in_at AS checkedInAt, distance_meters AS distanceMeters FROM attendance ORDER BY checked_in_at ASC").all();
      return json({ records: results || [] });
    }

    if (pathname === "/api/admin/attendance" && request.method === "DELETE") {
      await env.DB.prepare("DELETE FROM attendance").run();
      return json({ success: true });
    }
  }

  return json({ error: "未找到此接口。" }, 404);
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/api/")) {
      try { return await handleApi(request, env); }
      catch { return json({ error: "服务暂时不可用，请稍后重试。" }, 500); }
    }
    return env.ASSETS.fetch(request);
  },
};
