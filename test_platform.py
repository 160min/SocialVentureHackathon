import http.cookiejar
import json
import os
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest.mock import patch

import main


class PlatformFlowTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        main.DB_PATH = Path(self.tmp.name) / "test.sqlite3"
        main.SESSIONS.clear()
        main.init_db()
        self.server = main.ThreadingHTTPServer(("127.0.0.1", 0), main.Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self):
        self.server.shutdown()
        self.thread.join()
        self.server.server_close()
        self.tmp.cleanup()
        main.SESSIONS.clear()

    def client(self, email, password):
        jar = http.cookiejar.CookieJar()
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
        req = urllib.request.Request(self.base + "/api/login", data=json.dumps({"email": email, "password": password}, ensure_ascii=False).encode(), headers={"Content-Type": "application/json"})
        opener.open(req).read()
        return opener

    def call(self, opener, method, path, data=None):
        req = urllib.request.Request(self.base + "/api" + path, data=None if data is None else json.dumps(data).encode(), method=method, headers={"Content-Type": "application/json"})
        try:
            with opener.open(req) as response:
                return response.status, json.loads(response.read() or b"{}")
        except urllib.error.HTTPError as error:
            try: return error.code, json.loads(error.read() or b"{}")
            finally: error.close()

    def test_project_and_team_member_flow(self):
        owner = self.client("student2@daejeon.kr", "student123")
        teammate = self.client("student@daejeon.kr", "student123")
        status, created = self.call(owner, "POST", "/projects", {"title": "로봇 바퀴 탐구", "field": "로봇", "question": "바퀴 크기가 속도에 영향을 줄까?"})
        self.assertEqual(status, 201)
        pid = created["id"]
        plan = {"question": "바퀴 크기가 이동 거리에 영향을 줄까?", "materials": "미정"}
        payload = {"title": "로봇 바퀴 탐구", "field": "로봇", "question": plan["question"], "plan": plan, "is_public": True, "summary": "로봇 바퀴를 살펴봐요."}
        self.assertEqual(self.call(owner, "PUT", f"/projects/{pid}", payload)[0], 200)
        self.assertEqual(self.call(teammate, "POST", f"/projects/{pid}/requests", {"kind": "team", "message": "함께 실험하고 싶어요."})[0], 201)
        request = self.call(owner, "GET", f"/projects/{pid}")[1]["requests"][0]
        self.assertEqual(self.call(owner, "PUT", f"/projects/{pid}/requests/{request['id']}", {"status": "accepted"})[0], 200)
        status, detail = self.call(teammate, "GET", f"/projects/{pid}")
        self.assertEqual(status, 200)
        self.assertEqual(len(detail["members"]), 2)
        self.assertEqual(json.loads(detail["plan"])["question"], plan["question"])

    def test_public_data_is_limited_and_mentor_chat_requires_acceptance(self):
        student = self.client("student@daejeon.kr", "student123")
        unrelated = self.client("student2@daejeon.kr", "student123")
        mentor = self.client("mentor@daejeon.kr", "mentor123")
        status, projects = self.call(unrelated, "GET", "/projects")
        self.assertEqual(status, 200)
        pid = projects[0]["id"]
        status, public = self.call(unrelated, "GET", f"/projects/{pid}")
        self.assertEqual(status, 200)
        self.assertEqual(public["plan"], "{}")
        self.assertEqual(public["members"], [])
        self.assertEqual(self.call(student, "POST", f"/projects/{pid}/requests", {"kind": "mentor", "mentor_id": 3, "message": "데이터 검증을 도와주세요."})[0], 403)
        project = self.call(student, "GET", f"/projects/{pid}")[1]
        plan = json.loads(project["plan"])
        plan.update(question="어떤 질문에서 답변이 기대와 다를까?", purpose="챗봇 답변의 개선 방법을 알아본다.", method="같은 질문의 답변을 바꾸기 전후로 비교한다.")
        status, _ = self.call(student, "PUT", f"/projects/{pid}", {"title": project["title"], "field": project["field"], "question": project["question"], "plan": plan, "plan_complete": True})
        self.assertEqual(status, 200)
        self.assertEqual(self.call(student, "POST", f"/projects/{pid}/requests", {"kind": "mentor", "mentor_id": 3, "message": "데이터 검증을 도와주세요."})[0], 201)
        self.assertEqual(self.call(mentor, "POST", f"/projects/{pid}/messages", {"body": "안녕하세요"})[0], 404)
        dashboard = self.call(mentor, "GET", "/dashboard")[1]
        request_id = dashboard["requests"][0]["id"]
        self.assertEqual(self.call(mentor, "PUT", f"/projects/{pid}/requests/{request_id}", {"status": "accepted"})[0], 200)
        self.assertEqual(self.call(mentor, "POST", f"/projects/{pid}/messages", {"body": "먼저 기준을 정해 봅시다."})[0], 201)
        self.assertEqual(self.call(unrelated, "POST", f"/projects/{pid}/messages", {"body": "접근하면 안 돼요"})[0], 404)

    def test_ai_focus_switch_keeps_plan_updates_and_conversations_separate(self):
        student = self.client("student@daejeon.kr", "student123")
        status, created = self.call(student, "POST", "/projects", {"title": "앵무새 행동 관찰", "field": "동물 행동", "question": "앵무새의 행동은 기분과 어떤 관계가 있을까?"})
        self.assertEqual(status, 201)
        pid = created["id"]
        project = self.call(student, "GET", f"/projects/{pid}")[1]
        plan = json.loads(project["plan"])
        plan.update(background="집에서 앵무새 두 마리를 관찰한다.", purpose="미정 — 이 문제를 통해 무엇을 알고 싶은지 정해봐요.", question="미정 — 핵심 탐구 질문을 정해봐요.")
        self.assertEqual(self.call(student, "PUT", f"/projects/{pid}", {"title": project["title"], "field": project["field"], "question": project["question"], "plan": plan})[0], 200)

        with patch.dict(os.environ, {"OPENAI_API_KEY": ""}):
            status, selected = self.call(student, "POST", f"/projects/{pid}/ai", {"action": "focus", "key": "purpose"})
            self.assertEqual(status, 200)
            self.assertEqual(selected["active_focus"], "purpose")

            status, purpose_reply = self.call(student, "POST", f"/projects/{pid}/ai", {"key": "purpose", "answer": "앵무새 행동에 따른 기분 분류"})
            self.assertEqual(status, 200)
            self.assertEqual(purpose_reply["plan"]["purpose"], "앵무새 행동에 따른 기분 분류")
            self.assertEqual(purpose_reply["plan"]["background"], "집에서 앵무새 두 마리를 관찰한다.")
            self.assertEqual(purpose_reply["history"][-1]["focus"], "purpose")

            status, moved = self.call(student, "POST", f"/projects/{pid}/ai", {"action": "advance", "key": "purpose", "target": "question", "answer": "네 넘어갈게용"})
            self.assertEqual(status, 200)
            self.assertEqual(moved["active_focus"], "question")
            self.assertEqual(moved["plan"]["purpose"], "앵무새 행동에 따른 기분 분류")

            status, question_reply = self.call(student, "POST", f"/projects/{pid}/ai", {"key": "question", "answer": "어떤 행동이 어떤 기분을 나타낼까?"})
            self.assertEqual(status, 200)
            self.assertEqual(question_reply["plan"]["question"], "어떤 행동이 어떤 기분을 나타낼까?")
            self.assertEqual(question_reply["history"][-1]["focus"], "question")

    def test_ai_rejects_answer_for_a_different_plan_field(self):
        student = self.client("student@daejeon.kr", "student123")
        status, created = self.call(student, "POST", "/projects", {"title": "앵무새 행동 관찰", "field": "동물 행동", "question": "앵무새의 행동은 기분과 어떤 관계가 있을까?"})
        self.assertEqual(status, 201)
        pid = created["id"]
        project = self.call(student, "GET", f"/projects/{pid}")[1]
        plan = json.loads(project["plan"])
        plan.update(background="집에서 앵무새 두 마리를 관찰한다.", purpose="미정 — 탐구 목적을 정해봐요.")
        self.assertEqual(self.call(student, "PUT", f"/projects/{pid}", {"title": project["title"], "field": project["field"], "question": project["question"], "plan": plan})[0], 200)

        model_payload = {"on_topic": False, "suggest_focus": "purpose", "reply": "이 내용은 탐구 목적 항목에서 다루는 게 더 잘 맞아요.", "plan": {"background": "이 값은 반영되면 안 돼요."}, "suggest_next": False}

        class FakeResponse:
            def __enter__(self): return self
            def __exit__(self, *_args): return None
            def read(self): return json.dumps({"choices": [{"message": {"content": json.dumps(model_payload, ensure_ascii=False)}}]}).encode()

        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key", "OPENAI_BASE_URL": "https://example.invalid/chat/completions", "OPENAI_MODEL": "gemini-3.5-flash-lite"}), patch("urllib.request.urlopen", return_value=FakeResponse()):
            status, response = self.call(student, "POST", f"/projects/{pid}/ai", {"key": "background", "answer": "앵무새 행동에 따른 기분 분류"})

        self.assertEqual(status, 200)
        self.assertFalse(response["on_topic"])
        self.assertEqual(response["suggest_focus"], "purpose")
        self.assertEqual(response["plan"]["background"], "집에서 앵무새 두 마리를 관찰한다.")
        self.assertEqual(response["plan"]["purpose"], "미정 — 탐구 목적을 정해봐요.")
        self.assertFalse(response["history"][-1]["on_topic"])

    def test_only_owner_can_delete_project_and_related_records_are_removed(self):
        owner = self.client("student@daejeon.kr", "student123")
        other_student = self.client("student2@daejeon.kr", "student123")
        status, created = self.call(owner, "POST", "/projects", {"title": "Delete me", "field": "AI", "question": "A question"})
        self.assertEqual(status, 201)
        pid = created["id"]
        self.assertEqual(self.call(other_student, "DELETE", f"/projects/{pid}")[0], 404)
        self.assertEqual(self.call(owner, "POST", f"/projects/{pid}/messages", {"body": "temporary message"})[0], 201)
        self.assertEqual(self.call(owner, "DELETE", f"/projects/{pid}")[0], 200)
        self.assertEqual(self.call(owner, "GET", f"/projects/{pid}")[0], 404)
        with main.connect() as c:
            self.assertEqual(c.execute("SELECT COUNT(*) FROM messages WHERE project_id=?", (pid,)).fetchone()[0], 0)
            self.assertEqual(c.execute("SELECT COUNT(*) FROM project_members WHERE project_id=?", (pid,)).fetchone()[0], 0)

    def test_viewing_mentor_recommendations_does_not_create_a_request_or_match(self):
        student = self.client("student@daejeon.kr", "student123")
        status, created = self.call(student, "POST", "/projects", {"title": "Mentor preview", "field": "AI", "question": "A question"})
        self.assertEqual(status, 201)
        pid = created["id"]
        project = self.call(student, "GET", f"/projects/{pid}")[1]
        plan = json.loads(project["plan"])
        plan.update(question="Which answer is clearer?", purpose="Compare two answers.", method="Ask matching questions and compare results.")
        self.assertEqual(self.call(student, "PUT", f"/projects/{pid}", {"title": project["title"], "field": project["field"], "question": project["question"], "plan": plan, "plan_complete": True})[0], 200)
        status, mentors = self.call(student, "GET", f"/projects/{pid}/mentors")
        self.assertEqual(status, 200)
        self.assertTrue(mentors)
        dashboard = self.call(student, "GET", "/dashboard")[1]
        self.assertFalse([request for request in dashboard["requests"] if request["project_id"] == pid])

    def test_program_match_shows_project_readiness_and_unknown_requirements(self):
        owner = self.client("student@daejeon.kr", "student123")
        teammate = self.client("student2@daejeon.kr", "student123")
        status, programs = self.call(owner, "GET", "/projects/1/programs")
        self.assertEqual(status, 200)
        first = programs[0]["match"]
        checks = {item["label"]: item for item in first["checks"]}
        self.assertEqual(checks["지원 분야"]["status"], "met")
        self.assertEqual(checks["팀 구성"]["status"], "missing")
        self.assertEqual(checks["지도교사"]["status"], "check")
        self.assertEqual(checks["탐구계획서"]["status"], "missing")
        self.assertEqual(first["status"], "준비할 항목 있음")

        self.assertEqual(self.call(teammate, "POST", "/projects/1/requests", {"kind": "team", "message": "함께할게요."})[0], 201)
        request = self.call(owner, "GET", "/projects/1")[1]["requests"][0]
        self.assertEqual(self.call(owner, "PUT", f"/projects/1/requests/{request['id']}", {"status": "accepted"})[0], 200)
        status, programs = self.call(owner, "GET", "/projects/1/programs")
        self.assertEqual(status, 200)
        checks = {item["label"]: item for item in programs[0]["match"]["checks"]}
        self.assertEqual(checks["팀 구성"]["status"], "check")
        self.assertIn("현재 프로젝트 인원 2명", checks["팀 구성"]["detail"])


if __name__ == "__main__":
    unittest.main()
