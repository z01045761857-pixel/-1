const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static("public"));

const rooms = new Map();
const regions = [
  { name: "제8구 뒷골목", tier: "하층 거주민", cash: [10, 45], note: "치안이 불안정하고 생활 여건이 열악한 구역" },
  { name: "제17구 외곽", tier: "일반 시민", cash: [25, 75], note: "도시의 경계에 가까운 낡은 거주 구역" },
  { name: "제4구 둥지", tier: "둥지 주민", cash: [70, 160], note: "거대 기업의 관리 아래 놓인 비교적 안정된 구역" },
  { name: "제11구 뒷골목", tier: "하층 거주민", cash: [8, 55], note: "좁은 골목과 작은 상점이 이어진 구역" },
  { name: "제22구 외곽", tier: "일반 시민", cash: [20, 90], note: "일거리를 찾아 사람들이 모여드는 변두리" },
  { name: "제9구 둥지", tier: "둥지 주민", cash: [60, 180], note: "규칙과 감시가 일상에 스며든 구역" }
];
const homes = [
  { name: "평범한 가정", bonus: { mental: 5, network: 3 }, note: "넉넉하지는 않지만 서로를 돌보는 가족" },
  { name: "궁핍한 가정", bonus: { health: -4 }, note: "생활비를 마련하는 일이 늘 쉽지 않았던 가족" },
  { name: "엄격한 가정", bonus: { intelligence: 5, mental: -5 }, note: "규칙과 성취를 중요하게 여기는 분위기" },
  { name: "불안정한 가정", bonus: { stamina: 4, network: -4 }, note: "환경이 자주 바뀌어 스스로 판단해야 했던 가족" },
  { name: "안정된 가정", bonus: { health: 4, intelligence: 3 }, note: "기본적인 생활 기반과 교육 기회가 있었던 가족" }
];
const eventSeeds = [
  ["골목의 실종", "한 뒷골목에서 주민 한 명이 사라졌다는 소문이 퍼졌다."],
  ["구인 공고", "근처 상점과 작업장에서 사람을 구한다는 공고가 붙었다."],
  ["조직 간 긴장", "서로 다른 조직의 사람들이 구역 경계에서 대치했다는 목격담이 들린다."],
  ["기업의 공지", "한 기업이 구역 내 통행 규칙을 변경한다는 안내를 내걸었다."],
  ["수상한 거래", "늦은 밤 정체를 알 수 없는 물건이 거래되었다는 이야기가 돌고 있다."],
  ["생활 물가 상승", "몇몇 생필품의 가격이 올랐다. 상인들의 표정이 어둡다."],
  ["평범한 하루", "특별한 소식은 없다. 도시는 무심하게 하루를 이어간다."],
  ["낯선 목격자", "외지인으로 보이는 사람이 같은 장소를 여러 차례 오갔다는 제보가 들어왔다."]
];
const pick = a => a[Math.floor(Math.random() * a.length)];
const int = (a,b) => Math.floor(Math.random()*(b-a+1))+a;
const clamp = n => Math.max(0, Math.min(100, n));
const code = () => crypto.randomBytes(3).toString("hex").toUpperCase();

function addLog(room, text, type="도시 기록") {
  room.log.unshift({ id: crypto.randomUUID(), day: room.day, type, text, at: Date.now() });
  room.log = room.log.slice(0, 35);
}
function publicRoom(room) {
  return {
    code: room.code, day: room.day, event: room.event, log: room.log,
    players: [...room.players.values()].map(p => ({
      id:p.id, name:p.name, region:p.region, tier:p.tier, home:p.home,
      age:p.age, money:p.money, actions:p.actions, stats:p.stats,
      online:true, lastAction:p.lastAction
    }))
  };
}
function broadcast(room) { io.to(room.code).emit("room:update", publicRoom(room)); }
function makePlayer(id, name) {
  const region = pick(regions), home = pick(homes);
  const stats = {
    health:int(42,78), mental:int(38,76), intelligence:int(30,72),
    stamina:int(35,75), network:int(5,35), reputation:int(5,30)
  };
  Object.entries(home.bonus).forEach(([k,v]) => stats[k] = clamp(stats[k]+v));
  return {
    id, name, region:region.name, tier:region.tier, home:home.name,
    age:18, money:int(...region.cash), actions:3, stats,
    lastAction:"아직 행동하지 않음"
  };
}
function ensureEvent(room) {
  const [title, text] = pick(eventSeeds);
  room.event = { id:crypto.randomUUID(), title, text, day:room.day, choices:["관여하기","소문을 조사하기","무시하기"], progress:0 };
  addLog(room, `${title}: ${text}`, "새로운 사건");
}
function applyAction(room, player, action) {
  const s = player.stats;
  let note = "";
  if (action === "work") { const n=int(8,18); player.money+=n; s.stamina=clamp(s.stamina-3); note=`일거리를 마치고 ${n}안을 벌었다.`; }
  if (action === "study") { s.intelligence=clamp(s.intelligence+int(2,4)); s.mental=clamp(s.mental-2); note="자료를 읽고 공부했다. 지능이 조금 올랐다."; }
  if (action === "rest") { s.health=clamp(s.health+int(3,6)); s.mental=clamp(s.mental+int(4,7)); note="잠시 쉬며 몸과 마음을 회복했다."; }
  if (action === "social") { s.network=clamp(s.network+int(2,5)); s.reputation=clamp(s.reputation+int(0,2)); note="도시의 누군가와 대화를 나눴다."; }
  if (action === "explore") { s.mental=clamp(s.mental-1); note=pick(["거리 게시판에서 낯선 의뢰를 발견했다.","상인에게 최근 구역의 소문을 들었다.","익숙하지 않은 골목길을 확인했다."]); }
  if (action === "exercise") { s.stamina=clamp(s.stamina+int(2,4)); s.health=clamp(s.health+1); note="기초 체력 훈련을 했다."; }
  player.actions--; player.lastAction=note;
  addLog(room, `${player.name}: ${note}`, "플레이어 행동");
  // Every action can influence the shared city's event.
  if (room.event && Math.random() < 0.18) {
    room.event.progress++;
    addLog(room, `도시의 사건에 작은 변화가 생겼다. (${room.event.title})`, "사건 변화");
  }
}
function advanceDay(room) {
  room.day++;
  for (const p of room.players.values()) {
    p.actions=3; p.stats.health=clamp(p.stats.health-1); p.stats.mental=clamp(p.stats.mental-1);
    if (p.money >= 5) p.money -= 5;
    else p.stats.mental=clamp(p.stats.mental-2);
    if (room.day % 30 === 1) p.age++;
  }
  addLog(room, `도시의 ${room.day}일차가 시작되었다. 모든 시민의 하루가 새롭게 열린다.`, "날짜 변경");
  if (Math.random() < 0.72 || !room.event) ensureEvent(room);
  else {
    room.event.progress++;
    room.event.text += " 시간이 흐르면서 소문은 조금씩 다른 모습으로 번지고 있다.";
    addLog(room, `${room.event.title}의 후속 소문이 퍼졌다.`, "사건 진행");
  }
}

io.on("connection", socket => {
  socket.on("room:create", ({name}) => {
    if (!name || !name.trim()) return socket.emit("error:message","이름을 입력해 주세요.");
    const roomCode = code();
    const room = { code:roomCode, day:1, players:new Map(), log:[], event:null };
    rooms.set(roomCode, room);
    const player = makePlayer(socket.id, name.trim().slice(0,14));
    room.players.set(socket.id, player);
    socket.join(roomCode); socket.data.roomCode=roomCode;
    addLog(room, `${player.name}이(가) ${player.region}에서 태어났다. 출생 환경은 ${player.home}이다.`, "새로운 시민");
    ensureEvent(room); broadcast(room);
    socket.emit("room:joined",{code:roomCode,playerId:socket.id});
  });
  socket.on("room:join", ({code:roomCode,name}) => {
    const room=rooms.get(String(roomCode||"").toUpperCase());
    if (!room) return socket.emit("error:message","해당 방을 찾을 수 없습니다.");
    if (!name || !name.trim()) return socket.emit("error:message","이름을 입력해 주세요.");
    if (room.players.size>=12) return socket.emit("error:message","방 인원이 가득 찼습니다. (최대 12명)");
    const player=makePlayer(socket.id,name.trim().slice(0,14));
    room.players.set(socket.id,player); socket.join(room.code); socket.data.roomCode=room.code;
    addLog(room, `${player.name}이(가) ${player.region}에서 태어나 도시에 합류했다.`, "새로운 시민");
    broadcast(room); socket.emit("room:joined",{code:room.code,playerId:socket.id});
  });
  socket.on("player:action", ({action}) => {
    const room=rooms.get(socket.data.roomCode); if(!room)return;
    const player=room.players.get(socket.id); if(!player)return;
    const allowed=["work","study","rest","social","explore","exercise"];
    if(!allowed.includes(action))return;
    if(player.actions<=0)return socket.emit("error:message","오늘의 행동 횟수를 모두 사용했습니다.");
    applyAction(room,player,action); broadcast(room);
  });
  socket.on("event:choice", ({choice}) => {
    const room=rooms.get(socket.data.roomCode); if(!room || !room.event)return;
    const p=room.players.get(socket.id); if(!p)return;
    const msg = choice==="관여하기" ? `${p.name}이(가) 사건에 관여하기로 했다.` :
      choice==="소문을 조사하기" ? `${p.name}이(가) 사건의 소문을 조사하기 시작했다.` :
      `${p.name}은(는) 사건을 외면하고 일상으로 돌아갔다.`;
    if(choice==="관여하기"){p.stats.network=clamp(p.stats.network+1);room.event.progress++;}
    if(choice==="소문을 조사하기"){p.stats.intelligence=clamp(p.stats.intelligence+1);room.event.progress++;}
    addLog(room,msg,"사건 선택"); broadcast(room);
  });
  socket.on("chat:send", ({text}) => {
    const room=rooms.get(socket.data.roomCode); if(!room)return;
    const p=room.players.get(socket.id); if(!p)return;
    const message=String(text||"").trim().slice(0,180); if(!message)return;
    io.to(room.code).emit("chat:message",{name:p.name,text:message,at:Date.now()});
  });
  socket.on("day:advance", () => {
    const room=rooms.get(socket.data.roomCode); if(!room)return;
    if ([...room.players.values()].some(p=>p.actions>0)) return socket.emit("error:message","모든 접속자가 오늘의 행동을 마쳐야 하루를 넘길 수 있습니다.");
    advanceDay(room); broadcast(room);
  });
  socket.on("disconnect", () => {
    const room=rooms.get(socket.data.roomCode); if(!room)return;
    const p=room.players.get(socket.id);
    if(p){addLog(room,`${p.name}의 접속이 끊겼다. 캐릭터는 방에 남아 있다.`,"접속");room.players.delete(socket.id);}
    if(room.players.size===0)rooms.delete(room.code); else broadcast(room);
  });
});

const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log(`City prototype running at http://localhost:${PORT}`));
