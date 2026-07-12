import {
  FaceLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

const MODEL_ASSET_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const video = document.getElementById("camera");
const scoreNode = document.getElementById("score");
const timerNode = document.getElementById("timer");
const statusText = document.getElementById("statusText");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlayMessage = document.getElementById("overlayMessage");
const startButton = document.getElementById("startButton");

const world = {
  score: 0,
  timeLeft: 60,
  playing: false,
  lastFrameTime: 0,
  lastSpawnTime: 0,
  poseReady: false,
  faceX: 0.5,
  smoothFaceX: 0.5,
  fruitSpeedBase: 180,
  basket: {
    width: 122,
    height: 54,
    x: canvas.width / 2 - 61,
    y: canvas.height - 88,
  },
  fruits: [],
};

const fruitTypes = [
  { emoji: "🍎", color: "#ff6b6b", points: 1 },
  { emoji: "🍌", color: "#ffd166", points: 1 },
  { emoji: "🍊", color: "#ff9f1c", points: 2 },
  { emoji: "🍓", color: "#ef476f", points: 2 },
];

let faceLandmarker;
let mediaStream;
let timerInterval;
let animationHandle;
let trackingLoopStarted = false;

function updateOverlay(title, message, showButton = true) {
  overlayTitle.textContent = title;
  overlayMessage.textContent = message;
  startButton.style.display = showButton ? "inline-flex" : "none";
  overlay.classList.remove("hidden");
}

function hideOverlay() {
  overlay.classList.add("hidden");
}

function resizeCanvas() {
  const ratio = 16 / 9;
  const width = canvas.clientWidth;
  canvas.height = Math.round(width / ratio);
  world.basket.y = canvas.height - 88;
}

function spawnFruit() {
  const fruit = fruitTypes[Math.floor(Math.random() * fruitTypes.length)];
  const size = 42 + Math.random() * 14;
  world.fruits.push({
    ...fruit,
    x: 50 + Math.random() * (canvas.width - 100),
    y: -50,
    size,
    speed: world.fruitSpeedBase + Math.random() * 90 + (60 - world.timeLeft) * 2.8,
    sway: (Math.random() - 0.5) * 24,
  });
}

function drawSky() {
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#80d8ff");
  gradient.addColorStop(0.62, "#d5f4ff");
  gradient.addColorStop(1, "#fff2c2");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.arc(120, 100, 38, 0, Math.PI * 2);
  ctx.arc(160, 90, 32, 0, Math.PI * 2);
  ctx.arc(196, 102, 26, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(canvas.width - 220, 138, 34, 0, Math.PI * 2);
  ctx.arc(canvas.width - 186, 126, 26, 0, Math.PI * 2);
  ctx.arc(canvas.width - 156, 140, 22, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f7d96f";
  ctx.beginPath();
  ctx.arc(canvas.width - 105, 92, 38, 0, Math.PI * 2);
  ctx.fill();
}

function drawGround() {
  ctx.fillStyle = "#91d36b";
  ctx.fillRect(0, canvas.height - 48, canvas.width, 48);
}

function drawBasket() {
  const { basket } = world;
  ctx.save();
  ctx.translate(basket.x, basket.y);

  ctx.fillStyle = "#e09f56";
  ctx.beginPath();
  ctx.roundRect(0, 10, basket.width, basket.height - 10, 16);
  ctx.fill();

  ctx.strokeStyle = "#b9732e";
  ctx.lineWidth = 3;
  for (let i = 1; i < 5; i += 1) {
    const x = (basket.width / 5) * i;
    ctx.beginPath();
    ctx.moveTo(x, 14);
    ctx.lineTo(x, basket.height);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.strokeStyle = "#c67f35";
  ctx.lineWidth = 6;
  ctx.arc(basket.width / 2, 16, 34, Math.PI, 2 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

function drawFruit(fruit) {
  ctx.save();
  ctx.font = `${fruit.size}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(fruit.emoji, fruit.x, fruit.y);
  ctx.restore();
}

function drawInstructionBanner() {
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.beginPath();
  ctx.roundRect(canvas.width / 2 - 180, 18, 360, 46, 23);
  ctx.fill();
  ctx.fillStyle = "#23425c";
  ctx.font = "600 20px 'Avenir Next', 'Noto Sans TC', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("左右擺頭來移動籃子", canvas.width / 2, 48);
  ctx.restore();
}

function updateBasketPosition() {
  world.smoothFaceX += (world.faceX - world.smoothFaceX) * 0.18;
  const usableWidth = canvas.width - world.basket.width;
  world.basket.x = usableWidth * (1 - world.smoothFaceX);
}

function updateFruits(deltaSeconds) {
  const basketTop = world.basket.y + 8;
  const basketBottom = world.basket.y + world.basket.height;
  const basketLeft = world.basket.x + 8;
  const basketRight = world.basket.x + world.basket.width - 8;

  world.fruits = world.fruits.filter((fruit) => {
    fruit.y += fruit.speed * deltaSeconds;
    fruit.x += Math.sin(fruit.y * 0.02) * fruit.sway * deltaSeconds;

    const caught =
      fruit.y + fruit.size * 0.2 >= basketTop &&
      fruit.y - fruit.size * 0.2 <= basketBottom &&
      fruit.x >= basketLeft &&
      fruit.x <= basketRight;

    if (caught) {
      world.score += fruit.points;
      scoreNode.textContent = String(world.score);
      return false;
    }

    return fruit.y < canvas.height + 60;
  });
}

function render() {
  drawSky();
  drawGround();
  drawInstructionBanner();
  world.fruits.forEach(drawFruit);
  drawBasket();
}

function loop(timestamp) {
  if (!world.playing) {
    render();
    return;
  }

  if (!world.lastFrameTime) {
    world.lastFrameTime = timestamp;
  }

  const deltaSeconds = (timestamp - world.lastFrameTime) / 1000;
  world.lastFrameTime = timestamp;

  if (timestamp - world.lastSpawnTime > 650) {
    spawnFruit();
    world.lastSpawnTime = timestamp;
  }

  updateBasketPosition();
  updateFruits(deltaSeconds);
  render();

  animationHandle = window.requestAnimationFrame(loop);
}

async function setupFaceTracking() {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
  );

  faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MODEL_ASSET_URL,
    },
    runningMode: "VIDEO",
    numFaces: 1,
    minFaceDetectionConfidence: 0.55,
    minFacePresenceConfidence: 0.55,
    minTrackingConfidence: 0.55,
  });
}

async function startCamera() {
  mediaStream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: "user",
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  });

  video.srcObject = mediaStream;

  return new Promise((resolve) => {
    video.onloadedmetadata = () => {
      video.play();
      resolve();
    };
  });
}

function trackFace() {
  if (!faceLandmarker || video.readyState < 2) {
    return;
  }

  const result = faceLandmarker.detectForVideo(video, performance.now());
  const landmarks = result.faceLandmarks?.[0];

  if (!landmarks) {
    world.poseReady = false;
    statusText.textContent = "尚未偵測到臉部，請把臉放進左上角鏡頭預覽框。";
    return;
  }

  const nose = landmarks[1];
  world.poseReady = true;
  world.faceX = Math.min(0.92, Math.max(0.08, nose.x));
  statusText.textContent = "做得很好，持續左右擺頭，把水果都接住。";
}

function startTrackingLoop() {
  if (trackingLoopStarted) {
    return;
  }

  trackingLoopStarted = true;
  const run = () => {
    if (world.playing) {
      trackFace();
    }
    window.requestAnimationFrame(run);
  };
  run();
}

function resetGame() {
  world.score = 0;
  world.timeLeft = 60;
  world.fruits = [];
  world.lastFrameTime = 0;
  world.lastSpawnTime = 0;
  world.faceX = 0.5;
  world.smoothFaceX = 0.5;
  world.basket.x = canvas.width / 2 - world.basket.width / 2;
  scoreNode.textContent = "0";
  timerNode.textContent = "60";
}

function finishGame() {
  world.playing = false;
  window.clearInterval(timerInterval);
  timerInterval = undefined;
  if (animationHandle) {
    window.cancelAnimationFrame(animationHandle);
  }

  updateOverlay(
    "時間到",
    `你接住了 ${world.score} 個分數，按下按鈕再玩一次。`
  );
  startButton.disabled = false;
  startButton.textContent = "重新開始";
  render();
}

function beginCountdown() {
  timerInterval = window.setInterval(() => {
    world.timeLeft -= 1;
    timerNode.textContent = String(world.timeLeft);

    if (world.timeLeft <= 0) {
      finishGame();
    }
  }, 1000);
}

async function startGame() {
  if (!navigator.mediaDevices?.getUserMedia) {
    updateOverlay("無法使用鏡頭", "這個瀏覽器或目前環境不支援攝影機功能。");
    return;
  }

  startButton.disabled = true;
  startButton.textContent = "載入中...";
  statusText.textContent = "正在準備鏡頭與頭部追蹤模型...";

  try {
    if (!faceLandmarker) {
      await setupFaceTracking();
    }

    if (!mediaStream) {
      await startCamera();
    }

    resetGame();
    hideOverlay();
    world.playing = true;
    if (timerInterval) {
      window.clearInterval(timerInterval);
    }
    beginCountdown();
    animationHandle = window.requestAnimationFrame(loop);
    startTrackingLoop();
    statusText.textContent = "鏡頭已啟動，左右擺頭控制籃子。";
  } catch (error) {
    console.error(error);
    updateOverlay(
      "啟動失敗",
      "請確認你已允許鏡頭權限，並且用支援 HTTPS 或 localhost 的方式開啟頁面。"
    );
    startButton.disabled = false;
    startButton.textContent = "再試一次";
    statusText.textContent = "鏡頭初始化失敗，請重新嘗試。";
  }
}

window.addEventListener("resize", () => {
  resizeCanvas();
  render();
});

startButton.addEventListener("click", startGame);

resizeCanvas();
render();
