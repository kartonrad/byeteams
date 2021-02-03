// { const wsUrl="";

console.log("injected with webscket")
function eventFire(el, etype){
    if (el.fireEvent) {
        el.fireEvent('on' + etype);
    } else {
        var evObj = document.createEvent('Events');
        evObj.initEvent(etype, true, false);
        el.dispatchEvent(evObj);
    }
}

//NEWNEW
function evalRecord(record) {
    if(record.attributeName === "class") {
        if(record.target.class.includes("avatar")) {
            if(record.target.class.includes("tw"))
                return "stopSpeaking";// member gone silent
            else
                return "startSpeaking";// member starts speaking
        }
    } 

    if(record.target.getAttribute("data-cid") === "roster-participant" && (record.attributeName === "data-tid") ) {
        return "role:"+record.target.getAttribute("data-tid");// data-tid is the current role !! participant, organizer, etc
    }


    function participantIcons(target) {
        switch(target.getAttribute("data-cid")) {
            case "roster-participant-unmuted": 
                return "unmuted";
            case "roster-participant-muted": 
                return "muted";
            case "roster-participant-hand-raised": 
                return "raisedHand";
        }
    }
    
    if(record.type === "childList") {
        return [
            record.addedNodes.map(participantIcons),
            record.removedNodes.map((r) => {if(r.getAttribute("data-cid") === "roster-participant-hand-raised") return "loweredHand"})
        ]
    }
    if(record.attributeName === "data-cid") {
        return participantIcons(target);
    }
}
//NEWNEW

var socket = new WebSocket(wsUrl)
socket.onopen = function main () {
    function send(data) { socket.send(JSON.stringify(data))}

    //NEWNEW
    var memberObserver, listObserver;

    //for live updates
    function initiateObservers() {
        const memberEntries = document.querySelectorAll("[data-cid=roster-participant]")

        function findObserver(target) {
            for (var i = 0; i < memberEntries.length; i++) {
                if (memberEntries[i].contains(target)) {
                    return memberEntries[i];
                }
            }
            return null;
        }

        memberObserver = new MutationObserver((records) => {
            var events = records.map((record) => {
                var e = evalRecord(record);
                if(!e) return;

                return {event: e, participant: findObserver(record.target)} // todo extract participant id, name from element
            }).flat(1);

            //send off events
        });
    }
    function feedObservers() {
        const memberEntries = document.querySelectorAll("[data-cid=roster-participant]");
        memberEntries.forEach((e) => memberObserver.observe(e, {attributes: true, attributeFilter: ["data-cid", "data-tid", "class"], subtree: true}));
    }
    //NEWNEW

    initiateObservers();
    feedObservers()


    function clickLabeledButton(sel, inc) {
        var el = document.querySelector(sel);
        if(el.getAttribute("aria-label").includes(inc))
        eventFire(el, "click");
    }

    function openChat() { clickLabeledButton("#chat-button", "Show") }
    function openMembers() { clickLabeledButton("#roster-button", "Show") }

    function raise() { clickLabeledButton("#raisehands-button", "Raise") }
    function unraise() { clickLabeledButton("#raisehands-button", "Lower") }

    function mute() { clickLabeledButton("#microphone-button", "Mute") }
    function unmute() { clickLabeledButton("#microphone-button", "Unmute") }

    //NEWNEW
    function writeMessage(string) {
        openChat();
        var input = document.querySelector(sel);

        input.value = string;
        eventFire(input, "change");
        
        var keystroke = new KeyboardEvent("keydown", {key: "Enter"});
        input.dispatchEvent(keystroke);
    }
    //NEWNEW
    

    const f = {openChat, openMembers, raise, unraise, mute, unmute, writeMessage}
    socket.onmessage = function msg(msge) {
        var msg = JSON.parse(msge);
        var cmd = f[(msg.command)||"noop"];
        if (cmd) {
            send({id: msg.id, result: cmd()});
        } else {
            send({id: msg.id, error: "no command found"})
        }
    }
}

}