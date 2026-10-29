# 탐구잇다 — 대전 청소년 과학·AI 프로젝트 플랫폼

학생이 과학·AI 아이디어를 프로젝트로 만들고, 탐구계획을 정리하며, 팀원·멘토와 연결되고 지원사업 신청 초안을 준비하는 한국어 MVP입니다.

## 실행

Python 3.14 이상을 사용합니다. 별도 패키지는 필요하지 않습니다. 이 프로젝트는 `uv`로 가상환경과 Python을 관리합니다.

```powershell
uv run python main.py
```

브라우저에서 `http://localhost:8000`을 엽니다. `uv run`이 프로젝트 가상환경을 만들고 사용할 Python을 준비합니다. 시스템 PATH에 Python이 없어도 `uv`가 관리하는 Python을 사용할 수 있습니다.

VS Code에서 이 프로젝트 폴더를 열고 **터미널 → 새 터미널**을 선택한 뒤 PowerShell에서 서버를 실행합니다. 브라우저에서 `http://localhost:8000`을 열고, 데모 계정으로 로그인할 수 있습니다. 서버를 종료하려면 터미널에서 `Ctrl+C`를 누릅니다.

```powershell
$env:GEMINI_API_KEY = "발급받은_Gemini_API_키"
uv run python main.py
```

위 `$env:` 설정은 현재 PowerShell 창에서만 유효합니다. Windows 사용자 환경 변수로 저장하려면 PowerShell에서 다음을 실행한 뒤, VS Code를 완전히 종료하고 다시 열어 새 터미널을 시작하세요.

```powershell
[Environment]::SetEnvironmentVariable("GEMINI_API_KEY", "발급받은_Gemini_API_키", "User")
```

Gemini API 키는 Google AI Studio에서 발급할 수 있습니다. 서버는 키를 브라우저에 전달하지 않고, Gemini의 OpenAI 호환 API 주소(`GEMINI_BASE_URL`, 기본 `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`)로 요청합니다. 모델은 `GEMINI_MODEL`(기본 `gemini-2.5-flash`)로 바꿀 수 있습니다. API 키를 코드나 저장소에 추가하지 마세요. 키가 설정되지 않으면 안전 안내가 포함된 데모 탐구 도우미가 동작합니다.

OpenAI를 사용하고 싶다면 `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL` 환경 변수를 설정할 수 있습니다. `GEMINI_API_KEY`가 설정된 경우 Gemini 설정을 우선 사용합니다.

## 데모 계정

| 역할 | 이메일 | 비밀번호 |
| --- | --- | --- |
| 학생 | `student@daejeon.kr` | `student123` |
| 학생 팀원 | `student2@daejeon.kr` | `student123` |
| 멘토 | `mentor@daejeon.kr` | `mentor123` |
| 관리자 | `admin@daejeon.kr` | `admin123` |

처음 실행할 때 SQLite 데이터베이스에 예시 사용자, 공개 탐구 프로젝트, 멘토 피드백, 지원사업 데이터가 생성됩니다. 데이터베이스는 `data/platform.sqlite3`에 저장되어 재실행해도 유지됩니다. 시연 후 기본 데모 비밀번호는 외부에 공개하지 마세요.

## 추천 시연 흐름

1. 학생 계정으로 로그인해 프로젝트를 만들고 탐구계획을 저장합니다.
2. AI 도우미와 대화해 계획을 한 단계씩 구체화합니다. 정해지지 않은 항목은 미정으로 둘 수 있습니다.
3. 팀원 모집을 공개하고 두 번째 학생 계정으로 참여 요청을 보낸 뒤 작성자 계정에서 수락합니다.
4. 멘토에게 도움을 요청하고 멘토 계정에서 요청을 검토·수락합니다. 수락 후 대화와 피드백이 활성화됩니다.
5. 지원사업의 적합성 안내를 보고 신청서 초안을 수정·저장하거나 TXT로 내려받습니다.
6. 관리자 계정에서 사용자 상태, 멘토 승인, 사업 예시, 신고를 확인합니다.

## 권한과 데이터 범위

- 비밀번호는 PBKDF2-HMAC-SHA256으로 해시해 저장하고, HttpOnly·SameSite 쿠키 세션을 사용합니다.
- 서버가 프로젝트 구성원 또는 수락된 멘토인지 확인한 뒤 계획, 대화, 피드백을 제공합니다. 공개 프로젝트에는 모집용 요약만 노출하고 개인 연락처는 표시하지 않습니다.
- 멘토 요청을 수락하기 전에는 해당 멘토의 프로젝트 채팅을 차단합니다.
- 지원사업 화면은 프로젝트 분야, 팀원 수, 탐구계획 완료 여부와 등록된 사업 조건을 비교해 준비됨·준비 필요·확인 필요 항목을 보여줍니다. 지도교사 정보와 세부 자격은 서비스에서 확인할 수 없으므로 공식 공고를 확인해야 합니다. 지원사업은 검증되지 않은 예시 데이터이며, 신청 시스템과 연동되지 않아 초안 저장은 신청 완료를 뜻하지 않습니다.
- SQLite와 메모리 세션은 로컬 개발·시연용입니다. 서버 재시작 후에는 다시 로그인해야 합니다. 이메일 인증, 비밀번호 재설정, 영속 세션, CSRF 토큰, 파일 첨부, 실시간 푸시 등은 아직 구현하지 않았습니다.

## 테스트

```powershell
uv run python -m unittest -v
```

테스트는 임시 SQLite 데이터베이스와 로컬 HTTP 서버에서 프로젝트 저장, 팀원 참여, 공개 정보 제한, 멘토 수락 전후의 채팅 권한을 확인합니다.
