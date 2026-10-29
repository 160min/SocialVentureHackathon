const $ = s => document.querySelector(s), esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const state = { user: null, page: 'home', project: null, tab: 'overview', modal: null, cache: {} };
async function api(path, opts = {}) { const res = await fetch('/api' + path, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }, ...opts }); let data = {}; try { data = await res.json() } catch { } if (!res.ok) throw Error(data.error || '요청을 처리하지 못했습니다.'); return data }
function toast(msg) { const old = $('.toast'); if (old) old.remove(); const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg; document.body.append(el); setTimeout(() => el.remove(), 2600) }
function roleName(r) { return { student: '학생', mentor: '멘토', admin: '관리자' }[r] || r }
function shell(content) { const u = state.user; $('#app').innerHTML = `<div class="app-shell"><header class="topbar"><div class="brand"><span class="brand-mark">✳</span><span>탐구잇다<small>DAEJEON SCIENCE PROJECTS</small></span></div><nav class="nav">${(u.role === 'student' ? [['home', '내 프로젝트'], ['explore', '팀원 찾기'], ['mentors', '멘토 둘러보기'], ['programs', '지원사업'], ['profile', '내 프로필']] : u.role === 'mentor' ? [['home', '요청 관리'], ['profile', '프로필 설정']] : [['home', '운영 대시보드']]).map(([p, t]) => `<button class="${state.page === p ? 'active' : ''}" data-page="${p}">${t}</button>`).join('')}</nav><div class="user-chip"><span class="avatar">${esc(u.name.slice(0, 1))}</span><span class="name">${esc(u.name)}<small class="role-tag">${roleName(u.role)}</small></span><button class="btn-ghost" data-action="logout">나가기</button></div></header><main class="layout">${content}</main></div>${state.modal ? `<div class="modal-backdrop" data-action="backdrop"><section class="modal" onclick="event.stopPropagation()">${state.modal}</section></div>` : ''}`; bind() }
function pageHead(eyebrow, title, sub, action = '') { return `<div class="page-head"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p class="sub">${sub}</p></div>${action}</div>` }
function projectCard(p) { return `<article class="project-card" data-open-project="${p.id}"><div class="row"><span class="pill">${esc(p.field || '새 탐구')}</span><span class="pill gray">${esc(p.stage)}</span></div><h3>${esc(p.title)}</h3><p>${esc(p.summary || p.question || '질문에서 시작하는 탐구 프로젝트')}</p><div class="project-footer"><span>👥 ${p.member_count || 1}명 참여</span><span>프로젝트 열기 →</span></div></article>` }
async function render() { if (!state.user) { renderAuth(); return } try { if (state.project) { await renderProject(); return } if (state.user.role === 'student') await renderStudent(); else if (state.user.role === 'mentor') await renderMentor(); else await renderAdmin() } catch (e) { shell(`${pageHead('안내', '화면을 불러오지 못했어요', '잠시 후 다시 시도해 주세요.')}<div class="error">${esc(e.message)}</div>`); } }
function renderAuth() { $('#app').innerHTML = `<div class="auth"><section class="auth-story"><div class="brand"><span class="brand-mark">✳</span><span>탐구잇다<small>DAEJEON SCIENCE PROJECTS</small></span></div><h1>궁금한 마음이<br><span style="color:#1d6d55">진짜 탐구</span>가 되는 곳.</h1><p>대전 청소년이 AI와 함께 아이디어를 키우고, 팀원과 멘토를 만나며, 지원사업을 준비하는 과정을 한곳에 모았어요.</p><div class="feature-line"><span>🧭</span><div><b>막연한 질문에서 출발</b><br><small>모르는 건 미정으로 두고 한 단계씩 정리해요.</small></div></div><div class="feature-line"><span>🌱</span><div><b>계획이 완성되기 전에도 시작</b><br><small>팀원 모집과 멘토 요청을 먼저 시작할 수 있어요.</small></div></div><div class="footer-note">청소년 보호를 위해 공개 정보에는 연락처를 표시하지 않아요.</div></section><section class="auth-form"><div class="auth-box"><h2>${authMode === 'register' ? '함께 시작해요' : '다시 만나 반가워요'}</h2><p class="sub">${authMode === 'register' ? '간단히 가입하고 첫 질문을 시작해 보세요.' : '계정으로 로그인해 탐구를 이어가세요.'}</p><div class="tabs"><button class="${authMode === 'login' ? 'active' : ''}" data-authmode="login">로그인</button><button class="${authMode === 'register' ? 'active' : ''}" data-authmode="register">회원가입</button></div><form id="auth-form">${authMode === 'register' ? `<div class="field"><label>이름</label><input name="name" required minlength="2" placeholder="이름 또는 활동명"></div><div class="field"><label>참여 유형</label><select name="role"><option value="student">학생</option><option value="mentor">멘토</option></select></div>` : ''}<div class="field"><label>이메일</label><input name="email" type="email" required placeholder="name@example.com"></div><div class="field"><label>비밀번호</label><input name="password" type="password" required minlength="8" placeholder="8자 이상"></div><div id="auth-error"></div><button class="btn" style="width:100%;margin-top:8px">${authMode === 'register' ? '가입하고 시작하기' : '로그인'}</button></form><div class="demo-box"><b>바로 둘러보기 데모 계정</b><br>학생 student@daejeon.kr · student123<br>멘토 mentor@daejeon.kr · mentor123<br>관리자 admin@daejeon.kr · admin123</div><div class="footer-note">데모 데이터의 지원사업은 실제 모집 공고가 아닙니다.</div></div></section></div>`; $('#auth-form').onsubmit = async e => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.currentTarget)); try { const r = await api(authMode === 'login' ? '/login' : '/register', { method: 'POST', body: JSON.stringify(d) }); state.user = r.user; state.page = 'home'; render() } catch (err) { $('#auth-error').innerHTML = `<div class="error">${esc(err.message)}</div>` } }; document.querySelectorAll('[data-authmode]').forEach(b => b.onclick = () => { authMode = b.dataset.authmode; renderAuth() }) }
let authMode = 'login';
async function renderStudent() { const d = await api('/dashboard'); if (state.page === 'home') { shell(`<section class="welcome"><div><div class="eyebrow">오늘의 탐구</div><h1>${esc(state.user.name)}님, 어떤 질문이 떠오르나요?</h1><p>작은 호기심도 괜찮아요. AI와 계획을 정리하고, 팀원과 멘토를 만나 탐구를 시작해 봐요.</p></div><button class="btn" data-action="new-project">＋ 프로젝트 시작</button></section><div class="grid three"><div class="card stat-card"><div><div class="metric">${d.projects.length}</div><div class="metric-label">내 프로젝트</div></div><span class="stat-icon">🧪</span></div><div class="card stat-card"><div><div class="metric">${d.requests.filter(x => x.status === 'pending').length}</div><div class="metric-label">답변 기다리는 요청</div></div><span class="stat-icon">💬</span></div><div class="card stat-card"><div><div class="metric">${d.feedback.length}</div><div class="metric-label">새 피드백</div></div><span class="stat-icon">🌿</span></div></div><div class="section-title"><h2>내 탐구 프로젝트</h2><button class="btn secondary small" data-action="new-project">프로젝트 만들기</button></div><div class="grid two">${d.projects.length ? d.projects.map(projectCard).join('') : `<div class="empty"><strong>첫 프로젝트를 시작해 볼까요?</strong>관심 있는 분야와 궁금한 점만 있어도 충분해요.<br><button class="btn small" style="margin-top:12px" data-action="new-project">새 프로젝트 만들기</button></div>`}<div class="card"><div class="row"><h2>멘토의 한마디</h2><span class="pill blue">최근 피드백</span></div>${d.feedback.length ? d.feedback.slice(0, 2).map(f => `<div class="list-item"><b>${esc(f.title)}</b><p class="muted">${esc(f.body)}</p><small>${esc(f.mentor)} 멘토 · ${esc(f.created_at)}</small></div>`).join('') : `<div class="empty"><strong>아직 받은 피드백이 없어요</strong>멘토에게 도움을 요청하면 여기에 조언이 모여요.</div>`}</div></div>`); return } if (state.page === 'explore') { const ps = await api('/projects'); shell(`${pageHead('함께 탐구해요', '팀원을 찾는 프로젝트', '관심 있는 프로젝트에 참여를 요청해 보세요. 개인 연락처는 공개되지 않아요.')}<div class="grid two">${ps.length ? ps.map(p => `<article class="project-card"><div class="row"><span class="pill">${esc(p.field)}</span><span class="pill gray">${esc(p.stage)}</span></div><h3>${esc(p.title)}</h3><p>${esc(p.summary)}</p><div class="project-footer"><span>${esc(p.owner)} · ${p.member_count}명</span><button class="btn small" data-request-team="${p.id}">함께하기 요청</button></div></article>`).join('') : `<div class="empty"><strong>아직 공개된 프로젝트가 없어요</strong>조금 뒤 다시 확인해 주세요.</div>`}</div>`); return } if (state.page === 'mentors') { const ps = d.projects; shell(`${pageHead('프로젝트에 맞는 도움', '멘토 둘러보기', '전문 분야와 프로젝트의 질문을 바탕으로 추천했어요. 멘토가 내용을 확인하고 참여를 결정합니다.')}<div class="section-title"><h2>요청할 프로젝트</h2><select id="mentor-project" class="field" style="margin:0;width:auto">${ps.map(p => `<option value="${p.id}">${esc(p.title)}</option>`).join('')}</select></div><div id="mentor-list" class="grid two"><div class="empty">프로젝트를 선택하면 추천 멘토를 불러옵니다.</div></div>`); $('#mentor-project').onchange = loadMentors; loadMentors(); return } if (state.page === 'programs') { const ps = d.projects; shell(`${pageHead('탐구를 다음 단계로', '지원사업 탐색', '데모 사업은 예시 데이터입니다. 자격과 모집 여부는 반드시 공식 공고에서 확인해 주세요.')}<div class="section-title"><h2>프로젝트 선택</h2><select id="program-project" class="field" style="margin:0;width:auto">${ps.map(p => `<option value="${p.id}">${esc(p.title)}</option>`).join('')}</select></div><div id="program-list" class="grid two"></div>`); $('#program-project').onchange = loadPrograms; loadPrograms(); return } if (state.page === 'profile') { profilePage(); return } }
async function loadMentors() { const pid = $('#mentor-project')?.value; if (!pid) return; try { const ms = await api(`/projects/${pid}/mentors`); $('#mentor-list').innerHTML = ms.map(m => `<div class="card"><div class="row"><div class="inline"><span class="avatar">${esc(m.name.slice(0, 1))}</span><div><b>${esc(m.name)}</b><div class="muted" style="font-size:12px">${esc(m.fields)}</div></div></div><span class="pill">추천 ${m.recommendation.score}점</span></div><p>${esc(m.bio)}</p><div class="summary-box"><b>도움을 줄 수 있는 내용</b><p class="muted">${esc(m.help)}</p><small>${esc(m.recommendation.reason)}</small></div><div class="inline" style="margin-top:14px"><input id="ask-${m.id}" placeholder="멘토에게 묻고 싶은 내용" style="flex:1;min-width:140px;border:1px solid var(--line);border-radius:10px;padding:9px"><button class="btn small" data-ask-mentor="${pid}:${m.id}">도움 요청</button></div></div>`).join('') || '<div class="empty">지금 추천할 수 있는 멘토가 없어요.</div>'; bind() } catch (e) { toast(e.message) } }
async function loadProjectMentors() { const box = $('#project-mentor-list'), reqbox = $('#project-mentor-requests'); if (!box) return; try { const [ms, d] = await Promise.all([api(`/projects/${state.project}/mentors`), api('/dashboard')]); const requests = d.requests.filter(r => r.project_id === state.project); reqbox.innerHTML = requests.map(r => `<div class="list-item row"><div><b>${esc(r.mentor || '멘토')}</b><p class="muted">${esc(r.message || '도움 요청')}</p></div><span class="pill ${r.status === 'accepted' ? '' : 'amber'}">${({ pending: '답변 대기', accepted: '수락됨', rejected: '거절됨', cancelled: '취소됨' })[r.status] || r.status}</span></div>`).join('') || '<div class="empty">아직 멘토 요청이 없어요.</div>'; box.innerHTML = ms.map(m => { const sent = requests.some(r => r.mentor_id === m.id && ['pending', 'accepted'].includes(r.status)); return `<div class="card"><div class="row"><div class="inline"><span class="avatar">${esc(m.name.slice(0, 1))}</span><b>${esc(m.name)}</b></div><span class="pill">추천 ${m.recommendation.score}</span></div><p class="muted">${esc(m.fields)}</p><p>${esc(m.recommendation.reason)}</p><div class="summary-box">${esc(m.help)}</div><div class="inline" style="margin-top:12px"><input id="ask-project-${m.id}" placeholder="구체적으로 어떤 도움이 필요하나요?" style="flex:1;min-width:140px;border:1px solid var(--line);border-radius:10px;padding:9px"><button class="btn small" data-ask-project-mentor="${state.project}:${m.id}" ${sent ? 'disabled' : ''}>${sent ? '요청 보냄' : '멘토에게 요청'}</button></div></div>` }).join('') || '<div class="empty">현재 추천 가능한 멘토가 없어요.</div>'; document.querySelectorAll('[data-ask-project-mentor]').forEach(b => b.onclick = async () => { const [pid, mid] = b.dataset.askProjectMentor.split(':'); try { await api(`/projects/${pid}/requests`, { method: 'POST', body: JSON.stringify({ kind: 'mentor', mentor_id: Number(mid), message: $(`#ask-project-${mid}`).value }) }); toast('멘토 요청을 보냈어요'); renderProject() } catch (e) { toast(e.message) } }) } catch (e) { box.innerHTML = `<div class="error">${esc(e.message)}</div>` } }
async function loadProjectPrograms() {
  const box = $('#project-programs');
  if (!box) return;
  try {
    const programs = await api(`/projects/${state.project}/programs`);
    box.innerHTML = programs.map(program => `<div class="card">
      <div class="row"><span class="pill amber">${esc(program.status)}</span><span class="pill gray">${esc(program.organizer)}</span></div>
      <h2 style="margin-top:10px">${esc(program.name)}</h2>
      <p class="muted">${esc(program.description)}</p>
      ${programChecks(program.match)}
      <button class="btn small" style="margin-top:12px" data-draft="${state.project}:${program.id}">신청서 초안 만들기</button>
    </div>`).join('');
    bind();
  } catch (error) {
    box.innerHTML = `<div class="error">${esc(error.message)}</div>`;
  }
}
async function loadPrograms() {
  const projectId = $('#program-project')?.value;
  if (!projectId) return;
  try {
    const programs = await api(`/projects/${projectId}/programs`);
    $('#program-list').innerHTML = programs.map(program => `<div class="card">
      <div class="row"><span class="pill amber">${esc(program.status)}</span><span class="pill gray">${esc(program.organizer)}</span></div>
      <h2 style="margin-top:12px">${esc(program.name)}</h2>
      <p class="muted">${esc(program.description)}</p>
      ${programChecks(program.match)}
      <div class="inline" style="margin-top:14px">
        <a class="btn outline small" target="_blank" rel="noopener" href="${esc(program.url)}">공식 안내 확인 ↗</a>
        <button class="btn small" data-draft="${projectId}:${program.id}">신청서 초안 만들기</button>
      </div>
    </div>`).join('');
    bind();
  } catch (error) {
    $('#program-list').innerHTML = `<div class="error">${esc(error.message)}</div>`;
  }
}
function programChecks(match) {
  const statusClass = { met: '', missing: 'amber', check: 'blue' };
  const statusLabel = { met: '준비됨', missing: '준비 필요', check: '확인 필요' };
  return `<div class="program-checklist"><div class="row"><b>프로젝트 기준 준비 점검</b><span class="pill ${match.status === '등록 정보상 준비됨' ? '' : 'amber'}">${esc(match.status)}</span></div>${match.checks.map(item => `<div class="program-check"><div class="row"><b>${esc(item.label)}</b><span class="pill ${statusClass[item.status] || 'gray'}">${statusLabel[item.status] || '확인 필요'}</span></div><p>${esc(item.detail)}</p></div>`).join('')}<small>${esc(match.notice)}</small></div>`;
}
async function renderProject() { const p = await api(`/projects/${state.project}`); state.cache.project = p; const d = JSON.parse(p.plan || '{}'); const tabs = [['overview', '한눈에 보기'], ['plan', '탐구계획'], ['team', '팀원 모집'], ['mentor', '멘토 요청'], ['funding', '지원사업'], ['chat', '대화']]; const actions = `<div class="inline"><button class="btn outline" data-action="back">← 프로젝트 목록</button>${p.owner_id === state.user.id || state.user.role === 'admin' ? '<button class="btn danger small" data-action="delete-project">프로젝트 삭제</button>' : ''}</div>`; shell(`${pageHead('나의 프로젝트', esc(p.title), `${esc(p.field)} · ${esc(p.stage)}`, actions)}<div class="tabs">${tabs.map(([k, t]) => `<button data-tab="${k}" class="${state.tab === k ? 'active' : ''}">${t}</button>`).join('')}</div><div id="project-content">${projectContent(p, d)}</div>`); if (state.tab === 'mentor') loadProjectMentors(); if (state.tab === 'funding') loadProjectPrograms(); const chat = $('#chat-box'); if (chat) chat.scrollTop = chat.scrollHeight; if (state.user.role === 'mentor' && state.tab === 'overview') { $('#project-content .card')?.insertAdjacentHTML('afterbegin', `<div class="section-title"><h3>멘티의 도움 요청</h3></div><div class="summary-box"><b>${esc(p.mentor_request?.student || '멘티')} 학생</b><p>${esc(p.mentor_request?.message || '요청 메시지가 없습니다.')}</p></div><form id="mentor-response-form"><div class="field"><label>요청에 답변하기</label><textarea name="body" required placeholder="멘티의 요청에 답변을 작성해 주세요."></textarea></div><button class="btn small">대화로 답변 보내기</button><small class="muted">답변은 프로젝트 대화에 저장되어 멘티도 볼 수 있어요.</small></form>`); $('#mentor-response-form').onsubmit = async e => { e.preventDefault(); try { await api(`/projects/${state.project}/messages`, { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))) }); toast('멘티에게 답변을 보냈어요'); renderProject() } catch (error) { toast(error.message) } }; $('#project-content .card')?.insertAdjacentHTML('beforeend', `<div class="section-title"><h3>탐구계획 피드백 남기기</h3></div><form id="feedback-form"><div class="field"><textarea name="body" required placeholder="학생이 다음 단계로 나아갈 수 있도록 구체적인 조언을 남겨주세요."></textarea></div><button class="btn small">피드백 저장</button></form>`); $('#feedback-form').onsubmit = async e => { e.preventDefault(); await api(`/projects/${state.project}/feedback`, { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))) }); toast('피드백을 저장했어요'); renderProject() } } }
function projectContent(p, d) {
  if (state.tab === 'overview') return `<div class="grid two"><div class="card"><div class="row"><h2>지금까지의 탐구</h2><span class="pill">${esc(p.stage)}</span></div><p>${esc(p.summary || p.question)}</p><div class="section-title"><h3>핵심 질문</h3><button class="btn secondary small" data-tab="plan">계획 이어 쓰기 →</button></div><div class="summary-box">${esc(p.question || '아직 정하지 않았어요')}</div><div class="section-title"><h3>함께하는 사람</h3></div>${(p.members || []).map(m => `<span class="pill gray" style="margin-right:6px">${esc(m.name)} · ${m.role === 'owner' ? '프로젝트 시작자' : '팀원'}</span>`).join('')}<div class="section-title"><h3>멘토 피드백</h3></div>${(p.feedback || []).map(f => `<div class="coach"><b>${esc(f.mentor)} 멘토</b><br>${esc(f.body)}</div>`).join('') || '<div class="empty">계획을 공유하고 멘토의 조언을 받아보세요.</div>'}</div><div class="card"><h2>프로젝트 설정</h2><div class="field"><label>진행 단계</label><select id="p-stage">${['아이디어 구상 중', '탐구계획 작성 중', '팀원 모집 중', '멘토 피드백 진행 중', '탐구 진행 중', '결과 정리 중', '완료'].map(s => `<option ${p.stage === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div><label class="inline"><input id="p-public" type="checkbox" ${p.is_public ? 'checked' : ''}> 팀원 모집 공개</label><div class="field"><label>모집 안내</label><textarea id="p-summary">${esc(p.summary)}</textarea></div><div class="field"><label>필요한 팀원 역할</label><input id="p-roles" value="${esc(p.roles)}"></div><button class="btn" data-action="save-settings">변경 저장</button><div class="coach">아직 계획이 완성되지 않아도 팀원 모집과 멘토 요청을 시작할 수 있어요.</div></div></div>`;
  if (state.tab === 'plan') return `<div class="grid two"><div class="card"><div class="row"><h2>탐구계획 초안</h2><span class="pill blue">학생이 검토하고 수정해요</span></div><p class="muted">확실하지 않은 내용은 미정으로 남겨도 괜찮아요. AI 제안은 언제든 고칠 수 있어요.</p><div id="plan-fields">${Object.entries({ background: '탐구 배경 및 문제', purpose: '탐구 목적', question: '핵심 탐구 질문', hypothesis: '가설 또는 예상', method: '탐구 방법 및 순서', materials: '장비·재료·데이터', schedule: '예상 일정', outcome: '예상 결과와 활용', challenges: '현재 어려운 부분', mentor_questions: '멘토에게 묻고 싶은 내용', team_roles: '필요한 팀원 역할' }).map(([k, label]) => `<div class="field"><label>${label}</label><textarea data-plan="${k}">${esc(d[k] || '미정')}</textarea></div>`).join('')}</div><button class="btn" data-action="save-plan">계획 저장</button></div><div class="card"><h2>AI와 한 단계씩 정리하기</h2><p class="muted">AI가 대신 결정하지 않아요. 한 번에 질문 하나씩, 네 생각을 계획에 담아볼게요.</p><div class="coach"><b>안전 메모</b><br>사람이 등장하는 사진이나 개인정보는 모으지 말고, 실험 활동은 보호자나 지도교사와 안전을 먼저 확인하세요.</div><div class="field"><label>어느 부분을 생각해 볼까요?</label><select id="ai-key"><option>탐구 대상과 범위</option><option>데이터 모으는 방법</option><option>결과 확인 방법</option><option>필요한 도구</option><option>진행 일정</option><option>멘토에게 물어볼 질문</option></select></div><div class="field"><label>지금 떠오르는 생각</label><textarea id="ai-answer" placeholder="모르겠으면 비워두어도 괜찮아요."></textarea></div><button class="btn" data-action="ask-ai">AI에게 정리 도움 받기</button><div id="ai-response"></div><p class="footer-note">AI 응답은 초안 제안입니다. 과학적 내용과 안전 조건은 직접 확인해 주세요.</p></div></div>`;
  if (state.tab === 'team') return `<div class="grid two"><div class="card"><h2>팀원 모집 정보</h2><p class="muted">프로젝트 내용을 공개하고 함께 탐구할 친구를 초대해요. 연락처나 상세 주소는 공개하지 않아요.</p><div class="field"><label>공개 요약</label><textarea id="p-summary">${esc(p.summary)}</textarea></div><div class="field"><label>필요한 역할</label><input id="p-roles" value="${esc(p.roles)}"></div><div class="field"><label>진행 단계</label><select id="p-stage">${['아이디어 구상 중', '탐구계획 작성 중', '팀원 모집 중', '멘토 피드백 진행 중', '탐구 진행 중', '결과 정리 중', '완료'].map(s => `<option ${p.stage === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div><label class="inline"><input type="checkbox" id="p-public" ${p.is_public ? 'checked' : ''}> 공개 프로젝트 목록에 표시</label><p><button class="btn" data-action="save-settings">모집 정보 저장</button></p></div><div class="card"><h2>참여 요청</h2>${(p.requests || []).length ? (p.requests || []).map(r => `<div class="list-item row"><div><b>${esc(r.requester)}</b><p class="muted">${esc(r.message || '함께 탐구하고 싶어요.')}</p><span class="pill gray">${esc(r.status)}</span></div>${r.status === 'pending' ? `<div class="inline"><button class="btn small" data-request-status="${p.id}:${r.id}:accepted">수락</button><button class="btn outline small" data-request-status="${p.id}:${r.id}:declined">거절</button></div>` : ''}</div>`).join('') : '<div class="empty"><strong>아직 참여 요청이 없어요</strong>모집을 공개하면 다른 학생이 요청을 보낼 수 있어요.</div>'}</div></div>`;
  if (state.tab === 'mentor') return `<div class="card"><h2>멘토 연결 상태</h2><p class="muted">추천은 아직 연결이 아니에요. 요청을 보낸 뒤 멘토가 직접 수락할 때만 연결됩니다.</p><div class="summary-box" id="mentor-connection-state">아직 연결된 멘토가 없어요. 아래 추천을 보고 도움을 요청해 보세요.</div><div class="section-title"><h3>추천 멘토</h3></div><div id="project-mentor-list" class="grid two"></div><div class="section-title"><h3>보낸 요청</h3></div><div id="project-mentor-requests"></div></div>`;
  if (state.tab === 'funding') return `<div class="section-title"><h2>지원사업과 신청 준비</h2><button class="btn outline small" data-page="programs">전체 지원사업 보기</button></div><div id="project-programs" class="grid two"></div>`;
  if (state.tab === 'chat') return `<div class="card"><div class="row"><div><h2>프로젝트 대화</h2><p class="muted">프로젝트 팀원과 수락된 멘토만 볼 수 있어요.</p></div><button class="btn outline small" data-action="report">신고</button></div><div class="chat-box" id="chat-box">${(p.messages || []).map(m => `<div class="bubble ${m.sender_id === state.user.id ? 'mine' : ''}">${esc(m.body)}<small>${esc(m.sender)} · ${esc(m.created_at)}</small></div>`).join('') || '<div class="empty">아직 대화가 없어요. 탐구 질문이나 진행 상황을 나눠보세요.</div>'}</div><form id="chat-form" class="inline" style="margin-top:12px"><input name="body" required placeholder="프로젝트 팀에 메시지 보내기" style="flex:1;border:1px solid var(--line);border-radius:11px;padding:12px"><button class="btn">보내기</button></form><p class="footer-note">연락처, 개인 이메일, 상세 주소 등은 채팅에 공유하지 않도록 주의해 주세요.</p></div>`; return ''
}
async function renderMentor() { if (state.page === 'profile') { profilePage(); return } const d = await api('/dashboard'); shell(`${pageHead('멘토 공간', '탐구의 다음 단계를 함께해요', '요청을 읽고 관심 있거나 도움을 줄 수 있는 프로젝트를 선택해 주세요.')}<div class="grid three"><div class="card stat-card"><div><div class="metric">${d.requests.filter(r => r.status === 'pending').length}</div><div class="metric-label">새로운 요청</div></div><span class="stat-icon">📨</span></div><div class="card stat-card"><div><div class="metric">${d.active.length}</div><div class="metric-label">함께하는 프로젝트</div></div><span class="stat-icon">🔬</span></div><div class="card stat-card"><div><div class="metric">${d.requests.filter(r => r.status === 'rejected').length}</div><div class="metric-label">정중히 거절한 요청</div></div><span class="stat-icon">🌿</span></div></div><div class="section-title"><h2>새 멘토 요청</h2><button class="btn secondary small" data-page="profile">프로필 편집</button></div><div class="grid two">${d.requests.filter(r => r.status === 'pending').map(r => `<div class="card"><div class="row"><span class="pill amber">답변 대기</span><small class="muted">${esc(r.student)} 학생</small></div><h2 style="margin-top:11px">${esc(r.title)}</h2><p class="muted">${esc(r.field)} · ${esc(r.stage)}</p><div class="summary-box"><b>학생의 질문</b><p>${esc(r.question)}</p><b>요청 메시지</b><p>${esc(r.message)}</p><b>멘토에게 묻고 싶은 내용</b><p>${esc(JSON.parse(r.plan || '{}').mentor_questions || '미정')}</p></div><div class="inline" style="margin-top:14px"><button class="btn" data-request-status="${r.project_id}:${r.id}:accepted">요청 수락</button><button class="btn outline" data-request-status="${r.project_id}:${r.id}:declined">이번에는 어려워요</button></div></div>`).join('') || '<div class="empty"><strong>새 요청이 없어요</strong>요청이 도착하면 프로젝트 개요와 학생의 질문을 여기에서 확인할 수 있어요.</div>'}</div><div class="section-title"><h2>함께하는 프로젝트</h2></div><div class="grid two">${d.active.map(p => `<article class="project-card" data-open-project="${p.id}"><span class="pill">${esc(p.field)}</span><h3>${esc(p.title)}</h3><p>${esc(p.question)}</p><div class="project-footer"><span>${esc(p.student)} 학생과 함께</span><span>대화 · 피드백 →</span></div></article>`).join('') || '<div class="empty">수락한 프로젝트가 여기에 표시됩니다.</div>'}</div>`) }
async function renderAdmin() { const d = await api('/dashboard'); shell(`${pageHead('서비스 운영', '관리자 대시보드', '사용자, 멘토 승인, 지원사업 예시와 신고 내역을 관리합니다.')}<div class="grid three"><div class="card stat-card"><div><div class="metric">${d.users}</div><div class="metric-label">등록 사용자</div></div><span class="stat-icon">👥</span></div><div class="card stat-card"><div><div class="metric">${d.mentors.filter(x => !x.approved).length}</div><div class="metric-label">승인 대기 멘토</div></div><span class="stat-icon">🧑‍🔬</span></div><div class="card stat-card"><div><div class="metric">${d.reports.filter(x => x.status === '접수').length}</div><div class="metric-label">확인할 신고</div></div><span class="stat-icon">🛡️</span></div></div><div class="card" style="margin-bottom:17px"><h2>사용자 관리</h2>${d.userList.map(x => `<div class="list-item row"><div><b>${esc(x.name)}</b><p class="muted">${esc(x.email)} · ${roleName(x.role)}${x.role === 'mentor' && !x.approved ? ' · 승인 대기' : ''}</p></div>${x.role !== 'admin' ? `<button class="btn ${x.active ? 'outline' : 'small'}" data-user-active="${x.id}:${x.active ? 0 : 1}">${x.active ? '비활성화' : '다시 활성화'}</button>` : ''}</div>`).join('')}</div><div class="grid two"><div class="card"><div class="row"><h2>멘토 프로필 승인</h2></div>${d.mentors.map(m => `<div class="list-item row"><div><b>${esc(m.name)}</b><p class="muted">${esc(m.fields || '분야 미등록')} · ${m.approved ? '승인됨' : '검토 필요'}</p></div><button class="btn ${m.approved ? 'outline' : 'small'}" data-mentor-approve="${m.id}:${m.approved ? 0 : 1}">${m.approved ? '비활성화' : '승인'}</button></div>`).join('')}</div><div class="card"><div class="row"><h2>지원사업 콘텐츠</h2><button class="btn small" data-action="add-program">＋ 추가</button></div>${d.programs.map(p => `<div class="list-item row"><div><b>${esc(p.name)}</b><p class="muted">${esc(p.status)} · ${esc(p.organizer)}</p></div><button class="btn danger small" data-program-delete="${p.id}">삭제</button></div>`).join('')}</div><div class="card"><h2>신고 내역</h2>${d.reports.map(r => `<div class="list-item row"><div><b>${esc(r.reporter)} · ${esc(r.reason)}</b><p class="muted">${esc(r.status)}</p></div>${r.status === '접수' ? `<button class="btn outline small" data-report-done="${r.id}">검토 완료</button>` : ''}</div>`).join('') || '<div class="empty">접수된 신고가 없습니다.</div>'}</div></div>`) }
function profilePage() { const u = state.user; shell(`${pageHead('내 프로필', '프로필과 도움 분야', '개인 연락처와 상세 주소는 프로필에 표시하지 않습니다.')}<div class="card" style="max-width:680px"><form id="profile-form"><div class="field"><label>표시 이름</label><input name="name" required value="${esc(u.name)}"></div><div class="field"><label>소개</label><textarea name="bio">${esc(u.bio)}</textarea></div>${u.role === 'mentor' ? `<div class="field"><label>전문 분야</label><input name="fields" value="${esc(u.fields)}" placeholder="예: 데이터 분석, 환경 센서"></div><div class="field"><label>도움을 줄 수 있는 내용</label><textarea name="help">${esc(u.help)}"></textarea></div><div class="coach">멘토 프로필 공개 전 운영자 승인이 필요합니다.</div>` : ''}<button class="btn">저장하기</button></form></div>`); $('#profile-form').onsubmit = async e => { e.preventDefault(); await api('/profile', { method: 'PUT', body: JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))) }); state.user = await api('/me').then(x => x.user); toast('프로필을 저장했어요'); render() } }
function bind() { document.querySelectorAll('[data-page]').forEach(b => b.onclick = () => { state.page = b.dataset.page; state.project = null; render() }); document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { state.tab = b.dataset.tab; if (state.project) renderProject() }); document.querySelectorAll('[data-open-project]').forEach(b => b.onclick = () => { state.project = Number(b.dataset.openProject); state.tab = 'overview'; render() }); document.querySelectorAll('[data-action]').forEach(b => b.onclick = async () => { const a = b.dataset.action; if (a === 'logout') { await api('/logout', { method: 'POST' }); state.user = null; render(); return } if (a === 'back') { state.project = null; state.page = 'home'; render(); return } if (a === 'new-project') return showNewProject(); if (a === 'save-settings') return saveSettings(); if (a === 'save-plan') return savePlan(); if (a === 'ask-ai') return askAI(); if (a === 'report') return showReport(); if (a === 'add-program') return showProgramForm() }); document.querySelectorAll('[data-request-team]').forEach(b => b.onclick = async () => { try { await api(`/projects/${b.dataset.requestTeam}/requests`, { method: 'POST', body: JSON.stringify({ kind: 'team', message: '프로젝트에 함께 참여하고 싶어요.' }) }); toast('참여 요청을 보냈어요') } catch (e) { toast(e.message) } }); document.querySelectorAll('[data-ask-mentor]').forEach(b => b.onclick = async () => { const [pid, mid] = b.dataset.askMentor.split(':'); try { await api(`/projects/${pid}/requests`, { method: 'POST', body: JSON.stringify({ kind: 'mentor', mentor_id: Number(mid), message: $(`#ask-${mid}`).value }) }); toast('멘토에게 요청을 보냈어요') } catch (e) { toast(e.message) } }); document.querySelectorAll('[data-request-status]').forEach(b => b.onclick = async () => { const [pid, rid, status] = b.dataset.requestStatus.split(':'); try { await api(`/projects/${pid}/requests/${rid}`, { method: 'PUT', body: JSON.stringify({ status }) }); toast(status === 'accepted' ? '요청을 수락했어요' : '요청 상태를 변경했어요'); render() } catch (e) { toast(e.message) } }); document.querySelectorAll('[data-mentor-approve]').forEach(b => b.onclick = async () => { const [id, approved] = b.dataset.mentorApprove.split(':'); await api(`/admin/mentors/${id}`, { method: 'PUT', body: JSON.stringify({ approved: Number(approved) }) }); render() }); document.querySelectorAll('[data-user-active]').forEach(b => b.onclick = async () => { const [id, active] = b.dataset.userActive.split(':'); await api(`/admin/users/${id}`, { method: 'PUT', body: JSON.stringify({ active: Number(active) }) }); toast('사용자 상태를 바꿨어요'); render() }); document.querySelectorAll('[data-program-delete]').forEach(b => b.onclick = async () => { await api(`/admin/programs/${b.dataset.programDelete}`, { method: 'DELETE' }); render() }); document.querySelectorAll('[data-report-done]').forEach(b => b.onclick = async () => { await api(`/admin/reports/${b.dataset.reportDone}`, { method: 'PUT', body: '{}' }); render() }); document.querySelectorAll('[data-draft]').forEach(b => b.onclick = () => draftModal(...b.dataset.draft.split(':'))); const cf = $('#chat-form'); if (cf) cf.onsubmit = async e => { e.preventDefault(); await api(`/projects/${state.project}/messages`, { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(cf))) }); renderProject() }; }
function modal(content) { state.modal = `<div class="modal-head"><h2>${content.title}</h2><button class="close" data-close>×</button></div>${content.body}`; renderModalOnly() }
function renderModalOnly() { const old = $('.modal-backdrop'); if (old) old.remove(); if (state.modal) { const el = document.createElement('div'); el.className = 'modal-backdrop'; el.dataset.action = 'backdrop'; el.innerHTML = `<section class="modal">${state.modal}</section>`; document.body.append(el); el.onclick = e => { if (e.target === el) { state.modal = null; el.remove() } }; el.querySelector('[data-close]').onclick = () => { state.modal = null; el.remove() }; } }
function showNewProject() { modal({ title: '새 프로젝트 만들기', body: `<p class="muted">아직 정해지지 않은 내용은 나중에 채워도 괜찮아요.</p><form id="new-project"><div class="field"><label>프로젝트 이름 (임시 제목도 좋아요)</label><input name="title" required placeholder="예: 우리 동네 새 관찰하기"></div><div class="field"><label>관심 분야</label><input name="field" placeholder="AI, 환경, 로봇 등"></div><div class="field"><label>궁금한 점 또는 바꾸고 싶은 문제</label><textarea name="question" placeholder="무엇이 궁금한가요?"></textarea></div><div class="field"><label>모집용 한 줄 소개 (선택)</label><textarea name="summary"></textarea></div><button class="btn">프로젝트 시작하기</button></form>` }); $('#new-project').onsubmit = async e => { e.preventDefault(); const button = e.currentTarget.querySelector('button[type="submit"], button:not([type])'); if (button.disabled) return; button.disabled = true; button.textContent = '프로젝트를 만들고 있어요…'; try { const r = await api('/projects', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))) }); state.modal = null; renderModalOnly(); state.project = r.id; state.tab = 'plan'; render() } catch (error) { button.disabled = false; button.textContent = '프로젝트 시작하기'; toast(error.message); } } }
async function saveSettings() { const p = state.cache.project; await api(`/projects/${state.project}`, { method: 'PUT', body: JSON.stringify({ title: p.title, field: p.field, question: p.question, plan: JSON.parse(p.plan), stage: $('#p-stage').value, is_public: $('#p-public').checked, summary: $('#p-summary').value, roles: $('#p-roles').value }) }); toast('프로젝트 설정을 저장했어요'); renderProject() }
async function savePlan(silent = false) { const p = state.cache.project, plan = JSON.parse(p.plan); document.querySelectorAll('[data-plan]').forEach(x => plan[x.dataset.plan] = x.value); await api(`/projects/${state.project}`, { method: 'PUT', body: JSON.stringify({ title: p.title, field: p.field, question: p.question, plan, stage: p.stage, is_public: p.is_public, summary: p.summary, roles: p.roles }) }); p.plan = JSON.stringify(plan); if (!silent) toast('탐구계획을 저장했어요') }
async function askAI() { const btn = $('[data-action="ask-ai"]'); btn.disabled = true; btn.textContent = '생각을 정리하고 있어요…'; try { const r = await api(`/projects/${state.project}/ai`, { method: 'POST', body: JSON.stringify({ key: $('#ai-key').value, answer: $('#ai-answer').value }) }); $('#ai-response').innerHTML = `<div class="coach"><b>${esc(r.source)}</b><br>${esc(r.reply)}</div>`; const plan = JSON.parse(state.cache.project.plan); Object.assign(plan, r.plan); state.cache.project.plan = JSON.stringify(plan); Object.entries(plan).forEach(([k, v]) => { const el = $(`[data-plan="${k}"]`); if (el) el.value = v }) } catch (e) { toast(e.message) } finally { btn.disabled = false; btn.textContent = 'AI에게 정리 도움 받기' } }
function showReport() { modal({ title: '콘텐츠 신고', body: `<p class="muted">운영자가 신고 내용을 확인할 수 있도록 이유를 남겨주세요.</p><form id="report-form"><div class="field"><label>신고 이유</label><textarea name="reason" required placeholder="확인이 필요한 내용을 알려주세요."></textarea></div><button class="btn">신고 접수</button></form>` }); $('#report-form').onsubmit = async e => { e.preventDefault(); await api('/reports', { method: 'POST', body: JSON.stringify({ project_id: state.project, ...Object.fromEntries(new FormData(e.currentTarget)) }) }); state.modal = null; renderModalOnly(); toast('신고를 접수했어요') } }
async function draftModal(pid, programId) { const p = await api(`/projects/${pid}`), programs = await api('/programs'), program = programs.find(x => x.id === Number(programId)), plan = JSON.parse(p.plan); const text = `[${program.name}] 신청서 초안\n\n프로젝트명: ${p.title}\n탐구 분야: ${p.field || '추가 작성 필요'}\n탐구 배경: ${plan.background || '추가 작성 필요'}\n탐구 목적: ${plan.purpose || '추가 작성 필요'}\n핵심 질문: ${plan.question || '추가 작성 필요'}\n탐구 방법: ${plan.method || '추가 작성 필요'}\n예상 일정: ${plan.schedule || '추가 작성 필요'}\n팀 구성: ${p.members.map(m => m.name).join(', ') || '추가 작성 필요'}\n지도교사: 추가 확인 필요\n\n확인할 항목: ${program.team_required ? '팀 구성 요건 확인, ' : ''}${program.teacher_required ? '지도교사 요건 확인, ' : ''}공식 모집 공고의 최신 서식과 지원 자격 확인\n\n※ 서비스가 만든 초안입니다. 실제 신청이 완료된 것이 아니며, 공식 공고에서 요건을 확인하세요.`; modal({ title: '지원사업 신청서 초안', body: `<p class="muted">현재 계획을 사업 항목에 맞춰 정리했어요. 검토하고 직접 수정하세요.</p><textarea id="draft-text" style="width:100%;min-height:340px;padding:13px;border:1px solid var(--line);border-radius:12px">${esc(text)}</textarea><div class="inline" style="margin-top:12px"><button class="btn" id="save-draft">초안 저장</button><button class="btn secondary" id="download-draft">파일로 내려받기</button><a class="btn outline" target="_blank" rel="noopener" href="${esc(program.url)}">공식 안내 확인 ↗</a></div><p class="footer-note">예시 사업은 데모 데이터입니다. 공식 신청 시스템과 연결되어 있지 않습니다.</p>` }); $('#save-draft').onclick = async () => { await api(`/applications/${pid}`, { method: 'POST', body: JSON.stringify({ program_id: programId, draft: $('#draft-text').value }) }); toast('초안을 저장했어요') }; $('#download-draft').onclick = () => { const blob = new Blob([$('#draft-text').value], { type: 'text/plain;charset=utf-8' }), a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = '신청서-초안.txt'; a.click(); URL.revokeObjectURL(a.href) } }
function showProgramForm() { modal({ title: '지원사업 예시 등록', body: `<form id="program-form"><div class="field"><label>사업명</label><input name="name" required></div><div class="field"><label>주관기관</label><input name="organizer"></div><div class="field"><label>소개</label><textarea name="description"></textarea></div><div class="field"><label>지원 분야</label><input name="fields" placeholder="AI, 환경"></div><div class="two-fields"><label><input type="checkbox" name="team_required"> 팀 필요</label><label><input type="checkbox" name="teacher_required"> 지도교사 필요</label></div><div class="field"><label>공식 안내 링크</label><input name="url" type="url"></div><button class="btn">예시 사업 추가</button></form>` }); $('#program-form').onsubmit = async e => { e.preventDefault(); const f = new FormData(e.currentTarget), d = Object.fromEntries(f); d.team_required = f.has('team_required'); d.teacher_required = f.has('teacher_required'); await api('/admin/programs', { method: 'POST', body: JSON.stringify(d) }); state.modal = null; render(); toast('지원사업을 추가했어요') } }
async function init() { try { state.user = (await api('/me')).user } catch { } render() } init();

// Keep the student's original prompt distinct from the refined research question.
const renderProjectContent = projectContent;
projectContent = function (project, plan) {
  let html = renderProjectContent(project, plan);
  if (state.tab !== 'overview') return html;
  html = html.replace('<h2>지금까지의 탐구</h2>', `<h2>지금까지의 탐구</h2><span class="pill blue">관심 분야 · ${esc(project.field || '아직 정하지 않았어요')}</span>`);
  html = html.replace(`<p>${esc(project.summary || project.question)}</p>`, `<p>${esc(project.summary || '처음 적은 궁금증에서 출발해 탐구계획을 함께 구체화해요.')}</p>`);
  html = html.replace('<h3>핵심 질문</h3>', '<h3>처음 입력한 궁금증</h3>');
  html = html.replace('</div><div class="section-title"><h3>함께하는 사람</h3></div>', `</div><div class="section-title"><h3>핵심 탐구 질문</h3></div><div class="summary-box">${esc(plan.question || '미정 — 탐구 질문을 함께 구체화해요.')}</div><div class="section-title"><h3>함께하는 사람</h3></div>`);
  return html;
};

// The student chooses the plan field; it remains selected until they move it.
function coachSteps(project) {
  const context = `${project.title} ${project.field} ${project.question}`.toLowerCase();
  const chatbot = context.includes('챗봇') || context.includes('chatbot');
  return [
    { key: 'background', label: '탐구 배경 및 문제', prompt: chatbot ? '챗봇이 어떤 질문이나 상황에서 특히 아쉽게 답하나요? 개인정보 없는 예시로 설명해 볼까요?' : '어떤 상황이나 문제를 관찰했나요? 장소와 상황을 구체적으로 떠올려 봐요.' },
    { key: 'purpose', label: '탐구 목적', prompt: '이 탐구를 마쳤을 때 무엇을 새롭게 알고 싶나요?' },
    { key: 'question', label: '핵심 탐구 질문', prompt: '무엇을 비교하거나 확인하고 싶은지 한 문장 질문으로 만들어 볼까요?' },
    { key: 'hypothesis', label: '가설 또는 예상', prompt: '지금은 어떤 결과가 나올 것 같나요? 예상으로 편하게 적어도 괜찮아요.' },
    { key: 'method', label: '탐구 방법 및 순서', prompt: chatbot ? '챗봇의 답변을 어떤 기준으로 비교해 보면 좋을까요?' : '어떤 순서로 관찰하거나 비교하면 질문에 답할 수 있을까요?' },
    { key: 'materials', label: '장비·재료·데이터', prompt: chatbot ? '안전하게 시험할 질문과 답변, 사용할 챗봇이나 기기는 무엇인가요?' : '사용할 수 있는 자료나 도구가 있나요? 안전과 이용 허가도 함께 확인해요.' },
    { key: 'schedule', label: '예상 일정', prompt: '언제까지 어떤 순서로 해보고 싶나요?' },
    { key: 'outcome', label: '예상 결과와 활용', prompt: '결과를 알게 되면 누구에게 어떤 도움이 될까요?' },
    { key: 'challenges', label: '현재 어려운 부분', prompt: '지금 막히거나 더 알아보고 싶은 부분은 무엇인가요?' },
    { key: 'mentor_questions', label: '멘토에게 묻고 싶은 내용', prompt: '멘토가 함께한다면 가장 먼저 어떤 도움을 받고 싶나요?' },
    { key: 'team_roles', label: '필요한 팀원 역할', prompt: '함께한다면 어떤 일을 맡을 친구가 있으면 좋을까요?' }
  ];
}

function canonicalAIFocus(value) {
  const aliases = { '탐구 대상과 범위': 'background', '결과 확인 방법': 'method', '데이터 모으는 방법': 'materials', '필요한 도구': 'materials', '진행 일정': 'schedule', '멘토에게 묻고 싶은 내용': 'mentor_questions', '멘토에게 물어볼 질문': 'mentor_questions' };
  return aliases[value] || value;
}

function updateAIFocusPanel() {
  const project = state.cache.project;
  if (!project || !$('#ai-key')) return;
  const plan = JSON.parse(project.plan || '{}');
  const steps = coachSteps(project);
  const preferredFocus = state.aiFocusProject === state.project ? state.aiFocus : null;
  const focus = canonicalAIFocus(preferredFocus || $('#ai-key').value || plan._ai_active_focus || steps[0].key);
  const step = steps.find(item => item.key === focus) || steps[0];
  state.aiFocus = step.key;
  state.aiFocusProject = state.project;
  $('#ai-key').value = step.key;
  const currentValue = $(`[data-plan="${step.key}"]`)?.value || plan[step.key] || '아직 작성하지 않았어요.';
  const guide = $('#ai-current-question');
  if (guide) guide.innerHTML = `<b>이번 항목 도움말 · ${esc(step.label)}</b><br>${esc(step.prompt)}<br><small>현재 계획: ${esc(currentValue)}</small>`;
  const thread = (plan._ai_history || []).filter(turn => canonicalAIFocus(turn.focus) === step.key);
  const transcript = $('#ai-history');
  if (transcript) transcript.innerHTML = thread.map(turn => { const suggested = steps.find(item => item.key === turn.suggest_focus); const tag = turn.on_topic === false ? `다른 항목 내용${suggested ? ` · ${esc(suggested.label)} 관련` : ''}` : `내 생각 · ${esc(step.label)}`; return `<div class="bubble mine ${turn.on_topic === false ? 'off-topic' : ''}">${esc(turn.answer || '힌트를 부탁했어요.')}<small>${tag}</small></div><div class="bubble">${esc(turn.reply)}<small>${esc(turn.source || '탐구 도우미')}</small></div>`; }).join('') || `<div class="ai-chat-empty"><span class="ai-chat-mark">✳</span><div><b>AI 탐구 도우미</b><p>‘${esc(step.label)}’에 대해 편하게 이야기해 보세요. 대화가 시작되면 이 창에 기록됩니다.</p></div></div>`;
  const label = $('#ai-answer-label');
  if (label) label.textContent = `‘${step.label}’에 대해 떠오르는 생각`;
  const help = $('#ai-answer-help');
  if (help) help.textContent = `보내면 ‘${step.label}’ 항목에만 반영돼요. 다른 항목은 위에서 선택하세요.`;
  const transition = $('#ai-transition');
  const pending = plan._ai_pending_focus;
  const pendingStep = steps.find(item => item.key === pending);
  if (transition) transition.innerHTML = pendingStep && focus === canonicalAIFocus(plan._ai_active_focus) ? `<div class="summary-box"><b>이 항목을 마무리할까요?</b><p>‘${esc(pendingStep.label)}’ 항목으로 이동해 새 대화를 시작합니다.</p><div class="inline"><button class="btn small" data-action="accept-next">다음 항목으로 이동</button><button class="btn outline small" data-action="stay-current">이 항목 더 정리하기</button></div></div>` : '';
  if (transition) {
    transition.querySelector('[data-action="accept-next"]')?.addEventListener('click', () => setAIFocus(pendingStep.key, true, '다음 항목으로 이동'));
    transition.querySelector('[data-action="stay-current"]')?.addEventListener('click', () => clearAIPending());
  }
}

const priorProjectContent = projectContent;
projectContent = function (project, plan) {
  if (state.tab === 'mentor' && !project.plan_complete) {
    return `<div class="card"><span class="pill amber">계획 작성 후 연결</span><h2 style="margin-top:14px">탐구계획을 먼저 정리해 볼까요?</h2><p class="muted">핵심 질문, 탐구 목적, 탐구 방법을 적고 ‘작성 완료’를 누르면 프로젝트에 맞는 멘토를 추천해요.</p><button class="btn" data-tab="plan">탐구계획 이어 쓰기</button><div class="coach">팀원 모집은 계획이 완성되기 전에도 시작할 수 있어요.</div></div>`;
  }
  let html = priorProjectContent(project, plan);
  if (state.tab !== 'plan') return html;
  html = html.replace('<div class="coach"><b>안전 메모</b><br>사람이 등장하는 사진이나 개인정보는 모으지 말고, 실험 활동은 보호자나 지도교사와 안전을 먼저 확인하세요.</div>', '');
  const history = plan._ai_history || [];
  const steps = coachSteps(project);
  const savedFocus = canonicalAIFocus(plan._ai_active_focus);
  const localFocus = canonicalAIFocus(localStorage.getItem(`ai-focus-${state.project}`));
  const preferredFocus = state.aiFocusProject === state.project ? state.aiFocus : null;
  const focus = steps.some(item => item.key === preferredFocus) ? preferredFocus : (steps.some(item => item.key === localFocus) ? localFocus : (steps.some(item => item.key === savedFocus) ? savedFocus : steps[0].key));
  state.aiFocus = focus;
  state.aiFocusProject = state.project;
  const step = steps.find(item => item.key === focus) || steps[0];
  const topicHistory = history.filter(turn => canonicalAIFocus(turn.focus) === focus);
  const chooser = /<div class="field"><label>어느 부분을 생각해 볼까요\?<\/label><select id="ai-key">[\s\S]*?<\/select><\/div>/;
  const conversation = `<div class="field"><label for="ai-key">AI와 정리할 계획 항목</label><select id="ai-key">${steps.map(item => `<option value="${item.key}" ${item.key === focus ? 'selected' : ''}>${esc(item.label)}</option>`).join('')}</select><small>답변은 선택한 항목에 반영돼요. 답변 뒤에도 이 항목을 유지합니다.</small></div><div class="chat-box ai-conversation" id="ai-history" aria-live="polite">${topicHistory.map(turn => `<div class="bubble mine ${turn.on_topic === false ? 'off-topic' : ''}">${esc(turn.answer || '힌트를 부탁했어요.')}<small>${turn.on_topic === false ? `다른 항목 내용${turn.suggest_focus ? ` · ${esc(steps.find(item => item.key === turn.suggest_focus)?.label || '관련 항목')} 관련` : ''}` : `내 생각 · ${esc(step.label)}`}</small></div><div class="bubble">${esc(turn.reply)}<small>${esc(turn.source || '탐구 도우미')}</small></div>`).join('') || `<div class="ai-chat-empty"><span class="ai-chat-mark">✳</span><div><b>AI 탐구 도우미</b><p>‘${esc(step.label)}’에 대해 편하게 이야기해 보세요. 대화가 시작되면 이 창에 기록됩니다.</p></div></div>`}</div>`;
  html = html.replace(chooser, conversation);
  html = html.replace('AI가 대신 결정하지 않아요. 한 번에 질문 하나씩, 네 생각을 계획에 담아볼게요.', 'AI는 선택한 계획 항목에 집중해요. 다른 항목을 고르거나 다음 항목으로 이동할 때까지 지금 항목을 이어서 정리합니다.');
  html = html.replace('<div class="field"><label>지금 떠오르는 생각</label><textarea id="ai-answer" placeholder="모르겠으면 비워두어도 괜찮아요."></textarea></div>', `<div class="field"><label id="ai-answer-label" for="ai-answer">‘${esc(step.label)}’에 대해 떠오르는 생각</label><textarea id="ai-answer" placeholder="모르겠으면 ‘힌트 받기’를 눌러도 괜찮아요."></textarea><small id="ai-answer-help">보내면 ‘${esc(step.label)}’ 항목에만 반영돼요. 다른 항목은 위에서 선택하세요.</small></div>`);
  html = html.replace('<button class="btn" data-action="ask-ai">AI에게 정리 도움 받기</button><div id="ai-response"></div>', `<div class="inline"><button class="btn" data-action="ask-ai">이 항목에 답변 반영</button><button class="btn outline" data-action="skip-ai">힌트 받기</button></div><div id="ai-transition"></div><div id="ai-response"></div><div class="coach ai-current-question" id="ai-current-question"><b>이번 항목 도움말 · ${esc(step.label)}</b><br>${esc(step.prompt)}<br><small>현재 계획: ${esc(plan[focus] || '아직 작성하지 않았어요.')}</small></div><details class="safety-note"><summary>안전·개인정보 안내</summary><p>사람이 등장하는 사진이나 개인정보는 모으지 말고, 실험 활동은 보호자나 지도교사와 안전을 먼저 확인하세요.</p></details>`);
  html = html.replace('<button class="btn" data-action="save-plan">계획 저장</button>', `<div class="inline"><button class="btn" data-action="save-plan">계획 저장</button><button class="btn secondary" data-action="complete-plan">탐구계획 작성 완료</button></div><p class="footer-note">완료를 누르면 멘토 추천과 요청이 열립니다. 팀원 모집은 지금도 할 수 있어요.</p>`);
  return html;
};

const originalNewProject = showNewProject;
showNewProject = function () {
  originalNewProject();
  const concern = $('#new-project textarea[name="question"]');
  concern?.closest('.field')?.insertAdjacentHTML('afterend', `<div class="field"><label>핵심 탐구 질문 <span class="muted">(선택)</span></label><textarea name="research_question" placeholder="예: 어떤 질문에서 챗봇이 기대와 다른 답을 할까?"></textarea><small>아직 막연해도 괜찮아요. 비워두면 탐구계획에서 AI와 함께 구체화할 수 있어요.</small></div>`);
};

const originalLoadMentors = loadMentors;
loadMentors = async function () {
  const id = $('#mentor-project')?.value;
  if (!id) return;
  try {
    const project = await api(`/projects/${id}`);
    if (!project.plan_complete) {
      $('#mentor-list').innerHTML = `<div class="card"><span class="pill amber">계획 작성 후 연결</span><h2 style="margin-top:12px">먼저 탐구계획을 마무리해요</h2><p class="muted">핵심 질문·목적·방법을 적고 프로젝트 안에서 ‘탐구계획 작성 완료’를 누르면 추천 멘토를 볼 수 있어요.</p><button class="btn small" data-open-project="${id}">계획 이어 쓰기</button><div class="coach">팀원 모집은 지금 시작할 수 있습니다.</div></div>`;
      bind();
      return;
    }
  } catch (error) { toast(error.message); return; }
  return originalLoadMentors();
};

async function finishPlan() {
  const project = state.cache.project;
  const plan = JSON.parse(project.plan || '{}');
  document.querySelectorAll('[data-plan]').forEach(field => plan[field.dataset.plan] = field.value.trim());
  const missing = ['question', 'purpose', 'method'].filter(key => !plan[key] || plan[key].startsWith('미정'));
  if (missing.length) { toast('핵심 탐구 질문, 탐구 목적, 탐구 방법을 먼저 적어 주세요.'); return; }
  try {
    await api(`/projects/${state.project}`, { method: 'PUT', body: JSON.stringify({ title: project.title, field: project.field, question: project.question, plan, stage: project.stage, is_public: project.is_public, summary: project.summary, roles: project.roles, plan_complete: true }) });
    toast('탐구계획을 완료했어요. 이제 멘토를 추천받을 수 있어요.');
    state.tab = 'mentor';
    renderProject();
  } catch (error) { toast(error.message); }
}

const baseBind = bind;
bind = function () {
  baseBind();
  document.querySelectorAll('[data-action="skip-ai"]').forEach(button => button.onclick = () => askAI(true));
  $('#ai-key')?.addEventListener('change', event => setAIFocus(event.target.value));
  document.querySelectorAll('[data-action="complete-plan"]').forEach(button => button.onclick = finishPlan);
  if ($('#ai-key')) updateAIFocusPanel();
};

async function setAIFocus(key, advance = false, confirmation = '') {
  const steps = coachSteps(state.cache.project);
  if (!steps.some(step => step.key === key)) return;
  const previousKey = $('#ai-key')?.value || state.aiFocus || steps[0].key;
  state.aiFocus = key;
  state.aiFocusProject = state.project;
  if ($('#ai-key')) $('#ai-key').value = key;
  try {
    if ($('#plan-fields')) await savePlan(true);
    const result = await api(`/projects/${state.project}/ai`, { method: 'POST', body: JSON.stringify(advance ? { action: 'advance', key: previousKey, target: key, answer: confirmation } : { action: 'focus', key }) });
    state.aiFocus = result.active_focus || key;
    state.aiFocusProject = state.project;
    if ($('#ai-key')) $('#ai-key').value = state.aiFocus;
    localStorage.setItem(`ai-focus-${state.project}`, key);
    state.cache.project.plan = JSON.stringify(result.plan);
    updateAIFocusPanel();
    if ($('#ai-response')) $('#ai-response').innerHTML = '';
  } catch (error) { toast(error.message); }
}

async function clearAIPending() {
  try {
    const result = await api(`/projects/${state.project}/ai`, { method: 'POST', body: JSON.stringify({ action: 'stay', key: $('#ai-key').value }) });
    state.cache.project.plan = JSON.stringify(result.plan);
    updateAIFocusPanel();
  } catch (error) { toast(error.message); }
}

function moveAIFocus(direction) {
  const steps = coachSteps(state.cache.project);
  const current = steps.findIndex(step => step.key === ($('#ai-key')?.value || state.aiFocus));
  const next = Math.max(0, Math.min(steps.length - 1, current + direction));
  if (next !== current) setAIFocus(steps[next].key, direction > 0, direction > 0 ? '다음 항목으로 이동' : '이전 항목으로 이동');
}

askAI = async function (hint = false) {
  const button = $('[data-action="ask-ai"]');
  if (!button) return;
  button.disabled = true;
  const answer = hint ? '' : $('#ai-answer').value.trim();
  const key = $('#ai-key').value;
  const savedPlan = JSON.parse(state.cache.project.plan || '{}');
  const pendingFocus = savedPlan._ai_pending_focus;
  const compactAnswer = answer.toLowerCase().replace(/[\s.!?。！？~ㅋㅎㅠㅜ]/gu, '');
  const declinesMove = /^(?:아니|아니요|아뇨|잠깐|아직|더|계속|계속할래|계속할게)/u.test(compactAnswer);
  const acceptsMove = !declinesMove && /(?:좋아|좋아요|좋아용|네|넵|응|그래|오케이|오키|콜|이동|넘어가|갈게|가자|ㄱㄱ|다음(?:으로|항목으로|질문으로)(?:넘어가|이동|가자|가요|ㄱㄱ))/u.test(compactAnswer);
  if (!hint && pendingFocus && acceptsMove) {
    $('#ai-answer').value = '';
    await setAIFocus(pendingFocus, true, answer);
    button.disabled = false;
    return;
  }
  const moveCommand = /^(?:(?:그럼)?다음(?:항목|질문)?(?:으로)?(?:넘어가자|넘어가요|가자|가요|이동해줘|이동해주세요|ㄱㄱ)|넘어가자|넘어갈게(?:요|용)?|이동(?:ㄱㄱ)?|가자|ㄱㄱ)$/u;
  if (!hint && moveCommand.test(compactAnswer)) {
    $('#ai-answer').value = '';
    button.disabled = false;
    moveAIFocus(1);
    return;
  }
  try {
    await savePlan(true);
    const result = await api(`/projects/${state.project}/ai`, { method: 'POST', body: JSON.stringify({ key, answer }) });
    state.cache.project.plan = JSON.stringify(result.plan);
    Object.entries(result.plan).forEach(([key, value]) => { const field = $(`[data-plan="${key}"]`); if (field) field.value = value; });
    state.aiFocus = key;
    state.aiFocusProject = state.project;
    localStorage.setItem(`ai-focus-${state.project}`, key);
    $('#ai-answer').value = '';
    updateAIFocusPanel();
    if (result.diagnostic) {
      $('#ai-response').innerHTML = `<div class="error">Gemini 연결 진단: ${esc(result.diagnostic)} · 기본 탐구 도우미가 답변했어요.</div>`;
    } else if (result.on_topic === false && result.suggest_focus) {
      const target = coachSteps(state.cache.project).find(step => step.key === result.suggest_focus);
      $('#ai-response').innerHTML = target ? `<div class="inline"><small>이 내용은 ‘${esc(target.label)}’ 항목에 더 잘 맞아요.</small><button class="btn outline small" data-action="switch-ai-topic">${esc(target.label)} 대화로 이동</button></div>` : '';
      $('#ai-response [data-action="switch-ai-topic"]')?.addEventListener('click', () => setAIFocus(result.suggest_focus));
    } else {
      $('#ai-response').innerHTML = '';
    }
  } catch (error) { toast(error.message); }
  finally { if ($('[data-action="ask-ai"]')) $('[data-action="ask-ai"]').disabled = false; }
};

function confirmDeleteProject() {
  const project = state.cache.project;
  if (!project) return;
  modal({
    title: '프로젝트를 삭제할까요?',
    body: `<p class="muted">탐구계획, 대화, 피드백, 팀원·멘토 요청, 신청서 초안도 함께 삭제됩니다. 이 작업은 되돌릴 수 없어요.</p><form id="delete-project-form"><div class="field"><label>삭제하려면 프로젝트 이름을 그대로 입력하세요</label><input name="title" required autocomplete="off" placeholder="${esc(project.title)}"></div><div class="inline"><button class="btn danger" type="submit">프로젝트 삭제</button><button class="btn outline" type="button" data-close-delete>취소</button></div></form>`
  });
  $('#delete-project-form').onsubmit = async event => {
    event.preventDefault();
    if (new FormData(event.currentTarget).get('title').trim() !== project.title) {
      toast('프로젝트 이름이 일치하지 않아요.');
      return;
    }
    const button = event.currentTarget.querySelector('button[type="submit"]');
    if (button.disabled) return;
    button.disabled = true;
    button.textContent = '삭제하고 있어요…';
    try {
      await api(`/projects/${project.id}`, { method: 'DELETE' });
      state.modal = null;
      renderModalOnly();
      state.project = null;
      state.page = 'home';
      state.tab = 'overview';
      toast('프로젝트를 삭제했어요.');
      render();
    } catch (error) {
      button.disabled = false;
      button.textContent = '프로젝트 삭제';
      toast(error.message);
    }
  };
  $('[data-close-delete]')?.addEventListener('click', () => { state.modal = null; renderModalOnly(); });
}

const bindWithPlan = bind;
bind = function () {
  bindWithPlan();
  document.querySelectorAll('[data-action="delete-project"]').forEach(button => button.onclick = confirmDeleteProject);
};

loadProjectMentors = async function () {
  const box = $('#project-mentor-list');
  const requestBox = $('#project-mentor-requests');
  if (!box || !requestBox) return;
  try {
    const [mentors, dashboard] = await Promise.all([
      api(`/projects/${state.project}/mentors`),
      api('/dashboard')
    ]);
    const requests = dashboard.requests.filter(request => request.project_id === state.project);
    const accepted = requests.filter(request => request.status === 'accepted');
    const connection = $('#mentor-connection-state');
    if (connection) {
      connection.innerHTML = accepted.length
        ? `<b>연결된 멘토</b><br>${accepted.map(request => esc(request.mentor || '멘토')).join(', ')} 멘토가 요청을 수락했어요. 이제 대화와 피드백을 이용할 수 있어요.`
        : '아직 연결된 멘토가 없어요. 아래 추천을 보고 도움을 요청해 보세요.';
    }
    requestBox.innerHTML = requests.map(request => `<div class="list-item row"><div><b>${esc(request.mentor || '멘토')}</b><p class="muted">${esc(request.message || '도움 요청')}</p></div><span class="pill ${request.status === 'accepted' ? '' : 'amber'}">${({ pending: '답변 대기', accepted: '수락됨', rejected: '거절됨', cancelled: '취소됨' })[request.status] || request.status}</span></div>`).join('') || '<div class="empty">아직 멘토 요청이 없어요.</div>';
    box.innerHTML = mentors.map(mentor => {
      const request = requests.find(item => item.mentor_id === mentor.id && ['pending', 'accepted'].includes(item.status));
      const label = request?.status === 'accepted' ? '연결됨' : request ? '답변 대기' : '멘토에게 요청';
      return `<div class="card"><div class="row"><div class="inline"><span class="avatar">${esc(mentor.name.slice(0, 1))}</span><b>${esc(mentor.name)}</b></div><span class="pill">추천 ${mentor.recommendation.score}</span></div><p class="muted">${esc(mentor.fields)}</p><p>${esc(mentor.recommendation.reason)}</p><div class="summary-box">${esc(mentor.help)}</div><div class="inline" style="margin-top:12px"><input id="ask-project-${mentor.id}" placeholder="구체적으로 어떤 도움이 필요하나요?" style="flex:1;min-width:140px;border:1px solid var(--line);border-radius:10px;padding:9px"><button class="btn small" data-ask-project-mentor="${state.project}:${mentor.id}" ${request ? 'disabled' : ''}>${label}</button></div></div>`;
    }).join('') || '<div class="empty">현재 추천 가능한 멘토가 없어요.</div>';
    document.querySelectorAll('[data-ask-project-mentor]').forEach(button => button.onclick = async () => {
      const [projectId, mentorId] = button.dataset.askProjectMentor.split(':');
      try {
        await api(`/projects/${projectId}/requests`, { method: 'POST', body: JSON.stringify({ kind: 'mentor', mentor_id: Number(mentorId), message: $(`#ask-project-${mentorId}`).value }) });
        toast('멘토 요청을 보냈어요. 멘토가 수락하기 전에는 연결되지 않아요.');
        renderProject();
      } catch (error) { toast(error.message); }
    });
  } catch (error) {
    box.innerHTML = `<div class="error">${esc(error.message)}</div>`;
  }
};

// Never carry a selected project or tab across account changes. The API permits
// limited viewing of public projects, so stale client state could otherwise
// reopen a student's previous project after another role signs in.
const renderBeforeAccountReset = render;
render = async function () {
  const accountId = state.user?.id ?? null;
  if (state.renderedAccountId !== accountId) {
    state.renderedAccountId = accountId;
    state.page = 'home';
    state.project = null;
    state.tab = 'overview';
    state.cache = {};
    state.aiFocus = null;
    state.aiFocusProject = null;
  }
  return renderBeforeAccountReset();
};

const renderProjectForMentor = renderProject;
renderProject = async function () {
  if (state.user.role !== 'mentor') return renderProjectForMentor();

  const project = await api(`/projects/${state.project}`);
  const plan = JSON.parse(project.plan || '{}');
  const tabs = [['overview', '프로젝트 개요'], ['plan', '탐구계획 (보기 전용)'], ['chat', '요청·대화']];
  if (!tabs.some(([key]) => key === state.tab)) state.tab = 'overview';
  const actions = '<button class="btn outline" data-action="back">← 요청 관리</button>';
  const labels = {
    background: '탐구 배경 및 문제',
    purpose: '탐구 목적',
    question: '핵심 탐구 질문',
    hypothesis: '가설 또는 예상',
    method: '탐구 방법 및 순서',
    materials: '장비·재료·데이터',
    schedule: '예상 일정',
    outcome: '예상 결과와 활용',
    challenges: '현재 어려운 부분',
    mentor_questions: '멘토에게 묻고 싶은 내용',
    team_roles: '필요한 팀원 역할'
  };
  let content = '';

  if (state.tab === 'overview') {
    content = `<div class="grid two">
      <section class="card">
        <div class="row"><h2>프로젝트 개요</h2><span class="pill gray">${esc(project.stage)}</span></div>
        <p>${esc(project.summary || project.question || '프로젝트 소개가 아직 작성되지 않았어요.')}</p>
        <div class="section-title"><h3>핵심 탐구 질문</h3></div><div class="summary-box">${esc(plan.question || project.question || '아직 작성되지 않았어요.')}</div>
        <div class="section-title"><h3>멘티</h3></div><span class="pill gray">${esc(project.mentor_request?.student || '멘티')} 학생</span>
        <div class="section-title"><button class="btn small" data-tab="chat">요청 확인하고 대화하기 →</button></div>
      </section>
      <section class="card">
        <div class="section-title"><h3>탐구계획 피드백</h3></div>
        ${(project.feedback || []).map(item => `<div class="coach">${esc(item.body)}<small>${esc(item.mentor)} 멘토 · ${esc(item.created_at)}</small></div>`).join('') || '<p class="muted">아직 등록된 피드백이 없어요.</p>'}
        <form id="feedback-form">
          <div class="field"><label for="mentor-feedback">학생에게 남길 피드백</label><textarea id="mentor-feedback" name="body" required placeholder="탐구계획에서 잘된 점과 다음 단계를 구체적으로 적어 주세요."></textarea></div>
          <button class="btn secondary">피드백 저장</button>
        </form>
      </section>
    </div>`;
  } else if (state.tab === 'plan') {
    content = `<section class="card mentor-plan-view">
      <div class="row"><h2>멘티의 탐구계획</h2><span class="pill gray">🔒 읽기 전용</span></div>
      <div class="mentor-readonly-notice"><b>멘토는 계획을 직접 수정하거나 저장할 수 없습니다.</b><span>수정 의견은 ‘요청·대화’ 탭에서 멘티에게 전달해 주세요.</span></div>
      <div class="mentor-plan-fields">${Object.entries(labels).map(([key, label]) => `<div class="mentor-plan-field"><span>${label}</span><p>${esc(plan[key] || '아직 작성되지 않았어요.')}</p></div>`).join('')}</div>
    </section>`;
  } else {
    content = `<section class="card"><div class="row"><div><h2>멘티의 도움 요청</h2><p class="muted">${esc(project.mentor_request?.student || '멘티')} 학생이 보낸 요청입니다.</p></div><span class="pill blue">요청 내용</span></div><div class="summary-box">${esc(project.mentor_request?.message || '요청 메시지가 없습니다.')}</div></section>${projectContent(project, plan)}`;
  }

  shell(`${pageHead('멘토링 프로젝트', esc(project.title), `${esc(project.field)} · ${esc(project.mentor_request?.student || '멘티')} 학생과 함께`, actions)}<div class="tabs">${tabs.map(([key, title]) => `<button data-tab="${key}" class="${state.tab === key ? 'active' : ''}">${title}</button>`).join('')}</div><div id="project-content">${content}</div>`);

  const feedbackForm = $('#feedback-form');
  if (feedbackForm) feedbackForm.onsubmit = async event => {
    event.preventDefault();
    try {
      await api(`/projects/${state.project}/feedback`, { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(feedbackForm))) });
      toast('탐구계획 피드백을 저장했어요.');
      renderProject();
    } catch (error) {
      toast(error.message);
    }
  };

  const chat = $('#chat-box');
  if (chat) chat.scrollTop = chat.scrollHeight;
};

const renderProjectWithRoleLabels = renderProject;
renderProject = async function () {
  await renderProjectWithRoleLabels();
  if (state.user.role !== 'student') return;
  const mentorTab = $('[data-tab="mentor"]');
  const chatTab = $('[data-tab="chat"]');
  if (mentorTab) mentorTab.textContent = '멘토 연결';
  if (chatTab) chatTab.textContent = '프로젝트 대화';
};
