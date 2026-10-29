"""Dependency-free Daejeon youth science project platform MVP."""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import threading
import time
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).parent
DB_PATH = Path(os.environ.get("DATABASE_PATH", ROOT / "data" / "platform.sqlite3"))
DB_PATH.parent.mkdir(parents=True, exist_ok=True)
SESSIONS: dict[str, tuple[int, float]] = {}


@contextmanager
def connect():
    c = sqlite3.connect(DB_PATH, timeout=10)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys=ON")
    try:
        yield c
        c.commit()
    except Exception:
        c.rollback()
        raise
    finally:
        c.close()


def password_hash(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 180_000)
    return salt.hex() + ":" + digest.hex()


def password_ok(password: str, stored: str) -> bool:
    try:
        salt, expected = stored.split(":", 1)
        actual = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 180_000).hex()
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def initial_plan(question="", field="", title="", core_question=""):
    context = f"학생이 처음 적은 궁금증 또는 문제: {question}" if question.strip() else "관심 문제를 아직 적지 않았어요. 학생과 함께 탐구 배경을 정해요."
    topic = f"{title} {field} {question}".lower()
    if "챗봇" in topic or "chatbot" in topic:
        purpose = "챗봇이 기대와 다르게 답하는 상황을 살펴보고, 개선 방향을 찾아봐요. (학생 검토용 초안)"
        research_question = core_question.strip() or "어떤 질문에서 챗봇이 기대와 다르게 답하며, 개선 전후를 어떻게 비교할 수 있을까요? (학생 검토용 초안)"
        materials = "개인정보가 없는 시험 질문과 챗봇 답변 기록이 필요할 수 있어요. 사용 가능한 도구와 데이터는 확인이 필요해요."
    else:
        purpose = "미정 — 이 문제를 통해 무엇을 알고 싶은지 정해봐요."
        research_question = core_question.strip() or "미정 — 처음 적은 문제를 탐구할 수 있는 질문으로 함께 구체화해요."
        materials = "미정 — 사용할 수 있는 도구와 데이터가 있는지 확인해요."
    return {"background": context, "purpose": purpose, "question": research_question, "hypothesis": "미정 — 탐구 질문을 정한 뒤 예상해봐요.", "method": "미정 — 무엇을 관찰하거나 비교할지 함께 정해봐요.", "materials": materials, "schedule": "미정 — 팀과 함께 정해요.", "outcome": "미정 — 탐구 결과를 어디에 활용할 수 있을지 생각해봐요.", "challenges": "아직 정하지 않았어요. 계획을 세우며 확인할 수 있어요.", "mentor_questions": "미정 — 멘토에게 묻고 싶은 내용을 정해봐요.", "team_roles": "미정 — 함께하고 싶은 역할을 적어봐요."}


def init_db():
    with connect() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN('student','mentor','admin')),bio TEXT DEFAULT '',fields TEXT DEFAULT '',help TEXT DEFAULT '',approved INTEGER DEFAULT 1,active INTEGER DEFAULT 1,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS projects(id INTEGER PRIMARY KEY,owner_id INTEGER NOT NULL REFERENCES users(id),title TEXT NOT NULL,field TEXT DEFAULT '',question TEXT DEFAULT '',plan TEXT NOT NULL DEFAULT '{}',stage TEXT DEFAULT '아이디어 구상 중',is_public INTEGER DEFAULT 0,summary TEXT DEFAULT '',roles TEXT DEFAULT '',plan_complete INTEGER DEFAULT 0,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS project_members(project_id INTEGER REFERENCES projects(id),user_id INTEGER REFERENCES users(id),role TEXT DEFAULT 'member',PRIMARY KEY(project_id,user_id));
        CREATE TABLE IF NOT EXISTS requests(id INTEGER PRIMARY KEY,project_id INTEGER REFERENCES projects(id),requester_id INTEGER REFERENCES users(id),mentor_id INTEGER REFERENCES users(id),kind TEXT NOT NULL,message TEXT DEFAULT '',status TEXT DEFAULT 'pending',created_at TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(project_id,requester_id,mentor_id,kind));
        CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY,project_id INTEGER REFERENCES projects(id),sender_id INTEGER REFERENCES users(id),body TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS feedback(id INTEGER PRIMARY KEY,project_id INTEGER REFERENCES projects(id),mentor_id INTEGER REFERENCES users(id),body TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS programs(id INTEGER PRIMARY KEY,name TEXT NOT NULL,organizer TEXT DEFAULT '',description TEXT DEFAULT '',grades TEXT DEFAULT '중학생',fields TEXT DEFAULT '',team_required INTEGER DEFAULT 0,teacher_required INTEGER DEFAULT 0,status TEXT DEFAULT '예시 데이터',deadline TEXT DEFAULT '',url TEXT DEFAULT '',documents TEXT DEFAULT '탐구계획서');
        CREATE TABLE IF NOT EXISTS reports(id INTEGER PRIMARY KEY,reporter_id INTEGER REFERENCES users(id),project_id INTEGER REFERENCES projects(id),message_id INTEGER REFERENCES messages(id),reason TEXT NOT NULL,status TEXT DEFAULT '접수');
        CREATE TABLE IF NOT EXISTS applications(id INTEGER PRIMARY KEY,project_id INTEGER REFERENCES projects(id),program_id INTEGER REFERENCES programs(id),owner_id INTEGER REFERENCES users(id),draft TEXT NOT NULL,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(project_id,program_id));
        """)
        columns = {row["name"] for row in c.execute("PRAGMA table_info(users)")}
        if "active" not in columns:
            c.execute("ALTER TABLE users ADD COLUMN active INTEGER DEFAULT 1")
        project_columns = {row["name"] for row in c.execute("PRAGMA table_info(projects)")}
        if "plan_complete" not in project_columns:
            c.execute("ALTER TABLE projects ADD COLUMN plan_complete INTEGER DEFAULT 0")
        if c.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0:
            users = [("김하늘", "student@daejeon.kr", "student123", "student", "중학교 2학년 · 환경과 AI에 관심 있어요.", "AI, 환경, 데이터", "프로젝트 아이디어를 함께 구체화할 친구"), ("이도윤", "student2@daejeon.kr", "student123", "student", "중학교 1학년 · 만들기를 좋아해요.", "로봇, 메이커", "실험 설계와 제작"), ("박서연 연구원", "mentor@daejeon.kr", "mentor123", "mentor", "전 과학기술 연구원 · 데이터 분석과 환경 모니터링을 연구했습니다.", "데이터 분석, AI, 환경 센서", "데이터 수집, 분류 모델 검증, 안전한 실험 설계"), ("플랫폼 관리자", "admin@daejeon.kr", "admin123", "admin", "서비스 운영", "", "")]
            c.executemany("INSERT INTO users(name,email,password,role,bio,fields,help) VALUES(?,?,?,?,?,?,?)", [(n, e, password_hash(p), r, b, f, h) for n, e, p, r, b, f, h in users])
            c.execute("INSERT INTO projects(owner_id,title,field,question,plan,stage,is_public,summary,roles) VALUES(1,?,?,?,?,?,1,?,?)", ("AI로 학교 쓰레기 분리배출 돕기", "AI · 환경", "우리 학교 쓰레기가 잘 분리배출되지 않는 것 같아. AI로 구분할 수 있을까?", json.dumps(initial_plan(), ensure_ascii=False), "탐구계획 작성 중", "사진을 이용해 분리배출을 돕는 방법을 알아봐요. 데이터 수집과 검증 방법을 함께 탐구합니다.", "데이터 수집 · 실험 기록"))
            c.execute("INSERT INTO project_members(project_id,user_id,role) VALUES(1,1,'owner')")
            programs = [("대전 청소년 과학탐구 프로젝트 지원 (예시)", "대전 과학문화지원단", "지역 청소년의 자율 탐구 프로젝트를 지원하는 데모 사업입니다. 실제 모집 공고가 아닙니다.", "과학, AI, 환경", 1, 1, "예시 데이터 · 모집 여부 미확인", "https://example.org/science-project", "탐구계획서, 지도교사 확인"), ("청소년 AI 아이디어 챌린지 (예시)", "대전 AI교육센터", "AI를 활용한 문제 해결 아이디어를 소개하는 데모 사업입니다. 실제 모집 공고가 아닙니다.", "AI, 데이터, 로봇", 0, 0, "예시 데이터 · 모집 여부 미확인", "https://example.org/ai-challenge", "프로젝트 소개서")]
            c.executemany("INSERT INTO programs(name,organizer,description,fields,team_required,teacher_required,status,deadline,url,documents) VALUES(?,?,?,?,?,?,?,'공고 확인 필요',?,?)", programs)
            c.execute("INSERT INTO feedback(project_id,mentor_id,body) VALUES(1,3,?)", ("좋은 출발이에요. 먼저 어떤 품목을 대상으로 할지 정하고, 사진에 사람 얼굴이나 이름표가 찍히지 않도록 해요. 데이터 개수와 분류 기준은 함께 정해보면 좋겠습니다.",))
        # Replace the old one-size-fits-all sample plan on projects created by
        # earlier MVP versions, while preserving every student-entered field.
        for row in c.execute("SELECT id,title,field,question,plan FROM projects"):
            try: old_plan = json.loads(row["plan"])
            except (ValueError, TypeError): continue
            if old_plan.get("background", "").startswith("학교에서 쓰레기 분리배출") and "쓰레기 분리배출" not in row["question"]:
                c.execute("UPDATE projects SET plan=? WHERE id=?", (json.dumps(initial_plan(row["question"], row["field"], row["title"]), ensure_ascii=False), row["id"]))


def tokens(value):
    return {x.lower() for x in re.sub(r"[·,]", " ", str(value or "")).split() if len(x) > 1}


def mentor_recommendation(project, mentor):
    terms = tokens(project["field"] + " " + project["question"] + " " + project["plan"])
    skills = tokens(mentor["fields"] + " " + mentor["help"])
    score = len(terms & skills)
    reason = f"전문 분야({mentor['fields']})와 연결되고 {mentor['help']} 도움을 받을 수 있습니다." if score else "프로젝트 단계와 멘토의 경험을 함께 검토해 요청할 수 있습니다."
    return {"score": score, "reason": reason}


def program_match(project, program):
    overlap = tokens(project["field"] + " " + project["question"]) & tokens(program["fields"])
    checks = []
    if overlap:
        checks.append({"label": "지원 분야", "status": "met", "detail": f"프로젝트 분야와 연결되는 키워드: {', '.join(sorted(overlap))}"})
    else:
        checks.append({"label": "지원 분야", "status": "check", "detail": "프로젝트 분야와 지원 분야의 관련성을 공고에서 확인해 주세요."})
    if "중학생" in program["grades"]:
        checks.append({"label": "지원 대상", "status": "met", "detail": "중학생 대상 사업으로 안내되어 있습니다."})
    else:
        checks.append({"label": "지원 대상", "status": "check", "detail": f"사업 안내 대상: {program['grades'] or '미등록'} · 학생의 지원 자격을 공고에서 확인해 주세요."})
    if program["team_required"]:
        member_count = int(project.get("member_count", 1))
        checks.append({
            "label": "팀 구성",
            "status": "missing" if member_count < 2 else "check",
            "detail": f"현재 프로젝트 인원 {member_count}명 · 팀원 참여가 필요합니다." if member_count < 2 else f"현재 프로젝트 인원 {member_count}명 · 최소 인원 등 세부 팀 요건을 공고에서 확인해 주세요."
        })
    else:
        checks.append({"label": "팀 구성", "status": "met", "detail": "등록된 사업 정보상 별도 팀 구성 요건이 없습니다."})
    if program["teacher_required"]:
        checks.append({"label": "지도교사", "status": "check", "detail": "프로젝트에 지도교사 정보가 없어 별도 확인이 필요합니다."})
    else:
        checks.append({"label": "지도교사", "status": "met", "detail": "등록된 사업 정보상 지도교사 요건이 없습니다."})
    documents = [item.strip() for item in str(program["documents"] or "").split(",") if item.strip()]
    for document in documents:
        if "탐구계획" in document or "계획서" in document:
            complete = bool(project.get("plan_complete"))
            checks.append({
                "label": document,
                "status": "met" if complete else "missing",
                "detail": "탐구계획 작성 완료" if complete else "핵심 질문·목적·방법을 포함한 탐구계획을 완료해 주세요."
            })
        elif "지도교사" in document and program["teacher_required"]:
            continue
        else:
            checks.append({"label": document, "status": "check", "detail": "제출 서류의 작성 여부와 양식을 공고에서 확인해 주세요."})
    reasons = [f"{item['label']}: {item['detail']}" for item in checks if item["status"] == "met"]
    missing = [f"{item['label']}: {item['detail']}" for item in checks if item["status"] != "met"]
    notice = "예시 데이터입니다. 실제 자격과 모집 여부는 공식 공고에서 확인해 주세요." if "예시" in program["status"] else "최종 지원 자격은 주관기관 공고에서 확인해 주세요."
    overall = "준비할 항목 있음" if any(item["status"] == "missing" for item in checks) else "공고 확인 필요" if any(item["status"] == "check" for item in checks) else "등록 정보상 준비됨"
    return {"score": len(overlap) + int("중학생" in program["grades"]), "reasons": reasons, "missing": missing, "checks": checks, "status": overall, "notice": notice}


class Handler(BaseHTTPRequestHandler):
    server_version = "Tanteukitta/1.0"
    def log_message(self, *_args): pass

    def respond(self, payload, status=200, headers=None):
        data = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status); self.send_header("Content-Type", "application/json; charset=utf-8"); self.send_header("Content-Length", str(len(data))); self.send_header("Cache-Control", "no-store")
        for key, value in (headers or {}).items(): self.send_header(key, value)
        self.end_headers(); self.wfile.write(data)

    def read_body(self):
        try: return json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))) or b"{}")
        except (ValueError, json.JSONDecodeError): return {}

    def current_user(self):
        token = next((x.strip().split("=", 1)[1] for x in self.headers.get("Cookie", "").split(";") if x.strip().startswith("sid=")), "")
        session = SESSIONS.get(token)
        if not session or session[1] < time.time(): return None
        with connect() as c: return dict(c.execute("SELECT id,name,email,role,bio,fields,help,approved,active FROM users WHERE id=? AND active=1", (session[0],)).fetchone() or {}) or None

    def can_access(self, c, project_id, user):
        return user["role"] == "admin" or c.execute("SELECT 1 FROM project_members WHERE project_id=? AND user_id=?", (project_id, user["id"])).fetchone() is not None or c.execute("SELECT 1 FROM requests WHERE project_id=? AND mentor_id=? AND kind='mentor' AND status='accepted'", (project_id, user["id"])).fetchone() is not None

    def do_GET(self):
        path = urlparse(self.path).path
        if not path.startswith("/api/"):
            name = "index.html" if path == "/" else path.lstrip("/")
            file = ROOT / name
            if file.parent != ROOT or not file.is_file(): return self.send_error(404)
            kind = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8"}.get(file.suffix, "application/octet-stream")
            data = file.read_bytes(); self.send_response(200); self.send_header("Content-Type", kind); self.send_header("Content-Length", str(len(data))); self.send_header("Cache-Control", "no-cache"); self.end_headers(); return self.wfile.write(data)
        self.api_get(path)

    def api_get(self, path):
        user = self.current_user()
        if path == "/api/me": return self.respond({"user": user})
        if path == "/api/programs":
            with connect() as c: return self.respond([dict(x) for x in c.execute("SELECT * FROM programs ORDER BY id")])
        if not user: return self.respond({"error": "로그인이 필요합니다."}, 401)
        with connect() as c:
            if path == "/api/dashboard":
                if user["role"] == "admin": return self.respond({"users": c.execute("SELECT COUNT(*) FROM users").fetchone()[0], "userList": [dict(x) for x in c.execute("SELECT id,name,email,role,active,approved FROM users ORDER BY id")], "reports": [dict(x) for x in c.execute("SELECT r.*,u.name reporter FROM reports r JOIN users u ON u.id=r.reporter_id ORDER BY r.id DESC")], "mentors": [dict(x) for x in c.execute("SELECT id,name,email,fields,approved FROM users WHERE role='mentor'")], "programs": [dict(x) for x in c.execute("SELECT * FROM programs ORDER BY id")]})
                if user["role"] == "mentor":
                    reqs = [dict(x) for x in c.execute("SELECT r.*,p.title,p.field,p.question,p.plan,p.stage,u.name student FROM requests r JOIN projects p ON p.id=r.project_id JOIN users u ON u.id=r.requester_id WHERE r.mentor_id=? AND r.kind='mentor' ORDER BY r.id DESC", (user["id"],))]
                    active = [dict(x) for x in c.execute("SELECT p.*,r.requester_id student_id,s.name student FROM requests r JOIN projects p ON p.id=r.project_id JOIN users s ON s.id=r.requester_id WHERE r.mentor_id=? AND r.kind='mentor' AND r.status='accepted'", (user["id"],))]
                    return self.respond({"requests": reqs, "active": active})
                projects = [dict(x) for x in c.execute("SELECT p.*,(SELECT COUNT(*) FROM project_members m WHERE m.project_id=p.id) member_count FROM projects p JOIN project_members m ON m.project_id=p.id WHERE m.user_id=? ORDER BY p.updated_at DESC", (user["id"],))]
                requests = [dict(x) for x in c.execute("SELECT r.*,p.title,mu.name mentor FROM requests r JOIN projects p ON p.id=r.project_id LEFT JOIN users mu ON mu.id=r.mentor_id WHERE r.requester_id=? AND r.kind='mentor' ORDER BY r.id DESC", (user["id"],))]
                feedback = [dict(x) for x in c.execute("SELECT f.*,p.title,m.name mentor FROM feedback f JOIN projects p ON p.id=f.project_id JOIN users m ON m.id=f.mentor_id JOIN project_members pm ON pm.project_id=p.id WHERE pm.user_id=? ORDER BY f.id DESC", (user["id"],))]
                return self.respond({"projects": projects, "requests": requests, "feedback": feedback})
            if path == "/api/projects": return self.respond([dict(x) for x in c.execute("SELECT p.id,p.title,p.field,p.stage,p.summary,p.roles,p.updated_at,'프로젝트 작성자' owner,(SELECT COUNT(*) FROM project_members m WHERE m.project_id=p.id) member_count FROM projects p WHERE p.is_public=1 ORDER BY p.updated_at DESC")])
            if path == "/api/mentors": return self.respond([dict(x) for x in c.execute("SELECT id,name,bio,fields,help,approved FROM users WHERE role='mentor' AND approved=1")])
            match = re.fullmatch(r"/api/projects/(\d+)(?:/(.*))?", path)
            if match:
                pid, action = int(match.group(1)), match.group(2) or ""
                project = c.execute("SELECT * FROM projects WHERE id=?", (pid,)).fetchone()
                if not project: return self.respond({"error": "프로젝트를 찾을 수 없습니다."}, 404)
                private = self.can_access(c, pid, user)
                if not private and not project["is_public"]: return self.respond({"error": "프로젝트 접근 권한이 없습니다."}, 404)
                if not action:
                    out = dict(project)
                    if not private:
                        out.update(plan="{}", question="프로젝트 작성자가 공개한 요약을 확인해 보세요.", members=[], requests=[])
                    else:
                        out["members"] = [dict(x) for x in c.execute("SELECT u.id,u.name,m.role FROM project_members m JOIN users u ON u.id=m.user_id WHERE m.project_id=?", (pid,))]
                        out["requests"] = [dict(x) for x in c.execute("SELECT r.*,u.name requester FROM requests r JOIN users u ON u.id=r.requester_id WHERE r.project_id=? AND r.kind='team'", (pid,))] if project["owner_id"] == user["id"] or user["role"] == "admin" else []
                        out["feedback"] = [dict(x) for x in c.execute("SELECT f.*,u.name mentor FROM feedback f JOIN users u ON u.id=f.mentor_id WHERE f.project_id=? ORDER BY f.id DESC", (pid,))]
                        out["messages"] = [dict(x) for x in c.execute("SELECT m.*,u.name sender FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.project_id=? ORDER BY m.id", (pid,))]
                        if user["role"] == "mentor":
                            request = c.execute("SELECT r.message,u.name student FROM requests r JOIN users u ON u.id=r.requester_id WHERE r.project_id=? AND r.mentor_id=? AND r.kind='mentor' AND r.status='accepted' ORDER BY r.id DESC LIMIT 1", (pid, user["id"])).fetchone()
                            if request: out["mentor_request"] = dict(request)
                    return self.respond(out)
                if action == "mentors":
                    if not project["plan_complete"]: return self.respond({"error": "탐구계획 작성을 완료하면 멘토를 추천해 드릴게요."}, 403)
                    mentors = [dict(x) for x in c.execute("SELECT id,name,bio,fields,help FROM users WHERE role='mentor' AND approved=1")]
                    for mentor in mentors: mentor["recommendation"] = mentor_recommendation(project, mentor)
                    return self.respond(sorted(mentors, key=lambda x: x["recommendation"]["score"], reverse=True))
                if action == "programs":
                    programs = [dict(x) for x in c.execute("SELECT * FROM programs")]
                    project_data = dict(project)
                    project_data["member_count"] = c.execute("SELECT COUNT(*) FROM project_members WHERE project_id=?", (pid,)).fetchone()[0]
                    for program in programs: program["match"] = program_match(project_data, program)
                    return self.respond(programs)
        return self.respond({"error": "경로를 찾을 수 없습니다."}, 404)

    def do_POST(self): self.api_write("POST")
    def do_PUT(self): self.api_write("PUT")
    def do_DELETE(self): self.api_write("DELETE")

    def api_write(self, method):
        path, body = urlparse(self.path).path, self.read_body()
        if path == "/api/login" and method == "POST":
            with connect() as c: row = c.execute("SELECT id,password,active FROM users WHERE email=?", (str(body.get("email", "")).lower(),)).fetchone()
            if not row or not row["active"] or not password_ok(str(body.get("password", "")), row["password"]): return self.respond({"error": "이메일 또는 비밀번호를 확인해 주세요."}, 401)
            return self.create_session(row["id"])
        if path == "/api/register" and method == "POST":
            name, email, password, role = str(body.get("name", "")).strip(), str(body.get("email", "")).lower(), str(body.get("password", "")), body.get("role")
            if len(name) < 2 or "@" not in email or len(password) < 8 or role not in ("student", "mentor"): return self.respond({"error": "이름, 이메일과 8자 이상의 비밀번호를 확인해 주세요."}, 400)
            try:
                with connect() as c: c.execute("INSERT INTO users(name,email,password,role,bio,fields,help,approved) VALUES(?,?,?,?,?,?,?,?)", (name, email, password_hash(password), role, body.get("bio", ""), body.get("fields", ""), body.get("help", ""), 0 if role == "mentor" else 1)); uid = c.execute("SELECT last_insert_rowid()").fetchone()[0]
            except sqlite3.IntegrityError: return self.respond({"error": "이미 등록된 이메일입니다."}, 409)
            return self.create_session(uid, 201)
        if path == "/api/logout":
            token = next((x.strip().split("=", 1)[1] for x in self.headers.get("Cookie", "").split(";") if x.strip().startswith("sid=")), ""); SESSIONS.pop(token, None)
            return self.respond({"ok": True}, headers={"Set-Cookie": "sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"})
        user = self.current_user()
        if not user: return self.respond({"error": "로그인이 필요합니다."}, 401)
        try:
            with connect() as c:
                match = re.fullmatch(r"/api/projects/(\d+)(?:/(.*))?", path)
                if path == "/api/projects" and method == "POST" and user["role"] == "student":
                    title = str(body.get("title", "")).strip()
                    if not title: return self.respond({"error": "프로젝트 제목을 입력해 주세요."}, 400)
                    question = str(body.get("question", "")).strip()
                    core_question = str(body.get("research_question", "")).strip()
                    cur = c.execute("INSERT INTO projects(owner_id,title,field,question,plan,stage,summary,roles) VALUES(?,?,?,?,?,'아이디어 구상 중',?,?)", (user["id"], title, body.get("field", ""), question, json.dumps(initial_plan(question, body.get("field", ""), title, core_question), ensure_ascii=False), body.get("summary", ""), body.get("roles", "")))
                    c.execute("INSERT INTO project_members(project_id,user_id,role) VALUES(?,?,'owner')", (cur.lastrowid, user["id"])); return self.respond({"id": cur.lastrowid}, 201)
                if match:
                    pid, action = int(match.group(1)), match.group(2) or ""
                    project = c.execute("SELECT * FROM projects WHERE id=?", (pid,)).fetchone()
                    if not project: return self.respond({"error": "프로젝트를 찾을 수 없습니다."}, 404)
                    member = self.can_access(c, pid, user)
                    if action == "requests" and method == "POST" and user["role"] == "student" and project["is_public"]: member = True
                    if action.startswith("requests/") and method == "PUT" and c.execute("SELECT 1 FROM requests WHERE id=? AND project_id=? AND kind='mentor' AND mentor_id=?", (int(action.split("/")[1]), pid, user["id"])).fetchone(): member = True
                    if not member: return self.respond({"error": "프로젝트 접근 권한이 없습니다."}, 404)
                    if not action and method == "PUT":
                        if project["owner_id"] != user["id"] and user["role"] != "admin": return self.respond({"error": "작성자만 기본 정보를 수정할 수 있습니다."}, 403)
                        plan = body.get("plan", json.loads(project["plan"]))
                        plan_complete = bool(body.get("plan_complete", project["plan_complete"]))
                        if "plan" in body and plan != json.loads(project["plan"]) and "plan_complete" not in body: plan_complete = False
                        if plan_complete and any(not str(plan.get(k, "")).strip() or str(plan.get(k, "")).startswith("미정") for k in ("question", "purpose", "method")):
                            return self.respond({"error": "핵심 질문, 탐구 목적, 탐구 방법을 먼저 계획에 적어 주세요."}, 400)
                        c.execute("UPDATE projects SET title=?,field=?,question=?,plan=?,stage=?,is_public=?,summary=?,roles=?,plan_complete=?,updated_at=CURRENT_TIMESTAMP WHERE id=?", (body.get("title", project["title"]), body.get("field", project["field"]), body.get("question", project["question"]), json.dumps(plan, ensure_ascii=False), body.get("stage", project["stage"]), int(bool(body.get("is_public", project["is_public"]))), body.get("summary", project["summary"]), body.get("roles", project["roles"]), int(plan_complete), pid)); return self.respond({"ok": True})
                    if not action and method == "DELETE":
                        if project["owner_id"] != user["id"] and user["role"] != "admin":
                            return self.respond({"error": "프로젝트 작성자만 삭제할 수 있습니다."}, 403)
                        # These tables deliberately do not use database-level cascade rules.
                        # Remove dependent records in a known order before deleting the project.
                        c.execute("DELETE FROM reports WHERE project_id=?", (pid,))
                        c.execute("DELETE FROM applications WHERE project_id=?", (pid,))
                        c.execute("DELETE FROM messages WHERE project_id=?", (pid,))
                        c.execute("DELETE FROM feedback WHERE project_id=?", (pid,))
                        c.execute("DELETE FROM requests WHERE project_id=?", (pid,))
                        c.execute("DELETE FROM project_members WHERE project_id=?", (pid,))
                        c.execute("DELETE FROM projects WHERE id=?", (pid,))
                        return self.respond({"ok": True})
                    if action == "ai" and method == "POST": return self.ai_turn(c, project, body)
                    if action == "requests" and method == "POST": return self.create_request(c, project, user, body)
                    request_match = re.fullmatch(r"requests/(\d+)", action)
                    if request_match and method == "PUT": return self.update_request(c, project, user, int(request_match.group(1)), body)
                    if action == "messages" and method == "POST":
                        text = str(body.get("body", "")).strip()
                        if not text: return self.respond({"error": "메시지를 입력해 주세요."}, 400)
                        c.execute("INSERT INTO messages(project_id,sender_id,body) VALUES(?,?,?)", (pid, user["id"], text)); return self.respond({"ok": True}, 201)
                    if action == "feedback" and method == "POST" and user["role"] == "mentor":
                        if not c.execute("SELECT 1 FROM requests WHERE project_id=? AND mentor_id=? AND kind='mentor' AND status='accepted'", (pid, user["id"])).fetchone(): return self.respond({"error": "수락한 프로젝트에만 피드백을 남길 수 있습니다."}, 403)
                        text = str(body.get("body", "")).strip()
                        if text: c.execute("INSERT INTO feedback(project_id,mentor_id,body) VALUES(?,?,?)", (pid, user["id"], text))
                        return self.respond({"ok": True}, 201)
                if path == "/api/profile" and method == "PUT":
                    c.execute("UPDATE users SET name=?,bio=?,fields=?,help=? WHERE id=?", (body.get("name", user["name"]), body.get("bio", user["bio"]), body.get("fields", user["fields"]) if user["role"] == "mentor" else user["fields"], body.get("help", user["help"]) if user["role"] == "mentor" else user["help"], user["id"])); return self.respond({"ok": True})
                app_match = re.fullmatch(r"/api/applications/(\d+)", path)
                if app_match and method in ("POST", "PUT"):
                    pid = int(app_match.group(1))
                    if not self.can_access(c, pid, user): return self.respond({"error": "프로젝트 접근 권한이 없습니다."}, 404)
                    c.execute("INSERT INTO applications(project_id,program_id,owner_id,draft) VALUES(?,?,?,?) ON CONFLICT(project_id,program_id) DO UPDATE SET draft=excluded.draft,updated_at=CURRENT_TIMESTAMP", (pid, int(body.get("program_id", 0)), user["id"], body.get("draft", ""))); return self.respond({"ok": True})
                if path == "/api/reports" and method == "POST":
                    c.execute("INSERT INTO reports(reporter_id,project_id,message_id,reason) VALUES(?,?,?,?)", (user["id"], body.get("project_id"), body.get("message_id"), body.get("reason", "부적절한 콘텐츠"))); return self.respond({"ok": True}, 201)
                if user["role"] == "admin": return self.admin_write(c, path, method, body, user)
        except (sqlite3.Error, ValueError, TypeError, KeyError) as exc:
            return self.respond({"error": "요청을 처리하지 못했습니다.", "detail": str(exc)}, 400)
        return self.respond({"error": "경로를 찾을 수 없습니다."}, 404)

    def create_session(self, uid, status=200):
        token = secrets.token_urlsafe(32); SESSIONS[token] = (uid, time.time() + 604800)
        with connect() as c: user = dict(c.execute("SELECT id,name,email,role,bio,fields,help,approved,active FROM users WHERE id=?", (uid,)).fetchone())
        return self.respond({"user": user}, status, {"Set-Cookie": f"sid={token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800"})

    def create_request(self, c, project, user, body):
        if user["role"] != "student": return self.respond({"error": "학생 계정만 멘토 또는 팀원 요청을 보낼 수 있습니다."}, 403)
        pid, kind = project["id"], body.get("kind")
        if kind == "mentor":
            if not project["plan_complete"]: return self.respond({"error": "탐구계획 작성을 완료한 뒤 멘토에게 요청할 수 있어요."}, 403)
            mentor_id = int(body.get("mentor_id", 0)); mentor = c.execute("SELECT id FROM users WHERE id=? AND role='mentor' AND approved=1 AND active=1", (mentor_id,)).fetchone()
            if not mentor: return self.respond({"error": "승인된 멘토만 요청할 수 있습니다."}, 400)
            old = c.execute("SELECT id,status FROM requests WHERE project_id=? AND requester_id=? AND mentor_id=? AND kind='mentor'", (pid, user["id"], mentor_id)).fetchone()
            if old and old["status"] in ("pending", "accepted"): return self.respond({"error": "이미 진행 중인 요청이 있습니다."}, 409)
            if old: c.execute("UPDATE requests SET message=?,status='pending',created_at=CURRENT_TIMESTAMP WHERE id=?", (body.get("message", ""), old["id"]))
            else: c.execute("INSERT INTO requests(project_id,requester_id,mentor_id,kind,message) VALUES(?,?,?,'mentor',?)", (pid, user["id"], mentor_id, body.get("message", "")))
            return self.respond({"ok": True}, 201)
        if kind == "team":
            if project["owner_id"] == user["id"]: return self.respond({"error": "내 프로젝트에는 참여 요청을 보낼 수 없습니다."}, 400)
            if c.execute("SELECT 1 FROM requests WHERE project_id=? AND requester_id=? AND kind='team' AND status='pending'", (pid, user["id"])).fetchone(): return self.respond({"error": "이미 참여 요청을 보냈습니다."}, 409)
            c.execute("INSERT INTO requests(project_id,requester_id,kind,message) VALUES(?,?,'team',?)", (pid, user["id"], body.get("message", ""))); return self.respond({"ok": True}, 201)
        return self.respond({"error": "요청 종류를 확인해 주세요."}, 400)

    def update_request(self, c, project, user, request_id, body):
        req = c.execute("SELECT * FROM requests WHERE id=? AND project_id=?", (request_id, project["id"])).fetchone()
        if not req: return self.respond({"error": "요청을 찾을 수 없습니다."}, 404)
        action = body.get("status")
        authorized = (req["kind"] == "team" and project["owner_id"] == user["id"]) or (req["kind"] == "mentor" and req["mentor_id"] == user["id"])
        if not authorized or action not in ("accepted", "declined", "cancelled"): return self.respond({"error": "요청을 변경할 권한이 없습니다."}, 403)
        c.execute("UPDATE requests SET status=? WHERE id=?", ("rejected" if action == "declined" else action, request_id))
        if action == "accepted" and req["kind"] == "team": c.execute("INSERT OR IGNORE INTO project_members(project_id,user_id,role) VALUES(?,?,'member')", (project["id"], req["requester_id"]))
        return self.respond({"ok": True})

    def ai_turn(self, c, project, body):
        plan = json.loads(project["plan"]); answer = str(body.get("answer", "")).strip(); key = str(body.get("key", "")); reply = ""; source = "기본 탐구 도우미"; diagnostic = ""; on_topic = True; suggested_focus = None
        history = plan.get("_ai_history", [])
        fields = {
            "background": ("탐구 배경 및 문제", "어떤 상황이나 문제를 관찰했나요? 장소와 상황을 구체적으로 떠올려 봐요."),
            "purpose": ("탐구 목적", "이 탐구를 마쳤을 때 무엇을 새롭게 알고 싶나요?"),
            "question": ("핵심 탐구 질문", "무엇을 비교하거나 확인하고 싶은지 한 문장 질문으로 만들어 볼까요?"),
            "hypothesis": ("가설 또는 예상", "지금은 어떤 결과가 나올 것 같나요? 예상으로 편하게 적어도 괜찮아요."),
            "method": ("탐구 방법 및 순서", "어떤 순서로 관찰하거나 비교하면 질문에 답할 수 있을까요?"),
            "materials": ("장비·재료·데이터", "사용할 수 있는 자료나 도구가 있나요? 안전과 이용 허가도 함께 확인해요."),
            "schedule": ("예상 일정", "언제까지 어떤 순서로 해보고 싶나요?"),
            "outcome": ("예상 결과와 활용", "결과를 알게 되면 누구에게 어떤 도움이 될까요?"),
            "challenges": ("현재 어려운 부분", "지금 막히거나 더 알아보고 싶은 부분은 무엇인가요?"),
            "mentor_questions": ("멘토에게 묻고 싶은 내용", "멘토가 함께한다면 가장 먼저 어떤 도움을 받고 싶나요?"),
            "team_roles": ("필요한 팀원 역할", "함께한다면 어떤 일을 맡을 친구가 있으면 좋을까요?")
        }
        aliases = {"탐구 대상과 범위": "background", "결과 확인 방법": "method", "데이터 모으는 방법": "materials", "필요한 도구": "materials", "진행 일정": "schedule", "멘토에게 묻고 싶은 내용": "mentor_questions", "멘토에게 물어볼 질문": "mentor_questions"}
        key = aliases.get(key, key)
        if key not in fields: key = "background"
        label, focus_prompt = fields[key]
        action = body.get("action")
        if action in ("focus", "advance", "stay"):
            if action == "advance":
                target = str(body.get("target", ""))
                target = aliases.get(target, target)
                if target not in fields: return self.respond({"error": "이동할 탐구계획 항목을 확인해 주세요."}, 400)
                old_key = aliases.get(str(body.get("key", "")), str(body.get("key", "")))
                answer_text = str(body.get("answer", "다음 항목으로 이동" )).strip()
                history.append({"focus": old_key, "answer": answer_text, "reply": f"좋아요. ‘{fields[target][0]}’ 항목으로 이동했어요.", "source": "탐구 도우미"})
                plan["_ai_history"] = history[-80:]
                plan.pop("_ai_pending_focus", None)
                key = target
                label, focus_prompt = fields[key]
            elif action == "stay":
                plan.pop("_ai_pending_focus", None)
            else:
                plan.pop("_ai_pending_focus", None)
            plan["_ai_active_focus"] = key
            c.execute("UPDATE projects SET plan=?,updated_at=CURRENT_TIMESTAMP WHERE id=?", (json.dumps(plan, ensure_ascii=False), project["id"]))
            return self.respond({"plan": plan, "active_focus": key, "history": plan.get("_ai_history", history)[-80:], "source": "탐구 도우미", "reply": f"이제 ‘{label}’ 항목에 집중할게요. 다른 항목을 고르기 전까지 이 항목으로 대화를 이어갑니다."})
        plan["_ai_active_focus"] = key
        plan.pop("_ai_pending_focus", None)
        gemini_api_key = os.environ.get("GEMINI_API_KEY")
        api_key = gemini_api_key or os.environ.get("OPENAI_API_KEY")
        if api_key:
            try:
                timeout = max(10, int(os.environ.get("OPENAI_TIMEOUT_SECONDS", "60")))
                import urllib.request
                focused_history = [turn for turn in history if turn.get("on_topic", True) is not False and aliases.get(turn.get("focus", ""), turn.get("focus", "")) == key]
                prompt = {"project": {"title": project["title"], "field": project["field"], "initialConcern": project["question"]}, "plan": {k: v for k, v in plan.items() if k not in ("_ai_history", "_ai_active_focus", "_ai_pending_focus")}, "focus": {"key": key, "label": label, "guidingQuestion": focus_prompt}, "recentConversationOnThisField": focused_history[-8:], "studentAnswer": answer}
                system = "너는 대전 중학생의 과학·AI 탐구계획 코치다. 현재 항목은 focus.key와 focus.label로 전달된다. 현재 항목에 의미상 맞는 답만 다듬어 plan의 현재 키에 반영한다. 학생이 다른 계획 항목에 속하는 내용을 말하면 on_topic을 false로 하고 plan은 빈 객체로 둔다. 어떤 항목으로 가야 하는지 알 수 있으면 suggest_focus에 해당 항목 키를 지정하고, 그 항목의 채팅에서 이어가도록 안내한다. 이 경우 현재 항목의 계획을 절대 바꾸지 않는다. 관련성이 애매하면 현재 항목과 어떤 점이 다른지 한 번 묻고 임의로 반영하지 않는다. 학생의 사실이나 경험을 지어내지 않는다. 현재 항목이 충분히 구체적이고 여러 차례 대화해 정리되었을 때만 reply에서 다음 항목으로 넘어갈지 물으며 suggest_next를 true로 설정한다. 학생이 수락하기 전에는 주제를 바꾸지 않는다. 개인정보나 위험한 실험을 요구하지 말고 필요하면 성인 지도와 안전 확인을 권한다. JSON 객체로 on_topic 불리언, suggest_focus 항목 키 또는 null, reply 문자열, 현재 항목 키만 든 plan 객체, suggest_next 불리언을 반환한다."
                model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash") if gemini_api_key else os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
                request_body = {"model": model, "response_format": {"type": "json_object"}, "messages": [{"role": "system", "content": system}, {"role": "user", "content": json.dumps(prompt, ensure_ascii=False)}]}
                payload = json.dumps(request_body).encode()
                if gemini_api_key:
                    base_url = os.environ.get("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions")
                else:
                    base_url = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1/chat/completions")
                req = urllib.request.Request(base_url, data=payload, headers={"Authorization": "Bearer " + api_key, "Content-Type": "application/json"})
                with urllib.request.urlopen(req, timeout=timeout) as response: result = json.loads(json.loads(response.read())["choices"][0]["message"]["content"])
                suggestion = result.get("plan", {})
                raw_on_topic = result.get("on_topic", True)
                on_topic = raw_on_topic.strip().lower() not in ("false", "no", "아니", "아니요") if isinstance(raw_on_topic, str) else bool(raw_on_topic)
                suggested_focus = result.get("suggest_focus")
                if isinstance(suggested_focus, str):
                    suggested_focus = aliases.get(suggested_focus, suggested_focus)
                    if suggested_focus not in fields:
                        suggested_focus = next((field_key for field_key, (field_label, _) in fields.items() if field_label == suggested_focus), None)
                else:
                    suggested_focus = None
                if on_topic and key in suggestion: plan[key] = suggestion[key]
                reply = result.get("reply", f"‘{label}’ 항목을 함께 정리했어요. 더 보태거나 직접 수정해도 괜찮아요.")
                ordered_keys = list(fields)
                index = ordered_keys.index(key)
                next_key = ordered_keys[index + 1] if index < len(ordered_keys) - 1 else None
                next_aliases = {"purpose": ("탐구 목적", "목적 단계", "목적"), "question": ("핵심 탐구 질문", "탐구 질문", "질문 단계"), "hypothesis": ("가설", "예상 단계"), "method": ("탐구 방법", "방법 단계"), "materials": ("장비", "재료", "데이터 수집"), "schedule": ("예상 일정", "일정 단계"), "outcome": ("예상 결과", "활용 방안"), "challenges": ("어려운 부분", "현재 어려움"), "mentor_questions": ("멘토 질문", "멘토에게 물어볼"), "team_roles": ("팀원 역할", "팀원 모집")}
                mentioned_next = next_key and any(phrase in reply for phrase in (fields[next_key][0],) + next_aliases.get(next_key, ()))
                explicit_offer = bool(mentioned_next and re.search(r"다음|넘어가|이동|정리해 볼까요|정리할까요", reply))
                suggest_next = result.get("suggest_next") is True or str(result.get("suggest_next", "")).lower() in ("true", "yes", "예", "네")
                if on_topic and next_key and (suggest_next or explicit_offer):
                    plan["_ai_pending_focus"] = next_key
                if not on_topic:
                    plan.pop("_ai_pending_focus", None)
                    if suggested_focus == key: suggested_focus = None
                    if suggested_focus:
                        target_label = fields[suggested_focus][0]
                        model_reply = result.get("reply", "")
                        route_note = f"이 내용은 ‘{target_label}’ 항목에서 다루는 게 더 잘 맞아요."
                        reply = model_reply if target_label in model_reply else f"{route_note} {model_reply}".strip()
                    else:
                        model_reply = result.get("reply", "")
                        reply = f"현재 ‘{label}’ 항목과 직접 관련이 없어 계획에는 반영하지 않았어요. {model_reply or '이 항목에 맞는 이야기를 해주거나 위 메뉴에서 알맞은 항목을 선택해 주세요.'}"
                source = "AI 도우미"
            except Exception as exc:
                # Never print the request headers or response body: they may contain secrets.
                status = getattr(exc, "code", None)
                detail = f"HTTP {status}" if status is not None else (f"{type(exc).__name__} after {timeout}s" if isinstance(exc, TimeoutError) else type(exc).__name__)
                print(f"AI API request failed ({detail}); using the demo helper.", flush=True)
                diagnostic = detail
        else:
            print("AI API key is not available to this server process; using the demo helper.", flush=True)
            diagnostic = "GEMINI_API_KEY 또는 OPENAI_API_KEY가 서버에 전달되지 않았습니다"
        if not reply:
            if answer:
                existing = str(plan.get(key, ""))
                if not existing or existing.startswith("미정"):
                    plan[key] = answer
                elif answer not in existing:
                    plan[key] = existing.rstrip() + "\n추가 생각: " + answer
                reply = f"네 생각을 ‘{label}’ 항목에 반영했어요. 이 항목에 더 덧붙이거나 다른 항목을 선택할 수 있어요."
            else:
                reply = f"괜찮아요. 모르면 비워둬도 돼요. {focus_prompt}"
        if not reply:
            if answer:
                if "대상" in key or "범위" in key:
                    plan["background"] = (plan.get("background", "") + "\n학생이 덧붙인 탐구 상황: " + answer).strip()
                    if str(plan.get("question", "")).startswith("미정"):
                        plan["question"] = f"어떤 경우에 {answer} 문제가 나타날까요? (질문 초안 — 직접 검토해요)"
                    reply = "탐구할 상황을 계획 배경에 적었어요. 아래 초안 질문이 네 생각과 맞는지 확인해 주세요."
                elif "결과" in key or "확인" in key:
                    plan["method"] = (plan.get("method", "") + "\n결과 확인 기준: " + answer).strip()
                    reply = "말해 준 기준을 결과 확인 방법에 반영했어요. 이 기준으로 비교할 수 있을지 계획을 살펴봐요."
                elif "데이터" in key or "수집" in key:
                    plan["materials"] = answer
                    plan["method"] = (plan.get("method", "") + "\n데이터 수집 방법: " + answer).strip()
                    reply = "데이터를 모으는 방법과 필요한 자료에 적었어요. 개인정보가 섞이지 않는지 확인해 주세요."
                elif "도구" in key or "재료" in key:
                    plan["materials"] = answer
                    reply = "사용할 수 있는 도구와 재료에 적었어요. 실제 사용 전에 안전과 이용 가능 여부를 확인해 주세요."
                elif "일정" in key or "기간" in key:
                    plan["schedule"] = answer
                    reply = "생각한 일정을 계획에 반영했어요."
                elif "멘토" in key or "질문" in key:
                    plan["mentor_questions"] = answer
                    reply = "멘토에게 묻고 싶은 내용으로 저장했어요."
                else:
                    plan["challenges"] = answer
                    reply = "지금 어려운 점을 계획에 적었어요."
            else: reply = "괜찮아요. 아직 모르는 부분은 미정으로 둘 수 있어요. 다음 질문으로 넘어갈게요."
        history.append({"focus": key, "answer": answer, "reply": reply, "source": source, "on_topic": on_topic, "suggest_focus": suggested_focus})
        plan["_ai_history"] = history[-80:]
        next_question = focus_prompt
        c.execute("UPDATE projects SET plan=?,plan_complete=0,updated_at=CURRENT_TIMESTAMP WHERE id=?", (json.dumps(plan, ensure_ascii=False), project["id"]))
        return self.respond({"plan": plan, "active_focus": key, "history": history[-80:], "source": source, "reply": reply, "next_question": next_question, "diagnostic": diagnostic, "on_topic": on_topic, "suggest_focus": suggested_focus})

    def admin_write(self, c, path, method, body, user):
        match = re.fullmatch(r"/api/admin/users/(\d+)", path)
        if match and method == "PUT":
            uid = int(match.group(1))
            if uid == user["id"]: return self.respond({"error": "현재 관리자 계정은 비활성화할 수 없습니다."}, 400)
            c.execute("UPDATE users SET active=? WHERE id=?", (int(bool(body.get("active"))), uid)); return self.respond({"ok": True})
        match = re.fullmatch(r"/api/admin/mentors/(\d+)", path)
        if match and method == "PUT": c.execute("UPDATE users SET approved=? WHERE id=? AND role='mentor'", (int(bool(body.get("approved"))), int(match.group(1)))); return self.respond({"ok": True})
        if path == "/api/admin/programs" and method == "POST":
            c.execute("INSERT INTO programs(name,organizer,description,grades,fields,team_required,teacher_required,status,deadline,url,documents) VALUES(?,?,?,?,?,?,?,?,?,?,?)", (body.get("name", "새 사업"), body.get("organizer", ""), body.get("description", ""), body.get("grades", "중학생"), body.get("fields", ""), int(bool(body.get("team_required"))), int(bool(body.get("teacher_required"))), body.get("status", "예시 데이터"), body.get("deadline", ""), body.get("url", ""), body.get("documents", ""))); return self.respond({"ok": True}, 201)
        match = re.fullmatch(r"/api/admin/programs/(\d+)", path)
        if match and method == "DELETE": c.execute("DELETE FROM programs WHERE id=?", (int(match.group(1)),)); return self.respond({"ok": True})
        match = re.fullmatch(r"/api/admin/reports/(\d+)", path)
        if match and method == "PUT": c.execute("UPDATE reports SET status='검토 완료' WHERE id=?", (int(match.group(1)),)); return self.respond({"ok": True})
        return self.respond({"error": "경로를 찾을 수 없습니다."}, 404)


if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", "8000"))
    print(f"탐구잇다 실행 중: http://localhost:{port}", flush=True)
    ThreadingHTTPServer((os.environ.get("HOST", "127.0.0.1"), port), Handler).serve_forever()
