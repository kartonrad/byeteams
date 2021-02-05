const http = require("http");
const ws = require("ws");
const fs = require ("fs");
const payload = fs.readFileSync("./teams-payload.js");
const { EventEmitter } = require("events");



async function main (port) {
    var windows = await getWindows(port);
    //console.log(windows);
    
    var dbs = windows.filter((w) => (w.url === "about:blank?entityType=calls") && w.type === "page" )
    .map((json, idx) => new MSTeamsCallPage(json, idx))
}
main(9222);

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

    constructor(debugJson, id=0) {
        this.dbJson = debugJson;
        this.debugSocket = new ws(debugJson.webSocketDebuggerUrl);
        this.messageEvents = new EventEmitter();
        this.debugSocket.on("message", (msg) => this.recieve(msg));
        this.socketId = id;
        this.comOpen = false;
        this.members = [];
        this.raisedHands = 0;
        this.memberCount = 0;
        this.comSocket = new ws.Server({ port: 12400 + id});
        this.myHandRaised = false;

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
                console.log("Meeting ended unexpectedly")
                socket.removeAllListeners("message");
            });

            
            console.log("lmao injected")
            await this.sendCom("openMembers")
            await this.sendCom("unraise")
        });
    }

    async injectCode() {
        var res = await this.sendDb({method: "Runtime.evaluate", params: {expression: `{ const wsUrl="ws://localhost:${12400 + this.socketId}"`+payload}});
        try{delete res.result.result;}catch{}
        console.log(res);

        console.log("waiting for client to connect");
        return new Promise((resolve) => {
            if(this.comOpen) return resolve();
            this.messageEvents.once("clientOpen", () => {
                resolve();
            })
        });
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

                    if(member.role !=='participantsFromThread') this.memberCount +=1
                    if(member.handRaised) this.raisedHands += 1;
                });
                break;
            case "join":
                var member = jmsg.participant;
                this.members[jmsg.participant.userId] = (jmsg.participant);


                if(member.role !=='participantsFromThread') {
                    this.memberCount += 1;
                    if(member.handRaised) 
                        this.raisedHands += 1;
                }
                break;
            case "left":
                var member = this.members[jmsg.participant];
                delete this.members[jmsg.participant];


                if(member.role !=='participantsFromThread') {
                    this.memberCount -= 1;
                    if(member.handRaised) 
                        this.raisedHands -= 1;
                }
                if(member.organizer) console.log("LEAVING LEAVING LEAVING")
                break;
            case "muted":
                this.members[jmsg.participant].muted = true
                break;
            case "unmuted":
                this.members[jmsg.participant].muted = false
                break;
            case "raisedHand":
                this.members[jmsg.participant].handRaised = true
                this.raisedHands += 1;
                break;
            case "loweredHand":
                this.members[jmsg.participant].handRaised = false
                this.raisedHands -= 1;
                break;
        }

        if(jmsg.event && jmsg.event.startsWith("role:")) {
            var newRole = jmsg.event.substr(5);
            var oldRole = this.members[jmsg.participant].role;

            if(oldRole === 'participantsFromThread' && newRole !== 'participantsFromThread') {
                this.memberCount += 1;
                if(this.members[jmsg.participant.userId].handRaised) 
                    this.raisedHands += 1;
            } else if(newRole === 'participantsFromThread' && oldRole !== 'participantsFromThread') {
                this.memberCount -= 1;
                if(this.members[jmsg.participant.userId].handRaised) 
                    this.raisedHands -= 1;
            }
        }

        console.log(jmsg);
        console.log(this.memberCount);
        console.log(this.raisedHands/this.memberCount);

        if (this.raisedHands/this.memberCount > 0.7 && this.myHandRaised === false){ 
            console.log("raising hand") 
            this.sendCom("raise");
            this.myHandRaised = true;
        }
        if (this.raisedHands/this.memberCount < 0.7 && this.myHandRaised === true){ 
            console.log("lowering hand") 
            this.sendCom("unraise");
            this.myHandRaised = false;
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
        console.log(data);
        var res = await this.send(this.comOpen, {command: data, params});
        console.log( res );
        return res;
    }

    async send(socket, data) { 
        this.msgCount+=1;
        var id = this.msgCount;
        console.log(id);
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