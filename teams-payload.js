// { const wsUrl="";

var memberObserver, listObserver;

console.log("injected with webscket")
function eventFire(el, etype){
    if (el.fireEvent) {
        el.fireEvent();
    } else {
        var evObj = document.createEvent('Events');
        evObj.simulated = true
        evObj.initEvent(etype, true, false);
        el.dispatchEvent(evObj);
    }
}

//NEWNEW
function evalRecord(record) {
    /*if(record.attributeName === "class") {
        console.log(record.target.getAttribute("class"));
        if(record.target.getAttribute("class").includes("avatar")) {
            if(record.target.getAttribute("class").includes("qr"))
                return "stopSpeaking";// member gone silent
            else
                return "startSpeaking";// member starts speaking
        }
    } */

    if(record.target.getAttribute("data-cid") === "roster-participant" && (record.attributeName === "data-tid") ) {
        return "role:"+record.target.getAttribute("data-tid");// data-tid is the current role !! participant, atendee, etc
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
        console.log("childlist");
        return [
            Array.from(record.addedNodes).map(participantIcons),
            Array.from(record.removedNodes).map((r) => {if(r.getAttribute("data-cid") === "roster-participant-hand-raised") return "loweredHand"})
        ]
    }
    if(record.attributeName === "data-cid") {
        return participantIcons(target);
    }
}

function sleep(ms) {
    return new Promise((resolve, reject) => {
        setTimeout(()=>resolve(), ms)
    });
}

function waitForSel(selector, iter=0) {
    return new Promise((resolve, reject) => {
        var res = document.querySelector(selector);
        if(res!==null) {
            resolve(res);
        } else {
            if(iter>10) reject();
            setTimeout(() => waitForSel(selector, iter+1).then((e)=>resolve(e), (e)=>reject(e)), 1000)
        }
    })
}

//NEWNEW
if(memberObserver) memberObserver.disconnect();


var socket = new WebSocket(wsUrl)
socket.onopen = async function main () {
    function send(data) { socket.send(JSON.stringify(data))}

    //NEWNEW
    

    //for live updates
    async function initiateObservers() {
        await openMembers()
        
        //TODO parse entire participant structure into initial state, handle additions/removals from the list
        const memberEntries = document.querySelectorAll("[data-cid=roster-participant]")


        function findObserver(target) {
            for (var i = 0; i < memberEntries.length; i++) {
                if (memberEntries[i].contains(target)) {
                    return memberEntries[i].getAttribute("data-tid");
                }
            }
            return null;
        }

        memberObserver = new MutationObserver((records) => {
            var events = records.map((record) => {
                var e = evalRecord(record);
                if(!e) return;
                if(Array.isArray(e)) {
                    return e.flat(19).map((event) => {if(event) return {event: event, participant: findObserver(record.target)}})
                }

                return {event: e, participant: findObserver(record.target)} // todo extract participant id, name from element
            }).flat(10);

            //send off events
            events.forEach((e) => console.log(e));
            events.forEach((e) => {if(e) send(e)});
        });
    }
    function feedObservers() {
        const memberEntries = document.querySelectorAll("[data-cid=roster-participant]");
        memberEntries.forEach((e) => memberObserver.observe(e, {attributes: true, childList: true, attributeFilter: ["data-cid", "data-tid", "class"], subtree: true}));
    }
    //NEWNEW

    await initiateObservers();
    console.log(memberObserver)
    feedObservers()


    function clickLabeledButton(sel, inc) {
        var el = document.querySelector(sel);
        if(el.getAttribute("aria-label").includes(inc))
        eventFire(el, "click");
    }

    function openChat() { clickLabeledButton("#chat-button", "Show");  memberObserver.disconnect(); }
    async function openMembers() { clickLabeledButton("#roster-button", "Show"); await waitForSel("[data-cid=roster-participant]"); }

    function raise() { clickLabeledButton("#raisehands-button", "Raise") }
    function unraise() { clickLabeledButton("#raisehands-button", "Lower") }

    function mute() { clickLabeledButton("#microphone-button", "Mute") }
    function unmute() { clickLabeledButton("#microphone-button", "Unmute") }

    //NEWNEW
    
    //NEWNEW
    

    const f = {openChat, openMembers, raise, unraise, mute, unmute}
    socket.onmessage = async function msg(msge) {
        console.log(msge)
        var msg = JSON.parse(msge.data);
        var cmd = f[(msg.command)||"noop"];
        if (cmd) {
            send({id: msg.id, result: await cmd(...(msg.params ||[]))});
        } else {
            send({id: msg.id, error: "no command found"})
        }
    }
}

}

/** DOESNT WORK
 * async function writeMessage(string) {
        openChat();
        var input = await waitForSel("textarea");
        console.log("inout delivered")
        console.log(input)
        input.focus();

        function setReactInputValue(input, value) {
            const previousValue = input.value;
          
            // eslint-disable-next-line no-param-reassign
            input.value = value;
          
            const tracker = input._valueTracker;
            if (tracker) {
              tracker.setValue(previousValue);
            }
          
            // 'change' instead of 'input', see https://github.com/facebook/react/issues/11488#issuecomment-381590324
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }
          
        setReactInputValue(input, string)
        //input.dispatchEvent(keystroke);
    }
 */