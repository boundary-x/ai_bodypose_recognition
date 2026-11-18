/* In-app support for PoseNet feature learning. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id),support=$('support-card');
 support.innerHTML=`
 <summary><span><strong>사용 가이드 및 지원</strong><small>사용법 · 예제 코드 · 문제 해결</small></span><span class="support-chevron" aria-hidden="true">⌄</span></summary>
 <div class="support-content">
 <p class="support-intro">나만의 자세를 학습하고 인식한 ID로 기기를 제어해보세요. 블루투스 연결 없이 인식하고 전송할 데이터를 먼저 확인할 수 있습니다. 기기를 연결하면 실제 데이터를 전송합니다.</p>
 <div class="support-actions"><button type="button" data-tour="all" class="support-primary">사용법 둘러보기 <span aria-hidden="true">→</span></button></div>
 <details class="support-section" id="help-examples"><summary>내 기기에 맞는 예제</summary><div class="support-answer device-examples"><p>사용할 기기에 맞는 예제를 선택해주세요.</p><div class="device-prepare"><strong>공통 준비</strong><a href="https://makecode.microbit.org/S49771-77509-50114-72682" target="_blank" rel="noopener noreferrer">블루투스 이름 확인 코드 ↗</a><p>LED에 표시되는 알파벳 소문자 5자리 이름을 확인하세요.</p></div><article class="device-example-card"><div class="device-example-heading"><h4>마이크로비트 기본</h4><span>마이크로비트만 사용</span></div><p>인식된 ID에 따라 원하는 동작을 만들어보세요.</p><div class="device-example-links"><a id="project-example-link" href="https://makecode.microbit.org/57559-53483-63617-50743" target="_blank" rel="noopener noreferrer">기본 예제 열기 ↗</a></div><p>조건문에 ID1을 입력해 코드를 완성하세요. stop을 받으면 정지하도록 설정하세요.</p></article></div></details>
 <details class="support-section" id="help-troubleshooting"><summary>문제 해결 <span class="support-meta">증상별 안내</span></summary><div class="support-answer support-faq">
 <details id="help-camera"><summary>카메라가 켜지지 않아요</summary><p>사이트의 카메라 권한을 허용하고 다른 카메라 앱을 종료하세요. 오류 안내에 따라 다시 시도하세요. 새로고침 전에는 수집한 데이터를 저장해주세요.</p></details>
 <details id="help-hand"><summary>상체만 보여도 학습할 수 있나요?</summary><p>네. MediaPipe Lite의 관절 좌표로 자세를 비교합니다. 얼굴과 양쪽 어깨가 잘 보이도록 해주세요. 화면 밖이나 가려진 관절은 비교에서 제외하며, 비교할 관절이 부족하면 수집을 잠시 멈춥니다. 자세가 다시 보이면 자동으로 이어집니다.</p></details>
 <details id="help-training"><summary>학습하기를 누르면 어떻게 되나요?</summary><p>5초 동안 자세를 준비한 뒤 0.5초 간격으로 새 샘플 10개를 수집합니다. 큰 카운트다운과 진행 막대로 상태를 확인하세요. 자세 미감지 시 일시 대기하고, 1분 안에 완료하지 못하면 종료합니다. 취소해도 수집한 샘플은 유지됩니다. ID에 10개 이상 모이면 별도 학습 없이 인식할 수 있습니다.</p></details>
 <details id="help-accuracy"><summary>다른 자세로 인식돼요</summary><p>ID마다 비슷한 개수의 샘플을 모으세요. 학습하기를 다시 눌러 조금 다른 거리에서도 같은 자세를 추가할 수 있습니다. 서로 다른 자세로 구분하고, 학습과 인식 때 비슷한 카메라 방향을 사용하세요. 이웃 샘플 일치 비율은 실제 정확도를 뜻하지 않습니다. 충분히 비슷하지 않으면 일치하는 자세 없음으로 표시합니다.</p></details>
 <details id="help-connection"><summary>블루투스 연결이 안 되거나 기기가 움직이지 않아요</summary><p>마이크로비트 전원과 UART 예제 코드를 확인하세요. 다른 앱과의 연결을 해제하고 Web Bluetooth를 지원하는 브라우저에서 연결하세요. 아이폰은 Bluefy 등 지원 브라우저가 필요합니다.</p><p>샘플 수집 후 인식 시작을 눌러야 ID가 전송됩니다. 대소문자를 구분하며 줄바꿈으로 끝납니다. 자세 미감지가 약 0.5초 이어지거나 인식을 중지하면 stop을 보냅니다. 기기 코드에서도 stop을 처리해주세요.</p></details>
 <details id="help-files"><summary>저장하거나 가져올 수 없어요</summary><p>이 웹앱에서 저장한 MediaPipe KNN JSON 파일을 사용하세요. 기존 PoseNet 및 Teachable Machine 파일은 특징 구조가 달라 사용할 수 없습니다. 파일은 최대 4MiB이며 원본 영상은 포함하지 않습니다. 새로고침 전에는 샘플을 다운로드해주세요.</p></details>
 </div></details>
 <details class="support-section"><summary>수업 자료</summary><div class="support-answer"><p>몸 포즈 분류 수업 자료는 준비 중입니다.</p></div></details>
 <details class="support-section" id="help-updates"><summary>업데이트 노트 <span class="support-meta">최근 변경</span></summary><div class="support-answer"><p class="support-release">PoseNet 기반 신경망 포즈 분류</p><ul><li>Teachable Machine 공식 포즈 라이브러리 적용</li><li>전신 필수 조건 제거, 상체·부분 포즈 샘플 수집</li><li>샘플 수집과 모델 학습 단계 분리</li><li>학습 진행률 · 취소 · 학습된 모델 저장 및 복원</li></ul></div></details>
 </div>`;
 const tours={
 learn:[
 ['#p5-container','학습할 자세를 비춰주세요','상체만 보여도 됩니다. 모든 관절이 보일 필요는 없습니다. 한 사람을 비추고 실제 사용할 화면 구도에서 샘플을 모아주세요.'],
 ['#add-class-btn','ID별로 자세를 정하세요','ID1부터 자동으로 추가됩니다. 삭제한 번호는 다시 사용할 수 있으며, 다른 ID는 바뀌지 않습니다.'],
 ['#training-list','샘플을 수집하세요','학습하기를 누르면 5초 준비 후 10개를 자동 수집합니다. 화면의 숫자와 진행 막대를 확인하세요. ID당 100개, 전체 500개까지 수집할 수 있습니다.'],
 ['#model-training-card','바로 인식할 수 있어요','ID에 10개 이상 모이면 별도 모델 학습 없이 인식할 수 있습니다. 다른 자세는 다른 ID로 추가해주세요.'],
 ['#recognition-control-buttons','인식을 시작하세요','샘플 10개가 모이면 인식 시작을 누르세요. 마이크로비트를 연결하지 않아도 결과를 확인할 수 있습니다.'],
 ['#result-card .data-info-box','자세를 바꾸며 확인하세요','ID와 이웃 샘플 일치 비율을 확인하세요. 이 비율은 정확도 보장이 아닙니다. 샘플 변경은 바로 반영됩니다.']
 ],
 device:[
 ['#project-example-link','프로젝트 예제를 완성하세요','블루투스 이름 확인 후 프로젝트 조건문에 ID1을 입력하고 원하는 동작을 넣어 다운로드하세요. stop을 받았을 때 멈추는 동작도 설정하세요.'],
 ['#bluetooth-control-buttons','마이크로비트를 연결하세요','기기 연결에서 내 장치를 선택하세요. 다른 앱이 연결되어 있다면 먼저 해제해주세요.'],
 ['#recognition-control-buttons','인식 결과를 전송하세요','인식 시작을 누르면 감지한 자세의 ID가 전송됩니다. 자세 미감지가 약 0.5초 이어지면 stop이 전송됩니다.'],
 ['#bluetooth-data-display','전송 상태를 확인하세요','전송됨 표시는 블루투스 쓰기의 완료를 뜻합니다. 기기가 움직이려면 수신 코드의 ID 조건과 일치해야 합니다.']
 ],
 files:[
 ['#download-model-btn','샘플과 모델을 보관하세요','JSON 파일에는 수집한 관절 특징 샘플과 ID가 저장됩니다. 원본 영상은 포함되지 않습니다. 새로고침 전에는 다운로드해주세요.'],
 ['#share-model-btn','파일을 공유하세요','지원하는 기기에서는 공유 창에서 앱을 선택하세요. 지원하지 않으면 다운로드로 저장합니다.'],
 ['#import-model-btn','저장한 모델을 가져오세요','이 웹앱에서 내보낸 KNN JSON 파일을 선택하세요. 10개 이상 수집한 ID를 바로 인식할 수 있습니다.']
 ]};
  const allSteps = [...tours.learn, ...tours.device, ...tours.files];
  const chapters = [{label:'학습', start:0}, {label:'기기 연결', start:tours.learn.length}, {label:'저장·가져오기', start:tours.learn.length + tours.device.length}];
  const dialog = document.createElement('dialog');
  dialog.id = 'guide-dialog';
  dialog.setAttribute('aria-labelledby', 'guide-title');
  dialog.setAttribute('aria-describedby', 'guide-description');
  dialog.innerHTML = `<div id="guide-spotlight" aria-hidden="true"></div><section id="guide-panel"><div class="guide-topline"><span id="guide-progress"></span><button id="guide-close" type="button" aria-label="화면 안내 종료">닫기 ×</button></div><nav class="guide-chapters" aria-label="안내 구간">${chapters.map((chapter, i) => `<button type="button" data-chapter="${i}" aria-pressed="false">${chapter.label}</button>`).join('')}</nav><div aria-live="polite" aria-atomic="true"><h2 id="guide-title"></h2><p id="guide-description"></p></div><p class="guide-caption">화면 안내입니다. 닫은 뒤 직접 눌러보세요.</p><button id="guide-skip-device" type="button" hidden>기기 연결 건너뛰기 →</button><div class="guide-navigation"><button id="guide-prev" type="button">이전</button><button id="guide-next" type="button">다음</button></div></section>`;
  document.body.appendChild(dialog);
  let steps = [], index = 0, target = null, opener = null, originalScroll = 0, pendingFrame = 0;

  let examplesWereOpen = false;

  function openHelp(section) {
    support.open = true;
    if (section) {
      $('help-troubleshooting').open = true;
      $(section).open = true;
    }
    const heading = (section ? $(section) : support).querySelector('summary');
    heading.scrollIntoView({block: 'center', behavior: 'instant'});
    heading.focus({preventScroll: true});
  }
  document.querySelectorAll('[data-help]').forEach(button => button.addEventListener('click', () => openHelp(button.dataset.help || null)));

  function renderStep() {
    const [selector, title, description] = steps[index];
    if (selector === '#project-example-link') $('help-examples').open = true;
    target = document.querySelector(selector);
    const chapterIndex = index < chapters[1].start ? 0 : index < chapters[2].start ? 1 : 2;
    dialog.querySelectorAll('[data-chapter]').forEach((button, i) => button.setAttribute('aria-pressed', String(i === chapterIndex)));
    $('guide-skip-device').hidden = chapterIndex !== 1;
    $('guide-progress').textContent = `${chapters[chapterIndex].label}${chapterIndex === 1 ? ' · 선택' : ''} · ${index + 1} / ${steps.length}`;
    $('guide-title').textContent = title;
    $('guide-description').textContent = description;
    if (selector === '#training-list' && !target.querySelector('.train-btn')) {
      $('guide-title').textContent = 'ID별 학습 버튼이 표시될 자리예요';
      $('guide-description').textContent = 'ID를 추가하면 이곳에 학습하기 버튼이 나타납니다. 한 번 누르고 5초 안에 자세를 잡으면 10개를 자동으로 수집합니다.';
    }
    $('guide-prev').disabled = index === 0;
    $('guide-next').textContent = index === steps.length - 1 ? '안내 마치기' : '다음';
    if (target) target.scrollIntoView({block: 'center', behavior: 'instant'});
    positionGuide(true);
  }

  function positionGuide(reveal = false) {
    if (!dialog.open) return;
    const panel = $('guide-panel'), spot = $('guide-spotlight');
    const width = window.innerWidth, height = window.innerHeight, gap = 16;
    panel.style.width = Math.min(360, width - 24) + 'px';
    const ph = panel.getBoundingClientRect().height, pw = panel.getBoundingClientRect().width;
    const headerBottom = document.querySelector('header').getBoundingClientRect().bottom;
    let r = target ? target.getBoundingClientRect() : null;
    // Narrow screens reserve the lower area for the explanation. A temporary bottom
    // spacer allows the last control to scroll above it without altering saved data.
    const narrow = width < 700;
    if (reveal && r && narrow) {
      const top = Math.max(12, headerBottom + 16);
      window.scrollBy({top: r.top - top, behavior: 'instant'});
      r = target.getBoundingClientRect();
    }
    let x = width - pw - 12, y = height - ph - 12;
    if (r && !narrow) {
      const candidates = [
        [r.left - pw - gap, Math.max(12, Math.min(r.top, height - ph - 12))],
        [r.right + gap, Math.max(12, Math.min(r.top, height - ph - 12))],
        [Math.max(12, Math.min(r.left, width - pw - 12)), r.bottom + gap],
        [Math.max(12, Math.min(r.left, width - pw - 12)), r.top - ph - gap]
      ];
      const fit = candidates.find(([cx, cy]) => cx >= 12 && cy >= 12 && cx + pw <= width - 12 && cy + ph <= height - 12);
      if (fit) [x,y] = fit;
    }
    panel.style.left = x + 'px'; panel.style.top = Math.max(12, y) + 'px';
    if (r) {
      const top = Math.max(4, r.top - 5), left = Math.max(4, r.left - 5);
      const bottom = Math.min(height - 4, narrow ? y - 12 : height - 4, r.bottom + 5);
      spot.hidden = bottom <= top || r.right <= 0 || r.left >= width;
      Object.assign(spot.style, {left: left + 'px', top: top + 'px', width: Math.max(0, Math.min(width - 4, r.right + 5) - left) + 'px', height: Math.max(0, bottom - top) + 'px'});
    } else spot.hidden = true;
  }
  function startTour(kind, button) {
    if (kind !== 'all') return;
    stopForChange();
    opener = button; originalScroll = window.scrollY;
    steps = allSteps; index = 0;
    examplesWereOpen = $('help-examples').open;
    document.body.classList.add('guide-active');
    dialog.showModal();
    renderStep();
    $('guide-next').focus({preventScroll:true});
  }
  support.querySelectorAll('[data-tour]').forEach(button => button.addEventListener('click', () => startTour(button.dataset.tour, button)));
  $('guide-prev').addEventListener('click', () => { if (index > 0) { index--; renderStep(); } });
  $('guide-next').addEventListener('click', () => { if (index === steps.length - 1) dialog.close(); else { index++; renderStep(); } });
  dialog.querySelectorAll('[data-chapter]').forEach(button => button.addEventListener('click', () => { index = chapters[Number(button.dataset.chapter)].start; renderStep(); }));
  $('guide-skip-device').addEventListener('click', () => { index = chapters[2].start; renderStep(); $('guide-next').focus({preventScroll:true}); });
  $('guide-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    document.body.classList.remove('guide-active');
    $('help-examples').open = examplesWereOpen;
    window.scrollTo({top:originalScroll, behavior:'instant'});
    if (opener) opener.focus({preventScroll:true});
  });
  const reposition = () => {
    if (!dialog.open || pendingFrame) return;
    pendingFrame = requestAnimationFrame(() => { pendingFrame = 0; positionGuide(); });
  };
  window.addEventListener('resize', () => { if (dialog.open) renderStep(); });
  window.addEventListener('scroll', reposition, {passive:true});
  if (location.hash === '#support-card') requestAnimationFrame(() => openHelp());
})();



