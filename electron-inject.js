const http = require("http");
const ws = require("ws");
const fs = require ("fs");
const payload = fs.readFileSync(__dirname+"/teams-payload.js");
const { EventEmitter } = require("events");

const notifier = require("node-notifier");
const chalk = require("chalk");
var center;
var managedCalls = [];

var config = {
    teams_path: "",
    onOrganizerLeave: true,
    memberRatio: 0.34,
    handRatio: 0.7,
    alarmLength: 60,
    lastPorts: []
}


function notifyUser(msg) {
    notifier.notify({
        sound: process.platform==="win32" ? "Notification.Looping.Call4" : "Sosumi",
        message: msg,
        title: "LEFT THE MEETING",
        appID: "BYETEAMS",
        icon: "./waving.png",
        wait: true,
    });
}
//notifyUser("Due to low Member Count");

async function main (port, cnf) {
    if(cnf) config = cnf;

    try {
        var windows = await getWindows(port);
    } catch(err) {
        return console.log("Couldnt connect to remote Debugging")
    }
    
    //console.log(windows);
    
    managedCalls = windows.filter((w) => (w.url === "about:blank?entityType=calls") && w.type === "page" )
    .map((json, idx) => new MSTeamsCallPage(json, idx));

    setInterval(async () => {
        //console.log("NUM-CALLS: ",managedCalls.length)
        try {
            var windows = await getWindows(port);
        } catch(err) {
            return;
        }
        var moreCalls = windows.filter((w) => (w.url === "about:blank?entityType=calls") && w.type === "page" && !managedCalls.some((call) => call.dbJson.id === w.id) )
        .map((json, idx) => new MSTeamsCallPage(json, idx+(managedCalls.length)));
        managedCalls = managedCalls.concat(moreCalls);
    }, 5000)
}
//main(28044);

function rmvCall(id) {
    delete managedCalls[id];
}

class MSTeamsCallPage {
    members=[];
    muted=false;
    handRaised=false;
    openPanel=undefined;
    debugSocket;
    comSocket;
    comOpen=true;
    raisedHands = 0;
    memberCount = 0;
    dbJson;
    messageEvents = new EventEmitter();
    msgCount=0;
    socketId;
    myHandRaised = false;
    waitingOnOrganzierLeave = false;

    constructor(debugJson, id=0) {
        this.leaving = false;
        this.dbJson = debugJson;
        this.debugSocket = new ws(debugJson.webSocketDebuggerUrl);
        this.messageEvents = new EventEmitter();
        this.debugSocket.on("message", (msg) => this.recieve(msg));
        this.socketId = id;
        this.comOpen = false;
        this.members = [];
        this.raisedHands = 0;
        this.memberCount = 1;
        this.comSocket = new ws.Server({ port: 12400 + id});
        this.myHandRaised = false;
        this.maxMemberCount = 0;
        this.waitingOnOrganzierLeave = false;
        this.recentLeaves = [];

        this.debugSocket.once("open", () => {
            this.injectCode();
        })
        this.comSocket.on("connection", async (socket) => {
            this.messageEvents.emit("clientOpen")
            if(this.comOpen) socket.close();

            this.comOpen = socket;
            socket.on("message", (msg) => this.handleStateUpdate(msg, socket) )
            socket.on("close", ()=> {
                this.comOpen = false;
                this.log(chalk`{red.bold Meeting ended}`, false)
                socket.removeAllListeners("message");
                this.destructor();
                if(!this.leaving) {
                    notifyUser("Kicked from Meeting\n["+this.dbJson.title+"]");
                }
            });

            
            this.log("lmao injected")
            await this.sendCom("openMembers")
            await this.sendCom("unraise");
        });
    }

    destructor() {
        this.debugSocket.close();
        this.comSocket.close();
        this.messageEvents.removeAllListeners();
        rmvCall(this.socketId);
    }

    async injectCode() {
        var res = await this.sendDb({method: "Runtime.evaluate", params: {expression: `{ const wsUrl="ws://localhost:${12400 + this.socketId}"`+payload}});
        try{delete res.result.result;}catch{}
        //console.log(res);

        this.log("waiting for client to connect");
        return new Promise((resolve) => {
            if(this.comOpen) return resolve();
            this.messageEvents.once("clientOpen", () => {
                resolve();
            })
        });
    }

    isInCall(role) {
        return role ==='participantsInCall' || role === "attendeesInMeeting"
    }

    log(msg, drawer = true) {
        console.log(chalk`${drawer?"\x1b[F\x1b[F":""}{blueBright [${this.dbJson.title}]} ${msg}`);
        if(drawer)
        console.log(
chalk`{blue Members:} {grey.italic ${this.memberCount}} | {blue Most Members:}{grey.italic ${this.maxMemberCount}}
✋ {yellow.italic ${(this.raisedHands/this.memberCount)*100}%} |  {red Left {italic ${(1-this.memberCount/this.maxMemberCount)*100}%}}`)
    }

    handleStateUpdate(msg, socket) {
        var jmsg = JSON.parse(msg);
        if(jmsg.id) {
            this.recieve(msg);
        }
        
        //STATE CHANGES

        switch(jmsg.event) {
            case "fullMemberScan":
                this.members = {};
                this.memberCount = 0;
                this.raisedHands = 0;

                jmsg.list.forEach((member) => {
                    this.members[member.userId] = member;

                    if(this.isInCall(member.role)){ 
                        this.memberCount +=1;
                    }
                    if(member.handRaised) this.raisedHands += 1;
                });
                this.log("recieved member list")
                break;
            case "join":
                var member = jmsg.participant;
                this.members[jmsg.participant.userId] = (jmsg.participant);


                if(this.isInCall(member.role)) {
                    this.memberCount += 1;
                    if(member.handRaised) 
                        this.raisedHands += 1;

                    if(!this.recentLeaves.includes(member.userId)) this.log(chalk`{italic ${member.userName}}{red.bold ${member.organizer?", an Organizer":""}} {yellow joined} the Meeting!`);
                }
                break;
            case "left":
                var member = {...this.members[jmsg.participant]};
                
                if(!member) return;

                if(this.isInCall(member.role)) {
                    this.memberCount -= 1;
                    if(member.handRaised) 
                        this.raisedHands -= 1;

                    if(!this.recentLeaves.includes(member.userId)) {
                        this.recentLeaves.push(member.userId);
                        setTimeout( () => {
                            this.log(chalk`{italic ${member.userName}}{red.bold ${member.organizer?", an Organizer":""}} {yellow left} the Meeting!`);
                            this.recentLeaves = this.recentLeaves.filter((e) => e!==member.userId);
                        }, 1000);
                    }
                }
                if(member.organizer && config.onOrganizerLeave) {
                    this.log("Organizer left, waiting");
                    if(!this.waitingOnOrganzierLeave) {
                        this.waitingOnOrganzierLeave = true;
                        setTimeout(() => {
                            var noOrganizer = true;

                            for (let member in this.members) {
                                var realmember = this.members[member]
                                if(realmember.organizer) {
                                    noOrganizer = false;
                                    break;
                                }
                            }

                            if(noOrganizer) {
                                this.leaving = true;
                                this.sendCom("leave");
                                this.log(chalk`{red.bold LEAVING THE MEETING - Due to Organizers leaving}`, false)
                                if(!this.leaving) notifyUser("Due to Organizers leaving\n["+this.dbJson.title+"]");
                            }
                            this.waitingOnOrganzierLeave = false;
                        }, 20000)
                    }
                }

                delete this.members[jmsg.participant];
                break;
            case "muted":
                var member = {...this.members[jmsg.participant]};
                this.members[jmsg.participant].muted = true;
                this.log(chalk`🔈  -> {italic ${member.userName}}`)
                break;
            case "unmuted":
                var member = {...this.members[jmsg.participant]};
                this.members[jmsg.participant].muted = false;
                this.log(chalk`🔊  -> {italic ${member.userName}}`)
                break;
            case "raisedHand":
                var member = {...this.members[jmsg.participant]};
                this.members[jmsg.participant].handRaised = true
                this.raisedHands += 1;
                this.log(chalk`✋  -> {italic ${member.userName}}`)
                break;
            case "loweredHand":
                var member = {...this.members[jmsg.participant]};
                this.members[jmsg.participant].handRaised = false
                this.raisedHands -= 1;
                this.log(chalk`{red ✋X} -> {italic ${member.userName}}`)
                break;
        }

        if(jmsg.event && jmsg.event.startsWith("role:")) {
            var newRole = jmsg.event.substr(5);
            var oldRole = this.members[jmsg.participant].role;

            if(!this.isInCall(oldRole) && this.isInCall(newRole)) {
                this.memberCount += 1;
                if(this.members[jmsg.participant.userId].handRaised) 
                    this.raisedHands += 1;
            } else if(this.isInCall(oldRole) && !this.isInCall(newRole)) {
                this.memberCount -= 1;
                if(this.members[jmsg.participant.userId].handRaised) 
                    this.raisedHands -= 1;
            }
        }

        if (this.raisedHands/this.memberCount > config.handRatio && this.myHandRaised === false){ 
            this.log("Bot raising hand") 
            this.sendCom("raise");
            this.myHandRaised = true;
        }
        if (this.raisedHands/this.memberCount < config.handRatio && this.myHandRaised === true){ 
            this.log("Bot lowering hand") 
            this.sendCom("unraise");
            this.myHandRaised = false;
        }
        if(this.memberCount > this.maxMemberCount) {
            this.maxMemberCount = this.memberCount;
        }

        if(this.memberCount/this.maxMemberCount < config.memberRatio) {
            this.leaving = true;
            this.log(chalk`{red.bold LEAVING THE MEETING - Due to low Member Count}`, false)
            this.sendCom("leave");

            if(!this.leaving)
            notifyUser("Due to low Member Count\n["+this.dbJson.title+"]")
        }
    }

    waitToOpen() {
        return new Promise((resolve) => {
            if(this.debugSocket.readyState === this.debugSocket.OPEN) return resolve();
            this.debugSocket.once("open", () => {
                resolve();
            })
        });
    }

    recieve(msg) {
        var jmsg = JSON.parse(msg);
        this.messageEvents.emit(jmsg.id, jmsg);
    }

    async sendDb(data) {
        return this.send(this.debugSocket, data);
    }

    async sendCom(data, params) {
        if(data === "leave") this.leaving = true;

        //console.log(data);
        var res = await this.send(this.comOpen, {command: data, params});
        //console.log( res );
        return res;
    }

    async send(socket, data) { 
        this.msgCount+=1;
        var id = this.msgCount;
        //console.log(id);
        var data2 = {...data, id: id};
        socket.send(JSON.stringify( data2 ));
        return new Promise((resolve) => {
            this.messageEvents.once(id, (e) => {
                
                resolve(e);
            })
        });
    }
}

//get window endpoints for reote devTool connection
function getWindows(port) {
    return new Promise((resolve, reject) => {
        var req = http.request({
            hostname: "localhost",
            port: port,
            path: "/json",
            method: "GET"
        }, (res) => {
            if(res.statusCode!==200) reject(res);
            res.on("data", (d) => {
                resolve(JSON.parse(d));
            });
        });
        
        req.on("error", (err) => reject(err))
        req.end();
    });
}

module.exports = {getWindows, main, MSTeamsCallPage, notifyUser};