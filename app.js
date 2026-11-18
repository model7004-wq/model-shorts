// 모델쇼츠 (웹 버전) – 사진 여러 장 → 세로 쇼츠/릴스 영상(1080x1920 mp4)을 브라우저 안에서 만든다.
// 사진·음악은 서버로 보내지 않고 이 기기 안에서만 처리한다.
const $ = id => document.getElementById(id);

const W = 1080, H = 1920, FPS = 30;
const PHOTO_SEC = 2.6;   // 사진 한 장이 보이는 시간
const FADE_SEC = 0.6;    // 사진이 바뀌는 시간
const END_SEC = 3.5;     // 마지막 사진관 안내 화면
const STEP = PHOTO_SEC - FADE_SEC;
const MAX_PHOTOS = 20;
const TRANSITIONS = ['fade', 'slideLeft', 'fade', 'circle', 'fade', 'slideUp'];
const FONT = '"Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';

/* ---------------- 주제별 자동 문구 ---------------- */
const TOPICS = {
  family: { label: '👨‍👩‍👧 가족사진', titles: ['우리 가족의 가장 따뜻한 하루', '3대가 함께한 특별한 가족사진', '오늘, 가족이 한 장에 담겼어요', '웃음 가득 우리 가족 촬영 현장'], tags: ['가족사진', '가족사진촬영', '3대가족사진', '가족사진잘찍는곳'] },
  baby: { label: '👶 아기·성장사진', titles: ['우리 아기 첫 촬영 날', '쑥쑥 자라는 순간을 기록해요', '아기 성장사진 촬영 현장', '이 귀여움 실화인가요?'], tags: ['아기사진', '성장사진', '돌사진', '백일사진', '아기스튜디오'] },
  pet: { label: '🐶 반려견 가족사진', titles: ['댕댕이도 우리 가족이에요', '반려견과 함께한 가족사진', '멍멍이랑 찰칵!', '반려동물 가족사진 촬영 현장'], tags: ['반려견가족사진', '강아지사진', '반려동물사진', '댕댕이'] },
  anniversary: { label: '🎉 칠순·회갑 기념', titles: ['부모님 칠순 기념 가족사진', '회갑을 축하드려요', '평생 남을 기념사진 한 장', '감사의 마음을 사진으로'], tags: ['칠순사진', '회갑사진', '기념사진', '부모님선물'] },
  profile: { label: '😎 프로필 사진', titles: ['인생 프로필 완성!', '나만의 분위기 프로필 촬영', '프로필 사진 비포 애프터', '자신감 뿜뿜 프로필 촬영'], tags: ['프로필사진', '프로필촬영', '바디프로필', '인생사진'] },
  id: { label: '🪪 증명·여권사진', titles: ['증명사진도 예쁘게!', '취업 사진 이렇게 찍어요', '여권사진 빠르고 깔끔하게', '증명사진 촬영 현장'], tags: ['증명사진', '여권사진', '취업사진', '증명사진잘찍는곳'] },
  friends: { label: '💑 커플·우정사진', titles: ['우리 우정 영원히', '커플 사진 촬영 현장', '친구랑 찍은 인생 사진', '둘이라서 더 좋은 하루'], tags: ['우정사진', '커플사진', '친구사진', '기념일사진'] },
};
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

function buildPost(topic, st) {
  const t = TOPICS[topic] || TOPICS.family;
  const region = (st.region || '').trim(), name = (st.name || '').trim();
  const title = pick(t.titles);
  const hashtags = [...new Set([...(region ? [`${region}사진관`, `${region}${t.tags[0]}`] : []), ...(name ? [name.replace(/\s/g, '')] : []), ...t.tags, '사진관', 'shorts'])];
  const info = [name && `📸 ${name}${region ? ` (${region})` : ''}`, st.phone && `📞 예약·문의 ${st.phone}`, st.address && `📍 ${st.address}`].filter(Boolean).join('\n');
  return { topic, title, description: [title, info].filter(Boolean).join('\n\n'), hashtags };
}

/* ---------------- 저장 (이 기기에만) ---------------- */
const DEFAULT_STUDIO = { name: '모델스튜디오', region: '문경', tagline: '문경 가족사진 전문 사진관', phone: '054-554-0824', address: '경북 문경시 상신로36' };
function loadStudio() { try { return { ...DEFAULT_STUDIO, ...JSON.parse(localStorage.getItem('modelshorts.studio') || '{}') }; } catch (_) { return { ...DEFAULT_STUDIO }; } }
function saveStudio(s) { try { localStorage.setItem('modelshorts.studio', JSON.stringify(s)); } catch (_) {} }

let studio = loadStudio();
let photos = [];       // { id, name, url, frame(canvas 1080x1920) }
let music = null;      // { name, buffer(AudioBuffer) }
let post = null;
let result = null;     // { blob, url, file, seconds }
let busy = false;

function setMsg(el, text, kind) { el.textContent = text || ''; el.className = 'msg' + (kind ? ' ' + kind : ''); }

/* ---------------- 화면 ---------------- */
function render() {
  $('studioName').textContent = studio.name ? `· ${studio.name}` : '';
  $('photoCount').textContent = photos.length ? `${photos.length}장` : '';
  $('thumbs').innerHTML = '';
  photos.forEach((p, i) => {
    const d = document.createElement('div');
    d.className = 'thumb';
    d.innerHTML = `<img src="${p.url}" alt=""><span class="order">${i + 1}</span>
      <div class="tools"><button title="앞으로" data-mv="-1">◀</button><button title="빼기" data-del>✕</button><button title="뒤로" data-mv="1">▶</button></div>`;
    d.querySelector('[data-del]').onclick = () => { photos.splice(i, 1); URL.revokeObjectURL(p.url); changed(); };
    d.querySelectorAll('[data-mv]').forEach(b => b.onclick = () => {
      const j = i + +b.dataset.mv;
      if (j < 0 || j >= photos.length) return;
      [photos[i], photos[j]] = [photos[j], photos[i]]; changed();
    });
    $('thumbs').appendChild(d);
  });
  $('topics').innerHTML = '';
  Object.entries(TOPICS).forEach(([key, t]) => {
    const b = document.createElement('button');
    b.className = 'topic' + (post && post.topic === key ? ' on' : '');
    b.textContent = t.label;
    b.onclick = () => { post = buildPost(key, studio); fillPost(); changed(); };
    $('topics').appendChild(b);
  });
  $('postBox').hidden = !post;
  $('musicName').textContent = music ? `🎵 ${music.name}` : '🎵 기본 잔잔한 음악 (저작권 걱정 없음)';
  $('btnMusicDel').hidden = !music;
  $('btnMake').disabled = busy;
}
function fillPost() {
  $('p_title').value = post.title;
  $('p_desc').value = post.description;
  $('p_tags').value = post.hashtags.map(t => '#' + t).join(' ');
}
function readPost() {
  if (!post) return;
  post.title = $('p_title').value.trim();
  post.description = $('p_desc').value.replace(/\r\n/g, '\n');
  post.hashtags = [...new Set($('p_tags').value.split(/[\s,]+/).map(t => t.replace(/^#+/, '').trim()).filter(Boolean))];
}
// 사진·제목이 바뀌면 이전 영상은 "옛날 영상" 표시
function changed() {
  render();
  if (result) $('videoInfo').innerHTML = `${result.file} · ${result.seconds}초<br><b style="color:#b45309">사진이나 제목이 바뀌었어요. [영상 만들기]를 다시 눌러주세요.</b>`;
}
['p_title', 'p_desc', 'p_tags'].forEach(id => $(id).addEventListener('input', () => { readPost(); changed(); }));
$('btnReroll').onclick = e => { e.preventDefault(); post = buildPost(post.topic, studio); fillPost(); changed(); };

/* ---------------- 사진 준비 ---------------- */
// 사진 1장을 1080x1920 세로 화면으로: 뒤는 흐린 배경, 가운데에 사진 전체
function composeFrame(bmp) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const cover = Math.max(W / bmp.width, H / bmp.height);
  // 작게 그렸다가 크게 늘리면 흐릿해진다 (모든 브라우저에서 되는 흐림 효과)
  const tiny = document.createElement('canvas'); tiny.width = 27; tiny.height = 48;
  const tg = tiny.getContext('2d');
  tg.drawImage(bmp, (27 - bmp.width * cover / 40) / 2, (48 - bmp.height * cover / 40) / 2, bmp.width * cover / 40, bmp.height * cover / 40);
  g.imageSmoothingQuality = 'high';
  g.drawImage(tiny, -20, -20, W + 40, H + 40);
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, W, H);
  const fit = Math.min(W / bmp.width, H / bmp.height);
  const fw = bmp.width * fit, fh = bmp.height * fit;
  g.drawImage(bmp, (W - fw) / 2, (H - fh) / 2, fw, fh);
  return c;
}

async function addPhotos(files) {
  files = [...files].filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name));
  if (!files.length) return setMsg($('photoMsg'), '사진 파일을 골라주세요.', 'err');
  const skipped = [];
  let added = 0;
  setMsg($('photoMsg'), `사진 ${files.length}장을 준비하는 중이에요…`);
  for (const f of files) {
    if (photos.length >= MAX_PHOTOS) { skipped.push(`${f.name} (최대 ${MAX_PHOTOS}장)`); continue; }
    const id = `${f.name}|${f.size}|${f.lastModified}`;
    if (photos.some(p => p.id === id)) { skipped.push(`${f.name} (이미 넣음)`); continue; }
    try {
      const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' });
      const frame = composeFrame(bmp);
      const thumb = document.createElement('canvas'); thumb.width = 216; thumb.height = 384;
      thumb.getContext('2d').drawImage(frame, 0, 0, 216, 384);
      const url = URL.createObjectURL(await new Promise(r => thumb.toBlob(r, 'image/jpeg', 0.8)));
      bmp.close && bmp.close();
      photos.push({ id, name: f.name, url, frame }); added++;
    } catch (_) {
      skipped.push(`${f.name} (${/heic|heif/i.test(f.name) ? '아이폰 HEIC 사진은 jpg로 바꿔서 넣어주세요' : '읽을 수 없는 사진'})`);
    }
  }
  changed();
  setMsg($('photoMsg'), `${added}장 넣었어요.` + (skipped.length ? ` (못 넣은 사진: ${skipped.join(', ')})` : ''), skipped.length ? 'err' : 'ok');
}

const drop = $('drop');
drop.onclick = () => $('fileInput').click();
$('fileInput').onchange = e => { addPhotos(e.target.files); e.target.value = ''; };
drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
drop.ondragleave = () => drop.classList.remove('over');
drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); addPhotos(e.dataTransfer.files); };

/* ---------------- 음악 ---------------- */
const SR = 44100;
$('btnMusic').onclick = () => $('musicInput').click();
$('musicInput').onchange = async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const buffer = await ac.decodeAudioData(await f.arrayBuffer());
    ac.close && ac.close();
    music = { name: f.name, buffer };
  } catch (_) { alert('이 음악 파일은 읽을 수 없어요. mp3 파일로 넣어주세요.'); }
  changed();
};
$('btnMusicDel').onclick = () => { music = null; changed(); };

// 저작권 걱정 없는 잔잔한 기본 배경음 (C - Am - F - G 화음 + 맑은 아르페지오) → [왼쪽, 오른쪽]
function builtinMusic(total) {
  const n = Math.ceil(total * SR);
  const chords = [[261.63, 329.63, 392.0], [220.0, 261.63, 329.63], [174.61, 220.0, 261.63], [196.0, 246.94, 293.66]];
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const c = chords[Math.floor(t / 4) % 4];
    const swell = 0.55 - 0.45 * Math.cos(2 * Math.PI * (t % 4) / 4);
    const pad = Math.sin(2 * Math.PI * c[0] * t) + Math.sin(2 * Math.PI * c[1] * t) + Math.sin(2 * Math.PI * c[2] * t);
    const arp = Math.sin(2 * Math.PI * 2 * c[Math.floor(t / 0.5) % 3] * t) * Math.exp(-4 * (t % 0.5));
    x[i] = 0.10 * swell * pad + 0.16 * arp;
  }
  // 약한 메아리
  const y = new Float32Array(n), d1 = Math.round(0.09 * SR), d2 = Math.round(0.18 * SR);
  for (let i = 0; i < n; i++) y[i] = 0.8 * x[i] + 0.25 * (x[i - d1] || 0) + 0.15 * (x[i - d2] || 0);
  return fadeAndNormalize([y, y.slice()], total, 1, 0.45);
}

// 직접 넣은 음악: 44.1kHz 스테레오로 바꾸고, 영상 길이에 맞춰 반복/자르기
async function userMusic(buffer, total) {
  const n = Math.ceil(total * SR);
  const off = new OfflineAudioContext(2, Math.ceil(buffer.duration * SR), SR);
  const src = off.createBufferSource(); src.buffer = buffer; src.connect(off.destination); src.start();
  const r = await off.startRendering();
  const L = r.getChannelData(0), R = r.getChannelData(1);
  const outL = new Float32Array(n), outR = new Float32Array(n);
  for (let i = 0; i < n; i++) { outL[i] = L[i % L.length] * 0.8; outR[i] = R[i % R.length] * 0.8; }
  return fadeAndNormalize([outL, outR], total, 0.8, 0);
}

function fadeAndNormalize(chs, total, fadeIn, peakTarget) {
  const n = chs[0].length;
  let peak = 0;
  if (peakTarget) for (const c of chs) for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(c[i]));
  const gain = peakTarget && peak ? peakTarget / peak : 1;
  const fi = fadeIn * SR, fo = 2 * SR;
  for (const c of chs) for (let i = 0; i < n; i++) {
    let g = gain;
    if (i < fi) g *= i / fi;
    if (i > n - fo) g *= Math.max(0, (n - i) / fo);
    c[i] *= g;
  }
  return chs;
}

/* ---------------- 한 장면 그리기 ---------------- */
function cleanText(s) { return String(s || '').replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, '').replace(/[ \t]+/g, ' ').trim(); }
function wrap(text, maxLen = 11, maxLines = 3) {
  const lines = [];
  for (const para of cleanText(text).split(/\r?\n/)) {
    let cur = '';
    for (const word of para.split(' ').filter(Boolean)) {
      if (!cur) cur = word;
      else if ((cur + ' ' + word).length <= maxLen) cur += ' ' + word;
      else { lines.push(cur); cur = word; }
      while (cur.length > maxLen + 3) { lines.push(cur.slice(0, maxLen)); cur = cur.slice(maxLen); }
    }
    if (cur) lines.push(cur);
  }
  return lines.slice(0, maxLines);
}
const ease = p => p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;

function drawPhoto(g, i, t) {
  const lt = Math.max(0, Math.min(PHOTO_SEC, t - i * STEP));
  const z = i % 2 === 0 ? 1 + 0.12 * lt / PHOTO_SEC : 1.12 - 0.12 * lt / PHOTO_SEC;
  g.drawImage(photos[i].frame, (W - W * z) / 2, (H - H * z) / 2, W * z, H * z);
}

function drawEnd(g) {
  g.fillStyle = '#221E1A'; g.fillRect(0, 0, W, H);
  g.textAlign = 'center'; g.textBaseline = 'top';
  const line = (txt, size, bold, color, y) => { if (!txt) return; g.font = `${bold ? 700 : 400} ${size}px ${FONT}`; g.fillStyle = color; g.fillText(txt, W / 2, y); };
  line(cleanText(studio.name), 110, true, '#fff', H * 0.36);
  line(cleanText(studio.tagline), 52, false, '#E8D9C0', H * 0.36 + 150);
  if (cleanText(studio.phone)) line('예약 · 문의  ' + cleanText(studio.phone), 62, true, '#fff', H * 0.56);
  line(cleanText(studio.address), 44, false, '#ccc', H * 0.56 + 100);
}

// 장면 하나 = 사진 or 마지막 화면
function drawScene(g, k, t, n) { if (k < n) drawPhoto(g, k, t); else drawEnd(g); }

function drawFrame(g, t, n, titleLines) {
  g.save();
  const k = Math.min(n, Math.floor(t / STEP));      // 지금 주인공 장면
  const tin = t - k * STEP;                         // 그 장면이 시작된 뒤 지난 시간
  if (k > 0 && tin < FADE_SEC) {
    // 앞 장면 → 이번 장면으로 넘어가는 중
    const p = ease(tin / FADE_SEC);
    const tr = k === n ? 'fade' : TRANSITIONS[(k - 1) % TRANSITIONS.length];
    if (tr === 'slideLeft' || tr === 'slideUp') {
      const dx = tr === 'slideLeft' ? W : 0, dy = tr === 'slideUp' ? H : 0;
      g.save(); g.translate(-dx * p, -dy * p); drawScene(g, k - 1, t, n); g.restore();
      g.save(); g.translate(dx * (1 - p), dy * (1 - p)); drawScene(g, k, t, n); g.restore();
    } else if (tr === 'circle') {
      drawScene(g, k - 1, t, n);
      g.save(); g.beginPath(); g.arc(W / 2, H / 2, p * Math.hypot(W, H) / 2, 0, Math.PI * 2); g.clip(); drawScene(g, k, t, n); g.restore();
    } else {
      drawScene(g, k - 1, t, n);
      g.globalAlpha = p; drawScene(g, k, t, n); g.globalAlpha = 1;
    }
  } else drawScene(g, k, t, n);

  // 제목 (처음 몇 초)
  const a = t < 0.3 ? 0 : t < 0.8 ? (t - 0.3) / 0.5 : t < 4.2 ? 1 : t < 4.7 ? (4.7 - t) / 0.5 : 0;
  if (a > 0) {
    g.globalAlpha = a;
    g.font = `700 84px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'top';
    titleLines.forEach((ln, i) => {
      const y = H * 0.12 + i * 130, w = g.measureText(ln).width;
      g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(W / 2 - w / 2 - 26, y - 22, w + 52, 84 + 44);
      g.fillStyle = '#fff'; g.fillText(ln, W / 2, y);
    });
    g.globalAlpha = 1;
  }
  // 아래쪽 사진관 이름 (마지막 화면 전까지)
  if (t < n * STEP && cleanText(studio.name)) {
    g.font = `700 40px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'top';
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillText(cleanText(studio.name), W / 2 + 3, H - 167);
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillText(cleanText(studio.name), W / 2, H - 170);
  }
  g.restore();
}

/* ---------------- 영상 만들기 ---------------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));
function progress(msg, pct) {
  $('status').hidden = false;
  $('statusMsg').textContent = msg;
  $('barWrap').hidden = pct == null;
  if (pct != null) $('bar').style.width = pct + '%';
}

async function pickVideoCodec() {
  if (!window.VideoEncoder || !window.Mp4Muxer) return null;
  for (const codec of ['avc1.640028', 'avc1.4d0028', 'avc1.42e028']) {
    const cfg = { codec, width: W, height: H, bitrate: 8_000_000, framerate: FPS };
    try { if ((await VideoEncoder.isConfigSupported(cfg)).supported) return cfg; } catch (_) {}
  }
  return null;
}
async function aacSupported() {
  if (!window.AudioEncoder) return false;
  try { return (await AudioEncoder.isConfigSupported({ codec: 'mp4a.40.2', sampleRate: SR, numberOfChannels: 2, bitrate: 160000 })).supported; } catch (_) { return false; }
}

// 빠른 방법: WebCodecs로 한 장면씩 압축해서 mp4로 묶기 (크롬·엣지·사파리)
async function encodeWebCodecs(vcfg, total, audio, titleLines) {
  const n = photos.length;
  const muxer = new Mp4Muxer.Muxer({
    target: new Mp4Muxer.ArrayBufferTarget(),
    video: { codec: 'avc', width: W, height: H, frameRate: FPS },
    audio: audio ? { codec: 'aac', numberOfChannels: 2, sampleRate: SR } : undefined,
    fastStart: 'in-memory',
  });
  let fail = null;
  const venc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: e => { fail = e; } });
  venc.configure(vcfg);
  const canvas = $('canvas'), g = canvas.getContext('2d');
  const frames = Math.round(total * FPS);
  for (let f = 0; f < frames; f++) {
    if (fail) throw fail;
    drawFrame(g, f / FPS, n, titleLines);
    const vf = new VideoFrame(canvas, { timestamp: Math.round(f * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
    venc.encode(vf, { keyFrame: f % (FPS * 2) === 0 });
    vf.close();
    while (venc.encodeQueueSize > 8) await sleep(5);
    if (f % 10 === 0) { progress(`영상을 만드는 중이에요… ${Math.round(f / frames * 90)}%`, Math.round(f / frames * 90)); await sleep(0); }
  }
  await venc.flush(); venc.close();

  if (audio) {
    progress('소리를 넣는 중이에요…', 92);
    const aenc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: e => { fail = e; } });
    aenc.configure({ codec: 'mp4a.40.2', sampleRate: SR, numberOfChannels: 2, bitrate: 160000 });
    const [L, R] = audio, CH = 1024 * 4;
    for (let i = 0; i < L.length; i += CH) {
      const len = Math.min(CH, L.length - i);
      const data = new Float32Array(len * 2);
      data.set(L.subarray(i, i + len), 0); data.set(R.subarray(i, i + len), len);
      const ad = new AudioData({ format: 'f32-planar', sampleRate: SR, numberOfFrames: len, numberOfChannels: 2, timestamp: Math.round(i * 1e6 / SR), data });
      aenc.encode(ad); ad.close();
    }
    await aenc.flush(); aenc.close();
    if (fail) throw fail;
  }
  muxer.finalize();
  return new Blob([muxer.target.buffer], { type: 'video/mp4' });
}

// 예비 방법: 실제 시간만큼 재생하며 녹화 (WebCodecs가 없는 브라우저)
async function encodeRecorder(total, audio, titleLines) {
  const n = photos.length;
  const canvas = $('canvas'), g = canvas.getContext('2d');
  const types = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'];
  const mime = types.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
  if (!mime) throw new Error('이 브라우저는 영상 만들기를 지원하지 않아요. 크롬(Chrome)으로 열어주세요.');
  drawFrame(g, 0, n, titleLines);
  const stream = canvas.captureStream(FPS);
  const ac = new AudioContext({ sampleRate: SR });
  const dest = ac.createMediaStreamDestination();
  const buf = ac.createBuffer(2, audio[0].length, SR);
  buf.copyToChannel(audio[0], 0); buf.copyToChannel(audio[1], 1);
  const src = ac.createBufferSource(); src.buffer = buf; src.connect(dest);
  dest.stream.getAudioTracks().forEach(tr => stream.addTrack(tr));
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
  const chunks = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const stopped = new Promise(r => rec.onstop = r);
  rec.start(500); src.start();
  const t0 = performance.now();
  await new Promise(resolve => {
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      if (t >= total) return resolve();
      drawFrame(g, t, n, titleLines);
      progress(`영상을 녹화하는 중이에요… ${Math.round(t / total * 100)}% (화면을 끄지 마세요)`, Math.round(t / total * 100));
      requestAnimationFrame(tick);
    };
    tick();
  });
  rec.stop(); await stopped; ac.close();
  return new Blob(chunks, { type: mime.split(';')[0] });
}

$('btnMake').onclick = async () => {
  if (busy) return;
  readPost();
  if (!photos.length) return progress('⚠️ 먼저 1번에서 사진을 넣어주세요.');
  if (!post || !post.title) return progress('⚠️ 먼저 2번에서 주제를 골라주세요.');
  busy = true; render();
  try {
    progress('준비하는 중이에요…', 0);
    await document.fonts.load(`700 84px "Noto Sans KR"`).catch(() => {});
    await document.fonts.load(`400 44px "Noto Sans KR"`).catch(() => {});
    const total = photos.length * STEP + END_SEC;
    const titleLines = wrap(post.title);
    const audio = music ? await userMusic(music.buffer, total) : builtinMusic(total);
    const vcfg = await pickVideoCodec();
    const blob = vcfg ? await encodeWebCodecs(vcfg, total, (await aacSupported()) ? audio : null, titleLines)
      : await encodeRecorder(total, audio, titleLines);
    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
    if (result) URL.revokeObjectURL(result.url);
    result = { blob, url: URL.createObjectURL(blob), file: `모델쇼츠_${stamp}.${ext}`, seconds: Math.round(total) };
    showResult(ext === 'webm');
    progress('영상을 만들었어요! 🎉 아래에서 저장하거나 보내세요.');
  } catch (e) {
    console.error(e);
    progress('⚠️ 영상을 만들다가 문제가 생겼어요. 크롬(Chrome)으로 열어서 다시 해보세요. (' + (e.message || e) + ')');
  } finally { busy = false; render(); }
};

/* ---------------- 저장 · 보내기 ---------------- */
const captionText = () => [post.description, post.hashtags.map(t => '#' + t).join(' ')].filter(Boolean).join('\n\n');
function showResult(isWebm) {
  $('preview').hidden = false;
  $('video').src = result.url;
  $('btnSave').href = result.url;
  $('btnSave').download = result.file;
  $('videoInfo').textContent = `${result.file} · ${result.seconds}초`;
  const file = new File([result.blob], result.file, { type: result.blob.type });
  $('btnShare').hidden = !(navigator.canShare && navigator.canShare({ files: [file] }));
  $('howto').innerHTML = (isWebm ? '<b style="color:#b45309">이 브라우저에서는 webm 영상으로 만들어졌어요. 인스타그램에 올리려면 크롬에서 다시 만들어주세요.</b><br>' : '') +
    (!$('btnShare').hidden ? '휴대폰: <b>[📤 보내기]</b> → 인스타그램 또는 유튜브 앱을 고르세요. 설명은 [📋 복사] 후 붙여넣기!'
      : 'PC: <b>[💾 저장하기]</b> → 유튜브 스튜디오나 인스타그램에서 저장한 영상을 올리고, 설명은 [📋 복사] 후 붙여넣기!');
}
$('btnShare').onclick = async () => {
  readPost();
  try { await navigator.clipboard.writeText(captionText()); } catch (_) {}
  const file = new File([result.blob], result.file, { type: result.blob.type });
  try { await navigator.share({ files: [file], title: post.title, text: captionText() }); }
  catch (e) { if (e.name !== 'AbortError') alert('보내기가 안 돼요. [💾 저장하기]로 저장한 뒤 앱에서 올려주세요.'); }
};
$('btnCopy').onclick = async () => {
  readPost();
  try { await navigator.clipboard.writeText(captionText()); $('btnCopy').textContent = '✅ 복사했어요!'; }
  catch (_) { prompt('아래 글을 길게 눌러 복사하세요', captionText()); }
  setTimeout(() => $('btnCopy').textContent = '📋 설명+해시태그 복사', 2000);
};

/* ---------------- 설정 ---------------- */
const SKEYS = ['name', 'region', 'tagline', 'phone', 'address'];
$('btnSettings').onclick = () => {
  const box = $('settings');
  box.hidden = !box.hidden;
  if (!box.hidden) { SKEYS.forEach(k => $('s_' + k).value = studio[k] || ''); box.scrollIntoView({ behavior: 'smooth' }); }
};
$('btnSaveSettings').onclick = () => {
  SKEYS.forEach(k => studio[k] = $('s_' + k).value.trim());
  saveStudio(studio);
  if (post) { post = buildPost(post.topic, studio); fillPost(); }
  changed();
  setMsg($('settingsMsg'), '저장했어요 ✅', 'ok');
};

render();
