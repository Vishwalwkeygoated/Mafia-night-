const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const rooms = new Map();

app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
const rolesFor = n => {
  const roles = [];
  const mafia = Math.max(1, Math.floor(n / 4));
  for (let i=0;i<mafia;i++) roles.push("Mafia");
  if (n >= 5) roles.push("Detective");
  if (n >= 5) roles.push("Doctor");
  while (roles.length < n) roles.push("Civilian");
  return roles.sort(() => Math.random() - 0.5);
};

function publicRoom(room) {
  return {
    code: room.code,
    phase: room.phase,
    host: room.host,
    players: [...room.players.values()].map(p => ({
      id:p.id, name:p.name, alive:p.alive, ready:p.ready
    })),
    started: room.started,
    day: room.day,
    winner: room.winner
  };
}

function broadcast(room) {
  io.to(room.code).emit("room", publicRoom(room));
}

function checkWin(room) {
  const alive=[...room.players.values()].filter(p=>p.alive);
  const mafia=alive.filter(p=>p.role==="Mafia").length;
  const town=alive.length-mafia;
  if (mafia===0) room.winner="Town";
  if (mafia>=town) room.winner="Mafia";
  if (room.winner) room.phase="ended";
}

io.on("connection", socket => {
  socket.on("createRoom", ({name}, cb) => {
    let code;
    do { code=Math.random().toString(36).slice(2,7).toUpperCase(); } while(rooms.has(code));
    const room={code,host:socket.id,players:new Map(),phase:"lobby",started:false,day:0,winner:null};
    room.players.set(socket.id,{id:socket.id,name:(name||"Player").slice(0,18),alive:true,ready:false,role:null});
    rooms.set(code,room); socket.join(code); cb({ok:true,code}); broadcast(room);
  });

  socket.on("joinRoom", ({code,name}, cb) => {
    const room=rooms.get((code||"").toUpperCase());
    if(!room) return cb({ok:false,error:"Room not found"});
    if(room.started) return cb({ok:false,error:"Game already started"});
    if(room.players.size>=12) return cb({ok:false,error:"Room is full"});
    room.players.set(socket.id,{id:socket.id,name:(name||"Player").slice(0,18),alive:true,ready:false,role:null});
    socket.join(room.code); cb({ok:true,code:room.code}); broadcast(room);
  });

  socket.on("ready", ({code}) => {
    const room=rooms.get(code); if(!room) return;
    const p=room.players.get(socket.id); if(p) p.ready=!p.ready;
    broadcast(room);
  });

  socket.on("startGame", ({code}) => {
    const room=rooms.get(code); if(!room || room.host!==socket.id) return;
    if(room.players.size<4) return io.to(socket.id).emit("errorMsg","Need at least 4 players.");
    const roles=rolesFor(room.players.size);
    [...room.players.values()].forEach((p,i)=>{p.role=roles[i];p.alive=true;});
    room.started=true; room.phase="night"; room.day=1; room.winner=null;
    room.players.forEach(p=>io.to(p.id).emit("role",{
      role:p.role,
      teammates:[...room.players.values()].filter(x=>x.role==="Mafia"&&x.id!==p.id).map(x=>x.name)
    }));
    broadcast(room);
  });

  socket.on("nightAction", ({code,targetId}) => {
    const room=rooms.get(code); if(!room || room.phase!=="night") return;
    const actor=room.players.get(socket.id), target=room.players.get(targetId);
    if(!actor||!target||!actor.alive||!target.alive) return;
    if(actor.role==="Mafia") room.mafiaTarget=targetId;
    if(actor.role==="Doctor") room.doctorTarget=targetId;
    if(actor.role==="Detective") {
      socket.emit("investigation",{name:target.name,isMafia:target.role==="Mafia"});
      actor.didAction=true;
    }
    const living=[...room.players.values()].filter(p=>p.alive);
    const required=living.filter(p=>["Mafia","Doctor","Detective"].includes(p.role));
    if(required.every(p=>p.role==="Mafia" ? room.mafiaTarget : p.didAction || !["Doctor","Detective"].includes(p.role))) {
      if(room.mafiaTarget && room.mafiaTarget!==room.doctorTarget) {
        const victim=room.players.get(room.mafiaTarget); if(victim) victim.alive=false;
      }
      room.players.forEach(p=>p.didAction=false);
      room.mafiaTarget=null; room.doctorTarget=null;
      checkWin(room);
      if(!room.winner) room.phase="day";
      broadcast(room);
    }
  });

  socket.on("vote", ({code,targetId}) => {
    const room=rooms.get(code); if(!room || room.phase!=="day") return;
    const actor=room.players.get(socket.id); if(!actor||!actor.alive) return;
    room.votes ||= new Map(); room.votes.set(socket.id,targetId);
    const alive=[...room.players.values()].filter(p=>p.alive);
    if(room.votes.size>=alive.length){
      const counts={}; room.votes.forEach(t=>counts[t]=(counts[t]||0)+1);
      const max=Math.max(...Object.values(counts)); const top=Object.keys(counts).filter(k=>counts[k]===max);
      if(top.length===1){ const out=room.players.get(top[0]); if(out) out.alive=false; }
      room.votes.clear(); room.day++;
      checkWin(room);
      if(!room.winner) room.phase="night";
      broadcast(room);
    }
  });

  socket.on("disconnect",()=>{
    for(const room of rooms.values()){
      if(room.players.delete(socket.id)){
        if(room.host===socket.id) room.host=room.players.keys().next().value;
        if(room.players.size===0) rooms.delete(room.code); else broadcast(room);
      }
    }
  });
});

server.listen(process.env.PORT||3000,()=>console.log("Mafia Night running"));
