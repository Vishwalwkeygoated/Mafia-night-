const socket=io();let code="",me="",room=null,myRole=null;
const $=id=>document.getElementById(id);
function show(id){["home","lobby","game"].forEach(x=>$(x).classList.add("hidden"));$(id).classList.remove("hidden")}
function create(){me=$("name").value.trim();if(!me)return $("msg").textContent="Enter your name.";socket.emit("createRoom",{name:me},r=>{if(r.ok){code=r.code;show("lobby")}else $("msg").textContent=r.error})}
function showJoin(){$("joinBox").classList.remove("hidden")}
function join(){me=$("name").value.trim();code=$("code").value.trim().toUpperCase();if(!me||!code)return;$("msg").textContent="";socket.emit("joinRoom",{code,name:me},r=>{if(r.ok)show("lobby");else $("msg").textContent=r.error})}
function ready(){socket.emit("ready",{code})}
function start(){socket.emit("startGame",{code})}
function copyCode(){navigator.clipboard?.writeText(code);$("lobbyMsg").textContent="Room code copied!"}
socket.on("errorMsg",m=>$("lobbyMsg").textContent=m)
socket.on("role",r=>{myRole=r.role;$("roleBox").innerHTML=`Your role: <b>${r.role}</b>${r.teammates?.length?`<br><small>Mafia teammates: ${r.teammates.join(", ")}</small>`:""}`;$("roleBox").classList.remove("hidden")})
socket.on("investigation",r=>alert(`${r.name} is ${r.isMafia?"MAFIA":"not Mafia"}.`))
socket.on("room",r=>{room=r;code=r.code;$("roomCode").textContent=r.code;if(!r.started){show("lobby");$("players").innerHTML=r.players.map(p=>`<div class="player ${p.alive?"":"dead"}"><span>${p.name}${p.id===r.host?" 👑":""}</span><small>${p.ready?"READY":"WAITING"}</small></div>`).join("")}else{show("game");renderGame()}})
function renderGame(){
 $("day").textContent=`DAY ${room.day}`;$("phaseBadge").textContent=room.phase.toUpperCase();
 $("phaseTitle").textContent=room.phase==="night"?"Night falls...":room.phase==="day"?"The town awakens":"Game over";
 const mep=room.players.find(p=>p.id===socket.id), alive=room.players.filter(p=>p.alive);
 if(room.winner){$("winner").classList.remove("hidden");$("winner").textContent=`🏆 ${room.winner} wins!`;$("instruction").textContent="The game has ended.";return}
 $("winner").classList.add("hidden");
 if(room.phase==="night"){
   $("instruction").textContent=myRole==="Mafia"?"Choose someone to eliminate.":myRole==="Doctor"?"Choose someone to protect.":myRole==="Detective"?"Choose someone to investigate.":"Wait for the night to end.";
 }else $("instruction").textContent="Discuss with everyone, then vote for who you think is Mafia.";
 $("targets").innerHTML="";
 if((room.phase==="night"&&["Mafia","Doctor","Detective"].includes(myRole))||room.phase==="day"){
   alive.filter(p=>p.id!==socket.id).forEach(p=>{let b=document.createElement("button");b.className="target";b.textContent=p.name;b.onclick=()=>room.phase==="night"?socket.emit("nightAction",{code,targetId:p.id}):socket.emit("vote",{code,targetId:p.id});$("targets").appendChild(b)})
 }
 $("status").textContent=`Alive: ${alive.map(p=>p.name).join(" • ")}`;
}