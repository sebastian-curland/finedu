// quiz.js — generic, world-agnostic quiz rendering engine.
//
// renderQuiz(el, questions, {tier, onComplete}):
//  - filters `questions` to the given profile tier (tier 1 sees only
//    q.tier === 1; tier 2 sees everything) — this module does the
//    filtering itself, callers just pass the world's full quiz array.
//  - renders one question at a time (progress label + bar), supporting
//    all 5 question types: mc, tf, match, num, scenario.
//  - shows `q.why` immediately after the user answers, before advancing.
//  - tracks a running correct count and calls `onComplete({score, of})`
//    once after the last question.
//
// Pure UI logic only: no imports from content/ or store.js. The caller
// (screens/quiz-screen.js) owns loading world content and persisting the
// result.

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Fisher-Yates shuffle, returns a new array (does not mutate input). */
function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function renderQuiz(el, questions, { tier, onComplete }) {
  const filtered = (questions || []).filter((q) => (tier === 1 ? q.tier === 1 : true));
  const of = filtered.length;
  let index = 0;
  let score = 0;

  function shell({ questionText, controlsHtml }) {
    const pct = of ? Math.round((index / of) * 100) : 0;
    el.innerHTML = `
      <div class="screen-quiz">
        <p class="quiz-progress-label">שאלה ${index + 1} מתוך ${of}</p>
        <div class="progress"><div class="progress-bar" style="width:${pct}%"></div></div>
        <div class="card quiz-question-card">
          <p class="quiz-question-text">${escapeHtml(questionText)}</p>
          <div class="quiz-answer-area">
            <div class="quiz-answer-controls">${controlsHtml}</div>
          </div>
        </div>
      </div>
    `;
  }

  /** Disables every button/input inside the interactive controls area. */
  function lockControls() {
    el.querySelectorAll('.quiz-answer-controls button, .quiz-answer-controls input').forEach((node) => {
      node.disabled = true;
    });
  }

  /** Appends the why + continue/finish button after an answer is locked in. */
  function showFeedback(q, isCorrect) {
    if (isCorrect) score += 1;
    lockControls();
    const isLast = index === of - 1;
    const feedbackHtml = `
      <div class="quiz-feedback ${isCorrect ? 'is-correct' : 'is-incorrect'}">
        <p class="quiz-feedback-result">${isCorrect ? '✅ נכון!' : '❌ לא בדיוק'}</p>
        <p class="quiz-feedback-why">${escapeHtml(q.why)}</p>
      </div>
      <button type="button" class="btn btn-primary btn-block quiz-continue-btn">
        ${isLast ? 'סיימו' : 'שאלה הבאה'}
      </button>
    `;
    el.querySelector('.quiz-answer-area').insertAdjacentHTML('beforeend', feedbackHtml);
    el.querySelector('.quiz-continue-btn').addEventListener('click', () => {
      if (isLast) {
        onComplete({ score, of });
      } else {
        index += 1;
        renderQuestion();
      }
    });
  }

  // --- per-type control rendering + wiring --------------------------------

  function controlsMc(q) {
    return q.options
      .map((opt, i) => `<button type="button" class="btn btn-secondary quiz-option-btn" data-idx="${i}">${escapeHtml(opt)}</button>`)
      .join('');
  }

  function wireMc(q) {
    el.querySelectorAll('.quiz-option-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.idx);
        const isCorrect = idx === q.answer;
        btn.classList.add(isCorrect ? 'is-correct' : 'is-incorrect');
        if (!isCorrect) {
          const correctBtn = el.querySelector(`.quiz-option-btn[data-idx="${q.answer}"]`);
          if (correctBtn) correctBtn.classList.add('is-correct');
        }
        showFeedback(q, isCorrect);
      });
    });
  }

  function controlsTf() {
    return `
      <div class="quiz-tf-options">
        <button type="button" class="btn btn-secondary quiz-tf-btn" data-val="true">נכון</button>
        <button type="button" class="btn btn-secondary quiz-tf-btn" data-val="false">לא נכון</button>
      </div>
    `;
  }

  function wireTf(q) {
    el.querySelectorAll('.quiz-tf-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.val === 'true';
        const isCorrect = val === q.answer;
        btn.classList.add(isCorrect ? 'is-correct' : 'is-incorrect');
        if (!isCorrect) {
          const correctBtn = el.querySelector(`.quiz-tf-btn[data-val="${q.answer}"]`);
          if (correctBtn) correctBtn.classList.add('is-correct');
        }
        showFeedback(q, isCorrect);
      });
    });
  }

  function controlsNum() {
    return `
      <div class="quiz-num-area">
        <input type="number" inputmode="decimal" class="input quiz-num-input" placeholder="הקלידו מספר…" />
        <button type="button" class="btn btn-primary quiz-num-submit">בדקו</button>
      </div>
    `;
  }

  function wireNum(q) {
    const input = el.querySelector('.quiz-num-input');
    const submit = el.querySelector('.quiz-num-submit');
    submit.addEventListener('click', () => {
      const val = Number(input.value);
      const tolerance = typeof q.tolerance === 'number' ? q.tolerance : 0;
      const isCorrect = !Number.isNaN(val) && Math.abs(val - q.answer) <= tolerance;
      showFeedback(q, isCorrect);
    });
  }

  function controlsMatch(q) {
    const rightOrder = shuffled(q.pairs.map((p, i) => i));
    // stash the shuffle order on the element so wireMatch can read it back
    const leftItems = q.pairs
      .map((p, i) => `<button type="button" class="btn btn-secondary quiz-match-item" data-left="${i}">${escapeHtml(p[0])}</button>`)
      .join('');
    const rightItems = rightOrder
      .map((origIdx) => `<button type="button" class="btn btn-secondary quiz-match-item" data-right="${origIdx}">${escapeHtml(q.pairs[origIdx][1])}</button>`)
      .join('');
    return `
      <p class="quiz-match-hint">בחרו פריט מימין ואז את ההתאמה שלו משמאל</p>
      <div class="quiz-match">
        <div class="quiz-match-col quiz-match-left">${leftItems}</div>
        <div class="quiz-match-col quiz-match-right">${rightItems}</div>
      </div>
      <button type="button" class="btn btn-primary btn-block quiz-match-check" disabled>בדקו</button>
    `;
  }

  function wireMatch(q) {
    const leftLabels = q.pairs.map((p) => p[0]);
    const assignments = new Array(q.pairs.length).fill(null); // assignments[leftIdx] = rightOrigIdx or null
    let selectedLeft = null;

    const leftBtns = () => el.querySelectorAll('.quiz-match-item[data-left]');
    const rightBtns = () => el.querySelectorAll('.quiz-match-item[data-right]');
    const checkBtn = el.querySelector('.quiz-match-check');

    function updateCheckEnabled() {
      checkBtn.disabled = assignments.some((a) => a === null);
    }

    leftBtns().forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.left);
        if (assignments[i] !== null) {
          // unassign: free the paired right item, restore label
          const freedRight = assignments[i];
          assignments[i] = null;
          btn.textContent = leftLabels[i];
          const rightBtn = el.querySelector(`.quiz-match-item[data-right="${freedRight}"]`);
          if (rightBtn) rightBtn.disabled = false;
          leftBtns().forEach((b) => b.classList.remove('is-active'));
          updateCheckEnabled();
          return;
        }
        leftBtns().forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        selectedLeft = i;
      });
    });

    rightBtns().forEach((btn) => {
      btn.addEventListener('click', () => {
        if (selectedLeft === null || btn.disabled) return;
        const rightOrigIdx = Number(btn.dataset.right);
        assignments[selectedLeft] = rightOrigIdx;
        const leftBtn = el.querySelector(`.quiz-match-item[data-left="${selectedLeft}"]`);
        if (leftBtn) leftBtn.textContent = `${leftLabels[selectedLeft]} ← ${btn.textContent}`;
        btn.disabled = true;
        leftBtns().forEach((b) => b.classList.remove('is-active'));
        selectedLeft = null;
        updateCheckEnabled();
      });
    });

    checkBtn.addEventListener('click', () => {
      const isCorrect = assignments.every((rightOrigIdx, leftIdx) => rightOrigIdx === leftIdx);
      showFeedback(q, isCorrect);
    });
  }

  function renderQuestion() {
    const q = filtered[index];
    let controlsHtml = '';
    if (q.type === 'mc' || q.type === 'scenario') controlsHtml = controlsMc(q);
    else if (q.type === 'tf') controlsHtml = controlsTf();
    else if (q.type === 'num') controlsHtml = controlsNum();
    else if (q.type === 'match') controlsHtml = controlsMatch(q);

    shell({ questionText: q.q, controlsHtml });

    if (q.type === 'mc' || q.type === 'scenario') wireMc(q);
    else if (q.type === 'tf') wireTf(q);
    else if (q.type === 'num') wireNum(q);
    else if (q.type === 'match') wireMatch(q);
  }

  if (of === 0) {
    el.innerHTML = `
      <div class="empty-state">
        <p class="empty-state-emoji" aria-hidden="true">🤔</p>
        <p>אין שאלות זמינות לחידון הזה.</p>
      </div>
    `;
    return;
  }

  renderQuestion();
}
