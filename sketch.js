let rotationX = 0;
let rotationY = 0;
let frozenTs = []; // 고정된 T들을 저장할 배열
let currentScale = 1.0; // 현재 스케일
const MAX_FROZEN_OBJECTS = 100; // 성능을 위한 최대 고정 객체 수
let oracleFont; // ABCOracle 폰트
let timesFont; // A 전용(명조/Times 계열) 폰트
let currentLetter = 'T'; // 현재 선택된 글자
let letterGeometry = null; // 폰트 아웃라인 기반 기하구조
let letterGeometryCache = {}; // 글자별 기하 캐시
let uiIsInteracting = false; // UI 상호작용 여부
let renderModeSelect; // 렌더링 모드 선택 드롭다운
let renderMode = 'solid'; // solid / wireframe
let switchContainer; // 렌더링 모드 스위치 컨테이너
let requestTransparentExport = false; // PNG export without background request flag
let canvas; // p5 canvas handle (to scope drag start to canvas)
let chromeShader; // 크롬 효과 셰이더
let svgImage; // SVG 이미지 (111.svg)
let svgImage2; // SVG 이미지 (222.svg)
// Receipt print (POS) settings
const RECEIPT_PAPER_WIDTH_MM = 72; // user printer roll width
const RECEIPT_PAPER_HEIGHT_MM = 210; // matches printer setting 72x210
const RECEIPT_RENDER_WIDTH_PX = 576; // ~80mm @ 203dpi
const RECEIPT_RENDER_HEIGHT_PX = 1600; // extra height to avoid clipping
// Printed object size multiplier (bigger on paper)
// Tuning: overall printed content scale (1.0 = fitted size)
// If print preview looks too large/small, adjust this first.
const RECEIPT_CONTENT_SCALE = 1.3;
// Tuning: top margin to move content down on the page.
// If print preview looks shifted up, increase this.
const RECEIPT_PRINT_MARGIN_TOP_MM = 45;
// Tuning: horizontal offset (negative = left, positive = right)
// Note: Use layout positioning (not CSS transforms) to avoid print-time shrink-to-fit in some drivers.
const RECEIPT_PRINT_OFFSET_X_MM = 0;
let isReceiptPrinting = false;
let receiptPrintRestoreState = null;
let isDragging = false; // 드래그 중인지 여부
let autoRotateSpeed = 0.005; // 자동 회전 속도
let hasFrozenOnce = false; // 첫 번째 드래그-드랍 이후 true
let showLiveT = true; // 처음엔 보이고, 이후엔 드래그 중에만 보이게
let currentFontMode = 'helvetica'; // 현재 폰트 모드: 'helvetica' 또는 'bodoni'
const LETTER_SIZE = 660; // 기본 글자 크기 (기존 대비 3배)
let letterDepth = 100; // 글자 두께 (슬라이더로 조절 가능)
const CURVE_DETAIL = 10; // 곡선 샘플링 세밀도 (낮춰서 정점 수 축소)

function resetDefaultPerspectiveAndCamera() {
  // Ensure that any custom projection/view (e.g. from receipt print) is fully reset.
  // p5 WebGL projection can persist across frames, so we restore defaults explicitly.
  const fov = PI / 3;
  const aspect = width / height;
  const camZ = (height / 2) / Math.tan(fov / 2);
  perspective(fov, aspect, camZ / 10, camZ * 10);
  camera(0, 0, camZ, 0, 0, 0, 0, 1, 0);
}

function preload() {
  // 폰트 로드 (index.html 기준 경로)
  oracleFont = loadFont('libraries/ABCOracle-Bold-Trial.otf');
  
  // SVG 이미지 로드
  svgImage = loadImage('libraries/111.svg');
  svgImage2 = loadImage('libraries/222.svg');

  // A 전용 세리프(명조) 폰트
  // 사용자가 제공한 파일: libraries/BodoniModa-VariableFont_opsz,wght.ttf
  timesFont = loadFont(
    'libraries/BodoniModa-VariableFont_opsz,wght.ttf',
    () => {},
    () => { timesFont = null; }
  );
}

function getFontForLetter(letter) {
  // currentFontMode에 따라 폰트 반환
  if (currentFontMode === 'bodoni' && timesFont) {
    return timesFont;
  }
  return oracleFont;
}

function getFontIdForLetter(letter) {
  // currentFontMode에 따라 폰트 ID 반환
  if (currentFontMode === 'bodoni') {
    return 'bodoni';
  }
  return 'helvetica';
}

function setup() {
  canvas = createCanvas(windowWidth, windowHeight, WEBGL);
  // 레티나 환경에서 픽셀 수가 2~4배로 늘어 렌더링이 크게 느려질 수 있어 1로 고정
  pixelDensity(1);
  setAttributes('alpha', true);
  textureMode(IMAGE);
  textureWrap(REPEAT, REPEAT);
  textFont(oracleFont);
  textAlign(CENTER, CENTER);
  letterGeometry = buildLetterGeometry('T', LETTER_SIZE, letterDepth, CURVE_DETAIL, getFontForLetter('T'), getFontIdForLetter('T'));
  letterGeometryCache['T|oracle'] = letterGeometry;

  // 크롬 셰이더 생성
  chromeShader = createChromeShader();

  resetDefaultPerspectiveAndCamera();

  // 렌더링 모드 스위치 (Solid / Wireframe)
  switchContainer = createDiv('');
  switchContainer.position(30, 625);
  switchContainer.class('toggle-switch');
  switchContainer.style('z-index', '1000');
  
  let solidOption = createDiv('Solid');
  solidOption.parent(switchContainer);
  solidOption.class('toggle-option left active');
  solidOption.id('solid-option');
  
  let wireframeOption = createDiv('Wireframe');
  wireframeOption.parent(switchContainer);
  wireframeOption.class('toggle-option right inactive');
  wireframeOption.id('wireframe-option');
  
  // Solid 클릭
  solidOption.mousePressed(() => {
    uiIsInteracting = true;
    if(renderMode !== 'solid') {
      renderMode = 'solid';
      solidOption.removeClass('inactive');
      solidOption.addClass('active');
      wireframeOption.removeClass('active');
      wireframeOption.addClass('inactive');
    }
  });
  solidOption.mouseReleased(() => { uiIsInteracting = false; });
  
  // Wireframe 클릭
  wireframeOption.mousePressed(() => {
    uiIsInteracting = true;
    if(renderMode !== 'wireframe') {
      renderMode = 'wireframe';
      wireframeOption.removeClass('inactive');
      wireframeOption.addClass('active');
      solidOption.removeClass('active');
      solidOption.addClass('inactive');
    }
  });
  wireframeOption.mouseReleased(() => { uiIsInteracting = false; });

  // 폰트 선택 스위치 (Helvetica / Bodoni)
  let fontSwitchContainer = createDiv('');
  fontSwitchContainer.position(30, 670);
  fontSwitchContainer.class('toggle-switch');
  fontSwitchContainer.style('z-index', '1000');
  
  let helveticaOption = createDiv('Helvetica');
  helveticaOption.parent(fontSwitchContainer);
  helveticaOption.class('toggle-option left active');
  helveticaOption.id('helvetica-option');
  
  let bodoniOption = createDiv('Bodoni');
  bodoniOption.parent(fontSwitchContainer);
  bodoniOption.class('toggle-option right inactive');
  bodoniOption.id('bodoni-option');
  
  // Helvetica 클릭
  helveticaOption.mousePressed(() => {
    uiIsInteracting = true;
    if(currentFontMode !== 'helvetica') {
      currentFontMode = 'helvetica';
      // 현재 글자 geometry 재생성
      frozenTs = [];
      hasFrozenOnce = false;
      showLiveT = true;
      let fontId = getFontIdForLetter(currentLetter);
      let cacheKey = `${currentLetter}|${fontId}`;
      if(letterGeometryCache[cacheKey]) {
        letterGeometry = letterGeometryCache[cacheKey];
      } else {
        letterGeometry = buildLetterGeometry(currentLetter, LETTER_SIZE, letterDepth, CURVE_DETAIL, getFontForLetter(currentLetter), fontId);
        letterGeometryCache[cacheKey] = letterGeometry;
      }
    }
    helveticaOption.removeClass('inactive');
    helveticaOption.addClass('active');
    bodoniOption.removeClass('active');
    bodoniOption.addClass('inactive');
  });
  helveticaOption.mouseReleased(() => { uiIsInteracting = false; });
  
  // Bodoni 클릭
  bodoniOption.mousePressed(() => {
    uiIsInteracting = true;
    if(currentFontMode !== 'bodoni') {
      currentFontMode = 'bodoni';
      // 현재 글자 geometry 재생성
      frozenTs = [];
      hasFrozenOnce = false;
      showLiveT = true;
      let fontId = getFontIdForLetter(currentLetter);
      let cacheKey = `${currentLetter}|${fontId}`;
      if(letterGeometryCache[cacheKey]) {
        letterGeometry = letterGeometryCache[cacheKey];
      } else {
        letterGeometry = buildLetterGeometry(currentLetter, LETTER_SIZE, letterDepth, CURVE_DETAIL, getFontForLetter(currentLetter), fontId);
        letterGeometryCache[cacheKey] = letterGeometry;
      }
    }
    bodoniOption.removeClass('inactive');
    bodoniOption.addClass('active');
    helveticaOption.removeClass('active');
    helveticaOption.addClass('inactive');
  });
  bodoniOption.mouseReleased(() => { uiIsInteracting = false; });

  // 3D Depth 슬라이더
  let depthLabel = createDiv('3D Depth');
  depthLabel.position(30, 715);
  depthLabel.style('font-family', "'Courier New', monospace");
  depthLabel.style('font-size', '10.5pt');
  depthLabel.style('color', '#000');
  depthLabel.style('z-index', '1000');

  let depthSlider = createSlider(10, 200, 100, 1);
  depthSlider.position(30, 738);
  depthSlider.style('width', '300px');
  depthSlider.style('z-index', '1000');
  depthSlider.style('cursor', 'pointer');

  depthSlider.input(() => {
    uiIsInteracting = true;
    letterDepth = depthSlider.value();
    depthLabel.html('3D Depth: ' + letterDepth);
    // 캐시 초기화 (깊이 변경 시 모든 캐시 무효)
    letterGeometryCache = {};
    let fontId = getFontIdForLetter(currentLetter);
    letterGeometry = buildLetterGeometry(currentLetter, LETTER_SIZE, letterDepth, CURVE_DETAIL, getFontForLetter(currentLetter), fontId);
    letterGeometryCache[`${currentLetter}|${fontId}`] = letterGeometry;
  });
  depthSlider.mouseReleased(() => { uiIsInteracting = false; });

  // 왼쪽 상단 설명 텍스트
  let descriptionText = createDiv('This work explores axial accumulation as a visual method, asking what kind of typeface might emerge when letterforms are layered and reassembled, shifting our perspective on what a font can become in future.');
  descriptionText.position(30, 30);
  descriptionText.style('font-family', "'Courier New', monospace");
  descriptionText.style('font-size', '10.5pt');
  descriptionText.style('color', '#000');
  descriptionText.style('max-width', '300px');
  descriptionText.style('line-height', '1.4');
  descriptionText.style('z-index', '1000');


  // 설명과 How to use 사이 점선
  let dividerLine1 = createDiv('');
  dividerLine1.position(30, 190);
  dividerLine1.style('width', '300px');
  dividerLine1.style('border-top', '2px dotted #000');
  dividerLine1.style('z-index', '1000');



    let dividerLine2 = createDiv('');
  dividerLine2.position(30, 360);
  dividerLine2.style('width', '300px');
  dividerLine2.style('border-top', '2px dotted #000');
  dividerLine2.style('z-index', '1000');

      let dividerLine3 = createDiv('');
  dividerLine3.position(30, 785);
  dividerLine3.style('width', '300px');
  dividerLine3.style('border-top', '2px dotted #000');
  dividerLine3.style('z-index', '1000');
  // Print 버튼
  let printButton = createButton('Print');
  printButton.position(30, 820);
  printButton.style('width', '300px');
  printButton.style('padding', '6px 45px');
  printButton.style('background-color', '#000');
  printButton.style('color', '#fff');
  printButton.style('border', '2px solid #000');
  printButton.style('border-radius', '50px');
  printButton.style('font-family', "'Courier New', monospace");
  printButton.style('font-size', '14px');
  printButton.style('font-weight', 'bold');
  printButton.style('cursor', 'pointer');
  printButton.style('z-index', '1000');
  printButton.mousePressed(() => {
    uiIsInteracting = true;
    printReceiptToPosPrinter();
  });
  printButton.mouseReleased(() => { uiIsInteracting = false; });

  // Print 버튼 아래 저작권 문구 (How to use와 동일한 스타일)
  let copyrightText = createDiv('All right reserved Dongjun Choi @COPYRIGHT 2026');
  copyrightText.position(30, 880);
  copyrightText.style('font-family', "'Courier New', monospace");
  copyrightText.style('font-size', '10.5pt');
  copyrightText.style('color', '#000');
  copyrightText.style('max-width', '300px');
  copyrightText.style('line-height', '1.4');
  copyrightText.style('z-index', '1000');

  // A-Z 버튼들
  let letterButtons = [];
  let alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  let startX = 30;
  let startY = 390;
  let buttonSpacing = 40;
  let buttonsPerRow = 9;
  
  alphabet.forEach((letter, index) => {
    let row = Math.floor(index / buttonsPerRow);
    let col = index % buttonsPerRow;
    let xPos = startX + col * 34;
    let yPos = startY + row * 34;
    
    let btn = createDiv(letter);
    btn.position(xPos, yPos);
    btn.style('display', 'inline-block');
    btn.style('padding', '6px 10px');
    btn.style('border', '1.2px solid #000');
    btn.style('border-radius', '50px');
    btn.style('background-color', '#fff');
    btn.style('color', '#000');
    btn.style('font-family', "'Courier New', monospace");
    btn.style('font-size', '8pt');
    btn.style('font-weight', 'bold');
    btn.style('cursor', 'pointer');
    btn.style('z-index', '1000');
    
    btn.mousePressed(() => {
      uiIsInteracting = true;
      
      // 글자 변경 시 리셋
      frozenTs = [];
      hasFrozenOnce = false;
      showLiveT = true;
      
      currentLetter = letter;
      let fontId = getFontIdForLetter(letter);
      let cacheKey = `${letter}|${fontId}`;
      if(letterGeometryCache[cacheKey]) {
        letterGeometry = letterGeometryCache[cacheKey];
      } else {
        letterGeometry = buildLetterGeometry(letter, LETTER_SIZE, letterDepth, CURVE_DETAIL, getFontForLetter(letter), fontId);
        letterGeometryCache[cacheKey] = letterGeometry;
      }
      
      // 모든 버튼 초기화
      letterButtons.forEach(b => {
        b.style('background-color', '#fff');
        b.style('color', '#000');
      });
      
      // 클릭된 버튼만 활성화
      btn.style('background-color', '#000');
      btn.style('color', '#fff');
    });
    
    btn.mouseReleased(() => { uiIsInteracting = false; });
    
    letterButtons.push(btn);
  });

  // a-z 버튼들 (소문자)
  let lowercaseAlphabet = 'abcdefghijklmnopqrstuvwxyz'.split('');
  let lowercaseStartY = 505; // 대문자 버튼 아래에 띄워서 배치
  
  lowercaseAlphabet.forEach((letter, index) => {
    let row = Math.floor(index / buttonsPerRow);
    let col = index % buttonsPerRow;
    let xPos = startX + col * 34;
    let yPos = lowercaseStartY + row * 34;
    
    let btn = createDiv(letter);
    btn.position(xPos, yPos);
    btn.style('display', 'inline-block');
    btn.style('padding', '5px 10px');
    btn.style('border', '1.2px solid #000');
    btn.style('border-radius', '50px');
    btn.style('background-color', '#fff');
    btn.style('color', '#000');
    btn.style('font-family', "'Courier New', monospace");
    btn.style('font-size', '8pt');
    btn.style('font-weight', 'bold');
    btn.style('cursor', 'pointer');
    btn.style('z-index', '1000');
    
    btn.mousePressed(() => {
      uiIsInteracting = true;
      
      // 글자 변경 시 리셋
      frozenTs = [];
      hasFrozenOnce = false;
      showLiveT = true;
      
      currentLetter = letter; // 소문자 그대로 사용
      let fontId = getFontIdForLetter(letter);
      let cacheKey = `${letter}|${fontId}`;
      if(letterGeometryCache[cacheKey]) {
        letterGeometry = letterGeometryCache[cacheKey];
      } else {
        letterGeometry = buildLetterGeometry(letter, LETTER_SIZE, letterDepth, CURVE_DETAIL, getFontForLetter(letter), fontId);
        letterGeometryCache[cacheKey] = letterGeometry;
      }
      
      // 모든 버튼 초기화
      letterButtons.forEach(b => {
        b.style('background-color', '#fff');
        b.style('color', '#000');
      });
      
      // 클릭된 버튼만 활성화
      btn.style('background-color', '#000');
      btn.style('color', '#fff');
    });
    
    btn.mouseReleased(() => { uiIsInteracting = false; });
    
    letterButtons.push(btn);
  });

  // 사용 방법 텍스트
  let instructionText = createDiv('How to use<br>1. Select a letter below.<br>2. Drag and drop it to build up the composition. (Repeat as desired.)<br>3. Press the "Print" button.<br>4. Check the printer behind you.');
  instructionText.position(30, 218);
  instructionText.style('font-family', "'Courier New', monospace");
  instructionText.style('font-size', '10.5pt');
  instructionText.style('color', '#000');
  instructionText.style('max-width', '300px');
  instructionText.style('line-height', '1.4');
  instructionText.style('z-index', '1000');

  // 드래그 시작은 캔버스 위에서만 인정 (UI 클릭으로 회전되는 문제 방지)
  canvas.mousePressed(() => {
    if (uiIsInteracting) {
      return;
    }
    const halfWidth = width / 2;
    if (mouseX > halfWidth) {
      isDragging = true;
      showLiveT = true;
    }
  });
}

function windowResized() {
  if (isReceiptPrinting) {
    return;
  }
  resizeCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  resetDefaultPerspectiveAndCamera();
  if(switchContainer) {
    switchContainer.position(20, windowHeight - 60);
  }
}

function draw() {
  // Receipt/POS print: render ONLY accumulated 3D stack on transparent background
  if (isReceiptPrinting) {
    drawReceiptOnlyFrame();
    return;
  }

  // background: white for normal, transparent for PNG export
  if (requestTransparentExport) {
    clear(); // fully transparent
  } else {
    background(255);
  }
  
  // 크롬 셰이더는 자체 조명 계산을 하므로 p5.js 조명 불필요
  // Wireframe 모드에서만 기본 조명 사용
  if (renderMode === 'wireframe') {
    noLights();
  }
  
  let halfWidth = width / 2 +3;
  
  // 오른쪽 영역: SVG 이미지 크기 계산
  let imgWidth2 = (svgImage.width / svgImage.height) * height;
  
  // 왼쪽 영역: 222.svg 이미지 (맨 위에)
  push();
  // svgImage의 왼쪽 끝에서 15px 왼쪽에 배치
  let svgImageCenterX = width/2 - 20 - (imgWidth2 + 30)/2;
  let imgWidth = (svgImage2.width / svgImage2.height) * height;
  translate(svgImageCenterX - imgWidth2/2 - 15 - imgWidth/2, 0, 1);
  resetShader();
  imageMode(CENTER);
  image(svgImage2, 0, 0, imgWidth * 1.05, height * 1.05);
  pop();
  
  // 왼쪽 영역: 고정된 2D 텍스트 (드래그 불가)
  push();
  translate(svgImageCenterX - imgWidth2/2 - 15 - imgWidth/2, -LETTER_SIZE * 0.15 + 10, 2); // svgImage2 중앙에 배치, 맨 앞에
  // 2D 텍스트 표시
  resetShader(); // 셰이더 해제
  fill(0); // 검은색
  noStroke();
  textAlign(CENTER, CENTER);
  textSize(LETTER_SIZE * 0.85); // 크기 축소
  textFont(getFontForLetter(currentLetter));
  text(currentLetter, 0, 0);
  pop();
  
  // 오른쪽 영역: 배경 사각박스
  push();
  translate(width/2 - 20 - (imgWidth2 + 30)/2, 0, -1); // 오른쪽 정렬 + 20px 여백
  resetShader();
  fill('#EBEBEC');
  noStroke();
  rectMode(CENTER);
  rect(0, 0, imgWidth2 + 30, height - 30);
  pop();
  
  // 오른쪽 영역: SVG 이미지
  push();
  translate(width/2 - 20 - (imgWidth2 + 30)/2, 0, 0); // 회색박스 중앙에 정렬
  resetShader();
  imageMode(CENTER);
  image(svgImage, 0, 0, imgWidth2, height);
  pop();
  
  // 오른쪽 영역: 인터랙티브 영역
  push();
  translate(width/2 - 180 - (imgWidth2 + 30)/2, 0, 250); // 회색박스 중앙에 정렬
  scale(0.6); // 3D 오브젝트 크기 60%로 축소
  
  // 마우스 드래그로 회전 제어 (캔버스에서 드래그 시작한 경우에만)
  if (isDragging && mouseIsPressed && !uiIsInteracting) {
    rotationX += (mouseY - pmouseY) * 0.01;
    rotationY += (mouseX - pmouseX) * 0.01;
  } else if (!isDragging && !hasFrozenOnce && showLiveT) {
    // 첫 번째(초기) 상태에서만 자동 회전 (y축)
    rotationY += autoRotateSpeed;
  }
  
  // 고정된 T들 그리기
  for(let frozenT of frozenTs) {
    push();
    scale(frozenT.scale); // 고정된 T의 스케일 적용
    rotateX(frozenT.rotX);
    rotateY(frozenT.rotY);

    drawFrozenFontT(frozenT);
    pop();
  }
  
  // 현재 움직이는 T 그리기 (처음 1회는 항상, 이후엔 드래그 중에만)
  if (showLiveT) {
    push();
    scale(currentScale); // 현재 스케일 적용
    rotateX(rotationX);
    rotateY(rotationY);
    drawT();
    pop();
  }
  
  pop(); // 오른쪽 영역 종료

  // If export was requested, save current frame as a PNG with transparent background
  if (requestTransparentExport) {
    const now = new Date();
    const ts = `${now.getFullYear()}-${('0'+(now.getMonth()+1)).slice(-2)}-${('0'+now.getDate()).slice(-2)}_${('0'+now.getHours()).slice(-2)}-${('0'+now.getMinutes()).slice(-2)}-${('0'+now.getSeconds()).slice(-2)}`;
    saveCanvas(`png-expert-${currentLetter}-${ts}`, 'png');
    requestTransparentExport = false;
  }
}

function drawReceiptOnlyFrame() {
  // Thermal printer drivers and some browsers behave poorly with transparent pages.
  // Use an explicit white background for print stability.
  background(255);
  resetShader();

  // Make printed perspective match the on-screen view more closely.
  // When we resize the canvas for receipt capture, p5's default camera distance changes
  // (it's derived from canvas height), which can make the 3D look "turned".
  const fov = PI / 3; // p5 default (~60deg)
  const aspect = width / height;
  perspective(fov, aspect, 0.1, 20000);
  const baseH = (receiptPrintRestoreState && typeof receiptPrintRestoreState.height === 'number')
    ? receiptPrintRestoreState.height
    : height;
  const camZ = (baseH / 2) / Math.tan(fov / 2);
  camera(0, 0, camZ, 0, 0, 0, 0, 1, 0);

  // Match current rendering mode (solid uses chrome shader inside renderGeometry)
  if (renderMode === 'wireframe') {
    noLights();
  }

  const fitScale = computeReceiptFitScale();
  const contentScale = (typeof RECEIPT_CONTENT_SCALE === 'number' && Number.isFinite(RECEIPT_CONTENT_SCALE) && RECEIPT_CONTENT_SCALE > 0)
    ? RECEIPT_CONTENT_SCALE
    : 1.0;

  push();
  // Keep centered; forward translation can enlarge projection and cause clipping.
  translate(0, 0, 0);
  scale(fitScale * contentScale);

  // Print only accumulated (frozen) objects
  for (let frozenT of frozenTs) {
    push();
    scale(frozenT.scale);
    rotateX(frozenT.rotX);
    rotateY(frozenT.rotY);
    drawFrozenFontT(frozenT);
    pop();
  }
  pop();
}

function computeReceiptFitScale() {
  if (!frozenTs || frozenTs.length === 0) {
    return (Math.min(width, height) * 0.6) / LETTER_SIZE;
  }

  // Conservative radius-based fitting. Rotations can increase projected bounds,
  // so we apply a safety multiplier.
  const SAFETY = 1.35;
  const halfW = (width * 0.92) / 2;
  const halfH = (height * 0.92) / 2;

  let maxScaledRadius = 1;
  for (let frozenT of frozenTs) {
    const letterKey = frozenT.letter || currentLetter || 'T';
    const geometry = buildLetterGeometry(
      letterKey,
      LETTER_SIZE,
      letterDepth,
      CURVE_DETAIL,
      getFontForLetter(letterKey),
      getFontIdForLetter(letterKey)
    );
    if (!geometry) {
      continue;
    }

    const w = (typeof geometry.width === 'number' && geometry.width > 0) ? geometry.width : LETTER_SIZE;
    const h = (typeof geometry.height === 'number' && geometry.height > 0) ? geometry.height : LETTER_SIZE;
    const d = (typeof geometry.depth === 'number' && geometry.depth > 0) ? geometry.depth : letterDepth;
    const baseRadius = Math.hypot(w / 2, h / 2, d / 2);
    const objScale = (typeof frozenT.scale === 'number' && frozenT.scale > 0) ? frozenT.scale : 1;
    const scaledRadius = baseRadius * objScale;
    if (scaledRadius > maxScaledRadius) {
      maxScaledRadius = scaledRadius;
    }
  }

  const scaleW = halfW / (maxScaledRadius * SAFETY);
  const scaleH = halfH / (maxScaledRadius * SAFETY);
  const fit = Math.min(scaleW, scaleH);
  return Number.isFinite(fit) && fit > 0 ? fit : (Math.min(width, height) * 0.6) / LETTER_SIZE;
}

function printReceiptToPosPrinter() {
  if (isReceiptPrinting) {
    return;
  }
  if (!canvas || !canvas.elt) {
    return;
  }
  if (!frozenTs || frozenTs.length === 0) {
    alert('No accumulated 3D objects to print yet. Drag & drop to build up first.');
    return;
  }

  isReceiptPrinting = true;

  receiptPrintRestoreState = {
    width,
    height,
    wasLooping: (typeof isLooping === 'function') ? isLooping() : true,
    canvasOpacity: canvas.elt.style.opacity
  };

  // Avoid visible flicker while we resize/render
  canvas.elt.style.opacity = '0';

  if (receiptPrintRestoreState.wasLooping) {
    noLoop();
  }

  resizeCanvas(RECEIPT_RENDER_WIDTH_PX, RECEIPT_RENDER_HEIGHT_PX);
  pixelDensity(1);

  // Render one frame for receipt capture
  redraw();

  // Capture after the frame has actually rendered
  requestAnimationFrame(() => {
    let dataUrl = null;
    try {
      dataUrl = canvas.elt.toDataURL('image/png');
    } catch (err) {
      console.error('Failed to capture canvas for printing:', err);
    }

    restoreAfterReceiptPrint();

    if (dataUrl) {
      openReceiptPrintWindow(dataUrl, RECEIPT_PAPER_WIDTH_MM);
    } else {
      alert('Print capture failed. Try running this sketch from a local server (not file://) and retry.');
    }
  });
}

function restoreAfterReceiptPrint() {
  const restore = receiptPrintRestoreState;
  receiptPrintRestoreState = null;
  isReceiptPrinting = false;

  // Restore canvas size and visibility
  resizeCanvas(windowWidth, windowHeight);
  pixelDensity(1);

  // Reset projection + camera back to p5 defaults for normal rendering
  try {
    resetDefaultPerspectiveAndCamera();
  } catch (_) {
    try { camera(); } catch (_) {}
  }

  if (canvas && canvas.elt) {
    canvas.elt.style.opacity = (restore && typeof restore.canvasOpacity === 'string') ? restore.canvasOpacity : '1';
  }

  if (restore && restore.wasLooping) {
    loop();
  }
}

function openReceiptPrintWindow(pngDataUrl, paperWidthMm) {
  // Note: Browsers cannot force-select a specific printer (e.g., "Pos_receipt_printer").
  // We avoid popups by printing from a hidden iframe.
  const safeWidthMm = Number.isFinite(paperWidthMm) ? paperWidthMm : RECEIPT_PAPER_WIDTH_MM;
  const safeTopMm = (typeof RECEIPT_PRINT_MARGIN_TOP_MM === 'number' && Number.isFinite(RECEIPT_PRINT_MARGIN_TOP_MM))
    ? RECEIPT_PRINT_MARGIN_TOP_MM
    : 0;
  const safeHeightMm = (typeof RECEIPT_PAPER_HEIGHT_MM === 'number' && Number.isFinite(RECEIPT_PAPER_HEIGHT_MM) && RECEIPT_PAPER_HEIGHT_MM > 0)
    ? RECEIPT_PAPER_HEIGHT_MM
    : 210;
  const safeContentHeightMm = Math.max(1, safeHeightMm - safeTopMm);
  const safeOffsetMm = (typeof RECEIPT_PRINT_OFFSET_X_MM === 'number' && Number.isFinite(RECEIPT_PRINT_OFFSET_X_MM))
    ? RECEIPT_PRINT_OFFSET_X_MM
    : 0;
  const html = `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Receipt Print</title>
      <style>
        @page { size: ${safeWidthMm}mm ${safeHeightMm}mm; margin: 0; }
        * { box-sizing: border-box; }
        html, body {
          margin: 0;
          padding: 0;
          width: ${safeWidthMm}mm;
          height: ${safeHeightMm}mm;
          overflow: hidden;
          background: #fff;
        }
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        #wrap {
          width: ${safeWidthMm}mm;
          height: ${safeHeightMm}mm;
          margin: 0 auto;
          background: #fff;
          padding-top: ${safeTopMm}mm;
          position: relative;
          left: ${safeOffsetMm}mm;
          overflow: hidden;
        }
        img {
          display: block;
          width: 100%;
          height: auto;
          max-height: ${safeContentHeightMm}mm;
          background: #fff;
          margin: 0 auto;
        }
        @media print {
          html, body { background: #fff; }
        }
      </style>
    </head>
    <body>
      <div id="wrap">
        <img id="receipt" src="${pngDataUrl}" alt="receipt" />
      </div>
      <script>
        const img = document.getElementById('receipt');
        img.addEventListener('load', async () => {
          try {
            if (img.decode) {
              await img.decode();
            }
          } catch (_) {}
          // Give the browser a bit more time to layout before printing.
          setTimeout(() => {
            try { window.focus(); } catch (_) {}
            window.print();
          }, 250);
        });

        img.addEventListener('error', () => {
          try {
            document.body.innerHTML = '<div style="font-family:system-ui;margin:12px;">Image failed to load for printing.</div>';
          } catch (_) {}
        });

        window.addEventListener('afterprint', () => {
          try {
            // Ask the parent to remove this iframe after printing
            parent && parent.postMessage({ type: 'receipt-print:done' }, '*');
          } catch (_) {}
        });
      </script>
    </body>
  </html>`;

  // Remove any previous print frame
  const existing = document.getElementById('receipt-print-frame');
  if (existing && existing.parentNode) {
    existing.parentNode.removeChild(existing);
  }

  const frame = document.createElement('iframe');
  frame.id = 'receipt-print-frame';
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '1px';
  frame.style.height = '1px';
  frame.style.border = '0';
  frame.style.opacity = '0.01';
  frame.style.pointerEvents = 'none';
  frame.setAttribute('aria-hidden', 'true');

  // Cleanup message listener (one-shot)
  const onMessage = (e) => {
    if (!e || !e.data || e.data.type !== 'receipt-print:done') {
      return;
    }
    window.removeEventListener('message', onMessage);
    try {
      if (frame && frame.parentNode) {
        frame.parentNode.removeChild(frame);
      }
    } catch (_) {}
  };
  window.addEventListener('message', onMessage);

  document.body.appendChild(frame);
  try {
    // srcdoc is simplest and stays same-origin
    frame.srcdoc = html;
  } catch (err) {
    // Fallback for older browsers
    const doc = frame.contentWindow && frame.contentWindow.document;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
    }
  }
}

function mouseReleased() {
  const wasDragging = isDragging;
  // 드래그 종료는 항상 처리 (UI 위에서 놓아도 상태가 남지 않게)
  isDragging = false;

  if (uiIsInteracting) {
    uiIsInteracting = false;
    return;
  }
  // 오른쪽 영역에서만 마우스 릴리즈 시 고정
  let halfWidth = width / 2;
  if (mouseX <= halfWidth) {
    return; // 왼쪽 영역에서는 고정하지 않음
  }
  
  // 마우스를 뗄 때 현재 T의 상태를 저장 (모든 효과 포함)
  if (rotationX !== 0 || rotationY !== 0) { // 실제로 회전이 있었을 때만 저장
    // 성능을 위해 너무 많은 객체가 쌓이면 가장 오래된 것 제거
    if (frozenTs.length >= MAX_FROZEN_OBJECTS) {
      frozenTs.shift();
    }
    let currentT = {
      rotX: rotationX,
      rotY: rotationY,
      scale: currentScale,
      geometry: 'fontT',
      letter: currentLetter
    };
    frozenTs.push(currentT);
    
    // 새로운 T를 위해 회전값 리셋
    rotationX = 0;
    rotationY = 0;
  }
  
  // 첫 드래그-드랍 이후에는 기본 위치에 자동 생성되지 않게 숨김
  if (wasDragging) {
    hasFrozenOnce = true;
    showLiveT = false;
  }
}

function keyPressed() {
  if (key === 't' || key === 'T') { // T 키
    // 성능을 위해 너무 많은 객체가 쌓이면 가장 오래된 것 제거
    if (frozenTs.length >= MAX_FROZEN_OBJECTS) {
      frozenTs.shift();
    }
    // 현재 T의 상태를 저장 (모든 효과 포함)
    let currentT = {
      rotX: rotationX,
      rotY: rotationY,
      scale: currentScale,
      geometry: 'fontT',
      letter: currentLetter
    };
    frozenTs.push(currentT);
    
    // 새로운 T를 위해 회전값 리셋
    rotationX = 0;
    rotationY = 0;

    // 첫 자동 표시 이후엔 드래그할 때만 다시 보이게
    hasFrozenOnce = true;
    showLiveT = false;
  }
}

function drawT() {
  // 폰트 기반 T 렌더링
  drawFontT();
}

function drawDividedT(gridSizeX, gridSizeY, gridSizeZ) {
  // kept for compatibility but now draw a solid T
  drawSolidT();
}

function drawSolidT() {
  // neutral grayscale appearance, centered
  noStroke();
  fill(200);

  let strokeWidth = 20;
  let depth = 35;

  // stem: center at y = 20, height = 120 (from previous layout)
  let stemHeight = 120;
  push();
  translate(0, 20, 0);
  box(strokeWidth, stemHeight, depth);
  pop();

  // crossbar: center at y = -40, width = 100, height = strokeWidth
  let crossbarWidth = 100;
  push();
  translate(0, -40, 0);
  box(crossbarWidth, strokeWidth, depth);
  pop();
}

function drawFontT() {
  let geometry = buildLetterGeometry(
    currentLetter,
    LETTER_SIZE,
    letterDepth,
    CURVE_DETAIL,
    getFontForLetter(currentLetter),
    getFontIdForLetter(currentLetter)
  );
  if(!geometry) {
    return;
  }
  letterGeometry = geometry;
  renderGeometry(geometry);
}

function drawFrozenFontT(frozenT) {
  let letterKey = frozenT.letter || 'T';
  let geometry = buildLetterGeometry(
    letterKey,
    LETTER_SIZE,
    letterDepth,
    CURVE_DETAIL,
    getFontForLetter(letterKey),
    getFontIdForLetter(letterKey)
  );
  if(!geometry) {
    return;
  }
  renderGeometry(geometry);
}

// contour의 부호 면적 계산 (양수 = 시계방향, 음수 = 반시계방향)
function contourSignedArea(contour) {
  let area = 0;
  let n = contour.length;
  for(let i = 0; i < n; i++) {
    let curr = contour[i];
    let next = contour[(i + 1) % n];
    area += (curr.x * next.y - next.x * curr.y);
  }
  return area / 2;
}

// 점이 폴리곤 내부에 있는지 판별 (ray casting)
function pointInPolygon(px, py, polygon) {
  let inside = false;
  let n = polygon.length;
  for(let i = 0, j = n - 1; i < n; j = i++) {
    let xi = polygon[i].x, yi = polygon[i].y;
    let xj = polygon[j].x, yj = polygon[j].y;
    if(((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

// contour의 winding을 특정 방향으로 보장
function ensureWinding(contour, clockwise) {
  let area = contourSignedArea(contour);
  // area > 0이면 시계방향 (screen에서 y아래 기준)
  let isCW = area > 0;
  if(isCW !== clockwise) {
    return contour.slice().reverse();
  }
  return contour;
}

function renderGeometry(geometry) {
  let halfDepth = geometry.depth / 2;
  let groups = geometry.groups || [];

  if(renderMode === 'wireframe') {
    noFill();
    stroke(0);
    strokeWeight(1);

    for(let edge of geometry.edges || []) {
      line(edge.a.x, edge.a.y, halfDepth, edge.b.x, edge.b.y, halfDepth);
      line(edge.a.x, edge.a.y, -halfDepth, edge.b.x, edge.b.y, -halfDepth);
    }

    // 모든 contour(외곽 + 구멍)의 꺾이는 점에 depth 라인
    let allContours = [];
    for(let g of groups) {
      allContours.push(g.outer);
      for(let h of g.holes) allContours.push(h);
    }

    for(let contour of allContours) {
      let count = contour.length;
      if(count < 3) continue;

      for(let i = 0; i < count; i++) {
        let prev = contour[(i - 1 + count) % count];
        let curr = contour[i];
        let next = contour[(i + 1) % count];

        let v1x = curr.x - prev.x;
        let v1y = curr.y - prev.y;
        let v2x = next.x - curr.x;
        let v2y = next.y - curr.y;

        let len1 = Math.hypot(v1x, v1y);
        let len2 = Math.hypot(v2x, v2y);
        if(len1 === 0 || len2 === 0) continue;

        let dot = (v1x * v2x + v1y * v2y) / (len1 * len2);
        if(dot > 0.7) continue;

        line(curr.x, curr.y, halfDepth, curr.x, curr.y, -halfDepth);
      }
    }

    return;
  }

  // 크롬 셰이더 적용
  shader(chromeShader);
  chromeShader.setUniform('uLightDirection1', [0.6, 0.7, -0.4]);
  chromeShader.setUniform('uLightDirection2', [-0.5, 0.5, -0.3]);
  noStroke();

  // 전면 그리기 (법선: +Z 방향) — 구멍은 beginContour로 뚫기
  for(let g of groups) {
    let outer = g.outer;
    if(outer.length < 3) continue;
    
    // 외곽 contour: 시계방향으로 보장
    let outerCW = ensureWinding(outer, true);
    
    beginShape();
    normal(0, 0, 1);
    for(let pt of outerCW) {
      vertex(pt.x, pt.y, halfDepth);
    }
    // 구멍들: 반시계방향으로 보장
    for(let hole of g.holes) {
      if(hole.length < 3) continue;
      let holeCCW = ensureWinding(hole, false);
      beginContour();
      for(let pt of holeCCW) {
        vertex(pt.x, pt.y, halfDepth);
      }
      endContour();
    }
    endShape(CLOSE);
  }

  // 후면 그리기 (법선: -Z 방향) — 방향 반전
  for(let g of groups) {
    let outer = g.outer;
    if(outer.length < 3) continue;
    
    // 후면: 외곽은 반시계방향(뒤집어 보이므로)
    let outerCCW = ensureWinding(outer, false);
    
    beginShape();
    normal(0, 0, -1);
    for(let pt of outerCCW) {
      vertex(pt.x, pt.y, -halfDepth);
    }
    // 구멍들: 시계방향
    for(let hole of g.holes) {
      if(hole.length < 3) continue;
      let holeCW = ensureWinding(hole, true);
      beginContour();
      for(let pt of holeCW) {
        vertex(pt.x, pt.y, -halfDepth);
      }
      endContour();
    }
    endShape(CLOSE);
  }

  // 측면 — 외곽 + 구멍 모두의 벽을 그림
  let allSideContours = [];
  for(let g of groups) {
    allSideContours.push(g.outer);
    for(let h of g.holes) allSideContours.push(h);
  }

  for(let contour of allSideContours) {
    let count = contour.length;
    if(count < 2) continue;
    
    beginShape(QUADS);
    for(let i = 0; i < count; i++) {
      let curr = contour[i];
      let next = contour[(i + 1) % count];
      
      let dx = next.x - curr.x;
      let dy = next.y - curr.y;
      let len = Math.hypot(dx, dy);
      if(len > 0) {
        let nx = dy / len;
        let ny = -dx / len;
        normal(nx, ny, 0);
      }
      
      vertex(curr.x, curr.y, halfDepth);
      vertex(next.x, next.y, halfDepth);
      vertex(next.x, next.y, -halfDepth);
      vertex(curr.x, curr.y, -halfDepth);
    }
    endShape();
  }
}

function buildLetterGeometry(letter, size, depth, detail, font = oracleFont, fontId = 'oracle') {
  if(!font) {
    return null;
  }

  let cacheKey = `${letter}|${fontId}`;
  if(letterGeometryCache[cacheKey]) {
    return letterGeometryCache[cacheKey];
  }

  let sampleFactor = detail / 25;
  if(sampleFactor < 0.05) sampleFactor = 0.05;
  if(sampleFactor > 1) sampleFactor = 1;
  let rawPoints = font.textToPoints(letter, 0, 0, size, {
    sampleFactor: sampleFactor,
    simplifyThreshold: 0
  });

  if(!rawPoints || rawPoints.length < 3) {
    return null;
  }

  const epsilon = 1.0;
  
  // 여러 개의 분리된 contour를 감지하기 위해 점들 사이의 거리 계산
  let distances = [];
  for(let i = 1; i < rawPoints.length; i++) {
    let dx = rawPoints[i].x - rawPoints[i-1].x;
    let dy = rawPoints[i].y - rawPoints[i-1].y;
    distances.push(Math.sqrt(dx * dx + dy * dy));
  }
  
  // 평균 거리 계산
  let avgDist = distances.reduce((a, b) => a + b, 0) / distances.length;
  // 큰 점프를 감지하는 임계값 (평균의 3배)
  let jumpThreshold = Math.max(avgDist * 3, 20);
  
  // 분리된 contour들로 나누기
  let allContours = [];
  let currentContour = [];
  
  for(let i = 0; i < rawPoints.length; i++) {
    let pt = rawPoints[i];
    
    // 큰 점프가 감지되면 새 contour 시작
    if(i > 0) {
      let dx = pt.x - rawPoints[i-1].x;
      let dy = pt.y - rawPoints[i-1].y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      
      if(dist > jumpThreshold) {
        // 현재 contour 저장
        if(currentContour.length >= 3) {
          allContours.push(currentContour);
        }
        currentContour = [];
      }
    }
    
    // 중복 점 제거
    if(currentContour.length === 0) {
      currentContour.push({ x: pt.x, y: pt.y });
    } else {
      let prev = currentContour[currentContour.length - 1];
      let dx = prev.x - pt.x;
      let dy = prev.y - pt.y;
      if(Math.sqrt(dx * dx + dy * dy) > epsilon) {
        currentContour.push({ x: pt.x, y: pt.y });
      }
    }
  }
  
  // 마지막 contour 저장
  if(currentContour.length >= 3) {
    allContours.push(currentContour);
  }
  
  if(allContours.length === 0) {
    return null;
  }
  
  // 각 contour를 폐곡선으로 만들기
  for(let contour of allContours) {
    let first = contour[0];
    let last = contour[contour.length - 1];
    let dx = first.x - last.x;
    let dy = first.y - last.y;
    if(Math.sqrt(dx * dx + dy * dy) > epsilon) {
      contour.push({ x: first.x, y: first.y });
    }
  }

  // 모든 점에서 중심점 계산
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for(let contour of allContours) {
    for(let pt of contour) {
      if(pt.x < minX) minX = pt.x;
      if(pt.y < minY) minY = pt.y;
      if(pt.x > maxX) maxX = pt.x;
      if(pt.y > maxY) maxY = pt.y;
    }
  }

  let offsetX = (minX + maxX) / 2;
  let offsetY = (minY + maxY) / 2;

  // 중심점으로 이동
  for(let contour of allContours) {
    for(let pt of contour) {
      pt.x -= offsetX;
      pt.y -= offsetY;
    }
  }

  // 모든 contour의 엣지 생성
  let edges = [];
  for(let contour of allContours) {
    for(let i = 0; i < contour.length - 1; i++) {
      let a = contour[i];
      let b = contour[i + 1];
      edges.push({
        a: { x: a.x, y: a.y },
        b: { x: b.x, y: b.y }
      });
    }
  }

  // contours에는 중복 마지막 점 제거
  let contoursForFill = allContours.map(c => c.slice(0, c.length - 1));

  // 각 contour의 면적과 방향 계산
  let contourInfos = contoursForFill.map((c, idx) => {
    let area = contourSignedArea(c);
    return { contour: c, area: area, absArea: Math.abs(area), index: idx };
  });
  
  // 면적 크기 내림차순 정렬 (바깥 contour가 더 큰 면적)
  contourInfos.sort((a, b) => b.absArea - a.absArea);
  
  // 외곽(outer)과 구멍(hole) 그룹핑
  let groups = []; // {outer: contour, holes: [contour, ...]}
  let assigned = new Set();
  
  for(let i = 0; i < contourInfos.length; i++) {
    if(assigned.has(i)) continue;
    
    let outerInfo = contourInfos[i];
    let outerContour = outerInfo.contour;
    assigned.add(i);
    
    let group = { outer: outerContour, holes: [] };
    
    // 나머지 contour 중 이 outer 안에 들어있는 것을 구멍으로 분류
    for(let j = i + 1; j < contourInfos.length; j++) {
      if(assigned.has(j)) continue;
      
      let innerInfo = contourInfos[j];
      let innerContour = innerInfo.contour;
      
      // innerContour의 첫 번째 점이 outerContour 안에 있는지 확인
      let testPt = innerContour[0];
      if(pointInPolygon(testPt.x, testPt.y, outerContour)) {
        group.holes.push(innerContour);
        assigned.add(j);
      }
    }
    
    groups.push(group);
  }

  let centeredMinX = Infinity;
  let centeredMinY = Infinity;
  let centeredMaxX = -Infinity;
  let centeredMaxY = -Infinity;
  for(let contour of contoursForFill) {
    for(let pt of contour) {
      if(pt.x < centeredMinX) centeredMinX = pt.x;
      if(pt.y < centeredMinY) centeredMinY = pt.y;
      if(pt.x > centeredMaxX) centeredMaxX = pt.x;
      if(pt.y > centeredMaxY) centeredMaxY = pt.y;
    }
  }

  let geometry = {
    contours: contoursForFill,
    groups: groups,
    edges,
    depth,
    minX: centeredMinX,
    maxX: centeredMaxX,
    minY: centeredMinY,
    maxY: centeredMaxY,
    width: centeredMaxX - centeredMinX,
    height: centeredMaxY - centeredMinY
  };

  letterGeometryCache[cacheKey] = geometry;
  return geometry;
}

function createChromeShader() {
  // Vertex Shader
  const vertShader = `
    attribute vec3 aPosition;
    attribute vec3 aNormal;
    
    uniform mat4 uModelViewMatrix;
    uniform mat4 uProjectionMatrix;
    uniform mat3 uNormalMatrix;
    
    varying vec3 vNormal;
    varying vec3 vPosition;
    
    void main() {
      vec4 positionVec4 = vec4(aPosition, 1.0);
      gl_Position = uProjectionMatrix * uModelViewMatrix * positionVec4;
      
      vNormal = normalize(uNormalMatrix * aNormal);
      vPosition = (uModelViewMatrix * positionVec4).xyz;
    }
  `;
  
  // Fragment Shader - 크롬 효과
  const fragShader = `
    precision highp float;
    
    varying vec3 vNormal;
    varying vec3 vPosition;
    
    uniform vec3 uLightDirection1;
    uniform vec3 uLightDirection2;
    
    void main() {
      vec3 normal = normalize(vNormal);
      vec3 viewDir = normalize(-vPosition);
      
      // Fresnel 효과 (가장자리가 밝게)
      float fresnel = pow(1.0 - abs(dot(viewDir, normal)), 3.0);
      
      // 조명 반사
      vec3 light1 = normalize(uLightDirection1);
      vec3 light2 = normalize(uLightDirection2);
      
      float diffuse1 = max(dot(normal, light1), 0.0);
      float diffuse2 = max(dot(normal, light2), 0.0) * 0.5;
      
      // 스페큘러 하이라이트
      vec3 reflectDir1 = reflect(-light1, normal);
      vec3 reflectDir2 = reflect(-light2, normal);
      float spec1 = pow(max(dot(viewDir, reflectDir1), 0.0), 80.0);
      float spec2 = pow(max(dot(viewDir, reflectDir2), 0.0), 60.0);
      
      // 크롬 색상 조합
      vec3 baseColor = vec3(0.12, 0.12, 0.14); // 어두운 베이스
      vec3 chromeColor = vec3(0.5, 0.5, 0.55); // 금속성 반사
      vec3 highlightColor = vec3(0.9, 0.9, 1.0); // 밝은 하이라이트
      
      // 최종 색상 계산
      vec3 ambient = baseColor * 0.3;
      vec3 diffuse = chromeColor * (diffuse1 + diffuse2);
      vec3 specular = highlightColor * (spec1 + spec2 * 0.7);
      vec3 fresnelGlow = chromeColor * fresnel * 0.6;
      
      vec3 finalColor = ambient + diffuse + specular + fresnelGlow;
      
      gl_FragColor = vec4(finalColor, 1.0);
    }
  `;
  
  return createShader(vertShader, fragShader);
}


