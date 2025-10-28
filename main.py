import os
from datetime import datetime, timedelta
from pathlib import Path
import secrets
import imghdr

from fastapi import FastAPI, Depends, HTTPException, status, Response, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles

from dotenv import load_dotenv
import mysql.connector
from mysql.connector import Error

from passlib.context import CryptContext
from jose import jwt, JWTError

# --------------------------------------------------------------------
# Boot
# --------------------------------------------------------------------
load_dotenv()
app = FastAPI(title="Jobboard API")

# --------------------------------------------------------------------
# Static / Uploads
# --------------------------------------------------------------------
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR), html=False), name="uploads")

ALLOWED_KINDS = {"jpeg", "png", "webp"}
MAX_BYTES = 8 * 1024 * 1024  # 8MB

def _validate_image_bytes(raw: bytes) -> str:
    kind = imghdr.what(None, h=raw)  # returns "jpeg","png","webp", etc.
    return kind or ""

def _safe_image_name(prefix="img", ext="jpg") -> str:
    return f"{prefix}_{secrets.token_hex(8)}.{ext}"

# --------------------------------------------------------------------
# DB
# --------------------------------------------------------------------
def get_db():
    """Connexion MySQL par requête (commit/rollback) + erreurs lisibles."""
    try:
        conn = mysql.connector.connect(
            host=os.getenv("DB_HOST", "127.0.0.1"),
            port=int(os.getenv("DB_PORT", "3306")),
            user=os.getenv("DB_USER"),
            password=os.getenv("DB_PASS"),
            database=os.getenv("DB_NAME", "jobboard"),
            charset="utf8mb4",
            autocommit=False,
            raise_on_warnings=True,
            connection_timeout=5,
        )
        conn.ping(reconnect=True, attempts=1, delay=0)
    except Error as e:
        print("test")
        raise HTTPException(status_code=500, detail=f"DB connection failed: {e}") from e

    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

# --------------------------------------------------------------------
# Sécurité / JWT
# --------------------------------------------------------------------
pwd_context = CryptContext(
    schemes=["pbkdf2_sha256", "bcrypt"],
    deprecated="auto",
)
JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret")
JWT_ALGO = os.getenv("JWT_ALGO", "HS256")
JWT_EXPIRES_MIN = int(os.getenv("JWT_EXPIRES_MIN", "60"))

def hash_password(plain: str) -> str:
    try:
        return pwd_context.hash(plain)
    except Exception:
        # fallback si algo indisponible
        return pwd_context.hash(plain, scheme="pbkdf2_sha256")

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return pwd_context.verify(plain, hashed)
    except Exception:
        return False

def create_access_token(data: dict, expires_minutes: int = JWT_EXPIRES_MIN) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=expires_minutes)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGO)

security = HTTPBearer(auto_error=True)

def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(security),
    db=Depends(get_db),
):
    token = creds.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        email = payload.get("sub")
        if not email:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    with db.cursor(dictionary=True) as cur:
        cur.execute("SELECT id, email, role FROM users WHERE email=%s", (email,))
        user = cur.fetchone()

    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

def require_user(user=Depends(get_current_user)):
    return user

def require_admin(user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user

def require_admin_or_recruiter(user=Depends(get_current_user)):
    if user["role"] not in ("admin", "recruiter"):
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return user

# --------------------------------------------------------------------
# Health
# --------------------------------------------------------------------
@app.get("/db/ping")
def db_ping(db=Depends(get_db)):
    try:
        with db.cursor() as cur:
            cur.execute("SELECT DATABASE(), VERSION()")
            dbname, version = cur.fetchone()
        return {"ok": True, "db": dbname, "version": version}
    except Error as e:
        raise HTTPException(status_code=500, detail=f"Ping failed: {e}")

@app.get("/health")
def health():
    return {"status": "ok"}

# --------------------------------------------------------------------
# Upload Image
# --------------------------------------------------------------------
@app.post("/upload/image", status_code=201)
def upload_image(file: UploadFile = File(...), current_user=Depends(require_user)):
    raw = file.file.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 2MB)")
    kind = _validate_image_bytes(raw)
    if kind not in ALLOWED_KINDS:
        raise HTTPException(status_code=400, detail="Unsupported image (jpg/png/webp)")

    ext = "jpg" if kind == "jpeg" else kind
    name = _safe_image_name(prefix=str(current_user["id"]), ext=ext)
    dest = UPLOAD_DIR / name
    with open(dest, "wb") as f:
        f.write(raw)

    url = f"/uploads/{name}"
    return {"url": url}

# --------------------------------------------------------------------
# Companies
# --------------------------------------------------------------------
@app.get("/api/companies")
def list_companies(db=Depends(get_db)):
    try:
        with db.cursor(dictionary=True) as cur:
            cur.execute(
                """
                SELECT id, name, hq_city, description, website, banner_url
                FROM companies
                ORDER BY id DESC
                LIMIT 50
                """
            )
            rows = cur.fetchall()
        return {"items": rows}
    except Error as e:
        raise HTTPException(status_code=500, detail=f"Query failed: {e}")

@app.post("/api/companies", status_code=201)
def create_company(
    payload: dict,
    db=Depends(get_db),
    _: dict = Depends(require_admin_or_recruiter),
):
    name = payload.get("name")
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    with db.cursor() as cur:
        cur.execute(
            "INSERT INTO companies(name, website, banner_url) VALUES (%s,%s,%s)",
            (name, payload.get("website"), payload.get("banner_url")),
        )
        new_id = cur.lastrowid
    return {"id": new_id, **payload}

@app.put("/api/companies/{company_id}", status_code=200)
def update_company(
    company_id: int,
    payload: dict,
    db=Depends(get_db),
    _: dict = Depends(require_admin_or_recruiter),
):
    if not payload:
        raise HTTPException(status_code=400, detail="empty payload")
    editable = {
        "name", "hq_city", "sector", "description",
        "website", "social_links", "headcount",
        "banner_url"
    }
    data = {k: v for k, v in payload.items() if k in editable}
    if not data:
        raise HTTPException(status_code=400, detail="no valid fields to update")
    set_clause = ", ".join(f"{k}=%s" for k in data.keys())
    values = list(data.values())
    try:
        with db.cursor() as cur:
            cur.execute(f"UPDATE companies SET {set_clause} WHERE id=%s", (*values, company_id))
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Company not found")
        with db.cursor(dictionary=True) as cur:
            cur.execute("""
                SELECT id, name, hq_city, sector, description, website,
                       social_links, headcount, banner_url, created_at
                FROM companies WHERE id=%s
            """, (company_id,))
            company = cur.fetchone()
        return company
    except Error as e:
        raise HTTPException(status_code=500, detail=f"DB error: {e}")

@app.delete("/api/companies/{company_id}", status_code=204)
def delete_company(
    company_id: int,
    db=Depends(get_db),
    _: dict = Depends(require_admin_or_recruiter),
):
    with db.cursor() as cur:
        cur.execute("DELETE FROM companies WHERE id=%s", (company_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Company not found")
    return Response(status_code=204)

# --------------------------------------------------------------------
# Jobs
# --------------------------------------------------------------------
@app.get("/api/jobs/{job_id}")
def get_job(job_id: int, db=Depends(get_db)):
    with db.cursor(dictionary=True) as cur:
        cur.execute(
            """
            SELECT j.*,
                   c.name AS company_name,
                   c.website AS company_website,
                   c.banner_url AS company_banner_url
            FROM jobs j
            JOIN companies c ON c.id = j.company_id
            WHERE j.id = %s
            """,
            (job_id,),
        )
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Job not found")
    return row

@app.get("/api/jobs")
def list_jobs(q: str | None = None, page: int = 1, page_size: int = 10, db=Depends(get_db)):
    try:
        page = max(1, int(page))
        page_size = max(1, min(100, int(page_size)))
        offset = (page - 1) * page_size

        where = []
        params = []
        if q:
            where.append("(j.title LIKE %s OR j.short_desc LIKE %s)")
            params += [f"%{q}%", f"%{q}%"]
        where_sql = "WHERE " + " AND ".join(where) if where else ""

        with db.cursor(dictionary=True) as cur:
            cur.execute(
                f"""
                SELECT COUNT(*) AS total
                FROM jobs j
                JOIN companies c ON c.id = j.company_id
                {where_sql}
                """,
                tuple(params),
            )
            total = cur.fetchone()["total"]

        with db.cursor(dictionary=True) as cur:
            cur.execute(
                f"""
                SELECT j.id, j.title, j.short_desc, j.location,
                        j.contract_type, j.work_mode,
                       c.name AS company_name,
                       c.banner_url AS company_banner_url
                FROM jobs j
                JOIN companies c ON c.id = j.company_id
                {where_sql}
                ORDER BY j.created_at DESC, j.id DESC
                LIMIT %s OFFSET %s
                """,
                tuple(params + [page_size, offset]),
            )
            items = cur.fetchall()

        return {"items": items, "page": page, "page_size": page_size, "total": total}
    except Error as e:
        raise HTTPException(status_code=500, detail=f"Query failed: {e}")

@app.post("/api/jobs", status_code=201)
def create_job(
    payload: dict,
    db=Depends(get_db),
    _: dict = Depends(require_admin_or_recruiter),
):
    company_id = payload.get("company_id")
    title = payload.get("title")
    short_desc = payload.get("short_desc")
    full_desc = payload.get("full_desc")
    location = payload.get("location")
    profile_sought = payload.get("profile_sought")
    contract_type = payload.get("contract_type")
    work_mode = payload.get("work_mode")
    salary_min = payload.get("salary_min")
    salary_max = payload.get("salary_max")
    currency = payload.get("currency")
    tags = payload.get("tags")

    if not company_id or not title or not short_desc:
        raise HTTPException(
            status_code=400,
            detail="company_id, title and short_desc are required",
        )

    # Vérifier que la company existe
    with db.cursor() as cur:
        cur.execute("SELECT 1 FROM companies WHERE id=%s", (company_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Company not found")

    try:
        with db.cursor() as cur:
            cur.execute(
                """
                INSERT INTO jobs
                    (company_id, title, short_desc, full_desc, location, profile_sought,
                     contract_type, work_mode, salary_min, salary_max, currency, tags, created_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, NOW())
                """,
                (
                    company_id,
                    title,
                    short_desc,
                    full_desc,
                    location,
                    profile_sought,
                    contract_type,
                    work_mode,
                    salary_min,
                    salary_max,
                    currency,
                    tags,
                ),
            )
            new_id = cur.lastrowid
        return {
            "id": new_id,
            "company_id": company_id,
            "title": title,
            "short_desc": short_desc,
            "full_desc": full_desc,
            "location": location,
            "profile_sought": profile_sought,
            "contract_type": contract_type,
            "work_mode": work_mode,
            "salary_min": salary_min,
            "salary_max": salary_max,
            "currency": currency,
            "tags": tags,
        }
    except Error as e:
        raise HTTPException(status_code=500, detail=f"DB error: {e}")

@app.patch("/api/jobs/{job_id}")
def patch_job(
    job_id: int,
    payload: dict,
    db=Depends(get_db),
    _: dict = Depends(require_admin_or_recruiter),
):
    if not payload:
        raise HTTPException(status_code=400, detail="empty payload")
    cols, vals = zip(*payload.items())
    set_clause = ", ".join([f"{c}=%s" for c in cols])
    with db.cursor() as cur:
        cur.execute(f"UPDATE jobs SET {set_clause} WHERE id=%s", (*vals, job_id))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Job not found")
    return {"id": job_id, **payload}

@app.delete("/api/jobs/{job_id}", status_code=204)
def delete_job(
    job_id: int,
    db=Depends(get_db),
    _: dict = Depends(require_admin_or_recruiter),
):
    with db.cursor() as cur:
        cur.execute("DELETE FROM jobs WHERE id=%s", (job_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Job not found")
    return Response(status_code=204)

# --------------------------------------------------------------------
# Profiles
# --------------------------------------------------------------------
@app.get("/api/profiles")
def list_profiles(
    q: str | None = None,
    city: str | None = None,
    skills: str | None = None,
    page: int = 1,
    page_size: int = 10,
    db=Depends(get_db),
):
    try:
        page = max(1, int(page))
        page_size = max(1, min(100, int(page_size)))
        offset = (page - 1) * page_size

        where = []
        params: list = []
        if q:
            where.append("(p.first_name LIKE %s OR p.last_name LIKE %s)")
            params += [f"%{q}%", f"%{q}%"]
        if city:
            where.append("p.city = %s")
            params.append(city)
        if skills:
            where.append("p.skills LIKE %s")
            params.append(f"%{skills}%")
        where_sql = "WHERE " + " AND ".join(where) if where else ""

        with db.cursor(dictionary=True) as cur:
            cur.execute(
                f"""
                SELECT COUNT(*) AS total
                FROM profiles p
                {where_sql}
                """,
                tuple(params),
            )
            total = cur.fetchone()["total"]

        with db.cursor(dictionary=True) as cur:
            cur.execute(
                f"""
                SELECT p.id, p.user_id, p.first_name, p.last_name, p.city, p.skills, 
                       p.job_target, p.motivation, p.avatar_url
                FROM profiles p
                {where_sql}
                ORDER BY COALESCE(p.updated_at, p.created_at) DESC, p.id DESC
                LIMIT %s OFFSET %s
                """,
                tuple(params + [page_size, offset]),
            )
            items = cur.fetchall()

        return {"items": items, "page": page, "page_size": page_size, "total": total}
    except Error as e:
        raise HTTPException(status_code=500, detail=f"Query failed: {e}")

@app.post("/api/profiles", status_code=201)
def create_profile(
    payload: dict,
    db=Depends(get_db),
    current_user=Depends(require_user),
):
    user_id = payload.get("user_id") or current_user["id"]
    first_name = payload.get("first_name")
    last_name = payload.get("last_name")
    city = payload.get("city")
    skills = payload.get("skills")
    avatar_url = payload.get("avatar_url")

    if not first_name or not last_name or not city:
        raise HTTPException(status_code=400, detail="first_name, last_name and city are required")

    try:
        with db.cursor() as cur:
            cur.execute(
                """
                INSERT INTO profiles (user_id, first_name, last_name, city, skills, avatar_url, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, NOW())
                """,
                (user_id, first_name, last_name, city, skills, avatar_url),
            )
            new_id = cur.lastrowid
        return {
            "id": new_id,
            "user_id": user_id,
            "first_name": first_name,
            "last_name": last_name,
            "city": city,
            "skills": skills,
            "avatar_url": avatar_url,
        }
    except Error as e:
        raise HTTPException(status_code=500, detail=f"DB error: {e}")

@app.put("/api/profiles/{profile_id}")
def update_profile(
    profile_id: int,
    payload: dict,
    db=Depends(get_db),
    current_user=Depends(get_current_user),
):
    if not payload:
        raise HTTPException(status_code=400, detail="empty payload")
    with db.cursor(dictionary=True) as cur:
        cur.execute("SELECT id, user_id FROM profiles WHERE id=%s", (profile_id,))
        prof = cur.fetchone()
    if not prof:
        raise HTTPException(status_code=404, detail="Profile not found")
    if current_user["role"] != "admin" and prof["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not allowed to edit this profile")

    editable = {
        "first_name", "last_name", "date_birth", "city", "phone",
        "diplomas", "experiences", "skills", "languages", "qualities",
        "interests", "job_target", "motivation", "links",
        "avatar_url"
    }
    data = {k: v for k, v in payload.items() if k in editable}
    if not data:
        raise HTTPException(status_code=400, detail="no valid fields to update")
    set_clause = ", ".join(f"{k}=%s" for k in data.keys())
    values = list(data.values())
    try:
        with db.cursor() as cur:
            cur.execute(
                f"UPDATE profiles SET {set_clause}, updated_at=NOW() WHERE id=%s",
                (*values, profile_id),
            )
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Profile not found")
        with db.cursor(dictionary=True) as cur:
            cur.execute(
                """
                SELECT id, user_id, first_name, last_name, date_birth, city, phone,
                       diplomas, experiences, skills, languages, qualities, interests,
                       job_target, motivation, links, avatar_url, created_at, updated_at
                FROM profiles WHERE id=%s
                """,
                (profile_id,),
            )
            updated = cur.fetchone()
        return updated
    except Error as e:
        raise HTTPException(status_code=500, detail=f"DB error: {e}")

@app.delete("/api/profiles/{profile_id}", status_code=204)
def delete_profile(
    profile_id: int,
    db=Depends(get_db),
    current_user=Depends(get_current_user),
):
    with db.cursor(dictionary=True) as cur:
        cur.execute("SELECT id, user_id FROM profiles WHERE id=%s", (profile_id,))
        prof = cur.fetchone()
    if not prof:
        raise HTTPException(status_code=404, detail="Profile not found")
    if current_user["role"] != "admin" and prof["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not allowed to delete this profile")
    with db.cursor() as cur:
        cur.execute("DELETE FROM profiles WHERE id=%s", (profile_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Profile not found")
    return Response(status_code=204)


# --------------------------------------------------------------------
#Filtre pour les entreprises
# --------------------------------------------------------------------
@app.get("/api/candidate_filters")
def get_candidate_filters(db=Depends(get_db)):
    try:
        with db.cursor(dictionary=True) as cur:
            cur.execute("SELECT skills FROM profiles WHERE skills IS NOT NULL")
            all_skills = [s.strip() for row in cur.fetchall() for s in row["skills"].split(",") if s.strip()]
            skills = sorted(set(all_skills))

            cur.execute("SELECT DISTINCT diplomas FROM profiles WHERE diplomas IS NOT NULL")
            degrees = [row["diplomas"] for row in cur.fetchall()]

            cur.execute("SELECT languages FROM profiles WHERE languages IS NOT NULL")
            all_langs = [l.strip() for row in cur.fetchall() for l in row["languages"].split(",") if l.strip()]
            languages = sorted(set(all_langs))

            cur.execute("SELECT DISTINCT experience_years FROM profiles WHERE experience_years IS NOT NULL ORDER BY experience_years")
            experiences = [row["experience_years"] for row in cur.fetchall()]

        return {
            "skills": skills,
            "degrees": degrees,
            "languages": languages,
            "experiences": experiences
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors du chargement des filtres : {e}")


# --------------------------------------------------------------------
# Applications
# --------------------------------------------------------------------
@app.get("/api/{job_id}/applications")
def list_applications(
    job_id: int,
    page: int = 1,
    page_size: int = 10,
    db=Depends(get_db),
    _: dict = Depends(require_admin_or_recruiter),
):
    try:
        page = max(1, int(page))
        page_size = max(1, min(100, int(page_size)))
        offset = (page - 1) * page_size

        with db.cursor(dictionary=True) as cur:
            cur.execute(
                "SELECT COUNT(*) AS total FROM applications a WHERE a.job_id = %s",
                (job_id,),
            )
            total = cur.fetchone()["total"]

        with db.cursor(dictionary=True) as cur:
            cur.execute(
                """
                SELECT a.id, a.user_id, COALESCE(u.email, a.email) AS candidate_email,
                       a.phone, a.message, a.cv_url, a.status, a.created_at
                FROM applications a
                LEFT JOIN users u ON u.id = a.user_id
                WHERE a.job_id = %s
                ORDER BY a.created_at DESC, a.id DESC
                LIMIT %s OFFSET %s
                """,
                (job_id, page_size, offset),
            )
            items = cur.fetchall()

        return {"items": items, "page": page, "page_size": page_size, "total": total}
    except Error as e:
        raise HTTPException(status_code=500, detail=f"Query failed: {e}")

@app.post("/api/applications", status_code=201)
def create_application(
    payload: dict,
    db=Depends(get_db),
    current_user=Depends(require_user),  # impose d'être connecté pour postuler
):
    job_id = payload.get("job_id")
    if not job_id:
        raise HTTPException(status_code=400, detail="job_id is required")

    with db.cursor() as cur:
        # Job existe ?
        cur.execute("SELECT 1 FROM jobs WHERE id=%s", (job_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Job not found")

        cur.execute(
            """
            INSERT INTO applications
                (job_id, user_id, name, email, phone, message, cv_url, status, created_at)
            VALUES
                (%s, %s, %s, %s, %s, %s, %s, COALESCE(%s, 'new'), NOW())
            """,
            (
                job_id,
                current_user["id"],
                payload.get("name"),
                payload.get("email"),
                payload.get("phone"),
                payload.get("message"),
                payload.get("cv_url"),
                payload.get("status"),
            ),
        )
        new_id = cur.lastrowid

    return {"id": new_id, **payload, "user_id": current_user["id"]}

# --------------------------------------------------------------------
# Auth
# --------------------------------------------------------------------
@app.post("/auth/signup", status_code=201)
def auth_signup(payload: dict, db=Depends(get_db)):
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password")
    role = payload.get("role", "user")  # ⚠ en prod, ne pas laisser libre

    if not email or not password:
        raise HTTPException(status_code=400, detail="email and password are required")

    hashed = hash_password(password)
    try:
        with db.cursor() as cur:
            cur.execute(
                "INSERT INTO users (email, password_hash, role) VALUES (%s,%s,%s)",
                (email, hashed, role),
            )
            new_id = cur.lastrowid
        return {"id": new_id, "email": email, "role": role}
    except Error as e:
        if getattr(e, "errno", None) == 1062:  # email unique
            raise HTTPException(status_code=409, detail="email already exists")
        raise HTTPException(status_code=500, detail=f"DB error: {e}")

@app.post("/auth/login")
def auth_login(payload: dict, db=Depends(get_db)):
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password")

    if not email or not password:
        raise HTTPException(status_code=400, detail="email and password are required")

    try:
        with db.cursor(dictionary=True) as cur:
            cur.execute(
                "SELECT id, email, password_hash, role FROM users WHERE email=%s",
                (email,),
            )
            user = cur.fetchone()
    except Error as e:
        raise HTTPException(status_code=500, detail=f"DB error: {e}")

    if not user or not verify_password(password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token({"sub": user["email"], "role": user["role"]})
    return {"access_token": token, "token_type": "bearer"}

@app.get("/auth/me")
def auth_me(current_user=Depends(get_current_user)):
    return current_user

# --------------------------------------------------------------------
# CORS
# --------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        "http://127.0.0.1:3000",
        "http://localhost:3000",
        "http://localhost:5173",
        "null",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

